import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[raffle-profile-update-gate] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  return source.replace(oldText, newText);
}

// BACKEND
const routersFile = 'server/routers.ts';
let routers = fs.readFileSync(routersFile, 'utf8');

if (!routers.includes('profileUpdatePending: profileUpdateState?.pending === true')) {
  routers = replaceOnce(
    routers,
    '        return { exists: !!customer, customer, hasOrders };',
    `        const profileUpdateState = customer ? await getCustomerProfileUpdateState(customer) : null;
        return {
          exists: !!customer,
          customer,
          hasOrders,
          profileUpdatePending: profileUpdateState?.pending === true,
          profileUpdateMissingFields: profileUpdateState?.missingFields || [],
        };`,
    'expor pendencia de atualizacao no checkByPhone',
  );
}

if (!routers.includes('const raffleProfileUpdateState = await getCustomerProfileUpdateState(raffleCustomer);')) {
  routers = replaceOnce(
    routers,
`        const raffle = await getRaffleById(input.raffleId);
        if (!raffle || raffle.status !== "open") return { success: false, error: "Sorteio não está aberto" };
        // Verificar limite de números por pessoa`,
`        const raffle = await getRaffleById(input.raffleId);
        if (!raffle || raffle.status !== "open") return { success: false, error: "Sorteio não está aberto" };

        const raffleCustomer = await getCustomerByPhone(input.customerPhone);
        if (!raffleCustomer) {
          return { success: false, error: "Este número não está cadastrado. O sorteio é exclusivo para clientes cadastrados." };
        }
        if (Number((raffleCustomer as any).blocked) === 1) {
          return { success: false, error: "Cadastro bloqueado. Fale com o atendimento." };
        }
        const raffleProfileUpdateState = await getCustomerProfileUpdateState(raffleCustomer);
        if (raffleProfileUpdateState.pending) {
          return { success: false, error: "Atualização de cadastro necessária. Atualize seu cadastro antes de participar do sorteio." };
        }

        // Verificar limite de números por pessoa`,
    'bloqueio backend antes de reservar numero',
  );
}

fs.writeFileSync(routersFile, routers, 'utf8');

// FRONTEND
const raffleFile = 'client/src/pages/Raffle.tsx';
let raffle = fs.readFileSync(raffleFile, 'utf8');

if (!raffle.includes('AlertTriangle')) {
  const importLine = raffle.split('\n').find(line => line.includes('from "lucide-react"') && line.includes('Gift'));
  if (!importLine) throw new Error('[raffle-profile-update-gate] import lucide do sorteio nao encontrado');
  const updatedImport = importLine.replace(' } from "lucide-react";', ', AlertTriangle } from "lucide-react";');
  raffle = raffle.replace(importLine, updatedImport);
}

if (!raffle.includes('const needsProfileUpdate =')) {
  raffle = replaceOnce(
    raffle,
    '  const isPhoneRegistered = phoneDigits.length === 11 ? (phoneCheckData?.exists ?? null) : null;',
    `  const isPhoneRegistered = phoneDigits.length === 11 ? (phoneCheckData?.exists ?? null) : null;
  const needsProfileUpdate = isPhoneRegistered === true && Boolean((phoneCheckData as any)?.profileUpdatePending);`,
    'estado de cadastro pendente',
  );
}

if (!raffle.includes('const goToUpdateCadastro = () =>')) {
  const legacyBlock = `  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || phone.replace(/\\D/g, "").length < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }`;
  const normalizedBlock = `  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || phoneDigits.length < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }`;
  const target = raffle.includes(normalizedBlock) ? normalizedBlock : legacyBlock;
  const replacement = `  const goToUpdateCadastro = () => {
    const cleanPhone = typeof phoneDigits === "string" ? phoneDigits : phone.replace(/\\D/g, "");
    if (cleanPhone) localStorage.setItem("customer_update_phone_hint", cleanPhone);
    sessionStorage.setItem("h2_customer_return_to", "/sorteio");
    window.location.assign("/atualizarcadastro");
  };

  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || (typeof phoneDigits === "string" ? phoneDigits.length : phone.replace(/\\D/g, "").length) < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }
    if (needsProfileUpdate) {
      toast.error("Atualização de cadastro necessária. Atualize seu cadastro antes de participar do sorteio.");
      return;
    }`;
  raffle = replaceOnce(raffle, target, replacement, 'bloqueio antes da confirmacao no frontend');
}

// Layout novo: mensagem/CTA de atualização no painel lateral.
if (!raffle.includes('ATUALIZAR CADASTRO')) {
  const target = `                {isPhoneRegistered === false && <p className="mt-2 text-xs text-red-300">Telefone não cadastrado no sistema.</p>}
                {isPhoneRegistered === true && <p className="mt-2 text-xs text-emerald-300">Cliente confirmado.</p>}`;
  const replacement = `                {isPhoneRegistered === false && <p className="mt-2 text-xs text-red-300">Telefone não cadastrado no sistema.</p>}
                {needsProfileUpdate && (
                  <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                      <div>
                        <p className="text-xs font-black text-amber-300">Atualização de cadastro necessária</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-100/70">Conclua os dados obrigatórios antes de participar.</p>
                        <button type="button" onClick={goToUpdateCadastro} className="mt-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-[11px] font-black text-amber-200">
                          ATUALIZAR CADASTRO
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {isPhoneRegistered === true && !needsProfileUpdate && <p className="mt-2 text-xs text-emerald-300">Cliente confirmado.</p>}`;
  raffle = replaceOnce(raffle, target, replacement, 'manifesto de atualizacao no layout novo');
}

raffle = raffle.replace(
  'disabled={!selectedNumber || !name.trim() || !phone.trim() || submitting || isPhoneRegistered === false || (phoneDigits.length === 11 && isPhoneRegistered === null)}',
  'disabled={!selectedNumber || !name.trim() || !phone.trim() || submitting || needsProfileUpdate || isPhoneRegistered === false || (phoneDigits.length === 11 && isPhoneRegistered === null)}',
);

fs.writeFileSync(raffleFile, raffle, 'utf8');

// Atualizar cadastro
const updateFile = 'client/src/pages/AtualizarCadastro.tsx';
let updatePage = fs.readFileSync(updateFile, 'utf8');
if (!updatePage.includes('"/sorteio"')) {
  updatePage = replaceOnce(
    updatePage,
    '  if (["/", "/login", "/acompanhar", "/gastos", "/emprestimo"].includes(raw)) return raw;',
    '  if (["/", "/login", "/acompanhar", "/gastos", "/emprestimo", "/sorteio"].includes(raw)) return raw;',
    'permitir retorno ao sorteio',
  );
}
if (!updatePage.includes('customer_update_phone_hint')) {
  updatePage = replaceOnce(
    updatePage,
    '  const [phone, setPhone] = useState("");',
    `  const [phone, setPhone] = useState(() => {
    if (typeof window === "undefined") return "";
    return formatPhone(localStorage.getItem("customer_update_phone_hint") || "");
  });`,
    'preencher telefone vindo do sorteio',
  );
}
fs.writeFileSync(updateFile, updatePage, 'utf8');

console.log('[raffle-profile-update-gate] OK: compatível com layout novo; cadastro pendente continua bloqueando sorteio no frontend e backend.');
