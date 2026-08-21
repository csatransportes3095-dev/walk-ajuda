import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Globe, ImageIcon, Save, Share2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ImageCropModal } from "@/components/ImageCropModal";

const PROFILE_IDS = ["institutional", "schedule", "quote", "receipt", "video", "tutorial", "app"] as const;
type ProfileId = (typeof PROFILE_IDS)[number];

type PreviewProfile = {
  id: ProfileId;
  label: string;
  description: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  imageVersion: string;
};

const PROFILE_LINKS: Record<ProfileId, string> = {
  institutional: "Página inicial, acompanhamento, login e links gerais",
  schedule: "Agendamento e reagendamento",
  quote: "Orçamentos enviados ao cliente",
  receipt: "Recibos enviados ao cliente",
  video: "Vídeos publicados no ADM",
  tutorial: "Tutorial público em vídeo",
  app: "Páginas App Android e App Pro",
};

function normalizeImageMime(mime: string) {
  if (mime === "image/jpg") return "image/jpeg";
  return mime as "image/jpeg" | "image/png" | "image/webp";
}

export function SharePreviewSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sharePreview.list.useQuery();
  const [activeProfileId, setActiveProfileId] = useState<ProfileId>("institutional");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropMime, setCropMime] = useState<"image/jpeg" | "image/png" | "image/webp">("image/jpeg");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profiles = (data || {}) as Partial<Record<ProfileId, PreviewProfile>>;
  const activeProfile = profiles[activeProfileId];

  const refreshProfiles = () => {
    void utils.sharePreview.list.invalidate();
  };

  const updateMut = trpc.sharePreview.update.useMutation({
    onSuccess: (updated) => {
      setPreview(updated.imageUrl || null);
      setImageUrlInput(updated.imageUrl?.startsWith("http") ? updated.imageUrl : "");
      toast.success("Configuração de miniatura salva.");
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar a miniatura."),
  });
  const shieldMut = trpc.sharePreview.useH2Shield.useMutation({
    onSuccess: (updated) => {
      setPreview(updated.imageUrl || null);
      setImageUrlInput("");
      toast.success("Escudo H2 Colômbia aplicado a este tipo de link.");
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message || "Não foi possível aplicar o escudo H2."),
  });
  const removeMut = trpc.sharePreview.removeImage.useMutation({
    onSuccess: () => {
      setPreview(null);
      setImageUrlInput("");
      toast.success("Miniatura removida deste tipo de link.");
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message || "Não foi possível remover a miniatura."),
  });
  const uploadMut = trpc.sharePreview.uploadImage.useMutation({
    onSuccess: (updated) => {
      setPreview(updated.imageUrl || null);
      setImageUrlInput(updated.imageUrl?.startsWith("http") ? updated.imageUrl : "");
      toast.success("Imagem enviada e aplicada a este tipo de link.");
      refreshProfiles();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar a imagem."),
  });

  useEffect(() => {
    if (!activeProfile) return;
    setTitle(activeProfile.title);
    setSummary(activeProfile.summary);
    setPreview(activeProfile.imageUrl || null);
    setImageUrlInput(activeProfile.imageUrl?.startsWith("http") ? activeProfile.imageUrl : "");
  }, [activeProfileId, activeProfile?.title, activeProfile?.summary, activeProfile?.imageUrl, activeProfile?.imageVersion]);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error("Envie uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A miniatura deve ter no máximo 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropMime(normalizeImageMime(file.type));
      setCropSrc(String(reader.result || ""));
    };
    reader.onerror = () => toast.error("Não foi possível abrir a imagem.");
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (imageBase64: string, mimeType: string) => {
    const safeMime = normalizeImageMime(mimeType);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(safeMime)) {
      toast.error("Formato de imagem não suportado.");
      return;
    }
    setCropSrc(null);
    setPreview(`data:${safeMime};base64,${imageBase64}`);
    uploadMut.mutate({ profileId: activeProfileId, imageBase64, mimeType: safeMime });
  };

  const isSaving = updateMut.isPending || shieldMut.isPending || removeMut.isPending || uploadMut.isPending;

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-5">
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          mimeType={cropMime}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}

      <div className="bg-[#111128] border border-purple-500/25 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/15 text-purple-300"><Share2 className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-bold text-white">Miniaturas dos links enviados</h3>
            <p className="text-xs text-gray-400 mt-1">Escolha uma miniatura própria para cada tipo de link. Uma troca não altera os outros links.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PROFILE_IDS.map((profileId) => {
            const profile = profiles[profileId];
            const active = activeProfileId === profileId;
            return (
              <button
                key={profileId}
                type="button"
                onClick={() => setActiveProfileId(profileId)}
                className={`text-left rounded-xl border p-3 transition-colors ${active ? "border-purple-400 bg-purple-500/15" : "border-white/10 bg-[#0a0a1a] hover:border-purple-400/50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">{profile?.label || profileId}</span>
                  {profile?.imageUrl ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ImageIcon className="w-4 h-4 text-amber-400" />}
                </div>
                <p className="text-[11px] text-gray-400 leading-snug mt-1">{PROFILE_LINKS[profileId]}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">
        <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
          <h3 className="text-sm font-bold text-purple-300 mb-3 flex items-center gap-2"><Share2 className="w-4 h-4" /> Preview — {activeProfile?.label || "Compartilhamento"}</h3>
          <div className="bg-[#0a0a1a] border border-white/10 rounded-xl overflow-hidden max-w-sm">
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {preview ? <img src={preview} alt="Miniatura do WhatsApp" className="w-full h-full object-cover" /> : <div className="text-center text-gray-500"><ImageIcon className="w-10 h-10 mx-auto mb-2" /><span className="text-xs">Sem miniatura</span></div>}
              {isSaving && <div className="absolute inset-0 bg-black/65 flex items-center justify-center"><div className="animate-spin w-7 h-7 border-4 border-white border-t-transparent rounded-full" /></div>}
            </div>
            <div className="p-3 border-t border-white/10">
              <p className="text-[11px] text-white/40 uppercase tracking-wider">h2colombiano.com</p>
              <p className="text-sm font-bold text-white line-clamp-2 mt-1">{title || "H2 COLOMBIANO"}</p>
              <p className="text-xs text-white/60 mt-1 line-clamp-2">{summary || "Descrição do link"}</p>
            </div>
          </div>
          <div className="mt-4 text-xs text-blue-200/75 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Links de documentos, comprovantes, autenticação e TOTP não recebem miniatura pública para proteger informações privadas.</span>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
            <h3 className="text-sm font-bold text-purple-300 mb-2 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Imagem de {activeProfile?.label || "miniatura"}</h3>
            <p className="text-xs text-gray-400 mb-4">Use o escudo atual da H2, envie JPG/PNG/WEBP de até 5 MB ou cole uma URL HTTPS. O upload abre recorte antes de salvar.</p>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageSelect} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => shieldMut.mutate({ profileId: activeProfileId })} disabled={isSaving} className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold transition-colors">Usar escudo H2</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSaving} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"><Upload className="w-3.5 h-3.5" /> Enviar imagem</button>
              <button type="button" onClick={() => removeMut.mutate({ profileId: activeProfileId })} disabled={isSaving || !preview} className="px-3 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-xs font-bold flex items-center gap-1.5 transition-colors"><Trash2 className="w-3.5 h-3.5" /> Remover</button>
            </div>
            <div className="mt-4">
              <label className="text-xs text-gray-400 block mb-1.5">Ou cole a URL HTTPS da imagem</label>
              <div className="flex gap-2">
                <input value={imageUrlInput} onChange={(event) => setImageUrlInput(event.target.value)} placeholder="https://exemplo.com/miniatura.jpg" className="min-w-0 flex-1 bg-[#0a0a1a] border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-400" />
                <button type="button" onClick={() => updateMut.mutate({ profileId: activeProfileId, title, summary, imageUrl: imageUrlInput.trim() })} disabled={isSaving || !imageUrlInput.trim()} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold">Salvar URL</button>
              </div>
            </div>
          </div>

          <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2"><Globe className="w-4 h-4" /> Texto do link</h3>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Título</label>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="w-full bg-[#0a0a1a] border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-400" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Descrição</label>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} rows={3} className="w-full bg-[#0a0a1a] border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-400 resize-y" />
            </div>
            <button type="button" onClick={() => updateMut.mutate({ profileId: activeProfileId, title, summary })} disabled={isSaving || !title.trim()} className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold flex justify-center items-center gap-2"><Save className="w-4 h-4" /> Salvar {activeProfile?.label || "configuração"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
