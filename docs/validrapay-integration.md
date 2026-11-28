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
