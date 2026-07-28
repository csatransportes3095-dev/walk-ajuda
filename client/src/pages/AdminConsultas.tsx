import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  FileSearch, Plus, Trash2, Edit2, Check, X, ExternalLink, Link2,
  MessageCircle, Mail, Clock, CheckCircle, ChevronDown, ChevronUp,
  Car, Scale, Search, User, Phone, AlertCircle, ToggleLeft, ToggleRight,
  ArrowLeft, GripVertical, Copy, RotateCcw, Eye, EyeOff, Settings,
  Gavel, Shield, FileWarning, AlertTriangle, Fingerprint, BookOpen,
  CreditCard, Home, MapPin, Building, Truck, Bike, Plane, Ship,
  Camera, Video, Music, Headphones, Mic, Star, Heart, Flag,
  Globe, Lock, Unlock, Key, Wallet, DollarSign, Receipt,
  Clipboard, ClipboardList, FileText, File, Folder, Archive,
  Zap, Activity, BarChart, PieChart, TrendingUp, Award,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";

const ICON_LIST: { name: string; icon: LucideIcon }[] = [
  { name: "Search", icon: Search }, { name: "Car", icon: Car }, { name: "Scale", icon: Scale },
  { name: "Gavel", icon: Gavel }, { name: "Shield", icon: Shield }, { name: "FileWarning", icon: FileWarning },
  { name: "AlertTriangle", icon: AlertTriangle }, { name: "Fingerprint", icon: Fingerprint }, { name: "BookOpen", icon: BookOpen },
  { name: "CreditCard", icon: CreditCard }, { name: "Home", icon: Home }, { name: "MapPin", icon: MapPin },
  { name: "Building", icon: Building }, { name: "Truck", icon: Truck }, { name: "Bike", icon: Bike },
  { name: "Plane", icon: Plane }, { name: "Ship", icon: Ship }, { name: "Camera", icon: Camera },
  { name: "Video", icon: Video }, { name: "Music", icon: Music }, { name: "Headphones", icon: Headphones },
  { name: "Mic", icon: Mic }, { name: "Star", icon: Star }, { name: "Heart", icon: Heart },
  { name: "Flag", icon: Flag }, { name: "Globe", icon: Globe }, { name: "Lock", icon: Lock },
  { name: "Unlock", icon: Unlock }, { name: "Key", icon: Key }, { name: "Wallet", icon: Wallet },
  { name: "DollarSign", icon: DollarSign }, { name: "Receipt", icon: Receipt }, { name: "Clipboard", icon: Clipboard },
  { name: "ClipboardList", icon: ClipboardList }, { name: "FileText", icon: FileText }, { name: "File", icon: File },
  { name: "Folder", icon: Folder }, { name: "Archive", icon: Archive }, { name: "Zap", icon: Zap },
  { name: "Activity", icon: Activity }, { name: "BarChart", icon: BarChart }, { name: "PieChart", icon: PieChart },
  { name: "TrendingUp", icon: TrendingUp }, { name: "Award", icon: Award }, { name: "User", icon: User },
  { name: "Phone", icon: Phone }, { name: "Mail", icon: Mail }, { name: "FileSearch", icon: FileSearch },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ConsultaForm = {
  id: number;
  title: string;
  icon: string;
  type: "consultation" | "link";
  redirectUrl: string;
  fields: string;
  originalFields?: string;
  isActive: number;
  isBuiltin: number;
  sortOrder: number;
  createdAt: Date;
};

type ConsultaRequest = {
  id: number;
  formId: number;
  formTitle: string;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerPhoto: string;
  data: string;
  status: "pending" | "answered";
  adminResponse: string;
  responseFileUrl: string;
  responseFileName: string;
  respondedAt: Date | null;
  createdAt: Date;
};

// Tipos para o editor de campos
type FieldType = "text" | "textarea" | "select" | "radio" | "checkbox" | "date" | "number" | "file";

type FormField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  mask?: string;
  options?: string[];
  isActive: boolean;
};

type FormRow = {
  id: string;
  cols: 1 | 2 | 3;
  fields: FormField[];
};

// ─── Ícone dinâmico ───────────────────────────────────────────────────────────
function DynIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    Car: <Car className={className} />,
    Scale: <Scale className={className} />,
    FileSearch: <FileSearch className={className} />,
    Search: <Search className={className} />,
    Link2: <Link2 className={className} />,
    ExternalLink: <ExternalLink className={className} />,
  };
  return <>{icons[name] || <FileSearch className={className} />}</>;
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Editor de campos de formulário ──────────────────────────────────────────
function FormFieldEditor({
  form,
  onClose,
  onSaved,
  onUpdateForm,
}: {
  form: ConsultaForm;
  onClose: () => void;
  onSaved: () => void;
  onUpdateForm: (updates: { title?: string; type?: "consultation" | "link"; redirectUrl?: string; icon?: string }) => void;
}) {
  const [editTitle, setEditTitle] = useState(form.title ?? "");
  const [editType, setEditType] = useState<"consultation" | "link">(form.type as "consultation" | "link" ?? "consultation");
  const [editUrl, setEditUrl] = useState(form.redirectUrl ?? "");
  const [editIcon, setEditIcon] = useState(form.icon ?? "Search");
  const [showMeta, setShowMeta] = useState(false);
  const parseRows = (json: string): FormRow[] => {
    try {
      const parsed = JSON.parse(json || "[]");
      if (!Array.isArray(parsed)) return [];
      // Normalizar cada linha: garantir que fields seja sempre um array
      return parsed.map((r: FormRow) => ({
        ...r,
        id: r.id || genId(),
        cols: ([1, 2, 3].includes(r.cols) ? r.cols : 1) as 1 | 2 | 3,
        fields: Array.isArray(r.fields) ? r.fields.map((f: FormField) => ({
          id: f.id || genId(),
          key: f.key || "",
          label: f.label || "",
          type: f.type || "text",
          required: !!f.required,
          placeholder: f.placeholder || "",
          mask: f.mask || "",
          options: Array.isArray(f.options) ? f.options : [],
          isActive: f.isActive !== false,
        })) : [],
      }));
    } catch {}
    return [];
  };

  const [rows, setRows] = useState<FormRow[]>(() => parseRows(form.fields));
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<{ rowId: string; fieldId: string } | null>(null);

  const saveFieldsMutation = trpc.consultas.saveFormFields.useMutation({
    onSuccess: () => { toast.success("Campos salvos!"); setSaving(false); onSaved(); },
    onError: (e) => { toast.error(e.message); setSaving(false); },
  });

  const restoreMutation = trpc.consultas.restoreFormFields.useMutation({
    onSuccess: () => { toast.success("Formulário restaurado!"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    setSaving(true);
    saveFieldsMutation.mutate({ id: form.id, fields: JSON.stringify(rows) });
  };

  const addRow = () => {
    setRows(prev => [...prev, { id: genId(), cols: 1, fields: [createEmptyField()] }]);
  };

  const createEmptyField = (): FormField => ({
    id: genId(), key: "", label: "", type: "text", required: false,
    placeholder: "", mask: "", options: [], isActive: true,
  });

  const duplicateRow = (rowId: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx < 0) return prev;
      const copy = JSON.parse(JSON.stringify(prev[idx])) as FormRow;
      copy.id = genId();
      copy.fields = copy.fields.map(f => ({ ...f, id: genId() }));
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const deleteRow = (rowId: string) => {
    if (!confirm("Excluir esta linha?")) return;
    setRows(prev => prev.filter(r => r.id !== rowId));
  };

  const moveRow = (rowId: string, dir: -1 | 1) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const updateRowCols = (rowId: string, cols: 1 | 2 | 3) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      let fields = [...r.fields];
      while (fields.length < cols) fields.push(createEmptyField());
      if (fields.length > cols) fields = fields.slice(0, cols);
      return { ...r, cols, fields };
    }));
  };

  const addFieldToRow = (rowId: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, fields: [...r.fields, createEmptyField()] };
    }));
  };

  const updateField = (rowId: string, fieldId: string, updates: Partial<FormField>) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return { ...r, fields: r.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) };
    }));
  };

  const deleteField = (rowId: string, fieldId: string) => {
    if (!confirm("Excluir este campo?")) return;
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const fields = r.fields.filter(f => f.id !== fieldId);
      return { ...r, fields };
    }));
  };

  const moveFieldBetweenRows = (fromRowId: string, fieldId: string, toRowId: string) => {
    setRows(prev => {
      const fromRow = prev.find(r => r.id === fromRowId);
      const field = fromRow?.fields.find(f => f.id === fieldId);
      if (!field) return prev;
      return prev.map(r => {
        if (r.id === fromRowId) return { ...r, fields: r.fields.filter(f => f.id !== fieldId) };
        if (r.id === toRowId) return { ...r, fields: [...r.fields, { ...field, id: genId() }] };
        return r;
      });
    });
  };

  const fieldTypeLabels: Record<FieldType, string> = {
    text: "Texto", textarea: "Texto longo", select: "Seleção (dropdown)",
    radio: "Opções (radio)", checkbox: "Múltipla escolha", date: "Data",
    number: "Número", file: "Arquivo/Foto",
  };

  const maskLabels: Record<string, string> = {
    "": "Sem máscara", placa: "Placa (ABC1D23)", numbers: "Somente números",
    cpf: "CPF", phone: "Telefone", cep: "CEP",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-4 px-2">
      <div className="w-full max-w-3xl bg-[#0f0f1f] border border-orange-500/30 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10">
          <div className="flex items-center gap-3 p-4">
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <p className="font-bold text-white">{form.title}</p>
              <p className="text-white/40 text-xs">Editor de campos</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMeta(!showMeta)}
                className="text-white/40 hover:text-orange-400 transition-colors"
                title="Editar título, tipo e ícone"
              >
                <Settings className="w-4 h-4" />
              </button>
              {form.isBuiltin === 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 text-white/60 hover:text-white text-xs"
                  onClick={() => {
                    if (!confirm("Restaurar o formulário para a configuração original? Todas as alterações serão perdidas.")) return;
                    restoreMutation.mutate({ id: form.id });
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Restaurar
                </Button>
              )}
              <Button
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white"
                disabled={saving}
                onClick={handleSave}
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
          {/* Painel de edição de meta (título, tipo, ícone, URL) */}
          {showMeta && (
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Título</label>
                  <div className="flex gap-1">
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2 outline-none focus:border-orange-500/60"
                    />
                    <button onClick={() => onUpdateForm({ title: editTitle })} className="px-2 h-8 rounded-md bg-orange-600/30 text-orange-400 hover:bg-orange-600/50">
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-white/40 text-[10px] font-bold uppercase block mb-2">Ícone</label>
                  <div className="grid grid-cols-8 gap-2 max-h-40 overflow-y-auto bg-black/20 p-2 rounded-md border border-white/10">
                    {ICON_LIST.map(({ name, icon: IconComponent }) => {
                      const isSelected = editIcon === name;
                      return (
                        <button
                          key={name}
                          onClick={() => { setEditIcon(name); onUpdateForm({ icon: name }); }}
                          className={`p-2 rounded-md transition-all ${
                            isSelected
                              ? "bg-orange-600 text-white border border-orange-400"
                              : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
                          }`}
                          title={name}
                        >
                          <IconComponent className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Tipo</label>
                <select
                  value={editType}
                  onChange={e => { const t = e.target.value as "consultation" | "link"; setEditType(t); onUpdateForm({ type: t }); }}
                  className="w-full bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2"
                >
                  <option value="consultation">📋 Formulário (com campos)</option>
                  <option value="link">🔗 Link externo (redireciona)</option>
                </select>
              </div>
              {editType === "link" && (
                <div>
                  <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">URL de Destino</label>
                  <div className="flex gap-1">
                    <input
                      value={editUrl}
                      onChange={e => setEditUrl(e.target.value)}
                      placeholder="https://wa.me/55..."
                      className="flex-1 bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2 outline-none focus:border-orange-500/60"
                    />
                    <button onClick={() => onUpdateForm({ redirectUrl: editUrl })} className="px-2 h-8 rounded-md bg-green-600/40 text-green-400 hover:bg-green-600/60">
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Linhas */}
        <div className="p-4 space-y-3">
          {rows.length === 0 && (
            <div className="text-center py-8 text-white/30">
              <FileSearch className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Nenhuma linha ainda. Clique em "+ Adicionar Linha".</p>
            </div>
          )}

          {rows.map((row, rowIdx) => (
            <div key={row.id} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
              {/* Controles da linha */}
              <div className="flex items-center gap-2 flex-wrap">
                <GripVertical className="w-4 h-4 text-white/20 flex-shrink-0" />
                <span className="text-white/40 text-xs font-bold">LINHA {rowIdx + 1}</span>

                {/* Colunas */}
                <div className="flex gap-1 ml-auto">
                  {([1, 2, 3] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => updateRowCols(row.id, c)}
                      className={`px-2 py-0.5 rounded text-xs font-bold border transition-all ${row.cols === c ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/40 hover:bg-white/10"}`}
                    >
                      {c} col
                    </button>
                  ))}
                </div>

                {/* Mover */}
                <button onClick={() => moveRow(row.id, -1)} disabled={rowIdx === 0} className="text-white/30 hover:text-white disabled:opacity-20 transition-colors">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button onClick={() => moveRow(row.id, 1)} disabled={rowIdx === rows.length - 1} className="text-white/30 hover:text-white disabled:opacity-20 transition-colors">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button onClick={() => duplicateRow(row.id)} className="text-white/30 hover:text-blue-400 transition-colors" title="Duplicar linha">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => deleteRow(row.id)} className="text-white/30 hover:text-red-400 transition-colors" title="Excluir linha">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Campos da linha */}
              <div className={`grid gap-2 ${row.cols === 1 ? "grid-cols-1" : row.cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                {row.fields.map((field) => {
                  const isEditing = editingField?.rowId === row.id && editingField?.fieldId === field.id;
                  return (
                    <div key={field.id} className={`bg-black/30 border rounded-lg p-2.5 space-y-2 transition-all ${isEditing ? "border-orange-500/60" : "border-white/10"} ${!field.isActive ? "opacity-50" : ""}`}>
                      {/* Cabeçalho do campo */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-bold truncate">{field.label || "(sem título)"}</p>
                          <p className="text-white/30 text-[10px]">{fieldTypeLabels[field.type]} {field.required ? "· Obrigatório" : "· Opcional"}</p>
                        </div>
                        <button onClick={() => updateField(row.id, field.id, { isActive: !field.isActive })} className="text-white/30 hover:text-white transition-colors" title={field.isActive ? "Desativar" : "Ativar"}>
                          {field.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setEditingField(isEditing ? null : { rowId: row.id, fieldId: field.id })} className="text-white/30 hover:text-orange-400 transition-colors" title="Editar campo">
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteField(row.id, field.id)} className="text-white/30 hover:text-red-400 transition-colors" title="Excluir campo">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Editor inline do campo */}
                      {isEditing && (
                        <div className="space-y-2 pt-2 border-t border-white/10">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-white/40 text-[10px] font-bold uppercase">Título</label>
                              <Input
                                value={field.label}
                                onChange={e => updateField(row.id, field.id, { label: e.target.value, key: e.target.value })}
                                placeholder="Ex: CPF"
                                className="bg-black/40 border-white/20 text-white text-xs h-8"
                              />
                            </div>
                            <div>
                              <label className="text-white/40 text-[10px] font-bold uppercase">Tipo</label>
                              <select
                                value={field.type}
                                onChange={e => updateField(row.id, field.id, { type: e.target.value as FieldType })}
                                className="w-full bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2"
                              >
                                {Object.entries(fieldTypeLabels).map(([v, l]) => (
                                  <option key={v} value={v}>{l}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-white/40 text-[10px] font-bold uppercase">Placeholder</label>
                              <Input
                                value={field.placeholder || ""}
                                onChange={e => updateField(row.id, field.id, { placeholder: e.target.value })}
                                placeholder="Texto de ajuda"
                                className="bg-black/40 border-white/20 text-white text-xs h-8"
                              />
                            </div>
                            <div>
                              <label className="text-white/40 text-[10px] font-bold uppercase">Máscara</label>
                              <select
                                value={field.mask || ""}
                                onChange={e => updateField(row.id, field.id, { mask: e.target.value })}
                                className="w-full bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2"
                              >
                                {Object.entries(maskLabels).map(([v, l]) => (
                                  <option key={v} value={v}>{l}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {(field.type === "select" || field.type === "radio" || field.type === "checkbox") && (
                            <div>
                              <label className="text-white/40 text-[10px] font-bold uppercase">Opções (uma por linha)</label>
                              <textarea
                                value={(field.options || []).join("\n")}
                                onChange={e => updateField(row.id, field.id, { options: e.target.value.split("\n").filter(Boolean) })}
                                placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                                rows={3}
                                className="w-full bg-black/40 border border-white/20 text-white text-xs rounded-md p-2 resize-none focus:outline-none focus:border-orange-500/60"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => updateField(row.id, field.id, { required: e.target.checked })}
                                className="w-3.5 h-3.5 accent-orange-500"
                              />
                              <span className="text-white/60 text-xs">Obrigatório</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.isActive}
                                onChange={e => updateField(row.id, field.id, { isActive: e.target.checked })}
                                className="w-3.5 h-3.5 accent-orange-500"
                              />
                              <span className="text-white/60 text-xs">Ativo</span>
                            </label>
                          </div>
                          {/* Mover para outra linha */}
                          {rows.length > 1 && (
                            <div>
                              <label className="text-white/40 text-[10px] font-bold uppercase">Mover para linha</label>
                              <div className="flex gap-1 flex-wrap mt-1">
                                {rows.filter(r => r.id !== row.id).map((r, ri) => (
                                  <button
                                    key={r.id}
                                    onClick={() => { moveFieldBetweenRows(row.id, field.id, r.id); setEditingField(null); }}
                                    className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/60 hover:bg-orange-600/30 hover:text-white transition-all border border-white/10"
                                  >
                                    Linha {rows.indexOf(r) + 1}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Adicionar campo à linha */}
              <button
                onClick={() => addFieldToRow(row.id)}
                className="w-full py-1.5 rounded-lg border border-dashed border-white/20 text-white/30 hover:text-white hover:border-orange-500/40 text-xs transition-all flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar campo nesta linha
              </button>
            </div>
          ))}

          {/* Botão adicionar linha */}
          <button
            onClick={addRow}
            className="w-full py-3 rounded-xl border-2 border-dashed border-orange-500/30 text-orange-400 hover:bg-orange-600/10 hover:border-orange-500/60 font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            + ADICIONAR NOVA LINHA
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <button onClick={onClose} className="text-white/40 hover:text-white text-sm transition-colors flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white"
            disabled={saving}
            onClick={handleSave}
          >
            <Check className="w-4 h-4 mr-1" />
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Configuração de limite semanal ──────────────────────────────────────────
function WeeklyLimitConfig() {
  const limitQuery = trpc.consultas.getWeeklyLimit.useQuery();
  const setLimitMutation = trpc.consultas.setWeeklyLimit.useMutation({
    onSuccess: () => { toast.success("Limite atualizado!"); limitQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const currentLimit = limitQuery.data?.limit ?? 0;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-orange-400" />
        <div>
          <p className="text-white text-xs font-bold">Limite semanal por cliente</p>
          <p className="text-white/40 text-[10px]">
            {currentLimit === 0 ? "Sem limite (ilimitado)" : `Máx. ${currentLimit} consulta(s) por semana`}
          </p>
        </div>
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="0 = sem limite"
            className="w-24 bg-black/40 border border-white/20 text-white text-xs h-7 rounded px-2 outline-none focus:border-orange-500/60"
          />
          <button
            onClick={() => { setLimitMutation.mutate({ limit: parseInt(val, 10) || 0 }); setEditing(false); }}
            className="h-7 px-2 rounded bg-green-600/80 text-white text-xs hover:bg-green-600"
          >
            <Check className="w-3 h-3" />
          </button>
          <button onClick={() => setEditing(false)} className="h-7 px-2 rounded bg-white/10 text-white/60 text-xs hover:bg-white/20">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setVal(String(currentLimit)); setEditing(true); }}
          className="h-7 px-3 rounded bg-orange-600/30 text-orange-400 text-xs font-bold hover:bg-orange-600/50 transition-all"
        >
          <Edit2 className="w-3 h-3 inline mr-1" />Editar
        </button>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function AdminConsultas() {
  const [tab, setTab] = useState<"requests" | "forms">("requests");
  const [editingFormId, setEditingFormId] = useState<number | null>(null);

  // ── Solicitações ──────────────────────────────────────────────────────────
  const requestsQuery = trpc.consultas.listRequests.useQuery(undefined, { refetchInterval: 30000 });
  const requests: ConsultaRequest[] = (requestsQuery.data as ConsultaRequest[]) ?? [];

  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [responseText, setResponseText] = useState<Record<number, string>>({});
  const [sendingReq, setSendingReq] = useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = useState<number | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Record<number, { url: string; name: string }>>({});

  const deleteRequestMutation = trpc.consultas.deleteRequest.useMutation({
    onSuccess: () => { toast.success("Solicitação excluída!"); requestsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const respondMutation = trpc.consultas.respond.useMutation({
    onSuccess: (data) => {
      toast.success("Resposta salva!");
      if (data.whatsappUrl) window.open(data.whatsappUrl, "_blank");
      if (data.emailSent) toast.success("E-mail enviado!");
      requestsQuery.refetch();
      setSendingReq(null);
    },
    onError: (e) => { toast.error(e.message); setSendingReq(null); },
  });

  const uploadResponseFileMutation = trpc.consultas.uploadResponseFile.useMutation({
    onSuccess: (data, vars) => {
      setUploadedFiles(prev => ({ ...prev, [vars.requestId]: { url: data.url, name: data.fileName } }));
      toast.success("Arquivo enviado com sucesso!");
      requestsQuery.refetch();
      setUploadingFile(null);
    },
    onError: (e) => { toast.error(e.message); setUploadingFile(null); },
  });

  const handleFileUpload = async (req: ConsultaRequest, file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 20MB."); return; }
    setUploadingFile(req.id);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadResponseFileMutation.mutate({
        requestId: req.id,
        base64,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const getFileUrl = (req: ConsultaRequest) => {
    return uploadedFiles[req.id]?.url || req.responseFileUrl || "";
  };

  const getFileName = (req: ConsultaRequest) => {
    return uploadedFiles[req.id]?.name || req.responseFileName || "";
  };

  const handleSendFileViaWhatsApp = (req: ConsultaRequest) => {
    const fileUrl = getFileUrl(req);
    if (!fileUrl) { toast.error("Faça upload de um arquivo primeiro."); return; }
    const phone = req.customerPhone.replace(/\D/g, "");
    const fullUrl = fileUrl.startsWith("http") ? fileUrl : `${window.location.origin}${fileUrl}`;
    const msg = encodeURIComponent(`Olá ${req.customerName || ""}! Segue o arquivo da sua consulta *${req.formTitle}*:\n\n${fullUrl}`);
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
  };

  const handleSendFileViaEmail = (req: ConsultaRequest) => {
    const fileUrl = getFileUrl(req);
    if (!fileUrl) { toast.error("Faça upload de um arquivo primeiro."); return; }
    if (!req.customerEmail) { toast.error("Cliente sem e-mail cadastrado."); return; }
    const fullUrl = fileUrl.startsWith("http") ? fileUrl : `${window.location.origin}${fileUrl}`;
    respondMutation.mutate({
      id: req.id,
      adminResponse: responseText[req.id] || req.adminResponse || `Arquivo da consulta: ${fullUrl}`,
      sendVia: "email",
    });
  };

  const handleRespond = (req: ConsultaRequest, via: "email" | "whatsapp" | "none") => {
    const text = responseText[req.id] ?? "";
    if (!text.trim()) { toast.error("Digite a resposta antes de enviar."); return; }
    setSendingReq(req.id);
    respondMutation.mutate({ id: req.id, adminResponse: text, sendVia: via });
  };

  const parseData = (json: string) => {
    try { return JSON.parse(json); } catch { return {}; }
  };

  // ── Formulários ───────────────────────────────────────────────────────────
  const formsQuery = trpc.consultas.listAllForms.useQuery();
  const forms: ConsultaForm[] = (formsQuery.data as ConsultaForm[]) ?? [];

  const updateFormMutation = trpc.consultas.updateForm.useMutation({
    onSuccess: () => { toast.success("Salvo!"); formsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteFormMutation = trpc.consultas.deleteForm.useMutation({
    onSuccess: () => { toast.success("Excluído!"); formsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const createFormMutation = trpc.consultas.createForm.useMutation({
    onSuccess: () => { toast.success("Formulário criado!"); formsQuery.refetch(); setShowNewForm(false); resetNewForm(); },
    onError: (e) => toast.error(e.message),
  });
  const initBuiltinMutation = trpc.consultas.initBuiltinFields.useMutation({
    onSuccess: (d) => { toast.success(`Inicializado! ${d.updated} formulário(s) atualizado(s).`); formsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"consultation" | "link">("link");
  const [newUrl, setNewUrl] = useState("");
  const [newIcon, setNewIcon] = useState("Search");

  const resetNewForm = () => { setNewTitle(""); setNewType("link"); setNewUrl(""); setNewIcon("Search"); };

  const handleCreateForm = () => {
    if (!newTitle.trim()) { toast.error("Informe o título."); return; }
    if (newType === "link" && !newUrl.trim()) { toast.error("Informe o link de destino."); return; }
    createFormMutation.mutate({ title: newTitle, icon: newIcon, type: newType, redirectUrl: newUrl, fields: "[]", isActive: 1, sortOrder: forms.length });
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const editingForm = editingFormId ? forms.find(f => f.id === editingFormId) : null;

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <AdminHeader title="Consultas / Serviços Extras" icon={<FileSearch className="w-5 h-5" />} backTo="/admin/codes" />

      {/* Editor de campos (modal fullscreen) */}
      {editingForm && (
        <FormFieldEditor
          form={editingForm}
          onClose={() => setEditingFormId(null)}
          onSaved={() => { formsQuery.refetch(); }}
          onUpdateForm={(updates) => updateFormMutation.mutate({ id: editingForm.id, ...updates })}
        />
      )}

      <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("requests")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${tab === "requests" ? "bg-orange-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
          >
            <MessageCircle className="w-4 h-4" />
            Solicitações
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab("forms")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${tab === "forms" ? "bg-orange-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
          >
            <FileSearch className="w-4 h-4" />
            Gerenciar Formulários
          </button>
        </div>

        {/* ── ABA: SOLICITAÇÕES ── */}
        {tab === "requests" && (
          <div className="space-y-3">
            <WeeklyLimitConfig />
            {requestsQuery.isLoading && <p className="text-white/50 text-center py-8">Carregando...</p>}
            {!requestsQuery.isLoading && requests.length === 0 && (
              <div className="bg-white/5 rounded-2xl p-8 text-center text-white/40">
                <FileSearch className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma solicitação recebida ainda.</p>
              </div>
            )}
            {requests.map(req => {
              const isExpanded = expandedReq === req.id;
              const isPending = req.status === "pending";
              const dataObj = parseData(req.data);
              const phone = (req as any).currentPhone || req.customerPhone || '';
              const phoneDigits = phone.replace(/\D/g, '');
              const createdDate = new Date(req.createdAt);
              const dateStr = createdDate.toLocaleDateString('pt-BR');
              const timeStr = createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={req.id} className={`rounded-2xl border transition-all overflow-hidden ${isPending ? "bg-orange-950/30 border-orange-500/40" : "bg-white/5 border-white/10"}`}>
                  <button
                    className="w-full p-4 text-left"
                    onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                  >
                    {/* Linha 1: título + status + ações */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${isPending ? "bg-orange-400" : "bg-green-400"}`} />
                        <span className="font-bold text-white text-sm leading-tight">{req.formTitle}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${isPending ? "bg-orange-500/20 text-orange-300" : "bg-green-500/20 text-green-300"}`}>
                          {isPending ? "Pendente" : "Respondido"}
                        </span>
                        <button
                          className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Excluir solicitação"
                          onClick={e => { e.stopPropagation(); if (confirm("Excluir esta solicitação?")) deleteRequestMutation.mutate({ id: req.id }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                      </div>
                    </div>
                    {/* Linha 2: nome do cliente */}
                    <div className="flex items-center gap-1.5 text-white/70 text-xs mb-1.5 pl-4">
                      <User className="w-3 h-3 flex-shrink-0" />
                      <span className="font-medium">{req.customerName || "—"}</span>
                    </div>
                    {/* Linha 3: telefone + WhatsApp */}
                    <div className="flex items-center justify-between pl-4">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-white/60 text-xs">
                          <Phone className="w-3 h-3 flex-shrink-0" />
                          <span>{phone || "—"}</span>
                        </span>
                        {phoneDigits && (
                          <a
                            href={`https://wa.me/55${phoneDigits}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] text-xs px-2 py-0.5 rounded-full font-semibold hover:bg-[#25D366]/25 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WA
                          </a>
                        )}
                      </div>
                      {/* Data + hora separados */}
                      <div className="flex items-center gap-1 text-white/40 text-xs">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span>{dateStr}</span>
                        <span className="text-white/25">·</span>
                        <span>{timeStr}</span>
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-4">
                      <div className="flex items-center gap-3">
                        {((req as any).currentPhoto || req.customerPhoto) ? (
                          <img src={(req as any).currentPhoto || req.customerPhoto} alt="" className="w-12 h-12 rounded-full object-cover border border-white/20" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                            <User className="w-6 h-6 text-white/40" />
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-white">{req.customerName || "Sem nome"}</p>
                          <p className="text-white/50 text-sm flex items-center gap-1.5 flex-wrap">
                            {(req as any).currentPhone || req.customerPhone}
                            {((req as any).currentPhone || req.customerPhone) && (
                              <a
                                href={`https://wa.me/55${((req as any).currentPhone || req.customerPhone).replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#25D366] hover:text-[#1ebe5a] transition-colors flex items-center gap-0.5"
                                title="Abrir WhatsApp"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              </a>
                            )}
                            {req.customerEmail && <span>· {req.customerEmail}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="bg-black/30 rounded-xl p-3 space-y-1">
                        <p className="text-white/40 text-xs font-bold uppercase mb-2">Dados enviados</p>
                        {Object.entries(dataObj).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-sm">
                            <span className="text-white/50 min-w-[140px]">{k}:</span>
                            <span className="text-white font-medium">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                      {!isPending && req.adminResponse && (
                        <div className="bg-green-950/30 border border-green-500/20 rounded-xl p-3">
                          <p className="text-green-400 text-xs font-bold mb-1">✅ Resposta enviada</p>
                          <p className="text-white/80 text-sm whitespace-pre-wrap">{req.adminResponse}</p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-white/60 text-xs font-bold uppercase">Sua resposta</label>
                        <textarea
                          className="w-full bg-black/40 border border-white/20 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-orange-500/60"
                          rows={3}
                          placeholder="Digite a resposta para o cliente..."
                          value={responseText[req.id] ?? (req.adminResponse || "")}
                          onChange={e => setResponseText(prev => ({ ...prev, [req.id]: e.target.value }))}
                        />
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1" disabled={sendingReq === req.id} onClick={() => handleRespond(req, "none")}>
                            <Check className="w-3.5 h-3.5" />Salvar
                          </Button>
                          {req.customerPhone && (
                            <Button size="sm" className="bg-[#25D366] hover:bg-[#1ebe5a] text-white flex items-center gap-1" disabled={sendingReq === req.id} onClick={() => handleRespond(req, "whatsapp")}>
                              <MessageCircle className="w-3.5 h-3.5" />Enviar WhatsApp
                            </Button>
                          )}
                          {req.customerEmail && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1" disabled={sendingReq === req.id} onClick={() => handleRespond(req, "email")}>
                              <Mail className="w-3.5 h-3.5" />Enviar E-mail
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* ── UPLOAD DE ARQUIVO DE RESPOSTA ── */}
                      <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                        <label className="text-white/60 text-xs font-bold uppercase flex items-center gap-1">
                          <File className="w-3.5 h-3.5" /> Enviar Arquivo ao Cliente
                        </label>

                        {/* Arquivo já enviado */}
                        {getFileUrl(req) && (
                          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 flex items-center gap-3">
                            <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-indigo-300 text-xs font-bold truncate">{getFileName(req) || "Arquivo enviado"}</p>
                              <a href={getFileUrl(req)} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-xs underline hover:text-indigo-300">Abrir / Visualizar</a>
                            </div>
                            <button
                              className="text-white/40 hover:text-white/70 text-xs"
                              onClick={() => {
                                const input = document.getElementById(`file-input-${req.id}`) as HTMLInputElement;
                                if (input) { input.value = ""; input.click(); }
                              }}
                            >Trocar</button>
                          </div>
                        )}

                        {/* Input de upload */}
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`file-input-${req.id}`}
                            className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-white/70 text-xs transition-colors"
                          >
                            {uploadingFile === req.id ? (
                              <><span className="animate-spin">⏳</span> Enviando...</>
                            ) : (
                              <><File className="w-3.5 h-3.5" /> {getFileUrl(req) ? "Trocar arquivo" : "Selecionar arquivo (PDF, imagem...)"}  </>
                            )}
                          </label>
                          <input
                            id={`file-input-${req.id}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                            className="hidden"
                            disabled={uploadingFile === req.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(req, file);
                            }}
                          />
                        </div>

                        {/* Botões de envio do link do arquivo */}
                        {getFileUrl(req) && (
                          <div className="flex gap-2 flex-wrap">
                            {req.customerPhone && (
                              <Button
                                size="sm"
                                className="bg-[#25D366] hover:bg-[#1ebe5a] text-white flex items-center gap-1"
                                onClick={() => handleSendFileViaWhatsApp(req)}
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Enviar Link WhatsApp
                              </Button>
                            )}
                            {req.customerEmail && (
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                                disabled={sendingReq === req.id}
                                onClick={() => handleSendFileViaEmail(req)}
                              >
                                <Mail className="w-3.5 h-3.5" /> Enviar Link E-mail
                              </Button>
                            )}
                            <a
                              href={getFileUrl(req)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-md text-white/70 text-xs transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Abrir Arquivo
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── ABA: GERENCIAR FORMULÁRIOS ── */}
        {tab === "forms" && (
          <div className="space-y-4">
            <div className="flex gap-2 justify-between flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white/60 hover:text-white text-xs"
                onClick={() => {
                  if (!confirm("Inicializar campos padrão nos formulários fixos? Só afeta formulários sem campos configurados.")) return;
                  initBuiltinMutation.mutate();
                }}
                disabled={initBuiltinMutation.isPending}
              >
                <Settings className="w-3.5 h-3.5 mr-1" />
                Inicializar Campos Fixos
              </Button>
              <Button
                onClick={() => setShowNewForm(!showNewForm)}
                className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Novo Formulário
              </Button>
            </div>

            {/* Form de criação */}
            {showNewForm && (
              <div className="bg-orange-950/30 border border-orange-500/30 rounded-2xl p-4 space-y-3">
                <p className="text-orange-300 font-bold text-sm">Novo Formulário</p>
                <Input placeholder="Título (ex: Consulta CNPJ)" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="bg-black/40 border-white/20 text-white" />
                <div className="flex gap-2">
                  <button onClick={() => setNewType("link")} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${newType === "link" ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/60"}`}>
                    <Link2 className="w-4 h-4 inline mr-1" />Link Direto
                  </button>
                  <button onClick={() => setNewType("consultation")} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${newType === "consultation" ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/20 text-white/60"}`}>
                    <FileSearch className="w-4 h-4 inline mr-1" />Consulta (formulário)
                  </button>
                </div>
                {newType === "link" && (
                  <Input placeholder="URL de destino (ex: https://wa.me/55...)" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="bg-black/40 border-white/20 text-white" />
                )}
                {newType === "consultation" && (
                  <p className="text-white/40 text-xs bg-black/30 rounded-xl p-3">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    Após criar, clique em "Editar Campos" para configurar as perguntas do formulário.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleCreateForm} disabled={createFormMutation.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                    <Check className="w-4 h-4 mr-1" /> Criar
                  </Button>
                  <Button variant="outline" onClick={() => { setShowNewForm(false); resetNewForm(); }} className="border-white/20 text-white/60">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Lista de formulários */}
            {formsQuery.isLoading && <p className="text-white/50 text-center py-4">Carregando...</p>}
            {forms.map(form => (
              <FormCard
                key={form.id}
                form={form}
                onToggle={(active) => updateFormMutation.mutate({ id: form.id, isActive: active ? 1 : 0 })}
                onDelete={() => {
                  if (!confirm(`Excluir "${form.title}"?`)) return;
                  deleteFormMutation.mutate({ id: form.id });
                }}
                onSaveUrl={(url) => updateFormMutation.mutate({ id: form.id, redirectUrl: url })}
                onEditFields={() => setEditingFormId(form.id)}
                onSaveTitle={(title) => updateFormMutation.mutate({ id: form.id, title })}
                onChangeType={(type) => updateFormMutation.mutate({ id: form.id, type })}
                onSaveIcon={(icon) => updateFormMutation.mutate({ id: form.id, icon })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componente: card de formulário ───────────────────────────────────────
function FormCard({
  form, onToggle, onDelete, onSaveUrl, onEditFields, onSaveTitle, onChangeType, onSaveIcon,
}: {
  form: ConsultaForm;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
  onSaveUrl: (url: string) => void;
  onEditFields: () => void;
  onSaveTitle: (title: string) => void;
  onChangeType: (type: "consultation" | "link") => void;
  onSaveIcon: (icon: string) => void;
}) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlVal, setUrlVal] = useState(form.redirectUrl ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(form.title ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [iconVal, setIconVal] = useState(form.icon ?? "Search");

  const isBuiltin = form.isBuiltin === 1;
  const isActive = form.isActive === 1;
  const isLink = form.type === "link";

  // Contar campos configurados
  let fieldCount = 0;
  try {
    const rows: FormRow[] = JSON.parse(form.fields || "[]");
    if (Array.isArray(rows)) {
      fieldCount = rows.reduce((acc, r) => acc + (Array.isArray(r.fields) ? r.fields.length : 0), 0);
    }
  } catch {}

  return (
    <div className={`bg-white/5 border rounded-2xl p-4 space-y-3 ${isActive ? "border-white/15" : "border-white/5 opacity-60"}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-600/20 flex items-center justify-center flex-shrink-0">
          <DynIcon name={form.icon} className="w-5 h-5 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingTitle ? (
              <div className="flex items-center gap-1">
                <input
                  value={titleVal}
                  onChange={e => setTitleVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { onSaveTitle(titleVal); setEditingTitle(false); } if (e.key === 'Escape') setEditingTitle(false); }}
                  autoFocus
                  className="bg-black/40 border border-orange-500/50 rounded px-2 py-0.5 text-white text-sm font-bold outline-none w-40"
                />
                <button onClick={() => { onSaveTitle(titleVal); setEditingTitle(false); }} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingTitle(false)} className="text-white/40 hover:text-white/70"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => { setTitleVal(form.title ?? ''); setEditingTitle(true); }} className="font-bold text-white text-sm hover:text-orange-300 transition-colors text-left">{form.title}</button>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isLink ? "bg-blue-500/20 text-blue-300" : "bg-orange-500/20 text-orange-300"}`}>
              {isLink ? "🔗 Link" : "📋 Consulta"}
            </span>
            {isBuiltin && <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/40">Fixo</span>}
            {!isLink && fieldCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">{fieldCount} campo{fieldCount !== 1 ? "s" : ""}</span>
            )}
          </div>
          {isLink && !editingUrl && (
            <p className="text-white/40 text-xs truncate mt-0.5">{form.redirectUrl || "Sem link definido"}</p>
          )}
          {!isLink && fieldCount === 0 && (
            <p className="text-orange-400/60 text-xs mt-0.5">⚠ Sem campos configurados — clique em "Editar Campos"</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isLink && (
            <button onClick={onEditFields} className="text-white/40 hover:text-orange-400 transition-colors" title="Editar campos">
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {isLink && (
            <button onClick={() => setEditingUrl(!editingUrl)} className="text-white/40 hover:text-white transition-colors">
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => onToggle(!isActive)} className="text-white/40 hover:text-white transition-colors">
            {isActive ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
          </button>
          {!isBuiltin && (
            <button onClick={onDelete} className="text-white/40 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Edição de URL */}
      {editingUrl && isLink && (
        <div className="flex gap-2">
          <Input value={urlVal} onChange={e => setUrlVal(e.target.value)} placeholder="https://wa.me/55..." className="bg-black/40 border-white/20 text-white text-sm" />
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { onSaveUrl(urlVal); setEditingUrl(false); }}>
            <Check className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" className="border-white/20 text-white/60" onClick={() => setEditingUrl(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Botão editar campos para consultas */}
      {!isLink && (
        <button
          onClick={onEditFields}
          className="w-full py-2 rounded-xl border border-dashed border-orange-500/30 text-orange-400/70 hover:bg-orange-600/10 hover:text-orange-300 text-xs font-bold transition-all flex items-center justify-center gap-2"
        >
          <Settings className="w-3.5 h-3.5" />
          {fieldCount > 0 ? "Editar Campos do Formulário" : "Configurar Campos do Formulário"}
        </button>
      )}

      {/* Painel avançado: tipo, ícone, URL */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full py-1.5 rounded-xl border border-dashed border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 text-xs transition-all flex items-center justify-center gap-1"
      >
        <Settings className="w-3 h-3" />
        {showAdvanced ? "Fechar opções avançadas" : "Opções avançadas (tipo, ícone)"}
      </button>

      {showAdvanced && (
        <div className="bg-black/30 rounded-xl p-3 space-y-3 border border-white/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => onChangeType(e.target.value as "consultation" | "link")}
                className="w-full bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2"
              >
                <option value="consultation">📋 Formulário</option>
                <option value="link">🔗 Link externo</option>
              </select>
            </div>
            <div>
              <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">Ícone</label>
              <div className="flex gap-1">
                <input
                  value={iconVal}
                  onChange={e => setIconVal(e.target.value)}
                  placeholder="Ex: Car, Scale..."
                  className="flex-1 bg-black/40 border border-white/20 text-white text-xs h-8 rounded-md px-2 outline-none focus:border-orange-500/60"
                />
                <button
                  onClick={() => onSaveIcon(iconVal)}
                  className="px-2 h-8 rounded-md bg-orange-600/30 text-orange-400 hover:bg-orange-600/50 text-xs"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          {form.type === "link" && (
            <div>
              <label className="text-white/40 text-[10px] font-bold uppercase block mb-1">URL de Destino</label>
              <div className="flex gap-1">
                <Input
                  value={urlVal}
                  onChange={e => setUrlVal(e.target.value)}
                  placeholder="https://wa.me/55..."
                  className="bg-black/40 border-white/20 text-white text-xs h-8"
                />
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8 px-2" onClick={() => { onSaveUrl(urlVal); }}>
                  <Check className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
