import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Monitor, Save, Smartphone, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const KEYS = {
  enabled: "home_top_enabled",
  image: "home_top_desktop_image_url",
  desktopHeight: "home_top_desktop_height",
  mobileHeight: "home_top_mobile_height",
  link: "home_top_link_url",
  newTab: "home_top_open_new_tab",
} as const;

type FormState = Record<(typeof KEYS)[keyof typeof KEYS], string>;

const DEFAULTS: FormState = {
  [KEYS.enabled]: "0",
  [KEYS.image]: "",
  [KEYS.desktopHeight]: "420",
  [KEYS.mobileHeight]: "250",
  [KEYS.link]: "",
  [KEYS.newTab]: "0",
};

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AdminHomeTopSettingsEnhancer() {
  const [pathname, setPathname] = useState(() => typeof window !== "undefined" ? window.location.pathname : "");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showControl = pathname === "/admin/settings";
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: showControl });
  const utils = trpc.useUtils();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.getAll.invalidate();
      toast.success("Topo global salvo. A mesma imagem será usada em todo o site.");
    },
    onError: (error) => toast.error(error.message || "Erro ao salvar o topo global."),
  });
  const uploadMutation = trpc.uploads.uploadHomeButtonLogo.useMutation();

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 800);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    setForm({
      [KEYS.enabled]: settings[KEYS.enabled] || DEFAULTS[KEYS.enabled],
      [KEYS.image]: settings[KEYS.image] || DEFAULTS[KEYS.image],
      [KEYS.desktopHeight]: settings[KEYS.desktopHeight] || DEFAULTS[KEYS.desktopHeight],
      [KEYS.mobileHeight]: settings[KEYS.mobileHeight] || DEFAULTS[KEYS.mobileHeight],
      [KEYS.link]: settings[KEYS.link] || DEFAULTS[KEYS.link],
      [KEYS.newTab]: settings[KEYS.newTab] || DEFAULTS[KEYS.newTab],
    });
  }, [settings]);

  const desktopHeight = useMemo(() => Math.max(180, Math.min(900, Number(form[KEYS.desktopHeight]) || 420)), [form]);
  const mobileHeight = useMemo(() => Math.max(140, Math.min(700, Number(form[KEYS.mobileHeight]) || 250)), [form]);

  if (!showControl) return null;

  const update = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await uploadMutation.mutateAsync({
        imageBase64,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        target: "extra",
      });
      if (!result.url) throw new Error("Upload sem URL");
      update(KEYS.image, result.url);
      update(KEYS.enabled, "1");
      toast.success("Imagem enviada. Clique em Salvar e Publicar.");
    } catch {
      toast.error("Não foi possível enviar a imagem do topo.");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    updateMutation.mutate({
      settings: {
        ...form,
        [KEYS.desktopHeight]: String(desktopHeight),
        [KEYS.mobileHeight]: String(mobileHeight),
        // Compatibilidade: não existe mais imagem mobile separada.
        home_top_mobile_image_url: "",
        // Com topo global ativo, os logos antigos das telas deixam de ser exibidos.
        login_show_image: "0",
        gastos_logo_url: "",
      },
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-[80] flex items-center gap-2 rounded-full border border-cyan-400/50 bg-[#071426] px-4 py-3 text-xs font-black text-cyan-200 shadow-2xl shadow-cyan-900/40 hover:bg-[#0b2038]"
      >
        <ImageIcon className="h-4 w-4" /> TOPO / LOGO GLOBAL
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="mx-auto my-4 w-full max-w-3xl overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#070b16] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-white">Topo / Logo Global</h2>
                <p className="mt-1 text-xs text-white/55">Uma única imagem para todo o site, antes e depois do login.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-5 p-5">
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div>
                  <strong className="block text-sm text-white">Ativar topo global</strong>
                  <span className="text-xs text-white/50">Substitui o topo antigo e passa a ser a identidade visual de todas as páginas.</span>
                </div>
                <input type="checkbox" checked={form[KEYS.enabled] === "1"} onChange={(e) => update(KEYS.enabled, e.target.checked ? "1" : "0")} className="h-5 w-5" />
              </label>

              <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.05] p-4">
                <div className="mb-3 flex items-center gap-2 text-cyan-200"><ImageIcon className="h-5 w-5" /><strong>IMAGEM ÚNICA DO SITE</strong></div>
                <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/40" style={{ height: 210 }}>
                  {form[KEYS.image]
                    ? <img src={form[KEYS.image]} alt="Preview do topo global" className="h-full w-full object-cover" />
                    : <div className="grid h-full place-items-center text-xs text-white/35">Nenhuma imagem enviada</div>}
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadImage(e.target.files?.[0])} />
                <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-3 py-3 text-sm font-black text-[#03111d] disabled:opacity-50"><Upload className="h-4 w-4" />{uploading ? "ENVIANDO..." : "ENVIAR / TROCAR IMAGEM"}</button>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><Monitor className="h-4 w-4" /> Altura no desktop</span>
                  <input type="number" min={180} max={900} value={form[KEYS.desktopHeight]} onChange={(e) => update(KEYS.desktopHeight, e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#10172a] px-3 py-2 text-white" />
                  <small className="mt-2 block text-white/40">A largura é sempre 100% da tela/site.</small>
                </label>

                <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><Smartphone className="h-4 w-4" /> Altura no celular</span>
                  <input type="number" min={140} max={700} value={form[KEYS.mobileHeight]} onChange={(e) => update(KEYS.mobileHeight, e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#10172a] px-3 py-2 text-white" />
                  <small className="mt-2 block text-white/40">Usa a mesma imagem do desktop.</small>
                </label>
              </div>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <label className="block text-xs text-white/60">Link ao clicar na imagem (opcional)</label>
                <input value={form[KEYS.link]} onChange={(e) => update(KEYS.link, e.target.value)} placeholder="/login ou https://..." className="mt-1 w-full rounded-xl border border-white/10 bg-[#10172a] px-3 py-2 text-white" />
                <label className="mt-3 flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={form[KEYS.newTab] === "1"} onChange={(e) => update(KEYS.newTab, e.target.checked ? "1" : "0")} /> Abrir link em nova aba</label>
              </section>

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => { update(KEYS.image, ""); update(KEYS.enabled, "0"); }} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/5">REMOVER TOPO</button>
                <button type="button" onClick={save} disabled={updateMutation.isPending || uploading} className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-[#03111d] disabled:opacity-50"><Save className="h-4 w-4" />{updateMutation.isPending ? "SALVANDO..." : "SALVAR E PUBLICAR"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
