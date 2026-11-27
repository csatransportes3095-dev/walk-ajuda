import { describe, expect, it } from "vitest";
import {
  canonicalH2AdsServiceKey,
  describeH2AdsOrderBrowserBlock,
  isH2AdsPreparationStalled,
  H2ADS_PREPARATION_RECOVERY_MS,
  resolveH2AdsOrderBrowserShortcutState,
  resolveH2AdsOrderLinkRepairCandidate,
} from "../shared/h2adsOrderBrowserShortcut";

const base = {
  registrationId: 100,
  subOrderIndex: 2,
  links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 2 }],
  instances: [{ id: 9, status: "draft" }],
  assignments: [{ instanceId: 9, workerId: 7 }],
  workers: [{ id: 7, connectionStatus: "online" }],
};

describe("H2ADS recuperacao segura de preparacao", () => {
  it("so considera expirada uma fila/preparacao antiga, nunca Chrome aberto", () => {
    const now = Date.parse("2026-11-23T18:00:00Z");
    const aged = new Date(now - H2ADS_PREPARATION_RECOVERY_MS - 1);
    expect(isH2AdsPreparationStalled("queued", aged, now)).toBe(true);
    expect(isH2AdsPreparationStalled("preparing", aged, now)).toBe(true);
    expect(isH2AdsPreparationStalled("preparing", new Date(now - 60_000), now)).toBe(false);
    for (const state of ["browser_open", "closed", "proxy_verified", "blocked"]) {
      expect(isH2AdsPreparationStalled(state, aged, now)).toBe(false);
    }
    expect(isH2AdsPreparationStalled("preparing", null, now)).toBe(false);
  });
});

describe("H2ADS order browser shortcut", () => {
  it("usa somente o vínculo exato de pedido e subpedido", () => {
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [] })?.instanceId).toBe(9);
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, subOrderIndex: 1, runs: [] })).toBeNull();
  });

  it("não adivinha quando o pedido possui outro vínculo", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({
      ...base,
      subOrderIndex: 3,
      links: [
        { instanceId: 9, registrationId: 100, subOrderIndex: 0 },
        { instanceId: 10, registrationId: 100, subOrderIndex: 1 },
      ],
      instances: [{ id: 9, status: "draft" }, { id: 10, status: "draft" }],
      assignments: [{ instanceId: 9, workerId: 7 }, { instanceId: 10, workerId: 7 }],
      runs: [],
    });
    expect(result).toBeNull();
  });

  it("exige seleção explícita quando duas instâncias pertencem ao mesmo pedido", () => {
    const multi = {
      ...base,
      links: [
        { instanceId: 9, registrationId: 100, subOrderIndex: 2 },
        { instanceId: 10, registrationId: 100, subOrderIndex: 2 },
      ],
      instances: [{ id: 9, status: "draft" }, { id: 10, status: "draft" }],
      assignments: [{ instanceId: 9, workerId: 7 }, { instanceId: 10, workerId: 8 }],
      workers: [{ id: 7, connectionStatus: "online" }, { id: 8, connectionStatus: "offline" }],
      runs: [{ instanceId: 9, state: "closed" }, { instanceId: 10, state: "closed" }],
    };
    expect(resolveH2AdsOrderBrowserShortcutState(multi)).toBeNull();
    expect(resolveH2AdsOrderBrowserShortcutState({ ...multi, instanceId: 9 })?.canOpen).toBe(true);
    expect(resolveH2AdsOrderBrowserShortcutState({ ...multi, instanceId: 10 })?.canOpen).toBe(false);
    expect(resolveH2AdsOrderBrowserShortcutState({ ...multi, instanceId: 999 })).toBeNull();
  });

  it("libera abrir quando o perfil está pronto ou fechado", () => {
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [{ instanceId: 9, state: "proxy_verified" }] })?.canOpen).toBe(true);
    expect(resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [{ instanceId: 9, state: "closed" }] })?.canOpen).toBe(true);
  });

  it("libera somente fechar quando o browser está aberto", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, runs: [{ instanceId: 9, state: "browser_open" }] });
    expect(result?.canOpen).toBe(false);
    expect(result?.canClose).toBe(true);
  });

  it("bloqueia os atalhos quando o Worker está offline", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, workers: [{ id: 7, connectionStatus: "offline" }], runs: [{ instanceId: 9, state: "closed" }] });
    expect(result?.canOpen).toBe(false);
    expect(result?.canClose).toBe(false);
    expect(result?.reason).toBe("Worker offline.");
  });

  it("bloqueia instância arquivada", () => {
    const result = resolveH2AdsOrderBrowserShortcutState({ ...base, instances: [{ id: 9, status: "archived" }], runs: [{ instanceId: 9, state: "closed" }] });
    expect(result?.canOpen).toBe(false);
    expect(result?.reason).toContain("arquivada");
  });
});

describe("H2ADS legacy order link repair", () => {
  it("normaliza aliases equivalentes de nome completo", () => {
    expect(canonicalH2AdsServiceKey("UBER APP", "NOME COMPLETO")).toBe("uber|nome_completo");
    expect(canonicalH2AdsServiceKey("UBER APP", "UBER NOME / COMPLETO")).toBe("uber|nome_completo");
  });

  it("normaliza aliases tradicionais das opções", () => {
    expect(canonicalH2AdsServiceKey("UBER APP", "NOME ALEATÓRIO")).toBe("uber|nome_aleatorio");
    expect(canonicalH2AdsServiceKey("UBER APP", "PRIMEIRO NOME")).toBe("uber|primeiro_nome");
  });

  it("oferece reparo somente quando existe um candidato único do mesmo cliente e serviço", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [
        { id: 100, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "UBER NOME / COMPLETO" },
        { id: 200, subOrderIndex: 0, customerNumber: 2021, orderNumber: 100008, serviceName: "UBER APP", serviceOption: "NOME COMPLETO" },
      ],
    });
    expect(result).toMatchObject({ instanceId: 9, linkedRegistrationId: 100, linkedSubOrderIndex: 0, linkedOrderNumber: 310000, serviceKey: "uber|nome_completo" });
  });

  it("não sugere instância de pedido já entregue, mesmo com mesmo cliente e serviço", () => {
    const input = {
      registrationId: 200, subOrderIndex: 0, customerNumber: 2021,
      serviceName: "UBER APP", serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [
        { id: 100, subOrderIndex: 0, customerNumber: 2021, latestStatus: "pedido_entregue", serviceName: "UBER APP", serviceOption: "NOME COMPLETO" },
        { id: 200, subOrderIndex: 0, customerNumber: 2021, latestStatus: "agendamento_confirmado", serviceName: "UBER APP", serviceOption: "NOME COMPLETO" },
      ],
      instances: [{ id: 9, groupId: 4 }],
      groups: [{ id: 4, name: "NOME COMPLETO" }],
    };
    expect(resolveH2AdsOrderLinkRepairCandidate(input)).toBeNull();
    expect(resolveH2AdsOrderLinkRepairCandidate({ ...input, orders: input.orders.map(o => ({ ...o, latestStatus: "em_analise" })), groups: [{ id: 4, name: "ENTREGUE" }] })).toBeNull();
    expect(resolveH2AdsOrderLinkRepairCandidate({ ...input, orders: input.orders.map(o => ({ ...o, latestStatus: "em_analise" })) })?.instanceId).toBe(9);
  });

  it("não oferece reparo quando há dois candidatos compatíveis", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [
        { instanceId: 9, registrationId: 100, subOrderIndex: 0 },
        { instanceId: 10, registrationId: 101, subOrderIndex: 0 },
      ],
      orders: [
        { id: 100, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "UBER NOME / COMPLETO" },
        { id: 101, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310001, serviceName: "UBER APP", serviceOption: "NOME COMPLETO" },
      ],
    });
    expect(result).toBeNull();
  });

  it("não oferece reparo para cliente diferente", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [{ id: 100, subOrderIndex: 0, customerNumber: 9999, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "NOME COMPLETO" }],
    });
    expect(result).toBeNull();
  });

  it("não oferece reparo para serviço diferente", () => {
    const result = resolveH2AdsOrderLinkRepairCandidate({
      registrationId: 200,
      subOrderIndex: 0,
      customerNumber: 2021,
      serviceName: "UBER APP",
      serviceOption: "NOME COMPLETO",
      links: [{ instanceId: 9, registrationId: 100, subOrderIndex: 0 }],
      orders: [{ id: 100, subOrderIndex: 0, customerNumber: 2021, orderNumber: 310000, serviceName: "UBER APP", serviceOption: "NOME ALEATÓRIO" }],
    });
    expect(result).toBeNull();
  });
});


describe("H2ADS pedido - diagnostico de abertura", () => {
  it("explica erro de proxy sem revelar credenciais", () => {
    const issue = describeH2AdsOrderBrowserBlock({
      state: "blocked", reason: "Instância bloqueada; revise no H2ADS.",
      errorCategory: "proxy_auth_407", networkHealthStatus: "healthy",
    });
    expect(issue.message).toContain("rejeitou");
    expect(issue.message).not.toContain("password");
  });
  it("protege uma sessao ja aberta", () => {
    const issue = describeH2AdsOrderBrowserBlock({ state: "browser_open", reason: null });
    expect(issue.guidance).toContain("Não prepare novamente");
  });
  it("mostra que o Worker offline impede abertura", () => {
    const issue = describeH2AdsOrderBrowserBlock({ state: "closed", reason: "Worker offline." });
    expect(issue.message).toBe("Worker offline.");
  });
  it("orienta validar a rota sem troca automatica", () => {
    const issue = describeH2AdsOrderBrowserBlock({ state: "blocked", reason: "Instância bloqueada; revise no H2ADS.", networkHealthStatus: "failed" });
    expect(issue.guidance).toContain("PREPARAR NOVAMENTE");
    expect(issue.guidance).not.toContain("Troque o proxy");
  });
});

describe("H2ADS pedido - provisionamento incompleto", () => {
  it("não orienta preparar repetidamente quando a credencial está ausente", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: false });
    expect(result.message).toContain("Nenhuma credencial");
    expect(result.guidance).toContain("CONCLUIR CONFIGURAÇÃO");
    expect(result.guidance).toContain("mesma instância");
  });
  it("distingue a falha de validação da ausência de associação", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: false, missingProxyDiagnostic: { status: "failed", errorCategory: "proxy_timeout" } });
    expect(result.message).toContain("tempo de espera");
  });
  it("não autoriza contornar verificação humana", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: false, missingProxyDiagnostic: { status: "failed", errorCategory: "proxy_google_challenge" } });
    expect(result.message).toContain("Google");
    expect(result.guidance).toContain("não tente contornar");
  });
  it("não exibe dados arbitrários de diagnóstico", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: false, missingProxyDiagnostic: { status: "failed", errorCategory: "user:password@example.com" } });
    expect(result.message).toBe("O provisionamento da rota falhou.");
    expect(JSON.stringify(result)).not.toContain("password");
  });
  it("preserva preparação de rotas já associadas", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: true });
    expect(result.guidance).toContain("PREPARAR NOVAMENTE");
  });
});

describe("H2ADS retoma configuração no card", () => {
  it("prioriza o motivo da rota ausente sobre Worker ainda não atribuído", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: "Worker ainda não atribuído.", proxyConfigured: false, missingProxyDiagnostic: {status:"failed",errorCategory:"proxy_google_challenge"} });
    expect(result.message).toContain("Google");
    expect(result.guidance).toContain("não tente contornar");
  });
  it("orienta concluir no próprio card quando Worker não foi atribuído", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: "Worker ainda não atribuído.", proxyConfigured: true });
    expect(result.guidance).toContain("CONCLUIR CONFIGURAÇÃO");
    expect(result.guidance).not.toContain("painel");
  });
  it("mantém reprovada a rota anterior sem selecionar substituta", () => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: false, missingProxyDiagnostic: {status:"failed",errorCategory:"proxy_timeout"} });
    expect(result.guidance).toContain("nenhuma nova rota");
  });
});


describe("H2ADS status resumido", () => {
  it.each([["proxy_google_access_denied", "403"], ["proxy_google_rate_limited", "429"]])("diferencia %s sem liberar rota", (errorCategory, expected) => {
    const result = describeH2AdsOrderBrowserBlock({ state: "not_prepared", reason: null, proxyConfigured: false, missingProxyDiagnostic: { status: "failed", errorCategory } });
    expect(result.message).toContain(expected);
    expect(result.guidance).toContain("nenhuma nova rota");
  });
});
