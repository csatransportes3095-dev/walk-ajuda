# Auditoria do visor de faturas — Inter Priscila

**Data de referência:** 22/08/2026, a partir dos registros de tela enviados pelo usuário e da leitura somente de código.
**Escopo:** histórico de faturas, visor principal, competência, saldo pendente e ações de pagamento.
**Regra desta auditoria:** nenhum lançamento, pagamento, limite, configuração de fechamento ou fatura foi alterado.

> **Conclusão principal:** os meses que aparecem no Histórico estão coerentes com a regra de competência. O problema confirmado é de **semântica e fluxo visual**: o Histórico mostra o **total original** de cada fatura, enquanto o visor principal mostra o **saldo restante** da competência atual, mas a tela não nomeia a competência nem explica a diferença. Além disso, o Histórico não oferece ação para pagar uma fatura vencida e o modal de pagamento exibe uma data que hoje não é gravada.

## 1. Reconciliação dos valores visíveis

| Competência exibida | Histórico de Faturas | Visor principal | Interpretação técnica | Situação |
|---|---:|---:|---|---|
| Julho 2026 | R$ 3.188,45 | Fatura vencida: R$ 303,45 | O histórico mostra o total original da fatura; o visor destaca somente o saldo que restou em aberto e venceu em 02/08/2026. | Coerente, mas pouco explicado |
| Agosto 2026 | R$ 3.225,43 | Fatura do mês: R$ 2.980,43 | A diferença é **R$ 245,00**. O visor usa `remainingAmount` (saldo), enquanto o histórico usa `originalAmount` (total original). Essa diferença precisa ser demonstrada como pagamento/baixa parcial no detalhe. | Cálculo potencialmente correto; rótulo confuso |
| Setembro 2026 | R$ 1.067,50 | Próxima fatura: R$ 1.067,50 | Mesmo valor nas duas telas. | Correto |
| Outubro 2026 | R$ 710,00 | Não é mostrado no visor principal | Fatura futura existente no histórico. | Correto; não exige destaque no visor atual |

A diferença entre R$ 3.225,43 e R$ 2.980,43 foi calculada em **R$ 245,00**. O código do sistema confirma que a tela principal busca o saldo restante da fatura; o histórico busca o valor original. Sem a tela de pagamentos/detalhe da competência, não é possível afirmar se os R$ 245,00 são um pagamento novo, uma baixa legada ou um ajuste existente. O sistema não deve alterar esse valor até que essa origem esteja visualmente exposta.

## 2. Regra de competência confirmada

O cartão informado fecha no dia **25** e vence no dia **2**. Pela regra existente:

| Data da compra | Competência | Vencimento esperado |
|---|---|---|
| Até 25/07/2026 | Julho 2026 | 02/08/2026 |
| Após 25/07/2026 até 25/08/2026 | Agosto 2026 | 02/09/2026 |
| Após 25/08/2026 até 25/09/2026 | Setembro 2026 | 02/10/2026 |

Portanto, em 22/08/2026, a ordem correta de prioridades no visor é: **(1) saldo vencido de Julho**, **(2) saldo atual de Agosto**, **(3) próxima fatura de Setembro**. O erro é que a tela chama o saldo de Agosto apenas de “Fatura do Mês — A pagar agora”, sem informar que é a competência de Agosto e sem expor o total original, o total pago e o saldo.

## 3. Falhas confirmadas no visor principal

| Prioridade | Falha | Evidência técnica | Impacto | Correção segura recomendada |
|---|---|---|---|---|
| Alta | “Fatura do Mês” não informa mês, período, fechamento ou vencimento | `CartaoDetailPage.tsx` usa `faturaAtual.remainingAmount` e o rótulo genérico “Fatura do Mês”. | Faz R$ 2.980,43 parecer um valor divergente de Agosto (R$ 3.225,43). | Mostrar “Fatura de Agosto 2026”, “Total: R$ 3.225,43”, “Já pago: R$ 245,00”, “Saldo: R$ 2.980,43” e vencimento. |
| Alta | Histórico mostra fatura vencida sem ação de pagamento | `CartaoHistoricoPage.tsx` só expande o card; não existe botão de pagar ou de voltar ao visor já focado naquela fatura. | Usuário identifica a dívida, mas não consegue resolver a partir do local onde a visualiza. | Incluir “Pagar saldo de R$ …” no detalhe de faturas com saldo e abrir o mesmo fluxo seguro de pagamento já existente, vinculado ao `invoiceId` correto. |
| Alta | Campo “Data do pagamento” do modal é ilusório | `PagarSheet` coleta a data, mas a mutation envia apenas cartão, fatura, valor e observação; o backend grava a data atual. | Auditoria e histórico podem registrar um dia diferente do informado pelo usuário. | Incluir a data explicitamente no contrato da mutation e validá-la; não modificar pagamentos existentes. |
| Média | Banner vencido oferece ação, mas a mensagem não informa competência nem total original | O botão atual abre o modal de pagamento da primeira fatura vencida. | A ação existe, mas não deixa evidente que se refere a Julho nem mostra a conciliação. | Renomear para “Registrar pagamento — Julho 2026” e exibir total, baixas e saldo. |
| Média | Apenas a primeira fatura vencida é exposta pelo backend | `calcCartao` usa `overdueInvoices[0]`. | Se houver mais de uma fatura vencida, as demais ficam ocultas no visor principal. | Exibir contador e lista/atalho para todas as faturas vencidas, sem somar ou fundir faturas diferentes. |
| Baixa | “Paguei a Fatura” pode sugerir pagamento integrado | O botão apenas registra manualmente o pagamento já realizado. | Pode levar o usuário a esperar PIX, boleto ou gateway. | Texto explícito: “Registrar pagamento já realizado”. Um link de pagamento exigiria projeto separado. |

## 4. Fluxo atual de pagamento

O botão do banner de atraso existe no visor principal e abre o modal de registro manual. Ele envia o `invoiceId` da fatura vencida, portanto o vínculo financeiro está corretamente direcionado para a fatura certa. O Histórico, porém, não tem esse mesmo atalho.

O fluxo atual não cobra o usuário por PIX, cartão ou gateway. Ele apenas registra que o pagamento já foi feito. Isso explica por que o botão não é uma ação de pagamento direto, apesar do texto “Paguei a Fatura”.

## 5. Correção recomendada — antes de implementar

A correção deve ser exclusivamente de apresentação e de acesso ao fluxo já existente:

1. Criar no visor um bloco de prioridade para **Fatura vencida**, com competência, total original, total já baixado, saldo e botão “Registrar pagamento já realizado”.
2. Criar ao lado um card específico de **Fatura atual**, com o mês de competência, ciclo, fechamento, vencimento e reconciliação completa: total original, já pago e saldo.
3. Manter a **Próxima Fatura** separada, com competência e vencimento previstos.
4. No Histórico, inserir ação de pagamento apenas para faturas com saldo pendente; nunca para faturas pagas.
5. Corrigir a data informada no modal para que seja persistida somente nos pagamentos futuros. Nenhum pagamento, fatura ou lançamento passado será reprocessado.
6. Adicionar testes de competência, saldo parcial, fatura vencida, múltiplas vencidas e pagamento com data selecionada.

## 6. Limite desta auditoria

A conexão de banco de produção não está disponível no ambiente de análise. Por isso, os valores foram reconciliados contra as telas reais enviadas e a lógica que os produz. A origem exata dos R$ 245,00 (pagamento normal, baixa legada ou ajuste) deve ser confirmada na aba **Pagamentos** ou no detalhe expandido de Agosto antes de qualquer ajuste de dado. Nenhuma estimativa foi gravada no sistema.

## Referências internas

| Arquivo | Função auditada |
|---|---|
| `server/cardsBilling.ts` | Competência, fechamento, vencimento, total original, saldo restante e status da fatura. |
| `server/routers/cartoes.ts` | Dados retornados para Histórico e visor do cartão. |
| `client/src/pages/CartaoDetailPage.tsx` | Visor principal, banner de atraso e modal de pagamento. |
| `client/src/pages/CartaoHistoricoPage.tsx` | Histórico de faturas e ausência de ação de pagamento. |

## 7. Implementação aprovada após autorização

A correção aprovada foi implementada sem consultar ou gravar o cartão Inter Priscila específico. A alteração aplica-se à interface e ao contrato de novos pagamentos para todos os cartões, preservando a independência de cada fatura.

| Validação | Resultado |
|---|---|
| Visor com competência, total, total pago, saldo, fechamento e vencimento | Aprovado |
| Histórico com ação para faturas com saldo pendente | Aprovado |
| Link do Histórico para a fatura exata, por `invoiceId` | Aprovado |
| Envio da data escolhida no registro de pagamento futuro | Aprovado |
| Testes automatizados específicos | 3 aprovados |
| Compilação cliente e servidor (`pnpm run build`) | Aprovada |

A modificação não executa migração, conciliação, recálculo nem atualização de registros financeiros existentes.
