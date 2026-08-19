import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Save, Globe, CreditCard, Layout, MessageSquare, Star, Clock, LogIn, Upload, Trash2, Eye, EyeOff, Camera, ShieldCheck, Share2, ImageIcon, Plus, CheckCircle2, Circle, Pencil, X, Check, Smartphone, Info, RotateCcw } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { ImageCropModal } from "@/components/ImageCropModal";
import { HomeButtonsManager } from "@/components/HomeButtonsManager";


// Lista de fontes com estilos bem distintos
const FONT_OPTIONS = [
  // ⭐ Destaques recomendados
  { value: "Montserrat Bold", label: "🔹 Montserrat Bold", desc: "Elegante, forte e impactante" },
  { value: "Poppins Bold", label: "🔹 Poppins Bold", desc: "Arredondada, moderna e marcante" },
  // Sans-serif modernas
  { value: "Inter", label: "Inter", desc: "Moderna e legível" },
  { value: "Poppins", label: "Poppins", desc: "Arredondada e amigável" },
  { value: "Roboto", label: "Roboto", desc: "Clássica do Google" },
  { value: "Montserrat", label: "Montserrat", desc: "Elegante e forte" },
  { value: "Nunito", label: "Nunito", desc: "Suave e moderna" },
  { value: "Lato", label: "Lato", desc: "Equilibrada e profissional" },
  { value: "Barlow", label: "Barlow", desc: "Compacta e direta" },
  { value: "Exo 2", label: "Exo 2", desc: "Tecnológica e futurista" },
  { value: "Raleway", label: "Raleway", desc: "Sofisticada e fina" },
  { value: "Ubuntu", label: "Ubuntu", desc: "Humanista e clara" },
  { value: "Mulish", label: "Mulish", desc: "Minimalista e clean" },
  { value: "DM Sans", label: "DM Sans", desc: "Geométrica e neutra" },
  { value: "Outfit", label: "Outfit", desc: "Contemporânea e versátil" },
  { value: "Manrope", label: "Manrope", desc: "Moderna e geométrica" },
  // Display / impacto
  { value: "Oswald", label: "Oswald", desc: "Condensada e impactante" },
  { value: "Bebas Neue", label: "Bebas Neue", desc: "Display em maiúsculas" },
  { value: "Anton", label: "Anton", desc: "Forte e chamativa" },
  { value: "Black Han Sans", label: "Black Han Sans", desc: "Ultra negrito" },
  { value: "Righteous", label: "Righteous", desc: "Retro e estilizada" },
  { value: "Russo One", label: "Russo One", desc: "Grossa e marcante" },
  { value: "Teko", label: "Teko", desc: "Condensada e esportiva" },
  { value: "Fjalla One", label: "Fjalla One", desc: "Impactante e direta" },
  // Serif clássicas
  { value: "Playfair Display", label: "Playfair Display", desc: "Elegante e clássica" },
  { value: "Merriweather", label: "Merriweather", desc: "Legível e sofisticada" },
  { value: "Lora", label: "Lora", desc: "Literária e refinada" },
  { value: "Libre Baskerville", label: "Libre Baskerville", desc: "Tradicional e forte" },
  // Cursivas / manuscritas
  { value: "Dancing Script", label: "Dancing Script", desc: "Cursiva e elegante" },
  { value: "Pacifico", label: "Pacifico", desc: "Manuscrita e descontraída" },
  { value: "Caveat", label: "Caveat", desc: "Escrita à mão" },
  { value: "Satisfy", label: "Satisfy", desc: "Cursiva fluida" },
  // Tecnológicas / especiais
  { value: "Orbitron", label: "Orbitron", desc: "Futurista e tecnológica" },
  { value: "Audiowide", label: "Audiowide", desc: "Sci-fi e digital" },
  { value: "Rajdhani", label: "Rajdhani", desc: "Moderna e angular" },
  { value: "Chakra Petch", label: "Chakra Petch", desc: "Técnica e geométrica" },
  { value: "Oxanium", label: "Oxanium", desc: "Digital e futurista" },
];

export default function AdminSettings() {
  const { data: settings, isLoading } = trpc.settings.getAll.useQuery();
  const utils = trpc.useUtils();
  const updateMut = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas!");
      utils.settings.getAll.invalidate();
    },
    onError: () => toast.error("Erro ao salvar"),
  });
  const uploadLoginImageMut = trpc.uploads.uploadLoginImage.useMutation();
  const uploadGastosLogoMut = trpc.uploads.uploadGastosLogo.useMutation();
  const uploadBotAvatarMut = trpc.uploads.uploadBotAvatar.useMutation();
  const uploadHomeButtonLogoMut = trpc.uploads.uploadHomeButtonLogo.useMutation();

  // === PIX ACCOUNTS ===
  type PixAccount = { id: number; label: string; pixKey: string; pixType: string; pixName: string; pixBank: string; isActive: number; createdAt: Date };
  const { data: pixAccounts = [], refetch: refetchPix } = trpc.pix.list.useQuery();
  const createPixMut = trpc.pix.create.useMutation({ onSuccess: () => { toast.success('Conta PIX criada!'); refetchPix(); setShowNewPixForm(false); setNewPix({ label: '', pixKey: '', pixType: 'TELEFONE', pixName: '', pixBank: '' }); }, onError: () => toast.error('Erro ao criar conta PIX') });
  const updatePixMut = trpc.pix.update.useMutation({ onSuccess: () => { toast.success('Conta PIX atualizada!'); refetchPix(); setEditingPixId(null); }, onError: () => toast.error('Erro ao atualizar') });
  const setActivePixMut = trpc.pix.setActive.useMutation({ onSuccess: () => { toast.success('Conta PIX ativada!'); refetchPix(); }, onError: () => toast.error('Erro ao ativar') });
  const deletePixMut = trpc.pix.delete.useMutation({ onSuccess: () => { toast.success('Conta PIX removida!'); refetchPix(); }, onError: () => toast.error('Erro ao remover') });
  const [showNewPixForm, setShowNewPixForm] = useState(false);
  const [newPix, setNewPix] = useState({ label: '', pixKey: '', pixType: 'TELEFONE', pixName: '', pixBank: '' });
  const [editingPixId, setEditingPixId] = useState<number | null>(null);
  const [editPix, setEditPix] = useState<{ label: string; pixKey: string; pixType: string; pixName: string; pixBank: string }>({ label: '', pixKey: '', pixType: 'TELEFONE', pixName: '', pixBank: '' });

  const [form, setForm] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"page" | "login" | "pix" | "contact" | "features" | "advanced" | "photo" | "security" | "og" | "trackingForm" | "whatsappOrder" | "whatsappLogin" | "apk">("page");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [uploadingApk, setUploadingApk] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const apkInputRef = useRef<HTMLInputElement>(null);
  const handleApkUpload = async () => {
    if (!apkFile) return;
    setUploadingApk(true);
    try {
      const formData = new FormData();
      formData.append('file', apkFile);
      const res = await fetch('/api/upload/apk', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { setApkUrl(data.url); toast.success('APK enviado! Acesse: h2colombiano.com/app'); }
      else toast.error(data.error || 'Erro ao enviar APK');
    } catch { toast.error('Erro ao enviar APK'); }
    finally { setUploadingApk(false); }
  };
  // APK Driver Pro
  const [apkProFile, setApkProFile] = useState<File | null>(null);
  const [uploadingApkPro, setUploadingApkPro] = useState(false);
  const [apkProUrl, setApkProUrl] = useState<string | null>(null);
  const apkProInputRef = useRef<HTMLInputElement>(null);
  const handleApkProUpload = async () => {
    if (!apkProFile) return;
    setUploadingApkPro(true);
    try {
      const formData = new FormData();
      formData.append('file', apkProFile);
      const res = await fetch('/api/upload/apk-pro', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { setApkProUrl(data.url); toast.success('APK Driver Pro enviado! Acesse: h2colombiano.com/app-pro'); }
      else toast.error(data.error || 'Erro ao enviar APK Driver Pro');
    } catch { toast.error('Erro ao enviar APK Driver Pro'); }
    finally { setUploadingApkPro(false); }
  };

  // === PERGUNTAS DE ACOMPANHAMENTO ===
  type TQOption = { label: string; color?: string; blocking?: boolean };
  type TrackingQ = { id: number; text: string; options: string; isActive: number; showOnce: number; sortOrder: number; createdAt: Date };
  const { data: trackingQs = [], refetch: refetchTQ } = trpc.trackingQuestions.list.useQuery();
  const createTQMut = trpc.trackingQuestions.create.useMutation({ onSuccess: () => { toast.success('Pergunta criada!'); refetchTQ(); setShowNewTQ(false); resetNewTQ(); }, onError: () => toast.error('Erro ao criar') });
  const updateTQMut = trpc.trackingQuestions.update.useMutation({ onSuccess: () => { toast.success('Pergunta atualizada!'); refetchTQ(); setEditingTQId(null); }, onError: () => toast.error('Erro ao atualizar') });
  const deleteTQMut = trpc.trackingQuestions.delete.useMutation({ onSuccess: () => { toast.success('Pergunta removida!'); refetchTQ(); }, onError: () => toast.error('Erro ao remover') });
  const toggleTQMut = trpc.trackingQuestions.toggle.useMutation({ onSuccess: () => refetchTQ(), onError: () => toast.error('Erro ao alterar status') });
  const [showNewTQ, setShowNewTQ] = useState(false);
  const [newTQText, setNewTQText] = useState('');
  const [newTQOptions, setNewTQOptions] = useState<TQOption[]>([{ label: '', color: '#22c55e' }, { label: '', color: '#ef4444' }]);
  const [newTQShowOnce, setNewTQShowOnce] = useState(true);
  const [editingTQId, setEditingTQId] = useState<number | null>(null);
  const [editTQText, setEditTQText] = useState('');
  const [editTQOptions, setEditTQOptions] = useState<TQOption[]>([]);
  const [editTQShowOnce, setEditTQShowOnce] = useState(true);
  const TQ_COLORS = ['#22c55e','#ef4444','#f59e0b','#3b82f6','#a855f7','#f97316','#6b7280'];
  const resetNewTQ = () => { setNewTQText(''); setNewTQOptions([{ label: '', color: '#22c55e' }, { label: '', color: '#ef4444' }]); setNewTQShowOnce(true); };
  const startEditTQ = (q: TrackingQ) => { setEditingTQId(q.id); setEditTQText(q.text); try { setEditTQOptions(JSON.parse(q.options)); } catch { setEditTQOptions([]); } setEditTQShowOnce(q.showOnce === 1); };
  const { data: photoModeData, refetch: refetchPhotoMode } = trpc.appSettings.getPhotoMode.useQuery();
  const [photoMode, setPhotoMode] = useState<'camera' | 'gallery' | 'both' | 'disabled'>('both');
  const setPhotoModeMut = trpc.appSettings.setPhotoMode.useMutation({
    onSuccess: () => { toast.success('Configuração de foto salva!'); refetchPhotoMode(); },
    onError: () => toast.error('Erro ao salvar configuração de foto'),
  });
  const [loginImageFile, setLoginImageFile] = useState<File | null>(null);
  const [loginImagePreview, setLoginImagePreview] = useState<string | null>(null);
  const [uploadingLoginImage, setUploadingLoginImage] = useState(false);
  const loginImageInputRef = useRef<HTMLInputElement>(null);
  const [gastosLogoPreview, setGastosLogoPreview] = useState<string | null>(null);
  const [uploadingGastosLogo, setUploadingGastosLogo] = useState(false);
  const gastosLogoInputRef = useRef<HTMLInputElement>(null);
  const [botAvatarPreview, setBotAvatarPreview] = useState<string | null>(null);
  const [uploadingBotAvatar, setUploadingBotAvatar] = useState(false);
  const botAvatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (photoModeData) setPhotoMode(photoModeData.mode);
  }, [photoModeData]);

  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
      if (settings.login_image_url) setLoginImagePreview(settings.login_image_url);
      if (settings.gastos_logo_url) setGastosLogoPreview(settings.gastos_logo_url);
      if (settings.bot_assistant_avatar) setBotAvatarPreview(settings.bot_assistant_avatar);
    }
  }, [settings]);

  // Carrega fonte do Google Fonts dinamicamente para preview
  const loadGoogleFont = (fontName: string) => {
    if (!fontName) return;
    const id = `gfont-${fontName.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700;900&display=swap`;
    document.head.appendChild(link);
  };

  // Carrega todas as fontes configuradas quando o form muda
  useEffect(() => {
    const fontFields = ['home_btn1_font','home_btn2_font','home_btn3_font','home_btn4_font','home_btn5_font','home_font'];
    fontFields.forEach(f => { if (form[f]) loadGoogleFont(form[f]); });
  }, [form.home_btn1_font, form.home_btn2_font, form.home_btn3_font, form.home_btn4_font, form.home_btn5_font, form.home_font]);

  // Formata numero do WhatsApp para garantir que tenha codigo do pais (55)
  const formatWhatsAppNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    // Se nao comeca com 55, adiciona
    if (!digits.startsWith('55')) {
      return '55' + digits;
    }
    return digits;
  };

  const updateField = (key: string, value: string) => {
    // Se for o campo de WhatsApp, formata automaticamente
    if (key === 'whatsapp_number') {
      value = formatWhatsAppNumber(value);
    }
    setForm(prev => ({ ...prev, [key]: value }));
    // Carrega fonte imediatamente ao selecionar
    if (key.endsWith('_font') && value) loadGoogleFont(value);
  };

  const handleHomeButtonLogoSelect = async (buttonKey: 'btn1' | 'btn2', file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Envie uma imagem JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo de 5MB.');
      return;
    }
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadHomeButtonLogoMut.mutateAsync({ imageBase64, mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', target: buttonKey });
      if (!result.url) throw new Error('Upload sem URL');
      updateField(`home_${buttonKey}_logo_url`, result.url);
      toast.success('Logo enviada. Clique em Salvar Configurações para publicar.');
    } catch {
      toast.error('Não foi possível enviar a logo do botão.');
    }
  };

  const toggleField = (key: string) => {
    setForm(prev => ({ ...prev, [key]: prev[key] === "0" ? "1" : "0" }));
  };

  const saveAll = () => {
    updateMut.mutate({ settings: form });
  };

  const handleLoginImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Envie apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5MB."); return; }
    setLoginImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLoginImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    // Upload imediato
    setUploadingLoginImage(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const result = await uploadLoginImageMut.mutateAsync({ imageBase64: base64, mimeType: file.type });
      if (result.url) {
        updateField("login_image_url", result.url);
        toast.success("Imagem enviada!");
      }
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingLoginImage(false);
    }
  };

  const removeLoginImage = () => {
    setLoginImageFile(null);
    setLoginImagePreview(null);
    updateField("login_image_url", "");
    if (loginImageInputRef.current) loginImageInputRef.current.value = "";
  };

  const handleGastosLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Envie apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5MB."); return; }
    const preview = URL.createObjectURL(file);
    setGastosLogoPreview(preview);
    setUploadingGastosLogo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const result = await uploadGastosLogoMut.mutateAsync({ imageBase64: base64, mimeType: file.type });
      if (result.url) {
        updateField("gastos_logo_url", result.url);
        setGastosLogoPreview(result.url);
        toast.success("Logo do Gastos enviado!");
      }
    } catch {
      toast.error("Erro ao enviar logo");
    } finally {
      setUploadingGastosLogo(false);
    }
  };

  const removeGastosLogo = () => {
    setGastosLogoPreview(null);
    updateField("gastos_logo_url", "");
    if (gastosLogoInputRef.current) gastosLogoInputRef.current.value = "";
  };

  const handleBotAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Envie apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5MB."); return; }
    const preview = URL.createObjectURL(file);
    setBotAvatarPreview(preview);
    setUploadingBotAvatar(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const result = await uploadBotAvatarMut.mutateAsync({ imageBase64: base64, mimeType: file.type });
      if (result.url) {
        updateField("bot_assistant_avatar", result.url);
        setBotAvatarPreview(result.url);
        toast.success("Avatar do bot enviado!");
      }
    } catch {
      toast.error("Erro ao enviar avatar");
    } finally {
      setUploadingBotAvatar(false);
      if (botAvatarInputRef.current) botAvatarInputRef.current.value = "";
    }
  };

  const removeBotAvatar = () => {
    setBotAvatarPreview(null);
    updateField("bot_assistant_avatar", "");
    if (botAvatarInputRef.current) botAvatarInputRef.current.value = "";
  };

  if (isLoading) return <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" /></div>;

  const tabs = [
    { id: "page" as const, label: "Página Inicial", icon: Layout },
    { id: "login" as const, label: "Tela de Login", icon: LogIn },
    { id: "pix" as const, label: "PIX", icon: CreditCard },
    { id: "contact" as const, label: "Contato", icon: MessageSquare },
    { id: "features" as const, label: "Destaques", icon: Star },
    { id: "advanced" as const, label: "Avançado", icon: Clock },
    { id: "photo" as const, label: "Foto de Perfil", icon: Camera },
    { id: "security" as const, label: "Segurança", icon: ShieldCheck },
    { id: "og" as const, label: "Compartilhamento", icon: Share2 },
    { id: "trackingForm" as const, label: "Form. Acompanhamento", icon: MessageSquare },
    { id: "whatsappOrder" as const, label: "WhatsApp Pedidos", icon: Smartphone },
    { id: "whatsappLogin" as const, label: "WhatsApp Login", icon: Smartphone },
    { id: "apk" as const, label: "App Android", icon: Smartphone },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <AdminHeader title="Configurações do Site" icon={<Globe className="w-5 h-5" />} rightContent={
        <Button onClick={saveAll} disabled={updateMut.isPending} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 h-auto">
          <Save className="w-3.5 h-3.5 mr-1" /> {updateMut.isPending ? "Salvando..." : "Salvar Tudo"}
        </Button>
      } />

      <div className="max-w-4xl mx-auto p-4">
        {/* Tabs as Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl text-xs font-medium transition-all border-2 ${
                activeTab === tab.id 
                  ? 'bg-purple-600/20 border-purple-500 text-purple-300' 
                  : 'bg-[#111128] border-[#222244] text-gray-400 hover:border-purple-500/50 hover:text-purple-300'
              }`}>
              <tab.icon className="w-5 h-5" />
              <span className="text-center line-clamp-2">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* PAGE TAB */}
        {activeTab === "page" && (
          <div className="space-y-6">
            <Section title="Nome do Site">
              <Field label="Nome" k="site_name" form={form} onChange={updateField} />
            </Section>
            <Section title="Seção Hero (Topo)">
              <Field label="Título Principal (HTML permitido)" k="hero_title" form={form} onChange={updateField} />
              <Field label="Subtítulo" k="hero_subtitle" form={form} onChange={updateField} textarea />
              <Field label="Texto do Botão" k="hero_button_text" form={form} onChange={updateField} />
            </Section>
            <Section title="Vídeo de Fundo">
              <Field label="URL do Vídeo" k="video_url" form={form} onChange={updateField} />
              {form.video_url && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-2">Preview do vídeo:</p>
                  <video key={form.video_url} autoPlay muted loop playsInline className="w-full max-h-48 rounded-lg object-contain bg-black">
                    <source src={form.video_url} type="video/mp4" />
                    <p className="text-red-400 text-xs p-2">Não foi possível carregar o vídeo. Verifique a URL.</p>
                  </video>
                </div>
              )}
            </Section>
            <Section title="Seção de Serviços">
              <Field label="Título da Seção" k="services_title" form={form} onChange={updateField} />
              <Field label="Subtítulo da Seção" k="services_subtitle" form={form} onChange={updateField} />
            </Section>
            <Section title="Rodapé">
              <Field label="Texto do Rodapé" k="footer_text" form={form} onChange={updateField} textarea />
            </Section>
            <Section title="Botões da Página Inicial">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-500">Edite os dois botões principais que aparecem na tela inicial do cliente.</p>
                <button
                  onClick={() => {
                    // Reset para o padrão elegante (DM Sans, sem borda grossa)
                    updateField("home_btn1_text", "FAZER PEDIDO");
                    updateField("home_btn1_subtitle", "Abrir conta Uber, 99 ou InDrive");
                    updateField("home_btn1_color", "#7c3aed");
                    updateField("home_btn1_text_color", "#ffffff");
                    updateField("home_btn1_sub_color", "rgba(255,255,255,0.7)");
                    updateField("home_btn1_font", "");
                    updateField("home_btn1_hover", "scale");
                    updateField("home_btn2_text", "ACOMPANHAR PEDIDO");
                    updateField("home_btn2_subtitle", "Acompanhe o andamento do seu pedido");
                    updateField("home_btn2_color", "#059669");
                    updateField("home_btn2_text_color", "#ffffff");
                    updateField("home_btn2_sub_color", "rgba(255,255,255,0.7)");
                    updateField("home_btn2_font", "");
                    updateField("home_btn2_hover", "scale");
                    updateField("home_font", "DM Sans");
                    setTimeout(() => updateMut.mutate({ settings: form }), 100);
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  ↺ Restaurar Padrão Elegante
                </button>
              </div>
              {/* Botão 1 */}
              <div className="bg-[#0d0d2b] border border-purple-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-purple-300 mb-3">🔵 Botão 1 (ex: FAZER PEDIDO)</p>
                <div className="space-y-3">
                  <Field label="Texto Principal" k="home_btn1_text" form={form} onChange={updateField} placeholder="FAZER PEDIDO" />
                  <Field label="Subtexto (Enter para quebrar linha)" k="home_btn1_subtitle" form={form} onChange={updateField} placeholder="Abrir conta Uber, 99 ou InDrive" textarea />
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">🔗 Link de Destino (URL ou rota)</label>
                    <input
                      type="text"
                      value={form.home_btn1_url || ""}
                      onChange={e => updateField("home_btn1_url", e.target.value)}
                      placeholder="Ex: / ou https://site.com ou /acompanhar"
                      style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Deixe vazio para manter o comportamento padrão (abre formulário de cadastro)</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cor do Botão (fundo)</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={form.home_btn1_color || "#7c3aed"} onChange={e => updateField("home_btn1_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                        <input type="text" value={form.home_btn1_color || "#7c3aed"} onChange={e => updateField("home_btn1_color", e.target.value)} placeholder="#7c3aed" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cor do Texto Principal</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={form.home_btn1_text_color || "#ffffff"} onChange={e => updateField("home_btn1_text_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                        <input type="text" value={form.home_btn1_text_color || "#ffffff"} onChange={e => updateField("home_btn1_text_color", e.target.value)} placeholder="#ffffff" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cor do Subtexto</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={form.home_btn1_sub_color || "#ffffffb3"} onChange={e => updateField("home_btn1_sub_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                        <input type="text" value={form.home_btn1_sub_color || "#ffffffb3"} onChange={e => updateField("home_btn1_sub_color", e.target.value)} placeholder="#ffffffb3" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Fonte do Texto</label>
                    <select value={form.home_btn1_font || ""} onChange={e => updateField("home_btn1_font", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                      <option value="">Padrão do site</option>
                      {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label} — {f.desc}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Efeito Hover</label>
                    <select value={form.home_btn1_hover || "scale"} onChange={e => updateField("home_btn1_hover", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                      <option value="scale">🔍 Zoom (aumenta levemente)</option>
                      <option value="lift">⬆️ Elevar (sobe com sombra)</option>
                      <option value="glow">✨ Brilho (glow colorido)</option>
                      <option value="shake">📳 Vibrar (tremida rápida)</option>
                      <option value="pulse">💓 Pulsar (bate como coração)</option>
                      <option value="bounce">🏀 Quicar (sobe e desce)</option>
                      <option value="rotate">🔄 Girar levemente</option>
                      <option value="darken">🌑 Escurecer (cor mais escura)</option>
                      <option value="none">⛔ Sem efeito</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Logo do botão (opcional)</label>
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-white/10 flex items-center justify-center">
                        {form.home_btn1_logo_url ? <img src={form.home_btn1_logo_url} alt="Logo do botão Fazer Pedido" className="h-full w-full object-cover" /> : <span className="text-xl">📋</span>}
                      </div>
                      <label className="cursor-pointer rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/25">
                        {uploadHomeButtonLogoMut.isPending ? 'Enviando...' : 'Escolher imagem'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadHomeButtonLogoMut.isPending} onChange={e => { void handleHomeButtonLogoSelect('btn1', e.target.files?.[0]); e.currentTarget.value = ''; }} />
                      </label>
                      {form.home_btn1_logo_url && <button type="button" onClick={() => updateField('home_btn1_logo_url', '')} className="text-xs font-bold text-red-300 hover:text-red-200">Remover</button>}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">JPG, PNG ou WEBP; até 5MB. Sem logo, o ícone padrão continua aparecendo.</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Preview:</p>
                    <div className="flex items-center gap-4 rounded-2xl px-5 py-4" style={{ background: form.home_btn1_color || "#7c3aed", fontFamily: form.home_btn1_font ? `'${form.home_btn1_font}', sans-serif` : undefined }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>{form.home_btn1_logo_url ? <img src={form.home_btn1_logo_url} alt="Prévia da logo" className="w-full h-full object-cover" /> : <span className="text-xl">📋</span>}</div>
                      <div className="flex-1">
                        <p className="font-black text-lg tracking-wide" style={{ color: form.home_btn1_text_color || "#ffffff" }}>{form.home_btn1_text || "FAZER PEDIDO"}</p>
                        <p className="text-sm" style={{ color: form.home_btn1_sub_color || "rgba(255,255,255,0.7)" }}>{form.home_btn1_subtitle || "Abrir conta Uber, 99 ou InDrive"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Botão 2 */}
              <div className="bg-[#0d0d2b] border border-purple-500/20 rounded-xl p-4">
                <p className="text-xs font-bold text-purple-300 mb-3">🟢 Botão 2 (ex: ACOMPANHAR)</p>
                <div className="space-y-3">
                  <Field label="Texto Principal" k="home_btn2_text" form={form} onChange={updateField} placeholder="ACOMPANHAR" />
                  <Field label="Subtexto (Enter para quebrar linha)" k="home_btn2_subtitle" form={form} onChange={updateField} placeholder="Ver o status do seu pedido" textarea />
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">🔗 Link de Destino (URL ou rota)</label>
                    <input
                      type="text"
                      value={form.home_btn2_url || ""}
                      onChange={e => updateField("home_btn2_url", e.target.value)}
                      placeholder="Ex: /acompanhar ou https://site.com"
                      style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Deixe vazio para manter o comportamento padrão (abre tela de acompanhar pedido)</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cor do Botão (fundo)</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={form.home_btn2_color || "#059669"} onChange={e => updateField("home_btn2_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                        <input type="text" value={form.home_btn2_color || "#059669"} onChange={e => updateField("home_btn2_color", e.target.value)} placeholder="#059669" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cor do Texto Principal</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={form.home_btn2_text_color || "#ffffff"} onChange={e => updateField("home_btn2_text_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                        <input type="text" value={form.home_btn2_text_color || "#ffffff"} onChange={e => updateField("home_btn2_text_color", e.target.value)} placeholder="#ffffff" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Cor do Subtexto</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={form.home_btn2_sub_color || "#ffffffb3"} onChange={e => updateField("home_btn2_sub_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                        <input type="text" value={form.home_btn2_sub_color || "#ffffffb3"} onChange={e => updateField("home_btn2_sub_color", e.target.value)} placeholder="#ffffffb3" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Fonte do Texto</label>
                    <select value={form.home_btn2_font || ""} onChange={e => updateField("home_btn2_font", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                      <option value="">Padrão do site</option>
                      {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label} — {f.desc}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Efeito Hover</label>
                    <select value={form.home_btn2_hover || "scale"} onChange={e => updateField("home_btn2_hover", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                      <option value="scale">🔍 Zoom (aumenta levemente)</option>
                      <option value="lift">⬆️ Elevar (sobe com sombra)</option>
                      <option value="glow">✨ Brilho (glow colorido)</option>
                      <option value="shake">📳 Vibrar (tremida rápida)</option>
                      <option value="pulse">💓 Pulsar (bate como coração)</option>
                      <option value="bounce">🏀 Quicar (sobe e desce)</option>
                      <option value="rotate">🔄 Girar levemente</option>
                      <option value="darken">🌑 Escurecer (cor mais escura)</option>
                      <option value="none">⛔ Sem efeito</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Logo do botão (opcional)</label>
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-white/10 flex items-center justify-center">
                        {form.home_btn2_logo_url ? <img src={form.home_btn2_logo_url} alt="Logo do botão Acompanhar" className="h-full w-full object-cover" /> : <span className="text-xl">🔍</span>}
                      </div>
                      <label className="cursor-pointer rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/25">
                        {uploadHomeButtonLogoMut.isPending ? 'Enviando...' : 'Escolher imagem'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadHomeButtonLogoMut.isPending} onChange={e => { void handleHomeButtonLogoSelect('btn2', e.target.files?.[0]); e.currentTarget.value = ''; }} />
                      </label>
                      {form.home_btn2_logo_url && <button type="button" onClick={() => updateField('home_btn2_logo_url', '')} className="text-xs font-bold text-red-300 hover:text-red-200">Remover</button>}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">JPG, PNG ou WEBP; até 5MB. Sem logo, o ícone padrão continua aparecendo.</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Preview:</p>
                    <div className="flex items-center gap-4 rounded-2xl px-5 py-4" style={{ background: form.home_btn2_color || "#059669", fontFamily: form.home_btn2_font ? `'${form.home_btn2_font}', sans-serif` : undefined }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>{form.home_btn2_logo_url ? <img src={form.home_btn2_logo_url} alt="Prévia da logo" className="w-full h-full object-cover" /> : <span className="text-xl">🔍</span>}</div>
                      <div className="flex-1">
                        <p className="font-black text-lg tracking-wide" style={{ color: form.home_btn2_text_color || "#ffffff" }}>{form.home_btn2_text || "ACOMPANHAR"}</p>
                        <p className="text-sm" style={{ color: form.home_btn2_sub_color || "rgba(255,255,255,0.7)" }}>{form.home_btn2_subtitle || "Ver o status do seu pedido"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="📌 Botões Rápidos — Hub Central de Acesso">
              <HomeButtonsManager />
            </Section>

            {/*
            BLOCO ANTIGO DE BOTÕES FIXOS - REMOVIDO
            {/* Botão 3 */}
            <div className="bg-[#0d0d2b] border border-amber-500/20 rounded-xl p-4 space-y-3 mb-4" style={{display: 'none'}}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-300">🏆 Botão 3 (ex: SORTEIO)</p>
                  <div
                    onClick={() => updateField("home_btn3_enabled", form.home_btn3_enabled === "1" ? "0" : "1")}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.home_btn3_enabled === "1" ? "bg-amber-500" : "bg-gray-600"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${form.home_btn3_enabled === "1" ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </div>
                <Field label="Texto Principal" k="home_btn3_text" form={form} onChange={updateField} placeholder="SORTEIO" />
                <Field label="Subtexto (Enter para quebrar linha)" k="home_btn3_subtitle" form={form} onChange={updateField} placeholder="Participe do sorteio exclusivo" textarea />
                <Field label="Destino (ex: /sorteio ou https://...)" k="home_btn3_url" form={form} onChange={updateField} placeholder="/sorteio" />
                {form.home_btn3_url && form.home_btn3_url.includes('wa.me') && (
                  <div>
                    <label className="text-xs text-green-400 font-bold block mb-1">💬 Mensagem WhatsApp (texto pré-preenchido)</label>
                    <textarea
                      value={form.home_btn3_wa_msg || ''}
                      onChange={e => updateField('home_btn3_wa_msg', e.target.value)}
                      placeholder="Ex: Olá! Vim pelo botão SORTEIO do site..."
                      rows={3}
                      style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none', resize: 'vertical' }}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Este texto será enviado automaticamente quando o cliente clicar no botão.</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Ícone</label>
                  <select value={form.home_btn3_icon || "trophy"} onChange={e => updateField("home_btn3_icon", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="trophy">🏆 Troféu</option>
                    <option value="gift">🎁 Presente</option>
                    <option value="star">⭐ Estrela</option>
                    <option value="ticket">🎫 Ingresso</option>
                    <option value="bell">🔔 Sino</option>
                    <option value="sparkles">✨ Brilho</option>
                    <option value="search">🔍 Lupa</option>
                    <option value="clipboard">📋 Prancheta</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Botão (fundo)</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn3_color || "#b45309"} onChange={e => updateField("home_btn3_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn3_color || "#b45309"} onChange={e => updateField("home_btn3_color", e.target.value)} placeholder="#b45309" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Texto Principal</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn3_text_color || "#ffffff"} onChange={e => updateField("home_btn3_text_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn3_text_color || "#ffffff"} onChange={e => updateField("home_btn3_text_color", e.target.value)} placeholder="#ffffff" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Subtexto</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn3_sub_color || "#ffffffcc"} onChange={e => updateField("home_btn3_sub_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn3_sub_color || "#ffffffcc"} onChange={e => updateField("home_btn3_sub_color", e.target.value)} placeholder="#ffffffcc" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Fonte do Texto</label>
                  <select value={form.home_btn3_font || ""} onChange={e => updateField("home_btn3_font", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="">Padrão do site</option>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label} — {f.desc}</option>)}
                  </select>
                </div>
                <div>
                <label className="text-xs text-gray-400 block mb-1">Efeito Hover</label>
                <select value={form.home_btn3_hover || "scale"} onChange={e => updateField("home_btn3_hover", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                  <option value="scale">🔍 Zoom (aumenta levemente)</option>
                  <option value="lift">⬆️ Elevar (sobe com sombra)</option>
                  <option value="glow">✨ Brilho (glow colorido)</option>
                  <option value="shake">📳 Vibrar (tremida rápida)</option>
                  <option value="pulse">💓 Pulsar (bate como coração)</option>
                  <option value="bounce">🏀 Quicar (sobe e desce)</option>
                  <option value="rotate">🔄 Girar levemente</option>
                  <option value="darken">🌑 Escurecer (cor mais escura)</option>
                  <option value="none">⛔ Sem efeito</option>
                </select>
                </div>
                <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${form.home_btn3_enabled !== "1" ? "opacity-40" : ""}`} style={{ background: form.home_btn3_color || "#b45309", fontFamily: form.home_btn3_font ? `'${form.home_btn3_font}', sans-serif` : undefined }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}><span className="text-xl">🏆</span></div>
                  <div className="flex-1">
                    <p className="font-black text-lg tracking-wide" style={{ color: form.home_btn3_text_color || "#ffffff" }}>{form.home_btn3_text || "SORTEIO"}</p>
                    <p className="text-sm" style={{ color: form.home_btn3_sub_color || "rgba(255,255,255,0.8)" }}>{form.home_btn3_subtitle || "Participe do sorteio exclusivo"}</p>
                  </div>
                  {form.home_btn3_enabled !== "1" && <span className="text-white/60 text-xs font-bold">DESATIVADO</span>}
                </div>
              </div>

              {/* Botão 4 */}
              <div className="bg-[#0d0d2b] border border-cyan-500/20 rounded-xl p-4 space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-cyan-300">🔔 Botão 4 (ex: NOVIDADES)</p>
                  <div
                    onClick={() => updateField("home_btn4_enabled", form.home_btn4_enabled === "1" ? "0" : "1")}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.home_btn4_enabled === "1" ? "bg-cyan-500" : "bg-gray-600"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${form.home_btn4_enabled === "1" ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </div>
                <Field label="Texto Principal" k="home_btn4_text" form={form} onChange={updateField} placeholder="NOVIDADES" />
                <Field label="Subtexto (Enter para quebrar linha)" k="home_btn4_subtitle" form={form} onChange={updateField} placeholder="Veja nossas promoções" textarea />
                <Field label="Destino (ex: /sorteio ou https://...)" k="home_btn4_url" form={form} onChange={updateField} placeholder="/sorteio" />
                {form.home_btn4_url && form.home_btn4_url.includes('wa.me') && (
                  <div>
                    <label className="text-xs text-green-400 font-bold block mb-1">💬 Mensagem WhatsApp (texto pré-preenchido)</label>
                    <textarea
                      value={form.home_btn4_wa_msg || ''}
                      onChange={e => updateField('home_btn4_wa_msg', e.target.value)}
                      placeholder="Ex: Olá! Vim pelo botão NOVIDADES do site..."
                      rows={3}
                      style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none', resize: 'vertical' }}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Este texto será enviado automaticamente quando o cliente clicar no botão.</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Ícone</label>
                  <select value={form.home_btn4_icon || "bell"} onChange={e => updateField("home_btn4_icon", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="trophy">🏆 Troféu</option>
                    <option value="gift">🎁 Presente</option>
                    <option value="star">⭐ Estrela</option>
                    <option value="ticket">🎫 Ingresso</option>
                    <option value="bell">🔔 Sino</option>
                    <option value="sparkles">✨ Brilho</option>
                    <option value="search">🔍 Lupa</option>
                    <option value="clipboard">📋 Prancheta</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Botão (fundo)</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn4_color || "#0e7490"} onChange={e => updateField("home_btn4_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn4_color || "#0e7490"} onChange={e => updateField("home_btn4_color", e.target.value)} placeholder="#0e7490" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Texto Principal</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn4_text_color || "#ffffff"} onChange={e => updateField("home_btn4_text_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn4_text_color || "#ffffff"} onChange={e => updateField("home_btn4_text_color", e.target.value)} placeholder="#ffffff" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Subtexto</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn4_sub_color || "#ffffffcc"} onChange={e => updateField("home_btn4_sub_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn4_sub_color || "#ffffffcc"} onChange={e => updateField("home_btn4_sub_color", e.target.value)} placeholder="#ffffffcc" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Fonte do Texto</label>
                  <select value={form.home_btn4_font || ""} onChange={e => updateField("home_btn4_font", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="">Padrão do site</option>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label} — {f.desc}</option>)}
                  </select>
                </div>
                <div>
                <label className="text-xs text-gray-400 block mb-1">Efeito Hover</label>
                <select value={form.home_btn4_hover || "scale"} onChange={e => updateField("home_btn4_hover", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                  <option value="scale">🔍 Zoom (aumenta levemente)</option>
                  <option value="lift">⬆️ Elevar (sobe com sombra)</option>
                  <option value="glow">✨ Brilho (glow colorido)</option>
                  <option value="shake">📳 Vibrar (tremida rápida)</option>
                  <option value="pulse">💓 Pulsar (bate como coração)</option>
                  <option value="bounce">🏀 Quicar (sobe e desce)</option>
                  <option value="rotate">🔄 Girar levemente</option>
                  <option value="darken">🌑 Escurecer (cor mais escura)</option>
                  <option value="none">⛔ Sem efeito</option>
                </select>
                </div>
                <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${form.home_btn4_enabled !== "1" ? "opacity-40" : ""}`} style={{ background: form.home_btn4_color || "#0e7490", fontFamily: form.home_btn4_font ? `'${form.home_btn4_font}', sans-serif` : undefined }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}><span className="text-xl">🔔</span></div>
                  <div className="flex-1">
                    <p className="font-black text-lg tracking-wide" style={{ color: form.home_btn4_text_color || "#ffffff" }}>{form.home_btn4_text || "NOVIDADES"}</p>
                    <p className="text-sm" style={{ color: form.home_btn4_sub_color || "rgba(255,255,255,0.8)" }}>{form.home_btn4_subtitle || "Veja nossas promoções"}</p>
                  </div>
                  {form.home_btn4_enabled !== "1" && <span className="text-white/60 text-xs font-bold">DESATIVADO</span>}
                </div>
              </div>

              {/* Botão 5 */}
              <div className="bg-[#0d0d2b] border border-violet-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-violet-300">🎁 Botão 5 (ex: PROMOÇÃO)</p>
                  <div
                    onClick={() => updateField("home_btn5_enabled", form.home_btn5_enabled === "1" ? "0" : "1")}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.home_btn5_enabled === "1" ? "bg-violet-500" : "bg-gray-600"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${form.home_btn5_enabled === "1" ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </div>
                <Field label="Texto Principal" k="home_btn5_text" form={form} onChange={updateField} placeholder="PROMOÇÃO" />
                <Field label="Subtexto (Enter para quebrar linha)" k="home_btn5_subtitle" form={form} onChange={updateField} placeholder="Ofertas especiais para você" textarea />
                <Field label="Destino (ex: /sorteio ou https://...)" k="home_btn5_url" form={form} onChange={updateField} placeholder="/sorteio" />
                {form.home_btn5_url && form.home_btn5_url.includes('wa.me') && (
                  <div>
                    <label className="text-xs text-green-400 font-bold block mb-1">💬 Mensagem WhatsApp (texto pré-preenchido)</label>
                    <textarea
                      value={form.home_btn5_wa_msg || ''}
                      onChange={e => updateField('home_btn5_wa_msg', e.target.value)}
                      placeholder="Ex: Olá! Vim pelo botão PROMOÇÃO do site..."
                      rows={3}
                      style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none', resize: 'vertical' }}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Este texto será enviado automaticamente quando o cliente clicar no botão.</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Ícone</label>
                  <select value={form.home_btn5_icon || "gift"} onChange={e => updateField("home_btn5_icon", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="trophy">🏆 Troféu</option>
                    <option value="gift">🎁 Presente</option>
                    <option value="star">⭐ Estrela</option>
                    <option value="ticket">🎫 Ingresso</option>
                    <option value="bell">🔔 Sino</option>
                    <option value="sparkles">✨ Brilho</option>
                    <option value="search">🔍 Lupa</option>
                    <option value="clipboard">📋 Prancheta</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Botão (fundo)</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn5_color || "#7c3aed"} onChange={e => updateField("home_btn5_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn5_color || "#7c3aed"} onChange={e => updateField("home_btn5_color", e.target.value)} placeholder="#7c3aed" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Texto Principal</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn5_text_color || "#ffffff"} onChange={e => updateField("home_btn5_text_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn5_text_color || "#ffffff"} onChange={e => updateField("home_btn5_text_color", e.target.value)} placeholder="#ffffff" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Cor do Subtexto</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={form.home_btn5_sub_color || "#ffffffcc"} onChange={e => updateField("home_btn5_sub_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <input type="text" value={form.home_btn5_sub_color || "#ffffffcc"} onChange={e => updateField("home_btn5_sub_color", e.target.value)} placeholder="#ffffffcc" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Fonte do Texto</label>
                  <select value={form.home_btn5_font || ""} onChange={e => updateField("home_btn5_font", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="">Padrão do site</option>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label} — {f.desc}</option>)}
                  </select>
                </div>
                <div>
                <label className="text-xs text-gray-400 block mb-1">Efeito Hover</label>
                <select value={form.home_btn5_hover || "scale"} onChange={e => updateField("home_btn5_hover", e.target.value)} style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                  <option value="scale">🔍 Zoom (aumenta levemente)</option>
                  <option value="lift">⬆️ Elevar (sobe com sombra)</option>
                  <option value="glow">✨ Brilho (glow colorido)</option>
                  <option value="shake">📳 Vibrar (tremida rápida)</option>
                  <option value="pulse">💓 Pulsar (bate como coração)</option>
                  <option value="bounce">🏀 Quicar (sobe e desce)</option>
                  <option value="rotate">🔄 Girar levemente</option>
                  <option value="darken">🌑 Escurecer (cor mais escura)</option>
                  <option value="none">⛔ Sem efeito</option>
                </select>
                </div>
                <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${form.home_btn5_enabled !== "1" ? "opacity-40" : ""}`} style={{ background: form.home_btn5_color || "#7c3aed", fontFamily: form.home_btn5_font ? `'${form.home_btn5_font}', sans-serif` : undefined }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}><span className="text-xl">🎁</span></div>
                  <div className="flex-1">
                    <p className="font-black text-lg tracking-wide" style={{ color: form.home_btn5_text_color || "#ffffff" }}>{form.home_btn5_text || "PROMOÇÃO"}</p>
                    <p className="text-sm" style={{ color: form.home_btn5_sub_color || "rgba(255,255,255,0.8)" }}>{form.home_btn5_subtitle || "Ofertas especiais para você"}</p>
                  </div>
                  {form.home_btn5_enabled !== "1" && <span className="text-white/60 text-xs font-bold">DESATIVADO</span>}
                </div>
              </div>
            */

            <Section title="Bot Assistente Colombia">
              <p className="text-xs text-gray-500 mb-3">Quando ativado, clientes logados verão uma tela de escolha e poderão ser guiados pelo bot passo a passo.</p>

              {/* Toggle */}
              <ToggleField label="Ativar Bot" k="bot_assistant_enabled" form={form} onToggle={toggleField} />

              {/* Nome */}
              <Field label="Nome do Bot" k="bot_assistant_name" form={form} onChange={updateField} placeholder="Colombia" />

              {/* Cor do nome */}
              <div className="mb-3">
                <label className="text-xs text-gray-400 block mb-1">Cor do Nome (na tela de escolha)</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.bot_assistant_name_color || '#ffffff'} onChange={e => updateField('bot_assistant_name_color', e.target.value)} className="w-10 h-10 rounded-lg border border-zinc-700 cursor-pointer bg-transparent" />
                  <span className="text-sm font-bold" style={{ color: form.bot_assistant_name_color || '#ffffff' }}>{form.bot_assistant_name || 'Colombia'}</span>
                  <button onClick={() => updateField('bot_assistant_name_color', '#ffffff')} className="text-xs text-zinc-500 hover:text-zinc-300">Resetar</button>
                </div>
              </div>

              {/* Mensagem de boas-vindas */}
              <Field label="Mensagem de Boas-vindas" k="bot_assistant_welcome" form={form} onChange={updateField} placeholder="Olá! Sou o Colombia, seu assistente de pedidos. 👋" textarea />

              {/* Avatar */}
              <div className="mb-3">
                <label className="text-xs text-gray-400 block mb-2">Avatar / Logo do Bot</label>
                {botAvatarPreview || form.bot_assistant_avatar ? (
                  <div className="flex items-center gap-3 mb-2">
                    <img src={botAvatarPreview || form.bot_assistant_avatar} alt="Avatar" className="w-16 h-16 object-cover rounded-full border-2 border-violet-500/50" />
                    <div className="flex flex-col gap-2">
                      <button onClick={() => botAvatarInputRef.current?.click()} disabled={uploadingBotAvatar} className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors">
                        {uploadingBotAvatar ? 'Enviando...' : 'Trocar foto'}
                      </button>
                      <button onClick={removeBotAvatar} className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors">Remover</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => botAvatarInputRef.current?.click()} disabled={uploadingBotAvatar}
                    className="w-full border-2 border-dashed border-violet-500/40 rounded-xl p-4 hover:border-violet-500/70 transition-all flex flex-col items-center gap-2 cursor-pointer">
                    <span className="text-3xl">👤</span>
                    <p className="text-white/70 text-sm">{uploadingBotAvatar ? 'Enviando...' : 'Clique para enviar foto'}</p>
                    <p className="text-zinc-500 text-xs">JPG, PNG ou WEBP — máx. 5MB</p>
                  </button>
                )}
                <input ref={botAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleBotAvatarSelect} />
              </div>

              {/* Textos dos botões */}
              <Field label="Texto Botão Principal" k="bot_btn_primary_text" form={form} onChange={updateField} placeholder="QUERO AJUDA DO COLOMBIA" />
              <Field label="Subtítulo Botão Principal" k="bot_btn_primary_sub" form={form} onChange={updateField} placeholder="Atendimento guiado passo a passo" />
              <Field label="Texto Botão Secundário" k="bot_btn_secondary_text" form={form} onChange={updateField} placeholder="PREFIRO FAZER SOZINHO" />
              <Field label="Subtítulo Botão Secundário" k="bot_btn_secondary_sub" form={form} onChange={updateField} placeholder="Navegar pelo site manualmente" />
            </Section>

            <Section title="Rodapé da Página Inicial">
              <Field label="Texto do Rodapé" k="home_footer_text" form={form} onChange={updateField} placeholder="Motoristas de Uber, 99 e InDrive" />
            </Section>

            <Section title="Bloco Serviços Extras">
              <p className="text-xs text-gray-500 mb-4">Personalize o botão/bloco de Serviços Extras que aparece na página inicial.</p>
              <Field label="Título" k="extras_title" form={form} onChange={updateField} placeholder="🔍 Serviços Extras" />
              <Field label="Descrição" k="extras_desc" form={form} onChange={updateField} placeholder="Consultas e serviços adicionais" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Cor do Fundo (borda/gradiente)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.extras_color || "#ea580c"} onChange={e => updateField("extras_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <input type="text" value={form.extras_color || "#ea580c"} onChange={e => updateField("extras_color", e.target.value)} placeholder="#ea580c" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Cor do Texto</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.extras_text_color || "#ffffff"} onChange={e => updateField("extras_text_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <input type="text" value={form.extras_text_color || "#ffffff"} onChange={e => updateField("extras_text_color", e.target.value)} placeholder="#ffffff" style={{ backgroundColor: '#1a1a3e', color: '#ffffff', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                  </div>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* LOGIN TAB */}
        {activeTab === "login" && (
          <div className="space-y-6">
            {/* Preview */}
            <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
              <h3 className="text-sm font-bold text-purple-400 mb-4">Preview da Tela de Login</h3>
              <div className="bg-[#0a0a1a] rounded-xl p-6 flex flex-col items-center gap-3 max-w-xs mx-auto border border-white/10">
                {form.login_show_image !== "0" && (form.login_image_url || loginImagePreview) && (
                  <img src={loginImagePreview || form.login_image_url} alt="Login" className="w-24 h-24 object-cover rounded-xl shadow-lg" />
                )}
                {form.login_show_title !== "0" && (
                  <p className="text-white font-bold text-xl text-center">{form.login_title || "WALK AJUDA"}</p>
                )}
                {form.login_show_subtitle !== "0" && (
                  <p className="text-white/60 text-sm text-center">{form.login_subtitle || "Acesso Restrito"}</p>
                )}
                <div className="w-full bg-white rounded-xl px-4 py-3 text-gray-400 text-sm text-center mt-2">(11) 99999-9999</div>
                <div className="w-full bg-purple-600 rounded-xl px-4 py-3 text-white text-sm font-bold text-center">CONTINUAR</div>
                {form.login_show_footer !== "0" && (
                  <p className="text-white/40 text-xs text-center">{form.login_footer || "Solicite sua senha de acesso via WhatsApp"}</p>
                )}
              </div>
            </div>

            {/* Textos */}
            <Section title="Textos da Tela de Login">
              <ToggleField label="Exibir Título" k="login_show_title" form={form} onToggle={toggleField} />
              <Field label="Título Principal" k="login_title" form={form} onChange={updateField} placeholder="WALK AJUDA" />
              <ToggleField label="Exibir Subtítulo" k="login_show_subtitle" form={form} onToggle={toggleField} />
              <Field label="Subtítulo" k="login_subtitle" form={form} onChange={updateField} placeholder="Acesso Restrito" />
              <ToggleField label="Exibir Rodapé" k="login_show_footer" form={form} onToggle={toggleField} />
              <Field label="Texto do Rodapé" k="login_footer" form={form} onChange={updateField} placeholder="Solicite sua senha de acesso via WhatsApp" />
            </Section>

            {/* Imagem */}
            <Section title="Imagem de Destaque">
              <ToggleField label="Exibir Imagem" k="login_show_image" form={form} onToggle={toggleField} />
              <div className="mt-3">
                {loginImagePreview || form.login_image_url ? (
                  <div className="flex items-start gap-4">
                    <img src={loginImagePreview || form.login_image_url} alt="Login" className="w-32 h-32 object-cover rounded-xl border border-purple-500/30" />
                    <div className="flex flex-col gap-2">
                      <button onClick={() => loginImageInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded-lg text-sm text-purple-300 transition-all">
                        <Upload className="w-4 h-4" /> Trocar imagem
                      </button>
                      <button onClick={removeLoginImage}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-sm text-red-300 transition-all">
                        <Trash2 className="w-4 h-4" /> Remover imagem
                      </button>
                    </div>
                  </div>
                ) : (
                <button
                  type="button"
                  onClick={() => loginImageInputRef.current?.click()}
                  disabled={uploadingLoginImage}
                  className={`w-full border-2 border-dashed border-purple-500/40 rounded-xl p-6 hover:border-purple-500/70 transition-all flex flex-col items-center gap-2 cursor-pointer ${uploadingLoginImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploadingLoginImage ? (
                    <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
                  ) : (
                    <Upload className="w-8 h-8 text-purple-400" />
                  )}
                  <p className="text-white/80 text-sm font-semibold">{uploadingLoginImage ? "Enviando..." : "Clique para enviar imagem"}</p>
                  <p className="text-white/40 text-xs">JPG, PNG — Máx 5MB</p>
                </button>
                )}
                <input ref={loginImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleLoginImageSelect} />
                {uploadingLoginImage && <p className="text-purple-400 text-xs mt-2 text-center">Enviando imagem...</p>}
              </div>
              <p className="text-xs text-gray-500 mt-2">A imagem aparece acima do título na tela de login. Ideal: quadrada, 200×200px ou maior.</p>
            </Section>

            {/* Logo da Página Gastos */}
            <Section title="Tela de Login — Gastos / Empréstimos">
              <p className="text-xs text-gray-400 mb-3">Personalize a tela de login das páginas /gastos e /emprestimo.</p>
              <div className="space-y-3 mb-4">
                <Field label="Título" k="gastos_title" form={form} onChange={updateField} />
                <Field label="Subtítulo" k="gastos_subtitle" form={form} onChange={updateField} />
                <Field label="Texto do Botão Continuar" k="gastos_button_text" form={form} onChange={updateField} />
                <Field label="Texto do Rodapé" k="gastos_footer_text" form={form} onChange={updateField} />
              </div>
              <div className="mt-3">
                {gastosLogoPreview || form.gastos_logo_url ? (
                  <div className="flex items-start gap-4">
                    <img src={gastosLogoPreview || form.gastos_logo_url} alt="Logo Gastos" className="w-20 h-20 object-contain rounded-xl border border-purple-500/30 bg-[#0a0a1a] p-1" />
                    <div className="flex flex-col gap-2">
                      <button onClick={() => gastosLogoInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded-lg text-sm text-purple-300 transition-all">
                        <Upload className="w-4 h-4" /> Trocar logo
                      </button>
                      <button onClick={removeGastosLogo}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-sm text-red-300 transition-all">
                        <Trash2 className="w-4 h-4" /> Remover logo
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => gastosLogoInputRef.current?.click()}
                    disabled={uploadingGastosLogo}
                    className={`w-full border-2 border-dashed border-purple-500/40 rounded-xl p-6 hover:border-purple-500/70 transition-all flex flex-col items-center gap-2 cursor-pointer ${uploadingGastosLogo ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {uploadingGastosLogo ? (
                      <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
                    ) : (
                      <Upload className="w-8 h-8 text-purple-400" />
                    )}
                    <p className="text-white/80 text-sm font-semibold">{uploadingGastosLogo ? "Enviando..." : "Clique para enviar logo"}</p>
                    <p className="text-white/40 text-xs">JPG, PNG, SVG — Máx 5MB</p>
                  </button>
                )}
                <input ref={gastosLogoInputRef} type="file" accept="image/*" className="hidden" onChange={handleGastosLogoSelect} />
                {uploadingGastosLogo && <p className="text-purple-400 text-xs mt-2 text-center">Enviando logo...</p>}
              </div>
            </Section>
          </div>
        )}

        {/* PIX TAB */}
        {activeTab === "pix" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Contas PIX</h2>
              <Button onClick={() => setShowNewPixForm(v => !v)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 h-auto flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar Conta PIX
              </Button>
            </div>

            {/* Formulário de nova conta */}
            {showNewPixForm && (
              <div className="bg-[#111128] border border-purple-500/40 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-purple-300">Nova Conta PIX</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Nome/Identificação (ex: PicPay, Nubank)</label>
                    <input value={newPix.label} onChange={e => setNewPix(p => ({ ...p, label: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Ex: Conta Principal" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Chave PIX</label>
                    <input value={newPix.pixKey} onChange={e => setNewPix(p => ({ ...p, pixKey: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Chave PIX" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Tipo da Chave</label>
                      <select value={newPix.pixType} onChange={e => setNewPix(p => ({ ...p, pixType: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option>TELEFONE</option><option>CPF</option><option>EMAIL</option><option>ALEATÓRIA</option><option>CNPJ</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Banco</label>
                      <input value={newPix.pixBank} onChange={e => setNewPix(p => ({ ...p, pixBank: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Ex: PicPay" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Nome do Titular</label>
                    <input value={newPix.pixName} onChange={e => setNewPix(p => ({ ...p, pixName: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Nome completo do titular" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={() => createPixMut.mutate(newPix)} disabled={createPixMut.isPending || !newPix.label || !newPix.pixKey || !newPix.pixName} className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-2 h-auto flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> {createPixMut.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button onClick={() => setShowNewPixForm(false)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 py-2 h-auto flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Lista de contas */}
            {(pixAccounts as PixAccount[]).length === 0 && (
              <div className="bg-[#111128] border border-white/10 rounded-xl p-6 text-center text-gray-400 text-sm">
                Nenhuma conta PIX cadastrada. Clique em "Adicionar Conta PIX" para começar.
              </div>
            )}
            {(pixAccounts as PixAccount[]).map((acc: PixAccount) => (
              <div key={acc.id} className={`bg-[#111128] border rounded-xl p-4 space-y-3 transition-all ${acc.isActive === 1 ? 'border-green-500/60' : 'border-white/10'}`}>
                {/* Header do card */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {acc.isActive === 1
                      ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                      : <Circle className="w-5 h-5 text-gray-500" />}
                    <span className="font-semibold text-white text-sm">{acc.label}</span>
                    {acc.isActive === 1 && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">ATIVA</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {acc.isActive !== 1 && (
                      <Button onClick={() => setActivePixMut.mutate({ id: acc.id })} disabled={setActivePixMut.isPending} className="bg-green-600/20 hover:bg-green-600/40 text-green-400 text-xs px-2 py-1 h-auto border border-green-500/30">
                        Ativar
                      </Button>
                    )}
                    <Button onClick={() => { setEditingPixId(acc.id); setEditPix({ label: acc.label, pixKey: acc.pixKey, pixType: acc.pixType, pixName: acc.pixName, pixBank: acc.pixBank }); }} className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs px-2 py-1 h-auto">
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button onClick={() => { if (confirm('Remover esta conta PIX?')) deletePixMut.mutate({ id: acc.id }); }} disabled={deletePixMut.isPending} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-2 py-1 h-auto">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Modo visualização */}
                {editingPixId !== acc.id && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Chave:</span> <span className="text-white font-mono">{acc.pixKey}</span></div>
                    <div><span className="text-gray-500">Tipo:</span> <span className="text-white">{acc.pixType}</span></div>
                    <div><span className="text-gray-500">Titular:</span> <span className="text-white">{acc.pixName}</span></div>
                    <div><span className="text-gray-500">Banco:</span> <span className="text-white">{acc.pixBank || '—'}</span></div>
                  </div>
                )}

                {/* Modo edição */}
                {editingPixId === acc.id && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Nome/Identificação</label>
                        <input value={editPix.label} onChange={e => setEditPix(p => ({ ...p, label: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Chave PIX</label>
                        <input value={editPix.pixKey} onChange={e => setEditPix(p => ({ ...p, pixKey: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
                          <select value={editPix.pixType} onChange={e => setEditPix(p => ({ ...p, pixType: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                            <option>TELEFONE</option><option>CPF</option><option>EMAIL</option><option>ALEATÓRIA</option><option>CNPJ</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Banco</label>
                          <input value={editPix.pixBank} onChange={e => setEditPix(p => ({ ...p, pixBank: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Nome do Titular</label>
                        <input value={editPix.pixName} onChange={e => setEditPix(p => ({ ...p, pixName: e.target.value }))} className="w-full bg-[#1a1a35] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => updatePixMut.mutate({ id: acc.id, ...editPix })} disabled={updatePixMut.isPending} className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-2 h-auto flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> {updatePixMut.isPending ? 'Salvando...' : 'Salvar'}
                      </Button>
                      <Button onClick={() => setEditingPixId(null)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 py-2 h-auto flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CONTACT TAB */}
        {activeTab === "contact" && (
          <div className="space-y-6">
            <Section title="WhatsApp">
              <Field label="Número (com DDI, ex: 5511999999999)" k="whatsapp_number" form={form} onChange={updateField} />
              <Field label="Exibição (ex: (11) 99999-9999)" k="whatsapp_display" form={form} onChange={updateField} />
            </Section>
            <Section title="Email">
              <Field label="Email de Destino dos Pedidos" k="email_to" form={form} onChange={updateField} />
            </Section>
          </div>
        )}

        {/* FEATURES TAB */}
        {activeTab === "features" && (
          <div className="space-y-6">
            <Section title="Destaque 1">
              <Field label="Título" k="feature1_title" form={form} onChange={updateField} />
              <Field label="Descrição" k="feature1_desc" form={form} onChange={updateField} />
            </Section>
            <Section title="Destaque 2">
              <Field label="Título" k="feature2_title" form={form} onChange={updateField} />
              <Field label="Descrição" k="feature2_desc" form={form} onChange={updateField} />
            </Section>
            <Section title="Destaque 3">
              <Field label="Título" k="feature3_title" form={form} onChange={updateField} />
              <Field label="Descrição" k="feature3_desc" form={form} onChange={updateField} />
            </Section>
          </div>
        )}

        {/* ADVANCED TAB */}
        {activeTab === "advanced" && (
          <div className="space-y-6">
            <Section title="Tempo de Senha VIP">
              <Field label="Duração em minutos (padrão: 20)" k="vip_duration_minutes" form={form} onChange={updateField} placeholder="20" />
              <p className="text-xs text-gray-500 mt-1">Tempo que cada senha VIP fica ativa após ser criada.</p>
            </Section>
            <Section title="Imagem de Exemplo">
              <Field label="URL da foto de exemplo para upload" k="example_photo_url" form={form} onChange={updateField} />
            </Section>
          </div>
        )}

        {/* PHOTO TAB */}
        {activeTab === "photo" && (
          <div className="space-y-6">
            <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
              <h3 className="text-sm font-bold text-purple-400 mb-1">Modo de Captura de Foto</h3>
              <p className="text-xs text-gray-400 mb-5">Controle como o cliente pode enviar a foto de rosto obrigatória durante o cadastro.</p>

              <div className="grid grid-cols-1 gap-3">
                {([
                  { value: 'both', label: 'Câmera + Galeria', desc: 'Cliente pode escolher entre tirar foto ou selecionar da galeria (padrão)', icon: '📷🖼️' },
                  { value: 'camera', label: 'Somente Câmera', desc: 'Obriga o cliente a tirar a foto na hora — evita fotos de terceiros', icon: '📷' },
                  { value: 'gallery', label: 'Somente Galeria', desc: 'Cliente seleciona uma foto já existente no celular', icon: '🖼️' },
                  { value: 'disabled', label: 'Desativado', desc: 'O campo de foto não aparece para o cliente durante o cadastro', icon: '🚫' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPhotoMode(opt.value)}
                    className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      photoMode === opt.value
                        ? 'border-purple-500 bg-purple-500/15'
                        : 'border-white/10 bg-white/5 hover:border-white/30'
                    }`}
                  >
                    <span className="text-2xl mt-0.5">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${photoMode === opt.value ? 'text-purple-300' : 'text-white'}`}>{opt.label}</p>
                        {photoMode === opt.value && (
                          <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">ATIVO</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPhotoModeMut.mutate({ mode: photoMode })}
                disabled={setPhotoModeMut.isPending}
                className="mt-5 w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
              >
                {setPhotoModeMut.isPending ? 'Salvando...' : 'Salvar Configuração de Foto'}
              </button>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
              <p className="text-yellow-300 text-sm font-semibold mb-1">⚠️ Aviso sobre foto de rosto</p>
              <p className="text-yellow-200/70 text-xs">Independente do modo escolhido, o cliente sempre verá a mensagem: <strong>"A foto deve ser obrigatoriamente de rosto. Fotos de documentos, paisagens ou outros não serão aceitas."</strong></p>
            </div>
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === "security" && (
          <div className="space-y-6">
            <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
              <h3 className="text-sm font-bold text-purple-400 mb-1">🛡️ Proteção contra DevTools</h3>
              <p className="text-xs text-gray-400 mb-5">Quando ativada, clientes que abrirem o inspetor de elementos (F12) ou modo desenvolvedor serão bloqueados e você receberá uma notificação.</p>
              <div className="grid grid-cols-1 gap-3">
                {([
                  { value: '1', label: 'Proteção ATIVADA', desc: 'Clientes são bloqueados ao abrir DevTools. Você recebe alerta.', icon: '🔒' },
                  { value: '0', label: 'Proteção DESATIVADA', desc: 'DevTools liberado para todos os clientes. Use para gravar tela ou testar.', icon: '🔓' },
                ] as const).map(opt => {
                  const current = form['devtools_protection'] !== '0' ? '1' : '0';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateField('devtools_protection', opt.value)}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        current === opt.value
                          ? opt.value === '1' ? 'border-green-500 bg-green-500/15' : 'border-orange-500 bg-orange-500/15'
                          : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}
                    >
                      <span className="text-2xl mt-0.5">{opt.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold ${
                            current === opt.value
                              ? opt.value === '1' ? 'text-green-300' : 'text-orange-300'
                              : 'text-white'
                          }`}>{opt.label}</p>
                          {current === opt.value && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold text-white ${
                              opt.value === '1' ? 'bg-green-600' : 'bg-orange-600'
                            }`}>ATIVO</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => saveAll()}
                disabled={updateMut.isPending}
                className="mt-5 w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
              >
                {updateMut.isPending ? 'Salvando...' : 'Salvar Configuração de Segurança'}
              </button>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-300 text-sm font-semibold mb-1">ℹ️ Modo ADM na página Acompanhar</p>
              <p className="text-blue-200/70 text-xs">Acesse <strong>/acompanhar?adm=3095</strong> para ativar o modo ADM — libera DevTools e acesso sem PIN independente desta configuração.</p>
            </div>
          </div>
        )}

        {/* OG SETTINGS TAB */}
        {activeTab === "og" && (
          <OgSettingsTab />
        )}

        {/* === ABA: FORMULÁRIO DE ACOMPANHAMENTO === */}
        {activeTab === 'trackingForm' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Perguntas para Clientes</h2>
                <p className="text-xs text-gray-400 mt-0.5">Perguntas que aparecem na tela /acompanhar para o cliente responder</p>
              </div>
              <button onClick={() => setShowNewTQ(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Nova Pergunta
              </button>
            </div>

            {/* Formulário de nova pergunta */}
            {showNewTQ && (
              <div className="bg-[#111128] border border-purple-500/30 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-purple-400">Nova Pergunta</h3>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Texto da Pergunta</label>
                  <input value={newTQText} onChange={e => setNewTQText(e.target.value)} placeholder="Ex: Você tem CNH válida?" className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400">Opções de Resposta</label>
                    <button onClick={() => setNewTQOptions(prev => [...prev, { label: '', color: '#6b7280' }])} className="text-xs text-purple-400 hover:text-purple-300">+ Adicionar opção</button>
                  </div>
                  <div className="space-y-2">
                    {newTQOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={opt.label} onChange={e => setNewTQOptions(prev => prev.map((o, j) => j === i ? { ...o, label: e.target.value } : o))} placeholder={`Opção ${i + 1}`} className="flex-1 bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                        <div className="flex gap-1">
                          {TQ_COLORS.map(c => (
                            <button key={c} onClick={() => setNewTQOptions(prev => prev.map((o, j) => j === i ? { ...o, color: c } : o))} className={`w-5 h-5 rounded-full border-2 transition-all ${opt.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <button onClick={() => setNewTQOptions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 p-1"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="newTQShowOnce" checked={newTQShowOnce} onChange={e => setNewTQShowOnce(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                  <label htmlFor="newTQShowOnce" className="text-sm text-gray-300">Mostrar apenas uma vez por pedido</label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowNewTQ(false); resetNewTQ(); }} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">Cancelar</button>
                  <button onClick={() => createTQMut.mutate({ text: newTQText, options: newTQOptions.filter(o => o.label.trim()), showOnce: newTQShowOnce })} disabled={!newTQText.trim() || newTQOptions.filter(o => o.label.trim()).length < 1 || createTQMut.isPending} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                    {createTQMut.isPending ? 'Salvando...' : 'Criar Pergunta'}
                  </button>
                </div>
              </div>
            )}

            {/* Lista de perguntas */}
            {trackingQs.length === 0 && !showNewTQ && (
              <div className="bg-[#111128] border border-white/10 rounded-xl p-8 text-center">
                <MessageSquare className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Nenhuma pergunta criada ainda.</p>
                <p className="text-gray-500 text-xs mt-1">Clique em "Nova Pergunta" para começar.</p>
              </div>
            )}
            {trackingQs.map((q) => {
              const opts: TQOption[] = (() => { try { return JSON.parse(q.options); } catch { return []; } })();
              const isEditing = editingTQId === q.id;
              return (
                <div key={q.id} className={`bg-[#111128] border rounded-xl p-4 transition-all ${q.isActive ? 'border-purple-500/30' : 'border-white/10 opacity-60'}`}>
                  {isEditing ? (
                    <div className="space-y-3">
                      <input value={editTQText} onChange={e => setEditTQText(e.target.value)} className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                      <div className="space-y-2">
                        {editTQOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input value={opt.label} onChange={e => setEditTQOptions(prev => prev.map((o, j) => j === i ? { ...o, label: e.target.value } : o))} className="flex-1 bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <div className="flex gap-1">
                              {TQ_COLORS.map(c => (
                                <button key={c} onClick={() => setEditTQOptions(prev => prev.map((o, j) => j === i ? { ...o, color: c } : o))} className={`w-5 h-5 rounded-full border-2 transition-all ${opt.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <button onClick={() => setEditTQOptions(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 p-1"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button onClick={() => setEditTQOptions(prev => [...prev, { label: '', color: '#6b7280' }])} className="text-xs text-purple-400 hover:text-purple-300">+ Adicionar opção</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id={`editTQShowOnce-${q.id}`} checked={editTQShowOnce} onChange={e => setEditTQShowOnce(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                        <label htmlFor={`editTQShowOnce-${q.id}`} className="text-sm text-gray-300">Mostrar apenas uma vez por pedido</label>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingTQId(null)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">Cancelar</button>
                        <button onClick={() => updateTQMut.mutate({ id: q.id, text: editTQText, options: editTQOptions.filter(o => o.label.trim()), showOnce: editTQShowOnce })} disabled={updateTQMut.isPending} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">
                          {updateTQMut.isPending ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{q.text}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {opts.map((opt, i) => (
                              <span key={i} className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: opt.color || '#6b7280' }}>{opt.label}</span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">{q.showOnce ? 'Aparece uma vez por pedido' : 'Aparece sempre'} · {q.isActive ? 'Ativa' : 'Inativa'}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleTQMut.mutate({ id: q.id, isActive: !q.isActive })} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${q.isActive ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 'bg-gray-600/20 text-gray-400 hover:bg-gray-600/30'}`}>
                            {q.isActive ? 'Ativa' : 'Inativa'}
                          </button>
                          <button onClick={() => startEditTQ(q)} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm('Excluir esta pergunta?')) deleteTQMut.mutate({ id: q.id }); }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

                {/* === ABA: EDITOR WHATSAPP PEDIDOS === */}
        {activeTab === 'whatsappOrder' && (
          <WhatsappOrderTemplateTab />
        )}
        {/* === ABA: EDITOR WHATSAPP LOGIN === */}
        {activeTab === 'whatsappLogin' && (
          <WhatsappLoginTemplateTab />
        )}
        {activeTab === 'apk' && (
          <div className="space-y-4">
            {/* Upload */}
            <div className="bg-[#111128] border border-white/10 rounded-xl p-5">
              <h2 className="text-base font-bold text-white mb-1">App Android — Colombiano</h2>
              <p className="text-xs text-gray-400 mb-4">Faça upload do .apk para disponibilizar em <strong className="text-purple-400">h2colombiano.com/app</strong></p>
              <div className="flex flex-col gap-3">
                <input ref={apkInputRef} type="file" accept=".apk" className="hidden" onChange={e => setApkFile(e.target.files?.[0] || null)} />
                <button onClick={() => apkInputRef.current?.click()} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white">
                  <Upload className="w-4 h-4 text-purple-400" />
                  {apkFile ? `${apkFile.name} (${(apkFile.size / 1024 / 1024).toFixed(1)} MB)` : 'Selecionar arquivo .apk'}
                </button>
                {apkFile && (
                  <button onClick={handleApkUpload} disabled={uploadingApk} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl px-4 py-3 text-sm font-bold text-white">
                    <Upload className="w-4 h-4" />
                    {uploadingApk ? 'Enviando...' : 'Enviar APK'}
                  </button>
                )}
                {apkUrl && (
                  <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-green-400 font-bold">✅ APK enviado com sucesso!</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a href="/app" target="_blank" className="flex items-center justify-center gap-1 bg-green-700/40 hover:bg-green-700/60 rounded-lg px-3 py-2 text-xs text-green-300 font-medium">Abrir Página</a>
                      <a href="/api/app/download" target="_blank" className="flex items-center justify-center gap-1 bg-blue-700/40 hover:bg-blue-700/60 rounded-lg px-3 py-2 text-xs text-blue-300 font-medium">Testar Download</a>
                      <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/app'); toast.success('Copiado!'); }} className="flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 text-xs text-gray-300">Copiar Link Página</button>
                      <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/api/app/download'); toast.success('Copiado!'); }} className="flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 text-xs text-gray-300">Copiar Link Direto</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Links Colombiano */}
            <div className="bg-[#111128] border border-white/10 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Links — Colombiano</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 w-24 flex-shrink-0">Página pública</span>
                  <span className="text-xs text-purple-300 font-mono flex-1">https://h2colombiano.com/app</span>
                  <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/app'); toast.success('Copiado!'); }} className="text-xs text-gray-400 hover:text-white">Copiar</button>
                </div>
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 w-24 flex-shrink-0">Download direto</span>
                  <span className="text-xs text-blue-300 font-mono flex-1">https://h2colombiano.com/api/app/download</span>
                  <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/api/app/download'); toast.success('Copiado!'); }} className="text-xs text-gray-400 hover:text-white">Copiar</button>
                </div>
              </div>
            </div>

            {/* Upload Driver Pro */}
            <div className="bg-[#111128] border border-blue-500/20 rounded-xl p-5">
              <h2 className="text-base font-bold text-white mb-1">App Android — H2 Driver Pro</h2>
              <p className="text-xs text-gray-400 mb-4">Faça upload do .apk para disponibilizar em <strong className="text-blue-400">h2colombiano.com/app-pro</strong></p>
              <div className="flex flex-col gap-3">
                <input ref={apkProInputRef} type="file" accept=".apk" className="hidden" onChange={e => setApkProFile(e.target.files?.[0] || null)} />
                <button onClick={() => apkProInputRef.current?.click()} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white">
                  <Upload className="w-4 h-4 text-blue-400" />
                  {apkProFile ? `${apkProFile.name} (${(apkProFile.size / 1024 / 1024).toFixed(1)} MB)` : 'Selecionar arquivo .apk'}
                </button>
                {apkProFile && (
                  <button onClick={handleApkProUpload} disabled={uploadingApkPro} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl px-4 py-3 text-sm font-bold text-white">
                    <Upload className="w-4 h-4" />
                    {uploadingApkPro ? 'Enviando...' : 'Enviar APK Driver Pro'}
                  </button>
                )}
                {apkProUrl && (
                  <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-green-400 font-bold">✅ APK Driver Pro enviado com sucesso!</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a href="/app-pro" target="_blank" className="flex items-center justify-center gap-1 bg-green-700/40 hover:bg-green-700/60 rounded-lg px-3 py-2 text-xs text-green-300 font-medium">Abrir Página</a>
                      <a href="/api/app/download-pro" target="_blank" className="flex items-center justify-center gap-1 bg-blue-700/40 hover:bg-blue-700/60 rounded-lg px-3 py-2 text-xs text-blue-300 font-medium">Testar Download</a>
                      <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/app-pro'); toast.success('Copiado!'); }} className="flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 text-xs text-gray-300">Copiar Link Página</button>
                      <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/api/app/download-pro'); toast.success('Copiado!'); }} className="flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 text-xs text-gray-300">Copiar Link Direto</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Links Driver Pro */}
            <div className="bg-[#111128] border border-blue-500/20 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Links — H2 Driver Pro</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 w-24 flex-shrink-0">Página pública</span>
                  <span className="text-xs text-blue-300 font-mono flex-1">https://h2colombiano.com/app-pro</span>
                  <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/app-pro'); toast.success('Copiado!'); }} className="text-xs text-gray-400 hover:text-white">Copiar</button>
                </div>
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 w-24 flex-shrink-0">Download direto</span>
                  <span className="text-xs text-blue-300 font-mono flex-1">https://h2colombiano.com/api/app/download-pro</span>
                  <button onClick={() => { navigator.clipboard.writeText('https://h2colombiano.com/api/app/download-pro'); toast.success('Copiado!'); }} className="text-xs text-gray-400 hover:text-white">Copiar</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Save button at bottom */}
        {activeTab !== 'photo' && activeTab !== 'security' && activeTab !== 'og' && activeTab !== 'trackingForm' && activeTab !== 'whatsappOrder' && activeTab !== 'whatsappLogin' && activeTab !== 'apk' && (
        <div className="mt-8 flex justify-end">
          <Button onClick={saveAll} disabled={updateMut.isPending} className="bg-green-600 hover:bg-green-700 text-white px-8">
            <Save className="w-4 h-4 mr-2" /> {updateMut.isPending ? "Salvando..." : "Salvar Todas as Configurações"}
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
      <h3 className="text-sm font-bold text-purple-400 mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ToggleField({ label, k, form, onToggle }: {
  label: string; k: string; form: Record<string, string>;
  onToggle: (key: string) => void;
}) {
  const isOn = form[k] !== "0";
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-white/80">{label}</span>
      <button type="button" onClick={() => onToggle(k)}
        className={`relative w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-purple-600' : 'bg-gray-600'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isOn ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  );
}

function Field({ label, k, form, onChange, textarea, placeholder }: {
  label: string; k: string; form: Record<string, string>;
  onChange: (key: string, value: string) => void;
  textarea?: boolean; placeholder?: string;
}) {
  const inputStyles: React.CSSProperties = {
    backgroundColor: '#1a1a3e',
    color: '#ffffff',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    width: '100%',
    outline: 'none',
  };

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      {textarea ? (
        <textarea
          value={form[k] || ""}
          onChange={e => onChange(k, e.target.value)}
          placeholder={placeholder}
          style={inputStyles}
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={form[k] || ""}
          onChange={e => onChange(k, e.target.value)}
          placeholder={placeholder}
          style={inputStyles}
        />
      )}
    </div>
  );
}

function OgSettingsTab() {
  const utils = trpc.useUtils();
  const { data: ogData, isLoading } = trpc.ogSettings.get.useQuery();
  const updateMut = trpc.ogSettings.update.useMutation({
    onSuccess: () => { toast.success("Configurações salvas!"); utils.ogSettings.get.invalidate(); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const uploadImageMut = trpc.ogSettings.uploadImage.useMutation({
    onSuccess: (data) => {
      toast.success("✅ Imagem salva com sucesso! A miniatura do WhatsApp foi atualizada.");
      setPreview(data.url);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 4000);
      utils.ogSettings.get.invalidate();
    },
    onError: () => toast.error("Erro ao enviar imagem"),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropMime, setCropMime] = useState<string>("image/jpeg");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ogData) {
      setTitle(ogData.title);
      setDescription(ogData.description);
      setPreview(ogData.imageUrl ?? null);
      if (ogData.imageUrl && ogData.imageUrl.startsWith('http')) setImageUrlInput(ogData.imageUrl);
    }
  }, [ogData]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be selected again
    e.target.value = "";
    if (!file.type.startsWith("image/")) { toast.error("Envie apenas imagens"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 10MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropMime(file.type);
      setCropSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (base64: string, mime: string) => {
    setCropSrc(null);
    // Show preview immediately
    setPreview(`data:${mime};base64,${base64}`);
    uploadImageMut.mutate({ imageBase64: base64, mimeType: mime });
  };

  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {/* Modal de crop */}
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          mimeType={cropMime}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}

      {/* Preview WhatsApp */}
      <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
        <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
          <Share2 className="w-4 h-4" /> Preview — Como aparece no WhatsApp
        </h3>
        <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden max-w-sm">
          {/* Imagem */}
          <div className="relative w-full aspect-video bg-[#0a0a1a] flex items-center justify-center overflow-hidden">
            {uploadImageMut.isPending ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
                <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
                <span className="text-xs text-white/70">Salvando imagem...</span>
              </div>
            ) : null}
            {preview ? (
              <img src={preview} alt="OG preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/20">
                <ImageIcon className="w-10 h-10" />
                <span className="text-xs">Sem imagem</span>
              </div>
            )}
            {uploadSuccess && (
              <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-emerald-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg">
                <span>✅</span> Imagem atualizada com sucesso!
              </div>
            )}
          </div>
          {/* Texto */}
          <div className="p-3 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">walkajuda.com</p>
            <p className="text-sm font-bold text-white line-clamp-2">{title || "WALK AJUDA"}</p>
            <p className="text-xs text-white/60 mt-1 line-clamp-2">{description || "Descrição do site..."}</p>
          </div>
        </div>
      </div>

      {/* Upload de imagem */}
      <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5">
        <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Imagem da Miniatura
        </h3>
        <p className="text-xs text-white/50 mb-3">Recomendado: 1200×630px (proporção 1.91:1). Máximo 10MB. A ferramenta de recorte abre automaticamente após selecionar a imagem.</p>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImageMut.isPending}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {uploadImageMut.isPending ? (
              <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Enviando...</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload Imagem</>
            )}
          </Button>
          {preview && (
            <Button
              variant="outline"
              onClick={() => { setPreview(null); setImageUrlInput(''); updateMut.mutate({ title, description, imageUrl: '' }); }}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 gap-2"
            >
              <Trash2 className="w-4 h-4" /> Remover
            </Button>
          )}
        </div>
        <div className="mt-4">
          <label className="text-xs text-gray-400 block mb-1">Ou cole a URL da imagem diretamente:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrlInput}
              onChange={e => setImageUrlInput(e.target.value)}
              placeholder="https://exemplo.com/imagem.png"
              style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', flex: 1, outline: 'none' }}
            />
            <Button
              onClick={() => { if (imageUrlInput.trim()) { setPreview(imageUrlInput.trim()); updateMut.mutate({ title, description, imageUrl: imageUrlInput.trim() }); } }}
              disabled={!imageUrlInput.trim() || updateMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              Salvar URL
            </Button>
          </div>
        </div>
      </div>

      {/* Título e descrição */}
      <div className="bg-[#111128] border border-purple-500/20 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
          <Globe className="w-4 h-4" /> Título e Descrição
        </h3>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Título (aparece em negrito no WhatsApp)</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
          />
          <p className="text-xs text-white/30 mt-1">{title.length}/200 caracteres</p>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Descrição (aparece abaixo do título)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none', resize: 'vertical' }}
          />
          <p className="text-xs text-white/30 mt-1">{description.length}/500 caracteres</p>
        </div>
        <Button
          onClick={() => updateMut.mutate({ title, description })}
          disabled={updateMut.isPending}
          className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
        >
          <Save className="w-4 h-4" />
          {updateMut.isPending ? "Salvando..." : "Salvar Título e Descrição"}
        </Button>
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <p className="text-xs text-blue-200/80 font-semibold mb-1">⚠️ Importante</p>
        <p className="text-xs text-blue-200/60">O WhatsApp faz cache das miniaturas. Após alterar, pode levar algumas horas para atualizar em conversas existentes. Links novos mostram a imagem imediatamente.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR DE TEMPLATE — MENSAGEM WHATSAPP DE PEDIDOS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WA_ORDER_TEMPLATE = `*Walk Ajuda* — Atualização de Pedido

Olá, *{nome}*! 👋

*Status:* ✅ {status}

{descricao_status}

*Detalhes do pedido:*
• Cadastro: *{cadastro}*
• Pedido: *{pedido}*
• Serviço: {servico}
• Cidade: {cidade}

Acompanhe seu pedido em:
https://walkajuda.com/acompanhar

🔐 *Senha de acesso:* {senha}
⚠️ _Não compartilhe esta senha com ninguém para evitar bloqueios de acesso._`;

// Variáveis disponíveis com descrição completa
const WA_ORDER_VARS = [
  {
    group: "👤 Cliente",
    color: "#22c55e",
    vars: [
      { label: "{nome}", value: "{nome}", desc: "Nome completo do cliente (ex: FERNANDO AGOSTINHO)" },
      { label: "{cadastro}", value: "{cadastro}", desc: "Número do cadastro com asterisco (ex: *317)" },
      { label: "{pedido}", value: "{pedido}", desc: "Número do pedido com # (ex: #4000000)" },
      { label: "{cidade}", value: "{cidade}", desc: "Cidade e estado do cliente (ex: SÃO PAULO — SP)" },
      { label: "{senha}", value: "{senha}", desc: "Senha de acesso (4 últimos dígitos do telefone)" },
    ],
  },
  {
    group: "📋 Pedido",
    color: "#a855f7",
    vars: [
      { label: "{status}", value: "{status}", desc: "Nome do status atual (ex: AGENDAMENTO P/ FOTO PENDENTE)" },
      { label: "{descricao_status}", value: "{descricao_status}", desc: "Texto completo da descrição do status configurada no painel" },
      { label: "{servico}", value: "{servico}", desc: "Serviço e opção escolhida (ex: UBER APP — NOME ALEATORIO)" },
      { label: "{previsao}", value: "{previsao}", desc: "Data de previsão de entrega (se definida)" },
    ],
  },
  {
    group: "📅 Data",
    color: "#f59e0b",
    vars: [
      { label: "{DIA}", value: "{DIA}", desc: "Dia atual com 2 dígitos (ex: 16)" },
      { label: "{MES}", value: "{MES}", desc: "Mês atual com 2 dígitos (ex: 07)" },
      { label: "{ANO}", value: "{ANO}", desc: "Ano atual com 4 dígitos (ex: 2026)" },
    ],
  },
  {
    group: "💬 Observação",
    color: "#3b82f6",
    vars: [
      { label: "{observacao}", value: "{observacao}", desc: "Observação manual digitada pelo admin antes de enviar (campo abaixo do status)" },
    ],
  },
];

// SmartTextarea local (mesmo padrão do AdminSchedule)
function WaSmartTextarea({
  value, onChange, rows = 10, placeholder,
}: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insertVar = (v: string) => {
    const el = ref.current;
    if (!el) { onChange(value + v); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + v + value.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length); });
  };
  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-[#0d0d1f] border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/15 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all resize-none leading-relaxed font-mono"
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-white/20">Clique em uma variável abaixo para inserir no cursor</span>
        <span className="text-[10px] text-white/20">{value.length} caracteres</span>
      </div>
    </div>
  );
}

// Preview simulado da mensagem no estilo WhatsApp
function WaPreview({ template }: { template: string }) {
  const preview = template
    .replace(/\{nome\}/gi, "FERNANDO AGOSTINHO")
    .replace(/\{status\}/gi, "AGENDAMENTO P/ FOTO PENDENTE")
    .replace(/\{descricao_status\}/gi, "📸 AGENDAMENTO DISPONÍVEL\n\n✅ A foto será realizada ao vivo no horário agendado.\n\n✅ Aparelho de trabalho preparado\n✅ Hard Reset concluído")
    .replace(/\{cadastro\}/gi, "*317")
    .replace(/\{pedido\}/gi, "#4000000")
    .replace(/\{servico\}/gi, "UBER APP — NOME ALEATORIO")
    .replace(/\{cidade\}/gi, "SÃO PAULO — SP")
    .replace(/\{senha\}/gi, "2954")
    .replace(/\{previsao\}/gi, "20/07/2026")
    .replace(/\{observacao\}/gi, "")
    .replace(/\{DIA\}/g, String(new Date().getDate()).padStart(2, "0"))
    .replace(/\{MES\}/g, String(new Date().getMonth() + 1).padStart(2, "0"))
    .replace(/\{ANO\}/g, String(new Date().getFullYear()));

  return (
    <div className="bg-[#0b141a] rounded-2xl p-4 border border-white/10">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold">W</div>
        <div>
          <p className="text-xs font-bold text-white">Walk Ajuda</p>
          <p className="text-[10px] text-green-400">online</p>
        </div>
      </div>
      <div className="bg-[#1f2c34] rounded-xl rounded-tl-none px-4 py-3 max-w-xs ml-2 shadow-md">
        <pre className="text-xs text-white/90 whitespace-pre-wrap font-sans leading-relaxed">{preview || "(mensagem vazia)"}</pre>
        <p className="text-[10px] text-white/30 text-right mt-2">agora ✓✓</p>
      </div>
    </div>
  );
}

function WhatsappOrderTemplateTab() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.getWhatsappOrderTemplate.useQuery();
  const saveMut = trpc.settings.saveWhatsappOrderTemplate.useMutation({
    onSuccess: () => { toast.success("✅ Template salvo com sucesso!"); utils.settings.getWhatsappOrderTemplate.invalidate(); },
    onError: () => toast.error("Erro ao salvar template"),
  });

  const [template, setTemplate] = useState(DEFAULT_WA_ORDER_TEMPLATE);
  const [showPreview, setShowPreview] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>("👤 Cliente");

  useEffect(() => {
    if (data?.template) setTemplate(data.template);
  }, [data?.template]);

  const handleReset = () => {
    if (confirm("Restaurar a mensagem padrão? Isso apagará suas alterações.")) {
      setTemplate(DEFAULT_WA_ORDER_TEMPLATE);
    }
  };

  const insertVar = (v: string) => {
    setTemplate(prev => prev + v);
  };

  if (isLoading) return <div className="text-center py-12 text-white/40">Carregando...</div>;

  return (
    <div className="space-y-6">

      {/* Cabeçalho explicativo */}
      <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-green-300 mb-1">Editor de Mensagem WhatsApp — Atualização de Pedido</h2>
            <p className="text-xs text-green-200/60 leading-relaxed">
              Esta é a mensagem enviada quando você clica em <strong className="text-green-300">"Notificar via WhatsApp"</strong> na aba de Pedidos.
              Use as <strong className="text-green-300">variáveis</strong> abaixo para personalizar o texto — elas são substituídas automaticamente pelos dados reais do cliente no momento do envio.
            </p>
          </div>
        </div>
      </div>

      {/* Layout: Editor + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* COLUNA ESQUERDA — Editor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Pencil className="w-4 h-4 text-purple-400" /> Texto da Mensagem
            </h3>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar padrão
            </button>
          </div>
          <WaSmartTextarea
            value={template}
            onChange={setTemplate}
            rows={18}
            placeholder="Digite a mensagem aqui..."
          />
        </div>

        {/* COLUNA DIREITA — Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-green-400" /> Preview (dados de exemplo)
            </h3>
            <button
              onClick={() => setShowPreview(p => !p)}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              {showPreview ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {showPreview && <WaPreview template={template} />}
        </div>
      </div>

      {/* SEÇÃO DE VARIÁVEIS */}
      <div className="bg-[#111128] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" /> Variáveis Disponíveis
          </h3>
          <p className="text-xs text-white/40 mt-1">Clique em qualquer variável para inserir no final da mensagem, ou posicione o cursor no texto e clique.</p>
        </div>

        {WA_ORDER_VARS.map(group => (
          <div key={group.group} className="border-b border-white/5 last:border-0">
            <button
              onClick={() => setExpandedGroup(expandedGroup === group.group ? null : group.group)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-bold" style={{ color: group.color }}>{group.group}</span>
              <span className="text-white/30 text-xs">{expandedGroup === group.group ? "▲" : "▼"}</span>
            </button>

            {expandedGroup === group.group && (
              <div className="px-5 pb-4 space-y-2">
                {group.vars.map(v => (
                  <div key={v.value} className="flex items-start gap-3 p-3 rounded-lg bg-white/3 hover:bg-white/6 transition-colors">
                    <button
                      onClick={() => insertVar(v.value)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: `${group.color}15`,
                        borderColor: `${group.color}40`,
                        color: group.color,
                      }}
                    >
                      <span className="opacity-60">+</span> {v.label}
                    </button>
                    <p className="text-xs text-white/50 leading-relaxed pt-0.5">{v.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* DICAS DE FORMATAÇÃO */}
      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-5">
        <h4 className="text-xs font-bold text-yellow-300 mb-3 flex items-center gap-2">
          <Info className="w-4 h-4" /> Dicas de Formatação WhatsApp
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { fmt: "*texto*", result: "Negrito", example: "*Walk Ajuda*" },
            { fmt: "_texto_", result: "Itálico", example: "_Não compartilhe_" },
            { fmt: "~texto~", result: "Tachado", example: "~cancelado~" },
            { fmt: "```texto```", result: "Código/Monospace", example: "```#4000000```" },
            { fmt: "Linha em branco", result: "Parágrafo separado", example: "(pressione Enter 2x)" },
            { fmt: "• item", result: "Lista com ponto", example: "• Cadastro: *317" },
          ].map(d => (
            <div key={d.fmt} className="flex items-start gap-2 text-xs">
              <code className="bg-white/10 px-1.5 py-0.5 rounded text-yellow-200 font-mono shrink-0">{d.fmt}</code>
              <span className="text-white/50">→ <strong className="text-white/70">{d.result}</strong> — ex: <span className="text-white/40 italic">{d.example}</span></span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTÃO SALVAR */}
      <button
        onClick={() => saveMut.mutate({ template })}
        disabled={saveMut.isPending}
        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 active:scale-[0.98] px-4 py-4 rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-lg shadow-green-900/30 text-white"
      >
        <Save className="w-4 h-4" />
        {saveMut.isPending ? "Salvando..." : "Salvar Template da Mensagem"}
      </button>
    </div>
  );
}

// ============================================================
// TEMPLATE PADRÃO — MENSAGEM WHATSAPP DE DADOS DE LOGIN
// ============================================================
const DEFAULT_WA_LOGIN_TEMPLATE = `🔐 Seus dados de acesso estão prontos!

Olá, {nome}!

Seu pedido já foi liberado.

⚠️ IMPORTANTE: Os dados de acesso não são enviados por mensagem. Eles devem ser resgatados exclusivamente através do site abaixo:

🌐 https://walkajuda.com/acompanhar

🔐 *Senha de acesso:* {senha}
⚠️ _Não compartilhe esta senha com ninguém para evitar bloqueios de acesso._

Para resgatar seus dados:

✅ Acesse o site
✅ Informe seu telefone e a senha de 4 dígitos
✅ Os dados de acesso serão exibidos na página do seu pedido

❌ Não tente acessar diretamente pelo aplicativo
❌ Os dados não são fornecidos por WhatsApp

🔒 Por segurança, o resgate dos dados é realizado somente pela área do cliente.

Equipe Walk Ajuda`;

const WA_LOGIN_VARS = [
  {
    group: "👤 Cliente",
    color: "#22c55e",
    vars: [
      { label: "{nome}", value: "{nome}", desc: "Nome completo do cliente (ex: DIEGO DO NASCIMENTO)" },
      { label: "{senha}", value: "{senha}", desc: "Senha de acesso de 4 dígitos do cliente" },
      { label: "{telefone}", value: "{telefone}", desc: "Telefone do cliente" },
    ],
  },
  {
    group: "📅 Data",
    color: "#f59e0b",
    vars: [
      { label: "{DIA}", value: "{DIA}", desc: "Dia atual com 2 dígitos (ex: 16)" },
      { label: "{MES}", value: "{MES}", desc: "Mês atual com 2 dígitos (ex: 07)" },
      { label: "{ANO}", value: "{ANO}", desc: "Ano atual com 4 dígitos (ex: 2026)" },
    ],
  },
];

function WhatsappLoginTemplateTab() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.getWhatsappLoginTemplate.useQuery();
  const saveMut = trpc.settings.saveWhatsappLoginTemplate.useMutation({
    onSuccess: () => { toast.success("✅ Template de login salvo com sucesso!"); utils.settings.getWhatsappLoginTemplate.invalidate(); },
    onError: () => toast.error("Erro ao salvar template"),
  });
  const [template, setTemplate] = useState(DEFAULT_WA_LOGIN_TEMPLATE);
  const [showPreview, setShowPreview] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>("👤 Cliente");

  useEffect(() => {
    if (data?.template) setTemplate(data.template);
  }, [data?.template]);

  const handleReset = () => {
    if (confirm("Restaurar a mensagem padrão? Isso apagará suas alterações.")) {
      setTemplate(DEFAULT_WA_LOGIN_TEMPLATE);
    }
  };

  if (isLoading) return <div className="text-center py-12 text-white/40">Carregando...</div>;

  // Preview com dados de exemplo
  const previewText = template
    .replace(/\{nome\}/g, "DIEGO DO NASCIMENTO")
    .replace(/\{senha\}/g, "4653")
    .replace(/\{telefone\}/g, "(11) 94653-1234")
    .replace(/\{DIA\}/g, String(new Date().getDate()).padStart(2, '0'))
    .replace(/\{MES\}/g, String(new Date().getMonth() + 1).padStart(2, '0'))
    .replace(/\{ANO\}/g, String(new Date().getFullYear()));

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-green-300 mb-1">Editor de Mensagem WhatsApp — Dados de Login</h2>
            <p className="text-xs text-green-200/60 leading-relaxed">
              Esta é a mensagem enviada quando você clica em <strong className="text-green-300">"WhatsApp"</strong> na seção de <strong className="text-green-300">Dados de Login</strong> de um pedido.
              Use as variáveis abaixo para personalizar o texto — elas são substituídas automaticamente pelos dados reais do cliente.
            </p>
          </div>
        </div>
      </div>

      {/* Layout: Editor + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLUNA ESQUERDA — Editor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Pencil className="w-4 h-4 text-purple-400" /> Texto da Mensagem
            </h3>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar padrão
            </button>
          </div>
          <WaSmartTextarea
            value={template}
            onChange={setTemplate}
            rows={18}
            placeholder="Digite a mensagem aqui..."
          />
        </div>

        {/* COLUNA DIREITA — Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-green-400" /> Preview (dados de exemplo)
            </h3>
            <button
              onClick={() => setShowPreview(p => !p)}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              {showPreview ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {showPreview && (
            <div className="bg-[#0b141a] rounded-2xl p-4 border border-white/10 max-h-[480px] overflow-y-auto">
              <div className="bg-[#202c33] rounded-xl rounded-tl-none px-4 py-3 max-w-xs shadow-md">
                <pre className="text-[13px] text-[#e9edef] whitespace-pre-wrap font-sans leading-relaxed">{previewText}</pre>
                <p className="text-[10px] text-[#8696a0] text-right mt-1">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO DE VARIÁVEIS */}
      <div className="bg-[#111128] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" /> Variáveis Disponíveis
          </h3>
          <p className="text-xs text-white/40 mt-1">Clique em qualquer variável para inserir no final da mensagem.</p>
        </div>
        {WA_LOGIN_VARS.map(group => (
          <div key={group.group} className="border-b border-white/5 last:border-0">
            <button
              onClick={() => setExpandedGroup(expandedGroup === group.group ? null : group.group)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-bold" style={{ color: group.color }}>{group.group}</span>
              <span className="text-white/30 text-xs">{expandedGroup === group.group ? "▲" : "▼"}</span>
            </button>
            {expandedGroup === group.group && (
              <div className="px-5 pb-4 space-y-2">
                {group.vars.map(v => (
                  <button
                    key={v.value}
                    onClick={() => setTemplate(prev => prev + v.value)}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
                  >
                    <code className="text-xs font-mono shrink-0 mt-0.5 px-1.5 py-0.5 rounded" style={{ backgroundColor: group.color + '22', color: group.color }}>{v.label}</code>
                    <span className="text-xs text-white/50 leading-relaxed">{v.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* BOTÃO SALVAR */}
      <button
        onClick={() => saveMut.mutate({ template })}
        disabled={saveMut.isPending}
        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 active:scale-[0.98] px-4 py-4 rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-lg shadow-green-900/30 text-white"
      >
        <Save className="w-4 h-4" />
        {saveMut.isPending ? "Salvando..." : "Salvar Template da Mensagem de Login"}
      </button>
    </div>
  );
}
