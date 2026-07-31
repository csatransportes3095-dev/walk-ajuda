import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Upload, Copy, Video, Image, Trash2, ExternalLink, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface MediaFile {
  id: number;
  name: string;
  fileKey: string;
  url: string;
  videoSlug: string | null;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

type UploadStatus =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number; loaded: number; total: number; chunk: number; totalChunks: number }
  | { phase: "processing"; message: string }
  | { phase: "completed"; url: string; videoUrl: string; name: string; slug: string | null }
  | { phase: "failed"; message: string };

type ImageUploadStatus =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "completed"; url: string; name: string; slug: string | null }
  | { phase: "failed"; message: string };

type TabType = "video" | "image";

// â”€â”€â”€ Constantes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB por chunk (via backend)
const MAX_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB para imagens
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/avi"];
const ALLOWED_VIDEO_EXTS = [".mp4", ".mov", ".webm", ".avi"];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 10 * 60 * 1000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fileNameToSlug(filename: string): string {
  return filename
    .replace(/\.(mp4|mov|webm|avi|mpeg|ogv|jpg|jpeg|png|gif|webp)$/i, "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPublicUrl(media: Pick<MediaFile, "url" | "videoSlug" | "mimeType">): string {
  if (media.videoSlug) {
    const prefix = media.mimeType.startsWith('video/') ? 'video' : 'foto';
    return `https://h2colombiano.com/${prefix}/${media.videoSlug}`;
  }
  return media.url;
}

// â”€â”€â”€ Componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminMedia() {
  const [activeTab, setActiveTab] = useState<TabType>("video");

  // â”€â”€â”€ VIDEO STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [status, setStatus] = useState<UploadStatus>({ phase: "idle" });
  const [mediaList, setMediaList] = useState<MediaFile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [slugInput, setSlugInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // â”€â”€â”€ IMAGE STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [imgStatus, setImgStatus] = useState<ImageUploadStatus>({ phase: "idle" });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imgSlugInput, setImgSlugInput] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // â”€â”€â”€ Carregar lista do banco â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/upload/media-list", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMediaList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("[AdminMedia] Erro ao carregar lista:", e);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // â”€â”€â”€ VIDEO: Validação â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const validateVideoFile = (file: File): string | null => {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const isValidType = ALLOWED_VIDEO_TYPES.includes(file.type) || ALLOWED_VIDEO_EXTS.includes(ext);
    if (!isValidType) return `Formato inválido. Aceitos: MP4, MOV, WEBM, AVI. Recebido: ${file.type || ext}`;
    if (file.size > MAX_SIZE) return `Arquivo muito grande: ${formatBytes(file.size)}. Máximo: 500MB.`;
    if (file.size === 0) return "O arquivo está vazio.";
    return null;
  };

  // â”€â”€â”€ IMAGE: Validação â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const validateImageFile = (file: File): string | null => {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const isValidType = ALLOWED_IMAGE_TYPES.includes(file.type) || ALLOWED_IMAGE_EXTS.includes(ext);
    if (!isValidType) return `Formato inválido. Aceitos: JPG, PNG, GIF, WEBP. Recebido: ${file.type || ext}`;
    if (file.size > MAX_IMAGE_SIZE) return `Arquivo muito grande: ${formatBytes(file.size)}. Máximo: 15MB.`;
    if (file.size === 0) return "O arquivo está vazio.";
    return null;
  };

  // â”€â”€â”€ VIDEO: Polling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startPolling = (jobId: string, fileName: string, slug: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const startTime = Date.now();
    setStatus({ phase: "processing", message: "Vídeo enviado, estamos processando. Pode levar alguns minutos." });

    pollingRef.current = setInterval(async () => {
      if (Date.now() - startTime > MAX_POLL_TIME) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setStatus({ phase: "failed", message: "Timeout: o processamento demorou mais de 10 minutos." });
        return;
      }
      try {
        const res = await fetch(`/api/upload/media-job-status?jobId=${encodeURIComponent(jobId)}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          const videoUrl = data.videoUrl || "";
          const finalSlug = data.videoSlug || null;
          const friendlyUrl = finalSlug ? `https://h2colombiano.com/video/${finalSlug}` : (videoUrl.startsWith("/") ? `${window.location.origin}${videoUrl}` : videoUrl);
          setStatus({ phase: "completed", url: friendlyUrl, videoUrl: friendlyUrl, name: fileName, slug: finalSlug });
          toast.success(finalSlug ? `Pronto! URL: https://h2colombiano.com/video/${finalSlug}` : "Upload concluído!");
          navigator.clipboard.writeText(friendlyUrl).catch(() => {});
          loadList();
        } else if (data.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setStatus({ phase: "failed", message: data.error || "Erro ao processar vídeo." });
        }
      } catch { /* retry */ }
    }, POLL_INTERVAL);
  };

  // â”€â”€â”€ VIDEO: Upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const uploadVideoFile = async (file: File, slug: string) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadId: string;
    try {
      setStatus({ phase: "uploading", progress: 0, loaded: 0, total: file.size, chunk: 0, totalChunks });
      const initRes = await fetch("/api/upload/init-media", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type || "video/mp4", filename: file.name, totalChunks }),
      });
      if (!initRes.ok) { const err = await initRes.json().catch(() => ({})); throw new Error(err.error || `HTTP ${initRes.status}`); }
      const initData = await initRes.json();
      uploadId = initData.uploadId;
    } catch (e: any) {
      setStatus({ phase: "failed", message: `Erro ao iniciar upload: ${e.message}` });
      return;
    }

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const progress = Math.round((end / file.size) * 100);
      setStatus({ phase: "uploading", progress, loaded: end, total: file.size, chunk: i + 1, totalChunks });

      let ok = false;
      for (let retry = 0; retry < 3; retry++) {
        try {
          const formData = new FormData();
          formData.append("chunk", chunk, `chunk-${i}`);
          formData.append("uploadId", uploadId);
          formData.append("chunkIndex", String(i));
          const res = await fetch("/api/upload/chunk-media", { method: "POST", credentials: "include", body: formData });
          if (res.ok) { ok = true; break; }
          if (retry < 2) await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
        } catch {
          if (retry < 2) await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
        }
      }
      if (!ok) {
        setStatus({ phase: "failed", message: `Falha ao enviar parte ${i + 1}/${totalChunks}.` });
        return;
      }
    }

    try {
      setStatus({ phase: "processing", message: "Montando vídeo e enviando para o servidor... Aguarde." });
      const finalRes = await fetch("/api/upload/finalize-media", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, filename: file.name, fileSize: file.size, videoSlug: slug }),
      });
      if (!finalRes.ok) { const err = await finalRes.json().catch(() => ({})); throw new Error(err.error || `HTTP ${finalRes.status}`); }
      const result = await finalRes.json();
      if (result.status === "completed") {
        const friendlyUrl = result.videoUrl || "";
        setStatus({ phase: "completed", url: friendlyUrl, videoUrl: friendlyUrl, name: file.name, slug: result.videoSlug || null });
        toast.success(result.videoSlug ? `Pronto! URL: https://h2colombiano.com/video/${result.videoSlug}` : "Upload concluído!");
        navigator.clipboard.writeText(friendlyUrl).catch(() => {});
        loadList();
      } else {
        // Fallback: se por algum motivo retornar processing, fazer polling
        startPolling(result.jobId || uploadId, file.name, slug);
      }
    } catch (e: any) {
      setStatus({ phase: "failed", message: `Erro ao finalizar: ${e.message}` });
    }
  };

  // â”€â”€â”€ IMAGE: Upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const uploadImageFile = async (file: File, slug: string) => {
    setImgStatus({ phase: "uploading" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slug", slug);
      const res = await fetch("/api/upload/admin-image", {
        method: "POST", credentials: "include", body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const friendlyImgUrl = data.slug ? `https://h2colombiano.com/foto/${data.slug}` : (data.url.startsWith("/") ? `${window.location.origin}${data.url}` : data.url);
      setImgStatus({ phase: "completed", url: friendlyImgUrl, name: file.name, slug: data.slug });
      toast.success(data.slug ? `Pronto! URL: https://h2colombiano.com/foto/${data.slug}` : "Upload concluído!");
      navigator.clipboard.writeText(friendlyImgUrl).catch(() => {});
      loadList();
    } catch (e: any) {
      setImgStatus({ phase: "failed", message: e.message || "Erro no upload" });
      toast.error(e.message || "Erro no upload");
    }
  };

  // â”€â”€â”€ VIDEO: Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    const error = validateVideoFile(file);
    if (error) { setStatus({ phase: "failed", message: error }); toast.error(error); return; }
    setSlugInput(fileNameToSlug(file.name));
    setSelectedFile(file);
    setStatus({ phase: "idle" });
  };

  const handleStartVideoUpload = async () => {
    if (!selectedFile) return;
    await uploadVideoFile(selectedFile, slugInput.trim());
  };

  // â”€â”€â”€ IMAGE: Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imgInputRef.current) imgInputRef.current.value = "";
    const error = validateImageFile(file);
    if (error) { setImgStatus({ phase: "failed", message: error }); toast.error(error); return; }
    setImgSlugInput(fileNameToSlug(file.name));
    setSelectedImage(file);
    setImgStatus({ phase: "idle" });
  };

  const handleStartImageUpload = async () => {
    if (!selectedImage) return;
    await uploadImageFile(selectedImage, imgSlugInput.trim());
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    setSlugInput(val);
  };

  const handleImgSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    setImgSlugInput(val);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover esta mídia da lista?")) return;
    try {
      await fetch(`/api/upload/media-delete/${id}`, { method: "DELETE", credentials: "include" });
      setMediaList(prev => prev.filter(m => m.id !== id));
      toast.success("Mídia removida.");
    } catch { toast.error("Erro ao remover."); }
  };

  const copyUrl = (url: string) => {
    const absUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
    navigator.clipboard.writeText(absUrl)
      .then(() => toast.success("URL copiada!"))
      .catch(() => toast.error("Não foi possível copiar."));
  };

  const isUploading = ["uploading", "processing"].includes(status.phase);

  // Filtrar lista por tipo
  const videoList = mediaList.filter(m => m.mimeType.startsWith("video/"));
  const imageList = mediaList.filter(m => m.mimeType.startsWith("image/"));

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
          <Upload className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Upload de Mídia</h1>
          <p className="text-gray-400 text-sm">Gere URLs públicas para vídeos e fotos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("video")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === "video"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-900/30"
              : "bg-[#111128] text-gray-400 hover:text-white border border-purple-900/30"
          }`}
        >
          <Video className="w-4 h-4" /> Vídeos
        </button>
        <button
          onClick={() => setActiveTab("image")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === "image"
              ? "bg-green-600 text-white shadow-lg shadow-green-900/30"
              : "bg-[#111128] text-gray-400 hover:text-white border border-green-900/30"
          }`}
        >
          <Image className="w-4 h-4" /> Fotos
        </button>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TAB: VÍDEO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === "video" && (
        <>
          {/* Zona de seleção de vídeo */}
          {!selectedFile && !isUploading && status.phase !== "completed" && (
            <div
              className={`border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-all cursor-pointer ${
                status.phase === "failed" ? "border-red-600 bg-red-900/10" : "border-purple-600 hover:border-purple-400 hover:bg-purple-900/10"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi" className="hidden" onChange={handleVideoFileChange} />
              {status.phase === "idle" && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-purple-700 flex items-center justify-center mx-auto mb-4"><Upload className="w-8 h-8" /></div>
                  <p className="text-lg font-semibold mb-1">Clique para selecionar um vídeo</p>
                  <p className="text-gray-400 text-sm">MP4, MOV, WEBM ou AVI â€” máx. 500MB</p>
                </>
              )}
              {status.phase === "failed" && (
                <div className="space-y-3">
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                  <p className="text-red-300 font-medium">{status.message}</p>
                  <p className="text-gray-500 text-sm">Clique para tentar novamente</p>
                </div>
              )}
            </div>
          )}

          {/* Formulário de slug + botão upload */}
          {selectedFile && !isUploading && status.phase !== "completed" && (
            <div className="bg-[#111128] border border-purple-900/30 rounded-2xl p-5 mb-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-900/50 flex items-center justify-center flex-shrink-0"><Video className="w-5 h-5 text-blue-400" /></div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{formatBytes(selectedFile.size)}</p>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 block">Nome da URL (slug)</label>
                <div className="flex items-center bg-[#0a0a1a] border border-purple-900/50 rounded-xl px-3 py-2">
                  <span className="text-gray-500 text-sm whitespace-nowrap">/video/</span>
                  <input type="text" value={slugInput} onChange={handleSlugChange} placeholder="nome-do-video" className="flex-1 bg-transparent text-white text-sm outline-none ml-1" />
                </div>
                {slugInput && <p className="text-xs text-green-400 mt-1">URL gerada: <span className="text-purple-300">{window.location.origin}/video/{slugInput}</span></p>}
                {!slugInput && <p className="text-xs text-yellow-600 mt-1">Sem slug â€” será usada a URL do storage diretamente.</p>}
              </div>
              <div className="flex gap-2">
                <Button className="bg-purple-600 hover:bg-purple-700 flex-1" onClick={handleStartVideoUpload}><Upload className="w-4 h-4 mr-2" /> Iniciar Upload</Button>
                <Button variant="outline" onClick={() => { setSelectedFile(null); setSlugInput(""); setStatus({ phase: "idle" }); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Progresso */}
          {status.phase === "uploading" && (
            <div className="bg-[#111128] border border-yellow-900/30 rounded-2xl p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2"><Loader2 className="w-5 h-5 text-yellow-400 animate-spin" /><span className="text-yellow-300 font-semibold">Enviando parte {status.chunk} de {status.totalChunks}...</span></div>
              <p className="text-gray-400 text-sm">{formatBytes(status.loaded)} / {formatBytes(status.total)} ({status.progress}%)</p>
              <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden"><div className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-300" style={{ width: `${status.progress}%` }} /></div>
            </div>
          )}

          {/* Processando */}
          {status.phase === "processing" && (
            <div className="bg-[#111128] border border-purple-900/30 rounded-2xl p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2"><Loader2 className="w-5 h-5 text-purple-400 animate-spin" /><span className="text-purple-300 font-semibold">Processando vídeo...</span></div>
              <p className="text-gray-400 text-sm">{status.message}</p>
              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden"><div className="h-full bg-purple-500 rounded-full animate-pulse w-full" /></div>
            </div>
          )}

          {/* Completed */}
          {status.phase === "completed" && (
            <div className="bg-[#0d1a0d] border border-green-900/50 rounded-2xl p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2"><CheckCircle className="w-7 h-7 text-green-400" /><span className="text-green-300 font-bold text-lg">Upload concluído!</span></div>
              <p className="text-gray-400 text-sm truncate">{status.name}</p>
              <div className="bg-[#0a0a1a] rounded-xl p-3"><p className="text-xs text-gray-500 mb-1">URL do vídeo:</p><p className="text-purple-300 text-sm break-all font-mono">{status.url}</p></div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => copyUrl(status.videoUrl)}><Copy className="w-4 h-4 mr-1" /> Copiar URL</Button>
                <Button size="sm" variant="outline" onClick={() => window.open(status.videoUrl.startsWith("/") ? `${window.location.origin}${status.videoUrl}` : status.videoUrl, "_blank")}><ExternalLink className="w-4 h-4 mr-1" /> Abrir</Button>
                <Button size="sm" variant="outline" onClick={() => { setSelectedFile(null); setSlugInput(""); setStatus({ phase: "idle" }); }}>Novo upload</Button>
              </div>
            </div>
          )}

          {/* Failed com arquivo selecionado */}
          {status.phase === "failed" && selectedFile && (
            <div className="bg-[#1a0d0d] border border-red-900/50 rounded-2xl p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2"><AlertCircle className="w-7 h-7 text-red-400" /><span className="text-red-300 font-bold">Falha no upload</span></div>
              <p className="text-red-200 text-sm">{status.message}</p>
              <div className="flex gap-2">
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={handleStartVideoUpload}>Tentar novamente</Button>
                <Button size="sm" variant="outline" onClick={() => { setSelectedFile(null); setSlugInput(""); setStatus({ phase: "idle" }); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Lista de vídeos */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold tracking-wider text-gray-300">VÍDEOS ENVIADOS</h2>
              <Button size="sm" variant="outline" onClick={loadList} disabled={loadingList}><RefreshCw className={`w-4 h-4 mr-1 ${loadingList ? "animate-spin" : ""}`} /> Atualizar</Button>
            </div>
            {loadingList && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-purple-400 animate-spin" /></div>}
            {!loadingList && videoList.length === 0 && (
              <div className="text-center py-12 text-gray-500"><Video className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Nenhum vídeo enviado ainda.</p></div>
            )}
            <div className="space-y-4">
              {videoList.map((media) => {
                const publicUrl = getPublicUrl(media);
                const absPublicUrl = publicUrl.startsWith("/") ? `${window.location.origin}${publicUrl}` : publicUrl;
                return (
                  <div key={media.id} className="bg-[#111128] border border-purple-900/30 rounded-2xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-900/50 flex items-center justify-center flex-shrink-0"><Video className="w-5 h-5 text-blue-400" /></div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{media.name}</p>
                          <p className="text-xs text-gray-500">{formatBytes(media.fileSize)} Â· {new Date(media.uploadedAt).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0" onClick={() => handleDelete(media.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <video src={media.url} controls preload="metadata" className="w-full rounded-xl mb-3 max-h-48 bg-black" />
                    <div className="bg-[#0d0d20] rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">{media.videoSlug ? "URL pública do vídeo:" : "URL do storage:"}</p>
                      <p className="text-xs text-purple-300 break-all mb-2 font-mono">{media.videoSlug ? absPublicUrl : media.url}</p>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-purple-700 hover:bg-purple-600 flex-1" onClick={() => copyUrl(publicUrl)}><Copy className="w-3 h-3 mr-1" /> Copiar</Button>
                        <Button size="sm" variant="outline" onClick={() => window.open(publicUrl.startsWith("/") ? `${window.location.origin}${publicUrl}` : publicUrl, "_blank")}><ExternalLink className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TAB: IMAGEM â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === "image" && (
        <>
          {/* Zona de seleção de imagem */}
          {!selectedImage && imgStatus.phase !== "uploading" && imgStatus.phase !== "completed" && (
            <div
              className={`border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-all cursor-pointer ${
                imgStatus.phase === "failed" ? "border-red-600 bg-red-900/10" : "border-green-600 hover:border-green-400 hover:bg-green-900/10"
              }`}
              onClick={() => imgInputRef.current?.click()}
            >
              <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={handleImageFileChange} />
              {imgStatus.phase === "idle" && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-green-700 flex items-center justify-center mx-auto mb-4"><Image className="w-8 h-8" /></div>
                  <p className="text-lg font-semibold mb-1">Clique para selecionar uma foto</p>
                  <p className="text-gray-400 text-sm">JPG, PNG, GIF ou WEBP â€” máx. 15MB</p>
                </>
              )}
              {imgStatus.phase === "failed" && (
                <div className="space-y-3">
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                  <p className="text-red-300 font-medium">{imgStatus.message}</p>
                  <p className="text-gray-500 text-sm">Clique para tentar novamente</p>
                </div>
              )}
            </div>
          )}

          {/* Formulário de slug + botão upload de imagem */}
          {selectedImage && imgStatus.phase !== "uploading" && imgStatus.phase !== "completed" && (
            <div className="bg-[#111128] border border-green-900/30 rounded-2xl p-5 mb-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-900/50 flex items-center justify-center flex-shrink-0"><Image className="w-5 h-5 text-green-400" /></div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{selectedImage.name}</p>
                  <p className="text-xs text-gray-500">{formatBytes(selectedImage.size)}</p>
                </div>
              </div>
              {/* Preview */}
              <div className="rounded-xl overflow-hidden bg-black/50 max-h-48 flex items-center justify-center">
                <img src={URL.createObjectURL(selectedImage)} alt="Preview" className="max-h-48 object-contain" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 block">Nome da URL (slug) â€” opcional</label>
                <div className="flex items-center bg-[#0a0a1a] border border-green-900/50 rounded-xl px-3 py-2">
                  <span className="text-gray-500 text-sm whitespace-nowrap">/foto/</span>
                  <input type="text" value={imgSlugInput} onChange={handleImgSlugChange} placeholder="nome-da-foto" className="flex-1 bg-transparent text-white text-sm outline-none ml-1" />
                </div>
                {imgSlugInput && <p className="text-xs text-green-400 mt-1">URL gerada: <span className="text-green-300">{window.location.origin}/foto/{imgSlugInput}</span></p>}
                {!imgSlugInput && <p className="text-xs text-yellow-600 mt-1">Sem slug â€” será usada a URL do storage diretamente.</p>}
              </div>
              <div className="flex gap-2">
                <Button className="bg-green-600 hover:bg-green-700 flex-1" onClick={handleStartImageUpload}><Upload className="w-4 h-4 mr-2" /> Enviar Foto</Button>
                <Button variant="outline" onClick={() => { setSelectedImage(null); setImgSlugInput(""); setImgStatus({ phase: "idle" }); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Uploading */}
          {imgStatus.phase === "uploading" && (
            <div className="bg-[#111128] border border-green-900/30 rounded-2xl p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2"><Loader2 className="w-5 h-5 text-green-400 animate-spin" /><span className="text-green-300 font-semibold">Enviando foto...</span></div>
              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden"><div className="h-full bg-green-500 rounded-full animate-pulse w-full" /></div>
            </div>
          )}

          {/* Completed */}
          {imgStatus.phase === "completed" && (
            <div className="bg-[#0d1a0d] border border-green-900/50 rounded-2xl p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2"><CheckCircle className="w-7 h-7 text-green-400" /><span className="text-green-300 font-bold text-lg">Upload concluído!</span></div>
              <p className="text-gray-400 text-sm truncate">{imgStatus.name}</p>
              <div className="bg-[#0a0a1a] rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">URL da foto:</p>
                <p className="text-green-300 text-sm break-all font-mono">{imgStatus.url}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => copyUrl(imgStatus.url)}><Copy className="w-4 h-4 mr-1" /> Copiar URL</Button>
                <Button size="sm" variant="outline" onClick={() => window.open(imgStatus.url.startsWith("/") ? `${window.location.origin}${imgStatus.url}` : imgStatus.url, "_blank")}><ExternalLink className="w-4 h-4 mr-1" /> Abrir</Button>
                <Button size="sm" variant="outline" onClick={() => { setSelectedImage(null); setImgSlugInput(""); setImgStatus({ phase: "idle" }); }}>Nova foto</Button>
              </div>
            </div>
          )}

          {/* Lista de imagens */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold tracking-wider text-gray-300">FOTOS ENVIADAS</h2>
              <Button size="sm" variant="outline" onClick={loadList} disabled={loadingList}><RefreshCw className={`w-4 h-4 mr-1 ${loadingList ? "animate-spin" : ""}`} /> Atualizar</Button>
            </div>
            {loadingList && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-green-400 animate-spin" /></div>}
            {!loadingList && imageList.length === 0 && (
              <div className="text-center py-12 text-gray-500"><Image className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Nenhuma foto enviada ainda.</p></div>
            )}
            <div className="space-y-4">
              {imageList.map((media) => {
                const publicUrl = getPublicUrl(media);
                const absPublicUrl = publicUrl.startsWith("/") ? `${window.location.origin}${publicUrl}` : publicUrl;
                return (
                  <div key={media.id} className="bg-[#111128] border border-green-900/30 rounded-2xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-green-900/50 flex items-center justify-center flex-shrink-0"><Image className="w-5 h-5 text-green-400" /></div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{media.name}</p>
                          <p className="text-xs text-gray-500">{formatBytes(media.fileSize)} Â· {new Date(media.uploadedAt).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0" onClick={() => handleDelete(media.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <img src={media.url} alt={media.name} className="w-full rounded-xl mb-3 max-h-48 object-contain bg-black/50" />
                    <div className="bg-[#0d0d20] rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">{media.videoSlug ? "URL pública da foto:" : "URL do storage:"}</p>
                      <p className="text-xs text-green-300 break-all mb-2 font-mono">{media.videoSlug ? absPublicUrl : media.url}</p>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-700 hover:bg-green-600 flex-1" onClick={() => copyUrl(publicUrl)}><Copy className="w-3 h-3 mr-1" /> Copiar</Button>
                        <Button size="sm" variant="outline" onClick={() => window.open(publicUrl.startsWith("/") ? `${window.location.origin}${publicUrl}` : publicUrl, "_blank")}><ExternalLink className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
