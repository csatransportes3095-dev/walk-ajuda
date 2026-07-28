import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  User, Phone, Mail, MapPin, UserCheck, FileText,
  Package, Clock, FileCheck, Zap, XCircle, DollarSign, CheckCircle2,
  Send, ChevronDown, Wrench, Star, AlertCircle, Info, Camera, UserPlus,
  ClipboardList, Image as ImageIcon, X, ArrowLeft, Plus, Trash2, ShoppingCart,
  PartyPopper, Hash, ExternalLink,
} from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const ICON_MAP: Record<string, React.ReactNode> = {
  Clock: <Clock className="w-4 h-4" />,
  Package: <Package className="w-4 h-4" />,
  DollarSign: <DollarSign className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  FileCheck: <FileCheck className="w-4 h-4" />,
  XCircle: <XCircle className="w-4 h-4" />,
  Wrench: <Wrench className="w-4 h-4" />,
  CheckCircle2: <CheckCircle2 className="w-4 h-4" />,
  Star: <Star className="w-4 h-4" />,
  AlertCircle: <AlertCircle className="w-4 h-4" />,
  Info: <Info className="w-4 h-4" />,
};

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const inputClass = "w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors";
const labelClass = "block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide";

function SectionCard({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-bold">{title}</h2>
        {badge && <span className="ml-auto text-xs text-muted-foreground">{badge}</span>}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

type CartItem = {
  id: string;
  productId: number | null;
  optionId: number | null;
  questionAnswers: Record<number, string>;
};

function parsePrice(price: string | undefined | null): number {
  if (!price) return 0;
  const num = parseFloat(price.replace("R$ ", "").replace(".", "").replace(",", "."));
  return isNaN(num) ? 0 : num;
}

export default function AdminNewOrder() {
  const [, navigate] = useLocation();
  const { isAdmin, isLoading: authLoading } = useAdminAuth();

  // Modo: "order" = novo pedido, "client" = cadastrar cliente apenas
  const [mode, setMode] = useState<"order" | "client">("order");

  const statusTypesQuery = trpc.statusTypes.list.useQuery();
  const dynamicStatuses = (statusTypesQuery.data ?? []).filter(s => s.isActive === 1).sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultStatus = dynamicStatuses[0]?.key ?? "recebido";

  const [form, setForm] = useState({
    name: "", phone: "", email: "", city: "", uf: "",
    referredBy: "", referredByPhone: "", status: defaultStatus, note: "",
  });

  // Lista de itens do carrinho (múltiplos produtos)
  const [cartItems, setCartItems] = useState<CartItem[]>([
    { id: crypto.randomUUID(), productId: null, optionId: null, questionAnswers: {} },
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [successOrders, setSuccessOrders] = useState<{ serviceName?: string; serviceOption?: string; orderNumber?: number }[]>([]);
  const [customerFound, setCustomerFound] = useState<boolean | null>(null);
  const [phoneSearch, setPhoneSearch] = useState("");

  // Foto de perfil
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const customerQuery = trpc.customers.checkByPhone.useQuery(
    { phone: phoneSearch },
    { enabled: phoneSearch.length >= 10 }
  );

  // Documentos existentes do cliente para reutilizar no novo pedido
  const customerFilesQuery = trpc.orderStatus.getFilesByPhone.useQuery(
    { phone: phoneSearch },
    { enabled: phoneSearch.length >= 10, staleTime: 0 }
  );
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(new Set());
  const [showCustomerDocs, setShowCustomerDocs] = useState(false);
  const reuseFileMutNewOrder = trpc.orderStatus.reuseFile.useMutation();

  useEffect(() => {
    if (!customerQuery.data) return;
    if (customerQuery.data.exists && customerQuery.data.customer) {
      const c = customerQuery.data.customer;
      setForm(prev => ({
        ...prev,
        name: c.name || prev.name,
        email: c.email || prev.email,
        city: c.city || prev.city,
        uf: c.uf || prev.uf,
        referredBy: c.referredBy || prev.referredBy,
        referredByPhone: c.referredByPhone ? formatPhoneDisplay(c.referredByPhone) : prev.referredByPhone,
      }));
      setExistingPhotoUrl((c as { profilePhotoUrl?: string }).profilePhotoUrl || null);
      setCustomerFound(true);
    } else if (phoneSearch.length >= 10) {
      setExistingPhotoUrl(null);
      setCustomerFound(false);
    }
  }, [customerQuery.data, phoneSearch]);

  useEffect(() => {
    if (dynamicStatuses.length > 0 && form.status === "recebido") {
      setForm(prev => ({ ...prev, status: dynamicStatuses[0].key }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicStatuses.length]);

  const productsQuery = trpc.products.listActive.useQuery();
  const products = productsQuery.data || [];

  const uploadPhotoMutation = trpc.customers.uploadProfilePhoto.useMutation();

  const attachSelectedDocs = async (registrationId: number, phone: string) => {
    if (selectedFileIds.size === 0) return;
    const files = customerFilesQuery.data ?? [];
    const toAttach = files.filter(f => selectedFileIds.has(f.id));
    for (const f of toAttach) {
      try {
        await reuseFileMutNewOrder.mutateAsync({
          sourceFileId: f.id,
          targetRegistrationId: registrationId,
          targetCustomerPhone: phone,
          label: f.label,
          fromAdmin: 0,
        });
      } catch { /* ignora erros individuais */ }
    }
    if (toAttach.length > 0) toast.success(`${toAttach.length} documento(s) anexado(s) ao pedido!`);
  };

  const createMutation = trpc.orderStatus.createManualOrder.useMutation({
    onSuccess: async (data) => {
      const orderInfo = data as { orderNumber?: number; serviceName?: string; serviceOption?: string; registrationId?: number };
      setSuccessOrders([{ serviceName: orderInfo.serviceName, serviceOption: orderInfo.serviceOption, orderNumber: orderInfo.orderNumber }]);
      if (orderInfo.registrationId) {
        await attachSelectedDocs(orderInfo.registrationId, form.phone.replace(/\D/g, ''));
      }
      setSuccess(true); setSuccessCount(1);
    },
    onError: (err) => { toast.error(`Erro ao criar pedido: ${err.message}`); },
  });

  const createMultipleMutation = trpc.orderStatus.createManualOrderMultiple.useMutation({
    onSuccess: async (data) => {
      const orders = (data as unknown as { count: number; registrationId?: number; orders?: { serviceName?: string; serviceOption?: string; orderNumber?: number }[] }).orders ?? [];
      setSuccessOrders(orders);
      const d = data as unknown as { count: number; registrationId?: number };
      if (d.registrationId) {
        await attachSelectedDocs(d.registrationId, form.phone.replace(/\D/g, ''));
      }
      setSuccess(true); setSuccessCount(d.count);
    },
    onError: (err) => { toast.error(`Erro ao criar pedidos: ${err.message}`); },
  });

  const createClientMutation = trpc.orderStatus.createManualOrder.useMutation({
    onSuccess: () => { setSuccessOrders([]); setSuccess(true); setSuccessCount(0); },
    onError: (err) => { toast.error(`Erro ao cadastrar cliente: ${err.message}`); },
  });

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
    </div>
  );
  if (!isAdmin) return null;

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const formatPhoneDisplay = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    return raw;
  };

  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    return raw;
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Foto muito grande (máx. 10MB)"); return; }
    setProfilePhoto(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProfilePhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Helpers para manipular cartItems
  const addCartItem = () => {
    setCartItems(prev => [...prev, { id: crypto.randomUUID(), productId: null, optionId: null, questionAnswers: {} }]);
  };

  const removeCartItem = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    setCartItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // Calcular total automático
  const cartTotal = cartItems.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    const option = product?.options.find(o => o.id === item.optionId);
    return sum + parsePrice(option?.price);
  }, 0);

  const hasTotal = cartTotal > 0;

  const validate = (requireProduct = false) => {
    const errs: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = "Nome deve ter pelo menos 2 caracteres";
    const rawPhone = form.phone.replace(/\D/g, "");
    if (rawPhone.length < 10) errs.phone = "Telefone inválido (mínimo 10 dígitos)";
    if (mode === "order") {
      if (!form.email.trim()) errs.email = "Email obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Email inválido";
    }
    if (form.uf && form.uf.length !== 2) errs.uf = "UF deve ter 2 letras";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const phone = form.phone.replace(/\D/g, "");

    // Upload de foto se selecionada
    if (profilePhoto) {
      try {
        const base64 = await fileToBase64(profilePhoto);
        await uploadPhotoMutation.mutateAsync({ imageBase64: base64, phone });
      } catch {
        toast.error("Erro ao enviar foto. Continuando sem foto...");
      }
    }

    if (mode === "client") {
      createClientMutation.mutate({
        name: form.name.trim(),
        phone,
        email: form.email.trim() || `${phone}@semmail.com`,
        city: form.city.trim() || undefined,
        uf: form.uf.trim() || undefined,
        referredBy: form.referredBy.trim() || undefined,
        referredByPhone: form.referredByPhone.replace(/\D/g, "") || undefined,
        status: form.status,
        note: form.note.trim() || undefined,
      });
      return;
    }

    // Montar itens válidos
    const validItems = cartItems
      .filter(item => item.productId !== null)
      .map(item => {
        const product = products.find(p => p.id === item.productId);
        const option = product?.options.find(o => o.id === item.optionId);
        const answersArr = option?.questions
          ?.filter(q => item.questionAnswers[q.id])
          .map(q => ({ question: q.question, answer: item.questionAnswers[q.id] })) || [];
        return {
          serviceName: product?.name || "",
          serviceOption: option?.label || undefined,
          answers: answersArr.length > 0 ? JSON.stringify(answersArr) : undefined,
        };
      });

    if (validItems.length === 0) {
      // Sem produto selecionado — criar pedido simples sem produto
      createMutation.mutate({
        name: form.name.trim(),
        phone,
        email: form.email.trim(),
        city: form.city.trim() || undefined,
        uf: form.uf.trim() || undefined,
        referredBy: form.referredBy.trim() || undefined,
        referredByPhone: form.referredByPhone.replace(/\D/g, "") || undefined,
        status: form.status,
        note: form.note.trim() || undefined,
      });
    } else if (validItems.length === 1) {
      // Um produto — usar mutation simples
      createMutation.mutate({
        name: form.name.trim(),
        phone,
        email: form.email.trim(),
        city: form.city.trim() || undefined,
        uf: form.uf.trim() || undefined,
        referredBy: form.referredBy.trim() || undefined,
        referredByPhone: form.referredByPhone.replace(/\D/g, "") || undefined,
        status: form.status,
        note: form.note.trim() || undefined,
        serviceName: validItems[0].serviceName,
        serviceOption: validItems[0].serviceOption,
        answers: validItems[0].answers,
      });
    } else {
      // Múltiplos produtos — usar mutation múltipla
      createMultipleMutation.mutate({
        name: form.name.trim(),
        phone,
        email: form.email.trim(),
        city: form.city.trim() || undefined,
        uf: form.uf.trim() || undefined,
        referredBy: form.referredBy.trim() || undefined,
        referredByPhone: form.referredByPhone.replace(/\D/g, "") || undefined,
        status: form.status,
        note: form.note.trim() || undefined,
        items: validItems,
      });
    }
  };

  const handleReset = () => {
    setForm({ name: "", phone: "", email: "", city: "", uf: "", referredBy: "", referredByPhone: "", status: dynamicStatuses[0]?.key ?? "recebido", note: "" });
    setCartItems([{ id: crypto.randomUUID(), productId: null, optionId: null, questionAnswers: {} }]);
    setErrors({}); setSuccess(false); setSuccessCount(0); setSuccessOrders([]);
    setProfilePhoto(null); setProfilePhotoPreview(null); setExistingPhotoUrl(null);
    setPhoneSearch(""); setCustomerFound(null);
    setSelectedFileIds(new Set()); setShowCustomerDocs(false);
  };

  const getStatusCfg = (key: string) => {
    const s = dynamicStatuses.find(x => x.key === key);
    if (s) return { label: s.label, color: s.color, bg: s.bgColor, icon: ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />, desc: s.description ?? "" };
    return { label: key, color: "text-muted-foreground", bg: "bg-card border-border", icon: <Clock className="w-4 h-4" />, desc: "" };
  };

  const isPending = createMutation.isPending || createMultipleMutation.isPending || createClientMutation.isPending || uploadPhotoMutation.isPending;

  // Modal de sucesso
  const SuccessModal = () => {
    const cfg = getStatusCfg(form.status);
    return (
      <Dialog open={success} onOpenChange={(open) => { if (!open) handleReset(); }}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl p-0 overflow-hidden border-green-500/20">
          {/* Cabeçalho verde */}
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-b border-green-500/20 px-6 pt-8 pb-6 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center mx-auto mb-4 animate-in zoom-in-50 duration-300">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-xl font-bold text-foreground">
                {mode === "client" ? "Cliente Cadastrado!" : successCount > 1 ? `${successCount} Pedidos Criados!` : "Pedido Criado!"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{form.name}</span>{" "}
                foi {mode === "client" ? "cadastrado" : "registrado"} com sucesso.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Corpo do modal */}
          <div className="px-6 py-5 space-y-4">

            {/* Detalhes do cliente */}
            <div className="bg-muted/20 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-semibold text-foreground">{form.name}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{form.phone}</span>
              </div>
              {form.email && form.email.indexOf("@semmail.com") === -1 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Send className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Notificação enviada para <strong className="text-foreground">{form.email}</strong></span>
                </div>
              )}
            </div>

            {/* Produtos criados */}
            {mode === "order" && successOrders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> {successOrders.length === 1 ? "Pedido" : "Pedidos"}
                </p>
                {successOrders.map((order, idx) => (
                  <div key={idx} className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {order.serviceName && (
                        <p className="text-xs font-bold text-foreground truncate">{order.serviceName}</p>
                      )}
                      {order.serviceOption && (
                        <p className="text-xs text-muted-foreground truncate">{order.serviceOption}</p>
                      )}
                      {!order.serviceName && !order.serviceOption && (
                        <p className="text-xs text-muted-foreground">Pedido sem produto</p>
                      )}
                    </div>
                    {order.orderNumber && (
                      <span className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg flex-shrink-0">
                        <Hash className="w-3 h-3" />{order.orderNumber}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Status */}
            {mode === "order" && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Status</span>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                  {cfg.icon} {cfg.label}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé com botões */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
            >
              <PartyPopper className="w-4 h-4" />
              {mode === "client" ? "Novo Cliente" : "Novo Pedido"}
            </button>
            <button
              onClick={() => navigate("/admin/orders")}
              className="flex-1 py-2.5 bg-card border border-border text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              Ver Pedidos
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SuccessModal />
      <AdminHeader title={mode === "client" ? "Cadastrar Cliente" : "Novo Pedido"} backTo="/admin/orders" />

      {/* Toggle de modo */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="flex bg-card border border-border rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setMode("order")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === "order" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Novo Pedido
          </button>
          <button
            type="button"
            onClick={() => setMode("client")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === "client" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar Cliente
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-lg mx-auto pb-10">

        {/* Foto de Perfil */}
        <SectionCard icon={<Camera className="w-4 h-4" />} title="Foto de Perfil" badge="opcional">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-border overflow-hidden bg-muted/20 flex items-center justify-center">
                {profilePhotoPreview ? (
                  <img src={profilePhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : existingPhotoUrl ? (
                  <img src={existingPhotoUrl} alt="Foto atual" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                )}
              </div>
              {(profilePhotoPreview || existingPhotoUrl) && (
                <button
                  type="button"
                  onClick={() => { setProfilePhoto(null); setProfilePhotoPreview(null); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
            <div className="flex-1">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-full py-2.5 px-4 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {profilePhotoPreview ? "Trocar Foto" : existingPhotoUrl ? "Alterar Foto" : "Selecionar Foto"}
              </button>
              {existingPhotoUrl && !profilePhotoPreview && (
                <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Foto existente carregada
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">JPG, PNG ou WEBP — máx. 10MB</p>
            </div>
          </div>
        </SectionCard>

        {/* Dados do Cliente */}
        <SectionCard icon={<User className="w-4 h-4" />} title="Dados do Cliente" badge="* obrigatório">
          <div>
            <label className={labelClass}>Telefone <span className="text-red-400">*</span></label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="tel"
                value={form.phone}
                onChange={e => {
                  const formatted = formatPhone(e.target.value);
                  set("phone", formatted);
                  const digits = formatted.replace(/\D/g, "");
                  if (digits.length >= 10) { setPhoneSearch(digits); setCustomerFound(null); }
                  else { setPhoneSearch(""); setCustomerFound(null); }
                }}
                placeholder="(11) 99999-9999"
                className={`${inputClass} pl-9 ${errors.phone ? "border-red-500/60" : customerFound === true ? "border-emerald-500/60" : customerFound === false ? "border-blue-500/40" : ""}`}
              />
              {customerQuery.isFetching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-primary" />
                </div>
              )}
            </div>
            {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone}</p>}
            {customerFound === true && !errors.phone && (
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Cliente encontrado — dados preenchidos automaticamente
              </p>
            )}
            {customerFound === false && !errors.phone && (
              <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Novo cliente
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Nome completo <span className="text-red-400">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Nome completo do cliente"
                className={`${inputClass} pl-9 ${errors.name ? "border-red-500/60" : ""}`}
              />
            </div>
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className={labelClass}>
              Email {mode === "order" && <span className="text-red-400">*</span>}
              {mode === "client" && <span className="text-muted-foreground font-normal normal-case tracking-normal"> (opcional)</span>}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@exemplo.com"
                className={`${inputClass} pl-9 ${errors.email ? "border-red-500/60" : ""}`}
              />
            </div>
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
            {form.email && !errors.email && (
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <Send className="w-3 h-3" /> Notificação será enviada para este email
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Cidade</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={form.city} onChange={e => set("city", e.target.value)} placeholder="Cidade" className={`${inputClass} pl-9`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>UF</label>
              <select value={form.uf} onChange={e => set("uf", e.target.value)} className={inputClass}>
                <option value="">Selecionar</option>
                {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
              {errors.uf && <p className="text-xs text-red-400 mt-1">{errors.uf}</p>}
            </div>
          </div>
        </SectionCard>

        {/* Indicação */}
        <SectionCard icon={<UserCheck className="w-4 h-4" />} title="Indicação" badge="opcional">
          <div>
            <label className={labelClass}>Nome do indicador</label>
            <div className="relative">
              <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" value={form.referredBy} onChange={e => set("referredBy", e.target.value)} placeholder="Quem indicou este cliente?" className={`${inputClass} pl-9`} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Telefone do indicador</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="tel" value={form.referredByPhone} onChange={e => set("referredByPhone", formatPhone(e.target.value))} placeholder="(11) 99999-9999" className={`${inputClass} pl-9`} />
            </div>
          </div>
        </SectionCard>

        {/* Produtos / Serviços (apenas no modo pedido) */}
        {mode === "order" && (
          <SectionCard
            icon={<ShoppingCart className="w-4 h-4" />}
            title="Produtos / Serviços"
            badge={`${cartItems.length} ${cartItems.length === 1 ? "item" : "itens"}`}
          >
            {productsQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
              </div>
            ) : products.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum produto cadastrado</p>
            ) : (
              <div className="space-y-4">
                {cartItems.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId) || null;
                  const option = product?.options.find(o => o.id === item.optionId) || null;
                  return (
                    <div key={item.id} className="bg-muted/10 border border-border rounded-xl p-3 space-y-3">
                      {/* Header do item */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5" />
                          Produto {idx + 1}
                        </span>
                        {cartItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCartItem(item.id)}
                            className="w-6 h-6 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Seletor de produto */}
                      <div>
                        <label className={labelClass}>Produto</label>
                        <div className="relative">
                          <select
                            value={item.productId ?? ""}
                            onChange={e => updateCartItem(item.id, {
                              productId: e.target.value ? Number(e.target.value) : null,
                              optionId: null,
                              questionAnswers: {},
                            })}
                            className={inputClass}
                          >
                            <option value="">Selecionar produto...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>

                      {/* Seletor de opção */}
                      {product && product.options.filter(o => o.isActive === 1).length > 0 && (
                        <div>
                          <label className={labelClass}>Opção</label>
                          <div className="relative">
                            <select
                              value={item.optionId ?? ""}
                              onChange={e => updateCartItem(item.id, {
                                optionId: e.target.value ? Number(e.target.value) : null,
                                questionAnswers: {},
                              })}
                              className={inputClass}
                            >
                              <option value="">Selecionar opção...</option>
                              {product.options.filter(o => o.isActive === 1).map(o => (
                                <option key={o.id} value={o.id}>
                                  {o.label}{o.price ? ` — ${o.originalPrice && o.originalPrice.trim() !== '' ? `${o.originalPrice} → ` : ''}${o.price}` : ""}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>
                      )}

                      {/* Perguntas da opção */}
                      {option && option.questions && option.questions.length > 0 && (
                        <div className="space-y-3 pt-1 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Perguntas</p>
                          {option.questions.map(q => (
                            <div key={q.id}>
                              <label className={labelClass}>{q.question}{q.isRequired === 1 && <span className="text-red-400 ml-1">*</span>}</label>
                              {q.fieldType === "textarea" ? (
                                <textarea
                                  value={item.questionAnswers[q.id] || ""}
                                  onChange={e => updateCartItem(item.id, { questionAnswers: { ...item.questionAnswers, [q.id]: e.target.value } })}
                                  rows={3}
                                  className={`${inputClass} resize-none`}
                                  placeholder="Resposta..."
                                />
                              ) : q.fieldType === "select" && q.options ? (
                                <div className="flex flex-wrap gap-2">
                                  {(() => {
                                    let parsedOpts: Array<{ label: string; color: string }> = [];
                                    try {
                                      const parsed = JSON.parse(q.options!);
                                      if (Array.isArray(parsed)) {
                                        parsedOpts = parsed.map((o: any) => typeof o === 'string'
                                          ? { label: o, color: '#6b7280' }
                                          : { label: o.label || String(o), color: o.color || '#6b7280' });
                                      } else {
                                        parsedOpts = (q.options || '').split(',').map((o: string) => ({ label: o.trim(), color: '#6b7280' })).filter(x => x.label);
                                      }
                                    } catch {
                                      parsedOpts = (q.options || '').split(',').map((o: string) => ({ label: o.trim(), color: '#6b7280' })).filter(x => x.label);
                                    }
                                    return parsedOpts.map(opt => {
                                      const isSelected = item.questionAnswers[q.id] === opt.label;
                                      return (
                                        <button
                                          key={opt.label}
                                          type="button"
                                          onClick={() => updateCartItem(item.id, { questionAnswers: { ...item.questionAnswers, [q.id]: opt.label } })}
                                          className="px-4 py-2 rounded-xl text-sm font-bold transition-all border-2"
                                          style={{
                                            backgroundColor: isSelected ? opt.color : opt.color + '22',
                                            color: isSelected ? '#fff' : opt.color,
                                            borderColor: opt.color,
                                            transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                                            boxShadow: isSelected ? `0 0 12px ${opt.color}66` : 'none',
                                            transition: 'all 0.15s ease',
                                          }}
                                        >
                                          {opt.label}
                                        </button>
                                      );
                                    });
                                  })()}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={item.questionAnswers[q.id] || ""}
                                  onChange={e => updateCartItem(item.id, { questionAnswers: { ...item.questionAnswers, [q.id]: e.target.value } })}
                                  className={inputClass}
                                  placeholder="Resposta..."
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Preview do item selecionado */}
                      {product && (
                        <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Package className="w-4 h-4 text-primary flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-primary truncate">{product.name}</p>
                              {option && <p className="text-xs text-muted-foreground truncate">{option.label}</p>}
                            </div>
                          </div>
                          {option?.price && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {option.originalPrice && option.originalPrice.trim() !== '' && (
                                <span className="text-gray-500 text-xs line-through">{option.originalPrice}</span>
                              )}
                              <span className="text-green-400 font-bold text-sm">{option.price}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Botão adicionar mais produto */}
                <button
                  type="button"
                  onClick={addCartItem}
                  className="w-full py-2.5 px-4 border-2 border-dashed border-primary/30 hover:border-primary/60 text-primary/70 hover:text-primary rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar outro produto
                </button>

                {/* Total calculado automaticamente */}
                {hasTotal && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-green-300 font-bold text-sm flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4" />
                        Total ({cartItems.filter(i => i.productId !== null).length} {cartItems.filter(i => i.productId !== null).length === 1 ? "item" : "itens"}):
                      </span>
                      <span className="text-green-400 font-bold text-lg">
                        R$ {cartTotal.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        )}

        {/* Status */}
        <SectionCard icon={<FileText className="w-4 h-4" />} title="Status" badge="* obrigatório">
          <div className="grid grid-cols-1 gap-2">
            {statusTypesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground py-2">Carregando status...</p>
            ) : dynamicStatuses.map(s => {
              const cfg = getStatusCfg(s.key);
              const isSelected = form.status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set("status", s.key)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isSelected ? `${cfg.bg} ${cfg.color} border-current shadow-sm` : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="flex-shrink-0">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isSelected ? cfg.color : ""}`}>{cfg.label}</p>
                    {cfg.desc && <p className="text-xs text-muted-foreground line-clamp-1">{cfg.desc}</p>}
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Observação */}
        <SectionCard icon={<FileText className="w-4 h-4" />} title="Observação" badge="opcional">
          <div>
            <label className={labelClass}>Mensagem para o cliente <span className="text-muted-foreground font-normal normal-case tracking-normal">(aparecerá no email)</span></label>
            <textarea value={form.note} onChange={e => set("note", e.target.value)} placeholder="Adicione uma observação ou instrução para o cliente..." rows={3} className={`${inputClass} resize-none`} />
          </div>
        </SectionCard>

        {/* Documentos do Cliente */}
        {mode === "order" && (() => {
          const allDocs = customerFilesQuery.data ?? [];
          const clientDocs = allDocs.filter(f => Number(f.fromAdmin) !== 1);
          if (clientDocs.length === 0) return null;
          return (
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-violet-500/20 bg-violet-500/5">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                <h2 className="text-sm font-bold text-violet-300">Documentos do Cliente</h2>
                <span className="ml-1 text-[10px] bg-violet-500/30 text-violet-200 rounded-full px-1.5 py-0.5 font-bold">{clientDocs.length}</span>
                {selectedFileIds.size > 0 && (
                  <span className="ml-auto text-[10px] bg-violet-600 text-white rounded-full px-2 py-0.5 font-bold">{selectedFileIds.size} selecionado(s)</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowCustomerDocs(v => !v)}
                  className="ml-auto text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                >
                  {showCustomerDocs ? 'Ocultar' : 'Ver documentos'}
                </button>
              </div>
              {!showCustomerDocs && (
                <div className="px-4 py-2">
                  <p className="text-[11px] text-violet-300/70">Este cliente já tem {clientDocs.length} documento(s) cadastrado(s). Clique em "Ver documentos" para selecionar quais deseja anexar a este pedido.</p>
                </div>
              )}
              {showCustomerDocs && (
                <div className="p-4 space-y-2">
                  <p className="text-[11px] text-violet-300/60 mb-2">Selecione os documentos para anexar automaticamente ao criar o pedido:</p>
                  {clientDocs.map(f => {
                    const isPdf = f.mimeType?.includes('pdf');
                    const isImg = f.mimeType?.startsWith('image/');
                    const isSelected = selectedFileIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFileIds(prev => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                          return next;
                        })}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-violet-600/20 border-violet-500 shadow-sm shadow-violet-500/20'
                            : 'bg-violet-500/5 border-violet-500/20 hover:border-violet-400/40'
                        }`}
                      >
                        <span className="text-base flex-shrink-0">{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{f.label}</p>
                          <p className="text-[10px] text-violet-300/60">Pedido #{f.registrationId}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? 'bg-violet-600 border-violet-500' : 'border-violet-500/40'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {selectedFileIds.size > 0 && (
                    <div className="mt-2 pt-2 border-t border-violet-500/20 flex items-center justify-between">
                      <p className="text-xs text-violet-300 font-semibold">{selectedFileIds.size} documento(s) serão anexados ao criar o pedido</p>
                      <button
                        type="button"
                        onClick={() => setSelectedFileIds(new Set())}
                        className="text-[10px] text-violet-400 hover:text-violet-300 underline"
                      >Limpar seleção</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Resumo */}
        {form.name && form.phone && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-primary uppercase tracking-wide">Resumo</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="text-foreground font-semibold">Cliente:</span> {form.name}</p>
              <p><span className="text-foreground font-semibold">Telefone:</span> {form.phone}</p>
              {form.email && <p><span className="text-foreground font-semibold">Email:</span> {form.email}</p>}
              {(form.city || form.uf) && <p><span className="text-foreground font-semibold">Localização:</span> {[form.city, form.uf].filter(Boolean).join(" - ")}</p>}
              {form.referredBy && <p><span className="text-foreground font-semibold">Indicado por:</span> {form.referredBy}</p>}
              {mode === "order" && (() => {
                const validItems = cartItems.filter(i => i.productId !== null);
                if (validItems.length === 0) return null;
                return (
                  <div>
                    <span className="text-foreground font-semibold">Produtos:</span>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {validItems.map((item, idx) => {
                        const product = products.find(p => p.id === item.productId);
                        const option = product?.options.find(o => o.id === item.optionId);
                        return (
                          <li key={item.id} className="flex items-center justify-between gap-2">
                            <span>{idx + 1}. {product?.name}{option ? ` — ${option.label}` : ''}</span>
                            {option?.price && (
                              <span className="flex items-center gap-1">
                                {option.originalPrice && option.originalPrice.trim() !== '' && (
                                  <span className="text-gray-500 text-xs line-through">{option.originalPrice}</span>
                                )}
                                <span className="text-green-400 font-semibold">{option.price}</span>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {hasTotal && (
                      <p className="mt-1 font-bold text-green-400">Total: R$ {cartTotal.toFixed(2).replace(".", ",")}</p>
                    )}
                  </div>
                );
              })()}
              {profilePhoto && (
                <p className="text-emerald-400 flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Foto de perfil será enviada
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-foreground font-semibold">Status:</span>
                {(() => { const cfg = getStatusCfg(form.status); return (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                ); })()}
              </div>
              {form.email && form.email.indexOf("@semmail.com") === -1 && (
                <p className="text-emerald-400 flex items-center gap-1 pt-0.5">
                  <Send className="w-3 h-3" /> Email de notificação será enviado
                </p>
              )}
            </div>
          </div>
        )}

        {/* Botão de envio */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-4 px-6 bg-primary text-primary-foreground rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
        >
          {isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-primary-foreground" />
              {uploadPhotoMutation.isPending ? "Enviando foto..." : mode === "client" ? "Cadastrando..." : "Criando pedido(s)..."}
            </>
          ) : (
            <>
              {mode === "client" ? <UserPlus className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {mode === "client"
                ? "Cadastrar Cliente"
                : (() => {
                    const validCount = cartItems.filter(i => i.productId !== null).length;
                    if (validCount > 1) return `Criar ${validCount} Pedidos${form.email ? " e Notificar" : ""}`;
                    return `Criar Pedido${form.email ? " e Notificar" : ""}`;
                  })()
              }
            </>
          )}
        </button>
      </form>
    </div>
  );
}
