import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  AlertCircle, Loader2, BarChart3, Phone, Lock, Clock, CheckCircle2, Eye, EyeOff, MessageCircle
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

// Componente: botão de solicitar cadastro via WhatsApp
function WhatsAppRequestButton({ phone }: { phone: string }) {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const rawNumber = settings?.whatsapp_number || '5511978307371';
  const adminNumber = rawNumber.replace(/\D/g, '');
  const clientPhone = phone.replace(/\D/g, '');
  const message = encodeURIComponent(
    `Olá! Gostaria de solicitar meu cadastro no Gestor de Gastos Walk Ajuda.\nMeu número de telefone é: ${clientPhone || phone}`
  );
  const href = `https://wa.me/${adminNumber}?text=${message}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2.5 w-full h-12 rounded-xl font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5d] active:scale-[0.97] transition-all duration-150 shadow-lg shadow-green-900/30"
    >
      <MessageCircle className="w-5 h-5" />
      Solicitar cadastro pelo WhatsApp
    </a>
  );
}

interface GastosLoginPageProps {
  onLoginSuccess: (token: string, clientId: number, clientName: string) => void;
}

type Step =
  | 'phone'             // Etapa 1: digitar telefone
  | 'create_password'   // Etapa 2: criar senha (cliente sem senha - APENAS primeiro acesso)
  | 'enter_password'    // Etapa 2b: digitar senha (cliente já tem senha)
  | 'pending_approval'  // Aguardando admin definir validade
  | 'expired'           // Senha expirada - aguardar admin renovar
  | 'expired_no_renew'  // Senha venceu e admin não renovou (sem senha ativa)
  | 'not_found'         // Telefone sem cadastro
  | 'blocked';          // Bloqueado

export function GastosLoginPage({ onLoginSuccess }: GastosLoginPageProps) {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const gastosLogoUrl = settings?.gastos_logo_url || '';
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(''); // telefone
  const [cpfInput, setCpfInput] = useState(''); // CPF (campo separado)
  // Qual campo está ativo: 'phone' | 'cpf' | null
  const activeField = phone.replace(/\D/g, '').length > 0 ? 'phone' : cpfInput.replace(/\D/g, '').length > 0 ? 'cpf' : null;
  const [clientName, setClientName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordCreated, setPasswordCreated] = useState(false);

  const checkPhoneMutation = trpc.spreadsheet.checkPhone.useMutation();
  const clientCreatePasswordMutation = trpc.spreadsheet.clientCreatePassword.useMutation();
  const clientCreatePasswordAutoMutation = trpc.spreadsheet.clientCreatePasswordAuto.useMutation();
  const loginMutation = trpc.spreadsheet.login.useMutation();
  const passwordModeQuery = trpc.spreadsheet.getPasswordMode.useQuery();
  const isAutoMode = passwordModeQuery.data?.mode === 'auto';

  // Normaliza telefone: remove espaços, traços, parênteses e código do país (55)
  const normalizePhone = (raw: string): string => {
    let d = raw.replace(/\D/g, ''); // só dígitos
    // Remove código do país: 55 no início se resultar em 12-13 dígitos
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
      d = d.slice(2);
    }
    return d.slice(0, 11);
  };

  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  };

  const formatCpf = (value: string) => {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  // Etapa 1: verificar telefone ou CPF
  const handleCheckPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanCpf = cpfInput.replace(/\D/g, '');
    // Prioridade: CPF se preenchido (11 dígitos), senão telefone
    const useCpf = cleanCpf.length === 11;
    const cleanId = useCpf ? cleanCpf : cleanPhone;
    if (cleanId.length < 10) {
      setError('Informe o telefone (10-11 dígitos) ou o CPF (11 dígitos)');
      return;
    }
    setIsLoading(true);
    try {
      const result = await checkPhoneMutation.mutateAsync({ identifier: cleanId, isCpf: useCpf });
      setClientName(result.clientName || '');
      switch (result.status) {
        case 'not_found':
          setStep('not_found');
          break;
        case 'blocked':
          setStep('blocked');
          break;
        case 'no_password':
          setStep('create_password');
          break;
        case 'pending_approval':
          setStep('pending_approval');
          break;
        case 'expired':
          setStep('expired');
          break;
        case 'expired_no_renew':
          setStep('expired_no_renew');
          break;
        case 'has_password':
          setStep('enter_password');
          break;
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao verificar identificador');
    } finally {
      setIsLoading(false);
    }
  };

  // Etapa 2: cliente cria senha
  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    setIsLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      if (isAutoMode) {
        // Modo AUTO: cria senha com 30 dias, sem precisar de aprovação do ADM
        const result = await clientCreatePasswordAutoMutation.mutateAsync({
          phone: cleanPhone,
          password,
          confirmPassword,
        });
        // Fazer login automático após criar a senha
        const loginResult = await loginMutation.mutateAsync({ phone: cleanPhone, password });
        if (loginResult.success) {
          localStorage.setItem('gastos_token', loginResult.token);
          localStorage.setItem('gastos_clientId', loginResult.clientId.toString());
          localStorage.setItem('gastos_clientName', loginResult.clientName);
          onLoginSuccess(loginResult.token, loginResult.clientId, loginResult.clientName);
        }
      } else {
        // Modo MANUAL: cria senha pendente, aguarda ADM liberar
        await clientCreatePasswordMutation.mutateAsync({
          phone: cleanPhone,
          password,
          confirmPassword,
        });
        setPasswordCreated(true);
        setStep('pending_approval');
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'PASSWORD_ALREADY_SET') {
        setStep('expired_no_renew');
      } else if (msg === 'Já existe uma senha ativa para este cadastro') {
        setError('Você já possui uma senha ativa. Tente fazer login normalmente.');
        setStep('enter_password');
      } else {
        setError(msg || 'Erro ao criar senha');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Etapa 2b: login com senha existente
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await loginMutation.mutateAsync({
        phone: phone.replace(/\D/g, ''),
        password,
        isCpf: false,
      });
      if (result.success) {
        localStorage.setItem('gastos_token', result.token);
        localStorage.setItem('gastos_clientId', result.clientId.toString());
        localStorage.setItem('gastos_clientName', result.clientName);
        onLoginSuccess(result.token, result.clientId, result.clientName);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'PENDING_APPROVAL') {
        setStep('pending_approval');
      } else if (msg === 'Senha expirada') {
        setStep('expired');
      } else {
        setError(msg || 'Senha incorreta');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetToPhone = () => {
    setStep('phone');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setPasswordCreated(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] text-foreground flex items-center justify-center p-4">
      <Card className="relative w-full max-w-md overflow-hidden bg-card/80 backdrop-blur border border-primary/20 rounded-2xl shadow-lg shadow-primary/10 ring-1 ring-primary/10">
        {/* Brilhos decorativos */}
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/15 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_24px_-4px_var(--primary)]">
              {gastosLogoUrl ? (
                <img src={gastosLogoUrl} alt="Logo Gastos" className="w-12 h-12 object-contain rounded-xl" />
              ) : (
                <BarChart3 className="w-8 h-8 text-primary" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-primary/70 bg-clip-text text-transparent mb-2">
              GASTOS WALK AJUDA
            </h1>
            <p className="text-sm text-muted-foreground">Controle seus ganhos e gastos</p>
          </div>

          {/* ETAPA 1: TELEFONE */}
          {step === 'phone' && (
            <form onSubmit={handleCheckPhone} className="space-y-4">
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Phone className="w-4 h-4 inline mr-1.5 opacity-70" />
                  Telefone
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="(11) 99999-9999"
                  value={formatPhone(phone)}
                  onChange={(e) => setPhone(normalizePhone(e.target.value))}
                  disabled={isLoading}
                  autoFocus
                  className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring"
                />
              </div>
              {/* Campo CPF: só aparece se telefone estiver vazio */}
              {activeField !== 'phone' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  CPF <span className="text-muted-foreground font-normal text-xs">{activeField === 'cpf' ? '' : '(opcional)'}</span>
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={formatCpf(cpfInput)}
                  onChange={(e) => setCpfInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  disabled={isLoading}
                  className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring"
                />
                {activeField === null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Preencha telefone ou CPF para continuar
                  </p>
                )}
              </div>
              )}
              <Button
                type="submit"
                disabled={isLoading || (phone.replace(/\D/g, '').length < 10 && cpfInput.replace(/\D/g, '').length !== 11)}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shadow-[0_0_16px_-4px_var(--primary)] transition-all duration-200 disabled:opacity-50"
              >
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verificando...</> : 'Continuar'}
              </Button>
            </form>
          )}

          {/* ETAPA 2: CRIAR SENHA */}
          {step === 'create_password' && (
            <form onSubmit={handleCreatePassword} className="space-y-4">
              <div className={`p-3 rounded-lg mb-2 ${isAutoMode ? 'bg-green-500/10 border border-green-500/30' : 'bg-primary/10 border border-primary/30'}`}>
                <p className={`text-sm font-medium ${isAutoMode ? 'text-green-300' : 'text-primary'}`}>
                  Olá{clientName ? `, ${clientName}` : ''}! Crie sua senha de acesso.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isAutoMode
                    ? '✅ Acesso imediato! Você terá 30 dias de acesso após criar a senha.'
                    : 'Após criar, aguarde o administrador liberar seu acesso.'}
                </p>
              </div>
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Lock className="w-4 h-4 inline mr-1.5 opacity-70" />
                  Criar senha
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                    className="h-11 bg-input border-border text-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Lock className="w-4 h-4 inline mr-1.5 opacity-70" />
                  Confirmar senha
                </label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-11 bg-input border-border text-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading || password.length < 6 || !confirmPassword}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shadow-[0_0_16px_-4px_var(--primary)] transition-all duration-200 disabled:opacity-50"
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{isAutoMode ? 'Criando e entrando...' : 'Salvando...'}</>
                  : isAutoMode ? '✅ Criar Senha e Entrar' : 'Criar Minha Senha'}
              </Button>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center mt-1">
                ← Voltar
              </button>
            </form>
          )}

          {/* ETAPA 2b: DIGITAR SENHA EXISTENTE */}
          {step === 'enter_password' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg mb-2">
                <p className="text-sm text-primary font-medium">
                  Bem-vindo{clientName ? `, ${clientName}` : ''}!
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Digite sua senha para entrar.</p>
              </div>
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Lock className="w-4 h-4 inline mr-1.5 opacity-70" />
                  Senha
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                    className="h-11 bg-input border-border text-foreground pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading || !password}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shadow-[0_0_16px_-4px_var(--primary)] transition-all duration-200 disabled:opacity-50"
              >
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Entrando...</> : 'Entrar'}
              </Button>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center mt-1">
                ← Voltar
              </button>
            </form>
          )}

          {/* AGUARDANDO APROVAÇÃO */}
          {step === 'pending_approval' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-amber-400" />
              </div>
              {passwordCreated && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-left">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-300">Senha criada com sucesso!</p>
                </div>
              )}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-amber-300 font-semibold text-base mb-1">
                  Aguardando liberação
                </p>
                <p className="text-sm text-muted-foreground">
                  Sua senha foi registrada. O administrador precisa definir a validade do seu acesso.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Entre em contato com o administrador para liberar seu acesso.
                </p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center mt-2">
                ← Voltar ao início
              </button>
            </div>
          )}

          {/* SENHA EXPIRADA - aguardar admin renovar */}
          {step === 'expired' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-red-500/15 border border-red-500/30 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-red-400" />
              </div>
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-300 font-semibold text-base mb-1">Acesso expirado</p>
                <p className="text-sm text-muted-foreground">
                  Seu período de acesso encerrou. Aguarde o administrador renovar seu acesso.
                </p>
                <p className="text-xs text-muted-foreground mt-2 text-amber-400/80">
                  ⚠️ Não é possível criar uma nova senha. Somente o administrador pode renovar.
                </p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                ← Voltar
              </button>
            </div>
          )}

          {/* VENCIDO SEM RENOVAÇÃO - senha venceu e não tem ativa */}
          {step === 'expired_no_renew' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-orange-500/15 border border-orange-500/30 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-orange-400" />
              </div>
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                <p className="text-orange-300 font-semibold text-base mb-1">Acesso encerrado</p>
                <p className="text-sm text-muted-foreground">
                  {clientName ? `${clientName}, o` : 'O'} seu acesso ao Gestor de Gastos foi encerrado.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Para voltar a ter acesso, entre em contato com o administrador para que ele renove seu plano.
                </p>
                <p className="text-xs text-amber-400/80 mt-2 font-medium">
                  🔒 A senha não pode ser alterada. Apenas o administrador pode renovar o acesso.
                </p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                ← Voltar
              </button>
            </div>
          )}

          {/* NÃO ENCONTRADO */}
          {step === 'not_found' && (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-slate-500/10 border border-slate-500/30 rounded-xl">
                <p className="text-slate-300 font-semibold text-base mb-1">Telefone não cadastrado</p>
                <p className="text-sm text-muted-foreground">
                  Este número não possui cadastro no sistema. Solicite seu cadastro ao administrador pelo WhatsApp.
                </p>
              </div>
              <WhatsAppRequestButton phone={phone} />
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                ← Tentar outro número
              </button>
            </div>
          )}

          {/* BLOQUEADO */}
          {step === 'blocked' && (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-300 font-semibold text-base mb-1">Acesso bloqueado</p>
                <p className="text-sm text-muted-foreground">
                  Este número está bloqueado. Entre em contato com o administrador.
                </p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                ← Voltar
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-primary/15">
            <p className="text-xs text-muted-foreground text-center">
              Problemas com acesso? Fale com o administrador
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
