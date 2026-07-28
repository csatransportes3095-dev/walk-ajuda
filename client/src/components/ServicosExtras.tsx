import { useState, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Car, Scale, FileSearch, Search, Link2, ExternalLink,
  X, ChevronDown, ChevronUp, Send, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ConsultaForm = {
  id: number;
  title: string;
  icon: string;
  type: "consultation" | "link";
  redirectUrl: string;
  fields: string;
  isActive: number;
  isBuiltin: number;
  sortOrder: number;
};

// ─── Ícone dinâmico ───────────────────────────────────────────────────────────
function DynIcon({ name, className }: { name: string; className?: string }) {
  const map: Record<string, React.ReactNode> = {
    Car: <Car className={className} />,
    Scale: <Scale className={className} />,
    FileSearch: <FileSearch className={className} />,
    Search: <Search className={className} />,
    Link2: <Link2 className={className} />,
    ExternalLink: <ExternalLink className={className} />,
  };
  return <>{map[name] || <FileSearch className={className} />}</>;
}

// ─── Formulário de Consulta de Veículo ───────────────────────────────────────
function FormVeiculo({ form, customerPhone, customerName, customerEmail, customerPhoto, onClose }: {
  form: ConsultaForm;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhoto: string;
  onClose: () => void;
}) {
  const [placa, setPlaca] = useState("");
  const [renavam, setRenavam] = useState("");
  const [tipoPlaca, setTipoPlaca] = useState<"mercosul" | "cinza">("mercosul");
  const [done, setDone] = useState(false);

  const submitMutation = trpc.consultas.submit.useMutation({
    onSuccess: () => { setDone(true); toast.success("Consulta enviada! Aguarde a resposta."); },
    onError: (e) => toast.error(e.message || "Erro ao enviar consulta"),
  });

  const handleSubmit = () => {
    if (!placa.trim()) { toast.error("Informe a placa."); return; }
    if (!renavam.trim()) { toast.error("Informe o RENAVAM."); return; }
    submitMutation.mutate({
      formId: form.id,
      customerPhone,
      customerName,
      customerEmail,
      customerPhoto,
      data: JSON.stringify({ Placa: placa.toUpperCase(), RENAVAM: renavam, "Tipo de Placa": tipoPlaca === "mercosul" ? "Placa Mercosul" : "Placa Cinza" }),
    });
  };

  if (done) return (
    <div className="text-center py-6 space-y-2">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <Check className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-white font-bold">Consulta enviada!</p>
      <p className="text-white/50 text-sm">Aguarde a resposta por WhatsApp ou e-mail.</p>
      <Button size="sm" variant="outline" className="border-white/20 text-white/60 mt-2" onClick={onClose}>Fechar</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Placa do Veículo</label>
          <Input
            value={placa}
            onChange={e => setPlaca(e.target.value.toUpperCase())}
            placeholder="Ex: ABC1D23"
            maxLength={8}
            className="bg-black/40 border-white/20 text-white uppercase"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">RENAVAM</label>
          <Input
            value={renavam}
            onChange={e => setRenavam(e.target.value.replace(/\D/g, ""))}
            placeholder="Somente números"
            className="bg-black/40 border-white/20 text-white"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Tipo de Placa</label>
          <div className="flex gap-2">
            <button
              onClick={() => setTipoPlaca("mercosul")}
              className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${tipoPlaca === "mercosul" ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/60"}`}
            >
              🇧🇷 Placa Mercosul
            </button>
            <button
              onClick={() => setTipoPlaca("cinza")}
              className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${tipoPlaca === "cinza" ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/60"}`}
            >
              🔲 Placa Cinza
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
          disabled={submitMutation.isPending}
          onClick={handleSubmit}
        >
          <Send className="w-4 h-4" />
          {submitMutation.isPending ? "Enviando..." : "Enviar Consulta"}
        </Button>
        <Button variant="outline" className="border-white/20 text-white/60" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Formulário de Mandado de Prisão ─────────────────────────────────────────
function FormMandado({ form, customerPhone, customerName, customerEmail, customerPhoto, onClose }: {
  form: ConsultaForm;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhoto: string;
  onClose: () => void;
}) {
  const [cpf, setCpf] = useState("");
  const [nomeMae, setNomeMae] = useState("");
  const [nomePai, setNomePai] = useState("");
  const [done, setDone] = useState(false);

  const submitMutation = trpc.consultas.submit.useMutation({
    onSuccess: () => { setDone(true); toast.success("Consulta enviada! Aguarde a resposta."); },
    onError: (e) => toast.error(e.message || "Erro ao enviar consulta"),
  });

  const handleSubmit = () => {
    if (!cpf.trim()) { toast.error("Informe o CPF."); return; }
    submitMutation.mutate({
      formId: form.id,
      customerPhone,
      customerName,
      customerEmail,
      customerPhoto,
      data: JSON.stringify({ CPF: cpf, "Nome da Mãe": nomeMae, "Nome do Pai": nomePai }),
    });
  };

  if (done) return (
    <div className="text-center py-6 space-y-2">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <Check className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-white font-bold">Consulta enviada!</p>
      <p className="text-white/50 text-sm">Aguarde a resposta por WhatsApp ou e-mail.</p>
      <Button size="sm" variant="outline" className="border-white/20 text-white/60 mt-2" onClick={onClose}>Fechar</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">CPF</label>
          <Input
            value={cpf}
            onChange={e => setCpf(e.target.value.replace(/\D/g, ""))}
            placeholder="Somente números"
            maxLength={11}
            className="bg-black/40 border-white/20 text-white"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Nome da Mãe</label>
          <Input
            value={nomeMae}
            onChange={e => setNomeMae(e.target.value)}
            placeholder="Nome completo da mãe"
            className="bg-black/40 border-white/20 text-white"
          />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Nome do Pai</label>
          <Input
            value={nomePai}
            onChange={e => setNomePai(e.target.value)}
            placeholder="Nome completo do pai (opcional)"
            className="bg-black/40 border-white/20 text-white"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
          disabled={submitMutation.isPending}
          onClick={handleSubmit}
        >
          <Send className="w-4 h-4" />
          {submitMutation.isPending ? "Enviando..." : "Enviar Consulta"}
        </Button>
        <Button variant="outline" className="border-white/20 text-white/60" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Formulário de Antecedentes Criminais ────────────────────────────────────
function FormAntecedentes({ form, customerPhone, customerName, customerEmail, customerPhoto, onClose }: {
  form: ConsultaForm;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhoto: string;
  onClose: () => void;
}) {
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState(customerName || "");
  const [dataNasc, setDataNasc] = useState("");
  const [nomeMae, setNomeMae] = useState("");
  const [nomePai, setNomePai] = useState("");
  const [done, setDone] = useState(false);

  const submitMutation = trpc.consultas.submit.useMutation({
    onSuccess: () => { setDone(true); toast.success("Consulta enviada! Aguarde a resposta."); },
    onError: (e) => toast.error(e.message || "Erro ao enviar consulta"),
  });

  const handleSubmit = () => {
    if (!cpf.trim()) { toast.error("Informe o CPF."); return; }
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    if (!dataNasc.trim()) { toast.error("Informe a data de nascimento."); return; }
    submitMutation.mutate({
      formId: form.id,
      customerPhone,
      customerName,
      customerEmail,
      customerPhoto,
      data: JSON.stringify({ CPF: cpf, Nome: nome, "Data de Nascimento": dataNasc, "Nome da Mãe": nomeMae, "Nome do Pai": nomePai }),
    });
  };

  if (done) return (
    <div className="text-center py-6 space-y-2">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <Check className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-white font-bold">Consulta enviada!</p>
      <p className="text-white/50 text-sm">Aguarde a resposta por WhatsApp ou e-mail.</p>
      <Button size="sm" variant="outline" className="border-white/20 text-white/60 mt-2" onClick={onClose}>Fechar</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">CPF</label>
          <Input value={cpf} onChange={e => setCpf(e.target.value.replace(/\D/g, ""))} placeholder="Somente números" maxLength={11} className="bg-black/40 border-white/20 text-white" />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Nome Completo</label>
          <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" className="bg-black/40 border-white/20 text-white" />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Data de Nascimento</label>
          <Input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} className="bg-black/40 border-white/20 text-white" />
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Nome da Mãe</label>
          <Input value={nomeMae} onChange={e => setNomeMae(e.target.value)} placeholder="Nome da mãe" className="bg-black/40 border-white/20 text-white" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Nome do Pai</label>
          <Input value={nomePai} onChange={e => setNomePai(e.target.value)} placeholder="Nome do pai (opcional)" className="bg-black/40 border-white/20 text-white" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
          disabled={submitMutation.isPending}
          onClick={handleSubmit}
        >
          <Send className="w-4 h-4" />
          {submitMutation.isPending ? "Enviando..." : "Enviar Consulta"}
        </Button>
        <Button variant="outline" className="border-white/20 text-white/60" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Formulário dinâmico (usa campos do banco) ───────────────────────────────
type FieldType = "text" | "textarea" | "select" | "radio" | "checkbox" | "date" | "number" | "file";
type FormField = { id: string; key: string; label: string; type: FieldType; required: boolean; placeholder?: string; mask?: string; options?: string[]; isActive: boolean; };
type FormRow = { id: string; cols: 1 | 2 | 3; fields: FormField[]; };

function applyMask(value: string, mask: string): string {
  if (!mask) return value;
  if (mask === "numbers") return value.replace(/\D/g, "");
  if (mask === "placa") return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (mask === "cpf") {
    const d = value.replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3").replace(/(\d{3})(\d{3})/, "$1.$2").replace(/(\d{3})/, "$1");
  }
  if (mask === "phone") {
    const d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3").replace(/(\d{2})(\d{4})/, "($1) $2").replace(/(\d{2})/, "($1");
  }
  if (mask === "cep") return value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d{3})/, "$1-$2");
  return value;
}

function FormDinamico({ form, customerPhone, customerName, customerEmail, customerPhoto, onClose }: {
  form: ConsultaForm;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhoto: string;
  onClose: () => void;
}) {
  const rows: FormRow[] = (() => { try { return JSON.parse(form.fields || "[]"); } catch { return []; } })();
  const activeRows = rows.filter(r => Array.isArray(r.fields) && r.fields.some(f => f.isActive !== false));
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Verificar limite semanal
  const phone = customerPhone.replace(/\D/g, '');
  const usageQuery = trpc.consultas.checkMyUsage.useQuery(
    { customerPhone: phone },
    { enabled: !!phone, staleTime: 30000 }
  );
  const canSubmit = usageQuery.data?.canSubmit !== false;
  const usageInfo = usageQuery.data;

  const uploadMutation = trpc.consultas.uploadDoc.useMutation({
    onSuccess: (data, vars) => setFileUrls(prev => ({ ...prev, [vars.fieldKey]: data.url })),
    onError: (e) => toast.error("Erro ao enviar arquivo: " + e.message),
  });

  const submitMutation = trpc.consultas.submit.useMutation({
    onSuccess: () => { setDone(true); toast.success("Consulta enviada! Aguarde a resposta."); usageQuery.refetch(); },
    onError: (e) => toast.error(e.message || "Erro ao enviar consulta"),
  });

  const handleSubmit = () => {
    if (!canSubmit) {
      toast.error(`Você já atingiu o limite de ${usageInfo?.limit} consulta(s) por semana. Tente novamente na próxima semana.`);
      return;
    }
    // Validar obrigatórios
    // Se a linha tem múltiplos campos obrigatórios, basta pelo menos 1 preenchido (campos alternativos)
    for (const row of activeRows) {
      const activeFields = (row.fields || []).filter(f => f.isActive !== false);
      const requiredFields = activeFields.filter(f => f.required);
      if (requiredFields.length === 0) continue;
      // Se há mais de 1 campo obrigatório na linha, basta um deles preenchido
      if (requiredFields.length > 1) {
        const anyFilled = requiredFields.some(f => {
          const val = f.type === "file" ? fileUrls[f.key] : values[f.key];
          return val && String(val).trim();
        });
        if (!anyFilled) {
          const labels = requiredFields.map(f => f.label).join(" ou ");
          toast.error(`Preencha pelo menos um: ${labels}`);
          return;
        }
      } else {
        // Campo único obrigatório: deve estar preenchido
        const field = requiredFields[0];
        const val = field.type === "file" ? fileUrls[field.key] : values[field.key];
        if (!val || !String(val).trim()) { toast.error(`Preencha: ${field.label}`); return; }
      }
    }
    // Montar data
    const data: Record<string, string> = {};
    for (const row of activeRows) {
      for (const field of (row.fields || []).filter(f => f.isActive !== false)) {
        if (field.type === "file") {
          if (fileUrls[field.key]) data[field.label] = fileUrls[field.key];
        } else {
          if (values[field.key]) data[field.label] = values[field.key];
        }
      }
    }
    submitMutation.mutate({ formId: form.id, customerPhone, customerName, customerEmail, customerPhoto, data: JSON.stringify(data) });
  };

  if (done) return (
    <div className="text-center py-6 space-y-2">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <Check className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-white font-bold">Consulta enviada!</p>
      <p className="text-white/50 text-sm">Aguarde a resposta por WhatsApp ou e-mail.</p>
      <Button size="sm" variant="outline" className="border-white/20 text-white/60 mt-2" onClick={onClose}>Fechar</Button>
    </div>
  );

  if (activeRows.length === 0) return (
    <div className="text-center py-4 text-white/40 text-sm">
      <p>Este formulário ainda não tem campos configurados.</p>
      <Button size="sm" variant="outline" className="border-white/20 text-white/60 mt-2" onClick={onClose}>Fechar</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {activeRows.map(row => {
        const activeFields = (row.fields || []).filter(f => f.isActive !== false);
        return (
          <div key={row.id} className={`grid gap-3 ${(row.cols || 1) === 1 ? "grid-cols-1" : (row.cols || 1) === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {activeFields.map(field => (
              <div key={field.id}>
                <label className="text-white/60 text-xs font-bold uppercase mb-1 block">
                  {field.label}{field.required && <span className="text-orange-400 ml-1">*</span>}
                </label>
                {field.type === "textarea" && (
                  <textarea
                    className="w-full bg-black/40 border border-white/20 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-orange-500/60"
                    rows={3}
                    placeholder={field.placeholder || ""}
                    value={values[field.key] || ""}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  />
                )}
                {(field.type === "text" || field.type === "number" || field.type === "date") && (
                  <Input
                    type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                    placeholder={field.placeholder || ""}
                    value={values[field.key] || ""}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: applyMask(e.target.value, field.mask || "") }))}
                    className="bg-black/40 border-white/20 text-white"
                  />
                )}
                {field.type === "select" && (
                  <select
                    className="w-full bg-black/40 border border-white/20 text-white text-sm h-10 rounded-md px-3 focus:outline-none focus:border-orange-500/60"
                    value={values[field.key] || ""}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    <option value="">{field.placeholder || "Selecione..."}</option>
                    {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
                {field.type === "radio" && (
                  <div className="flex flex-wrap gap-2">
                    {(field.options || []).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setValues(prev => ({ ...prev, [field.key]: opt }))}
                        className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${values[field.key] === opt ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/60 hover:bg-white/10"}`}
                      >{opt}</button>
                    ))}
                  </div>
                )}
                {field.type === "checkbox" && (
                  <div className="flex flex-wrap gap-2">
                    {(field.options || []).map(opt => {
                      const selected = (values[field.key] || "").split(",").filter(Boolean);
                      const isChecked = selected.includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            const next = isChecked ? selected.filter(s => s !== opt) : [...selected, opt];
                            setValues(prev => ({ ...prev, [field.key]: next.join(",") }));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${isChecked ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/60 hover:bg-white/10"}`}
                        >{opt}</button>
                      );
                    })}
                  </div>
                )}
                {field.type === "file" && (
                  <div>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      ref={el => { fileRefs.current[field.key] = el; }}
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => {
                          const base64 = (ev.target?.result as string).split(",")[1];
                          uploadMutation.mutate({ fieldKey: field.key, base64, mimeType: file.type, fileName: file.name });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <button
                      onClick={() => fileRefs.current[field.key]?.click()}
                      className={`w-full py-2 rounded-xl border text-sm font-bold transition-all ${fileUrls[field.key] ? "bg-green-600/20 border-green-500/40 text-green-300" : "bg-white/5 border-dashed border-white/20 text-white/50 hover:bg-white/10"}`}
                    >
                      {fileUrls[field.key] ? "✅ Arquivo enviado" : `📎 ${field.placeholder || "Enviar arquivo"}`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {!canSubmit && usageInfo && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
          <p className="text-red-400 text-xs font-bold">⚠️ Limite semanal atingido</p>
          <p className="text-red-300/70 text-xs mt-1">Você usou {usageInfo.used} de {usageInfo.limit} consulta(s) esta semana. Tente novamente na próxima semana.</p>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
          disabled={submitMutation.isPending || uploadMutation.isPending || !canSubmit}
          onClick={handleSubmit}
        >
          <Send className="w-4 h-4" />
          {submitMutation.isPending ? "Enviando..." : "Enviar Consulta"}
        </Button>
        <Button variant="outline" className="border-white/20 text-white/60" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Formulário genérico de consulta ─────────────────────────────────────────
function FormGenerico({ form, customerPhone, customerName, customerEmail, customerPhoto, onClose }: {
  form: ConsultaForm;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhoto: string;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [done, setDone] = useState(false);

  const submitMutation = trpc.consultas.submit.useMutation({
    onSuccess: () => { setDone(true); toast.success("Consulta enviada! Aguarde a resposta."); },
    onError: (e) => toast.error(e.message || "Erro ao enviar consulta"),
  });

  if (done) return (
    <div className="text-center py-6 space-y-2">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <Check className="w-6 h-6 text-green-400" />
      </div>
      <p className="text-white font-bold">Consulta enviada!</p>
      <p className="text-white/50 text-sm">Aguarde a resposta por WhatsApp ou e-mail.</p>
      <Button size="sm" variant="outline" className="border-white/20 text-white/60 mt-2" onClick={onClose}>Fechar</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="text-white/60 text-xs font-bold uppercase mb-1 block">Descreva sua consulta</label>
        <textarea
          className="w-full bg-black/40 border border-white/20 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-orange-500/60"
          rows={4}
          placeholder="Descreva os dados necessários para a consulta..."
          value={texto}
          onChange={e => setTexto(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
          disabled={submitMutation.isPending || !texto.trim()}
          onClick={() => submitMutation.mutate({
            formId: form.id,
            customerPhone,
            customerName,
            customerEmail,
            customerPhoto,
            data: JSON.stringify({ Consulta: texto }),
          })}
        >
          <Send className="w-4 h-4" />
          {submitMutation.isPending ? "Enviando..." : "Enviar Consulta"}
        </Button>
        <Button variant="outline" className="border-white/20 text-white/60" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Componente principal exportado ──────────────────────────────────────────
interface ServicosExtrasProps {
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  customerPhoto?: string;
  prominent?: boolean;
}

export function ServicosExtras({ customerPhone, customerName = "", customerEmail = "", customerPhoto = "", prominent = false }: ServicosExtrasProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeFormId, setActiveFormId] = useState<number | null>(null);

  const formsQuery = trpc.consultas.listForms.useQuery(undefined, { staleTime: 60000 });
  const forms: ConsultaForm[] = (formsQuery.data as ConsultaForm[]) ?? [];
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { staleTime: 60000 });
  const extrasTitle = (settings as Record<string,string> | undefined)?.extras_title || '🔍 Serviços Extras';
  const extrasDesc = (settings as Record<string,string> | undefined)?.extras_desc || 'Consultas e serviços adicionais';
  const extrasColor = (settings as Record<string,string> | undefined)?.extras_color || '#ea580c';
  const extrasTextColor = (settings as Record<string,string> | undefined)?.extras_text_color || '#ffffff';

  if (forms.length === 0 && !formsQuery.isLoading) return null;

  const activeForm = forms.find(f => f.id === activeFormId);

  const renderForm = () => {
    if (!activeForm) return null;
    const props = { form: activeForm, customerPhone, customerName, customerEmail, customerPhoto, onClose: () => setActiveFormId(null) };
    // Formulários fixos por título
    // Se o formulário tem campos configurados no banco, usa o FormDinamico
    try {
      const rows = JSON.parse(activeForm.fields || "[]");
      if (Array.isArray(rows) && rows.length > 0) return <FormDinamico {...props} />;
    } catch {}
    // Fallback para formulários hardcoded (sem campos configurados)
    const title = activeForm.title.toLowerCase();
    if (title.includes("veículo") || title.includes("veiculo") || title.includes("placa")) return <FormVeiculo {...props} />;
    if (title.includes("mandado") || title.includes("prisão") || title.includes("prisao")) return <FormMandado {...props} />;
    if (title.includes("antecedente")) return <FormAntecedentes {...props} />;
    return <FormGenerico {...props} />;
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden shadow-lg`}
      style={{
        borderColor: extrasColor + (prominent ? '99' : '4d'),
        background: `linear-gradient(135deg, ${extrasColor}1a 0%, ${extrasColor}0d 50%, ${extrasColor}1a 100%)`,
        boxShadow: prominent ? `0 8px 32px ${extrasColor}26` : `0 4px 16px ${extrasColor}1a`,
      }}
    >
      {/* Header — sempre visível, clicável para expandir */}
      <button
        className={`w-full flex items-center gap-3 text-left hover:bg-orange-500/10 transition-all ${
          prominent ? 'px-5 py-4' : 'px-4 py-3.5'
        }`}
        onClick={() => { setExpanded(!expanded); setActiveFormId(null); }}
      >
        <div className={`rounded-xl flex items-center justify-center flex-shrink-0 ${
          prominent ? 'w-12 h-12' : 'w-9 h-9'
        }`} style={{ backgroundColor: extrasColor + '33' }}>
          <FileSearch className={prominent ? 'w-6 h-6' : 'w-5 h-5'} style={{ color: extrasColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-black leading-tight ${prominent ? 'text-base' : 'text-sm'}`} style={{ color: extrasTextColor }}>{extrasTitle}</p>
          <p className={`${prominent ? 'text-sm' : 'text-xs'}`} style={{ color: extrasTextColor + 'b3' }}>{extrasDesc}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!expanded && (
            <span className="text-xs bg-orange-600/30 text-orange-300 px-2 py-0.5 rounded-full font-bold border border-orange-500/30">
              {forms.length} {forms.length === 1 ? "serviço" : "serviços"}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-orange-400" /> : <ChevronDown className="w-4 h-4 text-orange-400" />}
        </div>
      </button>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="border-t border-orange-500/20 px-4 pb-4 pt-3 space-y-3">
          {formsQuery.isLoading && (
            <p className="text-white/40 text-sm text-center py-2">Carregando serviços...</p>
          )}

          {/* Formulário ativo */}
          {activeForm && (
            <div className="bg-black/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-600/20 flex items-center justify-center flex-shrink-0">
                  <DynIcon name={activeForm.icon} className="w-4 h-4 text-orange-400" />
                </div>
                <p className="font-bold text-white text-sm">{activeForm.title}</p>
              </div>
              {renderForm()}
            </div>
          )}

          {/* Grade de botões */}
          {!activeForm && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {forms.map((form, idx) => {
                // Paleta de cores vivas rotativa para cada card
                const palettes = [
                  { bg: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', border: 'rgba(239,68,68,0.7)', icon: '#fca5a5', shadow: 'rgba(220,38,38,0.4)' },
                  { bg: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'rgba(59,130,246,0.7)', icon: '#93c5fd', shadow: 'rgba(37,99,235,0.4)' },
                  { bg: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', border: 'rgba(139,92,246,0.7)', icon: '#c4b5fd', shadow: 'rgba(124,58,237,0.4)' },
                  { bg: 'linear-gradient(135deg, #059669 0%, #047857 100%)', border: 'rgba(16,185,129,0.7)', icon: '#6ee7b7', shadow: 'rgba(5,150,105,0.4)' },
                  { bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', border: 'rgba(245,158,11,0.7)', icon: '#fde68a', shadow: 'rgba(217,119,6,0.4)' },
                  { bg: 'linear-gradient(135deg, #db2777 0%, #9d174d 100%)', border: 'rgba(236,72,153,0.7)', icon: '#fbcfe8', shadow: 'rgba(219,39,119,0.4)' },
                ];
                const p = palettes[idx % palettes.length];
                return (
                  <button
                    key={form.id}
                    onClick={() => {
                      if (form.type === "link" && form.redirectUrl) {
                        window.open(form.redirectUrl, "_blank");
                      } else {
                        setActiveFormId(form.id);
                      }
                    }}
                    className="flex flex-col items-center gap-3 p-4 rounded-2xl active:scale-95 transition-all text-center"
                    style={{
                      background: p.bg,
                      border: `2px solid ${p.border}`,
                      boxShadow: `0 4px 20px ${p.shadow}`,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(0,0,0,0.25)' }}
                    >
                      {form.type === "link"
                        ? <ExternalLink className="w-6 h-6" style={{ color: p.icon }} />
                        : <DynIcon name={form.icon} className="w-6 h-6 text-white" />
                      }
                    </div>
                    <span className="text-white text-xs font-black leading-tight uppercase tracking-wide">{form.title}</span>
                    {form.type === "link" && (
                      <span className="text-white/60 text-[10px] font-semibold">↗ Link externo</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
