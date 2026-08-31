import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { normalizeDevToolsProtectionTarget, type DevToolsProtectionTarget } from "@/hooks/useDevToolsDetection";

const OPTIONS: Array<{
  value: DevToolsProtectionTarget;
  label: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    value: "desktop",
    label: "Computador",
    description: "Desktop e notebook",
    icon: Monitor,
  },
  {
    value: "mobile",
    label: "Celular / Tablet",
    description: "Smartphone e tablet",
    icon: Smartphone,
  },
  {
    value: "both",
    label: "Ambos",
    description: "Todos os dispositivos",
    icon: TabletSmartphone,
  },
];

export default function AdminDevToolsTargetSelector() {
  const [location] = useLocation();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.getAll.useQuery(undefined, {
    enabled: location.startsWith("/admin/settings"),
    staleTime: 0,
  });
  const updateMut = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.getAll.invalidate();
      toast.success("Dispositivos da proteção atualizados!");
    },
    onError: () => toast.error("Erro ao salvar dispositivos da proteção"),
  });

  useEffect(() => {
    if (!location.startsWith("/admin/settings")) {
      setHost(null);
      return;
    }

    let portalHost: HTMLDivElement | null = null;

    const tryMount = () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const saveSecurityButton = buttons.find((button) =>
        button.textContent?.includes("Salvar Configuração de Segurança"),
      );

      if (!saveSecurityButton?.parentElement) {
        if (portalHost?.isConnected) portalHost.remove();
        portalHost = null;
        setHost(null);
        return;
      }

      if (!portalHost || !portalHost.isConnected) {
        portalHost = document.createElement("div");
        portalHost.dataset.devtoolsTargetSelector = "1";
        saveSecurityButton.parentElement.insertBefore(portalHost, saveSecurityButton);
        setHost(portalHost);
      }
    };

    tryMount();
    const observer = new MutationObserver(tryMount);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      portalHost?.remove();
      setHost(null);
    };
  }, [location]);

  if (!host) return null;

  const current = normalizeDevToolsProtectionTarget(
    settingsQuery.data?.devtools_protection_target,
  );

  return createPortal(
    <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
      <div className="mb-3">
        <p className="text-sm font-bold text-purple-200">Onde aplicar a proteção</p>
        <p className="mt-1 text-xs text-white/55">
          Escolha em quais tipos de dispositivo o bloqueio de DevTools deve funcionar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={updateMut.isPending}
              onClick={() =>
                updateMut.mutate({
                  settings: { devtools_protection_target: option.value },
                })
              }
              className={`rounded-xl border-2 p-4 text-left transition-all disabled:opacity-50 ${
                selected
                  ? "border-purple-500 bg-purple-500/20"
                  : "border-white/10 bg-white/5 hover:border-white/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                <span className="font-bold text-white">{option.label}</span>
              </div>
              <p className="mt-2 text-xs text-white/55">{option.description}</p>
              {selected && (
                <p className="mt-2 text-xs font-bold text-purple-300">SELECIONADO</p>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    host,
  );
}
