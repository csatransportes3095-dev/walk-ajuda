import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Monitor, Save, Smartphone, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const KEYS = {
  enabled: "home_top_enabled",
  desktopImage: "home_top_desktop_image_url",
  mobileImage: "home_top_mobile_image_url",
  desktopHeight: "home_top_desktop_height",
  mobileHeight: "home_top_mobile_height",
  link: "home_top_link_url",
  newTab: "home_top_open_new_tab",
} as const;

type FormState = Record<(typeof KEYS)[keyof typeof KEYS], string>;

const DEFAULTS: FormState = {
  [KEYS.enabled]: "0",
  [KEYS.desktopImage]: "",
  [KEYS.mobileImage]: "",
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
  const [uploading, setUploading] = useState<"desktop" | "mobile" | null>(null);
  const desktopRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);

  const enabled = pathname === "/admin/settings";
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled });
  const utils = trpc.useUtils();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.getAll.invalidate();
      toast.success("Topo da página inicial salvo e publicado.");
    },
    onError: (error) => toast.error(error.message || "Erro ao salvar topo da página inicial."),
  });
  const uploadMutation = trpc.uploads.uploadLoginImage.useMutation();

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
      [KEYS.desktopImage]: settings[KEYS.desktopImage] || DEFAULTS[KEYS.desktopImage],
      [KEYS.mobileImage]: settings[KEYS.mobileImage] || DEFAULTS[KEYS.mobileImage],
      [KEYS.desktopHeight]: settings[KEYS.desktopHeight] || DEFAULTS[KEYS.desktopHeight],
      [KEYS.mobileHeight]: settings[KEYS.mobileHeight] || DEFAULTS[KEYS.mobileHeight],
      [KEYS.link]: settings[KEYS.link] || DEFAULTS[KEYS.link],
      [KEYS.newTab]: settings[KEYS.newTab] || DEFAULTS[KEYS.newTab],
    });
  }, [settings]);

  const desktopHeight = useMemo(() => Math.max(180, Math.min(900, Number(form[KEYS.desktopHeight]) || 420)), [form]);
  const mobileHeight = useMemo(() => Math.max(140, Math.min(700, Number(form[KEYS.mobileHeight]) || 250)), [form]);

  if (!enabled) return null;

  const update = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const uploadImage = async (target: "desktop" | "mobile", file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 5 MB.");
      return;
    }

    setUploading(target);
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await uploadMutation.mutateAsync({ imageBase64, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" });
      if (!result.url) throw new Error("Upload sem URL");
      update(target === "desktop" ? KEYS.desktopImage : KEYS.mobileImage, result.url);
      toast.success(target === "desktop" ? "Imagem desktop enviada." : "Imagem mobile enviada.");
    } catch {
      toast.error("Não foi possível enviar a imagem.");
    } finally {
      setUploading(null);
    }
  };

  const save = () => {
    updateMutation.mutate({
      settings: {
        ...form,
        [KEYS.desktopHeight]: String(desktopHeight),
        [KEYS.mobileHeight]: String(mobileHeight),
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
        <ImageIcon className="h-4 w-4" /> TOPO HOME
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="mx-auto my-4 w-full max-w-4xl overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#070b16] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-white">Topo da Página Inicial</h2>
                <p className="mt-1 text-xs text-white/55">Desktop ocupa toda a largura do site. Mobile usa imagem e altura próprias.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-6 p-5">
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div>
                  <strong className="block text-sm text-white">Ativar topo personalizado</strong>
                  <span className="text-xs text-white/50">Quando desligado, permanece o topo visual padrão atual.</span>
                </div>
                <input type="checkbox" checked={form[KEYS.enabled] === "1"} onChange={(e) => update(KEYS.enabled, e.target.checked ? "1" : "0")} className="h-5 w-5" />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.05] p-4">
                  <div className="mb-3 flex items-center gap-2 text-blue-200"><Monitor className="h-5 w-5" /><strong>DESKTOP</strong></div>
                  <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/40" style={{ height: 180 }}>
                    {form[KEYS.desktopImage] ? <img src={form[KEYS.desktopImage]} alt="Preview desktop" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-white/35">Nenhuma imagem desktop</div>}
                  </div>
                  <input ref={desktopRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadImage("desktop", e.target.files?.[0])} />
                  <button type="button" disabled={uploading !== null} onClick={() => desktopRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{uploading === "desktop" ? "ENVIANDO..." : "ENVIAR IMAGEM DESKTOP"}</button>
                  <label className="mt-4 block text-xs text-white/60">Altura no desktop (px)</label>
                  <input type="number" min={180} max={900} value={form[KEYS.desktopHeight]} onChange={(e) => update(KEYS.desktopHeight, e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#10172a] px-3 py-2 text-white" />
                  <p className="mt-2 text-[11px] text-white/40">A largura é automática: 100% da área do site/tela.</p>
                </section>

                <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
                  <div className="mb-3 flex items-center gap-2 text-emerald-200"><Smartphone className="h-5 w-5" /><strong>CELULAR</strong></div>
                  <div className="mx-auto mb-3 w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-black/40" style={{ height: 220 }}>
                    {(form[KEYS.mobileImage] || form[KEYS.desktopImage]) ? <img src={form[KEYS.mobileImage] || form[KEYS.desktopImage]} alt="Preview mobile" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-white/35">Nenhuma imagem mobile</div>}
                  </div>
                  <input ref={mobileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadImage("mobile", e.target.files?.[0])} />
                  <button type="button" disabled={uploading !== null} onClick={() => mobileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{uploading === "mobile" ? "ENVIANDO..." : "ENVIAR IMAGEM CELULAR"}</button>
                  <label className="mt-4 block text-xs text-white/60">Altura no celular (px)</label>
                  <input type="number" min={140} max={700} value={form[KEYS.mobileHeight]} onChange={(e) => update(KEYS.mobileHeight, e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#10172a] px-3 py-2 text-white" />
                  <p className="mt-2 text-[11px] text-white/40">Se não enviar imagem mobile, o sistema usa a desktop automaticamente.</p>
                </section>
              </div>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <label className="block text-xs text-white/60">Link ao clicar no topo (opcional)</label>
                <input value={form[KEYS.link]} onChange={(e) => update(KEYS.link, e.target.value)} placeholder="/login ou https://..." className="mt-1 w-full rounded-xl border border-white/10 bg-[#10172a] px-3 py-2 text-white" />
                <label className="mt-3 flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={form[KEYS.newTab] === "1"} onChange={(e) => update(KEYS.newTab, e.target.checked ? "1" : "0")} /> Abrir link em nova aba</label>
              </section>

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => { update(KEYS.desktopImage, ""); update(KEYS.mobileImage, ""); update(KEYS.enabled, "0"); }} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/5">REMOVER PERSONALIZAÇÃO</button>
                <button type="button" onClick={save} disabled={updateMutation.isPending || uploading !== null} className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-[#03111d] disabled:opacity-50"><Save className="h-4 w-4" />{updateMutation.isPending ? "SALVANDO..." : "SALVAR E PUBLICAR"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
