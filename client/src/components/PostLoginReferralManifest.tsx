import { useEffect, useState } from 'react';
import { CheckCircle2, HeartHandshake, Loader2, Phone, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';

type Route = 'gastos' | 'emprestimo';

function normalizeBrazilPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  const withoutCountryCode = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  return withoutCountryCode.slice(0, 11);
}

function formatPhone(raw: string) {
  const digits = normalizeBrazilPhone(raw);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function PostLoginReferralManifest({ token, route, onComplete }: {
  token: string;
  route: Route;
  onComplete: () => void;
}) {
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
  const [referrerName, setReferrerName] = useState('');
  const [referrerPhone, setReferrerPhone] = useState('');
  const [error, setError] = useState('');

  const declarationQuery = trpc.spreadsheet.getReferralDeclaration.useQuery(
    { token, route },
    { enabled: !!token, retry: false, refetchOnWindowFocus: false },
  );
  const submitMutation = trpc.spreadsheet.submitReferralDeclaration.useMutation({
    onSuccess: () => onComplete(),
    onError: (mutationError) => setError(mutationError.message || 'Não foi possível registrar sua resposta. Tente novamente.'),
  });

  useEffect(() => {
    if (declarationQuery.data?.answered) onComplete();
  }, [declarationQuery.data?.answered, onComplete]);

  // Falha de infraestrutura não pode impedir o cliente de usar a área já liberada.
  useEffect(() => {
    if (declarationQuery.isError) onComplete();
  }, [declarationQuery.isError, onComplete]);

  const submit = (answer: 'yes' | 'no') => {
    setError('');
    if (answer === 'yes' && !referrerName.trim() && !referrerPhone.replace(/\D/g, '')) {
      setError('Informe o nome, o telefone ou os dois dados de quem indicou você.');
      return;
    }
    submitMutation.mutate({
      token,
      route,
      answer,
      referrerName: answer === 'yes' ? referrerName.trim() : undefined,
      referrerPhone: answer === 'yes' ? referrerPhone.trim() : undefined,
    });
  };

  if (declarationQuery.isLoading || declarationQuery.data?.answered || declarationQuery.isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const areaLabel = route === 'gastos' ? 'Gestor de Gastos' : 'Empréstimos';

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#070a16] via-[#0a0f22] to-[#070a16] text-foreground flex items-center justify-center p-4 sm:p-6">
      <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-primary/30 bg-card/90 p-6 shadow-2xl shadow-primary/15 ring-1 ring-primary/10 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-24 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="relative">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/35 bg-primary/15 shadow-[0_0_28px_-6px_var(--primary)]">
            <HeartHandshake className="h-10 w-10 text-primary" />
          </div>
          <p className="text-center text-xs font-black uppercase tracking-[0.22em] text-primary">Informação importante</p>
          <h1 className="mt-3 text-center text-3xl font-black tracking-tight text-foreground sm:text-4xl">Alguém indicou você?</h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-base leading-relaxed text-muted-foreground sm:text-lg">
            Sua resposta ajuda a manter nosso controle organizado. Escolha uma opção para continuar para <strong className="text-foreground">{areaLabel}</strong>.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-300">{error}</div>
          )}

          {!choice && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setChoice('yes')}
                className="group rounded-2xl border-2 border-emerald-400/50 bg-emerald-500/10 p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-500/15 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-300"><CheckCircle2 className="h-7 w-7" /></div>
                <p className="text-xl font-black text-emerald-200">SIM, fui indicado</p>
                <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">Vou informar o nome, o telefone ou os dois dados de quem me indicou.</p>
              </button>
              <button
                type="button"
                onClick={() => submit('no')}
                disabled={submitMutation.isPending}
                className="group rounded-2xl border-2 border-slate-500/50 bg-slate-500/10 p-6 text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-500/15 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-400/15 text-slate-300"><Users className="h-7 w-7" /></div>
                <p className="text-xl font-black text-slate-100">NÃO, não fui indicado</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/75">Continuar sem registrar indicação.</p>
              </button>
            </div>
          )}

          {choice === 'yes' && (
            <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><UserRound className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-bold text-foreground">Dados de quem indicou</h2>
                  <p className="text-xs text-muted-foreground">Informe o nome, o telefone ou os dois dados. Esta declaração não altera comissões anteriores.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground"><UserRound className="mr-1.5 inline h-4 w-4 opacity-70" />Nome de quem indicou <span className="text-muted-foreground">(opcional se informar o telefone)</span></label>
                  <Input value={referrerName} onChange={(event) => setReferrerName(event.target.value)} placeholder="Nome completo" disabled={submitMutation.isPending} className="h-12 bg-input text-base" autoFocus />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground"><Phone className="mr-1.5 inline h-4 w-4 opacity-70" />Telefone/WhatsApp de quem indicou <span className="text-muted-foreground">(opcional se informar o nome)</span></label>
                  <Input value={formatPhone(referrerPhone)} onChange={(event) => setReferrerPhone(normalizeBrazilPhone(event.target.value))} inputMode="numeric" placeholder="(11) 99999-9999" disabled={submitMutation.isPending} className="h-12 bg-input text-base" />
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => { setChoice(null); setError(''); }} disabled={submitMutation.isPending} className="h-12">← Voltar</Button>
                <Button type="button" onClick={() => submit('yes')} disabled={submitMutation.isPending} className="h-12 font-bold">
                  {submitMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Confirmar indicação'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
