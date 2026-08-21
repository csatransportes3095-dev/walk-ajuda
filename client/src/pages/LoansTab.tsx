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
  parcelado: "Parcelado",
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
  const fee18 = parseFloat(config.fee_after_18h || 0);
  const fixedFeeAfter20 = fee18 + parseFloat(config.fee_after_20h || 0);
  const ex18 = amt > 0 ? amt + fee18 : null;
  const ex20 = amt > 0 ? amt + fixedFeeAfter20 : null;
  const exMid = amt > 0 ? amt + Math.max(fixedFeeAfter20, amt * parseFloat(config.fee_after_midnight_pct || 0) / 100) : null;

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-red-500/40 bg-gradient-to-br from-red-950/60 to-slate-900/80 mb-3">
      <div className="px-4 py-2.5 bg-red-500/20 border-b border-red-500/30 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-red-400" />
        <span className="text-xs font-black text-red-300 uppercase tracking-wider">⚠️ Regras de Atraso e Taxas</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          <p className="text-sm text-red-200 font-semibold">Pague no prazo para evitar taxas extras:</p>
          <div className="space-y-1.5">
            {fee18 > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                <span className="text-lg">🕕</span>
                <div>
                  <span className="text-xs font-bold text-red-300">Das 18h até 19:59:</span>
                  <span className="text-xs text-red-200 ml-1">taxa fixa de R$ {fee18.toFixed(2)}</span>
                  {ex18 && <span className="text-xs text-muted-foreground ml-1">(parcela vira {fmt(ex18)})</span>}
                </div>
              </div>
            )}
            {fixedFeeAfter20 > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                <span className="text-lg">🕗</span>
                <div>
                  <span className="text-xs font-bold text-red-300">A partir das 20h:</span>
                  <span className="text-xs text-red-200 ml-1">taxa fixa acumulada de R$ {fixedFeeAfter20.toFixed(2)}</span>
                  {ex20 && <span className="text-xs text-muted-foreground ml-1">(parcela vira {fmt(ex20)})</span>}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 bg-red-700/20 rounded-lg px-3 py-2 border border-red-600/30">
              <span className="text-lg">🌙</span>
              <div>
                <span className="text-xs font-black text-red-300">Após 23:59:</span>
                <span className="text-xs text-red-200 ml-1">será cobrado somente o maior valor entre R$ {fixedFeeAfter20.toFixed(2)} e o valor da parcela</span>
                {exMid && <span className="text-xs text-red-300 font-bold ml-1">(parcela vira {fmt(exMid)})</span>}
              </div>
            </div>
          </div>
        </div>
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
            const feeAmount = Number(inst.feeApplied || 0);
            const originalAmount = inst.originalAmount != null ? Number(inst.originalAmount) : null;
            const hasLateFee = originalAmount !== null && feeAmount > 0;

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
                      {hasLateFee && (
                        <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-3 text-muted-foreground"><span>Parcela</span><span>{fmt(originalAmount)}</span></div>
                          <div className="flex items-center justify-between gap-3 text-amber-300"><span>Taxa de atraso</span><span>+ {fmt(feeAmount)}</span></div>
                          <div className="flex items-center justify-between gap-3 border-t border-amber-400/20 pt-1 font-black text-foreground"><span>Total a pagar</span><span>{fmt(inst.amount)}</span></div>
                        </div>
                      )}
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
                          <span className="text-xs text-purple-400 font-medium">Comprovante em análise{hasLateFee ? " — valor atualizado acima" : "..."}</span>
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
  const [paymentType, setPaymentType] = useState<"diario" | "semanal" | "mensal" | "parcelado">("diario");
  const [workDays, setWorkDays] = useState<"seg_sab" | "seg_dom">("seg_sab");
  const [requestNotes, setRequestNotes] = useState("");
  const [uploadInstallmentId, setUploadInstallmentId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [simAmount, setSimAmount] = useState(0);
  const [simEnabled, setSimEnabled] = useState(false);
  // Parcelado
  const [parceladoAmount, setParceladoAmount] = useState(0);
  const [parceladoEnabled, setParceladoEnabled] = useState(false);
  const [parceladoSelecionado, setParceladoSelecionado] = useState<number | null>(null);
  const [parceladoFrequencia, setParceladoFrequencia] = useState<'mensal' | 'quinzenal' | 'semanal'>('mensal');
  const [parceladoConfirm, setParceladoConfirm] = useState(false);
  const [parceladoPrimeiroVenc, setParceladoPrimeiroVenc] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    const v = parseFloat(requestAmount);
    if (v > 0 && paymentType !== 'parcelado') {
      const t = setTimeout(() => { setSimAmount(v); setSimEnabled(true); }, 700);
      return () => clearTimeout(t);
    } else {
      setSimEnabled(false);
      setSimAmount(0);
    }
    if (v > 0 && paymentType === 'parcelado') {
      const t = setTimeout(() => { setParceladoAmount(v); setParceladoEnabled(true); setParceladoSelecionado(null); setParceladoConfirm(false); }, 700);
      return () => clearTimeout(t);
    } else if (paymentType === 'parcelado') {
      setParceladoEnabled(false); setParceladoAmount(0);
    }
  }, [requestAmount, paymentType, workDays]);

  const simQuery = trpc.loans.simulateLoan.useQuery(
    { token, amount: simAmount, paymentType, workDays },
    { enabled: simEnabled && simAmount > 0, retry: false }
  );

  const { data, isLoading, refetch } = trpc.loans.getClientLoanInfo.useQuery(
    { token },
    {
      enabled: !!token,
      // Empréstimos criados pelo ADM precisam aparecer sem depender do cache anterior do cliente.
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      // Mantém a sessão ativa sincronizada com a alteração de rotas feita pelo ADM.
      refetchInterval: 1000,
    }
  );

  const { data: instData, refetch: refetchInst } = trpc.loans.getClientInstallments.useQuery(
    { token, loanId: expandedLoan! },
    {
      enabled: !!expandedLoan,
      // Mantém o total da parcela aberto sincronizado com a regra de horário e com ações do ADM.
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 15000,
    }
  );

  const { data: lateFeeConfig } = trpc.loans.getLateFeeConfig.useQuery();

  // O modo individual gravado pelo ADM é a prioridade do cliente. O perfil só
  // é usado pelo backend ao criar quem ainda não possui uma configuração própria.
  useEffect(() => {
    const configuredModes = String((data as any)?.client?.allowedPaymentTypes || '')
      .split(',')
      .map((mode) => mode.trim())
      .filter((mode): mode is "diario" | "semanal" | "mensal" | "parcelado" => ["diario", "semanal", "mensal", "parcelado"].includes(mode));
    if (configuredModes.length > 0 && !configuredModes.includes(paymentType)) {
      setPaymentType(configuredModes[0]);
    }
  }, [(data as any)?.client?.allowedPaymentTypes, paymentType]);

  const [pixKeyInput, setPixKeyInput] = useState("");
  const [pixNameInput, setPixNameInput] = useState("");
  const [pixBankInput, setPixBankInput] = useState("");
  const [editingPix, setEditingPix] = useState(false);

  const savePixKey = trpc.loans.saveClientPixKey.useMutation({
    onSuccess: () => { toast.success("Chave PIX salva!"); setEditingPix(false); refetch(); },
    onError: (e) => toast.error(e.message || "Erro ao salvar chave PIX"),
  });

  const simParceladoQuery = trpc.loans.simulateParcelado.useQuery(
    { token, amount: parceladoAmount },
    { enabled: parceladoEnabled && parceladoAmount > 0, retry: false }
  );

  const requestParceladoMutation = trpc.loans.requestParcelado.useMutation({
    onSuccess: () => {
      toast.success('Solicitação enviada! Aguarde a aprovação.');
      setSubmitted(true); setRequestOpen(false); setRequestAmount(""); setRequestNotes("");
      setParceladoEnabled(false); setParceladoAmount(0); setParceladoSelecionado(null); setParceladoConfirm(false);
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erro ao solicitar empréstimo"),
  });

  const requestMutation = trpc.loans.requestLoan.useMutation({
    onSuccess: () => {
      toast.success("Solicitação enviada! Aguarde a análise.");
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
    if (v > Number(client?.creditLimit || 0)) { toast.error("O valor solicitado excede o seu limite disponível."); return; }
    const pixComplete = Boolean(client?.client_pix_key && client?.client_pix_name && (client as any)?.client_pix_bank);
    if (!pixComplete) {
      toast.error("Complete sua chave PIX para recebimento antes de solicitar.");
      setRequestOpen(false);
      setEditingPix(true);
      return;
    }
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
    const profileIncomplete = Boolean((data as any)?.profileIncomplete);
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className={`w-20 h-20 rounded-full border flex items-center justify-center ${profileIncomplete ? 'bg-amber-500/10 border-amber-500/30' : 'bg-muted/20 border-muted/30'}`}>
          {profileIncomplete ? <AlertTriangle className="w-10 h-10 text-amber-400" /> : <Banknote className="w-10 h-10 text-muted-foreground/30" />}
        </div>
        <div>
          <p className="font-semibold text-muted-foreground">{profileIncomplete ? 'Complete seu cadastro principal' : 'Empréstimos não habilitados'}</p>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">{profileIncomplete ? ((data as any)?.message || 'Foto, e-mail, CPF e telefone são obrigatórios antes de acessar empréstimos.') : 'Entre em contato com o administrador.'}</p>
        </div>
      </div>
    );
  }

  const { client, loans, pixConfig } = data;
  const h2Score: any = (data as any).h2Score || {};
  const h2TotalPoints = Number(h2Score.account?.totalPoints ?? h2Score.totalPoints ?? 0);
  const h2Level = h2Score.level || { slug: 'bronze', label: 'Bronze', icon: '🥉', nextLevel: 'Prata', pointsToNext: Math.max(0, 60 - h2TotalPoints) };
  const h2Config = h2Score.config || { bronzeMin: 0, prataMin: 60, ouroMin: 90, diamanteMin: 100 };
  const h2ScoreProfiles: any[] = Array.isArray((data as any).h2ScoreProfiles) ? (data as any).h2ScoreProfiles : [];
  const h2CurrentProfile = h2ScoreProfiles.find((profile) => profile.slug === h2Level.slug) || {
    name: client.profileSlug || h2Level.label,
    interestRate: Number(client.interestRate || 0),
    creditLimit: Number(client.creditLimit || 0),
  };
  const h2NextProfile = h2Level.nextLevel
    ? h2ScoreProfiles.find((profile) => profile.slug === String(h2Level.nextLevel).toLowerCase()) || null
    : null;
  const h2NearPromotion = Boolean(h2Level.nextLevel && Number(h2Level.pointsToNext || 0) > 0 && Number(h2Level.pointsToNext || 0) <= 5);
  const h2LevelRank: Record<string, number> = { bronze: 1, prata: 2, ouro: 3, diamante: 4 };
  const h2ToneByLevel: Record<string, { border: string; background: string; text: string }> = {
    bronze: { border: 'border-amber-600/45', background: 'bg-amber-500/10', text: 'text-amber-200' },
    prata: { border: 'border-slate-300/45', background: 'bg-slate-200/10', text: 'text-slate-100' },
    ouro: { border: 'border-yellow-400/50', background: 'bg-yellow-500/10', text: 'text-yellow-200' },
    diamante: { border: 'border-cyan-300/55', background: 'bg-cyan-400/10', text: 'text-cyan-100' },
  };
  const h2CurrentTone = h2ToneByLevel[h2Level.slug] || h2ToneByLevel.bronze;
  const h2ProgressLevels = [
    { slug: 'bronze', icon: '🥉', label: 'Bronze', benefit: `${Number(h2ScoreProfiles.find((profile) => profile.slug === 'bronze')?.interestRate || 0)}%` },
    { slug: 'prata', icon: '🥈', label: 'Prata', benefit: `${Number(h2ScoreProfiles.find((profile) => profile.slug === 'prata')?.interestRate || 0)}%` },
    { slug: 'ouro', icon: '🥇', label: 'Ouro', benefit: `${Number(h2ScoreProfiles.find((profile) => profile.slug === 'ouro')?.interestRate || 0)}%` },
    { slug: 'diamante', icon: '💎', label: 'Diamante', benefit: 'Pagamento semanal' },
  ];
  const nextInstallment = (data as any).nextInstallment;
  const allowedTypes: string[] = (client.allowedPaymentTypes || "diario")
    .split(",").map((t: string) => t.trim())
    .filter((t: string) => ["diario", "semanal", "mensal", "parcelado"].includes(t));

  const activeLoans = (loans as any[]).filter((l) => !["pago", "cancelado", "reprovado"].includes(l.status));
  const hasActive = activeLoans.length > 0;
  const sim = simQuery.data;
  const rejectedLoans = (loans as any[]).filter((l) => l.status === "reprovado").slice(0, 3);
  // O empréstimo atual vem sempre antes de históricos quitados, mesmo que existam registros antigos.
  const clientLoanPriority: Record<string, number> = { pendente: 0, aprovado: 1, aguardando_pagamento: 2, em_analise: 3, pago: 4, cancelado: 5 };
  const visibleLoans = [...(loans as any[])]
    .filter((l) => l.status !== "reprovado")
    .sort((a, b) => {
      const priority = (clientLoanPriority[a.status] ?? 9) - (clientLoanPriority[b.status] ?? 9);
      if (priority !== 0) return priority;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });

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

      {/* ─── H2 SCORE PERMANENTE DO CLIENTE ─────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-cyan-950/45 to-slate-900/80">
          <div className="px-4 py-2.5 bg-cyan-500/10 border-b border-cyan-500/20 flex items-center justify-between gap-3">
            <span className="text-xs font-black text-cyan-100 uppercase tracking-wider">H2 SCORE — SEU NÍVEL</span>
            <span className="text-xs font-bold text-cyan-200">Benefícios no próximo empréstimo</span>
          </div>
          <div className="p-4 space-y-3">

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-[1.35rem] flex flex-col items-center justify-center shadow-xl border-2 shrink-0 overflow-hidden ${h2CurrentTone.background} ${h2CurrentTone.border}`} aria-label={`${h2TotalPoints} pontos H2 Score`}>
                  <span className={`absolute inset-2 rounded-2xl border opacity-30 animate-ping ${h2CurrentTone.border}`} aria-hidden="true" />
                  <span className="absolute top-1.5 right-2 text-base leading-none drop-shadow" aria-hidden="true">{h2Level.icon}</span>
                  <span className={`relative text-3xl sm:text-4xl leading-none font-black tracking-tight animate-pulse ${h2CurrentTone.text}`}>{h2TotalPoints}</span>
                  <span className={`relative mt-1 text-[10px] sm:text-[11px] leading-none font-black tracking-[0.12em] ${h2CurrentTone.text}`}>PONTOS</span>
                </div>
                <div className="min-w-0"><p className={`font-black text-base sm:text-lg ${h2CurrentTone.text}`}>NÍVEL {h2Level.label.toUpperCase()}</p><p className="text-xs text-cyan-100/70 mt-0.5">{h2Level.nextLevel ? `Faltam ${h2Level.pointsToNext} pontos para ${String(h2Level.nextLevel).toUpperCase()}.` : 'Você alcançou o nível máximo.'}</p></div>
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-950/80"><div className="h-full rounded-full bg-gradient-to-r from-amber-600 via-yellow-300 to-cyan-300 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, h2TotalPoints))}%` }} /></div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {h2ProgressLevels.map((level) => {
                const achieved = h2LevelRank[h2Level.slug] >= h2LevelRank[level.slug];
                const tone = h2ToneByLevel[level.slug];
                return <div key={level.slug} className={`rounded-lg border px-1 py-1.5 transition-opacity ${achieved ? `${tone.border} ${tone.background} ${tone.text}` : 'border-white/10 bg-white/[0.02] text-slate-500 opacity-55'}`}><p className="text-sm leading-none">{level.icon}</p><p className="mt-1 text-[8px] font-black uppercase">{level.label}</p><p className="mt-0.5 text-[9px] font-bold leading-tight">{level.benefit}</p></div>;
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <section className={`rounded-xl border p-3 ${h2CurrentTone.border} ${h2CurrentTone.background}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${h2CurrentTone.text}`}>{h2Level.icon} Seu benefício atual</p>
                <p className={`mt-1 text-sm font-black ${h2CurrentTone.text}`}>{h2Level.label.toUpperCase()}</p>
                {h2Level.slug === 'diamante' ? <p className="mt-2 text-[12px] font-black text-cyan-50">PAGAMENTO SEMANAL <span className="text-cyan-200">DESBLOQUEADO</span></p> : <p className="mt-2 text-[11px] text-slate-200">Taxa <strong className={`ml-1 text-2xl leading-none ${h2CurrentTone.text}`}>{Number(h2CurrentProfile.interestRate || 0)}%</strong></p>}
              </section>
              <section className={`rounded-xl border p-3 ${h2NextProfile ? 'border-violet-300/30 bg-violet-500/10' : 'border-cyan-300/45 bg-cyan-400/10'}`}>
                {h2NextProfile ? <>
                  <p className="text-[10px] font-black uppercase tracking-wider text-violet-200">🔓 Próxima conquista</p>
                  <p className="mt-1 text-sm font-black text-white">{String(h2Level.nextLevel).toUpperCase()}</p>
                  <p className="mt-1 text-[11px] font-bold text-violet-100">Faltam {h2Level.pointsToNext} pontos</p>
                  {h2NextProfile.slug === 'diamante' ? <><p className="mt-2 text-[10px] font-black uppercase tracking-wider text-cyan-100">Benefício máximo</p><p className="mt-1 text-sm font-black text-cyan-50">PAGAMENTO SEMANAL</p></> : <><p className="mt-2 text-[10px] font-black uppercase tracking-wider text-violet-200">Reduza sua taxa</p><p className="mt-1 text-[12px] text-slate-100"><span className="font-black text-slate-300">{Number(h2CurrentProfile.interestRate || 0)}%</span><span className="mx-2 text-violet-300">→</span><strong className="text-2xl leading-none text-violet-100">{Number(h2NextProfile.interestRate || 0)}%</strong></p></>}
                  <p className="mt-2 text-[10px] text-violet-100/80">Continue pagando no prazo para desbloquear.</p>
                </> : <>
                  <p className="text-[10px] font-black uppercase tracking-wider text-cyan-100">💎 Diamante</p>
                  <p className="mt-1 text-sm font-black text-cyan-50">NÍVEL MÁXIMO</p>
                  <p className="mt-2 text-sm font-black text-cyan-100">PAGAMENTO SEMANAL DESBLOQUEADO</p>
                </>}
              </section>
            </div>

            {h2NearPromotion && <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-50"><strong>🔥 FALTAM APENAS {h2Level.pointsToNext} PONTOS!</strong><p className="mt-0.5 text-amber-100/85">Você está perto de alcançar {h2Level.nextLevel} e melhorar as condições do seu próximo empréstimo.</p></div>}
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/8 px-3 py-3"><p className="text-xs font-black text-emerald-100">🎯 PAGUE EM DIA E PAGUE MENOS</p><p className="mt-1 text-[11px] leading-relaxed text-emerald-50/80">Envie seus comprovantes dentro do prazo, acumule pontos e conquiste taxas menores no próximo empréstimo.</p></div>

            {/* Próxima parcela */}
            {nextInstallment && (() => {
              const days = daysUntil(nextInstallment.dueDate);
              const isLate = days !== null && days < 0;
              const isToday = days === 0;
              const isUrgent = days !== null && days <= 2 && days >= 0;
              return (
                <div className={`rounded-xl p-3 border ${
                  isLate ? 'bg-red-500/10 border-red-500/30' :
                  isUrgent ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-violet-500/10 border-violet-500/20'
                } flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${isLate ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-violet-400'}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">Próxima parcela</p>
                      <p className={`text-sm font-black ${
                        isLate ? 'text-red-300' : isUrgent ? 'text-amber-300' : 'text-violet-300'
                      }`}>{fmtDate(nextInstallment.dueDate)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black text-foreground">{fmt(nextInstallment.amount)}</p>
                    <p className={`text-xs font-bold ${
                      isLate ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-muted-foreground'
                    }`}>
                      {isLate ? `${Math.abs(days!)}d em atraso` : isToday ? 'HOJE' : days === 1 ? 'amanhã' : `${days} dias`}
                    </p>
                  </div>
                </div>
              );
            })()}

          </div>
      </div>

      {hasActive && h2Score.promotionEvent && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3">
          <span className="text-xl">{h2Score.promotionEvent.level?.icon || h2Level.icon}</span>
          <div><p className="text-sm font-black text-emerald-200">🎉 NOVO NÍVEL DESBLOQUEADO</p><p className="mt-0.5 text-xs font-bold text-emerald-100">Parabéns! Você alcançou o nível {h2Score.promotionEvent.level?.label || h2Level.label}.</p><p className="mt-0.5 text-xs text-emerald-100/80">Suas novas condições serão consideradas no próximo empréstimo. O seu contrato atual não será alterado.</p></div>
        </div>
      )}

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
          {visibleLoans.map((loan: any, index: number) => {
            const isHistoryLoan = ["pago", "cancelado"].includes(loan.status);
            const isPaidLoan = loan.status === "pago";
            const isFirstHistory = isHistoryLoan && !visibleLoans.slice(0, index).some((item: any) => ["pago", "cancelado"].includes(item.status));
            const isFirstCurrent = index === 0 && !isHistoryLoan;
            const isExpanded = expandedLoan === loan.id;
            const showSendProof = !["pago", "cancelado", "reprovado"].includes(loan.status) && !!loan.pixSentAt;
            const paidCount = parseInt(loan.paidInstallments || 0);
            const totalCount = parseInt(loan.totalInstallments || 1);
            const totalAmt = parseFloat(loan.totalAmount || 0);

            return (
              <div key={loan.id} className="space-y-2">
                {isFirstCurrent && (
                  <div className="px-1 pt-1">
                    <p className="text-xs font-black uppercase tracking-wider text-violet-300">Empréstimo atual</p>
                    <p className="text-xs text-muted-foreground">Acompanhe a solicitação, liberação e parcelas em aberto.</p>
                  </div>
                )}
                {isFirstHistory && (
                  <div className="mt-6 border-t border-white/10 px-1 pt-5">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Histórico de empréstimos</p>
                    <p className="text-xs text-muted-foreground">Empréstimos quitados ou cancelados ficam somente nesta área.</p>
                  </div>
                )}
                <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
                loan.isOverdue ? "border-red-500/50 shadow-red-500/10 shadow-xl" :
                isPaidLoan ? "border-emerald-400/80 shadow-2xl shadow-emerald-500/20 ring-1 ring-emerald-400/30" :
                loan.status === "pendente" ? "border-blue-500/30" :
                "border-violet-500/30 shadow-violet-500/10 shadow-xl"
              }`}>
                {/* Faixa de cor no topo */}
                <div className={`w-full ${isPaidLoan ? "h-2" : "h-1.5"} ${
                  loan.isOverdue ? "bg-gradient-to-r from-red-600 to-red-400" :
                  isPaidLoan ? "bg-gradient-to-r from-emerald-700 via-lime-400 to-emerald-500" :
                  loan.status === "pendente" ? "bg-gradient-to-r from-blue-600 to-blue-400" :
                  "bg-gradient-to-r from-violet-600 to-violet-400"
                }`} />

                <div className={`${isPaidLoan ? "bg-gradient-to-br from-emerald-950/80 via-teal-950/55 to-slate-900/90" : "bg-gradient-to-br from-slate-800/40 to-slate-900/80"} p-4`}>

                  {/* Banner de quitação: visual exclusivo para não confundir com empréstimo ativo */}
                  {isPaidLoan && (
                    <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/15 px-4 py-3 shadow-lg shadow-emerald-500/10">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-400/40">
                        <CheckCheck className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-black tracking-wide text-emerald-300">EMPRÉSTIMO QUITADO</p>
                        <p className="text-xs font-medium text-emerald-100/80">Todas as parcelas foram pagas. Não há cobrança pendente.</p>
                      </div>
                      <span className="rounded-full border border-emerald-300/50 bg-emerald-400/20 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-200">100% pago</span>
                    </div>
                  )}

                  {/* Banner pendente */}
                  {loan.status === "pendente" && (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 mb-4">
                      <Clock className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
                      <p className="text-xs text-blue-300 font-medium">Solicitação em análise — aguarde a aprovação.</p>
                    </div>
                  )}
                  {/* Empréstimo aprovado, aguardando a transferência PIX pelo ADM */}
                  {loan.status === "aprovado" && !loan.pixSentAt && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-4">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                      <p className="text-xs text-amber-300 font-medium">Empréstimo aprovado — aguardando a liberação do PIX pelo administrador.</p>
                    </div>
                  )}
                  {loan.status === "aprovado" && loan.pixSentAt && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 mb-4">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <p className="text-xs text-emerald-300 font-medium">PIX liberado. Seu empréstimo está ativo e as parcelas já estão disponíveis.</p>
                    </div>
                  )}

                  {/* Status + valores principais */}
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <StatusBadge status={loan.status} isOverdue={loan.isOverdue} />
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{isPaidLoan ? "Total quitado" : "Total c/ juros"}</p>
                      <p className={`text-xl font-black ${isPaidLoan ? "text-emerald-300" : "text-yellow-400"}`}>{fmt(loan.totalAmount)}</p>
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
                    {loan.releaseDate && (
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground mb-1">🟢 Liberação</p>
                        <p className="text-base font-bold text-emerald-400">{fmtDate(loan.releaseDate)}</p>
                      </div>
                    )}
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
                      isPaidLoan
                        ? (isExpanded ? "border-emerald-400/70 bg-emerald-500/25 text-emerald-100" : "border-emerald-400/50 bg-gradient-to-r from-emerald-950/80 via-teal-900/60 to-emerald-950/80 text-emerald-200 hover:bg-emerald-500/20")
                        : (isExpanded ? "border-violet-500/60 bg-violet-500/25 text-violet-200" : "border-violet-500/40 bg-gradient-to-r from-violet-900/40 via-purple-900/30 to-violet-900/40 text-violet-200 hover:bg-violet-500/20")
                    }`}
                  >
                    {!isExpanded && !isPaidLoan && (
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
                      {isExpanded ? "Ocultar parcelas" : isPaidLoan ? "Ver parcelas quitadas" : "Ver todas as parcelas"}
                    </span>
                    {!isExpanded && !isPaidLoan && (
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
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Solicitar */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm max-h-[calc(100dvh-1rem)] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Banknote className="w-4 h-4 text-violet-400" />
              </div>
              Solicitar Empréstimo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-5 pb-5">
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2">
              <Clock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300">Após enviar, sua solicitação passará por análise. Você será informado se aprovada.</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/35 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-cyan-500/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200">Limite disponível</p>
                  <p className="mt-0.5 text-xs text-emerald-100/70">Este é o valor máximo que você pode solicitar.</p>
                </div>
                <p className="shrink-0 text-xl font-black text-emerald-300">{fmt(client.creditLimit)}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-base font-black text-foreground">Quanto você deseja solicitar?</Label>
                <p className="mt-1 text-xs text-muted-foreground">Digite o valor ou escolha um atalho abaixo.</p>
              </div>
              <div className="flex items-center rounded-2xl border-2 border-violet-400/70 bg-violet-500/10 px-4 py-1 shadow-[0_0_22px_rgba(139,92,246,0.16)] transition-colors focus-within:border-violet-300 focus-within:bg-violet-500/15">
                <span className="mr-2 text-2xl font-black text-violet-300">R$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0,00"
                  className="h-14 border-0 bg-transparent px-0 text-2xl font-black text-white shadow-none placeholder:text-muted-foreground/45 focus-visible:ring-0"
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  min={1}
                  max={parseFloat(client.creditLimit)}
                  aria-label="Valor que deseja solicitar"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([0.25, 0.5, 0.75, 1] as const).map((percent) => {
                  const amount = Number(client.creditLimit || 0) * percent;
                  const label = percent === 1 ? 'Limite total' : `${Math.round(percent * 100)}%`;
                  return (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => setRequestAmount(amount.toFixed(2))}
                      disabled={amount <= 0}
                      className={`min-h-14 rounded-xl border px-1 py-2 text-center transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${percent === 1 ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'border-violet-400/30 bg-violet-500/10 text-violet-200 hover:border-violet-300/60 hover:bg-violet-500/20'}`}
                    >
                      <span className="block text-[10px] font-black uppercase leading-none">{label}</span>
                      <span className="mt-1 block text-[10px] font-semibold leading-none opacity-80">{fmt(amount)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-[11px] text-muted-foreground">Você pode solicitar qualquer valor entre R$ 1,00 e {fmt(client.creditLimit)}.</p>
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
            {paymentType === "diario" && allowedTypes.includes("diario") && (
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

            {/* Simulação para modos normais */}
            {simEnabled && paymentType !== 'parcelado' && (
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

            {/* Parcelado: escolha de parcelas */}
            {paymentType === 'parcelado' && parceladoEnabled && !parceladoConfirm && (
              <div className="space-y-3">
                {simParceladoQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calculando opções...</div>
                ) : simParceladoQuery.isError ? (
                  <p className="text-xs text-red-400">{simParceladoQuery.error?.message}</p>
                ) : simParceladoQuery.data?.opcoes?.length ? (
                  <>
                    <Label>Escolha o parcelamento</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {simParceladoQuery.data.opcoes.map((op: any) => (
                        <button key={op.parcelas} onClick={() => setParceladoSelecionado(op.parcelas)}
                          className={`w-full rounded-xl border p-3 text-left transition-all ${
                            parceladoSelecionado === op.parcelas
                              ? 'border-violet-500 bg-violet-500/20'
                              : 'border-border/50 hover:border-violet-500/40'
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm">{op.parcelas}x de <span className="text-violet-300">{fmt(op.valorParcela)}</span></span>
                            <span className="text-xs text-muted-foreground">Total: {fmt(op.valorTotal)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {parceladoSelecionado && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                          <p className="text-xs text-amber-300">Após aprovação, o PIX será enviado em até 24h. O primeiro vencimento será 30 dias após a liberação.</p>
                        </div>
                        <Button className="w-full bg-violet-600 hover:bg-violet-700" onClick={() => setParceladoConfirm(true)}>
                          Ver resumo da solicitação
                        </Button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* Parcelado: tela de confirmação */}
            {paymentType === 'parcelado' && parceladoConfirm && parceladoSelecionado && simParceladoQuery.data && (() => {
              const op = simParceladoQuery.data.opcoes.find((o: any) => o.parcelas === parceladoSelecionado);
              if (!op) return null;
              const diasFreq = parceladoFrequencia === 'semanal' ? 7 : parceladoFrequencia === 'quinzenal' ? 15 : 30;
              const datas: string[] = [];
              for (let i = 0; i < op.parcelas; i++) {
                const d = new Date(parceladoPrimeiroVenc + 'T12:00:00');
                d.setDate(d.getDate() + i * diasFreq);
                datas.push(d.toLocaleDateString('pt-BR'));
              }
              return (
                <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                  <p className="text-sm font-black text-violet-300 uppercase tracking-wide">Resumo da Solicitação</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Valor solicitado</span><span className="font-bold">{fmt(parseFloat(requestAmount))}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Parcelamento</span><span className="font-bold text-violet-300">{op.parcelas}x de {fmt(op.valorParcela)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Valor total</span><span className="font-bold">{fmt(op.valorTotal)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Frequência</span><span className="font-bold">Mensal</span></div>
                  </div>
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-300">Após aprovação, o PIX será enviado em até 24h. O 1º vencimento será 30 dias após a liberação.</p>
                  </div>
                  <Button
                    onClick={() => {
                      if (!parceladoSelecionado) { toast.error('Selecione o parcelamento'); return; }
                      requestParceladoMutation.mutate({ token, amount: parseFloat(requestAmount), parcelas: parceladoSelecionado, frequencia: parceladoFrequencia });
                    }}
                    disabled={!requestAmount || !parceladoSelecionado || requestParceladoMutation.isPending}
                    className="w-full bg-violet-600 hover:bg-violet-700">
                    {requestParceladoMutation.isPending ? 'Enviando...' : <><Send className="w-4 h-4 mr-1" /> Confirmar Solicitação</>}
                  </Button>
                  <button onClick={() => setParceladoConfirm(false)} className="text-xs text-muted-foreground underline w-full text-center">Voltar e alterar</button>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea placeholder="Motivo do empréstimo..." value={requestNotes} onChange={(e) => setRequestNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-30 flex-row gap-2 border-t border-violet-500/25 bg-[#0b0a16]/98 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pb-3 backdrop-blur-md">
            <Button variant="outline" onClick={() => setRequestOpen(false)} className="h-12 flex-1">Cancelar</Button>
            {paymentType !== 'parcelado' && (
              <Button onClick={handleRequest} disabled={!requestAmount || parseFloat(requestAmount) <= 0 || requestMutation.isPending}
                className="h-12 flex-1 bg-violet-600 hover:bg-violet-700">
                {requestMutation.isPending ? "Enviando..." : <><Send className="w-4 h-4 mr-1" /> Solicitar</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Comprovante */}
      <Dialog open={!!uploadInstallmentId} onOpenChange={(o) => { if (!o) { setUploadInstallmentId(null); setUploadFile(null); } }}>
        <DialogContent className="max-w-sm max-h-[calc(100dvh-1rem)] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Upload className="w-4 h-4 text-violet-400" />
              </div>
              Enviar Comprovante
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-5 pb-5">
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
          <DialogFooter className="sticky bottom-0 z-30 flex-row gap-2 border-t border-violet-500/25 bg-[#0b0a16]/98 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pb-3 backdrop-blur-md">
            <Button variant="outline" onClick={() => { setUploadInstallmentId(null); setUploadFile(null); }} className="h-12 flex-1">Cancelar</Button>
            <Button onClick={handleSendProof} disabled={!uploadFile || proofMutation.isPending} className="h-12 flex-1 bg-violet-600 hover:bg-violet-700">
              {proofMutation.isPending ? "Enviando..." : <><Send className="w-4 h-4 mr-1" /> Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
