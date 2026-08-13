import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, KeyRound, LogOut, Package, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";

const ENTRY_TOKEN_KEY = "walk_online_entry_token";
function fileToBase64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }

type Props = { onBack: () => void; onOpenCadastro: () => void };

export function OnlineEntryPanel({ onBack, onOpenCadastro }: Props) {
  const [token, setToken] = useState(() => localStorage.getItem(ENTRY_TOKEN_KEY) || "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [passwordSetupPhone, setPasswordSetupPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordCreatedPending, setPasswordCreatedPending] = useState(false);
  const sessionQ = trpc.onlineSupport.entrySession.useQuery({ token }, { enabled: !!token, retry: false, refetchInterval: token ? 10000 : false });
  const loginMut = trpc.customerPassword.login.useMutation();
  const passwordStatusMut = trpc.customerPassword.checkStatusMutation.useMutation();
  const passwordModeQ = trpc.customerPassword.getMode.useQuery(undefined, { enabled: !!passwordSetupPhone, retry: false });
  const createPasswordAutoMut = trpc.customerPassword.clientCreateAuto.useMutation();
  const createPasswordManualMut = trpc.customerPassword.clientCreateManual.useMutation();
  const ordersQ = trpc.onlineSupport.entryOrders.useQuery({ token }, { enabled: !!token && !!sessionQ.data?.authenticated, retry: false });
  const orderDetailsQ = trpc.onlineSupport.entryOrderDetails.useQuery(
    { token, registrationId: selectedOrderId || 0 },
    { enabled: !!token && !!selectedOrderId && !!sessionQ.data?.authenticated && !!sessionQ.data?.access && (!sessionQ.data.access.restricted || sessionQ.data.access.routes.includes('acompanhar')), retry: false }
  );
  const loansQ = trpc.onlineSupport.entryLoans.useQuery({ token }, { enabled: !!token && !!sessionQ.data?.authenticated && !!sessionQ.data?.access && (!sessionQ.data.access.restricted || sessionQ.data.access.routes.includes('emprestimo')), retry: false });
  const installmentsQ = trpc.onlineSupport.entryLoanInstallments.useQuery({ token, loanId: selectedLoanId || 0 }, { enabled: !!token && !!selectedLoanId && !!sessionQ.data?.authenticated && !!sessionQ.data?.access && (!sessionQ.data.access.restricted || sessionQ.data.access.routes.includes('emprestimo')), retry: false });
  const logoutMut = trpc.customerPassword.logout.useMutation();
  const routeMut = trpc.onlineSupport.entryRequestRoute.useMutation();
  const proofMut = trpc.onlineSupport.entrySubmitInstallmentProof.useMutation();

  useEffect(() => {
    if (sessionQ.data && !sessionQ.data.authenticated) {
      localStorage.removeItem(ENTRY_TOKEN_KEY);
      setToken("");
    }
  }, [sessionQ.data]);

  const openPasswordSetup = (resolvedPhone?: string) => {
    const cleanPhone = (resolvedPhone || phone).replace(/\D/g, "");
    if (!cleanPhone) { setError('Informe seu telefone para criar uma nova senha.'); return; }
    setPasswordSetupPhone(cleanPhone);
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordCreatedPending(false);
    setError("");
  };

  const inspectPasswordStatus = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) return;
    try {
      const result = await passwordStatusMut.mutateAsync({ phone: cleanPhone });
      if (result.status === 'no_password') openPasswordSetup(result.phone);
    } catch { /* A validação final continua protegida pelo endpoint de login. */ }
  };

  const createNewPassword = async () => {
    if (newPassword.length < 4) { setError('Crie uma senha com pelo menos 4 caracteres.'); return; }
    if (newPassword !== confirmNewPassword) { setError('As senhas não coincidem.'); return; }
    try {
      setError("");
      const phoneForPassword = passwordSetupPhone.replace(/\D/g, "");
      if (passwordModeQ.data?.mode === 'auto') {
        const result = await createPasswordAutoMut.mutateAsync({ phone: phoneForPassword, password: newPassword });
        if (!result.success || !result.token) { setError('Não foi possível criar a nova senha.'); return; }
        localStorage.setItem(ENTRY_TOKEN_KEY, result.token);
        localStorage.setItem('cp_token', result.token);
        setToken(result.token);
        setPassword("");
        setPasswordSetupPhone("");
        return;
      }
      const result = await createPasswordManualMut.mutateAsync({ phone: phoneForPassword, password: newPassword });
      if (!result.success) { setError('Não foi possível solicitar a nova senha.'); return; }
      setPasswordCreatedPending(true);
    } catch (e: any) { setError(e?.message || 'Não foi possível criar a nova senha.'); }
  };

  const login = async () => {
    setError("");
    const result = await loginMut.mutateAsync({ phone: phone.replace(/\D/g, ""), password });
    if (!result.success || !result.token) {
      if (result.error === 'no_password') { openPasswordSetup(); return; }
      setError(result.error === 'wrong_password' ? 'Senha incorreta.' : result.error === 'pending_approval' ? 'Sua senha está aguardando liberação do administrador.' : result.error === 'expired' ? 'Sua senha venceu. Crie uma nova senha.' : 'Não foi possível entrar.');
      if (result.error === 'expired') openPasswordSetup();
      return;
    }
    localStorage.setItem(ENTRY_TOKEN_KEY, result.token);
    // /acompanhar usa a mesma autenticação oficial; reutiliza o token, sem pedir senha novamente.
    localStorage.setItem('cp_token', result.token);
    setToken(result.token);
    setPassword("");
  };

  const logout = async () => {
    if (token) await logoutMut.mutate({ token });
    localStorage.removeItem(ENTRY_TOKEN_KEY);
    localStorage.removeItem('cp_token');
    setToken("");
  };

  type RouteName = 'site' | 'acompanhar' | 'gastos' | 'emprestimo';
  const hasRouteAccess = (route: RouteName) => {
    const access = sessionQ.data?.access;
    return !!access && (!access.restricted || access.routes.includes(route));
  };
  const routeState = (route: RouteName) => sessionQ.data?.routeStates?.[route] || {
    allowed: hasRouteAccess(route), pending: false, denied: false, retryAtMs: null, daysRemaining: 0,
  };
  const routeLabel = (route: RouteName, allowedLabel: string) => {
    const state = routeState(route);
    if (state.allowed) return allowedLabel;
    if (state.pending) return 'Solicitação em análise';
    if (state.denied && state.daysRemaining > 0) {
      const date = state.retryAtMs ? new Date(state.retryAtMs).toLocaleDateString('pt-BR') : '';
      return `Solicitar novamente em ${date}`;
    }
    return 'Solicitar acesso';
  };
  const canRequestRoute = (route: RouteName) => {
    const state = routeState(route);
    return state.allowed || (!state.pending && !(state.denied && state.daysRemaining > 0));
  };
  const routeButtonStyle = (route: RouteName): React.CSSProperties => {
    const state = routeState(route);
    if (state.allowed) return { ...routeBaseStyle, color: '#dcfce7', background: 'rgba(22,163,74,.18)', border: '1px solid rgba(34,197,94,.72)' };
    if (state.pending) return { ...routeBaseStyle, color: '#fef3c7', background: 'rgba(217,119,6,.16)', border: '1px solid rgba(245,158,11,.68)', cursor: 'not-allowed' };
    if (state.denied && state.daysRemaining > 0) return { ...routeBaseStyle, color: '#fecaca', background: 'rgba(185,28,28,.13)', border: '1px solid rgba(248,113,113,.62)', cursor: 'not-allowed' };
    return { ...routeBaseStyle, color: '#fee2e2', background: 'rgba(185,28,28,.18)', border: '1px solid rgba(248,113,113,.72)' };
  };
  const openRoute = (route: Exclude<RouteName, 'acompanhar'>) => {
    window.location.href = route === 'gastos' ? '/gastos' : route === 'emprestimo' ? '/emprestimo' : '/login';
  };
  const openOrderTrackingInBot = async () => {
    setError('');
    const result = await ordersQ.refetch();
    const firstOrder = result.data?.[0];
    if (!firstOrder?.registrationId) {
      setError('Nenhum pedido encontrado para este cadastro.');
      return;
    }
    setSelectedOrderId(Number(firstOrder.registrationId));
  };
  const requestRoute = async (route: RouteName) => {
    try {
      setError('');
      const state = routeState(route);
      if (state.allowed) {
        if (route === 'acompanhar') await openOrderTrackingInBot();
        else openRoute(route);
        return;
      }
      if (state.pending) { setError('Sua solicitação já está em análise pelo administrador.'); return; }
      if (state.denied && state.daysRemaining > 0) {
        const date = state.retryAtMs ? new Date(state.retryAtMs).toLocaleDateString('pt-BR') : '';
        setError(`Sua solicitação foi reprovada. Você poderá solicitar novamente em ${date}.`);
        return;
      }
      const result = await routeMut.mutateAsync({ token, route });
      await sessionQ.refetch();
      if (result.released) {
        if (route === 'acompanhar') await openOrderTrackingInBot();
        else openRoute(route);
        return;
      }
      if (result.cooldown && result.retryAtMs) {
        setError(`Sua solicitação foi reprovada. Você poderá solicitar novamente em ${new Date(result.retryAtMs).toLocaleDateString('pt-BR')}.`);
        return;
      }
      setError('Solicitação enviada ao administrador. Você será avisado após a liberação.');
    } catch (e: any) { setError(e?.message || 'Não foi possível solicitar o acesso.'); }
  };

  const sendProof = async (installmentId: number, file: File) => {
    try { setError(''); const fileBase64 = await fileToBase64(file); await proofMut.mutateAsync({ token, installmentId, fileBase64, fileName: file.name, mimeType: file.type || 'application/octet-stream' }); await installmentsQ.refetch(); }
    catch (e: any) { setError(e?.message || 'Não foi possível enviar o comprovante.'); }
  };

  const customer = sessionQ.data?.authenticated ? sessionQ.data.customer : null;
  if (!customer && passwordSetupPhone) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <button onClick={() => { setPasswordSetupPhone(''); setError(''); }} style={backStyle}><ArrowLeft size={15} /> Voltar</button>
    <div style={cardStyle}>
      <KeyRound size={21} color="#a78bfa" />
      <h3 style={{ margin: '8px 0 4px', color: '#fff', fontSize: 16 }}>Criar nova senha de acesso</h3>
      <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,.6)', fontSize: 12, lineHeight: 1.45 }}>Seu cadastro foi localizado. Crie uma nova senha para entrar com segurança.</p>
      {passwordCreatedPending ? <div style={{ padding: 12, borderRadius: 10, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.42)', color: '#fef3c7', fontSize: 12, lineHeight: 1.45 }}><b>Senha solicitada com sucesso.</b><br />Aguarde a liberação do administrador para entrar.</div> : <>
        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova senha" type="password" style={inputStyle} />
        <input value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && createNewPassword()} placeholder="Confirmar nova senha" type="password" style={{ ...inputStyle, marginTop: 8 }} />
        {passwordModeQ.isLoading ? <p style={{ ...smallStyle, marginBottom: 0 }}>Preparando criação segura...</p> : <button disabled={createPasswordAutoMut.isPending || createPasswordManualMut.isPending || !newPassword || !confirmNewPassword} onClick={createNewPassword} style={primaryStyle}>{(createPasswordAutoMut.isPending || createPasswordManualMut.isPending) ? 'Criando senha...' : 'Criar nova senha'}</button>}
      </>}
      {error && <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: 12 }}>{error}</p>}
    </div>
  </div>;

  if (!customer) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <button onClick={onBack} style={backStyle}><ArrowLeft size={15} /> Voltar</button>
    <div style={cardStyle}>
      <KeyRound size={21} color="#a78bfa" />
      <h3 style={{ margin: '8px 0 4px', color: '#fff', fontSize: 16 }}>Entrar no meu atendimento</h3>
      <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,.6)', fontSize: 12, lineHeight: 1.45 }}>Informe seu telefone e sua senha. O bot nunca salva sua senha.</p>
      <input value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }} onBlur={inspectPasswordStatus} placeholder="Telefone com DDD" inputMode="numeric" style={inputStyle} />
      <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Senha" type="password" style={{ ...inputStyle, marginTop: 8 }} />
      {error && <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: 12 }}>{error}</p>}
      <button disabled={loginMut.isPending || !phone || !password} onClick={login} style={primaryStyle}>{loginMut.isPending ? 'Entrando...' : 'Entrar com segurança'}</button>
    </div>
    <button onClick={onOpenCadastro} style={secondaryStyle}>Ainda não tenho cadastro</button>
  </div>;

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {error && <p style={{ margin: 0, color: '#fcd34d', fontSize: 12 }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div><strong style={{ color: '#fff', fontSize: 15 }}>Olá, {customer.name}</strong><div style={{ color: '#86efac', fontSize: 11 }}>Sessão autenticada</div></div>
      <button onClick={logout} style={backStyle}><LogOut size={14} /> Sair</button>
    </div>
    <div style={cardStyle}><Package size={20} color="#60a5fa" /><strong style={{ color: '#fff', display: 'block', marginTop: 6 }}>Meus pedidos</strong>
      <p style={{ ...smallStyle, margin: '5px 0 0' }}>Solicite acesso para acompanhar seus pedidos, status e informações pelo atendimento.</p>
      {(hasRouteAccess('site') || hasRouteAccess('acompanhar')) && <>
        {ordersQ.isLoading ? <p style={smallStyle}>Consultando...</p> : ordersQ.data?.length ? ordersQ.data.map((o: any) => <button key={o.registrationId} onClick={() => setSelectedOrderId(o.registrationId)} style={{ ...rowStyle, width:'100%', border: selectedOrderId === o.registrationId ? '1px solid #60a5fa' : '1px solid transparent', cursor:'pointer', textAlign:'left' }}>Pedido #{o.orderNumber || o.registrationId}<span>{o.status || 'Sem status'}</span></button>) : <p style={smallStyle}>Nenhum pedido encontrado.</p>}
      </>}
      {selectedOrderId && hasRouteAccess('acompanhar') && <div style={{ marginTop:8 }}>
        <button onClick={() => setSelectedOrderId(null)} style={backStyle}>Fechar detalhes do pedido</button>
        {orderDetailsQ.isLoading ? <p style={smallStyle}>Consultando pedido...</p> : orderDetailsQ.data?.current ? <OrderDetails data={orderDetailsQ.data.current} /> : <p style={smallStyle}>Não foi possível carregar os detalhes.</p>}
      </div>}
      <button disabled={!canRequestRoute('acompanhar') || routeMut.isPending} onClick={() => requestRoute('acompanhar')} style={routeButtonStyle('acompanhar')}>{routeLabel('acompanhar', 'Acessar Acompanhar Pedido')}</button>
      <button disabled={!canRequestRoute('site') || routeMut.isPending} onClick={() => requestRoute('site')} style={routeButtonStyle('site')}>{routeLabel('site', 'Fazer Pedido')}</button>
    </div>
    <div style={cardStyle}><WalletCards size={20} color="#fbbf24" /><strong style={{ color: '#fff', display: 'block', marginTop: 6 }}>Empréstimos</strong>
      {hasRouteAccess('emprestimo') && <>
        {loansQ.isLoading ? <p style={smallStyle}>Consultando...</p> : loansQ.data?.loans?.length ? loansQ.data.loans.map((loan: any) => <button key={loan.id} onClick={() => setSelectedLoanId(loan.id)} style={{ ...rowStyle, border: selectedLoanId === loan.id ? '1px solid #fbbf24' : '1px solid transparent', cursor:'pointer', textAlign:'left' }}>Empréstimo #{loan.id}<span>{loan.status}</span></button>) : <p style={smallStyle}>Nenhum empréstimo encontrado.</p>}
        {selectedLoanId && <div style={{ marginTop:8 }}><button onClick={() => setSelectedLoanId(null)} style={backStyle}>Fechar parcelas</button>{installmentsQ.isLoading ? <p style={smallStyle}>Consultando parcelas...</p> : installmentsQ.data?.map((i: any) => <div key={i.id} style={{ ...rowStyle, display:'block' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>Parcela {i.installmentNumber} · R$ {i.amount}<span>{i.status} · {String(i.dueDate).slice(0,10)}</span></div>{['pendente','atrasado'].includes(String(i.status)) && <label style={{ ...secondaryStyle, display:'block', boxSizing:'border-box', textAlign:'center', marginTop:7 }}>Enviar comprovante<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) sendProof(i.id, file); }} style={{ display:'none' }} /></label>}</div>)}</div>}
      </>}
      <button disabled={!canRequestRoute('emprestimo') || routeMut.isPending} onClick={() => requestRoute('emprestimo')} style={routeButtonStyle('emprestimo')}>{routeLabel('emprestimo', 'Acessar Empréstimos')}</button>
    </div>
    <div style={cardStyle}><BarChart3 size={20} color="#22c55e" /><strong style={{ color: '#fff', display: 'block', marginTop: 6 }}>Controle de Ganhos e Gastos</strong>
      <p style={{ ...smallStyle, margin: '5px 0 0' }}>Acompanhe seus ganhos, despesas e resultados.</p>
      <button disabled={!canRequestRoute('gastos') || routeMut.isPending} onClick={() => requestRoute('gastos')} style={routeButtonStyle('gastos')}>{routeLabel('gastos', 'Acessar Controle de Gastos')}</button>
    </div>
  </div>;
}

function OrderDetails({ data }: { data: any }) {
  const answerEntries = (() => { try { const parsed = typeof data.answers === 'string' ? JSON.parse(data.answers) : data.answers; return parsed && typeof parsed === 'object' ? Object.entries(parsed).filter(([key, value]) => key && value != null && String(value).trim() !== '') : []; } catch { return []; } })();
  const info = [
    ['Número do pedido', data.orderNumber], ['Serviço', data.serviceName], ['Opção', data.serviceOption], ['Status atual', data.status], ['Previsão', data.deliveryEstimate], ['Valor pago', data.pricePaid], ['Atualização', data.createdAt],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
  return <div style={{ ...rowStyle, display:'block', marginTop:8, lineHeight:1.55 }}>
    {info.map(([label, value]) => <div key={String(label)}><b>{label}:</b> {String(value)}</div>)}
    {data.note && <div style={{ marginTop:6 }}><b>Informação do pedido:</b><br />{String(data.note)}</div>}
    {answerEntries.length > 0 && <div style={{ marginTop:6 }}><b>Dados informados no pedido:</b>{answerEntries.map(([key, value]) => <div key={key}>{key}: {String(value)}</div>)}</div>}
  </div>;
}

const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.11)', borderRadius: 14, padding: 14 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#fff', padding: '0 11px', outline: 'none' };
const primaryStyle: React.CSSProperties = { width: '100%', marginTop: 10, height: 42, border: 0, borderRadius: 10, color: '#fff', fontWeight: 800, background: 'linear-gradient(135deg,#7c3aed,#2563eb)', cursor: 'pointer' };
const secondaryStyle: React.CSSProperties = { width: '100%', marginTop: 10, minHeight: 36, borderRadius: 9, color: '#c4b5fd', fontSize: 12, fontWeight: 700, background: 'rgba(124,58,237,.12)', border: '1px solid rgba(124,58,237,.35)', cursor: 'pointer' };
const routeBaseStyle: React.CSSProperties = { width: '100%', marginTop: 10, minHeight: 38, borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const disabledStyle: React.CSSProperties = { ...secondaryStyle, color: 'rgba(255,255,255,.42)', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.10)', cursor: 'not-allowed', opacity: .8 };
const backStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,.65)', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 12, padding: 0 };
const smallStyle: React.CSSProperties = { color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '7px 0' };
const rowStyle: React.CSSProperties = { marginTop: 7, padding: '8px 9px', borderRadius: 9, display: 'flex', justifyContent: 'space-between', gap: 8, background: 'rgba(0,0,0,.2)', color: '#e5e7eb', fontSize: 12 };
