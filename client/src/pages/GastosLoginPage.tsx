import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  AlertCircle, Loader2, BarChart3, Phone, Lock, Clock, CheckCircle2,
  Eye, EyeOff, User, Mail, MapPin, Camera, Upload
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { isValidCPF, normalizeCpf } from '@shared/cpf';
import { ReferralAccessManifest } from '@/components/ReferralAccessManifest';

interface GastosLoginPageProps {
  onLoginSuccess: (token: string, clientId: number, clientName: string) => void;
  sourceRoute?: string; // 'gastos' ou 'emprestimo'
  requiredProfilePhone?: string;
}

type AccessRoute = 'site' | 'gastos' | 'emprestimo' | 'acompanhar';
type CheckRoute = Exclude<AccessRoute, 'acompanhar'>;

type Step =
  | 'phone'             // Etapa 1: digitar telefone
  | 'referral'          // Etapa 1b: indicação obrigatória para cadastro novo
  | 'register'          // Etapa 1c: cadastro completo (não encontrado)
  | 'register_done'     // Cadastro concluído — aguardar senha
  | 'create_password'   // Etapa 2: criar senha
  | 'enter_password'    // Etapa 2b: digitar senha existente
  | 'pending_approval'  // Aguardando admin
  | 'expired'           // Senha expirada
  | 'expired_no_renew'  // Senha venceu sem renovação
  | 'blocked'           // Bloqueado
  | 'profile_incomplete' // Perfil principal obrigatório incompleto
  | 'access_restricted'; // Cadastro reconhecido, sem permissão para esta rota

// Helper: converte File para base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo data:image/...;base64,
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function GastosLoginPage({ onLoginSuccess, sourceRoute, requiredProfilePhone }: GastosLoginPageProps) {
  const requestedAccessRoute: AccessRoute = ['site', 'gastos', 'emprestimo', 'acompanhar'].includes(sourceRoute || '') ? sourceRoute as AccessRoute : 'gastos';
  const requestedCheckRoute: CheckRoute = requestedAccessRoute === 'acompanhar' ? 'gastos' : requestedAccessRoute;
  const { data: settings } = trpc.settings.getAll.useQuery();
  const gastosLogoUrl = settings?.gastos_logo_url || '';
  const gastosTitle = settings?.gastos_title || 'GASTOS WALK AJUDA';
  const gastosSubtitle = settings?.gastos_subtitle || 'Controle seus ganhos e gastos';
  const gastosButtonText = settings?.gastos_button_text || 'Continuar';
  const gastosFooterText = settings?.gastos_footer_text || 'Problemas com acesso? Fale com o administrador';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [cpfInput, setCpfInput] = useState('');
  const activeField = phone.replace(/\D/g, '').length > 0 ? 'phone' : cpfInput.replace(/\D/g, '').length > 0 ? 'cpf' : null;
  const cpfInputDigits = normalizeCpf(cpfInput);
  const cpfInputValid = isValidCPF(cpfInputDigits);
  const cpfInputInvalid = cpfInputDigits.length === 11 && !cpfInputValid;
  const [clientName, setClientName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordCreated, setPasswordCreated] = useState(false);
  const [profileUpdateLookup, setProfileUpdateLookup] = useState<{ identifier: string; isCpf: boolean; missingFields?: string[]; profile?: any } | null>(null);
  const isMissingProfileField = (field: string) => !profileUpdateLookup || (profileUpdateLookup.missingFields || ['name', 'phone', 'cpf', 'email', 'photo']).includes(field);
  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
  const [restrictedPhone, setRestrictedPhone] = useState('');

  // Campos de cadastro
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCpf, setRegCpf] = useState('');
  const regCpfDigits = normalizeCpf(regCpf);
  const regCpfValid = isValidCPF(regCpfDigits);
  const regCpfInvalid = regCpfDigits.length === 11 && !regCpfValid;
  const [regEmail, setRegEmail] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regUf, setRegUf] = useState('');
  const [regPhoto, setRegPhoto] = useState<File | null>(null);
  const [regPhotoPreview, setRegPhotoPreview] = useState<string | null>(null);
  const [regReferralPhone, setRegReferralPhone] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const phoneToComplete = normalizePhone(requiredProfilePhone || '');
    if (!phoneToComplete) return;
    setProfileUpdateLookup({ identifier: phoneToComplete, isCpf: false, missingFields: ['name', 'phone', 'cpf', 'email', 'photo'] });
    setPhone(phoneToComplete);
    setRegPhone(phoneToComplete);
    setError('Atualize obrigatoriamente foto, e-mail, CPF e telefone para continuar.');
    setStep('register');
  }, [requiredProfilePhone]);

  const checkPhoneMutation = trpc.spreadsheet.checkPhone.useMutation();
  const clientCreatePasswordMutation = trpc.spreadsheet.clientCreatePassword.useMutation();
  const clientCreatePasswordAutoMutation = trpc.spreadsheet.clientCreatePasswordAuto.useMutation();
  const loginMutation = trpc.spreadsheet.login.useMutation();
  const passwordModeQuery = trpc.spreadsheet.getPasswordMode.useQuery();
  const isAutoMode = passwordModeQuery.data?.mode === 'auto';
  const registerMutation = trpc.customers.register.useMutation();
  const completeProfileMutation = trpc.customers.completeProfile.useMutation();
  const requestRouteAccessMutation = trpc.accessRequests.request.useMutation();
  const uploadPhotoMutation = trpc.customers.uploadProfilePhoto.useMutation();

  const normalizePhone = (raw: string): string => {
    let d = raw.replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    return d.slice(0, 11);
  };

  const formatPhone = (raw: string) => {
    const d = normalizePhone(raw);
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
    const cleanPhone = normalizePhone(phone);
    const cleanCpf = normalizeCpf(cpfInput);
    if (cleanCpf.length === 11 && !isValidCPF(cleanCpf)) {
      setError('CPF inválido. Digite um CPF válido para continuar.');
      return;
    }
    const useCpf = cleanCpf.length === 11;
    const cleanId = useCpf ? cleanCpf : cleanPhone;
    if (cleanId.length < 10) {
      setError('Informe o telefone (10-11 dígitos) ou o CPF (11 dígitos)');
      return;
    }
    setIsLoading(true);
    try {
      const result = await checkPhoneMutation.mutateAsync({ identifier: cleanId, isCpf: useCpf, requestedRoute: requestedCheckRoute });
      setClientName(result.clientName || '');
      switch (result.status) {
        case 'not_found':
          setProfileUpdateLookup(null);
          setRegReferralPhone('');
          setRegCpf(cleanCpf);
          // O novo cadastro usa o mesmo gate de indicação das demais rotas.
          setRegPhone(cleanPhone);
          setStep('referral');
          break;
        case 'blocked':
          setStep('blocked');
          break;
        case 'access_restricted':
          setAllowedRoutes((result as any).allowedRoutes || []);
          setRestrictedPhone((result as any).clientPhone || cleanPhone);
          setStep('access_restricted');
          break;
        case 'profile_incomplete': {
          const existingProfile = (result as any).profile || {};
          const missingFields = (result as any).missingFields || ['name', 'phone', 'cpf', 'email', 'photo'];
          setProfileUpdateLookup({ identifier: cleanId, isCpf: useCpf, missingFields, profile: existingProfile });
          setRegName(existingProfile.name || '');
          setRegPhone(existingProfile.phone || cleanPhone);
          setRegCpf(existingProfile.cpf || cleanCpf);
          setRegEmail(existingProfile.email || '');
          setRegCity(existingProfile.city || '');
          setRegUf(existingProfile.uf || '');
          setRegPhotoPreview(existingProfile.profilePhotoUrl || null);
          setError(result.message || 'Atualize somente os dados pendentes para continuar.');
          setStep('register');
          break;
        }
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

  // Selecionar foto
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRegPhoto(file);
    const url = URL.createObjectURL(file);
    setRegPhotoPreview(url);
  };

  // Cadastro completo
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = regPhone.replace(/\D/g, '');
    const cleanCpf = regCpf.replace(/\D/g, '');
    const cleanReferralPhone = normalizePhone(regReferralPhone);

    if (!regName.trim()) { setError('Informe seu nome completo'); return; }
    if (cleanPhone.length < 10) { setError('Informe um telefone válido'); return; }
    if (!isValidCPF(cleanCpf)) { setError('CPF inválido. Digite um CPF válido para continuar.'); return; }
    if (!regEmail.trim() || !regEmail.includes('@')) { setError('Informe um e-mail válido'); return; }
    if (!profileUpdateLookup && !regCity.trim()) { setError('Informe sua cidade'); return; }
    if (!profileUpdateLookup && (!regUf.trim() || regUf.length !== 2)) { setError('Informe o estado (UF) com 2 letras'); return; }
    if (!profileUpdateLookup && cleanReferralPhone.length < 10) { setError('Informe o telefone com DDD de quem indicou você'); return; }
    if (isMissingProfileField('photo') && !regPhoto) { setError('Selecione uma foto de perfil'); return; }

    setIsLoading(true);

    try {
      // Só envia foto quando ela está pendente ou foi trocada; uma atualização de CPF preserva a foto existente.
      let profilePhotoUrl = regPhotoPreview || profileUpdateLookup?.profile?.profilePhotoUrl || '';
      if (regPhoto) {
        setIsUploadingPhoto(true);
        const base64 = await fileToBase64(regPhoto);
        const uploadResult = await uploadPhotoMutation.mutateAsync({ imageBase64: base64, phone: cleanPhone });
        setIsUploadingPhoto(false);
        if (!uploadResult?.url) { setError('Erro ao enviar foto. Tente novamente.'); setIsLoading(false); return; }
        profilePhotoUrl = uploadResult.url;
      }

      // Perfil incompleto é atualizado no cadastro principal; cadastro novo cria uma identidade única.
      const payload = {
        name: regName.trim(),
        phone: cleanPhone,
        email: regEmail.trim(),
        cpf: formatCpf(regCpf),
        city: regCity.trim() || undefined,
        uf: regUf.toUpperCase().slice(0, 2) || undefined,
        profilePhotoUrl,
      };
      const result = profileUpdateLookup
        ? await completeProfileMutation.mutateAsync({ ...payload, lookupIdentifier: profileUpdateLookup.identifier, lookupIsCpf: profileUpdateLookup.isCpf })
        : await registerMutation.mutateAsync({
          ...payload,
          city: regCity.trim(),
          uf: regUf.toUpperCase().slice(0, 2),
          referredByPhone: cleanReferralPhone,
          sourceRoute: requestedCheckRoute,
        });

      if ("blocked" in result && result.blocked) {
        setError(result.message || 'Cadastro não permitido.');
        setIsLoading(false);
        return;
      }
      if ((result as any).alreadyExists) {
        setError('Você já possui cadastro no sistema. Volte e entre usando o telefone ou CPF do seu cadastro original.');
        setIsLoading(false);
        return;
      }
      if (!result.success) {
        setError(result.message || 'Erro ao concluir cadastro. Verifique os dados.');
        setIsLoading(false);
        return;
      }

      // 3. Cadastro OK — chamar checkPhone para criar spreadsheetClient automaticamente
      toast.success(profileUpdateLookup ? 'Cadastro atualizado! Agora crie sua senha de acesso.' : 'Cadastro realizado! Agora crie sua senha de acesso.');
      setPhone(cleanPhone);
      setClientName(regName.trim());
      // Disparar checkPhone para garantir que spreadsheetClient seja criado
      try {
        await checkPhoneMutation.mutateAsync({ identifier: cleanPhone, isCpf: false, requestedRoute: requestedCheckRoute });
      } catch (_) { /* ignora erro — spreadsheetClient pode já ter sido criado */ }
      setProfileUpdateLookup(null);
      setStep('create_password');
    } catch (err: any) {
      setError(err?.message || 'Erro ao realizar cadastro. Tente novamente.');
    } finally {
      setIsLoading(false);
      setIsUploadingPhoto(false);
    }
  };

  const handleRequestRouteAccess = async () => {
    if (!restrictedPhone) return;
    try {
      const result = await requestRouteAccessMutation.mutateAsync({ phone: restrictedPhone, route: requestedAccessRoute });
      if (result.alreadyAllowed) {
        toast.success('Esta rota já está liberada para o seu cadastro.');
      } else if ("created" in result && result.created) {
        toast.success('Sua solicitação foi enviada ao administrador.');
      } else {
        toast.info('Sua solicitação de acesso já está em análise.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível solicitar o acesso.');
    }
  };

  // Criar senha
  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem'); return; }
    setIsLoading(true);
    try {
      const cleanPhone = (regPhone || phone).replace(/\D/g, '');
      if (isAutoMode) {
        await clientCreatePasswordAutoMutation.mutateAsync({ phone: cleanPhone, password, confirmPassword, sourceRoute });
        const loginResult = await loginMutation.mutateAsync({ phone: cleanPhone, password });
        if (loginResult.success) {
          localStorage.setItem('gastos_token', loginResult.token);
          localStorage.setItem('gastos_clientId', loginResult.clientId.toString());
          localStorage.setItem('gastos_clientName', loginResult.clientName);
          onLoginSuccess(loginResult.token, loginResult.clientId, loginResult.clientName);
        }
      } else {
        await clientCreatePasswordMutation.mutateAsync({ phone: cleanPhone, password, confirmPassword });
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

  // Login com senha existente
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await loginMutation.mutateAsync({ phone: phone.replace(/\D/g, ''), password, isCpf: false });
      if (result.success) {
        localStorage.setItem('gastos_token', result.token);
        localStorage.setItem('gastos_clientId', result.clientId.toString());
        localStorage.setItem('gastos_clientName', result.clientName);
        onLoginSuccess(result.token, result.clientId, result.clientName);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'PENDING_APPROVAL') setStep('pending_approval');
      else if (msg === 'Senha expirada') setStep('expired');
      else setError(msg || 'Senha incorreta');
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
    setRegReferralPhone('');
    setProfileUpdateLookup(null);
    setAllowedRoutes([]);
    setRestrictedPhone('');
  };

  const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  if (step === 'referral') {
    return (
      <ReferralAccessManifest
        initialPhone={regPhone}
        onGranted={({ phone: verifiedPhone, referralPhone }) => {
          setRegPhone(verifiedPhone);
          setRegReferralPhone(referralPhone || '');
          setError('');
          setStep('register');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] text-foreground flex items-center justify-center p-4">
      <Card className="relative w-full max-w-md overflow-hidden bg-card/80 backdrop-blur border border-primary/20 rounded-2xl shadow-lg shadow-primary/10 ring-1 ring-primary/10">
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/15 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_24px_-4px_var(--primary)]">
              {gastosLogoUrl ? (
                <img src={gastosLogoUrl} alt="Logo" className="w-12 h-12 object-contain rounded-xl" />
              ) : (
                <BarChart3 className="w-8 h-8 text-primary" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-primary/70 bg-clip-text text-transparent mb-1">
              {gastosTitle}
            </h1>
            <p className="text-sm text-muted-foreground">{gastosSubtitle}</p>
          </div>

          {/* ETAPA 1: TELEFONE */}
          {step === 'phone' && (
            <form onSubmit={handleCheckPhone} className="space-y-4">
              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center text-xs font-medium text-primary/90">Informe seu <strong>telefone ou CPF</strong> para localizar seu cadastro.</p>
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Phone className="w-4 h-4 inline mr-1.5 opacity-70" />Telefone (WhatsApp)
                </label>
                <Input
                  type="text" inputMode="numeric" placeholder="(11) 99999-9999"
                  value={formatPhone(phone)}
                  onChange={(e) => setPhone(normalizePhone(e.target.value))}
                  disabled={isLoading} autoFocus
                  className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/70"
                />
              </div>
              {activeField !== 'phone' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    CPF
                  </label>
                  <Input
                    type="text" inputMode="numeric" placeholder="000.000.000-00"
                    value={formatCpf(cpfInput)}
                    onChange={(e) => setCpfInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    disabled={isLoading}
                    className={`h-11 bg-input text-foreground placeholder:text-muted-foreground/70 ${cpfInputInvalid ? 'border-red-500 focus-visible:ring-red-500' : 'border-border'}`}
                  />
                  {cpfInputInvalid && <p className="mt-1 text-xs font-medium text-red-400">CPF inválido. Digite um CPF válido para continuar.</p>}
                </div>
              )}
              <Button
                type="submit"
                disabled={isLoading || (phone.replace(/\D/g, '').length < 10 && !cpfInputValid)}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
              >
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verificando...</> : gastosButtonText}
              </Button>
            </form>
          )}

          {/* ETAPA CADASTRO COMPLETO */}
          {step === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-1">
                <p className="text-sm text-blue-300 font-medium">{profileUpdateLookup ? '🔒 Atualização obrigatória de cadastro' : '📋 Novo cadastro'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{profileUpdateLookup ? `Complete somente o que falta: ${(profileUpdateLookup.missingFields || []).map((field) => ({ name: 'nome', phone: 'telefone', cpf: 'CPF', email: 'e-mail', photo: 'foto' } as Record<string, string>)[field] || field).join(', ')}. Nenhum novo cadastro será criado.` : 'Preencha seus dados para criar sua conta.'}</p>
              </div>
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Foto de perfil */}
              {isMissingProfileField('photo') && <div className="flex flex-col items-center gap-2">
                <div
                  className="w-20 h-20 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center cursor-pointer hover:border-primary/70 transition-colors overflow-hidden bg-card/60"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {regPhotoPreview ? (
                    <img src={regPhotoPreview} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <Camera className="w-6 h-6 text-muted-foreground mx-auto" />
                      <span className="text-xs text-muted-foreground">Foto</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" />
                  {regPhoto ? 'Trocar foto' : 'Selecionar foto de perfil *'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>}

              {/* Nome */}
              {isMissingProfileField('name') && <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  <User className="w-3 h-3 inline mr-1 opacity-70" />Nome completo *
                </label>
                <Input
                  type="text" placeholder="Seu nome completo"
                  value={regName} onChange={(e) => setRegName(e.target.value)}
                  disabled={isLoading}
                  className="h-10 bg-input border-border text-foreground text-sm"
                />
              </div>}

              {/* Telefone */}
              {isMissingProfileField('phone') && <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  <Phone className="w-3 h-3 inline mr-1 opacity-70" />Telefone (WhatsApp) *
                </label>
                <Input
                  type="text" inputMode="numeric" placeholder="(11) 99999-9999"
                  value={formatPhone(regPhone)}
                  onChange={(e) => setRegPhone(normalizePhone(e.target.value))}
                  disabled={isLoading}
                  className="h-10 bg-input border-border text-foreground text-sm"
                />
              </div>}

              {/* CPF */}
              {isMissingProfileField('cpf') && <div>
                <label className="block text-xs font-medium text-foreground mb-1">CPF *</label>
                <Input
                  type="text" inputMode="numeric" placeholder="000.000.000-00"
                  value={formatCpf(regCpf)}
                  onChange={(e) => setRegCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  disabled={isLoading}
                  className={`h-10 bg-input text-foreground text-sm ${regCpfInvalid ? 'border-red-500 focus-visible:ring-red-500' : 'border-border'}`}
                />
                {regCpfInvalid && <p className="mt-1 text-xs font-medium text-red-400">CPF inválido. Digite um CPF válido para continuar.</p>}
              </div>}

              {/* Email */}
              {isMissingProfileField('email') && <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  <Mail className="w-3 h-3 inline mr-1 opacity-70" />E-mail *
                </label>
                <Input
                  type="email" placeholder="seu@email.com"
                  value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                  disabled={isLoading}
                  className="h-10 bg-input border-border text-foreground text-sm"
                />
              </div>}



              {/* Cidade + UF */}
              {!profileUpdateLookup && <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">
                    <MapPin className="w-3 h-3 inline mr-1 opacity-70" />Cidade *
                  </label>
                  <Input
                    type="text" placeholder="Sua cidade"
                    value={regCity} onChange={(e) => setRegCity(e.target.value)}
                    disabled={isLoading}
                    className="h-10 bg-input border-border text-foreground text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">UF *</label>
                  <select
                    value={regUf}
                    onChange={(e) => setRegUf(e.target.value)}
                    disabled={isLoading}
                    className="w-full h-10 rounded-md border border-border bg-input text-foreground text-sm px-2"
                  >
                    <option value="">UF</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>}

              <Button
                type="submit"
                disabled={isLoading || !regName || (isMissingProfileField('photo') && !regPhoto) || regPhone.replace(/\D/g,'').length < 10 || !regCpfValid || !regEmail || (!profileUpdateLookup && (!regCity || !regUf || regReferralPhone.replace(/\D/g, '').length < 10))}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg mt-1"
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{isUploadingPhoto ? 'Enviando foto...' : 'Cadastrando...'}</>
                  : profileUpdateLookup ? '✅ Atualizar meu cadastro' : '✅ Criar minha conta'}
              </Button>
              {!requiredProfilePhone && (
                <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">
                  ← Voltar
                </button>
              )}
            </form>
          )}

          {/* ACESSO RESTRITO POR ROTA */}
          {step === 'access_restricted' && (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle className="w-7 h-7 text-amber-300 mx-auto mb-2" />
                <p className="text-base font-semibold text-amber-200">Acesso não autorizado</p>
                <p className="text-sm text-muted-foreground mt-2">Seu cadastro foi encontrado, mas esta área ainda não foi liberada pelo administrador.</p>
                {allowedRoutes.length > 0 && <p className="text-xs text-green-300 mt-3">Acesso atual: {allowedRoutes.join(', ')}</p>}
              </div>
              <Button type="button" onClick={handleRequestRouteAccess} disabled={requestRouteAccessMutation.isPending || !restrictedPhone} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                {requestRouteAccessMutation.isPending ? 'Enviando solicitação...' : 'Solicitar acesso'}
              </Button>
              <button type="button" onClick={resetToPhone} className="w-full text-sm text-primary hover:underline">← Voltar para minha área</button>
            </div>
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
                  <Lock className="w-4 h-4 inline mr-1.5 opacity-70" />Criar senha
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading} autoFocus className="h-11 bg-input border-border text-foreground pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Lock className="w-4 h-4 inline mr-1.5 opacity-70" />Confirmar senha
                </label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'} placeholder="Repita a senha"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading} className="h-11 bg-input border-border text-foreground pr-10"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit" disabled={isLoading || password.length < 6 || !confirmPassword}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
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
                <p className="text-sm text-primary font-medium">Bem-vindo{clientName ? `, ${clientName}` : ''}!</p>
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
                  <Lock className="w-4 h-4 inline mr-1.5 opacity-70" />Senha
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'} placeholder="Digite sua senha"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading} autoFocus className="h-11 bg-input border-border text-foreground pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit" disabled={isLoading || !password}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
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
                <p className="text-amber-300 font-semibold text-base mb-1">Aguardando liberação</p>
                <p className="text-sm text-muted-foreground">
                  Sua senha foi registrada. O administrador precisa definir a validade do seu acesso.
                </p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center mt-2">
                ← Voltar ao início
              </button>
            </div>
          )}

          {/* SENHA EXPIRADA */}
          {step === 'expired' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-red-500/15 border border-red-500/30 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-red-400" />
              </div>
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-300 font-semibold text-base mb-1">Acesso expirado</p>
                <p className="text-sm text-muted-foreground">Seu período de acesso encerrou. Aguarde o administrador renovar.</p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">← Voltar</button>
            </div>
          )}

          {/* VENCIDO SEM RENOVAÇÃO */}
          {step === 'expired_no_renew' && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 bg-orange-500/15 border border-orange-500/30 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-orange-400" />
              </div>
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                <p className="text-orange-300 font-semibold text-base mb-1">Acesso encerrado</p>
                <p className="text-sm text-muted-foreground">Entre em contato com o administrador para renovar seu acesso.</p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">← Voltar</button>
            </div>
          )}

          {/* BLOQUEADO */}
          {step === 'blocked' && (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-300 font-semibold text-base mb-1">Acesso bloqueado</p>
                <p className="text-sm text-muted-foreground">Este número está bloqueado. Entre em contato com o administrador.</p>
              </div>
              <button type="button" onClick={resetToPhone} className="w-full text-xs text-muted-foreground hover:text-foreground text-center">← Voltar</button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-primary/15">
            <p className="text-xs text-muted-foreground text-center">{gastosFooterText}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
