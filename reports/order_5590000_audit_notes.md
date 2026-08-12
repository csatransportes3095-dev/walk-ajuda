# Auditoria inicial do pedido #5590000

- A lista administrativa de clientes foi consultada em modo somente leitura com sessão ADM.
- A listagem mostra campos de identidade normalizada, `hasOrder`, `orderNumber`, `latestStatus` e `openOrders` por cliente.
- O próximo passo é localizar o registro do cliente ADM (#381) e comparar seus identificadores com o registro do pedido #5590000, sem alterar dados.
- A tentativa de filtrar a lista completa no navegador excedeu o tempo de resposta; será usada uma consulta administrativa específica ou inspeção local do contrato de API.

A busca administrativa oficial pelo pedido #5590000 confirmou, em modo somente leitura, que ele está gravado com `customerPhone` igual ao telefone do cadastro ADM #381, e que a busca administrativa o associa ao nome ADM, número de cadastro 381, foto e e-mail desse cadastro. Portanto, a listagem do Atendimento Online não está apresentando cache de outro login: os registros oficiais de pedido e cadastro hoje apontam para a mesma identidade por telefone.

A investigação de código também localizou a sincronização de telefone do cadastro principal. Quando o telefone de um cliente é editado, ela propaga a alteração para `orderStatusHistory` e `accessCodePhones`. Isso explica como um pedido originalmente ligado a outro telefone pode passar a aparecer no cadastro ADM caso o telefone tenha sido reaproveitado ou alterado no cadastro principal. Nenhum dado foi alterado durante a auditoria.

A sessão administrativa do navegador expirou durante a auditoria de detalhes e a página de pedidos voltou à tela de login. Nenhuma ação de escrita foi realizada. A busca anterior já confirmou o vínculo atual do pedido com o telefone do cadastro ADM; a recuperação do dono anterior continuará por registros disponíveis após restabelecer acesso somente leitura.

A busca administrativa oficial por `#5590000` confirmou previamente o vínculo atual do pedido ao cadastro ADM #381. Ao usar a busca visual no painel de pedidos, o painel filtrado não retornou o item no conjunto atual, o que indica que a pesquisa de cartão visível e a busca de emergência usam conjuntos diferentes. Isso não altera a evidência de vínculo obtida pela consulta de emergência. Nenhuma ação de escrita ocorreu.

O histórico completo do pedido #5590000 contém respostas de serviço e não contém nome, e-mail ou telefone original do solicitante. Os arquivos do pedido também usam o mesmo telefone atual no nome dos arquivos, portanto não fornecem um identificador anterior. A lixeira de clientes foi consultada somente leitura; a resposta retornou a lista de cadastros excluídos, mas a resposta foi truncada antes de permitir confirmar todos os registros com o telefone do pedido. Nenhuma escrita foi realizada.

A consulta administrativa do cadastro ADM #381 confirmou que ele foi criado antes do pedido #5590000 e que ambos usam o mesmo telefone normalizado. O pedido foi criado posteriormente com esse mesmo telefone, portanto o vínculo atual pode ter surgido no próprio envio do pedido, e não apenas por edição posterior de telefone. Não existe cadastro excluído com esse telefone. Isso impede reatribuição automática segura para um cliente diferente sem uma fonte de identidade adicional.
