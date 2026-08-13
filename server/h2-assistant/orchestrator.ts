import { addAssistantMessage, enforceAssistantLimits, ensureAssistantConversation, getAssistantSettings, listAssistantMessages, writeAssistantAudit, type AssistantUserContext } from "./service";
import { createNavigationResult, executeReadTool, getNavigationTarget, type AssistantReadTool } from "./tools";
import { draftCreateAppointment, draftCreateEarning, draftCreateExpense, draftCreateGoal, draftCreateQuote } from "./write-actions";
import { H2_DIAGNOSTIC_EVENTS, h2Diagnostic, h2DiagnosticError, h2DiagnosticHttpError } from "./diagnostics";

export type AssistantResponse = {
  type: "answer" | "navigation" | "preview" | "error";
  message: string;
  conversationId: number;
  target?: string;
  path?: string;
  data?: unknown;
  preview?: unknown;
  action?: unknown;
};

type AssistantIntent = {
  kind: "answer" | "need_input" | "read" | "navigate" | "draft_expense" | "draft_earning" | "draft_goal" | "draft_appointment" | "draft_quote";
  message: string;
  tool: string | null;
  args: Record<string, unknown>;
};

const READ_TOOLS = new Set<AssistantReadTool>([
  "finance_today", "finance_month", "goal_month", "private_dashboard", "private_tomorrow", "private_client_search",
]);

const JSON_SCHEMA = {
  name: "h2_assistant_intent",
  strict: true,
  schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["answer", "need_input", "read", "navigate", "draft_expense", "draft_earning", "draft_goal", "draft_appointment", "draft_quote"] },
      message: { type: "string" },
      tool: { type: ["string", "null"] },
      argsJson: { type: "string" },
    },
    required: ["kind", "message", "tool", "argsJson"],
    additionalProperties: false,
  },
};

function brazilNow() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(new Date());
}

function parseJson(content: unknown): AssistantIntent | null {
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !["answer", "need_input", "read", "navigate", "draft_expense", "draft_earning", "draft_goal", "draft_appointment", "draft_quote"].includes((parsed as any).kind)) return null;
    let args: Record<string, unknown> = {};
    if (typeof (parsed as any).argsJson === "string" && (parsed as any).argsJson.trim()) {
      const decoded = JSON.parse((parsed as any).argsJson);
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return null;
      args = decoded as Record<string, unknown>;
    }
    return {
      kind: (parsed as any).kind,
      message: String((parsed as any).message || ""),
      tool: typeof (parsed as any).tool === "string" ? (parsed as any).tool : null,
      args,
    };
  } catch {
    return null;
  }
}

function firstText(value: unknown, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function deterministicIntent(text: string): AssistantIntent | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(abrir|ir para|vai para|mostrar).*\b(gasto|ganho|meta|graf|operac|emprest|cart|particular|analis)/.test(normalized)) {
    return { kind: "navigate", tool: "navigate", args: { target: normalized }, message: "" };
  }
  if (/(como foi|resumo|resultado|ganhei|gastei).*(hoje|dia)|^(hoje|meu dia)/.test(normalized)) {
    return { kind: "read", tool: "finance_today", args: {}, message: "" };
  }
  if (/(resumo|resultado|ganhos|gastos).*(mes|m[eê]s)|^(meu mes|meu m[eê]s)/.test(normalized)) {
    return { kind: "read", tool: "finance_month", args: {}, message: "" };
  }
  if (/(minha|ver|mostrar).*(meta|metas)/.test(normalized)) {
    return { kind: "read", tool: "goal_month", args: {}, message: "" };
  }
  if (/(agenda|agendamento).*(amanha|amanh[ãa])/.test(normalized)) {
    return { kind: "read", tool: "private_tomorrow", args: {}, message: "" };
  }
  if (/(h2 particular|meu particular|receber do particular)/.test(normalized)) {
    return { kind: "read", tool: "private_dashboard", args: {}, message: "" };
  }
  return null;
}

async function askOpenAI(history: Array<{ role: string; content: string }>, text: string): Promise<AssistantIntent | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  h2Diagnostic(H2_DIAGNOSTIC_EVENTS.openAiKeyPresent, { present: Boolean(apiKey) });
  if (!apiKey) {
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.openAiError, { operation: "chat", reason: "missing_key" });
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.openAiRequest, { operation: "chat" });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.H2_ASSISTANT_OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.15,
        max_tokens: 500,
        response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
        messages: [
          {
            role: "system",
            content: `Você é o H2 Assistente da Planilha H2 Colombiano. Data e hora Brasil: ${brazilNow()}.
Você responde SOMENTE com o JSON do schema. Seu trabalho é interpretar uma mensagem em português do motorista e escolher, no máximo, UMA intenção segura.
Ferramentas de consulta permitidas: finance_today, finance_month, goal_month, private_dashboard, private_tomorrow, private_client_search. Navegação permitida: gastos, ganhos, operacional, metas, graficos, emprestimos, analisador, particular e cartoes.
Para criar, use APENAS draft_expense, draft_earning, draft_goal, draft_appointment ou draft_quote. Criação nunca é executada agora: uma prévia é enviada ao usuário e só o botão CONFIRMAR executa. Nunca escolha ações de editar, excluir, quitar, estornar, cancelar, pagar fatura ou empréstimo.
Nunca gere SQL, código, credenciais, userId/clientId livre, nem assuma que uma escrita ocorreu. Não invente dados. Quando faltar informação obrigatória, use need_input, liste de forma curta apenas os campos faltantes e deixe args vazio.
Categorias de ganho: uber, 99, indrive, particular, deliveries, tips, outros. Categorias de gasto: combustivel, aluguel, manutencao, oleo, lavagem, seguro, internet, alimentacao, estacionamento, pedagio, financiamento, multa, acessorios, outros.
Para ganho/gasto, os argumentos precisam: date AAAA-MM-DD, category e amount número. Para meta: month AAAA-MM, monthlyGoal, dailyGoal opcional, weeklyGoal opcional. Para agendamento: clientId já selecionado pelo usuário, pickupAddress, destinationAddress, startsAt ISO, durationMinutes e finalPrice opcional. Para orçamento: clientId já selecionado, pickupAddress, destinationAddress e finalPrice. Se o usuário mencionar passageiro por nome sem ID, primeiro use private_client_search com o campo search.
Preencha argsJson com uma string JSON contendo somente os argumentos. Se não houver argumentos, argsJson deve ser "{}". Sua mensagem deve ser objetiva em português do Brasil, sem afirmar confirmação antes dela existir.`,
          },
          ...history.map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: firstText(item.content, 700) })),
          { role: "user", content: text },
        ],
      }),
    });
    if (!response.ok) {
      h2DiagnosticHttpError(H2_DIAGNOSTIC_EVENTS.openAiError, response.status, { operation: "chat" });
      throw new Error(`OpenAI respondeu ${response.status}`);
    }
    const payload = await response.json() as any;
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.openAiOk, { operation: "chat", status: response.status });
    return parseJson(payload?.choices?.[0]?.message?.content);
  } catch (error) {
    h2DiagnosticError(H2_DIAGNOSTIC_EVENTS.openAiError, error, { operation: "chat" });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeIntent(ctx: AssistantUserContext, conversationId: number, intent: AssistantIntent): Promise<Omit<AssistantResponse, "conversationId">> {
  if (intent.kind === "read") {
    if (!intent.tool || !READ_TOOLS.has(intent.tool as AssistantReadTool)) throw new Error("Ferramenta de consulta não permitida.");
    return executeReadTool(ctx, intent.tool as AssistantReadTool, { search: firstText(intent.args.search, 160) });
  }
  if (intent.kind === "navigate") {
    const target = getNavigationTarget(firstText(intent.args.target || intent.message, 80));
    if (!target) return { type: "answer", message: "Diga qual módulo deseja abrir: Gastos, Ganhos, Metas, Gráficos, H2 Particular, Empréstimos, Cartões ou Analisador." };
    return createNavigationResult(target);
  }
  if (intent.kind === "draft_expense") {
    return draftCreateExpense(ctx, { conversationId, date: String(intent.args.date || ""), category: String(intent.args.category || ""), amount: Number(intent.args.amount) });
  }
  if (intent.kind === "draft_earning") {
    return draftCreateEarning(ctx, { conversationId, date: String(intent.args.date || ""), category: String(intent.args.category || ""), amount: Number(intent.args.amount) });
  }
  if (intent.kind === "draft_goal") {
    return draftCreateGoal(ctx, { conversationId, month: String(intent.args.month || ""), dailyGoal: intent.args.dailyGoal === undefined ? undefined : Number(intent.args.dailyGoal), weeklyGoal: intent.args.weeklyGoal === undefined ? undefined : Number(intent.args.weeklyGoal), monthlyGoal: Number(intent.args.monthlyGoal) });
  }
  if (intent.kind === "draft_appointment") {
    return draftCreateAppointment(ctx, { conversationId, ...(intent.args as any) });
  }
  if (intent.kind === "draft_quote") {
    return draftCreateQuote(ctx, { conversationId, ...(intent.args as any) });
  }
  return { type: "answer", message: intent.message || "Posso consultar sua Planilha, abrir módulos e preparar um lançamento para sua confirmação." };
}

export async function processAssistantText(ctx: AssistantUserContext, input: { text: string; conversationId?: number }) {
  const text = input.text.trim();
  await enforceAssistantLimits(ctx, text);
  const conversationId = await ensureAssistantConversation(ctx, input.conversationId, text.slice(0, 80));
  await addAssistantMessage(ctx, { conversationId, role: "user", content: text });

  const previous = await listAssistantMessages(ctx, conversationId);
  const history = previous.slice(1, 9).reverse().map((message: { role: string; content: string }) => ({ role: message.role, content: message.content }));
  let intent = deterministicIntent(text);
  let provider = "deterministic";
  if (!intent) {
    try {
      intent = await askOpenAI(history, text);
      provider = "openai";
    } catch (error: any) {
      await writeAssistantAudit(ctx, "OPENAI_FALHOU", "orchestrator", { reason: firstText(error?.message, 180) }, { conversationId });
    }
  }
  if (!intent) intent = { kind: "answer", tool: null, args: {}, message: process.env.OPENAI_API_KEY ? "Não entendi totalmente. Você pode pedir um resumo, abrir um módulo ou informar o lançamento que deseja preparar." : "Posso atender consultas diretas e abrir módulos. Para pedidos mais detalhados, tente explicar com outras palavras ou continue pelo texto." };

  let response: Omit<AssistantResponse, "conversationId">;
  try {
    response = await executeIntent(ctx, conversationId, intent);
    if (intent.message && response.type !== "answer" && response.type !== "preview") response.message = intent.message;
  } catch (error: any) {
    response = { type: "error", message: error?.message || "Não consegui concluir essa solicitação." };
  }

  await addAssistantMessage(ctx, { conversationId, role: "assistant", content: response.message, intent: intent.kind, toolName: intent.tool || undefined, metadata: { type: response.type, provider } });
  await writeAssistantAudit(ctx, "MENSAGEM_PROCESSADA", intent.tool || "chat", { intent: intent.kind, provider, responseType: response.type }, { conversationId });
  return { ...response, conversationId } satisfies AssistantResponse;
}

export async function transcribeAssistantAudio(ctx: AssistantUserContext, input: { audioBase64: string; mimeType: string; durationSeconds: number }) {
  const settings = await getAssistantSettings(ctx);
  if (!Number(settings.voiceEnabled)) throw new Error("Voz temporariamente indisponível. Você pode continuar usando o H2 pelo texto.");
  const normalizedMime = String(input.mimeType || "audio/webm").toLowerCase().split(";")[0];
  const allowed = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"]);
  if (!allowed.has(normalizedMime)) throw new Error("Formato de áudio não permitido.");
  const binary = Buffer.from(input.audioBase64, "base64");
  h2Diagnostic(H2_DIAGNOSTIC_EVENTS.audioBytes, { bytes: binary.length, mimeType: normalizedMime });
  if (!binary.length || binary.length > 5 * 1024 * 1024) throw new Error("O áudio deve ter no máximo 5 MB.");
  await enforceAssistantLimits(ctx, "[áudio]", Math.max(1, Math.min(90, Math.round(Number(input.durationSeconds) || 0))));
  const apiKey = process.env.OPENAI_API_KEY;
  h2Diagnostic(H2_DIAGNOSTIC_EVENTS.openAiKeyPresent, { present: Boolean(apiKey) });
  if (!apiKey) {
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.transcriptionError, { reason: "missing_key" });
    throw new Error("Voz temporariamente indisponível. Você pode continuar usando o H2 pelo texto.");
  }

  const form = new FormData();
  const extension = normalizedMime === "audio/mp4" ? "m4a" : normalizedMime === "audio/mpeg" ? "mp3" : normalizedMime.includes("wav") ? "wav" : normalizedMime === "audio/ogg" ? "ogg" : "webm";
  form.append("file", new Blob([binary], { type: normalizedMime }), `h2-audio.${extension}`);
  form.append("model", process.env.H2_ASSISTANT_OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.transcriptionStart, { mimeType: normalizedMime });
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal });
    if (!response.ok) {
      h2DiagnosticHttpError(H2_DIAGNOSTIC_EVENTS.transcriptionError, response.status, { mimeType: normalizedMime });
      throw new Error("Não foi possível transcrever o áudio agora.");
    }
    const payload = await response.json() as { text?: string };
    const text = firstText(payload.text, 2_000);
    if (!text) throw new Error("Não consegui compreender o áudio. Tente falar novamente ou digite.");
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.transcriptionOk, { status: response.status, textLength: text.length });
    await writeAssistantAudit(ctx, "AUDIO_TRANSCRITO", "openai.transcription", { durationSeconds: Math.round(Number(input.durationSeconds) || 0), textLength: text.length });
    return { text };
  } catch (error) {
    h2DiagnosticError(H2_DIAGNOSTIC_EVENTS.transcriptionError, error, { mimeType: normalizedMime });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function synthesizeAssistantSpeech(ctx: AssistantUserContext, text: string) {
  const settings = await getAssistantSettings(ctx);
  if (!Number(settings.voiceEnabled)) throw new Error("Voz temporariamente indisponível. Você pode continuar usando o H2 pelo texto.");
  const content = firstText(text, 1_000);
  if (!content) throw new Error("Não há texto para transformar em voz.");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { audioBase64: null, audioMimeType: null, fallback: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model: process.env.H2_ASSISTANT_OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: process.env.H2_ASSISTANT_OPENAI_TTS_VOICE || "alloy", input: content, response_format: "mp3" }),
    });
    if (!response.ok) return { audioBase64: null, audioMimeType: null, fallback: true };
    const audio = Buffer.from(await response.arrayBuffer()).toString("base64");
    await writeAssistantAudit(ctx, "AUDIO_SINTETIZADO", "openai.tts", { textLength: content.length });
    return { audioBase64: audio, audioMimeType: "audio/mpeg", fallback: false };
  } finally {
    clearTimeout(timeout);
  }
}
