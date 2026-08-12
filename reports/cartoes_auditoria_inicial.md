# Auditoria inicial de cartões — 12/08/2026

## Achado principal do alerta visual

Em produção, a API `cartoes.cartoes.list` retorna `faturaEmAtraso: null` para todos os seis cartões. Apesar disso, o dashboard mostra alertas vermelhos para NEON PRISCILA, Inter Priscila e Nubank mãe.

A causa está no frontend `CartaoDashboardPage.tsx`: a função `diasParaVencer` compara somente o dia do mês (`vencimentoDia`) com a data atual, sem considerar o ciclo da fatura nem se o vencimento pertence ao mês seguinte. Isso classifica como vencida uma fatura atual ainda não vencida. Exemplo observado: NEON PRISCILA tem competência atual 2026-08, fechamento 30 e vencimento 5; o vencimento correto dessa competência é 05/09, mas o frontend marcou vencida ao comparar apenas com 05/08.

## Achado estrutural

Não existe uma tabela de faturas históricas. O sistema usa `cc_gastos.cicloFatura` e `paga` para inferir a fatura em tempo de consulta. A tabela `cc_pagamentos` não possui `invoiceId` nem `competencia`; os pagamentos atuais são vinculados apenas ao cartão. Isso impede reconciliação histórica exata por fatura e permite que histórico e alertas usem critérios diferentes.

Nenhum dado foi alterado nesta auditoria.

## Reconciliação observada — NEON PRISCILA (cartão 30002)

A fatura anterior foi efetivamente baixada por pagamentos registrados em 07/08/2026. Os gastos históricos de competência 2026-07 aparecem com `paga = 1` e o pagamento de R$ 1.431,00 corresponde ao conjunto dessas compras. A competência atual é 2026-08, com saldo de R$ 530,00, fechamento dia 30 e vencimento correto em 05/09/2026. Portanto, em 12/08/2026 ela não está vencida; o alerta vermelho exibido é falso e decorre exclusivamente do cálculo visual por dia do mês.

O pagamento é persistido, mas sua tabela não referencia a fatura nem a competência. Isso impede garantir por dados que cada pagamento quitou apenas a fatura correta; hoje o vínculo é inferido depois pelo estado `paga` dos gastos.
