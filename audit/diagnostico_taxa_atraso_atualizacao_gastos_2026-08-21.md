# Diagnóstico — Taxa de atraso e atualização da área `/gastos`

**Data:** 21 de agosto de 2026  
**Escopo:** exibir o valor correto da parcela com taxa desde a abertura da área do cliente e manter a tela atualizada sem recarregar manualmente.

## Sintoma confirmado

As imagens mostram a mesma parcela de R$ 16,80 com vencimento em 21/08/2026. Antes do envio do comprovante, ela aparece como `R$ 16,80`. Logo após o envio, a parcela muda para `R$ 26,80`, mostrando a taxa de atraso de R$ 10,00 e o estado `Comprovante em análise`.

Isso causa uma divergência: o cliente escolhe ou copia a chave PIX vendo um valor e, quando envia o comprovante, o sistema apresenta outro valor que já era aplicável pela regra de horário.

## Causa exata

| Etapa | Arquivo | Comportamento atual | Resultado |
|---|---|---|---|
| Carregamento das parcelas | `server/routers/loans.ts` — `getClientInstallments` | Retorna `loanInstallments` exatamente como estão gravadas. Não calcula a taxa aplicável naquele momento. | A tela abre com o valor original. |
| Exibição na área `/gastos` | `client/src/pages/LoansTab.tsx` — `InstallmentTimeline` | Só mostra taxa quando recebe `originalAmount` e `feeApplied` do servidor. | Como esses campos ainda são nulos, a parcela fica sem detalhamento. |
| Envio do comprovante | `server/routers/loans.ts` — `submitInstallmentProof` | Calcula a taxa para parcela vencida ou no horário de atraso, grava `amount`, `originalAmount` e `feeApplied`, depois muda para `em_analise`. | O valor muda somente depois do envio. |
| Atualização enquanto a página está aberta | `client/src/pages/LoansTab.tsx` | `getClientLoanInfo` consulta a cada segundo, mas a consulta que alimenta a linha do tempo (`getClientInstallments`) não tem atualização periódica nem atualização ao voltar ao foco. | O card aberto pode continuar com dados antigos até haver envio de comprovante, recolher/abrir ou recarregar. |

## Correção segura definida

A correção não deve alterar empréstimos ativos, parcelas pagas, pagamentos, taxas configuradas ou contratos. Para preservar isso, a taxa será **calculada para exibição** no servidor ao carregar a parcela, usando a mesma regra atual do envio de comprovante:

| Situação | Valor retornado ao cliente |
|---|---|
| Antes das 18h no vencimento | Valor original, sem taxa. |
| Das 18h às 19:59 no vencimento | Valor original + taxa de 18h configurada. |
| A partir das 20h no vencimento | Valor original + taxa fixa acumulada configurada. |
| Após 23:59 / dia posterior | Valor original + maior valor entre a taxa fixa acumulada e a regra percentual configurada. |
| Cliente com taxa desativada individualmente, parcela paga, cancelada, recusada ou já com taxa persistida | Nenhuma nova taxa é calculada. |

A prévia é somente visual: ela não grava nada no banco quando o cliente abre a página. No envio do comprovante, o servidor continua aplicando e gravando exatamente a mesma taxa uma única vez, como já ocorre hoje. Assim, o valor visto antes do envio é igual ao valor persistido quando o cliente envia o comprovante.

A consulta da linha do tempo será atualizada a cada **15 segundos apenas enquanto o empréstimo estiver expandido**, além de atualizar ao voltar para a aba. A resposta contém apenas dados textuais das parcelas, sem foto ou comprovante. Isso mantém a página sincronizada sem criar tráfego pesado.

## Cenários obrigatórios de validação

1. Parcela no vencimento antes das 18h: permanece com valor original.
2. Parcela no vencimento às 18h: mostra a taxa de 18h antes do comprovante.
3. Parcela no vencimento após 20h: mostra a taxa fixa acumulada antes do comprovante.
4. Parcela de dia anterior: mostra a maior taxa aplicável antes do comprovante.
5. Cliente com taxa individual desativada: não recebe taxa visual nem persistida.
6. Parcela já paga: mantém valor e histórico intactos.
7. Envio de comprovante: persiste o mesmo total já mostrado ao cliente e muda somente o status para análise.
8. Tela já aberta: atualiza automaticamente a lista de parcelas sem F5.

Nenhum registro existente foi modificado durante esta auditoria.

## Validação da correção

A nova regra central foi validada com sete testes automatizados. Foram aprovados os cenários antes das 18h, às 18h, após 20h, no dia posterior, com valor percentual superior à taxa fixa e com a taxa global desativada. Os testes também confirmam que a prévia só alcança parcelas pendentes ou atrasadas que ainda não possuem taxa persistida, e que a linha do tempo atualiza ao abrir, ao retornar para a aba e a cada 15 segundos enquanto estiver expandida.

A compilação estrutural do cliente e do servidor foi concluída com sucesso. A verificação global de tipos continua bloqueada por uma configuração preexistente do projeto (`ignoreDeprecations: 6.0`) incompatível com a versão local do TypeScript; essa falha ocorre antes da análise dos arquivos e não foi alterada por esta correção.

## Resultado esperado após publicação

O cliente verá R$ 26,80 — parcela de R$ 16,80 + taxa de R$ 10,00 — já no carregamento da parcela quando essa for a regra aplicável. Ao enviar o comprovante, o total permanecerá igual; somente o status mudará para `Comprovante em análise`. Se o administrador alterar o status, a página aberta refletirá a mudança em até 15 segundos, sem F5.
