import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[desktop-refresh-flicker] ${label}: esperado 1 bloco, encontrado ${count}`);
  return source.replace(oldText, newText);
}

// H2ADS: o dashboard inteiro era reconsultado a cada 1 segundo, inclusive em background.
// Em desktop com muitos cards isso repinta toda a grade repetidamente. Mantemos atualização
// automática, mas em cadência segura, sem background, preservando o dado anterior.
{
  const file = 'client/src/pages/H2Ads.tsx';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceOnce(
    source,
    'const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false, staleTime: 0, refetchInterval: 1_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });',
    'const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, { retry: false, staleTime: 5000, refetchInterval: 10000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, placeholderData: (prev: any) => prev });',
    'polling global H2ADS',
  );
  fs.writeFileSync(file, source, 'utf8');
}

// PEDIDOS: já existe um marcador leve a cada 3s que detecta alteração real.
// O refetch pesado de toda a lista a cada 30s era redundante e causava repaint sincronizado.
// Quando o marcador muda, atualizamos também as queries de agenda uma única vez.
{
  const file = 'client/src/pages/AdminOrders.tsx';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceOnce(
    source,
    `  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,`,
    `  const ordersQuery = trpc.orderStatus.listOrders.useQuery(undefined, {
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,`,
    'polling pesado da lista de pedidos',
  );

  source = replaceOnce(
    source,
    `    lastOrdersUpdateMarkerRef.current = marker;
    void ordersQuery.refetch();
  }, [ordersUpdateMarkerQuery.data?.marker]);`,
    `    lastOrdersUpdateMarkerRef.current = marker;
    void ordersQuery.refetch();
    void trpcUtils.schedule.getForOrder.invalidate();
    void trpcUtils.schedule.listAppointments.invalidate();
  }, [ordersUpdateMarkerQuery.data?.marker]);`,
    'invalidação orientada por mudança real',
  );

  // Evita animar geometria/tamanho do card durante refetch e expansão; mantém só mudança de cor.
  source = source.replace(
    'cursor-pointer transition-all${isExpandedGroupCard',
    'cursor-pointer transition-colors${isExpandedGroupCard',
  );
  source = source.replace(
    'bg-card border rounded-xl overflow-hidden transition-all ${',
    'bg-card border rounded-xl overflow-hidden transition-colors ${',
  );

  fs.writeFileSync(file, source, 'utf8');
}

// Selos de agenda: removemos os dois timers independentes de 30s por card. Eles passam a
// atualizar por foco, invalidação do marcador global ou ações do próprio agendamento.
{
  const file = 'client/src/components/ScheduleStatusBadge.tsx';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceOnce(
    source,
    `{ refetchInterval: 30000, staleTime: 10000 }
  );
  const allAppointmentsQuery = trpc.schedule.listAppointments.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 10000,
  });`,
    `{ staleTime: 10000, refetchOnWindowFocus: true }
  );
  const allAppointmentsQuery = trpc.schedule.listAppointments.useQuery(undefined, {
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });`,
    'polling redundante dos selos de agenda',
  );
  fs.writeFileSync(file, source, 'utf8');
}

console.log('[desktop-refresh-flicker] OK: H2ADS e Pedidos deixam de repintar grades inteiras sem mudanca real.');
