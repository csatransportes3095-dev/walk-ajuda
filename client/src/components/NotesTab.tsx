import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Check, X, ImageIcon, Loader2, Maximize2 } from "lucide-react";

interface NotesTabProps {
  registrationId: number;
}

// Regex para detectar marcadores de imagem no texto: [img:URL]
const IMG_MARKER_RE = /\[img:(https?:\/\/[^\]]+)\]/g;

/** Renderiza o conteúdo de uma nota, substituindo [img:URL] por <img> com botão expandir */
function NoteContent({
  content,
  onExpand,
}: {
  content: string;
  onExpand: (url: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(IMG_MARKER_RE.source, "g");

  while ((match = re.exec(content)) !== null) {
    // Texto antes da imagem
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {content.slice(lastIndex, match.index)}
        </span>
      );
    }
    const url = match[1];
    parts.push(
      <span key={`img-${match.index}`} className="inline-block relative group my-1">
        <img
          src={url}
          alt="imagem da nota"
          className="max-w-full max-h-48 rounded-lg border border-border object-contain cursor-pointer"
          onClick={() => onExpand(url)}
        />
        <button
          type="button"
          onClick={() => onExpand(url)}
          className="absolute top-1 right-1 p-1 bg-black/60 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          title="Expandir imagem"
        >
          <Maximize2 className="w-3.5 h-3.5 text-white" />
        </button>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  // Texto restante
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-end`} className="whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>
    );
  }

  return <div className="text-sm text-foreground leading-relaxed">{parts}</div>;
}

export function NotesTab({ registrationId }: NotesTabProps) {
  const utils = trpc.useUtils();

  const blocksQuery = trpc.orderNotes.getAll.useQuery(
    { registrationId },
    { staleTime: 0, refetchOnWindowFocus: false }
  );

  const createBlockMut = trpc.orderNotes.createBlock.useMutation({
    onSuccess: () => { utils.orderNotes.getAll.invalidate({ registrationId }); },
    onError: () => toast.error("Erro ao criar bloco"),
  });

  const saveBlockMut = trpc.orderNotes.saveBlock.useMutation({
    onSuccess: () => {
      toast.success("Anotação salva!");
      utils.orderNotes.getAll.invalidate({ registrationId });
    },
    onError: () => toast.error("Erro ao salvar anotação"),
  });

  const renameBlockMut = trpc.orderNotes.renameBlock.useMutation({
    onSuccess: () => { utils.orderNotes.getAll.invalidate({ registrationId }); },
    onError: () => toast.error("Erro ao renomear bloco"),
  });

  const deleteBlockMut = trpc.orderNotes.deleteBlock.useMutation({
    onSuccess: () => {
      toast.success("Bloco removido!");
      utils.orderNotes.getAll.invalidate({ registrationId });
    },
    onError: () => toast.error("Erro ao remover bloco"),
  });

  // Estado local: texto editado por bloco (id -> texto)
  const [localTexts, setLocalTexts] = useState<Record<number, string>>({});
  // Uploading state por bloco
  const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set());
  // Estado de renomear
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Confirmação de deletar
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Imagem expandida
  const [expandedImg, setExpandedImg] = useState<string | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const blocks = blocksQuery.data ?? [];

  const handleAddBlock = async () => {
    const nextNum = blocks.length + 1;
    await createBlockMut.mutateAsync({
      registrationId,
      blockName: `Bloco ${nextNum}`,
      content: "",
    });
  };

  const handleSave = (id: number, content: string) => {
    if (!content.trim()) return;
    saveBlockMut.mutate({ id, content });
  };

  const handleStartRename = (id: number, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const handleConfirmRename = (id: number) => {
    if (renameValue.trim()) {
      renameBlockMut.mutate({ id, blockName: renameValue.trim() });
    }
    setRenamingId(null);
  };

  const handleDeleteBlock = (id: number) => {
    if (confirmDeleteId === id) {
      deleteBlockMut.mutate({ id });
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  /** Faz upload de uma imagem (File ou Blob) e retorna a URL */
  const uploadImage = useCallback(async (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const mimeType = file instanceof File ? file.type : "image/png";
          const res = await fetch("/api/upload/client-file-base64", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: "nota-admin",
              phone: "admin",
              data: dataUrl,
              mimeType,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.fileUrl) throw new Error(json.error || "Erro no upload");
          resolve(json.fileUrl);
        } catch (err: any) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }, []);

  /** Handler de paste no textarea */
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>, blockId: number) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return; // paste de texto normal — deixa o padrão acontecer

      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (!blob) return;

      setUploadingIds((prev) => new Set(prev).add(blockId));
      try {
        const url = await uploadImage(blob);
        // Insere marcador [img:URL] no cursor ou no final do texto
        setLocalTexts((prev) => {
          const current = prev[blockId] ?? (blocks.find((b) => b.id === blockId)?.content ?? "");
          const textarea = e.target as HTMLTextAreaElement;
          const start = textarea.selectionStart ?? current.length;
          const end = textarea.selectionEnd ?? current.length;
          const marker = `[img:${url}]`;
          const newText = current.slice(0, start) + (start > 0 && current[start - 1] !== "\n" ? "\n" : "") + marker + "\n" + current.slice(end);
          return { ...prev, [blockId]: newText };
        });
        toast.success("Imagem colada com sucesso!");
      } catch (err: any) {
        toast.error("Erro ao fazer upload da imagem: " + (err?.message || ""));
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
      }
    },
    [uploadImage, blocks]
  );

  if (blocksQuery.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Cabeçalho com título e botão de novo bloco */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            🔒 ANOTAÇÕES INTERNAS — VISÍVEL APENAS PARA O ADMIN
          </p>
          <button
            type="button"
            onClick={handleAddBlock}
            disabled={createBlockMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 border border-primary/40 text-primary rounded-lg text-xs font-semibold hover:bg-primary/30 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {createBlockMut.isPending ? "Criando..." : "Novo Bloco"}
          </button>
        </div>

        {/* Lista de blocos */}
        {blocks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground/50 text-sm border border-dashed border-border rounded-xl">
            <p className="mb-2">Nenhuma anotação ainda.</p>
            <button
              type="button"
              onClick={handleAddBlock}
              disabled={createBlockMut.isPending}
              className="text-primary text-xs font-semibold hover:underline"
            >
              Criar primeiro bloco
            </button>
          </div>
        ) : (
          blocks.map((block) => {
            const localText = localTexts[block.id] ?? block.content;
            const isDirty = localText !== block.content;
            const isRenaming = renamingId === block.id;
            const isConfirmDelete = confirmDeleteId === block.id;
            const isUploading = uploadingIds.has(block.id);

            // Verifica se o conteúdo tem imagens para mostrar preview
            const hasImages = IMG_MARKER_RE.test(localText);
            // Reset regex lastIndex
            IMG_MARKER_RE.lastIndex = 0;

            return (
              <div
                key={block.id}
                className="border border-border rounded-xl overflow-hidden bg-muted/10"
              >
                {/* Cabeçalho do bloco */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border">
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleConfirmRename(block.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 min-w-0 bg-background border border-primary/50 rounded-md px-2 py-0.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        maxLength={100}
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmRename(block.id)}
                        className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-foreground flex-1 min-w-0 truncate">
                        {block.blockName}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartRename(block.id, block.blockName)}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        title="Renomear bloco"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(block.id)}
                        disabled={deleteBlockMut.isPending}
                        className={`p-1 transition-colors flex-shrink-0 ${
                          isConfirmDelete
                            ? "text-red-400 animate-pulse"
                            : "text-muted-foreground hover:text-red-400"
                        }`}
                        title={isConfirmDelete ? "Clique novamente para confirmar exclusão" : "Deletar bloco"}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>

                {/* Corpo do bloco */}
                <div className="p-3 space-y-2">
                  {/* Preview de imagens (se houver) */}
                  {hasImages && (
                    <div className="p-2 bg-muted/20 border border-border rounded-lg">
                      <NoteContent content={localText} onExpand={setExpandedImg} />
                    </div>
                  )}

                  {/* Textarea */}
                  <div className="relative">
                    <textarea
                      rows={5}
                      value={localText}
                      onChange={e => setLocalTexts(prev => ({ ...prev, [block.id]: e.target.value }))}
                      onPaste={e => handlePaste(e, block.id)}
                      placeholder="Escreva aqui ou cole uma imagem (Ctrl+V)..."
                      disabled={isUploading}
                      className="w-full bg-muted/30 border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                    />
                    {isUploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
                        <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Enviando imagem...
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dica de paste */}
                  <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Cole imagens diretamente com Ctrl+V
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {block.updatedAt
                        ? `Atualizado: ${new Date(block.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSave(block.id, localText)}
                      disabled={saveBlockMut.isPending || !localText.trim() || isUploading}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isDirty
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted/30 border border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {saveBlockMut.isPending ? "Salvando..." : isDirty ? "Salvar Anotação ●" : "Salvar Anotação"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de imagem expandida */}
      {expandedImg && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setExpandedImg(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImg(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={expandedImg}
            alt="imagem expandida"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
