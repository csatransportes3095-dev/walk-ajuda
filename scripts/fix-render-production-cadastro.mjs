import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true }); fs.writeFileSync(path, content); }
function replaceOnce(path, search, replacement, label) {
  const source = read(path);
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one match for ${label}, found ${count}`);
  write(path, source.replace(search, replacement));
}
function replaceAllExact(path, search, replacement, expected, label) {
  const source = read(path);
  const count = source.split(search).length - 1;
  if (count !== expected) throw new Error(`${path}: expected ${expected} matches for ${label}, found ${count}`);
  write(path, source.split(search).join(replacement));
}
function replaceBetween(path, start, end, replacement, label) {
  const source = read(path);
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`${path}: markers not found for ${label}`);
  write(path, source.slice(0, a) + replacement + source.slice(b));
}
function assertIncludes(path, text, label) { if (!read(path).includes(text)) throw new Error(`${path}: missing ${label}`); }
function assertNotIncludes(path, text, label) { if (read(path).includes(text)) throw new Error(`${path}: still contains ${label}`); }

const requirements = `import { isValidCPF } from "@shared/cpf";\nimport { isRecoveredCustomerName } from "../shared/customerProfile";\nimport { normalizeCustomerCpf, normalizeCustomerEmail } from "./customerAccess";\n\nexport const REQUIRED_CUSTOMER_PROFILE_FIELDS = [\n  "name",\n  "email",\n  "cpf",\n  "cep",\n  "street",\n  "addressNumber",\n  "neighborhood",\n  "city",\n  "uf",\n  "profilePhotoUrl",\n] as const;\n\nexport type RequiredCustomerProfileField = (typeof REQUIRED_CUSTOMER_PROFILE_FIELDS)[number];\n\nexport function getMissingCustomerProfileFields(customer: any): RequiredCustomerProfileField[] {\n  const missing: RequiredCustomerProfileField[] = [];\n  const name = String(customer?.name || "").trim();\n  if (name.length < 2 || isRecoveredCustomerName(name)) missing.push("name");\n  if (!normalizeCustomerEmail(customer?.email)) missing.push("email");\n  const cpf = normalizeCustomerCpf(customer?.cpf);\n  if (!cpf || !isValidCPF(cpf)) missing.push("cpf");\n  if (String(customer?.cep || "").replace(/\\D/g, "").length !== 8) missing.push("cep");\n  if (String(customer?.street || "").trim().length < 2) missing.push("street");\n  if (String(customer?.addressNumber || "").trim().length < 1) missing.push("addressNumber");\n  if (String(customer?.neighborhood || "").trim().length < 2) missing.push("neighborhood");\n  if (String(customer?.city || "").trim().length < 2) missing.push("city");\n  if (!/^[A-Z]{2}$/.test(String(customer?.uf || "").trim().toUpperCase())) missing.push("uf");\n  if (!String(customer?.profilePhotoUrl || "").trim()) missing.push("profilePhotoUrl");\n  return missing;\n}\n`;
write('server/customerProfileRequirements.ts', requirements);

const customerUpdate = 'server/routers/customerUpdate.ts';
replaceOnce(customerUpdate,
  'import { storagePut } from "../storage";\nimport { getCustomerProfileUpdateState, hasCustomerProfilePhotoSubmission, markCustomerProfilePhotoSubmitted, markCustomerProfileUpdateCompleted } from "../customerProfileUpdatePolicy";\n',
  'import { storagePut } from "../storage";\nimport { getMissingCustomerProfileFields } from "../customerProfileRequirements";\n',
  'remove old profile policy import');
replaceBetween(customerUpdate,
  'function missingFields(customer: any) {',
  'async function passwordRows',
  'function missingFields(customer: any) {\n  return getMissingCustomerProfileFields(customer);\n}\n\n',
  'central missing fields helper');
replaceBetween(customerUpdate,
  'async function customerUpdateAlreadyCompleted',
  'function alreadyUpdatedError',
  'async function customerUpdateAlreadyCompleted(_db: any, customer: any) {\n  return missingFields(customer).length === 0;\n}\n\n',
  'remove policy completion dependency');
replaceOnce(customerUpdate,
  '      const policyState = await getCustomerProfileUpdateState(customer);\n      const requiredFields = Array.from(new Set([...missingFields(customer), ...policyState.effectiveFields]));',
  '      const requiredFields = missingFields(customer);',
  'profile required fields');
replaceOnce(customerUpdate,
  '        policyEnabled: policyState.enabled,\n        requiredFields,\n        pendingFields: requiredFields,\n        policyRevision: policyState.revision,',
  '        policyEnabled: false,\n        requiredFields,\n        pendingFields: requiredFields,\n        policyRevision: 0,',
  'neutral policy response metadata');
replaceOnce(customerUpdate,
  '      const policyState = await getCustomerProfileUpdateState(customer);\n      const comma = input.imageBase64.indexOf(",");',
  '      const comma = input.imageBase64.indexOf(",");',
  'photo policy state');
replaceOnce(customerUpdate,
  '      await db.execute(sql`UPDATE customers SET profilePhotoUrl=${url}, updatedAt=NOW() WHERE id=${customer.id}`);\n      await markCustomerProfilePhotoSubmitted(Number(customer.id), policyState.revision);\n      return { success: true, url };',
  '      await db.execute(sql`UPDATE customers SET profilePhotoUrl=${url}, updatedAt=NOW() WHERE id=${customer.id}`);\n      return { success: true, url };',
  'photo policy completion');
replaceOnce(customerUpdate,
  '      const policyState = await getCustomerProfileUpdateState(customer);\n      const selected = new Set([...missingFields(customer), ...policyState.effectiveFields, "cep", "street", "addressNumber", "neighborhood", "city", "uf"]);',
  '      const selected = new Set([...missingFields(customer), "cep", "street", "addressNumber", "neighborhood", "city", "uf"]);',
  'save policy selection');
replaceOnce(customerUpdate,
  '      if (policyState.enabled && selected.has("profilePhotoUrl") && !(await hasCustomerProfilePhotoSubmission(Number(customer.id), policyState.revision))) {\n        throw new TRPCError({ code: "BAD_REQUEST", message: "Envie uma nova foto de perfil para concluir esta atualização." });\n      }\n',
  '',
  'forced resubmission policy');
replaceOnce(customerUpdate,
  '      if (policyState.enabled) await markCustomerProfileUpdateCompleted(Number(customer.id), policyState.revision);\n      return { success: true, synchronization };',
  '      return { success: true, synchronization };',
  'save policy completion');

const customerPassword = 'server/routers/customerPassword.ts';
replaceOnce(customerPassword,
  'import { ensureCustomerIdentityInfrastructure, getRouteAccess, setCustomerRoutePermissions, type CustomerRoute } from "../customerAccess";\nimport { getCustomerProfileUpdateState } from "../customerProfileUpdatePolicy";\n',
  'import { ensureCustomerIdentityInfrastructure, getRouteAccess, setCustomerRoutePermissions, type CustomerRoute } from "../customerAccess";\nimport { getMissingCustomerProfileFields } from "../customerProfileRequirements";\n',
  'customer password policy import');
replaceOnce(customerPassword,
  'const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias\n',
  'const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias\n\nfunction getProfileUpdateMeta(customer: any) {\n  const fields = customer ? getMissingCustomerProfileFields(customer) : [];\n  return { profileUpdateRequired: fields.length > 0, profileUpdateFields: fields };\n}\n',
  'central profile meta helper');
replaceAllExact(customerPassword,
  '      const profileUpdateState = await getCustomerProfileUpdateState(cust);\n      const profileUpdateMeta = { profileUpdateRequired: profileUpdateState.pending, profileUpdateFields: profileUpdateState.effectiveFields };',
  '      const profileUpdateMeta = getProfileUpdateMeta(cust);',
  2,
  'status policy meta');
replaceOnce(customerPassword,
  '      const customer = await getCustomerByCleanPhone(cleanPhone);\n      const profileUpdateState = customer ? await getCustomerProfileUpdateState(customer) : null;',
  '      const customer = await getCustomerByCleanPhone(cleanPhone);\n      const profileUpdateMeta = getProfileUpdateMeta(customer);',
  'login profile meta');
replaceOnce(customerPassword,
  '        profileUpdateRequired: !!profileUpdateState?.pending,\n        profileUpdateFields: profileUpdateState?.effectiveFields || [],',
  '        ...profileUpdateMeta,',
  'login response meta');
replaceOnce(customerPassword,
  '      const profileUpdateState = customerForSession ? await getCustomerProfileUpdateState(customerForSession) : null;',
  '      const profileUpdateMeta = getProfileUpdateMeta(customerForSession);',
  'session profile meta');
replaceOnce(customerPassword,
  '        profileUpdateRequired: !!profileUpdateState?.pending,\n        profileUpdateFields: profileUpdateState?.effectiveFields || [],',
  '        ...profileUpdateMeta,',
  'session response meta');

const schedule = 'server/routers/schedule.ts';
replaceOnce(schedule,
  'import { parseMaintenanceManifest } from "../../shared/maintenanceManifest";\n',
  '',
  'maintenance manifest profile rule import');
replaceOnce(schedule,
  'import { findMainCustomerByIdentity, normalizeCustomerCpf, normalizeCustomerEmail, normalizeCustomerPhone } from "../customerAccess";\nimport { syncUnifiedCustomerRegistry } from "../customerIdentity";\nimport { storagePut } from "../storage";\nimport { getCustomerProfileUpdateState, hasCustomerProfilePhotoSubmission, markCustomerProfilePhotoSubmitted, markCustomerProfileUpdateCompleted } from "../customerProfileUpdatePolicy";\n',
  'import { findMainCustomerByIdentity, normalizeCustomerCpf, normalizeCustomerEmail, normalizeCustomerPhone } from "../customerAccess";\nimport { getMissingCustomerProfileFields } from "../customerProfileRequirements";\n',
  'schedule old parallel update imports');
replaceBetween(schedule,
  'export function missingCustomerFields(customer: any): string[] {',
  'export function shouldBlockScheduleCompletion',
  'export function missingCustomerFields(customer: any): string[] {\n  return getMissingCustomerProfileFields(customer);\n}\n\n',
  'schedule missing fields');
replaceOnce(schedule,
  '    SELECT id, customerNumber, name, phone, cpf, email, city, uf, profilePhotoUrl, blocked, deletedAt',
  '    SELECT id, customerNumber, name, phone, cpf, email, cep, street, addressNumber, neighborhood, addressComplement, city, uf, profilePhotoUrl, blocked, deletedAt',
  'schedule customer full profile select');
replaceOnce(schedule,
  'async function verifyCustomerPassword(db: any, phone: unknown, password: string): Promise<"ok" | "no_password" | "pending_approval" | "expired" | "wrong_password"> {\n  const current = await loadCustomerPassword(db, phone);\n  const state = getCustomerPasswordState(current);\n  if (state !== "active") return state;\n  return await bcrypt.compare(password, String(current?.password || "")) ? "ok" : "wrong_password";\n}\n',
  'async function verifyCustomerPassword(db: any, phone: unknown, password: string): Promise<"ok" | "no_password" | "pending_approval" | "expired" | "wrong_password"> {\n  const current = await loadCustomerPassword(db, phone);\n  const state = getCustomerPasswordState(current);\n  if (state !== "active") return state;\n  return await bcrypt.compare(password, String(current?.password || "")) ? "ok" : "wrong_password";\n}\n\nasync function createCentralCustomerSession(db: any, phoneValue: unknown): Promise<string> {\n  const phone = normalizeCustomerPhone(phoneValue);\n  if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do cadastro inválido." });\n  const token = crypto.randomBytes(32).toString("hex");\n  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);\n  await db.execute(sql`\n    INSERT INTO customerPasswordSessions (phone, token, expiresAt, createdAt, lastAccessAt)\n    VALUES (${phone}, ${token}, ${expiresAt}, NOW(), NOW())\n  `);\n  return token;\n}\n',
  'central customer session creator');
replaceBetween(schedule,
  'async function isCompleteProfileRequiredForSchedule()',
  'async function buildAuthenticatedScheduleData',
  'function rejectIncompleteScheduleProfile() {\n  throw new TRPCError({\n    code: "FORBIDDEN",\n    message: "Atualize seu cadastro em /atualizarcadastro antes de continuar o agendamento.",\n  });\n}\n\nasync function shouldBlockScheduleForCustomer(customer: any): Promise<boolean> {\n  return getMissingCustomerProfileFields(customer).length > 0;\n}\n\n',
  'schedule central requirement functions');
replaceOnce(schedule,
  'async function buildAuthenticatedScheduleData(appt: any, customer: any) {\n  const cfg = await getScheduleConfig();\n  const requireCompleteProfile = await isCompleteProfileRequiredForSchedule();\n  const profileUpdateState = await getCustomerProfileUpdateState(customer);\n  const missing = Array.from(new Set([\n    ...profileUpdateState.missingFields,\n    ...(profileUpdateState.enabled ? profileUpdateState.effectiveFields : []),\n  ]));\n  const updateRequired = profileUpdateState.pending || (requireCompleteProfile && missingCustomerFields(customer).length > 0);\n  const slots = await listAvailableScheduleSlots(appt.templateId ?? null);',
  'async function buildAuthenticatedScheduleData(appt: any, customer: any) {\n  const cfg = await getScheduleConfig();\n  const missing = getMissingCustomerProfileFields(customer);\n  const updateRequired = missing.length > 0;\n  const slots = updateRequired ? [] : await listAvailableScheduleSlots(appt.templateId ?? null);',
  'authenticated schedule central state');
replaceOnce(schedule,
  '      requiredFields: profileUpdateState.effectiveFields,',
  '      requiredFields: missing,',
  'schedule required field metadata');
replaceOnce(schedule,
  '      const accessToken = createScheduleAccessToken(input.token, Number(customer.id));\n      return { success: true as const, accessToken, data: await buildAuthenticatedScheduleData(appt, customer) };',
  '      const accessToken = createScheduleAccessToken(input.token, Number(customer.id));\n      const customerSessionToken = await createCentralCustomerSession(db, customer.phone);\n      return { success: true as const, accessToken, customerSessionToken, data: await buildAuthenticatedScheduleData(appt, customer) };',
  'schedule authorize central handoff');
replaceBetween(schedule,
  '  // Atualiza somente os campos que estavam faltantes no cadastro principal.',
  '  // Cliente confirma o horário escolhido (reserva exclusiva)',
  `  // Compatibilidade: os endpoints antigos continuam existindo, mas não podem mais alterar cadastro.\n  // Toda atualização é feita exclusivamente em /atualizarcadastro.\n  saveMissingProfile: publicProcedure\n    .input(z.object({\n      token: z.string().min(32).max(64),\n      accessToken: z.string().min(32).max(512),\n      phone: z.string().min(10).max(32).optional(),\n      name: z.string().trim().min(2).max(128).optional(),\n      email: z.string().trim().email().max(320).optional(),\n      cpf: z.string().min(11).max(18).optional(),\n      city: z.string().trim().min(2).max(128).optional(),\n      uf: z.string().trim().length(2).optional(),\n    }))\n    .mutation(async () => {\n      throw new TRPCError({ code: "FORBIDDEN", message: "Use /atualizarcadastro para atualizar seus dados." });\n    }),\n\n  uploadMissingProfilePhoto: publicProcedure\n    .input(z.object({ token: z.string().min(32).max(64), accessToken: z.string().min(32).max(512), imageBase64: z.string().min(100).max(8_000_000) }))\n    .mutation(async () => {\n      throw new TRPCError({ code: "FORBIDDEN", message: "Use /atualizarcadastro para atualizar sua foto." });\n    }),\n\n`,
  'disable parallel schedule profile update');

const updater = 'client/src/pages/AtualizarCadastro.tsx';
replaceOnce(updater,
  'const TOKEN_KEY = "customer_update_token";\n',
  'const TOKEN_KEY = "customer_update_token";\nconst RETURN_TO_KEY = "h2_customer_return_to";\n\nfunction getSafeReturnTo(): string {\n  if (typeof window === "undefined") return "/";\n  const raw = sessionStorage.getItem(RETURN_TO_KEY) || "";\n  if (["/", "/login", "/acompanhar", "/gastos", "/emprestimo"].includes(raw)) return raw;\n  if (/^\\/agendar\\/[a-f0-9]{32}$/i.test(raw)) return raw;\n  return "/";\n}\n',
  'safe updater return path');
replaceOnce(updater,
  '    const timer = window.setTimeout(() => {\n      window.location.replace("/");\n    }, 1200);',
  '    const returnTo = getSafeReturnTo();\n    sessionStorage.removeItem(RETURN_TO_KEY);\n    const timer = window.setTimeout(() => {\n      window.location.replace(returnTo);\n    }, 1200);',
  'return after update');
replaceOnce(updater,
  '    if (!/^image\\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Use uma foto JPG, PNG ou WEBP.");',
  '    if (file.type && !/^image\\/(jpeg|png|webp)$/i.test(file.type)) return toast.error("Use uma foto JPG, PNG ou WEBP.");',
  'photo MIME compatibility');
replaceOnce(updater,
  '    if (isRequired("phone") && normalizePhone(phone).length < 10) return toast.error("Digite um telefone válido.");\n',
  '',
  'remove phone edit validation');
replaceOnce(updater,
  '      await saveMutation.mutateAsync({ token, phone: normalizePhone(phone), name, email, cpf, cep: formatCep(cep), street, addressNumber, neighborhood, addressComplement, city, uf });',
  '      await saveMutation.mutateAsync({ token, name, email, cpf, cep: formatCep(cep), street, addressNumber, neighborhood, addressComplement, city, uf });',
  'remove phone from save payload');
replaceOnce(updater,
  '<Field label={`Telefone${isRequired("phone") ? " · obrigatório nesta revisão" : ""}`}><input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className={INPUT_CLASS} required={isRequired("phone")} readOnly={!isRequired("phone")} inputMode="tel" autoComplete="tel" /></Field>',
  '<Field label="Telefone confirmado · não editável"><input value={phone} className={`${INPUT_CLASS} bg-slate-200/80`} readOnly inputMode="tel" autoComplete="tel" /></Field>',
  'immutable phone field');

const schedulePage = 'client/src/pages/SchedulePage.tsx';
replaceOnce(schedulePage,
  '      try { sessionStorage.setItem(accessStorageKey, result.accessToken); } catch { /* sessão continua em memória */ }\n      setAccessToken(result.accessToken);',
  '      try {\n        sessionStorage.setItem(accessStorageKey, result.accessToken);\n        localStorage.setItem("cp_token", result.customerSessionToken);\n        localStorage.setItem("customer_update_token", result.customerSessionToken);\n      } catch { /* sessão continua em memória */ }\n      setAccessToken(result.accessToken);',
  'schedule central session handoff');
replaceOnce(schedulePage,
  '  const loadedProfile = data && "profile" in data ? data.profile : null;\n\n  useEffect(() => {\n    const profile = loadedProfile;',
  '  const loadedProfile = data && "profile" in data ? data.profile : null;\n\n  useEffect(() => {\n    if (!loadedProfile?.updateRequired) return;\n    const returnTo = `/agendar/${token}`;\n    sessionStorage.setItem("h2_customer_return_to", returnTo);\n    if (loadedProfile.phone) localStorage.setItem("customer_update_phone_hint", loadedProfile.phone);\n    window.location.replace("/atualizarcadastro");\n  }, [loadedProfile?.updateRequired, loadedProfile?.phone, token]);\n\n  useEffect(() => {\n    const profile = loadedProfile;',
  'schedule redirect effect');
replaceOnce(schedulePage,
  '  if (missingFields.length > 0) {',
  '  if (profileUpdateRequired || missingFields.length > 0) {\n    return (\n      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">\n        <div className="bg-black/40 border border-white/10 rounded-2xl p-8 max-w-md">\n          <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400 mx-auto mb-3" />\n          <h1 className="text-xl font-bold text-white mb-2">Atualização necessária</h1>\n          <p className="text-white/60 text-sm">Abrindo a atualização central do cadastro antes do agendamento.</p>\n        </div>\n      </div>\n    );\n  }\n\n  if (false && missingFields.length > 0) {',
  'central schedule loading gate');

write('server/customerProfileRequirements.test.ts', `import { describe, expect, it } from "vitest";\nimport { getMissingCustomerProfileFields } from "./customerProfileRequirements";\n\nconst complete = {\n  name: "JOAO DA SILVA", email: "joao@example.com", cpf: "52998224725",\n  cep: "06454000", street: "RUA A", addressNumber: "10", neighborhood: "CENTRO",\n  city: "BARUERI", uf: "SP", profilePhotoUrl: "https://example.com/foto.jpg", phone: "11999999999",\n};\n\ndescribe("customerProfileRequirements", () => {\n  it("não transforma telefone em campo de atualização", () => {\n    const fields = getMissingCustomerProfileFields({ ...complete, phone: "" });\n    expect(fields).not.toContain("phone");\n    expect(fields).toEqual([]);\n  });\n\n  it("usa uma única lista de dados realmente obrigatórios", () => {\n    const fields = getMissingCustomerProfileFields({ ...complete, profilePhotoUrl: "", addressNumber: "" });\n    expect(fields).toEqual(expect.arrayContaining(["profilePhotoUrl", "addressNumber"]));\n  });\n});\n`);

write('server/scheduleCentralProductionWiring.test.ts', `import fs from "node:fs";\nimport { describe, expect, it } from "vitest";\nconst read = (p: string) => fs.readFileSync(p, "utf8");\n\ndescribe("produção Render usa atualização central antes do agendamento", () => {\n  it("entrega sessão central ao autenticar o link de agendamento", () => {\n    const router = read("server/routers/schedule.ts");\n    expect(router).toContain("customerSessionToken = await createCentralCustomerSession");\n    expect(router).toContain("updateRequired ? [] : await listAvailableScheduleSlots");\n  });\n\n  it("desativa os dois caminhos paralelos de edição dentro do agendamento", () => {\n    const router = read("server/routers/schedule.ts");\n    expect(router).toContain("Use /atualizarcadastro para atualizar seus dados.");\n    expect(router).not.toContain("updates.push(sql\\`phone=");\n  });\n\n  it("redireciona para o atualizador e volta ao mesmo token", () => {\n    const page = read("client/src/pages/SchedulePage.tsx");\n    const updater = read("client/src/pages/AtualizarCadastro.tsx");\n    expect(page).toContain("window.location.replace(\"/atualizarcadastro\")");\n    expect(page).toContain("h2_customer_return_to");\n    expect(updater).toContain("/^\\\\/agendar\\\\/[a-f0-9]{32}$/i");\n    expect(updater).toContain("window.location.replace(returnTo)");\n  });\n\n  it("mantém telefone imutável no atualizador central", () => {\n    const updater = read("client/src/pages/AtualizarCadastro.tsx");\n    const backend = read("server/routers/customerUpdate.ts");\n    expect(updater).toContain("Telefone confirmado · não editável");\n    expect(updater).not.toContain("mutateAsync({ token, phone:");\n    const save = backend.slice(backend.indexOf("  save: publicProcedure"));\n    expect(save).not.toContain("phone: z.string()");\n    expect(save).not.toContain("normalizedPhone");\n  });\n\n  it("remove a política individual antiga dos fluxos ativos", () => {\n    for (const p of ["server/routers/customerUpdate.ts", "server/routers/customerPassword.ts", "server/routers/schedule.ts"]) {\n      expect(read(p)).not.toContain("customerProfileUpdatePolicy");\n      expect(read(p)).not.toContain("getCustomerProfileUpdateState");\n    }\n  });\n\n  it("aceita foto válida quando o navegador não informa MIME e mantém validação do backend", () => {\n    const updater = read("client/src/pages/AtualizarCadastro.tsx");\n    const backend = read("server/routers/customerUpdate.ts");\n    expect(updater).toContain("if (file.type && !/^image\\\\/(jpeg|png|webp)$/i.test(file.type))");\n    expect(backend).toContain("const isJpeg = buffer.length >= 3");\n    expect(backend).toContain("const isPng = buffer.length >= 8");\n    expect(backend).toContain("const isWebp = buffer.length >= 12");\n  });\n});\n`);

assertNotIncludes(customerUpdate, 'getCustomerProfileUpdateState', 'old policy state in customer updater');
assertNotIncludes(customerPassword, 'getCustomerProfileUpdateState', 'old policy state in customer login');
assertNotIncludes(schedule, 'getCustomerProfileUpdateState', 'old policy state in schedule');
assertIncludes(updater, 'Telefone confirmado · não editável', 'immutable phone UI');
assertIncludes(schedulePage, 'window.location.replace("/atualizarcadastro")', 'central updater redirect');
assertIncludes(schedule, 'customerSessionToken', 'central session handoff');
console.log('Render production cadastro/schedule patch applied.');
