import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ROOT_ID = "h2-admin-customer-phone-editor";

function cleanPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

function formatPhone(value: string) {
  const d = cleanPhone(value);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function AdminCustomerPhoneEditorEnhancer() {
  const changePhone = trpc.customerUpdate.adminChangePhone.useMutation();
  const mutateAsync = changePhone.mutateAsync;

  useEffect(() => {
    if (!location.pathname.startsWith("/admin/customers")) return;

    let mountedRoot: HTMLElement | null = null;
    let currentOriginal = "";
    let observer: MutationObserver | null = null;
    let cleanupInput: (() => void) | null = null;

    const detach = () => {
      cleanupInput?.();
      cleanupInput = null;
      mountedRoot?.remove();
      mountedRoot = null;
      currentOriginal = "";
    };

    const enhance = () => {
      const labels = Array.from(document.querySelectorAll("label"));
      const label = labels.find(el => el.textContent?.trim() === "Telefone");
      if (!label) {
        detach();
        return;
      }

      const container = label.parentElement;
      const legacyInput = container?.querySelector("input[type='tel']") as HTMLInputElement | null;
      if (!container || !legacyInput) return;

      const current = cleanPhone(legacyInput.value);
      if (!current) return;
      if (mountedRoot && currentOriginal === current) return;

      detach();
      currentOriginal = current;
      legacyInput.style.display = "none";

      const root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "mt-0.5";
      container.appendChild(root);
      mountedRoot = root;

      const input = document.createElement("input");
      input.type = "tel";
      input.value = formatPhone(current);
      input.placeholder = "(11) 99999-9999";
      input.autocomplete = "tel";
      input.className = "w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";
      root.appendChild(input);

      const hint = document.createElement("p");
      hint.className = "text-[10px] text-amber-300/80 mt-1";
      hint.textContent = "Editável somente pelo ADM. Ao salvar, o telefone é sincronizado com pedidos e acessos vinculados.";
      root.appendChild(hint);

      const actions = document.createElement("div");
      actions.className = "flex gap-2 mt-2";
      root.appendChild(actions);

      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "SALVAR TELEFONE";
      save.className = "px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50";
      actions.appendChild(save);

      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "CANCELAR";
      reset.className = "px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-border text-muted-foreground hover:text-foreground";
      actions.appendChild(reset);

      const onInput = () => {
        const cursor = input.selectionStart ?? input.value.length;
        const before = input.value;
        input.value = formatPhone(input.value);
        if (document.activeElement === input) {
          const diff = input.value.length - before.length;
          const pos = Math.max(0, cursor + diff);
          requestAnimationFrame(() => input.setSelectionRange(pos, pos));
        }
      };
      input.addEventListener("input", onInput);

      const onReset = () => {
        input.value = formatPhone(currentOriginal);
      };
      reset.addEventListener("click", onReset);

      const onSave = async () => {
        const next = cleanPhone(input.value);
        if (!/^\d{10,11}$/.test(next)) {
          toast.error("Informe um telefone válido com DDD.");
          return;
        }
        if (next === currentOriginal) {
          toast.info("O telefone não foi alterado.");
          return;
        }
        if (!window.confirm(`Alterar telefone de ${formatPhone(currentOriginal)} para ${formatPhone(next)}?`)) return;

        save.disabled = true;
        reset.disabled = true;
        save.textContent = "SALVANDO...";
        try {
          await mutateAsync({ currentPhone: currentOriginal, newPhone: next });
          toast.success("Telefone atualizado e sincronizado.");
          currentOriginal = next;
          legacyInput.value = next;
          input.value = formatPhone(next);
          setTimeout(() => window.location.reload(), 350);
        } catch (error: any) {
          toast.error(error?.message || "Não foi possível atualizar o telefone.");
        } finally {
          save.disabled = false;
          reset.disabled = false;
          save.textContent = "SALVAR TELEFONE";
        }
      };
      save.addEventListener("click", onSave);

      cleanupInput = () => {
        legacyInput.style.display = "";
        input.removeEventListener("input", onInput);
        reset.removeEventListener("click", onReset);
        save.removeEventListener("click", onSave);
      };
    };

    const schedule = () => requestAnimationFrame(() => setTimeout(enhance, 10));
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      observer?.disconnect();
      detach();
    };
  }, [mutateAsync]);

  return null;
}
