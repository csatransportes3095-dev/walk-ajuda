import { useEffect, useState } from "react";
import { Crown, ExternalLink, Save, Settings2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";

export default function AdminVip() {
  const { data: settings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: activePix } = trpc.pix.getActive.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Configuração VIP salva!");
      utils.settings.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message || "Erro ao salvar VIP"),
  });
  const [form, setForm] = useState({
    enabled: true,
    price: "",
    days: "30",
    title: "H2 VIP",
    subtitle: "Pague menos nos modelos e categorias com benefício VIP.",
    benefit1: "Preços especiais em modelos e categorias selecionados",
    benefit2: "Acesso a opções exclusivas marcadas como SOMENTE VIP",
    benefit3: "O valor VIP aparece antes da compra para você comparar",
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      enabled: settings.vip_membership_enabled !== "0",
      price: settings.vip_membership_price || "",
      days: settings.vip_membership_days || "30",
      title: settings.vip_membership_title || "H2 VIP",
      subtitle: settings.vip_membership_subtitle || "Pague menos nos modelos e categorias com benefício VIP.",
      benefit1: settings.vip_membership_benefit_1 || "Preços especiais em modelos e categorias selecionados",
      benefit2: settings.vip_membership_benefit_2 || "Acesso a opções exclusivas marcadas como SOMENTE VIP",
      benefit3: settings.vip_membership_benefit_3 || "O valor VIP aparece antes da compra para você comparar",
    });
  }, [settings]);

  const save = () => {
    const normalizedDays = String(Math.max(1, Number(form.days || 30) || 30));
    update.mutate({
      settings: {
        vip_membership_enabled: form.enabled ? "1" : "0",
        vip_membership_price: form.price.trim(),
        vip_membership_days: normalizedDays,
        vip_membership_title: form.title.trim() || "H2 VIP",
        vip_membership_subtitle: form.subtitle.trim(),
        vip_membership_benefit_1: form.benefit1.trim(),
        vip_membership_benefit_2: form.benefit2.trim(),
        vip_membership_benefit_3: form.benefit3.trim(),
      },
    });
  };

  const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70";

  return (
    <div className="min-h-screen bg-slate-950 pb-12 text-white">
      <AdminHeader title="H2 VIP" />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
<div>
  <div className="flex items-center gap-2 text-amber-300"><Crown className="h-6 w-6" /><span className="text-xs font-black uppercase tracking-[0.16em]">H2 VIP</span></div>
  <h1 className="mt-2 text-3xl font-black">Configuração do VIP</h1>
  <p className="mt-2 text-sm text-slate-400">Defina o valor da assinatura, duração e argumentos que o cliente verá em /vip.</p>
</div>
<a href="/vip" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-violet-400/45 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200"><ExternalLink className="h-4 w-4" /> Ver página VIP</a>
        </div>

        {isLoading ? <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-slate-300">Carregando...</div> : (
<div className="mt-6 grid gap-5">
  <section className="rounded-2xl border border-amber-300/25 bg-amber-400/[0.05] p-5">
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <div><p className="font-black">VIP disponível para contratação</p><p className="mt-1 text-xs text-slate-400">Desative para esconder o fluxo de pagamento.</p></div>
      <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-5 w-5 accent-amber-400" />
    </label>
  </section>

  <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-2">
    <label className="text-xs font-black uppercase tracking-wide text-slate-300">Valor do VIP
      <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Ex.: 29,90" className={inputClass} />
    </label>
    <label className="text-xs font-black uppercase tracking-wide text-slate-300">Duração em dias
      <input type="number" min="1" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} className={inputClass} />
    </label>
    <label className="sm:col-span-2 text-xs font-black uppercase tracking-wide text-slate-300">Título
      <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
    </label>
    <label className="sm:col-span-2 text-xs font-black uppercase tracking-wide text-slate-300">Descrição
      <textarea value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} rows={3} className={inputClass} />
    </label>
  </section>

  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-violet-300" /><h2 className="font-black">Benefícios exibidos ao cliente</h2></div>
    {["benefit1", "benefit2", "benefit3"].map((key, index) => (
      <label key={key} className="mb-4 block text-xs font-black uppercase tracking-wide text-slate-300">Benefício {index + 1}
        <input value={form[key as "benefit1" | "benefit2" | "benefit3"]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputClass} />
      </label>
    ))}
  </section>

  <section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.05] p-5">
    <p className="text-sm font-black text-cyan-100">PIX usado na página VIP</p>
    {activePix ? <p className="mt-2 text-sm text-slate-300">{activePix.pixKey} {activePix.pixName ? `• ${activePix.pixName}` : ""}</p> : <p className="mt-2 text-sm text-rose-300">Nenhuma conta PIX ativa. Ative uma em Configurações.</p>}
    <a href="/admin/settings" className="mt-3 inline-flex text-xs font-black uppercase text-cyan-300 underline underline-offset-4">Abrir configurações de PIX</a>
  </section>

  <button type="button" onClick={save} disabled={update.isPending} className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 px-5 text-sm font-black uppercase text-[#251600] disabled:opacity-50">
    <Save className="h-5 w-5" /> {update.isPending ? "Salvando..." : "Salvar configuração VIP"}
  </button>
</div>
        )}
      </main>
    </div>
  );
}
