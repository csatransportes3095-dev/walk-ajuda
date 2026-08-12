# Próximos fluxos do Atendimento Online

1. Conectar a interface do widget pré-login aos endpoints de rascunho de cadastro, foto e confirmação via `customers.register`.
2. Implementar no widget o menu inicial fixo e o login por telefone e senha usando `customerPassword.login`.
3. Exibir no widget os pedidos e detalhes obtidos pelos endpoints autenticados `onlineSupport.entryOrders` e `onlineSupport.entryOrderDetails`.
4. Exibir empréstimos, parcelas e próxima parcela pelos endpoints autenticados `onlineSupport.entryLoans` e `onlineSupport.entryLoanInstallments`.
5. Integrar envio de comprovante usando a mesma regra de análise existente, impedindo comprovante pendente duplicado.
6. Integrar abertura do Controle de Gastos e solicitação de acesso por rota.
7. Testar cliente novo, cliente existente, sessão expirada, rota bloqueada, pedido de terceiro, empréstimo de terceiro e comprovante duplicado.
