import AdminHeader from "@/components/AdminHeader";
import AdminVipReceivablesPanel from "@/components/AdminVipReceivablesPanel";

export default function AdminVipReceivablesPage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <AdminHeader title="Recebíveis VIP" />
      <div className="mx-auto max-w-7xl px-3 pb-10 sm:px-5">
        <div className="pt-4">
          <a href="/admin/vip" className="inline-flex rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-slate-300">
            Voltar ao VIP
          </a>
        </div>
        <AdminVipReceivablesPanel />
      </div>
    </main>
  );
}
