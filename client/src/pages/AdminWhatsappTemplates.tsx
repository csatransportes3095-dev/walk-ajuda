import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, MessageSquare, Image, Video, Upload, Link, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Template {
  id: number;
  title: string;
  statusKey: string | null;
  message: string;
  imageUrl: string | null;
  imageTitle: string;
  videoUrl: string | null;
  videoTitle: string;
  mediaFileKey: string | null;
  mediaFileUrl: string | null;
  mediaType: "image" | "video" | null;
  sortOrder: number;
  isDefault: number;
}

const EMPTY_FORM = {
  title: "",
  statusKey: "",
  message: "",
  imageUrl: "",
  imageTitle: "",
  videoUrl: "",
  videoTitle: "",
  mediaFileKey: "",
  mediaFileUrl: "",
  mediaType: null as "image" | "video" | null,
  sortOrder: 0,
  isDefault: 0,
};

export default function AdminWhatsappTemplates() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.whatsappTemplates.list.useQuery();
  const { data: statusTypesData = [] } = trpc.statusTypes.list.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const createMut = trpc.whatsappTemplates.create.useMutation({
    onSuccess: () => {
      utils.whatsappTemplates.list.invalidate();
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      toast.success("Mensagem criada!");
    },
    onError: () => toast.error("Erro ao criar mensagem"),
  });

  const updateMut = trpc.whatsappTemplates.update.useMutation({
    onSuccess: () => {
      utils.whatsappTemplates.list.invalidate();
      setEditingId(null);
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      toast.success("Mensagem atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar mensagem"),
  });

  const deleteMut = trpc.whatsappTemplates.delete.useMutation({
    onSuccess: () => {
      utils.whatsappTemplates.list.invalidate();
      toast.success("Mensagem excluída!");
    },
    onError: () => toast.error("Erro ao excluir"),
  });

  const uploadMut = trpc.whatsappTemplates.uploadMedia.useMutation({
    onSuccess: (data) => {
      setForm(f => ({ ...f, mediaFileKey: data.key, mediaFileUrl: data.url }));
      toast.success("Arquivo enviado!");
      setUploadingMedia(false);
    },
    onError: () => {
      toast.error("Erro ao enviar arquivo");
      setUploadingMedia(false);
    },
  });

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setForm({
      title: t.title,
      statusKey: t.statusKey ?? "",
      message: t.message,
      imageUrl: t.imageUrl ?? "",
      imageTitle: (t as any).imageTitle ?? "",
      videoUrl: t.videoUrl ?? "",
      videoTitle: (t as any).videoTitle ?? "",
      mediaFileKey: t.mediaFileKey ?? "",
      mediaFileUrl: t.mediaFileUrl ?? "",
      mediaType: t.mediaType ?? null,
      sortOrder: t.sortOrder,
      isDefault: t.isDefault,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function handleSave() {
    if (!form.title.trim()) return toast.error("Título obrigatório");
    if (!form.message.trim()) return toast.error("Mensagem obrigatória");
    const payload = {
      title: form.title.trim(),
      statusKey: form.statusKey || null,
      message: form.message.trim(),
      imageUrl: form.imageUrl || null,
      imageTitle: form.imageTitle || null,
      videoUrl: form.videoUrl || null,
      videoTitle: form.videoTitle || null,
      mediaFileKey: form.mediaFileKey || null,
      mediaFileUrl: form.mediaFileUrl || null,
      mediaType: form.mediaType ?? null,
      sortOrder: form.sortOrder,
      isDefault: form.isDefault,
    };
    if (editingId !== null) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) return toast.error("Apenas imagens e vídeos são suportados");
    if (file.size > 50 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 50MB)");
    setUploadingMedia(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      setForm(f => ({ ...f, mediaType: isVideo ? "video" : "image" }));
      uploadMut.mutate({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type,
        mediaType: isVideo ? "video" : "image",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setLocation("/admin/settings")} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Mensagens Rápidas WhatsApp
          </h1>
          <p className="text-sm text-zinc-400">Crie pré-moldes de mensagens para enviar via WhatsApp nos pedidos</p>
        </div>
        <div className="ml-auto">
          <Button onClick={startCreate} className="bg-green-600 hover:bg-green-700 gap-2">
            <Plus className="w-4 h-4" /> Nova Mensagem
          </Button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-green-300">
            {editingId !== null ? "Editar Mensagem" : "Nova Mensagem"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Título */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Título (nome do pré-molde)*</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Pedido Entregue - Padrão"
                className="bg-zinc-800 border-zinc-600"
              />
            </div>
            {/* Status vinculado */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Status do pedido (opcional — define mensagem padrão)</label>
              <select
                value={form.statusKey}
                onChange={e => setForm(f => ({ ...f, statusKey: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-2 text-sm text-white"
              >
                <option value="">— Sem vínculo (geral) —</option>
                {statusTypesData.map((s: any) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            {/* Mensagem */}
            <div className="md:col-span-2">
              <label className="text-xs text-zinc-400 mb-1 block">Texto da mensagem*</label>
              <Textarea
                ref={messageRef}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Olá {nome}! Seu pedido #{pedido} está com status: {status} 🎉"
                rows={4}
                className="bg-zinc-800 border-zinc-600"
              />
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <span className="text-[10px] text-zinc-500">Inserir variável:</span>
                {['{nome}', '{pedido}', '{status}', '{telefone}', '{servico}', '{cidade}', '{previsao}'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      const ta = messageRef.current;
                      if (ta) {
                        const start = ta.selectionStart ?? form.message.length;
                        const end = ta.selectionEnd ?? start;
                        const before = form.message.slice(0, start);
                        const after = form.message.slice(end);
                        const newMsg = before + v + after;
                        setForm(f => ({ ...f, message: newMsg }));
                        // Reposicionar cursor após a variável inserida
                        setTimeout(() => {
                          ta.focus();
                          const pos = start + v.length;
                          ta.setSelectionRange(pos, pos);
                        }, 0);
                      } else {
                        setForm(f => ({ ...f, message: f.message + v }));
                      }
                    }}
                    className="text-[10px] bg-zinc-700 hover:bg-green-700/40 text-green-300 px-2 py-0.5 rounded-full font-mono transition-colors border border-zinc-600 hover:border-green-500/50"
                    title={`Inserir ${v} na mensagem`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">As variáveis serão substituídas automaticamente pelos dados do pedido ao enviar.</p>
            </div>

            {/* Seção de mídia */}
            <div className="md:col-span-2">
              <label className="text-xs text-zinc-400 mb-2 block font-medium">Mídia (opcional)</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* URL de imagem */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1"><Image className="w-3 h-3" /> URL de Imagem</label>
                  <Input
                    value={form.imageUrl}
                    onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://..."
                    className="bg-zinc-800 border-zinc-600 text-xs"
                  />
                  <Input
                    value={form.imageTitle}
                    onChange={e => setForm(f => ({ ...f, imageTitle: e.target.value }))}
                    placeholder="Título da imagem (ex: Tutorial de acesso)"
                    className="bg-zinc-800 border-zinc-600 text-xs"
                  />
                </div>
                {/* URL de vídeo */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1"><Video className="w-3 h-3" /> URL de Vídeo</label>
                  <Input
                    value={form.videoUrl}
                    onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="https://..."
                    className="bg-zinc-800 border-zinc-600 text-xs"
                  />
                  <Input
                    value={form.videoTitle}
                    onChange={e => setForm(f => ({ ...f, videoTitle: e.target.value }))}
                    placeholder="Título do vídeo (ex: Vídeo explicativo)"
                    className="bg-zinc-800 border-zinc-600 text-xs"
                  />
                </div>
                {/* Upload de arquivo */}
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1"><Upload className="w-3 h-3" /> Upload Direto (máx 50MB)</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs border-zinc-600 bg-zinc-800"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingMedia}
                    >
                      {uploadingMedia ? "Enviando..." : (form.mediaFileUrl ? "Trocar arquivo" : "Escolher arquivo")}
                    </Button>
                    {form.mediaFileUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400 px-2"
                        onClick={() => setForm(f => ({ ...f, mediaFileKey: "", mediaFileUrl: "", mediaType: null }))}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {form.mediaFileUrl && (
                    <p className="text-xs text-green-400 mt-1 truncate">
                      {form.mediaType === "video" ? "🎥" : "🖼️"} Arquivo salvo
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>
            </div>

            {/* Configurações */}
            <div className="flex items-center gap-4">
              <label className="text-xs text-zinc-400 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault === 1}
                  onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked ? 1 : 0 }))}
                  className="rounded"
                />
                <Star className="w-3 h-3 text-yellow-400" /> Mensagem padrão do status
              </label>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Ordem de exibição</label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                className="bg-zinc-800 border-zinc-600 w-24"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <Button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 gap-2">
              <Check className="w-4 h-4" /> {isSaving ? "Salvando..." : "Salvar"}
            </Button>
            <Button onClick={cancelForm} variant="outline" className="border-zinc-600 gap-2">
              <X className="w-4 h-4" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de templates */}
      {isLoading ? (
        <div className="text-center text-zinc-400 py-12">Carregando...</div>
      ) : templates.length === 0 ? (
        <div className="text-center text-zinc-500 py-16 border border-dashed border-zinc-700 rounded-2xl">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma mensagem rápida criada ainda.</p>
          <p className="text-sm mt-1">Clique em "Nova Mensagem" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t: Template) => {
            const statusLabel = statusTypesData.find((s: any) => s.key === t.statusKey)?.label;
            const hasMedia = t.imageUrl || t.videoUrl || t.mediaFileUrl;
            return (
              <div key={t.id} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{t.title}</span>
                    {t.isDefault === 1 && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3" /> Padrão
                      </span>
                    )}
                    {statusLabel && (
                      <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 line-clamp-2 whitespace-pre-wrap">{t.message}</p>
                  {hasMedia && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {t.imageUrl && (
                        <span className="text-xs text-zinc-400 flex items-center gap-1 bg-zinc-800 px-2 py-1 rounded-lg">
                          <Image className="w-3 h-3 text-blue-400" /> URL imagem
                        </span>
                      )}
                      {t.videoUrl && (
                        <span className="text-xs text-zinc-400 flex items-center gap-1 bg-zinc-800 px-2 py-1 rounded-lg">
                          <Video className="w-3 h-3 text-purple-400" /> URL vídeo
                        </span>
                      )}
                      {t.mediaFileUrl && (
                        <span className="text-xs text-zinc-400 flex items-center gap-1 bg-zinc-800 px-2 py-1 rounded-lg">
                          <Upload className="w-3 h-3 text-green-400" /> {t.mediaType === "video" ? "Vídeo" : "Imagem"} salvo
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-400 hover:bg-blue-500/10 px-2"
                    onClick={() => startEdit(t)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:bg-red-500/10 px-2"
                    onClick={() => {
                      if (confirm("Excluir esta mensagem?")) deleteMut.mutate({ id: t.id });
                    }}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
