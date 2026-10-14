# Serviço de chassis para testes

## Ponto de retorno antes de contas e créditos

- Repositório: `csatransportes3095-dev/walk-ajuda`.
- Commit de produção: `cb20f5ec7fb39cabbfb5cf12b215fb2c14ea70a3`.
- Referência preservada: `backup/chassis-antes-creditos-20261013`.
- Publicação Render: `dep-db7c8p2jnfac73d55lg0`.
- Serviço Render: `srv-d9k6ieijobas7384h4v0` (`walk-ajuda`).
- Backup Core existente conferido: `e862c82a58363ef968dc1ae807017bdf920a1aa38a5c507b`.
- Conclusão e verificação do pacote nos logs: 13/10/2026, 21:28:03, São Paulo.
- SHA-256 do pacote: `7487869ffed00724c3707ce99d22b0cf27e34342133e8dad574a641a6716948f`.

O backup foi localizado e sua verificação foi confirmada pelos logs. Não foi executada restauração em produção nesta etapa.

## Publicação e configuração

Esta alteração é preparada em branch separada, sem merge ou publicação até confirmação do proprietário.
A migração `scripts/apply-chassis-service-migration.ts` cria somente tabelas com prefixo `h2_chassis_` e uma configuração inicial. Não modifica cadastros, pedidos ou senhas centrais.
O motor `client/src/lib/vinGenerator.ts` permanece intacto. O comprador recebe os resultados pelo servidor; geração, reserva, registro e desconto ficam na mesma transação.
O ADM continua usando o gerador livre em `/adm/chassis`. A reserva livre exige a sessão ADM.

O acesso do comprador é `/app/chassis`, independente dos gates de cadastro central. A raiz de `app.h2colombiano.com` aponta para a mesma tela quando o subdomínio for associado ao serviço existente no Render e o DNS estiver configurado. Nenhum domínio ou DNS foi modificado nesta etapa.
Cada domínio utiliza seu próprio cookie `h2_chassis_session`, sem atributo Domain e sem compartilhamento com o login central/ADM.
Cadastros novos começam com zero créditos de teste. O ADM define a quantidade desejada, os pacotes, preços, WhatsApp e instruções de pagamento. Não foram inventados preços ou configuradas cobranças reais.
Compras guardam quantidade e preço no momento da solicitação. A confirmação manual do pagamento pelo ADM libera a quantidade guardada uma única vez; o comprador não confirma o próprio pagamento.

## Retorno somente do módulo

Reverter a alteração de acesso/créditos no código preserva o banco atual e os dados das outras áreas. As tabelas novas permanecem para auditoria e recuperação; não apagar ou esvaziar tabelas como parte da reversão.
Ao reverter, manter ou restaurar o gerador atual e sua proteção ADM. Não reabrir a reserva livre para compradores.
Se outros projetos tiverem sido publicados posteriormente, reverter apenas o commit deste módulo, resolver conflitos e validar a versão resultante antes de publicar.

## Retorno pelo Render e recuperação do banco

O rollback do Render volta a publicação do serviço inteiro, enquanto o artefato ainda estiver disponível; o estado do banco não é recuperado automaticamente.
Restaurar o Core no ADM substitui o banco inteiro pelo estado do snapshot. Isso pode desfazer cadastros/pedidos posteriores. O código do Render não é trocado por esse botão.
Para uma recuperação geral, confirmar o backup e o alvo, preservar o estado corrente e planejar banco e código juntos. Não realizar recuperação geral para desfazer somente a camada de acesso/créditos.
