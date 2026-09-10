import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`[raffle-profile-update-gate] ${label}: esperado 1 bloco, encontrado ${count}`);
  }
  return source.replace(oldText, newText);
}

// -----------------------------------------------------------------------------
// BACKEND: a mesma regra central de atualizacao obrigatoria passa a fazer parte
// da elegibilidade do sorteio. A protecao fica no servidor, nao apenas na tela.
// -----------------------------------------------------------------------------
const routersFile = 'server/routers.ts';
let routers = fs.readFileSync(routersFile, 'utf8');

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

routers = replaceOnce(
  routers,
`        const raffle = await getRaffleById(input.raffleId);
        if (!raffle || raffle.status !== "open") return { success: false, error: "Sorteio não está aberto" };
        // Verificar limite de números por pessoa`,
`        const raffle = await getRaffleById(input.raffleId);
        if (!raffle || raffle.status !== "open") return { success: false, error: "Sorteio não está aberto" };

        // Elegibilidade real do sorteio: somente cliente cadastrado e com o
        // cadastro completo pode reservar numero. Esta verificacao no servidor
        // impede contorno manual da interface.
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

fs.writeFileSync(routersFile, routers, 'utf8');

// -----------------------------------------------------------------------------
// FRONTEND DO SORTEIO: manifesto padrao + CTA para /atualizarcadastro.
// -----------------------------------------------------------------------------
const raffleFile = 'client/src/pages/Raffle.tsx';
let raffle = fs.readFileSync(raffleFile, 'utf8');

raffle = replaceOnce(
  raffle,
  'import { Gift, Lock, Trophy, Users, Ticket, CheckCircle2, Star, Phone, User, RefreshCw, Hash, LogOut } from "lucide-react";',
  'import { Gift, Lock, Trophy, Users, Ticket, CheckCircle2, Star, Phone, User, RefreshCw, Hash, LogOut, AlertTriangle } from "lucide-react";',
  'icone de atualizacao obrigatoria',
);

raffle = replaceOnce(
  raffle,
  '  const isPhoneRegistered = phoneDigits.length === 11 ? (phoneCheckData?.exists ?? null) : null;',
  `  const isPhoneRegistered = phoneDigits.length === 11 ? (phoneCheckData?.exists ?? null) : null;
  const needsProfileUpdate = isPhoneRegistered === true && Boolean((phoneCheckData as any)?.profileUpdatePending);`,
  'estado de cadastro pendente',
);

raffle = replaceOnce(
  raffle,
`  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || phone.replace(/\\D/g, "").length < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }
    // Verificar se o cliente tem CPF cadastrado`,
`  const goToUpdateCadastro = () => {
    const cleanPhone = phone.replace(/\\D/g, "");
    if (cleanPhone) localStorage.setItem("customer_update_phone_hint", cleanPhone);
    sessionStorage.setItem("h2_customer_return_to", "/sorteio");
    window.location.assign("/atualizarcadastro");
  };

  const handleChooseNumber = async () => {
    if (!activeRaffle || !selectedNumber) return;
    if (!name.trim()) { toast.error("Digite seu nome"); return; }
    if (!phone.trim() || phone.replace(/\\D/g, "").length < 11) { toast.error("Digite um telefone válido com DDD (11 dígitos)"); return; }
    if (needsProfileUpdate) {
      toast.error("Atualização de cadastro necessária. Atualize seu cadastro antes de participar do sorteio.");
      return;
    }
    // Verificar se o cliente tem CPF cadastrado`,
  'bloqueio antes da confirmacao no frontend',
);

raffle = replaceOnce(
  raffle,
`                    isPhoneRegistered === true ? 'border-green-500/60 focus:border-green-500' :
                    isPhoneRegistered === false ? 'border-red-500/60 focus:border-red-500' :`,
`                    needsProfileUpdate ? 'border-amber-500/70 focus:border-amber-500' :
                    isPhoneRegistered === true ? 'border-green-500/60 focus:border-green-500' :
                    isPhoneRegistered === false ? 'border-red-500/60 focus:border-red-500' :`,
  'telefone pendente nao fica verde',
);

raffle = replaceOnce(
  raffle,
`                    {phoneCheckLoading ? (
                      <RefreshCw className="w-4 h-4 text-white/40 animate-spin" />
                    ) : isPhoneRegistered === true ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />`,
`                    {phoneCheckLoading ? (
                      <RefreshCw className="w-4 h-4 text-white/40 animate-spin" />
                    ) : needsProfileUpdate ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : isPhoneRegistered === true ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />`,
  'icone de telefone pendente',
);

raffle = replaceOnce(
  raffle,
`              {/* Mensagem de cliente confirmado */}
              {isPhoneRegistered === true && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-green-300 text-xs font-semibold">Cliente cadastrado — você pode participar!</p>
                </div>
              )}`,
`              {/* Manifesto de atualizacao obrigatoria */}
              {needsProfileUpdate && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-amber-300">Atualização de cadastro necessária</p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/75">Seu cadastro possui dados obrigatórios pendentes. Para participar do sorteio, conclua a atualização primeiro.</p>
                    <button
                      type="button"
                      onClick={goToUpdateCadastro}
                      className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-400/25"
                    >
                      ATUALIZAR CADASTRO
                    </button>
                  </div>
                </div>
              )}
              {/* Mensagem de cliente confirmado */}
              {isPhoneRegistered === true && !needsProfileUpdate && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <p className="text-green-300 text-xs font-semibold">Cliente cadastrado — você pode participar!</p>
                </div>
              )}`,
  'manifesto de atualizacao no lugar da liberacao verde',
);

raffle = replaceOnce(
  raffle,
  '              disabled={!selectedNumber || !name.trim() || !phone.trim() || submitting || isPhoneRegistered === false || (phoneDigits.length === 11 && isPhoneRegistered === null)}',
  '              disabled={!selectedNumber || !name.trim() || !phone.trim() || submitting || needsProfileUpdate || isPhoneRegistered === false || (phoneDigits.length === 11 && isPhoneRegistered === null)}',
  'bloquear botao confirmar',
);

raffle = replaceOnce(
  raffle,
  '              {submitting ? "Confirmando..." : selectedNumber ? `CONFIRMAR NÚMERO ${selectedNumber}` : "SELECIONE UM NÚMERO"}',
  '              {submitting ? "Confirmando..." : needsProfileUpdate ? "ATUALIZE O CADASTRO PARA PARTICIPAR" : selectedNumber ? `CONFIRMAR NÚMERO ${selectedNumber}` : "SELECIONE UM NÚMERO"}',
  'texto do botao quando bloqueado',
);

fs.writeFileSync(raffleFile, raffle, 'utf8');

// -----------------------------------------------------------------------------
// /atualizarcadastro: recebe o telefone do sorteio e volta para ele ao concluir.
// -----------------------------------------------------------------------------
const updateFile = 'client/src/pages/AtualizarCadastro.tsx';
let updatePage = fs.readFileSync(updateFile, 'utf8');

updatePage = replaceOnce(
  updatePage,
  '  if (["/", "/login", "/acompanhar", "/gastos", "/emprestimo"].includes(raw)) return raw;',
  '  if (["/", "/login", "/acompanhar", "/gastos", "/emprestimo", "/sorteio"].includes(raw)) return raw;',
  'permitir retorno ao sorteio',
);

updatePage = replaceOnce(
  updatePage,
  '  const [phone, setPhone] = useState("");',
  `  const [phone, setPhone] = useState(() => {
    if (typeof window === "undefined") return "";
    return formatPhone(localStorage.getItem("customer_update_phone_hint") || "");
  });`,
  'preencher telefone vindo do sorteio',
);

fs.writeFileSync(updateFile, updatePage, 'utf8');

console.log('[raffle-profile-update-gate] OK: cadastro pendente bloqueia sorteio no frontend e backend; manifesto envia para /atualizarcadastro.');
