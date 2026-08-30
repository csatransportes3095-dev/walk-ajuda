import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
  fs.writeFileSync(path, content);
}

function replaceOnce(path, search, replacement, label) {
  const source = read(path);
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one match for ${label}, found ${count}`);
  write(path, source.replace(search, replacement));
}

function assertIncludes(path, text, label) {
  if (!read(path).includes(text)) throw new Error(`${path}: missing ${label}`);
}

const returnPathSource = `const STATIC_CUSTOMER_RETURN_PATHS = new Set(["/", "/login", "/acompanhar", "/gastos", "/emprestimo"]);\nconst SCHEDULE_RETURN_PATH = /^\\/agendar\\/[a-f0-9]{32}$/i;\n\nexport function sanitizeCustomerUpdateReturnPath(value: unknown): string {\n  const path = String(value ?? "").trim();\n  if (STATIC_CUSTOMER_RETURN_PATHS.has(path)) return path;\n  if (SCHEDULE_RETURN_PATH.test(path)) return path;\n  return "";\n}\n`;
write('shared/customerUpdateReturnPath.ts', returnPathSource);

const gate = 'client/src/components/CustomerProfileRedirectGate.tsx';
replaceOnce(
  gate,
  'import { trpc } from "@/lib/trpc";\n',
  'import { trpc } from "@/lib/trpc";\nimport { sanitizeCustomerUpdateReturnPath } from "@shared/customerUpdateReturnPath";\n',
  'shared return-path import',
);
replaceOnce(
  gate,
  'const CENTRAL_PATH = "/atualizarcadastro";\nconst CUSTOMER_ROUTES = new Set(["/", "/login", "/acompanhar", "/gastos", "/emprestimo"]);\n',
  'const CENTRAL_PATH = "/atualizarcadastro";\n',
  'legacy local return-path set',
);
replaceOnce(
  gate,
  'function normalizeReturnPath(pathname: string) {\n  if (CUSTOMER_ROUTES.has(pathname)) return pathname;\n  return "/";\n}\n\n',
  '',
  'legacy return-path normalizer',
);
replaceOnce(
  gate,
  '            returnTo: normalizeReturnPath(window.location.pathname),',
  '            returnTo: sanitizeCustomerUpdateReturnPath(window.location.pathname) || "/",',
  'central redirect returnTo',
);

const updatePage = 'client/src/pages/AtualizarCadastro.tsx';
replaceOnce(
  updatePage,
  'import { isValidCPF, normalizeCpf } from "@shared/cpf";\n',
  'import { isValidCPF, normalizeCpf } from "@shared/cpf";\nimport { sanitizeCustomerUpdateReturnPath } from "@shared/customerUpdateReturnPath";\n',
  'updater return-path import',
);
replaceOnce(
  updatePage,
  'const ALLOWED_RETURN_PATHS = new Set(["/", "/login", "/acompanhar", "/gastos", "/emprestimo"]);\n',
  '',
  'updater legacy return-path set',
);
replaceOnce(
  updatePage,
  '  return ALLOWED_RETURN_PATHS.has(raw) ? raw : "";',
  '  return sanitizeCustomerUpdateReturnPath(raw);',
  'safe dynamic return path',
);
replaceOnce(
  updatePage,
  '  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");',
  '  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || localStorage.getItem(CP_TOKEN_KEY) || "");',
  'reuse authenticated customer session',
);
replaceOnce(
  updatePage,
  '    if (!/^image\\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Use uma foto JPG, PNG ou WEBP.");',
  '    if (file.type && !/^image\\/(jpeg|png|webp)$/i.test(file.type)) return toast.error("Use uma foto JPG, PNG ou WEBP.");',
  'photo MIME compatibility',
);

const scheduleGuardSource = `import { findMainCustomerByIdentity, normalizeCustomerPhone } from "./customerAccess";\nimport { getMissingCustomerProfileFields, type RequiredCustomerProfileField } from "./customerProfile";\n\nexport type ScheduleProfileRequirement =\n  | { status: "complete"; phone: string; missing: RequiredCustomerProfileField[] }\n  | { status: "required"; phone: string; missing: RequiredCustomerProfileField[] }\n  | { status: "blocked"; phone: string; missing: RequiredCustomerProfileField[] }\n  | { status: "not_found"; phone: string; missing: RequiredCustomerProfileField[] };\n\nexport function classifyScheduleProfileCustomer(customer: any, phoneHint: unknown): ScheduleProfileRequirement {\n  const hintedPhone = normalizeCustomerPhone(phoneHint);\n  if (!customer) return { status: "not_found", phone: hintedPhone, missing: [] };\n\n  const phone = normalizeCustomerPhone(customer.phone) || hintedPhone;\n  if (Number(customer.blocked) === 1) return { status: "blocked", phone, missing: [] };\n\n  const missing = getMissingCustomerProfileFields(customer);\n  if (missing.length > 0) return { status: "required", phone, missing };\n  return { status: "complete", phone, missing: [] };\n}\n\nexport async function resolveScheduleProfileRequirement(customerPhone: unknown, dbArg?: any): Promise<ScheduleProfileRequirement> {\n  const phone = normalizeCustomerPhone(customerPhone);\n  if (!phone) return { status: "not_found", phone: "", missing: [] };\n  const customer = await findMainCustomerByIdentity({ phone }, dbArg);\n  return classifyScheduleProfileCustomer(customer, phone);\n}\n`;
write('server/scheduleProfileGuard.ts', scheduleGuardSource);

const scheduleRouter = 'server/routers/schedule.ts';
replaceOnce(
  scheduleRouter,
  'import { publicSiteUrl } from "../../shared/publicLinks";\n',
  'import { publicSiteUrl } from "../../shared/publicLinks";\nimport { resolveScheduleProfileRequirement } from "../scheduleProfileGuard";\n',
  'schedule profile guard import',
);
replaceOnce(
  scheduleRouter,
  'function makeToken(): string {\n  return crypto.randomBytes(16).toString("hex");\n}\n\n',
  `function makeToken(): string {\n  return crypto.randomBytes(16).toString("hex");\n}\n\nasync function assertScheduleProfileForAppointment(appointment: any) {\n  const profile = await resolveScheduleProfileRequirement(appointment?.customerPhone);\n  if (profile.status === "complete") return profile;\n  if (profile.status === "blocked") {\n    throw new TRPCError({ code: "FORBIDDEN", message: "Cadastro bloqueado. Fale com o atendimento." });\n  }\n  if (profile.status === "not_found") {\n    throw new TRPCError({ code: "FORBIDDEN", message: "Cadastro principal não encontrado. Fale com o atendimento antes de agendar." });\n  }\n  throw new TRPCError({ code: "FORBIDDEN", message: "Atualize seu cadastro antes de continuar o agendamento." });\n}\n\n`,
  'server-side appointment guard helper',
);
replaceOnce(
  scheduleRouter,
  '      const cfg = await getScheduleConfig();\n      // envia slots disponíveis sempre, para permitir reagendamento\n      const slots = await listAvailableScheduleSlots(appt.templateId ?? null);\n      return { found: true as const, appointment: appt, config: cfg, slots };',
  '      const cfg = await getScheduleConfig();\n      const profile = await resolveScheduleProfileRequirement(appt.customerPhone);\n      // O link público não libera horários enquanto o cadastro principal estiver pendente.\n      const slots = profile.status === "complete"\n        ? await listAvailableScheduleSlots(appt.templateId ?? null)\n        : [];\n      return { found: true as const, appointment: appt, config: cfg, slots, profile };',
  'getByToken central profile state',
);
replaceOnce(
  scheduleRouter,
  '    .mutation(async ({ input }) => {\n      const result = await confirmAppointment(input.token, input.slotId);\n      if (!result.ok) throw new TRPCError({ code: "CONFLICT", message: result.reason || "Não foi possível agendar" });',
  '    .mutation(async ({ input }) => {\n      const currentAppointment = await getAppointmentByToken(input.token);\n      if (!currentAppointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });\n      await assertScheduleProfileForAppointment(currentAppointment);\n      const result = await confirmAppointment(input.token, input.slotId);\n      if (!result.ok) throw new TRPCError({ code: "CONFLICT", message: result.reason || "Não foi possível agendar" });',
  'confirm server-side profile enforcement',
);
replaceOnce(
  scheduleRouter,
  '      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });\n      if (appt.status !== "confirmed") {',
  '      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });\n      await assertScheduleProfileForAppointment(appt);\n      if (appt.status !== "confirmed") {',
  'reschedule server-side profile enforcement',
);

const schedulePage = 'client/src/pages/SchedulePage.tsx';
replaceOnce(
  schedulePage,
  '  const [showMidnightWarning, setShowMidnightWarning] = useState(false);\n\n  const confirmMut',
  `  const [showMidnightWarning, setShowMidnightWarning] = useState(false);\n  const scheduleProfile = data?.found ? data.profile : null;\n\n  useEffect(() => {\n    if (!data?.found || scheduleProfile?.status !== "required") return;\n    const returnTo = \`/agendar/\${token}\`;\n    const query = new URLSearchParams({ phone: scheduleProfile.phone, returnTo });\n    window.location.replace(\`/atualizarcadastro?\${query.toString()}\`);\n  }, [data?.found, scheduleProfile?.phone, scheduleProfile?.status, token]);\n\n  const confirmMut`,
  'schedule redirect effect',
);
replaceOnce(
  schedulePage,
  '  if (!data?.found) {',
  `  if (data?.found && data.profile.status === "required") {\n    return (\n      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">\n        <div className="bg-black/40 border border-white/10 rounded-2xl p-8 max-w-md">\n          <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400 mx-auto mb-3" />\n          <h1 className="text-xl font-bold text-white mb-2">Atualização necessária</h1>\n          <p className="text-white/60 text-sm">Abrindo a atualização central do seu cadastro antes do agendamento.</p>\n        </div>\n      </div>\n    );\n  }\n\n  if (data?.found && data.profile.status === "blocked") {\n    return (\n      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">\n        <div className="bg-black/40 border border-red-500/20 rounded-2xl p-8 max-w-md">\n          <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />\n          <h1 className="text-xl font-bold text-white mb-2">Cadastro bloqueado</h1>\n          <p className="text-white/60 text-sm">Fale com o atendimento antes de continuar o agendamento.</p>\n        </div>\n      </div>\n    );\n  }\n\n  if (data?.found && data.profile.status === "not_found") {\n    return (\n      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#15102e] to-[#0a0a1a] flex items-center justify-center px-4 text-center">\n        <div className="bg-black/40 border border-yellow-500/20 rounded-2xl p-8 max-w-md">\n          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />\n          <h1 className="text-xl font-bold text-white mb-2">Cadastro não localizado</h1>\n          <p className="text-white/60 text-sm">Fale com o atendimento para vincular este agendamento ao seu cadastro principal.</p>\n        </div>\n      </div>\n    );\n  }\n\n  if (!data?.found) {`,
  'schedule blocked/required states',
);

const guardTest = `import { describe, expect, it } from "vitest";\nimport { classifyScheduleProfileCustomer } from "./scheduleProfileGuard";\n\nconst completeCustomer = {\n  name: "JOAO DA SILVA",\n  phone: "11999999999",\n  email: "joao@example.com",\n  cpf: "52998224725",\n  zipCode: "06454000",\n  addressLine: "RUA DAS FLORES",\n  neighborhood: "CENTRO",\n  addressNumber: "123",\n  city: "BARUERI",\n  uf: "SP",\n  profilePhotoUrl: "https://example.com/foto.jpg",\n  blocked: 0,\n};\n\ndescribe("scheduleProfileGuard", () => {\n  it("libera somente cadastro principal completo", () => {\n    expect(classifyScheduleProfileCustomer(completeCustomer, completeCustomer.phone).status).toBe("complete");\n  });\n\n  it("manda cadastro incompleto para a atualização central", () => {\n    const state = classifyScheduleProfileCustomer({ ...completeCustomer, profilePhotoUrl: "" }, completeCustomer.phone);\n    expect(state.status).toBe("required");\n    expect(state.missing).toContain("profilePhotoUrl");\n  });\n\n  it("bloqueia cadastro bloqueado", () => {\n    expect(classifyScheduleProfileCustomer({ ...completeCustomer, blocked: 1 }, completeCustomer.phone).status).toBe("blocked");\n  });\n\n  it("não libera agendamento sem cadastro principal", () => {\n    expect(classifyScheduleProfileCustomer(null, completeCustomer.phone)).toEqual({ status: "not_found", phone: completeCustomer.phone, missing: [] });\n  });\n});\n`;
write('server/scheduleProfileGuard.test.ts', guardTest);

const returnPathTest = `import { describe, expect, it } from "vitest";\nimport { sanitizeCustomerUpdateReturnPath } from "@shared/customerUpdateReturnPath";\n\ndescribe("customerUpdateReturnPath", () => {\n  it("preserva retorno seguro do agendamento por token", () => {\n    const token = "a".repeat(32);\n    expect(sanitizeCustomerUpdateReturnPath(\`/agendar/\${token}\`)).toBe(\`/agendar/\${token}\`);\n  });\n\n  it("preserva rotas fixas já autorizadas", () => {\n    expect(sanitizeCustomerUpdateReturnPath("/gastos")).toBe("/gastos");\n    expect(sanitizeCustomerUpdateReturnPath("/acompanhar")).toBe("/acompanhar");\n  });\n\n  it("rejeita open redirect e token inválido", () => {\n    expect(sanitizeCustomerUpdateReturnPath("https://evil.example/agendar/" + "a".repeat(32))).toBe("");\n    expect(sanitizeCustomerUpdateReturnPath("//evil.example")).toBe("");\n    expect(sanitizeCustomerUpdateReturnPath("/agendar/123")).toBe("");\n  });\n});\n`;
write('server/customerUpdateReturnPath.test.ts', returnPathTest);

const wiringTest = `import fs from "node:fs";\nimport { describe, expect, it } from "vitest";\n\nconst read = (path: string) => fs.readFileSync(path, "utf8");\n\ndescribe("agendamento usa somente a atualização central", () => {\n  it("protege leitura, confirmação e reagendamento no backend", () => {\n    const router = read("server/routers/schedule.ts");\n    expect(router).toContain("resolveScheduleProfileRequirement(appt.customerPhone)");\n    expect((router.match(/assertScheduleProfileForAppointment\\(/g) || []).length).toBeGreaterThanOrEqual(3);\n  });\n\n  it("redireciona o link de agendamento para /atualizarcadastro e volta ao mesmo token", () => {\n    const page = read("client/src/pages/SchedulePage.tsx");\n    expect(page).toContain("/atualizarcadastro?");\n    expect(page).toContain("const returnTo = `/agendar/${token}`");\n  });\n\n  it("mantém telefone fora do save do cliente e fora do adminUpdate", () => {\n    const customerUpdate = read("server/routers/customerUpdate.ts");\n    expect(customerUpdate).toContain("Telefone propositalmente não existe no input: é a identidade fixa do cliente.");\n    const saveBlock = customerUpdate.slice(customerUpdate.indexOf("  save: publicProcedure"));\n    expect(saveBlock).not.toContain("phone: z.string()");\n  });\n\n  it("não reintroduz a política antiga individual do ADM", () => {\n    expect(fs.existsSync("server/customerProfileUpdatePolicy.ts")).toBe(false);\n    expect(fs.existsSync("shared/customerProfileUpdate.ts")).toBe(false);\n  });\n\n  it("aceita foto válida mesmo quando o navegador não informa MIME", () => {\n    expect(read("client/src/pages/AtualizarCadastro.tsx")).toContain("if (file.type && !/^image\\\\/(jpeg|png|webp)$/i.test(file.type))");\n  });\n});\n`;
write('server/scheduleCentralUpdateWiring.test.ts', wiringTest);

assertIncludes(gate, 'sanitizeCustomerUpdateReturnPath(window.location.pathname)', 'schedule-safe return path in global gate');
assertIncludes(updatePage, 'localStorage.getItem(CP_TOKEN_KEY)', 'existing authenticated session reuse');
assertIncludes(schedulePage, 'scheduleProfile?.status !== "required"', 'central update redirect');
assertIncludes(scheduleRouter, 'await assertScheduleProfileForAppointment(currentAppointment);', 'backend confirmation guard');
assertIncludes(scheduleRouter, 'await assertScheduleProfileForAppointment(appt);', 'backend reschedule guard');

console.log('Schedule central update v2 patch applied successfully.');
