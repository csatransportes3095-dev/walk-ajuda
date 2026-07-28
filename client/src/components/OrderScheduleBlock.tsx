import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Link2, Copy, Mail, Send, RefreshCw, X, CheckCircle2, PlusCircle } from "lucide-react";

interface Props {
  registrationId: number;
  subOrderIndex: number;
  customerPhone: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhotoUrl?: string | null;
}

function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function OrderScheduleBlock({ registrationId, subOrderIndex, customerPhone, customerName, customerEmail, customerPhotoUrl }: Props) {
  const utils = trpc.useUtils();
  const apptQuery = trpc.schedule.getForOrder.useQuery({ registrationId, subOrderIndex });
  const templatesQuery = trpc.schedule.listTemplates.useQuery();
  const cfgQuery = trpc.schedule.getConfig.useQuery();

  const [serviceName, setServiceName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const appt = apptQuery.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = appt ? `${origin}/agendar/${appt.token}` : "";

  const createMut = trpc.schedule.createForOrder.useMutation({
    onSuccess: () => { toast.success("Link de agendamento gerado"); utils.schedule.getForOrder.invalidate({ registrationId, subOrderIndex }); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const sendEmailMut = trpc.schedule.sendEmail.useMutation({
    onSuccess: (r) => { r.success ? toast.success("E-mail enviado") : toast.error("Falha ao enviar e-mail"); utils.schedule.getForOrder.invalidate({ registrationId, subOrderIndex }); },
    onError: (e) => toast.error(e.message),
  });
  const reopenAndNotifyMut = trpc.schedule.reopenAndNotify.useMutation({
    onSuccess: (data) => {
      toast.success("Liberado para o cliente reagendar");
      if (data.emailSent) toast.success("E-mail enviado ao cliente");
      else if (!data.emailSent && data.waLink) toast.info("Cliente não possui e-mail cadastrado");
      if (data.waLink) window.open(data.waLink, "_blank");
      utils.schedule.getForOrder.invalidate({ registrationId, subOrderIndex });
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.schedule.cancel.useMutation({
    onSuccess: () => { toast.success("Agendamento cancelado"); utils.schedule.getForOrder.invalidate({ registrationId, subOrderIndex }); },
    onError: (e) => toast.error(e.message),
  });

  const selectedTemplate = templateId ? (templatesQuery.data || []).find(x => x.id === templateId) : null;

  function applyTemplate(id: string) {
    const t = (templatesQuery.data || []).find(x => String(x.id) === id);
    if (!t) { setTemplateId(null); return; }
    setServiceName(t.serviceName || t.name);
    setInstructions(t.instructions || "");
    setTemplateId(t.id);
  }

  function handleCreate() {
    createMut.mutate({
      registrationId, subOrderIndex, customerPhone,
      customerName: customerName ?? null, customerEmail: customerEmail ?? null,
      customerPhotoUrl: customerPhotoUrl ?? null,
      serviceName: serviceName.trim() || null, instructions: instructions.trim() || null,
      templateId,
    });
  }

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => toast.success("Link copiado")).catch(() => toast.error("Não foi possível copiar"));
  }

  // Usa o texto do modelo selecionado se disponível; senão usa o texto global
  const waTextBase = (appt && (appt as any).templateWhatsappMessage)
    ? (appt as any).templateWhatsappMessage
    : (selectedTemplate?.whatsappMessage || cfgQuery.data?.whatsappMessage || "Agende seu atendimento:");
  // Substitui todas as variáveis suportadas
  const now = new Date();
  const dia = String(now.getDate()).padStart(2, '0');
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const ano = String(now.getFullYear());
  const horaAtual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // Status do pedido (vem do agendamento enriquecido ou do appt)
  const orderStatusLabel = ((appt as any)?.orderStatusLabel || (appt as any)?.orderStatusKey || '').trim();
  let waMsgRaw = waTextBase;
  // Variáveis de cliente
  waMsgRaw = waMsgRaw.replace(/\{nome\}/gi, customerName || '');
  waMsgRaw = waMsgRaw.replace(/\{telefone\}/gi, customerPhone || '');
  // Variáveis de agendamento
  waMsgRaw = waMsgRaw.replace(/\{data\}/gi, appt?.slotDate || '');
  waMsgRaw = waMsgRaw.replace(/\{hora\}/gi, appt?.slotTime || '');
  waMsgRaw = waMsgRaw.replace(/\{servico\}/gi, appt?.serviceName || '');
  // Variáveis de link
  waMsgRaw = waMsgRaw.replace(/\{link\}/gi, link);
  waMsgRaw = waMsgRaw.replace(/\[LINK DE AGENDAMENTO\]/gi, link);
  waMsgRaw = waMsgRaw.replace(/\[LINK\]/gi, link);
  // Status do pedido
  waMsgRaw = waMsgRaw.replace(/\{status\}/gi, orderStatusLabel);
  // Data e hora atuais (momento do envio)
  waMsgRaw = waMsgRaw.replace(/\{DIA\}/g, dia);
  waMsgRaw = waMsgRaw.replace(/\{MES\}/g, mes);
  waMsgRaw = waMsgRaw.replace(/\{ANO\}/g, ano);
  waMsgRaw = waMsgRaw.replace(/\{hora_atual\}/gi, horaAtual);
  // Se o texto já contém o link, não adiciona de novo; senão adiciona no final
  const waMsg = waMsgRaw.includes(link)
    ? `${waMsgRaw}\n\n${cfgQuery.data?.noShowWarning || ''}`.trim()
    : `${waMsgRaw}\n${link}\n\n${cfgQuery.data?.noShowWarning || ''}`.trim();

  return (
    <div className="bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg p-3 space-y-3">
      <p className="text-xs font-semibold text-fuchsia-400 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5" /> Agendamento de atendimento
      </p>

      {apptQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : !appt || appt.status === "cancelled" ? (
        <>
          {!open ? (
            <button onClick={() => setOpen(true)} className="w-full py-2 px-3 bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 rounded-lg text-xs font-semibold hover:bg-fuchsia-500/30 transition-colors flex items-center justify-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Criar link de agendamento
            </button>
          ) : (
            <div className="space-y-2">
              {(templatesQuery.data || []).length > 0 && (
                <select onChange={e => applyTemplate(e.target.value)} defaultValue=""
                  className="w-full px-3 py-2 bg-background border border-fuchsia-500/30 rounded-lg text-xs text-foreground">
                  <option value="">— Usar modelo pronto (opcional) —</option>
                  {(templatesQuery.data || []).map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              )}
              <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="O que será agendado (ex: Foto de perfil)"
                className="w-full px-3 py-2 bg-background border border-fuchsia-500/30 rounded-lg text-xs text-foreground" />
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para o cliente (opcional)" rows={2}
                className="w-full px-3 py-2 bg-background border border-fuchsia-500/30 rounded-lg text-xs text-foreground resize-none" />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={createMut.isPending}
                  className="flex-1 py-1.5 px-3 bg-fuchsia-600 text-white rounded-lg text-xs font-semibold hover:bg-fuchsia-500 disabled:opacity-50">
                  {createMut.isPending ? "Gerando..." : "Gerar link"}
                </button>
                <button onClick={() => setOpen(false)} className="py-1.5 px-3 bg-white/5 border border-white/10 text-white/60 rounded-lg text-xs">Cancelar</button>
              </div>
            </div>
          )}
        </>
      ) : appt.status === "completed" ? (
        <div className="space-y-2">
          {appt.serviceName && <p className="text-xs text-foreground"><span className="text-muted-foreground">Serviço:</span> {appt.serviceName}</p>}
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-xs text-green-300 font-semibold">✓ Atendimento finalizado</p>
          </div>
          {appt.slotDate && (
            <p className="text-xs text-white/50">Realizado em: <strong className="text-white/70">{formatDate(appt.slotDate)}{appt.slotTime ? ` às ${appt.slotTime}` : ""}</strong></p>
          )}
          {!open ? (
            <button onClick={() => setOpen(true)} className="w-full py-1.5 px-3 bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 rounded-lg text-xs font-semibold hover:bg-fuchsia-500/30 transition-colors flex items-center justify-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5" /> Novo agendamento
            </button>
          ) : (
            <div className="space-y-2">
              {(templatesQuery.data || []).length > 0 && (
                <select onChange={e => applyTemplate(e.target.value)} defaultValue=""
                  className="w-full px-3 py-2 bg-background border border-fuchsia-500/30 rounded-lg text-xs text-foreground">
                  <option value="">— Usar modelo pronto (opcional) —</option>
                  {(templatesQuery.data || []).map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              )}
              <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="O que será agendado (ex: Foto de perfil)"
                className="w-full px-3 py-2 bg-background border border-fuchsia-500/30 rounded-lg text-xs text-foreground" />
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para o cliente (opcional)" rows={2}
                className="w-full px-3 py-2 bg-background border border-fuchsia-500/30 rounded-lg text-xs text-foreground resize-none" />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={createMut.isPending}
                  className="flex-1 py-1.5 px-3 bg-fuchsia-600 text-white rounded-lg text-xs font-semibold hover:bg-fuchsia-500 disabled:opacity-50">
                  {createMut.isPending ? "Gerando..." : "Gerar link"}
                </button>
                <button onClick={() => setOpen(false)} className="py-1.5 px-3 bg-white/5 border border-white/10 text-white/60 rounded-lg text-xs">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {appt.serviceName && <p className="text-xs text-foreground"><span className="text-muted-foreground">Serviço:</span> {appt.serviceName}</p>}

          {appt.status === "confirmed" ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-xs text-green-300">Cliente agendou: <strong>{appt.slotDate ? formatDate(appt.slotDate) : ""} às {appt.slotTime}</strong></p>
            </div>
          ) : (
            <p className="text-xs text-yellow-300">Aguardando o cliente escolher o horário.</p>
          )}

          {/* Link */}
          <div className="flex gap-1.5">
            <input readOnly value={link} className="flex-1 px-2 py-1.5 bg-background border border-white/10 rounded-lg text-[11px] text-muted-foreground" />
            <button onClick={copyLink} title="Copiar link" className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:bg-white/10"><Copy className="w-3.5 h-3.5" /></button>
          </div>

          {/* Envio */}
          <div className="grid grid-cols-2 gap-1.5">
            {customerEmail ? (
              <button onClick={() => sendEmailMut.mutate({ token: appt.token, origin })} disabled={sendEmailMut.isPending}
                className="py-1.5 px-2 bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {sendEmailMut.isPending ? "..." : appt.sentByEmail ? "Reenviar e-mail" : "Enviar e-mail"}
              </button>
            ) : (
              <button disabled className="py-1.5 px-2 bg-white/5 border border-white/10 text-white/30 rounded-lg text-xs flex items-center justify-center gap-1.5" title="Cliente sem e-mail">
                <Mail className="w-3.5 h-3.5" /> Sem e-mail
              </button>
            )}
            <a href={waLink(customerPhone, waMsg)} target="_blank" rel="noopener noreferrer"
              className="py-1.5 px-2 bg-green-500/15 border border-green-500/30 text-green-300 rounded-lg text-xs font-semibold hover:bg-green-500/25 flex items-center justify-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> WhatsApp
            </a>
          </div>

          {/* Ações */}
          <div className="grid grid-cols-2 gap-1.5">
            {appt.status === "confirmed" && (
              <button onClick={() => reopenAndNotifyMut.mutate({ id: appt.id, origin })} disabled={reopenAndNotifyMut.isPending} className="py-1.5 px-2 bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 rounded-lg text-xs font-semibold hover:bg-yellow-500/25 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> {reopenAndNotifyMut.isPending ? "..." : "Reagendar"}
              </button>
            )}
            <button onClick={() => { if (confirm("Cancelar este agendamento?")) cancelMut.mutate({ id: appt.id }); }}
              className="py-1.5 px-2 bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/25 flex items-center justify-center gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
