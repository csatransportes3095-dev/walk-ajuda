import fs from 'node:fs';

function once(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one target, got ${count}`);
  return source.replace(before, after);
}

{
  const file = 'server/routers.ts';
  let s = fs.readFileSync(file, 'utf8');
  const start = s.indexOf('    uploadProfilePhoto: publicProcedure');
  const end = s.indexOf('    // Admin: definir/atualizar senha fixa de um cliente', start);
  if (start < 0 || end < 0) throw new Error('Photo route boundaries not found');
  let route = s.slice(start, end);
  route = once(route, '        phone: z.string(),', '        phone: z.string(),\n        requireExisting: z.boolean().optional(),', 'photo input');
  route = once(route,
    '        const fileKey = `profile-photos/${input.phone}-${Date.now()}.${ext}`;',
    `        const { resolveProfilePhotoCustomer, persistCustomerProfilePhoto } = await import('./customerProfilePhoto');
        const { phone: normalizedPhotoPhone, customer } = await resolveProfilePhotoCustomer(input.phone, input.requireExisting === true);
        const { randomUUID } = await import('node:crypto');
        const fileKey = \`profile-photos/\${normalizedPhotoPhone}-\${Date.now()}-\${randomUUID()}.\${ext}\`;`, 'photo target and key');
  route = once(route,
    `        // Salvar a URL direta do CloudFront (pública, não expira)
        const customer = await getCustomerByPhone(input.phone);
        if (customer) {
          await updateCustomer(customer.id, { profilePhotoUrl: url });`,
    `        // Storage atual: confirmar a gravacao no cadastro ativo antes de informar sucesso.
        const photoPersistence = customer
          ? await persistCustomerProfilePhoto(customer, url)
          : { saved: false, customerId: null };
        if (customer) {`, 'photo persistence');
  route = once(route, '        return { success: true, url };', '        return { success: true, url, ...photoPersistence };', 'photo response');
  s = s.slice(0, start) + route + s.slice(end);
  if (!s.includes('    getProfilePhotoRecoveryCandidates: adminProcedure')) {
    const recovery = `    // Recuperacao somente pelo ADM; listar nao altera dados e a escolha e explicita.
    getProfilePhotoRecoveryCandidates: adminProcedure
      .input(z.object({ customerId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { listRecoverableProfilePhotos } = await import('./customerProfilePhoto');
        return listRecoverableProfilePhotos(input.customerId);
      }),
    restoreProfilePhoto: adminProcedure
      .input(z.object({ customerId: z.number().int().positive(), key: z.string().min(1).max(512), expectedPhotoUrl: z.string().max(2048).nullable() }))
      .mutation(async ({ input }) => {
        const { restoreCustomerProfilePhoto } = await import('./customerProfilePhoto');
        return restoreCustomerProfilePhoto(input);
      }),

`;
    s = s.replace('    uploadProfilePhoto: publicProcedure', recovery + '    uploadProfilePhoto: publicProcedure');
  }
  fs.writeFileSync(file, s);
}

{
  const file = 'client/src/pages/AdminCustomers.tsx';
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('import { ProfilePhotoRecovery }')) s = 'import { ProfilePhotoRecovery } from "@/components/ProfilePhotoRecovery";\n' + s;
  s = once(s, 'export default function AdminCustomers() {', 'export default function AdminCustomers() {\n  const profilePhotoUtils = trpc.useUtils();', 'customer utils');
  s = once(s,
    'const [failedProfilePhotoIds, setFailedProfilePhotoIds] = useState<Set<number>>(() => new Set());',
    'const [failedProfilePhotoIds, setFailedProfilePhotoIds] = useState<Map<number, string>>(() => new Map());', 'URL scoped failed state');
  s = once(s, 'c.profilePhotoUrl && !failedProfilePhotoIds.has(c.id)', 'c.profilePhotoUrl && failedProfilePhotoIds.get(c.id) !== c.profilePhotoUrl', 'retry changed avatar URL');
  s = once(s,
    'onError={() => setFailedProfilePhotoIds((previous) => new Set(previous).add(c.id))}',
    'onError={() => setFailedProfilePhotoIds((previous) => new Map(previous).set(c.id, c.profilePhotoUrl!))}', 'remember failed URL');
  s = once(s,
    `  const uploadPhotoMut = trpc.customers.uploadProfilePhoto.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Foto atualizada!"); setUploadingPhotoFor(null); },
    onError: () => { toast.error("Erro ao enviar foto"); setUploadingPhotoFor(null); },
  });`,
    `  const handleProfilePhotoSaved = (id: number, url: string) => {
    setFailedProfilePhotoIds(previous => { const next = new Map(previous); next.delete(id); return next; });
    if (editingId === id) {
      setEditProfilePhotoUrl(url);
      setEditOriginal(previous => previous ? { ...previous, profilePhotoUrl: url } : previous);
    }
    void customersQuery.refetch();
    void profilePhotoUtils.orderStatus.listOrders.invalidate();
  };
  const uploadPhotoMut = trpc.customers.uploadProfilePhoto.useMutation({
    onSuccess: data => {
      setUploadingPhotoFor(null);
      if (!data.saved || !data.customerId) { toast.error("Imagem enviada, mas não vinculada ao cadastro. Atualize a tela e confira o cliente."); return; }
      handleProfilePhotoSaved(data.customerId, data.url);
      toast.success("Foto salva no cadastro!");
    },
    onError: error => { toast.error(error.message || "Erro ao enviar foto"); setUploadingPhotoFor(null); },
  });`, 'customer save confirmation');
  s = once(s,
    '      uploadPhotoMut.mutate({ imageBase64: base64, phone: customer.phone });\n    };\n    reader.readAsDataURL(file);',
    '      uploadPhotoMut.mutate({ imageBase64: base64, phone: customer.phone, requireExisting: true });\n    };\n    reader.onerror = () => { setUploadingPhotoFor(null); toast.error("Não foi possível ler a foto."); };\n    reader.readAsDataURL(file);', 'customer upload requirement');
  s = once(s, 'URL da foto de perfil</label>', 'URL da foto de perfil</label>\n                        <ProfilePhotoRecovery customerId={c.id} onSaved={handleProfilePhotoSaved} />', 'recovery control');
  fs.writeFileSync(file, s);
}

{
  const file = 'client/src/pages/AdminOrders.tsx';
  let s = fs.readFileSync(file, 'utf8');
  s = once(s,
    `  const uploadPhotoMut = trpc.customers.uploadProfilePhoto.useMutation({
    onSuccess: () => { toast.success("Foto atualizada!"); ordersQuery.refetch(); setUploadingPhotoOrderId(null); },
    onError: () => { toast.error("Erro ao enviar foto"); setUploadingPhotoOrderId(null); },
  });`,
    `  const uploadPhotoMut = trpc.customers.uploadProfilePhoto.useMutation({
    onSuccess: data => {
      setUploadingPhotoOrderId(null);
      if (!data.saved || !data.customerId) { toast.error("Imagem enviada, mas não vinculada ao cadastro. Confira o cliente."); return; }
      toast.success("Foto salva no cadastro!");
      void ordersQuery.refetch();
      void trpcUtils.customers.invalidate();
    },
    onError: error => { toast.error(error.message || "Erro ao enviar foto"); setUploadingPhotoOrderId(null); },
  });`, 'order save confirmation');
  s = once(s,
    '      uploadPhotoMut.mutate({ imageBase64: base64, phone });\n    };\n    reader.readAsDataURL(file);',
    '      uploadPhotoMut.mutate({ imageBase64: base64, phone, requireExisting: true });\n    };\n    reader.onerror = () => { setUploadingPhotoOrderId(null); toast.error("Não foi possível ler a foto."); };\n    reader.readAsDataURL(file);', 'order upload requirement');
  fs.writeFileSync(file, s);
}
console.log('Photo upload, active-customer persistence, avatar retry and explicit recovery wired.');
