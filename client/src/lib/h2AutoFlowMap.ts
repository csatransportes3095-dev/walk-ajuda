import type { H2AutoTree, H2AutoTreeNode, H2AutoTreeOption } from "@shared/h2AutoTree";

export type FlowRow = {
  id: string;
  depth: number;
  viaKey: string | null;
  viaLabel: string | null;
  shared: boolean;
  parentId: string | null;
};

export type FlowPathStep = {
  id: string;
  key: string | null;
  label: string | null;
};

const byId = (tree: H2AutoTree) => new Map(tree.nodes.map(node => [node.id, node]));

/** The WhatsApp menu number, not creation time, determines display order. */
export function orderedFlowOptions(options: readonly H2AutoTreeOption[]): H2AutoTreeOption[] {
  return [...options].sort((a, b) => Number(a.key) - Number(b.key));
}

/** Persist the same numbering sequence that is shown in the ADM. */
export function normalizeFlowTreeOptions(tree: H2AutoTree): H2AutoTree {
  return {
    ...tree,
    nodes: tree.nodes.map(node => ({
      ...node,
      options: orderedFlowOptions(node.options),
    })),
  };
}

/** Visible, human-readable labels. Technical IDs remain stable for the Android protocol. */
export function flowTitle(node: H2AutoTreeNode, startId: string): string {
  if (node.id === startId) return "INÍCIO DO ATENDIMENTO";
  const lines = node.text.split(/\r?\n/).map(line =>
    line.replace(/\*/g, "").replace(/_/g, "").trim()
  ).filter(Boolean);
  const title = lines.find(line => !/^(?:⚡\s*)?H2 COLOMBIANO\b/i.test(line)
    && !/CENTRAL DE ATENDIMENTO/i.test(line));
  return (title || lines[0] || "ETAPA SEM TÍTULO").slice(0, 95);
}

/** Depth-first outline for the ADM: each option is shown under its parent.
 * Shared nodes or cycles appear as links rather than recursing forever.
 */
export function flowRows(tree: H2AutoTree, folded: ReadonlySet<string> = new Set()): FlowRow[] {
  const nodes = byId(tree);
  const seen = new Set<string>();
  const rows: FlowRow[] = [];
  function visit(id: string, depth: number, key: string | null, label: string | null, parentId: string | null) {
    const current = nodes.get(id);
    if (!current || rows.length >= 250) return;
    const shared = seen.has(id);
    rows.push({ id, depth, viaKey: key, viaLabel: label, shared, parentId });
    if (shared || depth >= 100 || folded.has(id)) return;
    seen.add(id);
    for (const option of orderedFlowOptions(current.options)) visit(option.next, depth + 1, option.key, option.label, id);
  }
  visit(tree.start, 0, null, null, null);
  return rows;
}

/** Root-to-stage path using breadth-first search so shared steps have one clear location. */
export function flowPath(tree: H2AutoTree, target: string): FlowPathStep[] {
  const nodes = byId(tree);
  if (!nodes.has(target) || !nodes.has(tree.start)) return [];
  const queue: Array<{ id: string; path: FlowPathStep[] }> = [
    { id: tree.start, path: [{ id: tree.start, key: null, label: null }] },
  ];
  const visited = new Set<string>([tree.start]);
  for (let index = 0; index < queue.length; index++) {
    const next = queue[index];
    if (next.id === target) return next.path;
    const current = nodes.get(next.id);
    if (!current) continue;
    for (const option of orderedFlowOptions(current.options)) {
      if (!nodes.has(option.next) || visited.has(option.next)) continue;
      visited.add(option.next);
      queue.push({
        id: option.next,
        path: [...next.path, { id: option.next, key: option.key, label: option.label }],
      });
    }
  }
  return [];
}

export function unlinkedStages(tree: H2AutoTree): H2AutoTreeNode[] {
  const nodes = byId(tree);
  const reachable = new Set<string>();
  const queue = [tree.start];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const option of nodes.get(id)?.options || [])
      if (!reachable.has(option.next)) queue.push(option.next);
  }
  return tree.nodes.filter(node => !reachable.has(node.id));
}

export function availableOptionKey(options: readonly H2AutoTreeOption[]): string | null {
  const used = new Set(options.map(o => o.key));
  for (let i = 1; i <= 10; i++) {
    if (!used.has(String(i))) return String(i);
  }
  return null;
}

/** Reorder the displayed answers AND their numbers (prevents "2" above "1"). */
export function moveFlowOption(options: readonly H2AutoTreeOption[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= options.length || to >= options.length) return options.slice();
  const next = options.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((option, index) => ({ ...option, key: String(index + 1) }));
}

export function removeFlowOption(options: readonly H2AutoTreeOption[], index: number) {
  return options.filter((_option, i) => index !== i)
    .map((option, i) => ({ ...option, key: String(i + 1) }));
}

/** Creates a connected stage, not an orphan appended to the end of a flat list. */
export function addConnectedStage(tree: H2AutoTree, parentId: string, id: string): H2AutoTree {
  const parent = tree.nodes.find(node => node.id === parentId);
  if (!parent || parent.mode !== "question" || tree.nodes.some(node => node.id === id))
    throw new Error("Etapa pai ou identificador inválido.");
  const key = availableOptionKey(parent.options);
  if (!key || tree.nodes.length >= 100) throw new Error("Limite de perguntas ou respostas atingido.");
  return {
    ...tree,
    nodes: [
      ...tree.nodes.map(node => node.id !== parentId ? node : {
        ...node,
        options: orderedFlowOptions([...node.options, { key, label: "Nova resposta", next: id }]),
      }),
      { id, text: "📋 *NOVA PERGUNTA*\n\nEscreva aqui a pergunta para o cliente.", mode: "question", options: [] },
    ],
  };
}
