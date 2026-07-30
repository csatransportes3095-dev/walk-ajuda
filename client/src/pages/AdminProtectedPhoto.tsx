import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, Upload, Trash2, Eye, EyeOff, ImageIcon, Copy, Check, Users, X, ChevronUp, ChevronDown } from "lucide-react";

export default function AdminProtectedPhoto() {
  const utils = trpc.useUtils();
  const { data: photos, isLoading } = trpc.protectedPhotos.list.useQuery();

  const [title, setTitle] = useState("ðŸ“¸ Foto protegida");
  const [message, setMessage] = useState(
    "Para visualizar a foto, finalize seu cadastro e confirme seus dados.\n\nâœ… O acesso serÃ¡ registrado automaticamente."
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [uploading, setUploading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [viewingLogsPhotoId, setViewingLogsPhotoId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const siteLink = typeof window !== "undefined" ? window.location.origin + "/foto" : "https://h2colombiano.com/foto";

  const { data: accessLogs, isLoading: logsLoading } = trpc.protectedPhotos.listAccessLogs.useQuery(
    { photoId: viewingLogsPhotoId ?? undefined },
    { enabled: viewingLogsPhotoId !== null }
  );

  const uploadMut = trpc.protectedPhotos.upload.useMutation({
    onSuccess: () => {
      utils.protectedPhotos.list.invalidate();
      setPreview(null);
      setImageData(null);
      setTitle("ðŸ“¸ Foto protegida");
      setMessage("Para visualizar a foto, finalize seu cadastro e confirme seus dados.\n\nâœ… O acesso serÃ¡ registrado automaticamente.");
      toast.success("Foto protegida salva com sucesso!");
      setUploading(false);
    },
    onError: (e) => { toast.error(e.message || "Erro ao salvar foto"); setUploading(false); },
  });

  const deleteMut = trpc.protectedPhotos.delete.useMutation({
    onSuccess: () => { utils.protectedPhotos.list.invalidate(); toast.success("Foto removida!"); },
  });

  const toggleMut = trpc.protectedPhotos.toggle.useMutation({
    onSuccess: () => { utils.protectedPhotos.list.invalidate(); },
  });

  const reorderMut = trpc.protectedPhotos.reorder.useMutation({
    onSuccess: () => { utils.protectedPhotos.list.invalidate(); },
  });

  const clearLogsMut = trpc.protectedPhotos.clearAccessLogs.useMutation({
    onSuccess: () => {
      utils.protectedPhotos.listAccessLogs.invalidate();
      toast.success("HistÃ³rico limpo!");
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (mÃ¡x 10MB)"); return; }
    setMimeType(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreview(result);
      setImageData(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!imageData) { toast.error("Selecione uma imagem"); return; }
    if (!title.trim()) { toast.error("Digite um tÃ­tulo"); return; }
    if (!message.trim()) { toast.error("Digite uma mensagem"); return; }
    setUploading(true);
    uploadMut.mutate({ title: title.trim(), message: message.trim(), imageData, mimeType });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(siteLink).then(() => {
      setCopiedLink(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#fff',
    padding: '10px 14px',
    width: '100%',
    fontSize: '14px',
    outline: 'none',
  };

  const formatDate = (d: Date | string) => {
    const dt = new Date(d);
    return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatPhone = (p: string) => {
    const d = p.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return p;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a1a', padding: '16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }} className="space-y-6">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-purple-400" />
          <h1 className="text-lg font-bold text-white">Foto Protegida</h1>
        </div>
        <p className="text-sm text-gray-400">
          A foto protegida aparece na pÃ¡gina inicial. Clientes <strong className="text-white">sem nÃºmero cadastrado</strong> veem a foto bloqueada.
          Clientes <strong className="text-white">com nÃºmero cadastrado</strong> veem a foto liberada automaticamente.
        </p>

        {/* Link para compartilhar */}
        <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', padding: '16px' }}>
          <p className="text-xs text-purple-300 font-semibold mb-2">ðŸ”— Link para compartilhar com clientes</p>
          <div className="flex items-center gap-2">
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px', flex: 1, overflow: 'hidden' }}>
              <p className="text-white text-sm truncate">{siteLink}</p>
            </div>
            <button
              onClick={handleCopyLink}
              style={{ background: copiedLink ? 'rgba(34,197,94,0.2)' : 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)', borderRadius: '8px', padding: '10px 16px', color: copiedLink ? '#4ade80' : '#c4b5fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: 600 }}
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Envie este link para seus clientes. Quem tiver nÃºmero cadastrado verÃ¡ a foto automaticamente.</p>
        </div>

        {/* FormulÃ¡rio de upload */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px' }} className="space-y-4">
          <p className="text-sm font-semibold text-purple-300">Nova Foto Protegida</p>
          <div
            style={{ border: '2px dashed rgba(139,92,246,0.4)', borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxHeight: '192px', margin: '0 auto', borderRadius: '8px', objectFit: 'contain' }} />
            ) : (
              <div className="space-y-2">
                <ImageIcon className="w-10 h-10 text-purple-400/50 mx-auto" />
                <p className="text-sm text-gray-400">Clique para selecionar a imagem</p>
                <p className="text-xs text-gray-600">JPG, PNG, WEBP â€” mÃ¡x 10MB</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">TÃ­tulo</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="ðŸ“¸ Foto protegida" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Mensagem para quem nÃ£o tem acesso</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Para visualizar a foto, finalize seu cadastro..."
            />
          </div>
          <button
            onClick={handleSave}
            disabled={uploading || !imageData}
            style={{ width: '100%', padding: '12px', background: uploading || !imageData ? 'rgba(139,92,246,0.3)' : '#7c3aed', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 600, cursor: uploading || !imageData ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '15px' }}
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Salvando..." : "Salvar Foto Protegida"}
          </button>
        </div>

        {/* Lista de fotos existentes */}
        {isLoading ? (
          <p className="text-gray-400 text-sm text-center">Carregando...</p>
        ) : photos && photos.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-300">Fotos cadastradas</p>
            {photos.map(photo => (
              <div key={photo.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px' }} className="space-y-3">
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <img
                    src={photo.imageUrl}
                    alt={photo.title}
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-sm font-semibold text-white truncate">{photo.title}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{photo.message}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {/* BotÃµes de reordenaÃ§Ã£o */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => reorderMut.mutate({ id: photo.id, direction: 'up' })}
                          title="Mover para cima"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#d1d5db' }}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => reorderMut.mutate({ id: photo.id, direction: 'down' })}
                          title="Mover para baixo"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#d1d5db' }}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => toggleMut.mutate({ id: photo.id, isActive: photo.isActive !== 1 })}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', background: photo.isActive === 1 ? 'rgba(34,197,94,0.2)' : 'rgba(107,114,128,0.3)', color: photo.isActive === 1 ? '#4ade80' : '#9ca3af' }}
                      >
                        {photo.isActive === 1 ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {photo.isActive === 1 ? 'Ativa' : 'Inativa'}
                      </button>
                      <button
                        onClick={() => setViewingLogsPhotoId(viewingLogsPhotoId === photo.id ? null : photo.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', background: viewingLogsPhotoId === photo.id ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.2)', color: '#93c5fd' }}
                      >
                        <Users className="w-3 h-3" />
                        Ver Acessos
                      </button>
                      <button
                        onClick={() => { if (confirm('Excluir esta foto?')) deleteMut.mutate({ id: photo.id }); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'rgba(239,68,68,0.2)', color: '#f87171' }}
                      >
                        <Trash2 className="w-3 h-3" />
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Painel de logs de acesso */}
                {viewingLogsPhotoId === photo.id && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <p className="text-xs font-semibold text-blue-300">ðŸ‘ Quem visualizou esta foto</p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {accessLogs && accessLogs.length > 0 && (
                          <button
                            onClick={() => { if (confirm('Limpar todo o histÃ³rico de acessos?')) clearLogsMut.mutate({ photoId: photo.id }); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                          >
                            <X className="w-3 h-3" />
                            Limpar
                          </button>
                        )}
                        <button
                          onClick={() => utils.protectedPhotos.listAccessLogs.invalidate()}
                          style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}
                        >
                          Atualizar
                        </button>
                      </div>
                    </div>
                    {logsLoading ? (
                      <p className="text-xs text-gray-500 text-center py-3">Carregando...</p>
                    ) : !accessLogs || accessLogs.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-3">Nenhum acesso registrado ainda.</p>
                    ) : (
                      <div style={{ maxHeight: '240px', overflowY: 'auto' }} className="space-y-1">
                        {accessLogs.map((log) => (
                          <div key={log.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(59,130,246,0.07)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>ðŸ“±</span>
                              <span className="text-sm font-mono text-white">{formatPhone(log.phone)}</span>
                            </div>
                            <span className="text-xs text-gray-400">{formatDate(log.accessedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      {accessLogs && accessLogs.length > 0 ? `${accessLogs.length} acesso${accessLogs.length !== 1 ? 's' : ''} registrado${accessLogs.length !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">Nenhuma foto protegida cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
