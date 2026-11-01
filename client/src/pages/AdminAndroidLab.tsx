import AdminHeader from "@/components/AdminHeader";
import { Smartphone, ShieldCheck, Server, MapPin, Package } from "lucide-react";

/** Independent Android Lab landing page. No emulator service is started here. */
export default function AdminAndroidLab() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <AdminHeader title="Celular Android" icon={<Smartphone className="h-5 w-5" />} backTo="/admin/codes" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5">
          <h1 className="text-xl font-bold">H2 ANDROID LAB</h1>
          <p className="mt-2 text-sm text-slate-300">Laboratorio independente de testes Android. Estrutura inicial em preparacao; nenhuma instancia virtual esta ativa.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { title: "Instancias Android", detail: "Em breve: criacao e controle de celulares virtuais.", icon: Smartphone },
            { title: "Modelos e aplicativos", detail: "Em breve: perfis de aparelhos e instalacao de APK.", icon: Package },
            { title: "Proxy e localizacao", detail: "Em breve: configuracao independente por instancia.", icon: MapPin },
            { title: "Infraestrutura isolada", detail: "Servico de emulacao separado do site principal.", icon: Server },
          ].map(({ title, detail, icon: Icon }) => (
            <section key={title} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <Icon className="mb-2 h-6 w-6 text-cyan-300" />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-slate-400">{detail}</p>
            </section>
          ))}
        </div>
        <p className="flex items-start gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /> Nenhuma funcionalidade existente do H2 Colombiano e modificada por esta pagina.</p>
      </main>
    </div>
  );
}
