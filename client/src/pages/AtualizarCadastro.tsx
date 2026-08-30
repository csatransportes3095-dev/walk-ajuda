import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Phone, ShieldCheck, Upload, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { isValidCPF, normalizeCpf } from "@shared/cpf";

const TOKEN_KEY = "customer_update_token";
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const INPUT_CLASS = "w-full rounded-xl border-2 border-white/10 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/15";

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

type Step = "phone" | "password" | "create_password" | "profile" | "done" | "already_done";

export default function AtualizarCadastro() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const loadedToken = useRef("");

  const statusMutation = trpc.customerUpdate.status.useMutation();
  const loginMutation = trpc.customerUpdate.login.useMutation();
  const createPasswordMutation = trpc.customerUpdate.createPassword.useMutation();
  const uploadPhotoMutation = trpc.customerUpdate.uploadPhoto.useMutation();
  const saveMutation = trpc.customerUpdate.save.useMutation();
  const profileQuery = trpc.customerUpdate.profile.useQuery(
    { token },
    { enabled: token.length >= 32, retry: false, refetchOnWindowFocus: false },
  );

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile || loadedToken.current === token) return;
    loadedToken.current = token;
    if (profile.completed) {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setStep("already_done");
      return;
    }
    setPhone(formatPhone(profile.phone));
    setName(profile.name || "");
    setEmail(profile.email || "");
    setCpf(formatCpf(profile.cpf || ""));
    setCep(formatCep(profile.cep || ""));
    setStreet(profile.street || "");
    setAddressNumber(profile.addressNumber || "");
    setNeighborhood(profile.neighborhood || "");
    setAddressComplement(profile.addressComplement || "");
    setCity(profile.city || "");
    setUf(profile.uf || "");
    setPhotoUrl(profile.profilePhotoUrl || "");
    setStep("profile");
  }, [profileQuery.data, token]);

  useEffect(() => {
    if (!profileQuery.error || !token) return;
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setStep("phone");
  }, [profileQuery.error, token]);

  function acceptToken(nextToken: string) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    loadedToken.current = "";
    setToken(nextToken);
    setPassword("");
    setConfirmPassword("");
  }

  async function checkPhone(event: FormEvent) {
    event.preventDefault();
    const clean = normalizePhone(phone);
    if (clean.length < 10) return toast.error("Digite um telefone válido.");
    try {
      const result = await statusMutation.mutateAsync({ phone: clean });
      if (result.status === "not_found") return toast.error("Cadastro não encontrado. Confira o telefone.");
      if (result.status === "blocked") return toast.error("Cadastro bloqueado. Fale com o atendimento.");
      if (result.status === "completed") {
        localStorage.removeItem(TOKEN_KEY);
        return setStep("already_done");
      }
      setStep(result.status === "password" ? "password" : "create_password");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível consultar o cadastro.");
    }
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await loginMutation.mutateAsync({ phone: normalizePhone(phone), password });
      if (!result.success) {
        if (result.error === "completed") return setStep("already_done");
        return toast.error(result.error === "wrong_password" ? "Senha incorreta." : "Não foi possível entrar.");
      }
      acceptToken(result.token);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível entrar.");
    }
  }

  async function createPassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 4) return toast.error("A senha precisa ter pelo menos 4 caracteres.");
    if (password !== confirmPassword) return toast.error("As senhas não são iguais.");
    try {
      const result = await createPasswordMutation.mutateAsync({ phone: normalizePhone(phone), password });
      if (!result.success) {
        if (result.error === "completed") return setStep("already_done");
        return toast.error(result.error === "password_exists" ? "Já existe uma senha. Digite a senha existente." : "Não foi possível criar a senha.");
      }
      acceptToken(result.token);
      toast.success("Senha criada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível criar a senha.");
    }
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("A foto deve ter no máximo 5 MB.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Use uma foto JPG, PNG ou WEBP.");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await uploadPhotoMutation.mutateAsync({ token, imageBase64: String(reader.result || "") });
        setPhotoUrl(result.url);
        toast.success("Foto enviada.");
      } catch (error: any) {
        toast.error(error?.message || "Não foi possível enviar a foto.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) return toast.error("CEP não encontrado. Preencha o endereço manualmente.");
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setNeighborhood(data.bairro);
      if (data.localidade) setCity(data.localidade);
      if (data.uf) setUf(String(data.uf).toUpperCase());
    } catch {
      toast.error("Não foi possível consultar o CEP. Preencha manualmente.");
    } finally {
      setCepLoading(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (isRequired("phone") && normalizePhone(phone).length < 10) return toast.error("Digite um telefone válido.");
    if (isRequired("cpf") && !isValidCPF(normalizeCpf(cpf))) return toast.error("Digite um CPF válido.");
    if (cep.replace(/\D/g, "").length !== 8) return toast.error("Digite um CEP válido.");
    if (street.trim().length < 2) return toast.error("Informe a rua / logradouro.");
    if (!addressNumber.trim()) return toast.error("Informe o número do endereço.");
    if (neighborhood.trim().length < 2) return toast.error("Informe o bairro.");
    if (city.trim().length < 2 || uf.trim().length !== 2) return toast.error("Informe cidade e estado.");
    if (!photoUrl) return toast.error("Envie sua foto de perfil.");
    try {
      await saveMutation.mutateAsync({ token, phone: normalizePhone(phone), name, email, cpf, cep: formatCep(cep), street, addressNumber, neighborhood, addressComplement, city, uf });
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setStep("done");
      toast.success("Cadastro atualizado em todo o sistema.");
    } catch (error: any) {
      if (String(error?.message || "").includes("já foi atualizado")) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        return setStep("already_done");
      }
      toast.error(error?.message || "Não foi possível atualizar o cadastro.");
    }
  }

  function restart() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setPhone("");
    setPassword("");
    setStep("phone");
  }

  const requiredFields = profileQuery.data?.requiredFields || [];
  const isRequired = (field: string) => requiredFields.includes(field as never);
  const requiredLabels = requiredFields.map((field) => ({
    name: "Nome completo",
    phone: "Telefone",
    email: "E-mail",
    cpf: "CPF",
    cep: "CEP",
    street: "Rua / Logradouro",
    addressNumber: "Número",
    neighborhood: "Bairro",
    city: "Cidade",
    uf: "Estado (UF)",
    profilePhotoUrl: "Foto de perfil",
  } as Record<string, string>)[field] || field);
  const busy = statusMutation.isPending || loginMutation.isPending || createPasswordMutation.isPending || profileQuery.isLoading;

  return (
    <main className="min-h-screen bg-[#060818] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/40 bg-violet-500/15 shadow-[0_0_35px_rgba(139,92,246,.25)]">
            <UserRoundCog className="h-8 w-8 text-violet-300" />
          </div>
          <p className="text-xs font-black tracking-[.2em] text-violet-300">WALK AJUDA</p>
          <h1 className="mt-2 text-3xl font-black">Atualizar cadastro</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Seus dados serão corrigidos no cadastro, pedidos, empréstimos e gastos.</p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur sm:p-7">
          {step === "phone" && (
            <form onSubmit={checkPhone} className="space-y-5">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                <p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5" />Atualização protegida por senha</p>
                <p className="mt-1 text-xs text-emerald-100/70">Digite o mesmo telefone usado no seu cadastro.</p>
              </div>
              <Field label="Telefone">
                <div className="relative"><Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" /><input autoFocus inputMode="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" className={`${INPUT_CLASS} pl-12`} /></div>
              </Field>
              <PrimaryButton busy={busy}>CONTINUAR</PrimaryButton>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={authenticate} className="space-y-5">
              <BackButton onClick={() => setStep("phone")} />
              <div className="text-center"><LockKeyhole className="mx-auto h-10 w-10 text-violet-300" /><h2 className="mt-3 text-xl font-black">Digite sua senha</h2><p className="mt-1 text-sm text-slate-400">Telefone {formatPhone(phone)}</p></div>
              <PasswordInput value={password} setValue={setPassword} visible={showPassword} setVisible={setShowPassword} />
              <PrimaryButton busy={loginMutation.isPending}>ENTRAR E ATUALIZAR</PrimaryButton>
            </form>
          )}

          {step === "create_password" && (
            <form onSubmit={createPassword} className="space-y-5">
              <BackButton onClick={() => setStep("phone")} />
              <div className="text-center"><LockKeyhole className="mx-auto h-10 w-10 text-emerald-300" /><h2 className="mt-3 text-xl font-black">Crie uma senha</h2><p className="mt-1 text-sm text-slate-400">Ela protegerá a atualização dos seus dados.</p></div>
              <PasswordInput value={password} setValue={setPassword} visible={showPassword} setVisible={setShowPassword} label="Nova senha" />
              <Field label="Confirmar senha"><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={4} className={INPUT_CLASS} placeholder="Digite a senha novamente" /></Field>
              <PrimaryButton busy={createPasswordMutation.isPending}>CRIAR SENHA E CONTINUAR</PrimaryButton>
            </form>
          )}

          {step === "profile" && profileQuery.data && (
            <form onSubmit={saveProfile} className="space-y-5">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Complete seus dados</h2><p className="text-xs text-slate-400">Telefone confirmado: {formatPhone(profileQuery.data.phone)}</p></div><button type="button" onClick={restart} className="text-xs font-bold text-violet-300">Trocar telefone</button></div>
              {requiredFields.length > 0 ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100"><p className="font-black">Atualização cadastral obrigatória pelo administrador.</p><p className="mt-1">Revise: {requiredLabels.join(", ")}.</p></div> : <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">Confira os dados abaixo para concluir sua atualização.</p>}
              <label className="block cursor-pointer rounded-2xl border border-dashed border-violet-400/50 bg-violet-400/5 p-4 text-center hover:bg-violet-400/10">
                {photoUrl ? <img src={photoUrl} alt="Foto de perfil" className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-violet-400" /> : <Upload className="mx-auto h-9 w-9 text-violet-300" />}
                <span className="mt-2 block text-sm font-bold">{uploadPhotoMutation.isPending ? "Enviando foto..." : photoUrl ? "Trocar foto de perfil" : "Enviar foto de perfil"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" disabled={uploadPhotoMutation.isPending || !isRequired("profilePhotoUrl")} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              </label>
              <Field label={`Telefone${isRequired("phone") ? " · obrigatório nesta revisão" : ""}`}><input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className={INPUT_CLASS} required={isRequired("phone")} readOnly={!isRequired("phone")} inputMode="tel" autoComplete="tel" /></Field>
              <Field label={`Nome completo${isRequired("name") ? " · obrigatório nesta revisão" : ""}`}><input value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT_CLASS} ${!isRequired("name") ? "bg-slate-200/80" : ""}`} required={isRequired("name")} readOnly={!isRequired("name")} minLength={2} autoComplete="name" /></Field>
              <Field label={`E-mail${isRequired("email") ? " · obrigatório nesta revisão" : ""}`}><input value={email} onChange={(e) => setEmail(e.target.value)} className={`${INPUT_CLASS} ${!isRequired("email") ? "bg-slate-200/80" : ""}`} required={isRequired("email")} readOnly={!isRequired("email")} type="email" inputMode="email" autoComplete="email" /></Field>
              <Field label={`CPF${isRequired("cpf") ? " · obrigatório nesta revisão" : ""}`}><input value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} className={`${INPUT_CLASS} ${!isRequired("cpf") ? "bg-slate-200/80" : ""}`} required={isRequired("cpf")} readOnly={!isRequired("cpf")} inputMode="numeric" placeholder="000.000.000-00" /></Field>
              <Field label="CEP · obrigatório"><input value={cep} onChange={(e) => { const next = formatCep(e.target.value); setCep(next); if (next.replace(/\D/g, "").length === 8) void lookupCep(next); }} onBlur={(e) => void lookupCep(e.target.value)} className={INPUT_CLASS} required inputMode="numeric" placeholder="00000-000" />{cepLoading && <span className="mt-1 block text-xs text-violet-300">Buscando CEP...</span>}</Field>
              <Field label="Rua / Logradouro · obrigatório"><input value={street} onChange={(e) => setStreet(e.target.value)} className={INPUT_CLASS} required placeholder="Rua, Avenida..." /></Field>
              <div className="grid grid-cols-[120px_1fr] gap-3"><Field label="Número · obrigatório"><input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} className={INPUT_CLASS} required placeholder="123 ou S/N" /></Field><Field label="Bairro · obrigatório"><input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={INPUT_CLASS} required /></Field></div>
              <Field label="Complemento · opcional"><input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} className={INPUT_CLASS} placeholder="Apto, bloco, fundos..." /></Field>
              <div className="grid grid-cols-[1fr_92px] gap-3"><Field label={`Cidade${isRequired("city") ? " · obrigatório nesta revisão" : ""}`}><input value={city} onChange={(e) => setCity(e.target.value)} className={`${INPUT_CLASS} ${!isRequired("city") ? "bg-slate-200/80" : ""}`} required={isRequired("city")} readOnly={!isRequired("city")} /></Field><Field label={`UF${isRequired("uf") ? " · obrigatório nesta revisão" : ""}`}><select value={uf} onChange={(e) => setUf(e.target.value)} className={INPUT_CLASS} required={isRequired("uf")} disabled={!isRequired("uf")}><option value="">UF</option>{UFS.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field></div>
              <PrimaryButton busy={saveMutation.isPending || uploadPhotoMutation.isPending}>SALVAR EM TODO O SISTEMA</PrimaryButton>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-5 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><div><h2 className="text-2xl font-black">Cadastro atualizado!</h2><p className="mt-2 text-sm leading-6 text-slate-400">Os dados foram sincronizados com pedidos, cadastro, empréstimos e gastos. Aguarde a liberação do site.</p></div></div>
          )}

          {step === "already_done" && (
            <div className="space-y-5 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><div><h2 className="text-2xl font-black">Seu cadastro já foi atualizado</h2><p className="mt-2 text-sm leading-6 text-slate-400">Aguarde a liberação do site.</p></div></div>
          )}
        </section>
        <p className="mt-5 text-center text-xs text-slate-600">Se não reconhecer o cadastro, não continue e fale com o atendimento.</p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>{children}</label>;
}

function PrimaryButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={busy} className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-4 font-black shadow-lg shadow-violet-950/50 transition active:scale-[.98] disabled:opacity-50">{busy ? "AGUARDE..." : children}</button>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-sm font-bold text-slate-400 hover:text-white">← Voltar</button>;
}

function PasswordInput({ value, setValue, visible, setVisible, label = "Senha existente" }: { value: string; setValue: (value: string) => void; visible: boolean; setVisible: (value: boolean) => void; label?: string }) {
  return <Field label={label}><div className="relative"><input type={visible ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)} minLength={4} maxLength={72} required autoFocus className={`${INPUT_CLASS} pr-12`} placeholder="Mínimo 4 caracteres" /><button type="button" onClick={() => setVisible(!visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></Field>;
}
