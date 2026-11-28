# ValidraPay: integração isolada (não ativar em produção ainda)

Base: commit c2a4519d77d268f68c2cfb6cb58f5245a9962d1d, versão LIVE confirmada antes do desenvolvimento.
O módulo usa apenas cobrança Pix e consulta, com autenticação Bearer no servidor, idempotência, confirmação por consulta e validação HMAC dos bytes originais. Não cria pagamentos reais nos testes.

## Configuração futura
- VALIDRA_API_KEY: chave inteira, somente no Render, com charges:read e charges:write.
- VALIDRA_WEBHOOK_SECRET: segredo vpw_live_ do endpoint. Não enviar pelo chat ou guardar em código.
- Endpoint a implementar: /webhooks/validrapay, montado antes do parser JSON global.
- Ambiente de produção: https://app.validrapay.com/v1. Sandbox somente mediante liberação da ValidraPay.

## Bloqueadores para ativação
1. Persistir tentativa de pagamento antes do POST; external_id único e imutável, valor em centavos calculado do catálogo e das regras oficiais do servidor (cupom, VIP, revendedor, carrinho).
2. Vincular a tentativa ao cliente autenticado e à composição exata da compra. Deduplicar confirmação e consumo da cobrança em transação com o pedido; impedir reaproveitamento e pagamento duplicado.
3. Implementar fila persistente de eventos assinados, com id único e reconciliação por GET; continuar recebendo eventos de cobranças anteriores independentemente do modo de novos pagamentos.
4. Integrar o checkout e o ADM com uma única seleção persistida (manual ou validrapay), padrão manual, autenticação de ADM e verificação de prontidão antes de ativar. Não usar fallback silencioso nem mostrar os dois meios.
5. Preservar cobranças pendentes ao trocar o modo e tratar expiradas, canceladas, atrasadas, estornos e conflitos para revisão.
6. Testar carrinhos, descontos, parcelamentos e demais entradas do checkout antes de permitir ativação, além da validação de assinatura, do valor e da não duplicidade.

Este commit não altera o checkout, o ADM, o Worker, o H2 ADS ou as configurações do Render. Não é uma integração ponta a ponta pronta para ativar.

## Checkout conectado em desenvolvimento
O fluxo unitário de compra direta agora passa pelo submitFiles: sessão, catálogo/seleção, tentativa persistida, geração/consulta Pix, confirmação e transação do pedido. A tela mostra QR/copia e cola e permite consultar e finalizar. O webhook registra eventos assinados em inbox persistente antes de responder. O gate VALIDRA_CHECKOUT_READY permanece false: ainda faltam consumo autônomo da inbox, retomada de pedidos/documentos/notificações, revisão administrativa de cobranças atrasadas/estornadas, carrinho, cupons, revendedores, parcelamentos e testes reais de MySQL/HTTP/UI. A consulta do cliente não substitui o processamento autônomo dos eventos. Não há autorização para cobrança real ou ativação.

## Carrinho e processamento de eventos (desenvolvimento)
O serviço interno reserva o snapshot e cupom antes da cobrança, consulta o Pix e grava todos os itens em uma transação. O inbox recebe evento + job atomicamente; um consumidor com lease e retentativas consulta a API, deduplica a gravação, sinaliza casos divergentes ou estornados em validra_payment_reviews e registra os itens pendentes em validra_order_followup. A rotina é independente da seleção do ADM, mas só inicia após a liberação do gate. Não remove reservas de cupons automaticamente em cancelamento/expiração (pagamento tardio é possível; requer revisão). Ainda faltam ligação da interface de carrinho, validações completas de documentos/perguntas e processamento idempotente do followup para todas as rotinas existentes (financeiro, referência, documentos, agendamento e avisos). O checkout individual legado não tem snapshot persistido completo e eventos pagos desse fluxo são encaminhados à revisão; não se cria pedido incompleto. Nenhuma ativação foi realizada.


## Persistência atômica de documentos e financeiro do carrinho (desenvolvimento)
O snapshot interno pode conter referências a documentos já carregados e verificados pelo servidor, por item. A transação de pagamento inclui os registros de orderFiles, financialSales (valor exato de cada item em centavos, Pix pago e horário confirmado pelo provedor), pedidos, vínculos, cupom e fila de follow-up. Uma falha em qualquer gravação reverte todos os itens; uma cobrança consumida não repete as gravações. O arquivo binário permanece no storage: somente a associação ao pedido é transacional. Os testes MySQL isolados cobrem não duplicidade e rollback de documento de item posterior. O limite por item respeita a coluna INT de financialSales.
Este passo não expõe um endpoint de carrinho e não confia em URL enviada pelo navegador. A validação de propriedade e existência dos uploads autenticados precisa ser implementada antes de ligar a interface. O fluxo individual anterior não foi alterado; agendamento, indicação, comissão, avisos e demais follow-ups ainda requerem integração idempotente. Pedidos já consumidos em versões anteriores não são migrados automaticamente. Gate VALIDRA_CHECKOUT_READY continua false; nenhuma cobrança real autorizada.

## Agendamento pós-pagamento do carrinho (desenvolvimento)
O follow-up gravado atomicamente no pedido alimenta validra_schedule_jobs, uma fila independente por registro/índice com lease recuperável, retentativas e estado de revisão após 12 falhas. O worker valida o vínculo com a tentativa consumida, digest do snapshot, cliente e opção do produto. Reutiliza ensureAutomaticScheduleForOrder e a regra autoScheduleEnabled do ADM, sem alterar o checkout manual. O insert da agenda e a conclusão do job são atômicos; o job não reabre agendamento cancelado ou concluído. A configuração desativada encerra o job sem agendamento; a rotina retroativa existente continua independente. Não envia e-mail nem faz chamadas ao provedor neste follow-up. A serialização é específica dos consumidores Validra; as rotinas administrativas concorrentes continuam com suas próprias regras. Os testes MySQL usam uma rotina de agenda simulada com o adaptador transacional real. Gate VALIDRA_CHECKOUT_READY permanece false. Ainda faltam validação de propriedade dos uploads, integração pública do carrinho, avisos, indicações/comissões, revisão administrativa e validação ponta a ponta.

A validação concorrente do commit 182d425 detectou ER_LOCK_DEADLOCK na aquisição de jobs. A aquisição agora usa READ COMMITTED e retentativas limitadas apenas para conflitos de lock do MySQL, incluindo a recuperação da fila e atualização de falha. O teste de concorrência permanece obrigatório.
