import { useMemo, useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import { trpc } from "@/lib/trpc";

const steps = ['route','name','phone','cpf','email','cep','city','uf','photo','confirm'] as const;
type Step = typeof steps[number];
type Route = 'site' | 'gastos' | 'emprestimo';
type Props = { conversationId: number; visitorId: string; onBack: () => void; onDone: () => void };

function toBase64(file: File) { return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); }); }

export function OnlineRegistrationPanel({ conversationId, visitorId, onBack, onDone }: Props) {
  const [index, setIndex] = useState(0); const [route, setRoute] = useState<Route>('site');
  const [data, setData] = useState({ name: '', phone: '', cpf: '', email: '', cep: '', city: '', uf: '', profilePhotoUrl: '' });
  const [value, setValue] = useState(''); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<{ name: string; customerNumber: number | null } | null>(null);
  const step = steps[index];
  const utils = trpc.useUtils();
  const saveDraft = trpc.onlineSupport.registrationDraftSave.useMutation();
  const uploadPhoto = trpc.customers.uploadProfilePhoto.useMutation();
  const register = trpc.customers.register.useMutation();
  const title = useMemo(() => ({ route:'Qual área você quer acessar?', name:'Qual é seu nome completo?', phone:'Informe seu telefone com DDD', cpf:'Informe seu CPF', email:'Informe seu e-mail', cep:'Informe seu CEP (opcional)', city:'Qual é sua cidade?', uf:'Selecione seu estado', photo:'Envie sua foto de perfil', confirm:'Confira seus dados antes de concluir' }[step]), [step]);

  const advance = async () => {
    setError('');
    if (step === 'route') { await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step, field: 'route', value: route }); setIndex(1); return; }
    if (step === 'photo') {
      if (!file) { setError('A foto é obrigatória.'); return; }
      const imageBase64 = await toBase64(file); const result = await uploadPhoto.mutateAsync({ imageBase64, phone: data.phone.replace(/\D/g,'') });
      const profilePhotoUrl = result.url; setData(old => ({ ...old, profilePhotoUrl })); await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step, field: 'profilePhotoUrl', value: profilePhotoUrl }); setIndex(index + 1); return;
    }
    if (step === 'confirm') {
      const result = await register.mutateAsync({ ...data, phone: data.phone.replace(/\D/g,''), originRoute: route });
      if (!result.success) { setError(result.message || 'Não foi possível concluir o cadastro.'); return; }
      await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step: 'confirm', data: { ...data, route } }); onDone(); return;
    }
    const field = step as keyof typeof data;
    // Cidade e UF preenchidas pelo CEP precisam ser salvas mesmo sem nova digitação.
    let cleaned = (value.trim() || ((step === 'city' || step === 'uf') ? data[field] : '')).trim();
    if (step === 'phone' || step === 'cpf' || step === 'cep') cleaned = cleaned.replace(/\D/g, '');
    if (step === 'uf') cleaned = cleaned.toUpperCase().slice(0,2);
    try {
      // Telefone, CPF e e-mail são conferidos imediatamente no cadastro principal.
      if (step === 'phone' || step === 'cpf' || step === 'email') {
        const identity = await utils.onlineSupport.registrationFindExisting.fetch({ [step]: cleaned });
        if (identity.exists) {
          setExistingCustomer(identity.customer);
          setError(`Cadastro já localizado para ${identity.customer.name}. Entre na sua área; não continue como novo cadastro.`);
          return;
        }
      }
      await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step, field, value: cleaned });
      let next = { ...data, [field]: cleaned };
      setData(next);
      setValue('');
      if (step === 'cep' && cleaned.length === 8) {
        const response = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
        const address = await response.json();
        if (!address.erro) {
          next = { ...next, city: address.localidade || next.city, uf: address.uf || next.uf };
          setData(next);
        }
      }
      setIndex(index + 1);
    } catch (e: any) { setError(e?.message || 'Verifique o dado informado.'); }
  };
  const loading = saveDraft.isPending || uploadPhoto.isPending || register.isPending;
  return <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
    <button onClick={onBack} style={back}><ArrowLeft size={15}/> Voltar</button>
    <div style={card}><div style={{ color:'#a78bfa', fontWeight:800, fontSize:12 }}>CADASTRO GUIADO · {index + 1}/{steps.length}</div><h3 style={{ color:'#fff', margin:'8px 0 5px', fontSize:16 }}>{title}</h3>
      {step === 'route' ? <div style={{ display:'grid', gap:8 }}>{([['site','Site de Pedidos'],['gastos','Controle de Gastos'],['emprestimo','Empréstimos']] as [Route,string][]).map(([key,label]) => <button key={key} onClick={() => setRoute(key)} style={{ ...choice, borderColor: route===key ? '#818cf8' : 'rgba(255,255,255,.12)', background: route===key ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.04)' }}>{label}</button>)}</div> : step === 'photo' ? <label style={{ ...choice, display:'block', textAlign:'center' }}><Camera size={22} style={{ marginBottom:6 }}/><div>{file ? file.name : 'Escolher foto'}</div><input type="file" accept="image/*" capture="user" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display:'none' }}/></label> : step === 'confirm' ? <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', lineHeight:1.7 }}><div><b>Área:</b> {route}</div><div><b>Nome:</b> {data.name}</div><div><b>Telefone:</b> {data.phone}</div><div><b>E-mail:</b> {data.email}</div><div><b>Cidade/UF:</b> {data.city}/{data.uf}</div></div> : <input value={value || (step === 'city' ? data.city : step === 'uf' ? data.uf : '')} onChange={e => { setValue(e.target.value); setError(''); setExistingCustomer(null); }} placeholder={step === 'cep' ? 'Opcional' : 'Digite aqui'} inputMode={['phone','cpf','cep'].includes(step) ? 'numeric' : undefined} style={input}/>}\n      {error && <p style={{ color:'#fca5a5', fontSize:12, margin:'9px 0 0' }}>{error}</p>}
      {existingCustomer && <button onClick={onDone} style={{ ...primary, marginTop:10, background:'rgba(59,130,246,.18)', border:'1px solid rgba(96,165,250,.55)', color:'#bfdbfe' }}>Entrar como cliente</button>}
      <button disabled={loading || !!existingCustomer} onClick={advance} style={{ ...primary, opacity: existingCustomer ? .45 : 1, cursor: existingCustomer ? 'not-allowed' : 'pointer' }}>{loading ? 'Processando...' : step === 'confirm' ? 'Confirmar cadastro' : 'Continuar'}</button></div>
  </div>;
}
const card: React.CSSProperties={ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.11)', borderRadius:14, padding:15};
const input: React.CSSProperties={width:'100%', boxSizing:'border-box', height:43, borderRadius:10, border:'1px solid rgba(255,255,255,.15)', background:'rgba(0,0,0,.25)', color:'#fff', padding:'0 11px', outline:'none'};
const primary: React.CSSProperties={width:'100%', marginTop:12, height:42, border:0, borderRadius:10, background:'linear-gradient(135deg,#7c3aed,#2563eb)', color:'#fff', fontWeight:800, cursor:'pointer'};
const choice: React.CSSProperties={width:'100%', minHeight:42, borderRadius:10, color:'#e9d5ff', border:'1px solid', cursor:'pointer', padding:'10px 12px', fontSize:13};
const back: React.CSSProperties={display:'inline-flex', alignItems:'center', gap:5, color:'rgba(255,255,255,.65)', background:'transparent', border:0, cursor:'pointer', fontSize:12, padding:0};
