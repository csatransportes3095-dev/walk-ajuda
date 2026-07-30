import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Search, RefreshCw, Download, Trash2, Pencil, Eye,
  User, Mail, Smartphone, Glasses, Camera, Hash,
  CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight,
  Settings, MessageCircle, Copy
} from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "w-4 h-4"} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

function buildWhatsAppLink(phone: string | null | undefined, name: string, status: string) {
  const clean = (phone ?? "").replace(/\D/g, "");
  if (!clean) return null;
  const num = clean.startsWith("55") ? clean : `55${clean}`;
  const msg = status === "aprovado"
    ? `OlÃ¡ ${name}! ðŸŽ‰ Seu prÃ©-cadastro na *H2 COLOMBIANO* foi *APROVADO*! Entre em contato conosco para dar continuidade ao processo.`
    : `OlÃ¡ ${name}. Infelizmente seu prÃ©-cadastro na *H2 COLOMBIANO* nÃ£o foi aprovado desta vez. Qualquer dÃºvida, entre em contato.`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

const STATUS_CONFIG = {
  pendente:  { label: "Pendente",  color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  aprovado:  { label: "Aprovado",  color: "bg-green-500/20  text-green-400  border-green-500/30"  },
  reprovado: { label: "Reprovado", color: "bg-red-500/20    text-red-400    border-red-500/30"    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pendente;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {status === "aprovado" && <CheckCircle2 size={10} />}
      {status === "reprovado" && <XCircle size={10} />}
      {status === "pendente" && <Clock size={10} />}
      {cfg.label}
    </span>
  );
}

function fmtDate(ts: number | null | undefined) {
  if (!ts) return "â€”";
  return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-purple-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className="text-sm text-gray-200 break-words">{value}</div>
      </div>
    </div>
  );
}

export default function AdminPreRegistrations() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "aprovado" | "reprovado">("todos");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modais
  const [viewModal, setViewModal] = useState<any | null>(null);
  const [editModal, setEditModal] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Respostas dinÃ¢micas editadas no modal de ediÃ§Ã£o
  const [editDynAnswers, setEditDynAnswers] = useState<Record<number, string>>({});

  // Dados
  const { data, isLoading, refetch } = trpc.preRegistrations.list.useQuery({
    search, status: statusFilter, page, limit,
  });

  // Perguntas dinÃ¢micas do prÃ©-cadastro
  const { data: dynQuestions } = trpc.preCadastroQuestions.listAll.useQuery();

  // Respostas dinÃ¢micas do registro sendo visualizado
  const { data: viewAnswers } = trpc.preRegistrations.getAnswers.useQuery(
    { preRegistrationId: viewModal?.id ?? 0 },
    { enabled: !!viewModal?.id }
  );

  // Respostas dinÃ¢micas do registro sendo editado
  const { data: editAnswersData } = trpc.preRegistrations.getAnswers.useQuery(
    { preRegistrationId: editModal?.id ?? 0 },
    { enabled: !!editModal?.id }
  );

  // Sincronizar respostas dinÃ¢micas ao abrir o modal de ediÃ§Ã£o
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editAnswersData) {
      const map: Record<number, string> = {};
      editAnswersData.forEach((a: any) => { map[a.questionId] = a.answer; });
      setEditDynAnswers(map);
    } else {
      setEditDynAnswers({});
    }
  }, [editAnswersData, editModal?.id]);

  // Mutation para salvar resposta dinÃ¢mica
  const upsertAnswerMut = trpc.preRegistrations.upsertAnswer.useMutation();

  // Mutations
  const updateStatus = trpc.preRegistrations.updateStatus.useMutation({
    onSuccess: () => { utils.preRegistrations.list.invalidate(); toast.success("Status atualizado!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.preRegistrations.update.useMutation({
    onSuccess: () => { utils.preRegistrations.list.invalidate(); setEditModal(null); toast.success("Cadastro atualizado!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.preRegistrations.delete.useMutation({
    onSuccess: () => { utils.preRegistrations.list.invalidate(); setDeleteId(null); toast.success("ExcluÃ­do com sucesso!"); },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const result = await utils.preRegistrations.exportAll.fetch({ status: statusFilter });
      if (!result?.length) { toast.info("Nenhum dado para exportar."); return; }
      const headers = ["ID","Nome","Email","CPF","Contas Fake","Aparelho","Ã“culos","Foto","Indicado por","Tel. Indicador","Conta Parente","Nome Uber","Status","Data"];
      const rows = result.map((r: any) => [
        r.id, r.fullName, r.email, r.cpf, r.fakAccountsCount ?? r.fakeAccountsCount ?? "",
        r.deviceType, r.acceptsGlasses ? "Sim" : "NÃ£o", r.acceptsScheduledPhoto ? "Sim" : "NÃ£o",
        r.referralName ?? "", r.referralPhone ?? "", r.parentAccount ?? "", r.uberNameType ?? "",
        r.status, fmtDate(r.createdAt)
      ]);
      const csv = [headers, ...rows].map(r => r.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "pre-cadastros.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error("Erro ao exportar: " + e.message); }
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0d0d20] border-b border-white/10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-white">ðŸ“‹ PrÃ©-Cadastros</h1>
            <p className="text-xs text-gray-400">{total} registro{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => navigate("/admin/pre-cadastros/perguntas")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-600/30 transition-colors">
              <Settings size={13} /> Perguntas
            </button>
            <button onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-300 text-xs hover:bg-green-600/30 transition-colors">
              <Download size={13} /> Excel/CSV
            </button>

            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs hover:bg-white/10 transition-colors">
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {/* Filtros */}
        <div className="bg-[#12122a] border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nome, CPF, e-mail ou telefone..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-purple-500/50 min-w-[140px]"
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="reprovado">Reprovado</option>
          </select>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <RefreshCw size={20} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <User size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Nenhum prÃ©-cadastro encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row: any) => (
              <div key={row.id} className="bg-[#12122a] border border-white/10 rounded-xl p-4 hover:border-purple-500/30 transition-colors">
                {/* Linha 1: nome + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 font-mono">#{row.id}</span>
                      <h3 className="font-semibold text-white text-sm truncate">{row.fullName}</h3>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {row.email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} />{row.email}</span>}
                      {row.cpf && <span className="text-xs text-gray-400 flex items-center gap-1"><Hash size={10} />{row.cpf}</span>}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                {/* Linha 2: detalhes rÃ¡pidos */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {row.deviceType && (
                    <span className="flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-gray-300">
                      <Smartphone size={10} /> {row.deviceType === "android" ? "Android" : "iPhone"}
                    </span>
                  )}
                  {row.fakAccountsCount != null && (
                    <span className="flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-gray-300">
                      <Hash size={10} /> {row.fakAccountsCount} contas fake
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border ${row.acceptsGlasses ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                    <Glasses size={10} /> Ã“culos: {row.acceptsGlasses ? "âœ“" : "âœ—"}
                  </span>
                  <span className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border ${row.acceptsScheduledPhoto ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                    <Camera size={10} /> Foto: {row.acceptsScheduledPhoto ? "âœ“" : "âœ—"}
                  </span>
                  {row.uberNameType && (
                    <span className="flex items-center gap-1 text-xs bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5 text-blue-400">
                      Uber: {row.uberNameType}
                    </span>
                  )}
                  {row.referralName && (
                    <span className="flex items-center gap-1 text-xs bg-purple-500/10 border border-purple-500/20 rounded-full px-2 py-0.5 text-purple-400">
                      Indicado por: {row.referralName}
                    </span>
                  )}
                </div>

                {/* Linha 3: data + aÃ§Ãµes */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-gray-500">{fmtDate(row.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    {/* Alterar status rÃ¡pido */}
                    <select
                      value={row.status}
                      onChange={e => updateStatus.mutate({ id: row.id, status: e.target.value as any })}
                      className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="pendente">Pendente</option>
                      <option value="aprovado">Aprovado</option>
                      <option value="reprovado">Reprovado</option>
                    </select>
                    <button onClick={() => setViewModal(row)}
                      className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors" title="Ver detalhes">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => setEditModal({ ...row })}
                      className="p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    {(row.status === "aprovado" || row.status === "reprovado") && row.phone && (
                      <a
                        href={buildWhatsAppLink(row.phone, row.fullName, row.status) ?? "#"}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                        title={`Avisar no WhatsApp (${row.status})`}
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => setDeleteId(row.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PaginaÃ§Ã£o */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 disabled:opacity-30 hover:bg-white/10 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-400">PÃ¡gina {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 disabled:opacity-30 hover:bg-white/10 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* â”€â”€ Modal: Ver Detalhes â”€â”€ */}
      {viewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setViewModal(null)}>
          <div className="bg-[#12122a] border border-white/15 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* CabeÃ§alho: nome grande + nÃºmero + data */}
            <div className="px-6 pt-6 pb-4 border-b border-white/10 relative">
              <button onClick={() => setViewModal(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">Ã—</button>
              <h2 className="text-2xl font-black text-white uppercase leading-tight pr-8">{viewModal.fullName}</h2>
              <p className="text-xs text-gray-400 mt-1">#{viewModal.id} Â· {fmtDate(viewModal.createdAt)}</p>
              <div className="mt-3"><StatusBadge status={viewModal.status} /></div>
            </div>
            {/* Todas as respostas do formulÃ¡rio â€” APENAS as criadas pelo admin, na ordem, com subperguntas junto ao pai */}
            <div className="px-5 pb-4">
              {viewAnswers && viewAnswers.length > 0 ? (() => {
                // Usar respostas dinÃ¢micas como Ãºnica fonte de verdade
                const allAnswers = viewAnswers.filter((a: any) => a.answer && String(a.answer).trim());
                const roots = allAnswers.filter((a: any) => !a.parentQuestionId);
                const subs = allAnswers.filter((a: any) => !!a.parentQuestionId);
                if (roots.length === 0 && subs.length === 0) return <p className="text-xs text-gray-500 py-3">Nenhuma resposta registrada.</p>;
                return (
                  <div className="divide-y divide-white/5">
                    {roots.map((a: any) => {
                      const children = subs.filter((s: any) => s.parentQuestionId === a.questionId);
                      return (
                        <div key={a.id}>
                          <div className="flex items-start gap-3 py-2.5">
                            <span className="text-purple-400 mt-0.5 flex-shrink-0"><Hash size={14} /></span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-500 mb-0.5">{a.label || a.fieldKey}</div>
                              <div className="text-sm text-gray-200 break-words font-medium">{a.answer}</div>
                            </div>
                          </div>
                          {children.length > 0 && (
                            <div className="ml-6 border-l-2 border-purple-500/30 pl-3 mb-1">
                              {children.map((child: any) => {
                                const grandchildren = subs.filter((s: any) => s.parentQuestionId === child.questionId);
                                return (
                                  <div key={child.id}>
                                    <div className="flex items-start gap-2 py-1.5">
                                      <span className="text-purple-400 text-xs mt-0.5">â†³</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-gray-500">{child.label || child.fieldKey}</div>
                                        <div className="text-sm text-gray-200">{child.answer}</div>
                                      </div>
                                    </div>
                                    {grandchildren.length > 0 && (
                                      <div className="ml-4 border-l-2 border-purple-500/20 pl-3">
                                        {grandchildren.map((gc: any) => (
                                          <div key={gc.id} className="flex items-start gap-2 py-1">
                                            <span className="text-purple-300 text-xs mt-0.5">â†³</span>
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs text-gray-500">{gc.label || gc.fieldKey}</div>
                                              <div className="text-sm text-gray-200">{gc.answer}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Sub-perguntas cujo pai nÃ£o respondeu (edge case) */}
                    {subs.filter((s: any) => !roots.find((r: any) => r.questionId === s.parentQuestionId)).map((a: any) => (
                      <div key={a.id} className="flex items-start gap-3 py-2.5">
                        <span className="text-purple-400 mt-0.5 flex-shrink-0"><Hash size={14} /></span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 mb-0.5">{a.label || a.fieldKey}</div>
                          <div className="text-sm text-gray-200 break-words">{a.answer}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })() : <p className="text-xs text-gray-500 py-3">Nenhuma resposta registrada.</p>}
            </div>
            <div className="px-5 pb-1 divide-y divide-white/5">
              {viewModal.ipAddress && <InfoRow icon={<span className="text-xs">IP</span>} label="IP" value={viewModal.ipAddress} />}
              {viewModal.userAgent && <InfoRow icon={<span className="text-xs">UA</span>} label="Dispositivo" value={viewModal.userAgent} />}
            </div>
            <div className="px-5 pb-5 space-y-2">
              {(viewModal.status === "aprovado" || viewModal.status === "reprovado") && viewModal.phone && (
                <a
                  href={buildWhatsAppLink(viewModal.phone, viewModal.fullName, viewModal.status) ?? "#"}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-600/20 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-600/30 transition-colors"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  Avisar no WhatsApp ({viewModal.status === "aprovado" ? "Aprovado" : "Reprovado"})
                </a>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setViewModal(null); setEditModal({ ...viewModal }); }}
                  className="flex-1 py-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors">
                  âœï¸ Editar
                </button>
                <button onClick={() => setViewModal(null)}
                  className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/10 transition-colors">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Modal: Editar â”€â”€ */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setEditModal(null)}>
          <div className="bg-[#12122a] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#12122a] border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <h2 className="font-bold text-white">âœï¸ Editar PrÃ©-Cadastro #{editModal.id}</h2>
              <button onClick={() => setEditModal(null)} className="text-gray-500 hover:text-white text-xl leading-none">Ã—</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Linha 1: Nome + WhatsApp */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Nome Completo</label>
                  <input value={editModal.fullName ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, fullName: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">E-mail</label>
                  <input value={editModal.email ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">WhatsApp (DDD+nÃºmero)</label>
                  <input value={editModal.phone ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, phone: e.target.value.replace(/\D/g,'').slice(0,11) }))}
                    placeholder="11999999999"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">CPF</label>
                  <input value={editModal.cpf ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, cpf: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Qtd. Contas Fake</label>
                  <input type="number" value={editModal.fakAccountsCount ?? editModal.fakeAccountsCount ?? 0}
                    onChange={e => setEditModal((p: any) => ({ ...p, fakeAccountsCount: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                </div>
              </div>

              {/* Aparelho e condiÃ§Ãµes */}
              <div>
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Aparelho e CondiÃ§Ãµes</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Aparelho</label>
                    <select value={editModal.deviceType ?? "android"} onChange={e => setEditModal((p: any) => ({ ...p, deviceType: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#1a1a3a] border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-purple-500/50">
                      <option value="android">Android</option>
                      <option value="iphone">iPhone</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Nome na conta Uber</label>
                    <select value={editModal.uberNameType ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, uberNameType: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#1a1a3a] border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-purple-500/50">
                      <option value="">NÃ£o informado</option>
                      <option value="Primeiro Nome">Primeiro Nome</option>
                      <option value="Nome Completo">Nome Completo</option>
                      <option value="Nome AleatÃ³rio">Nome AleatÃ³rio</option>
                      <option value="S">S</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!editModal.acceptsGlasses}
                        onChange={e => setEditModal((p: any) => ({ ...p, acceptsGlasses: e.target.checked }))}
                        className="w-4 h-4 rounded accent-purple-500" />
                      <span className="text-sm text-gray-300">Aceita Ã³culos</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!editModal.acceptsScheduledPhoto}
                        onChange={e => setEditModal((p: any) => ({ ...p, acceptsScheduledPhoto: e.target.checked }))}
                        className="w-4 h-4 rounded accent-purple-500" />
                      <span className="text-sm text-gray-300">Aceita foto agendada</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* IndicaÃ§Ã£o */}
              <div>
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">IndicaÃ§Ã£o</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Nome de quem indicou</label>
                    <input value={editModal.referralName ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, referralName: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Telefone do indicador</label>
                    <input value={editModal.referralPhone ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, referralPhone: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 mb-1 block">Conta parente Uber</label>
                    <input value={editModal.parentAccount ?? ""} onChange={e => setEditModal((p: any) => ({ ...p, parentAccount: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
                  </div>
                </div>
              </div>

              {/* Perguntas dinÃ¢micas do prÃ©-cadastro */}
              {dynQuestions && dynQuestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Perguntas do FormulÃ¡rio</p>
                  <div className="space-y-2">
                    {dynQuestions.filter((q: any) => !q.parentQuestionId).map((q: any) => (
                      <div key={q.id}>
                        <label className="text-xs text-gray-400 mb-1 block">{q.label}</label>
                        {q.fieldType === 'select' || q.fieldType === 'radio' ? (
                          <select
                            value={editDynAnswers[q.id] ?? ""}
                            onChange={e => setEditDynAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            className="w-full px-3 py-2 bg-[#1a1a3a] border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-purple-500/50"
                          >
                            <option value="">-- Selecione --</option>
                            {(Array.isArray(q.options) ? q.options : []).map((opt: any) => (
                              <option key={opt.value ?? opt} value={opt.label ?? opt}>{opt.label ?? opt}</option>
                            ))}
                          </select>
                        ) : q.fieldType === 'textarea' ? (
                          <textarea
                            value={editDynAnswers[q.id] ?? ""}
                            onChange={e => setEditDynAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 resize-none"
                          />
                        ) : (
                          <input
                            value={editDynAnswers[q.id] ?? ""}
                            onChange={e => setEditDynAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                          />
                        )}
                        {/* Sub-perguntas visÃ­veis */}
                        {dynQuestions
                          .filter((sq: any) => sq.parentQuestionId === q.id && (!sq.triggerOption || editDynAnswers[q.id] === sq.triggerOption))
                          .map((sq: any) => (
                            <div key={sq.id} className="ml-4 mt-2">
                              <label className="text-xs text-gray-500 mb-1 block">â†³ {sq.label}</label>
                              {sq.fieldType === 'select' || sq.fieldType === 'radio' ? (
                                <select
                                  value={editDynAnswers[sq.id] ?? ""}
                                  onChange={e => setEditDynAnswers(prev => ({ ...prev, [sq.id]: e.target.value }))}
                                  className="w-full px-3 py-2 bg-[#1a1a3a] border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-purple-500/50"
                                >
                                  <option value="">-- Selecione --</option>
                                  {(Array.isArray(sq.options) ? sq.options : []).map((opt: any) => (
                                    <option key={opt.value ?? opt} value={opt.label ?? opt}>{opt.label ?? opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={editDynAnswers[sq.id] ?? ""}
                                  onChange={e => setEditDynAnswers(prev => ({ ...prev, [sq.id]: e.target.value }))}
                                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                                />
                              )}
                              {/* Sub-sub-perguntas visÃ­veis */}
                              {dynQuestions
                                .filter((ssq: any) => ssq.parentQuestionId === sq.id && (!ssq.triggerOption || editDynAnswers[sq.id] === ssq.triggerOption))
                                .map((ssq: any) => (
                                  <div key={ssq.id} className="ml-4 mt-2">
                                    <label className="text-xs text-gray-500 mb-1 block">â†³â†³ {ssq.label}</label>
                                    <input
                                      value={editDynAnswers[ssq.id] ?? ""}
                                      onChange={e => setEditDynAnswers(prev => ({ ...prev, [ssq.id]: e.target.value }))}
                                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    />
                                  </div>
                                ))}
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Motivo da ReprovaÃ§Ã£o */}
              {editModal.status === "reprovado" && (
                <div>
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Motivo da ReprovaÃ§Ã£o</p>
                  <textarea
                    value={editModal.rejectionReason ?? ""}
                    onChange={e => setEditModal((p: any) => ({ ...p, rejectionReason: e.target.value }))}
                    placeholder="Informe o motivo da reprovaÃ§Ã£o para o cliente..."
                    rows={3}
                    className="w-full px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 resize-none"
                  />
                  <p className="text-xs text-red-400/70 mt-1">âš ï¸ Este motivo serÃ¡ exibido para o cliente na pÃ¡gina de consulta de status.</p>
                </div>
              )}

              {/* Status */}
              <div>
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">Status</p>
                <div className="flex gap-2">
                  {(["pendente", "aprovado", "reprovado"] as const).map(s => (
                    <button key={s} onClick={() => setEditModal((p: any) => ({ ...p, status: s }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${editModal.status === s
                        ? s === "aprovado" ? "bg-green-500/30 border-green-500/50 text-green-300"
                          : s === "reprovado" ? "bg-red-500/30 border-red-500/50 text-red-300"
                          : "bg-yellow-500/30 border-yellow-500/50 text-yellow-300"
                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setEditModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  // Salvar campos fixos
                  updateMutation.mutate({
                    id: editModal.id,
                    fullName: editModal.fullName,
                    email: editModal.email,
                    cpf: editModal.cpf,
                    fakeAccountsCount: editModal.fakeAccountsCount ?? editModal.fakAccountsCount,
                    deviceType: editModal.deviceType,
                    acceptsGlasses: !!editModal.acceptsGlasses,
                    acceptsScheduledPhoto: !!editModal.acceptsScheduledPhoto,
                    status: editModal.status,
                    referralName: editModal.referralName || null,
                    referralPhone: editModal.referralPhone || null,
                    parentAccount: editModal.parentAccount || null,
                    uberNameType: editModal.uberNameType || null,
                    rejectionReason: editModal.rejectionReason || null,
                  });
                  // Salvar respostas dinÃ¢micas
                  if (dynQuestions) {
                    for (const q of dynQuestions) {
                      const answer = editDynAnswers[q.id];
                      if (answer !== undefined && answer !== "") {
                        await upsertAnswerMut.mutateAsync({
                          preRegistrationId: editModal.id,
                          questionId: q.id,
                          fieldKey: q.fieldKey,
                          answer,
                        });
                      }
                    }
                  }
                  utils.preRegistrations.getAnswers.invalidate({ preRegistrationId: editModal.id });
                }}
                disabled={updateMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition-colors disabled:opacity-50">
                {updateMutation.isPending ? "Salvando..." : "ðŸ’¾ Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Modal: Confirmar ExclusÃ£o â”€â”€ */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <div className="bg-[#12122a] border border-red-500/30 rounded-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Excluir PrÃ©-Cadastro</h3>
            <p className="text-sm text-gray-400 mb-6">Tem certeza? Esta aÃ§Ã£o nÃ£o pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate({ id: deleteId! })} disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50">
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
