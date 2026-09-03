import fs from 'node:fs';

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${file}: esperado 1 trecho, encontrado ${count}`);
  }
  fs.writeFileSync(file, source.replace(before, after));
}

const backend = 'server/routers/customerUpdate.ts';
replaceOnce(
  backend,
  'import { publicProcedure, router } from "../_core/trpc";',
  'import { adminProcedure, publicProcedure, router } from "../_core/trpc";'
);

const partialRoute = `  adminCreatePartial: adminProcedure
    .input(z.object({
      phone: z.string().min(10).max(32),
      name: z.string().max(128).optional(),
      email: z.string().max(320).optional(),
      cpf: z.string().max(18).optional(),
      city: z.string().max(128).optional(),
      uf: z.string().max(2).optional(),
      profilePhotoUrl: z.string().max(2048).optional(),
      referredByPhone: z.string().max(32).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      await ensureCustomerIdentityInfrastructure(db);

      const phone = normalizeCustomerPhone(input.phone);
      if (!phone || !/^\\d{10,11}$/.test(phone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido." });
      }
      const duplicate = await findMainCustomerByIdentity({ phone }, db);
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Este telefone já identifica outro cadastro." });
      }

      const email = input.email?.trim() ? normalizeCustomerEmail(input.email) : "";
      if (input.email?.trim() && !email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });
      }
      const cpf = input.cpf?.trim() ? normalizeCustomerCpf(input.cpf) : "";
      if (input.cpf?.trim() && (!cpf || !isValidCPF(cpf))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      }
      const uf = String(input.uf || "").trim().toUpperCase();
      if (uf && !/^[A-Z]{2}$/.test(uf)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
      }

      if (cpf) {
        const conflict = await findMainCustomerByIdentity({ cpf }, db);
        if (conflict) throw new TRPCError({ code: "CONFLICT", message: "CPF já pertence a outro cadastro." });
      }
      if (email) {
        const conflict = await findMainCustomerByIdentity({ email }, db);
        if (conflict) throw new TRPCError({ code: "CONFLICT", message: "E-mail já pertence a outro cadastro." });
      }

      let referredBy = "";
      const referredByPhone = input.referredByPhone?.trim() ? normalizeCustomerPhone(input.referredByPhone) : "";
      if (input.referredByPhone?.trim()) {
        if (!referredByPhone || !/^\\d{10,11}$/.test(referredByPhone)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do indicador inválido." });
        }
        const referrer = await findMainCustomerByIdentity({ phone: referredByPhone }, db);
        if (!referrer) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do indicador não encontrado no sistema." });
        }
        referredBy = String(referrer.name || "").trim();
      }

      const nextRows = await rows(db, sql\`SELECT COALESCE(MAX(CASE WHEN customerNumber <> 99999 THEN customerNumber END), 451) + 1 AS nextNum FROM customers\`);
      const customerNumber = Number(nextRows[0]?.nextNum || 1);
      const name = String(input.name || "").trim().replace(/\\s+/g, " ") || "CADASTRO RECUPERADO";
      const city = String(input.city || "").trim().replace(/\\s+/g, " ");
      const profilePhotoUrl = String(input.profilePhotoUrl || "").trim();

      await db.execute(sql\`
        INSERT INTO customers (
          customerNumber, name, phone, email, city, uf, cpf,
          referredBy, referredByPhone, profilePhotoUrl
        ) VALUES (
          \${customerNumber}, \${name.toUpperCase()}, \${phone}, \${email || null},
          \${city ? city.toUpperCase() : null}, \${uf || null}, \${cpf || null},
          \${referredBy ? referredBy.toUpperCase() : null}, \${referredByPhone || null}, \${profilePhotoUrl || null}
        )
      \`);

      try {
        await syncUnifiedCustomerRegistry();
      } catch (error: any) {
        console.warn('[customerUpdate.adminCreatePartial] sincronização unificada não aplicada:', error?.message);
      }
      const customer = await findMainCustomerByIdentity({ phone }, db);
      return { success: true, customer, incomplete: customer ? missingFields(customer).length > 0 : true };
    }),

`;
replaceOnce(backend, '  save: publicProcedure\n', partialRoute + '  save: publicProcedure\n');

const page = 'client/src/pages/AdminCustomers.tsx';
replaceOnce(page, '  const adminCreateMut = trpc.customers.adminCreate.useMutation({', '  const adminCreateMut = trpc.customerUpdate.adminCreatePartial.useMutation({');
replaceOnce(page, 'Nome completo *', 'Nome completo');
replaceOnce(page, 'Telefone do indicador cadastrado *', 'Telefone do indicador cadastrado (opcional)');
replaceOnce(page, 'Obrigatório para criar o cadastro. O sistema confere se o número já pertence a um cliente.', 'Opcional no cadastro manual do ADM. Se informado, o sistema confere se o número pertence a um cliente.');
replaceOnce(page, 'Foto de perfil *', 'Foto de perfil');
replaceOnce(page, '✓ Foto obrigatória enviada', '✓ Foto enviada');
replaceOnce(
  page,
  `                    if (!createName.trim()) { setCreateError('Nome é obrigatório'); return; }\n                    if (createPhone.length < 10) { setCreateError('Telefone inválido (mínimo 10 dígitos)'); return; }\n                    if (createReferrerPhone.length < 10) { setCreateError('Informe o telefone válido do indicador cadastrado'); return; }\n                    if (createCpf.length !== 11) { setCreateError('CPF obrigatório e inválido'); return; }\n                    if (!/^\\S+@\\S+\\.\\S+$/.test(createEmail.trim())) { setCreateError('E-mail obrigatório e inválido'); return; }\n                    if (!createPhotoUrl) { setCreateError('Foto de perfil obrigatória'); return; }`,
  `                    if (createPhone.length < 10) { setCreateError('Telefone inválido (mínimo 10 dígitos)'); return; }`
);
replaceOnce(page, '                      name: createName.trim(),', '                      name: createName.trim() || undefined,');
replaceOnce(page, '                      email: createEmail.trim(),', '                      email: createEmail.trim() || undefined,');
replaceOnce(page, '                      cpf: createCpf,', '                      cpf: createCpf || undefined,');
replaceOnce(page, '                      profilePhotoUrl: createPhotoUrl,', '                      profilePhotoUrl: createPhotoUrl || undefined,');
replaceOnce(page, '                      referredByPhone: createReferrerPhone,', '                      referredByPhone: createReferrerPhone || undefined,');

const test = 'server/adminCustomerReferralGate.test.ts';
replaceOnce(
  test,
  'const routerSource = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");\nconst customerPage = fs.readFileSync(path.join(root, "client/src/pages/AdminCustomers.tsx"), "utf8");',
  'const routerSource = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");\nconst customerUpdateSource = fs.readFileSync(path.join(root, "server/routers/customerUpdate.ts"), "utf8");\nconst customerPage = fs.readFileSync(path.join(root, "client/src/pages/AdminCustomers.tsx"), "utf8");'
);
replaceOnce(
  test,
  `  it("exige telefone de indicador e reutiliza a regra central no cadastro manual", () => {\n    expect(routerSource).toContain("referredByPhone: z.string().regex(/^\\\\d{10,11}$/");\n    expect(routerSource).toContain("const restrictedAccessError = restrictedReferralAccessError(referral);");\n    expect(routerSource).toContain("Erro ao registrar indicação do cadastro manual");\n    expect(customerPage).toContain("Telefone do indicador cadastrado *");\n    expect(customerPage).toContain("referredByPhone: createReferrerPhone");\n  });`,
  `  it("cadastro manual do ADM permite campos vazios e exige somente telefone", () => {\n    expect(customerUpdateSource).toContain("adminCreatePartial: adminProcedure");\n    expect(customerUpdateSource).toContain("phone: z.string().min(10).max(32)");\n    expect(customerPage).toContain("trpc.customerUpdate.adminCreatePartial.useMutation");\n    expect(customerPage).toContain("Telefone do indicador cadastrado (opcional)");\n    expect(customerPage).toContain("cpf: createCpf || undefined");\n    expect(customerPage).toContain("profilePhotoUrl: createPhotoUrl || undefined");\n    expect(customerPage).not.toContain("CPF obrigatório e inválido");\n    expect(customerPage).not.toContain("Foto de perfil obrigatória");\n  });`
);

console.log('Patch do cadastro manual parcial aplicado com sucesso.');
