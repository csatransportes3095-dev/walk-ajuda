import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, LogOut, Package, WalletCards } from "lucide-react";
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
  const sessionQ = trpc.onlineSupport.entrySession.useQuery({ token }, { enabled: !!token, retry: false, refetchInterval: token ? 10000 : false });
  const loginMut = trpc.customerPassword.login.useMutation();
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

  const login = async () => {
    setError("");
    const result = await loginMut.mutateAsync({ phone: phone.replace(/\D/g, ""), password });
    if (!result.success || !result.token) {
      setError(result.error === 'wrong_password' ? 'Senha incorreta.' : result.error === 'no_password' ? 'Você ainda não possui senha de acesso.' : 'Não foi possível entrar.');
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

  const hasRouteAccess = (route: 'site' | 'acompanhar' | 'gastos' | 'emprestimo') => {
    const access = sessionQ.data?.access;
    return !!access && (!access.restricted || access.routes.includes(route));
  };
  const openRoute = (route: 'site' | 'acompanhar' | 'gastos' | 'emprestimo') => {
    window.location.href = route === 'gastos' ? '/gastos' : route === 'emprestimo' ? '/emprestimo' : route === 'acompanhar' ? '/acompanhar' : '/login';
  };
  const requestRoute = async (route: 'site' | 'acompanhar' | 'gastos' | 'emprestimo') => {
    try {
      setError('');
      if (hasRouteAccess(route)) { openRoute(route); return; }
      const result = await routeMut.mutateAsync({ token, route });
      if (result.released) {
        await sessionQ.refetch();
        openRoute(route);
        return;
      }
      setError('Solicitação enviada ao administrador. Você será avisado após a liberação.');
      await sessionQ.refetch();
    } catch (e: any) { setError(e?.message || 'Não foi possível solicitar o acesso.'); }
  };

  const sendProof = async (installmentId: number, file: File) => {
    try { setError(''); const fileBase64 = await fileToBase64(file); await proofMut.mutateAsync({ token, installmentId, fileBase64, fileName: file.name, mimeType: file.type || 'application/octet-stream' }); await installmentsQ.refetch(); }
    catch (e: any) { setError(e?.message || 'Não foi possível enviar o comprovante.'); }
  };

  const customer = sessionQ.data?.authenticated ? sessionQ.data.customer : null;
  if (!customer) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <button onClick={onBack} style={backStyle}><ArrowLeft size={15} /> Voltar</button>
    <div style={cardStyle}>
      <KeyRound size={21} color="#a78bfa" />
      <h3 style={{ margin: '8px 0 4px', color: '#fff', fontSize: 16 }}>Entrar no meu atendimento</h3>
      <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,.6)', fontSize: 12, lineHeight: 1.45 }}>Informe seu telefone e sua senha. O bot nunca salva sua senha.</p>
      <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="Telefone com DDD" inputMode="numeric" style={inputStyle} />
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
      {ordersQ.isLoading ? <p style={smallStyle}>Consultando...</p> : ordersQ.data?.length ? ordersQ.data.map((o: any) => <button key={o.registrationId} onClick={() => setSelectedOrderId(o.registrationId)} style={{ ...rowStyle, width:'100%', border: selectedOrderId === o.registrationId ? '1px solid #60a5fa' : '1px solid transparent', cursor:'pointer', textAlign:'left' }}>Pedido #{o.orderNumber || o.registrationId}<span>{o.status || 'Sem status'}</span></button>) : <p style={smallStyle}>Nenhum pedido encontrado.</p>}
      {selectedOrderId && <div style={{ marginTop:8 }}>
        {!hasRouteAccess('acompanhar') ? <button onClick={() => requestRoute('acompanhar')} style={secondaryStyle}>Solicitar acesso a Acompanhar Pedido</button> : <>
          <button onClick={() => setSelectedOrderId(null)} style={backStyle}>Fechar detalhes do pedido</button>
          {orderDetailsQ.isLoading ? <p style={smallStyle}>Consultando pedido...</p> : orderDetailsQ.data?.current ? <OrderDetails data={orderDetailsQ.data.current} /> : <p style={smallStyle}>Não foi possível carregar os detalhes.</p>}
        </>}
      </div>}
      <button onClick={() => requestRoute('acompanhar')} style={secondaryStyle}>{hasRouteAccess('acompanhar') ? 'Acessar Acompanhar Pedido' : 'Solicitar Acompanhar Pedido'}</button>
      <button onClick={() => requestRoute('site')} style={secondaryStyle}>{hasRouteAccess('site') ? 'Fazer Pedido' : 'Fazer Pedido indisponível'}</button>
    </div>
    <div style={{ ...cardStyle, opacity: hasRouteAccess('emprestimo') ? 1 : .52 }}><WalletCards size={20} color="#fbbf24" /><strong style={{ color: '#fff', display: 'block', marginTop: 6 }}>Empréstimos</strong>
      {hasRouteAccess('emprestimo') ? <>
        {loansQ.isLoading ? <p style={smallStyle}>Consultando...</p> : loansQ.data?.loans?.length ? loansQ.data.loans.map((loan: any) => <button key={loan.id} onClick={() => setSelectedLoanId(loan.id)} style={{ ...rowStyle, border: selectedLoanId === loan.id ? '1px solid #fbbf24' : '1px solid transparent', cursor:'pointer', textAlign:'left' }}>Empréstimo #{loan.id}<span>{loan.status}</span></button>) : <p style={smallStyle}>Nenhum empréstimo encontrado.</p>}
        {selectedLoanId && <div style={{ marginTop:8 }}><button onClick={() => setSelectedLoanId(null)} style={backStyle}>Fechar parcelas</button>{installmentsQ.isLoading ? <p style={smallStyle}>Consultando parcelas...</p> : installmentsQ.data?.map((i: any) => <div key={i.id} style={{ ...rowStyle, display:'block' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>Parcela {i.installmentNumber} · R$ {i.amount}<span>{i.status} · {String(i.dueDate).slice(0,10)}</span></div>{['pendente','atrasado'].includes(String(i.status)) && <label style={{ ...secondaryStyle, display:'block', boxSizing:'border-box', textAlign:'center', marginTop:7 }}>Enviar comprovante<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) sendProof(i.id, file); }} style={{ display:'none' }} /></label>}</div>)}</div>}
        <button onClick={() => requestRoute('emprestimo')} style={secondaryStyle}>Acessar Empréstimos</button>
      </> : <button disabled style={disabledStyle}>Empréstimos desabilitados pelo administrador</button>}
    </div>
    {hasRouteAccess('gastos') ? <button onClick={() => requestRoute('gastos')} style={secondaryStyle}>Acessar Controle de Gastos</button> : <button disabled style={disabledStyle}>Controle de Gastos desabilitado pelo administrador</button>}
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
const disabledStyle: React.CSSProperties = { ...secondaryStyle, color: 'rgba(255,255,255,.42)', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.10)', cursor: 'not-allowed', opacity: .8 };
const backStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,.65)', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 12, padding: 0 };
const smallStyle: React.CSSProperties = { color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '7px 0' };
const rowStyle: React.CSSProperties = { marginTop: 7, padding: '8px 9px', borderRadius: 9, display: 'flex', justifyContent: 'space-between', gap: 8, background: 'rgba(0,0,0,.2)', color: '#e5e7eb', fontSize: 12 };
