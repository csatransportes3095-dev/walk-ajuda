import { useEffect } from "react";

/**
 * O cadastro já possui o campo obrigatório de indicador e o servidor valida
 * se o número pertence a um cliente ativo e liberado. Esta camada apenas remove
 * a etapa antiga/duplicada "INDICADOR OU CÓDIGO DE LIBERAÇÃO" que aparecia antes
 * do formulário principal.
 */
export default function RegistrationReferralGateBypass() {
  useEffect(() => {
    const processed = new WeakSet<HTMLFormElement>();

    const skipLegacyReferralGate = () => {
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
      for (const form of forms) {
        if (processed.has(form)) continue;
        const text = (form.textContent || "").toLocaleUpperCase("pt-BR");
        if (!text.includes("INDICADOR OU CÓDIGO DE LIBERAÇÃO")) continue;

        processed.add(form);
        // Evita piscar a tela duplicada antes de abrir o cadastro principal.
        form.style.display = "none";

        // O próprio submit legado já limpa/transporta o indicador e muda
        // gateStep para "registration". Sem preencher aqui, o indicador será
        // solicitado apenas no cadastro, que é a fonte única de verdade.
        queueMicrotask(() => {
          if (!document.body.contains(form)) return;
          form.requestSubmit();
        });
      }
    };

    skipLegacyReferralGate();
    const observer = new MutationObserver(skipLegacyReferralGate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
