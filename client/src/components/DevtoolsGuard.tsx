import { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useDevToolsDetection } from "@/hooks/useDevToolsDetection";
import { useAdminAuth } from "@/hooks/useAdminAuth";

/**
 * Proteção global anti-inspeção (DevTools).
 *
 * Comportamento:
 * - Só atua em PRODUÇÃO (import.meta.env.PROD). Em desenvolvimento fica inerte
 *   para não atrapalhar o trabalho.
 * - Administradores autenticados são WHITELIST (não são bloqueados) — podem
 *   inspecionar normalmente.
 * - Ao detectar DevTools em um visitante comum:
 *     1. Exibe tela de bloqueio em tela cheia ocultando todo o conteúdo.
 *     2. Registra a tentativa no backend (alerta ao dono + log).
 *     3. Encerra qualquer sessão administrativa aberta por segurança.
 * - Pode ser desligado pelo admin via setting `devtools_protection` = '0'.
 *
 * IMPORTANTE: nenhuma proteção de frontend é 100%. A segurança real está no
 * backend (adminProcedure valida permissões em todas as rotas sensíveis).
 */
export default function DevtoolsGuard() {
  const [location] = useLocation();
  const [blocked, setBlocked] = useState(false);
  const reportedRef = useRef(false);

  const { isAdmin } = useAdminAuth();
  const { data: settings } = trpc.settings.getAll.useQuery();
  const securityAlertMut = trpc.system.securityAlert.useMutation();
  const reportDevtoolsMut = trpc.security.reportDevtools.useMutation();
  const adminLogoutMut = trpc.adminAuth.logout.useMutation();

  // Liga/desliga pelo admin (default ligado). '0' = desligado.
  const protectionEnabled = settings ? settings["devtools_protection"] !== "0" : true;

  // Só em produção, com proteção ligada e para NÃO-admins.
  const isProd = import.meta.env.PROD;
  const enabled = isProd && protectionEnabled && !isAdmin;

  const handleDetected = useCallback(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;

    setBlocked(true);

    const phone =
      typeof window !== "undefined"
        ? localStorage.getItem("walk_client_phone") || undefined
        : undefined;

    // Registrar tentativa (alerta ao dono + log de auditoria)
    securityAlertMut.mutate({
      type: "DevTools / Inspetor aberto",
      phone,
      page: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 200),
    });
    reportDevtoolsMut.mutate({
      method: "deteccao-global",
      phone,
      userAgent: navigator.userAgent.slice(0, 200),
    });

    // Encerrar sessão admin aberta por segurança (caso exista cookie)
    adminLogoutMut.mutate(undefined as any, {
      onError: () => {
        /* silencioso */
      },
    });
  }, [securityAlertMut, reportDevtoolsMut, adminLogoutMut]);

  useDevToolsDetection(handleDetected, enabled);

  // Não renderiza overlay em rotas admin (admin é whitelist) nem fora de produção
  if (!blocked || location.startsWith("/admin")) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "#0a0a1a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes dtgPulse {
          0%, 100% { box-shadow: 0 0 20px #dc2626, 0 0 60px #dc2626; border-color: #dc2626; }
          50% { box-shadow: 0 0 40px #ef4444, 0 0 100px #ef4444; border-color: #ef4444; }
        }
      `}</style>
      <div
        style={{
          animation: "dtgPulse 1.6s ease-in-out infinite",
          border: "2px solid #dc2626",
          borderRadius: "1rem",
          padding: "2.5rem 2rem",
          maxWidth: "460px",
          background: "rgba(80,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🔒</div>
        <p
          style={{
            color: "#ef4444",
            fontWeight: 900,
            fontSize: "1.5rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "1rem",
          }}
        >
          Acesso bloqueado
        </p>
        <p style={{ color: "white", fontWeight: 600, fontSize: "1.05rem", lineHeight: 1.6 }}>
          Acesso bloqueado por segurança. Ferramentas de desenvolvedor detectadas.
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: "0.85rem",
            marginTop: "1.25rem",
            lineHeight: 1.6,
          }}
        >
          Feche as ferramentas de desenvolvedor e recarregue a página para continuar navegando
          normalmente.
        </p>
      </div>
    </div>,
    document.body
  );
}
