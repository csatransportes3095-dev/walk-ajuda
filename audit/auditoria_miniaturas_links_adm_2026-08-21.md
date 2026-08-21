# Auditoria minuciosa — Miniaturas de links e gestão pelo ADM

**Sistema:** H2 Colômbia / Walk Ajuda
**Data:** 21 de agosto de 2026
**Escopo:** links compartilhados pelo WhatsApp, metadados Open Graph/Twitter, imagens de preview, mídias públicas, páginas de download e controles administrativos.
**Natureza:** somente auditoria. Nenhum horário, token, pedido, cliente, mensagem, imagem configurada ou regra de negócio foi alterado nesta etapa.

## Conclusão executiva

O sistema já possui uma base importante: há uma aba **ADM → Configurações → Compartilhamento** que permite enviar, recortar, visualizar, trocar por URL e remover uma imagem de preview global. A API também já armazena título, descrição, URL e versão de imagem. Entretanto, esse controle é **global**; ele não determina de forma organizada a miniatura de cada tipo de link. Por isso, uma imagem antiga pode aparecer em agendamentos, páginas de acompanhamento, orçamentos e outros links mesmo quando não representa aquele conteúdo.

A origem do problema não é uma única imagem. Há quatro causas técnicas distintas: a página inicial entrega o `index.html` estático sem metadados Open Graph; o agendamento usa uma miniatura fixa escolhida em código; mídia de vídeo usa o próprio arquivo de vídeo como imagem de preview; e algumas URLs são arquivos binários ou redirecionamentos, que não têm uma página HTML onde o WhatsApp possa ler `og:image`.

> **Regra recomendada:** uma miniatura deve ser configurável por **tipo de link** no ADM, mas nunca deve expor foto, documento, comprovante, telefone, nome ou dado interno do cliente quando o link não foi criado para publicar esse conteúdo.

## Inventário de links e situação atual

| Grupo de link | Rotas / origem | Miniatura atual | Situação | Risco |
|---|---|---|---|---|
| Página inicial e páginas públicas SPA | `/`, `/acompanhar`, `/login`, `/pre-cadastro`, `/consultar-cadastro` | A API prevê imagem global (`og_image_url`), mas `/` é servido como arquivo estático antes da injeção dinâmica. | A página inicial não entrega tags `og:*` ao crawler. | **Alto** |
| Agendamento e reagendamento | `/agendar/:token`, mensagens do painel e e-mail | Título e descrição específicos; miniatura fixa definida no servidor. Na produção ainda aponta para a arte antiga em `/og.jpg`. | O link possui HTML e tags corretas, mas a imagem não é escolhida pelo ADM por tipo de link. | **Alto** |
| Acompanhamento de pedido | `/acompanhar` e link de agenda dentro da tela | Herda o comportamento global quando a rota passa pelo fallback; não há perfil próprio de preview. | Não há configuração isolada para acompanhamento. | **Médio** |
| Orçamento e recibo | `/orcamento/:publicToken`, `/recibo/:publicToken` | Herda tags genéricas; não há título, descrição ou imagem próprios por tipo. | A imagem global pode não representar orçamento/recibo. | **Médio** |
| Foto pública | `/foto/:slug`, `/foto-img/:slug` | Usa a própria foto por proxy. | É adequado para uma foto que já foi explicitamente publicada, mas Twitter aponta para URL diferente do proxy. | **Médio** |
| Vídeo público | `/video/:slug` | `og:image` aponta para o arquivo de vídeo, não para imagem. | Crawler do WhatsApp não deve baixar vídeo como miniatura. | **Alto** |
| Tutorial em vídeo | `/video/tutorial` | Sem preview válido: a rota específica é alcançada depois de uma rota genérica que redireciona para ela mesma. | Há ciclo de redirecionamento HTTP 307. | **Alto** |
| Download de APK / arquivos | `/api/app/download`, `/api/app/download-pro`, `/download/app` | Resposta binária ou redirecionamento. | Arquivo binário não oferece HTML nem `og:image`. | **Médio** |
| Links `wa.me` | Botões/mensagens do ADM, suporte e pedidos | São links do WhatsApp, não páginas do domínio H2. | Não é possível adicionar miniatura ao próprio `wa.me`; a miniatura pertence à URL H2 incluída na mensagem. | **Baixo** |
| Comprovantes e documentos | URLs de upload/receipts e mídia privada | Não devem ter preview público automático. | Expor miniatura de documento pode vazar dados sensíveis. | **Alto** |

## Evidências técnicas verificadas

A rota real de agendamento do pedido `#17760002` foi consultada em produção. O token existe, está em estado `pending` e retorna horários disponíveis; portanto, a falha relatada não era o token, o reagendamento ou os slots. O HTML do link contém `og:title`, `og:description`, `og:url` e `og:image`, mas a imagem apontava para a arte antiga `/og.jpg`. O preview estava tecnicamente estruturado, porém visualmente incorreto.

A página inicial retornou o `index.html` estático sem `og:title`, `og:description` e `og:image`. A função de injeção de metadados existe no servidor, mas a entrega estática do `index.html` vence a rota de fallback na raiz. Isso explica por que a configuração global do ADM não se aplica de forma confiável a todos os links.

A rota `/video/tutorial` respondeu com redirecionamento `307` para ela mesma. O motivo é a rota dinâmica `/video/:slug` capturar `tutorial` antes da rota específica. Além de impedir a página, isso torna impossível criar preview no WhatsApp até corrigir a ordem/condição das rotas.

A imagem atual de marca que o usuário indicou já existe no projeto em `client/public/h2-brand-512.png`: é o escudo H2 Colômbia atual, PNG de 512×512. Ela é uma fonte válida para servir como miniatura padrão institucional quando o ADM escolher essa opção. Ela **não deve ser aplicada automaticamente a todos os links sem a configuração solicitada pelo ADM**.

## O que o ADM já permite hoje

A área **ADM → Configurações → Compartilhamento** já possui os seguintes recursos:

| Recurso existente | Como funciona hoje | Limitação atual |
|---|---|---|
| Imagem global | Upload, recorte, colagem de URL e remoção. | Só há uma imagem para todo o sistema. |
| Título global | Campo de até 200 caracteres. | Não há texto por tipo de link. |
| Descrição global | Campo de até 500 caracteres. | Não há texto por tipo de link. |
| Atualização de cache | Upload gera `og_image_version` e limpa cache local. | Colar URL ou remover imagem não atualiza a versão de forma garantida. |
| Preview visual | Card que simula WhatsApp. | Mostra o domínio antigo `walkajuda.com` e o nome legado `WALK AJUDA`, induzindo erro de configuração. |
| Arquivos de mídia | O ADM consegue publicar foto e vídeo por slug. | Não existe campo de capa/thumbnail por vídeo; vídeo usa o próprio arquivo como `og:image`. |
| Agendamento | ADM edita mensagens, e-mail, avisos e cor. | Não existe escolha de miniatura do link de agendamento. |

A API já existe em `server/routers.ts` como `ogSettings.get`, `ogSettings.update` e `ogSettings.uploadImage`. A tela já existe em `client/src/pages/AdminSettings.tsx`, no componente `OgSettingsTab`. Assim, o trabalho não exige novo cadastro de clientes, nenhuma alteração em pedido/agendamento e nem mudança nos fluxos de pagamento.

## Regra segura de miniaturas por tipo de link

A estrutura recomendada é uma única tela no ADM, aproveitando a aba **Compartilhamento** já existente. Não deve ser criada uma área solta ou outro painel de clientes.

| Perfil configurável no ADM | Links atendidos | Miniatura padrão inicial | Pode trocar? | Proteção necessária |
|---|---|---|---|---|
| **Institucional** | `/`, login, pré-cadastro, acompanhar, links gerais | Escudo H2 Colômbia atual. | Sim: galeria, upload, URL ou remover. | Validar imagem pública, tipo e tamanho. |
| **Agendamento** | `/agendar/:token` e reagendamento | Escudo H2 Colômbia atual. | Sim, independente do institucional. | Nunca mostrar foto/nome/telefone do cliente. |
| **Orçamento e recibo** | `/orcamento/:token`, `/recibo/:token` | Escudo H2 Colômbia atual ou imagem específica escolhida no ADM. | Sim, independente. | Nunca incluir valor, endereço ou dados do cliente no texto OG. |
| **Foto pública** | `/foto/:slug` | A própria foto publicada. | Herdado da mídia; opcionalmente permitir substituir. | Apenas para conteúdo que já é público por slug. |
| **Vídeo público e tutorial** | `/video/:slug`, `/video/tutorial` | Capa do vídeo escolhida no ADM. | Sim, por item de mídia. | Nunca usar o vídeo como imagem OG. |
| **Download de APK** | Página pública de apresentação do app, não o arquivo binário. | Escudo H2 Colômbia ou capa do app. | Sim. | Download continua intacto; a página só serve para compartilhamento. |

Documentos, comprovantes, autenticação, TOTP, APIs e URLs internas **não devem ter miniaturas públicas**. Esses endereços devem manter acesso controlado e, quando necessário, usar links de página pública segura sem revelar o arquivo.

## Correções necessárias, em ordem de prioridade

| Prioridade | Correção | Benefício | Escopo preservado |
|---|---|---|---|
| 1 | Corrigir a entrega de OG na raiz e registrar perfil institucional no ADM. | Todos os links gerais passam a ter preview configurável. | Não toca em pedidos, clientes, login ou banco de negócio. |
| 2 | Criar perfis de miniatura no ADM: Institucional, Agendamento, Orçamento/Recibo e APK. | Você troca a imagem correta sem código e sem reutilizar arte antiga. | Altera apenas configurações de compartilhamento. |
| 3 | Corrigir preview de vídeo: adicionar capa e proibir vídeo como `og:image`; corrigir ciclo de `/video/tutorial`. | Vídeos e tutorial passam a compartilhar com thumbnail real. | Não altera arquivos de vídeo nem links existentes. |
| 4 | Corrigir a prévia do ADM para `h2colombiano.com` e H2 Colômbia, e gerar versão nova sempre que imagem/URL for salva ou removida. | Evita cache antigo e reduz configuração confusa. | Somente tela e configuração de miniatura. |
| 5 | Padronizar links ainda baseados em `window.location.origin` para `publicSiteUrl()`. | Nenhum link volta para domínio/protocolo errado. | Só muda a forma de montar a URL pública. |
| 6 | Criar páginas de compartilhamento para APK quando desejado. | WhatsApp exibe preview; o download binário continua igual. | Não altera APK ou instalação. |

## Testes obrigatórios antes de publicar

A implementação deve ser bloqueada se qualquer um dos testes abaixo falhar:

1. O ADM seleciona o escudo H2 existente para **Agendamento** e o HTML de `/agendar/:token` expõe exatamente essa URL em `og:image`.
2. O ADM troca somente a miniatura de **Agendamento** e a imagem de **Institucional** permanece igual.
3. Upload, URL externa válida, escolha pela galeria e remoção atualizam `og_image_version` ou o equivalente de cada perfil.
4. O crawler com user-agent do Facebook/WhatsApp recebe `200`, `Content-Type` de imagem correto, `Content-Length`, URL HTTPS canônica, `og:title`, `og:description` e `og:image` válidos.
5. A página raiz, agendamento, acompanhamento, orçamento, recibo, foto, vídeo, tutorial e página de compartilhamento do APK têm comportamento esperado; URLs binárias e documentos continuam sem preview público.
6. `#17760002` continua em seu estado atual: nenhum token, horário, slot, status ou mensagem é alterado pelo teste.
7. Link enviado pelo ADM, link copiado, e-mail de agendamento e reagendamento usam exclusivamente `https://h2colombiano.com`.
8. Vídeo/tutoriais não seguem redirecionamento circular e usam imagem de capa válida.

## Decisão solicitada

A arquitetura segura é aproveitar a aba existente **ADM → Configurações → Compartilhamento** e transformá-la em um gerenciador de **perfis de miniatura por tipo de link**, mantendo a foto/vídeo pública sob o gerenciador de mídia. Isso elimina a imagem antiga sem criar cadastro novo ou mexer em funcionamento de pedidos.

Aguardar autorização explícita antes de implementar, porque a próxima etapa adicionará campos de configuração e a interface de seleção por tipo de link.

## Referências internas

[1] `server/_core/vite.ts` — injeção de Open Graph e fallback HTML.
[2] `server/_core/index.ts` — rotas públicas de foto e vídeo.
[3] `server/routers.ts` — API `ogSettings`.
[4] `client/src/pages/AdminSettings.tsx` — aba **Compartilhamento** já existente.
[5] `client/src/pages/AdminSchedule.tsx` e `server/routers/schedule.ts` — links de agendamento/reagendamento.
[6] `client/src/pages/AdminMedia.tsx` — mídia pública por slug.
