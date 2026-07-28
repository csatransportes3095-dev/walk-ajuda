import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, ChevronUp, ChevronDown, Eye, EyeOff, HelpCircle, Palette, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function AdminFaq() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.faq.getAdmin.useQuery();
  const config = data?.config;
  const items = data?.items ?? [];

  // Config editing state
  const [editingConfig, setEditingConfig] = useState(false);
  const [cfgTitle, setCfgTitle] = useState("");
  const [cfgSubtitle, setCfgSubtitle] = useState("");
  const [cfgButtonLabel, setCfgButtonLabel] = useState("");
  const [cfgButtonColor, setCfgButtonColor] = useState("#8b5cf6");
  const [cfgButtonTextColor, setCfgButtonTextColor] = useState("#ffffff");
  const [cfgHeaderColor, setCfgHeaderColor] = useState("#1e1b4b");
  const [cfgHeaderTextColor, setCfgHeaderTextColor] = useState("#ffffff");
  const [cfgAccentColor, setCfgAccentColor] = useState("#8b5cf6");

  // New item state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  // Edit item state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");

  const updateConfigMut = trpc.faq.updateConfig.useMutation({
    onSuccess: () => { utils.faq.getAdmin.invalidate(); toast.success("Configuração salva!"); setEditingConfig(false); },
    onError: () => toast.error("Erro ao salvar configuração"),
  });

  const createItemMut = trpc.faq.createItem.useMutation({
    onSuccess: () => { utils.faq.getAdmin.invalidate(); setNewQuestion(""); setNewAnswer(""); setShowNewForm(false); toast.success("Pergunta criada!"); },
    onError: () => toast.error("Erro ao criar pergunta"),
  });

  const updateItemMut = trpc.faq.updateItem.useMutation({
    onSuccess: () => { utils.faq.getAdmin.invalidate(); setEditingId(null); toast.success("Pergunta atualizada!"); },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const deleteItemMut = trpc.faq.deleteItem.useMutation({
    onSuccess: () => { utils.faq.getAdmin.invalidate(); toast.success("Pergunta excluída!"); },
    onError: () => toast.error("Erro ao excluir"),
  });

  const reorderMut = trpc.faq.reorder.useMutation({
    onSuccess: () => utils.faq.getAdmin.invalidate(),
  });

  function startEditConfig() {
    if (!config) return;
    setCfgTitle(config.title);
    setCfgSubtitle(config.subtitle ?? "");
    setCfgButtonLabel(config.buttonLabel);
    setCfgButtonColor(config.buttonColor);
    setCfgButtonTextColor(config.buttonTextColor);
    setCfgHeaderColor(config.headerColor);
    setCfgHeaderTextColor(config.headerTextColor);
    setCfgAccentColor(config.accentColor);
    setEditingConfig(true);
  }

  function saveConfig() {
    updateConfigMut.mutate({
      title: cfgTitle,
      subtitle: cfgSubtitle || null,
      buttonLabel: cfgButtonLabel,
      buttonColor: cfgButtonColor,
      buttonTextColor: cfgButtonTextColor,
      headerColor: cfgHeaderColor,
      headerTextColor: cfgHeaderTextColor,
      accentColor: cfgAccentColor,
    });
  }

  function startEditItem(item: typeof items[0]) {
    setEditingId(item.id);
    setEditQuestion(item.question);
    setEditAnswer(item.answer);
  }

  function saveEditItem(id: number) {
    updateItemMut.mutate({ id, question: editQuestion, answer: editAnswer });
  }

  function toggleItem(id: number, enabled: number) {
    updateItemMut.mutate({ id, enabled: enabled === 1 ? 0 : 1 });
  }

  function moveItem(index: number, dir: -1 | 1) {
    const newItems = [...items];
    const target = index + dir;
    if (target < 0 || target >= newItems.length) return;
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    const reordered = newItems.map((item, i) => ({ id: item.id, order: i + 1 }));
    reorderMut.mutate({ items: reordered });
  }

  function toggleFaqEnabled() {
    updateConfigMut.mutate({ enabled: config?.enabled === 1 ? 0 : 1 });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/admin")} className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <HelpCircle size={20} className="text-purple-400" />
        <h1 className="text-lg font-bold flex-1">Caixa de Ajuda (FAQ)</h1>
        <button
          onClick={toggleFaqEnabled}
          className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${config?.enabled === 1 ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-gray-700 text-gray-400 border border-gray-600"}`}
        >
          {config?.enabled === 1 ? "✓ Ativo" : "✗ Inativo"}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Configuração Visual */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-purple-400" />
              <span className="font-semibold text-sm">Configuração Visual</span>
            </div>
            {!editingConfig && (
              <button onClick={startEditConfig} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <Edit2 size={13} /> Editar
              </button>
            )}
          </div>

          {editingConfig ? (
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Título do modal</label>
                <Input value={cfgTitle} onChange={e => setCfgTitle(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="Tire suas dúvidas antes de finalizar seu pedido" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Subtítulo (opcional)</label>
                <Input value={cfgSubtitle} onChange={e => setCfgSubtitle(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="Confira as perguntas mais frequentes..." />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Texto do botão</label>
                <Input value={cfgButtonLabel} onChange={e => setCfgButtonLabel(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="Tire suas dúvidas" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Cor do botão</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfgButtonColor} onChange={e => setCfgButtonColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={cfgButtonColor} onChange={e => setCfgButtonColor(e.target.value)} className="bg-gray-800 border-gray-700 text-white text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Texto do botão</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfgButtonTextColor} onChange={e => setCfgButtonTextColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={cfgButtonTextColor} onChange={e => setCfgButtonTextColor(e.target.value)} className="bg-gray-800 border-gray-700 text-white text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Cor do cabeçalho</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfgHeaderColor} onChange={e => setCfgHeaderColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={cfgHeaderColor} onChange={e => setCfgHeaderColor(e.target.value)} className="bg-gray-800 border-gray-700 text-white text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Texto do cabeçalho</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfgHeaderTextColor} onChange={e => setCfgHeaderTextColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={cfgHeaderTextColor} onChange={e => setCfgHeaderTextColor(e.target.value)} className="bg-gray-800 border-gray-700 text-white text-xs" />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Cor de destaque (perguntas)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfgAccentColor} onChange={e => setCfgAccentColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={cfgAccentColor} onChange={e => setCfgAccentColor(e.target.value)} className="bg-gray-800 border-gray-700 text-white text-xs" />
                  </div>
                </div>
              </div>

              {/* Preview do botão */}
              <div className="mt-2">
                <label className="text-xs text-gray-400 mb-2 block">Preview do botão:</label>
                <button
                  style={{ backgroundColor: cfgButtonColor, color: cfgButtonTextColor }}
                  className="px-5 py-2 rounded-lg font-semibold text-sm"
                >
                  ❓ {cfgButtonLabel}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={saveConfig} disabled={updateConfigMut.isPending} className="bg-green-600 hover:bg-green-700 text-white flex-1">
                  <Check size={14} className="mr-1" /> Salvar
                </Button>
                <Button onClick={() => setEditingConfig(false)} variant="outline" className="border-gray-600 text-gray-300">
                  <X size={14} className="mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Título</span>
                <span className="text-sm text-white max-w-xs text-right">{config?.title}</span>
              </div>
              {config?.subtitle && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Subtítulo</span>
                  <span className="text-sm text-gray-300 max-w-xs text-right">{config.subtitle}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Botão</span>
                <button
                  style={{ backgroundColor: config?.buttonColor, color: config?.buttonTextColor }}
                  className="px-4 py-1.5 rounded-lg font-semibold text-sm"
                >
                  ❓ {config?.buttonLabel}
                </button>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded" style={{ backgroundColor: config?.headerColor }} />
                  <span className="text-xs text-gray-400">Cabeçalho</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded" style={{ backgroundColor: config?.accentColor }} />
                  <span className="text-xs text-gray-400">Destaque</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista de Perguntas */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-blue-400" />
              <span className="font-semibold text-sm">Perguntas e Respostas</span>
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{items.length}</span>
            </div>
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Plus size={13} /> Nova pergunta
            </button>
          </div>

          {/* Formulário nova pergunta */}
          {showNewForm && (
            <div className="p-4 border-b border-gray-800 bg-gray-800/50 space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Pergunta</label>
                <Input
                  value={newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white"
                  placeholder="Ex: Quanto tempo leva para ficar pronto?"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Resposta</label>
                <Textarea
                  value={newAnswer}
                  onChange={e => setNewAnswer(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white resize-none"
                  rows={3}
                  placeholder="Ex: O prazo é de 3 a 5 dias úteis após o envio dos documentos."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createItemMut.mutate({ question: newQuestion, answer: newAnswer })}
                  disabled={!newQuestion.trim() || !newAnswer.trim() || createItemMut.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white flex-1"
                >
                  <Check size={14} className="mr-1" /> Adicionar
                </Button>
                <Button onClick={() => { setShowNewForm(false); setNewQuestion(""); setNewAnswer(""); }} variant="outline" className="border-gray-600 text-gray-300">
                  <X size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* Lista de itens */}
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <HelpCircle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma pergunta cadastrada ainda.</p>
              <p className="text-xs mt-1">Clique em "Nova pergunta" para começar.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {items.map((item, index) => (
                <div key={item.id} className={`p-4 ${item.enabled === 0 ? "opacity-50" : ""}`}>
                  {editingId === item.id ? (
                    <div className="space-y-3">
                      <Input
                        value={editQuestion}
                        onChange={e => setEditQuestion(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      <Textarea
                        value={editAnswer}
                        onChange={e => setEditAnswer(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button onClick={() => saveEditItem(item.id)} disabled={updateItemMut.isPending} className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 h-auto">
                          <Check size={12} className="mr-1" /> Salvar
                        </Button>
                        <Button onClick={() => setEditingId(null)} variant="outline" className="border-gray-600 text-gray-300 text-xs px-3 py-1.5 h-auto">
                          <X size={12} /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button onClick={() => moveItem(index, -1)} disabled={index === 0} className="text-gray-600 hover:text-gray-300 disabled:opacity-20">
                          <ChevronUp size={14} />
                        </button>
                        <button onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} className="text-gray-600 hover:text-gray-300 disabled:opacity-20">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white mb-1">{item.question}</p>
                        <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-start gap-1 shrink-0">
                        <button onClick={() => toggleItem(item.id, item.enabled)} className={`p-1.5 rounded transition-colors ${item.enabled === 1 ? "text-green-400 hover:text-green-300" : "text-gray-600 hover:text-gray-400"}`} title={item.enabled === 1 ? "Desativar" : "Ativar"}>
                          {item.enabled === 1 ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button onClick={() => startEditItem(item)} className="p-1.5 rounded text-blue-400 hover:text-blue-300 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => { if (confirm("Excluir esta pergunta?")) deleteItemMut.mutate({ id: item.id }); }} className="p-1.5 rounded text-red-400 hover:text-red-300 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview do modal */}
        {items.filter(i => i.enabled === 1).length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <span className="font-semibold text-sm text-gray-300">Preview do Modal (como o cliente vê)</span>
            </div>
            <div className="p-4">
              <div className="rounded-xl overflow-hidden border border-gray-700 max-w-sm mx-auto">
                <div className="p-4" style={{ backgroundColor: config?.headerColor ?? "#1e1b4b" }}>
                  <h3 className="font-bold text-base" style={{ color: config?.headerTextColor ?? "#ffffff" }}>{config?.title}</h3>
                  {config?.subtitle && <p className="text-xs mt-1 opacity-80" style={{ color: config?.headerTextColor ?? "#ffffff" }}>{config.subtitle}</p>}
                </div>
                <div className="bg-gray-800 divide-y divide-gray-700">
                  {items.filter(i => i.enabled === 1).slice(0, 3).map(item => (
                    <div key={item.id} className="p-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: config?.accentColor ?? "#8b5cf6" }}>❓ {item.question}</p>
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                    </div>
                  ))}
                  {items.filter(i => i.enabled === 1).length > 3 && (
                    <div className="p-2 text-center text-xs text-gray-500">+ {items.filter(i => i.enabled === 1).length - 3} mais perguntas...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
