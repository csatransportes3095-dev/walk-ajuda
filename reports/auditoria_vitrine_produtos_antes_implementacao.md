# Auditoria prévia — Vitrine de Produtos H2

**Escopo da auditoria:** reformular somente a experiência visual do catálogo em `/login`, preservando produtos, opções, IDs, questionários, documentos, checkout, carrinho e pedidos já existentes. A análise foi feita antes de qualquer alteração na vitrine.

## 1. Diagnóstico objetivo

A página atual usa `client/src/pages/Home.tsx`. A vitrine inicial exibe **cards por produto** e, ao clicar em **COMPRAR**, abre um modal de seleção de opção. Esse modal já mostra as opções, preços, descrições, garantias e botões de compra/carrinho. A mudança solicitada é deslocar essa informação para uma **vitrine direta de produtos individuais**, isto é, cada opção passa a aparecer como seu próprio card pesquisável e filtrável, eliminando a etapa visual intermediária — sem trocar o motor de compra.

> **Conclusão:** o modelo atual permite fazer a mudança somente na apresentação. Cada opção já possui preço, documentos, perguntas e requisitos próprios; portanto a nova vitrine pode chamar exatamente os mesmos fluxos já existentes.

## 2. Estrutura atual do catálogo

A consulta pública `products.listActive` retorna produtos ativos e, para cada um, carrega suas opções ativas. Cada opção inclui perguntas, documentos e garantias. A auditoria encontrou **5 produtos ativos e 13 opções ativas**.

| Produto | Product ID | Opções ativas | Faixa de preço |
|---|---:|---:|---:|
| UBER APP | 60001 | 3 | R$ 400,00 a R$ 600,00 |
| UBER TAXI | 360001 | 3 | R$ 400,00 a R$ 650,00 |
| EDIÇÃO DOC VEICUILO | 960001 | 4 | R$ 150,00 a R$ 350,00 |
| CRLV ORIGINAL | 2610001 | 1 | R$ 60,00 |
| 99 APP PARA MOTORISTA | 360002 | 2 | R$ 350,00 a R$ 450,00 |

A matriz completa de `productId`, `optionId`, preço, quantidade de perguntas e quantidade de documentos está em `reports/auditoria_catalogo_resumo.md`.

## 3. Vínculo técnico preservado

| Elemento | Onde está hoje | Regra de preservação |
|---|---|---|
| Produto | tabela `products`, identificado por `productId` | Não criar, trocar ou alterar IDs existentes. |
| Opção | tabela `productOptions`, identificada por `optionId` e vinculada ao `productId` | Cada novo card exibirá a opção atual; não duplicará opções. |
| Preço e promoção | `productOptions.price`, `originalPrice`, `promoEndsAt` | O card lerá o preço existente; não recalculará nem gravará preço. |
| Perguntas | `productQuestions`, carregadas por `optionId` | O botão Comprar chamará o fluxo oficial da própria opção. |
| Documentos | `optionDocuments`, carregados por `optionId` | Permanecerão no mesmo fluxo de upload e validação. |
| Garantias | `warrantyTiers`, carregadas por `optionId` | Serão exibidas como detalhes do produto quando existirem. |
| Pedido | fluxo de `Home.tsx` com `selectedProduct` e `selectedOption` | Continuará criando o mesmo pedido com o mesmo produto e opção. |

A opção não é meramente visual: ela é a unidade que carrega preço, questionário e documentos. Por isso o card individual proposto será sempre construído a partir do par **produto + opção**.

## 4. Como os fluxos atuais são acionados

O botão atual do produto chama `handleServiceClick(product)`. Quando há opções, ele guarda o produto selecionado e abre o estado `name-select`. O modal atual chama `handleOptionSelection(option)`, que usa as mesmas regras abaixo:

| Condição da opção | Próxima etapa atual — preservada |
|---|---|
| PDF-only | Upload de PDF. |
| Há documentos ou requisitos de arquivo | Upload de documentos. |
| Há perguntas | Questionário da opção. |
| Nenhuma exigência acima | Cadastro/checkout. |

O carrinho já guarda cada item com `product`, `option` e chave própria. Para uma opção que exige escolha, o fluxo atual abre o seletor; na nova vitrine, **Adicionar ao carrinho** poderá incluir diretamente o par já identificado, sem criar outro carrinho ou checkout.

## 5. Controles administrativos já existentes

O painel `client/src/pages/AdminProducts.tsx` já permite administrar os componentes necessários ao catálogo atual.

| Controle existente | Situação |
|---|---|
| Criar, editar, ativar/desativar e ordenar produtos | Disponível. |
| Nome, descrição, texto do botão, ícone e cores do produto | Disponível. |
| Criar, editar, ativar/desativar, ordenar e precificar opções | Disponível. |
| Promoção, preço original, validade da promoção e garantia | Disponível por opção. |
| Perguntas, perguntas condicionais, opções bloqueantes e ordem | Disponível por opção. |
| Documentos, origem, instruções, exemplo e ordem | Disponível por opção. |
| Categoria, selo visual, destaque, "mais vendido" e ordenação por categoria | Ainda não existem como metadados estruturados. |

Para a primeira versão da vitrine, as categorias podem ser **derivadas visualmente** dos produtos atuais (por exemplo: Uber, Táxi, Documentos, 99) sem mexer no banco. Caso a categoria precise ser editável pelo ADM, a implementação segura será adicionar metadados opcionais e retrocompatíveis ao produto, mantendo nulos os registros antigos até preenchimento.

## 6. Arquivos previstos para alteração

| Arquivo | Alteração prevista | Limite de escopo |
|---|---|---|
| `client/src/pages/Home.tsx` | Substituir a grade visual produto→modal por vitrine de cards de opção, busca, filtros e detalhes expansíveis. | Sem alterar os steps, cadastro, upload, questionário, pagamento ou submissão. |
| `client/src/components/StorefrontProductCard.tsx` | Novo componente visual reutilizável para o card individual. | Novo componente, sem migrar dados. |
| `client/src/components/StorefrontFilters.tsx` | Novo componente de busca e filtros. | Somente estado local da vitrine. |
| `client/src/pages/AdminProducts.tsx` | Somente se for aprovado adicionar controles de categoria/selo/destaque. | Não alterar produto/opção existente sem ação explícita do ADM. |
| `drizzle/schema.ts` e router de produtos | Somente se forem aprovados metadados administráveis novos. | Campos opcionais e sem alterar IDs, pedidos ou relações existentes. |

## 7. Plano visual proposto

A vitrine terá título, subtítulo, busca por nome/descrição/tags, filtros rápidos, contagem de resultados e cards individuais. Cada card apresentará imagem existente ou fallback, categoria visual, nome da opção, descrição curta, preço atual, preço anterior quando houver, economia calculada apenas para exibição, prazo quando disponível, tags de documentos/requisitos e detalhes expansíveis.

Os dois botões terão ações diretas e distintas: **Comprar agora** chama o mesmo fluxo oficial da opção; **Adicionar ao carrinho** usa o carrinho atual com o mesmo `productId` e `optionId`. Promoções existentes continuarão sendo exibidas e podem apontar diretamente ao card correspondente.

## 8. Garantias obrigatórias de preservação

| Garantia | Confirmação |
|---|---|
| IDs de produtos | **Não serão modificados.** |
| IDs de opções | **Não serão modificados.** |
| Perguntas e documentos | **Continuarão vinculados ao mesmo `optionId`.** |
| Preços, promoções e garantias | **Serão lidos do modelo atual, sem cálculo paralelo.** |
| Checkout e pagamento | **Não serão reescritos.** |
| Carrinho | **Será reutilizado; não haverá carrinho paralelo.** |
| Pedidos antigos | **Serão preservados; nenhum pedido será migrado, apagado ou reclassificado.** |
| Demais módulos | **Planilha, H2 Assistente, empréstimos, autenticação, banco de clientes e Render ficam fora deste escopo.** |

## 9. Testes previstos antes da entrega

Após a implementação, serão testados pelo menos três casos de opções diferentes: uma compra com questionário e documentos, uma compra de edição de documento e um item pelo carrinho. Também serão verificados busca, filtros, detalhes, ativo/inativo, preço e promoção, desktop, celular e APK/PWA.

> **Decisão pendente:** esta auditoria confirma que a reformulação é segura e isolável. A implementação só começará após sua aprovação explícita deste plano.

## Referências internas

[1] `client/src/pages/Home.tsx` — vitrine atual, fluxo de produto/opção, carrinho e checkout.

[2] `server/routers.ts` — endpoint público `products.listActive`.

[3] `client/src/pages/AdminProducts.tsx` — controles administrativos existentes.

[4] `drizzle/schema.ts` — estrutura de produtos, opções, perguntas e documentos.
