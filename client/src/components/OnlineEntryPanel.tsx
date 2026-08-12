import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, LogOut, Package, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";

const ENTRY_TOKEN_KEY = "walk_online_entry_token";

type Props = { onBack: () => void; onOpenCadastro: () => void };

export function OnlineEntryPanel({ onBack, onOpenCadastro }: Props) {
  const [token, setToken] = useState(() => localStorage.getItem(ENTRY_TOKEN_KEY) || "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const sessionQ = trpc.onlineSupport.entrySession.useQuery({ token }, { enabled: !!token, retry: false });
  const loginMut = trpc.customerPassword.login.useMutation();
  const ordersQ = trpc.onlineSupport.entryOrders.useQuery({ token }, { enabled: !!token && !!sessionQ.data?.authenticated, retry: false });
  const loansQ = trpc.onlineSupport.entryLoans.useQuery({ token }, { enabled: !!token && !!sessionQ.data?.authenticated, retry: false });
  const installmentsQ = trpc.onlineSupport.entryLoanInstallments.useQuery({ token, loanId: selectedLoanId || 0 }, { enabled: !!token && !!selectedLoanId && !!sessionQ.data?.authenticated, retry: false });
  const logoutMut = trpc.customerPassword.logout.useMutation();
  const routeMut = trpc.onlineSupport.entryRequestRoute.useMutation();

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
    setToken(result.token);
    setPassword("");
  };

  const logout = async () => {
    if (token) await logoutMut.mutate({ token });
    localStorage.removeItem(ENTRY_TOKEN_KEY);
    setToken("");
  };

  const requestRoute = async (route: 'site' | 'gastos' | 'emprestimo') => {
    try { await routeMut.mutateAsync({ token, route }); }
    catch (e: any) { setError(e?.message || 'Não foi possível solicitar o acesso.'); }
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div><strong style={{ color: '#fff', fontSize: 15 }}>Olá, {customer.name}</strong><div style={{ color: '#86efac', fontSize: 11 }}>Sessão autenticada</div></div>
      <button onClick={logout} style={backStyle}><LogOut size={14} /> Sair</button>
    </div>
    <div style={cardStyle}><Package size={20} color="#60a5fa" /><strong style={{ color: '#fff', display: 'block', marginTop: 6 }}>Meus pedidos</strong>
      {ordersQ.isLoading ? <p style={smallStyle}>Consultando...</p> : ordersQ.data?.length ? ordersQ.data.map((o: any) => <div key={o.registrationId} style={rowStyle}>Pedido #{o.orderNumber || o.registrationId}<span>{o.status || 'Sem status'}</span></div>) : <p style={smallStyle}>Nenhum pedido encontrado.</p>}
      <button onClick={() => requestRoute('site')} style={secondaryStyle}>Acessar / solicitar Site de Pedidos</button>
    </div>
    <div style={cardStyle}><WalletCards size={20} color="#fbbf24" /><strong style={{ color: '#fff', display: 'block', marginTop: 6 }}>Empréstimos</strong>
      {loansQ.isLoading ? <p style={smallStyle}>Consultando...</p> : loansQ.data?.loans?.length ? loansQ.data.loans.map((loan: any) => <button key={loan.id} onClick={() => setSelectedLoanId(loan.id)} style={{ ...rowStyle, border: selectedLoanId === loan.id ? '1px solid #fbbf24' : '1px solid transparent', cursor:'pointer', textAlign:'left' }}>Empréstimo #{loan.id}<span>{loan.status}</span></button>) : <p style={smallStyle}>Nenhum empréstimo encontrado.</p>}
      {selectedLoanId && <div style={{ marginTop:8 }}><button onClick={() => setSelectedLoanId(null)} style={backStyle}>Fechar parcelas</button>{installmentsQ.isLoading ? <p style={smallStyle}>Consultando parcelas...</p> : installmentsQ.data?.map((i: any) => <div key={i.id} style={rowStyle}>Parcela {i.installmentNumber} · R$ {i.amount}<span>{i.status} · {String(i.dueDate).slice(0,10)}</span></div>)}</div>}
      <button onClick={() => requestRoute('emprestimo')} style={secondaryStyle}>Acessar / solicitar Empréstimos</button>
    </div>
    <button onClick={() => requestRoute('gastos')} style={secondaryStyle}>Controle de Gastos</button>
  </div>;
}

const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.11)', borderRadius: 14, padding: 14 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#fff', padding: '0 11px', outline: 'none' };
const primaryStyle: React.CSSProperties = { width: '100%', marginTop: 10, height: 42, border: 0, borderRadius: 10, color: '#fff', fontWeight: 800, background: 'linear-gradient(135deg,#7c3aed,#2563eb)', cursor: 'pointer' };
const secondaryStyle: React.CSSProperties = { width: '100%', marginTop: 10, minHeight: 36, borderRadius: 9, color: '#c4b5fd', fontSize: 12, fontWeight: 700, background: 'rgba(124,58,237,.12)', border: '1px solid rgba(124,58,237,.35)', cursor: 'pointer' };
const backStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,.65)', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 12, padding: 0 };
const smallStyle: React.CSSProperties = { color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '7px 0' };
const rowStyle: React.CSSProperties = { marginTop: 7, padding: '8px 9px', borderRadius: 9, display: 'flex', justifyContent: 'space-between', gap: 8, background: 'rgba(0,0,0,.2)', color: '#e5e7eb', fontSize: 12 };
