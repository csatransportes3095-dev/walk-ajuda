import { z } from "zod";
import { H2_AUTO_SHORT_TREE } from "./h2AutoShortReplies";

/**
 * Wire format supported by H2 AUTO Android 1.21+.
 * Keep field names and limits aligned with android-overrides/FlowTree.java.
 */
export const H2_AUTO_DEFAULT_FOOTER = "⌨️ Digite a opção.\n🔙 *0* volta | *MENU* início.";

const idSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, "Use letras minúsculas, números, - ou _.");
const answerSchema = z.object({
  key: z.string().regex(/^(?:[1-9]|10)$/, "Escolha uma opção de 1 a 10."),
  label: z.string().trim().min(1).max(160),
  next: idSchema,
}).strict();
const stageSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1).max(1800),
  mode: z.enum(["question", "end", "human", "order", "referral"]),
  options: z.array(answerSchema).max(10),
}).strict();

export const h2AutoTreeSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  start: idSchema,
  footer: z.string().max(400, "Rodapé com até 400 caracteres.").optional(),
  nodes: z.array(stageSchema).min(1).max(100),
}).strict().superRefine((tree, ctx) => {
  const ids = new Set<string>();
  for (const [i, node] of tree.nodes.entries()) {
    if (ids.has(node.id)) {
      ctx.addIssue({ code: "custom", path: ["nodes", i, "id"], message: "Identificador repetido." });
    }
    ids.add(node.id);
    if (node.mode !== "question" && node.options.length > 0) {
      ctx.addIssue({ code: "custom", path: ["nodes", i, "options"], message: "Etapas finais não podem ter opções." });
    }
    const keys = new Set<string>();
    for (const [j, answer] of node.options.entries()) {
      if (keys.has(answer.key)) {
        ctx.addIssue({ code: "custom", path: ["nodes", i, "options", j, "key"], message: "Número da resposta duplicado nesta pergunta." });
      }
      keys.add(answer.key);
    }
  }
  if (!ids.has(tree.start)) {
    ctx.addIssue({ code: "custom", path: ["start"], message: "Pergunta inicial não encontrada." });
  }
  for (const [i, node] of tree.nodes.entries()) {
    for (const [j, answer] of node.options.entries()) {
      if (!ids.has(answer.next)) {
        ctx.addIssue({ code: "custom", path: ["nodes", i, "options", j, "next"], message: "A pergunta de destino não existe." });
      }
    }
  }
});

export type H2AutoTree = z.infer<typeof h2AutoTreeSchema>;
export type H2AutoTreeNode = H2AutoTree["nodes"][number];
export type H2AutoTreeOption = H2AutoTreeNode["options"][number];

export const H2_AUTO_TREE_DEFAULT: H2AutoTree = {
  version: 1,
  enabled: true,
  start: "inicio",
  footer: H2_AUTO_DEFAULT_FOOTER,
  nodes: [
    { id: "inicio", mode: "question", text: H2_AUTO_SHORT_TREE.inicio,
      options: [
        { key: "1", label: "SIM — Já sou cliente", next: "clientes" },
        { key: "2", label: "NÃO — Ainda não sou cliente", next: "novos" },
      ] },
    { id: "clientes", mode: "question", text: H2_AUTO_SHORT_TREE.clientes,
      options: [
        { key: "1", label: "Acompanhar pedido", next: "acompanhar" },
        { key: "2", label: "Agendar foto", next: "foto" },
        { key: "3", label: "Controle de corridas", next: "corridas" },
        { key: "4", label: "Empréstimos", next: "emprestimos" },
        { key: "5", label: "Falar com atendente", next: "atendente" },
        { key: "6", label: "Ajuda e outros serviços", next: "ajuda" },
      ] },
    { id: "novos", mode: "question", text: H2_AUTO_SHORT_TREE.novos,
      options: [
        { key: "1", label: "Fazer primeiro pedido", next: "indicador" },
        { key: "2", label: "Consultar valores", next: "valores" },
        { key: "3", label: "Como funciona", next: "ajuda" },
        { key: "4", label: "Falar com atendente", next: "atendente" },
      ] },
    { id: "indicador", mode: "question", text: H2_AUTO_SHORT_TREE.indicador,
      options: [
        { key: "1", label: "SIM — Tenho indicador", next: "pedido_novo" },
        { key: "2", label: "NÃO — Não tenho indicador", next: "sem_indicador" },
      ] },
    { id: "pedido_novo", mode: "end", text: H2_AUTO_SHORT_TREE.pedido_novo, options: [] },
    { id: "sem_indicador", mode: "end", text: H2_AUTO_SHORT_TREE.sem_indicador, options: [] },
    { id: "acompanhar", mode: "order", text: H2_AUTO_SHORT_TREE.acompanhar, options: [] },
    { id: "foto", mode: "end", text: H2_AUTO_SHORT_TREE.foto, options: [] },
    { id: "corridas", mode: "end", text: H2_AUTO_SHORT_TREE.corridas, options: [] },
    { id: "emprestimos", mode: "end", text: H2_AUTO_SHORT_TREE.emprestimos, options: [] },
    { id: "valores", mode: "end", text: H2_AUTO_SHORT_TREE.valores, options: [] },
    { id: "ajuda", mode: "end", text: H2_AUTO_SHORT_TREE.ajuda, options: [] },
    { id: "atendente", mode: "human", text: H2_AUTO_SHORT_TREE.atendente, options: [] },
  ],
};

export function cloneH2AutoTree(tree: H2AutoTree = H2_AUTO_TREE_DEFAULT): H2AutoTree {
  return structuredClone(tree);
}

/** Produces exactly the menu numbers that the APK shows to WhatsApp clients. */
export function renderH2AutoNode(node: H2AutoTreeNode, footer: string = H2_AUTO_DEFAULT_FOOTER): string {
  const symbols: Record<string, string> = { "1": "1️⃣", "2": "2️⃣", "3": "3️⃣", "4": "4️⃣", "5": "5️⃣", "6": "6️⃣", "7": "7️⃣", "8": "8️⃣", "9": "9️⃣", "10": "🔟" };
  const options = node.options.map(o => (symbols[o.key] || o.key) + " " + o.label).join("\n");
  return [node.text.trim(), options,
    node.options.length ? footer : ""]
    .filter(Boolean).join("\n\n");
}
