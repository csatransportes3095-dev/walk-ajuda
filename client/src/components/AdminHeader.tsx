import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

interface AdminHeaderProps {
  /** Ícone à esquerda do título */
  icon?: React.ReactNode;
  /** Título da página */
  title: string;
  /** URL de volta (padrão: /admin/codes) */
  backTo?: string;
  /** Conteúdo extra à direita (antes do botão Sair) */
  rightContent?: React.ReactNode;
}

export default function AdminHeader({ icon, title, backTo = "/admin/codes", rightContent }: AdminHeaderProps) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const logoutMut = trpc.adminAuth.logout.useMutation({
    onSuccess: () => {
      utils.adminAuth.check.invalidate();
      navigate("/admin/login");
      toast.success("Saiu do painel admin");
    },
    onError: () => {
      // Mesmo com erro, redireciona
      navigate("/admin/login");
    },
  });

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a1a]/95 backdrop-blur-md border-b border-purple-500/30">
      <div className="max-w-4xl mx-auto flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-2">
          <a href={backTo} className="text-white/60 hover:text-white transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </a>
          {icon && <span className="text-purple-400">{icon}</span>}
          <h1 className="text-lg font-bold text-white">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {rightContent}
          <button
            onClick={() => logoutMut.mutate()}
            disabled={logoutMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            title="Sair do painel admin"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
