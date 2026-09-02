import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'client/src/pages/AdminOrders.tsx');
const source = fs.readFileSync(file, 'utf8');

const loginBefore = `  const loginDataQuery = trpc.loginData.get.useQuery(
    { registrationId: expandedNumericId },
    { enabled: expandedId !== null && activeTab[expandedId!] === "status" }
  );`;

const loginAfter = `  const isExpandedStatusTab = expandedId !== null && (!activeTab[expandedId] || activeTab[expandedId] === "status");

  const loginDataQuery = trpc.loginData.get.useQuery(
    { registrationId: expandedNumericId },
    { enabled: isExpandedStatusTab, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );`;

const pinBefore = `  const customerPinQuery = trpc.customerPin.adminGet.useQuery(
    { phone: expandedPhone },
    { enabled: !!expandedPhone && expandedId !== null && activeTab[expandedId!] === "status" }
  );`;

const pinAfter = `  const customerPinQuery = trpc.customerPin.adminGet.useQuery(
    { phone: expandedPhone },
    { enabled: !!expandedPhone && isExpandedStatusTab, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );`;

const mutationBlock = `  const saveLoginDataMut = trpc.loginData.save.useMutation({
    onSuccess: (_result, variables) => {
      toast.success('Dados de login salvos!');
      setLoginAuthenticatorQr(prev => { const next = { ...prev }; delete next[\`order_\${variables.registrationId}\`]; delete next[\`rgcnh_\${variables.registrationId}\`]; delete next[String(variables.registrationId)]; return next; });
      loginDataQuery.refetch();
    },
    onError: (error) => toast.error(error.message || 'Erro ao salvar dados de login'),
  });`;

const autosaveBlock = `${mutationBlock}

  // Backup operacional: qualquer alteração textual nos Dados de Login é persistida
  // automaticamente no banco após uma pequena pausa. O botão manual continua existindo
  // e o QR privado continua sendo salvo apenas pelo fluxo explícito do admin.
  const autoSaveLoginDataMut = trpc.loginData.save.useMutation({
    onSuccess: () => { void loginDataQuery.refetch(); },
    onError: (error) => toast.error(error.message || 'Falha no salvamento automático dos dados de login'),
  });
  const loginAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedLoginDraft = expandedId ? loginFields[expandedId] : undefined;

  useEffect(() => {
    if (!isExpandedStatusTab || !expandedId || !expandedLoginDraft || !loginDataQuery.isFetched || !expandedPhone) return;

    const saved = (loginDataQuery.data || {}) as any;
    const clean = (value: unknown) => String(value ?? '');
    const unchanged =
      clean(saved.loginPhone) === expandedLoginDraft.loginPhone &&
      clean(saved.loginEmail) === expandedLoginDraft.loginEmail &&
      clean(saved.loginPassword) === expandedLoginDraft.loginPassword &&
      clean(saved.authCode).replace(/-/g, '') === expandedLoginDraft.authCode.replace(/-/g, '') &&
      clean(saved.emailLink) === expandedLoginDraft.emailLink &&
      clean(saved.loginNotes) === expandedLoginDraft.loginNotes &&
      clean(saved.loginGroupLink) === expandedLoginDraft.loginGroupLink;

    if (unchanged) return;
    if (loginAutosaveTimerRef.current) clearTimeout(loginAutosaveTimerRef.current);

    loginAutosaveTimerRef.current = setTimeout(() => {
      autoSaveLoginDataMut.mutate({
        registrationId: expandedNumericId,
        customerPhone: expandedPhone,
        loginPhone: expandedLoginDraft.loginPhone,
        loginEmail: expandedLoginDraft.loginEmail,
        loginPassword: expandedLoginDraft.loginPassword,
        authCode: expandedLoginDraft.authCode,
        emailLink: expandedLoginDraft.emailLink,
        loginNotes: expandedLoginDraft.loginNotes,
        loginGroupLink: expandedLoginDraft.loginGroupLink,
        authenticatorQrAction: 'keep',
      });
    }, 900);

    return () => {
      if (loginAutosaveTimerRef.current) clearTimeout(loginAutosaveTimerRef.current);
    };
  }, [
    isExpandedStatusTab,
    expandedId,
    expandedNumericId,
    expandedPhone,
    loginDataQuery.isFetched,
    loginDataQuery.data,
    expandedLoginDraft?.loginPhone,
    expandedLoginDraft?.loginEmail,
    expandedLoginDraft?.loginPassword,
    expandedLoginDraft?.authCode,
    expandedLoginDraft?.emailLink,
    expandedLoginDraft?.loginNotes,
    expandedLoginDraft?.loginGroupLink,
  ]);`;

let next = source;

if (next.includes(loginBefore)) {
  next = next.replace(loginBefore, loginAfter);
} else if (!next.includes('const isExpandedStatusTab = expandedId !== null')) {
  throw new Error('Trecho loginData esperado não encontrado; patch abortado para não alterar arquivo incorreto.');
}

if (next.includes(pinBefore)) {
  next = next.replace(pinBefore, pinAfter);
} else if (!next.includes('{ enabled: !!expandedPhone && isExpandedStatusTab')) {
  throw new Error('Trecho customerPin esperado não encontrado; patch abortado para não alterar arquivo incorreto.');
}

if (next.includes(mutationBlock)) {
  next = next.replace(mutationBlock, autosaveBlock);
} else if (!next.includes('const autoSaveLoginDataMut = trpc.loginData.save.useMutation')) {
  throw new Error('Trecho saveLoginDataMut esperado não encontrado; patch de autosave abortado.');
}

fs.writeFileSync(file, next);
console.log('[patch-admin-login-data-reload] Login persistido na aba Status padrão + autosave textual habilitado.');
