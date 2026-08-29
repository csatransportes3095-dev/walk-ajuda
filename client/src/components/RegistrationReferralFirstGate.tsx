import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

function digits(value: string): string {
  let phone = String(value || "").replace(/\D/g, "");
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  return phone.slice(0, 11);
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
  while (current && current !== form) {
    const text = (current.textContent || "").toLocaleUpperCase("pt-BR");
    if (text.includes("ACESSO RESTRITO POR INDICAÇÃO") && text.includes("NOME DE QUEM INDICOU")) return current;
    current = current.parentElement;
  }
  return null;
}

function getReferralInput(section: HTMLElement): HTMLInputElement | null {
  const labels = Array.from(section.querySelectorAll("label"));
  const label = labels.find((item) => (item.textContent || "").toLocaleUpperCase("pt-BR").includes("TELEFONE/WHATSAPP DE QUEM INDICOU"));
  const container = label?.parentElement;
  return container?.querySelector<HTMLInputElement>('input[type="tel"]') || null;
}

function getCustomerPhone(form: HTMLFormElement, referralInput: HTMLInputElement): string {
  const stored = digits(sessionStorage.getItem("reg_phone_temp") || "");
  if (stored.length >= 10) return stored;

  const phones = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="tel"]'));
  const ownPhone = phones.find((input) => input !== referralInput && !findReferralSection(form)?.contains(input));
  const visible = digits(ownPhone?.value || "");
  if (visible.length >= 10) return visible;

  // A rota de pré-validação exige um telefone do novo cliente. Quando o fluxo
  // começou por CPF e o telefone ainda não existe, usamos um valor neutro apenas
  // para consultar o indicador; o cadastro final continua validando autorreferência.
  return "00000000000";
}

function setOtherFieldsVisible(form: HTMLFormElement, referralSection: HTMLElement, visible: boolean) {
  for (const child of Array.from(form.children) as HTMLElement[]) {
    if (child === referralSection) continue;
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
  status.className = "mt-3 rounded-xl border px-4 py-3 text-sm font-bold text-center";
  section.appendChild(status);
  return status;
}

export default function RegistrationReferralFirstGate() {
  const checkMutation = trpc.onlineSupport.entryStartByPhone.useMutation();
  const lastCheckedRef = useRef("");
  const validPhoneRef = useRef("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const wire = () => {
      const form = findRegistrationForm();
      if (!form || form.dataset.referralFirstGate === "1") return;
      const section = findReferralSection(form);
      if (!section) return;
      const input = getReferralInput(section);
      if (!input) return;

      form.dataset.referralFirstGate = "1";
      form.insertBefore(section, form.firstChild);
      setOtherFieldsVisible(form, section, false);

      const status = ensureStatus(section);
      status.className = "mt-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-center text-yellow-200";
      status.textContent = "Informe o indicador para liberar o cadastro.";

      const validate = async () => {
        const referralPhone = digits(input.value);

        if (referralPhone.length !== 11) {
          validPhoneRef.current = "";
          setOtherFieldsVisible(form, section, false);
          status.className = "mt-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-center text-yellow-200";
          status.textContent = referralPhone.length ? "Digite os 11 números do indicador." : "Informe o indicador para liberar o cadastro.";
          return;
        }

        if (lastCheckedRef.current === referralPhone && validPhoneRef.current === referralPhone) return;
        lastCheckedRef.current = referralPhone;
        validPhoneRef.current = "";
        setOtherFieldsVisible(form, section, false);
        status.className = "mt-3 rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-center text-cyan-200";
        status.textContent = "Verificando indicador...";

        try {
          const result = await checkMutation.mutateAsync({
            phone: getCustomerPhone(form, input),
            referralPhone,
          });

          if (result.status !== "referral_valid") {
            status.className = "mt-3 rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm font-bold text-center text-red-300";
            status.textContent = "INDICADOR INVÁLIDO. Este número não possui cadastro ativo e liberado no sistema.";
            setOtherFieldsVisible(form, section, false);
            return;
          }

          validPhoneRef.current = referralPhone;
          status.className = "mt-3 rounded-xl border border-green-500/60 bg-green-500/10 px-4 py-3 text-sm font-bold text-center text-green-300";
          status.textContent = "✓ Indicador validado. Cadastro liberado.";
          setOtherFieldsVisible(form, section, true);
        } catch {
          status.className = "mt-3 rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm font-bold text-center text-red-300";
          status.textContent = "Não foi possível validar o indicador. Tente novamente.";
          setOtherFieldsVisible(form, section, false);
        }
      };

      const scheduleValidation = () => {
        validPhoneRef.current = "";
        setOtherFieldsVisible(form, section, false);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => void validate(), 250);
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
