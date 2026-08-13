# Validação operacional de pedidos

- Em 13/08/2026, a auditoria de dados do painel identificou 122 pedidos: 92 entregues, 10 conta ativa, 2 aguardando ficar ativa, 10 foto em análise e 8 aguardando agendamento.
- Antes da correção, 48 agendamentos concluídos permaneciam visíveis como categoria operacional, incluindo 35 pedidos entregues; isso causava leitura duplicada entre a etapa final do pedido e o agendamento.
- O commit `c10e00f` foi publicado e o Render confirmou o serviço ativo às 05:06, sem falha de build.
- A regra publicada mantém somente `pending` e `confirmed` como agendamento operacional, dá prioridade ao status atual do pedido e limita o fallback por telefone ao pedido mais recente sem vínculo direto.
- O acesso `site` e `acompanhar` foi vinculado como uma única permissão de pedidos, mantendo empréstimos e gastos independentes.

Após o deploy do commit `203e604`, o painel administrativo em produção mostrou 30 pedidos no total com categorias operacionais exclusivas: 0 sem agendamento, 9 agendamentos confirmados, 8 aguardando confirmação, 1 em análise, 2 aguardando ficar ativa e 10 contas ativas. A soma das categorias operacionais é 30. Os pedidos com agendamento concluído não aparecem como agendamento ativo; pedidos com `scheduleStatus=confirmed` permanecem no filtro de confirmados.

O commit `cdedcd9` foi enviado para `main` para restaurar o botão Fazer Pedido no painel de atendimento, apontando para `/login` e mantendo o acesso a Meus Pedidos separado. A compilação de produção foi aprovada. O Render iniciou o auto-deploy; a ativação será confirmada antes do teste final.
