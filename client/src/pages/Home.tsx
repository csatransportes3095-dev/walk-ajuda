import { useAuth } from "@/_core/hooks/useAuth";
import { useRoute } from "wouter";
import { ServicosExtras } from "@/components/ServicosExtras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Zap, Phone, Clock, Users, Upload, FileUp, Ticket, Copy, Check, ImageIcon, AlertTriangle, Camera, Car, Loader2, UserCircle, X, KeyRound, ShoppingCart, Trash2, LogOut, HelpCircle, ChevronDown } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PaymentTutorial from "@/components/PaymentTutorial";
import { ColombiaBot } from "@/components/ColombiaBot";

type Step = "home" | "registration" | "name-select" | "upload" | "pdf-upload" | "questions" | "cadastro" | "success";

type CartItem = {
  id: string; // unique key
  product: Product;
  option: ProductOption | null;
};

type ProductQuestion = { id: number; question: string; fieldType: string; options: string | null; isRequired: number; sortOrder: number; parentQuestionId: number | null; triggerOption: string | null };
type OptionDocument = { id: number; optionId: number; label: string; exampleImageUrl: string | null; inputSource?: string; sortOrder: number; instruction?: string | null; exampleText?: string | null };
type WarrantyTier = { id: number; optionId: number; warrantyType: string; warrantyValue: number; warrantyLabel: string | null; price: string; originalPrice: string | null; sortOrder: number; isActive: number; };
type ProductOption = {
  id: number; label: string; price: string; originalPrice: string | null; type: string | null; sortOrder: number; isActive: number;
  requireProfilePhoto: number; requireCarDocument: number; requireAlvara: number;
  requireCondutaxi: number; requireVehicle2016: number; isPdfOnly: number;
  showYearField: number; docNameMode: string; docCustomName: string | null;
  questions: ProductQuestion[];
  documents: OptionDocument[];
  warrantyTiers?: WarrantyTier[];
  promoEndsAt?: number | null;
};
type Product = {
  id: number; name: string; description: string | null; iconUrl: string | null;
  buttonText: string; isActive: number; sortOrder: number;
  requireProfilePhoto: number; requireCarDocument: number; requireAlvara: number;
  requireCondutaxi: number; requireVehicle2016: number; isPdfOnly: number; showYearField: number;
  cardColor: string | null; cardBgColor: string | null; cardTextColor: string | null; cardBtnColor: string | null;
  resellerDiscount?: string | null; // % de desconto para revendedores por produto
  options: ProductOption[];
};

// ── Componente PromoCard com cronômetro decrescente ────────────────────────
function useCountdown(endsAt: number | null | undefined) {
  const [remaining, setRemaining] = useState<number>(() =>
    endsAt ? Math.max(0, endsAt - Date.now()) : -1
  );
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

function PromoCard({
  product, option, onSelect, onExpire
}: {
  product: Product;
  option: ProductOption;
  onSelect: () => void;
  onExpire?: () => void;
}) {
  const remaining = useCountdown(option.promoEndsAt);
  const hasTimer = !!option.promoEndsAt;
  const expired = hasTimer && remaining === 0;
  const urgent = hasTimer && remaining > 0 && remaining < 3600_000; // < 1h

  const hh = Math.floor(remaining / 3600_000);
  const mm = Math.floor((remaining % 3600_000) / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  useEffect(() => {
    if (expired && onExpire) onExpire();
  }, [expired, onExpire]);

  if (expired) return null;

  return (
    <button
      onClick={onSelect}
      className="group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 active:scale-[0.97] text-left w-full"
      style={{
        background: 'linear-gradient(135deg, rgba(15,15,30,0.95) 0%, rgba(25,10,10,0.95) 100%)',
        borderColor: urgent ? 'rgba(239,68,68,0.7)' : 'rgba(249,115,22,0.5)',
        boxShadow: urgent
          ? '0 0 20px rgba(239,68,68,0.3), inset 0 1px 0 rgba(239,68,68,0.1)'
          : '0 0 16px rgba(249,115,22,0.2), inset 0 1px 0 rgba(249,115,22,0.08)',
      }}
    >
      {/* Faixa de desconto */}
      {option.originalPrice && option.originalPrice.trim() !== '' && (() => {
        const orig = parseFloat(option.originalPrice!.replace(/[^0-9,]/g, '').replace(',', '.'));
        const curr = parseFloat(option.price.replace(/[^0-9,]/g, '').replace(',', '.'));
        const pct = orig > 0 && curr > 0 ? Math.round((1 - curr / orig) * 100) : 0;
        return pct > 0 ? (
          <div className="absolute top-3 right-3 z-10">
            <span className="bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-lg">
              -{pct}% OFF
            </span>
          </div>
        ) : null;
      })()}

      {/* Cabeçalho do card */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {product.iconUrl
          ? <img src={product.iconUrl} alt={product.name} className="w-10 h-10 rounded-xl flex-shrink-0 object-cover" />
          : <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-orange-400 text-lg">🔥</span>
            </div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-orange-400 font-black text-[11px] uppercase tracking-widest truncate">{product.name}</p>
          <p className="text-white font-bold text-sm leading-tight truncate group-hover:text-orange-200 transition-colors">{option.label}</p>
        </div>
      </div>

      {/* Preços */}
      <div className="px-4 pb-3 flex items-baseline gap-2">
        <span
          className="text-white/50 text-sm font-medium"
          style={{ textDecoration: 'line-through', textDecorationColor: '#ef4444', textDecorationThickness: '2px' }}
        >
          {option.originalPrice}
        </span>
        <span className="text-green-400 font-black text-xl">{option.price}</span>
      </div>

      {/* Cronômetro */}
      {hasTimer && (
        <div
          className="mx-4 mb-4 rounded-xl px-3 py-2.5 flex items-center gap-2"
          style={{
            background: urgent
              ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1))'
              : 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.08))',
            border: `1px solid ${urgent ? 'rgba(239,68,68,0.4)' : 'rgba(249,115,22,0.3)'}`,
          }}
        >
          <span className={`text-lg ${urgent ? 'animate-pulse' : ''}`}>⏰</span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: urgent ? '#fca5a5' : '#fdba74' }}>
              {urgent ? '⚠️ Últimas horas!' : 'Promoção encerra em'}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              {[{ v: hh, l: 'h' }, { v: mm, l: 'm' }, { v: ss, l: 's' }].map(({ v, l }, i) => (
                <span key={l} className="flex items-center gap-0.5">
                  <span
                    className="font-black text-base tabular-nums"
                    style={{ color: urgent ? '#ef4444' : '#f97316' }}
                  >
                    {pad(v)}
                  </span>
                  <span className="text-[10px] font-bold" style={{ color: urgent ? '#fca5a5' : '#fdba74' }}>{l}</span>
                  {i < 2 && <span className="text-white/30 mx-0.5">:</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Botão CTA */}
      <div className="px-4 pb-4">
        <div
          className="w-full py-2.5 rounded-xl text-center text-sm font-black tracking-wide transition-all duration-200 group-hover:brightness-110"
          style={{
            background: urgent
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #f97316, #ea580c)',
            color: '#fff',
            boxShadow: urgent ? '0 4px 14px rgba(239,68,68,0.4)' : '0 4px 14px rgba(249,115,22,0.4)',
          }}
        >
          APROVEITAR OFERTA →
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  // Detectar slug do revendedor na URL (/r/:slug)
  const [matchReseller, resellerParams] = useRoute("/r/:slug");
  const resellerSlug = matchReseller ? (resellerParams as { slug: string }).slug : null;

  // Salvar slug do revendedor no localStorage para persistir durante o fluxo
  useEffect(() => {
    if (resellerSlug) {
      localStorage.setItem('walk_reseller_slug', resellerSlug);
    }
  }, [resellerSlug]);

  const activeResellerSlug = resellerSlug ||
    (typeof window !== 'undefined' ? localStorage.getItem('walk_reseller_slug') || null : null);

  // Buscar dados do revendedor e seus preços
  const { data: resellerData } = trpc.resellers.getBySlug.useQuery(
    { slug: activeResellerSlug! },
    { enabled: !!activeResellerSlug }
  );
  const { data: resellerPrices = [] } = trpc.resellers.getPricesBySlug.useQuery(
    { slug: activeResellerSlug! },
    { enabled: !!activeResellerSlug }
  );

  // Mapa optionId -> salePrice do revendedor
  const resellerPriceMap = useMemo(() => {
    const map: Record<number, string> = {};
    resellerPrices.forEach((p: { optionId: number; salePrice: string }) => {
      if (p.salePrice) map[p.optionId] = p.salePrice;
    });
    return map;
  }, [resellerPrices]);

  // Buscar dados dinâmicos
  const { data: products } = trpc.products.listActive.useQuery();
  const { data: settings } = trpc.settings.getAll.useQuery();
  const { data: activePix } = trpc.pix.getActive.useQuery();
  const { data: faqData } = trpc.faq.getPublic.useQuery();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState('');
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const [whatsappClicked, setWhatsappClicked] = useState(false);
  const [step, setStep] = useState<Step>("home");
  const [showColombiaBot, setShowColombiaBot] = useState(false);
  // Tela de escolha manifesto: mostrar quando bot está ativo e cliente está logado
  const [showBotChoice, setShowBotChoice] = useState(() => {
    return !!localStorage.getItem('cp_token');
  });
  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedTier, setSelectedTier] = useState<WarrantyTier | null>(null);

  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [carDocument, setCarDocument] = useState<File | null>(null);
  const [carDocumentYear, setCarDocumentYear] = useState("");
  const [alvaraFile, setAlvaraFile] = useState<File | null>(null);
  const [condutaxiFile, setCondutaxiFile] = useState<File | null>(null);
  // Documentos dinâmicos: mapa de docId -> File
  const [docFiles, setDocFiles] = useState<Record<number, File>>({});
  // Previews de documentos dinâmicos (objectURL para imagens)
  const [docFilePreviews, setDocFilePreviews] = useState<Record<number, string>>({});
  const [showDocPhotoPreview, setShowDocPhotoPreview] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [cadastroSubStep, setCadastroSubStep] = useState<"dados" | "resumo" | "pagamento">("dados");
  const [successMessage, setSuccessMessage] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [referrerPhone, setReferrerPhone] = useState("");
  const [bypassCode, setBypassCode] = useState("");
  const [referrerValidationStatus, setReferrerValidationStatus] = useState<{ valid: boolean; name?: string } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponValid, setCouponValid] = useState<boolean | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<{ type: string; value: number } | null>(null);
  const [thirdPartyName, setThirdPartyName] = useState(""); // nome do cliente final (revendedor)
  const [thirdPartyPhone, setThirdPartyPhone] = useState(""); // telefone do cliente final (revendedor)
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [showExamplePhoto, setShowExamplePhoto] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [blockedByQuestion, setBlockedByQuestion] = useState<{ question: string; answer: string } | null>(null);
  const submitLockRef = useRef(false);
  const [trackingPinFromServer, setTrackingPinFromServer] = useState<string | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // URLs de arquivos já salvos no servidor (restaurados ao retomar progresso)
  // Permite pular re-upload e validação quando o arquivo já existe no banco
  const [restoredFileUrls, setRestoredFileUrls] = useState<{
    profilePhoto?: string;
    carDocument?: string;
    paymentProof?: string;
    alvara?: string;
    condutaxi?: string;
    dynamicDocs: Record<number, string>; // docId -> url
  }>({ dynamicDocs: {} });

  // ===== DADOS DO PEDIDO FINALIZADO (para mensagem WhatsApp) =====
  const [submittedOrderData, setSubmittedOrderData] = useState<{
    cartItems: Array<{ service: string; nameOption: string; price: string }>;
    answers: Array<{ question: string; answer: string }>;
    docs: Array<{ label: string; url: string }>;
    totalValue: string;
    referrerName: string;
    referrerPhone: string;
    clientName: string;
    clientPhone: string;
    clientCity: string;
  } | null>(null);

  // ===== PROPAGANDA OBRIGATÓRIA =====
  const [adVisible, setAdVisible] = useState(false);
  const [adProgress, setAdProgress] = useState(0);
  const [adCanClose, setAdCanClose] = useState(false);
  const [adCampaign, setAdCampaign] = useState<any>(null);
  const adSessionKey = useMemo(() => {
    const k = sessionStorage.getItem('walk_ad_session_key') || Math.random().toString(36).slice(2);
    sessionStorage.setItem('walk_ad_session_key', k);
    return k;
  }, []);
  const { data: adData } = trpc.adCampaigns.checkForPage.useQuery(
    { page: 'pedidos', sessionKey: adSessionKey },
    { staleTime: Infinity }
  );
  useEffect(() => {
    if (adData?.campaign) {
      setAdCampaign(adData.campaign);
      setAdProgress(0);
      setAdCanClose(false);
      setAdVisible(true);
    }
  }, [adData?.campaign?.id]);
  useEffect(() => {
    if (!adVisible || !adCampaign || adCampaign.type !== 'image') return;
    const total = (adCampaign.requiredSeconds || 20) * 1000;
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setAdProgress(pct);
      if (pct >= 100) { setAdCanClose(true); clearInterval(timer); }
    }, interval);
    return () => clearInterval(timer);
  }, [adVisible, adCampaign?.id]);

  // ===== INDICAÇÃO PÓS-PEDIDO =====
  // Só mostra o formulário de indicação se o cliente era NOVO no momento do pedido
  const [isNewCustomerOrder, setIsNewCustomerOrder] = useState(false);
  const [postOrderReferralStep, setPostOrderReferralStep] = useState<'question' | 'form' | 'done'>('question');
  const [postOrderReferralPhone, setPostOrderReferralPhone] = useState('');
  const [postOrderReferralName, setPostOrderReferralName] = useState('');
  const [postOrderReferralError, setPostOrderReferralError] = useState('');
  const [postOrderReferralSaving, setPostOrderReferralSaving] = useState(false);
  const [highlightedAnswer, setHighlightedAnswer] = useState<{ qId: number; label: string } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // ===== RETOMADA DE PROGRESSO =====
  const PROGRESS_KEY = 'walk_order_progress';
  const UPLOADED_FILES_KEY = 'walk_uploaded_files';
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [savedProgressLabel, setSavedProgressLabel] = useState('');

  // Helper: salvar URL de arquivo uploaded no localStorage
  const saveUploadedFileUrl = (key: string, url: string, mimeType?: string) => {
    try {
      const raw = localStorage.getItem(UPLOADED_FILES_KEY);
      const data = raw ? JSON.parse(raw) : {};
      data[key] = { url, mimeType: mimeType || 'image/jpeg', savedAt: Date.now() };
      localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(data));
    } catch {}
  };
  const removeUploadedFileUrl = (key: string) => {
    try {
      const raw = localStorage.getItem(UPLOADED_FILES_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      delete data[key];
      localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(data));
    } catch {}
  };
  const getUploadedFiles = (): Record<string, { url: string; mimeType: string }> => {
    try {
      const raw = localStorage.getItem(UPLOADED_FILES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  // Quando o step vai para 'success' e o cliente NÃO é novo, pular o formulário de indicação
  useEffect(() => {
    if (step === 'success' && !isNewCustomerOrder) {
      setPostOrderReferralStep('done');
    }
  }, [step, isNewCustomerOrder]);

  // Salvar progresso automaticamente quando step muda (exceto home e success)
  useEffect(() => {
    if (step === 'home' || step === 'success') {
      // Limpar progresso ao voltar para home ou concluir pedido
      if (step === 'success') { localStorage.removeItem(PROGRESS_KEY); localStorage.removeItem(UPLOADED_FILES_KEY); }
      return;
    }
    if (!selectedProduct) return;
    const progress = {
      step,
      productId: selectedProduct.id,
      optionId: selectedOption?.id ?? null,
      questionAnswers,
      clientName,
      clientPhone,
      clientCity,
      clientEmail,
      couponCode,
      carDocumentYear,
      cadastroSubStep,
      savedAt: Date.now(),
    };
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {}
  }, [step, selectedProduct, selectedOption, questionAnswers, clientName, clientPhone, clientCity, clientEmail, couponCode, carDocumentYear, cadastroSubStep]);

  // Verificar se há progresso salvo ao montar o componente (quando produtos estão carregados)
  useEffect(() => {
    if (!products || products.length === 0) return;
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      // Ignorar progresso com mais de 24 horas
      if (Date.now() - saved.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(PROGRESS_KEY);
        return;
      }
      // Só mostrar se estiver na tela home e tiver produto salvo
      if (step !== 'home') return;
      const prod = products.find((p: Product) => p.id === saved.productId);
      if (!prod) { localStorage.removeItem(PROGRESS_KEY); return; }
      setSavedProgressLabel(prod.name + (saved.optionId ? ` — ${prod.options.find((o: ProductOption) => o.id === saved.optionId)?.label || ''}` : ''));
      setShowResumeModal(true);
    } catch {}
  }, [products]);

  // Scroll automático para a próxima pergunta após selecionar uma opção
  const scrollToNextQuestion = (currentQuestionId: number, questions: ProductQuestion[], selectedLabel: string) => {
    // Efeito de destaque visual por 400ms antes de rolar
    setHighlightedAnswer({ qId: currentQuestionId, label: selectedLabel });
    setTimeout(() => setHighlightedAnswer(null), 400);
    const currentIndex = questions.findIndex(q => q.id === currentQuestionId);
    if (currentIndex >= 0 && currentIndex < questions.length - 1) {
      const nextQ = questions[currentIndex + 1];
      setTimeout(() => {
        const el = questionRefs.current[nextQ.id];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350);
    }
  };

  // Restaurar progresso salvo
  const trpcUtils = trpc.useUtils();
  const restoreProgress = async () => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw || !products) return;
      const saved = JSON.parse(raw);
      const prod = products.find((p: Product) => p.id === saved.productId);
      if (!prod) return;
      setSelectedProduct(prod);
      if (saved.optionId) {
        const opt = prod.options.find((o: ProductOption) => o.id === saved.optionId);
        if (opt) setSelectedOption(opt);
      }
      if (saved.questionAnswers) setQuestionAnswers(saved.questionAnswers);
      if (saved.clientName) setClientName(saved.clientName);
      if (saved.clientPhone) setClientPhone(saved.clientPhone);
      if (saved.clientCity) setClientCity(saved.clientCity);
      if (saved.clientEmail) setClientEmail(saved.clientEmail);
      if (saved.couponCode) setCouponCode(saved.couponCode);
      if (saved.carDocumentYear) setCarDocumentYear(saved.carDocumentYear);
      if (saved.cadastroSubStep) setCadastroSubStep(saved.cadastroSubStep);
      setStep(saved.step || 'home');

      // Restaurar URLs de arquivos já uploaded ao S3 (fonte primária: localStorage)
      const uploadedFiles = getUploadedFiles();
      const newRestoredUrls: typeof restoredFileUrls = { dynamicDocs: {} };
      let hasAnyFile = false;

      // Restaurar do localStorage (upload imediato salvo anteriormente)
      if (uploadedFiles.profilePhoto) {
        setProfilePhotoPreview(uploadedFiles.profilePhoto.url);
        newRestoredUrls.profilePhoto = uploadedFiles.profilePhoto.url;
        hasAnyFile = true;
      }
      if (uploadedFiles.paymentProof) {
        const mime = uploadedFiles.paymentProof.mimeType || '';
        setPaymentProofPreview(mime === 'application/pdf' ? 'pdf' : uploadedFiles.paymentProof.url);
        newRestoredUrls.paymentProof = uploadedFiles.paymentProof.url;
        hasAnyFile = true;
      }
      if (uploadedFiles.carDocument) {
        setDocFilePreviews(prev => ({ ...prev, [-1]: uploadedFiles.carDocument.url }));
        newRestoredUrls.carDocument = uploadedFiles.carDocument.url;
        hasAnyFile = true;
      }
      if (uploadedFiles.alvara) {
        newRestoredUrls.alvara = uploadedFiles.alvara.url;
        hasAnyFile = true;
      }
      if (uploadedFiles.condutaxi) {
        newRestoredUrls.condutaxi = uploadedFiles.condutaxi.url;
        hasAnyFile = true;
      }

      // Documentos dinâmicos do localStorage
      if (saved.optionId) {
        const opt = prod.options.find((o: ProductOption) => o.id === saved.optionId);
        if (opt?.documents) {
          const newPreviews: Record<number, string> = {};
          for (const doc of opt.documents as Array<{ id: number; label: string }>) {
            const localKey = `doc_${doc.id}`;
            if (uploadedFiles[localKey]) {
              newPreviews[doc.id] = uploadedFiles[localKey].url;
              newRestoredUrls.dynamicDocs[doc.id] = uploadedFiles[localKey].url;
              hasAnyFile = true;
            }
          }
          if (Object.keys(newPreviews).length > 0) {
            setDocFilePreviews(prev => ({ ...prev, ...newPreviews }));
          }
        }
      }

      // Fallback: buscar no banco (para pedidos que já foram finalizados anteriormente)
      const phone = saved.clientPhone || '';
      if (!hasAnyFile && phone.replace(/\D/g, '').length >= 8) {
        try {
          const clientFiles = await trpcUtils.orderStatus.getClientFiles.fetch({ phone });
          if (clientFiles && clientFiles.length > 0) {
            // Foto de perfil
            const profileFile = clientFiles.find(f =>
              f.label === 'Foto de Perfil' || f.label.toLowerCase().includes('perfil') || f.label.toLowerCase().includes('selfie') || f.label.toLowerCase().includes('foto-perfil')
            );
            if (profileFile && !newRestoredUrls.profilePhoto) {
              setProfilePhotoPreview(profileFile.fileUrl);
              newRestoredUrls.profilePhoto = profileFile.fileUrl;
            }

            // Comprovante PIX
            const proofFile = clientFiles.find(f =>
              f.label === 'Comprovante PIX' || f.label.toLowerCase().includes('comprovante') || f.label.toLowerCase().includes('comprovante-pix')
            );
            if (proofFile && !newRestoredUrls.paymentProof) {
              const mime = proofFile.mimeType || '';
              setPaymentProofPreview(mime === 'application/pdf' ? 'pdf' : proofFile.fileUrl);
              newRestoredUrls.paymentProof = proofFile.fileUrl;
            }

            // Documento do carro
            const carFile = clientFiles.find(f => f.label === 'Documento do Carro' || f.label.toLowerCase().includes('documento-carro'));
            if (carFile && !newRestoredUrls.carDocument) {
              setDocFilePreviews(prev => ({ ...prev, [-1]: carFile.fileUrl }));
              newRestoredUrls.carDocument = carFile.fileUrl;
            }

            // Alvará
            const alvaraFileFound = clientFiles.find(f => f.label.toLowerCase().includes('alvar'));
            if (alvaraFileFound && !newRestoredUrls.alvara) {
              newRestoredUrls.alvara = alvaraFileFound.fileUrl;
            }

            // Condutaxi
            const condutaxiFileFound = clientFiles.find(f => f.label.toLowerCase().includes('condutaxi'));
            if (condutaxiFileFound && !newRestoredUrls.condutaxi) {
              newRestoredUrls.condutaxi = condutaxiFileFound.fileUrl;
            }

            // Documentos dinâmicos (fallback por label flexível)
            if (saved.optionId) {
              const opt = prod.options.find((o: ProductOption) => o.id === saved.optionId);
              if (opt?.documents) {
                const newPreviews: Record<number, string> = {};
                for (const doc of opt.documents as Array<{ id: number; label: string }>) {
                  if (newRestoredUrls.dynamicDocs[doc.id]) continue; // já restaurado do localStorage
                  const docLabelNorm = doc.label.trim().toLowerCase();
                  const found = clientFiles.find(f => {
                    const fLabelNorm = f.label.trim().toLowerCase();
                    return fLabelNorm === docLabelNorm || fLabelNorm.includes(docLabelNorm) || docLabelNorm.includes(fLabelNorm);
                  });
                  if (found) {
                    newPreviews[doc.id] = found.fileUrl;
                    newRestoredUrls.dynamicDocs[doc.id] = found.fileUrl;
                  }
                }
                if (Object.keys(newPreviews).length > 0) {
                  setDocFilePreviews(prev => ({ ...prev, ...newPreviews }));
                }
              }
            }
          }
        } catch {
          // Silencioso — não bloquear o fluxo se a busca falhar
        }
      }

      setRestoredFileUrls(newRestoredUrls);
    } catch {}
    setShowResumeModal(false);
  };

  const handleStartFresh = () => {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(UPLOADED_FILES_KEY);
    setShowResumeModal(false);
  };

  // ===== CARRINHO =====
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [cartPendingProduct, setCartPendingProduct] = useState<Product | null>(null);

  const addToCart = (product: Product, option: ProductOption | null) => {
    const id = `${product.id}-${option?.id ?? 'none'}-${Date.now()}`;
    setCart(prev => [...prev, { id, product, option }]);
    toast.success(`"${product.name}" adicionado ao carrinho!`);
    setShowCart(true);
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleAddToCartClick = (product: Product) => {
    if (product.options.filter(o => o.isActive === 1).length > 0) {
      // Precisa escolher opção — abre o seletor de opção mas no modo carrinho
      setCartPendingProduct(product);
    } else {
      addToCart(product, null);
    }
  };

  const handleCartOptionSelect = (option: ProductOption) => {
    if (cartPendingProduct) {
      addToCart(cartPendingProduct, option);
      setCartPendingProduct(null);
    }
  };

  const startCartCheckout = () => {
    if (cart.length === 0) return;
    // Usa o primeiro item do carrinho para iniciar o fluxo
    const first = cart[0];
    setSelectedProduct(first.product);
    setSelectedOption(first.option);
    // Limpar uploads anteriores
    localStorage.removeItem(UPLOADED_FILES_KEY);
    setDocFiles({});
    setProfilePhoto(null); setProfilePhotoPreview(null);
    setCarDocument(null); setCarDocumentYear('');
    setAlvaraFile(null); setCondutaxiFile(null);
    setQuestionAnswers({});
    setShowCart(false);
    // Seguir o mesmo fluxo de etapas que handleOptionSelection
    const option = first.option;
    const product = first.product;
    const optType = option?.type?.toLowerCase();
    if (optType === 'pdf-only' || optType === 'pdf' || option?.isPdfOnly === 1) {
      setStep('pdf-upload');
    } else if (needsFileUpload(product, option)) {
      setStep('upload');
    } else if (option?.questions && option.questions.length > 0) {
      setStep('questions'); setCurrentQuestionIndex(0);
    } else {
      setStep('cadastro');
      setCadastroSubStep('dados');
    }
  };

  // ===== SORTEIO =====
  const { data: activeRaffle } = trpc.raffles.active.useQuery();
  const { data: raffleResult } = trpc.raffles.result.useQuery();
  const { data: raffleEntries } = trpc.raffles.entries.useQuery(
    { raffleId: activeRaffle?.id ?? 0 },
    { enabled: !!activeRaffle, refetchInterval: 10000 }
  );
  const clientPhoneForRaffle = typeof window !== 'undefined' ? localStorage.getItem('walk_client_phone') || '' : '';
  const { data: myRaffleEntry } = trpc.raffles.myEntry.useQuery(
    { raffleId: activeRaffle?.id ?? 0, phone: clientPhoneForRaffle },
    { enabled: !!activeRaffle && !!clientPhoneForRaffle }
  );
  const chooseNumberMutation = trpc.raffles.chooseNumber.useMutation();
  const [raffleSelectedNumber, setRaffleSelectedNumber] = useState<number | null>(null);
  const [raffleName, setRaffleName] = useState("");
  const [rafflePhone, setRafflePhone] = useState("");
  const [raffleSubmitting, setRaffleSubmitting] = useState(false);
  const [raffleSubmitted, setRaffleSubmitted] = useState(false);


  const handleRaffleSubmit = async () => {
    if (!activeRaffle || !raffleSelectedNumber) return;
    if (!raffleName.trim()) { toast.error("Informe seu nome"); return; }
    const phoneDigits = rafflePhone.replace(/\D/g, '');
    if (phoneDigits.length !== 11) { toast.error("Telefone deve ter 11 dígitos"); return; }
    setRaffleSubmitting(true);
    try {
      const res = await chooseNumberMutation.mutateAsync({
        raffleId: activeRaffle.id,
        number: raffleSelectedNumber,
        customerName: raffleName.trim(),
        customerPhone: phoneDigits,
      });
      if (res.success) {
        setRaffleSubmitted(true);
        toast.success("Número confirmado com sucesso!");
      } else {
        toast.error(res.error || "Erro ao confirmar número");
      }
    } catch (e: any) {
      toast.error("Erro ao confirmar número");
    } finally {
      setRaffleSubmitting(false);
    }
  };

  // Carregar dados do cliente a partir da sessão (já cadastrado no PasswordGate)
  const clientPhoneFromSession = typeof window !== 'undefined' ? localStorage.getItem('walk_client_phone') || '' : '';
  const [showMyData, setShowMyData] = useState(false);
  // Controle de acesso por produto
  const allowedProductsQuery = trpc.customers.getAllowedProducts.useQuery(
    { phone: clientPhoneFromSession },
    { enabled: !!clientPhoneFromSession }
  );
  const myProfileQuery = trpc.customers.getMyProfile.useQuery(
    { phone: clientPhoneFromSession },
    { enabled: !!clientPhoneFromSession && showMyData }
  );
  const customerCheck = trpc.customers.checkByPhone.useQuery(
    { phone: clientPhoneFromSession },
    { enabled: !!clientPhoneFromSession, staleTime: 0, refetchOnWindowFocus: true }
  );
  // Status do pedido do cliente
  const { data: activeBanners = [] } = trpc.banners.listActive.useQuery({ page: 'pedidos' });
  const { data: featureCardsList = [] } = trpc.featureCards.list.useQuery();
  const myStatusQuery = trpc.orderStatus.getMyStatus.useQuery(
    { phone: clientPhoneFromSession },
    { enabled: !!clientPhoneFromSession, refetchInterval: 60000 }
  );

  // Foto protegida
  const { data: _activeProtectedPhotoList } = trpc.protectedPhotos.getActive.useQuery();
  const activeProtectedPhoto = _activeProtectedPhotoList?.[0] ?? null;
  const [protectedPhotoPhone, setProtectedPhotoPhone] = useState("");
  const [protectedPhotoAccess, setProtectedPhotoAccess] = useState<boolean | null>(null);
  const [checkingPhotoAccess, setCheckingPhotoAccess] = useState(false);
  const [protectedPhotoExpanded, setProtectedPhotoExpanded] = useState(false);
  // Se já tem sessão, verificar acesso automaticamente
  const photoAccessQuery = trpc.protectedPhotos.checkAccess.useQuery(
    { phone: clientPhoneFromSession },
    { enabled: !!clientPhoneFromSession && !!activeProtectedPhoto }
  );

  // Busca automática por telefone digitado manualmente no formulário
  const [manualPhoneSearch, setManualPhoneSearch] = useState("");
  const [customerAutoFilled, setCustomerAutoFilled] = useState(false);
  const manualCustomerCheck = trpc.customers.checkByPhone.useQuery(
    { phone: manualPhoneSearch },
    { enabled: manualPhoneSearch.length >= 10 }
  );

  const updateEmailMutation = trpc.customers.updateEmailByPhone.useMutation();
  const updateReferralMutation = trpc.customers.updateReferral.useMutation();
  // Query de desconto de revendedor
  const resellerDiscountQuery = trpc.customers.getResellerDiscount.useQuery(
    { phone: clientPhoneFromSession },
    { enabled: !!clientPhoneFromSession, staleTime: 0 }
  );
  const resellerInfo = resellerDiscountQuery.data;

  useEffect(() => {
    if (customerCheck.data?.exists && customerCheck.data.customer) {
      setClientName(customerCheck.data.customer.name);
      setClientPhone(clientPhoneFromSession);
      setClientCity(customerCheck.data.customer.city || '');
      setClientEmail(customerCheck.data.customer.email || '');
      setReferrerName(customerCheck.data.customer.referredBy || '');
      setReferrerPhone(customerCheck.data.customer.referredByPhone || '');
    } else if (clientPhoneFromSession) {
      setClientPhone(clientPhoneFromSession);
    }
  }, [customerCheck.data, clientPhoneFromSession]);

  // Preencher campos quando cliente é encontrado pelo telefone digitado manualmente
  useEffect(() => {
    if (!manualCustomerCheck.data) return;
    if (manualCustomerCheck.data.exists && manualCustomerCheck.data.customer) {
      const c = manualCustomerCheck.data.customer;
      if (c.name) setClientName(c.name);
      if (c.city) setClientCity(c.city);
      if (c.email) setClientEmail(c.email);
      if (c.referredBy) setReferrerName(c.referredBy);
      setCustomerAutoFilled(true);
    }
  }, [manualCustomerCheck.data]);

  // Configurações dinâmicas do PIX
  const PIX_KEY = activePix?.pixKey || settings?.pix_key || "11915193551";
  const PIX_NAME = activePix?.pixName || settings?.pix_name || "Adiel Cardeal dos Santos";
  const PIX_BANK = activePix?.pixBank || settings?.pix_bank || "99Pay";

  const WHATSAPP_NUMBER_RAW = settings?.whatsapp_number || "5511978307371";
  const WHATSAPP_NUMBER = WHATSAPP_NUMBER_RAW.replace(/[^\d+]/g, '');
  const WHATSAPP_DISPLAY = settings?.whatsapp_display || "(11) 97830-7371";

  // Textos dinâmicos
  const HERO_TITLE = settings?.hero_title || '';
  const HERO_SUBTITLE = settings?.hero_subtitle || "";
  const HERO_BUTTON = settings?.hero_button_text || "";
  const botEnabled = settings?.bot_assistant_enabled !== '0';
  const SERVICES_TITLE = settings?.services_title || "";
  const SERVICES_SUBTITLE = settings?.services_subtitle || "";
  const FOOTER_TEXT = settings?.footer_text || "";
  const SITE_NAME = settings?.site_name || "WALK AJUDA";
  const VIDEO_URL = settings?.video_url || "";
  const [videoError, setVideoError] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  // Reset video error when URL changes
  useEffect(() => { setVideoError(false); setVideoLoaded(false); }, [VIDEO_URL]);
  const FEATURE1_TITLE = settings?.feature1_title || "";
  const FEATURE1_DESC = settings?.feature1_desc || "";
  const FEATURE2_TITLE = settings?.feature2_title || "";
  const FEATURE2_DESC = settings?.feature2_desc || "";
  const FEATURE3_TITLE = settings?.feature3_title || "";
  const FEATURE3_DESC = settings?.feature3_desc || "";

  const submitMutation = trpc.uploads.submitFiles.useMutation();
  const validateCouponMutation = trpc.coupons.validate.useMutation();
  const registerResellerOrderMutation = trpc.resellers.registerOrder.useMutation();
  const addBlockingNoteMutation = trpc.customers.addBlockingNote.useMutation();


  // Determinar se é fluxo PDF-only - agora vem da opção selecionada
  const isPDFOnly = selectedOption?.isPdfOnly === 1 || selectedProduct?.isPdfOnly === 1;
  const showVehicleWarning = selectedOption?.requireVehicle2016 === 1 || selectedProduct?.requireVehicle2016 === 1;

  // Documentos dinâmicos da opção selecionada
  const dynamicDocs = selectedOption?.documents || [];
  const hasDynamicDocs = dynamicDocs.length > 0;

  // Obter valor atual (usa tier se selecionado, caso contrário usa preço da opção)
  const getCurrentServiceValue = (): string => {
    if (selectedTier) return selectedTier.price;
    if (selectedOption) return selectedOption.price;
    return "Consulte";
  };

  // Calcula se o item atual tem promoção ativa (preço riscado)
  const hasActivePromotion = (): boolean => {
    // Se tem tier selecionado, verifica se o tier tem promoção
    if (selectedTier) return !!(selectedTier as any).originalPrice;
    // Se tem opção selecionada, verifica se a opção tem promoção
    if (selectedOption) return !!(selectedOption as any).originalPrice;
    return false;
  };

  // Calcula o desconto de revendedor para o valor atual
  // Retorna a % de desconto efetiva do revendedor para o produto atual:
  // prioridade: % do produto > % global do cadastro do revendedor
  const getEffectiveResellerDiscountPercent = (): number | null => {
    if (!resellerInfo?.isReseller) return null;
    // % do produto tem prioridade
    if (selectedProduct?.resellerDiscount != null && selectedProduct.resellerDiscount !== '') {
      const pct = parseFloat(String(selectedProduct.resellerDiscount));
      if (!isNaN(pct) && pct > 0) return pct;
    }
    // Fallback: % global do cadastro do revendedor (apenas tipo 'percent')
    if (resellerInfo.discountType === 'percent' && resellerInfo.discountValue > 0) {
      return resellerInfo.discountValue;
    }
    return null;
  };

  const getResellerDiscountAmount = (): number => {
    if (!resellerInfo?.isReseller) return 0;
    if (hasActivePromotion()) return 0; // promoção tem prioridade
    const rawValue = getCurrentServiceValue();
    const numericValue = parseFloat(rawValue.replace('R$ ', '').replace('.', '').replace(',', '.'));
    if (isNaN(numericValue)) return 0;
    // Usar % efetiva (produto ou global)
    const effectivePct = getEffectiveResellerDiscountPercent();
    if (effectivePct !== null) {
      return numericValue * effectivePct / 100;
    }
    // Fallback para desconto fixo global
    if (resellerInfo.discountType === 'fixed') {
      return Math.min(resellerInfo.discountValue, numericValue);
    }
    return 0;
  };

  const calculateDiscountedValue = (originalValue: string): string => {
    const numericValue = parseFloat(originalValue.replace('R$ ', '').replace('.', '').replace(',', '.'));
    if (isNaN(numericValue)) return originalValue;
    let discounted = numericValue;
    // Aplicar desconto de cupom
    if (couponDiscount) {
      if (couponDiscount.type === 'percentage') {
        discounted = discounted - (discounted * couponDiscount.value / 100);
      } else {
        discounted = discounted - couponDiscount.value;
      }
    }
    // Aplicar desconto de revendedor (se não tiver promoção)
    const resellerDiscount = getResellerDiscountAmount();
    if (resellerDiscount > 0) {
      discounted = discounted - resellerDiscount;
    }
    if (discounted < 0) discounted = 0;
    if (!couponDiscount && resellerDiscount === 0) return originalValue;
    return `R$ ${discounted.toFixed(2).replace('.', ',')}`;
  };

  const handleCopyPix = useCallback(() => {
    navigator.clipboard.writeText(PIX_KEY).then(() => {
      setPixCopied(true);
      toast.success("Chave PIX copiada!");
      setTimeout(() => setPixCopied(false), 3000);
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = PIX_KEY;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setPixCopied(true);
      toast.success("Chave PIX copiada!");
      setTimeout(() => setPixCopied(false), 3000);
    });
  }, [PIX_KEY]);

  const handlePaymentProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Limpar input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
    // Aceitar qualquer imagem (incluindo HEIC/HEIF do iPhone) e PDF
    const isImage = file.type.startsWith('image/') || file.type === '' || file.type === 'application/octet-stream';
    const isPdf = file.type === 'application/pdf';
    // Verificar pela extensão se o MIME não foi reconhecido
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff'];
    const isImageByExt = imageExts.includes(ext);
    if (!isImage && !isPdf && !isImageByExt) { toast.error('Formato não suportado. Use JPG, PNG, PDF ou captura de tela.'); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 25MB.'); return; }
    if (isPdf) {
      // PDF: usa direto, sem compressão
      setPaymentProof(file);
      setPaymentProofPreview('pdf');
      // Upload imediato ao S3
      void (async () => {
        const phone = clientPhone.trim() || 'temp';
        const result = await uploadFileToServer(file, 'comprovante-pix', phone);
        if (result) {
          saveUploadedFileUrl('paymentProof', result.url, result.mimeType);
          setRestoredFileUrls(prev => ({ ...prev, paymentProof: result.url }));
        }
      })();
      return;
    }
    // Imagem: comprimir para reduzir tamanho e converter HEIC/HEIF → JPEG (resolve falha de upload em celular)
    void (async () => {
      try {
        const compressed = await compressImageFile(file);
        setPaymentProof(compressed.file);
        setPaymentProofPreview(compressed.previewUrl);
        // Upload imediato ao S3
        const phone = clientPhone.trim() || 'temp';
        const result = await uploadFileToServer(compressed.file, 'comprovante-pix', phone);
        if (result) {
          saveUploadedFileUrl('paymentProof', result.url, result.mimeType);
          setRestoredFileUrls(prev => ({ ...prev, paymentProof: result.url }));
        }
      } catch {
        // Se a compressão falhar, usa o arquivo original como fallback
        setPaymentProof(file);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          setPaymentProofPreview(result && result.startsWith('data:') ? result : 'pdf');
        };
        reader.onerror = () => setPaymentProofPreview('pdf');
        reader.readAsDataURL(file);
        // Upload imediato ao S3 (fallback)
        const phone = clientPhone.trim() || 'temp';
        const uploadResult = await uploadFileToServer(file, 'comprovante-pix', phone);
        if (uploadResult) {
          saveUploadedFileUrl('paymentProof', uploadResult.url, uploadResult.mimeType);
          setRestoredFileUrls(prev => ({ ...prev, paymentProof: uploadResult.url }));
        }
      }
    })();
  };

  // Comprime uma imagem no navegador via canvas: redimensiona p/ máx 1600px, exporta JPEG ~0.8.
  // Converte HEIC/HEIF/PNG/etc para JPEG, eliminando problemas de upload em celulares.
  const compressImageFile = (file: File): Promise<{ file: File; previewUrl: string }> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      const timeout = setTimeout(() => { URL.revokeObjectURL(objectUrl); reject(new Error('timeout')); }, 20000);
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const MAX = 1600;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
            else { width = Math.round((width * MAX) / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('no ctx')); return; }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) { reject(new Error('no blob')); return; }
            const newName = (file.name.replace(/\.[^.]+$/, '') || 'comprovante') + '.jpg';
            const compressedFile = new File([blob], newName, { type: 'image/jpeg' });
            const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve({ file: compressedFile, previewUrl });
          }, 'image/jpeg', 0.8);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(objectUrl); reject(new Error('img load error')); };
      img.src = objectUrl;
    });
  };

  // Prepara um arquivo para upload: comprime imagens grandes (reduz falhas de upload em
  // celular/4G) e mantém PDFs intactos. Se a compressão falhar, retorna o arquivo original.
  const prepareForUpload = async (file: File): Promise<File> => {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) return file;
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff)$/i.test(file.name);
    if (!isImage) return file;
    // Só comprime se valer a pena (> 1.2MB) para não degradar imagens já pequenas.
    if (file.size <= 1.2 * 1024 * 1024) return file;
    try {
      const { file: compressed } = await compressImageFile(file);
      // Usa o menor entre original e comprimido.
      return compressed.size > 0 && compressed.size < file.size ? compressed : file;
    } catch {
      return file;
    }
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) { setCouponValid(null); setCouponDiscount(null); setCouponMessage(''); return; }
    setIsValidatingCoupon(true);
    try {
      const result = await validateCouponMutation.mutateAsync({ code: couponCode.trim() });
      if (result.valid) {
        setCouponValid(true);
        setCouponDiscount({ type: result.discountType!, value: result.discountValue! });
        const discountText = result.discountType === 'percentage'
          ? `${result.discountValue}% de desconto`
          : `R$ ${result.discountValue!.toFixed(2).replace('.', ',')} de desconto`;
        setCouponMessage(`Cupom válido! ${discountText}`);
        toast.success(`Cupom aplicado: ${discountText}`);
      } else {
        setCouponValid(false); setCouponDiscount(null);
        setCouponMessage(result.reason || 'Cupom inválido');
        toast.error(result.reason || 'Cupom inválido');
      }
    } catch { setCouponValid(false); setCouponDiscount(null); setCouponMessage('Erro ao validar cupom'); toast.error('Erro ao validar cupom'); }
    setIsValidatingCoupon(false);
  };

  // Upload de arquivo via JSON base64 (robusto em produção/celular).
  // O arquivo (já comprimido para JPEG no caso de imagens) é lido como base64
  // e enviado dentro de um JSON. SEM multipart/form-data — isso elimina as
  // falhas de upload no celular causadas pelo parsing de multipart no proxy.
  const uploadFileToServer = async (file: File, label: string, phone: string): Promise<{ url: string; fileKey: string; mimeType: string } | null> => {
    const MAX_RETRIES = 3;
    // Lê o arquivo como base64 puro (sem o prefixo data URI)
    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch (e) {
      console.error(`[Upload] Falha ao ler arquivo "${label}":`, e);
      return null;
    }
    if (!base64) {
      console.error(`[Upload] Arquivo vazio "${label}"`);
      return null;
    }
    const payload = {
      label,
      phone,
      data: base64,
      mimeType: file.type || 'image/jpeg',
      filename: file.name || `${label}.jpg`,
    };
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s (conexões móveis lentas)
        const res = await fetch('/api/upload/client-file-base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        return { url: data.fileUrl, fileKey: data.fileKey, mimeType: data.mimeType };
      } catch (e: any) {
        if (attempt === MAX_RETRIES) {
          console.error(`[Upload] Falha após ${MAX_RETRIES} tentativas para "${label}":`, e);
          return null;
        }
        await new Promise(r => setTimeout(r, 1000 * attempt)); // espera antes de retry
      }
    }
    return null;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    // Tenta ler o arquivo; em caso de erro, tenta novamente uma vez
    const tryRead = (attempt: number): Promise<string> => new Promise((resolve, reject) => {
      const timeoutMs = file.size > 5 * 1024 * 1024 ? 60000 : 30000; // 60s para arquivos > 5MB
      const timeout = setTimeout(() => reject(new Error(`Timeout ao ler arquivo (tentativa ${attempt})`)), timeoutMs);
      const reader = new FileReader();
      reader.onload = () => {
        clearTimeout(timeout);
        const result = reader.result as string;
        // Extrair base64 do data URL
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64 || '');
      };
      reader.onerror = () => { clearTimeout(timeout); reject(new Error(`Erro ao ler arquivo: ${file.name}`)); };
      reader.onabort = () => { clearTimeout(timeout); reject(new Error(`Leitura cancelada: ${file.name}`)); };
      try { reader.readAsDataURL(file); } catch (e) { clearTimeout(timeout); reject(e); }
    });
    return tryRead(1).catch(() => {
      // Retry automático após 500ms
      return new Promise(res => setTimeout(res, 500)).then(() => tryRead(2));
    });
  };

  const handleFinalSubmit = async () => {
    if (submitLockRef.current || isSubmitting) return;
    submitLockRef.current = true;

    if (!clientName.trim()) { toast.error('Preencha seu nome completo'); submitLockRef.current = false; return; }
    if (!clientPhone.trim()) { toast.error('Preencha seu telefone'); submitLockRef.current = false; return; }
    if (!clientCity.trim()) { toast.error('Preencha sua cidade'); submitLockRef.current = false; return; }
    if (!clientEmail.trim()) { toast.error('Preencha seu email para receber atualizações do pedido'); submitLockRef.current = false; return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail.trim())) { toast.error('Digite um email válido'); submitLockRef.current = false; return; }
    if (!paymentProof && !restoredFileUrls.paymentProof) { toast.error('Envie o comprovante de pagamento PIX'); submitLockRef.current = false; return; }

    // Validar perguntas obrigatórias (perguntas individuais por opção)
    const optQuestions = selectedOption?.questions || [];
    if (optQuestions.length > 0) {
      for (const q of optQuestions) {
        // Pular perguntas condicionais que não estão visíveis
        if (q.parentQuestionId) {
          const parentAnswer = questionAnswers[q.parentQuestionId]?.trim() || "";
          const isVisible = !q.triggerOption || parentAnswer === q.triggerOption;
          if (!isVisible) continue;
        }
        if (q.isRequired === 1 && !questionAnswers[q.id]?.trim()) {
          toast.error(`Responda: ${q.question}`);
          submitLockRef.current = false;
          return;
        }
      }
    }

    // Validar uploads: documentos dinâmicos ou legados
    if (hasDynamicDocs) {
      for (const doc of dynamicDocs) {
        // Aceitar File local OU URL já salva no servidor
        if (!docFiles[doc.id] && !restoredFileUrls.dynamicDocs[doc.id]) {
          toast.error(`Envie o documento: ${doc.label}`);
          submitLockRef.current = false;
          return;
        }
      }
    } else {
      const reqSource = selectedOption || selectedProduct;
      if (!isPDFOnly) {
        if (reqSource?.requireProfilePhoto === 1 && !profilePhoto && !restoredFileUrls.profilePhoto) { toast.error('Selecione a foto de perfil'); submitLockRef.current = false; return; }
        if (reqSource?.requireCarDocument === 1 && !carDocument && !restoredFileUrls.carDocument) { toast.error('Selecione o documento do carro'); submitLockRef.current = false; return; }
        if (reqSource?.requireAlvara === 1 && !alvaraFile && !restoredFileUrls.alvara) { toast.error('Selecione o Alvará'); submitLockRef.current = false; return; }
        if (reqSource?.requireCondutaxi === 1 && !condutaxiFile && !restoredFileUrls.condutaxi) { toast.error('Selecione o Condutaxi'); submitLockRef.current = false; return; }
      } else {
        if (!carDocument && !restoredFileUrls.carDocument) { toast.error('Selecione o documento PDF'); submitLockRef.current = false; return; }
      }
    }

    // Capturar se o cliente é NOVO antes de enviar o pedido
    // hasOrders = true significa que já fez pedido antes (não é primeiro pedido)
    const wasExistingCustomer = customerCheck.data?.hasOrders === true;
    setIsNewCustomerOrder(!wasExistingCustomer);

    setIsSubmitting(true);
    setSubmitProgress('Verificando dados...');
    try {
      const accessCode = localStorage.getItem('walk_access_code') || '';
      const cpTokenForSubmit = localStorage.getItem('cp_token') || '';
      // Verificar se tem alguma forma de autenticação válida
      if (!accessCode && !cpTokenForSubmit) {
        toast.error('Sessão expirada. Faça login novamente.');
        localStorage.removeItem('walk_access_granted');
        localStorage.removeItem('walk_access_code');
        localStorage.removeItem('walk_access_type');
        window.location.reload();
        submitLockRef.current = false; return;
      }

      const phone = clientPhone.trim();

      // ── NOVO FLUXO: Upload multipart direto (sem base64) ──────────────────────
      // Cada arquivo é enviado individualmente antes de finalizar o pedido.
      // Isso evita payloads gigantes que travam em celulares com 4G instável.
      // ─────────────────────────────────────────────────────────────────────────

      // Documentos dinâmicos
      const dynamicDocsArray: { label: string; url?: string; fileKey?: string; data?: string; mime?: string }[] = [];
      if (hasDynamicDocs) {
        const docsNeedingUpload = dynamicDocs.filter(d => docFiles[d.id] && !restoredFileUrls.dynamicDocs[d.id]);
        const totalDocs = docsNeedingUpload.length;
        let uploadedCount = 0;
        for (const doc of dynamicDocs) {
          if (restoredFileUrls.dynamicDocs[doc.id]) {
            // Já foi enviado ao S3 (upload imediato ou restaurado) — reutilizar URL
            dynamicDocsArray.push({ label: doc.label, url: restoredFileUrls.dynamicDocs[doc.id] });
          } else if (docFiles[doc.id]) {
            // Tem File local sem URL salva — fazer upload
            uploadedCount++;
            setSubmitProgress(`Enviando ${doc.label} (${uploadedCount}/${totalDocs})...`);
            const fileToSend = await prepareForUpload(docFiles[doc.id]);
            const uploaded = await uploadFileToServer(fileToSend, doc.label, phone);
            if (uploaded) {
              dynamicDocsArray.push({ label: doc.label, url: uploaded.url, fileKey: uploaded.fileKey, mime: uploaded.mimeType });
            } else {
              throw new Error('UPLOAD_FAILED');
            }
          }
        }
      }

      // Documentos legados (foto, CRLV, alvará, condutaxi) — sempre URL, nunca base64
      setSubmitProgress('Enviando documentos...');
      if (!hasDynamicDocs) {
        if (restoredFileUrls.profilePhoto) {
          dynamicDocsArray.push({ label: 'Foto de Perfil', url: restoredFileUrls.profilePhoto });
        } else if (profilePhoto) {
          const up = await uploadFileToServer(await prepareForUpload(profilePhoto), 'foto-perfil', phone);
          if (up) dynamicDocsArray.push({ label: 'Foto de Perfil', url: up.url, fileKey: up.fileKey, mime: up.mimeType });
          else throw new Error('UPLOAD_FAILED');
        }
        if (restoredFileUrls.carDocument) {
          dynamicDocsArray.push({ label: 'Documento do Carro', url: restoredFileUrls.carDocument });
        } else if (carDocument) {
          const up = await uploadFileToServer(await prepareForUpload(carDocument), 'documento-carro', phone);
          if (up) dynamicDocsArray.push({ label: 'Documento do Carro', url: up.url, fileKey: up.fileKey, mime: up.mimeType });
          else throw new Error('UPLOAD_FAILED');
        }
        if (restoredFileUrls.alvara) {
          dynamicDocsArray.push({ label: 'Alvará', url: restoredFileUrls.alvara });
        } else if (alvaraFile) {
          const up = await uploadFileToServer(await prepareForUpload(alvaraFile), 'alvara', phone);
          if (up) dynamicDocsArray.push({ label: 'Alvará', url: up.url, fileKey: up.fileKey, mime: up.mimeType });
          else throw new Error('UPLOAD_FAILED');
        }
        if (restoredFileUrls.condutaxi) {
          dynamicDocsArray.push({ label: 'Condutaxi', url: restoredFileUrls.condutaxi });
        } else if (condutaxiFile) {
          const up = await uploadFileToServer(await prepareForUpload(condutaxiFile), 'condutaxi', phone);
          if (up) dynamicDocsArray.push({ label: 'Condutaxi', url: up.url, fileKey: up.fileKey, mime: up.mimeType });
          else throw new Error('UPLOAD_FAILED');
        }
      }

      // Comprovante PIX — sempre envia como URL (nunca base64), evita problemas no Android
      let paymentProofUploadedUrl: string | undefined;
      if (restoredFileUrls.paymentProof) {
        // Comprovante já salvo no servidor (upload imediato ou restaurado) — reutilizar URL
        paymentProofUploadedUrl = restoredFileUrls.paymentProof;
      } else if (paymentProof) {
        setSubmitProgress('Enviando comprovante PIX...');
        const up = await uploadFileToServer(await prepareForUpload(paymentProof), 'comprovante-pix', phone);
        if (up) {
          paymentProofUploadedUrl = up.url;
        } else {
          throw new Error('UPLOAD_FAILED');
        }
      }

      // Normalizar MIME type do comprovante (HEIC/HEIF → image/jpeg para compatibilidade)
      const getProofMime = (f: File | null) => {
        if (!f) return undefined;
        if (f.type && f.type !== 'application/octet-stream' && f.type !== '') return f.type;
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        if (ext === 'pdf') return 'application/pdf';
        if (ext === 'png') return 'image/png';
        if (ext === 'webp') return 'image/webp';
        return 'image/jpeg'; // default para HEIC e outros formatos de imagem
      };

      // Montar respostas das perguntas (incluindo optionsMeta para preservar cores)
      // Filtrar perguntas condicionais que não estavam visíveis
      const isQVisibleFinal = (q: ProductQuestion): boolean => {
        if (!q.parentQuestionId) return true;
        const parentAnswer = questionAnswers[q.parentQuestionId]?.trim() || "";
        if (!q.triggerOption) return !!parentAnswer;
        return parentAnswer === q.triggerOption;
      };
      // Construir answersArray com ordenação hierárquica (pai → sub → sub-sub) e depth
      const allQs = selectedOption?.questions || [];
      const orderedAnswers: { question: string; answer: string; depth: number; optionsMeta?: string }[] = [];
      const addWithDepth = (q: ProductQuestion, depth: number) => {
        if (!isQVisibleFinal(q) || !questionAnswers[q.id]?.trim()) return;
        const base: { question: string; answer: string; depth: number; optionsMeta?: string } = { question: q.question, answer: questionAnswers[q.id], depth };
        if (q.fieldType === 'select' && q.options) {
          try { const parsed = JSON.parse(q.options); if (Array.isArray(parsed) && parsed[0]?.label !== undefined) base.optionsMeta = q.options; } catch {}
        }
        orderedAnswers.push(base);
        // Inserir filhos logo após o pai
        allQs.filter(c => c.parentQuestionId === q.id).sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach(child => addWithDepth(child, depth + 1));
      };
      allQs.filter(q => !q.parentQuestionId).sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach(root => addWithDepth(root, 0));
      const answersArray = orderedAnswers;

      // Se carrinho tem múltiplos itens, criar um pedido para cada item
      const cartItems = cart.length > 1 ? cart : null;

      if (cartItems) {
        // Gerar cartGroupId único para agrupar todos os itens deste carrinho
        const cartGroupId = `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        // Calcular total bruto do carrinho
        let cartTotalValue = 0;
        for (const item of cartItems) {
          const price = item.option?.price || '0';
          const num = parseFloat(price.replace('R$ ', '').replace('.', '').replace(',', '.'));
          if (!isNaN(num)) cartTotalValue += num;
        }
        // Calcular desconto do cupom sobre o total
        let cartCouponDiscountValue: number | undefined;
        if (couponDiscount) {
          if (couponDiscount.type === 'percentage') {
            cartCouponDiscountValue = cartTotalValue * couponDiscount.value / 100;
          } else {
            cartCouponDiscountValue = couponDiscount.value;
          }
        }
        // Enviar um pedido por item do carrinho
        setSubmitProgress(`Enviando pedido 1 de ${cartItems.length}...`);
        let successCount = 0;
        for (let i = 0; i < cartItems.length; i++) {
          const item = cartItems[i];
          setSubmitProgress(`Enviando pedido ${i + 1} de ${cartItems.length}: ${item.product.name}...`);
          // Calcular preço individual do item (sem desconto — o desconto é do carrinho todo)
          const itemRawPrice = item.option?.price || undefined;
          try {
            await submitMutation.mutateAsync({
              clientName: clientName.trim() || 'Cliente',
              service: item.product.name,
              nameOption: item.option?.label || 'N/A',
              referrerName: referrerName.trim() || undefined,
              referrerPhone: referrerPhone.trim() || undefined,
              bypassCode: bypassCode.trim() || undefined,
              // Documentos: apenas no primeiro item (cartItemIndex=0), os demais não têm docs próprios
              documents: i === 0 && dynamicDocsArray.length > 0 ? dynamicDocsArray : undefined,
              profilePhoto: undefined,
              carDocument: undefined,
              carDocumentMime: undefined,
              carDocumentYear: carDocumentYear || undefined,
              alvara: undefined,
              alvaraMime: undefined,
              condutaxi: undefined,
              condutaxiMime: undefined,
              phone,
              city: clientCity.trim(),
              email: clientEmail.trim(),
              accessCode: accessCode || undefined,
              cpToken: cpTokenForSubmit || undefined,
              couponCode: couponValid ? couponCode : undefined,
              // Comprovante PIX: apenas no primeiro item (cartItemIndex=0)
              paymentProof: undefined,
              paymentProofUrl: i === 0 ? paymentProofUploadedUrl : undefined,
              paymentProofMime: i === 0 ? getProofMime(paymentProof) : undefined,
              answers: answersArray.length > 0 ? JSON.stringify(answersArray) : undefined,
              docNameMode: item.option?.docNameMode || 'none',
              docCustomName: item.option?.docCustomName || '',
              price: itemRawPrice,
              thirdPartyName: thirdPartyName.trim() || undefined,
              thirdPartyPhone: thirdPartyPhone.trim() || undefined,
              resellerDiscountApplied: (() => { const d = getResellerDiscountAmount(); return d > 0 ? d : undefined; })(),
              // Campos de agrupamento de carrinho
              cartGroupId,
              cartTotal: cartTotalValue,
              cartCouponCode: couponValid ? couponCode : undefined,
              cartCouponDiscount: cartCouponDiscountValue,
              cartItemIndex: i,
            });
            successCount++;
          } catch (err) {
            console.error(`Erro ao enviar pedido ${i + 1}:`, err);
          }
        }
        setCart([]);
        // Salvar dados do pedido para mensagem WhatsApp
        const cartTotalPago = cartTotalValue - (cartCouponDiscountValue || 0);
        setSubmittedOrderData({
          cartItems: cartItems.map(item => ({
            service: item.product.name,
            nameOption: item.option?.label || 'N/A',
            price: item.option?.price || ''
          })),
          answers: answersArray,
          docs: dynamicDocsArray.filter(d => d.url).map(d => ({ label: d.label, url: d.url! })),
          totalValue: `R$ ${cartTotalPago.toFixed(2).replace('.', ',')}`,
          referrerName: referrerName.trim(),
          referrerPhone: referrerPhone.trim(),
          clientName: clientName.trim() || 'Cliente',
          clientPhone: phone,
          clientCity: clientCity.trim(),
        });
        // Sessão VIP mantida até o cliente confirmar no WhatsApp
        setSuccessMessage(`${successCount} pedido(s) enviado(s) com sucesso!`);
        setIsSubmitting(false);
        setPostOrderReferralStep(wasExistingCustomer ? 'done' : 'question');
        setStep("success");
        submitLockRef.current = false;
        return;
      }

      setSubmitProgress('Enviando pedido...');
      // Construir nameOption com tier de garantia se selecionado
      const nameOptionWithTier = selectedOption
        ? (selectedTier
          ? `${selectedOption.label} - Garantia: ${selectedTier.warrantyValue > 0 ? `${selectedTier.warrantyValue} ${selectedTier.warrantyType}` : (selectedTier.warrantyLabel || selectedTier.warrantyType)}${selectedTier.warrantyLabel && selectedTier.warrantyValue > 0 ? ` ${selectedTier.warrantyLabel}` : ''}`
          : selectedOption.label)
        : 'N/A';
      const result = await submitMutation.mutateAsync({
        clientName: clientName.trim() || 'Cliente',
        service: selectedProduct?.name || 'Não especificado',
        nameOption: nameOptionWithTier,
        referrerName: referrerName.trim() || undefined,
        referrerPhone: referrerPhone.trim() || undefined,
        bypassCode: bypassCode.trim() || undefined,
        documents: dynamicDocsArray.length > 0 ? dynamicDocsArray : undefined,
        profilePhoto: undefined,
        carDocument: undefined,
        carDocumentMime: undefined,
        carDocumentYear: carDocumentYear || undefined,
        alvara: undefined,
        alvaraMime: undefined,
        condutaxi: undefined,
        condutaxiMime: undefined,
        phone,
        city: clientCity.trim(),
        email: clientEmail.trim(),
        accessCode: accessCode || undefined,
        cpToken: cpTokenForSubmit || undefined,
        couponCode: couponValid ? couponCode : undefined,
        paymentProof: undefined,
        paymentProofUrl: paymentProofUploadedUrl,
        paymentProofMime: getProofMime(paymentProof),
        answers: answersArray.length > 0 ? JSON.stringify(answersArray) : undefined,
        docNameMode: selectedOption?.docNameMode || 'none',
        docCustomName: selectedOption?.docCustomName || '',
        price: (() => {
          const rawPrice = selectedTier?.price || selectedOption?.price;
          if (!rawPrice) return undefined;
          const resellerDiscount = getResellerDiscountAmount();
          return (couponDiscount || resellerDiscount > 0) ? calculateDiscountedValue(rawPrice) : rawPrice;
        })(),
        thirdPartyName: thirdPartyName.trim() || undefined,
        thirdPartyPhone: thirdPartyPhone.trim() || undefined,
        resellerDiscountApplied: (() => {
          const d = getResellerDiscountAmount();
          return d > 0 ? d : undefined;
        })(),
      });

      if (result.success) {
        // Registrar pedido do revendedor se houver slug ativo
        if (activeResellerSlug && result.registrationId && selectedOption) {
          try {
            await registerResellerOrderMutation.mutateAsync({
              resellerSlug: activeResellerSlug,
              registrationId: result.registrationId,
              customerPhone: phone,
              optionId: selectedOption.id,
            });
          } catch (e) { /* silencioso — não bloqueia o fluxo */ }
        }
        // Salvar dados do pedido para mensagem WhatsApp
        const singlePrice = (() => {
          const rawPrice = selectedTier?.price || selectedOption?.price;
          if (!rawPrice) return '';
          const resellerDiscount = getResellerDiscountAmount();
          return (couponDiscount || resellerDiscount > 0) ? calculateDiscountedValue(rawPrice) : rawPrice;
        })();
        setSubmittedOrderData({
          cartItems: [{
            service: selectedProduct?.name || 'N/A',
            nameOption: selectedOption?.label || 'N/A',
            price: singlePrice,
          }],
          answers: answersArray,
          docs: dynamicDocsArray.filter(d => d.url).map(d => ({ label: d.label, url: d.url! })),
          totalValue: singlePrice,
          referrerName: referrerName.trim(),
          referrerPhone: referrerPhone.trim(),
          clientName: clientName.trim() || 'Cliente',
          clientPhone: phone,
          clientCity: clientCity.trim(),
        });
        // Sessão VIP mantida até o cliente confirmar no WhatsApp
        setSuccessMessage('Arquivos enviados com sucesso!');
        if ((result as any).trackingPin) setTrackingPinFromServer((result as any).trackingPin);
        setIsSubmitting(false);
        setPostOrderReferralStep(wasExistingCustomer ? 'done' : 'question');
        setStep("success");
        submitLockRef.current = false;
        return;
      } else {
        toast.error(result.message || 'Erro ao enviar');
      }
    } catch (error: any) {
      console.error('Erro no envio:', error);
      const msg = error?.message || 'Erro ao enviar. Tente novamente.';
      if (msg.includes('Timeout') || msg.includes('timeout') || msg.includes('network') || msg.includes('Network')) {
        toast.error('Conexão lenta. Verifique sua internet e tente novamente.', { duration: 6000 });
      } else if (msg === 'UPLOAD_FAILED') {
        // Upload de algum arquivo falhou — orientar reenvio (pode ser arquivo muito grande ou conexão instável)
        toast.error('Não foi possível enviar um dos arquivos. Tente uma foto menor/mais leve ou reenvie em uma conexão mais estável.', { duration: 9000 });
      } else if (msg.includes('ler arquivo') || msg.includes('Leitura') || msg.includes('cancelada')) {
        // Limpar o comprovante para forçar nova seleção
        setPaymentProof(null);
        setPaymentProofPreview(null);
        toast.error('Não foi possível ler o arquivo. Por favor, selecione o comprovante novamente.', { duration: 8000 });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    } finally {
      setIsSubmitting(false);
      setSubmitProgress('');
      submitLockRef.current = false;
    }
  };

  const needsFileUpload = (product: Product | null, option?: ProductOption | null): boolean => {
    // Se tem opção selecionada, verificar documentos dinâmicos primeiro
    if (option) {
      if (option.documents && option.documents.length > 0) return true;
      return option.requireProfilePhoto === 1 ||
        option.requireCarDocument === 1 ||
        option.requireAlvara === 1 ||
        option.requireCondutaxi === 1;
    }
    // Fallback para produto (sem opções)
    if (!product) return false;
    return product.requireProfilePhoto === 1 ||
      product.requireCarDocument === 1 ||
      product.requireAlvara === 1 ||
      product.requireCondutaxi === 1;
  };

  const handleOptionSelection = (option: ProductOption, tier?: WarrantyTier | null) => {
    setSelectedOption(option);
    setSelectedTier(tier || null);
    setDocFiles({});
    setProfilePhoto(null); setProfilePhotoPreview(null);
    setCarDocument(null); setCarDocumentYear('');
    setAlvaraFile(null); setCondutaxiFile(null);
    setQuestionAnswers({});
    setRestoredFileUrls({ dynamicDocs: {} });
    localStorage.removeItem(UPLOADED_FILES_KEY);
    const optType = option.type?.toLowerCase();
    if (optType === 'pdf-only' || optType === 'pdf' || option.isPdfOnly === 1) {
      setStep("pdf-upload");
    } else if (needsFileUpload(selectedProduct, option)) {
      setStep("upload");
    } else if (option.questions && option.questions.length > 0) {
      setStep("questions"); setCurrentQuestionIndex(0);
    } else {
      setStep("cadastro"); setCadastroSubStep('dados');
    }
  };

  const handleServiceClick = (product: Product) => {
    setSelectedProduct(product);
    setSelectedOption(null);
    setSelectedTier(null);
    setQuestionAnswers({});
    setDocFiles({});
    setProfilePhoto(null); setProfilePhotoPreview(null);
    setCarDocument(null); setCarDocumentYear('');
    setAlvaraFile(null); setCondutaxiFile(null);
    setRestoredFileUrls({ dynamicDocs: {} });
    localStorage.removeItem(UPLOADED_FILES_KEY);
    if (product.options.length === 0) {
      // Sem opções - sem perguntas
      setSelectedOption(null);
      if (product.isPdfOnly === 1) {
        setStep("pdf-upload");
      } else if (needsFileUpload(product, null)) {
        setStep("upload");
      } else {
        setStep("cadastro"); setCadastroSubStep('dados');
      }
    } else {
      setStep("name-select");
    }
  };

  const resetAllStates = useCallback(() => {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(UPLOADED_FILES_KEY);
    setStep("home"); setSelectedProduct(null); setSelectedOption(null);
    setProfilePhoto(null); setProfilePhotoPreview(null);
    setCarDocument(null); setCarDocumentYear("");
    setAlvaraFile(null); setCondutaxiFile(null);
    setDocFiles({});
    setClientName(''); setClientPhone(''); setClientCity('');
    setReferrerName(''); setReferrerPhone('');
    setSuccessMessage(''); setCouponCode(''); setCouponValid(null);
    setCouponDiscount(null); setCouponMessage('');
    setPaymentProof(null); setPaymentProofPreview(null);
    setPixCopied(false); setIsSubmitting(false); setShowExamplePhoto(false);
    setQuestionAnswers({});
    submitLockRef.current = false;
    setPostOrderReferralStep('question');
    setPostOrderReferralPhone('');
    setPostOrderReferralName('');
    setPostOrderReferralError('');
    setPostOrderReferralSaving(false);
    setIsNewCustomerOrder(false);
    setRestoredFileUrls({ dynamicDocs: {} });
  }, []);

  const originalValue = getCurrentServiceValue();
  const hasResellerDiscount = getResellerDiscountAmount() > 0;
  const finalValue = (couponDiscount || hasResellerDiscount) ? calculateDiscountedValue(originalValue) : originalValue;

  // Calcular valor total do carrinho (quando há múltiplos itens)
  const cartTotal = useMemo(() => {
    if (cart.length <= 1) return null;
    let total = 0;
    for (const item of cart) {
      const price = item.option?.price || '0';
      const num = parseFloat(price.replace('R$ ', '').replace('.', '').replace(',', '.'));
      if (!isNaN(num)) total += num;
    }
    return total;
  }, [cart]);

  const cartTotalFormatted = cartTotal !== null ? `R$ ${cartTotal.toFixed(2).replace('.', ',')}` : null;
  const cartTotalWithDiscount = (cartTotal !== null && (couponDiscount || hasResellerDiscount)) ? calculateDiscountedValue(cartTotalFormatted!) : cartTotalFormatted;
  // Valor a exibir no PIX: total do carrinho ou valor do produto individual
  const pixValue = cart.length > 1 ? ((couponDiscount || hasResellerDiscount) ? cartTotalWithDiscount : cartTotalFormatted) : ((couponDiscount || hasResellerDiscount) ? finalValue : originalValue);

  useEffect(() => {
    if (profilePhoto) {
      const url = URL.createObjectURL(profilePhoto);
      setProfilePhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    } else if (!restoredFileUrls.profilePhoto) {
      // Só limpa preview se NÃO houver URL restaurada do banco
      setProfilePhotoPreview(null);
    }
  }, [profilePhoto, restoredFileUrls.profilePhoto]);

  const EXAMPLE_PHOTO_URL = settings?.example_photo_url || "https://d2xsxph8kpxj0f.cloudfront.net/310519663543456340/RjBUSWZB6B8QJu724zr2z2/exemplo-foto-perfil_5421e597.png";
  const displayPhotoUrl = profilePhotoPreview || EXAMPLE_PHOTO_URL;
  const isClientPhoto = !!profilePhotoPreview;

  // Detectar se um documento dinâmico é "Foto de Perfil" pelo label
  const isProfilePhotoDoc = (label: string): boolean => {
    const normalized = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized.includes('foto') && (normalized.includes('perfil') || normalized.includes('profile'));
  };

  // Gerar previews para documentos dinâmicos (imagens)
  useEffect(() => {
    const newPreviews: Record<number, string> = {};
    const toRevoke: string[] = [];
    Object.entries(docFiles).forEach(([idStr, file]) => {
      const id = Number(idStr);
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        newPreviews[id] = url;
      }
    });
    // Preservar previews restaurados do banco (URLs do servidor) que não foram substituídos por File local
    Object.entries(restoredFileUrls.dynamicDocs).forEach(([idStr, serverUrl]) => {
      const id = Number(idStr);
      if (!newPreviews[id]) {
        newPreviews[id] = serverUrl;
      }
    });
    // Preservar preview do carro restaurado
    if (restoredFileUrls.carDocument && !newPreviews[-1]) {
      newPreviews[-1] = restoredFileUrls.carDocument;
    }
    // Revocar URLs antigas (apenas objectURLs criadas localmente, não URLs do servidor)
    Object.values(docFilePreviews).forEach(url => {
      if (url.startsWith('blob:') && !Object.values(newPreviews).includes(url)) toRevoke.push(url);
    });
    setDocFilePreviews(newPreviews);
    return () => { toRevoke.forEach(url => URL.revokeObjectURL(url)); };
  }, [docFiles, restoredFileUrls.dynamicDocs, restoredFileUrls.carDocument]);

  // ========== COMPONENTES DE UPLOAD REUTILIZÁVEIS ==========
  const renderPhotoExample = () => (
    <div className="bg-blue-900/40 border border-blue-500/40 rounded-xl p-3">
      <p className="text-blue-300 font-bold text-sm mb-2 text-center">{isClientPhoto ? "Sua foto de perfil" : "Exemplo de foto de perfil"} <span className="text-blue-400/70 text-xs">(toque para ampliar)</span>:</p>
      <div className="flex items-start gap-3">
        <div className={`w-20 h-20 rounded-full overflow-hidden flex-shrink-0 border-2 ${isClientPhoto ? 'border-green-400' : 'border-blue-400'} shadow-lg cursor-pointer hover:scale-105 transition-all duration-200 relative group`}
          onClick={() => setShowExamplePhoto(true)}>
          <img src={displayPhotoUrl} alt={isClientPhoto ? "Sua foto" : "Exemplo"} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div>
          {isClientPhoto ? (
            <div className="text-green-300 text-xs space-y-0.5">
              <p className="font-bold text-green-400">Foto selecionada!</p>
              <p>{profilePhoto?.name}</p>
            </div>
          ) : (
            <ul className="text-blue-200/80 text-xs space-y-0.5">
              <li>Foto frontal do rosto, bem iluminada</li>
              <li>Sem óculos escuros ou boné</li>
              <li>Fundo neutro (parede branca ou clara)</li>
              <li>Somente você na foto</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const renderProfilePhotoInput = (inputId: string) => {
    const cameraInputId = `${inputId}-camera`;
    const galleryInputId = `${inputId}-gallery`;
    
    return (
      <div>
        <label className="block text-black font-semibold mb-2 bg-white px-2 py-1 rounded">Foto de Perfil OBRIGATÓRIO</label>
        
        <input 
          type="file" 
          id={cameraInputId} 
          accept="image/*" 
          capture="user"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) { 
                toast.error("Foto deve ser JPG, PNG ou WebP"); 
                return; 
              }
              setProfilePhoto(file); 
              toast.success(`Foto ${file.name} selecionada`);
              // Upload imediato ao S3
              void (async () => {
                const phone = clientPhone.trim() || 'temp';
                const prepared = await prepareForUpload(file);
                const result = await uploadFileToServer(prepared, 'foto-perfil', phone);
                if (result) {
                  saveUploadedFileUrl('profilePhoto', result.url, result.mimeType);
                  setRestoredFileUrls(prev => ({ ...prev, profilePhoto: result.url }));
                }
              })();
            }
            e.target.value = '';
          }}
        />
        
        <input 
          type="file" 
          id={galleryInputId} 
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) { 
                toast.error("Foto deve ser JPG, PNG ou WebP"); 
                return; 
              }
              setProfilePhoto(file); 
              toast.success(`Foto ${file.name} selecionada`);
              // Upload imediato ao S3
              void (async () => {
                const phone = clientPhone.trim() || 'temp';
                const prepared = await prepareForUpload(file);
                const result = await uploadFileToServer(prepared, 'foto-perfil', phone);
                if (result) {
                  saveUploadedFileUrl('profilePhoto', result.url, result.mimeType);
                  setRestoredFileUrls(prev => ({ ...prev, profilePhoto: result.url }));
                }
              })();
            }
            e.target.value = '';
          }}
        />
        
        <div className="flex gap-2">
          <button 
            onClick={() => document.getElementById(cameraInputId)?.click()}
            className="flex-1 px-4 py-2 bg-blue-600 border border-blue-700 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm">
            📷 Câmera
          </button>
          <button 
            onClick={() => document.getElementById(galleryInputId)?.click()}
            className="flex-1 px-4 py-2 bg-purple-600 border border-purple-700 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm">
            🖼️ Galeria
          </button>
        </div>
        
        {profilePhoto ? (
          <div className="mt-2 text-green-400 text-sm font-semibold flex items-center gap-2">
            ✓ {profilePhoto.name}
          </div>
        ) : restoredFileUrls.profilePhoto ? (
          <div className="mt-2 text-green-400 text-sm font-semibold flex items-center gap-2">
            ✅ Foto já enviada anteriormente
          </div>
        ) : null}
      </div>
    );
  };

  const renderVehicleWarning = () => {
    if (!showVehicleWarning) return null;
    return (
      <div className="bg-amber-900/40 border border-amber-500/50 rounded-xl p-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <Car className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-300 font-bold text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> ATENÇÃO</p>
            <p className="text-amber-200/80 text-xs mt-0.5">O veículo deve ser a partir do <strong className="text-amber-100">ano 2016</strong>.</p>
          </div>
        </div>
      </div>
    );
  };

  const renderCarDocInput = (inputId: string) => (
    <div>
      <label className="block text-black font-semibold mb-2 bg-white px-2 py-1 rounded">Documento do Carro (PDF ou JPG) OBRIGATÓRIO</label>
      <input type="file" id={inputId} accept=".pdf,.jpg,.jpeg" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (!["application/pdf", "image/jpeg", "image/jpg"].includes(file.type)) { toast.error("Deve ser PDF ou JPG"); return; }
            setCarDocument(file); toast.success(`Documento ${file.name} selecionado`);
            // Upload imediato ao S3
            void (async () => {
              const phone = clientPhone.trim() || 'temp';
              const prepared = await prepareForUpload(file);
              const result = await uploadFileToServer(prepared, 'documento-carro', phone);
              if (result) {
                saveUploadedFileUrl('carDocument', result.url, result.mimeType);
                setRestoredFileUrls(prev => ({ ...prev, carDocument: result.url }));
              }
            })();
          }
        }}
      />
      <button onClick={() => document.getElementById(inputId)?.click()}
        className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${(carDocument || restoredFileUrls.carDocument) ? 'bg-green-700 border-green-600 text-green-200' : 'bg-red-700 border-red-800 hover:bg-red-800 text-green-400'}`}>
        📎 {carDocument ? carDocument.name : restoredFileUrls.carDocument ? '✅ Já enviado' : "Selecionar Documento"}
      </button>
    </div>
  );

  const renderExtras = () => {
    const reqSrc = selectedOption || selectedProduct;
    const extras = [];
    if (reqSrc?.requireAlvara === 1) {
      extras.push(
        <div key="alvara">
          <label className="block text-black font-semibold mb-2 bg-white px-2 py-1 rounded">Alvará (PDF ou JPG) OBRIGATÓRIO</label>
          <input type="file" id="alvara-upload" accept=".pdf,.jpg,.jpeg" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (!["application/pdf", "image/jpeg", "image/jpg"].includes(file.type)) { toast.error("Alvará deve ser PDF ou JPG"); return; }
                setAlvaraFile(file); toast.success(`Alvará ${file.name} selecionado`);
                // Upload imediato ao S3
                void (async () => {
                  const phone = clientPhone.trim() || 'temp';
                  const prepared = await prepareForUpload(file);
                  const result = await uploadFileToServer(prepared, 'alvara', phone);
                  if (result) {
                    saveUploadedFileUrl('alvara', result.url, result.mimeType);
                    setRestoredFileUrls(prev => ({ ...prev, alvara: result.url }));
                  }
                })();
              }
            }}
          />
          <button onClick={() => document.getElementById("alvara-upload")?.click()}
            className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${(alvaraFile || restoredFileUrls.alvara) ? 'bg-green-700 border-green-600 text-green-200' : 'bg-red-700 border-red-800 hover:bg-red-800 text-green-400'}`}>
            📎 {alvaraFile ? alvaraFile.name : restoredFileUrls.alvara ? '✅ Já enviado' : "Selecionar Alvará"}
          </button>
        </div>
      );
    }
    if (reqSrc?.requireCondutaxi === 1) {
      extras.push(
        <div key="condutaxi">
          <label className="block text-black font-semibold mb-2 bg-white px-2 py-1 rounded">Condutaxi (PDF ou JPG) OBRIGATÓRIO</label>
          <input type="file" id="condutaxi-upload" accept=".pdf,.jpg,.jpeg" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (!["application/pdf", "image/jpeg", "image/jpg"].includes(file.type)) { toast.error("Condutaxi deve ser PDF ou JPG"); return; }
                setCondutaxiFile(file); toast.success(`Condutaxi ${file.name} selecionado`);
                // Upload imediato ao S3
                void (async () => {
                  const phone = clientPhone.trim() || 'temp';
                  const prepared = await prepareForUpload(file);
                  const result = await uploadFileToServer(prepared, 'condutaxi', phone);
                  if (result) {
                    saveUploadedFileUrl('condutaxi', result.url, result.mimeType);
                    setRestoredFileUrls(prev => ({ ...prev, condutaxi: result.url }));
                  }
                })();
              }
            }}
          />
          <button onClick={() => document.getElementById("condutaxi-upload")?.click()}
            className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${(condutaxiFile || restoredFileUrls.condutaxi) ? 'bg-green-700 border-green-600 text-green-200' : 'bg-red-700 border-red-800 hover:bg-red-800 text-green-400'}`}>
            📎 {condutaxiFile ? condutaxiFile.name : restoredFileUrls.condutaxi ? '✅ Já enviado' : "Selecionar Condutaxi"}
          </button>
        </div>
      );
    }
    return extras;
  };

  const renderQuestions = () => {
    const qs = selectedOption?.questions || [];
    if (qs.length === 0) return null;

    // Determinar quais perguntas estão visíveis com base nas respostas atuais
    const isQuestionVisible = (q: ProductQuestion): boolean => {
      if (!q.parentQuestionId) return true; // sem pai = sempre visível
      const parentAnswer = questionAnswers[q.parentQuestionId]?.trim() || "";
      if (!q.triggerOption) return !!parentAnswer; // qualquer resposta ativa
      return parentAnswer === q.triggerOption;
    };

    return (
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
        <p className="text-purple-400 font-bold text-sm mb-3 text-center">INFORMAÇÕES ADICIONAIS</p>
        <div className="space-y-3">
          {qs.filter(q => isQuestionVisible(q)).map(q => (
            <div key={q.id} ref={el => { questionRefs.current[q.id] = el; }}>
              <Label className="text-white mb-1 block text-xs">
                {q.question} {q.isRequired === 1 && <span className="text-red-400">*</span>}
              </Label>
              {q.fieldType === 'select' && q.options ? (() => {
                // Verificar se as opções têm cores (formato JSON enriquecido)
                let parsedOpts: Array<{ label: string; color: string | null }> | null = null;
                try {
                  const p = JSON.parse(q.options!);
                  if (Array.isArray(p) && p[0]?.label !== undefined) parsedOpts = p;
                } catch {}
                if (parsedOpts) {
                  return (
                    <div className="flex flex-wrap gap-2">
                      {parsedOpts.map((opt, i) => {
                        const isSelected = questionAnswers[q.id] === opt.label;
                        const color = opt.color || '#6b7280';
                        const isBlocking = (opt as any).blocking === true;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setQuestionAnswers(prev => ({ ...prev, [q.id]: opt.label }));
                              if (isBlocking) {
                                // Registrar aviso no cadastro do cliente
                                const phone = clientPhone || '';
                                if (phone) {
                                  addBlockingNoteMutation.mutate({ phone, question: q.question, answer: opt.label });
                                }
                                // Deslogar imediatamente
                                localStorage.removeItem('walk_access_granted');
                                localStorage.removeItem('walk_access_code');
                                localStorage.removeItem('walk_access_type');
                                localStorage.removeItem('walk_access_expires');
                                localStorage.removeItem('vip_allowed_products');
                                localStorage.removeItem('walk_client_phone');
                                setBlockedByQuestion({ question: q.question, answer: opt.label });
                              } else {
                                // Limpar bloqueio se mudou para opção não-bloqueante
                                setBlockedByQuestion(null);
                                scrollToNextQuestion(q.id, qs, opt.label);
                              }
                            }}
                            className="px-4 py-2 rounded-xl text-sm font-bold transition-all border-2"
                            style={{
                              backgroundColor: isSelected ? color : color + '22',
                              color: isSelected ? '#fff' : color,
                              borderColor: color,
                              transform: (highlightedAnswer?.qId === q.id && highlightedAnswer?.label === opt.label) ? 'scale(1.15)' : isSelected ? 'scale(1.05)' : 'scale(1)',
                              boxShadow: (highlightedAnswer?.qId === q.id && highlightedAnswer?.label === opt.label) ? `0 0 24px ${color}cc` : isSelected ? `0 0 12px ${color}66` : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <select
                    value={questionAnswers[q.id] || ""}
                    onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', textAlign: 'center', border: '2px double #000', borderRadius: '8px', padding: '8px 12px', width: '100%', fontWeight: 500 }}
                  >
                    <option value="">Selecione...</option>
                    {(() => {
                      let opts: string[] = [];
                      try {
                        const p = JSON.parse(q.options!);
                        if (Array.isArray(p)) opts = p.map((o: any) => typeof o === 'string' ? o : (o.label || String(o)));
                        else opts = q.options!.split(',').map(o => o.trim()).filter(Boolean);
                      } catch {
                        opts = q.options!.split(',').map(o => o.trim()).filter(Boolean);
                      }
                      return opts.map((opt, i) => <option key={i} value={opt}>{opt}</option>);
                    })()}
                  </select>
                );
              })() : q.fieldType === 'textarea' ? (
                <textarea
                  value={questionAnswers[q.id] || ""}
                  onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Digite aqui..."
                  className="w-full rounded-md p-2 text-sm"
                  style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px double #000' }}
                  rows={3}
                />
              ) : (
                <Input
                  type="text"
                  value={questionAnswers[q.id] || ""}
                  onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Digite aqui..."
                  className="border-2 text-center placeholder-black/50"
                  style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', borderStyle: 'double', borderColor: '#000' }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasQuestions = selectedOption?.questions && selectedOption.questions.length > 0;

  const validateUploadsAndProceed = () => {
    // Validar documentos dinâmicos
    if (hasDynamicDocs) {
      for (const doc of dynamicDocs) {
        // Aceitar File local OU URL já salva no servidor
        if (!docFiles[doc.id] && !restoredFileUrls.dynamicDocs[doc.id]) {
          toast.error(`Envie o documento: ${doc.label}`);
          return;
        }
      }
    } else {
      const reqSrc = selectedOption || selectedProduct;
      if (reqSrc?.requireProfilePhoto === 1 && !profilePhoto && !restoredFileUrls.profilePhoto) { toast.error('Selecione a foto de perfil'); return; }
      if (reqSrc?.requireCarDocument === 1 && !carDocument && !restoredFileUrls.carDocument) { toast.error('Selecione o documento do carro'); return; }
      if (reqSrc?.requireAlvara === 1 && !alvaraFile && !restoredFileUrls.alvara) { toast.error('Selecione o Alvará'); return; }
      if (reqSrc?.requireCondutaxi === 1 && !condutaxiFile && !restoredFileUrls.condutaxi) { toast.error('Selecione o Condutaxi'); return; }
    }
    if (hasQuestions) { setStep("questions"); setCurrentQuestionIndex(0); } else { setStep("cadastro"); setCadastroSubStep('dados'); }
  };

  // ========== RENDER ==========
  return (
    <div className="min-h-screen bg-background">

      {/* ========== TELA DE ESCOLHA MANIFESTO ========== */}
      {botEnabled && showBotChoice && (
        <div className="fixed inset-0 z-[9995] flex flex-col items-center justify-center bg-zinc-950 px-6">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-2xl shadow-primary/30">
              <Zap className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">{SITE_NAME}</h1>
            <p className="text-zinc-400 text-sm">O que você deseja fazer?</p>
          </div>

          {/* Opções */}
          <div className="w-full max-w-sm space-y-3">
            {/* Botão Colombia Bot */}
            <button
              onClick={() => { setShowBotChoice(false); setShowColombiaBot(true); }}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-violet-500/30"
            >
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-2xl">🤖</span>
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-white text-base">FAZER PEDIDO COM COLOMBIA</p>
                <p className="text-xs text-violet-200 mt-0.5">Sou guiado passo a passo pelo assistente</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>

            {/* Botão Manual */}
            <button
              onClick={() => setShowBotChoice(false)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-[0.98] transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-700 flex items-center justify-center shrink-0">
                <span className="text-2xl">📋</span>
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-white text-base">FAZER PEDIDO MANUALMENTE</p>
                <p className="text-xs text-zinc-400 mt-0.5">Prefiro navegar e escolher sozinho</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* ========== MODAL DE PROPAGANDA OBRIGATÓRIA ========== */}
      {adVisible && adCampaign && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ border: '1.5px solid rgba(0,200,255,0.35)', boxShadow: '0 0 40px 4px rgba(0,180,255,0.15), 0 8px 32px rgba(0,0,0,0.8)', maxWidth: '520px', maxHeight: '96vh' }}
          >
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 border border-white/10">
              <span className="text-xs text-gray-300 font-medium">Exibição obrigatória</span>
            </div>
            <div className="bg-[#080c1e] flex flex-col">
              {adCampaign.type === 'image' && adCampaign.imageUrl ? (
                <img src={adCampaign.imageUrl} alt={adCampaign.title || 'Propaganda'} className="w-full object-contain" style={{ maxHeight: '55vh', minHeight: '200px' }} />
              ) : adCampaign.type === 'video' && adCampaign.videoUrl ? (
                <div className="w-full relative bg-black" style={{ maxHeight: '60vh' }}>
                  <video
                    src={adCampaign.videoUrl}
                    className="w-full object-contain"
                    style={{ display: 'block', maxHeight: '60vh', width: '100%' }}
                    autoPlay playsInline muted crossOrigin="anonymous"
                    ref={(el) => { if (el) { el.muted = false; el.play().catch(() => { el.muted = true; el.play().catch(() => {}); }); } }}
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.duration && v.duration > 0) {
                        const pct = Math.min(100, Math.round((v.currentTime / v.duration) * 100));
                        setAdProgress(pct);
                        if (pct >= 100) setAdCanClose(true);
                      }
                    }}
                    onEnded={(e) => {
                      setAdProgress(100);
                      const v = e.currentTarget;
                      const videoDuration = v.duration || 0;
                      const required = adCampaign.requiredSeconds || 20;
                      if (videoDuration <= required) { setTimeout(() => setAdVisible(false), 300); }
                      else { setAdCanClose(true); }
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-gradient-to-br from-blue-900/40 to-cyan-900/30">
                  <span className="text-4xl">📢</span>
                </div>
              )}
              {(adCampaign.title || adCampaign.description) && (
                <div className="px-4 pt-3 pb-1">
                  {adCampaign.title && <p className="text-white font-bold text-base">{adCampaign.title}</p>}
                  {adCampaign.description && <p className="text-gray-400 text-sm mt-0.5">{adCampaign.description}</p>}
                </div>
              )}
              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{adCanClose ? 'Propaganda concluída' : `Encerrando em ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s`}</span>
                  <span className="text-xs font-bold" style={{ color: adProgress < 30 ? '#ef4444' : adProgress < 70 ? '#f59e0b' : adProgress < 100 ? '#00d4ff' : '#22c55e' }}>{adProgress}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: `${adProgress}%`, background: adProgress < 30 ? 'linear-gradient(90deg, #ef4444, #f97316)' : adProgress < 70 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : adProgress < 100 ? 'linear-gradient(90deg, #00d4ff, #0ea5e9)' : 'linear-gradient(90deg, #22c55e, #4ade80)' }} />
                </div>
                {adCampaign.linkUrl && (
                  <a href={adCampaign.linkUrl} target={adCampaign.linkTarget || '_blank'} rel="noopener noreferrer" className="mt-3 block w-full text-center py-2 rounded-lg text-sm font-semibold text-white transition-all" style={{ background: 'linear-gradient(90deg, #0ea5e9, #06b6d4)', boxShadow: '0 0 16px rgba(14,165,233,0.3)' }}>
                    {adCampaign.linkText || 'Saiba Mais'}
                  </a>
                )}
                <button onClick={() => adCanClose && setAdVisible(false)} disabled={!adCanClose} className="mt-3 w-full py-2.5 rounded-lg text-sm font-semibold transition-all" style={{ background: adCanClose ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: adCanClose ? '#fff' : '#555', border: adCanClose ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.05)', cursor: adCanClose ? 'pointer' : 'not-allowed' }}>
                  {adCanClose ? 'Fechar propaganda ✕' : `Aguarde ${Math.ceil((adCampaign.requiredSeconds || 20) * (1 - adProgress / 100))}s para fechar`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: RETOMADA DE PROGRESSO ========== */}
      {showResumeModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="backdrop-blur-md border border-yellow-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl" style={{ backgroundColor: 'rgba(10, 10, 30, 0.97)' }}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">⏸️</div>
              <h3 className="text-xl font-bold text-white">Pedido em andamento</h3>
              <p className="text-white/60 text-sm mt-1">Você tem um pedido não finalizado:</p>
              <div className="mt-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-300 font-semibold text-sm">{savedProgressLabel}</p>
              </div>
            </div>
            <p className="text-white/70 text-sm text-center mb-5">Deseja continuar de onde parou ou começar um novo pedido?</p>
            <div className="space-y-3">
              <button
                onClick={restoreProgress}
                className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all duration-200 text-sm"
              >
                ▶️ Continuar de onde parei
              </button>
              <button
                onClick={handleStartFresh}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white/80 font-semibold rounded-xl transition-all duration-200 text-sm"
              >
                🔄 Começar do início
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal FAQ */}
      {showFaqModal && faqData && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowFaqModal(false)}>
          <div
            className="w-full max-w-lg rounded-t-2xl overflow-hidden shadow-2xl"
            style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-start justify-between" style={{ backgroundColor: faqData.config.headerColor }}>
              <div>
                <h2 className="font-bold text-lg leading-tight" style={{ color: faqData.config.headerTextColor }}>
                  {faqData.config.title}
                </h2>
                {faqData.config.subtitle && (
                  <p className="text-sm mt-1 opacity-80" style={{ color: faqData.config.headerTextColor }}>
                    {faqData.config.subtitle}
                  </p>
                )}
              </div>
              <button onClick={() => setShowFaqModal(false)} className="ml-3 mt-0.5 opacity-70 hover:opacity-100" style={{ color: faqData.config.headerTextColor }}>
                <X size={22} />
              </button>
            </div>
            {/* Perguntas */}
            <div className="bg-gray-900 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              {faqData.items.map((item, idx) => (
                <div key={item.id} className="border-b border-gray-800 last:border-0">
                  <button
                    className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-gray-800/50 transition-colors"
                    onClick={() => setFaqOpenIndex(faqOpenIndex === idx ? null : idx)}
                  >
                    <span className="font-semibold text-sm" style={{ color: faqData.config.accentColor }}>
                      ❓ {item.question}
                    </span>
                    <ChevronDown
                      size={16}
                      className="shrink-0 text-gray-400 transition-transform duration-200"
                      style={{ transform: faqOpenIndex === idx ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                  </button>
                  {faqOpenIndex === idx && (
                    <div className="px-5 pb-4">
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox - legado */}
      {showExamplePhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowExamplePhoto(false)}>
          <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowExamplePhoto(false)} className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center text-black font-bold text-lg shadow-lg hover:bg-gray-200 z-10">X</button>
            <img src={displayPhotoUrl} alt="Foto" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* Lightbox - documentos dinâmicos (foto de perfil) */}
      {showDocPhotoPreview !== null && (() => {
        const activeDoc = dynamicDocs.find(d => d.id === showDocPhotoPreview);
        const docPreviewUrl = docFilePreviews[showDocPhotoPreview] || activeDoc?.exampleImageUrl || EXAMPLE_PHOTO_URL;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowDocPhotoPreview(null)}>
            <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowDocPhotoPreview(null)} className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center text-black font-bold text-lg shadow-lg hover:bg-gray-200 z-10">X</button>
              <img src={docPreviewUrl} alt="Foto" className="w-full rounded-2xl shadow-2xl" />
            </div>
          </div>
        );
      })()}

      {/* ========== MODAL: SELEÇÃO DE OPÇÃO ========== */}
      {step === "name-select" && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="backdrop-blur-md border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 10, 30, 0.95)' }}>
            {faqData?.config?.enabled === 1 && faqData.items.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => { setShowFaqModal(true); setFaqOpenIndex(null); }}
                  style={{
                    backgroundColor: faqData.config.buttonColor,
                    color: faqData.config.buttonTextColor,
                    boxShadow: `0 0 16px ${faqData.config.buttonColor}88`
                  }}
                  className="w-full px-4 py-3 rounded-xl font-black text-sm flex flex-col items-center justify-center gap-1 animate-pulse hover:animate-none hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white/30"
                >
                  <span className="font-black text-sm text-center leading-snug w-full">{faqData.config.buttonLabel}</span>
                  <span className="text-base animate-bounce">👉 Clique aqui</span>
                </button>
              </div>
            )}
            <h3 className="text-2xl font-bold text-white mb-2">Selecione uma Opção</h3>
            <p className="text-white/70 mb-4">{selectedProduct.name}</p>
            <div className="space-y-3">
              {selectedProduct.options.filter(o => o.isActive === 1).map((option, optIdx) => {
                const hasTiers = (option.warrantyTiers || []).length > 0;
                const headerColors = [
                  { bg: 'linear-gradient(90deg,#ff6b00,#ff9500)', text: '#fff', shadow: '#ff6b0066' },
                  { bg: 'linear-gradient(90deg,#7c3aed,#a855f7)', text: '#fff', shadow: '#7c3aed66' },
                  { bg: 'linear-gradient(90deg,#0ea5e9,#06b6d4)', text: '#fff', shadow: '#0ea5e966' },
                  { bg: 'linear-gradient(90deg,#16a34a,#22c55e)', text: '#fff', shadow: '#16a34a66' },
                  { bg: 'linear-gradient(90deg,#e11d48,#f43f5e)', text: '#fff', shadow: '#e11d4866' },
                ];
                const hc = headerColors[optIdx % headerColors.length];
                return (
                  <div key={option.id} className="rounded-xl overflow-hidden" style={{ border: '2px solid rgba(255,255,255,0.15)', boxShadow: `0 0 18px ${hc.shadow}` }}>
                    {/* Cabeçalho da opção */}
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: hc.bg }}>
                      <span className="font-black text-base tracking-wide" style={{ color: hc.text, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>{option.label}</span>
                      {!hasTiers && (
                        <div className="flex items-center gap-2">
                          {option.originalPrice && option.originalPrice.trim() !== '' && (
                            <span className="text-white font-semibold text-sm" style={{ textDecoration: 'line-through', textDecorationColor: '#ef4444', textDecorationThickness: '2px', opacity: 0.85 }}>{option.originalPrice}</span>
                          )}
                          <span className="font-bold text-white text-sm" style={{ backgroundColor: option.originalPrice && option.originalPrice.trim() !== '' ? '#16a34a' : '#e60000', padding: '3px 10px', borderRadius: '4px' }}>{resellerPriceMap[option.id] || option.price}</span>
                        </div>
                      )}
                    </div>
                    {/* Especificação/Descrição da opção */}
                    {(option as any).description && (option as any).description.trim() !== '' && (
                      <div className="px-4 py-2 bg-cyan-950/30 border-t border-cyan-500/20">
                        <p className="text-cyan-200 text-xs leading-relaxed whitespace-pre-line">{(option as any).description}</p>
                      </div>
                    )}
                    {/* Garantia da opção (legado - texto simples) */}
                    {!hasTiers && (option as any).warranty && (option as any).warranty.trim() !== '' && (
                      <div className="px-4 py-1.5 bg-emerald-900/30 border-t border-emerald-500/20 flex items-center gap-1.5">
                        <span className="text-emerald-400 text-xs">🛡️</span>
                        <span className="text-emerald-300 text-xs font-medium">Garantia: {(option as any).warranty}</span>
                      </div>
                    )}
                    {/* Tiers de Garantia - seletor de garantia com preço dinâmico */}
                    {hasTiers && (
                      <div className="px-4 py-3 bg-emerald-950/30 border-t border-emerald-500/20 space-y-2">
                        <p className="text-emerald-400 text-xs font-bold">🛡️ Escolha a Garantia:</p>
                        <div className="space-y-1.5">
                          {(option.warrantyTiers || []).map(tier => {
                            const tierLabel = tier.warrantyValue > 0
                              ? `${tier.warrantyValue} ${tier.warrantyType}${tier.warrantyLabel ? ` ${tier.warrantyLabel}` : ''}`
                              : (tier.warrantyLabel || tier.warrantyType);
                            const isSelected = selectedOption?.id === option.id && selectedTier?.id === tier.id;
                            return (
                              <div
                                key={tier.id}
                                onClick={() => { setSelectedOption(option); setSelectedTier(tier); }}
                                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                                  isSelected
                                    ? 'border-emerald-400 bg-emerald-500/20'
                                    : 'border-white/10 bg-white/5 hover:border-emerald-500/50 hover:bg-emerald-900/20'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    isSelected ? 'border-emerald-400 bg-emerald-400' : 'border-white/30'
                                  }`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                  </div>
                                  <span className="text-white text-xs font-medium">{tierLabel}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {tier.originalPrice && tier.originalPrice.trim() !== '' && (
                                    <span className="text-white/50 text-xs line-through">{tier.originalPrice}</span>
                                  )}
                                  <span className="font-bold text-white text-xs" style={{ backgroundColor: tier.originalPrice && tier.originalPrice.trim() !== '' ? '#16a34a' : '#e60000', padding: '2px 8px', borderRadius: '4px' }}>{tier.price}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Aviso de garantia obrigatória */}
                    {hasTiers && !(selectedOption?.id === option.id && selectedTier) && (
                      <div className="px-4 py-2 bg-red-900/30 border-t border-red-500/30">
                        <p className="text-red-400 text-xs font-semibold text-center">⚠️ Selecione uma garantia para continuar</p>
                      </div>
                    )}
                    {/* Botões de ação */}
                    {(() => {
                      const tierSelected = !hasTiers || (selectedOption?.id === option.id && !!selectedTier);
                      return (
                        <div className="flex gap-0">
                          <button
                            disabled={!tierSelected}
                            onClick={() => {
                              if (hasTiers) {
                                const tier = selectedOption?.id === option.id ? selectedTier : null;
                                if (tier) handleOptionSelection(option, tier);
                              } else {
                                handleOptionSelection(option, null);
                              }
                            }}
                            className={`flex-1 px-3 py-2.5 font-bold text-sm transition-all border-r border-gray-200 ${
                              tierSelected
                                ? 'bg-white hover:bg-gray-100 text-black cursor-pointer'
                                : 'bg-gray-600/40 text-gray-400 cursor-not-allowed opacity-50'
                            }`}>
                            COMPRAR
                          </button>
                          <button
                            disabled={!tierSelected}
                            onClick={() => {
                              if (!tierSelected) return;
                              addToCart(selectedProduct, option);
                              setStep("home");
                            }}
                            className={`flex-1 px-3 py-2.5 font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
                              tierSelected
                                ? 'bg-primary/20 hover:bg-primary/30 text-primary cursor-pointer'
                                : 'bg-gray-600/20 text-gray-500 cursor-not-allowed opacity-50'
                            }`}>
                            <ShoppingCart className="w-4 h-4" />
                            CARRINHO
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              <button onClick={() => setStep("home")}
                className="w-full px-4 py-3 font-semibold rounded-lg transition-all duration-300 hover:opacity-90 bg-white/10 text-white/70 hover:bg-white/20">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ========== MODAL: UPLOAD DE ARQUIVOS ========== */}
      {step === "upload" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="backdrop-blur-md border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 10, 30, 0.95)' }}>
            <h3 className="text-2xl font-bold text-white mb-2">Enviar Arquivos</h3>
            <p className="text-white/70 mb-6">Selecione seus arquivos</p>
            <div className="space-y-4">
              {/* Documentos dinâmicos (novo sistema) */}
              {hasDynamicDocs ? (
                <>
                  {dynamicDocs.map(doc => {
                    const isPhotoProfile = isProfilePhotoDoc(doc.label);
                    const hasCustomExample = !!doc.exampleImageUrl;
                    const hasFile = !!docFiles[doc.id] || !!restoredFileUrls.dynamicDocs[doc.id];
                    const previewUrl = docFilePreviews[doc.id];
                    // Prioridade: preview do cliente > foto exemplo personalizada > foto exemplo padrão (só para foto de perfil)
                    const docExampleUrl = doc.exampleImageUrl || (isPhotoProfile ? EXAMPLE_PHOTO_URL : null);
                    const docDisplayUrl = previewUrl || docExampleUrl;
                    const isClientPhotoDoc = hasFile && !!previewUrl;
                    const showPhotoPreview = (isPhotoProfile || hasCustomExample) && !!docDisplayUrl;

                    return (
                      <div key={doc.id}>
                        {/* Se tem foto exemplo (personalizada ou padrão para foto de perfil), mostrar modelo/preview */}
                        {showPhotoPreview && (
                          <div className="bg-blue-900/40 border border-blue-500/40 rounded-xl p-3 mb-2">
                            <p className="text-blue-300 font-bold text-sm mb-2 text-center">
                              {isClientPhotoDoc ? (isPhotoProfile ? "Sua foto de perfil" : "Seu arquivo") : (isPhotoProfile ? "Exemplo de foto de perfil" : `Exemplo: ${doc.label}`)}
                              <span className="text-blue-400/70 text-xs"> (toque para ampliar)</span>
                            </p>
                            <div className="flex items-start gap-3">
                              <div className={`w-20 h-20 rounded-full overflow-hidden flex-shrink-0 border-2 ${isClientPhotoDoc ? 'border-green-400' : 'border-blue-400'} shadow-lg cursor-pointer hover:scale-105 transition-all duration-200 relative group`}
                                onClick={() => setShowDocPhotoPreview(doc.id)}>
                                <img src={docDisplayUrl} alt={isClientPhotoDoc ? "Sua foto" : "Exemplo"} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                                  <ImageIcon className="w-5 h-5 text-white" />
                                </div>
                              </div>
                              <div>
                                {isClientPhotoDoc ? (
                                  <div className="text-green-300 text-xs space-y-0.5">
                                    <p className="font-bold text-green-400">{isPhotoProfile ? 'Foto selecionada!' : 'Arquivo selecionado!'}</p>
                                    <p>{docFiles[doc.id]?.name || '✅ Já enviado anteriormente'}</p>
                                  </div>
                                ) : (doc as any).exampleText && (doc as any).exampleText.trim() !== '' ? (
                                  <p className="text-blue-200/80 text-xs whitespace-pre-line leading-relaxed">{(doc as any).exampleText}</p>
                                ) : isPhotoProfile ? (
                                  <ul className="text-blue-200/80 text-xs space-y-0.5">
                                    <li>Foto frontal do rosto, bem iluminada</li>
                                    <li>Sem óculos escuros ou boné</li>
                                    <li>Fundo neutro (parede branca ou clara)</li>
                                    <li>Somente você na foto</li>
                                  </ul>
                                ) : (
                                  <p className="text-blue-200/80 text-xs">Envie o documento conforme o exemplo ao lado</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <label className="block text-black font-semibold mb-2 bg-white px-2 py-1 rounded">{doc.label} OBRIGATÓRIO</label>
                        {/* Instrução do documento */}
                        {(doc as any).instruction && (doc as any).instruction.trim() !== '' && (
                          <div className="mb-2 px-3 py-2 rounded-lg bg-amber-900/40 border border-amber-500/40">
                            <p className="text-amber-200 text-xs leading-relaxed whitespace-pre-line">📌 {(doc as any).instruction}</p>
                          </div>
                        )}
                        
                        {/* Renderizar inputs de câmera e galeria conforme inputSource */}
                        {(doc.inputSource === 'both' || doc.inputSource === 'camera') && (
                          <input type="file" id={`doc-upload-${doc.id}-camera`} accept={isPhotoProfile ? ".jpg,.jpeg" : ".jpg,.jpeg,.png,.pdf,.webp"} capture="user" className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 10MB.'); return; }
                                if (isPhotoProfile && !["image/jpeg", "image/jpg"].includes(file.type)) { toast.error("Foto de perfil deve ser JPG"); return; }
                                setDocFiles(prev => ({ ...prev, [doc.id]: file }));
                                toast.success(`${doc.label}: ${file.name} selecionado`);
                                // Upload imediato ao S3 e salvar URL no localStorage
                                void (async () => {
                                  const phone = clientPhone.trim() || 'temp';
                                  const prepared = await prepareForUpload(file);
                                  const result = await uploadFileToServer(prepared, doc.label, phone);
                                  if (result) {
                                    saveUploadedFileUrl(`doc_${doc.id}`, result.url, result.mimeType);
                                    setRestoredFileUrls(prev => ({ ...prev, dynamicDocs: { ...prev.dynamicDocs, [doc.id]: result.url } }));
                                  }
                                })();
                              }
                            }}
                          />
                        )}
                        {(doc.inputSource === 'both' || doc.inputSource === 'gallery') && (
                          <input type="file" id={`doc-upload-${doc.id}-gallery`} accept={isPhotoProfile ? ".jpg,.jpeg" : ".jpg,.jpeg,.png,.pdf,.webp"} className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 10MB.'); return; }
                                if (isPhotoProfile && !["image/jpeg", "image/jpg"].includes(file.type)) { toast.error("Foto de perfil deve ser JPG"); return; }
                                setDocFiles(prev => ({ ...prev, [doc.id]: file }));
                                toast.success(`${doc.label}: ${file.name} selecionado`);
                                // Upload imediato ao S3 e salvar URL no localStorage
                                void (async () => {
                                  const phone = clientPhone.trim() || 'temp';
                                  const prepared = await prepareForUpload(file);
                                  const result = await uploadFileToServer(prepared, doc.label, phone);
                                  if (result) {
                                    saveUploadedFileUrl(`doc_${doc.id}`, result.url, result.mimeType);
                                    setRestoredFileUrls(prev => ({ ...prev, dynamicDocs: { ...prev.dynamicDocs, [doc.id]: result.url } }));
                                  }
                                })();
                              }
                            }}
                          />
                        )}
                        
                        {/* Mostrar botões conforme inputSource */}
                        {doc.inputSource === 'both' ? (
                          <div className="flex gap-2">
                            <button onClick={() => document.getElementById(`doc-upload-${doc.id}-camera`)?.click()}
                              className={`flex-1 px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${hasFile ? 'bg-green-700 border-green-600 text-green-200' : 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700'}`}>
                              📷 Câmera
                            </button>
                            <button onClick={() => document.getElementById(`doc-upload-${doc.id}-gallery`)?.click()}
                              className={`flex-1 px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${hasFile ? 'bg-green-700 border-green-600 text-green-200' : 'bg-purple-600 border-purple-700 text-white hover:bg-purple-700'}`}>
                              🖼️ Galeria
                            </button>
                          </div>
                        ) : doc.inputSource === 'camera' ? (
                          <button onClick={() => document.getElementById(`doc-upload-${doc.id}-camera`)?.click()}
                            className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${hasFile ? 'bg-green-700 border-green-600 text-green-200' : 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700'}`}>
                            📷 {hasFile ? (docFiles[doc.id]?.name || '✅ Já enviado') : `Tirar Foto - ${doc.label}`}
                          </button>
                        ) : doc.inputSource === 'gallery' ? (
                          <button onClick={() => document.getElementById(`doc-upload-${doc.id}-gallery`)?.click()}
                            className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${hasFile ? 'bg-green-700 border-green-600 text-green-200' : 'bg-purple-600 border-purple-700 text-white hover:bg-purple-700'}`}>
                            🖼️ {hasFile ? (docFiles[doc.id]?.name || '✅ Já enviado') : `Selecionar Galeria - ${doc.label}`}
                          </button>
                        ) : (
                          <button onClick={() => document.getElementById(`doc-upload-${doc.id}-gallery`)?.click()}
                            className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${hasFile ? 'bg-green-700 border-green-600 text-green-200' : 'bg-red-600 border-red-700 text-green-400 hover:bg-red-700'}`}>
                            📎 {hasFile ? (docFiles[doc.id]?.name || '✅ Já enviado') : `Selecionar ${doc.label}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  {/* Campos legados */}
                  {(selectedOption?.requireProfilePhoto === 1 || (!selectedOption && selectedProduct?.requireProfilePhoto === 1)) && renderPhotoExample()}
                  {(selectedOption?.requireProfilePhoto === 1 || (!selectedOption && selectedProduct?.requireProfilePhoto === 1)) && renderProfilePhotoInput("profile-photo-upload")}
                  {renderVehicleWarning()}
                  {(selectedOption?.requireCarDocument === 1 || (!selectedOption && selectedProduct?.requireCarDocument === 1)) && renderCarDocInput("car-doc-upload")}
                  {renderExtras()}
                </>
              )}
              <button onClick={validateUploadsAndProceed}
                className="w-full px-4 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105 mt-4">
                PRÓXIMO
              </button>
              <button onClick={() => {
                setSelectedOption(null); setDocFiles({}); setDocFilePreviews({}); setShowDocPhotoPreview(null); setStep("name-select");
                setProfilePhoto(null); setCarDocument(null); setCarDocumentYear(""); setAlvaraFile(null); setCondutaxiFile(null);
              }} className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all duration-300">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: UPLOAD PDF-ONLY ========== */}
      {step === "pdf-upload" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="backdrop-blur-md border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 10, 30, 0.95)' }}>
            <h3 className="text-2xl font-bold text-white mb-2">Enviar Documento PDF</h3>
            <p className="text-white/70 mb-6">Selecione seu documento</p>
            <div className="space-y-4">
              <div>
                <label className="block text-white font-semibold mb-2">Documento (PDF)</label>
                <input type="file" id="pdf-doc-upload" accept=".pdf" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.type !== "application/pdf") { toast.error("Arquivo deve ser PDF"); return; }
                      setCarDocument(file); toast.success(`Documento ${file.name} selecionado`);
                      // Upload imediato ao S3
                      void (async () => {
                        const phone = clientPhone.trim() || 'temp';
                        const result = await uploadFileToServer(file, 'documento-carro', phone);
                        if (result) {
                          saveUploadedFileUrl('carDocument', result.url, result.mimeType);
                          setRestoredFileUrls(prev => ({ ...prev, carDocument: result.url }));
                        }
                      })();
                    }
                  }}
                />
                <button onClick={() => document.getElementById("pdf-doc-upload")?.click()}
                  className={`w-full px-4 py-2 border font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 text-sm ${(carDocument || restoredFileUrls.carDocument) ? 'bg-green-700 border-green-600 text-green-200' : 'bg-black border-white/20 hover:bg-white/10 text-white'}`}>
                  📎 {carDocument ? carDocument.name : restoredFileUrls.carDocument ? '✅ Já enviado' : "Selecionar PDF"}
                </button>
              </div>
              {selectedProduct?.showYearField === 1 && (
                <div>
                  <label className="block text-white font-semibold mb-2">Qual ano deseja colocar no documento?</label>
                  <select value={carDocumentYear} onChange={(e) => setCarDocumentYear(e.target.value)}
                    style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '18px', textAlign: 'center', border: '3px double #000', borderRadius: '8px', padding: '8px 12px', width: '100%', fontWeight: 500, cursor: 'pointer' }}>
                    <option value="">Selecione o ano</option>
                    {Array.from({ length: new Date().getFullYear() - 2015 }, (_, i) => 2016 + i).reverse().map(year => (
                      <option key={year} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </div>
              )}
              <button onClick={() => {
                if (!carDocument && !restoredFileUrls.carDocument) { toast.error("Selecione um documento PDF"); return; }
                if (selectedProduct?.showYearField === 1 && !carDocumentYear) { toast.error("Selecione o ano"); return; }
                if (hasQuestions) { setStep("questions"); setCurrentQuestionIndex(0); } else { setStep("cadastro"); setCadastroSubStep('dados'); }
              }} className="w-full px-4 py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105">
                Próximo
              </button>
              <button onClick={() => { setStep("name-select"); setCarDocument(null); setCarDocumentYear(""); }}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all duration-300">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: PERGUNTAS DO PRODUTO ========== */}
      {step === "questions" && (() => {
        const allQsModal = selectedOption?.questions || [];

        // Constrói lista ordenada: perguntas raiz em ordem, sub-perguntas logo após o pai
        const buildOrderedQs = (answers: Record<number, string>): ProductQuestion[] => {
          const roots = allQsModal.filter(q => !q.parentQuestionId).sort((a, b) => a.sortOrder - b.sortOrder);
          const result: ProductQuestion[] = [];
          for (const root of roots) {
            result.push(root);
            // Inserir sub-perguntas visíveis logo após o pai
            const subs = allQsModal
              .filter(q => q.parentQuestionId === root.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            for (const sub of subs) {
              const parentAnswer = answers[root.id]?.trim() || "";
              const isVisible = !sub.triggerOption || parentAnswer === sub.triggerOption;
              if (isVisible) {
                result.push(sub);
                // Inserir sub-sub-perguntas visíveis logo após a sub-pergunta pai
                const subSubs = allQsModal
                  .filter(q => q.parentQuestionId === sub.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                for (const subSub of subSubs) {
                  const subAnswer = answers[sub.id]?.trim() || "";
                  const isSubVisible = !subSub.triggerOption || subAnswer === subSub.triggerOption;
                  if (isSubVisible) result.push(subSub);
                }
              }
            }
          }
          return result;
        };

        const visibleQs = buildOrderedQs(questionAnswers);
        const totalQs = visibleQs.length;
        const safeIndex = Math.min(currentQuestionIndex, Math.max(0, totalQs - 1));
        const currentQ = visibleQs[safeIndex];
        const isLastQuestion = safeIndex === totalQs - 1;
        const progressPct = totalQs > 0 ? Math.round(((safeIndex) / totalQs) * 100) : 0;

        // Calcula o próximo índice considerando sub-perguntas que podem aparecer após responder
        const getNextIndex = (newAnswers: Record<number, string>): number => {
          const nextList = buildOrderedQs(newAnswers);
          // Encontrar a posição atual na nova lista
          const currentIdInNew = nextList.findIndex(q => q.id === currentQ?.id);
          if (currentIdInNew === -1) return safeIndex + 1;
          return currentIdInNew + 1;
        };

        const goToNext = () => {
          if (!currentQ) return;
          if (currentQ.isRequired === 1 && !questionAnswers[currentQ.id]?.trim()) {
            toast.error(`Preencha: ${currentQ.question}`);
            return;
          }
          if (isLastQuestion) {
            if (blockedByQuestion) {
              toast.error('Não é possível continuar. Você selecionou uma opção que impede o pedido.');
              return;
            }
            const missing = visibleQs.find(q => q.isRequired === 1 && !questionAnswers[q.id]?.trim());
            if (missing) { toast.error(`Preencha: ${missing.question}`); return; }
            setStep("cadastro"); setCadastroSubStep('dados');
          } else {
            setCurrentQuestionIndex(safeIndex + 1);
          }
        };

        const renderQuestionInput = (q: typeof currentQ) => {
          if (!q) return null;
          if (q.fieldType === 'select' && q.options) {
            let parsedOpts2: Array<{ label: string; color: string | null }> | null = null;
            try {
              const p2 = JSON.parse(q.options!);
              if (Array.isArray(p2) && p2[0]?.label !== undefined) parsedOpts2 = p2;
            } catch {}
            if (parsedOpts2) {
              return (
                <div className="flex flex-col gap-3 w-full">
                  {parsedOpts2.map((opt, i) => {
                    const isSelected2 = questionAnswers[q.id] === opt.label;
                    const isBlocking2 = (opt as any).blocking === true;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setQuestionAnswers(prev => ({ ...prev, [q.id]: opt.label }));
                          if (isBlocking2) {
                            const phone = clientPhone || '';
                            if (phone) {
                              addBlockingNoteMutation.mutate({ phone, question: q.question, answer: opt.label });
                            }
                            localStorage.removeItem('walk_access_granted');
                            localStorage.removeItem('walk_access_code');
                            localStorage.removeItem('walk_access_type');
                            localStorage.removeItem('walk_access_expires');
                            localStorage.removeItem('vip_allowed_products');
                            localStorage.removeItem('walk_client_phone');
                            setBlockedByQuestion({ question: q.question, answer: opt.label });
                          } else {
                            setBlockedByQuestion(null);
                            // Auto-avança para próxima pergunta após breve delay
                            // Usa getNextIndex com as novas respostas para incluir sub-perguntas que acabaram de ficar visíveis
                            const newAnswers = { ...questionAnswers, [q.id]: opt.label };
                            const nextIdx = getNextIndex(newAnswers);
                            const nextList = buildOrderedQs(newAnswers);
                            setTimeout(() => {
                              if (nextIdx < nextList.length) setCurrentQuestionIndex(nextIdx);
                            }, 350);
                          }
                        }}
                        className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-150"
                        style={{
                          backgroundColor: isSelected2 ? 'rgba(37,99,235,0.15)' : '#0F172A',
                          border: isSelected2 ? '2px solid #2563EB' : '2px solid rgba(255,255,255,0.08)',
                          boxShadow: isSelected2 ? '0 0 16px rgba(37,99,235,0.4)' : 'none',
                          transform: isSelected2 ? 'scale(1.01)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* Anel radio button */}
                        <span
                          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{
                            border: isSelected2 ? '2px solid #2563EB' : '2px solid #475569',
                            backgroundColor: isSelected2 ? '#2563EB' : 'transparent',
                            boxShadow: isSelected2 ? '0 0 8px rgba(37,99,235,0.7)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected2 && (
                            <span className="w-2 h-2 rounded-full bg-white block" />
                          )}
                        </span>
                        {/* Texto da opção */}
                        <span
                          className="text-sm font-semibold flex-1"
                          style={{
                            color: isSelected2 ? '#FFFFFF' : '#94A3B8',
                            fontWeight: isSelected2 ? 700 : 500,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            }
            // Fallback: opções simples (string separada por vírgula) — também vira radio buttons
            const simpleOpts = q.options!.split(',').map(o => o.trim()).filter(Boolean);
            return (
              <div className="flex flex-col gap-3 w-full">
                {simpleOpts.map((opt, i) => {
                  const isSelected2 = questionAnswers[q.id] === opt;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setQuestionAnswers(prev => ({ ...prev, [q.id]: opt }));
                        setBlockedByQuestion(null);
                        const newAnswers2 = { ...questionAnswers, [q.id]: opt };
                        const nextIdx2 = getNextIndex(newAnswers2);
                        const nextList2 = buildOrderedQs(newAnswers2);
                        setTimeout(() => {
                          if (nextIdx2 < nextList2.length) setCurrentQuestionIndex(nextIdx2);
                        }, 350);
                      }}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-150"
                      style={{
                        backgroundColor: isSelected2 ? 'rgba(37,99,235,0.15)' : '#0F172A',
                        border: isSelected2 ? '2px solid #2563EB' : '2px solid rgba(255,255,255,0.08)',
                        boxShadow: isSelected2 ? '0 0 16px rgba(37,99,235,0.4)' : 'none',
                        transform: isSelected2 ? 'scale(1.01)' : 'scale(1)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{
                          border: isSelected2 ? '2px solid #2563EB' : '2px solid #475569',
                          backgroundColor: isSelected2 ? '#2563EB' : 'transparent',
                          boxShadow: isSelected2 ? '0 0 8px rgba(37,99,235,0.7)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected2 && <span className="w-2 h-2 rounded-full bg-white block" />}
                      </span>
                      <span
                        className="text-sm flex-1"
                        style={{
                          color: isSelected2 ? '#FFFFFF' : '#94A3B8',
                          fontWeight: isSelected2 ? 700 : 500,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          }
          if (q.fieldType === 'textarea') {
            return (
              <textarea
                value={questionAnswers[q.id] || ""}
                onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Digite aqui..."
                className="w-full rounded-md p-2 text-sm"
                style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px double #000' }}
                rows={3}
              />
            );
          }
          return (
            <Input
              type="text"
              value={questionAnswers[q.id] || ""}
              onChange={(e) => setQuestionAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Digite aqui..."
              className="border-2 text-center placeholder-black/50"
              style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', borderStyle: 'double', borderColor: '#000' }}
            />
          );
        };

        return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" style={{ overscrollBehavior: 'contain' }}>
          <div className="rounded-2xl max-w-md w-full shadow-2xl flex flex-col" style={{ backgroundColor: '#020617', border: '1px solid rgba(37,99,235,0.25)', maxHeight: '90dvh' }}>
            {/* Cabeçalho fixo */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0">
            <h3 className="text-xl font-bold text-white mb-4 text-center tracking-wide">Informações Adicionais</h3>
            {/* Indicador de progresso */}
            <div>
              <div className="flex justify-between text-xs mb-2" style={{ color: '#94A3B8' }}>
                <span>Pergunta {safeIndex + 1} de {totalQs}</span>
                <span style={{ color: '#2563EB', fontWeight: 600 }}>{progressPct}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #1d4ed8, #2563EB, #3b82f6)', boxShadow: '0 0 8px rgba(37,99,235,0.6)' }}
                />
              </div>
            </div>
            </div>
            {/* Área scrollável: pergunta + opções */}
            <div className="flex-1 overflow-y-auto px-6 pb-2" style={{ overscrollBehavior: 'contain' }}>
            {/* Pergunta atual */}
            {currentQ && (
              <div className="space-y-4">
                <div>
                  <p className="text-white text-base font-bold uppercase tracking-wider leading-snug">
                    {currentQ.question} {currentQ.isRequired === 1 && <span className="text-red-400">*</span>}
                  </p>
                </div>
                <div>
                  {renderQuestionInput(currentQ)}
                </div>
              </div>
            )}
            </div>
            {/* Botões de navegação fixos no rodapé */}
            <div className="px-6 pb-6 pt-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex gap-3">
              {safeIndex > 0 && (
                <button
                  onClick={() => setCurrentQuestionIndex(safeIndex - 1)}
                  className="flex-1 px-4 py-3 font-semibold rounded-xl transition-all duration-200 active:scale-95"
                  style={{ backgroundColor: '#1E293B', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  ← Voltar
                </button>
              )}
              {safeIndex === 0 && (
                <button onClick={() => {
                  const isPDF = selectedOption?.isPdfOnly === 1 || selectedOption?.type?.toLowerCase() === 'pdf-only';
                  const hasUpload = needsFileUpload(selectedProduct, selectedOption);
                  if (isPDF) { setStep("pdf-upload"); }
                  else if (hasUpload) { setStep("upload"); }
                  else { setStep("name-select"); }
                }}
                  className="flex-1 px-4 py-3 font-semibold rounded-xl transition-all duration-200 active:scale-95"
                  style={{ backgroundColor: '#1E293B', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Voltar
                </button>
              )}
              <button
                onClick={goToNext}
                className="flex-1 px-4 py-3 font-bold rounded-xl transition-all duration-200 active:scale-95"
                style={{ backgroundColor: '#2563EB', color: '#FFFFFF', boxShadow: '0 0 16px rgba(37,99,235,0.5)', border: '1px solid rgba(37,99,235,0.6)' }}
              >
                {isLastQuestion ? 'PRÓXIMO' : 'Continuar →'}
                            </button>
            </div>
            </div>{/* fim rodapé */}
            {/* Modal de bloqueio */}
            {blockedByQuestion && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6">
                <div className="bg-gray-950 border-2 border-red-600 rounded-2xl p-8 max-w-sm w-full text-center space-y-5 shadow-2xl">
                  <div className="text-6xl">🚫</div>
                  <p className="text-red-400 font-bold text-xl">Atendimento Encerrado</p>
                  <p className="text-white/90 text-base leading-relaxed">Não podemos continuar com o atendimento ou venda.</p>
                  <p className="text-white/50 text-xs">Sua sessão foi encerrada.</p>
                  <button onClick={() => { window.location.reload(); }} className="w-full px-4 py-3 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors text-sm">Fechar</button>
                </div>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ========== MODAL DE CADASTRO UNIFICADO ========== */}
      {((step === "cadastro" && cadastroSubStep === 'pagamento') || step === "success") && <PaymentTutorial />}
      {step === "cadastro" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="backdrop-blur-md border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl my-auto" style={{ backgroundColor: 'rgba(10, 10, 30, 0.95)' }}>
            {cadastroSubStep === 'dados' && <h3 className="text-2xl font-bold text-white mb-4 text-center">SEUS DADOS</h3>}
            <div className="space-y-4">

              {cadastroSubStep === 'dados' && (<>
              {/* DADOS DO CLIENTE */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-400 font-bold text-sm mb-3 text-center">SEUS DADOS</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-white mb-1 block text-xs">Nome Completo</Label>
                    <Input type="text" placeholder="Seu nome" value={clientName} onChange={(e) => setClientName(e.target.value)}
                      className="border-2 text-center placeholder-black/50" style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '18px', borderStyle: 'double', borderColor: '#000' }} />
                  </div>
                  <div>
                    <Label className="text-white mb-1 block text-xs">Telefone</Label>
                    <Input
                      type="tel"
                      placeholder="(11) 98765-4321"
                      value={clientPhone}
                      onChange={(e) => {
                        setClientPhone(e.target.value);
                        const digits = e.target.value.replace(/\D/g, '');
                        if (digits.length >= 10) {
                          setManualPhoneSearch(digits);
                          setCustomerAutoFilled(false);
                        } else {
                          setManualPhoneSearch('');
                          setCustomerAutoFilled(false);
                        }
                      }}
                      className="border-2 text-center placeholder-black/50"
                      style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '18px', borderStyle: 'double', borderColor: '#000' }}
                    />
                    {manualCustomerCheck.isFetching && (
                      <p className="text-yellow-300 text-xs mt-1 text-center">Buscando dados...</p>
                    )}
                    {customerAutoFilled && (
                      <p className="text-green-300 text-xs mt-1 text-center">✅ Dados preenchidos automaticamente</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-white mb-1 block text-xs">Cidade</Label>
                    <Input type="text" placeholder="São Paulo" value={clientCity} onChange={(e) => setClientCity(e.target.value)}
                      className="border-2 text-center placeholder-black/50" style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '18px', borderStyle: 'double', borderColor: '#000' }} />
                  </div>
                  <div>
                    <Label className="text-white mb-1 block text-xs">
                      Email <span className="text-red-400 font-normal">*</span>
                    </Label>
                    <Input type="email" placeholder="seu@email.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                      className="border-2 text-center placeholder-black/50" style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', borderStyle: 'double', borderColor: '#000' }} />
                    <div className="mt-1.5 flex items-start gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-2.5 py-2">
                      <span className="text-yellow-400 text-xs flex-shrink-0 mt-0.5">⚠️</span>
                      <p className="text-yellow-200 text-xs leading-relaxed">
                        <strong>O email não é para criar conta.</strong> Usado apenas para você receber atualizações sobre o seu pedido.
                      </p>
                    </div>
                  </div>
                  
                  {/* INDICADOR OBRIGATÓRIO OU CÓDIGO DE BYPASS */}
                  {referrerName && (
                    <div className="border-2 border-green-500/50 rounded-lg p-3 bg-green-500/10">
                      <p className="text-green-400 font-bold text-sm mb-2">✅ INDICADOR CONFIRMADO</p>
                      <div className="bg-green-900/30 border border-green-500/40 rounded-lg p-3">
                        <p className="text-sm text-green-300 font-bold">{referrerName}</p>
                      </div>
                    </div>
                  )}
                  {!referrerName && (
                    <div className="border-2 border-blue-500/40 rounded-lg p-3 bg-blue-500/10">
                      <p className="text-blue-300 font-bold text-sm">Indicador (opcional)</p>
                      <p className="text-blue-200 text-xs mt-1">Se você tiver um indicador, pode informar. Não é obrigatório para continuar.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* BOTÃO CONTINUAR PARA PAGAMENTO */}
              <button onClick={async () => {
                if (!clientName.trim()) { alert('Preencha seu nome completo'); return; }
                const rawPhone = clientPhone.replace(/\D/g, '');
                if (rawPhone.length < 10) { alert('Preencha seu telefone com DDD'); return; }
                if (!clientCity.trim()) { alert('Preencha sua cidade'); return; }
                if (!clientEmail.trim()) { alert('Preencha seu email'); return; }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(clientEmail.trim())) { alert('Digite um email válido'); return; }
                if (rawPhone.length >= 10 && customerCheck.data?.exists) {
                  try { await updateEmailMutation.mutateAsync({ phone: rawPhone, email: clientEmail.trim() }); } catch (e) { /* silencioso */ }
                }
                setCadastroSubStep('resumo');
              }}
                className="w-full px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-600/80 hover:to-blue-500/80 text-white font-bold rounded-lg transition-all duration-300 transform hover:scale-105 text-lg">
                CONTINUAR
              </button>
              <button onClick={() => { if (hasQuestions) { setStep("questions"); setCurrentQuestionIndex(0); } else if (isPDFOnly) { setStep("pdf-upload"); } else if (needsFileUpload(selectedProduct, selectedOption)) { setStep("upload"); } else { setStep("name-select"); } }}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all duration-300">
                Voltar
              </button>
              </>)}

              {(cadastroSubStep === 'resumo' || cadastroSubStep === 'pagamento') && (<>
              {/* ESTILOS NEON PAGAMENTO */}
              <style>{`
                @keyframes neonGreen {
                  0%,100% { box-shadow: 0 0 6px #22c55e, 0 0 20px #22c55e, 0 0 40px #16a34a; border-color: #22c55e; }
                  50% { box-shadow: 0 0 18px #4ade80, 0 0 55px #22c55e, 0 0 90px #16a34a; border-color: #4ade80; }
                }
                @keyframes neonBlue {
                  0%,100% { box-shadow: 0 0 6px #3b82f6, 0 0 20px #3b82f6, 0 0 40px #1d4ed8; border-color: #3b82f6; }
                  50% { box-shadow: 0 0 18px #60a5fa, 0 0 55px #3b82f6, 0 0 90px #1d4ed8; border-color: #60a5fa; }
                }
                @keyframes neonYellowPulse {
                  0%,100% { box-shadow: 0 0 8px #eab308, 0 0 24px #eab308, 0 0 48px #ca8a04; border-color: #eab308; background-color: rgba(234,179,8,0.12); }
                  50% { box-shadow: 0 0 22px #fde047, 0 0 60px #eab308, 0 0 100px #ca8a04; border-color: #fde047; background-color: rgba(234,179,8,0.22); }
                }
                @keyframes neonGreenPulse {
                  0%,100% { box-shadow: 0 0 8px #22c55e, 0 0 24px #22c55e, 0 0 48px #16a34a; border-color: #22c55e; background: linear-gradient(135deg,#14532d,#166534); }
                  50% { box-shadow: 0 0 22px #4ade80, 0 0 60px #22c55e, 0 0 100px #16a34a; border-color: #4ade80; background: linear-gradient(135deg,#166534,#15803d); }
                }
                .neon-green-border { border: 2px solid #22c55e; animation: neonGreen 2s ease-in-out infinite; border-radius: 0.75rem; }
                .neon-blue-border { border: 2px solid #3b82f6; animation: neonBlue 2s ease-in-out infinite; border-radius: 0.75rem; }
                .neon-upload-pulse { border: 2px dashed #eab308; animation: neonYellowPulse 1.3s ease-in-out infinite; border-radius: 0.75rem; }
                .neon-finalizar-pulse { border: 2px solid #22c55e; animation: neonGreenPulse 1.3s ease-in-out infinite; border-radius: 0.75rem; }
                .neon-upload-stop { border: 2px dashed #eab308; border-radius: 0.75rem; opacity: 0.6; }
                .pix-logo { width: 56px; height: 56px; border: 2px solid #38bdf8; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(56,189,248,0.1); }
              `}</style>

              {/* CABEÇALHO PAGAMENTO */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-wide">{cadastroSubStep === 'resumo' ? 'RESUMO' : 'PAGAMENTO'}</h3>
                  <p className="text-green-400 text-xs flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="#4ade80"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> {cadastroSubStep === 'resumo' ? 'Confira os dados do seu pedido' : 'Faça o PIX e envie o comprovante'}</p>
                </div>
              </div>

              {/* RESUMO DO PEDIDO - só no substep resumo */}
              {cadastroSubStep === 'resumo' && <div className="neon-green-border p-4" style={{background:'rgba(0,0,0,0.7)'}}>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                  <p className="text-green-400 font-black text-base tracking-widest">RESUMO DO PEDIDO</p>
                </div>
                {cart.length > 1 ? (
                  // Múltiplos itens do carrinho
                  <div className="space-y-2 mb-3">
                    {cart.map((item, idx) => (
                      <div key={item.id} className="bg-black/50 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white/70 text-xs">#{idx + 1} Serviço:</span>
                          <span className="text-white font-bold text-xs">{item.product.name}</span>
                        </div>
                        {item.option && (
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white/70 text-xs">Opção:</span>
                            <span className="text-white text-xs">{item.option.label}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-white/70 text-xs">Valor:</span>
                          <span className="text-green-400 font-bold text-sm">{item.option?.price || 'Consulte'}</span>
                        </div>
                      </div>
                    ))}
                    <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-green-300 font-bold text-sm">TOTAL ({cart.length} itens):</span>
                        {(couponDiscount || hasResellerDiscount) && cartTotalFormatted ? (
                          <div className="flex items-center gap-2">
                            <span className="text-white/50 line-through text-sm font-semibold">{cartTotalFormatted}</span>
                            <span className="text-green-400 font-bold text-xl">{cartTotalWithDiscount}</span>
                          </div>
                        ) : (
                          <span className="font-bold text-lg text-green-400">{cartTotalFormatted || 'Consulte'}</span>
                        )}
                      </div>
                      {(couponDiscount || hasResellerDiscount) && cartTotalFormatted && (
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-green-300 text-xs">
                            {hasResellerDiscount && !couponDiscount && `🏷️ Desconto revendedor aplicado`}
                            {couponDiscount && !hasResellerDiscount && `🎫 Cupom aplicado`}
                            {couponDiscount && hasResellerDiscount && `🏷️ Revendedor + 🎫 Cupom`}
                          </span>
                          <span className="text-green-300 text-xs font-bold">
                            Economia: R$ {(parseFloat(cartTotalFormatted.replace('R$ ', '').replace('.', '').replace(',', '.')) - parseFloat((cartTotalWithDiscount || cartTotalFormatted).replace('R$ ', '').replace('.', '').replace(',', '.'))).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Item único
                  <div className="bg-black/50 rounded-lg p-3 mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white/70 text-sm">Serviço:</span>
                      <span className="text-white font-bold text-sm">{selectedProduct?.name || 'N/A'}</span>
                    </div>
                    {selectedOption && (
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white/70 text-sm">Opção:</span>
                        <span className="text-white text-sm">{selectedOption.label}</span>
                      </div>
                    )}
                    <div className="border-t border-white/10 mt-2 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white/70 text-sm">Valor:</span>
                        {(couponDiscount || hasResellerDiscount) ? (
                          <div className="flex items-center gap-2">
                            <span className="text-white/50 line-through text-sm font-semibold">{originalValue}</span>
                            <span className="text-green-400 font-bold text-lg">{finalValue}</span>
                          </div>
                        ) : (
                          <span className="font-bold text-lg text-green-400">{originalValue}</span>
                        )}
                      </div>
                      {(couponDiscount || hasResellerDiscount) && (
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-green-300 text-xs">
                            {hasResellerDiscount && !couponDiscount && `🏷️ Desconto revendedor: -R$ ${getResellerDiscountAmount().toFixed(2).replace('.', ',')}`}
                            {couponDiscount && !hasResellerDiscount && `🎫 Cupom aplicado`}
                            {couponDiscount && hasResellerDiscount && `🏷️ Revendedor + 🎫 Cupom`}
                          </span>
                          <span className="text-green-300 text-xs font-bold">
                            Economia: R$ {(parseFloat(originalValue.replace('R$ ', '').replace('.', '').replace(',', '.')) - parseFloat(finalValue.replace('R$ ', '').replace('.', '').replace(',', '.'))).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Cupom */}
                <div className="border-t border-green-500/20 pt-3">
                  <Label className="text-green-400 mb-2 block flex items-center gap-1 text-xs">
                    <Ticket className="w-4 h-4" /> Cupom de Desconto (opcional)
                  </Label>
                  <div className="flex gap-2">
                    <Input type="text" placeholder="Digite o código" value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponValid(null); setCouponDiscount(null); setCouponMessage(''); }}
                      className="border-2 text-center placeholder-black/50 flex-1" style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', borderStyle: 'double', borderColor: '#000' }} />
                    <button onClick={handleValidateCoupon} disabled={isValidatingCoupon || !couponCode.trim()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-all text-sm whitespace-nowrap">
                      {isValidatingCoupon ? '...' : 'Aplicar'}
                    </button>
                  </div>
                  {couponMessage && <p className={`text-xs mt-1 font-semibold ${couponValid ? 'text-green-400' : 'text-red-400'}`}>{couponMessage}</p>}
                </div>

                {/* Campo de cliente final para revendedores */}
                {resellerInfo?.isReseller && (
                  <div className="border-t border-blue-500/20 pt-3">
                    <Label className="text-blue-400 mb-2 block flex items-center gap-1 text-xs">
                      👤 Para quem é este pedido? (opcional)
                    </Label>
                    <Input
                      type="text"
                      placeholder="Nome do cliente final"
                      value={thirdPartyName}
                      onChange={(e) => setThirdPartyName(e.target.value)}
                      className="border-2 text-center placeholder-black/50"
                      style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', borderStyle: 'double', borderColor: '#3b82f6' }}
                    />
                    <Input
                      type="tel"
                      placeholder="Telefone do cliente final (ex: 11999999999)"
                      value={thirdPartyPhone}
                      onChange={(e) => setThirdPartyPhone(e.target.value.replace(/\D/g, ''))}
                      className="border-2 text-center placeholder-black/50 mt-2"
                      style={{ backgroundColor: '#ffffff', color: '#000000', fontSize: '16px', borderStyle: 'double', borderColor: '#3b82f6' }}
                    />
                    <p className="text-xs text-blue-300/70 mt-1">Informe o nome e telefone da pessoa para quem está revendendo (não obrigatório)</p>
                    {/* Desconto de revendedor */}
                    {getResellerDiscountAmount() > 0 && (() => {
                      const effectivePct = getEffectiveResellerDiscountPercent();
                      const isProductSpecific = selectedProduct?.resellerDiscount != null && selectedProduct.resellerDiscount !== '' && parseFloat(String(selectedProduct.resellerDiscount)) > 0;
                      return (
                        <div className="mt-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 flex items-center justify-between">
                          <span className="text-xs text-yellow-300">
                            🏷️ {isProductSpecific ? 'Desconto deste produto' : 'Desconto revendedor'}: {effectivePct}%
                          </span>
                          <span className="text-xs font-bold text-yellow-300">
                            -{effectivePct}% = -R$ {getResellerDiscountAmount().toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      );
                    })()}
                    {hasActivePromotion() && resellerInfo?.isReseller && (
                      <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                        <span className="text-xs text-amber-300">⚠️ Promoção ativa — desconto de revendedor não acumula</span>
                      </div>
                    )}
                  </div>
                )}
              </div>}
              {/* BOTÃO AVANÇAR PARA PAGAMENTO - só aparece no resumo */}
              {cadastroSubStep === 'resumo' && (
                <>
                <button onClick={() => setCadastroSubStep('pagamento')}
                  className="w-full px-4 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-black rounded-xl transition-all duration-300 transform hover:scale-105 text-lg tracking-wider shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                  AVANÇAR PARA PAGAMENTO
                </button>
                <button onClick={() => setCadastroSubStep('dados')}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-xl transition-all duration-300 border border-white/10 flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  <span className="text-red-400">VOLTAR</span>
                </button>
                </>
              )}
              {/* PAGAMENTO PIX - só aparece no substep pagamento */}
              {cadastroSubStep === 'pagamento' && (<>
              <div className="neon-blue-border p-4" style={{background:'rgba(0,0,0,0.8)'}}>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  <p className="text-blue-400 font-black text-base tracking-widest">PAGAMENTO VIA PIX</p>
                </div>
                {/* Valor + logo PIX */}
                <div className="bg-black/60 border border-blue-500/30 rounded-xl p-4 mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-white/60 text-xs tracking-widest mb-1">VALOR A PAGAR</p>
                    <p className="text-blue-300 font-black text-3xl drop-shadow-[0_0_10px_#3b82f6]">R$ {pixValue}</p>
                  </div>
                  <div className="pix-logo">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  </div>
                </div>
                {/* Chave PIX */}
                <p className="text-white/60 text-xs tracking-widest mb-1.5">COPIE A CHAVE PIX ABAIXO E PAGUE NO SEU BANCO</p>
                <div className="bg-white/5 border border-blue-500/20 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-white font-bold text-base tracking-wide">{PIX_KEY}</p>
                      <p className="text-white/60 text-xs mt-0.5">{PIX_NAME}</p>
                      <p className="text-white/40 text-xs">{PIX_BANK}</p>
                    </div>
                    <button onClick={handleCopyPix} className="p-2.5 bg-blue-500/20 hover:bg-blue-500/40 rounded-xl border border-blue-500/40 transition-all flex-shrink-0" type="button">
                      {pixCopied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-blue-400" />}
                    </button>
                  </div>
                </div>
                <button onClick={handleCopyPix} type="button" data-tour="copiar-pix"
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all text-sm flex items-center justify-center gap-2 tracking-wider shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                  {pixCopied ? <><Check className="w-5 h-5" /> COPIADO!</> : <><Copy className="w-5 h-5" /> COPIAR CHAVE PIX</>}
                </button>
              </div>

              {/* COMPROVANTE PIX */}
              <div data-tour="comprovante" className={paymentProofPreview ? 'neon-upload-stop p-4' : 'neon-upload-pulse p-4'} style={{background:'rgba(0,0,0,0.8)'}}>
                <div className="flex items-center gap-2 mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#eab308"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <p className="text-yellow-400 font-black text-sm tracking-widest">ENVIE O COMPROVANTE DE PAGAMENTO</p>
                </div>
                <div className="flex items-center gap-1.5 mb-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#eab308"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" stroke="#000" strokeWidth="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="#000" strokeWidth="2"/></svg>
                  <p className="text-yellow-200/80 text-xs">Após realizar o PIX, envie a captura de tela do comprovante</p>
                </div>
                {paymentProofPreview ? (
                  <div className="relative mb-2">
                    {paymentProofPreview === 'pdf' ? (
                      <div className="w-full flex flex-col items-center justify-center py-4 rounded-xl border border-yellow-500/40 bg-white/5">
                        <FileUp className="w-10 h-10 text-yellow-400 mb-1" />
                        <p className="text-white/80 text-xs">{paymentProof?.name || '✅ Comprovante já enviado'}</p>
                      </div>
                    ) : (
                      <img src={paymentProofPreview} alt="Comprovante" className="w-full max-h-40 object-contain rounded-xl border border-yellow-500/40" />
                    )}
                    <button onClick={() => { setPaymentProof(null); setPaymentProofPreview(null); setRestoredFileUrls(prev => ({ ...prev, paymentProof: undefined })); }} type="button"
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-500">✕</button>
                    <p className="text-green-400 text-xs mt-2 font-black text-center">✓ Comprovante anexado com sucesso!</p>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <div className="rounded-xl p-5 flex flex-col items-center gap-2 hover:bg-yellow-500/10 transition-all">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <p className="text-white font-black text-base text-center tracking-wide">CLIQUE PARA ENVIAR COMPROVANTE</p>
                      <p className="text-white/50 text-xs text-center">Imagens ou PDF • a imagem é otimizada automaticamente</p>
                    </div>
                    <input type="file" accept="image/*,application/pdf,.heic,.heif" className="hidden" onChange={handlePaymentProofSelect} />
                  </label>
                )}
              </div>

              {/* FINALIZAR */}
              {isSubmitting && (
                <div className="w-full bg-[#0d0d1a] border border-purple-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 text-purple-400 animate-spin flex-shrink-0" />
                    <span className="text-purple-300 font-semibold text-sm">{submitProgress || 'Processando...'}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full animate-shimmer-bar" />
                  </div>
                  <p className="text-white/40 text-xs text-center">Por favor, aguarde. Isso pode levar alguns segundos...</p>
                </div>
              )}
              {/* Botão FINALIZAR — pulsa neon verde somente quando comprovante carregado */}
              <button data-tour="finalizar" onClick={handleFinalSubmit} disabled={(!paymentProof && !restoredFileUrls.paymentProof) || isSubmitting}
                className={`w-full px-4 py-4 font-black rounded-xl transition-all duration-300 text-lg flex items-center justify-center gap-3 tracking-wider ${
                  isSubmitting ? 'bg-gray-700 text-gray-400 cursor-not-allowed' :
                  (paymentProof || restoredFileUrls.paymentProof) ? 'neon-finalizar-pulse text-white cursor-pointer' :
                  'bg-gray-700/60 text-gray-500 cursor-not-allowed border-2 border-gray-600'
                }`}>
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> {submitProgress || 'ENVIANDO...'}</>
                ) : (paymentProof || restoredFileUrls.paymentProof) ? (
                  <><div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"><svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6 2l.01 6L10 12l-3.99 4.01L6 22h12v-6l-4-4 4-3.99V2H6zm10 14.5V20H8v-3.5l4-4 4 4z"/></svg></div><div className="text-left"><p className="text-white font-black text-base">CLIQUE AQUI PARA FINALIZAR</p><p className="text-green-200 text-xs font-normal">Seu pedido será liberado após a confirmação do pagamento.</p></div><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polyline points="9 18 15 12 9 6"/></svg></>
                ) : 'ENVIE O COMPROVANTE PARA FINALIZAR'}
              </button>
              <button onClick={() => setCadastroSubStep('resumo')} disabled={isSubmitting}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 border border-white/10 flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                <span className="text-red-400">VOLTAR</span>
              </button>
              </>)}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ========== TELA DE CONFIRMAÇÃO PÓS-ENVIO ========== */}
      {step === "success" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md overflow-y-auto py-4">
          <div className="bg-black/90 backdrop-blur-md border-2 border-green-500/60 rounded-2xl p-6 md:p-8 max-w-md mx-4 shadow-2xl text-center">
            {/* Checkmark animado */}
            <div className="mb-5">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-500/50 animate-pulse">
                <Check className="w-10 h-10 text-green-400" />
              </div>
              <div className="bg-green-600 px-4 py-3 rounded-xl mb-3">
                <h3 className="text-xl font-black text-white tracking-wide">PEDIDO ENVIADO COM SUCESSO</h3>
              </div>
              <p className="text-green-400 font-bold text-sm">Seus arquivos e comprovante foram recebidos!</p>
            </div>

            {/* Senha de acompanhamento removida — cliente usa a senha da conta para rastrear */}

            {/* ===== FORMULÁRIO DE INDICAÇÃO PÓS-PEDIDO ===== */}
            {/* Só aparece para clientes NOVOS (primeiro pedido) */}
            {!isNewCustomerOrder && postOrderReferralStep === 'question' && (
              // Cliente já existente: pular direto para 'done' sem mostrar o formulário
              // (useEffect abaixo cuida disso)
              null
            )}
            {isNewCustomerOrder && postOrderReferralStep === 'question' && (
              <div className="relative overflow-hidden rounded-2xl mb-5"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #7c3aed 100%)',
                  border: '3px solid #a78bfa',
                  boxShadow: '0 0 30px rgba(167,139,250,0.5), 0 0 60px rgba(124,58,237,0.3)',
                  animation: 'pulse-border 2s ease-in-out infinite'
                }}>
                {/* Brilho decorativo */}
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-2xl pointer-events-none" style={{ background: 'rgba(167,139,250,0.4)' }} />
                <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-xl pointer-events-none" style={{ background: 'rgba(99,102,241,0.4)' }} />
                {/* Faixa superior chamativa */}
                <div className="w-full py-2 text-center font-black text-xs uppercase tracking-widest" style={{ background: 'rgba(0,0,0,0.3)', color: '#fde68a', letterSpacing: '0.2em' }}>
                  ⚡ ATENÇÃO — PASSO IMPORTANTE ⚡
                </div>
                <div className="relative p-6">
                  <div className="flex items-center gap-2 justify-center mb-3">
                    <span className="text-4xl" style={{ animation: 'bounce 1.5s infinite' }}>🎁</span>
                    <p className="font-black text-xl uppercase tracking-wider" style={{ color: '#fde68a', textShadow: '0 0 10px rgba(253,230,138,0.6)' }}>ALGUÉM TE INDICOU?</p>
                  </div>
                  <div className="rounded-xl p-4 mb-5 text-center" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(253,230,138,0.3)' }}>
                    <p className="font-bold text-sm leading-relaxed" style={{ color: '#ffffff' }}>
                      Informe o telefone de quem te indicou.
                    </p>
                    <p className="font-black text-sm mt-2" style={{ color: '#fde68a' }}>⭐ Quem indicou ganha bônus e vantagens!</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      data-tour="indicador-sim"
                      type="button"
                      onClick={() => setPostOrderReferralStep('form')}
                      className="flex-1 py-4 font-black rounded-xl transition-all active:scale-95 text-sm uppercase tracking-wide"
                      style={{
                        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                        color: '#1a1a1a',
                        boxShadow: '0 4px 20px rgba(251,191,36,0.5)',
                        border: '2px solid #fde68a',
                        fontSize: '0.9rem'
                      }}
                    >
                      ✅ SIM, TENHO INDICADOR
                    </button>
                    <button
                      data-tour="indicador-sim"
                      type="button"
                      onClick={() => setPostOrderReferralStep('done')}
                      className="flex-1 py-4 font-bold rounded-xl transition-all active:scale-95 text-sm"
                      style={{
                        background: 'rgba(255,255,255,0.12)',
                        border: '2px solid rgba(255,255,255,0.3)',
                        color: '#e2e8f0'
                      }}
                    >
                      Não
                    </button>
                  </div>
                </div>
              </div>
            )}

            {postOrderReferralStep === 'form' && (
              <div className="bg-yellow-500/10 border-2 border-yellow-500/40 rounded-xl p-5 mb-5 space-y-4">
                <div className="text-center">
                  <p className="text-yellow-300 font-black text-sm uppercase tracking-wide mb-1">🎁 Quem te indicou?</p>
                  <p className="text-white/60 text-xs">Digite o telefone de quem te indicou (com DDD)</p>
                </div>
                <div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="(11) 99999-9999"
                    value={postOrderReferralPhone.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3').replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3').replace(/^(\d{2})(\d+)$/, '($1) $2').replace(/^(\d{1,2})$/, '($1')}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setPostOrderReferralPhone(digits);
                      setPostOrderReferralError('');
                    }}
                    className="w-full px-4 py-4 bg-white text-black text-lg text-center font-medium rounded-xl border-2 border-black focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/30 outline-none transition-all"
                  />
                  {postOrderReferralError && (
                    <p className="text-red-400 text-sm mt-2 text-center">{postOrderReferralError}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={postOrderReferralPhone.length !== 11 || postOrderReferralSaving}
                  onClick={async () => {
                    const selfDigits = clientPhone.replace(/\D/g, '');
                    if (postOrderReferralPhone === selfDigits) {
                      setPostOrderReferralError('Você não pode indicar a si mesmo!');
                      return;
                    }
                    setPostOrderReferralSaving(true);
                    setPostOrderReferralError('');
                    try {
                      const result = await updateReferralMutation.mutateAsync({
                        phone: selfDigits,
                        referredBy: postOrderReferralName || 'Informado pós-pedido',
                        referredByPhone: postOrderReferralPhone,
                      });
                      if (!result.success) {
                        setPostOrderReferralError((result as any).message || 'Telefone do indicador não encontrado. Verifique o número.');
                        return;
                      }
                      setReferrerPhone(postOrderReferralPhone);
                      setReferrerName(postOrderReferralName || 'Indicador');
                      setPostOrderReferralStep('done');
                    } catch (err: any) {
                      const msg = err?.message || 'Erro ao salvar indicação. Tente novamente.';
                      setPostOrderReferralError(msg);
                    } finally {
                      setPostOrderReferralSaving(false);
                    }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-95"
                >
                  {postOrderReferralSaving ? 'Salvando...' : 'SALVAR E CONTINUAR'}
                </button>
                <button
                  data-tour="indicador-pular"
                  type="button"
                  onClick={() => { setPostOrderReferralStep('done'); setPostOrderReferralError(''); }}
                  className="w-full py-3 mt-2 text-white font-bold text-sm rounded-xl border-2 border-red-400/60 bg-red-500/20 hover:bg-red-500/30 transition-all active:scale-95"
                >
                  Não tenho indicador - PULAR
                </button>
              </div>
            )}

            {postOrderReferralStep === 'done' && referrerPhone && postOrderReferralPhone && (
              <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-2 border-green-400/50 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎉</span>
                  <div>
                    <p className="text-green-300 font-black text-sm uppercase tracking-wide">Indicação registrada!</p>
                    <p className="text-white/70 text-xs mt-0.5">Obrigado! Quem te indicou será bonificado. ❤️</p>
                  </div>
                </div>
              </div>
            )}

            {/* Aviso e botão WhatsApp — só aparecem após responder a pergunta de indicação */}
            {postOrderReferralStep === 'done' && (
            <>
            {/* Aviso OBRIGATÓRIO */}
            <div className="bg-red-500/15 border-2 border-red-500/50 rounded-xl p-4 mb-5">
              <div className="flex items-center gap-2 justify-center mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <p className="text-red-400 font-black text-sm">ATENÇÃO - PASSO OBRIGATÓRIO</p>
              </div>
              <p className="text-white font-semibold text-sm leading-relaxed">
                Para concluir seu pedido, você <span className="text-red-400 font-black underline">PRECISA</span> clicar no botão abaixo e enviar a mensagem no WhatsApp.
              </p>
              <p className="text-white/60 text-xs mt-2">
                Sem essa confirmação, seu pedido não será processado.
              </p>
            </div>

            {/* Botão GRANDE do WhatsApp */}
            <button onClick={() => {
              const od = submittedOrderData;
              let msg = `NOVO PEDIDO - ${SITE_NAME}`;

              // Quem indicou (só se preenchido)
              const rName = od?.referrerName || referrerName.trim();
              const rPhone = od?.referrerPhone || referrerPhone.trim();
              if (rName || rPhone) {
                msg += `\nQUEM INDICOU:`;
                if (rName) msg += `\nNome: ${rName}`;
                if (rPhone) msg += `\nTelefone: ${rPhone}`;
              }

              // Dados do cliente
              msg += `\nCLIENTE:`;
              msg += `\nNome: ${od?.clientName || clientName}`;
              msg += `\nTelefone: ${od?.clientPhone || clientPhone}`;
              if (od?.clientCity || clientCity) msg += `\nCidade: ${od?.clientCity || clientCity}`;

              // Serviços
              const items = od?.cartItems || [];
              if (items.length > 1) {
                items.forEach((item, idx) => {
                  msg += `\n\n====== PEDIDO ${idx + 1} DE ${items.length} ======`;
                  msg += `\nServico: ${item.service}`;
                  msg += `\nOpcao: ${item.nameOption}`;
                  if (item.price) msg += `\nValor: ${item.price}`;
                });
                if (od?.totalValue) msg += `\n\nValor Total: ${od.totalValue}`;
              } else if (items.length === 1) {
                msg += `\n\nServico: ${items[0].service}`;
                msg += `\nOpcao: ${items[0].nameOption}`;
                if (items[0].price) msg += `\nValor: ${items[0].price}`;
              } else {
                // fallback
                msg += `\n\nServico: ${selectedProduct?.name || 'N/A'}`;
                if (selectedOption?.label) msg += `\nOpcao: ${selectedOption.label}`;
                msg += `\nValor: ${pixValue || (couponDiscount || hasResellerDiscount ? finalValue : originalValue)}`;
              }

              msg += `\nComprovante PIX: Enviado`;

              // Respostas do formulário
              const answers = od?.answers || [];
              if (answers.length > 0) {
                msg += `\n\nRESPOSTAS DO FORMULARIO:`;
                answers.forEach(a => {
                  msg += `\n-------------------------`;
                  msg += `\n*************************`;
                  msg += `\n${a.question}`;
                  msg += `\n${a.answer}`;
                });
                msg += `\n-------------------------`;
                msg += `\n*************************`;
              }

              // Documentos enviados
              const docs = od?.docs || [];
              if (docs.length > 0) {
                msg += `\n\nARQUIVOS:`;
                docs.forEach(d => {
                  msg += `\n-------------------------`;
                  msg += `\n*************************`;
                  msg += `\n${d.label}`;
                  msg += `\n${d.url}`;
                });
                msg += `\n-------------------------`;
                msg += `\n*************************`;
              }

              const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
              window.open(whatsappUrl, '_blank');
              setWhatsappClicked(true);
            }}
              data-tour="whatsapp-confirmar"
              className={`w-full px-6 py-5 text-white font-black text-xl rounded-xl transition-all duration-300 flex items-center justify-center gap-3 transform hover:scale-105 shadow-lg mb-4 ${whatsappClicked ? 'bg-gradient-to-r from-green-700 to-green-600 shadow-green-600/20' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-500/30 animate-bounce'}`}
              style={{ animationDuration: '2s' }}>
              <MessageCircle className="w-7 h-7" />
              {whatsappClicked ? 'ABRIR WHATSAPP NOVAMENTE' : 'CONFIRMAR NO WHATSAPP'}
            </button>

            {whatsappClicked ? (
              <>
                <p className="text-green-400 text-xs mb-3 font-semibold">
                  WhatsApp aberto! Envie a mensagem e clique em Concluir.
                </p>
                <button onClick={() => {
                  // Logout completo ao confirmar envio no WhatsApp
                  localStorage.removeItem('walk_access_granted');
                  localStorage.removeItem('walk_access_code');
                  localStorage.removeItem('walk_access_type');
                  localStorage.removeItem('walk_access_expires');
                  localStorage.removeItem('vip_allowed_products');
                  setWhatsappClicked(false);
                  resetAllStates();
                  window.location.reload();
                }}
                  className="w-full px-4 py-3 bg-green-600/80 hover:bg-green-500 text-white font-semibold rounded-lg transition-all duration-300 text-sm">
                  Já enviei no WhatsApp - Concluir
                </button>
              </>
            ) : (
              <p className="text-red-400/70 text-xs font-semibold">
                Clique no botão verde acima para abrir o WhatsApp primeiro.
              </p>
            )}
            </>
            )}
          </div>
        </div>
      )}
      {/* ===== MODAL: SELETOR DE OPÇÃO PARA CARRINHO ===== */}
      {cartPendingProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="backdrop-blur-md border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 10, 30, 0.97)' }}>
            <h3 className="text-xl font-bold text-white mb-2">Selecione uma Opção</h3>
            <p className="text-white/70 mb-4 text-sm">{cartPendingProduct.name}</p>
            <div className="space-y-2">
              {cartPendingProduct.options.filter(o => o.isActive === 1).map(option => (
                <button key={option.id} onClick={() => handleCartOptionSelect(option)}
                  className="w-full px-4 py-3 border border-white/20 font-semibold rounded-lg transition-all duration-300 hover:scale-105 flex items-center justify-between hover:opacity-90 text-left"
                  style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                  <span>{option.label}</span>
                  <div className="flex items-center gap-2">
                    {option.originalPrice && option.originalPrice.trim() !== '' && (
                      <span className="text-gray-500 text-xs line-through">{option.originalPrice}</span>
                    )}
                    <span className={`font-bold text-sm ${option.originalPrice && option.originalPrice.trim() !== '' ? 'text-green-600' : 'text-green-700'}`}>{resellerPriceMap[option.id] || option.price}</span>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setCartPendingProduct(null)}
              className="mt-4 w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ===== MODAL: CARRINHO ===== */}
      {showCart && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="backdrop-blur-md border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 10, 30, 0.97)' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-bold text-white">Carrinho</h3>
                <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">{cart.length}</span>
              </div>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-10">
                <ShoppingCart className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/50 text-sm">Carrinho vazio</p>
                <button onClick={() => setShowCart(false)} className="mt-4 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-sm font-semibold transition-all">
                  Continuar comprando
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-5">
                  {cart.map((item, idx) => (
                    <div key={item.id} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center text-primary font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{item.product.name}</p>
                        {item.option && (
                          <p className="text-white/60 text-xs mt-0.5">{item.option.label}</p>
                        )}
                        {item.option?.price && (
                          <div className="flex items-center gap-2 mt-1">
                            {item.option.originalPrice && item.option.originalPrice.trim() !== '' && (
                              <span className="text-gray-500 text-xs line-through">{item.option.originalPrice}</span>
                            )}
                            <p className="text-green-400 font-bold text-sm">{resellerPriceMap[item.option.id] || item.option.price}</p>
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeFromCart(item.id)}
                        className="flex-shrink-0 w-7 h-7 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg flex items-center justify-center transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Total do carrinho */}
                {cart.length > 1 && (() => {
                  let total = 0;
                  for (const item of cart) {
                    const price = item.option?.price || '0';
                    const num = parseFloat(price.replace('R$ ', '').replace('.', '').replace(',', '.'));
                    if (!isNaN(num)) total += num;
                  }
                  return (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-green-300 font-bold text-sm">Total ({cart.length} itens):</span>
                        <span className="text-green-400 font-bold text-lg">R$ {total.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-4">
                  <p className="text-blue-300 text-xs text-center">📋 Você preencherá seus dados <strong>uma única vez</strong> e criaremos um pedido para cada produto selecionado.</p>
                </div>

                <button onClick={startCartCheckout}
                  className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2 text-base">
                  <ShoppingCart className="w-5 h-5" />
                  Finalizar Pedido ({cart.length} {cart.length === 1 ? 'item' : 'itens'})
                </button>
                <button onClick={() => setShowCart(false)}
                  className="mt-2 w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all text-sm">
                  Continuar comprando
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/40 backdrop-blur-md shadow-sm border-b border-primary/30">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">{SITE_NAME}</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden md:block text-sm text-white/70">Atendimento Rápido no WhatsApp</p>
            {/* Botão do Carrinho */}
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Carrinho</span>
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
            {clientPhoneFromSession && (
              <button
                onClick={() => setShowMyData(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                Meus Dados
              </button>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('walk_access_granted');
                localStorage.removeItem('walk_access_code');
                localStorage.removeItem('walk_access_type');
                localStorage.removeItem('walk_access_expires');
                localStorage.removeItem('walk_client_phone');
                localStorage.removeItem('vip_allowed_products');
                localStorage.removeItem('cp_token');
                localStorage.removeItem('cp_expires_at');
                localStorage.removeItem('cp_session_type');
                window.location.reload();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>





      {/* Hero Section */}
      <section className="relative overflow-hidden py-4 md:py-20">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Vídeo mobile — só exibe se houver URL e não houver erro */}
            {VIDEO_URL && !videoError && (
              <div className={`relative md:hidden order-first -mx-4 px-4 mb-4 transition-all duration-300 ${videoLoaded ? 'opacity-100' : 'h-0 overflow-hidden opacity-0'}`}>
                <video key={VIDEO_URL} autoPlay muted loop playsInline preload="auto" className="relative rounded-xl shadow-lg w-full max-h-48 object-cover" onError={() => setVideoError(true)} onLoadedData={() => setVideoLoaded(true)} ref={(el) => { if (el) { el.muted = true; el.play().catch(() => {}); } }}>
                  <source src={VIDEO_URL} type="video/mp4" />
                </video>
              </div>
            )}

            {/* Conteúdo */}
            <div className="space-y-6">
              <div className="space-y-3">
                {HERO_TITLE && <h2 className="text-4xl md:text-5xl font-bold text-foreground leading-tight" dangerouslySetInnerHTML={{ __html: HERO_TITLE }} />}
                {HERO_SUBTITLE && <p className="text-lg text-muted-foreground">{HERO_SUBTITLE}</p>}
              </div>
              {(FEATURE1_TITLE || FEATURE2_TITLE || FEATURE3_TITLE) && (
              <div className="space-y-4 pt-4">
                {(FEATURE1_TITLE || FEATURE1_DESC) && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <div><h3 className="font-bold text-foreground">{FEATURE1_TITLE}</h3><p className="text-sm text-muted-foreground">{FEATURE1_DESC}</p></div>
                </div>
                )}
                {(FEATURE2_TITLE || FEATURE2_DESC) && (
                <div className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-1" />
                  <div><h3 className="font-bold text-foreground">{FEATURE2_TITLE}</h3><p className="text-sm text-muted-foreground">{FEATURE2_DESC}</p></div>
                </div>
                )}
                {(FEATURE3_TITLE || FEATURE3_DESC) && (
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                  <div><h3 className="font-bold text-foreground">{FEATURE3_TITLE}</h3><p className="text-sm text-muted-foreground">{FEATURE3_DESC}</p></div>
                </div>
                )}
              </div>
              )}
            </div>

            {/* Vídeo desktop — só exibe se houver URL e não houver erro */}
            {VIDEO_URL && !videoError && (
              <div className="relative hidden md:block">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl blur-3xl"></div>
                <video key={VIDEO_URL} autoPlay muted loop playsInline className="relative rounded-2xl shadow-2xl w-full h-auto object-cover" onError={() => setVideoError(true)}>
                  <source src={VIDEO_URL} type="video/mp4" />
                </video>
              </div>
            )}
          </div>
        </div>
      </section>



      {/* Serviços Extras / Consultas — TOPO */}
      {clientPhoneFromSession && (
        <section className="px-4 pt-4 pb-2">
          <div className="container max-w-2xl">
            <ServicosExtras
              customerPhone={clientPhoneFromSession}
              customerName={clientName}
              customerEmail={clientEmail}
              customerPhoto={customerCheck.data?.customer?.profilePhotoUrl || ""}
              prominent
            />
          </div>
        </section>
      )}

      {/* Banner de Promoções em Destaque */}
      {(() => {
        const now = Date.now();
        const allPromoOptions = (products || []).flatMap((p: Product) =>
          (p.options || []).filter((o: ProductOption) =>
            o.isActive === 1 &&
            o.originalPrice && o.originalPrice.trim() !== '' &&
            (!o.promoEndsAt || o.promoEndsAt > now)
          ).map((o: ProductOption) => ({ product: p, option: o }))
        );
        if (allPromoOptions.length === 0) return null;

        return (
          <section className="py-6 px-4">
            <div className="container">
              {/* Header da seção */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔥</span>
                  <h3 className="text-xl font-black text-white tracking-wide">PROMOÇÕES ATIVAS</h3>
                  <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-bounce">
                    {allPromoOptions.length} oferta{allPromoOptions.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Grid de cards de promoção */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allPromoOptions.map(({ product: p, option: o }) => (
                  <PromoCard
                    key={`${p.id}-${o.id}`}
                    product={p}
                    option={o}
                    onExpire={() => trpcUtils.products.listActive.invalidate()}
                    onSelect={() => {
                      document.getElementById(`product-card-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setTimeout(() => {
                        const el = document.getElementById(`product-card-${p.id}`);
                        if (el) {
                          el.style.transition = 'box-shadow 0.3s';
                          el.style.boxShadow = '0 0 0 3px #f97316, 0 0 30px #f9731680';
                          setTimeout(() => { el.style.boxShadow = ''; }, 1800);
                        }
                      }, 400);
                      setTimeout(() => handleServiceClick(p), 600);
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Seção de Serviços */}
      <section className="py-16 md:py-24 bg-black/10">
        <div className="container">
          <div className="text-center mb-12">
            {SERVICES_TITLE && <h2 className="text-3xl md:text-4xl font-bold mb-3 neon-lightning" style={{ color: '#00FFFF' }}>{SERVICES_TITLE}</h2>}
            {SERVICES_SUBTITLE && <p className="text-lg text-white/70">{SERVICES_SUBTITLE}</p>}
          </div>

          {/* Banner Colombia Bot — aparece somente para clientes logados quando o bot está ativo */}
          {botEnabled && !!localStorage.getItem('cp_token') && (
            <div className="mb-8 mx-auto max-w-lg">
              <button
                onClick={() => setShowColombiaBot(true)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-600/20 to-blue-600/20 hover:from-violet-600/30 hover:to-blue-600/30 transition-all active:scale-[0.98] shadow-lg shadow-violet-500/10"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
                  <span className="text-2xl">🤖</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-white text-sm">Colombia — Assistente de Pedidos</p>
                  <p className="text-xs text-violet-300 mt-0.5">Precisa de ajuda? Clique aqui e eu te guio passo a passo</p>
                </div>
                <div className="shrink-0 text-violet-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(products || []).filter((product: Product) => {
              // Filtro 1: restrição por senha VIP (salvo no sessionStorage ao logar)
              const vipAllowedRaw = localStorage.getItem('vip_allowed_products');
              if (vipAllowedRaw) {
                try {
                  const vipIds: number[] = JSON.parse(vipAllowedRaw);
                  if (vipIds.length > 0 && !vipIds.includes(product.id)) return false;
                } catch { /* ignore */ }
              }
              // Filtro 2: restrição por senha fixa individual do cliente
              if (allowedProductsQuery.data?.restricted && allowedProductsQuery.data.productIds.length > 0) {
                return allowedProductsQuery.data.productIds.includes(product.id);
              }
              return true; // Sem restrição = vê tudo
            }).map((product: Product) => {
              const cardStyle: React.CSSProperties = {
                borderColor: product.cardColor || 'rgba(var(--primary), 0.3)',
              };
              if (product.cardBgColor) {
                cardStyle.background = product.cardBgColor;
              } else {
                cardStyle.background = 'linear-gradient(to bottom right, rgba(30,58,138,0.6), rgba(88,28,135,0.6))';
              }
              if (product.cardColor) {
                cardStyle.boxShadow = `0 0 15px ${product.cardColor}33, inset 0 1px 0 ${product.cardColor}22`;
              }
              // Calcular % de desconto efetiva para este produto (para exibir na etiqueta)
              const productDiscountPct = (() => {
                if (!resellerInfo?.isReseller) return null;
                if (product.resellerDiscount != null && product.resellerDiscount !== '') {
                  const pct = parseFloat(String(product.resellerDiscount));
                  if (!isNaN(pct) && pct > 0) return pct;
                }
                if (resellerInfo.discountType === 'percent' && resellerInfo.discountValue > 0) return resellerInfo.discountValue;
                return null;
              })();
              return (
                <div key={product.id} id={`product-card-${product.id}`}
                  className="relative overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl flex flex-col"
                  style={cardStyle}
                >
                  {/* Brilho decorativo no topo */}
                  <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${product.cardColor || 'rgba(139,92,246,0.8)'}, transparent)` }} />

                  {/* Etiqueta de desconto */}
                  {productDiscountPct !== null && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="bg-yellow-400 text-black text-[11px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg">
                        <span>🏷️</span>
                        <span>{productDiscountPct}% OFF</span>
                      </div>
                    </div>
                  )}

                  {/* Corpo do card */}
                  <div className="p-5 flex-1 flex flex-col">
                    {/* Ícone + Título em linha */}
                    <div className="flex items-center gap-3 mb-3">
                      {product.iconUrl ? (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                          <img src={product.iconUrl} alt={product.name} className="w-10 h-10 object-contain" />
                        </div>
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black leading-tight tracking-wide" style={{ color: product.cardTextColor || '#ffffff' }}>{product.name}</h3>
                      </div>
                    </div>

                    {/* Separador */}
                    <div className="h-px mb-3" style={{ background: `linear-gradient(90deg, ${product.cardColor || 'rgba(139,92,246,0.5)'}, transparent)` }} />

                    {/* Descrição */}
                    {product.description && (
                      <div className="flex-1 mb-4 text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ color: product.cardTextColor ? product.cardTextColor + 'cc' : 'rgba(255,255,255,0.75)' }}
                        dangerouslySetInnerHTML={{ __html: product.description }}
                      />
                    )}

                    {/* Botões */}
                    <div className="flex flex-col gap-2 mt-auto">
                      <button
                        onClick={() => handleServiceClick(product)}
                        className="w-full px-4 py-3 rounded-xl font-black text-sm tracking-wide transition-all duration-200 active:scale-[0.97] shadow-md"
                        style={{
                          backgroundColor: product.cardBtnColor || '#f3f4f6',
                          color: '#000000',
                          boxShadow: product.cardBtnColor ? `0 4px 14px ${product.cardBtnColor}55` : '0 4px 14px rgba(0,0,0,0.3)',
                        }}
                      >
                        {product.buttonText || `COMPRAR`}
                      </button>
                      <button
                        onClick={() => handleAddToCartClick(product)}
                        className="w-full px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.97] flex items-center justify-center gap-2"
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          border: `1px solid ${product.cardColor || 'rgba(139,92,246,0.4)'}`,
                          color: product.cardTextColor || '#ffffff',
                        }}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Adicionar ao Carrinho
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Cards de Destaque Dinâmicos */}
          {featureCardsList.filter((c: any) => c.isActive).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {featureCardsList.filter((c: any) => c.isActive).map((card: any) => (
                <div key={card.id} className="rounded-2xl p-5 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-white/10" style={{ backgroundColor: card.bgColor }}>
                  <div className="flex items-start gap-3 mb-4">
                    {card.logoUrl ? (
                      <img src={card.logoUrl} alt={card.title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 text-2xl">📋</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black leading-tight" style={{ color: card.titleColor }}>{card.title}</h3>
                      {card.description && <p className="text-xs mt-1 leading-relaxed" style={{ color: card.descColor }}>{card.description}</p>}
                    </div>
                  </div>
                  {card.buttonLink && (
                    <a
                      href={card.buttonLink}
                      target={card.openInNewTab ? '_blank' : '_self'}
                      rel="noreferrer"
                      className="block w-full text-center py-2.5 rounded-xl font-black text-sm text-white transition-all hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: card.buttonColor }}
                    >
                      {card.buttonText}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Banners Informativos — no mesmo grid dos cards, mesma largura de coluna */}
          {activeBanners.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {activeBanners.map(b => (
                <div
                  key={b.id}
                  className="rounded-xl px-4 py-3 border border-white/10 flex items-start gap-3"
                  style={{ backgroundColor: b.bgColor, color: b.textColor }}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">📢</span>
                  <div className="min-w-0">
                    {b.title && <p className="text-sm font-bold leading-tight mb-0.5">{b.title}</p>}
                    <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-90">{b.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Foto Protegida */}
      {activeProtectedPhoto && (
        <section className="py-6 px-4">
          <div className="container max-w-2xl">
            <div className="bg-black/60 border border-purple-500/40 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-purple-500/20">
                <div className="w-9 h-9 rounded-xl bg-purple-600/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">🔒</span>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{activeProtectedPhoto.title}</p>
                  <p className="text-purple-300/70 text-xs">Conteúdo exclusivo para clientes cadastrados</p>
                </div>
              </div>

              {/* Imagem */}
              <div className="relative">
                {/* Verificar acesso: sessão existente OU acesso manual verificado */}
                {(photoAccessQuery.data?.hasAccess || protectedPhotoAccess === true) ? (
                  // ACESSO LIBERADO
                  <div>
                    <img
                      src={activeProtectedPhoto.imageUrl}
                      alt={activeProtectedPhoto.title}
                      className="w-full object-contain cursor-pointer"
                      style={{ maxHeight: '70vh' }}
                      onClick={() => setProtectedPhotoExpanded(true)}
                    />
                    <p className="text-center text-xs text-green-400/80 py-2">✅ Acesso liberado — clique na imagem para ampliar</p>
                  </div>
                ) : (
                  // ACESSO BLOQUEADO
                  <div className="relative">
                    <img
                      src={activeProtectedPhoto.imageUrl}
                      alt=""
                      className="w-full object-contain"
                      style={{ maxHeight: '70vh', filter: 'blur(24px) brightness(0.4)', userSelect: 'none', pointerEvents: 'none' }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <div className="bg-black/80 backdrop-blur-sm border border-purple-500/40 rounded-2xl p-6 max-w-sm w-full space-y-4">
                        <div className="text-4xl">🔒</div>
                        <p className="text-white font-bold text-base whitespace-pre-wrap">{activeProtectedPhoto.message}</p>
                        {protectedPhotoAccess === false && (
                          <p className="text-red-400 text-sm font-semibold">❌ Número não encontrado. Faça seu cadastro primeiro.</p>
                        )}
                        {/* Input de telefone para verificar acesso */}
                        <div className="space-y-2">
                          <input
                            type="tel"
                            value={protectedPhotoPhone}
                            onChange={e => setProtectedPhotoPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                            placeholder="Digite seu telefone (11 dígitos)"
                            className="w-full px-4 py-2.5 rounded-xl text-white text-sm text-center"
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(139,92,246,0.5)', outline: 'none' }}
                          />
                          <button
                            disabled={checkingPhotoAccess || protectedPhotoPhone.length < 10}
                            onClick={async () => {
                              if (protectedPhotoPhone.length < 10) return;
                              setCheckingPhotoAccess(true);
                              try {
                                // Usar fetch direto para não criar hook condicional
                                const res = await fetch('/api/trpc/protectedPhotos.checkAccess?input=' + encodeURIComponent(JSON.stringify({ phone: protectedPhotoPhone })));
                                const json = await res.json();
                                const hasAccess = json?.result?.data?.json?.hasAccess ?? false;
                                setProtectedPhotoAccess(hasAccess);
                              } catch {
                                setProtectedPhotoAccess(false);
                              } finally {
                                setCheckingPhotoAccess(false);
                              }
                            }}
                            className="w-full py-2.5 rounded-xl font-bold text-sm transition-all"
                            style={{ background: checkingPhotoAccess || protectedPhotoPhone.length < 10 ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.8)', color: '#fff', cursor: checkingPhotoAccess || protectedPhotoPhone.length < 10 ? 'not-allowed' : 'pointer' }}
                          >
                            {checkingPhotoAccess ? 'Verificando...' : '🔓 Verificar Acesso'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Lightbox foto protegida */}
      {protectedPhotoExpanded && activeProtectedPhoto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setProtectedPhotoExpanded(false)}
        >
          <img
            src={activeProtectedPhoto.imageUrl}
            alt={activeProtectedPhoto.title}
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setProtectedPhotoExpanded(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white font-bold text-xl"
          >✕</button>
        </div>
      )}

      {/* Banner de aviso para participar do sorteio */}
      {activeRaffle && (
        <section className="py-6 px-4">
          <div className="container max-w-4xl">
            <a href="#sorteio" className="block">
              <div className="relative overflow-hidden bg-gradient-to-r from-yellow-500/20 via-yellow-600/30 to-yellow-500/20 border-2 border-yellow-500/60 rounded-2xl p-5 md:p-6 animate-pulse-slow">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,215,0,0.1),transparent_70%)]" />
                <div className="relative flex items-center justify-center gap-3 flex-wrap">
                  <span className="text-3xl">🎉</span>
                  <div className="text-center">
                    <p className="text-yellow-400 font-black text-lg md:text-xl uppercase tracking-wide">Participe do Sorteio!</p>
                    <p className="text-white/80 text-sm md:text-base mt-1">Escolha seu número da sorte de 1 a 100 e concorra ao prêmio!</p>
                  </div>
                  <span className="text-3xl">🎁</span>
                </div>
                <div className="text-center mt-3 flex items-center justify-center gap-3 flex-wrap">
                  <span className="inline-block bg-yellow-500 text-black font-bold text-sm px-4 py-1.5 rounded-full">CLIQUE AQUI PARA PARTICIPAR ↓</span>
                  {raffleResult && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        document.getElementById('raffle-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-4 py-1.5 rounded-full transition-colors"
                    >
                      🏆 Ver resultado
                    </button>
                  )}
                </div>
              </div>
            </a>
          </div>
        </section>
      )}

      {/* Seção de Sorteio */}
      {activeRaffle && (
        <section id="sorteio" className="py-16 md:py-24 bg-gradient-to-b from-purple-900/20 to-black/20">
          <div className="container max-w-4xl">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/40 rounded-full px-4 py-1 mb-4">
                <span className="text-yellow-400 text-sm font-bold">SORTEIO ATIVO</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: '#FFD700' }}>{activeRaffle.title}</h2>
              {activeRaffle.description && <p className="text-lg text-white/70">{activeRaffle.description}</p>}
              {!(myRaffleEntry?.hasEntry || raffleSubmitted) && <p className="text-white/60 mt-2">Escolha um número de 1 a 100 para participar!</p>}
            </div>

            {/* Cliente já escolheu número - mostrar sem permitir alterar */}
            {(myRaffleEntry?.hasEntry || raffleSubmitted) ? (
              <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-xl font-bold text-green-400 mb-2">Você já está participando!</h3>
                <p className="text-white/70">Seu número escolhido: <span className="text-yellow-400 font-bold text-3xl">{myRaffleEntry?.number ?? raffleSelectedNumber}</span></p>
                <p className="text-white/50 text-sm mt-3">Não é possível alterar o número após a escolha. Boa sorte!</p>
              </div>
            ) : (
              <>
                {/* Grid de números */}
                <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-4 md:p-6 mb-6">
                  <div className="grid grid-cols-10 gap-1 md:gap-2">
                    {Array.from({ length: 100 }, (_, i) => i + 1).map(num => {
                      const isTaken = activeRaffle.takenNumbers.includes(num);
                      const isSelected = raffleSelectedNumber === num;
                      const entry = raffleEntries?.find(e => e.number === num);
                      const photoUrl = entry?.profilePhotoUrl;
                      return (
                        <button
                          key={num}
                          onClick={() => !isTaken && setRaffleSelectedNumber(isSelected ? null : num)}
                          disabled={isTaken}
                          title={isTaken && entry ? entry.customerName : undefined}
                          className={`relative aspect-square rounded-md text-xs md:text-sm font-bold transition-all duration-200 overflow-hidden ${
                            isTaken ? 'cursor-not-allowed' :
                            isSelected ? 'bg-yellow-500 text-black scale-110 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-300' :
                            'bg-white/10 text-white hover:bg-yellow-500/30 hover:text-yellow-300 border border-white/10 hover:border-yellow-500/50'
                          }`}
                          style={isTaken && photoUrl ? { backgroundImage: `url(${photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                        >
                          {isTaken && photoUrl && (
                            <span className="absolute inset-0 bg-black/40" />
                          )}
                          {isTaken && !photoUrl && (
                            <span className="absolute inset-0 bg-red-600/60" />
                          )}
                          <span className={`relative z-10 ${
                            isTaken ? 'text-white/80 line-through' : ''
                          }`}>{num}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white/10 border border-white/10"></span> Disponível</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600/60"></span> Ocupado</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500"></span> Selecionado</span>
                  </div>
                </div>

                {/* Formulário de confirmação */}
                {raffleSelectedNumber && (
                  <div className="bg-black/40 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-6">
                    <h3 className="text-xl font-bold text-yellow-400 mb-4 text-center">Confirmar Número {raffleSelectedNumber}</h3>
                    <div className="space-y-3 max-w-sm mx-auto">
                      <div>
                        <label className="text-white/80 text-sm mb-1 block">Seu Nome *</label>
                        <input type="text" value={raffleName} onChange={(e) => setRaffleName(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                          placeholder="Nome completo" />
                      </div>
                      <div>
                        <label className="text-white/80 text-sm mb-1 block">Seu Telefone *</label>
                        <input type="tel" value={rafflePhone} onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                          let formatted = digits;
                          if (digits.length > 2) formatted = `(${digits.slice(0,2)}) ${digits.slice(2)}`;
                          if (digits.length > 7) formatted = `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
                          setRafflePhone(formatted);
                        }}
                          className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-yellow-500 focus:outline-none"
                          placeholder="(11) 99999-9999" />
                      </div>
                      <button onClick={handleRaffleSubmit} disabled={raffleSubmitting}
                        className="w-full py-3 rounded-lg font-bold text-black bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50">
                        {raffleSubmitting ? 'Confirmando...' : 'CONFIRMAR NÚMERO'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Resultado do Sorteio */}
      {raffleResult && (
        <section id="raffle-result" className="py-16 md:py-24 bg-gradient-to-b from-yellow-900/10 to-black/20">
          <div className="container max-w-2xl text-center">
            <div className="bg-black/40 backdrop-blur-md border border-yellow-500/40 rounded-2xl p-8">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-3xl font-bold text-yellow-400 mb-2">Resultado do Sorteio</h2>
              <p className="text-white/70 mb-6">{raffleResult.title}</p>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
                <p className="text-white/60 text-sm mb-1">Número Sorteado</p>
                <p className="text-5xl font-bold text-yellow-400 mb-4">{raffleResult.winnerNumber}</p>
                <p className="text-white/60 text-sm mb-2">Ganhador</p>
                {/* Foto de perfil do ganhador */}
                <div className="flex justify-center mb-4">
                  {raffleResult.winnerProfilePhotoUrl ? (
                    <img
                      src={raffleResult.winnerProfilePhotoUrl}
                      alt="Foto do ganhador"
                      className="w-24 h-24 rounded-full object-cover border-4 border-yellow-400 shadow-lg shadow-yellow-500/30"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-yellow-500/20 border-4 border-yellow-400/50 flex items-center justify-center">
                      <Users className="w-12 h-12 text-yellow-400/70" />
                    </div>
                  )}
                </div>
                <p className="text-2xl font-bold text-white mb-1">{raffleResult.winnerName}</p>
                <p className="text-white/50">{raffleResult.winnerPhone?.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 backdrop-blur-sm text-white py-8 border-t border-primary/30">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="font-bold mb-3">{SITE_NAME}</h4>
              {FOOTER_TEXT && <p className="text-white/70">{FOOTER_TEXT}</p>}
            </div>
            <div>
              <h4 className="font-bold mb-3">Serviços</h4>
              <ul className="space-y-2 text-white/70">
                {(products || []).map((p: Product) => <li key={p.id}>{p.name}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-3">Contato</h4>
              <p className="text-white/70 mb-2">WhatsApp: {WHATSAPP_DISPLAY}</p>
              <p className="text-white/70">Disponível 24H</p>
            </div>
          </div>
          <div className="border-t border-primary/30 pt-8 text-center text-white/70">
            <p>&copy; {new Date().getFullYear()} {SITE_NAME}. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>

      {/* WhatsApp Flutuante */}
      {/* Modal Meus Dados */}
      {showMyData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowMyData(false)}>
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowMyData(false)} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              {myProfileQuery.data?.profilePhotoUrl ? (
                <img src={myProfileQuery.data.profilePhotoUrl} alt="foto" className="w-14 h-14 rounded-full object-cover border-2 border-primary/50" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                  <UserCircle className="w-8 h-8 text-primary" />
                </div>
              )}
              <div>
                <h2 className="text-base font-bold text-foreground">Meus Dados</h2>
                <p className="text-xs text-muted-foreground">Somente visualização</p>
              </div>
            </div>

            {myProfileQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : myProfileQuery.data ? (
              <div className="space-y-3">
                <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Nome completo</p>
                    <p className="text-sm font-semibold text-foreground">{myProfileQuery.data.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="text-sm font-semibold text-foreground">{myProfileQuery.data.phone}</p>
                  </div>
                  {myProfileQuery.data.email && (
                    <div>
                      <p className="text-xs text-muted-foreground">E-mail</p>
                      <p className="text-sm font-semibold text-foreground">{myProfileQuery.data.email}</p>
                    </div>
                  )}
                  {myProfileQuery.data.city && (
                    <div>
                      <p className="text-xs text-muted-foreground">Cidade</p>
                      <p className="text-sm font-semibold text-foreground">{myProfileQuery.data.city}{myProfileQuery.data.uf ? ` / ${myProfileQuery.data.uf}` : ''}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Cadastro desde</p>
                    <p className="text-sm font-semibold text-foreground">{new Date(myProfileQuery.data.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">Para alterar seus dados, entre em contato pelo WhatsApp.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Dados não encontrados.</p>
            )}
          </div>
        </div>
      )}

      {/* Botão WhatsApp gerenciado globalmente via WhatsAppFloat (App.tsx) — apenas na tela inicial */}

      {/* Colombia Bot — modal de tela cheia */}
      {showColombiaBot && (
        <ColombiaBot
          products={(products || []) as any}
          onStartNormal={() => setShowColombiaBot(false)}
          onSelectProduct={(product: any) => {
            setShowColombiaBot(false);
            handleServiceClick(product);
          }}
          onSelectOption={(product: any, option: any) => {
            setShowColombiaBot(false);
            setSelectedProduct(product);
            handleOptionSelection(option, null);
          }}
          onOrderComplete={(data: any) => {
            setShowColombiaBot(false);
            setSubmittedOrderData({
              cartItems: data.cartItems,
              answers: data.answers,
              docs: data.docs,
              totalValue: data.totalValue,
              referrerName: data.referrerName,
              referrerPhone: data.referrerPhone,
              clientName: data.clientName,
              clientPhone: data.clientPhone,
              clientCity: data.clientCity,
            });
            if (data.trackingPin) setTrackingPinFromServer(data.trackingPin);
            setSuccessMessage('Pedido enviado com sucesso!');
            setPostOrderReferralStep('done');
            setStep('success');
          }}
        />
      )}
    </div>
  );
}
