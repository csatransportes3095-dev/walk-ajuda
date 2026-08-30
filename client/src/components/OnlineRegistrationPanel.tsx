import { useMemo, useState } from "react";
import { ArrowLeft, Camera, Eye, EyeOff, KeyRound } from "lucide-react";
import { trpc } from "@/lib/trpc";

const steps = ['route', 'name', 'phone', 'cpf', 'email', 'cep', 'addressLine', 'addressNumber', 'neighborhood', 'addressComplement', 'city', 'uf', 'referrer', 'photo', 'confirm', 'password'] as const;
type Step = typeof steps[number];
type Route = 'site' | 'acompanhar' | 'gastos' | 'emprestimo';
type Props = { conversationId: number; visitorId: string; onBack: () => void; onDone: () => void };

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function OnlineRegistrationPanel({ conversationId, visitorId, onBack, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [route, setRoute] = useState<Route>('site');
  const [data, setData] = useState({ name: '', phone: '', cpf: '', email: '', zipCode: '', addressLine: '', addressNumber: '', neighborhood: '', addressComplement: '', city: '', uf: '', referrerPhone: '', profilePhotoUrl: '' });
  const [value, setValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<{ name: string; customerNumber: number | null } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordCompleted, setPasswordCompleted] = useState<'auto' | 'manual' | null>(null);

  const step = steps[index];
  const utils = trpc.useUtils();
  const saveDraft = trpc.onlineSupport.registrationDraftSave.useMutation();
  const uploadPhoto = trpc.customers.uploadProfilePhoto.useMutation();
  const register = trpc.customers.register.useMutation();
  const passwordMode = trpc.customerPassword.getMode.useQuery();
  const createPasswordAuto = trpc.customerPassword.clientCreateAuto.useMutation();
  const createPasswordManual = trpc.customerPassword.clientCreateManual.useMutation();

  const title = useMemo(() => ({
    route: 'Qual área você quer acessar?',
    name: 'Qual é seu nome completo?',
    phone: 'Informe seu telefone com DDD',
    cpf: 'Informe seu CPF',
    email: 'Informe seu e-mail',
    cep: 'Informe seu CEP',
    addressLine: 'Informe sua rua / logradouro',
    addressNumber: 'Informe o número do endereço',
    neighborhood: 'Informe seu bairro',
    addressComplement: 'Complemento do endereço (opcional)',
    city: 'Qual é sua cidade?',
    uf: 'Selecione seu estado',
    referrer: 'Telefone de quem indicou você',
    photo: 'Envie sua foto de perfil',
    confirm: 'Confira seus dados antes de concluir',
    password: 'Crie sua senha de acesso',
  }[step]), [step]);

  const advance = async () => {
    setError('');
    if (step === 'route') {
      await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step, field: 'route', value: route });
      setIndex(1);
      return;
    }
    if (step === 'referrer') {
      const referrerPhone = value.replace(/\D/g, '');
      if (referrerPhone.length !== 11) {
        setError('Acesso restrito: informe o telefone com DDD de um indicador cadastrado.');
        return;
      }
      await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step, field: 'referrerPhone', value: referrerPhone });
      setData(old => ({ ...old, referrerPhone }));
      setValue('');
      setIndex(index + 1);
      return;
    }
    if (step === 'photo') {
      if (!file) { setError('A foto é obrigatória.'); return; }
      const imageBase64 = await toBase64(file);
      const result = await uploadPhoto.mutateAsync({ imageBase64, phone: data.phone.replace(/\D/g, '') });
      const profilePhotoUrl = result.url;
      setData(old => ({ ...old, profilePhotoUrl }));
      await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step, field: 'profilePhotoUrl', value: profilePhotoUrl });
      setIndex(index + 1);
      return;
    }
    if (step === 'confirm') {
      const result = await register.mutateAsync({ ...data, phone: data.phone.replace(/\D/g, ''), referredByPhone: data.referrerPhone, sourceRoute: route });
      if (!result.success) { setError(result.message || 'Não foi possível concluir o cadastro.'); return; }
      await saveDraft.mutateAsync({ conversationId, visitorId, requestedRoute: route, step: 'confirm', data: { ...data, route } });
      // O cadastro nunca retorna à tela inicial sem a senha ser criada no passo seguinte.
      setIndex(index + 1);
      return;
    }
    if (step === 'password') {
      if (password.length < 6) { setError('Crie uma senha com pelo menos 6 caracteres.'); return; }
      if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
      const phone = data.phone.replace(/\D/g, '');
      if (!phone) { setError('Não localizamos o telefone do cadastro. Volte e informe novamente.'); return; }
      try {
        if (passwordMode.data?.mode === 'manual') {
          const result = await createPasswordManual.mutateAsync({ phone, password });
          if (!result.success) { setError('Não foi possível criar a senha agora.'); return; }
          setPasswordCompleted('manual');
          return;
        }
        const result = await createPasswordAuto.mutateAsync({ phone, password });
        if (!result.success || !result.token) { setError('Não foi possível criar a senha agora.'); return; }
        // Mantém a mesma sessão oficial usada pelo Atendimento Online e pelo Acompanhar Pedido.
        localStorage.setItem('walk_online_entry_token', result.token);
        localStorage.setItem('cp_token', result.token);
        setPasswordCompleted('auto');
      } catch (e: any) {
        setError(e?.message || 'Não foi possível criar a senha. Tente novamente.');
      }
      return;
    }

    const field = (step === 'cep' ? 'zipCode' : step) as keyof typeof data;
    let cleaned = (value.trim() || ((step === 'city' || step === 'uf') ? data[field] : '')).trim();
    if (step === 'phone' || step === 'cpf' || step === 'cep') cleaned = cleaned.replace(/\D/g, '');
    if (step === 'uf') cleaned = cleaned.toUpperCase().slice(0, 2);
    if (step === 'cep' && cleaned.length !== 8) {
      setError('Informe um CEP válido com 8 dígitos.');
      return;
    }
    if (step === 'addressLine' && cleaned.length < 2) { setError('Informe sua rua / logradouro.'); return; }
    if (step === 'addressNumber' && !cleaned) { setError('Informe o número do endereço.'); return; }
    if (step === 'neighborhood' && cleaned.length < 2) { setError('Informe seu bairro.'); return; }
    try {
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
          next = { ...next, addressLine: address.logradouro || next.addressLine, neighborhood: address.bairro || next.neighborhood, city: address.localidade || next.city, uf: address.uf || next.uf };
          setData(next);
        }
      }
      setIndex(index + 1);
    } catch (e: any) {
      setError(e?.message || 'Verifique o dado informado.');
    }
  };

  const loading = saveDraft.isPending || uploadPhoto.isPending || register.isPending || createPasswordAuto.isPending || createPasswordManual.isPending || passwordMode.isLoading;
  const passwordIsManual = passwordMode.data?.mode === 'manual';

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <button onClick={onBack} style={back}><ArrowLeft size={15} /> Voltar</button>
    <div style={card}>
      <div style={{ color: '#a78bfa', fontWeight: 800, fontSize: 12 }}>CADASTRO GUIADO · {index + 1}/{steps.length}</div>
      <h3 style={{ color: '#fff', margin: '8px 0 5px', fontSize: 16 }}>{title}</h3>

      {step === 'route' ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {([['site', 'Site de Pedidos'], ['acompanhar', 'Acompanhar Pedido'], ['gastos', 'Controle de Gastos'], ['emprestimo', 'Empréstimos']] as [Route, string][]).map(([key, label]) => <button key={key} onClick={() => setRoute(key)} style={{ ...choice, borderColor: route === key ? '#818cf8' : 'rgba(255,255,255,.12)', background: route === key ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.04)' }}>{label}</button>)}
        </div>
      ) : step === 'referrer' ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#fde68a', fontSize: 12, lineHeight: 1.45 }}>Acesso restrito: informe o telefone com DDD de um cliente já cadastrado que indicou você. Sem indicação válida, não liberamos o cadastro.</div>
          <input value={value} onChange={e => { setValue(e.target.value.replace(/\D/g, '').slice(0, 11)); setError(''); }} placeholder="(11) 99999-9999" inputMode="numeric" style={input} />
        </div>
      ) : step === 'photo' ? (
        <label style={{ ...choice, display: 'block', textAlign: 'center' }}><Camera size={22} style={{ marginBottom: 6 }} /><div>{file ? file.name : 'Escolher foto'}</div><input type="file" accept="image/*" capture="user" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} /></label>
      ) : step === 'confirm' ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', lineHeight: 1.7 }}><div><b>Área:</b> {route}</div><div><b>Nome:</b> {data.name}</div><div><b>Telefone:</b> {data.phone}</div><div><b>CPF:</b> {data.cpf}</div><div><b>E-mail:</b> {data.email}</div><div><b>CEP:</b> {data.zipCode}</div><div><b>Endereço:</b> {data.addressLine}, {data.addressNumber} - {data.neighborhood}</div><div><b>Complemento:</b> {data.addressComplement || '-'}</div><div><b>Cidade/UF:</b> {data.city}/{data.uf}</div><div><b>Indicador:</b> {data.referrerPhone}</div></div>
      ) : step === 'password' ? (
        passwordCompleted ? (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(74,222,128,.45)', color: '#dcfce7', fontSize: 13, lineHeight: 1.5 }}>
            <b>Senha criada com sucesso.</b><br />
            {passwordCompleted === 'auto' ? 'Seu acesso foi liberado e já está protegido.' : 'Sua senha foi cadastrada e está aguardando a liberação do administrador.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 12, lineHeight: 1.45 }}>Crie uma senha de pelo menos 6 caracteres. Ela será usada quando você entrar novamente com seu número.</div>
            <div style={{ position: 'relative' }}><input value={password} onChange={e => { setPassword(e.target.value); setError(''); }} type={showPassword ? 'text' : 'password'} placeholder="Nova senha" autoComplete="new-password" style={{ ...input, paddingRight: 42 }} /><button type="button" onClick={() => setShowPassword(current => !current)} style={eyeButton}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            <div style={{ position: 'relative' }}><input value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirmar senha" autoComplete="new-password" style={{ ...input, paddingRight: 42 }} /><button type="button" onClick={() => setShowConfirmPassword(current => !current)} style={eyeButton}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            {passwordIsManual && <div style={{ color: '#fde68a', fontSize: 11, lineHeight: 1.4 }}>Após criar a senha, o administrador precisará liberar seu acesso.</div>}
          </div>
        )
      ) : (
        <input value={value || (step === 'city' ? data.city : step === 'uf' ? data.uf : step === 'addressLine' ? data.addressLine : step === 'neighborhood' ? data.neighborhood : '')} onChange={e => { setValue(e.target.value); setError(''); setExistingCustomer(null); }} placeholder={step === 'cep' ? 'CEP com 8 dígitos' : step === 'addressComplement' ? 'Opcional — deixe vazio se não houver' : 'Digite aqui'} inputMode={['phone', 'cpf', 'cep'].includes(step) ? 'numeric' : undefined} style={input} />
      )}

      {error && <p style={{ color: '#fca5a5', fontSize: 12, margin: '9px 0 0' }}>{error}</p>}
      {existingCustomer && <button onClick={onDone} style={{ ...primary, marginTop: 10, background: 'rgba(59,130,246,.18)', border: '1px solid rgba(96,165,250,.55)', color: '#bfdbfe' }}>Entrar como cliente</button>}
      {step === 'password' && passwordCompleted ? (
        <button onClick={onDone} style={{ ...primary, marginTop: 12 }}>{passwordCompleted === 'auto' ? 'Entrar no meu atendimento' : 'Voltar para tela inicial'}</button>
      ) : (
        <button disabled={loading || !!existingCustomer} onClick={advance} style={{ ...primary, opacity: existingCustomer ? .45 : 1, cursor: existingCustomer ? 'not-allowed' : 'pointer' }}>{loading ? 'Processando...' : step === 'confirm' ? 'Confirmar cadastro' : step === 'password' ? <><KeyRound size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Criar senha</> : 'Continuar'}</button>
      )}
    </div>
  </div>;
}

const card: React.CSSProperties = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.11)', borderRadius: 14, padding: 15 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 43, borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(0,0,0,.25)', color: '#fff', padding: '0 11px', outline: 'none' };
const primary: React.CSSProperties = { width: '100%', marginTop: 12, height: 42, border: 0, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#2563eb)', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const choice: React.CSSProperties = { width: '100%', minHeight: 42, borderRadius: 10, color: '#e9d5ff', border: '1px solid', cursor: 'pointer', padding: '10px 12px', fontSize: 13 };
const back: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,.65)', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 12, padding: 0 };
const eyeButton: React.CSSProperties = { position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: 'rgba(255,255,255,.6)', padding: 4, display: 'flex', cursor: 'pointer' };
