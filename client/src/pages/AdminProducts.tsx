import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, GripVertical, Eye, EyeOff, Save, X, HelpCircle, DollarSign, Package, ImagePlus, Loader2, FileText, Settings2, Palette, Gift, Volume2, Upload, Headphones } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import React from "react";

const whiteInputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff', color: '#000000', fontSize: '14px',
  border: '2px solid #555', borderRadius: '8px',
  padding: '8px 12px', width: '100%', outline: 'none', fontWeight: 500,
};

const QUESTION_PROMPT_AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);

async function readQuestionPromptAudio(file: File): Promise<{ data: string; mimeType: string }> {
  if (!QUESTION_PROMPT_AUDIO_MIME_TYPES.has(file.type)) {
    throw new Error('Use um áudio WEBM, OGG, M4A ou MP3.');
  }
  if (file.size === 0 || file.size > 12 * 1024 * 1024) {
    throw new Error('O áudio deve ter até 12 MB.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o áudio.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
  return { data: dataUrl.split(',')[1] || '', mimeType: file.type };
}

type DocumentType = {
  id: number; optionId: number; label: string; exampleImageUrl: string | null; inputSource: string; sortOrder: number;
};

type QuestionType = {
  id: number; productId: number; optionId: number | null; question: string;
  fieldType: string; options: string | null; isRequired: number; sortOrder: number;
  helpText: string | null; audioMinDurationSeconds: number; audioMaxDurationSeconds: number;
  allowAudioRerecord: number; allowAudioFileUpload: number;
  questionPresentation: 'text' | 'audio'; questionAudioUrl: string | null; questionAudioStorageKey: string | null;
  showQuestionTextWithAudio: number;
  parentQuestionId: number | null; triggerOption: string | null;
};

type WarrantyTierType = {
  id: number; optionId: number; warrantyType: string; warrantyValue: number;
  warrantyLabel: string | null; price: string; originalPrice: string | null;
  sortOrder: number; isActive: number;
};

type OptionType = {
  id: number; productId: number; label: string; price: string; originalPrice: string | null; type: string;
  sortOrder: number; isActive: number;
  requireProfilePhoto: number; requireCarDocument: number; requireAlvara: number;
  requireCondutaxi: number; requireVehicle2016: number; isPdfOnly: number;
  showYearField: number; docNameMode: string; docCustomName: string | null;
  questions: QuestionType[];
  documents: DocumentType[];
  warrantyTiers?: WarrantyTierType[];
  cardBorderColor?: string | null; cardBgColor?: string | null; cardTextColor?: string | null;
  cardButtonColor?: string | null; cardAccentColor?: string | null;
};

type ProductWithRelations = {
  id: number; name: string; description: string | null; iconUrl: string | null;
  buttonText: string; requireProfilePhoto: number; requireCarDocument: number;
  requireAlvara: number; requireCondutaxi: number; requireVehicle2016: number;
  isPdfOnly: number; showYearField: number; cardColor: string | null;
  cardBgColor: string | null; cardTextColor: string | null; cardBtnColor: string | null;
  isActive: number; sortOrder: number;
  options: OptionType[];
};

const PRESET_COLORS = [
  { label: 'Roxo', value: '#7c3aed' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Amarelo', value: '#ca8a04' },
  { label: 'Laranja', value: '#ea580c' },
  { label: 'Vermelho', value: '#dc2626' },
  { label: 'Rosa', value: '#db2777' },
  { label: 'Branco', value: '#ffffff' },
];

function ColorPicker({ label, value, onChange, defaultDisplay }: { label: string; value: string; onChange: (v: string) => void; defaultDisplay?: string }) {
  const [showPicker, setShowPicker] = useState(!!value);
  return (
    <div>
      <label className="text-[10px] text-gray-400 block mb-1">{label}</label>
      {!showPicker && !value ? (
        <button type="button" onClick={() => setShowPicker(true)} className="text-[10px] text-purple-400 hover:text-purple-300 border border-dashed border-purple-500/30 rounded px-2 py-1 hover:bg-purple-500/10 transition-colors">
          + Personalizar
        </button>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input type="color" value={value || '#7c3aed'} onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border-2 border-gray-600 cursor-pointer" />
            <span className="text-[10px] text-gray-400">{value || (defaultDisplay || 'Padrão')}</span>
            <button type="button" onClick={() => { onChange(''); setShowPicker(false); }} className="text-[10px] text-red-400 hover:text-red-300">X</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map(c => (
              <button key={c.value} type="button" onClick={() => onChange(c.value)} className={`w-4 h-4 rounded-full border ${value === c.value ? 'border-white ring-1 ring-white' : 'border-gray-600'}`} style={{ backgroundColor: c.value }} title={c.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageUploader({ productId, currentUrl, onUploaded }: { productId: number; currentUrl: string | null; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadMut = trpc.products.uploadImage.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success("Imagem enviada!"); setPreview(null); onUploaded(); }
      else toast.error(data.message || "Erro ao enviar imagem");
      setUploading(false);
    },
    onError: () => { toast.error("Erro ao enviar imagem"); setUploading(false); },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error("Selecione uma imagem"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máx 5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setUploading(true);
      uploadMut.mutate({ productId, imageBase64: result.split(',')[1], mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const displayUrl = preview || currentUrl;
  return (
    <div className="flex items-center gap-4">
      <div onClick={() => !uploading && fileRef.current?.click()} className="relative w-20 h-20 rounded-xl border-2 border-dashed border-purple-500/50 flex items-center justify-center cursor-pointer hover:border-purple-400 hover:bg-purple-500/10 transition-all overflow-hidden group" title="Clique para enviar imagem">
        {displayUrl ? (<><img src={displayUrl} alt="Card" className="w-full h-full object-cover rounded-xl" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl"><ImagePlus className="w-5 h-5 text-white" /></div></>) : (<div className="flex flex-col items-center gap-1 text-purple-400"><ImagePlus className="w-6 h-6" /><span className="text-[10px]">FOTO</span></div>)}
        {uploading && (<div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-xl"><Loader2 className="w-5 h-5 text-purple-400 animate-spin" /></div>)}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <div className="flex-1 text-xs text-gray-400">{displayUrl ? <span className="text-green-400">Imagem definida</span> : <span>Clique no quadrado para enviar a foto do card</span>}</div>
    </div>
  );
}

const docModes = [
  { value: 'none', label: 'Nenhum' },
  { value: 'random', label: 'Nome Aleatório' },
  { value: 'first_name', label: 'Primeiro Nome' },
  { value: 'full_name', label: 'Nome Completo' },
  { value: 'custom', label: 'Nome Personalizado' },
];

// Componente completo para cada opção: documentos dinâmicos + perguntas
function OptionCard({ opt, productId, onUpdate, onDelete, allProducts, isFirst, isLast, onMoveUp, onMoveDown }: {
  opt: OptionType; productId: number;
  onUpdate: (data: any) => void; onDelete: () => void;
  allProducts?: ProductWithRelations[];
  isFirst?: boolean; isLast?: boolean;
  onMoveUp?: () => void; onMoveDown?: () => void;
}) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);

  // Configurações da opção
  const [label, setLabel] = useState(opt.label);
  const [price, setPrice] = useState(opt.price);
  const [originalPrice, setOriginalPrice] = useState(opt.originalPrice || '');
  const [promoEndsAt, setPromoEndsAt] = useState<string>(
    (opt as any).promoEndsAt ? new Date((opt as any).promoEndsAt).toISOString().slice(0, 16) : ''
  );
  const [docNameMode, setDocNameMode] = useState(opt.docNameMode || 'none');
  const [docCustomName, setDocCustomName] = useState(opt.docCustomName || '');
  const [warranty, setWarranty] = useState((opt as any).warranty || '');
  const [commissionValue, setCommissionValue] = useState(String(Math.round(((opt as any).commissionValue || 0) / 100)));
  const [description, setDescription] = useState((opt as any).description || '');
  const [cardBorderColor, setCardBorderColor] = useState((opt as any).cardBorderColor || '');
  const [cardBgColor, setCardBgColor] = useState((opt as any).cardBgColor || '');
  const [cardTextColor, setCardTextColor] = useState((opt as any).cardTextColor || '');
  const [cardButtonColor, setCardButtonColor] = useState((opt as any).cardButtonColor || '');
  const [cardAccentColor, setCardAccentColor] = useState((opt as any).cardAccentColor || '');
  const [dirty, setDirty] = useState(false);

  // Tiers de garantia
  const [newTierType, setNewTierType] = useState('corridas');
  const [newTierValue, setNewTierValue] = useState('');
  const [newTierLabel, setNewTierLabel] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('');
  const [newTierOriginalPrice, setNewTierOriginalPrice] = useState('');

  const [editingTierId, setEditingTierId] = useState<number | null>(null);
  const [editTierType, setEditTierType] = useState('corridas');
  const [editTierValue, setEditTierValue] = useState('');
  const [editTierLabel, setEditTierLabel] = useState('');
  const [editTierPrice, setEditTierPrice] = useState('');
  const [editTierOriginalPrice, setEditTierOriginalPrice] = useState('');

  const createTierMut = trpc.warrantyTiers.create.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); setNewTierValue(''); setNewTierLabel(''); setNewTierPrice(''); setNewTierOriginalPrice(''); toast.success('Tier de garantia adicionado!'); }
  });
  const updateTierMut = trpc.warrantyTiers.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); setEditingTierId(null); toast.success('Tier atualizado!'); }
  });
  const deleteTierMut = trpc.warrantyTiers.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success('Tier removido!'); }
  });

  // Novo documento dinâmico
  const [newDocLabel, setNewDocLabel] = useState("");

  // Question form state
  const [newQText, setNewQText] = useState("");
  const [newQType, setNewQType] = useState<"text" | "select" | "textarea" | "audio">("text");
  const [newQOptions, setNewQOptions] = useState("");
  const [newQRequired, setNewQRequired] = useState(true);
  const [newQHelpText, setNewQHelpText] = useState("");
  const [newQAudioMin, setNewQAudioMin] = useState("1");
  const [newQAudioMax, setNewQAudioMax] = useState("120");
  const [newQAllowRerecord, setNewQAllowRerecord] = useState(true);
  const [newQAllowFileUpload, setNewQAllowFileUpload] = useState(true);
  const [newQPresentation, setNewQPresentation] = useState<'text' | 'audio'>('text');
  const [newQShowTextWithAudio, setNewQShowTextWithAudio] = useState(false);
  const [newQPromptAudioFile, setNewQPromptAudioFile] = useState<File | null>(null);
  // Pergunta condicional
  const [newQParentId, setNewQParentId] = useState<number | null>(null);
  const [newQTriggerOption, setNewQTriggerOption] = useState("");
  // Cores por opção: { "Sim": "#22c55e", "Não": "#ef4444" }
  const [optionColors, setOptionColors] = useState<Record<string, string>>({});
  // Opções bloqueantes: { "Não": true } — bloqueia o pedido se selecionada
  const [blockingOptions, setBlockingOptions] = useState<Record<string, boolean>>({});
  const PRESET_COLORS = [
    { label: 'Verde', value: '#22c55e' },
    { label: 'Vermelho', value: '#ef4444' },
    { label: 'Amarelo', value: '#eab308' },
    { label: 'Azul', value: '#3b82f6' },
    { label: 'Roxo', value: '#a855f7' },
    { label: 'Laranja', value: '#f97316' },
    { label: 'Cinza', value: '#6b7280' },
  ];

  const createDocMut = trpc.optionDocuments.create.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); setNewDocLabel(""); toast.success("Documento adicionado!"); }
  });
  const deleteDocMut = trpc.optionDocuments.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Documento removido!"); }
  });
  const uploadExampleMut = trpc.optionDocuments.uploadExampleImage.useMutation({
    onSuccess: (data) => {
      if (data.success) { utils.products.list.invalidate(); toast.success("Foto exemplo enviada!"); }
      else toast.error(data.message || "Erro ao enviar foto exemplo");
    },
    onError: () => toast.error("Erro ao enviar foto exemplo"),
  });
  const removeExampleMut = trpc.optionDocuments.removeExampleImage.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Foto exemplo removida!"); },
  });
  const createQMut = trpc.productQuestions.create.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); }
  });
  const uploadQuestionPromptAudioMut = trpc.productQuestions.uploadPromptAudio.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success('Áudio da pergunta enviado!'); },
    onError: (error) => toast.error(error.message || 'Erro ao enviar o áudio da pergunta.'),
  });
  const removeQuestionPromptAudioMut = trpc.productQuestions.removePromptAudio.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success('Pergunta em áudio removida.'); },
    onError: (error) => toast.error(error.message || 'Erro ao remover o áudio da pergunta.'),
  });
  const deleteQMut = trpc.productQuestions.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Pergunta excluída!"); }
  });

  // Edição de pergunta existente
  const [editingQId, setEditingQId] = useState<number | null>(null);
  const [editQText, setEditQText] = useState("");
  const [editQType, setEditQType] = useState<"text" | "select" | "textarea" | "audio">("text");
  const [editQOptions, setEditQOptions] = useState("");
  const [editQRequired, setEditQRequired] = useState(true);
  const [editQHelpText, setEditQHelpText] = useState("");
  const [editQAudioMin, setEditQAudioMin] = useState("1");
  const [editQAudioMax, setEditQAudioMax] = useState("120");
  const [editQAllowRerecord, setEditQAllowRerecord] = useState(true);
  const [editQAllowFileUpload, setEditQAllowFileUpload] = useState(true);
  const [editQPresentation, setEditQPresentation] = useState<'text' | 'audio'>('text');
  const [editQShowTextWithAudio, setEditQShowTextWithAudio] = useState(false);
  const [editQPromptAudioFile, setEditQPromptAudioFile] = useState<File | null>(null);
  const [editQParentId, setEditQParentId] = useState<number | null>(null);
  const [editQTriggerOption, setEditQTriggerOption] = useState("");
  const updateQMut = trpc.productQuestions.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); }
  });
  const startEditingQuestion = (question: QuestionType) => {
    setEditingQId(question.id);
    setEditQText(question.question);
    setEditQType(question.fieldType as any);
    setEditQOptions((() => { try { const p = JSON.parse(question.options || '[]'); return Array.isArray(p) ? p.map((o: any) => typeof o === 'string' ? o : o.label).join(', ') : question.options || ''; } catch { return question.options || ''; } })());
    setEditQRequired(question.isRequired === 1);
    setEditQHelpText(question.helpText || '');
    setEditQAudioMin(String(question.audioMinDurationSeconds || 1));
    setEditQAudioMax(String(question.audioMaxDurationSeconds || 120));
    setEditQAllowRerecord(question.allowAudioRerecord !== 0);
    setEditQAllowFileUpload(question.allowAudioFileUpload !== 0);
    setEditQPresentation(question.questionPresentation === 'audio' ? 'audio' : 'text');
    setEditQShowTextWithAudio(question.showQuestionTextWithAudio === 1);
    setEditQPromptAudioFile(null);
    setEditQParentId(question.parentQuestionId);
    setEditQTriggerOption(question.triggerOption || '');
  };
  const reorderQMut = trpc.productQuestions.reorder.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); }
  });

  // Cópia de perguntas de outro produto
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyFromOptionId, setCopyFromOptionId] = useState<number | null>(null);
  const copyFromMut = trpc.productQuestions.copyFromOption.useMutation({
    onSuccess: (data) => {
      utils.products.list.invalidate();
      setShowCopyModal(false);
      setCopyFromOptionId(null);
      toast.success(`${data.count} pergunta(s) copiada(s) com sucesso!`);
    },
    onError: () => toast.error('Erro ao copiar perguntas'),
  });
  const moveQuestion = (questions: QuestionType[], idx: number, dir: 'up' | 'down') => {
    const arr = [...questions];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    const items = arr.map((q, i) => ({ id: q.id, sortOrder: i + 1 }));
    reorderQMut.mutate({ items });
  };

  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editDocLabel, setEditDocLabel] = useState("");
  const [editDocInputSource, setEditDocInputSource] = useState<string>("both");
  const [editDocInstruction, setEditDocInstruction] = useState("");
  const [editDocExampleText, setEditDocExampleText] = useState("");
  const updateDocMut = trpc.optionDocuments.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); setEditingDocId(null); toast.success("Documento atualizado!"); }
  });

  const markDirty = () => setDirty(true);

  const handleSave = () => {
    const commissionCents = Math.round(parseFloat(commissionValue.replace(',', '.') || '0') * 100);
    onUpdate({
      id: opt.id,
      label,
      price,
      originalPrice,
      promoEndsAt: promoEndsAt ? new Date(promoEndsAt).getTime() : null,
      docNameMode,
      docCustomName: docNameMode === 'custom' ? docCustomName : '',
      warranty,
      commissionValue: isNaN(commissionCents) ? 0 : commissionCents,
      description,
      cardBorderColor: cardBorderColor || null,
      cardBgColor: cardBgColor || null,
      cardTextColor: cardTextColor || null,
      cardButtonColor: cardButtonColor || null,
      cardAccentColor: cardAccentColor || null,
    });
    setDirty(false);
  };

  const totalQuestions = opt.questions?.length || 0;
  const totalDocs = opt.documents?.length || 0;

  return (
    <div className="bg-black/30 rounded-lg border border-gray-700/30 overflow-hidden">
      {/* Option header */}
      <div className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="flex-1 text-sm font-medium truncate">{opt.label}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {opt.originalPrice && opt.originalPrice.trim() !== '' && (
            <span className="text-gray-400 text-xs line-through">{opt.originalPrice}</span>
          )}
          <span className="text-green-400 font-bold text-sm">{opt.price}</span>
          <span className="text-xs text-gray-500">{opt.type}</span>
          {totalDocs > 0 && <span className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{totalDocs} docs</span>}
          {totalQuestions > 0 && <span className="text-xs text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{totalQuestions} perg.</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={isFirst || !onMoveUp} className="p-1 text-gray-400 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para cima">▲</button>
          <button onClick={onMoveDown} disabled={isLast || !onMoveDown} className="p-1 text-gray-400 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para baixo">▼</button>
          <button onClick={onDelete} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Deletar opção"><Trash2 className="w-3 h-3" /></button>
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:bg-white/10 rounded" title={expanded ? "Recolher" : "Expandir"}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded: Config + Docs + Questions */}
      {expanded && (
        <div className="border-t border-gray-700/20 p-3 space-y-4">
          {/* === CONFIGURAÇÕES GERAIS DA OPÇÃO === */}
          <div className="p-3 bg-black/40 rounded-lg border border-green-500/20 space-y-3">
            <p className="text-xs text-green-400 font-bold flex items-center gap-1"><Settings2 className="w-3 h-3" /> Configurações da Opção</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Nome da Opção</label>
                <input value={label} onChange={e => { setLabel(e.target.value); markDirty(); }} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Valor Promocional (destaque)</label>
                <input value={price} onChange={e => { setPrice(e.target.value); markDirty(); }} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} placeholder="Ex: 450,00" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-orange-400 block mb-1">Valor Original (riscado) — deixe vazio se não houver promoção</label>
              <input value={originalPrice} onChange={e => { setOriginalPrice(e.target.value); markDirty(); }} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: originalPrice ? '#f97316' : '#555' }} placeholder="Ex: 500,00 (opcional)" />
              {originalPrice && originalPrice.trim() !== '' && (
                <p className="text-[10px] text-orange-300 mt-1">Preview: <span className="line-through text-gray-400">{originalPrice}</span> → <span className="text-green-400 font-bold">{price}</span></p>
              )}
            </div>
            {originalPrice && originalPrice.trim() !== '' && (
              <div>
                <label className="text-[10px] text-red-400 block mb-1">⏰ Encerramento da Promoção (opcional) — deixe vazio para sem prazo</label>
                <input
                  type="datetime-local"
                  value={promoEndsAt}
                  onChange={e => { setPromoEndsAt(e.target.value); markDirty(); }}
                  style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: promoEndsAt ? '#ef4444' : '#555' }}
                />
                {promoEndsAt && (
                  <p className="text-[10px] text-red-300 mt-1">⏳ Promoção encerra em: {new Date(promoEndsAt).toLocaleString('pt-BR')}</p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs text-yellow-400 font-bold block mb-1">Forma de Nome do Documento</label>
              <select value={docNameMode} onChange={e => { setDocNameMode(e.target.value); markDirty(); }} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                {docModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {docNameMode === 'custom' && (
                <div className="mt-2">
                  <label className="text-xs text-yellow-300 block mb-1">Nome personalizado:</label>
                  <input value={docCustomName} onChange={e => { setDocCustomName(e.target.value); markDirty(); }} placeholder="Ex: joao-silva" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                </div>
              )}
            </div>

            {/* Comissão de Indicação */}
            <div>
              <label className="text-xs text-yellow-300 font-bold block mb-1">💰 Comissão de Indicação (R$)</label>
              <input
                value={commissionValue}
                onChange={e => { setCommissionValue(e.target.value); markDirty(); }}
                placeholder="Ex: 50 (para R$ 50,00)"
                type="number"
                min="0"
                step="1"
                style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: parseFloat(commissionValue) > 0 ? '#eab308' : '#555' }}
              />
              {parseFloat(commissionValue) > 0 && (
                <p className="text-[10px] text-yellow-300 mt-1">💵 Comissão: R$ {parseFloat(commissionValue).toFixed(2).replace('.', ',')} por indicação</p>
              )}
            </div>

            {/* Especificação/Descrição */}
            <div>
              <label className="text-xs text-cyan-400 font-bold block mb-1">📋 Especificação do Produto (exibida ao cliente)</label>
              <textarea
                value={description}
                onChange={e => { setDescription(e.target.value); markDirty(); }}
                placeholder="Ex: Inclui criação de conta, configuração do app, foto de perfil agendada..."
                rows={3}
                style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: description ? '#06b6d4' : '#555', resize: 'vertical' }}
              />
              {description && <p className="text-[10px] text-cyan-300 mt-1">Preview: {description.slice(0, 80)}{description.length > 80 ? '...' : ''}</p>}
            </div>

            {/* Aparência exclusiva desta opção na vitrine */}
            <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3 space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-purple-300 flex items-center gap-1"><Palette className="w-3 h-3" /> Aparência deste card na vitrine</p>
                  <p className="text-[10px] text-gray-400">Vazio = mantém exatamente a aparência atual herdada do produto.</p>
                </div>
                <button type="button" onClick={() => { setCardBorderColor(''); setCardBgColor(''); setCardTextColor(''); setCardButtonColor(''); setCardAccentColor(''); markDirty(); }} className="text-[10px] font-bold text-gray-300 hover:text-white underline">
                  Restaurar padrão
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <ColorPicker label="Borda" value={cardBorderColor} onChange={v => { setCardBorderColor(v); markDirty(); }} defaultDisplay="Produto" />
                <ColorPicker label="Fundo" value={cardBgColor} onChange={v => { setCardBgColor(v); markDirty(); }} defaultDisplay="Produto" />
                <ColorPicker label="Texto" value={cardTextColor} onChange={v => { setCardTextColor(v); markDirty(); }} defaultDisplay="Produto" />
                <ColorPicker label="Botão Carrinho" value={cardButtonColor} onChange={v => { setCardButtonColor(v); markDirty(); }} defaultDisplay="Produto" />
                <ColorPicker label="Destaque" value={cardAccentColor} onChange={v => { setCardAccentColor(v); markDirty(); }} defaultDisplay="Produto" />
              </div>
              <div className="overflow-hidden rounded-lg border" style={{ borderColor: cardBorderColor || '#ffffff22', background: cardBgColor || '#0b1020' }}>
                <div className="h-1" style={{ background: cardAccentColor || cardBorderColor || '#7c3aed' }} />
                <div className="p-2">
                  <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: cardAccentColor || '#a855f7' }}>Prévia da opção</p>
                  <p className="mt-1 text-xs font-black" style={{ color: cardTextColor || '#ffffff' }}>{label || 'Nome da opção'}</p>
                  <div className="mt-2 inline-flex rounded px-2 py-1 text-[9px] font-black" style={{ background: cardButtonColor || '#ffffff', color: cardTextColor || '#000000' }}>Carrinho</div>
                </div>
              </div>
            </div>

            {/* Garantia */}
            <div>
              <label className="text-xs text-emerald-400 font-bold block mb-1">🛡️ Garantia (opcional)</label>
              <input
                value={warranty}
                onChange={e => { setWarranty(e.target.value); markDirty(); }}
                placeholder="Ex: 25 corridas ou 7 dias (o que chegar primeiro)"
                style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: warranty ? '#10b981' : '#555' }}
              />
              {warranty && <p className="text-[10px] text-emerald-300 mt-1">Garantia: {warranty}</p>}
            </div>

            {/* BOTÃO SALVAR - SEMPRE VISÍVEL */}
            <Button onClick={handleSave} size="sm" className={`w-full text-white text-xs ${dirty ? 'bg-green-600 hover:bg-green-700 animate-pulse' : 'bg-green-700/50 hover:bg-green-700'}`}>
              <Save className="w-3 h-3 mr-1" /> {dirty ? 'SALVAR ALTERAÇÕES' : 'Salvar'}
            </Button>
          </div>

          {/* === DOCUMENTOS DINÂMICOS === */}
          <div className="p-3 bg-black/40 rounded-lg border border-blue-500/20 space-y-3">
            <p className="text-xs text-blue-400 font-bold flex items-center gap-1"><FileText className="w-3 h-3" /> Documentos Exigidos ({totalDocs})</p>
            <p className="text-[10px] text-gray-500">Adicione os documentos que o cliente precisa enviar. Você pode digitar qualquer nome (ex: CNH, Foto Perfil, Comprovante de Residência, etc).</p>

            {/* Lista de documentos existentes */}
            {totalDocs > 0 && (
              <div className="space-y-2">
                {opt.documents.map((doc, idx) => (
                  <div key={doc.id} className="bg-black/30 px-3 py-2 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <span className="text-xs text-gray-500 w-5">{idx + 1}.</span>
                      <FileText className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium">{doc.label}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditingDocId(doc.id); setEditDocLabel(doc.label); setEditDocInputSource(doc.inputSource || 'both'); setEditDocInstruction((doc as any).instruction || ''); setEditDocExampleText((doc as any).exampleText || ''); }} className="p-1 text-blue-400 hover:bg-blue-500/20 rounded" title="Editar documento"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => deleteDocMut.mutate({ id: doc.id })} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Remover documento"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    {/* Modal de edição de documento */}
                    {editingDocId === doc.id && (
                      <div className="bg-blue-900/20 border border-blue-500/40 rounded-lg p-3 space-y-3">
                        <p className="text-[10px] text-blue-400 font-bold">Editando documento</p>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-1">Nome do Documento</label>
                          <input value={editDocLabel} onChange={e => setEditDocLabel(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-1">Tipo de Entrada</label>
                          <select value={editDocInputSource} onChange={e => setEditDocInputSource(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                            <option value="both">Câmera e Galeria</option>
                            <option value="camera">Apenas Câmera</option>
                            <option value="gallery">Apenas Galeria</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-2">Foto Exemplo</label>
                          {doc.exampleImageUrl ? (
                            <div className="flex items-center gap-2 mb-2">
                              <img src={doc.exampleImageUrl} alt="Exemplo" className="w-12 h-12 rounded-lg object-cover border border-green-500/50" />
                              <button onClick={() => removeExampleMut.mutate({ docId: doc.id })} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Remover foto"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ) : null}
                          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1.5 rounded">
                            <ImagePlus className="w-3 h-3" />
                            <span>{doc.exampleImageUrl ? 'Trocar foto' : 'Adicionar foto'}</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
                              if (file.size > 5 * 1024 * 1024) { toast.error('Máx 5MB'); return; }
                              const reader = new FileReader();
                              reader.onload = () => {
                                const result = reader.result as string;
                                uploadExampleMut.mutate({ docId: doc.id, imageBase64: result.split(',')[1], mimeType: file.type });
                              };
                              reader.readAsDataURL(file);
                            }} />
                          </label>
                          {uploadExampleMut.isPending && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                        </div>
                        <div>
                          <label className="text-[10px] text-amber-400 font-bold block mb-1">📌 Instrução para o cliente (exibida na tela de upload)</label>
                          <textarea
                            value={editDocInstruction}
                            onChange={e => setEditDocInstruction(e.target.value)}
                            placeholder="Ex: Envie uma foto do documento original, nítida e sem cortes..."
                            rows={3}
                            style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: editDocInstruction ? '#f59e0b' : '#555', resize: 'vertical' }}
                          />
                          {editDocInstruction && <p className="text-[10px] text-amber-300 mt-1">Preview: {editDocInstruction.slice(0, 80)}{editDocInstruction.length > 80 ? '...' : ''}</p>}
                        </div>
                        <div>
                          <label className="text-[10px] text-blue-400 font-bold block mb-1">📘 Texto ao lado da foto de exemplo (bloco azul)</label>
                          <textarea
                            value={editDocExampleText}
                            onChange={e => setEditDocExampleText(e.target.value)}
                            placeholder="Ex: Foto frontal do rosto, bem iluminada&#10;Sem óculos escuros ou boné&#10;Fundo neutro (parede branca ou clara)"
                            rows={4}
                            style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: editDocExampleText ? '#3b82f6' : '#555', resize: 'vertical' }}
                          />
                          {editDocExampleText && <p className="text-[10px] text-blue-300 mt-1">Preview: {editDocExampleText.slice(0, 80)}{editDocExampleText.length > 80 ? '...' : ''}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => { updateDocMut.mutate({ id: doc.id, label: editDocLabel.trim(), inputSource: editDocInputSource as 'camera' | 'gallery' | 'both', instruction: editDocInstruction.trim() || null, exampleText: editDocExampleText.trim() || null }); setEditingDocId(null); }} className="bg-blue-600 hover:bg-blue-700 text-white text-xs flex-1" size="sm"><Save className="w-3 h-3 mr-1" /> Salvar</Button>
                          <Button onClick={() => setEditingDocId(null)} variant="outline" className="text-white border-gray-600 hover:bg-white/10 text-xs flex-1" size="sm"><X className="w-3 h-3 mr-1" /> Cancelar</Button>
                        </div>
                      </div>
                    )}
                    {/* Upload de foto exemplo */}
                    <div className="flex items-center gap-2 ml-7">
                      {doc.exampleImageUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={doc.exampleImageUrl} alt="Exemplo" className="w-10 h-10 rounded-lg object-cover border border-green-500/50" />
                          <span className="text-[10px] text-green-400">Foto exemplo</span>
                          <button onClick={() => removeExampleMut.mutate({ docId: doc.id })} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Remover foto exemplo"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-400 hover:text-blue-400 transition-colors">
                          <ImagePlus className="w-3 h-3" />
                          <span>Adicionar foto exemplo</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
                            if (file.size > 5 * 1024 * 1024) { toast.error('M\u00e1x 5MB'); return; }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result = reader.result as string;
                              uploadExampleMut.mutate({ docId: doc.id, imageBase64: result.split(',')[1], mimeType: file.type });
                            };
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                      )}
                      {uploadExampleMut.isPending && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulário para adicionar novo documento */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 block mb-1">Nome do Documento</label>
                <input value={newDocLabel} onChange={e => setNewDocLabel(e.target.value)} placeholder="Ex: CNH, Foto Perfil, Alvará..." style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newDocLabel.trim()) {
                      createDocMut.mutate({ optionId: opt.id, label: newDocLabel.trim(), sortOrder: totalDocs });
                    }
                  }}
                />
              </div>
              <Button onClick={() => {
                if (!newDocLabel.trim()) { toast.error("Digite o nome do documento"); return; }
                createDocMut.mutate({ optionId: opt.id, label: newDocLabel.trim(), sortOrder: totalDocs });
              }} className="bg-blue-600 hover:bg-blue-700 text-white text-xs" size="sm" disabled={createDocMut.isPending}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* === TIERS DE GARANTIA === */}
          <div className="p-3 bg-black/40 rounded-lg border border-emerald-500/20 space-y-3">
            <p className="text-xs text-emerald-400 font-bold flex items-center gap-1">🛡️ Tiers de Garantia ({opt.warrantyTiers?.length || 0})</p>
            <p className="text-[10px] text-gray-500">Cada tier define um nível de garantia com preço diferente. Ex: 25 corridas = R$400 | 100 corridas = R$600.</p>

            {/* Lista de tiers existentes */}
            {(opt.warrantyTiers || []).length > 0 && (
              <div className="space-y-2">
                {(opt.warrantyTiers || []).map((tier, idx) => (
                  <div key={tier.id}>
                    {editingTierId === tier.id ? (
                      /* Formulário inline de edição */
                      <div className="bg-emerald-900/20 border border-emerald-500/40 rounded-lg p-3 space-y-2">
                        <p className="text-[10px] text-emerald-400 font-bold">Editando tier {idx + 1}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Tipo</label>
                            <select value={editTierType} onChange={e => setEditTierType(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                              <option value="corridas">Corridas</option>
                              <option value="dias">Dias</option>
                              <option value="semanas">Semanas</option>
                              <option value="meses">Meses</option>
                              <option value="anos">Anos</option>
                              <option value="livre">Texto livre</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">{editTierType === 'livre' ? 'Texto' : 'Quantidade'}</label>
                            <input value={editTierValue} onChange={e => setEditTierValue(e.target.value)} placeholder={editTierType === 'livre' ? 'Ex: Vitalício' : 'Ex: 25'} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-1">Complemento (opcional)</label>
                          <input value={editTierLabel} onChange={e => setEditTierLabel(e.target.value)} placeholder="Ex: ou 7 dias (o que chegar primeiro)" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Preço</label>
                            <input value={editTierPrice} onChange={e => setEditTierPrice(e.target.value)} placeholder="Ex: R$ 400,00" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: editTierPrice ? '#10b981' : '#555' }} />
                          </div>
                          <div>
                            <label className="text-[10px] text-orange-400 block mb-1">Preço Original (riscado)</label>
                            <input value={editTierOriginalPrice} onChange={e => setEditTierOriginalPrice(e.target.value)} placeholder="Opcional" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: editTierOriginalPrice ? '#f97316' : '#555' }} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              if (!editTierPrice.trim()) { toast.error('Preencha o preço'); return; }
                              const val = editTierType === 'livre' ? 0 : parseInt(editTierValue) || 0;
                              const lbl = editTierType === 'livre' ? (editTierValue || 'Livre') : editTierLabel;
                              updateTierMut.mutate({
                                id: tier.id,
                                warrantyType: editTierType,
                                warrantyValue: val,
                                warrantyLabel: lbl || '',
                                price: editTierPrice,
                                originalPrice: editTierOriginalPrice || '',
                              });
                            }}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                            size="sm"
                            disabled={updateTierMut.isPending}
                          >
                            {updateTierMut.isPending ? 'Salvando...' : 'Salvar'}
                          </Button>
                          <Button onClick={() => setEditingTierId(null)} variant="outline" size="sm" className="text-xs">Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      /* Exibição normal */
                      <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg">
                        <span className="text-xs text-gray-500 w-4">{idx + 1}.</span>
                        <span className="flex-1 text-xs font-medium text-emerald-300">
                          {tier.warrantyValue > 0 ? `${tier.warrantyValue} ${tier.warrantyType}` : tier.warrantyType}
                          {tier.warrantyLabel ? ` (${tier.warrantyLabel})` : ''}
                        </span>
                        {tier.originalPrice && tier.originalPrice.trim() !== '' && (
                          <span className="text-xs text-gray-400 line-through">{tier.originalPrice}</span>
                        )}
                        <span className="text-xs font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded">{tier.price}</span>
                        {tier.isActive === 0 && <span className="text-[10px] text-gray-500">(inativo)</span>}
                        <button
                          onClick={() => {
                            setEditingTierId(tier.id);
                            setEditTierType(tier.warrantyType);
                            setEditTierValue(tier.warrantyValue > 0 ? String(tier.warrantyValue) : (tier.warrantyLabel || ''));
                            setEditTierLabel(tier.warrantyValue > 0 ? (tier.warrantyLabel || '') : '');
                            setEditTierPrice(tier.price);
                            setEditTierOriginalPrice(tier.originalPrice || '');
                          }}
                          className="p-1 text-blue-400 hover:bg-blue-500/20 rounded"
                          title="Editar"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => { if (confirm('Remover este tier?')) deleteTierMut.mutate({ id: tier.id }); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Remover"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Formulário para novo tier */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Tipo de Garantia</label>
                  <select value={newTierType} onChange={e => setNewTierType(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                    <option value="corridas">Corridas</option>
                    <option value="dias">Dias</option>
                    <option value="semanas">Semanas</option>
                    <option value="meses">Meses</option>
                    <option value="anos">Anos</option>
                    <option value="livre">Texto livre</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">{newTierType === 'livre' ? 'Texto da Garantia' : 'Quantidade'}</label>
                  <input value={newTierValue} onChange={e => setNewTierValue(e.target.value)} placeholder={newTierType === 'livre' ? 'Ex: Vitalício' : 'Ex: 25'} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Complemento (opcional)</label>
                <input value={newTierLabel} onChange={e => setNewTierLabel(e.target.value)} placeholder="Ex: ou 7 dias (o que chegar primeiro)" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Preço deste Tier</label>
                  <input value={newTierPrice} onChange={e => setNewTierPrice(e.target.value)} placeholder="Ex: R$ 400,00" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: newTierPrice ? '#10b981' : '#555' }} />
                </div>
                <div>
                  <label className="text-[10px] text-orange-400 block mb-1">Preço Original (riscado)</label>
                  <input value={newTierOriginalPrice} onChange={e => setNewTierOriginalPrice(e.target.value)} placeholder="Opcional" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px', borderColor: newTierOriginalPrice ? '#f97316' : '#555' }} />
                </div>
              </div>
              <Button
                onClick={() => {
                  if (!newTierPrice.trim()) { toast.error('Preencha o preço'); return; }
                  const val = newTierType === 'livre' ? 0 : parseInt(newTierValue) || 0;
                  const label = newTierType === 'livre' ? (newTierValue || 'Livre') : undefined;
                  createTierMut.mutate({
                    optionId: opt.id,
                    warrantyType: newTierType,
                    warrantyValue: val,
                    warrantyLabel: newTierLabel || label || '',
                    price: newTierPrice,
                    originalPrice: newTierOriginalPrice || '',
                    sortOrder: (opt.warrantyTiers || []).length,
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs w-full"
                size="sm"
                disabled={createTierMut.isPending}
              >
                <Plus className="w-3 h-3 mr-1" /> {createTierMut.isPending ? 'Adicionando...' : 'Adicionar Tier de Garantia'}
              </Button>
            </div>
          </div>

          {/* === PERGUNTAS INDIVIDUAIS === */}
          <div className="p-3 bg-black/40 rounded-lg border border-purple-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-purple-400 font-bold flex items-center gap-1"><HelpCircle className="w-3 h-3" /> Perguntas do Formulário ({totalQuestions})</p>
              {allProducts && allProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCopyModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-400 text-[10px] rounded transition-colors"
                >
                  📋 Copiar de outro produto
                </button>
              )}
            </div>

            {/* Modal de cópia de perguntas */}
            {showCopyModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowCopyModal(false)}>
                <div className="bg-gray-900 border border-cyan-500/40 rounded-xl p-5 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-bold text-cyan-400">📋 Copiar perguntas de outro produto</h3>
                  <p className="text-xs text-gray-400">Selecione a opção de origem. As perguntas atuais de <strong className="text-white">{opt.label}</strong> serão substituídas.</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {allProducts?.flatMap(prod =>
                      prod.options
                        .filter(o => o.id !== opt.id)
                        .map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setCopyFromOptionId(o.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                              copyFromOptionId === o.id
                                ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                                : 'bg-black/30 border-white/10 text-gray-300 hover:border-cyan-500/50'
                            }`}
                          >
                            <span className="text-gray-500 text-[10px]">{prod.name} /</span> {o.label}
                            <span className="ml-2 text-gray-500 text-[10px]">({o.questions?.length || 0} perguntas)</span>
                          </button>
                        ))
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setShowCopyModal(false); setCopyFromOptionId(null); }} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs">Cancelar</button>
                    <button
                      type="button"
                      disabled={!copyFromOptionId || copyFromMut.isPending}
                      onClick={() => {
                        if (!copyFromOptionId) return;
                        if (!window.confirm(`Substituir TODAS as ${totalQuestions} perguntas atuais pelas da opção selecionada?`)) return;
                        copyFromMut.mutate({ fromOptionId: copyFromOptionId, toOptionId: opt.id, toProductId: productId });
                      }}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded text-xs font-bold"
                    >
                      {copyFromMut.isPending ? 'Copiando...' : '✓ Copiar Perguntas'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de perguntas existentes */}
            {totalQuestions > 0 && (
              <div className="space-y-2">
                {opt.questions.map(q => {
                  if (editingQId === q.id) {
                    return (
                      <div key={q.id} className="bg-black/40 border border-purple-500/40 rounded-lg p-3 space-y-2">
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="text-[10px] text-gray-400 block mb-1">Pergunta</label>
                            <input value={editQText} onChange={e => setEditQText(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          </div>
                          <div className="w-24">
                            <label className="text-[10px] text-gray-400 block mb-1">Resposta</label>
                            <select value={editQType} onChange={e => setEditQType(e.target.value as any)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                              <option value="text">Texto</option>
                              <option value="select">Seleção</option>
                              <option value="textarea">Área Texto</option>
                              <option value="audio">Áudio</option>
                            </select>
                          </div>
                          <label className="flex items-center gap-1 text-[10px] cursor-pointer whitespace-nowrap pb-1">
                            <input type="checkbox" checked={editQRequired} onChange={() => setEditQRequired(!editQRequired)} className="accent-purple-500" /> Obrig.
                          </label>
                        </div>
                        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 space-y-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-[10px] font-bold text-cyan-300 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Como o cliente recebe a pergunta</p>
                              <p className="text-[10px] text-gray-400">Texto mantém o padrão atual. Áudio toca o enunciado antes da resposta.</p>
                            </div>
                            <select value={editQPresentation} onChange={e => setEditQPresentation(e.target.value as 'text' | 'audio')} style={{ ...whiteInputStyle, width: 'auto', minWidth: '150px', fontSize: '12px', padding: '6px 10px' }}>
                              <option value="text">Texto</option>
                              <option value="audio">Áudio gravado</option>
                            </select>
                          </div>
                          {editQPresentation === 'audio' && (
                            <div className="space-y-2">
                              {q.questionAudioUrl && <audio controls preload="metadata" src={q.questionAudioUrl} className="w-full h-8" />}
                              <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-cyan-400/60 bg-black/20 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/15">
                                <Upload className="w-3 h-3" /> {editQPromptAudioFile ? editQPromptAudioFile.name : (q.questionAudioUrl ? 'Trocar áudio da pergunta' : 'Enviar áudio da pergunta')}
                                <input type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,.webm,.ogg,.m4a,.mp3" className="hidden" onChange={e => setEditQPromptAudioFile(e.target.files?.[0] || null)} />
                              </label>
                              <label className="flex items-center gap-1 text-[10px] text-gray-200"><input type="checkbox" checked={editQShowTextWithAudio} onChange={e => setEditQShowTextWithAudio(e.target.checked)} /> Mostrar também o texto da pergunta ao cliente</label>
                            </div>
                          )}
                        </div>
                        {editQType === 'select' && (
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Opções (separadas por vírgula)</label>
                            <input value={editQOptions} onChange={e => setEditQOptions(e.target.value)} placeholder="Sim, Não" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                          </div>
                        )}
                        {editQType === 'audio' && (
                          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 space-y-2">
                            <p className="text-[10px] font-bold text-sky-300">Configuração da resposta em áudio</p>
                            <input value={editQHelpText} onChange={e => setEditQHelpText(e.target.value)} placeholder="Instrução opcional para o cliente" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                            <div className="grid grid-cols-2 gap-2"><input type="number" min="1" max="300" value={editQAudioMin} onChange={e => setEditQAudioMin(e.target.value)} placeholder="Mín. seg." style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} /><input type="number" min="1" max="300" value={editQAudioMax} onChange={e => setEditQAudioMax(e.target.value)} placeholder="Máx. seg." style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} /></div>
                            <div className="flex gap-3 text-[10px] text-gray-200"><label className="flex items-center gap-1"><input type="checkbox" checked={editQAllowRerecord} onChange={e => setEditQAllowRerecord(e.target.checked)} /> Permitir regravação</label><label className="flex items-center gap-1"><input type="checkbox" checked={editQAllowFileUpload} onChange={e => setEditQAllowFileUpload(e.target.checked)} /> Permitir enviar arquivo</label></div>
                          </div>
                        )}
                        {/* Indicador de condicional na edição (somente leitura) */}
                        {editQParentId && (
                          <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-1">
                            <span className="text-[10px] text-cyan-400">🔗 Sub-pergunta quando resposta = <strong>{editQTriggerOption || 'qualquer'}</strong></span>
                            <button type="button" onClick={() => { setEditQParentId(null); setEditQTriggerOption(''); }} className="ml-auto text-[10px] text-red-400 hover:text-red-300">✕ Remover condição</button>
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingQId(null)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs">Cancelar</button>
                          <button
                            onClick={async () => {
                              if (editQPresentation === 'audio' && !q.questionAudioUrl && !editQPromptAudioFile) {
                                toast.error('Envie o áudio da pergunta antes de salvar.');
                                return;
                              }
                              try {
                                await updateQMut.mutateAsync({
                                  id: q.id,
                                  question: editQText,
                                  fieldType: editQType,
                                  options: editQType === 'select' ? editQOptions : undefined,
                                  isRequired: editQRequired ? 1 : 0,
                                  parentQuestionId: editQParentId || null,
                                  triggerOption: editQTriggerOption.trim() || null,
                                  helpText: editQType === 'audio' ? (editQHelpText.trim() || null) : null,
                                  audioMinDurationSeconds: editQType === 'audio' ? Math.max(1, Math.min(300, parseInt(editQAudioMin) || 1)) : undefined,
                                  audioMaxDurationSeconds: editQType === 'audio' ? Math.max(1, Math.min(300, parseInt(editQAudioMax) || 120)) : undefined,
                                  allowAudioRerecord: editQType === 'audio' ? (editQAllowRerecord ? 1 : 0) : undefined,
                                  allowAudioFileUpload: editQType === 'audio' ? (editQAllowFileUpload ? 1 : 0) : undefined,
                                  questionPresentation: editQPresentation,
                                  showQuestionTextWithAudio: editQPresentation === 'audio' && editQShowTextWithAudio ? 1 : 0,
                                });
                                if (editQPromptAudioFile) {
                                  const payload = await readQuestionPromptAudio(editQPromptAudioFile);
                                  await uploadQuestionPromptAudioMut.mutateAsync({ questionId: q.id, ...payload });
                                } else if (editQPresentation === 'text' && q.questionAudioUrl) {
                                  await removeQuestionPromptAudioMut.mutateAsync({ questionId: q.id });
                                }
                                setEditQPromptAudioFile(null);
                                setEditingQId(null);
                                toast.success('Pergunta atualizada!');
                              } catch (error: any) { toast.error(error?.message || 'Erro ao salvar a pergunta.'); }
                            }}
                            disabled={!editQText.trim() || updateQMut.isPending}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                          >
                            {updateQMut.isPending ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  const qIdx = opt.questions.indexOf(q);
                  // Calcular opções da pergunta para mostrar botões de sub-pergunta
                  const qParsedOpts: string[] = q.fieldType === 'select' && q.options ? (() => {
                    try { const p = JSON.parse(q.options); return Array.isArray(p) ? p.map((o: any) => typeof o === 'string' ? o : o.label) : q.options.split(',').map((s: string) => s.trim()).filter(Boolean); }
                    catch { return q.options.split(',').map((s: string) => s.trim()).filter(Boolean); }
                  })() : [];
                  // Sub-perguntas desta pergunta
                  const subQs = opt.questions.filter(sq => sq.parentQuestionId === q.id);
                  // Pular perguntas que são sub-perguntas (serão exibidas indentadas abaixo da pai)
                  if (q.parentQuestionId) return null;
                  return (
                    <div key={q.id} className="space-y-1">
                    <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg">
                      {/* Botões de reordenação */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveQuestion(opt.questions, qIdx, 'up')}
                          disabled={qIdx === 0 || reorderQMut.isPending}
                          className="p-0.5 text-gray-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded transition-colors"
                          title="Mover para cima"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moveQuestion(opt.questions, qIdx, 'down')}
                          disabled={qIdx === opt.questions.length - 1 || reorderQMut.isPending}
                          className="p-0.5 text-gray-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded transition-colors"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs block truncate">{q.question}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{q.fieldType}</span>
                      {q.isRequired === 1 && <span className="text-[10px] text-red-400">*</span>}
                      {/* Botão Copiar */}
                      <button
                        onClick={() => {
                          setNewQText(q.question);
                          setNewQType(q.fieldType as any);
                          setNewQOptions((() => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p.map((o: any) => typeof o === 'string' ? o : o.label).join(', ') : q.options || ''; } catch { return q.options || ''; } })());
                          setNewQRequired(q.isRequired === 1);
                          setNewQPresentation('text');
                          setNewQShowTextWithAudio(false);
                          setNewQPromptAudioFile(null);
                          toast.success('Pergunta copiada para o formulário abaixo!');
                        }}
                        className="p-1 text-yellow-400/70 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                        title="Copiar pergunta"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                      {/* Botão Editar */}
                      <button
                        onClick={() => startEditingQuestion(q)}
                        className="p-1 text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                        title="Editar pergunta"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      {/* Botão Deletar */}
                      <button onClick={() => { if (confirm('Excluir esta pergunta?')) deleteQMut.mutate({ id: q.id }); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Excluir"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    {/* Botões de sub-pergunta por opção de resposta */}
                    {qParsedOpts.length > 0 && (
                      <div className="ml-6 flex flex-wrap gap-1">
                        {qParsedOpts.map(optLabel => (
                          <button
                            key={optLabel}
                            onClick={() => { setNewQParentId(q.id); setNewQTriggerOption(optLabel); setNewQText(''); setNewQType('text'); setNewQOptions(''); setNewQRequired(true); setNewQPresentation('text'); setNewQShowTextWithAudio(false); setNewQPromptAudioFile(null); }}
                            className="text-[10px] px-2 py-0.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-full transition-colors"
                            title={`Adicionar sub-pergunta quando resposta for "${optLabel}"`}
                          >
                            + sub-pergunta se &quot;{optLabel}&quot;
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Sub-perguntas indentadas */}
                    {subQs.map(sq => {
                      // Opções da sub-pergunta (para permitir criar sub-sub-perguntas)
                      const sqParsedOpts: string[] = sq.fieldType === 'select' && sq.options ? (() => {
                        try { const p = JSON.parse(sq.options); return Array.isArray(p) ? p.map((o: any) => typeof o === 'string' ? o : o.label) : sq.options.split(',').map((s: string) => s.trim()).filter(Boolean); }
                        catch { return sq.options.split(',').map((s: string) => s.trim()).filter(Boolean); }
                      })() : [];
                      // Sub-sub-perguntas desta sub-pergunta
                      const subSubQs = opt.questions.filter(ssq => ssq.parentQuestionId === sq.id);
                      return (
                        <div key={sq.id} className="ml-6 space-y-1">
                          <div className="flex items-center gap-2 bg-cyan-500/5 border-l-2 border-cyan-500/30 px-3 py-1.5 rounded-r-lg">
                            <span className="text-[10px] text-cyan-400/60">↳ se "{sq.triggerOption || 'qualquer'}":</span>
                            <span className="text-xs flex-1 truncate">{sq.question}</span>
                            <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{sq.fieldType}</span>
                            {sq.isRequired === 1 && <span className="text-[10px] text-red-400">*</span>}
                            <button
                              onClick={() => startEditingQuestion(sq)}
                              className="p-1 text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                              title="Editar sub-pergunta"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => { if (confirm('Excluir esta sub-pergunta?')) deleteQMut.mutate({ id: sq.id }); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Excluir"><Trash2 className="w-3 h-3" /></button>
                          </div>
                          {/* Botões de sub-sub-pergunta por opção da sub-pergunta */}
                          {sqParsedOpts.length > 0 && (
                            <div className="ml-6 flex flex-wrap gap-1">
                              {sqParsedOpts.map(sqOptLabel => (
                                <button
                                  key={sqOptLabel}
                                  onClick={() => { setNewQParentId(sq.id); setNewQTriggerOption(sqOptLabel); setNewQText(''); setNewQType('text'); setNewQOptions(''); setNewQRequired(true); setNewQPresentation('text'); setNewQShowTextWithAudio(false); setNewQPromptAudioFile(null); }}
                                  className="text-[10px] px-2 py-0.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-full transition-colors"
                                  title={`Adicionar sub-sub-pergunta quando resposta for "${sqOptLabel}"`}
                                >
                                  + sub-sub se &quot;{sqOptLabel}&quot;
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Sub-sub-perguntas (3º nível) */}
                          {subSubQs.map(ssq => (
                            <div key={ssq.id} className="ml-12 flex items-center gap-2 bg-purple-500/5 border-l-2 border-purple-500/30 px-3 py-1.5 rounded-r-lg">
                              <span className="text-[10px] text-purple-400/60">↳↳ se "{ssq.triggerOption || 'qualquer'}":</span>
                              <span className="text-xs flex-1 truncate">{ssq.question}</span>
                              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{ssq.fieldType}</span>
                              {ssq.isRequired === 1 && <span className="text-[10px] text-red-400">*</span>}
                              <button
                                onClick={() => startEditingQuestion(ssq)}
                                className="p-1 text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                title="Editar sub-sub-pergunta"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => { if (confirm('Excluir esta sub-sub-pergunta?')) deleteQMut.mutate({ id: ssq.id }); }} className="p-1 text-red-400 hover:bg-red-500/20 rounded" title="Excluir"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Formulário para criar nova pergunta */}
            <div className="space-y-2">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400 block mb-1">Pergunta</label>
                  <input value={newQText} onChange={e => setNewQText(e.target.value)} placeholder="Ex: Qual cidade você mora?" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-gray-400 block mb-1">Resposta</label>
                  <select value={newQType} onChange={e => setNewQType(e.target.value as any)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                    <option value="text">Texto</option>
                    <option value="select">Seleção</option>
                    <option value="textarea">Área Texto</option>
                    <option value="audio">Áudio</option>
                  </select>
                </div>
                <label className="flex items-center gap-1 text-[10px] cursor-pointer whitespace-nowrap pb-1">
                  <input type="checkbox" checked={newQRequired} onChange={() => setNewQRequired(!newQRequired)} className="accent-purple-500" /> Obrig.
                </label>
                <Button onClick={async () => {
                  if (!newQText.trim()) { toast.error("Pergunta obrigatória"); return; }
                  if (newQPresentation === 'audio' && !newQPromptAudioFile) { toast.error('Escolha o áudio da pergunta.'); return; }
                  try {
                    const created = await createQMut.mutateAsync({
                      productId, optionId: opt.id, question: newQText, fieldType: newQType,
                      options: newQType === 'select' ? (() => {
                        const opts = newQOptions.split(',').map(o => o.trim()).filter(Boolean);
                        const hasColors = opts.some(o => optionColors[o]); const hasBlocking = opts.some(o => blockingOptions[o]);
                        return hasColors || hasBlocking ? JSON.stringify(opts.map(o => ({ label: o, color: optionColors[o] || null, blocking: blockingOptions[o] || false }))) : newQOptions;
                      })() : undefined,
                      isRequired: newQRequired, sortOrder: totalQuestions, parentQuestionId: newQParentId || null, triggerOption: newQTriggerOption.trim() || null,
                      helpText: newQType === 'audio' ? (newQHelpText.trim() || null) : null,
                      audioMinDurationSeconds: newQType === 'audio' ? Math.max(1, Math.min(300, parseInt(newQAudioMin) || 1)) : undefined,
                      audioMaxDurationSeconds: newQType === 'audio' ? Math.max(1, Math.min(300, parseInt(newQAudioMax) || 120)) : undefined,
                      allowAudioRerecord: newQType === 'audio' ? (newQAllowRerecord ? 1 : 0) : undefined,
                      allowAudioFileUpload: newQType === 'audio' ? (newQAllowFileUpload ? 1 : 0) : undefined,
                      questionPresentation: 'text', showQuestionTextWithAudio: newQPresentation === 'audio' && newQShowTextWithAudio ? 1 : 0,
                    });
                    if (!created.success || !created.question) throw new Error(created.message || 'Não foi possível criar a pergunta.');
                    if (newQPresentation === 'audio' && newQPromptAudioFile) {
                      const payload = await readQuestionPromptAudio(newQPromptAudioFile);
                      await uploadQuestionPromptAudioMut.mutateAsync({ questionId: created.question.id, ...payload });
                    }
                    setOptionColors({}); setBlockingOptions({}); setNewQText(''); setNewQOptions(''); setNewQRequired(true); setNewQParentId(null); setNewQTriggerOption(''); setNewQPresentation('text'); setNewQShowTextWithAudio(false); setNewQPromptAudioFile(null); setNewQHelpText(''); setNewQAudioMin('1'); setNewQAudioMax('120'); setNewQAllowRerecord(true); setNewQAllowFileUpload(true);
                    toast.success('Pergunta criada!');
                  } catch (error: any) { toast.error(error?.message || 'Erro ao criar a pergunta.'); }
                }} className="bg-purple-600 hover:bg-purple-700 text-white text-xs" size="sm" disabled={createQMut.isPending || uploadQuestionPromptAudioMut.isPending}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              {/* Indicador de sub-pergunta ativa */}
              {newQParentId && (
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-1">
                  <span className="text-[10px] text-cyan-400">🔗 Sub-pergunta de: <strong>{opt.questions.find(q => q.id === newQParentId)?.question?.slice(0, 30)}...</strong> quando resposta = <strong>{newQTriggerOption || 'qualquer'}</strong></span>
                  <button onClick={() => { setNewQParentId(null); setNewQTriggerOption(''); }} className="ml-auto text-[10px] text-red-400 hover:text-red-300">✕ Cancelar</button>
                </div>
              )}
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-[10px] font-bold text-cyan-300 flex items-center gap-1"><Volume2 className="w-3 h-3" /> Como o cliente recebe a pergunta</p><p className="text-[10px] text-gray-400">A resposta escolhida acima continua independente.</p></div>
                  <select value={newQPresentation} onChange={e => setNewQPresentation(e.target.value as 'text' | 'audio')} style={{ ...whiteInputStyle, width: 'auto', minWidth: '150px', fontSize: '12px', padding: '6px 10px' }}><option value="text">Texto</option><option value="audio">Áudio gravado</option></select>
                </div>
                {newQPresentation === 'audio' && <div className="space-y-2"><label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-cyan-400/60 bg-black/20 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/15"><Upload className="w-3 h-3" /> {newQPromptAudioFile ? newQPromptAudioFile.name : 'Enviar áudio da pergunta'}<input type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,.webm,.ogg,.m4a,.mp3" className="hidden" onChange={e => setNewQPromptAudioFile(e.target.files?.[0] || null)} /></label><label className="flex items-center gap-1 text-[10px] text-gray-200"><input type="checkbox" checked={newQShowTextWithAudio} onChange={e => setNewQShowTextWithAudio(e.target.checked)} /> Mostrar também o texto da pergunta ao cliente</label></div>}
              </div>
              {newQType === 'audio' && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 space-y-2">
                  <p className="text-[10px] font-bold text-sky-300">Configuração da resposta em áudio</p>
                  <input value={newQHelpText} onChange={e => setNewQHelpText(e.target.value)} placeholder="Instrução opcional para o cliente" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                  <div className="grid grid-cols-2 gap-2"><input type="number" min="1" max="300" value={newQAudioMin} onChange={e => setNewQAudioMin(e.target.value)} placeholder="Mín. segundos" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} /><input type="number" min="1" max="300" value={newQAudioMax} onChange={e => setNewQAudioMax(e.target.value)} placeholder="Máx. segundos" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} /></div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-gray-200"><label className="flex items-center gap-1"><input type="checkbox" checked={newQAllowRerecord} onChange={e => setNewQAllowRerecord(e.target.checked)} /> Permitir regravação</label><label className="flex items-center gap-1"><input type="checkbox" checked={newQAllowFileUpload} onChange={e => setNewQAllowFileUpload(e.target.checked)} /> Permitir enviar arquivo</label></div>
                </div>
              )}
              {newQType === 'select' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Opções (separadas por vírgula)</label>
                    <input value={newQOptions} onChange={e => { setNewQOptions(e.target.value); setOptionColors({}); }} placeholder="Sim, Não" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                  </div>
                  {newQOptions.trim() && (
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">🎨 Cor de cada opção (opcional)</label>
                      <div className="space-y-1.5">
                        {newQOptions.split(',').map(opt => opt.trim()).filter(Boolean).map(opt => (
                          <div key={opt} className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-white/70 w-20 truncate">{opt}</span>
                            <div className="flex gap-1 flex-wrap">
                              {PRESET_COLORS.map(pc => (
                                <button
                                  key={pc.value}
                                  type="button"
                                  onClick={() => setOptionColors(prev => ({ ...prev, [opt]: pc.value }))}
                                  className="w-5 h-5 rounded-full border-2 transition-all"
                                  style={{ backgroundColor: pc.value, borderColor: optionColors[opt] === pc.value ? '#fff' : 'transparent', transform: optionColors[opt] === pc.value ? 'scale(1.2)' : 'scale(1)' }}
                                  title={pc.label}
                                />
                              ))}
                              <button
                                type="button"
                                onClick={() => setOptionColors(prev => { const n = {...prev}; delete n[opt]; return n; })}
                                className="w-5 h-5 rounded-full border border-gray-600 bg-gray-800 text-gray-400 text-[9px] flex items-center justify-center"
                                title="Sem cor"
                              >✕</button>
                            </div>
                            {optionColors[opt] && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: optionColors[opt] + '33', color: optionColors[opt], border: `1px solid ${optionColors[opt]}66` }}>{opt}</span>
                            )}
                            {/* Checkbox de bloqueio */}
                            <label className="flex items-center gap-1 cursor-pointer ml-auto">
                              <input
                                type="checkbox"
                                checked={!!blockingOptions[opt]}
                                onChange={(e) => setBlockingOptions(prev => ({ ...prev, [opt]: e.target.checked }))}
                                className="w-3.5 h-3.5 accent-red-500"
                              />
                              <span className="text-[10px] text-red-400 font-semibold">Bloquear pedido</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProducts() {
  const utils = trpc.useUtils();
  const { data: productsList, isLoading } = trpc.products.list.useQuery();

  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create product form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newButtonText, setNewButtonText] = useState("COMPRAR");
  const [newCardColor, setNewCardColor] = useState("");
  const [newCardBgColor, setNewCardBgColor] = useState("");
  const [newCardTextColor, setNewCardTextColor] = useState("");
  const [newCardBtnColor, setNewCardBtnColor] = useState("");

  // Edit product form
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editButtonText, setEditButtonText] = useState("");
  const [editCardColor, setEditCardColor] = useState("");
  const [editCardBgColor, setEditCardBgColor] = useState("");
  const [editCardTextColor, setEditCardTextColor] = useState("");
  const [editCardBtnColor, setEditCardBtnColor] = useState("");
  const [editResellerDiscount, setEditResellerDiscount] = useState<string>("");
  const [editDeliveryDays, setEditDeliveryDays] = useState<string>("");

  // New option form
  const [newOptLabel, setNewOptLabel] = useState("");
  const [newOptPrice, setNewOptPrice] = useState("");
  const [newOptType, setNewOptType] = useState("standard");
  const [newOptDocNameMode, setNewOptDocNameMode] = useState("none");
  const [newOptDocCustomName, setNewOptDocCustomName] = useState("");

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const reorderMut = trpc.products.reorder.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Ordem atualizada!"); },
    onError: () => toast.error("Erro ao reordenar"),
  });

  const handleDragStart = useCallback((e: React.DragEvent, productId: number) => {
    setDraggedId(productId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(productId));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, productId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId !== productId) setDragOverId(productId);
  }, [draggedId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }
    const currentProducts = (productsList || []) as ProductWithRelations[];
    const currentOrder = currentProducts.map(p => p.id);
    const fromIdx = currentOrder.indexOf(draggedId);
    const toIdx = currentOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggedId(null); return; }
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedId);
    reorderMut.mutate({ orderedIds: newOrder });
    setDraggedId(null);
  }, [draggedId, productsList, reorderMut]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const createMut = trpc.products.create.useMutation({ onSuccess: () => { utils.products.list.invalidate(); resetCreateForm(); setShowCreateForm(false); toast.success("Card criado!"); } });
  const updateMut = trpc.products.update.useMutation({ onSuccess: () => { utils.products.list.invalidate(); setEditingProduct(null); toast.success("Card atualizado!"); } });
  const deleteMut = trpc.products.delete.useMutation({ onSuccess: () => { utils.products.list.invalidate(); toast.success("Card excluído!"); } });
  const toggleMut = trpc.products.toggle.useMutation({ onSuccess: () => utils.products.list.invalidate() });

  const createOptMut = trpc.productOptions.create.useMutation({ onSuccess: () => { utils.products.list.invalidate(); resetOptForm(); toast.success("Opção criada!"); } });
  const updateOptMut = trpc.productOptions.update.useMutation({ onSuccess: () => { utils.products.list.invalidate(); toast.success("Opção salva!"); } });
  const deleteOptMut = trpc.productOptions.delete.useMutation({ onSuccess: () => { utils.products.list.invalidate(); toast.success("Opção excluída!"); } });
  const reorderOptMut = trpc.productOptions.reorder.useMutation({ onSuccess: () => utils.products.list.invalidate() });

  const resetCreateForm = () => { setNewName(""); setNewDesc(""); setNewButtonText("COMPRAR"); setNewCardColor(""); setNewCardBgColor(""); setNewCardTextColor(""); setNewCardBtnColor(""); };
  const resetOptForm = () => {
    setNewOptLabel(""); setNewOptPrice(""); setNewOptType("standard");
    setNewOptDocNameMode("none"); setNewOptDocCustomName("");
  };

  const startEdit = (p: ProductWithRelations) => {
    setEditingProduct(p.id); setEditName(p.name); setEditDesc(p.description || "");
    setEditButtonText(p.buttonText || "COMPRAR"); setEditCardColor(p.cardColor || "");
    setEditCardBgColor(p.cardBgColor || ""); setEditCardTextColor(p.cardTextColor || "");
    setEditCardBtnColor(p.cardBtnColor || "");
    setEditResellerDiscount((p as any).resellerDiscount != null ? String((p as any).resellerDiscount) : "");
    setEditDeliveryDays((p as any).deliveryDays || "");
  };


  const products = (productsList || []) as ProductWithRelations[];

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <AdminHeader title="Cards de Serviço" icon={<Package className="w-5 h-5" />} rightContent={
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 h-auto">
          <Plus className="w-3.5 h-3.5 mr-1" /> Novo Card
        </Button>
      } />

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Create Form */}
        {showCreateForm && (
          <div className="bg-[#111128] border border-purple-500/30 rounded-xl p-5 space-y-4">
            <h3 className="text-lg font-bold text-purple-400">Criar Novo Card de Serviço</h3>
            <p className="text-xs text-gray-400">Documentos e perguntas são configurados individualmente em cada opção de compra (após criar o card).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Nome do Serviço *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: CONTA UBER" style={whiteInputStyle} />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Texto do Botão</label>
                <input value={newButtonText} onChange={e => setNewButtonText(e.target.value)} placeholder="COMPRAR" style={whiteInputStyle} />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Descrição</label>
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição do serviço..." style={{ ...whiteInputStyle, minHeight: '70px' }} rows={3} />
            </div>
            <div className="bg-black/30 rounded-lg border border-purple-500/20 p-4 space-y-3">
              <p className="text-sm font-bold text-purple-400 flex items-center gap-1"><Palette className="w-4 h-4" /> Cores do Card</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ColorPicker label="Cor da Borda" value={newCardColor} onChange={setNewCardColor} />
                <ColorPicker label="Cor de Fundo" value={newCardBgColor} onChange={setNewCardBgColor} />
                <ColorPicker label="Cor do Texto" value={newCardTextColor} onChange={setNewCardTextColor} />
                <ColorPicker label="Cor do Botão" value={newCardBtnColor} onChange={setNewCardBtnColor} />
              </div>
              {/* Preview mini card */}
              <div className="mt-2 p-3 rounded-lg border" style={{ borderColor: newCardColor || '#7c3aed33', backgroundColor: newCardBgColor || '#1e1b4b' }}>
                <p className="text-xs font-bold mb-1" style={{ color: newCardTextColor || '#ffffff' }}>Preview do Card</p>
                <p className="text-[10px] mb-2" style={{ color: newCardTextColor ? newCardTextColor + 'cc' : '#ffffffcc' }}>Descrição do serviço</p>
                <div className="text-[10px] font-bold text-center py-1 rounded" style={{ backgroundColor: newCardBtnColor || '#f3f4f6', color: newCardBtnColor ? '#000000' : '#000000' }}>BOTÃO</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { if (!newName.trim()) { toast.error("Nome obrigatório"); return; } createMut.mutate({ name: newName, description: newDesc || undefined, buttonText: newButtonText, cardColor: newCardColor || undefined, cardBgColor: newCardBgColor || undefined, cardTextColor: newCardTextColor || undefined, cardBtnColor: newCardBtnColor || undefined }); }} disabled={createMut.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                {createMut.isPending ? "Criando..." : "Criar Card"}
              </Button>
              <Button onClick={() => { setShowCreateForm(false); resetCreateForm(); }} variant="outline" className="text-white border-gray-600 hover:bg-white/10">Cancelar</Button>
            </div>
          </div>
        )}

        {/* Products List */}
        {isLoading ? (
          <div className="text-center py-12"><div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nenhum card criado ainda. Clique em "Novo Card" para começar.</div>
        ) : (
          products.map(product => {
            const totalQuestions = product.options.reduce((sum, opt) => sum + (opt.questions?.length || 0), 0);
            const totalDocs = product.options.reduce((sum, opt) => sum + (opt.documents?.length || 0), 0);
            return (
              <div
                key={product.id}
                draggable
                onDragStart={(e) => handleDragStart(e, product.id)}
                onDragOver={(e) => handleDragOver(e, product.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, product.id)}
                onDragEnd={handleDragEnd}
                className={`bg-[#111128] border rounded-xl overflow-hidden transition-all ${product.isActive ? 'border-purple-500/30' : 'border-gray-700/30 opacity-60'} ${draggedId === product.id ? 'opacity-40 scale-95' : ''} ${dragOverId === product.id ? 'border-yellow-400 border-2 shadow-lg shadow-yellow-400/20' : ''}`}
              >
                {/* Product Header */}
                <div className="p-4 flex items-center gap-3">
                  <GripVertical className="w-5 h-5 text-gray-500 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                  {product.iconUrl ? (
                    <img src={product.iconUrl} alt={product.name} className="w-12 h-12 rounded-lg flex-shrink-0 object-cover border border-purple-500/30" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg flex-shrink-0 bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                      <Package className="w-5 h-5 text-purple-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{product.name}</h3>
                    <p className="text-xs text-gray-400">{product.options.length} opções · {totalDocs} docs · {totalQuestions} perguntas</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggleMut.mutate({ id: product.id, isActive: !product.isActive })} className={`p-2 rounded-lg transition-colors ${product.isActive ? 'text-green-400 hover:bg-green-500/20' : 'text-gray-500 hover:bg-gray-500/20'}`} title={product.isActive ? "Desativar" : "Ativar"}>
                      {product.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => startEdit(product)} className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("Excluir este card e todas suas opções/perguntas?")) deleteMut.mutate({ id: product.id }); }} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    <button onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)} className="p-2 text-gray-400 hover:bg-white/10 rounded-lg transition-colors">
                      {expandedProduct === product.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Edit Form */}
                {editingProduct === product.id && (
                  <div className="border-t border-purple-500/20 p-4 bg-[#0d0d22] space-y-4">
                    <h4 className="text-sm font-bold text-purple-400">Editar Card</h4>
                    <div>
                      <label className="text-xs text-gray-400 block mb-2">Foto do Card</label>
                      <ImageUploader productId={product.id} currentUrl={product.iconUrl} onUploaded={() => utils.products.list.invalidate()} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="text-xs text-gray-400 block mb-1">Nome</label><input value={editName} onChange={e => setEditName(e.target.value)} style={whiteInputStyle} /></div>
                      <div><label className="text-xs text-gray-400 block mb-1">Texto Botão</label><input value={editButtonText} onChange={e => setEditButtonText(e.target.value)} style={whiteInputStyle} /></div>
                    </div>
                    <div><label className="text-xs text-gray-400 block mb-1">Descrição</label><textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ ...whiteInputStyle, minHeight: '80px' }} rows={4} /></div>
                    <div className="bg-black/30 rounded-lg border border-purple-500/20 p-3 space-y-3">
                      <p className="text-xs font-bold text-purple-400 flex items-center gap-1"><Palette className="w-3 h-3" /> Cores do Card</p>
                      <div className="grid grid-cols-2 gap-3">
                        <ColorPicker label="Borda" value={editCardColor} onChange={setEditCardColor} />
                        <ColorPicker label="Fundo" value={editCardBgColor} onChange={setEditCardBgColor} />
                        <ColorPicker label="Texto" value={editCardTextColor} onChange={setEditCardTextColor} />
                        <ColorPicker label="Botão" value={editCardBtnColor} onChange={setEditCardBtnColor} />
                      </div>
                      {/* Preview mini card */}
                      <div className="p-2 rounded-lg border" style={{ borderColor: editCardColor || '#7c3aed33', backgroundColor: editCardBgColor || '#1e1b4b' }}>
                        <p className="text-[10px] font-bold" style={{ color: editCardTextColor || '#ffffff' }}>Preview</p>
                        <div className="text-[9px] font-bold text-center py-0.5 rounded mt-1" style={{ backgroundColor: editCardBtnColor || '#f3f4f6', color: '#000' }}>BOTÃO</div>
                      </div>
                    </div>
                    {/* Desconto Revendedor por produto */}
                    <div className="bg-black/30 rounded-lg border border-yellow-500/20 p-3 space-y-2">
                      <p className="text-xs font-bold text-yellow-400 flex items-center gap-1">🏷️ Desconto Revendedor</p>
                      <p className="text-[10px] text-gray-400">% de desconto específica para este produto quando acessado por revendedor. Deixe vazio para usar a % global do cadastro do revendedor.</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={editResellerDiscount}
                          onChange={e => setEditResellerDiscount(e.target.value)}
                          placeholder="Ex: 25 (deixe vazio para usar % global)"
                          style={{ ...whiteInputStyle, maxWidth: '220px' }}
                        />
                        <span className="text-yellow-400 font-bold text-sm">%</span>
                        {editResellerDiscount && <span className="text-[10px] text-green-400">Revendedor paga {(100 - parseFloat(editResellerDiscount || '0')).toFixed(0)}% do preço</span>}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">⏳ Prazo de Entrega (exibido no bot)</label>
                      <input
                        value={editDeliveryDays}
                        onChange={e => setEditDeliveryDays(e.target.value)}
                        placeholder="Ex: 2 a 5 dias úteis"
                        style={{ ...whiteInputStyle, maxWidth: '280px' }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => {
                        const discountVal = editResellerDiscount.trim() !== '' ? parseFloat(editResellerDiscount) : null;
                        updateMut.mutate({ id: product.id, name: editName, description: editDesc || null, buttonText: editButtonText, cardColor: editCardColor || null, cardBgColor: editCardBgColor || null, cardTextColor: editCardTextColor || null, cardBtnColor: editCardBtnColor || null, resellerDiscount: discountVal !== null && !isNaN(discountVal) ? discountVal : null, deliveryDays: editDeliveryDays.trim() || null } as any);
                      }} className="bg-green-600 hover:bg-green-700 text-white text-sm"><Save className="w-3 h-3 mr-1" /> Salvar Card</Button>
                      <Button onClick={() => setEditingProduct(null)} variant="outline" className="text-white border-gray-600 hover:bg-white/10 text-sm"><X className="w-3 h-3 mr-1" /> Cancelar</Button>
                    </div>
                  </div>
                )}

                {/* Expanded: Image + Options (com docs dinâmicos + perguntas) */}
                {expandedProduct === product.id && (
                  <div className="border-t border-purple-500/20 p-4 bg-[#0d0d22] space-y-6">
                    {/* IMAGE SECTION */}
                    <div>
                      <h4 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-3"><ImagePlus className="w-4 h-4" /> Foto do Card</h4>
                      <ImageUploader productId={product.id} currentUrl={product.iconUrl} onUploaded={() => utils.products.list.invalidate()} />
                    </div>

                    {/* OPTIONS com documentos dinâmicos e perguntas integrados */}
                    <div>
                      <h4 className="text-sm font-bold text-green-400 flex items-center gap-2 mb-3"><DollarSign className="w-4 h-4" /> Opções de Compra ({product.options.length})</h4>
                      <p className="text-xs text-gray-500 mb-3">Cada opção tem seus próprios documentos e perguntas. Clique na seta para expandir e configurar.</p>

                      {product.options.length > 0 && (
                        <div className="space-y-3 mb-4">
                          {product.options.map((opt, idx) => (
                            <OptionCard
                              key={opt.id}
                              opt={opt}
                              productId={product.id}
                              onUpdate={(data) => updateOptMut.mutate(data)}
                              onDelete={() => deleteOptMut.mutate({ id: opt.id })}
                              allProducts={productsList as ProductWithRelations[] | undefined}
                              isFirst={idx === 0}
                              isLast={idx === product.options.length - 1}
                              onMoveUp={() => {
                                const ids = product.options.map(o => o.id);
                                const tmp = ids[idx - 1];
                                ids[idx - 1] = ids[idx];
                                ids[idx] = tmp;
                                reorderOptMut.mutate({ orderedIds: ids });
                              }}
                              onMoveDown={() => {
                                const ids = product.options.map(o => o.id);
                                const tmp = ids[idx + 1];
                                ids[idx + 1] = ids[idx];
                                ids[idx] = tmp;
                                reorderOptMut.mutate({ orderedIds: ids });
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Criar nova opção */}
                      <div className="bg-black/20 border border-dashed border-green-500/30 rounded-lg p-3 space-y-3">
                        <p className="text-xs text-green-400 font-bold">+ Nova Opção de Compra</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
                          <div className="col-span-1"><label className="text-xs text-gray-400 block mb-1">Nome da Opção</label><input value={newOptLabel} onChange={e => setNewOptLabel(e.target.value)} placeholder="Ex: Nome Aleatório" style={whiteInputStyle} /></div>
                          <div className="col-span-1"><label className="text-xs text-gray-400 block mb-1">Valor</label><input value={newOptPrice} onChange={e => setNewOptPrice(e.target.value)} placeholder="R$ 400,00" style={whiteInputStyle} /></div>
                          <div className="col-span-1">
                            <label className="text-xs text-gray-400 block mb-1">Tipo</label>
                            <select value={newOptType} onChange={e => setNewOptType(e.target.value)} style={whiteInputStyle}>
                              <option value="standard">Padrão</option>
                              <option value="pdf_only">PDF Only</option>
                            </select>
                          </div>
                        </div>

                        {/* Forma de nome na criação */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-yellow-400 font-bold block mb-1">Forma de Nome do Documento</label>
                            <select value={newOptDocNameMode} onChange={e => setNewOptDocNameMode(e.target.value)} style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }}>
                              {docModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </div>
                          {newOptDocNameMode === 'custom' && (
                            <div>
                              <label className="text-xs text-yellow-300 block mb-1">Nome personalizado:</label>
                              <input value={newOptDocCustomName} onChange={e => setNewOptDocCustomName(e.target.value)} placeholder="Ex: joao-silva" style={{ ...whiteInputStyle, fontSize: '12px', padding: '6px 10px' }} />
                            </div>
                          )}
                        </div>

                        <p className="text-[10px] text-gray-500">Documentos e perguntas podem ser adicionados após criar a opção (expanda a opção criada).</p>

                        <Button onClick={() => {
                          if (!newOptLabel.trim() || !newOptPrice.trim()) { toast.error("Preencha nome e valor"); return; }
                          createOptMut.mutate({
                            productId: product.id, label: newOptLabel, price: newOptPrice, type: newOptType,
                            sortOrder: product.options.length,
                            docNameMode: newOptDocNameMode,
                            docCustomName: newOptDocNameMode === 'custom' ? newOptDocCustomName : '',
                          });
                        }} className="bg-green-600 hover:bg-green-700 text-white text-sm w-full" disabled={createOptMut.isPending}>
                          <Plus className="w-3 h-3 mr-1" /> {createOptMut.isPending ? "Criando..." : "Criar Opção"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
