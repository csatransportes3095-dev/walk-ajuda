import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

function digits(value: string): string {
  let phone = String(value || "").replace(/\D/g, "");
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  return phone.slice(0, 11);
}

function findLegacyReferralForm(): HTMLFormElement | null {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => {
    const text = (form.textContent || "").toLocaleUpperCase("pt-BR");
    return text.includes("INDICADOR OU CÓDIGO DE LIBERAÇÃO");
  }) || null;
}

function findRegistrationForm(): HTMLFormElement | null {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => {
    const text = (form.textContent || "").toLocaleUpperCase("pt-BR");
    return text.includes("FOTO DE PERFIL") && text.includes("TELEFONE/WHATSAPP DE QUEM INDICOU");
  }) || null;
}

function findReferralSection(form: HTMLFormElement): HTMLElement | null {
  const labels = Array.from(form.querySelectorAll("label"));
  const label = labels.find((item) => (item.textContent || "").toLocaleUpperCase("pt-BR").includes("TELEFONE/WHATSAPP DE QUEM INDICOU"));
  if (!label) return null;

  let current: HTMLElement | null = label.parentElement;
  while (current && current.parentElement !== form) current = current.parentElement;
  return current?.parentElement === form ? current : null;
}

function getReferralInput(section: HTMLElement): HTMLInputElement | null {
  const labels = Array.from(section.querySelectorAll("label"));
  const label = labels.find((item) => (item.textContent || "").toLocaleUpperCase("pt-BR").includes("TELEFONE/WHATSAPP DE QUEM INDICOU"));
  const container = label?.parentElement;
  return container?.querySelector<HTMLInputElement>('input[type="tel"]') || null;
}

function findBackButton(form: HTMLFormElement): HTMLButtonElement | null {
  return Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="button"]')).find((button) => {
    const text = (button.textContent || "").trim().toLocaleUpperCase("pt-BR");
    return text === "VOLTAR" || text.includes("ALTERAR NÚMERO");
  }) || null;
}

function prepareBackButton(form: HTMLFormElement, referralSection: HTMLElement): HTMLButtonElement | null {
  const button = findBackButton(form);
  if (!button) return null;
  button.textContent = "← Voltar para alterar número";
  button.className = "w-full mt-3 px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white/80 text-sm font-bold hover:bg-white/10 hover:text-white transition-colors";
  button.style.display = "block";
  button.dataset.referralBackButton = "1";
  referralSection.insertAdjacentElement("afterend", button);
  return button;
}

function cleanReferralSection(section: HTMLElement) {
  const labels = Array.from(section.querySelectorAll("label"));
  const phoneLabel = labels.find((item) => (item.textContent || "").toLocaleUpperCase("pt-BR").includes("TELEFONE/WHATSAPP DE QUEM INDICOU"));
  const phoneContainer = phoneLabel?.parentElement as HTMLElement | null;
  if (!phoneContainer) return;

  // O usuário pediu somente o indicador no início do cadastro. Portanto removemos
  // visualmente o manifesto amarelo, explicações e o campo opcional de nome.
  for (const child of Array.from(section.children) as HTMLElement[]) {
    if (child !== phoneContainer && !child.hasAttribute("data-referral-first-status")) {
      child.style.display = "none";
    }
  }
  for (const paragraph of Array.from(phoneContainer.querySelectorAll("p"))) {
    paragraph.style.display = "none";
  }

  section.className = "rounded-xl border border-white/20 bg-white/5 p-4 space-y-2";
}

function getCustomerPhone(form: HTMLFormElement, referralInput: HTMLInputElement): string {
  const stored = digits(sessionStorage.getItem("reg_phone_temp") || "");
  if (stored.length >= 10) return stored;

  const phones = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="tel"]'));
  const referralSection = findReferralSection(form);
  const ownPhone = phones.find((input) => input !== referralInput && !referralSection?.contains(input));
  const visible = digits(ownPhone?.value || "");
  if (visible.length >= 10) return visible;

  // Quando o cadastro começou por CPF, o telefone próprio pode ainda não existir.
  // Este valor neutro serve apenas para consultar o indicador; a validação final
  // continua sendo feita no servidor no momento do cadastro.
  return "00000000000";
}

function setOtherFieldsVisible(form: HTMLFormElement, referralSection: HTMLElement, visible: boolean) {
  for (const child of Array.from(form.children) as HTMLElement[]) {
    if (child === referralSection) continue;
    if (child.dataset.referralBackButton === "1") {
      child.style.display = "block";
      continue;
    }
    if (visible) {
      if (child.dataset.referralGateDisplay !== undefined) {
        child.style.display = child.dataset.referralGateDisplay;
        delete child.dataset.referralGateDisplay;
      }
    } else if (child.dataset.referralGateDisplay === undefined) {
      child.dataset.referralGateDisplay = child.style.display || "";
      child.style.display = "none";
    }
  }
}

function ensureStatus(section: HTMLElement): HTMLElement {
  let status = section.querySelector<HTMLElement>("[data-referral-first-status]");
  if (status) return status;
  status = document.createElement("div");
  status.dataset.referralFirstStatus = "1";
  status.style.display = "none";
  section.appendChild(status);
  return status;
}

export default function RegistrationReferralFirstGate() {
  const checkMutation = trpc.onlineSupport.entryStartByPhone.useMutation();
  const lastCheckedRef = useRef("");
  const validPhoneRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const legacyProcessedRef = useRef<WeakSet<HTMLFormElement>>(new WeakSet());

  useEffect(() => {
    const skipLegacyReferralGate = () => {
      const legacyForm = findLegacyReferralForm();
      if (!legacyForm || legacyProcessedRef.current.has(legacyForm)) return;
      legacyProcessedRef.current.add(legacyForm);
      legacyForm.style.display = "none";
      queueMicrotask(() => {
        if (document.body.contains(legacyForm)) legacyForm.requestSubmit();
      });
    };

    const wire = () => {
      skipLegacyReferralGate();

      const form = findRegistrationForm();
      if (!form || form.dataset.referralFirstGate === "1") return;
      const section = findReferralSection(form);
      if (!section) return;
      const input = getReferralInput(section);
      if (!input) return;

      form.dataset.referralFirstGate = "1";
      cleanReferralSection(section);
      form.insertBefore(section, form.firstChild);
      prepareBackButton(form, section);
      setOtherFieldsVisible(form, section, false);

      const status = ensureStatus(section);

      const showStatus = (className: string, text: string) => {
        status.className = className;
        status.textContent = text;
        status.style.display = text ? "block" : "none";
      };

      const validate = async () => {
        const referralPhone = digits(input.value);

        if (referralPhone.length !== 11) {
          validPhoneRef.current = "";
          lastCheckedRef.current = "";
          setOtherFieldsVisible(form, section, false);
          if (referralPhone.length === 0) {
            showStatus("", "");
          } else {
            showStatus(
              "mt-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-center text-yellow-200",
              "Digite os 11 números do indicador.",
            );
          }
          return;
        }

        if (lastCheckedRef.current === referralPhone && validPhoneRef.current === referralPhone) return;
        lastCheckedRef.current = referralPhone;
        validPhoneRef.current = "";
        setOtherFieldsVisible(form, section, false);
        showStatus(
          "mt-3 rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-center text-cyan-200",
          "Verificando indicador...",
        );

        try {
          const result = await checkMutation.mutateAsync({
            phone: getCustomerPhone(form, input),
            referralPhone,
          });

          if (result.status !== "referral_valid") {
            showStatus(
              "mt-3 rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm font-bold text-center text-red-300",
              "INDICADOR INVÁLIDO. Este número não possui cadastro ativo e liberado no sistema.",
            );
            setOtherFieldsVisible(form, section, false);
            return;
          }

          validPhoneRef.current = referralPhone;
          showStatus(
            "mt-3 rounded-xl border border-green-500/60 bg-green-500/10 px-4 py-3 text-sm font-bold text-center text-green-300",
            "✓ Indicador validado. Cadastro liberado.",
          );
          setOtherFieldsVisible(form, section, true);
        } catch {
          showStatus(
            "mt-3 rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm font-bold text-center text-red-300",
            "Não foi possível validar o indicador. Tente novamente.",
          );
          setOtherFieldsVisible(form, section, false);
        }
      };

      const scheduleValidation = () => {
        validPhoneRef.current = "";
        setOtherFieldsVisible(form, section, false);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => void validate(), 150);
      };

      input.addEventListener("input", scheduleValidation);
      input.addEventListener("change", scheduleValidation);
      void validate();
    };

    wire();
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [checkMutation]);

  return null;
}
