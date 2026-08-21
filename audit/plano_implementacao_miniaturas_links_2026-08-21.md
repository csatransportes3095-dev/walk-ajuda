# Plano aprovado — Gestão de miniaturas de links

## Objetivo

Disponibilizar na aba existente **ADM → Configurações → Compartilhamento** a gestão de título, descrição e miniatura por tipo de link público, sem alterar pedidos, agendamentos, horários, tokens, comprovantes, login ou regras financeiras.

## Perfis configuráveis

| Perfil | Rotas atendidas | Imagem inicial segura |
|---|---|---|
| Institucional | `/`, `/acompanhar`, `/login`, `/pre-cadastro`, páginas públicas genéricas e revendedores | Escudo H2 Colômbia existente (`/h2-brand-512.png`) |
| Agendamento | `/agendar/:token` e reagendamento | Escudo H2 Colômbia existente |
| Orçamento | `/orcamento/:publicToken` | Escudo H2 Colômbia existente |
| Recibo | `/recibo/:publicToken` | Escudo H2 Colômbia existente |
| Vídeos | `/video/:slug` | Escudo H2 Colômbia existente; nunca o arquivo de vídeo |
| Tutorial | `/video/tutorial` | Escudo H2 Colômbia existente |
| App Android | `/app` e `/app-pro` | Escudo H2 Colômbia existente |

Cada perfil permitirá **usar o escudo H2**, enviar nova imagem, colar URL, remover, editar título e descrição. Cada gravação atualizará uma versão de cache própria, mantendo as outras categorias inalteradas.

## Preservação e segurança

Fotos públicas por `/foto/:slug` continuam usando a própria imagem já publicada. Comprovantes, documentos, rotas de autenticação, TOTP e arquivos privados não ganham preview público. Links binários de APK continuam iguais; o preview será associado à página pública `/app` ou `/app-pro`, não ao arquivo APK.

Os novos perfis serão gravados como configurações nomeadas na tabela de configurações já existente. Portanto, não será necessário criar cliente, cadastro ou migrar contratos/parcelas. A API antiga de compartilhamento continuará compatível.

## Correções técnicas incluídas

1. A entrega estática deixará de responder `index.html` diretamente na raiz para que todos os caminhos públicos recebam as tags Open Graph injetadas.
2. O agendamento deixará de apontar para a arte antiga fixa e passará a usar o perfil configurável de Agendamento.
3. Vídeos passarão a usar uma imagem válida do perfil Vídeos como `og:image`.
4. O tutorial será registrado antes da rota dinâmica de vídeo, eliminando o redirecionamento para ele próprio.
5. A aba de Compartilhamento exibirá o domínio e marca atuais (`h2colombiano.com` e H2 Colômbia), não os textos legados.
6. Todos os links públicos montados pelo sistema continuarão usando `https://h2colombiano.com`.

## Critério de publicação

A correção só será publicada depois de testes unitários e compilação, seguidos de validação de `og:title`, `og:description`, `og:url`, `og:image`, tipo, dimensões, cache e resposta HTTP 200 nas rotas Institucional, Agendamento, Orçamento, Recibo, Vídeo, Tutorial e App Android.
