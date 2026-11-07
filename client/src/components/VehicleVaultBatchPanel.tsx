import { useRef, useState } from "react";
import { CheckCircle2, FilePlus2, FolderOpen, Loader2, Trash2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  MAX_PDFS_PER_BATCH, checkBatchPdf, duplicatedBatchPlates, fieldsFromPdf,
  normalizedBatchPlate, validateBatchFields, VAULT_FIELDS,
  type VaultFields, type VaultFieldKey,
} from "./vehicleVaultBatchUtils";

type BatchStatus = "queued" | "reading" | "ready" | "invalid" | "error" | "saving" | "saved";
type BatchItem = {
  id: string;
  file: File;
  status: BatchStatus;
  fields: VaultFields;
  sourceText: string;
  message: string;
};
const EMPTY_FIELDS: VaultFields = {
  plate: "", renavam: "", chassis: "", model: "", color: "",
  manufactureYear: "", modelYear: "",
};

function readPdfAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler PDF."));
    reader.onload = () => {
      const value = String(reader.result || "").split(",")[1] || "";
      if (!value) reject(new Error("PDF vazio ou ilegível."));
      else resolve(value);
    };
    reader.readAsDataURL(file);
  });
}

type Props = { onSaved: () => Promise<unknown> | void };

export default function VehicleVaultBatchPanel({ onSaved }: Props) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const itemsRef = useRef<BatchItem[]>([]);
  const busyRef = useRef(false);
  const previewPdf = trpc.vehicleVault.previewPdf.useMutation();
  const save = trpc.vehicleVault.save.useMutation();

  const update = (fn: (current: BatchItem[]) => BatchItem[]) => {
    const next = fn(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  };

  const edit = (id: string, key: VaultFieldKey, value: string) => {
    if (busyRef.current) return;
    update(current => current.map(item => item.id === id
      ? { ...item, fields: { ...item.fields, [key]: value }, status: "ready", message: "" }
      : item));
  };

  const handleFiles = async (files: File[]) => {
    if (busyRef.current || files.length === 0) return;
    const available = MAX_PDFS_PER_BATCH - itemsRef.current.length;
    if (available <= 0) return toast.error("Limite de 20 PDFs por lote. Remova os concluídos para continuar.");
    if (files.length > available) toast.warning("Foram selecionados mais de 20 PDFs. Apenas os primeiros disponíveis serão adicionados.");
    const accepted = files.slice(0, available);
    const added: BatchItem[] = accepted.map(file => ({
      id: crypto.randomUUID(), file, status: "queued", fields: { ...EMPTY_FIELDS },
      sourceText: "", message: "",
    }));
    update(current => [...current, ...added]);
    busyRef.current = true;
    setBusy("extract");
    setProgress({ current: 0, total: added.length });
    try {
      for (let i = 0; i < added.length; i++) {
        const selected = added[i];
        setProgress({ current: i + 1, total: added.length });
        const problem = checkBatchPdf(selected.file);
        if (problem) {
          update(current => current.map(item => item.id === selected.id
            ? { ...item, status: "invalid", message: problem } : item));
          continue;
        }
        update(current => current.map(item => item.id === selected.id
          ? { ...item, status: "reading" } : item));
        try {
          const base64 = await readPdfAsBase64(selected.file);
          const result = await previewPdf.mutateAsync({ base64 });
          const fields = fieldsFromPdf(result);
          const problems = validateBatchFields(fields);
          update(current => current.map(item => item.id === selected.id ? {
            ...item,
            status: problems.length ? "invalid" : "ready",
            fields, sourceText: result.text || "",
            message: problems.join(" "),
          } : item));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível extrair o PDF.";
          update(current => current.map(item => item.id === selected.id
            ? { ...item, status: "error", message } : item));
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
      toast.info("Extração concluída. Confira os dados antes de guardar.");
    }
  };

  const saveAll = async () => {
    if (busyRef.current) return;
    const candidates = itemsRef.current.filter(item => item.status === "ready" || item.status === "invalid" || item.status === "error");
    if (!candidates.length) return toast.warning("Nenhum PDF pendente de revisão.");
    const duplicatePlates = duplicatedBatchPlates(itemsRef.current.map(item => ({
      status: item.status, fields: item.fields,
    })));
    // Duplicate check also includes items previously saved in the same batch.
    const seen = new Set(itemsRef.current.filter(item => item.status === "saved")
      .map(item => normalizedBatchPlate(item.fields.plate)));
    const toSave: BatchItem[] = [];
    for (const item of candidates) {
      const issues = validateBatchFields(item.fields);
      const plate = normalizedBatchPlate(item.fields.plate);
      if (duplicatePlates.has(plate) || seen.has(plate)) issues.push("Placa repetida no lote.");
      if (issues.length) {
        update(current => current.map(currentItem => currentItem.id === item.id
          ? { ...currentItem, status: "invalid", message: issues.join(" ") }
          : currentItem));
        continue;
      }
      seen.add(plate);
      toSave.push(item);
    }
    if (!toSave.length) return toast.error("Revise os campos e as placas repetidas antes de guardar.");
    busyRef.current = true;
    setBusy("save");
    setProgress({ current: 0, total: toSave.length });
    let succeeded = 0;
    try {
      for (let i = 0; i < toSave.length; i++) {
        const item = toSave[i];
        setProgress({ current: i + 1, total: toSave.length });
        update(current => current.map(value => value.id === item.id
          ? { ...value, status: "saving", message: "" } : value));
        try {
          const base64 = await readPdfAsBase64(item.file);
          await save.mutateAsync({
            plate: item.fields.plate,
            renavam: item.fields.renavam,
            chassis: item.fields.chassis,
            model: item.fields.model,
            color: item.fields.color,
            manufactureYear: Number(item.fields.manufactureYear),
            modelYear: Number(item.fields.modelYear),
            sourceText: item.sourceText,
            pdfBase64: base64,
            pdfFilename: item.file.name,
          });
          succeeded++;
          update(current => current.map(value => value.id === item.id
            ? { ...value, status: "saved", message: "Guardado com PDF original." } : value));
        } catch (error) {
          update(current => current.map(value => value.id === item.id ? {
            ...value, status: "error",
            message: error instanceof Error ? error.message : "Falha ao guardar este documento.",
          } : value));
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
      if (succeeded) await onSaved();
      toast[succeeded === toSave.length ? "success" : "warning"](
        succeeded + " de " + toSave.length + " PDF(s) guardado(s). Os demais ficam disponíveis para correção."
      );
    }
  };

  const savedCount = items.filter(item => item.status === "saved").length;
  const pendingCount = items.filter(item => item.status !== "saved").length;
  const validCount = items.filter(item => item.status !== "saved" && !validateBatchFields(item.fields).length
    && !duplicatedBatchPlates(items).has(normalizedBatchPlate(item.fields.plate))).length;

  return <section className="space-y-4 rounded-2xl border border-cyan-400/30 bg-cyan-950/15 p-4" aria-label="Extrator PDF em lote">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-base font-black text-cyan-200">EXTRATOR DE PDFs EM LOTE</h3>
        <p className="mt-1 text-xs text-slate-300">Selecione até 20 PDFs de uma vez (10 MB cada). Extração individual e conferência antes de guardar.</p>
      </div>
      <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs font-bold text-cyan-200">
        {items.length}/{MAX_PDFS_PER_BATCH} PDFs
      </span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className={"inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100 " +
        (busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-cyan-400/20")}>
        <FolderOpen className="h-4 w-4" /> SELECIONAR VÁRIOS PDFs
        <input type="file" accept=".pdf,application/pdf" multiple className="hidden" disabled={!!busy}
          onChange={event => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            void handleFiles(files);
          }} />
      </label>
      <span className="text-xs text-slate-300">{savedCount} guardado(s) · {pendingCount} pendente(s)</span>
    </div>
    {!!busy && <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
      <Loader2 className="h-4 w-4 animate-spin" />
      {busy === "extract" ? "Extraindo PDF" : "Guardando PDF"} {progress.current} de {progress.total}. Processamento individual.
    </div>}
    {items.length === 0 && <p className="rounded-lg border border-dashed border-white/20 p-4 text-center text-xs text-slate-400">
      Nenhum PDF selecionado. Os documentos serão listados aqui após a extração.
    </p>}
    {items.length > 0 && <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-1">
      {items.map((item, index) => {
        const issues = validateBatchFields(item.fields);
        const repeated = duplicatedBatchPlates(items).has(normalizedBatchPlate(item.fields.plate));
        const saved = item.status === "saved";
        const blocked = !saved && (issues.length > 0 || repeated || item.status === "queued" || item.status === "reading");
        return <article key={item.id} className={"rounded-xl border p-3 " +
          (saved ? "border-emerald-500/30 bg-emerald-500/5" : blocked ? "border-amber-400/25 bg-black/20" : "border-cyan-400/25 bg-black/20")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-all text-sm font-bold text-white">{index + 1}. {item.file.name}</p>
              <p className={"mt-1 flex items-center gap-1 text-xs " + (saved ? "text-emerald-300" : blocked || item.status === "error" ? "text-amber-200" : "text-cyan-300")}>
                {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : item.status === "error" ? <XCircle className="h-3.5 w-3.5" /> : blocked ? <AlertTriangle className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                {saved ? "GUARDADO" : item.status === "reading" ? "Extraindo..." : item.status === "queued" ? "Na fila" :
                  item.status === "saving" ? "Guardando..." : item.status === "error" ? "ERRO" : blocked ? "REVISAR" : "PRONTO PARA GUARDAR"}
              </p>
              {item.message && <p className="mt-1 text-xs text-amber-200">{item.message}</p>}
              {repeated && !saved && <p className="mt-1 text-xs text-amber-200">Placa duplicada neste lote.</p>}
            </div>
            {!busy && <button type="button" disabled={false} title="Remover da lista, sem excluir do Cofre" onClick={() =>
              update(current => current.filter(value => value.id !== item.id))}
              className="rounded-lg border border-white/15 p-2 text-slate-300 hover:bg-red-500/10 hover:text-red-300">
              <Trash2 className="h-4 w-4" />
            </button>}
          </div>
          {!saved && item.status !== "reading" && item.status !== "queued" && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {VAULT_FIELDS.map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-300">
              {label}
              <input className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-cyan-400"
                value={item.fields[key]} disabled={!!busy}
                onChange={event => edit(item.id, key, event.target.value)} placeholder={label} />
            </label>)}
          </div>}
          {!saved && issues.length > 0 && item.status !== "reading" && item.status !== "queued" &&
            <p className="mt-2 text-xs text-amber-200">{issues.join(" ")}</p>}
        </article>;
      })}
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void saveAll()} disabled={!!busy || validCount === 0}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
        <CheckCircle2 className="h-4 w-4" /> CONFERIR E GUARDAR LOTE ({validCount})
      </button>
      {items.length > 0 && <button type="button" disabled={!!busy} onClick={() => {
        if (!window.confirm("Limpar a lista? Os PDFs já guardados no Cofre permanecerão salvos.")) return;
        update(() => []);
      }} className="rounded-xl border border-white/20 px-4 py-3 text-xs font-bold text-slate-200 disabled:opacity-40">
        LIMPAR LISTA
      </button>}
    </div>
    <p className="text-[11px] text-slate-400">Nenhum PDF é guardado durante a extração. Itens incompletos, duplicados ou com erro ficam para revisão; o Cofre atual, os clientes vinculados e o controle de chassi usado não são modificados.</p>
  </section>;
}
