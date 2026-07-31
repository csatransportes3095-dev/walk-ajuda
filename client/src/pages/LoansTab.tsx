import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Banknote, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Upload, Copy, RefreshCw, Send, CalendarDays, Info, ClipboardCheck,
  Zap, AlertCircle, RotateCcw, Wallet, Flag, Calendar, TrendingUp,
  ShieldAlert, CircleDollarSign, CheckCheck, Timer
} from "lucide-react";

interface LoansTabProps { token: string; }

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(val: any) {
  return parseFloat(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = String(dateStr).slice(0, 10).split("-").map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  const due = Date.UTC(dy, dm - 1, dd);
  return Math.round((due - today) / 86400000);
}

const PAYMENT_LABELS: Record<string, string> = {
  diario: "Diário",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  const s = isOverdue ? "atrasado" : status;
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pendente:             { label: "Aguardando aprovação",     cls: "bg-blue-500/20 text-blue-300 border-blue-500/40",     icon: <Clock className="w-3 h-3" /> },
    aprovado:             { label: "Aprovado",                 cls: "bg-green-500/20 text-green-300 border-green-500/40",   icon: <CheckCircle2 className="w-3 h-3" /> },
    aguardando_pagamento: { label: "Aguardando pagamento",     cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",icon: <CircleDollarSign className="w-3 h-3" /> },
    em_analise:           { label: "Comprovante em análise",   cls: "bg-purple-500/20 text-purple-300 border-purple-500/40",icon: <Timer className="w-3 h-3" /> },
    pago:                 { label: "Quitado",                  cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: <CheckCheck className="w-3 h-3" /> },
    cancelado:            { label: "Cancelado",                cls: "bg-gray-500/20 text-gray-400 border-gray-500/40",      icon: <XCircle className="w-3 h-3" /> },
    reprovado:            { label: "Reprovado",                cls: "bg-red-500/20 text-red-300 border-red-500/40",         icon: <XCircle className="w-3 h-3" /> },
    atrasado:             { label: "Em atraso",                cls: "bg-red-600/20 text-red-400 border-red-600/40",         icon: <AlertTriangle className="w-3 h-3" /> },
  };
  const cfg = map[s] || map.pendente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── DatesPanel ─────────────────────────────────────────────────────────────

function DatesPanel({ loan, installments }: { loan: any; installments: any[] }) {
  const sorted = [...installments].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const firstInst = sorted[0];
  const lastInst = sorted[sorted.length - 1];
  const nextPending = sorted.find((i) => ["pendente", "atrasado"].includes(i.status));
  const nextDays = daysUntil(nextPending?.dueDate);
  const isUrgent = nextDays !== null && nextDays <= 2 && nextDays >= 0;
  const isOverdueNext = nextDays !== null && nextDays < 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-br from-slate-800/60 to-slate-900/80 mb-3">
      {/* Header */}
      <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">Datas do Empréstimo</span>
      </div>

      <div className="p-4 grid grid-cols-3 gap-3">
        {/* Primeira parcela */}
        <div className="flex flex-col items-center text-center gap-1 bg-white/5 rounded-xl p-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center mb-1">
            <Flag className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-xs text-muted-foreground leading-tight">1ª Parcela</span>
          <span className="text-sm font-bold text-blue-300">{fmtDate(firstInst?.dueDate)}</span>
          <span className="text-xs text-muted-foreground">{fmt(firstInst?.amount)}</span>
        </div>

        {/* Próxima parcela — destaque */}
        <div className={`flex flex-col items-center text-center gap-1 rounded-xl p-3 border-2 relative ${
          isOverdueNext ? "bg-red-500/15 border-red-500/50" :
          isUrgent ? "bg-amber-500/15 border-amber-500/50" :
          nextPending ? "bg-violet-500/15 border-violet-500/50" :
          "bg-emerald-500/10 border-emerald-500/30"
        }`}>
          {(isUrgent || isOverdueNext) && (
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-black whitespace-nowrap">
              {isOverdueNext ? "ATRASADA" : "URGENTE"}
            </span>
          )}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
            isOverdueNext ? "bg-red-500/30" : isUrgent ? "bg-amber-500/30" : nextPending ? "bg-violet-500/30" : "bg-emerald-500/20"
          }`}>
            <Zap className={`w-4 h-4 ${isOverdueNext ? "text-red-400" : isUrgent ? "text-amber-400" : nextPending ? "text-violet-400" : "text-emerald-400"}`} />
          </div>
          <span className="text-xs text-muted-foreground leading-tight">Próxima</span>
          {nextPending ? (
            <>
              <span className={`text-sm font-black ${isOverdueNext ? "text-red-300" : isUrgent ? "text-amber-300" : "text-violet-300"}`}>
                {fmtDate(nextPending.dueDate)}
              </span>
              <span className="text-xs font-semibold text-foreground">{fmt(nextPending.amount)}</span>
              {nextDays !== null && (
                <span className={`text-xs font-bold ${isOverdueNext ? "text-red-400" : isUrgent ? "text-amber-400" : "text-muted-foreground"}`}>
                  {isOverdueNext ? `${Math.abs(nextDays)}d atraso` : nextDays === 0 ? "HOJE" : nextDays === 1 ? "amanhã" : `${nextDays} dias`}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-bold text-emerald-400">Quitado!</span>
              <CheckCheck className="w-4 h-4 text-emerald-400" />
            </>
          )}
        </div>

        {/* Última parcela */}
        <div className="flex flex-col items-center text-center gap-1 bg-white/5 rounded-xl p-3">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center mb-1">
            <Flag className="w-4 h-4 text-orange-400" style={{ transform: "scaleX(-1)" }} />
          </div>
          <span className="text-xs text-muted-foreground leading-tight">Última Parcela</span>
          <span className="text-sm font-bold text-orange-300">{fmtDate(lastInst?.dueDate)}</span>
          <span className="text-xs text-muted-foreground">{fmt(lastInst?.amount)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── ProgressPanel ──────────────────────────────────────────────────────────

function ProgressPanel({ paidCount, totalCount, totalAmount }: { paidCount: number; totalCount: number; totalAmount: number }) {
  const pct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
  const paidAmt = totalAmount * (paidCount / Math.max(totalCount, 1));
  const remaining = totalAmount - paidAmt;

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-800/60 to-slate-900/80 p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">Progresso</span>
        </div>
        <span className="text-sm font-black text-foreground">{paidCount}/{totalCount} parcelas</span>
      </div>

      {/* Barra de progresso */}
      <div className="relative h-4 bg-white/10 rounded-full overflow-hidden mb-1">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: pct === 100
              ? "linear-gradient(90deg, #10b981, #34d399)"
              : pct > 60
              ? "linear-gradient(90deg, #7c3aed, #a78bfa)"
              : "linear-gradient(90deg, #6d28d9, #8b5cf6)",
          }}
        />
        {pct > 10 && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white drop-shadow">
            {pct}%
          </span>
        )}
      </div>
      {pct <= 10 && <div className="text-right text-xs font-bold text-muted-foreground mb-2">{pct}%</div>}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">✅ Já paguei</p>
          <p className="text-base font-black text-emerald-400">{fmt(paidAmt)}</p>
        </div>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">⏳ Falta pagar</p>
          <p className="text-base font-black text-red-400">{fmt(remaining)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── LateFeePanel ───────────────────────────────────────────────────────────

function LateFeePanel({ config, installmentAmount }: { config: any; installmentAmount?: number }) {
  if (!config?.enabled) return null;
  const amt = installmentAmount || 0;
  const ex18 = amt > 0 ? amt + parseFloat(config.fee_after_18h || 0) : null;
  const exMid = amt > 0 ? amt + (amt * parseFloat(config.fee_after_midnight_pct || 0) / 100) : null;

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-red-500/40 bg-gradient-to-br from-red-950/60 to-slate-900/80 mb-3">
      <div className="px-4 py-2.5 bg-red-500/20 border-b border-red-500/30 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-red-400" />
        <span className="text-xs font-black text-red-300 uppercase tracking-wider">⚠️ Regras de Atraso e Taxas</span>
      </div>
      <div className="p-4 space-y-3">
        {config.rules_text ? (
          <pre className="text-sm text-red-200 whitespace-pre-wrap font-sans leading-relaxed">{config.rules_text}</pre>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-200 font-semibold">Pague no prazo para evitar taxas extras:</p>
            <div className="space-y-1.5">
              {config.fee_after_18h > 0 && (
                <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                  <span className="text-lg">🕕</span>
                  <div>
                    <span className="text-xs font-bold text-red-300">Após 18h:</span>
                    <span className="text-xs text-red-200 ml-1">+ R$ {parseFloat(config.fee_after_18h).toFixed(2)} de taxa</span>
                    {ex18 && <span className="text-xs text-muted-foreground ml-1">(parcela vira {fmt(ex18)})</span>}
                  </div>
                </div>
              )}
              {config.fee_after_20h > 0 && (
                <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                  <span className="text-lg">🕗</span>
                  <div>
                    <span className="text-xs font-bold text-red-300">Após 20h:</span>
                    <span className="text-xs text-red-200 ml-1">+ R$ {parseFloat(config.fee_after_20h).toFixed(2)} de taxa</span>
                  </div>
                </div>
              )}
              {config.fee_after_midnight_pct > 0 && (
                <div className="flex items-center gap-2 bg-red-700/20 rounded-lg px-3 py-2 border border-red-600/30">
                  <span className="text-lg">🌙</span>
                  <div>
                    <span className="text-xs font-black text-red-300">Após meia-noite:</span>
                    <span className="text-xs text-red-200 ml-1">+{config.fee_after_midnight_pct}% sobre o valor</span>
                    {exMid && <span className="text-xs text-red-300 font-bold ml-1">(vira {fmt(exMid)})</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="text-base">💡</span>
          <p className="text-xs text-amber-300 font-medium">Pague cedo para evitar cobranças adicionais!</p>
        </div>
      </div>
    </div>
  );
}

// ─── InstallmentTimeline ────────────────────────────────────────────────────

function InstallmentTimeline({
  installments, showSendProof, onUpload
}: {
  installments: any[];
  showSendProof: boolean;
  onUpload: (id: number) => void;
}) {
  return (
    <div className="space-y-1 mt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">Parcelas</span>
        <span className="text-xs text-muted-foreground">
          {installments.filter((i) => i.status === "pago").length}/{installments.length} pagas
        </span>
      </div>

      <div className="relative">
        {/* Linha vertical da timeline */}
        <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-gradient-to-b from-violet-500/40 via-white/10 to-transparent" />

        <div className="space-y-2">
          {installments.map((inst, idx) => {
            const isPaid = inst.status === "pago";
            const isAnalysis = inst.status === "em_analise";
            const isRecused = inst.status === "recusado";
            const isOverdueInst = inst.isOverdue && !isPaid;
            const days = daysUntil(inst.dueDate);
            const isUrgentInst = !isPaid && !isOverdueInst && days !== null && days <= 2;
            const isNext = !isPaid && !isAnalysis && installments.slice(0, idx).every((i) => i.status === "pago" || i.status === "em_analise");
            const canSendProof = ["pendente", "atrasado"].includes(inst.status) && showSendProof;
            const canResend = isRecused && showSendProof;

            // Cor do círculo
            const circleClass = isPaid
              ? "bg-emerald-500 border-emerald-400 shadow-emerald-500/40 shadow-md"
              : isAnalysis
              ? "bg-purple-500 border-purple-400 shadow-purple-500/40 shadow-md"
              : isRecused
              ? "bg-red-500 border-red-400"
              : isOverdueInst
              ? "bg-red-600 border-red-500 shadow-red-500/40 shadow-md animate-pulse"
              : isNext
              ? "bg-violet-500 border-violet-400 shadow-violet-500/40 shadow-md"
              : isUrgentInst
              ? "bg-amber-500 border-amber-400"
              : "bg-slate-700 border-slate-600";

            const cardClass = isPaid
              ? "border-emerald-500/20 bg-emerald-500/5"
              : isAnalysis
              ? "border-purple-500/30 bg-purple-500/5"
              : isRecused
              ? "border-red-400/30 bg-red-400/5"
              : isOverdueInst
              ? "border-red-500/40 bg-red-500/8"
              : isNext
              ? "border-violet-500/40 bg-violet-500/8 shadow-violet-500/10 shadow-sm"
              : isUrgentInst
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-white/5 bg-white/3";

            return (
              <div key={inst.id} className="flex gap-3 items-start">
                {/* Círculo da timeline */}
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 z-10 ${circleClass}`}>
                  {isPaid ? <CheckCheck className="w-4 h-4 text-white" /> :
                   isAnalysis ? <Timer className="w-3.5 h-3.5 text-white" /> :
                   isRecused ? <XCircle className="w-3.5 h-3.5 text-white" /> :
                   isOverdueInst ? <AlertTriangle className="w-3.5 h-3.5 text-white" /> :
                   <span className="text-white">{inst.installmentNumber}</span>}
                </div>

                {/* Card da parcela */}
                <div className={`flex-1 rounded-xl border p-3 transition-all ${cardClass}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-base font-black ${
                          isPaid ? "text-emerald-400" :
                          isOverdueInst ? "text-red-400" :
                          isNext ? "text-violet-300" :
                          isUrgentInst ? "text-amber-300" :
                          "text-foreground"
                        }`}>
                          {fmt(inst.amount)}
                        </span>
                        {isNext && !isOverdueInst && (
                          <span className="text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full font-bold border border-violet-500/40">
                            PRÓXIMA
                          </span>
                        )}
                        {isOverdueInst && (
                          <span className="text-xs bg-red-500/30 text-red-300 px-2 py-0.5 rounded-full font-bold border border-red-500/40 animate-pulse">
                            ATRASADA
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <CalendarDays className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Vence: <span className={`font-medium ${isOverdueInst ? "text-red-400" : isUrgentInst ? "text-amber-400" : "text-foreground"}`}>
                            {fmtDate(inst.dueDate)}
                          </span>
                          {days !== null && !isPaid && (
                            <span className={`ml-1.5 font-bold ${isOverdueInst ? "text-red-400" : isUrgentInst ? "text-amber-400" : "text-muted-foreground"}`}>
                              {isOverdueInst ? `(${Math.abs(days)}d atrasado)` :
                               days === 0 ? "(hoje!)" :
                               days === 1 ? "(amanhã)" :
                               `(${days} dias)`}
                            </span>
                          )}
                        </span>
                      </div>
                      {isPaid && inst.paidAt && (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-medium">
                            Pago em {fmtDate(inst.paidAt)}
                          </span>
                        </div>
                      )}
                      {isAnalysis && (
                        <div className="flex items-center gap-1 mt-1">
                          <Timer className="w-3 h-3 text-purple-400 animate-spin" />
                          <span className="text-xs text-purple-400 font-medium">Comprovante em análise...</span>
                        </div>
                      )}
                      {isRecused && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          <span className="text-xs text-red-400 font-medium">Comprovante recusado — reenvie</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botão enviar/reenviar */}
                  {(canSendProof || canResend) && (
                    <button
                      onClick={() => onUpload(inst.id)}
                      className={`w-full mt-2.5 rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                        canResend
                          ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-red-500/20 shadow-md"
                          : "bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-violet-500/20 shadow-md"
                      }`}
                    >
                      {canResend ? (
                        <><RotateCcw className="w-4 h-4" /> Reenviar Comprovante</>
                      ) : (
                        <><Upload className="w-4 h-4" /> Enviar Comprovante</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function LoansTab({ token }: LoansTabProps) {
  const [expandedLoan, setExpandedLoan] = useState<number | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"diario" | "semanal" | "mensal">("diario");
  const [workDays, setWorkDays] = useState<"seg_sab" | "seg_dom">("seg_sab");
  const [requestNotes, setRequestNotes] = useState("");
  const [uploadInstallmentId, setUploadInstallmentId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [simAmount, setSimAmount] = useState(0);
  const [simEnabled, setSimEnabled] = useState(false);

  useEffect(() => {
    const v = parseFloat(requestAmount);
    if (v > 0) {
      const t = setTimeout(() => { setSimAmount(v); setSimEnabled(true); }, 700);
      return () => clearTimeout(t);
    } else {
      setSimEnabled(false);
      setSimAmount(0);
    }
  }, [requestAmount, paymentType, workDays]);

  const simQuery = trpc.loans.simulateLoan.useQuery(
    { token, amount: simAmount, paymentType, workDays },
    { enabled: simEnabled && simAmount > 0, retry: false }
  );

  const { data, isLoading, refetch } = trpc.loans.getClientLoanInfo.useQuery(
    { token },
    { enabled: !!token, refetchInterval: 30000 }
  );

  const { data: instData, refetch: refetchInst } = trpc.loans.getClientInstallments.useQuery(
    { token, loanId: expandedLoan! },
    { enabled: !!expandedLoan }
  );

  const { data: lateFeeConfig } = trpc.loans.getLateFeeConfig.useQuery();

  const [pixKeyInput, setPixKeyInput] = useState("");
  const [pixNameInput, setPixNameInput] = useState("");
  const [pixBankInput, setPixBankInput] = useState("");
  const [editingPix, setEditingPix] = useState(false);

  const savePixKey = trpc.loans.saveClientPixKey.useMutation({
    onSuccess: () => { toast.success("Chave PIX salva!"); setEditingPix(false); refetch(); },
    onError: (e) => toast.error(e.message || "Erro ao salvar chave PIX"),
  });

  const requestMutation = trpc.loans.requestLoan.useMutation({
    onSuccess: () => {
      setSubmitted(true); setRequestOpen(false); setRequestAmount(""); setRequestNotes(""); setSimEnabled(false); refetch();
    },
    onError: (e) => toast.error(e.message || "Erro ao solicitar empréstimo"),
  });

  const proofMutation = trpc.loans.submitInstallmentProof.useMutation({
    onSuccess: () => {
      toast.success("Comprovante enviado! Aguardando confirmação.");
      setUploadInstallmentId(null); setUploadFile(null); refetchInst(); refetch();
    },
    onError: (e) => toast.error(e.message || "Erro ao enviar comprovante"),
  });

  const handleSendProof = async () => {
    if (!uploadFile || !uploadInstallmentId) return;
    if (uploadFile.size > 16 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 16MB."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      proofMutation.mutate({ token, installmentId: uploadInstallmentId, fileBase64: base64, fileName: uploadFile.name, mimeType: uploadFile.type });
    };
    reader.readAsDataURL(uploadFile);
  };

  const handleRequest = () => {
    const v = parseFloat(requestAmount);
    if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
    requestMutation.mutate({ token, amount: v, paymentType, workDays, notes: requestNotes });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-violet-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
          <Banknote className="absolute inset-0 m-auto w-6 h-6 text-violet-400" />
        </div>
        <p className="text-sm text-muted-foreground">Carregando seus empréstimos...</p>
      </div>
    );
  }

  if (!data?.enabled) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-muted/20 border border-muted/30 flex items-center justify-center">
          <Banknote className="w-10 h-10 text-muted-foreground/30" />
        </div>
        <div>
          <p className="font-semibold text-muted-foreground">Empréstimos não habilitados</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Entre em contato com o administrador.</p>
        </div>
      </div>
    );
  }

  const { client, loans, pixConfig } = data;
  const allowedTypes: ("diario" | "semanal" | "mensal")[] = (client.allowedPaymentTypes || "diario")
    .split(",").map((t: string) => t.trim())
    .filter((t: string) => ["diario", "semanal", "mensal"].includes(t)) as ("diario" | "semanal" | "mensal")[];

  const activeLoans = (loans as any[]).filter((l) => !["pago", "cancelado", "reprovado"].includes(l.status));
  const hasActive = activeLoans.length > 0;
  const sim = simQuery.data;
  const rejectedLoans = (loans as any[]).filter((l) => l.status === "reprovado").slice(0, 3);
  const visibleLoans = (loans as any[]).filter((l) => l.status !== "reprovado");

  return (
    <div className="space-y-4 pb-12">

      {/* Aviso de solicitação enviada */}
      {submitted && (
        <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-3">
          <ClipboardCheck className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-300">Solicitação enviada com sucesso!</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sua solicitação está em análise. Aguarde a aprovação.</p>
          </div>
          <button onClick={() => setSubmitted(false)}><XCircle className="w-4 h-4 text-muted-foreground" /></button>
        </div>
      )}

      {/* Avisos de reprovação */}
      {rejectedLoans.map((loan: any) => (
        <div key={loan.id} className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-300">Solicitação não aprovada</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Valor: <span className="font-semibold text-foreground">{fmt(loan.amount)}</span>
              {loan.rejectedReason && <> — <span className="text-red-300">{loan.rejectedReason}</span></>}
            </p>
          </div>
        </div>
      ))}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">Meus Empréstimos</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Wallet className="w-3.5 h-3.5 text-green-400" />
            <span className="text-sm text-muted-foreground">Limite disponível: <span className="text-green-400 font-bold">{fmt(client.creditLimit)}</span></span>
          </div>
        </div>
        {!hasActive && (
          <button
            onClick={() => setRequestOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-violet-500/30 transition-all active:scale-95"
          >
            <Zap className="w-4 h-4" /> Solicitar
          </button>
        )}
      </div>

      {/* Chave PIX do cliente */}
      {(() => {
        const hasPixKey = !!client?.client_pix_key;
        return (
          <div className={`rounded-2xl border-2 p-4 ${hasPixKey ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/50 bg-amber-500/10"}`}>
            <div className="flex items-start gap-3">
              <div className="text-2xl shrink-0">{hasPixKey ? "💳" : "⚠️"}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold mb-1 ${hasPixKey ? "text-emerald-300" : "text-amber-300"}`}>
                  {hasPixKey ? "Sua chave PIX para recebimento" : "Cadastre sua chave PIX"}
                </p>
                {!hasPixKey && (
                  <p className="text-xs text-muted-foreground mb-3">Necessário para receber o empréstimo aprovado.</p>
                )}
                {hasPixKey && !editingPix ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Chave:</span>
                      <span className="text-sm font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 break-all">{client.client_pix_key}</span>
                    </div>
                    {client.client_pix_name && <div className="text-xs text-muted-foreground">Titular: <span className="text-foreground">{client.client_pix_name}</span></div>}
                    {(client as any).client_pix_bank && <div className="text-xs text-muted-foreground">Banco: <span className="text-foreground">{(client as any).client_pix_bank}</span></div>}
                    <button onClick={() => { setPixKeyInput(client.client_pix_key || ""); setPixNameInput((client as any).client_pix_name || ""); setPixBankInput((client as any).client_pix_bank || ""); setEditingPix(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground mt-1 underline">Alterar</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      placeholder="Chave PIX (CPF, telefone, e-mail ou aleatória)" value={pixKeyInput} onChange={(e) => setPixKeyInput(e.target.value)} />
                    <input className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      placeholder="Nome completo do titular" value={pixNameInput} onChange={(e) => setPixNameInput(e.target.value)} />
                    <input className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      placeholder="Banco (ex: Nubank, Itau, Bradesco)" value={pixBankInput} onChange={(e) => setPixBankInput(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => savePixKey.mutate({ token, pixKey: pixKeyInput.trim(), pixName: pixNameInput.trim(), pixBank: pixBankInput.trim() })}
                        disabled={pixKeyInput.trim().length < 5 || pixNameInput.trim().length < 2 || pixBankInput.trim().length < 2 || savePixKey.isPending}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm transition-all">
                        {savePixKey.isPending ? "Salvando..." : "Salvar PIX"}
                      </button>
                      {editingPix && (
                        <button onClick={() => setEditingPix(false)} className="px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* PIX para pagamento */}
      {pixConfig && hasActive && (
        <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-slate-900/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-400" />
            <p className="text-sm font-bold text-blue-300">Chave PIX para pagamento</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm font-mono bg-blue-500/10 px-3 py-2.5 rounded-xl border border-blue-500/20 break-all">{pixConfig.pixKey}</span>
            <button onClick={() => { navigator.clipboard.writeText(pixConfig.pixKey); toast.success("Chave PIX copiada!"); }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2.5 rounded-xl text-sm transition-all active:scale-95 shrink-0">
              <Copy className="w-3.5 h-3.5" /> Copiar
            </button>
          </div>
          {pixConfig.pixName && <p className="text-xs text-muted-foreground mt-2">{pixConfig.pixName}{pixConfig.bankName ? ` · ${pixConfig.bankName}` : ""}</p>}
        </div>
      )}

      {/* Regras de atraso — destaque */}
      {lateFeeConfig?.enabled && !hasActive && (
        <LateFeePanel config={lateFeeConfig} />
      )}

      {/* Lista de empréstimos */}
      {visibleLoans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-5">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-violet-500/10 border-2 border-violet-500/20 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Banknote className="w-12 h-12 text-violet-400/50" />
            </div>
          </div>
          <div>
            <p className="text-lg font-black text-foreground">Nenhum empréstimo ativo</p>
            <p className="text-sm text-muted-foreground mt-1">Solicite agora com aprovação rápida</p>
          </div>
          <button onClick={() => setRequestOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-violet-700 text-white font-bold px-8 py-3 rounded-2xl shadow-xl shadow-violet-500/30 transition-all active:scale-95 text-base">
            <Zap className="w-5 h-5" /> Solicitar Empréstimo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleLoans.map((loan: any) => {
            const isExpanded = expandedLoan === loan.id;
            const showSendProof = ["aprovado", "aguardando_pagamento"].includes(loan.status);
            const paidCount = parseInt(loan.paidInstallments || 0);
            const totalCount = parseInt(loan.totalInstallments || 1);
            const totalAmt = parseFloat(loan.totalAmount || 0);

            return (
              <div key={loan.id} className={`rounded-2xl border-2 overflow-hidden transition-all ${
                loan.isOverdue ? "border-red-500/50 shadow-red-500/10 shadow-xl" :
                loan.status === "pago" ? "border-emerald-500/30" :
                loan.status === "pendente" ? "border-blue-500/30" :
                "border-violet-500/30 shadow-violet-500/10 shadow-xl"
              }`}>
                {/* Faixa de cor no topo */}
                <div className={`h-1.5 w-full ${
                  loan.isOverdue ? "bg-gradient-to-r from-red-600 to-red-400" :
                  loan.status === "pago" ? "bg-gradient-to-r from-emerald-600 to-emerald-400" :
                  loan.status === "pendente" ? "bg-gradient-to-r from-blue-600 to-blue-400" :
                  "bg-gradient-to-r from-violet-600 to-violet-400"
                }`} />

                <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/80 p-4">

                  {/* Banner pendente */}
                  {loan.status === "pendente" && (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 mb-4">
                      <Clock className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
                      <p className="text-xs text-blue-300 font-medium">Solicitação em análise — aguarde a aprovação.</p>
                    </div>
                  )}

                  {/* Status + valores principais */}
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <StatusBadge status={loan.status} isOverdue={loan.isOverdue} />
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total c/ juros</p>
                      <p className="text-xl font-black text-yellow-400">{fmt(loan.totalAmount)}</p>
                    </div>
                  </div>

                  {/* Grid de informações */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">💰 Solicitado</p>
                      <p className="text-base font-bold">{fmt(loan.amount)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">📅 Vencimento final</p>
                      <p className={`text-base font-bold ${loan.isOverdue ? "text-red-400" : ""}`}>{fmtDate(loan.dueDate)}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">📋 Modo</p>
                      <p className="text-sm font-bold capitalize">
                        {PAYMENT_LABELS[loan.paymentType] || loan.paymentType}
                        {loan.workDays === "seg_sab" ? " · Seg–Sáb" : loan.workDays === "seg_dom" ? " · Seg–Dom" : ""}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">🔢 Parcelas</p>
                      <p className="text-base font-bold">{paidCount}/{totalCount}</p>
                    </div>
                  </div>

                  {/* Progresso financeiro */}
                  <ProgressPanel paidCount={paidCount} totalCount={totalCount} totalAmount={totalAmt} />

                  {/* Regras de atraso dentro do empréstimo ativo */}
                  {lateFeeConfig?.enabled && !["pago", "cancelado", "reprovado"].includes(loan.status) && (
                    <LateFeePanel config={lateFeeConfig} installmentAmount={totalAmt / Math.max(totalCount, 1)} />
                  )}

                  {/* Botão ver parcelas */}
                  <button
                    onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                    className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl border font-bold text-sm transition-all active:scale-95 relative overflow-hidden ${
                      isExpanded
                        ? "border-violet-500/60 bg-violet-500/25 text-violet-200"
                        : "border-violet-500/40 bg-gradient-to-r from-violet-900/40 via-purple-900/30 to-violet-900/40 text-violet-200 hover:bg-violet-500/20"
                    }`}
                  >
                    {!isExpanded && (
                      <span className="flex items-end gap-[3px] h-7">
                        <span className="eq-bar eq-bar-1" style={{height:"8px",background:"rgba(167,139,250,0.9)"}}></span>
                        <span className="eq-bar eq-bar-2" style={{height:"14px",background:"rgba(192,132,252,0.9)"}}></span>
                        <span className="eq-bar eq-bar-3" style={{height:"20px",background:"rgba(216,180,254,1)"}}></span>
                        <span className="eq-bar eq-bar-4" style={{height:"10px",background:"rgba(192,132,252,0.9)"}}></span>
                        <span className="eq-bar eq-bar-5" style={{height:"16px",background:"rgba(167,139,250,0.9)"}}></span>
                        <span className="eq-bar eq-bar-6" style={{height:"6px",background:"rgba(139,92,246,0.8)"}}></span>
                        <span className="eq-bar eq-bar-7" style={{height:"12px",background:"rgba(167,139,250,0.9)"}}></span>
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isExpanded ? "Ocultar parcelas" : "Ver todas as parcelas"}
                    </span>
                    {!isExpanded && (
                      <span className="flex items-end gap-[3px] h-7">
                        <span className="eq-bar eq-bar-7" style={{height:"12px",background:"rgba(167,139,250,0.9)"}}></span>
                        <span className="eq-bar eq-bar-6" style={{height:"6px",background:"rgba(139,92,246,0.8)"}}></span>
                        <span className="eq-bar eq-bar-5" style={{height:"16px",background:"rgba(167,139,250,0.9)"}}></span>
                        <span className="eq-bar eq-bar-4" style={{height:"10px",background:"rgba(192,132,252,0.9)"}}></span>
                        <span className="eq-bar eq-bar-3" style={{height:"20px",background:"rgba(216,180,254,1)"}}></span>
                        <span className="eq-bar eq-bar-2" style={{height:"14px",background:"rgba(192,132,252,0.9)"}}></span>
                        <span className="eq-bar eq-bar-1" style={{height:"8px",background:"rgba(167,139,250,0.9)"}}></span>
                      </span>
                    )}
                  </button>

                  {/* Parcelas expandidas */}
                  {isExpanded && instData && instData.loan.id === loan.id && (
                    <>
                      <DatesPanel loan={loan} installments={instData.installments as any[]} />
                      <InstallmentTimeline
                        installments={instData.installments as any[]}
                        showSendProof={showSendProof}
                        onUpload={setUploadInstallmentId}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Solicitar */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Banknote className="w-4 h-4 text-violet-400" />
              </div>
              Solicitar Empréstimo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2">
              <Clock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300">Após enviar, sua solicitação passará por análise. Você será informado se aprovada.</p>
            </div>
            <div className="space-y-2">
              <Label>Valor solicitado (R$)</Label>
              <Input type="number" placeholder={`Máx: ${parseFloat(client.creditLimit || "0").toFixed(2)}`}
                value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} min={1} max={parseFloat(client.creditLimit)} />
              <p className="text-xs text-muted-foreground">Limite: <span className="text-green-400 font-bold">{fmt(client.creditLimit)}</span></p>
            </div>
            <div className="space-y-2">
              <Label>Modo de pagamento</Label>
              <div className={`grid gap-2 ${allowedTypes.length === 1 ? "grid-cols-1" : allowedTypes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {allowedTypes.map((m) => (
                  <button key={m} onClick={() => setPaymentType(m)}
                    className={`rounded-xl border p-2.5 text-xs font-bold transition-all ${paymentType === m ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-border/50 text-muted-foreground hover:border-violet-500/40"}`}>
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            {paymentType === "diario" && (
              <div className="space-y-2">
                <Label>Dias de pagamento</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["seg_sab", "seg_dom"] as const).map((d) => (
                    <button key={d} onClick={() => setWorkDays(d)}
                      className={`rounded-xl border p-2.5 text-xs font-bold transition-all flex flex-col items-center gap-1 ${workDays === d ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-border/50 text-muted-foreground hover:border-violet-500/40"}`}>
                      <Calendar className="w-3.5 h-3.5" />
                      {d === "seg_sab" ? "Seg – Sáb (20x)" : "Seg – Dom (25x)"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {simEnabled && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                {simQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calculando...
                  </div>
                ) : simQuery.isError ? (
                  <p className="text-xs text-red-400">{simQuery.error?.message}</p>
                ) : sim ? (
                  <>
                    <p className="text-xs font-black text-violet-300 uppercase tracking-wide">Simulação</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span className="text-xs text-muted-foreground">Parcelas</span><span className="text-sm font-bold text-right">{sim.installments}x</span>
                      <span className="text-xs text-muted-foreground">Por parcela</span><span className="text-sm font-bold text-right text-violet-300">{fmt(sim.perInstallment)}</span>
                      <span className="text-xs text-muted-foreground">Total a pagar</span><span className="text-sm font-bold text-right">{fmt(sim.totalAmount)}</span>
                      <span className="text-xs text-muted-foreground">Último venc.</span><span className="text-sm font-bold text-right">{fmtDate(sim.dueDate)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea placeholder="Motivo do empréstimo..." value={requestNotes} onChange={(e) => setRequestNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancelar</Button>
            <Button onClick={handleRequest} disabled={!requestAmount || parseFloat(requestAmount) <= 0 || requestMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700">
              {requestMutation.isPending ? "Enviando..." : <><Send className="w-4 h-4 mr-1" /> Solicitar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Comprovante */}
      <Dialog open={!!uploadInstallmentId} onOpenChange={(o) => { if (!o) { setUploadInstallmentId(null); setUploadFile(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Upload className="w-4 h-4 text-violet-400" />
              </div>
              Enviar Comprovante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Envie a foto ou arquivo do comprovante de pagamento.</p>
            <div className="border-2 border-dashed border-border/50 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
              onClick={() => fileRef.current?.click()}>
              {uploadFile ? (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-sm font-bold">{uploadFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(0)} KB</p>
                  <p className="text-xs text-emerald-400">Clique para trocar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto">
                    <Upload className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Clique para selecionar</p>
                  <p className="text-xs text-muted-foreground/60">JPG, PNG ou PDF — máx. 16MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadInstallmentId(null); setUploadFile(null); }}>Cancelar</Button>
            <Button onClick={handleSendProof} disabled={!uploadFile || proofMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
              {proofMutation.isPending ? "Enviando..." : <><Send className="w-4 h-4 mr-1" /> Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
