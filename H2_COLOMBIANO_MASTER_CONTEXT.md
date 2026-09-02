# H2 COLOMBIANO — MASTER CONTEXT / SOURCE OF TRUTH

**Status:** ATIVO  
**Auditoria-base:** 2026-09-02  
**Repositorio principal:** `csatransportes3095-dev/walk-ajuda`  
**Branch canonica:** `main`  
**Commit auditado:** `4b0125450361aafe42f1d5c0cb70572eb554a66b`  
**Objetivo:** impedir perda de contexto, mudancas no lugar errado, troca acidental de tecnologia, duplicacao de fluxo e regressao entre modulos.

> Este documento e um mapa tecnico persistente do H2 Colombiano. O codigo atual continua sendo a autoridade final. Se o HEAD de `main` mudar, qualquer modulo tocado deve ser relido antes de editar.

---

## 0. Protocolo `/colombia`

Quando o proprietario escrever **`/colombia`** em qualquer conversa nova:

1. Tratar `csatransportes3095-dev/walk-ajuda` como o repositorio principal do H2 Colombiano.
2. Ler este arquivo antes de propor ou executar alteracao tecnica.
3. Conferir o HEAD atual de `main` e comparar com o commit auditado acima.
4. Se o HEAD mudou, reler os arquivos do dominio que sera alterado; memoria nunca substitui o codigo atual.
5. Identificar primeiro o dono da rota, tabela, autenticacao e storage antes de editar.
6. Preservar as invariantes deste documento, salvo ordem explicita do proprietario para muda-las.
7. Nao fazer refatoracao ampla em `server/routers.ts`, `server/routers/loans.ts`, schema ou autenticacao para corrigir um problema local.
8. Atualizar este documento quando uma mudanca alterar arquitetura, rota, tecnologia, sessao, tabela, storage ou integracao importante.

**`/h2 /colombia`** = aplicar o protocolo acima com auditoria e raciocinio tecnico maximos antes da execucao.

### Escopo de repositorios

- **H2 web/backend principal:** `csatransportes3095-dev/walk-ajuda`.
- **Android nativo:** `csatransportes3095-dev/h2-colombiano-android` — repositorio separado. Nao alterar como se fosse parte de `walk-ajuda`; reler o repo Android quando o pedido for sobre APK.
- `walkcontas` e `walklocar-saas` sao repositorios separados e nao devem ser misturados automaticamente com `/colombia`.

---

## 1. Regras que nao podem ser quebradas sem auditoria especifica

1. **Telefone e a identidade fixa do cliente H2.** Nao permitir troca/apagamento do telefone canonicamente cadastrado sem uma migracao de identidade explicitamente projetada.
2. **`customers` e o cadastro canonico principal.** Tabelas de planilha, emprestimos e outras estruturas legadas podem ser sincronizadas/espelhadas, mas nao devem virar silenciosamente a fonte principal de identidade.
3. **Mudanca de banco deve respeitar Drizzle + scripts de migracao existentes.** Nao criar coluna/tabela duplicada porque uma busca local nao encontrou o campo.
4. **A entrada real do backend e `server/_core/index.ts`.** `server/index.ts` existe como implementacao simples/legada e nao e o entrypoint usado pelos scripts normais de build/start.
5. **Admin H2 usa `admin_token` JWT.** Nao substituir por outra sessao apenas porque existe a autenticacao OAuth/Manus de usuario comum.
6. **Cada modulo pode ter sua propria sessao/token.** Cartoes, revendedor, cliente H2, agenda, H2 Assistente e H2 Particular nao devem ser fundidos sem projeto de migracao.
7. **Cloudflare R2 e o object storage principal do codigo atual.** Preservar compatibilidade de URLs antigas e proxies antes de remover qualquer caminho legado.
8. **Nao colocar chaves, senhas, tokens ou secrets em frontend, PWA, APK, repositorio ou documentacao.** Guardar apenas nomes de variaveis.
9. **Rotas publicas nao significam necessariamente operacao sem autenticacao.** Muitos routers usam `publicProcedure` e validam token/sessao no proprio modulo.
10. **Antes de mexer numa rota, localizar a pagina React, o router tRPC/Express, o servico, as tabelas e a autenticacao correspondentes.**

---

## 2. Arquitetura geral

Fluxo principal:

`React/Vite -> tRPC (/api/trpc) e rotas Express especiais -> Express/Node -> servicos -> Drizzle/MySQL -> Cloudflare R2 / e-mail / IA / integracoes externas`

### Frontend

- React 19
- TypeScript
- Vite 7
- Wouter para roteamento client-side
- TanStack React Query
- tRPC React Query
- Zod
- React Hook Form
- Tailwind CSS 4
- Radix UI
- Framer Motion
- Recharts
- Sonner
- Lucide

### Backend

- Node.js 22 no container
- Express 4
- tRPC 11
- TypeScript compilado/bundled com esbuild
- Drizzle ORM + MySQL2
- bcryptjs
- `jose` e `jsonwebtoken`
- Multer para upload
- AWS SDK S3 configurado para Cloudflare R2
- Nodemailer + Resend
- PDFKit, Sharp, QRCode
- Python/WeasyPrint + Poppler no container para fluxos de documento/PDF

### Testes/build

- Vitest
- TypeScript `tsc --noEmit`
- pnpm/Corepack
- Vite build do frontend para `dist/public`
- esbuild do backend para `dist/index.js`

---

## 3. Runtime e deploy

### Scripts oficiais

- Desenvolvimento: `tsx watch server/_core/index.ts`
- Build: `vite build` + `esbuild server/_core/index.ts`
- Producao: `node dist/index.js`
- Timezone forçada para **UTC** no backend para manter datas consistentes.

### Container

`Dockerfile` usa Node 22 slim, instala Python 3, Poppler, Cairo/Pango, fontes e WeasyPrint. O comando final chama `scripts/render-start.sh`.

### Inicio de producao

`render-start.sh` executa as migracoes operacionais registradas e so depois inicia `dist/index.js`. Entre os dominios migrados estao:

- audio de perguntas;
- QR/autenticador privado;
- cofre TOTP do admin e vinculo a pedidos;
- aparencia de opcoes;
- locadora;
- declaracao/atribuicao de indicacao;
- atendimento online;
- cartoes;
- compatibilidade e recuperacao de emprestimos.

**Regra:** nao remover/reordenar migracoes do start sem entender dependencia e idempotencia.

### Git

Na auditoria-base, `main` nao possuia branch protection/regras obrigatorias de status. Portanto uma alteracao direta pode chegar ao branch principal sem gate automatico geral. Tratar mudancas em producao com revisao extra.

---

## 4. Entrada do servidor e middlewares

Arquivo canonico: `server/_core/index.ts`.

Responsabilidades encontradas:

- inicializacao de infraestrutura de identidade do cliente;
- bootstrap assincrono de faturas/cartoes;
- reconciliacao de permissoes legadas de emprestimos;
- registro de uploads;
- registro de download/versao de APK;
- `/api/ping`;
- proxy de storage legado/compatibilidade;
- parser JSON/URL encoded grande para uploads;
- respostas JSON em UTF-8;
- middleware de bloqueio de IP;
- previews publicos para WhatsApp/Open Graph;
- rotas publicas de foto/video;
- OAuth/Zoho e e-mail;
- manifesto PWA dinamico;
- fila agendada de broadcast de e-mail;
- tRPC em `/api/trpc`;
- Vite em desenvolvimento e static frontend em producao.

### Rotas Express especiais conhecidas

Estas ficam fora do roteamento normal do Wouter/tRPC e devem ser auditadas no backend antes de alterar:

- `/api/ping`
- `/link/acompanhamento`
- `/foto-img/:slug`
- `/foto/:slug`
- `/video/:slug`
- `/manifest.json`
- `/api/email-open/:trackingId`
- `/api/email/test`
- `/api/scheduled/broadcastEmail`
- `/api/trpc/*`
- rotas `/api/upload/*`
- rotas `/api/app/*` de versao/download Android
- callbacks/rotas OAuth do Zoho
- `/manus-storage/*` como compatibilidade de storage historico

**Seguranca:** endpoints de teste/debug e configuracoes de integracao devem permanecer sem credenciais embutidas. A auditoria encontrou divida tecnica nessa area; secrets expostos em historico/codigo devem ser rotacionados e removidos em uma tarefa de seguranca separada.

---

## 5. Mapa de rotas React

Arquivo central: `client/src/App.tsx`.

### Rotas administrativas

Todas devem permanecer atras de `AdminGuard`, exceto `/admin/login`:

- `/admin/login`
- `/admin/authenticator`
- `/admin/gastos`
- `/admin/access-filters`
- `/admin/codes`
- `/admin/coupons`
- `/admin/products`
- `/admin/settings`
- `/admin/customers`
- `/admin/customer-password`
- `/admin/raffles`
- `/admin/orders/new`
- `/admin/orders`
- `/admin/commissions`
- `/admin/status-types`
- `/admin/banners`
- `/admin/ip-block`
- `/admin/vpn`
- `/admin/broadcast`
- `/admin/resellers`
- `/admin/financeiro`
- `/admin/loans`
- `/admin/pre-cadastros`
- `/admin/pre-cadastros/perguntas`
- `/admin/referrer-bypass`
- `/admin/referrals`
- `/admin/referral-tree`
- `/admin/protected-photo`
- `/admin/trash`
- `/admin/faq`
- `/admin/schedule`
- `/admin/flow-config`
- `/admin/cep`
- `/admin/telefone`
- `/admin/email`
- `/admin/zoho-config`
- `/admin/media`
- `/admin/feature-cards`
- `/admin/propagandas`
- `/admin/hub-central`
- `/admin/locadora`
- `/admin/consultas`
- `/admin/whatsapp-templates`
- `/admin/cartoes-users`
- `/admin/online-support`
- `/admin/chat-flow`

### Rotas publicas/cliente

- `/`
- `/login`
- `/acompanhar`
- `/foto`
- `/sorteio`
- `/revendedor`
- `/revendedor/dashboard`
- `/pre-cadastro`
- `/consultar-cadastro`
- `/atualizarcadastro`
- `/agendar/:token`
- `/orcamento/:publicToken`
- `/recibo/:publicToken`
- `/locadora`
- `/locadora/`
- `/gastos`
- `/emprestimo`
- `/cartoes`
- `/cartoes/cartao/:id`
- `/cartoes/despesas`
- `/cartoes/historico/:id`
- `/cartoes/mercado`
- `/gerador-chassi`
- `/ajuda`
- `/video/tutorial`
- `/tutorial`
- `/r/:slug`
- `/bot`
- `/app`
- `/app-pro`
- `/404`

### Gates publicos importantes

- `/login`: `PasswordGate`.
- `/acompanhar`: `WelcomeScreen` + logica publica de acompanhamento.
- `/gastos`: pagina publica, autenticacao/logica propria do modulo.
- `/emprestimo`: pagina publica com login inline.
- `/cartoes`: publico como pagina, mas possui autenticacao propria `cc_session`.
- `/atualizarcadastro`: autentica pela propria logica de cliente.
- `/agendar/:token`: token individual de agenda.
- H2 Particular/orcamento/recibo: tokens publicos controlados pelo dominio.
- Rotas nao isentas caem no fluxo `WelcomeScreen + PasswordGate`.
- Existe manifesto de manutencao configuravel por rota, separado do `MAINTENANCE_MODE` global.

---

## 6. PWA, manifestos e identidade visual

O frontend troca manifest/favicons conforme o modulo.

### H2 geral

- `/manifest.json`
- icones H2 `h2-brand-*`
- nome H2 COLOMBIANO
- atalhos para pedido, acompanhamento e gastos.

### Admin

- `/manifest-admin.json`
- identidade `WALK ADM`
- inicio `/admin/codes`.

### Cartoes

- `/manifest.webmanifest`
- identidade separada `Meus Cartoes`.

### Locadora

- `/locadora/manifest-v1.webmanifest`
- identidade/icone LocaCar separado do H2 geral.

### Service Worker

`client/public/sw.js` usa estrategia Network First para navegacao normal, nao cacheia `/api/`, evita interceptar foto/video publicos e faz Cache First para manifestos/icones.

**Regra:** nao trocar manifest/icone global para corrigir apenas um modulo. Ha identidades instalaveis separadas.

---

## 7. Autenticacao e sessoes — mapa canonico

### Admin H2

- cookie: `admin_token`
- JWT assinado pelo secret do servidor
- credenciais armazenadas com bcrypt
- login possui controle de tentativas/IP
- `adminProcedure` valida diretamente `admin_token`
- `AdminGuard` protege as paginas no frontend
- setup inicial exige secret de configuracao e banco sem admin existente.

### Usuario OAuth/Manus legado/base

- cookie geral: `app_session_id`
- validacao via `sdk.authenticateRequest()`
- JWT HS256 baseado em `JWT_SECRET`
- utilizado por `protectedProcedure` e infraestrutura herdada.

### Cliente H2

Possui autenticacao propria ligada a `customerId`, `customerPasswords` e `customerPasswordSessions`. O telefone e a identidade fixa e os registros de auth sao ligados ao ID estavel do cliente.

### Cartoes / Mercado

- cookie: `cc_session`
- JWT proprio
- cadastro/login com bcrypt
- mesmo universo de usuario para os modulos `cartoes` e `mercado`.

**Regra de seguranca:** `CC_JWT_SECRET` deve existir de forma segura; nao depender de fallback literal de desenvolvimento em producao.

### Revendedor

Possui fluxo/token proprio do router de revendedores. Nao fundir com admin ou cliente H2.

### Agenda

Links publicos usam token de agendamento individual. Nao substituir por telefone puro.

### H2 Assistente

Usa token explicito resolvido pelo proprio servico/router antes de qualquer operacao de usuario.

### H2 Particular

Usa token explicito e resolve o usuario atraves de `resolvePrivateTransportUser`.

---

## 8. Identidade do cliente e sincronizacao

Arquivos de referencia:

- `server/customerAccess.ts`
- `server/customerStableIdentity.ts`
- `server/customerIdentity.ts`
- `server/customerProfile.ts`
- `server/routers/customerPassword.ts`
- `server/routers/customerUpdate.ts`
- `client/src/components/CustomerProfileRedirectGate.tsx`

### Invariantes

- `customers.id` e o ID estavel.
- telefone e identidade fixa.
- aliases de identidade sao mantidos para estabilidade/compatibilidade.
- `customerPasswords` e `customerPasswordSessions` sao ligados ao `customerId`.
- planilha/emprestimos podem ser sincronizados a partir do cadastro canonico.
- o frontend nao deve inventar/corrigir perfil localmente; a decisao de perfil completo vem do backend.

### Rotas de acesso do cliente

Dominios canonicos de liberacao encontrados:

- `site`
- `acompanhar`
- `gastos`
- `emprestimo`

Atendimento Online tambem consulta/libera essas permissoes. Ausencia de regra explicita pode representar comportamento legado; sempre ler `customerAccess.ts` antes de alterar defaults.

---

## 9. Mapa dos routers tRPC e dono dos dominios

`server/routers.ts` e o agregador central. Ele e grande e mistura routers modulares com namespaces inline. Nao mover logica apenas para “organizar” durante uma correcao funcional.

### Routers modulares principais

| Dominio | Arquivo principal |
|---|---|
| Sistema | `server/_core/systemRouter.ts` / `server/routers/system.ts` conforme chamada |
| Revendedores | `server/routers/resellers.ts` |
| Agenda | `server/routers/schedule.ts` |
| Gastos/Planilha | `server/routers/spreadsheet.ts` |
| H2 Particular | `server/routers/privateTransport.ts` |
| Locadora | `server/routers/locadora.ts` |
| H2 Assistente | `server/routers/h2Assistant.ts` |
| Emprestimos | `server/routers/loans.ts` |
| APK | `server/routers/apk.ts` |
| Senha cliente | `server/routers/customerPassword.ts` |
| Atualizacao cliente | `server/routers/customerUpdate.ts` |
| Propagandas | `server/routers/adCampaigns.ts` |
| Pre-cadastro | `server/routers/preRegistrations.ts` |
| Perguntas pre-cadastro | `server/routers/preCadastroQuestions.ts` |
| Autenticador TOTP | `server/routers/adminAuthenticator.ts` |
| Chat interno | `server/routers/chat.ts` |
| Usuarios do chat | `server/routers/chat-users.ts` |
| Atendimento Online | `server/routers/online-support.ts` |
| Fluxo do bot | `server/routers/chat-flow.ts` |
| Consultas | `server/routers/consultas.ts` |
| Templates WhatsApp | `server/routers/whatsappTemplates.ts` |
| Cartoes | `server/routers/cartoes.ts` |
| Mercado | `server/routers/mercado.ts` |

### Namespaces inline de `server/routers.ts`

O arquivo central ainda concentra logica de:

- autenticacao admin;
- senhas/codigos de acesso;
- cupons;
- produtos, opcoes, garantias, documentos e perguntas;
- pedidos, historico/status, arquivos, login/dados de entrega;
- clientes;
- banners e configuracoes;
- sorteios;
- financeiro/comissoes/indicacoes;
- bloqueios IP/VPN;
- midia e links publicos;
- acompanhamento do pedido;
- Zoho/e-mail;
- FAQ;
- etapas internas e configuracoes relacionadas.

**Protocolo:** quando uma tarefa tocar um procedimento inline, localizar o namespace e ler a faixa atual de `server/routers.ts`; este documento nao substitui a leitura procedure-level.

---

## 10. Modulos funcionais reconhecidos

### Pedidos / acompanhamento

- `accessCodes` e `accessCodePhones` participam da origem/acesso do pedido.
- `orderStatusHistory` e historico de status.
- `orderFiles`, notas, perguntas, arquivos/documentos e dados de login complementam o pedido.
- pedidos podem possuir subpedidos/grupos/itens do carrinho e historico legado.
- `/acompanhar` e a visao cliente.
- `/admin/orders` e a operacao administrativa.
- o sistema possui logica para reconstruir/mostrar pedidos legados/orfaos onde necessario.

### Agenda/foto

- slots, appointments, config e templates.
- statuses operacionais incluem pending/confirmed/cancelled/completed.
- a versao auditada possui regra de concluir agenda relacionada ao pedido quando o fluxo entra em foto em analise.

### Gastos / Planilha

- clientes/sessoes proprios da planilha;
- ganhos, despesas, operacional, metas, configuracao do veiculo e documentos;
- integra com cadastro canonico do cliente;
- upload usa R2.

### Emprestimos

Dominio grande e sensivel. Inclui clientes, contratos/emprestimos, parcelas, comprovantes, juros/atraso, H2 Score, recibos/PDF, permissoes e compatibilidade legada. **Nunca alterar calculo financeiro por tentativa local sem ler `server/routers/loans.ts`, tabelas e scripts de recovery/migracao.**

### Cartoes

- auth `cc_session`;
- cartoes, gastos, parcelamentos, faturas, pagamentos e despesas;
- `cicloFatura` e persistente;
- parcelamento calcula os ciclos a partir da data original da compra e desloca as parcelas por mes;
- pagamentos parciais influenciam saldo/limite por fatura persistida.

### Mercado

- compartilha a autenticacao dos cartoes;
- produtos de mercado, listas/historico e recomendacoes;
- sugestao de categoria/unidade usa a camada de IA geral.

### H2 Particular

- dashboard e configuracoes do motorista;
- passageiros;
- orcamentos publicos;
- agenda/conflitos;
- viagens;
- pagamentos e estornos;
- recibos publicos;
- CEP e mapas.

### Locadora

- multi-tenant por `tenantId`;
- router operacional atual exige `adminProcedure`;
- tenants, clientes, veiculos, contratos, cobrancas, pagamentos, manutencao, alertas e arquivos;
- consultas sensiveis validam tenant para evitar mistura/IDOR.

### Pre-cadastro

- envio publico;
- CPF validado;
- status, duplicidade e consulta publica;
- gestao admin;
- perguntas dinamicas com pai/opcao de gatilho;
- foto de perfil controlada por URL do R2 configurado.

### Consultas

- formularios dinamicos;
- formularios built-in;
- limite semanal;
- solicitacao do cliente;
- resposta admin;
- envio por e-mail/WhatsApp;
- upload de resposta/documentos.

### Atendimento Online

- entrada por telefone;
- cliente existente/novo/indicador;
- sessao de entrada;
- consulta de pedidos e emprestimos;
- comprovante de parcela;
- solicitacao/liberacao de rotas;
- rascunho de cadastro;
- conversa visitante/agente;
- config, horarios, agentes, respostas automaticas, conhecimento, arquivos, notificacoes, relatorios e logs.

### Chat interno

- conversas individuais/grupo;
- mensagens;
- notificacoes;
- presenca online;
- usuarios vindos da planilha/clientes.

**Ponto de revisao:** algumas operacoes de chat sao `publicProcedure` e recebem telefone/IDs do chamador; antes de ampliar esse modulo, revisar autorizacao/ownership.

### Bot/Chat Flow

- arvore configuravel;
- acoes: filhos, rota interna, URL externa, video, WhatsApp, texto e handoff humano;
- admin configura; cliente consulta nos public endpoints.

### H2 Assistente

- texto e voz;
- conversas/mensagens;
- ferramentas de leitura;
- navegacao;
- rascunhos de acoes;
- confirmacao/cancelamento antes de writes sensiveis;
- limites por usuario/uso e auditoria.

### Autenticador TOTP admin

- secrets TOTP nunca devem ficar plaintext no banco;
- cofre usa AES-256-GCM com chave mestre em variavel de ambiente;
- Base32 + TOTP de 30 segundos;
- pode vincular entrada do autenticador a pedido aberto;
- possui auditoria de uso/alteracao.

---

## 11. Banco de dados — mapa por dominio

### ORM/conexao

- MySQL atraves de Drizzle/MySQL2.
- `server/db.ts` cria a conexao sob demanda usando `DATABASE_URL` e garante `utf8mb4` na URL.
- schema principal: `drizzle/schema.ts`.
- schema dedicado da locadora: `drizzle/locadoraSchema.ts`.

### Grupos principais de tabelas

**Acesso/pedidos:** access codes/phones, products/options/questions/documents, order history/files/notes/attention/counters/status/progress/login data, bloqueios e logs.

**Clientes:** `customers`, passwords/sessions/login history, identidade estavel/aliases, permissoes de rota, documentos e acessos de produto.

**Conteudo/marketing:** banners, broadcasts/queue, FAQ, home buttons, media, feature cards, propagandas/impressions.

**Agenda:** slots, appointments, config, templates.

**Indicacao/revenda:** referral links/usages/stats/history/attribution/reports, bypass, resellers, vendas/pagamentos/credito.

**Gastos:** spreadsheet clients/sessions/earnings/expenses/operational/goals/vehicle config e estruturas associadas.

**Emprestimos:** clientes, emprestimos, parcelas, comprovantes, configuracoes de juros/score/atraso e eventos relacionados.

**Chat/Atendimento:** chats/messages/presenca/notificacoes, flow nodes, visitors/conversations/messages/config/business hours/agents/auto replies/knowledge/files/logs.

**Consultas:** forms e requests.

**Cartoes/Mercado:** tabelas `cc_*` para usuarios, cartoes, faturas, gastos, parcelamentos, pagamentos, despesas e mercado.

**H2 Assistente:** conversas, mensagens, acoes, uso, auditoria e settings.

**Autenticador:** entries, order links e audit.

**Locadora:** tenants/users/clients/vehicles/contracts/charges/payments/maintenance/alerts e entidades relacionadas.

**Regra:** nomes e campos exatos devem ser obtidos do schema/migracao atual antes de escrever SQL.

---

## 12. Storage e uploads

### Cloudflare R2

`server/r2Storage.ts` usa AWS SDK S3 com endpoint R2.

Variaveis obrigatorias:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Operacoes: put, get buffer, delete em lote, listagem e URL publica.

### Uploads

`server/uploadRoute.ts` possui:

- uploads diretos;
- uploads em chunks;
- sessao de upload no banco;
- montagem/finalizacao;
- uploads de arquivos de pedido;
- importacoes/fluxos auxiliares;
- integracao APK em rotas especificas.

Arquivos grandes nao devem ser reinventados como base64 tRPC se ja existe rota chunked apropriada.

### Compatibilidade

Existe `/manus-storage/*` para URLs/objetos historicos. Nao remover sem localizar referencias persistidas no banco e clientes antigos.

---

## 13. E-mail e Zoho

### Camada central

`server/_core/mailer.ts`:

1. usa **Resend via HTTPS** quando `RESEND_API_KEY` esta configurada;
2. fallback para SMTP/Nodemailer;
3. defaults SMTP apontam para Zoho.

Variaveis relevantes:

- `RESEND_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `ZOHO_EMAIL_PASSWORD`
- `ZOHO_ORG_ID`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`

Ainda existem pontos antigos que criam Nodemailer diretamente. Ao corrigir e-mail, identificar se o fluxo usa `sendMail()` central ou uma implementacao direta antes de alterar.

**Regra de seguranca:** nenhum client secret/refesh token pode estar hardcoded ou ser retornado/logado por endpoint de diagnostico.

---

## 14. IA — existem duas pilhas diferentes

### A. Helper geral da aplicacao

`server/_core/llm.ts` usa uma API compatível com chat completions via infraestrutura Forge/Manus e, no snapshot auditado, usa `gemini-2.5-flash` como modelo nessa camada.

Variaveis:

- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`

Nao confundir esta camada com a IA principal de voz do H2 Assistente.

### B. H2 Assistente

O H2 Assistente usa `OPENAI_API_KEY` no backend para interpretacao de texto, transcricao e fala.

Configuracoes documentadas:

- `OPENAI_API_KEY`
- `H2_ASSISTANT_OPENAI_MODEL`
- `H2_ASSISTANT_OPENAI_TRANSCRIPTION_MODEL`
- `H2_ASSISTANT_OPENAI_TTS_MODEL`
- `H2_ASSISTANT_OPENAI_TTS_VOICE`
- `H2_ASSISTANT_MAX_REQUESTS_PER_MINUTE`
- `H2_ASSISTANT_MAX_AUDIO_SECONDS_PER_REQUEST`
- `H2_ASSISTANT_MAX_TEXT_CHARACTERS`
- `ELEVENLABS_API_KEY` reservado/futuro.

**Regra:** OpenAI key fica apenas no backend/ambiente seguro.

---

## 15. Variaveis de ambiente reconhecidas

Somente nomes — nunca gravar valores neste documento:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`
- `SITE_GENERAL_PASSWORD`
- `ADMIN_SETUP_SECRET`
- `ADMIN_COUNTER_PASSWORD`
- `AUTHENTICATOR_ENCRYPTION_KEY`
- `CC_JWT_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `RESEND_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `ZOHO_EMAIL_PASSWORD`
- `ZOHO_ORG_ID`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `GMAIL_APP_PASSWORD`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CHAT_AI_ENABLED`
- `H2_ASSISTANT_OPENAI_MODEL`
- `H2_ASSISTANT_OPENAI_TRANSCRIPTION_MODEL`
- `H2_ASSISTANT_OPENAI_TTS_MODEL`
- `H2_ASSISTANT_OPENAI_TTS_VOICE`
- `H2_ASSISTANT_MAX_REQUESTS_PER_MINUTE`
- `H2_ASSISTANT_MAX_AUDIO_SECONDS_PER_REQUEST`
- `H2_ASSISTANT_MAX_TEXT_CHARACTERS`
- `ELEVENLABS_API_KEY`

`.env.example` atual nao documenta necessariamente toda a superficie acima; os arquivos `server/_core/env.ts` e os routers/servicos continuam sendo a autoridade para variaveis realmente consumidas.

---

## 16. Riscos e dividas tecnicas reconhecidos

Este bloco serve para impedir que uma correcao futura piore a arquitetura. Nao contem valores secretos.

### Prioridade alta

- **Secrets/testes de integracao:** existe divida historica de endpoint/debug de Zoho com dado sensivel embutido no codigo. Tarefa separada deve remover o dado, proteger/remover o diagnostico e rotacionar a credencial envolvida. Nunca copiar o valor para outro arquivo.
- **JWT de Cartoes/Mercado:** producao deve exigir secret seguro; nao permitir fallback literal de desenvolvimento.
- **Chat:** revisar ownership/autorizacao das operacoes `publicProcedure` que recebem telefone/chatId antes de expandir o modulo.
- **Branch principal:** snapshot sem branch protection/required checks.

### Prioridade media

- `server/routers.ts` e `server/routers/loans.ts` tem alto acoplamento/tamanho; uma tarefa pequena nao deve virar refatoracao global.
- ha caminhos de e-mail centralizados e caminhos Nodemailer antigos em paralelo.
- `server/index.ts` pode confundir mantenedores, mas o runtime real usa `server/_core/index.ts`.
- documentacao de ambiente esta fragmentada/incompleta.
- comentarios historicos podem citar infraestrutura antiga; confirmar codigo/deploy atual antes de assumir plataforma.

---

## 17. Protocolo obrigatorio antes de qualquer alteracao futura

Para qualquer pedido `/colombia`:

### Passo 1 — localizar

Identificar:

- rota React;
- componente/pagina;
- router tRPC ou Express;
- servico/helper;
- tabelas/schema;
- sessao/auth;
- storage/integracao.

### Passo 2 — comparar

- conferir HEAD atual;
- comparar com o commit de referencia deste documento;
- se houve mudancas no dominio, ler o codigo atual antes de agir.

### Passo 3 — preservar

Nao alterar fora do escopo. Em especial:

- identidade fixa por telefone;
- cookies/tokens de outros modulos;
- schemas nao relacionados;
- manifestos de outros PWAs;
- rotas publicas/admin nao relacionadas;
- regras financeiras;
- storage paths persistidos;
- assinatura/Android fora do repo correto.

### Passo 4 — validar

Conforme o dominio, validar no minimo:

- TypeScript/build;
- testes existentes daquele modulo;
- migrations quando houver banco;
- autorizacao e ownership;
- caminho cliente + admin quando o recurso possui os dois lados;
- nao vazamento de secrets.

### Passo 5 — registrar

Se a mudanca alterar arquitetura, rota, tecnologia, autenticacao, tabela, integracao ou regra critica, atualizar este MASTER CONTEXT no mesmo trabalho.

---

## 18. Cobertura e limite desta auditoria

Esta auditoria e de **reconhecimento estrutural do codigo-fonte** no commit indicado. Foram mapeados runtime, frontend, rotas, routers, autenticacoes, cliente canonico, banco por dominio, deploy, PWA, storage, e-mail, IA, uploads e modulos principais.

Ela **nao equivale** a afirmar que cada registro vivo do banco de producao, cada secret do Render, cada arquivo R2 e cada log de runtime foi inspecionado. Esses dados exigem acesso especifico ao ambiente de producao.

O objetivo deste arquivo e ser o mapa persistente que impede perda de contexto. Para valores dinamicos e comportamento alterado depois do commit auditado, o codigo/ambiente atual sempre vence.

---

## 19. Checklist rapido `/colombia`

Antes de editar, responder mentalmente SIM para todos:

- [ ] Li `H2_COLOMBIANO_MASTER_CONTEXT.md`?
- [ ] Conferi o HEAD de `main`?
- [ ] Sei qual arquivo realmente e dono da funcionalidade?
- [ ] Sei qual autenticacao/sessao o modulo usa?
- [ ] Sei quais tabelas ele toca?
- [ ] Sei se usa R2, e-mail, IA ou outro servico?
- [ ] Estou preservando telefone como identidade fixa do cliente?
- [ ] Estou evitando refatoracao fora do escopo?
- [ ] Vou validar build/teste/migracao correspondente?
- [ ] Se alterei arquitetura, vou atualizar este documento?

**Fim do MASTER CONTEXT.**