// Botão de contador de indicações - NOVA VERSÃO
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export function ReferralCountButton({ phone, name }: { phone: string; name: string }) {
  const [, setLocation] = useLocation();
  const { data: stats } = trpc.referrals.getStats.useQuery(
    { phone: phone.replace(/\D/g, '') },
    { staleTime: 0 }
  );

  const totalReferred = stats?.totalReferred ?? 0;
  const hasReferrals = totalReferred > 0;
  
  // Cores dinâmicas
  const bgColor = hasReferrals 
    ? "from-green-600/20 to-emerald-600/20 border-green-500/40 hover:from-green-600/30 hover:to-emerald-600/30" 
    : "from-slate-600/20 to-slate-600/20 border-slate-500/40 hover:from-slate-600/30 hover:to-slate-600/30";
  const textColor = hasReferrals ? "text-green-400" : "text-slate-400";
  const countColor = hasReferrals ? "text-green-300" : "text-slate-300";
  const hintColor = hasReferrals ? "text-green-300/70" : "text-slate-300/70";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (hasReferrals) {
          setLocation(`/admin/referrals?phone=${phone.replace(/\D/g, '')}`);
        }
      }}
      disabled={!hasReferrals}
      className={`w-full text-left px-2.5 py-1.5 bg-gradient-to-r ${bgColor} border rounded-lg transition-all disabled:cursor-not-allowed`}
      title={hasReferrals ? "Ver indicações deste cliente" : "Sem indicações"}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${textColor}`}>
          <span>🚗</span> Indicou
        </span>
        <span className={`text-sm font-bold ${countColor}`}>{totalReferred}</span>
      </div>
      <p className={`text-[10px] ${hintColor} mt-0.5`}>
        {hasReferrals ? "Clique para visualizar" : "Nenhuma indicação"}
      </p>
    </button>
  );
}
