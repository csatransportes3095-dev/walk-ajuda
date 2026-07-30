import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Send, Trash2, Users, MessageSquare, Link, Image, UserPlus, Tag, CheckCircle, Clock, Search, X, ChevronDown, ChevronUp, Mail, Phone, Upload, ExternalLink, Timer, Loader2, Ban } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";

type MessageType = 'text' | 'link' | 'banner' | 'group_invite' | 'promo';
type TargetType = 'all' | 'withOrders' | 'withoutOrders' | 'byStatus' | 'selected';
type SendMode = 'email' | 'whatsapp';
type WaViewMode = 'single' | 'list';

const MESSAGE_TYPES: { value: MessageType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'text', label: 'Mensagem', icon: <MessageSquare className="w-4 h-4" />, color: 'bg-blue-500/20 border-blue-500/40 text-blue-300' },
  { value: 'promo', label: 'Promoção', icon: <Tag className="w-4 h-4" />, color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' },
  { value: 'link', label: 'Link', icon: <Link className="w-4 h-4" />, color: 'bg-green-500/20 border-green-500/40 text-green-300' },
  { value: 'banner', label: 'Banner', icon: <Image className="w-4 h-4" />, color: 'bg-purple-500/20 border-purple-500/40 text-purple-300' },
  { value: 'group_invite', label: 'Convite Grupo', icon: <UserPlus className="w-4 h-4" />, color: 'bg-teal-500/20 border-teal-500/40 text-teal-300' },
];

const inputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', color: '#000000', fontSize: '15px',
  border: '2px solid #333', borderRadius: '8px', padding: '10px 12px',
  width: '100%', outline: 'none', fontWeight: 500,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, minHeight: '100px', resize: 'vertical' as const,
};

export default function AdminBroadcast() {
  const [sendMode, setSendMode] = useState<SendMode>('whatsapp');
  const [title, setTitle] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('text');
  const [message, setMessage] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [intervalSeconds, setIntervalSeconds] = useState(0); // 0 = envio imediato
  // cancelBroadcastMutation: a ser implementado quando necessário

  // Estado de imagem para e-mail
  const [emailImageUrl, setEmailImageUrl] = useState('');       // URL externa
  const [emailImageFile, setEmailImageFile] = useState<File | null>(null);  // arquivo local
  const [emailImagePreview, setEmailImagePreview] = useState('');  // preview local
  const [emailImageStorageUrl, setEmailImageStorageUrl] = useState('');  // URL após upload
  const [emailImageUploading, setEmailImageUploading] = useState(false);

  // WhatsApp mode state
  const [waMessage, setWaMessage] = useState('');
  const [waImageUrl, setWaImageUrl] = useState('');
  const [waImageFile, setWaImageFile] = useState<File | null>(null);
  const [waImagePreview, setWaImagePreview] = useState('');
  const [waIsUploading, setWaIsUploading] = useState(false);
  const [waTargetType, setWaTargetType] = useState<TargetType>('all');
  const [waSelectedPhones, setWaSelectedPhones] = useState<string[]>([]);
  const [waSearchCustomer, setWaSearchCustomer] = useState('');
  const [waShowCustomerList, setWaShowCustomerList] = useState(false);
  const WA_LIST_KEY = 'walk_wa_send_list_v2';
  const [waLinks, setWaLinks] = useState<{ phone: string; name: string; url: string; sent: boolean }[]>(() => {
    try { const s = localStorage.getItem('walk_wa_send_list_v2'); if (s) return JSON.parse(s); } catch {}
    return [];
  });

  const [waStatusFilter, setWaStatusFilter] = useState<string>('');
  const [showWaPreview, setShowWaPreview] = useState(false);
  const [waViewMode, setWaViewMode] = useState<WaViewMode>('single');
  const [waTransitioning, setWaTransitioning] = useState(false);
  const broadcastsQuery = trpc.broadcasts.list.useQuery();
  const customersQuery = trpc.broadcasts.getCustomers.useQuery();
  const statusTypesQuery = trpc.broadcasts.getOrderStatusTypes.useQuery();
  const createMutation = trpc.broadcasts.create.useMutation();
  const sendMutation = trpc.broadcasts.send.useMutation();
  const uploadEmailImageMutation = trpc.broadcasts.uploadEmailImage.useMutation();
  const deleteMutation = trpc.broadcasts.delete.useMutation({
    onSuccess: () => { toast.success('Removido!'); broadcastsQuery.refetch(); },
  });

  const customers = customersQuery.data || [];
  const statusTypes = statusTypesQuery.data || [];
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchCustomer.toLowerCase()) ||
    c.phone.includes(searchCustomer)
  );
  const waFilteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(waSearchCustomer.toLowerCase()) ||
    c.phone.includes(waSearchCustomer)
  );

  const toggleCustomer = (phone: string) => {
    setSelectedPhones(prev =>
      prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
    );
  };

  const toggleWaCustomer = (phone: string) => {
    setWaSelectedPhones(prev =>
      prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
    );
  };

  // Upload de imagem para e-mail
  const handleEmailImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEmailImageFile(file);
    setEmailImageStorageUrl('');
    // Preview local
    const objectUrl = URL.createObjectURL(file);
    setEmailImagePreview(objectUrl);
    // Fazer upload para o storage
    setEmailImageUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve((ev.target?.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadEmailImageMutation.mutateAsync({
        imageBase64: base64,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name.replace(/\.[^.]+$/, ''),
      });
      if (result.success) {
        setEmailImageStorageUrl(result.url);
        toast.success('Imagem enviada para o servidor! Será incluída no e-mail.');
      }
    } catch {
      toast.error('Erro ao enviar imagem. Tente novamente.');
    }
    setEmailImageUploading(false);
  };

  // Upload de imagem para WhatsApp
  const handleWaImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWaImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setWaImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    // Usar URL de objeto local para preview
    const objectUrl = URL.createObjectURL(file);
    setWaImagePreview(objectUrl);
  };

  // Gerar links wa.me para WhatsApp
  const generateWaLinks = () => {
    if (!waMessage.trim() && !waImageUrl.trim() && !waImageFile) { toast.error('Digite a mensagem ou adicione uma imagem'); return; }
    const targets = waTargetType === 'all' ? customers
    : waTargetType === 'withOrders' ? customers.filter(c => (c as any).hasOrder)
    : waTargetType === 'withoutOrders' ? customers.filter(c => !(c as any).hasOrder)
    : waTargetType === 'byStatus' ? customers.filter(c => waStatusFilter ? (c as any).lastOrderStatus === waStatusFilter : (c as any).hasOrder)
    : customers.filter(c => waSelectedPhones.includes(c.phone));
    if (targets.length === 0) { toast.error('Nenhum cliente selecionado'); return; }

    // Montar mensagem com imagem (link) se houver
    let fullMessage = waMessage;
    if (waImageUrl.trim()) {
      fullMessage = fullMessage ? `${fullMessage}\n\n${waImageUrl.trim()}` : waImageUrl.trim();
    }

    const encodedMsg = encodeURIComponent(fullMessage);
    const links = targets.map(c => ({
      phone: c.phone,
      name: c.name,
      url: `https://wa.me/55${c.phone.replace(/\D/g, '')}?text=${encodedMsg}`,
    }));
        const newLinks = links.map(l => ({ ...l, sent: false }));
    setWaLinks(newLinks);
    localStorage.setItem(WA_LIST_KEY, JSON.stringify(newLinks));
    toast.success(`${links.length} cliente(s) na fila de envio!${waImageFile ? ' Obs: envie a imagem manualmente após abrir o WhatsApp.' : ''}`);
  };

  const markWaSent = (phone: string) => {
    setWaLinks(prev => {
      const updated = prev.map(l => l.phone === phone && !l.sent ? { ...l, sent: true } : l);
      localStorage.setItem(WA_LIST_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleSendCurrentWa = () => {
    if (waTransitioning) return;
    const current = waLinks.find(l => !l.sent);
    if (!current) return;

    setWaTransitioning(true);
    window.open(current.url, '_blank', 'noopener,noreferrer');
    markWaSent(current.phone);

    // Mantém o botão travado por um curto período para evitar clique duplo.
    setTimeout(() => setWaTransitioning(false), 450);
  };

  const clearWaList = () => {
    setWaLinks([]);
    setWaTransitioning(false);
    localStorage.removeItem(WA_LIST_KEY);
  };

  const handleSend = async () => {
    if (!title.trim()) { toast.error('Digite um título'); return; }
    if (!message.trim()) { toast.error('Digite a mensagem'); return; }
    if (targetType === 'selected' && selectedPhones.length === 0) {
      toast.error('Selecione pelo menos um cliente'); return;
    }
    // Se tem arquivo de imagem mas ainda não fez upload, aguardar
    if (emailImageFile && !emailImageStorageUrl && emailImageUploading) {
      toast.warning('Aguarde o upload da imagem terminar...');
      return;
    }
    if (emailImageFile && !emailImageStorageUrl && !emailImageUploading) {
      toast.error('A imagem não foi enviada. Tente selecionar o arquivo novamente.');
      return;
    }
    setIsSending(true);
    try {
      // Determinar URL da imagem: storage (upload) > URL externa > banner URL
      const finalEmailImageUrl = emailImageStorageUrl || emailImageUrl || imageUrl || undefined;
      const result = await createMutation.mutateAsync({
        title, messageType, message,
        linkUrl: linkUrl || undefined,
        linkLabel: linkLabel || undefined,
        imageUrl: imageUrl || undefined,
        emailImageUrl: finalEmailImageUrl,
        targetType: (targetType === 'withOrders' || targetType === 'withoutOrders' || targetType === 'byStatus') ? 'selected' : targetType,
        targetPhones: targetType === 'selected' ? selectedPhones
          : targetType === 'withOrders' ? customers.filter(c => (c as any).hasOrder).map(c => c.phone)
          : targetType === 'withoutOrders' ? customers.filter(c => !(c as any).hasOrder).map(c => c.phone)
          : targetType === 'byStatus' ? customers.filter(c => (c as any).lastOrderStatus === waStatusFilter).map(c => c.phone)
          : undefined,
      });
      if (result.success && result.broadcast) {
        const sendResult = await sendMutation.mutateAsync({ id: result.broadcast.id, intervalSeconds });
        if ('mode' in sendResult && sendResult.mode === 'queued') {
          const { emailRecipients: emailCount, intervalSeconds: ivSec } = sendResult as { emailRecipients: number; intervalSeconds: number; mode: string };
          const minLabel = ivSec >= 60 ? `${Math.ceil(ivSec / 60)} min` : `${ivSec}s`;
          toast.success(`⏱️ Fila criada! ${emailCount} e-mail(s) serão enviados 1 por vez a cada ${minLabel}.`);
        } else if ('totalRecipients' in sendResult) {
          const { totalRecipients, emailsSent, emailsFailed, emailsSkipped } = sendResult as { totalRecipients: number; emailsSent: number; emailsFailed: number; emailsSkipped: number };
          if (emailsSent > 0) {
            toast.success(`✅ ${emailsSent} e-mail(s) enviado(s) com sucesso!${emailsFailed > 0 ? ` (${emailsFailed} falhou)` : ''}${emailsSkipped > 0 ? ` | ${emailsSkipped} sem e-mail` : ''}`);
          } else if (emailsSkipped === totalRecipients) {
            toast.warning(`⚠️ Nenhum cliente tem e-mail cadastrado. Mensagem registrada para ${totalRecipients} cliente(s) (WhatsApp manual).`);
          } else {
            toast.error(`Falha ao enviar e-mails. Mensagem registrada para ${totalRecipients} cliente(s).`);
          }
        }
        setTitle(''); setMessage(''); setLinkUrl(''); setLinkLabel('');
        setImageUrl(''); setSelectedPhones([]); setTargetType('all');
        setEmailImageUrl(''); setEmailImageFile(null); setEmailImagePreview(''); setEmailImageStorageUrl('');
        broadcastsQuery.refetch();
      }
    } catch {
      toast.error('Erro ao enviar mensagem');
    }
    setIsSending(false);
  };

  const broadcasts = broadcastsQuery.data || [];
  const getTypeInfo = (type: string) => MESSAGE_TYPES.find(t => t.value === type) || MESSAGE_TYPES[0];
  const waPendingCount = waLinks.filter(l => !l.sent).length;
  const waCompletedCount = waLinks.length - waPendingCount;
  const waCurrentLink = waLinks.find(l => !l.sent) || null;
  const waCurrentPosition = waCurrentLink ? waCompletedCount + 1 : waLinks.length;
  const waProgress = waLinks.length > 0 ? Math.round((waCompletedCount / waLinks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <AdminHeader title="Envio em Massa" icon={<Send className="w-5 h-5" />} backTo="/admin/codes" />

      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">

        {/* Abas de modo */}
        <div className="flex gap-2 bg-black/40 border border-white/10 rounded-2xl p-2">
          <button
            onClick={() => setSendMode('whatsapp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${sendMode === 'whatsapp' ? 'bg-green-600/40 border border-green-500/50 text-green-300' : 'text-white/50 hover:text-white/70'}`}
          >
            <Phone className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={() => setSendMode('email')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${sendMode === 'email' ? 'bg-blue-600/40 border border-blue-500/50 text-blue-300' : 'text-white/50 hover:text-white/70'}`}
          >
            <Mail className="w-4 h-4" /> E-mail
          </button>
        </div>

        {/* ===== MODO WHATSAPP ===== */}
        {sendMode === 'whatsapp' && (
          <div className="bg-black/40 backdrop-blur-md border border-green-500/30 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Phone className="w-5 h-5 text-green-400" /> Envio via WhatsApp
            </h2>

            {/* Mensagem */}
            <div>
              <label className="block text-sm text-white/70 mb-1">Mensagem (opcional se tiver imagem)</label>
              <textarea
                style={textareaStyle}
                value={waMessage}
                onChange={e => setWaMessage(e.target.value)}
                placeholder="Digite a mensagem que será enviada pelo WhatsApp..."
              />
            </div>

            {/* Imagem */}
            <div className="space-y-3">
              <label className="block text-sm text-white/70">Imagem (opcional)</label>

              {/* Opção 1: URL da imagem */}
              <div>
                <label className="block text-xs text-white/50 mb-1 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Opção 1 — Cole o link da imagem (URL pública)</label>
                <input
                  style={inputStyle}
                  value={waImageUrl}
                  onChange={e => { setWaImageUrl(e.target.value); setWaLinks([]); }}
                  placeholder="https://exemplo.com/imagem.jpg"
                />
                {waImageUrl && (
                  <div className="mt-2">
                    <img src={waImageUrl} alt="preview" className="max-h-32 rounded-lg border border-white/20 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                    <p className="text-xs text-green-300 mt-1">✓ O link será incluído na mensagem — o WhatsApp mostrará a prévia da imagem automaticamente.</p>
                  </div>
                )}
              </div>

              {/* Opção 2: Upload de arquivo */}
              <div>
                <label className="block text-xs text-white/50 mb-1 flex items-center gap-1"><Upload className="w-3 h-3" /> Opção 2 — Selecione uma imagem do seu dispositivo</label>
                <label className="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg px-4 py-3 transition-all">
                  <Upload className="w-4 h-4 text-white/60" />
                  <span className="text-sm text-white/60">{waImageFile ? waImageFile.name : 'Clique para selecionar imagem...'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleWaImageFile} />
                </label>
                {waImagePreview && waImageFile && (
                  <div className="mt-2 space-y-1">
                    <img src={waImagePreview} alt="preview" className="max-h-32 rounded-lg border border-white/20 object-contain" />
                    <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                      <span className="text-yellow-300 text-xs">⚠️ Imagem do dispositivo: após clicar em "Abrir" no WhatsApp, você precisará anexar a imagem manualmente na conversa antes de enviar.</span>
                    </div>
                    <button onClick={() => { setWaImageFile(null); setWaImagePreview(''); }} className="text-xs text-red-400 hover:text-red-300">✕ Remover imagem</button>
                  </div>
                )}
              </div>
            </div>

            {/* Destinatários */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Destinatários</label>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => { setWaTargetType('all'); setWaLinks([]); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${waTargetType === 'all' ? 'bg-green-600/30 border-green-500/50 text-green-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <Users className="w-4 h-4" /> Todos ({customers.length})
                </button>
                <button
                  onClick={() => { setWaTargetType('withOrders'); setWaLinks([]); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${waTargetType === 'withOrders' ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <CheckCircle className="w-4 h-4" /> Com Pedidos ({customers.filter(c => (c as any).hasOrder).length})
                </button>
                <button
                  onClick={() => { setWaTargetType('withoutOrders'); setWaLinks([]); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${waTargetType === 'withoutOrders' ? 'bg-orange-600/30 border-orange-500/50 text-orange-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <Ban className="w-4 h-4" /> Sem Pedidos ({customers.filter(c => !(c as any).hasOrder).length})
                </button>
                <button
                  onClick={() => { setWaTargetType('byStatus'); setWaLinks([]); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${waTargetType === 'byStatus' ? 'bg-yellow-600/30 border-yellow-500/50 text-yellow-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <Clock className="w-4 h-4" /> Por Status
                </button>
                <button
                  onClick={() => { setWaTargetType('selected'); setWaShowCustomerList(true); setWaLinks([]); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${waTargetType === 'selected' ? 'bg-purple-600/30 border-purple-500/50 text-purple-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <CheckCircle className="w-4 h-4" /> Individual {waSelectedPhones.length > 0 && `(${waSelectedPhones.length})`}
                </button>
              </div>

              {waTargetType === 'byStatus' && (
                <div className="bg-black/30 border border-yellow-500/20 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-yellow-300/70 font-bold">Filtrar por último status do pedido:</p>
                  <div className="flex flex-wrap gap-2">
                    {statusTypes.length === 0 && <span className="text-xs text-white/40">Carregando status...</span>}
                    {statusTypes.map(st => (
                      <button
                        key={st.key}
                        onClick={() => { setWaStatusFilter(st.key); setWaLinks([]); }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          waStatusFilter === st.key
                            ? 'bg-yellow-600/40 border-yellow-500/60 text-yellow-200'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                        }`}
                      >
                        {st.label} ({customers.filter(c => (c as any).lastOrderStatus === st.key).length})
                      </button>
                    ))}
                  </div>
                  {waStatusFilter && (
                    <p className="text-xs text-yellow-300 font-bold">
                      {customers.filter(c => (c as any).lastOrderStatus === waStatusFilter).length} cliente(s) com status “{statusTypes.find(s => s.key === waStatusFilter)?.label || waStatusFilter}”
                    </p>
                  )}
                </div>
              )}
              {waTargetType === 'selected' && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setWaShowCustomerList(!waShowCustomerList)} className="flex items-center gap-1 text-xs text-white/60 hover:text-white">
                      {waShowCustomerList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {waShowCustomerList ? 'Ocultar lista' : 'Mostrar lista'}
                    </button>
                    {waSelectedPhones.length > 0 && (
                      <button onClick={() => setWaSelectedPhones([])} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 ml-auto">
                        <X className="w-3 h-3" /> Limpar
                      </button>
                    )}
                  </div>
                  {waShowCustomerList && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          style={{ ...inputStyle, paddingLeft: '28px', fontSize: '13px' }}
                          value={waSearchCustomer}
                          onChange={e => setWaSearchCustomer(e.target.value)}
                          placeholder="Buscar por nome ou telefone..."
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {waFilteredCustomers.map(c => (
                          <label key={c.phone} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={waSelectedPhones.includes(c.phone)}
                              onChange={() => toggleWaCustomer(c.phone)}
                              className="w-4 h-4 accent-green-500"
                            />
                            <span className="text-sm text-white/80 flex-1">{c.name}</span>
                            <span className="text-xs text-white/40">{c.phone}</span>
                          </label>
                        ))}
                        {waFilteredCustomers.length === 0 && (
                          <p className="text-center text-white/40 text-sm py-3">Nenhum cliente encontrado</p>
                        )}
                      </div>
                    </>
                  )}
                  {waSelectedPhones.length > 0 && (
                    <p className="text-xs text-green-300 font-bold">{waSelectedPhones.length} cliente(s) selecionado(s)</p>
                  )}
                </div>
              )}
            </div>

            {/* Prévia dos clientes filtrados */}
            {(() => {
              const previewTargets = waTargetType === 'all' ? customers
                : waTargetType === 'withOrders' ? customers.filter(c => (c as any).hasOrder)
                : waTargetType === 'withoutOrders' ? customers.filter(c => !(c as any).hasOrder)
                : waTargetType === 'byStatus' ? customers.filter(c => waStatusFilter ? (c as any).lastOrderStatus === waStatusFilter : (c as any).hasOrder)
                : customers.filter(c => waSelectedPhones.includes(c.phone));
              if (previewTargets.length === 0) return null;
              return (
                <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowWaPreview(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-2 font-bold">
                      <Users className="w-4 h-4" />
                      Prévia: {previewTargets.length} cliente(s) serão notificados
                    </span>
                    {showWaPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showWaPreview && (
                    <div className="border-t border-white/10">
                      <div className="max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white/5 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 text-white/50 font-bold">#</th>
                              <th className="text-left px-3 py-2 text-white/50 font-bold">Nome</th>
                              <th className="text-left px-3 py-2 text-white/50 font-bold">Telefone</th>
                              <th className="text-left px-3 py-2 text-white/50 font-bold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewTargets.map((c, i) => (
                              <tr key={c.phone} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-3 py-1.5 text-white/30">{i + 1}</td>
                                <td className="px-3 py-1.5 text-white/80">{c.name}</td>
                                <td className="px-3 py-1.5 text-white/50">{c.phone}</td>
                                <td className="px-3 py-1.5">
                                  {(c as any).lastOrderStatus ? (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs">
                                      {statusTypes.find(s => s.key === (c as any).lastOrderStatus)?.label || (c as any).lastOrderStatus}
                                    </span>
                                  ) : (c as any).hasOrder ? (
                                    <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 text-xs">Com Pedido</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-xs">Sem Pedido</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Botão gerar links */}
            <Button
              onClick={generateWaLinks}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 text-base"
            >
              <span className="flex items-center gap-2">
                <Phone className="w-4 h-4" /> Gerar Links WhatsApp
              </span>
            </Button>

            {/* Lista de envio manual WhatsApp */}
            {waLinks.length > 0 && (
              <div className="space-y-3">
                <div className="inline-flex bg-black/30 border border-white/10 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setWaViewMode('single')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${waViewMode === 'single' ? 'bg-green-600/40 border border-green-500/60 text-green-200' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                  >
                    Envio um por vez
                  </button>
                  <button
                    onClick={() => setWaViewMode('list')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${waViewMode === 'list' ? 'bg-white/15 border border-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                  >
                    Ver lista completa
                  </button>
                </div>

                {/* Cabeçalho com contador e botão limpar */}
                <div className="flex items-center justify-between bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-green-300">📋 Fila de Envio WhatsApp</p>
                    <p className="text-xs text-white/50">{waPendingCount} pendente(s) de {waLinks.length} total</p>
                  </div>
                  <button onClick={clearWaList} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg px-2 py-1 transition-all">
                    <X className="w-3 h-3" /> Limpar lista
                  </button>
                </div>

                {/* Barra de progresso */}
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${waProgress}%` }}
                  />
                </div>

                {waViewMode === 'single' ? (
                  <div className="sticky top-24 z-20">
                    <div className="bg-black/40 border border-green-500/40 rounded-2xl px-4 py-5 sm:px-5 sm:py-6 min-h-[260px] flex flex-col justify-between">
                      <div className="space-y-3">
                        <p className="text-xs font-bold tracking-wide text-green-300/90">FILA DE ENVIO WHATSAPP</p>
                        <p className="text-sm text-white/70">Cliente {waCurrentPosition} de {waLinks.length}</p>
                        <div className="min-h-[72px] max-h-[72px] overflow-hidden flex items-center">
                          <p className="text-lg sm:text-xl font-extrabold text-white uppercase leading-tight break-words w-full">
                            {waCurrentLink?.name || 'Todos os clientes foram processados.'}
                          </p>
                        </div>
                        <p className="text-sm sm:text-base text-white/65 min-h-[24px]">
                          {waCurrentLink?.phone || 'Sem clientes pendentes na fila.'}
                        </p>
                      </div>

                      <div className="mt-6 space-y-2">
                        <p className="text-xs text-white/55 h-4">
                          {waTransitioning
                            ? 'Carregando próximo cliente...'
                            : waCurrentLink
                              ? ' '
                              : 'Todos os clientes foram processados.'}
                        </p>
                        <button
                          id="btn-enviar-proximo-whatsapp"
                          type="button"
                          onClick={handleSendCurrentWa}
                          disabled={!waCurrentLink || waTransitioning}
                          className="w-full h-12 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-green-900/40 disabled:text-white/50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all"
                        >
                          <Phone className="w-4 h-4" /> Enviar pelo WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                    {waLinks.map((l) => (
                      <div
                        key={l.phone}
                        className={`flex items-center gap-3 rounded-xl p-3 transition-all duration-300 ${
                          l.sent
                            ? 'bg-green-900/30 border border-green-500/40 opacity-60'
                            : 'bg-black/30 border border-white/10'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                          {l.sent
                            ? <CheckCircle className="w-4 h-4 text-green-400" />
                            : <Phone className="w-3.5 h-3.5 text-white/50" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${l.sent ? 'text-green-300 line-through' : 'text-white'}`}>{l.name}</p>
                          <p className="text-xs text-white/40">{l.phone}</p>
                        </div>
                        {l.sent ? (
                          <span className="text-xs text-green-400 font-bold shrink-0">✅ Enviado</span>
                        ) : (
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markWaSent(l.phone)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-all shrink-0 active:scale-95"
                          >
                            <Phone className="w-3 h-3" /> Enviar
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {waLinks.every(l => l.sent) && (
                  <div className="text-center py-3 bg-green-900/20 border border-green-500/30 rounded-xl">
                    <p className="text-green-300 font-bold text-sm">🎉 Todos os clientes foram notificados!</p>
                    <button onClick={clearWaList} className="text-xs text-white/50 hover:text-white/70 mt-1 underline">Limpar lista</button>
                  </div>
                )}

                <p className="text-xs text-white/40 text-center">
                  Clique em "Enviar" para abrir o WhatsApp com a mensagem. O cliente é marcado automaticamente como enviado.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== MODO E-MAIL ===== */}
        {sendMode === 'email' && (
          <div className="bg-black/40 backdrop-blur-md border border-blue-500/30 rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" /> Envio por E-mail
            </h2>

            {/* Título */}
            <div>
              <label className="block text-sm text-white/70 mb-1">Título (assunto do e-mail)</label>
              <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Promoção de Junho" />
            </div>

            {/* Tipo de mensagem */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Tipo de mensagem</label>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setMessageType(t.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${messageType === t.value ? t.color + ' ring-2 ring-white/30' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensagem */}
            <div>
              <label className="block text-sm text-white/70 mb-1">
                {messageType === 'group_invite' ? 'Link do Grupo' : messageType === 'banner' ? 'Descrição do Banner' : 'Mensagem'}
              </label>
              <textarea style={textareaStyle} value={message} onChange={e => setMessage(e.target.value)}
                placeholder={
                  messageType === 'text' ? 'Digite sua mensagem para os clientes...' :
                  messageType === 'promo' ? 'Descreva a promoção: ex: 20% de desconto em todos os serviços!' :
                  messageType === 'link' ? 'Texto da mensagem com o link...' :
                  messageType === 'banner' ? 'Descrição do banner ou chamada para ação...' :
                  'Cole o link de convite do grupo WhatsApp...'
                }
              />
            </div>

            {/* Campos extras por tipo */}
            {(messageType === 'link' || messageType === 'promo') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-white/70 mb-1">URL do Link</label>
                  <input style={inputStyle} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Texto do Botão (opcional)</label>
                  <input style={inputStyle} value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Ex: Acessar agora" />
                </div>
              </div>
            )}

            {messageType === 'banner' && (
              <div>
                <label className="block text-sm text-white/70 mb-1">URL da Imagem do Banner</label>
                <input style={inputStyle} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
            )}

            {/* Imagem no E-mail */}
            <div className="space-y-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
              <label className="block text-sm font-bold text-blue-300 flex items-center gap-2">
                <Image className="w-4 h-4" /> Imagem no E-mail (opcional)
              </label>
              <p className="text-xs text-white/50">A imagem aparece incorporada no corpo do e-mail e também como anexo.</p>

              {/* Opção 1: URL externa */}
              <div>
                <label className="block text-xs text-white/50 mb-1 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Opção 1 — Cole o link da imagem (URL pública)
                </label>
                <input
                  style={inputStyle}
                  value={emailImageUrl}
                  onChange={e => { setEmailImageUrl(e.target.value); setEmailImageFile(null); setEmailImagePreview(''); setEmailImageStorageUrl(''); }}
                  placeholder="https://exemplo.com/banner.jpg"
                  disabled={!!emailImageFile}
                />
                {emailImageUrl && !emailImageFile && (
                  <div className="mt-2">
                    <img src={emailImageUrl} alt="preview" className="max-h-32 rounded-lg border border-white/20 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                    <p className="text-xs text-green-300 mt-1">✓ Imagem será exibida no corpo do e-mail.</p>
                  </div>
                )}
              </div>

              {/* Opção 2: Upload de arquivo */}
              <div>
                <label className="block text-xs text-white/50 mb-1 flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Opção 2 — Selecione uma imagem do seu dispositivo
                </label>
                <label className={`flex items-center gap-2 cursor-pointer border rounded-lg px-4 py-3 transition-all ${emailImageFile ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white/5 hover:bg-white/10 border-white/20'}`}>
                  <Upload className="w-4 h-4 text-white/60" />
                  <span className="text-sm text-white/60 flex-1">
                    {emailImageUploading ? 'Enviando imagem...' : emailImageFile ? emailImageFile.name : 'Clique para selecionar imagem...'}
                  </span>
                  {emailImageUploading && <Clock className="w-4 h-4 text-blue-400 animate-spin" />}
                  {emailImageStorageUrl && <span className="text-xs text-green-400">✓ Pronto</span>}
                  <input type="file" accept="image/*" className="hidden" onChange={handleEmailImageFile} disabled={!!emailImageUrl} />
                </label>
                {emailImagePreview && emailImageFile && (
                  <div className="mt-2 space-y-1">
                    <img src={emailImagePreview} alt="preview" className="max-h-32 rounded-lg border border-white/20 object-contain" />
                    {emailImageStorageUrl ? (
                      <p className="text-xs text-green-300">✓ Imagem enviada! Será exibida no corpo do e-mail e enviada como anexo.</p>
                    ) : emailImageUploading ? (
                      <p className="text-xs text-blue-300">Enviando imagem para o servidor...</p>
                    ) : (
                      <p className="text-xs text-red-400">Falha no upload. Tente novamente.</p>
                    )}
                    <button
                      onClick={() => { setEmailImageFile(null); setEmailImagePreview(''); setEmailImageStorageUrl(''); }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >✕ Remover imagem</button>
                  </div>
                )}
              </div>
            </div>

            {/* Destinatários */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Destinatários</label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setTargetType('all')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${targetType === 'all' ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <Users className="w-4 h-4" /> Todos ({customers.length})
                </button>
                <button
                  onClick={() => { setTargetType('selected'); setShowCustomerList(true); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${targetType === 'selected' ? 'bg-purple-600/30 border-purple-500/50 text-purple-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
                >
                  <CheckCircle className="w-4 h-4" /> Individual {selectedPhones.length > 0 && `(${selectedPhones.length})`}
                </button>
              </div>

              {targetType === 'selected' && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowCustomerList(!showCustomerList)} className="flex items-center gap-1 text-xs text-white/60 hover:text-white">
                      {showCustomerList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showCustomerList ? 'Ocultar lista' : 'Mostrar lista'}
                    </button>
                    {selectedPhones.length > 0 && (
                      <button onClick={() => setSelectedPhones([])} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 ml-auto">
                        <X className="w-3 h-3" /> Limpar
                      </button>
                    )}
                  </div>
                  {showCustomerList && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          style={{ ...inputStyle, paddingLeft: '28px', fontSize: '13px' }}
                          value={searchCustomer}
                          onChange={e => setSearchCustomer(e.target.value)}
                          placeholder="Buscar por nome ou telefone..."
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredCustomers.map(c => (
                          <label key={c.phone} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedPhones.includes(c.phone)}
                              onChange={() => toggleCustomer(c.phone)}
                              className="w-4 h-4 accent-blue-500"
                            />
                            <span className="text-sm text-white/80 flex-1">{c.name}</span>
                            <span className="text-xs text-white/40 ml-auto">{c.phone}</span>
                          </label>
                        ))}
                        {filteredCustomers.length === 0 && (
                          <p className="text-center text-white/40 text-sm py-3">Nenhum cliente encontrado</p>
                        )}
                      </div>
                    </>
                  )}
                  {selectedPhones.length > 0 && (
                    <p className="text-xs text-blue-300 font-bold">{selectedPhones.length} cliente(s) selecionado(s)</p>
                  )}
                </div>
              )}
            </div>

            {/* Intervalo entre envios */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-blue-300">Intervalo entre envios</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Imediato', value: 0 },
                  { label: '1 min', value: 60 },
                  { label: '2 min', value: 120 },
                  { label: '3 min', value: 180 },
                  { label: '5 min', value: 300 },
                  { label: '10 min', value: 600 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setIntervalSeconds(opt.value)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                      intervalSeconds === opt.value
                        ? 'bg-blue-600/40 border-blue-500/60 text-blue-200'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {intervalSeconds > 0 ? (
                <p className="text-xs text-blue-300/80">
                  ⏱️ 1 e-mail a cada {intervalSeconds >= 60 ? `${Math.ceil(intervalSeconds / 60)} minuto(s)` : `${intervalSeconds}s`}. A fila processa em background — você pode fechar a página.
                </p>
              ) : (
                <p className="text-xs text-white/40">
                  Envio imediato: todos os e-mails de uma vez (risco de cair no spam).
                </p>
              )}
            </div>

            {/* Botão enviar */}
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-base"
            >
              {isSending ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Criando fila de envio...</span>
              ) : intervalSeconds > 0 ? (
                <span className="flex items-center gap-2"><Timer className="w-4 h-4" /> Agendar Envio com Intervalo</span>
              ) : (
                <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> Enviar por E-mail</span>
              )}
            </Button>

            <p className="text-xs text-white/40 text-center">
              Os e-mails serão enviados para clientes com e-mail cadastrado.
            </p>
          </div>
        )}

        {/* Histórico */}
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-base font-bold text-white mb-1"
          >
            <span className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-white/60" /> Histórico de Envios por E-mail ({broadcasts.length})
            </span>
            {showHistory ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>

          {showHistory && (
            <div className="mt-4 space-y-3">
              {broadcasts.length === 0 && (
                <p className="text-center text-white/40 py-6">Nenhum envio registrado ainda</p>
              )}
              {broadcasts.map(b => {
                const typeInfo = getTypeInfo(b.messageType);
                return (
                  <div key={b.id} className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                            {typeInfo.icon} {typeInfo.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            b.status === 'sent' ? 'bg-green-500/20 border-green-500/40 text-green-300'
                            : b.status === 'sending' ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                            : b.status === 'cancelled' ? 'bg-red-500/20 border-red-500/40 text-red-300'
                            : 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                          }`}>
                            {b.status === 'sent' ? `✓ Enviado (${(b as any).emailsSent || b.totalRecipients || 0} e-mails)` 
                            : b.status === 'sending' ? `⏳ Enviando... ${(b as any).emailsSent || 0}/${b.totalRecipients || 0}`
                            : b.status === 'cancelled' ? '❌ Cancelado'
                            : 'Rascunho'}
                          </span>
                          {b.status === 'sending' && (b as any).sendIntervalSeconds > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-500/20 border-purple-500/40 text-purple-300">
                              ⏱️ {Math.ceil((b as any).sendIntervalSeconds / 60)} min/e-mail
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-white mt-1">{b.title}</p>
                        <p className="text-xs text-white/60 mt-0.5 line-clamp-2">{b.message}</p>
                        {b.linkUrl && (
                          <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">{b.linkUrl}</a>
                        )}
                        <p className="text-xs text-white/30 mt-1">
                          {b.targetType === 'all' ? 'Todos os clientes' : 'Selecionados'} •{' '}
                          {b.createdAt ? new Date(b.createdAt).toLocaleString('pt-BR') : ''}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            const text = `${b.message}${b.linkUrl ? `\n\n${b.linkLabel || 'Acesse:'} ${b.linkUrl}` : ''}`;
                            navigator.clipboard.writeText(text);
                            toast.success('Mensagem copiada!');
                          }}
                          className="p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-all"
                          title="Copiar mensagem"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate({ id: b.id })}
                          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
