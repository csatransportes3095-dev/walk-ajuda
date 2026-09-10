import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[status-custom-colors] ${label}: esperado 1 bloco, encontrado ${count}`);
  return source.replace(oldText, newText);
}

function replaceRegexOnce(source, regex, newText, label) {
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) throw new Error(`[status-custom-colors] ${label}: bloco esperado nao encontrado de forma unica`);
  return source.replace(regex, newText);
}

// -----------------------------------------------------------------------------
// TELA DE CONFIGURACAO DE STATUS: cor livre + HEX + duas cores 50/50.
// Usa os campos color/bgColor existentes, sem migracao de banco.
// -----------------------------------------------------------------------------
const statusFile = 'client/src/pages/AdminStatusTypes.tsx';
let statusSource = fs.readFileSync(statusFile, 'utf8');

statusSource = replaceOnce(
  statusSource,
  'import AdminHeader from "@/components/AdminHeader";\n',
  'import AdminHeader from "@/components/AdminHeader";\nimport StatusColorEditor from "@/components/StatusColorEditor";\nimport { getStatusInlineStyle, isCustomStatusBackground, parseStatusColorSelection, serializeStatusBackground, statusSelectionStyle, type StatusColorSelection } from "@/lib/statusCustomColors";\n',
  'imports da configuracao de cores',
);

statusSource = replaceRegexOnce(
  statusSource,
  /const COLOR_OPTIONS = \[[\s\S]*?\n\];\n\nconst BG_MAP: Record<string, string> = \{[\s\S]*?\n\};\n\n/,
  '',
  'remover paleta Tailwind fixa',
);

statusSource = replaceOnce(
  statusSource,
`const defaultForm: FormData = {
  key: "",
  label: "",
  color: "text-blue-400",
  icon: "Clock",
  description: "",
  sortOrder: 50,
  pulseColor: "#ffffff",
};`,
`const defaultForm: FormData = {
  key: "",
  label: "",
  color: "text-white",
  icon: "Clock",
  description: "",
  sortOrder: 50,
  pulseColor: "#ffffff",
};

const DEFAULT_STATUS_COLORS: StatusColorSelection = {
  primary: "#3b82f6",
  secondary: "#ef4444",
  split: false,
};`,
  'cores padrao livres',
);

statusSource = replaceOnce(
  statusSource,
  'onSuccess: () => { utils.statusTypes.list.invalidate(); utils.statusTypes.list.refetch(); toast.success("Status criado!"); setShowCreate(false); setForm(defaultForm); },',
  'onSuccess: () => { utils.statusTypes.list.invalidate(); utils.statusTypes.list.refetch(); toast.success("Status criado!"); setShowCreate(false); setForm(defaultForm); setCreateColors(DEFAULT_STATUS_COLORS); },',
  'reset das cores apos criar',
);

statusSource = replaceOnce(
  statusSource,
`  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);`,
`  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [createColors, setCreateColors] = useState<StatusColorSelection>(DEFAULT_STATUS_COLORS);
  const [editColors, setEditColors] = useState<StatusColorSelection>(DEFAULT_STATUS_COLORS);
  const [editingId, setEditingId] = useState<number | null>(null);`,
  'estado dos seletores de cor',
);

statusSource = replaceOnce(
  statusSource,
`  function startEdit(s: StatusType) {
    setEditingId(s.id);
    setEditForm({`,
`  function startEdit(s: StatusType) {
    setEditingId(s.id);
    setEditColors(parseStatusColorSelection(s.bgColor, s.color));
    setEditForm({`,
  'carregar cores ao editar',
);

statusSource = replaceOnce(
  statusSource,
`      color: form.color,
      bgColor: BG_MAP[form.color] || "bg-gray-500/20 border-gray-500/40",`,
`      color: "text-white",
      bgColor: serializeStatusBackground(createColors),`,
  'salvar cor livre ao criar',
);

statusSource = replaceOnce(
  statusSource,
`      color: editForm.color,
      bgColor: editForm.color ? (BG_MAP[editForm.color] || "bg-gray-500/20 border-gray-500/40") : undefined,`,
`      color: "text-white",
      bgColor: serializeStatusBackground(editColors),`,
  'salvar cor livre ao editar',
);

statusSource = replaceOnce(
  statusSource,
  '<Button onClick={() => { setShowCreate(v => !v); setForm(defaultForm); }}',
  '<Button onClick={() => { setShowCreate(v => !v); setForm(defaultForm); setCreateColors(DEFAULT_STATUS_COLORS); }}',
  'reset ao abrir novo status',
);

statusSource = replaceOnce(
  statusSource,
`              <div className="space-y-1">
                <label className="text-xs text-white/50">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={\`w-6 h-6 rounded-full border-2 transition-all \${c.preview} \${form.color === c.value ? "border-white scale-125" : "border-transparent"}\`}
                    />
                  ))}
                </div>
              </div>`,
`              <div className="space-y-1 col-span-2">
                <label className="text-xs text-white/50">Cor do status</label>
                <StatusColorEditor value={createColors} onChange={setCreateColors} />
              </div>`,
  'editor de cor na criacao',
);

statusSource = replaceOnce(
  statusSource,
`                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Cor</label>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_OPTIONS.map(c => (
                            <button
                              key={c.value}
                              title={c.label}
                              onClick={() => setEditForm(f => ({ ...f, color: c.value }))}
                              className={\`w-6 h-6 rounded-full border-2 transition-all \${c.preview} \${editForm.color === c.value ? "border-white scale-125" : "border-transparent"}\`}
                            />
                          ))}
                        </div>
                      </div>`,
`                      <div className="space-y-1 col-span-2">
                        <label className="text-xs text-white/50">Cor do status</label>
                        <StatusColorEditor value={editColors} onChange={setEditColors} />
                      </div>`,
  'editor de cor na edicao',
);

statusSource = replaceOnce(
  statusSource,
`                  <div className={\`relative inline-flex items-center justify-center w-8 h-8 rounded-full border \${form.color} \${BG_MAP[form.color] || "bg-gray-500/20 border-gray-500/40"}\`}>
                    {ICON_MAP[form.icon]}
                  </div>`,
`                  <div className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border text-white" style={statusSelectionStyle(createColors)}>
                    {ICON_MAP[form.icon]}
                  </div>`,
  'preview da criacao',
);

statusSource = replaceOnce(
  statusSource,
`                          <div className={\`relative inline-flex items-center justify-center w-8 h-8 rounded-full border \${editForm.color ?? "text-gray-400"} \${BG_MAP[editForm.color ?? ""] || "bg-gray-500/20 border-gray-500/40"}\`}>
                            {ICON_MAP[editForm.icon ?? "Clock"] ?? null}
                          </div>`,
`                          <div className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border text-white" style={statusSelectionStyle(editColors)}>
                            {ICON_MAP[editForm.icon ?? "Clock"] ?? null}
                          </div>`,
  'preview da edicao',
);

statusSource = replaceOnce(
  statusSource,
`                      <div className={\`relative w-9 h-9 rounded-xl border flex items-center justify-center \${s.color} \${s.bgColor}\`}>
                        {ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />}
                      </div>`,
`                      <div
                        className={\`relative w-9 h-9 rounded-xl border flex items-center justify-center \${isCustomStatusBackground(s.bgColor) ? "text-white" : \`${'${s.color} ${s.bgColor}'}\`}\`}
                        style={getStatusInlineStyle(s.bgColor)}
                      >
                        {ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />}
                      </div>`,
  'preview salvo do status',
);

statusSource = replaceOnce(
  statusSource,
  '<span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>',
  '<span className={`text-sm font-semibold ${isCustomStatusBackground(s.bgColor) ? "text-white" : s.color}`}>{s.label}</span>',
  'cor do nome do status',
);

fs.writeFileSync(statusFile, statusSource, 'utf8');

// -----------------------------------------------------------------------------
// ADMIN PEDIDOS: converte o valor custom:* em classes CSS reais em runtime.
// O patch anterior de fundo por status continua valendo e passa a aceitar a classe H2.
// -----------------------------------------------------------------------------
const ordersFile = 'client/src/pages/AdminOrders.tsx';
let ordersSource = fs.readFileSync(ordersFile, 'utf8');

ordersSource = replaceOnce(
  ordersSource,
  'import { getConfiguredGlobalProgressKeys, getDefaultGlobalProgressKeys } from "@shared/orderProgressSequence";\n',
  'import { getConfiguredGlobalProgressKeys, getDefaultGlobalProgressKeys } from "@shared/orderProgressSequence";\nimport { buildStatusRuntimeCss, getStatusRuntimeClasses } from "@/lib/statusCustomColors";\n',
  'import cores em AdminOrders',
);

ordersSource = replaceOnce(
  ordersSource,
  ".filter(className => className.startsWith('bg-'));",
  ".filter(className => className.startsWith('bg-') || className.startsWith('h2-status-bg-'));",
  'fundo customizado nos cards',
);

ordersSource = replaceOnce(
  ordersSource,
  '          color: s.color,\n          bg: s.bgColor,',
  '          color: getStatusRuntimeClasses(s.key, s.bgColor, s.color).color,\n          bg: getStatusRuntimeClasses(s.key, s.bgColor, s.color).bg,',
  'mapa dinamico de cores em AdminOrders',
);

ordersSource = replaceOnce(
  ordersSource,
  '    <div className="min-h-screen bg-background text-foreground">\n',
  '    <div className="min-h-screen bg-background text-foreground">\n      <style>{buildStatusRuntimeCss(dynamicStatuses as any[])}</style>\n',
  'CSS runtime em AdminOrders',
);

fs.writeFileSync(ordersFile, ordersSource, 'utf8');

// -----------------------------------------------------------------------------
// ACOMPANHAMENTO DO CLIENTE: mesma cor, inclusive metade/metade.
// -----------------------------------------------------------------------------
const trackingFile = 'client/src/pages/OrderTracking.tsx';
let trackingSource = fs.readFileSync(trackingFile, 'utf8');

trackingSource = replaceOnce(
  trackingSource,
  'import { findProgressStatusIndex, resolveProgressPosition } from "@shared/orderProgressSequence";\n',
  'import { findProgressStatusIndex, resolveProgressPosition } from "@shared/orderProgressSequence";\nimport { buildStatusRuntimeCss, getStatusRuntimeClasses } from "@/lib/statusCustomColors";\n',
  'import cores em OrderTracking',
);

trackingSource = replaceOnce(
  trackingSource,
  '        color: s.color,\n        bg: extractBg(s.bgColor),\n        border: extractBorder(s.bgColor),',
  '        color: getStatusRuntimeClasses(s.key, s.bgColor, s.color).color,\n        bg: getStatusRuntimeClasses(s.key, s.bgColor, s.color).bg,\n        border: getStatusRuntimeClasses(s.key, s.bgColor, s.color).border,',
  'mapa dinamico de cores no acompanhamento',
);

trackingSource = replaceOnce(
  trackingSource,
  '    <div className="min-h-screen bg-[#0d0d1a] text-white">\n',
  '    <div className="min-h-screen bg-[#0d0d1a] text-white">\n      <style>{buildStatusRuntimeCss(dynamicStatuses as any[])}</style>\n',
  'CSS runtime no acompanhamento',
);

fs.writeFileSync(trackingFile, trackingSource, 'utf8');

// -----------------------------------------------------------------------------
// NOVO PEDIDO: seletor e resumo acompanham as cores personalizadas.
// -----------------------------------------------------------------------------
const newOrderFile = 'client/src/pages/AdminNewOrder.tsx';
let newOrderSource = fs.readFileSync(newOrderFile, 'utf8');

newOrderSource = replaceOnce(
  newOrderSource,
  'import AdminHeader from "@/components/AdminHeader";\n',
  'import AdminHeader from "@/components/AdminHeader";\nimport { buildStatusRuntimeCss, getStatusRuntimeClasses } from "@/lib/statusCustomColors";\n',
  'import cores em AdminNewOrder',
);

newOrderSource = replaceOnce(
  newOrderSource,
  '    if (s) return { label: s.label, color: s.color, bg: s.bgColor, icon: ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />, desc: s.description ?? "" };',
  '    if (s) { const runtime = getStatusRuntimeClasses(s.key, s.bgColor, s.color); return { label: s.label, color: runtime.color, bg: runtime.bg, icon: ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />, desc: s.description ?? "" }; }',
  'mapa dinamico de cores em AdminNewOrder',
);

newOrderSource = replaceOnce(
  newOrderSource,
  '    <div className="min-h-screen bg-background text-foreground">\n      <SuccessModal />',
  '    <div className="min-h-screen bg-background text-foreground">\n      <style>{buildStatusRuntimeCss(dynamicStatuses as any[])}</style>\n      <SuccessModal />',
  'CSS runtime em AdminNewOrder',
);

fs.writeFileSync(newOrderFile, newOrderSource, 'utf8');

// -----------------------------------------------------------------------------
// COMISSOES: badge de status tambem respeita o novo visual.
// -----------------------------------------------------------------------------
const commissionsFile = 'client/src/pages/AdminCommissions.tsx';
let commissionsSource = fs.readFileSync(commissionsFile, 'utf8');

commissionsSource = replaceOnce(
  commissionsSource,
  'import { repairCommissionWhatsappMessage } from "@shared/whatsappMessageText";\n',
  'import { repairCommissionWhatsappMessage } from "@shared/whatsappMessageText";\nimport { buildStatusRuntimeCss, getStatusRuntimeClasses } from "@/lib/statusCustomColors";\n',
  'import cores em AdminCommissions',
);

commissionsSource = replaceOnce(
  commissionsSource,
  '? Object.fromEntries(dynamicStatuses.map(s => [s.key, { label: s.label, color: s.color, bg: s.bgColor }]))',
  '? Object.fromEntries(dynamicStatuses.map(s => { const runtime = getStatusRuntimeClasses(s.key, s.bgColor, s.color); return [s.key, { label: s.label, color: runtime.color, bg: runtime.bg }]; }))',
  'mapa dinamico de cores em AdminCommissions',
);

commissionsSource = replaceOnce(
  commissionsSource,
  '    <div className="min-h-screen bg-background text-foreground">\n',
  '    <div className="min-h-screen bg-background text-foreground">\n      <style>{buildStatusRuntimeCss(dynamicStatuses as any[])}</style>\n',
  'CSS runtime em AdminCommissions',
);

fs.writeFileSync(commissionsFile, commissionsSource, 'utf8');

console.log('[status-custom-colors] OK: cor livre, HEX, uma cor ou duas cores 50/50 em status, cards e acompanhamento.');
