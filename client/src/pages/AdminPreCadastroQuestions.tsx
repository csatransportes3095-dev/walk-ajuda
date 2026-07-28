import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trash2, ChevronUp, ChevronDown, ArrowLeft, Plus, Save, X, Pencil } from "lucide-react";
import { Link } from "wouter";

type FieldType = "text" | "email" | "number" | "phone" | "cpf" | "radio" | "select" | "textarea" | "informativo";
type QuestionOption = { value: string; label: string };
type Question = {
  id: number;
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  options: QuestionOption[] | null;
  placeholder: string | null;
  required: boolean;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
  parentQuestionId: number | null;
  triggerOption: string | null;
};

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "email", label: "E-mail" },
  { value: "number", label: "Número" },
  { value: "phone", label: "Telefone" },
  { value: "cpf", label: "CPF" },
  { value: "radio", label: "Opções (Radio)" },
  { value: "select", label: "Lista (Select)" },
  { value: "textarea", label: "Texto Longo" },
  { value: "informativo", label: "Texto Informativo (só leitura)" },
];

const inputCls = "w-full bg-white/7 border border-white/15 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/40 placeholder:text-gray-500";
const selectCls = "w-full bg-[#0a0a1a] border border-white/15 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/40";

function parseOpts(q: Question): string[] {
  if (!q.options) return [];
  if (Array.isArray(q.options)) return q.options.map((o: QuestionOption) => o.label || o.value);
  try {
    const p = JSON.parse(q.options as unknown as string);
    return Array.isArray(p) ? p.map((o: any) => typeof o === "string" ? o : (o.label || o.value)) : [];
  } catch {
    return (q.options as unknown as string).split(",").map((s: string) => s.trim()).filter(Boolean);
  }
}

function parseOptionsCSV(csv: string): QuestionOption[] {
  return csv.split(",").map((s) => s.trim()).filter(Boolean).map((s) => ({
    value: s.toLowerCase().replace(/\s+/g, "_"),
    label: s,
  }));
}

// ── Formulário inline de criação (fora do componente principal para evitar perda de foco) ──
type InlineFormProps = {
  visible: boolean;
  trigger: string;
  parentId: number | null;
  accentColor: "green" | "cyan" | "purple";
  onClose: () => void;
  onSave: (data: {
    label: string; fieldKey: string; fieldType: FieldType;
    options: string; placeholder: string; required: boolean;
  }) => void;
  saving: boolean;
};

function InlineCreateForm({ visible, trigger, parentId, accentColor, onClose, onSave, saving }: InlineFormProps) {
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [required, setRequired] = useState(true);

  if (!visible) return null;

  const borderColor = accentColor === "green" ? "border-green-500/40" : accentColor === "cyan" ? "border-cyan-500/40" : "border-purple-500/40";
  const titleColor = accentColor === "green" ? "text-green-300" : accentColor === "cyan" ? "text-cyan-300" : "text-purple-300";
  const btnColor = accentColor === "green" ? "bg-green-600 hover:bg-green-500" : accentColor === "cyan" ? "bg-cyan-600 hover:bg-cyan-500" : "bg-purple-600 hover:bg-purple-500";
  const badgeCls = accentColor === "cyan" ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-purple-500/10 border-purple-500/30 text-purple-400";

  function handleSave() {
    onSave({ label, fieldKey, fieldType, options, placeholder, required });
  }

  return (
    <div className={`bg-[#13132a] border ${borderColor} rounded-xl p-4 space-y-3 mt-1`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${titleColor}`}>
          {parentId ? `Nova pergunta quando resposta = "${trigger}"` : "Nova Pergunta Principal"}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"><X size={14} /></button>
      </div>
      {parentId && (
        <div className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 ${badgeCls}`}>
          <span className="text-xs">🔗 Aparece quando resposta for: <strong>"{trigger}"</strong></span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Texto da Pergunta *</label>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Qual o ano do veículo?" autoFocus />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Chave do Campo * <span className="text-gray-600 font-mono text-[10px]">(sem espaços)</span></label>
          <input className={`${inputCls} font-mono`} value={fieldKey} onChange={(e) => setFieldKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder="Ex: anoVeiculo" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Tipo *</label>
          <select className={selectCls} value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{fieldType === "informativo" ? "Conteúdo do texto informativo *" : "Placeholder"}</label>
          {fieldType === "informativo" ? (
            <textarea className={`${inputCls} min-h-[120px] resize-y`} value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} placeholder="Digite o texto explicativo aqui... (suporta quebras de linha)" rows={5} />
          ) : (
            <input className={inputCls} value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} placeholder="Dica no campo" />
          )}
        </div>
        {(fieldType === "radio" || fieldType === "select") && (
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Opções <span className="text-gray-600">(separadas por vírgula)</span></label>
            <input className={inputCls} value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Ex: Sim, Não, Talvez" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <span className="text-gray-300">Obrigatório</span>
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className={`px-4 py-1.5 ${btnColor} disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1`}>
            <Save size={12} /> {saving ? "Salvando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Linha de pergunta editável (fora do componente principal) ──
type QuestionRowProps = {
  q: Question;
  level: number;
  indent: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: { label: string; fieldType: FieldType; options: string; placeholder: string; required: boolean }) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  saving: boolean;
};

function QuestionRow({ q, level, indent, isEditing, onEdit, onCancelEdit, onSaveEdit, onDelete, onMoveUp, onMoveDown, saving }: QuestionRowProps) {
  const [editLabel, setEditLabel] = useState(q.label);
  const [editFieldType, setEditFieldType] = useState<FieldType>(q.fieldType);
  const [editOptions, setEditOptions] = useState(q.options ? q.options.map((o) => o.label).join(", ") : "");
  const [editPlaceholder, setEditPlaceholder] = useState(q.placeholder || "");
  const [editRequired, setEditRequired] = useState(q.required);

  const borderLeft = level === 1 ? "border-l-2 border-cyan-500/30" : level === 2 ? "border-l-2 border-purple-500/30" : "";
  const bg = level === 0 ? "bg-[#13132a] border border-white/10" : level === 1 ? "bg-cyan-500/5" : "bg-purple-500/5";
  const prefix = level === 1 ? "↳" : level === 2 ? "↳↳" : "";
  const prefixColor = level === 1 ? "text-cyan-400/60" : "text-purple-400/60";

  if (isEditing) {
    const editBorder = level === 0 ? "border-blue-500/40" : level === 1 ? "border-cyan-500/40" : "border-purple-500/40";
    return (
      <div className={`${indent} bg-[#13132a] border ${editBorder} rounded-xl p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300">Editando pergunta</span>
          <button onClick={onCancelEdit} className="p-1 rounded hover:bg-white/10 text-gray-400"><X size={14} /></button>
        </div>
        <input className={inputCls} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Texto da pergunta" />
        <select className={selectCls} value={editFieldType} onChange={(e) => setEditFieldType(e.target.value as FieldType)}>
          {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {(editFieldType === "radio" || editFieldType === "select") && (
          <input className={inputCls} value={editOptions} onChange={(e) => setEditOptions(e.target.value)} placeholder="Opções separadas por vírgula" />
        )}
        {editFieldType === "informativo" ? (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Conteúdo do texto informativo *</label>
            <textarea className={`${inputCls} min-h-[120px] resize-y`} value={editPlaceholder} onChange={(e) => setEditPlaceholder(e.target.value)} placeholder="Digite o texto explicativo aqui... (suporta quebras de linha)" rows={5} />
          </div>
        ) : (
          <input className={inputCls} value={editPlaceholder} onChange={(e) => setEditPlaceholder(e.target.value)} placeholder="Placeholder (opcional)" />
        )}
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} />
          <span className="text-gray-300">Obrigatório</span>
        </label>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancelEdit} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs">Cancelar</button>
          <button onClick={() => onSaveEdit({ label: editLabel, fieldType: editFieldType, options: editOptions, placeholder: editPlaceholder, required: editRequired })} disabled={saving} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1">
            <Save size={12} /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${indent} flex items-center gap-2 ${bg} ${borderLeft} px-3 py-2 rounded-xl`}>
      {level === 0 && (
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} className="p-0.5 text-gray-400 hover:text-white hover:bg-white/10 rounded"><ChevronUp className="w-3 h-3" /></button>
          <button onClick={onMoveDown} className="p-0.5 text-gray-400 hover:text-white hover:bg-white/10 rounded"><ChevronDown className="w-3 h-3" /></button>
        </div>
      )}
      {level > 0 && <span className={`text-[10px] ${prefixColor} shrink-0`}>{prefix} se "{q.triggerOption}":</span>}
      <span className="text-sm flex-1 truncate font-medium">{q.label}</span>
      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded shrink-0">{FIELD_TYPES.find((t) => t.value === q.fieldType)?.label}</span>
      {q.required && <span className="text-[10px] text-red-400 shrink-0">*</span>}
      <button onClick={onEdit} className="p-1 text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 rounded shrink-0"><Pencil className="w-3 h-3" /></button>
      <button onClick={onDelete} className="p-1 text-red-400 hover:bg-red-500/20 rounded shrink-0"><Trash2 className="w-3 h-3" /></button>
    </div>
  );
}

export default function AdminPreCadastroQuestions() {
  const utils = trpc.useUtils();
  const { data: allQuestions = [], isLoading } = trpc.preCadastroQuestions.listAll.useQuery();

  // Todas as perguntas são editáveis no admin
  const questions: Question[] = allQuestions as Question[];

  const createMut = trpc.preCadastroQuestions.create.useMutation({
    onSuccess: () => {
      utils.preCadastroQuestions.listAll.invalidate();
      toast.success("Pergunta criada!");
      setOpenFormKey(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.preCadastroQuestions.update.useMutation({
    onSuccess: () => {
      utils.preCadastroQuestions.listAll.invalidate();
      toast.success("Atualizado!");
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.preCadastroQuestions.delete.useMutation({
    onSuccess: () => { utils.preCadastroQuestions.listAll.invalidate(); toast.success("Excluído!"); },
    onError: (e) => toast.error(e.message),
  });

  const reorderMut = trpc.preCadastroQuestions.reorder.useMutation({
    onSuccess: () => utils.preCadastroQuestions.listAll.invalidate(),
  });

  // Chave do formulário inline aberto: "root" | "sub:{parentId}:{trigger}" | "subsub:{parentId}:{trigger}"
  const [openFormKey, setOpenFormKey] = useState<string | null>(null);
  const [openFormMeta, setOpenFormMeta] = useState<{ parentId: number | null; trigger: string }>({ parentId: null, trigger: "" });
  const [editingId, setEditingId] = useState<number | null>(null);

  function openForm(key: string, parentId: number | null, trigger: string) {
    setOpenFormKey(key);
    setOpenFormMeta({ parentId, trigger });
    setEditingId(null);
  }

  function handleCreate(data: { label: string; fieldKey: string; fieldType: FieldType; options: string; placeholder: string; required: boolean }) {
    if (!data.label.trim() || !data.fieldKey.trim()) { toast.error("Preencha o texto e a chave do campo"); return; }
    const opts = (data.fieldType === "radio" || data.fieldType === "select") ? parseOptionsCSV(data.options) : undefined;
    createMut.mutate({
      label: data.label.trim(),
      fieldKey: data.fieldKey.trim(),
      fieldType: data.fieldType,
      options: opts,
      placeholder: data.placeholder.trim() || undefined,
      required: data.required,
      active: true,
      sortOrder: questions.filter((q) => !q.parentQuestionId).length + 1,
      parentQuestionId: openFormMeta.parentId ?? null,
      triggerOption: openFormMeta.trigger.trim() || null,
    });
  }

  function handleUpdate(q: Question, data: { label: string; fieldType: FieldType; options: string; placeholder: string; required: boolean }) {
    const opts = (data.fieldType === "radio" || data.fieldType === "select") ? parseOptionsCSV(data.options) : undefined;
    updateMut.mutate({
      id: q.id,
      label: data.label.trim(),
      fieldType: data.fieldType,
      options: opts,
      placeholder: data.placeholder.trim() || undefined,
      required: data.required,
      parentQuestionId: q.parentQuestionId ?? null,
      triggerOption: q.triggerOption ?? null,
    });
  }

  function moveUp(q: Question, list: Question[], idx: number) {
    if (idx === 0) return;
    const prev = list[idx - 1];
    reorderMut.mutate([{ id: q.id, sortOrder: prev.sortOrder }, { id: prev.id, sortOrder: q.sortOrder }]);
  }

  function moveDown(q: Question, list: Question[], idx: number) {
    if (idx === list.length - 1) return;
    const next = list[idx + 1];
    reorderMut.mutate([{ id: q.id, sortOrder: next.sortOrder }, { id: next.id, sortOrder: q.sortOrder }]);
  }

  const rootQs = questions.filter((q) => !q.parentQuestionId);

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pre-cadastros">
          <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"><ArrowLeft size={18} /></button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Perguntas do Pré-Cadastro</h1>
          <p className="text-sm text-gray-400">Crie e organize as perguntas do formulário público</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-16">Carregando...</div>
      ) : (
        <div className="space-y-2 mb-6">
          {rootQs.map((q, idx) => {
            const qOpts = parseOpts(q);
            const subQs = questions.filter((sq) => sq.parentQuestionId === q.id);

            return (
              <div key={q.id} className="space-y-1">
                <QuestionRow
                  q={q} level={0} indent=""
                  isEditing={editingId === q.id}
                  onEdit={() => { setEditingId(q.id); setOpenFormKey(null); }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(data) => handleUpdate(q, data)}
                  onDelete={() => { if (confirm(`Excluir "${q.label}"?`)) deleteMut.mutate({ id: q.id }); }}
                  onMoveUp={() => moveUp(q, rootQs, idx)}
                  onMoveDown={() => moveDown(q, rootQs, idx)}
                  saving={updateMut.isPending}
                />

                {/* Botões + sub-pergunta se "X" */}
                {qOpts.length > 0 && editingId !== q.id && (
                  <div className="ml-6 flex flex-wrap gap-1 pt-0.5">
                    {qOpts.map((optLabel) => {
                      const fk = `sub:${q.id}:${optLabel}`;
                      const jaExiste = subQs.some((sq) => sq.triggerOption === optLabel);
                      return (
                        <button key={optLabel} onClick={() => openForm(fk, q.id, optLabel)} disabled={jaExiste}
                          className={`text-[10px] px-2 py-0.5 border rounded-full transition-colors ${jaExiste ? "bg-cyan-500/5 border-cyan-500/20 text-cyan-500/40 cursor-default" : "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-400"}`}>
                          <Plus size={8} className="inline mr-0.5" />
                          sub-pergunta se "{optLabel}"
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Formulário inline de sub-pergunta — abre logo abaixo do botão clicado */}
                {qOpts.map((optLabel) => (
                  <div key={optLabel} className="ml-6">
                    <InlineCreateForm
                      visible={openFormKey === `sub:${q.id}:${optLabel}`}
                      trigger={optLabel}
                      parentId={q.id}
                      accentColor="cyan"
                      onClose={() => setOpenFormKey(null)}
                      onSave={handleCreate}
                      saving={createMut.isPending}
                    />
                  </div>
                ))}

                {/* Sub-perguntas */}
                {subQs.map((sq) => {
                  const sqOpts = parseOpts(sq);
                  const subSubQs = questions.filter((ssq) => ssq.parentQuestionId === sq.id);

                  return (
                    <div key={sq.id} className="space-y-1">
                      <QuestionRow
                        q={sq} level={1} indent="ml-6"
                        isEditing={editingId === sq.id}
                        onEdit={() => { setEditingId(sq.id); setOpenFormKey(null); }}
                        onCancelEdit={() => setEditingId(null)}
                        onSaveEdit={(data) => handleUpdate(sq, data)}
                        onDelete={() => { if (confirm(`Excluir "${sq.label}"?`)) deleteMut.mutate({ id: sq.id }); }}
                        saving={updateMut.isPending}
                      />

                      {/* Botões + sub-sub se "X" */}
                      {sqOpts.length > 0 && editingId !== sq.id && (
                        <div className="ml-12 flex flex-wrap gap-1 pt-0.5">
                          {sqOpts.map((sqOptLabel) => {
                            const fk = `subsub:${sq.id}:${sqOptLabel}`;
                            const jaExiste = subSubQs.some((ssq) => ssq.triggerOption === sqOptLabel);
                            return (
                              <button key={sqOptLabel} onClick={() => openForm(fk, sq.id, sqOptLabel)} disabled={jaExiste}
                                className={`text-[10px] px-2 py-0.5 border rounded-full transition-colors ${jaExiste ? "bg-purple-500/5 border-purple-500/20 text-purple-500/40 cursor-default" : "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-400"}`}>
                                <Plus size={8} className="inline mr-0.5" />
                                sub-sub se "{sqOptLabel}"
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Formulário inline de sub-sub-pergunta */}
                      {sqOpts.map((sqOptLabel) => (
                        <div key={sqOptLabel} className="ml-12">
                          <InlineCreateForm
                            visible={openFormKey === `subsub:${sq.id}:${sqOptLabel}`}
                            trigger={sqOptLabel}
                            parentId={sq.id}
                            accentColor="purple"
                            onClose={() => setOpenFormKey(null)}
                            onSave={handleCreate}
                            saving={createMut.isPending}
                          />
                        </div>
                      ))}

                      {/* Sub-sub-perguntas */}
                      {subSubQs.map((ssq) => (
                        <QuestionRow
                          key={ssq.id} q={ssq} level={2} indent="ml-12"
                          isEditing={editingId === ssq.id}
                          onEdit={() => { setEditingId(ssq.id); setOpenFormKey(null); }}
                          onCancelEdit={() => setEditingId(null)}
                          onSaveEdit={(data) => handleUpdate(ssq, data)}
                          onDelete={() => { if (confirm(`Excluir "${ssq.label}"?`)) deleteMut.mutate({ id: ssq.id }); }}
                          saving={updateMut.isPending}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Botão / formulário de nova pergunta principal */}
      {openFormKey !== "root" ? (
        <button onClick={() => openForm("root", null, "")}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/15 hover:border-green-500/40 text-gray-400 hover:text-green-400 rounded-xl transition-colors text-sm">
          <Plus size={16} /> Nova Pergunta Principal
        </button>
      ) : (
        <InlineCreateForm
          visible={true}
          trigger=""
          parentId={null}
          accentColor="green"
          onClose={() => setOpenFormKey(null)}
          onSave={handleCreate}
          saving={createMut.isPending}
        />
      )}
    </div>
  );
}
