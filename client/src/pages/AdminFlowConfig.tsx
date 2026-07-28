import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Stage {
  id: number;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isActive: number;
}

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#f59e0b", "#6366f1",
  "#10b981", "#22c55e", "#ef4444", "#ec4899",
  "#f97316", "#06b6d4", "#84cc16", "#a855f7",
];

const PRESET_ICONS = [
  "📷", "📄", "🔍", "⚙️", "🚗", "✅", "❌", "📋",
  "🔔", "💼", "🏆", "⏳", "🔒", "🔓", "📱", "💬",
  "🎯", "🚀", "💡", "🔧", "📊", "📝", "🗂️", "📌",
];

export default function AdminFlowConfig() {
  const utils = trpc.useUtils();
  const { data: stages = [], isLoading } = trpc.stages.list.useQuery();

  const createMutation = trpc.stages.create.useMutation({
    onSuccess: () => {
      utils.stages.list.invalidate();
      setNewStage({ name: "", icon: "📋", color: "#6366f1" });
      setShowForm(false);
      toast.success("Etapa criada com sucesso!");
    },
    onError: () => toast.error("Erro ao criar etapa"),
  });

  const updateMutation = trpc.stages.update.useMutation({
    onSuccess: () => {
      utils.stages.list.invalidate();
      setEditingId(null);
      toast.success("Etapa atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar etapa"),
  });

  const deleteMutation = trpc.stages.delete.useMutation({
    onSuccess: () => {
      utils.stages.list.invalidate();
      toast.success("Etapa removida!");
    },
    onError: () => toast.error("Erro ao remover etapa"),
  });

  const reorderMutation = trpc.stages.reorder.useMutation({
    onError: () => toast.error("Erro ao reordenar etapas"),
  });

  const [showForm, setShowForm] = useState(false);
  const [newStage, setNewStage] = useState({ name: "", icon: "📋", color: "#6366f1" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ name: string; icon: string; color: string }>({ name: "", icon: "", color: "" });

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [localStages, setLocalStages] = useState<Stage[] | null>(null);

  const displayStages = localStages ?? stages;

  function startEdit(stage: Stage) {
    setEditingId(stage.id);
    setEditData({ name: stage.name, icon: stage.icon, color: stage.color });
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const arr = [...displayStages];
    const [moved] = arr.splice(dragIndex, 1);
    arr.splice(dropIndex, 0, moved);
    const reordered = arr.map((s, i) => ({ ...s, sortOrder: i + 1 }));
    setLocalStages(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
    reorderMutation.mutate(reordered.map(s => ({ id: s.id, sortOrder: s.sortOrder })));
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⚙️</span>
            <h1 className="text-2xl font-bold text-white">Fluxo de Atendimento</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Configure as etapas internas do seu fluxo de atendimento. Arraste para reordenar.
          </p>
        </div>

        {/* Botão Adicionar */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full mb-6 py-3 rounded-xl border-2 border-dashed border-indigo-500/40 text-indigo-400 hover:border-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/5 transition-all duration-200 font-medium flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span>
            Nova Etapa
          </button>
        )}

        {/* Formulário de nova etapa */}
        {showForm && (
          <div className="mb-6 p-5 rounded-2xl bg-[#12122a] border border-indigo-500/30">
            <h3 className="text-lg font-semibold text-indigo-300 mb-4">Nova Etapa</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nome da Etapa</label>
                <Input
                  value={newStage.name}
                  onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))}
                  placeholder="Ex: Foto Recebida, Em Análise..."
                  className="bg-[#0a0a1a] border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_ICONS.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setNewStage(s => ({ ...s, icon }))}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                        newStage.icon === icon
                          ? "bg-indigo-600 ring-2 ring-indigo-400 scale-110"
                          : "bg-[#1a1a2e] hover:bg-[#22224a]"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Ou digite:</span>
                  <Input
                    value={newStage.icon}
                    onChange={e => setNewStage(s => ({ ...s, icon: e.target.value }))}
                    placeholder="Emoji ou texto"
                    className="bg-[#0a0a1a] border-gray-700 text-white w-32 text-center text-xl"
                    maxLength={4}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewStage(s => ({ ...s, color }))}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newStage.color === color ? "ring-2 ring-white scale-110" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Personalizada:</span>
                  <input
                    type="color"
                    value={newStage.color}
                    onChange={e => setNewStage(s => ({ ...s, color: e.target.value }))}
                    className="w-10 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                  <span className="text-xs text-gray-400 font-mono">{newStage.color}</span>
                </div>
              </div>
              {/* Preview */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Preview</label>
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium text-sm"
                  style={{ backgroundColor: newStage.color + "33", border: `1.5px solid ${newStage.color}`, color: newStage.color }}
                >
                  <span className="text-lg">{newStage.icon}</span>
                  <span>{newStage.name || "Nome da Etapa"}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => createMutation.mutate(newStage)}
                  disabled={!newStage.name.trim() || createMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white flex-1"
                >
                  {createMutation.isPending ? "Salvando..." : "Criar Etapa"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowForm(false); setNewStage({ name: "", icon: "📋", color: "#6366f1" }); }}
                  className="border-gray-700 text-gray-400 hover:text-white"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de etapas */}
        {isLoading ? (
          <div className="text-center text-gray-500 py-12">Carregando etapas...</div>
        ) : displayStages.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <div className="text-4xl mb-3">⚙️</div>
            <p>Nenhuma etapa configurada ainda.</p>
            <p className="text-sm mt-1">Clique em "Nova Etapa" para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayStages.map((stage, index) => (
              <div
                key={stage.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={e => handleDragOver(e, index)}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`rounded-2xl border transition-all duration-200 ${
                  dragOverIndex === index && dragIndex !== index
                    ? "border-indigo-400 bg-indigo-500/10 scale-[1.02]"
                    : "border-gray-800 bg-[#12122a]"
                } ${dragIndex === index ? "opacity-50" : "opacity-100"}`}
              >
                {editingId === stage.id ? (
                  /* Modo de edição */
                  <div className="p-4 space-y-3">
                    <Input
                      value={editData.name}
                      onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                      className="bg-[#0a0a1a] border-gray-700 text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      {PRESET_ICONS.map(icon => (
                        <button
                          key={icon}
                          onClick={() => setEditData(d => ({ ...d, icon }))}
                          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                            editData.icon === icon ? "bg-indigo-600 ring-2 ring-indigo-400" : "bg-[#1a1a2e] hover:bg-[#22224a]"
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setEditData(d => ({ ...d, color }))}
                          className={`w-7 h-7 rounded-full transition-all ${editData.color === color ? "ring-2 ring-white scale-110" : "hover:scale-105"}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => updateMutation.mutate({ id: stage.id, ...editData })}
                        disabled={updateMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
                        size="sm"
                      >
                        Salvar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        className="border-gray-700 text-gray-400 text-sm"
                        size="sm"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Modo de visualização */
                  <div className="p-4 flex items-center gap-3">
                    {/* Handle de drag */}
                    <div className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-lg px-1">
                      ⠿
                    </div>
                    {/* Ícone colorido */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ backgroundColor: stage.color + "22", border: `1.5px solid ${stage.color}` }}
                    >
                      {stage.icon}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{stage.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="font-mono">{stage.color}</span>
                        <span className="text-gray-600">•</span>
                        <span>Ordem #{stage.sortOrder}</span>
                      </div>
                    </div>
                    {/* Ações */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => startEdit(stage)}
                        className="w-8 h-8 rounded-lg bg-[#1a1a2e] hover:bg-indigo-600/20 text-gray-400 hover:text-indigo-400 transition-all flex items-center justify-center text-sm"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remover a etapa "${stage.name}"?`)) {
                            deleteMutation.mutate({ id: stage.id });
                          }
                        }}
                        className="w-8 h-8 rounded-lg bg-[#1a1a2e] hover:bg-red-600/20 text-gray-400 hover:text-red-400 transition-all flex items-center justify-center text-sm"
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Dica de drag */}
        {displayStages.length > 1 && (
          <p className="text-center text-xs text-gray-600 mt-4">
            ⠿ Arraste os cards para reordenar as etapas
          </p>
        )}
      </div>
    </div>
  );
}
