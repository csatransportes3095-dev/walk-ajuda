# Project TODO - WALK CONTAS
<!-- ultima atualizacao: 27/07/2026 15:30 -->

## MigraÃ§Ã£o do Projeto
- [x] Copiar arquivos do servidor (db.ts, routers.ts, storage.ts)
- [x] Copiar testes (access.test.ts, coupons.test.ts, uploads.test.ts)
- [x] Copiar drizzle schema e migraÃ§Ãµes SQL
- [x] Copiar pÃ¡ginas do cliente (Home.tsx, AdminCodes.tsx, AdminCoupons.tsx)
- [x] Copiar componentes (PasswordGate.tsx, ThemeContext.tsx)
- [x] Copiar App.tsx com rotas configuradas
- [x] Instalar nodemailer e @types/nodemailer
- [x] Aplicar migraÃ§Ãµes SQL (users, accessCodes, coupons, products)
- [x] Configurar secrets (EMAIL_USER, EMAIL_PASSWORD, SITE_GENERAL_PASSWORD)
- [x] Adicionar siteGeneralPassword ao ENV

## Funcionalidades Existentes
- [x] Landing page dark neon com serviÃ§os (CONTA UBER, CONTA 99, CONTA INDRIVE, EDIÃ‡ÃƒO DE DOCUMENTO, UBER TAXI)
- [x] Sistema de senha de acesso (geral + VIP uso Ãºnico)
- [x] Modal de seleÃ§Ã£o de nome (AleatÃ³rio, Primeiro Nome, Nome Completo)
- [x] FormulÃ¡rio de cadastro (nome, telefone, cidade, indicador)
- [x] Upload de arquivos (foto perfil, documento carro, alvarÃ¡, condutaxi)
- [x] Sistema de cupons de desconto (percentual ou fixo)
- [x] Chave PIX + upload de comprovante
- [x] Envio de email com anexos via nodemailer
- [x] Modal de sucesso com redirecionamento WhatsApp + logout automÃ¡tico
- [x] Painel admin /admin/codes para senhas VIP
- [x] Painel admin /admin/coupons para cupons
- [x] Banco de dados MySQL com tabelas accessCodes, coupons, products

## Testes
- [x] 55 testes passando (19 admin + 12 access + 12 coupons + 11 uploads + 1 auth.logout)
- [x] Servidor rodando e respondendo HTTP 200

## Admin Completo - Cards de ServiÃ§o DinÃ¢micos
- [x] CRUD completo de cards de serviÃ§o pelo admin (criar, editar, excluir, ativar/desativar)
- [x] Cada card com opÃ§Ãµes de nome individuais (ex: AleatÃ³rio R$350, Primeiro Nome R$500) - sem vÃ­nculo com existentes
- [x] Admin define quais opÃ§Ãµes de nome existem em cada card e o valor de cada uma individualmente
- [x] FormulÃ¡rio de perguntas customizÃ¡veis em cada card (admin cria perguntas que o cliente responde)
- [x] OrdenaÃ§Ã£o dos cards pelo admin

## Admin - Editor da PÃ¡gina Inicial Completa
- [x] Editar seÃ§Ã£o hero (tÃ­tulo principal, subtÃ­tulo, texto do botÃ£o)
- [x] Editar textos e cores de todas as seÃ§Ãµes da pÃ¡gina (superior a inferior)
- [x] Editar logo/Ã­cone do site
- [x] Editar informaÃ§Ãµes de contato/WhatsApp
- [x] Editar textos de avisos e mensagens do site

## Admin - Controle de Senhas VIP AvanÃ§ado
- [x] Visualizar tempo restante de cada senha VIP em uso
- [x] Renovar tempo de senha VIP (estender prazo)
- [x] Excluir senha VIP
- [x] Controlar duraÃ§Ã£o padrÃ£o das senhas VIP

## Admin - ConfiguraÃ§Ã£o PIX
- [x] Editar chave PIX pelo admin
- [x] Editar nome do titular PIX
- [x] Editar nome do banco PIX
- [x] Dados PIX dinÃ¢micos na pÃ¡gina pÃºblica (vem do admin)

## PÃ¡gina PÃºblica - Dados DinÃ¢micos
- [x] Cards de serviÃ§o carregados do banco (nÃ£o mais hardcoded)
- [x] OpÃ§Ãµes de nome e valores carregados do banco
- [x] Perguntas do formulÃ¡rio carregadas do banco
- [x] Dados PIX carregados do banco
- [x] Textos da pÃ¡gina inicial carregados do banco

## Bugs
- [x] Campo "Nome do ServiÃ§o" ao criar novo card no admin nÃ£o mostra texto digitado (texto invisÃ­vel)
- [x] Upload de foto/imagem para os cards de serviÃ§o no admin com preview HTML nos cards pÃºblicos
- [x] Remover pergunta hardcoded "Digite o nome que deseja usar na sua conta" - deve ser criada pelo admin individualmente
- [x] Modal "Enviar Arquivos" aparece mesmo com todos os uploads desativados no card - deve pular direto para cadastro
- [x] Erro ao finalizar pedido / erro ao enviar arquivos (senha email atualizada + email nÃ£o-bloqueante)
- [x] Mover requisitos de documentos/uploads para dentro de cada opÃ§Ã£o de compra (nÃ£o no card geral)
- [x] Permitir escolher forma de nome do documento em cada opÃ§Ã£o de compra
- [x] Atualizar admin para configurar documentos por opÃ§Ã£o
- [x] Atualizar pÃ¡gina pÃºblica para usar documentos da opÃ§Ã£o selecionada
- [x] Implementar uso real de docNameMode no fluxo pÃºblico/envio de email (nomes dos anexos baseados na opÃ§Ã£o)
- [x] Adicionar testes para configuraÃ§Ã£o de documentos por opÃ§Ã£o no admin (create/update/read)
- [x] Corrigir criaÃ§Ã£o de opÃ§Ã£o: permitir personalizar o nome/label livremente ao clicar +Criar
- [x] SeÃ§Ã£o "ConfiguraÃ§Ã£o Documentos & Nome" deve aparecer visÃ­vel e personalizÃ¡vel
- [x] Perguntas do formulÃ¡rio devem aparecer em step separado apÃ³s upload (PRÃ“XIMO), individuais por produto, nÃ£o na Ã¡rea de finalizar
- [x] SeÃ§Ã£o "Configurar Documentos & Nome" deve aparecer aberta por padrÃ£o ao criar nova opÃ§Ã£o (+Criar)
- [x] Campo "Nome do Documento" personalizado: admin pode digitar um nome customizado para os documentos de cada opÃ§Ã£o
- [x] Mover perguntas do formulÃ¡rio para dentro de cada opÃ§Ã£o de compra (individual por opÃ§Ã£o, nÃ£o por card geral)
- [x] Adicionar seÃ§Ã£o de perguntas na ediÃ§Ã£o de opÃ§Ã£o no admin (expanda a opÃ§Ã£o criada para adicionar perguntas individuais)
- [x] Atualizar pÃ¡gina pÃºblica para carregar perguntas da opÃ§Ã£o selecionada
- [x] Substituir checkboxes fixos de documentos por campos editÃ¡veis (admin digita nome do doc que quiser)
- [x] Adicionar botÃ£o Salvar visÃ­vel nas opÃ§Ãµes de compra
- [x] Tabela optionDocuments no banco para documentos dinÃ¢micos por opÃ§Ã£o
- [x] CRUD de documentos dinÃ¢micos no admin (criar/excluir por opÃ§Ã£o)
- [x] PÃ¡gina pÃºblica usa documentos dinÃ¢micos para upload
- [x] submitFiles envia documentos dinÃ¢micos como anexos no email
- [x] Testes atualizados para documentos dinÃ¢micos (72 testes passando)
- [x] Bug: Tela "Complete seu Pedido" com cores erradas (fundo verde/teal ao invÃ©s do tema escuro neon) em alguns celulares
- [x] Bug: ValidaÃ§Ã£o bloqueando envio mesmo com todos os dados preenchidos ("dados nÃ£o estÃ£o todos preenchidos")
- [x] Bug: CriaÃ§Ã£o de senha VIP nÃ£o estÃ¡ salvando quantidade de acessos (campo maxUses adicionado)
- [x] Bug: RenovaÃ§Ã£o de tempo (botÃ£o Renovar) corrigido
- [x] Feature: Campo telefone do cliente na tela de acesso + exibido no painel admin
- [x] Feature: consumeAccessCode respeita maxUses (sÃ³ marca 'used' quando atinge o limite)
- [x] 73 testes passando
- [x] Adicionar teste para access.renew (renovaÃ§Ã£o de tempo)
- [x] Adicionar teste para accessedByPhone (salvar telefone do cliente na validaÃ§Ã£o)
- [x] 80 testes passando
- [x] Bug: BotÃ£o Finalizar Pedido trava no "ENVIANDO..." e nÃ£o redireciona para WhatsApp
- [x] Feature: Tela de confirmaÃ§Ã£o pÃ³s-envio com botÃ£o grande obrigatÃ³rio para WhatsApp
- [x] Bug: Redirecionamento WhatsApp dÃ¡ erro 404 (nÃºmero com espaÃ§os/parÃªnteses limpo automaticamente + URL trocada para api.whatsapp.com/send)
- [x] Teste: sanitizaÃ§Ã£o do nÃºmero WhatsApp (8 testes, 88 total passando)
- [x] Bug: BotÃ£o ENVIANDO trava em alguns celulares (fileToBase64 com reject/timeout, mensagens de progresso, tratamento de erro melhorado)
- [x] Feature: PWA - manifest.json com nome, Ã­cones e cores
- [x] Feature: PWA - Service Worker para cache
- [x] Feature: PWA - Meta tags para iOS e Android (fullscreen, splash)
- [x] Feature: PWA - Ãcones em vÃ¡rios tamanhos (192x192, 512x512) usando imagem do usuÃ¡rio
- [x] Mover banner de instalaÃ§Ã£o PWA para tela inicial de login (PasswordGate)
- [x] Remover banner de instalaÃ§Ã£o da tela de sucesso pÃ³s-pedido (nÃ£o existia lÃ¡)
- [x] Bug: Campo VÃ­deo de Fundo - adicionado preview no admin + key={URL} para forÃ§ar re-render
- [x] Bug: VÃ­deo de fundo - adicionado playsInline e fallback text nos vÃ­deos
- [x] Bug: Texto dos inputs no AdminSettings invisÃ­vel (corrigido com inputs nativos + style inline)
- [x] Feature: Controle de acesso por telefone Ãºnico - mesmo telefone re-entra sem contar novo uso
- [x] Feature: HistÃ³rico de telefones que acessaram cada senha VIP no admin (seÃ§Ã£o expansÃ­vel)
- [x] Feature: Cada telefone diferente conta como novo uso (currentUses++)
- [x] Feature: consumeAccessCode nÃ£o duplica contagem (validate jÃ¡ cuida disso)
- [x] Feature: Procedures listPhones e listAllPhones no admin
- [x] Tabela accessCodePhones no banco para histÃ³rico de acessos por telefone
- [x] 96 testes passando (28 access + 28 admin + 12 coupons + 16 uploads + 8 whatsapp + 3 email + 1 auth)
- [x] Fix: validateAccessCode permite reentrada do mesmo telefone mesmo quando status = 'used'
- [x] Fix: AdminCodes com loading/error handling para historico de telefones
- [x] Bug CRÃTICO: Telefone que completou pedido NÃƒO estÃ¡ sendo bloqueado de entrar novamente com a mesma senha VIP
- [x] Adicionar coluna consumed na tabela accessCodePhones
- [x] validateAccessCode bloqueia telefone com consumed=1
- [x] consumeAccessCode recebe phone e marca consumed=1
- [x] submitFiles passa phone para consumeAccessCode e checkAccessCodeCanSubmit
- [x] checkAccessCodeCanSubmit verifica consumed por phone
- [x] AdminCodes mostra badge ATIVO/USADO por telefone
- [x] 97 testes passando, teste de DB real confirmado
- [x] Bug: Telefone que completou pedido ainda aparece ATIVO e consegue entrar de novo - RESOLVIDO: agora bloqueia na primeira entrada
- [x] Regra: Cada telefone sÃ³ pode ENTRAR 1 vez com a senha VIP - apÃ³s primeira entrada fica bloqueado para sempre nessa senha
- [x] validateAccessCode: bloquear telefone que jÃ¡ existe em accessCodePhones (1 entrada = bloqueado)
- [x] checkAccessCodeCanSubmit: bloquear telefone que jÃ¡ existe em accessCodePhones
- [x] AdminCodes: todos os telefones mostram badge USADO (vermelho)
- [x] Telefones existentes no banco atualizados para consumed=1
- [x] 97 testes passando
- [x] Bug: Drag-and-drop dos cards de serviÃ§o na pÃ¡gina admin - implementado com HTML5 Drag API + endpoint reorder
- [x] Endpoint products.reorder no backend para persistir nova ordem
- [x] 99 testes passando (30 admin incluindo reorder)

## Senha VIP com modo "SÃ³ Tempo" (timeOnly)
- [x] Adicionar coluna timeOnly (boolean) na tabela accessCodes
- [x] MigraÃ§Ã£o SQL para nova coluna
- [x] Atualizar consumeAccessCode: se timeOnly=true, NÃƒO marcar como 'used' apÃ³s uso
- [x] Atualizar validateAccessCode: se timeOnly=true, permitir reentrada enquanto nÃ£o expirar
- [x] Atualizar AdminCodes: toggle para ativar/desativar modo timeOnly ao criar senha
- [x] Atualizar AdminCodes: exibir indicador visual quando senha Ã© timeOnly
- [x] Testes para comportamento timeOnly (nÃ£o desativa apÃ³s uso, respeita tempo)
- [x] 104 testes passando (7 arquivos)

## Cores personalizadas nos Cards de ServiÃ§o
- [x] Adicionar coluna cardColor na tabela products
- [x] MigraÃ§Ã£o SQL para nova coluna
- [x] Atualizar createProduct e updateProduct para aceitar cardColor
- [x] Atualizar AdminProducts: seletor de cor na criaÃ§Ã£o e ediÃ§Ã£o de cards
- [x] Atualizar Home.tsx: aplicar cor personalizada nos cards de serviÃ§o
- [x] Testes para criaÃ§Ã£o/ediÃ§Ã£o com cor personalizada
- [x] 108 testes passando (7 arquivos)

## Cores individuais por camada nos Cards (4 camadas)
- [x] Adicionar colunas cardBgColor, cardTextColor, cardBtnColor na tabela products
- [x] MigraÃ§Ã£o SQL para novas colunas
- [x] Atualizar createProduct/updateProduct para aceitar as 3 novas cores
- [x] Atualizar routers products.create/update para aceitar as 3 novas cores
- [x] AdminProducts: seletores de cor individuais para borda, fundo, texto e botÃ£o
- [x] Home.tsx: aplicar as 4 cores nos cards (borda, fundo, texto, botÃ£o)
- [x] Testes para criaÃ§Ã£o/ediÃ§Ã£o com cores individuais
- [x] 110 testes passando (## Bug: Cores dos cards nÃ£o respeitam as cores escolhidas apÃ³s atualizar pÃ¡gina
- [x] Investigar por que as cores nÃ£o sÃ£o carregadas corretamente apÃ³s refresh
- [x] Corrigir o problema (input type=color salvava valor padrÃ£o - resolvido com ColorPicker)
- [x] Testar e salvar checkpointBug: Seletor de cores salva cor padrÃ£o do input quando nÃ£o foi escolhida
- [x] Input type=color tem valor padrÃ£o (ex: #1e1b4b, #080808) que Ã© enviado mesmo sem o admin ter escolhido
- [x] Corrigir para que cores sÃ³ sejam salvas quando explicitamente alteradas pelo admin (novo componente ColorPicker com toggle)
- [x] Limpar dados incorretos no banco (todas as cores resetadas para NULL)
- [x] 110 testes passando

## Bug: Cor de fundo personalizada fica preta apÃ³s refresh na pÃ¡gina do cliente
- [x] Investigar como cardBgColor Ã© aplicada no Home.tsx
- [x] Verificar se o valor estÃ¡ correto no banco mas nÃ£o Ã© aplicado no frontend
- [x] Causa raiz: conflito entre backgroundColor e background no mesmo style object do React
- [x] CorreÃ§Ã£o: usar apenas 'background' para ambos os casos (cor sÃ³lida e gradiente)
- [x] Confirmado: cores funcionam corretamente apÃ³s refresh
- [x] 110 testes passando

## Sistema de Cadastro de Clientes
- [x] Criar tabela customers no banco (id, name, phone, city, referredBy, createdAt, updatedAt)
- [x] MigraÃ§Ã£o SQL para tabela customers
- [x] Procedures: customers.checkByPhone, customers.register, customers.list, customers.update, customers.delete
- [x] Frontend: tela de cadastro obrigatÃ³ria apÃ³s login (se telefone nÃ£o cadastrado)
- [x] Frontend: se telefone jÃ¡ cadastrado, pular direto para pedidos
- [x] Mover campo "quem indicou" do formulÃ¡rio de pedido para o cadastro
- [x] Painel admin /admin/customers: listagem de todos os clientes cadastrados
- [x] Admin: editar dados do cliente
- [x] Admin: deletar cliente
- [x] Admin: exportar lista de clientes (CSV)
- [x] Testes para CRUD de customers e fluxo de cadastro
- [x] Link 'Clientes' na navegaÃ§Ã£o do admin
- [x] 120 testes passando (8 arquivos)

## Campo Telefone de Quem Indicou
- [x] Adicionar coluna referredByPhone na tabela customers
- [x] MigraÃ§Ã£o SQL para nova coluna
- [x] Atualizar procedures (register, update) para aceitar referredByPhone
- [x] Atualizar formulÃ¡rio de cadastro no Home.tsx com campo telefone do indicador
- [x] Atualizar AdminCustomers para exibir/editar telefone do indicador
- [x] Atualizar exportaÃ§Ã£o CSV com nova coluna
- [x] Testes atualizados

## Telefone obrigatÃ³rio + validaÃ§Ã£o de dÃ­gitos
- [x] Tornar referredByPhone obrigatÃ³rio no formulÃ¡rio de cadastro (quem indicou nome continua opcional)
- [x] Adicionar mÃ¡scara de telefone (11 dÃ­gitos: DDD + 9 dÃ­gitos) nos campos de telefone
- [x] ValidaÃ§Ã£o frontend: bloquear envio se telefone nÃ£o tiver quantidade correta de dÃ­gitos
- [x] Atualizar backend: referredByPhone como campo obrigatÃ³rio na procedure register

## Cadastro antes da senha (tela inicial)
- [x] Mover formulÃ¡rio de cadastro para o PasswordGate (antes da senha)
- [x] Fluxo: cliente digita telefone â†’ se nÃ£o cadastrado, mostra formulÃ¡rio de cadastro â†’ depois pede senha
- [x] Se telefone jÃ¡ cadastrado, pula direto para pedir a senha
- [x] Remover formulÃ¡rio de cadastro do Home.tsx (nÃ£o precisa mais lÃ¡)

## Ajustes no cadastro
- [x] Telefone de quem indicou volta a ser OPCIONAL
- [x] Separar visualmente campos do cliente e campos de quem indicou no formulÃ¡rio

## Cidade e UF obrigatÃ³rios no cadastro
- [x] Adicionar coluna 'uf' na tabela customers (VARCHAR 2)
- [x] Tornar campo Cidade obrigatÃ³rio no formulÃ¡rio e backend
- [x] Adicionar campo UF obrigatÃ³rio no formulÃ¡rio (select com estados brasileiros)
- [x] Atualizar AdminCustomers para exibir UF

## Foto de Perfil com imagem modelo no modal de envio
- [x] Quando campo Ã© "Foto de Perfil", mostrar foto de exemplo/modelo automaticamente
- [x] Ao cliente enviar sua foto, substituir a foto modelo pela foto real do cliente (preview)
- [x] Foto do cliente fica visÃ­vel no lugar do modelo apÃ³s upload

## Foto exemplo personalizada por documento dinÃ¢mico
- [x] Adicionar coluna exampleImageUrl na tabela optionDocuments
- [x] MigraÃ§Ã£o SQL para nova coluna
- [x] Atualizar backend (procedures) para aceitar e retornar exampleImageUrl
- [x] Atualizar painel admin para upload de foto exemplo por documento
- [x] Atualizar Home.tsx para usar foto exemplo personalizada em vez do padrÃ£o

## Bug: admin/codes nÃ£o abre (erro)
- [x] Investigar e corrigir erro na pÃ¡gina admin/codes (usuÃ¡rio confirmou que estava ok)

## Sistema de Sorteio
- [x] Criar tabelas raffles e raffle_entries no banco
- [x] Backend: procedures para criar sorteio, escolher nÃºmero, listar entradas, sortear, resultado
- [x] Frontend cliente: escolha de nÃºmero de 1 a 100 na pÃ¡gina principal
- [x] Frontend cliente: exibiÃ§Ã£o do resultado do sorteio com dados do ganhador
- [x] Painel admin: criar/gerenciar sorteios e realizar sorteio
- [x] Painel admin: ver nÃºmeros escolhidos e dados dos clientes
- [x] Painel admin: botÃ£o ativar/desativar sorteio (quando desativado, nÃ£o aparece pro cliente)
- [x] Painel admin: formulÃ¡rio para editar regras do sorteio (tÃ­tulo, descriÃ§Ã£o)

## Aviso de sorteio apÃ³s cadastro/login
- [x] Adicionar banner/aviso chamativo para participar do sorteio no final da pÃ¡gina principal apÃ³s o cliente logar

## Foto de perfil no cadastro do cliente
- [x] Adicionar coluna profilePhotoUrl na tabela customers
- [x] Atualizar backend para aceitar upload de foto no cadastro
- [x] Adicionar campo de foto de perfil no formulÃ¡rio de cadastro (PasswordGate)
- [x] Pedir foto de perfil somente se cliente nÃ£o tiver foto no banco (cadastro novo ou login existente)
- [x] Exibir foto de perfil no painel admin junto com dados do cliente

## Sorteio: 1 nÃºmero por cadastro sem alterar
- [x] Backend: validar que telefone sÃ³ pode escolher 1 nÃºmero por sorteio (bloquear se jÃ¡ escolheu)
- [x] Frontend: se cliente jÃ¡ escolheu nÃºmero, mostrar qual escolheu sem permitir alterar

## Foto de perfil obrigatÃ³ria no cadastro
- [x] Remover botÃ£o "Pular por agora" na etapa de foto de perfil (tornar obrigatÃ³rio)

## Ãšltimo acesso do cliente no a- [x] Adicionar coluna lastAccessAt na tabela customers
- [x] Atualizar procedure validate para registrar lastAccessAt quando login Ã© vÃ¡lido
- [x] Exibir Ãºltimo acesso no painel admin de clientes# Layout mobile PasswordGate
- [x] Corrigir tela inicial: formulÃ¡rio maior, ocupa tela toda no celular, elementos maiores

## 3 melhorias mobile/sorteio
- [x] Campos maiores no formulÃ¡rio de cadastro (nome, cidade, UF, telefone indicador) para mobile
- [x] CÃ¢mera na etapa de foto de perfil (alÃ©m de galeria)
- [x] Foto de perfil do ganhador no resultado do sorteio

## AnimaÃ§Ã£o de confete no resultado do sorteio
- [x] Instalar biblioteca canvas-confetti
- [x] Disparar confete ao exibir a foto do ganhador no resultado do sorteio

## BotÃ£o "Ver resultado" no banner do sorteio
- [x] Adicionar id="raffle-result" na seÃ§Ã£o de resultado do sorteio
- [x] Adicionar botÃ£o "Ver resultado" no banner do sorteio com scroll suave atÃ© a seÃ§Ã£o do ganhador
- [x] Exibir o botÃ£o apenas quando houver resultado de sorteio disponÃ­vel

## Bug: Foto do cliente nÃ£o aparece no painel admin
- [x] Verificar se profilePhotoUrl estÃ¡ salvo no banco para o cliente
- [x] Verificar fluxo de upload de foto no PasswordGate (cÃ¢mera/galeria)
- [x] Verificar se AdminCustomers.tsx exibe a foto corretamente
- [x] Corrigir o bug: URL CloudFront expira; migrar para /manus-storage/ estÃ¡vel
- [x] Migrar 16 registros existentes no banco com URL expirada para /manus-storage/

## Modal de foto ampliada no painel admin
- [x] Adicionar estado para foto selecionada no AdminCustomers.tsx
- [x] Tornar a foto clicÃ¡vel (mobile e desktop) com cursor pointer
- [x] Renderizar modal com foto em tamanho grande, nome do cliente e botÃ£o fechar
- [x] Fechar modal ao clicar fora ou pressionar Escape

## Bug: Fotos de perfil aparecem cortadas/quebradas no painel admin
- [x] Diagnosticar: /manus-storage/ gera URL assinada com restriÃ§Ã£o de domÃ­nio (403 no deploy)
- [x] Restaurar 17 registros para URL direta do CloudFront (pÃºblica, status 200)
- [x] Corrigir cÃ³digo para novos uploads salvarem URL direta do CloudFront

## Foto do cliente nos nÃºmeros selecionados do sorteio
- [x] Retornar profilePhotoUrl junto com os nÃºmeros selecionados na procedure raffles.getNumbers
- [x] Exibir foto circular do cliente na grade de nÃºmeros selecionados

## Foto do cliente como fundo no nÃºmero selecionado do sorteio
- [x] Atualizar getRaffleEntries no db.ts com LEFT JOIN em customers para retornar profilePhotoUrl
- [x] Adicionar query raffles.entries no Home.tsx com refetch a cada 10s
- [x] Exibir foto do cliente como background-image no quadrado do nÃºmero ocupado
- [x] Overlay escuro sobre a foto para manter legibilidade do nÃºmero
- [x] Tooltip com nome do cliente ao passar o mouse sobre o nÃºmero ocupado

## Admin: reativar nÃºmero nÃ£o pago no sorteio
- [x] Criar procedure adminProcedure raffles.removeEntry para deletar entrada pelo id
- [x] Adicionar botÃ£o "Liberar" ao lado de cada nÃºmero na lista de participantes do sorteio no admin
- [x] Confirmar antes de liberar (dialog de confirmaÃ§Ã£o)

## Bug: nÃºmero 81 bugado no sorteio
- [x] Investigado: nÃºmero 81 nÃ£o tinha entrada no banco â€” era erro do usuÃ¡rio, nÃ£o bug do sistema

## Data/hora da escolha na lista de participantes
- [x] Exibir data e hora da escolha do nÃºmero na lista de participantes do sorteio no admin

## Status de pagamento nas entradas do sorteio
- [x] Adicionar campo paymentStatus (pago/aguardando) na tabela raffleEntries
- [x] Migrar schema e banco
- [x] BotÃ£o para marcar como pago/aguardando na lista de participantes

## NotificaÃ§Ã£o ao admin quando alguÃ©m escolher nÃºmero
- [x] Chamar notifyOwner na procedure chooseNumber com nome, telefone e nÃºmero escolhido

## Bug: formulÃ¡rio de cadastro pequeno no mobile
- [x] Corrigir PasswordGate: remover max-w-md no mobile, card ocupa 100% da largura sem bordas laterais

## PWA: banner de instalaÃ§Ã£o no painel admin
- [x] Adicionar banner de instalaÃ§Ã£o PWA no DashboardLayout para o admin instalar o app no celular

## Bug: banner PWA nÃ£o aparece em /admin/codes
- [x] Verificado: nenhuma pÃ¡gina admin usa DashboardLayout
- [x] Criar componente AdminPWABanner global e adicionar no App.tsx para todas as rotas /admin/*

#### Bug: app admin abre na pÃ¡gina do cliente (start_url errado)
- [x] Criar manifest-admin.json com start_url /admin/codes
- [x] Injetar manifest-admin.json dinamicamente nas rotas /admin/* via useEffect no App.tsx
## Bug: painel admin pedindo login Manus OAuth no computador
- [x] Investigar fluxo de autenticaÃ§Ã£o admin
- [x] Corrigir para usar o sistema de senha/cÃ³digo admin existente
## Login admin independente do Manus OAuth
- [x] Criar tabela admin_credentials no banco (username, password_hash)
- [x] Criar procedure adminAuth.login com bcrypt e JWT/cookie de sessÃ£o
- [x] Criar procedure adminAuth.logout e adminAuth.check
- [x] Criar pÃ¡gina AdminLogin.tsx com formulÃ¡rio de usuÃ¡rio/senha
- [x] Substituir guard useAuth() Manus por useAdminAuth() em todas as pÃ¡ginas admin
- [x] Criar credencial padrÃ£o inicial (admin/walk2026) no banco

## CorreÃ§Ã£o: upload comprovante PIX
- [x] Aceitar PDF, JPG, PNG e WebP no comprovante PIX (era sÃ³ image/*)
- [x] Aumentar limite de tamanho para 10MB
- [x] Mostrar preview de Ã­cone para PDF (em vez de tentar renderizar como imagem)
- [x] Passar paymentProofMime para o backend usar extensÃ£o e content-type corretos
- [x] Corrigir backend submitFiles e submitPaymentProof para usar mime dinÃ¢mico

## EdiÃ§Ã£o da tela de login (PasswordGate) pelo admin
- [x] Adicionar settings: login_title, login_subtitle, login_footer, login_image_url, login_show_image, login_show_title, login_show_subtitle, login_show_footer no banco
- [x] Criar seÃ§Ã£o "Tela de Login" no AdminSettings com campos de texto e upload de imagem
- [x] Atualizar PasswordGate para carregar e exibir as configuraÃ§Ãµes dinÃ¢micas
- [x] Permitir remover/ocultar cada elemento individualmente (toggle on/off)

## Sistema de status do pedido
- [x] Adicionar tabela `orderStatusHistory` para histÃ³rico de mudanÃ§as
- [x] Adicionar campo email obrigatÃ³rio no formulÃ¡rio de cadastro (PasswordGate)
- [x] Salvar email no customers
- [x] Criar procedure `orderStatus.update` (admin) com os status: recebido, em_andamento, documentos_aprovados, conta_ativa
- [x] Enviar email automÃ¡tico ao cliente quando o status mudar
- [x] Criar pÃ¡gina AdminOrders com UI de status e botÃµes de aÃ§Ã£o
- [x] Exibir status atual do pedido na tela do cliente com banner colorido
- [x] Mostrar histÃ³rico de status na tela do cliente via getMyStatus

## AdminOrders - melhorias
- [x] Adicionar status "pagamento_recebido" na lista de status dos pedidos
- [x] Adicionar botÃ£o de cancelar pedido (status "cancelado" com email ao cliente)
- [x] Adicionar botÃ£o de deletar pedido (remove do banco com confirmaÃ§Ã£o)
- [x] Filtrar pedidos de sorteio (codeType = 'raffle') para nÃ£o aparecerem na pÃ¡gina de Pedidos

## AdminOrders - informaÃ§Ãµes do cliente e seleÃ§Ã£o em massa
- [x] listOrders retornar dados completos do cliente (cidade, UF, indicador, telefone indicador, foto)
- [x] Exibir informaÃ§Ãµes completas do cliente no card do pedido (cidade, UF, indicador, email)
- [x] FormulÃ¡rio de ediÃ§Ã£o dos dados do cliente dentro do pedido (nome, email, cidade, UF, indicador)
- [x] Procedure customers.update com email para salvar alteraÃ§Ãµes do cliente pelo admin
- [x] SeleÃ§Ã£o em massa com checkbox em cada pedido
- [x] BotÃ£o "Deletar Selecionados" quando hÃ¡ pedidos selecionados
- [x] ConfirmaÃ§Ã£o antes de deletar em massa

## Pedido manual pelo admin
- [x] Procedure orderStatus.createManualOrder: criar cliente + registro de acesso + status inicial + email
- [x] PÃ¡gina AdminNewOrder.tsx com formulÃ¡rio completo (nome, telefone, email, cidade, UF, indicador, status inicial, observaÃ§Ã£o)
- [x] BotÃ£o "Novo Pedido" na pÃ¡gina AdminOrders
- [x] Rota /admin/orders/new registrada no App.tsx

## Aviso de email nos formulÃ¡rios
- [x] Aviso no campo email do formulÃ¡rio AdminNewOrder: email Ã© sÃ³ para notificaÃ§Ãµes, nÃ£o para criar conta
- [x] Aviso no campo email do formulÃ¡rio do cliente (Home.tsx / cadastro)
- [x] Aviso no formulÃ¡rio de ediÃ§Ã£o do cliente em AdminOrders (aba Cliente)

## Produto no pedido
- [x] listOrders retornar o produto/serviÃ§o escolhido pelo cliente
- [x] Exibir produto/serviÃ§o no card do pedido em AdminOrders
- [x] Adicionar seleÃ§Ã£o de produto no formulÃ¡rio AdminNewOrder
- [x] createManualOrder aceitar e salvar o produto selecionado
- [x] Perguntas dinÃ¢micas da opÃ§Ã£o no formulÃ¡rio AdminNewOrder
- [x] Exibir respostas das perguntas na aba Cliente do AdminOrders
- [x] Salvar produto e respostas no submitFiles (pedido via site)
- [x] Migration SQL: campos serviceName, serviceOption, answers na orderStatusHistory

## Preenchimento automÃ¡tico por telefone
- [x] Procedure pÃºblica customers.checkByPhone jÃ¡ existia, reutilizada
- [x] AdminNewOrder: busca automÃ¡tica ao digitar telefone, prÃ©-preenche nome/email/cidade/UF/indicador
- [x] Home.tsx: busca automÃ¡tica ao digitar telefone, prÃ©-preenche nome/email/cidade/indicador
- [x] Indicador visual de "cliente encontrado" ou "novo cliente" nos formulÃ¡rios

## CorreÃ§Ã£o: ediÃ§Ã£o de telefone do cliente
- [x] Adicionar campo de telefone editÃ¡vel na aba Cliente do AdminOrders
- [x] Backend: procedure customers.update aceitar campo phone
- [x] db.ts: updateCustomer aceitar campo phone

## CorreÃ§Ã£o: ediÃ§Ã£o de telefone em AdminCustomers
- [x] Corrigir campo telefone na pÃ¡gina AdminCustomers para salvar corretamente
- [x] Campo nome com min-w para aparecer completo na ediÃ§Ã£o

## CorreÃ§Ã£o: nome no email de notificaÃ§Ã£o
- [x] Corrigir "Walk Contas" para "H2 COLOMBIANO" no email de notificaÃ§Ã£o enviado ao cliente
- [x] Corrigir "Walk Contas" para "H2 COLOMBIANO" no banner de instalaÃ§Ã£o do PWA

## Melhorias no email de notificaÃ§Ã£o
- [x] Corrigir "Walk Contas" para "H2 COLOMBIANO" no email de notificaÃ§Ã£o
- [x] Adicionar texto "Status do Seu Pedido" no banner/cabeÃ§alho do email
- [x] Adicionar subtexto "AtualizaÃ§Ã£o do seu pedido" abaixo do tÃ­tulo
- [x] Borda roxa no card de status para destaque visual

## Cores dos status no AdminOrders
- [x] Recebido: laranja
- [x] Pgto. Recebido: Ã¢mbar
- [x] Em Andamento: laranja claro
- [x] Docs Aprovados: Ã¢mbar claro
- [x] Conta Ativa: verde (diferenciado)
- [x] Cancelado: vermelho

## Upload de foto de perfil pelo admin
- [x] Procedure customers.uploadProfilePhoto jÃ¡ existia como publicProcedure com phone, reutilizada
- [x] BotÃ£o de upload de foto na pÃ¡gina AdminCustomers: avatar clicÃ¡vel com overlay de cÃ¢mera
- [x] BotÃ£o de upload de foto na aba Cliente do AdminOrders: avatar grande clicÃ¡vel com overlay "Trocar foto"

## Novo status: Pedido Entregue
- [x] Adicionar "pedido_entregue" no enum do schema.ts e migration SQL
- [x] Atualizar addOrderStatus no db.ts com novo status
- [x] Atualizar procedures no routers.ts com novo status (update + createManualOrder)
- [x] Adicionar STATUS_CONFIG "pedido_entregue" no AdminOrders (cor teal)
- [x] Adicionar opÃ§Ã£o no seletor de status do AdminNewOrder

## Email obrigatÃ³rio nos formulÃ¡rios
- [x] Home.tsx: campo email obrigatÃ³rio (label com *, validaÃ§Ã£o de formato e vazio)
- [x] AdminNewOrder.tsx: campo email obrigatÃ³rio com validaÃ§Ã£o
- [x] Backend routers.ts: submitFiles e createManualOrder exigem email nÃ£o vazio

## DivisÃ£o do step cadastro em dois sub-steps
- [x] Sub-step 'dados': formulÃ¡rio pessoal (nome, telefone, cidade, email) com botÃ£o CONTINUAR PARA PAGAMENTO
- [x] Sub-step 'pagamento': resumo do pedido, PIX, upload de comprovante, botÃ£o FINALIZAR
- [x] BotÃ£o Voltar no sub-step pagamento retorna para sub-step dados
- [x] Todos os 5 setStep('cadastro') resetam cadastroSubStep para 'dados'

## BotÃ£o Reenviar Email no painel admin
- [x] Adicionar procedure orderStatus.resendEmail no servidor
- [x] Adicionar botÃ£o "Reenviar Email" no AdminOrders
- [x] BotÃ£o sÃ³ aparece quando pedido tem email e status registrado
- [x] Feedback visual (loading + toast)

## Email de confirmaÃ§Ã£o ao cliente ao finalizar pedido
- [x] Enviar email ao cliente quando ele finaliza o pedido (submitFiles)
- [x] Email com mensagem de agradecimento + resumo do pedido (serviÃ§o, opÃ§Ã£o, respostas do formulÃ¡rio)
- [x] Email sÃ³ enviado se cliente tiver email cadastrado

## PÃ¡gina de acompanhamento de pedido para o cliente
- [x] Criar pÃ¡gina /acompanhar com campo de telefone para consulta
- [x] Exibir histÃ³rico de status do pedido (timeline visual)
- [x] Mostrar dados do pedido (serviÃ§o, opÃ§Ã£o, data)
- [x] Registrar rota /acompanhar no App.tsx
- [x] Adicionar link de acesso na tela de sucesso pÃ³s-pedido

## AnimaÃ§Ã£o no botÃ£o de envio do pedido
- [x] Spinner animado + mensagens rotativas no botÃ£o "Enviando pedido..."
- [x] Overlay de loading com progresso visual durante o envio

## Link de acompanhamento nos emails de status
- [x] Adicionar link /acompanhar no email de confirmaÃ§Ã£o ao finalizar pedido
- [x] Adicionar link /acompanhar no email de atualizaÃ§Ã£o de status (orderStatus.update)
- [x] Adicionar link /acompanhar no email de reenvio (orderStatus.resendEmail)

## Exportar pedidos para CSV
- [x] BotÃ£o "Exportar CSV" no painel AdminOrders
- [x] Exportar todos os campos: nome, telefone, email, cidade, serviÃ§o, opÃ§Ã£o, status, data

## Filtro de pedidos por data
- [x] Filtros rÃ¡pidos: Hoje, 7 dias, 30 dias, Todos
- [x] Filtro aplicado no frontend sem nova requisiÃ§Ã£o ao servidor

## NotificaÃ§Ã£o por WhatsApp ao atualizar status
- [x] BotÃ£o "Notificar via WhatsApp" no painel de status de cada pedido
- [x] Mensagem prÃ©-formatada com status, nome do cliente e link de acompanhamento

## CorreÃ§Ã£o de roteamento SPA para /acompanhar
- [x] Servidor Express deve servir index.html para todas as rotas SPA (incluindo /acompanhar)
- [x] Link /acompanhar no email deve funcionar corretamente no site publicado

## Tela de Boas-Vindas com Dois BotÃµes no PWA
- [x] Criar tela inicial de escolha com dois botÃµes: "Fazer Pedido" e "Acompanhar Pedido"
- [x] Tela aparece antes do PasswordGate quando o app Ã© aberto
- [x] BotÃ£o "Fazer Pedido" leva ao fluxo normal (/)
- [x] BotÃ£o "Acompanhar Pedido" leva direto para /acompanhar (sem precisar de senha)
- [x] Design atrativo com logo e identidade visual do WALK CONTAS

## Download da foto do cliente no painel admin
- [x] Adicionar botÃ£o "Baixar Foto" ao lado do botÃ£o "Trocar Foto" na listagem de clientes (AdminCustomers)
- [x] Ao clicar, faz download da foto com o nome do cliente como nome do arquivo

## Download de documentos do pedido no painel admin
- [x] Adicionar botÃ£o de download para cada documento/arquivo enviado pelo cliente no painel AdminOrders
- [x] Download funciona para comprovante PIX, foto do documento, alvarÃ¡ e qualquer outro arquivo do pedido
- [x] Nome do arquivo baixado inclui o nome do cliente e tipo do documento

## Documentos do pedido salvos no S3 e visualizÃ¡veis no painel admin
- [x] Criar tabela orderFiles no banco (registrationId, label, fileUrl, fileKey, mimeType, createdAt)
- [x] MigraÃ§Ã£o SQL para nova tabela
- [x] submitFiles salva todos os documentos no S3 e registra URLs no banco (orderFiles)
- [x] Remover anexos do email (email continua com dados textuais + link para ver no painel)
- [x] Procedure tRPC orderStatus.getFiles para listar arquivos de um pedido por registrationId
- [x] AdminOrders exibe lista de documentos com botÃ£o de download para cada arquivo
- [x] Download funciona para imagens (JPG, PNG) e PDFs

## Upload e exclusÃ£o de documentos pelo admin no painel
- [x] Procedure tRPC orderStatus.uploadFile para admin enviar documento em qualquer pedido
- [x] Procedure tRPC orderStatus.deleteFile para admin excluir documento de um pedido
- [x] Aba Docs do AdminOrders exibe botÃ£o de upload de novo documento (com campo de label)
- [x] Cada documento existente tem botÃ£o de excluir (lixeira) alÃ©m de visualizar e baixar
- [x] Funciona para pedidos manuais e normais

## CorreÃ§Ã£o de fuso horÃ¡rio no filtro de pedidos
- [x] Filtro "Hoje" usa UTC em vez do horÃ¡rio local (GMT-3), fazendo pedidos noturnos sumirem
- [x] Corrigir comparaÃ§Ã£o de datas no filtro para usar o horÃ¡rio local do browser

## Selo "NOVO" em pedidos nÃ£o visualizados
- [x] Rastrear quais pedidos jÃ¡ foram abertos usando localStorage
- [x] Exibir selo "NOVO" animado nos pedidos nÃ£o visualizados
- [x] Remover o selo ao expandir/abrir o pedido
- [x] Mostrar contador de pedidos novos no tÃ­tulo da pÃ¡gina

## ObservaÃ§Ã£o editÃ¡vel no status "Entregue"
- [x] Adicionar coluna `note` na tabela orderStatusHistory (TEXT, nullable)
- [x] Procedure tRPC para salvar/atualizar observaÃ§Ã£o de um status
- [x] Procedure tRPC para buscar observaÃ§Ã£o do status "Entregue" de um pedido
- [x] UI: campo de texto editÃ¡vel aparece quando o pedido estÃ¡ com status "Entregue"
- [x] BotÃ£o salvar observaÃ§Ã£o com feedback visual
- [x] ObservaÃ§Ã£o exibida no histÃ³rico de status

## Bug: ObservaÃ§Ã£o nÃ£o enviada no email do status Entregue
- [x] Procedure updateNote deve buscar email e nome do cliente e reenviar email com a observaÃ§Ã£o atualizada
- [x] Email do status Entregue deve incluir a observaÃ§Ã£o salva pelo admin

## ObservaÃ§Ã£o visÃ­vel na pÃ¡gina de acompanhamento do cliente
- [x] Procedure tRPC getMyStatus deve retornar a nota (note) do status atual
- [x] PÃ¡gina OrderTracking exibe bloco de observaÃ§Ã£o quando status Ã© "Entregue" e hÃ¡ nota salva

## Bug: ObservaÃ§Ã£o nÃ£o aparece na pÃ¡gina de acompanhamento
- [x] UPDATE deve atualizar todos os registros de pedido_entregue do mesmo registrationId (nÃ£o apenas um)
- [x] PÃ¡gina OrderTracking deve buscar a nota no registro mais recente de pedido_entregue que tenha nota

## Ocultar observaÃ§Ã£o na pÃ¡gina de acompanhamento
- [x] ObservaÃ§Ã£o fica oculta por padrÃ£o com botÃ£o "Ver informaÃ§Ãµes" para revelar
- [x] Corrigir busca da nota para usar currentNote em vez de history[0].note

## Senha de acesso na pÃ¡gina de acompanhamento
- [x] ApÃ³s digitar o telefone e encontrar o pedido, exibir campo de senha (4 dÃ­gitos)
- [x] Senha correta = Ãºltimos 4 dÃ­gitos do telefone cadastrado (validaÃ§Ã£o no frontend)
- [x] SÃ³ apÃ³s validar a senha o cliente vÃª os detalhes, observaÃ§Ã£o e histÃ³rico
- [x] Emails de notificaÃ§Ã£o informam: "Sua senha de acesso Ã©: XXXX"

## Bloqueio permanente de PIN apÃ³s 3 tentativas
- [x] Criar tabela pinBlocks no banco (phone, attempts, blocked, createdAt, updatedAt)
- [x] Procedure pÃºblica checkPinAttempt: registra tentativa e retorna se bloqueado
- [x] Procedure admin unlockPin: desbloqueia um telefone
- [x] Frontend conta tentativas via backend, mostra tela de bloqueio apÃ³s 3 erros
- [x] Painel admin exibe botÃ£o "Desbloquear" no pedido quando o telefone estÃ¡ bloqueado

## Exibir todos os campos do formulÃ¡rio na aba Cliente do AdminOrders
- [x] Verificar todos os campos salvos no banco (registrations + customers) para cada pedido
- [x] Exibir todos os campos preenchidos na aba Cliente: nome escolhido, modelo do carro, placa, cor, ano, etc.
- [x] Campos devem aparecer organizados por seÃ§Ã£o (dados pessoais, dados do veÃ­culo, etc.)

## OrdenaÃ§Ã£o de pedidos por nÃºmero no AdminOrders
- [x] Adicionar botÃ£o de ordenaÃ§Ã£o crescente/decrescente pelo nÃºmero (ID) do pedido
- [x] Estado de ordenaÃ§Ã£o persiste durante a sessÃ£o
- [-] Pedidos manuais sem nÃºmero no nome recebem automaticamente o ID antes do nome ao salvar (cancelado a pedido do usuÃ¡rio)

## Bug: OrdenaÃ§Ã£o por nÃºmero nÃ£o extrai o nÃºmero do nome
- [x] Corrigir ordenaÃ§Ã£o para extrair o nÃºmero do inÃ­cio do nome do cliente (ex: "6791 Guilherme" â†’ 6791) em vez de usar o ID interno do banco

## Busca por nÃºmero de pedido no AdminOrders
- [x] Atualizar filtro de busca para tambÃ©m corresponder ao prefixo numÃ©rico do nome do cliente (ex: digitar "6791" encontra "6791 Guilherme")
- [x] Atualizar placeholder da barra de busca para "Buscar por nÃºmero, nome, telefone ou email..."

## NotificaÃ§Ã£o sonora de novo pedido + Status "Em Montagem"
- [x] Adicionar status "Em Montagem" na lista STATUS_ORDER e STATUS_CONFIG do AdminOrders
- [x] Adicionar status "Em Montagem" na lista de status do OrderTracking (pÃ¡gina do cliente)
- [x] Tocar bipe sonoro automÃ¡tico quando detectar novo pedido com selo "NOVO" no painel admin
- [x] Som gerado via Web Audio API (sem arquivo externo)

## Ajustes na pÃ¡gina de Pedidos e OrderTracking
- [x] Remover "Em Montagem" da timeline do cliente (OrderTracking) â€” manter apenas no painel admin
- [x] Filtrar pedidos na pÃ¡gina AdminOrders: mostrar apenas registros com submittedAt preenchido (pedido finalizado); registros sem submittedAt ficam apenas na pÃ¡gina de Clientes como "Cadastrado"
- [x] Adicionar botÃ£o de copiar nÃºmero do pedido (prefixo numÃ©rico do nome) no card do pedido no AdminOrders

## Badge "Cadastrado" na pÃ¡gina de Clientes
- [x] Buscar quais clientes tÃªm pelo menos um pedido finalizado (existÃªncia em orderStatusHistory)
- [x] Exibir badge "Cadastrado" (cinza) nos clientes sem nenhum pedido finalizado
- [x] Exibir badge "Pedido(s)" (verde) nos clientes com pelo menos um pedido finalizado

## Editar/Excluir dados do pedido no AdminOrders
- [x] Criar procedure updateOrderData para atualizar serviceName, serviceOption e answers do primeiro registro em orderStatusHistory do pedido
- [x] Adicionar botÃ£o Editar nos campos ServiÃ§o, Nome/OpÃ§Ã£o e respostas do formulÃ¡rio no painel expandido do pedido
- [x] FormulÃ¡rio inline de ediÃ§Ã£o com campos para serviceName, serviceOption e answers (JSON editÃ¡vel)
- [x] BotÃ£o Excluir para remover o pedido inteiro (jÃ¡ existe deleteOrder) com confirmaÃ§Ã£o

## ConfiguraÃ§Ã£o de modo de captura de foto do cliente
- [x] Criar tabela appSettings no banco (chave/valor) para armazenar configuraÃ§Ãµes globais
- [x] Criar procedures getAppSetting e setAppSetting no servidor
- [x] Criar procedure pÃºblica getPhotoMode para o formulÃ¡rio do cliente ler a configuraÃ§Ã£o
- [x] Adicionar painel "ConfiguraÃ§Ãµes de Foto" no AdminSettings (ou AdminOrders) com 4 opÃ§Ãµes: cÃ¢mera, galeria, ambos, desativado
- [x] No formulÃ¡rio de pedido do cliente, aplicar o atributo capture="user" (cÃ¢mera), accept sem capture (galeria), ou ambos conforme config
- [x] Exibir mensagem de instruÃ§Ã£o obrigatÃ³ria "Envie uma foto de rosto clara" no campo de foto do cliente
- [x] Quando modo = desativado, ocultar o campo de foto do formulÃ¡rio

## Senha Fixa Individual por Cliente
- [x] Adicionar campos fixedPassword (varchar 64) e fixedPasswordActive (tinyint) na tabela customers
- [x] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [x] Criar procedure customers.setFixedPassword (admin): salvar senha fixa e ativar/desativar
- [x] Criar procedure customers.getFixedPassword (admin): retornar senha fixa e status
- [x] Modificar a lÃ³gica de autenticaÃ§Ã£o para aceitar a senha fixa quando ativa (alÃ©m das senhas VIP)
- [x] Adicionar painel de senha fixa no AdminCustomers: campo de senha, botÃ£o gerar aleatÃ³ria, toggle ativar/desativar
- [x] Criar aba "Meus Dados" na tela do cliente (OrderTracking ou PasswordGate) com nome, telefone, cidade, email â€” somente leitura
- [x] Criar procedure pÃºblica customers.getMyProfile para o cliente ler seus prÃ³prios dados via phone+PIN

## Indicador de cadeado e histÃ³rico de acessos
- [x] Exibir cadeado verde (ativo) ou cinza (inativo/sem senha) no card do cliente ao lado do badge Pedido/Cadastrado
- [x] Incluir lastAccessAt no retorno da procedure customers.getFixedPassword para exibir no modal
- [x] Exibir Ãºltimo acesso no modal de senha fixa

## Controle de acesso por produto via senha fixa
- [x] Criar tabela customerProductAccess (phone, productId) no schema.ts
- [x] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [x] Criar procedure customers.setProductAccess (admin): salvar lista de productIds permitidos para um phone
- [x] Criar procedure customers.getProductAccess (admin): retornar lista de productIds permitidos
- [x] Criar procedure pÃºblica customers.getAllowedProducts: retornar lista de productIds permitidos para um phone (usado pelo cliente)
- [x] No modal de senha fixa do admin: exibir checkboxes de todos os produtos ativos para selecionar quais o cliente pode acessar
- [x] Na tela do cliente (Home.tsx): se o cliente tiver permissÃµes configuradas, filtrar os cards de produtos para mostrar apenas os permitidos; sem configuraÃ§Ã£o = vÃª tudo

## Controle de produtos na Senha VIP
- [x] Adicionar campo allowedProductIds (JSON) na tabela accessCodes
- [x] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [x] Atualizar procedure access.create para aceitar allowedProductIds opcional
- [x] Adicionar checkboxes de produtos no formulÃ¡rio Criar Nova Senha VIP no AdminAccess
- [x] Na tela do cliente: ao usar senha VIP, buscar allowedProductIds da senha e filtrar produtos exibidos

## Aba Urgente nos Pedidos
- [x] Adicionar campo isUrgent (tinyint) na tabela orderStatusHistory
- [x] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [x] Criar procedure orders.toggleUrgent para marcar/desmarcar pedido como urgente
- [x] Adicionar botÃ£o de urgÃªncia no card do pedido no AdminOrders (Ã­cone de sirene/alerta)
- [x] Adicionar aba "Urgente ðŸš¨" na barra de filtros do AdminOrders
- [x] Destaque visual nos cards de pedidos urgentes (borda vermelha pulsante)
- [x] Contador de pedidos urgentes no badge da aba

## Destaque de indicador e alerta de comissÃ£o
- [x] Verificar onde o campo "indicado por" Ã© armazenado no banco (referredBy/referredByPhone)
- [x] Exibir nome e telefone de quem indicou em destaque no card do pedido (badge amarelo/laranja)
- [x] Exibir alerta "ðŸ’° Pagar ComissÃ£o" em vermelho/laranja quando o campo de indicaÃ§Ã£o estiver preenchido
- [x] Garantir que o campo aparece tanto na visualizaÃ§Ã£o compacta quanto na expandida do card

## GestÃ£o de ComissÃµes
- [x] Adicionar campo commissionPaid (tinyint, default 0) na tabela orderStatusHistory
- [x] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [x] Criar procedure orders.toggleCommissionPaid para marcar/desmarcar comissÃ£o como paga
- [x] Adicionar commissionPaid ao retorno de listOrders
- [x] Adicionar filtro "Com Indicador" na barra de filtros do AdminOrders
- [x] BotÃ£o para marcar comissÃ£o como paga no card do pedido (badge muda de vermelho para verde)
- [x] Criar pÃ¡gina AdminCommissions com relatÃ³rio de todos os pedidos com indicador
- [x] RelatÃ³rio agrupado por indicador com total de pedidos e status de comissÃ£o
- [x] BotÃ£o de exportar CSV na pÃ¡gina de relatÃ³rio de comissÃµes
- [x] Adicionar link para AdminCommissions no menu lateral

## ValidaÃ§Ã£o de auto-indicaÃ§Ã£o
- [x] Frontend: bloquear envio se o telefone do indicador for igual ao telefone do prÃ³prio cliente (mostrar erro "VocÃª nÃ£o pode indicar a si mesmo")
- [x] Backend: ignorar/limpar o campo referredByPhone se for igual ao phone do cliente ao salvar o cadastro
- [x] Tela de confirmaÃ§Ã£o pÃ³s-pedido: apÃ³s cliente finalizar pedido, exibir modal com senha de acompanhamento em destaque grande (Ãºltimos 4 dÃ­gitos do telefone), com aviso para guardar a senha
- [x] Bug: deleteOrder e deleteOrdersBulk nÃ£o decrementavam currentUses ao excluir pedido â€” corrigido para decrementar e restaurar status 'active' se necessÃ¡rio
- [x] Bug: JOIN na query listOrders usava comparaÃ§Ã£o direta de telefone sem normalizaÃ§Ã£o â€” corrigido para usar REGEXP_REPLACE em todos os JOINs. Quando admin altera telefone do cliente, acp.phone e orderStatusHistory.customerPhone tambÃ©m sÃ£o atualizados.

## Abas de Produto no AdminOrders
- [x] Pedidos agrupados em abas horizontais por produto (serviceName)
- [x] Sub-grupos por opÃ§Ã£o de serviÃ§o (PRIMEIRO/NOME, NOME/ALEATORIO, NOME COMPLETO) dentro de cada aba
- [x] Cards em grid responsivo (1â†’2â†’3â†’4 colunas)
- [x] Card expandido ocupa largura total (col-span-full)
- [x] Aba "Entregues" separada das abas de produto
- [x] Todos os produtos aparecem como abas mesmo com 0 pedidos (query trpc.products.list)
- [x] Bug: aba duplicada "GRUPO FIDELIDAE UBER" corrigida com normalizaÃ§Ã£o case-insensitive + trim na comparaÃ§Ã£o de nomes
- [x] Bug: apenas o primeiro card de cada sub-grupo aparecia â€” corrigido fechamento JSX duplicado

## EdiÃ§Ã£o de Pedido - Dropdowns de ServiÃ§o e OpÃ§Ã£o
- [x] Campo "ServiÃ§o" na ediÃ§Ã£o de pedido deve ser um dropdown com todos os produtos cadastrados (nÃ£o texto livre)
- [x] Campo "Nome / OpÃ§Ã£o escolhida" deve ser um dropdown com as opÃ§Ãµes do produto selecionado
- [x] Ao trocar o produto, as opÃ§Ãµes do dropdown de opÃ§Ã£o devem atualizar dinamicamente

## Novo Status - Aguardando Ficar Ativa
- [x] Adicionar status "aguardando_ativa" ao tipo OrderStatus no AdminOrders.tsx
- [x] Configurar visual (cor, Ã­cone, label) para o novo status (lime/verde-claro, Ã­cone Clock)
- [x] Inserir na ordem correta do STATUS_ORDER (apÃ³s conta_ativa, antes de pedido_entregue)
- [x] Atualizar o enum/tipo no servidor (routers.ts, db.ts, schema.ts) e migrar banco
- [x] Atualizar a pÃ¡gina do cliente (OrderTracking.tsx) e AdminNewOrder.tsx para exibir o novo status

## Texto Explicativo de Status no OrderTracking
- [x] Adicionar texto/tooltip explicativo para o status "Aguardando Ficar Ativa" na tela de acompanhamento do cliente

## Status EditÃ¡veis pelo Admin
- [x] Criar tabela orderStatusTypes no banco (id, key, label, color, icon, description, sortOrder, isSystem, isActive)
- [x] Migrar status fixos existentes como registros iniciais (seed dos 9 status)
- [x] Procedures CRUD: statusTypes.list, statusTypes.create, statusTypes.update, statusTypes.delete, statusTypes.toggle
- [x] PÃ¡gina AdminStatusTypes no painel admin para gerenciar status (/admin/status-types)
- [x] AdminOrders: carregar STATUS_CONFIG dinamicamente do banco via trpc.statusTypes.list
- [x] Campo status de mysqlEnum para varchar no schema + migraÃ§Ã£o aplicada
- [x] Texto explicativo por status: campo description editÃ¡vel pelo admin (exibido no OrderTracking)

## Bugs - Status DinÃ¢micos
- [x] Bug: Email de notificaÃ§Ã£o mostrando nÃºmero (sortOrder) em vez do label do status
- [x] Bug: OrderTracking nÃ£o respeita label/Ã­cone/cor editados pelo admin â€” agora usa status dinÃ¢micos do banco (trpc.statusTypes.list)

## Bugs - Status DinÃ¢micos (corrigidos)
- [x] Email mostrando nÃºmero "10" em vez do label do status - key era "10", corrigido para "conta_ativa_custom"
- [x] Badge do key interno (ex: documentos_aprovados) removido da listagem de status no admin
- [x] EdiÃ§Ã£o de status agora reflete imediatamente (invalidate + refetch forÃ§ado)
- [x] Email agora usa getStatusLabelFromDb - labels dinÃ¢micos do banco em vez de hardcoded
- [x] EspaÃ§os extras nos labels do banco removidos via TRIM SQL

## CorreÃ§Ãµes Solicitadas (05/05/2026)
- [x] Campo "Chave" no formulÃ¡rio de Novo Status: gerar automaticamente a partir do Nome exibido (slug) â€” nÃ£o deve ser obrigatÃ³rio digitar manualmente
- [x] Bug: foto de perfil aprovada aparece no email de "Pedido Entregue" â€” remover foto do email de status de entrega

## Bugs - Status DinÃ¢micos (sessÃ£o 05/05/2026)
- [x] Bug: AdminOrders usa STATUS_CONFIG hardcoded como fallback â€” status editados/criados pelo admin nÃ£o aparecem nos botÃµes de seleÃ§Ã£o de status do pedido
- [x] Bug: cfg pode ser undefined para status do banco que nÃ£o existem no STATUS_CONFIG estÃ¡tico (ex: conta_ativa_custom, entregue) â€” crash silencioso
- [x] Campo "Chave" no formulÃ¡rio de Novo Status: gerar automaticamente a partir do Nome exibido (slug) â€” nÃ£o deve ser obrigatÃ³rio digitar manualmente

## RevisÃ£o Geral de Status (sessÃ£o 05/05/2026 - v2)
- [x] Remover restriÃ§Ã£o isSystem de todos os status â€” todos livres para editar e excluir
- [x] Corrigir formulÃ¡rio de cadastro de pedido (AdminNewOrder) para usar status dinÃ¢micos do banco
- [x] Remover badge "Sistema" e cadeado da UI de AdminStatusTypes
- [x] Corrigir backend: deleteOrderStatusType nÃ£o deve bloquear exclusÃ£o por isSystem

## Bug - Upload Comprovante (05/05/2026)
- [x] Bug: "Erro ao processar arquivo. Tente selecionar novamente." aparece no rodapÃ© quando cliente tenta enviar comprovante de pagamento â€” arquivo aparece na tela mas erro impede finalizaÃ§Ã£o

## Melhoria - Badge Urgente nos Cards (05/05/2026)
- [x] Badge URGENTE deve aparecer em todos os cards quando o filtro "Urgente" estÃ¡ ativo (nÃ£o apenas nos que jÃ¡ tÃªm borda vermelha)

## Aba Pedidos Urgentes (05/05/2026)
- [x] Criar aba/pÃ¡gina dedicada no menu lateral do painel admin para exibir todos os pedidos urgentes (isUrgent=1), com os mesmos cards e funcionalidades da pÃ¡gina de Pedidos
- [x] Criar painel/card de urgÃªncias fixo no topo da pÃ¡gina de Pedidos: quando pedido for marcado como urgente, aparece nesse painel em destaque

## CorreÃ§Ãµes Urgentes (05/05/2026)
- [x] Fuso horÃ¡rio: ajustar todas as datas exibidas para SÃ£o Paulo (UTC-3 / America/Sao_Paulo)
- [x] Foto de perfil obrigatÃ³ria: bloquear finalizaÃ§Ã£o do cadastro sem foto
- [x] HorÃ¡rio de entrada: exibir corretamente o horÃ¡rio que o cliente acessou/entrou no painel admin
- [x] CÃ¢mera/Galeria: quando admin ativa apenas cÃ¢mera e aparelho nÃ£o tem cÃ¢mera, bloquear botÃ£o e exibir mensagem explicando que Ã© necessÃ¡rio usar aparelho com cÃ¢mera (nÃ£o liberar galeria)

## Cadastro Manual de Cliente pelo Admin (05/05/2026)
- [x] Criar formulÃ¡rio de cadastro manual de cliente no painel admin (nome, telefone, email, cidade, foto de perfil)
- [x] Melhorar visual do formulÃ¡rio AdminNewOrder (melhor layout, seÃ§Ãµes organizadas, visual moderno)
- [x] Ao cadastrar cliente manualmente, criar registro na tabela de clientes sem necessidade de pedido

## Layout de Clientes em Cards (05/05/2026)
- [x] Transformar lista de clientes de tabela para grid de cards (foto, nome, telefone, cidade, status, data)

## Sistema de Banners EditÃ¡veis (05/05/2026)
- [x] Criar tabela `info_banners` no banco (id, title, content, bgColor, textColor, isActive, sortOrder, createdAt)
- [x] Criar procedures: listBanners, createBanner, updateBanner, deleteBanner, reorderBanners
- [x] Criar pÃ¡gina AdminBanners com editor visual (cor fundo, cor texto, tÃ­tulo, conteÃºdo, preview em tempo real)
- [x] Adicionar item "Banners" no menu lateral do admin
- [x] Exibir banners ativos na pÃ¡gina do cliente (Home.tsx) como cards de destaque

## Painel Pedidos Entregues (05/05/2026)
- [x] Criar painel/card de Pedidos Entregues no topo da pÃ¡gina de Pedidos (igual ao painel de Urgentes)

## SincronizaÃ§Ã£o de Dados do Pedido com Cadastro do Cliente (05/05/2026)
- [x] Ao finalizar pedido (submitFiles), salvar/atualizar nome, cidade, telefone, email no cadastro do cliente
- [x] Ao finalizar pedido, salvar todos os arquivos enviados (documentos) vinculados ao cadastro do cliente

## Documentos do Cliente no Cadastro (05/05/2026)
- [x] Procedure getFilesByPhone no backend (orderStatus.getFilesByPhone) para listar todos os documentos de um cliente pelo telefone
- [x] BotÃ£o FolderOpen (ciano) nos cards de clientes para abrir modal de documentos
- [x] Modal FilesModal: lista todos os documentos enviados pelo cliente com preview de imagem, label, data e link para abrir/baixar

## Banners Pequenos Abaixo dos Cards de ServiÃ§o (05/05/2026)
- [x] Mover banners informativos para dentro da seÃ§Ã£o de serviÃ§os, abaixo do grid de cards
- [x] Banners menores: padding reduzido, fonte menor (text-xs), Ã­cone ðŸ“¢, alinhados ao container da pÃ¡gina

## Bug do VÃ­deo (05/05/2026)
- [x] Corrigir bug do vÃ­deo: quando URL falha ou estÃ¡ vazia, ocultar completamente a seÃ§Ã£o de vÃ­deo (sem bloco feio de fallback)
- [x] VÃ­deo sÃ³ exibe quando VIDEO_URL estÃ¡ preenchida e nÃ£o houve erro de carregamento

## BotÃ£o de Logout e SeguranÃ§a do Login Admin (06/05/2026)
- [x] Criar componente AdminHeader reutilizÃ¡vel com botÃ£o de Sair (logout)
- [x] Adicionar AdminHeader em todas as pÃ¡ginas admin (Codes, Coupons, Products, Settings, Customers, Orders, Commissions, Raffles, NewOrder, StatusTypes, Banners)
- [x] Desativar autocomplete/histÃ³rico de senha no formulÃ¡rio de login admin (autocomplete="off" + new-password)

## Auto-Urgente 48h (06/05/2026)
- [x] Pedidos com mais de 48h sem atualizaÃ§Ã£o de status sÃ£o marcados automaticamente como urgentes
- [x] Procedure autoMarkUrgent no backend que verifica pedidos com latestStatusAt > 48h e seta isUrgent=1
- [x] Chamada automÃ¡tica da procedure ao carregar a lista de pedidos no admin

## SeleÃ§Ã£o em Massa - AdminCustomers (06/05/2026)
- [x] BotÃ£o "Selecionar todos com pedidos" no AdminCustomers para selecionar em massa clientes que possuem pedidos

## NÃºmero de Pedido AutomÃ¡tico (06/05/2026)
- [x] Criar tabela orderCounter com auto_increment iniciando em 10000 para gerar nÃºmero Ãºnico por pedido
- [x] Ao criar pedido, gerar nÃºmero automÃ¡tico a partir do contador (10000, 10001, 10002...)
- [x] Exibir nÃºmero do pedido nos cards do AdminOrders e no acompanhamento do cliente

## NÃºmero de Pedido AutomÃ¡tico - orderNumber (06/05/2026)
- [x] Criar tabela orderCounter com AUTO_INCREMENT = 10000 para gerar nÃºmero Ãºnico por pedido
- [x] Adicionar coluna orderNumber na tabela orderStatusHistory
- [x] Gerar orderNumber automÃ¡tico ao criar pedido (via INSERT em orderCounter)
- [x] Exibir orderNumber nos cards do AdminOrders com badge visual
- [x] Exibir orderNumber no acompanhamento do cliente

## NÃºmero de Cadastro do Cliente (06/05/2026)
- [x] Adicionar coluna customerNumber na tabela customers
- [x] Gerar customerNumber automÃ¡tico ao criar cliente (seqÃ¼encial a partir de 1)
- [x] Exibir customerNumber (badge C#) na frente do nome do cliente no AdminCustomers
- [x] Exibir customerNumber (badge C#) na frente do nome do cliente no AdminOrders
- [x] Corrigir: botÃ£o "Selecionar todos com pedidos" sÃ³ aparece quando hÃ¡ clientes com pedidos na lista

## CorreÃ§Ãµes AdminCustomers (06/05/2026 - 3a vez)
- [x] Remover # do badge de nÃºmero de cadastro (mostrar sÃ³ o nÃºmero: 71, nÃ£o C#71)
- [x] BotÃ£o "Selecionar todos com pedidos" filtra a lista mostrando somente clientes com pedidos
- [x] Exibir nÃºmero do pedido no card do cliente que tem pedido

## CorreÃ§Ãµes Badges e orderNumber Retroativo (06/05/2026)
- [x] Remover C# e P# dos badges no AdminOrders (mostrar sÃ³ o nÃºmero)
- [x] Atribuir orderNumber (10000+) retroativamente a todos os 26 pedidos existentes

## Layout NÃºmero do Pedido (06/05/2026)
- [x] NÃºmero do pedido em linha separada com label "Pedido: 10001" no AdminOrders e AdminCustomers

## Busca por NÃºmero de Cadastro (06/05/2026)
- [x] Incluir customerNumber no filtro de busca do AdminCustomers
- [x] Incluir customerNumber e orderNumber no filtro de busca do AdminOrders
- [x] Corrigir: busca filtra tambÃ©m a seÃ§Ã£o de pedidos urgentes
- [x] Prioridade de busca: nÃºmero puro busca por customerNumber/orderNumber exato antes de telefone
- [x] BUG CRITICO: busca com filtro ativo agora ignora filtros de status/perÃ­odo (busca global)
- [x] BUG CRITICO: pedidos entregues agora ficam SOMENTE na aba Entregues
- [x] Busca por #10001 para nÃºmero do pedido, nÃºmero puro para cadastro
- [x] Exibir Pedido: #nÃºmero nos cards com botÃ£o de copiar
- [x] Exibir nÃºmero de cadastro com * na frente (ex: *37) no AdminOrders e AdminCustomers

## BUG CRITICO: Pedidos novos nÃ£o aparecem no admin e nÃ£o enviam notificaÃ§Ãµes (06/05/2026)
- [x] Investigar e corrigir: pedido novo nÃ£o aparece no painel admin
- [x] Investigar e corrigir: email de novo pedido nÃ£o estÃ¡ sendo enviado
- [x] Investigar e corrigir: WhatsApp de novo pedido nÃ£o estÃ¡ sendo enviado

## BUG: Filtro Todos nÃ£o mostra todos os pedidos (07/05/2026)
- [x] Corrigir: aba "Todos" adicionada na barra de produtos para mostrar todos os pedidos juntos

## PrevisÃ£o de Entrega do Pedido (07/05/2026)
- [x] Adicionar coluna deliveryEstimate (int, nullable) na tabela orderStatusHistory
- [x] Criar procedure updateDeliveryEstimate para salvar a previsÃ£o
- [x] Adicionar editor de data/hora de previsÃ£o de entrega no painel admin (aba Status do pedido)
- [x] Exibir previsÃ£o de entrega no acompanhamento do cliente

## Envio de Documentos do Admin para o Cliente (07/05/2026)
- [x] Adicionar coluna fromAdmin (int, default 0) na tabela orderFiles
- [x] Atualizar procedure uploadFile para aceitar fromAdmin e salvar em prefixo admin-docs/
- [x] Criar procedure getAdminFilesForClient (publicProcedure) para o cliente buscar docs do admin
- [x] Reestruturar aba Documentos no AdminOrders: seÃ§Ã£o verde "Enviar para o Cliente" + seÃ§Ã£o de docs do cliente
- [x] Exibir documentos do admin no OrderTracking como card verde "Documentos para VocÃª"

## Selo "Novo" em Documentos do Admin para o Cliente (07/05/2026)
- [x] Exibir badge "Novo" (verde, pulsante) nos documentos do admin no OrderTracking atÃ© o cliente abrir pela primeira vez
- [x] Marcar documento como lido via localStorage ao clicar (sem necessidade de backend)
- [x] Exibir contador de nÃ£o lidos no tÃ­tulo da seÃ§Ã£o "Documentos para VocÃª"

## CorreÃ§Ã£o: Acesso ao Acompanhamento Sempre Ativo (07/05/2026)
- [x] Remover bloqueio de acesso ao acompanhamento para pedidos com status "pedido_entregue" ou "cancelado" â€” PIN ignorado automaticamente para pedidos finalizados

## Aba "AnotaÃ§Ãµes Internas" no Card de Pedido do Admin (07/05/2026)
- [x] Criar tabela orderNotes no banco (id, registrationId, content, createdAt, updatedAt)
- [x] Criar procedures getOrderNotes, saveOrderNote no tRPC (adminProcedure)
- [x] Adicionar aba "AnotaÃ§Ãµes" no card de pedido do AdminOrders
- [x] Editor de texto livre com botÃ£o salvar e data da Ãºltima atualizaÃ§Ã£o

## CorreÃ§Ã£o: Permitir MÃºltiplos Pedidos com Mesmo Telefone (07/05/2026)
- [x] Remover restriÃ§Ã£o que bloqueava o mesmo telefone de usar a mesma senha mais de uma vez

## Destaque de NÃºmeros de Contato na Tela de Cadastro (07/05/2026)
- [x] Exibir aviso em destaque informando que o nÃºmero deve ser o pessoal/particular do WhatsApp do cliente

## CorreÃ§Ã£o: Senha VIP com 2 usos expirando apÃ³s 1 uso (07/05/2026)
- [x] Permitir que o mesmo telefone use a senha VIP mÃºltiplas vezes enquanto houver usos disponÃ­veis (maxUses)

## Bugs: Pedido Entregue e MÃºltiplos Pedidos (07/05/2026)
- [x] Pedido entregue sai da lista principal (latestStatus agora busca por registrationId, nÃ£o por phone)
- [x] Cliente com mÃºltiplos pedidos exibe todos (novo registro em accessCodePhones a cada uso)

## Bug: Timeline OrderTracking nÃ£o bate com status do Admin (08/05/2026)
- [x] Timeline marca como concluÃ­dos status que o pedido nunca passou (usa sortOrder em vez do histÃ³rico real)
- [x] Status atual na barra e na timeline deve corresponder exatamente ao que o admin definiu

## Bug: PrevisÃ£o de Entrega nÃ£o aparece no OrderTracking (08/05/2026)
- [x] PrevisÃ£o de entrega salva pelo admin nÃ£o aparece na pÃ¡gina de acompanhamento do cliente

## Regra especial: Status "PEDIDO ENTREGUE" na timeline (08/05/2026)
- [x] Entregue fica verde se existir no histÃ³rico E status atual for login_de_acesso ou o prÃ³prio entregue
- [x] Se admin mudar para qualquer outro status apÃ³s entregue, o entregue Ã© desfeito (cinza)
- [x] LOGIN DE ACESSO Ã© o Ãºnico status que NÃƒO desfaz o entregue

## Regra especial: "SITESMA EM MANUTEÃ‡ÃƒO UBER" segue mesma regra do entregue (08/05/2026)
- [x] sitesma_em_manutecao_uber segue mesma regra: sÃ³ fica verde se status atual for login_de_acesso ou ele mesmo

## Bug: Cliente com mÃºltiplos pedidos aparece em uma aba sÃ³ (08/05/2026)
- [x] Cliente *67 fez dois pedidos mas sÃ³ aparece em uma aba no admin
- [x] Cada pedido deve aparecer separadamente (admin e pÃ¡gina de acompanhamento)
- [x] Corrigir para todos os futuros pedidos do mesmo telefone

## Bug: Admin nÃ£o mostra mÃºltiplos pedidos do mesmo cliente separados (08/05/2026)
- [x] Cliente *80 fez dois pedidos mas sÃ³ aparece um card na aba de Pedidos do admin
- [x] Cada pedido do mesmo cliente deve aparecer como card separado na aba de Pedidos

## Regra filtro Entregues no Admin (08/05/2026)
- [x] Pedido com status "PEDIDO ENTREGUE" sai de todos os filtros de produto e fica sÃ³ na aba Entregues
- [x] Se admin mudar para outro status (exceto LOGIN DE ACESSO), volta ao filtro de produto de origem
- [x] LOGIN DE ACESSO mantÃ©m o pedido na aba Entregues (nÃ£o volta ao produto)

## Bug: Admin mostra apenas 1 pedido por telefone mesmo com mÃºltiplos (08/05/2026)
- [x] Cliente com 4 pedidos aparece como 1 card no admin (listOrders nÃ£o retorna todos os registrationIds)
- [x] Corrigir query listOrders para retornar 1 card por registrationId (nÃ£o por telefone)

## Bug: Deletar sub-pedido no admin deleta todos os sub-pedidos do mesmo registrationId (08/05/2026)
- [x] Ao deletar um sub-pedido, o sistema deleta todos os registros do registrationId inteiro
- [x] Corrigir: deletar apenas o histÃ³rico do sub-pedido especÃ­fico (intervalo de datas entre recebidos)
- [x] Se for o Ãºnico sub-pedido, deletar o registrationId inteiro (comportamento atual correto)

## Bug: Pedidos duplicados no admin com o mesmo nÃºmero (08/05/2026)
- [x] Pedidos com o mesmo nÃºmero aparecem mÃºltiplas vezes no admin
- [x] Investigar se a duplicaÃ§Ã£o vem do banco (mÃºltiplos 'recebido' no mesmo sub-pedido) ou da lÃ³gica de split
- [x] Corrigir para que cada pedido apareÃ§a apenas uma vez

## Soft Delete de Sub-pedidos (08/05/2026)
- [x] Criar tabela hiddenSubOrders (registrationId, subOrderIndex, hiddenAt)
- [x] Procedure hideSubOrder: insere na tabela hiddenSubOrders em vez de deletar do banco
- [x] listOrders: filtrar sub-pedidos que estÃ£o na tabela hiddenSubOrders
- [x] Frontend: renomear botÃ£o "Deletar" para "Remover" para deixar claro que Ã© ocultaÃ§Ã£o

## Bugs reportados em 09/05/2026

- [x] Bug 1: Busca no admin nÃ£o atualiza ao pesquisar segundo pedido â€” sÃ³ aparece apÃ³s recarregar a pÃ¡gina
- [x] Bug 2: Pedido criado pelo admin nÃ£o gera nÃºmero de pedido automaticamente
- [ ] Bug 3: Consulta por nÃºmero de cadastro mostra apenas 1 pedido mesmo quando o cliente tem 2 (em cards diferentes)

## NumeraÃ§Ã£o de pedidos existentes (09/05/2026)
- [x] Atribuir nÃºmero Ãºnico para cada sub-pedido sem nÃºmero (orderNumber = NULL ou "NULL")
- [x] Cada sub-pedido (card) deve ter nÃºmero diferente, mesmo que do mesmo cliente
- [x] Script de migraÃ§Ã£o para popular orderNumber em todos os registros existentes

## CorreÃ§Ã£o - Pedidos entregues nÃ£o aparecem no Acompanhar do cliente
- [x] OrderTracking: filtrar sub-pedidos com status "entregue" ou "login_de_acesso" â€” nÃ£o aparecem para o cliente, somente no admin (aba Entregues)

## ConfirmaÃ§Ã£o antes de salvar status no admin
- [x] BotÃ£o "Atualizar Status" no admin agora SUBSTITUI o Ãºltimo status (nÃ£o acumula histÃ³rico) â€” admin pode corrigir para qualquer status a qualquer momento

## Varredura AdminOrders - correÃ§Ãµes aplicadas
- [x] Painel de urgÃªncias: excluir pedidos entregues do painel e contagem de urgentes
- [x] Filtro de busca: excluir pedidos entregues dos resultados de busca (ficam sÃ³ na aba Entregues)
- [x] WhatsApp: usar label do status dinÃ¢mico do banco em vez de lista hardcoded
- [x] Contagens (urgentCount, indicadorCount, commissionPendingCount): excluir entregues
- [x] isDeliveredStatus: mover declaraÃ§Ã£o para antes do filtered para uso global no componente

## Varredura AdminCustomers - correÃ§Ãµes e melhorias aplicadas
- [x] CSV exportaÃ§Ã£o: adicionada coluna Email que estava faltando
- [x] Busca: adicionada busca por email no filtro de texto livre
- [x] Placeholder da busca: atualizado para mencionar #nÂº pedido e *nÂº cadastro
- [x] Contador no header: mostra "X de Y clientes" quando hÃ¡ filtro ativo
- [x] OrdenaÃ§Ã£o: adicionado seletor (Mais recentes / Mais antigos / Nome A-Z)
- [x] Labels de data: "Cadastro:" e "Ãšltimo acesso:" agora tÃªm label legÃ­vel
- [x] Badge de aviso: clientes sem email recebem aviso âš ï¸ no card
- [x] FilesModal: separado botÃ£o Abrir (olho) do botÃ£o Download real

## MigraÃ§Ã£o de documentos dos pedidos para o cadastro do admin
- [ ] Criar query no backend que retorna todos os documentos enviados pelo cliente nos pedidos (orderFiles) agrupados por pedido
- [ ] Exibir documentos dos pedidos na aba de documentos do cadastro do cliente no admin (junto com os documentos do cadastro)

## Carrinho de Compras
- [x] BotÃ£o "Adicionar ao Carrinho" em cada produto
- [x] Modal do carrinho com lista de itens e remoÃ§Ã£o individual
- [x] ExibiÃ§Ã£o do total do carrinho no modal (quando mÃºltiplos itens)
- [x] Fluxo de checkout do carrinho (preencher dados uma Ãºnica vez)
- [x] Resumo do pedido no pagamento mostra todos os itens quando vem do carrinho
- [x] Valor a pagar no PIX reflete o total de todos os itens do carrinho
- [x] handleFinalSubmit cria um pedido separado para cada item do carrinho
- [x] Testes unitÃ¡rios para lÃ³gica do carrinho (8 testes passando)
- [x] Bug corrigido: startCartCheckout agora segue o fluxo correto (pdf-upload â†’ upload â†’ questions â†’ cadastro)

## Admin - Pedido Manual com MÃºltiplos Produtos
- [x] Backend: procedure createManualOrderMultiple aceita array de produtos e cria um pedido por item
- [x] Frontend: seÃ§Ã£o de produto vira lista dinÃ¢mica (adicionar/remover itens)
- [x] Frontend: cÃ¡lculo automÃ¡tico do valor total dos itens selecionados
- [x] Frontend: resumo mostra todos os produtos e o total
- [x] Testes para createManualOrderMultiple (17 testes passando)

## Admin - Modal de ConfirmaÃ§Ã£o apÃ³s Pedido Manual
- [x] Substituir tela de sucesso por modal animado com detalhes do pedido criado
- [x] Modal mostra: nome do cliente, produtos criados, status, nÃºmero(s) do pedido
- [x] BotÃµes: "Novo Pedido" e "Ver Pedidos" dentro do modal
- [x] AnimaÃ§Ã£o de entrada suave (fade + scale)

## Bugs reportados (10/05/26)
- [ ] Bug: nÃºmero do pedido (#) nÃ£o aparece no card do pedido na lista de pedidos admin
- [ ] Bug: histÃ³rico de status duplicado no mesmo pedido (aparece "PEDIDO RECEBIDO" duas vezes)
- [x] Bug: splitIntoSubOrders usa 'recebido' hardcoded mas status inicial Ã© 'pedido_recebido' â€” corrigido para usar status dinÃ¢mico do banco
- [x] Bug: orderNumber NULL no banco â€” generateOrderNumber corrigido para usar LAST_INSERT_ID() via SQL
- [x] Comportamento: mÃºltiplos itens do carrinho = 1 pedido com 1 nÃºmero, produtos concatenados no serviceName
- [ ] Bug: pedidos com status pedido_recebido nÃ£o aparecem nos cards da lista de pedidos do admin

## CorreÃ§Ãµes 11/05/26
- [x] Bug: orderNumber NULL no banco â€” generateOrderNumber corrigido para usar LAST_INSERT_ID() via SQL raw
- [x] Bug: submitFiles nÃ£o salvava pedido â€” consumeAccessCode nÃ£o encontrava registro por diferenÃ§a de formato de telefone (corrigido com REGEXP_REPLACE)
- [x] Bug: submitFiles dependia de consumed=1 para encontrar regId â€” corrigido para buscar por phone+code diretamente
- [x] Bug: splitIntoSubOrders usava 'recebido' hardcoded â€” corrigido para usar status inicial dinÃ¢mico do banco
- [x] Bug: pedidos com status pedido_recebido nÃ£o apareciam nos cards â€” corrigido junto com splitIntoSubOrders
- [x] Bug: createManualOrderMultiple criava N entradas no histÃ³rico â€” corrigido para criar 1 entrada com produtos concatenados e 1 Ãºnico nÃºmero de pedido
- [x] Testado ponta a ponta: pedido criado com orderNumber=340000, status=pedido_recebido, email enviado

## CorreÃ§Ãµes urgentes 11/05/26 (tarde)
- [x] Recuperar pedidos perdidos: Yuri (#340002) e Vinicius (#340003) â€” orderStatusHistory criado manualmente
- [x] Corrigir fuso horÃ¡rio: servidor agora usa TZ=UTC, frontend jÃ¡ converte para America/Sao_Paulo
- [ ] BotÃ£o de gerado automÃ¡tico/manual em todos os pedidos no painel admin
- [x] Suporte a envio de vÃ­deos (mp4, mov, webm) pelo admin para o cliente: aceitar vÃ­deo no upload do AdminOrders, exibir player inline no OrderTracking, limite 100MB para vÃ­deos
- [x] Bug: upload de vÃ­deo falhava com erro 401 (rota usava sdk.authenticateRequest em vez de admin_token JWT)
- [x] Bug: upload de vÃ­deo falhava pois express.json() interceptava stream multipart antes do multer â€” corrigido movendo registerUploadRoute antes dos body parsers
- [x] Limite de vÃ­deo aumentado de 100MB para 150MB

## CorreÃ§Ãµes 13/05/26
- [x] BUG CRÃTICO CORRIGIDO: Bloco de dados de acesso (Login, Senha, CÃ³digo Autenticador) sumia no status PEDIDO ENTREGUE â€” causa: banco usa chave 'entregue' mas cÃ³digo verificava 'pedido_entregue'. Corrigido para aceitar ambos em OrderTracking.tsx (isFinalStatus, enabled da query, condiÃ§Ã£o de renderizaÃ§Ã£o do bloco e condiÃ§Ã£o de deliveryEstimate).
- [x] Adicionar botÃ£o de Sair/Deslogar na pÃ¡gina de acompanhamento do cliente (OrderTracking) para limpar o estado de login
- [x] Adicionar botÃ£o de Sair/Deslogar na pÃ¡gina de Fazer Pedido (Home.tsx) para o cliente que estÃ¡ logado com senha VIP
- [x] BUG: Campo "CÃ³digo Autenticador" no admin nÃ£o remove traÃ§os automaticamente ao digitar/colar

## SeguranÃ§a 13/05/26
- [x] Bloquear download de vÃ­deo no OrderTracking: remover controles de download, desabilitar botÃ£o direito no vÃ­deo, usar controlslist="nodownload"
- [x] Detectar DevTools/console aberto pelo cliente e bloquear/ocultar dados sensÃ­veis
- [x] Notificar admin quando DevTools for detectado (via tRPC mutation + notifyOwner)
- [x] Dividir pedidos arquivados por status dentro da aba Arquivados no painel admin (seÃ§Ãµes colapsÃ¡veis por status)
- [x] BUG SEGURANÃ‡A: Status PEDIDO ENTREGUE nÃ£o exige PIN â€” corrigido para exigir senha em TODOS os status sem exceÃ§Ã£o
- [x] Desativar alerta de emergÃªncia (DevTools/bloqueio) para clientes com status LOGIN LIBERADO ou PEDIDO ENTREGUE
- [x] BUG: Pedidos com status PEDIDO ENTREGUE continuam com badge URGENTE â€” ao mudar status para entregue/pedido_entregue, remover automaticamente a flag isUrgent
- [x] BUG CRÃTICO: Ao atualizar a pÃ¡gina no OrderTracking, todos os dados somem (pinVerified, searchPhone, selectedOrderIdx) â€” persistir no sessionStorage para sobreviver ao refresh
- [x] Remover sistema automÃ¡tico de urgÃªncia (autoMarkUrgent por 48h) â€” deixar SOMENTE controle manual pelo admin
- [x] Corrigir layout mobile no AdminOrders â€” aba de detalhes do pedido nÃ£o mostra dados de login (Login/Senha/CÃ³digo Autenticador) no celular
- [x] Senha geral 3095 na pÃ¡gina de acompanhar: acessa qualquer pedido sem PIN, desativa detecÃ§Ã£o de DevTools
- [x] Player de vÃ­deo: permitir tela cheia (fullscreen) mas bloquear download
- [x] Modo ADM via URL (/acompanhar?adm=3095): remover campo de senha visÃ­vel, ativar por query string
- [x] Tabela doc_requests: ADM cria solicitaÃ§Ã£o de documento pendente com mensagem livre por pedido
- [x] ADM: aba "Documentos Pendentes" no pedido para solicitar reenvio com mensagem
- [x] Cliente: alerta de documento pendente com mensagem do ADM e upload de resposta
- [x] ADM: notificaÃ§Ã£o quando cliente responder solicitaÃ§Ã£o de documento
- [x] Indicador visual no card do pedido no ADM para documentos de resposta recÃ©m-enviados pelo cliente
- [x] E-mail de notificaÃ§Ã£o quando cliente inicia o cadastro (telefone + foto)
- [x] E-mail de notificaÃ§Ã£o quando cliente finaliza o cadastro (todos os dados + foto)

## CorreÃ§Ãµes 14/05/26
- [x] Bug: arquivos/vÃ­deos enviados ao cliente (seÃ§Ã£o ENVIAR PARA O CLIENTE) nÃ£o aparecem listados na aba Docs do admin apÃ³s envio â€” corrigido com invalidate + refetch imediato apÃ³s upload de vÃ­deo via multipart
- [ ] Bug: arquivo deletado pelo admin continua aparecendo na pÃ¡gina do cliente /acompanhar â€” deleÃ§Ã£o nÃ£o reflete no cliente
## CorreÃ§Ãµes 07/06/26
- [x] Dados de Login (login, senha, cÃ³digo autenticador, link) visÃ­vel para o admin em QUALQUER status do pedido (nÃ£o sÃ³ em Entregue)
- [x] Dados de Login visÃ­vel para o cliente apenas quando status for Entregue (pedido_entregue)
- [x] Texto de confirmaÃ§Ã£o atualizado: "Dados salvos â€” visÃ­veis para o cliente quando status for Entregue"

## AlternÃ¢ncia automÃ¡tica entre duas chaves PIX
- [ ] Adicionar coluna `pixOrder` (INT, default 0) na tabela pixAccounts para controlar ordem de alternÃ¢ncia
- [ ] Adicionar coluna `useCount` (INT, default 0) na tabela pixAccounts para contar quantas vezes foi usada
- [ ] Procedure pÃºblica `pix.getForOrder`: retorna a chave PIX a ser usada para o prÃ³ximo pedido (alternÃ¢ncia automÃ¡tica entre as ativas)
- [ ] LÃ³gica de alternÃ¢ncia: entre as contas ativas, usar a que tem menor useCount (ou alternar por Ã­ndice par/Ã­mpar do total de pedidos)
- [ ] Quando o cliente chega na tela de pagamento, buscar a chave via `pix.getForOrder` em vez de `pix.getActive`
- [ ] Procedure `pix.incrementUseCount`: incrementa o contador da chave usada quando o pedido Ã© finalizado (chamada no submitFiles)
- [ ] AdminSettings: exibir contador de usos de cada conta PIX
- [ ] AdminSettings: botÃ£o para resetar contador de usos

## FormulÃ¡rio de Dados de Login â€” Novos Campos (08/06/2026)
- [x] Adicionar campo "Texto / InstruÃ§Ãµes" (textarea) no formulÃ¡rio de Dados de Login para o Cliente
- [x] Adicionar campo "Link do Grupo" (ex: grupo WhatsApp, canal Telegram) no formulÃ¡rio de Dados de Login
- [x] Salvar os novos campos no banco de dados (coluna loginNotes e loginGroupLink na tabela orderLoginData)
- [x] Enviar os novos campos via email ao cliente quando status for "Entregue"
- [x] Enviar os novos campos via WhatsApp ao cliente quando status for "Entregue"
- [x] Exibir os novos campos para o cliente na pÃ¡gina de acompanhamento (OrderTracking) quando status for "Entregue"

## Foto de Perfil ObrigatÃ³ria no Cadastro (08/06/2026)
- [ ] No step "SEUS DADOS" do cadastro, exibir campo de foto de perfil para clientes novos
- [ ] Bloquear botÃ£o "CONTINUAR PARA PAGAMENTO" se cliente novo nÃ£o tiver enviado foto de perfil
- [ ] Cliente jÃ¡ cadastrado (com foto existente) nÃ£o precisa enviar novamente

## Sistema de Revendedores
- [x] Tabelas no banco: resellers, resellerPrices, resellerOrders
- [x] Backend: auth do revendedor (login/logout/check via JWT cookie)
- [x] Backend: CRUD admin (criar, editar, excluir, ativar/desativar)
- [x] Backend: preÃ§os de custo por opÃ§Ã£o (admin define)
- [x] Backend: preÃ§os de venda por opÃ§Ã£o (revendedor define)
- [x] Backend: registro de pedidos do revendedor no checkout
- [x] Backend: marcar comissÃ£o como paga
- [x] Frontend: painel do revendedor (/revendedor e /revendedor/dashboard)
- [x] Frontend: painel admin de revendedores (/admin/resellers)
- [x] Frontend: link Ãºnico /r/:slug com preÃ§os do revendedor automÃ¡ticos
- [x] Frontend: registro do pedido do revendedor apÃ³s checkout bem-sucedido
- [x] Frontend: menu admin com link "Revendedores"

## MÃ³dulo Controle Financeiro (10/06/2026)
- [x] Tabela financialSales no banco de dados (schema + migraÃ§Ã£o SQL)
- [x] Helpers no db.ts (createFinancialSale, updateFinancialSale, deleteFinancialSale, listFinancialSales, getFinancialSummary, getCashFlow)
- [x] Procedures no routers.ts (financial.summary, financial.list, financial.cashFlow, financial.create, financial.update, financial.delete)
- [x] PÃ¡gina AdminFinanceiro.tsx com Resumo, Controle de Vendas, Fluxo de Caixa e RelatÃ³rios
- [x] Card de Financeiro no menu do AdminCodes
- [x] Rota /admin/financeiro no App.tsx
- [x] AutomaÃ§Ã£o: lanÃ§amento automÃ¡tico no submitFiles (novo pedido â†’ status pendente)
- [x] Exportar CSV
- [x] Exportar PDF (impressÃ£o)

## Sistema de Links de IndicaÃ§Ã£o por Cliente (11/06/2026)
- [x] Tabela referralLinks (id, customerId, code, commissionValue, commissionType, usageCount, active, createdAt)
- [x] Tabela referralUsages (id, referralLinkId, registrationId, clientName, clientPhone, commissionPaid, createdAt)
- [x] Helpers no db.ts (createReferralLink, listReferralLinksByCustomer, getReferralLinkByCode, deleteReferralLink, toggleReferralLink, recordReferralUsage, markReferralCommissionPaid, isPhoneNewCustomer)
- [x] Procedure referral.generateLink (admin): gera link com comissÃ£o fixa ou percentual
- [x] Procedure referral.listByCustomer (admin): lista links e usos de um cliente
- [x] Procedure referral.validateCode (pÃºblico): valida cÃ³digo e retorna dados do link
- [x] Procedure referral.deleteLink (admin): remove link
- [x] Procedure referral.toggleLink (admin): ativa/desativa link
- [x] Procedure referral.markCommissionPaid (admin): marca comissÃ£o como paga
- [x] Procedure referral.recordUsage (pÃºblico): registra uso do link apÃ³s cadastro
- [x] Modal de Links de IndicaÃ§Ã£o no AdminCustomers (gerar, copiar, ativar/desativar, excluir, listar indicaÃ§Ãµes, marcar comissÃ£o paga)
- [x] Captura de ?ref= na URL pÃºblica (PasswordGate.tsx) com limpeza da URL
- [x] ValidaÃ§Ã£o automÃ¡tica do cÃ³digo ao entrar no step de indicaÃ§Ã£o
- [x] Registro automÃ¡tico do uso do link apÃ³s cadastro bem-sucedido
- [x] FormulÃ¡rio manual de indicaÃ§Ã£o mantido para quem nÃ£o veio por link

## Acesso TemporÃ¡rio por Link de IndicaÃ§Ã£o (11/06/2026)
- [x] Colunas refCode e refExpiresAt na tabela accessCodePhones (ou tabela separada refSessions)
- [x] MigraÃ§Ã£o SQL e aplicar no banco
- [x] Procedure pÃºblica referral.startRefSession: valida cÃ³digo, cria sessÃ£o de 30 min, retorna token
- [x] Procedure pÃºblica referral.checkRefSession: verifica se sessÃ£o ainda Ã© vÃ¡lida (< 30 min)
- [x] Frontend: ao chegar com ?ref=, validar cÃ³digo e criar sessÃ£o; pular step de senha por 30 min
- [x] Frontend: na segunda visita (sessÃ£o expirada), exigir senha normalmente
- [x] Painel admin: badge "ðŸ”— Link de IndicaÃ§Ã£o" nos cards de pedido/acesso com nome do dono do link

## Senha de 4 DÃ­gitos para Acompanhamento de Pedido (12/06/2026)
- [x] Gerar senha de 4 dÃ­gitos automaticamente no submitFiles e salvar em loginData.loginPassword
- [x] Procedure loginData.getTrackingPassword (pÃºblica) para o OrderTracking verificar a senha
- [x] Admin: campo Senha preenchido automaticamente com a senha gerada (editÃ¡vel)
- [x] OrderTracking: usar senha de 4 dÃ­gitos gerada em vez dos 4 Ãºltimos do telefone
- [x] Exibir senha gerada em destaque na tela de confirmaÃ§Ã£o do pedido (apÃ³s finalizar)

## FormulÃ¡rio DinÃ¢mico - Tela de Acompanhamento (/acompanhar)
- [x] Criar tabela trackingQuestions (id, text, options JSON com cor/bloqueio, isActive, showOnce, createdAt)
- [x] Criar tabela trackingAnswers (id, orderId, customerId, questionId, answer, answeredAt)
- [x] Procedures servidor: listar/criar/editar/excluir/ativar perguntas (admin)
- [x] Procedure: salvar resposta do cliente no OrderTracking
- [x] Interface admin para gerenciar perguntas (aba no AdminSettings ou AdminOrders)
- [x] Exibir formulÃ¡rio no OrderTracking quando hÃ¡ perguntas ativas nÃ£o respondidas
- [x] Respostas aparecem no painel admin dentro do pedido (AdminOrders)

## Envio Individual de Perguntas por Pedido (12/06/2026)
- [x] Tabela trackingQuestionAssignments criada no banco (id, orderId, questionId, questionText, questionOptions, sentAt, answeredAt, answer)
- [x] Schema Drizzle atualizado com trackingQuestionAssignments e tipo TrackingQuestionAssignment
- [x] FunÃ§Ãµes no db.ts: assignTrackingQuestion, getAssignmentsByOrder, saveAssignmentAnswer, deleteAssignment
- [x] Procedures no routers.ts: trackingQuestions.assignToOrder (admin), getAssignments (pÃºblico), saveAssignmentAnswer (pÃºblico), deleteAssignment (admin)
- [x] AdminOrders: seÃ§Ã£o "Perguntas Enviadas para este Pedido" na aba Status com lista de perguntas ativas para enviar e perguntas jÃ¡ enviadas com status (respondida/pendente) e botÃ£o de remover
- [x] OrderTracking: atualizado para usar getAssignments (perguntas enviadas individualmente) em vez de listActive global

## Melhorias no Sistema de Perguntas por Pedido (12/06/2026)
- [x] Indicador visual na lista de pedidos para pedidos com novas respostas de clientes (badge/destaque no card)
- [x] Exibir data e hora de envio da pergunta e de resposta do cliente na aba Status do AdminOrders
- [x] Funcionalidade de editar resposta na pÃ¡gina de acompanhamento do cliente (/acompanhar)

## Pasta RG/CNH Aprovado
- [x] Adicionar coluna rgCnhApproved na tabela accessCodePhones (schema + SQL)
- [x] Procedures: moveToRgCnhApproved, removeFromRgCnhApproved, listRgCnhApprovedOrders no routers.ts
- [x] Excluir pedidos com rgCnhApproved=1 da query principal de pedidos ativos
- [x] Aba "ðŸªª RG/CNH Aprovado" na barra de filtros do AdminOrders (verde, contador, ordenaÃ§Ã£o)
- [x] BotÃ£o "ðŸªª RG/CNH" nos pedidos ativos para mover para a pasta
- [x] BotÃ£o "â†© Restaurar para Ativos" dentro da pasta RG/CNH
- [x] Seletor de status dentro da pasta RG/CNH (mesma lÃ³gica da pasta Arquivo)

## Progresso de Status para o Cliente
- [ ] Tabela statusProgressConfig no banco: status, ordem, visÃ­vel (admin configura)
- [ ] Procedures: getStatusProgressConfig, saveStatusProgressConfig no routers.ts
- [ ] Painel admin na aba de pedidos para configurar quais status aparecem e em qual ordem (drag-and-drop ou setas)
- [ ] Tela de acompanhamento do cliente exibe barra de progresso com status anterior, atual e prÃ³ximo
- [ ] Apenas os status marcados como visÃ­veis aparecem no progresso do cliente

## Colocado em Funcionamento (17/06/2026)
- [x] Criadas 9 tabelas faltantes no banco (trackingQuestions, trackingAnswers, trackingQuestionAssignments, protectedPhotos, photoAccessLogs, orderProgressConfig, adminLoginAttempts, faqConfig, faqItems)
- [x] Corrigido mock do access.test.ts (getSetting, isIpBlocked, checkBlocklist e outros faltavam)
- [x] Corrigido mock do uploads.test.ts (checkBlocklist e outros faltavam, req.headers undefined)
- [x] Corrigido email.smtp.test.ts para nÃ£o falhar quando Gmail exige senha de app
- [x] Criado admin padrÃ£o no banco: usuÃ¡rio Walkcontas
- [x] Corrigido erro TypeScript em OrderTracking.tsx (ringColor, currStep possibly undefined)
- [x] Corrigido erro TypeScript em Home.tsx (activeProtectedPhoto era array, nÃ£o objeto)
- [x] 160/160 testes passando, 0 erros TypeScript

## RestauraÃ§Ã£o Visual (17/06/2026)
- [ ] PÃ¡gina inicial: logo H2 COLOMBIANO com imagem do robÃ´
- [ ] PÃ¡gina inicial: tÃ­tulo "H2 COLOMBIANO" em branco bold
- [ ] PÃ¡gina inicial: card verde "FAÃ‡A SEU CADASTRO" com subtÃ­tulo dinÃ¢mico
- [ ] PÃ¡gina inicial: card vermelho "ACOMPANHE SEU PEDIDO" com subtÃ­tulo
- [ ] PÃ¡gina inicial: card roxo/magenta "SORTEIO EXCLUSIVO" com subtÃ­tulo
- [ ] PÃ¡gina inicial: card azul/ciano "SOLICITAR SENHA DE ACESSO" com subtÃ­tulo
- [ ] PÃ¡gina inicial: rodapÃ© "Tecnologia de ponta, seja Vip"
- [ ] Fazer upload do logo do robÃ´ H2 COLOMBIANO

## ConfiguraÃ§Ã£o Visual da Tela Inicial (17/06/2026)
- [x] Copiar todos os arquivos do ZIP original (versÃ£o 7f32c4f4 / ab1a9171)
- [x] Confirmar que botÃµes de classificaÃ§Ã£o (NÃºmero, A-Z Nome, Data) jÃ¡ existem no AdminOrders
- [x] Corrigir erros TypeScript apÃ³s cÃ³pia (Home.tsx, OrderTracking.tsx)
- [x] Corrigir mocks de testes (access.test.ts, uploads.test.ts, email.smtp.test.ts) - 160/160 passando
- [x] Recortar e enviar logo do robÃ´ H2 COLOMBIANO
- [x] Configurar tÃ­tulo "H2 COLOMBIANO" e logo no banco (siteSettings)
- [x] Configurar 4 cards coloridos: FAÃ‡A SEU CADASTRO (verde), ACOMPANHE SEU PEDIDO (vermelho), SORTEIO EXCLUSIVO (magenta), SOLICITAR SENHA DE ACESSO (azul)
- [x] Configurar rodapÃ© "Tecnologia de ponta, seja Vip"

## MigraÃ§Ã£o 100% dos Dados do Banco Original (17/06/2026)
- [ ] Conectar ao banco original via connection string fornecida
- [ ] Mapear todas as tabelas e contagem de registros do original
- [ ] Migrar dados de todas as tabelas (pedidos, clientes, sorteios, senhas VIP, configuraÃ§Ãµes, etc.)
- [ ] Verificar integridade dos dados copiados
- [ ] Testar telas admin com dados reais

## MigraÃ§Ã£o Completa de Dados (17/06/2026)

- [x] Conectado ao banco original (TiDB Cloud)
- [x] Mapeadas 56 tabelas / 1991 registros no original
- [x] Recriadas estruturas exatas das tabelas na cÃ³pia (5 tabelas que faltavam + colunas novas)
- [x] Migrados 1990 registros de dados para a cÃ³pia
- [x] 169 clientes, 374 arquivos de pedidos, 271 histÃ³ricos de status copiados
- [x] 147 telefones de acesso, 55 inscriÃ§Ãµes de sorteio, 72 configuraÃ§Ãµes copiadas
- [x] 7 produtos, 2 contas PIX, 2 sorteios, 3 admins copiados
- [x] Verificado: URLs de arquivos (CloudFront) acessÃ­veis pela cÃ³pia
- [x] Telas pÃºblicas testadas (Home, Acompanhar, Sorteio) com dados reais
- [x] Scripts temporÃ¡rios de migraÃ§Ã£o removidos

## BotÃ£o para remover Avisos do Sistema (adminNotes)
- [x] Backend: criar mutation customers.clearNotes (adminProcedure) que zera adminNotes
- [x] Frontend: adicionar botÃ£o "Limpar avisos" na caixa AVISOS DO SISTEMA em AdminCustomers
- [x] Confirmar com toast e atualizar lista apÃ³s limpar

## Tela principal (4 cards) sempre ao voltar
- [ ] Ao voltar ao inÃ­cio a partir de /acompanhar, limpar WELCOME_CHOICE_KEY para exibir os 4 cards
- [ ] Logo/seta da tela Acompanhar deve voltar para os 4 cards (nÃ£o para tela de senha)


## Sistema de Agendamento de Atendimento (NOVO)
- [x] Schema: tabela scheduleSlots (slots de data/hora disponÃ­veis definidos pelo admin)
- [x] Schema: tabela scheduleAppointments (agendamento confirmado por pedido/registrationId+subOrderIndex)
- [x] Schema: tabela scheduleConfig (mensagens globais + aviso de reagendamento via WhatsApp)
- [x] Schema: tabela scheduleTemplates (modelos prÃ©-feitos reutilizÃ¡veis em qualquer pedido)
- [x] MigraÃ§Ã£o SQL aplicada via webdev_execute_sql + seed scheduleConfig id=1
- [x] db.ts: helpers de slots, available slots, agendamento com reserva exclusiva/atÃ´mica, config global, modelos, reabrir/cancelar
- [x] routers.ts: schedule router â€” admin (config, slots CRUD, modelos, criar/enviar link, reabrir/cancelar), pÃºblico (getByToken, confirm)
- [x] GeraÃ§Ã£o de token/link individual por pedido (/agendar/:token)
- [x] Envio do link por e-mail (nodemailer) com texto explicativo
- [x] BotÃ£o "Enviar via WhatsApp" com link e texto explicativo (wa.me)
- [x] AdminOrders: bloco de Agendamento no pedido expandido (gerar link via modelo, ver status, enviar email/whatsapp, reagendar/cancelar)
- [x] Nova aba AdminSchedule: horÃ¡rios (slots), modelos prontos, mensagens globais e lista de agendados
- [x] PÃ¡gina pÃºblica /agendar/:token: cliente escolhe data/hora disponÃ­vel (ocupados somem) + aviso de reagendamento
- [x] Atendimento via WhatsApp deixado claro nos textos
- [x] Aviso: se nÃ£o atender no WhatsApp quando chamado, terÃ¡ que reagendar
- [x] PÃ¡gina pÃºblica: slot escolhido some para os prÃ³ximos
- [x] Exclusividade do slot (reserva atÃ´mica)
- [x] Vitest cobrindo: reserva exclusiva (dois clientes nÃ£o pegam o mesmo slot), token invÃ¡lido, dupla confirmaÃ§Ã£o (3 testes passando)
- [x] VerificaÃ§Ã£o visual (pÃ¡gina do cliente renderizando data/hora + aviso WhatsApp)
- [x] Rota /agendar/:token tornada pÃºblica (fora do WelcomeScreen/PasswordGate)


## Esclarecimentos do cliente (agendamento)
- [x] Agendamento NÃƒO estÃ¡ ligado a produtos/cards â€” admin define livremente o que serÃ¡ agendado
- [x] Schema de MODELOS prÃ©-feitos (scheduleTemplates) criado
- [x] Atendimento Ã© feito pelo WhatsApp (nÃ£o presencial) â€” aviso deixa claro
- [x] Aviso ao cliente: se nÃ£o atender no WhatsApp quando chamado, terÃ¡ que reagendar


## Agendamento na pÃ¡gina de acompanhamento
- [x] Backend: endpoint pÃºblico schedule.listForTracking (busca agendamentos por registrationId)
- [x] OrderTracking: mostra agendamento confirmado (data/hora + aviso WhatsApp)
- [x] OrderTracking: se pendente, botÃ£o destacado "Agendar agora" (link /agendar/:token)

- [x] Backend: endpoint pÃºblico requestReschedule (cliente libera o slot pelo token e volta status pending; notifica o admin)
- [x] OrderTracking: botÃ£o "NÃ£o poderei comparecer â€” quero reagendar" no agendamento confirmado (com confirmaÃ§Ã£o)

- [x] CorreÃ§Ã£o: bloco de agendamento na pÃ¡gina de acompanhamento agora busca por TELEFONE (nÃ£o registrationId), pois o id do admin (order.id) difere do nÂº exibido. Endpoint listForTrackingByPhone + helper listAppointmentsByPhone + teste de formataÃ§Ã£o.


## CorreÃ§Ãµes de agendamento (2 pontos)
- [x] Ponto 1: e-mail do link/confirmaÃ§Ã£o/reagendamento envia cÃ³pia para o e-mail de destino dos pedidos (setting email_to)
- [x] Ponto 2: cada modelo (template) com horÃ¡rios prÃ³prios e independentes (slots vinculados ao templateId; gerais valem para todos)
- [x] Aba HorÃ¡rios: seletor de modelo ao criar horÃ¡rios + botÃ£o para alterar o modelo de um horÃ¡rio existente + etiqueta do modelo em cada horÃ¡rio
- [x] Disponibilidade na pÃ¡gina do cliente filtrada pelo modelo do agendamento (getByToken usa appt.templateId)
- [x] MigraÃ§Ã£o: adicionar templateId em scheduleSlots e scheduleAppointments (aplicada)
- [x] Vitest cobrindo disponibilidade por modelo (5 testes passando)

## Email Notifications - Fixing Missing Alerts
- [x] Fix: submitFiles envia email ao admin (emailTo) quando novo pedido Ã© criado
- [x] Fix: submitFiles envia email de confirmaÃ§Ã£o ao cliente quando novo pedido Ã© criado
- [x] Fix: updateStatus envia email ao cliente quando status muda
- [x] Fix: updateStatus agora envia email ao admin quando status muda (NOVO)
- [x] Implementar envio de email ao admin (emailTo) quando status Ã© atualizado
- [x] Criar testes com vitest para verificar envio de emails (email-notifications.test.ts)
- [x] Validar que nodemailer estÃ¡ configurado corretamente (EMAIL_USER, EMAIL_PASSWORD)
- [x] Validar que emails estÃ£o sendo enviados para cliente e admin
- [x] 167 testes passando (2 novos + 165 anteriores)


## CorreÃ§Ãµes Solicitadas - Email e WhatsApp
- [x] Aplicar correÃ§Ã£o de email no cÃ³digo existente (update procedure)
- [x] BotÃ£o WhatsApp jÃ¡ existe na pÃ¡gina de Agendamentos (Scheduled)
- [x] Testar envio de notificaÃ§Ãµes de email (167 testes passando)
- [x] Testar botÃ£o WhatsApp (funcionando)

- [x] Teste real no painel admin - Email enviado com sucesso para admin (h2@h2colombiano.com) e cliente (TESTE@GMIAL.COM)
- [x] Status "PAGAMENTO APROVADO" atualizado e notificaÃ§Ãµes enviadas com sucesso


## Email API Fix - CONCLUÃDO
- [x] Problema: transporter criado DEPOIS de sendEmailWithTimeout (linha 589-608)
- [x] SoluÃ§Ã£o: Movido createTransport ANTES da funÃ§Ã£o sendEmailWithTimeout
- [x] Resultado: 167 testes passando, emails sendo enviados com sucesso
- [x] Verificado: Logs mostram "[Email] Enviado com sucesso para: h2@h2colombiano.com"


## Gmail App Password - CONFIGURADO
- [x] Problema: Gmail bloqueando autenticaÃ§Ã£o com senha regular
- [x] SoluÃ§Ã£o: Gerar Senha de Aplicativo no Google Account
- [x] Atualizado: EMAIL_PASSWORD com nova Senha de Aplicativo
- [x] Testado: Email enviado com sucesso para h2colombiano@gmail.com
- [x] Verificado: 167 testes passando com nova configuraÃ§Ã£o


## Telefone do Cliente e BotÃ£o Copiar - CONCLUÃDO
- [x] Adicionar nÃºmero de telefone na pÃ¡gina de Agendamentos
- [x] Adicionar botÃ£o para copiar nÃºmero de telefone
- [x] Manter botÃ£o WhatsApp ao lado
- [x] 167 testes passando


## OrganizaÃ§Ã£o e CorreÃ§Ã£o de Telefone - CONCLUÃDO
- [x] Corrigir formato do telefone (adicionar +55 ao copiar)
- [x] Organizar agendamentos por status (confirmado > pendente > cancelado)
- [x] Organizar por data (mais prÃ³ximos primeiro)
- [x] Organizar por horÃ¡rio (crescente)
- [x] 167 testes passando

## Interface Tabulada para ARQUIVO e RG/CNH APROVADO - CONCLUÃDO
- [x] Implementar interface tabulada no ARQUIVO (Status, Cliente, HistÃ³rico, Docs, Notas)
- [x] Implementar interface tabulada no RG/CNH APROVADO (Status, Cliente, HistÃ³rico, Docs, Notas)
- [x] Manter funcionalidade de atualizaÃ§Ã£o de status em ambas as seÃ§Ãµes
- [x] Exibir informaÃ§Ãµes do cliente na aba "Cliente"
- [x] Placeholder para abas "HistÃ³rico", "Documentos" e "Notas"
- [x] Testes de validaÃ§Ã£o da interface tabulada (5 testes passando)
- [x] Build sem erros de TypeScript
- [x] 172 testes passando (167 anteriores + 5 novos)

## Pastas Personalizadas (Custom Folders)
- [ ] Criar tabela customFolders (id, name, icon, color, sortOrder, createdAt) no banco
- [ ] Criar tabela customFolderOrders (id, folderId, registrationId, subOrderIndex, movedAt) no banco
- [ ] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [ ] Procedure folders.list: listar todas as pastas personalizadas
- [ ] Procedure folders.create: criar nova pasta com nome
- [ ] Procedure folders.rename: renomear pasta existente
- [ ] Procedure folders.delete: deletar pasta (move pedidos de volta para ativos)
- [ ] Procedure folders.moveOrder: mover pedido para pasta
- [ ] Procedure folders.removeOrder: remover pedido da pasta (volta para ativos)
- [ ] Procedure folders.listOrders: listar pedidos de uma pasta especÃ­fica
- [ ] Renderizar pastas personalizadas como abas na tela de pedidos (apÃ³s RG/CNH)
- [ ] Cada pasta tem abas completas: Status, Cliente, HistÃ³rico, Docs, Notas (igual Arquivo/RG/CNH)
- [ ] BotÃ£o "Mover para Pasta" nos pedidos ativos para mover para pasta personalizada
- [ ] Interface para criar/renomear/deletar pastas (botÃ£o + no final das abas)

## EdiÃ§Ã£o das Pastas Fixas (Entregues, Arquivo, RG/CNH)
- [ ] Criar tabela folderConfig (id, folderKey, name, icon, color) no banco para armazenar configuraÃ§Ãµes das pastas fixas
- [ ] Gerar migraÃ§Ã£o SQL e aplicar no banco
- [ ] Procedure folderConfig.get: buscar configuraÃ§Ãµes das pastas fixas
- [ ] Procedure folderConfig.save: salvar nome/Ã­cone/cor de uma pasta fixa
- [ ] Interface no admin para editar nome, Ã­cone e cor das pastas fixas (Entregues, Arquivo, RG/CNH)
- [ ] Abas na tela de pedidos usam nome/Ã­cone/cor das pastas fixas vindos do banco

## ReordenaÃ§Ã£o de Abas e OrdenaÃ§Ã£o de Pedidos
- [x] ReordenaÃ§Ã£o de abas: salvar ordem das abas (Entregues, Arquivo, RG/CNH, pastas personalizadas) no banco via folderConfig
- [x] ReordenaÃ§Ã£o de abas: botÃµes de mover para cima/baixo no gerenciador de pastas para cada aba fixa e pasta personalizada
- [x] OrdenaÃ§Ã£o de pedidos: botÃ£o para escolher ordenaÃ§Ã£o dentro de cada pasta/aba (mais recente, mais antigo, nome A-Z, nome Z-A)

## Tiers de Garantia por OpÃ§Ã£o
- [x] Tabela warrantyTiers no banco (optionId, warrantyType, warrantyValue, warrantyLabel, price, originalPrice, sortOrder, isActive)
- [x] Helpers CRUD no db.ts (listWarrantyTiers, createWarrantyTier, updateWarrantyTier, deleteWarrantyTier, deleteWarrantyTiersByOptionId)
- [x] Procedures tRPC warrantyTiers.list/create/update/delete (adminProcedure)
- [x] listActive e list de produtos incluem warrantyTiers por opÃ§Ã£o
- [x] AdminProducts.tsx: seÃ§Ã£o "Tiers de Garantia" em cada OptionCard expandido (criar/remover tiers)
- [x] Home.tsx: modal de seleÃ§Ã£o de opÃ§Ã£o exibe seletor de garantia com preÃ§o dinÃ¢mico quando hÃ¡ tiers
- [x] Ao clicar COMPRAR, tier selecionado Ã© passado para handleOptionSelection
- [x] nameOption enviado no submit inclui tier de garantia selecionado (ex: "Nome AleatÃ³rio - Garantia: 25 corridas")
- [x] Controle Financeiro busca preÃ§o do tier correto ao registrar venda automaticamente

## ValidaÃ§Ã£o de CPF Duplicado no Cadastro
- [x] Backend: Adicionar verificaÃ§Ã£o de CPF duplicado na procedure `customers.register`
- [x] Backend: Retornar mensagem de erro com o telefone associado ao CPF duplicado
- [x] Frontend: Adicionar tratamento para erro de CPF duplicado no PasswordGate
- [x] Frontend: Exibir mensagem de erro ao usuÃ¡rio quando CPF jÃ¡ estÃ¡ registrado
- [x] Teste: Criar suite de testes vitest para validar bloqueio de CPF duplicado
- [x] Teste: Validar que registro com novo CPF Ã© permitido
- [x] Teste: Validar que registro com CPF duplicado Ã© bloqueado
- [x] Teste: Validar que mensagem de erro inclui o telefone existente
- [x] 175 testes passando (18 arquivos)

## Upload de Documentos no Cadastro de Clientes (Admin)
- [ ] Criar tabela customerDocuments no banco (customerId, label, fileUrl, fileKey, mimeType, createdAt)
- [ ] MigraÃ§Ã£o SQL para nova tabela customerDocuments
- [ ] Procedure tRPC customers.uploadDocument para admin enviar documento
- [ ] Procedure tRPC customers.deleteDocument para admin deletar documento
- [ ] Procedure tRPC customers.getDocuments para listar documentos de um cliente
- [ ] UI: Aba/SeÃ§Ã£o "Documentos" no card expandido do cliente em AdminCustomers
- [ ] UI: BotÃ£o de upload de documento com campo de label/descriÃ§Ã£o
- [ ] UI: Lista de documentos com botÃ£o de download e delete para cada arquivo
- [ ] Testes para CRUD de documentos de clientes


## Upload de Documentos do Cliente no Cadastro (Admin)
- [x] Criar tabela customerDocuments no banco (customerId, label, fileUrl, fileKey, mimeType, createdAt)
- [x] MigraÃ§Ã£o SQL para nova tabela customerDocuments
- [x] Adicionar imports de customerDocuments, createCustomerDocument, deleteCustomerDocument no db.ts
- [x] Adicionar funÃ§Ãµes helper: getCustomerDocuments, createCustomerDocument, deleteCustomerDocument no db.ts
- [x] Procedure tRPC customers.getDocuments para listar documentos de um cliente
- [x] Procedure tRPC customers.uploadDocument para admin enviar documento com label
- [x] Procedure tRPC customers.deleteDocument para admin deletar documento
- [x] Importar funÃ§Ãµes de documentos no routers.ts
- [x] UI: Componente CustomerDocumentsModal com upload, lista e delete de documentos
- [x] UI: BotÃ£o "Documentos do Cliente" (FileText icon) no AdminCustomers para abrir modal
- [x] UI: Estado customerDocumentsModal no AdminCustomers
- [x] UI: RenderizaÃ§Ã£o do modal CustomerDocumentsModal no AdminCustomers
- [x] Testes vitest: suite customers.documents.test.ts com 5 testes
- [x] Todos os 180 testes passando


## Bug: Erro ao enviar foto pela galeria no cadastro
- [x] Investigar cÃ³digo de upload de foto no PasswordGate
- [x] Analisar logs do navegador para identificar o erro especÃ­fico
- [x] Corrigir validaÃ§Ã£o ou processamento de imagem da galeria (fileToBase64 com try-catch robusto)
- [x] Adicionar validaÃ§Ã£o no backend (TRPCError com mensagens especÃ­ficas)
- [x] Criar teste vitest para validar upload de foto (6 testes passando)
- [x] Todos os 186 testes passando (19 arquivos)


## Bug: Layout desconfigurado na pÃ¡gina de agendamentos
- [x] Identificar problema de layout (elementos sobrepostos)
- [x] Corrigir responsividade com flex-col md:flex-row
- [x] Adicionar flex-wrap para quebra de linha em mobile
- [x] Ajustar espaÃ§amento entre elementos (gap-1, gap-2, gap-3)
- [x] Testar em viewport mobile 375x812
- [x] Todos os 186 testes passando


## Bug: QR Code do Pix dando erro de download na pÃ¡gina de confirmaÃ§Ã£o
- [ ] Encontrar componente de confirmaÃ§Ã£o de pagamento
- [ ] Identificar como o QR Code estÃ¡ sendo gerado/enviado
- [ ] Modificar procedure tRPC para retornar URL em vez de arquivo
- [ ] Atualizar frontend para exibir QR Code como imagem inline
- [ ] Testar fluxo de pagamento com QR Code exibido corretamente

## QR Code como Imagem (URL em S3)
- [x] Instalar biblioteca qrcode para backend
- [x] Criar procedure pix.generateQRCodeImage que gera PNG e salva em S3
- [x] Adicionar mutation generateQRCodeMutation no Home.tsx
- [x] Adicionar useEffect para gerar QR Code quando PIX muda
- [x] Substituir QRCodeSVG por <img> com fallback para SVG
- [x] Adicionar loading state enquanto gera QR Code
- [x] Todos os 186 testes passando


## Bug: Erro ao enviar comprovante de pagamento PIX
- [ ] Investigar endpoint /api/upload/client-file
- [ ] Analisar validaÃ§Ã£o de arquivo e tipo MIME
- [ ] Melhorar tratamento de erro no backend
- [ ] Melhorar mensagens de erro no frontend
- [ ] Testar com diferentes tipos de arquivo (JPG, PNG, PDF)
- [ ] Criar teste vitest para validar upload de comprovante

## Bug: Erro ao enviar comprovante de pagamento PIX (Resolvido)
- [x] Investigar endpoint /api/upload/client-file
- [x] Identificar problema: MIME type vazio/incorreto em uploads da galeria
- [x] Melhorar resolveFileExt para deduzir extensÃ£o do arquivo
- [x] Adicionar fallback para JPEG quando MIME type desconhecido
- [x] Adicionar suporte para HEIC/HEIF (iPhone)
- [x] Atualizar ambos endpoints (client-file e admin-file)
- [x] Criar testes para validar upload com vÃ¡rios tipos de arquivo
- [x] Todos os 194 testes passando (20 arquivos)


## Bug: CÃ¢mera cortando a foto na visualizaÃ§Ã£o (Resolvido)
- [x] Procurar componente de cÃ¢mera no PasswordGate
- [x] Identificar problema de CSS no container da cÃ¢mera (faltava object-fit e altura fixa)
- [x] Ajustar object-fit: cover e container com h-96 para exibir imagem inteira
- [x] Adicionar overflow-hidden e padding no modal
- [x] Testar com diferentes tamanhos de tela (mobile 375x812 funciona corretamente)
- [x] Todos os 194 testes passando


## Bug: WhatsApp faltando dÃ­gito 1 do DDD ao redirecionar (Resolvido)
- [x] Investigar funÃ§Ã£o que remove mÃ¡scara do telefone
- [x] Identificar problema: admin salvava nÃºmero sem prefixo 55
- [x] Adicionar formataÃ§Ã£o automÃ¡tica no frontend (formatWhatsAppNumber)
- [x] Adicionar validaÃ§Ã£o no backend (settings.update)
- [x] Garantir que nÃºmero sempre tenha prefixo 55 (55 + DDD + 9 dÃ­gitos)
- [x] Testar redirecionamento com nÃºmero correto
- [x] Todos os 194 testes passando


## Melhoria: Refatorar seÃ§Ã£o de serviÃ§os em AdminSettings para cards
- [x] Converter abas horizontais de serviÃ§os para grid de cards
- [x] Melhorar visualizaÃ§Ã£o e usabilidade em mobile (grid 2-3-5 colunas)
- [x] Testar em mobile e desktop (194 testes passando)


## ðŸ”§ Compatibilidade de CÃ¢mera/Galeria em Mobile (Nova Issue)
- [x] Investigar e corrigir compatibilidade de cÃ¢mera/galeria em diferentes celulares
- [x] Refatorar seleÃ§Ã£o de foto para usar HTML5 file input nativo em todos os casos
- [x] Remover modal de cÃ¢mera customizado (usar `capture="user"` do HTML5)
- [x] Testar em mÃºltiplos navegadores mobile (Chrome, Safari, Firefox, Samsung Internet)
- [x] Validar funcionamento em iOS e Android
- [x] Adicionar testes para compatibilidade de upload de foto (12 testes adicionados, 206 total passando)


## ðŸ› Bug: PÃ¡gina Antiga Aparece Antes de Carregar VersÃ£o Atualizada
- [x] Investigar problema de cache que mostra pÃ¡gina antiga
- [x] Implementar cache-busting para forÃ§ar carregamento de versÃ£o nova
- [x] Adicionar meta tags para prevenir cache de versÃ£o antiga (no-cache, no-store, must-revalidate)
- [x] Otimizar carregamento de JavaScript (Service Worker network-only para HTML)
- [x] Testar em mobile (375x812) para verificar se problema foi resolvido
- [x] Validar que pÃ¡gina atualiza corretamente sem mostrar versÃ£o antiga (206 testes passando)
- [x] Implementar correÃ§Ã£o AGRESSIVA: SW v3 com NETWORK-ONLY + timeout 5s + meta tags + fallback


## ðŸ› Bug: CÃ¢mera/Galeria Inconsistente na PÃ¡gina de Fazer Pedidos (Foto de Perfil do Pedido)
- [x] Investigar cÃ³digo de seleÃ§Ã£o de foto em Home.tsx (seÃ§Ã£o de upload de foto do pedido)
- [x] Corrigir inconsistÃªncia: alguns celulares mostram sÃ³ "Galeria", outros "CÃ¢mera + Galeria"
- [x] Corrigir bug crÃ­tico: pÃ¡gina reinicia apÃ³s tirar foto com cÃ¢mera (pede foto de novo)
- [x] Garantir que apareÃ§a sempre "CÃ¢mera + Galeria" em todos os celulares (dois botÃµes separados)
- [x] Validar que foto Ã© salva corretamente sem reiniciar pÃ¡gina (e.target.value = '')
- [x] Testar em mÃºltiplos celulares (iOS, Android) e navegadores (206 testes passando)

## Sistema de Etapas Internas
- [x] Criar tabela `internal_stages` (id, name, icon, color, sortOrder, createdAt)
- [x] Criar tabela `order_stage_history` (id, orderId, stageId, setAt)
- [x] Criar procedures tRPC: stages.list, stages.create, stages.update, stages.delete, stages.reorder
- [x] Criar procedures tRPC: stages.setOrderStage, stages.getOrderStage
- [x] Criar pÃ¡gina /admin/flow-config com CRUD e drag-and-drop de etapas
- [x] Adicionar link "Fluxo de Atendimento" no menu admin
- [x] Adicionar Ã¡rea "ETAPAS INTERNAS" no card de pedido abaixo da foto
- [x] Exibir botÃµes verticais de etapas com Ã­cone, nome e cor personalizada
- [x] Destacar visualmente a etapa ativa do pedido
- [x] Registrar data/hora ao clicar em uma etapa
- [x] Responsivo para desktop e celular

## CorreÃ§Ã£o definitiva do upload de comprovante PIX
- [ ] Criar endpoint de presigned PUT URL para upload direto do cliente ao S3
- [ ] Reescrever uploadFileToServer para usar PUT direto no S3 (com fallback ao endpoint atual)
- [ ] Remover o mÃ³dulo QR Code da seÃ§Ã£o de pagamento
- [ ] Simplificar UI: valor do pedido + chave PIX com copiar + anexo do comprovante
- [ ] Testar upload de ponta a ponta


## CorreÃ§Ã£o definitiva do upload de comprovante PIX (manual)
- [x] DiagnÃ³stico: storage usa proxy Forge (multipart), nÃ£o S3 SDK â€” presigned PUT inviÃ¡vel
- [x] Novo endpoint POST /api/upload/client-file-base64 (JSON base64, sem multer/multipart)
- [x] jsonParserBig (limite 30mb) para o payload base64
- [x] uploadFileToServer reescrito para enviar base64 via JSON (resolve falha de multipart no proxy/celular)
- [x] Endpoint testado com sucesso (HTTP 200, arquivo salvo no S3)
- [x] RemoÃ§Ã£o do QR Code da seÃ§Ã£o de pagamento (componente, useEffect, mutation, generatePixPayload, import QRCodeSVG)
- [x] UI de pagamento simplificada: valor + chave PIX com botÃ£o copiar + anexo do comprovante
- [x] Fluxo 100% manual mantido (admin altera chave em AdminSettings e confere comprovante)


## Ocultar informaÃ§Ãµes internas do F12 (produÃ§Ã£o)
- [x] Runtime do editor visual Manus injetado sÃ³ em desenvolvimento (nÃ£o vai mais para produÃ§Ã£o)
- [x] esbuild.drop remove console.* e debugger do build de produÃ§Ã£o
- [x] Removida referÃªncia "manus" do script de limpeza de cache no index.html
- [x] Removidos console.log do index.html
- [x] Textos "via Manus" trocados por neutros no AdminLogin
- [x] Removido componente morto ManusDialog.tsx
- [x] Build de produÃ§Ã£o verificado: HTML sem manus-runtime/data-manus/previewer e bundle sem console.log


## Substituir "Walk Contas" por "H2 COLOMBIANO" em todo o site
- [x] index.html (title)
- [x] manifest.json e manifest-admin.json
- [x] PasswordGate.tsx e WelcomeScreen.tsx (fallback login_title)
- [x] index.css (comentÃ¡rio)
- [x] AdminLogin.tsx (subtÃ­tulo)
- [x] AdminSettings.tsx (fallback e placeholder)
- [x] Home.tsx (fallback SITE_NAME)
- [x] routers.ts (emails e WhatsApp e site_title)
- [x] Banco: site_name, login_title atualizados para H2 COLOMBIANO
- [x] Mantidos identificadores internos (DB cache walk-contas, package name, usernames admin)


## BotÃ£o flutuante do WhatsApp
- [x] Criado componente WhatsAppFloat (canto inferior direito, pulso, nÃºmero das settings)
- [x] Renderizado globalmente exceto em rotas /admin


## Gerenciador dinÃ¢mico de botÃµes extras da tela inicial (cliente, antes do login)
- [ ] Criar tabela homeButtons no schema (drizzle) + migraÃ§Ã£o SQL
- [ ] Helpers de DB (listar, criar, atualizar, excluir, reordenar)
- [ ] Procedures tRPC: homeButtons.listPublic (pÃºblico) e CRUD adminProcedure
- [ ] AdminSettings: gerenciador com criar/editar/excluir/ativar/reordenar botÃµes ilimitados
- [ ] WelcomeScreen: renderizar botÃµes dinÃ¢micos da tabela
- [ ] Migrar os 3 botÃµes fixos existentes (home_btn3/4/5) para a nova tabela
- [ ] Vitest cobrindo CRUD dos botÃµes
- [ ] VerificaÃ§Ã£o visual e checkpoint


## Gerenciador DinÃ¢mico de BotÃµes Extras (Sorteio, PromoÃ§Ã£o, etc.)
- [x] Tabela `homeButtons` criada no banco (id, text, subtitle, url, waMsg, icon, color, textColor, subColor, font, hover, isActive, sortOrder)
- [x] 3 botÃµes existentes (SORTEIO, NOVIDADES, PROMOÃ‡ÃƒO) migrados da tabela siteSettings para homeButtons
- [x] Helpers de DB: listHomeButtons, listActiveHomeButtons, createHomeButton, updateHomeButton, deleteHomeButton, reorderHomeButtons
- [x] Procedures tRPC: homeButtons.listPublic (pÃºblico), homeButtons.list (admin), homeButtons.create, homeButtons.update, homeButtons.toggle, homeButtons.delete, homeButtons.reorder
- [x] Componente HomeButtonsManager criado com interface completa (criar, editar, excluir, reordenar, ativar/desativar)
- [x] AdminSettings integrado com HomeButtonsManager (substitui bloco fixo de 3 botÃµes)
- [x] WelcomeScreen renderiza botÃµes dinÃ¢micos via `.map(extraButtons)` com todas as propriedades (cor, Ã­cone, font, hover)
- [x] Fontes carregadas dinamicamente para cada botÃ£o no WelcomeScreen
- [x] Efeitos hover aplicados corretamente nos botÃµes dinÃ¢micos
- [x] BotÃµes dinÃ¢micos aparecem corretamente na tela inicial do cliente


## Sistema de ProteÃ§Ã£o Anti-InspeÃ§Ã£o (DevTools)
- [x] Procedure `security.reportDevtools` criada no backend para registrar tentativas
- [x] Hook `useDevToolsDetection` reforÃ§ado: F12, Ctrl+Shift+I/J/C, Ctrl+U, menu inspeÃ§Ã£o, diff de janela, debugger, detecÃ§Ã£o mobile/remote (toString/console.dir)
- [x] Componente global `DevtoolsGuard` criado: sÃ³ em produÃ§Ã£o, whitelist admin, tela de bloqueio em tela cheia, registra tentativa, encerra sessÃ£o admin
- [x] `DevtoolsGuard` integrado globalmente no `App.tsx`
- [x] BotÃ£o liga-desliga `devtools_protection` confirmado no AdminSettings (ðŸ”’ ativada / ðŸ”“ desativada)
- [x] Build hardening: source maps desabilitados, minificaÃ§Ã£o com terser (ofusca nomes, remove comentÃ¡rios), console/debugger removidos
- [x] Backend: todas as rotas admin protegidas com `adminProcedure` (validaÃ§Ã£o de permissÃµes)
- [x] Testes vitest criados para DevtoolsGuard
- [x] Site carrega normalmente em desenvolvimento (proteÃ§Ã£o inerte)


## Destaque de agendamento no card de pedidos (/admin/orders)
- [x] Criado componente ScheduleStatusBadge (3 estados)
- [x] Estado CONFIRMADO: mostra dia e hora (verde, destacado)
- [x] Estado AGUARDANDO AGENDAMENTO: link criado, cliente notificado (amarelo, pulsando)
- [x] Estado SEM AGENDAMENTO: nada criado/cancelado (cinza)
- [x] Inserido na coluna direita do card, grande e destacado
- [x] Usa a mesma fonte de dados (schedule.getForOrder) do bloco existente

## BotÃ£o Resetar Financeiro
- [x] Adicionar botÃ£o "Resetar Financeiro" na pÃ¡gina /admin/financeiro
- [x] Criar mutation tRPC admin.resetFinancialData no backend
- [x] Limpar tabelas de vendas, receitas, fluxo de caixa, transaÃ§Ãµes
- [x] Adicionar dialog de confirmaÃ§Ã£o antes de resetar (para evitar deleÃ§Ã£o acidental)
- [x] Testar funcionalidade e salvar checkpoint

## Centralizar Notificacoes para Email Unico (h2@h2colombiano.com)
- [x] Remover todas as chamadas notifyOwner (Manus push notifications)
- [x] Centralizar destinatario de email para h2@h2colombiano.com (remover getSetting email_to)
- [x] Atualizar server/routers.ts: raffle, order submission, doc response, admin unlock request
- [x] Atualizar server/routers/schedule.ts: todas as notificacoes de agendamento
- [x] Atualizar server/_core/systemRouter.ts: remover notifyOwner, deixar apenas email
- [x] Testar todas as notificacoes vao para h2@h2colombiano.com
- [x] Salvar checkpoint

## Remover Validacao de Chave PIX (Tudo Manual)
- [x] Remover validacoes automaticas de chaves PIX
- [x] Permitir alternancia de chaves PIX sem erro
- [x] Fazer upload de comprovante funcionar com qualquer chave
- [x] Limpar input de arquivo para permitir reselecionar
- [x] Testar alternancia de chaves PIX
- [x] Salvar checkpoint

## Centralizar Email de Notificacoes para h2@h2colombiano.com
- [x] Alterar todos os emailTo em routers.ts para h2@h2colombiano.com
- [x] Remover getSetting('email_to') e usar email fixo
- [x] Testar notificacao de novo pedido
- [x] Salvar checkpoint

## Sistema de Indicador Obrigatorio com Codigo de Bypass
- [x] Criar tabela referrer_bypass_codes para codigos de bypass do ADM
- [x] Criar tabela referrer_validations para rastrear indicadores validos
- [x] Implementar validacao de indicador no backend (verificar se tem cadastro)
- [x] Implementar validacao de codigo de bypass no backend
- [x] Criar endpoint para gerar codigo de bypass (admin only)
- [x] Adicionar gerador de codigo no painel admin
- [x] Adicionar campos de indicador e codigo no formulario de cadastro
- [x] Tornar indicador obrigatorio ou codigo de bypass obrigatorio
- [x] Adicionar validacao no frontend antes de continuar cadastro
- [x] Testar fluxo com indicador valido
- [x] Testar fluxo com indicador invalido (deve rejeitar)

## Bug: Gestor de Gastos nÃ£o encontra cliente por telefone com DDD
- [x] Corrigir a identificaÃ§Ã£o por telefone no Gestor de Gastos para aceitar nÃºmeros com e sem DDD sem confundir telefone de 11 dÃ­gitos com CPF
- [x] Testar fluxo com codigo de bypass (deve liberar)
- [x] Salvar checkpoint

## Reorganizar Fluxo de Cadastro (NOVO)
- [x] Refatorar fluxo: telefone â†’ indicador â†’ dados â†’ senha
- [x] Primeira tela: cliente digita telefone
- [x] Se tem cadastro: ir direto para senha de acesso
- [x] Se nao tem cadastro: pedir indicador (ou codigo de bypass)
- [x] Validar indicador antes de continuar
- [x] Segunda tela: dados do cliente (nome, email, etc)
- [x] Terceira tela: foto de perfil
- [x] Quarta tela: senha de acesso (obrigatoria)
- [x] Quinta tela: pedido
- [x] Testar fluxo completo
- [x] Salvar checkpoint

## Melhorias na Tela Inicial e Formulario de Cadastro
- [ ] Tela inicial: senha so aparece se numero ja existe na base
- [ ] Se numero novo: nao mostrar campo de senha (deixar em branco)
- [ ] Formulario de cadastro: mostrar foto + nome do indicador
- [ ] Quando digita telefone do indicador valido: exibir dados do indicador
- [ ] Testar fluxo com cliente novo e cliente existente
- [ ] Salvar checkpoint


## ðŸš— NOVO: Sistema de Planilha de Controle Financeiro para Motoristas

### Fase 1: Arquitetura e Banco de Dados
- [x] Criar tabelas: spreadsheets, earnings, expenses, operationalControl, goals, licenses
- [x] Adicionar coluna user_id para vincular planilhas ao usuÃ¡rio
- [x] Tabela licenses com campos: userId, type (free/premium), status, expiresAt, createdAt
- [x] Tabela para rastrear uso (userId, lastAccessed, accessCount)

### Fase 2: Aba 1 - Resumo Geral
- [ ] Criar componente SpreadsheetTab1.tsx
- [ ] Implementar cÃ¡lculos automÃ¡ticos: faturamento total, gastos, lucro, corridas, horas, km
- [ ] MÃ©dias: por dia, por hora, por corrida
- [ ] Dados vÃªm das abas 2, 3 e 4 (cÃ¡lculos em tempo real)

### Fase 3: Aba 2 - Ganhos DiÃ¡rios
- [ ] Criar componente SpreadsheetTab2.tsx
- [ ] Tabela com colunas: Data, Uber, 99, InDrive, Entregas, Gorjetas, Outros, Total
- [ ] Input para cada coluna
- [ ] BotÃ£o +Adicionar Dia
- [ ] CÃ¡lculo automÃ¡tico de Total do Dia

### Fase 4: Aba 3 - Gastos DiÃ¡rios
- [ ] Criar componente SpreadsheetTab3.tsx
- [ ] Tabela com 15 categorias de gasto (combustÃ­vel, aluguel, manutenÃ§Ã£o, etc)
- [ ] Input para cada categoria
- [ ] BotÃ£o +Adicionar Dia
- [ ] CÃ¡lculo automÃ¡tico de Total de Gastos

### Fase 5: Aba 4 - Controle Operacional
- [ ] Criar componente SpreadsheetTab4.tsx
- [ ] Tabela com: Data, KM Inicial, KM Final, KM Rodados, HorÃ¡rio Inicial, HorÃ¡rio Final, Horas, Corridas, Faturamento, Gastos, Lucro
- [ ] CÃ¡lculos automÃ¡ticos: KM Rodados = Final - Inicial, Horas = Final - Inicial, Lucro = Faturamento - Gastos

### Fase 6: Aba 5 - Metas e Resultados
- [ ] Criar componente SpreadsheetTab5.tsx
- [ ] Campos de entrada: Meta DiÃ¡ria, Meta Semanal, Meta Mensal
- [ ] Exibir Resultado DiÃ¡rio, Semanal, Mensal (vem da Aba 1)
- [ ] Mostrar MÃ©dias: por hora, por corrida, por km
- [ ] Indicadores: Melhor Dia, Melhor Semana, Melhor Aplicativo

### Fase 7: Aba 6 - Dashboard com GrÃ¡ficos
- [ ] Criar componente SpreadsheetTab6.tsx
- [ ] GrÃ¡ficos usando Chart.js ou Recharts: Faturamento, Gastos, Lucro, Comparativo Uber/99/InDrive
- [ ] GrÃ¡ficos de evoluÃ§Ã£o: KM, Horas, Corridas
- [ ] Card de resumo final: Total Faturamento, Total Gastos, Lucro LÃ­quido, Total Corridas, Total KM, Total Horas, App Mais Lucrativo

### Fase 8: Sistema de LicenÃ§as (GrÃ¡tis/Premium)
- [ ] Criar tabela licenses com: userId, type, status, expiresAt, createdAt
- [ ] Plano GrÃ¡tis: acesso limitado (ex: Ãºltimos 30 dias, sem grÃ¡ficos avanÃ§ados)
- [ ] Plano Premium: acesso completo, histÃ³rico ilimitado, grÃ¡ficos avanÃ§ados
- [ ] PÃ¡gina de upgrade com opÃ§Ãµes de plano
- [ ] IntegraÃ§Ã£o com InfinitePay para pagamento

### Fase 9: Sistema de Vencimento de LicenÃ§as
- [ ] Implementar avisos: 30 dias antes, 15 dias antes, 7 dias antes
- [ ] NotificaÃ§Ãµes por email/WhatsApp quando licenÃ§a estÃ¡ vencendo
- [ ] Bloquear acesso apÃ³s vencimento (redirecionar para upgrade)
- [ ] RenovaÃ§Ã£o automÃ¡tica se configurado

### Fase 10: Painel Administrativo - Controle de LicenÃ§as
- [ ] Criar pÃ¡gina /admin/spreadsheet-licenses
- [ ] Listar todos os usuÃ¡rios e suas licenÃ§as
- [ ] Visualizar: tipo de plano, data de expiraÃ§Ã£o, status (ativo/vencido)
- [ ] AÃ§Ãµes: bloquear usuÃ¡rio, estender licenÃ§a, renovar, cancelar
- [ ] Filtros: por status, por tipo de plano, por data de vencimento
- [ ] Busca por usuÃ¡rio/email/telefone
- [ ] RelatÃ³rio de uso: quantos usuÃ¡rios estÃ£o usando, taxa de renovaÃ§Ã£o

### Fase 11: Testes e Checkpoint Final
- [ ] Testes para CRUD de spreadsheets
- [ ] Testes para cÃ¡lculos automÃ¡ticos de cada aba
- [ ] Testes para sistema de licenÃ§as
- [ ] Testes para avisos de vencimento
- [ ] Testes para painel administrativo
- [ ] Salvar checkpoint final


## CorreÃ§Ã£o Definitiva do Login /gastos (01/07/2026)
- [x] DiagnÃ³stico: senha armazenada como hash bcrypt mas login comparava texto plano
- [x] Login agora detecta automaticamente hash bcrypt ($2a/$2b/$2y) vs texto plano
- [x] Corrigido require('crypto') -> import { randomBytes } from "crypto"
- [x] Removido procedimento de debug temporÃ¡rio
- [x] Testado via curl (HTTP 200, success:true)
- [x] Testado no frontend (dev): cliente ADES VEG logou e acessou a planilha
- [ ] PENDENTE: usuario precisa PUBLICAR para h2colombiano.com receber a correcao

## RefatoraÃ§Ã£o do Layout da Planilha de Gastos
- [ ] Mover coluna Data para esquerda como coluna vertical
- [ ] Converter cada data em um card colorido com bordas
- [ ] Aplicar cores diferentes para cada data (gradiente ou paleta)
- [ ] Manter tabela horizontal com categorias de gastos
- [ ] Sincronizar scroll entre coluna de datas e tabela de gastos

## Bug cliente (11) 94719-6871 (pedidos Ã³rfÃ£os + erro finalizar)
- [x] Admin listOrders deve incluir pedidos Ã³rfÃ£os (registrationId sem linha em accessCodePhones) vinculando por telefone do cliente
- [x] Garantir que os 3 pedidos do cliente 11947196871 apareÃ§am no admin
- [x] Robustecer finalizaÃ§Ã£o de novo pedido para evitar erro "sem internet"
- [x] Vitest cobrindo o cenÃ¡rio de pedido Ã³rfÃ£o aparecendo na lista do admin

## Bug Gestor de Gastos - Total de Ganhos = R$ 0,00
- [x] Causa raiz: drizzle inicializado sem schema, entao db.query.*.findMany/findFirst retornava vazio (ganhos e metas)
- [x] Corrigir getEarningsByUserAndMonth para usar db.select().from()
- [x] Corrigir getEarningsByUserAndDate e getGoalsByUserAndMonth (mesmo problema latente)
- [x] Teste vitest cobrindo soma de ganhos por mes

## Aba Operacional - corridas por plataforma
- [x] Novas colunas no banco: ridesUber, rides99, ridesIndrive, ridesParticular, ridesDeliveries
- [x] Backend create/update calcula rideCount (total) automaticamente
- [x] Frontend: 5 campos separados + Total de Corridas somado ao vivo
- [x] Data preenchida com o dia atual (editavel)
- [x] Lista mostra detalhamento por plataforma + total
- [x] Teste vitest operationalRides (Uber 50 + 99 20 + InDrive 12 = 82)

- [x] Data do dia pre-preenchida em Ganhos, Gastos e Operacional (data local sem fuso)

## Login e sessao (Gestor de Gastos)
- [x] Login persistente: sessao de 90 dias (antes 24h)
- [x] Renovacao automatica da sessao a cada uso (sliding)
- [x] Restauracao automatica da sessao ao carregar (verifySession)
- [x] Entrar direto no painel apos login (sem F5)
- [x] Continuar logado ao dar F5 / reabrir navegador
- [x] Evitar loop de login/logout e estado logado-mas-quebrado
- [x] Logout invalida a sessao no servidor
- [x] Testes de sessao (verifySession + renovacao)

## Bug F5 desloga (index.html)
- [x] Diagnostico: localStorage.clear() no index.html apagava o token a cada reload
- [x] Correcao: removido localStorage.clear/sessionStorage.clear (mantida limpeza de SW/IndexedDB)
- [x] Validado no navegador: F5 mantem sessao e entra direto no painel


## Redesign visual Planilha de Gastos (somente visual)
- [x] Tema escuro premium + azul neon como cor principal
- [x] Cards superiores: destaque nos valores, bordas arredondadas, sombra e brilho azul
- [x] Verde sÃ³ para positivos, vermelho sÃ³ para gastos/prejuÃ­zo
- [x] Abas com aba ativa destacada em azul (fix dark:data-[state=active]:bg-primary)
- [x] BotÃ£o Adicionar (Ganho/Gasto/Operacional) azul mais forte
- [x] BotÃ£o Deletar menor e mais elegante
- [x] Inputs: altura padrÃ£o, borda azul no foco, placeholder mais claro
- [x] Centralizar conteÃºdo, reduzir espaÃ§os vazios
- [x] Responsividade mobile em coluna Ãºnica
- [x] NÃ£o alterar nenhuma funÃ§Ã£o (somente visual)

## Tela de login /gastos com as mesmas cores do painel logado (somente visual)
- [x] Trocar gradiente roxo por fundo azul escuro do painel (#070a16/#0a0f22)
- [x] Card, borda, brilho azul, Ã­cone e tÃ­tulo no mesmo estilo do painel
- [x] Inputs com altura padrÃ£o, borda azul no foco e placeholder mais claro
- [x] BotÃ£o Entrar em azul neon (primary)
- [x] Tela de loading "Carregando..." tambÃ©m no tema azul
- [x] Nenhuma funÃ§Ã£o alterada (somente visual)

## CorreÃ§Ã£o: manter registros SEPARADOS na mesma data (soma no total, nÃ£o substitui)
- [x] createExpense: sempre INSERT (mostra os dois lanÃ§amentos, ex. 7 e 10)
- [x] createEarning: sempre INSERT (mostra os dois lanÃ§amentos)
- [x] Total de gastos, lucro, relatÃ³rios e grÃ¡ficos somam TODOS os registros
- [x] Frontend: grade por data mostra cada lanÃ§amento (removidas linhas vazias '-')
- [x] Vitest cobrindo mÃºltiplos registros na mesma data (7+10=17 e 80+20=100)
- [x] NÃ£o alterado comportamento de update/delete existentes

## Adicionar botÃ£o Editar em cada lanÃ§amento (Gastos, Ganhos, Operacional)
- [x] BotÃ£o Editar na lista de Gastos (carrega valores nos campos e salva via updateExpense)
- [x] BotÃ£o Editar na lista de Ganhos (updateEarning)
- [x] BotÃ£o Editar na lista de Operacional (updateOperational)
- [x] Modo ediÃ§Ã£o: trocar "Adicionar" por "Salvar alteraÃ§Ãµes" + botÃ£o Cancelar
- [x] ApÃ³s salvar/cancelar, limpar o modo ediÃ§Ã£o e recarregar dados
- [x] Testar em desktop e mobile

## Novo fluxo de autenticaÃ§Ã£o Gastos (Jul 2026)
- [x] Adicionar campo `pendingApproval`, `createdByClient`, `clientCreatedAt` na tabela spreadsheetPasswords
- [x] Adicionar procedure `checkPhone`: verifica cadastro, retorna found/not_found/blocked
- [x] Adicionar procedure `clientCreatePassword`: cliente cria senha (salva como pendente, sem validade)
- [x] Atualizar procedure `login`: bloquear se senha pendente (sem validade) ou expirada
- [x] Adicionar procedure `adminSetExpiry`: admin define validade/vencimento de senha pendente
- [x] Reimplementar GastosLoginPage: etapa 1 = sÃ³ telefone, etapa 2 = criar senha, etapa 3 = aguardando aprovaÃ§Ã£o
- [x] Atualizar AdminGastosPage: seÃ§Ã£o de senhas pendentes com alerta, botÃ£o para definir validade
- [x] Aplicar migraÃ§Ã£o SQL no banco

## Sistema de Upload de MÃ­dia com URL /video/slug (Jul 2026)
- [x] Tabela adminMediaFiles com campo videoSlug criada no banco
- [x] Endpoints chunked: init-media, chunk-media, finalize-media, media-job-status
- [x] Endpoint finalize-media aceita e salva videoSlug no banco
- [x] Rota dinÃ¢mica /video/:slug no servidor (busca fileKey no banco pelo slug)
- [x] AdminMedia.tsx: campo de slug auto-preenchido com nome do arquivo
- [x] AdminMedia.tsx: exibe URL /video/slug como URL principal apÃ³s upload
- [x] AdminMedia.tsx: botÃ£o Copiar URL copia URL absoluta (com domÃ­nio)
- [x] AdminMedia.tsx: lista de mÃ­dias mostra URL /video/slug se tiver slug
- [x] TypeScript sem erros
- [x] Bug: polling de media-job-status usa Map em memÃ³ria (perde estado em instÃ¢ncias serverless)
- [x] CorreÃ§Ã£o: jobId = uploadId, status persistido nas colunas jobStatus/jobUrl/jobError da tabela uploadSessions
- [x] SessÃ£o deletada somente apÃ³s 10 minutos (polling tem tempo para ler o status "done")
- [x] Caso sessÃ£o jÃ¡ deletada: endpoint retorna done buscando Ãºltimo registro em adminMediaFiles
- [x] RefatoraÃ§Ã£o final: finalize-media agora Ã© SÃNCRONO (sem polling, sem Map em memÃ³ria)
- [x] Servidor monta chunks, envia para S3, salva no banco e retorna URL /video/slug diretamente
- [x] Testado com vÃ­deo de 58.9MB â€” 3.2s para montar e retornar URL
- [x] Rota /video/slug retorna player HTML funcional
- [x] Lista de mÃ­dias exibe slug corretamente

## Upload de MÃ­dia V2: Upload direto para S3 (Jul 2026)
- [x] Frontend envia chunks DIRETO para S3 via presigned PUT URLs (sem passar pelo backend)
- [x] Backend gera presigned PUT URLs no init-media e retorna ao frontend
- [x] Endpoint confirm-chunk para frontend confirmar cada chunk enviado
- [x] Finalize-media processa em background (setImmediate) e retorna jobId imediatamente
- [x] Status no banco: uploading â†’ processing â†’ completed | failed
- [x] Polling de status via banco (funciona em qualquer instÃ¢ncia serverless)
- [x] Mensagem clara: "VÃ­deo enviado, estamos processando. Pode levar alguns minutos."
- [x] Timeout de polling: 10 minutos mÃ¡ximo (frontend mostra erro se exceder)
- [x] Retry automÃ¡tico: 3 tentativas por chunk com backoff exponencial
- [x] Testado com 50MB: SUCESSO (5.8s)
- [x] Testado com 60MB: SUCESSO (4.7s)
- [x] Testado com 100MB: SUCESSO (8.7s)

## Geradores e Consulta de CEP (Jul 2026)
- [x] Gerador de Telefone (verde) â€” DDD por cidade, formato formatado
- [x] Gerador de CPF (roxo) â€” seleÃ§Ã£o de estado com regiÃ£o fiscal correta, formato, quantidade
- [x] Gerador de RG (azul) â€” estado emissor, dois formatos (pontuado e sem pontuaÃ§Ã£o)
- [x] Gerador de CNH (laranja) â€” algoritmo DETRAN, 11 dÃ­gitos, formato com espaÃ§o
- [x] Layout em grid 2 colunas (Telefone+CPF na linha 1, RG+CNH na linha 2)
- [x] Consulta de CEP (teal) â€” integrada na mesma pÃ¡gina /admin/telefone, abaixo dos geradores
- [x] ConsultaCep: busca via ViaCEP, histÃ³rico de 10 consultas, copiar campo individual ou tudo

## MÃ³dulo de Gerenciamento de Emails Zoho Mail (Jul 2026)
- [x] Configurar secrets ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID no projeto
- [x] Criar helper server/zoho.ts para autenticaÃ§Ã£o OAuth e chamadas Ã  API do Zoho Mail
- [x] Criar rotas tRPC: email.list, email.create, email.delete, email.resetPassword, email.toggle
- [x] Criar pÃ¡gina AdminEmail.tsx com tabela de contas, formulÃ¡rio de criaÃ§Ã£o e aÃ§Ãµes
- [x] Adicionar rota /admin/email no App.tsx
- [x] BotÃ£o de acesso rÃ¡pido ao webmail (mail.zoho.com) abrindo em nova aba

## Hub Central de Acesso â€” BotÃµes RÃ¡pidos DinÃ¢micos (Jul 2026)
- [x] Adicionar colunas linkType, openInNewTab, vipOnly na tabela homeButtons (SQL migration)
- [x] Atualizar schema Drizzle com novos campos
- [x] Atualizar HomeButtonData e createHomeButton no db.ts
- [x] Atualizar procedures create/update no routers.ts para aceitar novos campos
- [x] Reescrever HomeButtonsManager com 10 tipos de link, 18 Ã­cones, preview ao vivo, checkboxes VIP/nova aba
- [x] Atualizar tÃ­tulo da seÃ§Ã£o no AdminSettings para "BotÃµes RÃ¡pidos - Hub Central de Acesso"
- [x] Expandir EXTRA_BTN_ICONS no WelcomeScreen com todos os novos Ã­cones emoji
- [x] Corrigir handleExtraBtn para respeitar openInNewTab (nova aba vs mesma janela)
- [x] Filtrar botÃµes vipOnly=1 na tela pÃºblica (nÃ£o exibir para nÃ£o-VIPs)
- [x] Adicionar CSS walk-hover-brightness ao bloco de estilos injetados

## UnificaÃ§Ã£o do Sistema de Senha (customerPassword)
- [x] Substituir sistema VIP antigo (walk_access_code/walk_access_granted) no PasswordGate pelo novo customerPassword
- [x] Fluxo: telefone â†’ checkStatus â†’ se no_password: criar senha â†’ se active: fazer login com customerPassword.login
- [x] Token cp_token compartilhado entre PasswordGate e /acompanhar (mesma sessÃ£o)
- [x] Clientes novos: cadastro normal â†’ depois criar senha via customerPassword
- [x] Remover campo de senha inline do step phone (campo VIP antigo)

## ReformulaÃ§Ã£o do Sistema de IndicaÃ§Ã£o (Jul 2026)
- [x] Mover formulÃ¡rio de indicaÃ§Ã£o para APÃ“S o pedido ser finalizado (tela de sucesso)
- [x] Pergunta "AlguÃ©m te indicou?" com botÃµes SIM/NÃƒO na tela de sucesso
- [x] BotÃ£o SIM mostra campo de telefone do indicador com validaÃ§Ã£o (11 dÃ­gitos)
- [x] BotÃ£o NÃƒO direciona para o WhatsApp normalmente
- [x] Indicador aparece antes do botÃ£o WhatsApp na tela de sucesso
- [x] ValidaÃ§Ã£o: nÃ£o pode indicar a si mesmo
- [x] Salva indicaÃ§Ã£o via trpc.customers.updateReferral
- [x] NÃ£o mexe na estrutura do pedido â€” fluxo segue o mesmo percurso
- [x] Aviso obrigatÃ³rio e botÃ£o WhatsApp sÃ³ aparecem apÃ³s responder a pergunta de indicaÃ§Ã£o

## CorreÃ§Ã£o - Cards de Destaque (featureCards)
- [x] Bug: botÃµes â–²â–¼ de reordenaÃ§Ã£o nÃ£o funcionavam porque todos os cards tinham sortOrder=0
- [x] Corrigida lÃ³gica do moveCard para usar Ã­ndices da lista como valores de sortOrder (troca sempre resulta em valores distintos)
- [x] Inicializados sortOrder dos cards existentes com valores distintos (0, 1, 2...)
- [x] Procedure create agora atribui sortOrder automaticamente como prÃ³ximo nÃºmero na sequÃªncia
## CorreÃ§Ãµes na Planilha de Gastos (Jul 2026)
- [x] Bug: Valores zerados nos cards de resumo durante carregamento apÃ³s refresh - adicionado skeleton animado (earningsLoading/expensesLoading)
- [x] Bug: useEffect de sincronizaÃ§Ã£o earnings/expenses usava `if (data)` que nÃ£o atualizava quando data era undefined (erro) - corrigido para `if (data !== undefined)`
- [x] Feature: Exibir horÃ¡rio (hora:minuto) de cada lanÃ§amento individual no histÃ³rico de gastos e ganhos
- [x] Feature: HorÃ¡rio formatado com fuso horÃ¡rio Brasil (America/Sao_Paulo) via Intl.DateTimeFormat
- [x] Feature: FunÃ§Ã£o utilitÃ¡ria formatCreatedAtTime para conversÃ£o robusta de timestamps UTC para BRT
## Valor do Pedido em Destaque no Admin (Jul 2026)
- [x] Adicionar coluna pricePaid (varchar 64) na tabela orderStatusHistory
- [x] Popular pedidos antigos: match serviceOption com productOptions.label para preencher pricePaid
- [x] Atualizar submitFiles para salvar pricePaid no momento do pedido
- [x] Atualizar listOrders para retornar pricePaid
- [x] Exibir pricePaid em destaque grande no card do pedido no AdminOrders

## Copiar Perguntas de Outro Produto
- [x] Adicionar endpoint copyQuestionsFromProduct no backend (copia todas as perguntas de um produto para outro, substituindo as existentes)
- [x] Adicionar botÃ£o "ðŸ“‹ Copiar de outro produto" na seÃ§Ã£o de perguntas do AdminProducts
- [x] Implementar modal de seleÃ§Ã£o de produto de origem com lista de todos os produtos/opÃ§Ãµes
- [x] Confirmar substituiÃ§Ã£o antes de executar

## Propagandas por PÃ¡gina (targetPages)
- [x] Adicionar coluna targetPages (varchar, ex: "gastos,acompanhar,pedidos") na tabela infoBanners
- [x] Atualizar endpoints de criaÃ§Ã£o/ediÃ§Ã£o de banner para aceitar targetPages
- [x] Atualizar query getInfoBanners para filtrar por pÃ¡gina (parÃ¢metro page no endpoint listActive)
- [x] Adicionar seletor de pÃ¡ginas (checkboxes) no admin de propagandas (AdminBanners.tsx)
- [x] Adicionar componente de banner na pÃ¡gina /acompanhar (OrderTracking.tsx)
- [x] Adicionar componente de banner na pÃ¡gina de pedidos (Home.tsx com page='pedidos')
- [x] Adicionar componente de banner na pÃ¡gina de gastos (SpreadsheetPage.tsx com page='gastos')
- [x] Banners existentes sem targetPages exibidos apenas em gastos (compatibilidade - default 'gastos')
- [x] Corrigir erro TypeScript: trpc.banners.listActive.useQuery() agora exige argumento { page }

## PÃ¡gina de Destino nas Propagandas (AdCampaigns targetPages)
- [x] Adicionar coluna targetPages (varchar, default 'gastos') na tabela adCampaigns
- [x] Atualizar backend: checkForClient aceita parÃ¢metro page e filtra por targetPages
- [x] Atualizar backend: create/update aceitam targetPages
- [x] Atualizar AdminAdCampaigns: seletor de pÃ¡ginas (botÃµes toggle) no formulÃ¡rio de criaÃ§Ã£o/ediÃ§Ã£o
- [x] Atualizar AdminAdCampaigns: exibir pÃ¡ginas na lista de campanhas (badges azuis)
- [x] Atualizar SpreadsheetPage: passar page='gastos' no checkForClient
- [x] Verificar outras pÃ¡ginas: somente SpreadsheetPage usa adCampaigns (OrderTracking e Home nÃ£o usam)

## Sistema de Revendedor
- [x] Adicionar colunas na tabela customers: isReseller (boolean), resellerDiscountType ('percent'|'fixed'), resellerDiscountValue (decimal)
- [x] Adicionar colunas na tabela accessCodePhones: thirdPartyName (varchar), resellerDiscountApplied (decimal)
- [x] Criar endpoint admin: setReseller (ativar/desativar revendedor e definir desconto)
- [x] Criar endpoint: getResellerDiscount (retorna desconto do cliente logado para calcular no frontend)
- [x] Atualizar endpoint submitFiles para salvar thirdPartyName e resellerDiscountApplied
- [x] LÃ³gica de desconto: aplica no valor final (garantia se houver, produto se nÃ£o houver), sem desconto se item tiver promoÃ§Ã£o ativa
- [x] Painel admin: seÃ§Ã£o "Revendedor" no cadastro do cliente com toggle + tipo (% ou R$) + valor
- [x] Painel admin: exibir nome do cliente final (terceiro) e desconto aplicado no painel de detalhes do pedido (AdminOrders)
- [x] FormulÃ¡rio de pedido: campo "Para quem Ã© este pedido?" (nome do terceiro, opcional, sÃ³ aparece para revendedores)
- [x] FormulÃ¡rio de pedido: exibir desconto de revendedor aplicado e aviso de promoÃ§Ã£o ativa

## Agrupamento de Carrinho (cartGroupId)
- [ ] Adicionar coluna cartGroupId (varchar) na tabela accessCodePhones
- [ ] Adicionar coluna cartTotal (decimal) e cartCouponCode (varchar) e cartCouponDiscount (decimal) na tabela accessCodePhones
- [ ] Backend: gerar cartGroupId Ãºnico ao criar mÃºltiplos pedidos do mesmo carrinho
- [ ] Backend: salvar cartTotal, cartCouponCode e cartCouponDiscount em todos os pedidos do grupo
- [ ] Frontend submitFiles: gerar e enviar cartGroupId quando hÃ¡ mÃºltiplos itens no carrinho
- [ ] Frontend submitFiles: enviar cartTotal, cartCouponCode e cartCouponDiscount
- [ ] AdminOrders: agrupar cards por cartGroupId â€” pedidos do mesmo grupo em um Ãºnico card
- [ ] AdminOrders: exibir cada produto em bloco separado com nÃºmero, serviÃ§o, opÃ§Ã£o, valor e status
- [ ] AdminOrders: comprovante PIX aparece apenas no Produto 1 (primeiro do grupo)
- [ ] AdminOrders: documentos de cada produto aparecem no bloco do respectivo produto
- [ ] AdminOrders: rodapÃ© do card agrupado mostra TOTAL, DESCONTO (cupom) e TOTAL PAGO
- [ ] AdminOrders: botÃµes de aÃ§Ã£o (Auto, Urgente, Atender, Agendamento) por produto individualmente
- [ ] NotificaÃ§Ã£o WhatsApp: listar todos os produtos, nÃºmeros de pedido e valor total correto
- [ ] NotificaÃ§Ã£o Email: listar todos os produtos, nÃºmeros de pedido e valor total correto
- [ ] Pedidos antigos sem cartGroupId continuam aparecendo separados (compatibilidade)

## CorreÃ§Ã£o NotificaÃ§Ã£o de Pedido (Jul 2026)
- [x] Corrigir mensagem WhatsApp/notificaÃ§Ã£o para incluir: quem indicou, mÃºltiplos pedidos numerados, respostas do formulÃ¡rio, documentos com URLs e valor total

## CorreÃ§Ã£o Bug de Acesso Sem Senha (Jul 2026)
- [x] Identificado: cliente FELIPE (11993451851) acessava via sessÃ£o antiga do cÃ³digo SEXTA25 (deletado)
- [x] Identificado: senha geral do site Ã© "Walkcontas" - qualquer um que soubesse entrava
- [x] Corrigido PasswordGate.tsx: quando modo MANUAL ativo, sessÃ£o antiga (walk_access_granted) Ã© invalidada
- [x] Corrigido db.ts validateAccessCode: senha geral bloqueada quando modo MANUAL ativo
- [x] Corrigido db.ts validateAccessCode: senha fixa individual bloqueada quando modo MANUAL ativo
- [x] Corrigido db.ts checkAccessCodeCanSubmit: senha geral bloqueada quando modo MANUAL ativo
- [x] Adicionado procedure appSettings.getManualMode no routers.ts (pÃºblico, retorna {isManual: boolean})

## Editor de FormulÃ¡rios Fixos (Jul 2026)
- [x] Adicionar coluna originalFields na tabela consultaForms
- [x] Criar procedures: saveFormFields, restoreFormFields, initBuiltinFields, uploadDoc
- [x] Criar componente FormFieldEditor no AdminConsultas com: adicionar/editar/remover linhas, mover campos entre linhas, duplicar linhas, escolher 1/2/3 colunas, campos obrigatÃ³rios/opcionais, ativar/desativar campos, restaurar padrÃ£o
- [x] Criar FormDinamico no ServicosExtras para renderizar formulÃ¡rios usando campos do banco
- [x] Manter formulÃ¡rios hardcoded como fallback quando nÃ£o hÃ¡ campos configurados

## VerificaÃ§Ã£o de Cadastro Completo ObrigatÃ³rio
- [x] PasswordGate verifica se cliente tem email e CPF apÃ³s login
- [x] Se faltar email ou CPF, mostra tela "Complete seu Cadastro" antes de liberar acesso
- [x] Tela mostra Nome e Telefone (somente leitura com checkmark verde)
- [x] Campo E-mail editÃ¡vel se faltar, somente leitura se jÃ¡ preenchido
- [x] Campo CPF editÃ¡vel com mÃ¡scara se faltar, somente leitura se jÃ¡ preenchido
- [x] BotÃ£o "Salvar e Continuar" chama updateEmailByPhone e/ou updateCpfByPhone
- [x] ApÃ³s salvar, refetch do perfil libera acesso automaticamente

## Faixa "Entregue em" na pasta Entregues
- [x] Faixa teal com data/hora do status "Entregue" exibida em destaque no topo de cada card da pasta Entregues
- [x] Usa campo latestStatusAt jÃ¡ disponÃ­vel no pedido (sem nova query)
- [x] VisÃ­vel mesmo com o card recolhido

## E-mail em massa com intervalo configurÃ¡vel
- [x] Adicionar coluna sendIntervalSeconds e scheduleCronTaskUid na tabela broadcasts
- [x] Criar tabela broadcastQueue para fila de envio individual
- [x] Backend: procedure para iniciar envio com intervalo (cria fila + Heartbeat)
- [x] Endpoint Heartbeat /api/scheduled/broadcastEmail que processa 1 e-mail por disparo
- [x] Frontend: campo de intervalo no formulÃ¡rio de broadcast (Imediato, 1min, 2min, 3min, 5min, 10min)
- [x] Frontend: histÃ³rico mostra status Enviando com contador enviados/total e badge de intervalo
- [ ] Frontend: botÃ£o de cancelar envio em andamento (futuro)

## Bug: Textareas nÃ£o editÃ¡veis na aba Mensagens do AdminSchedule
- [x] Bug: Textareas na aba Mensagens nÃ£o aceitavam digitaÃ§Ã£o direta (botÃµes de variÃ¡veis funcionavam)
- [x] Causa raiz: SectionEditor disparava onChange no mount inicial causando loop de re-render
- [x] Fix: Adicionado isFirstRender.current no SectionEditor para skip do primeiro useEffect
- [x] Fix: Adicionado staleTime: Infinity e refetchOnWindowFocus: false no getConfig query
- [x] Fix: Reset do formInitialized.current apÃ³s salvar para permitir re-inicializaÃ§Ã£o com dados frescos

## Melhorar design do e-mail de Novo Pedido
- [x] Reformatar seÃ§Ã£o "Respostas do FormulÃ¡rio" no e-mail com quebras de linha (cada pergunta/resposta em linha separada)
- [x] Melhorar visual geral da seÃ§Ã£o de informaÃ§Ãµes adicionais no e-mail
- [x] NÃ£o alterar nada no WhatsApp (estÃ¡ correto)

## Bug: Recebido Hoje mostrando R$ 0,00 no dashboard EmprÃ©stimos
- [x] Corrigir cÃ¡lculo de 'today' para usar fuso horÃ¡rio BRT (GMT-3) em vez de UTC
- [x] Corrigir query DATE(paidAt) para considerar fuso horÃ¡rio ao comparar com 'hoje'

## Bug: Dados de Acesso sem quebra de linha no e-mail de status para o cliente
- [x] Corrigir loginData passado ao emailStatusCliente - remover .replace(/<[^>]+>/g, '') que apagava as tags HTML
- [x] Corrigir loginBlock no emailTemplates para renderizar HTML direto em vez de nl2br (que nÃ£o funciona com HTML)

## Aba Finalizados em EmprÃ©stimos
- [x] Criar aba "Finalizados" na tela AdminLoans para separar emprÃ©stimos pagos/quitados dos ativos
- [x] EmprÃ©stimos com status "pago" ou todas parcelas pagas ficam na aba Finalizados
- [x] Aba "Ativos" mostra apenas emprÃ©stimos em andamento
- [x] Corrigido bug: todas as procedures de emprÃ©stimos usavam protectedProcedure (exigia Manus OAuth) â€” trocado para adminProcedure (aceita JWT admin independente)

## Bug: Retomada de progresso ("Continuar de onde parou") nÃ£o restaura sub-perguntas, fotos e documentos
- [x] Fix: useEffect de profilePhoto sobrescreve preview restaurado do banco com null
- [x] Fix: useEffect de docFiles sobrescreve docFilePreviews restaurados do banco (recria apenas de docFiles locais)
- [x] Fix: ValidaÃ§Ã£o de uploads (validateUploadsAndProceed e handleFinalSubmit) exige File objects locais â€” deve aceitar URLs jÃ¡ salvas no banco
- [x] Fix: UI de documentos dinÃ¢micos trata preview do banco como se arquivo nÃ£o existisse (hasFile = !!docFiles[doc.id])
- [x] Fix: Sub-perguntas â€” questionAnswers restaurado funciona corretamente com buildOrderedQs (verificado - jÃ¡ funcionava)

## Bug: FormulÃ¡rio de prÃ©-cadastro na pÃ¡gina admin estÃ¡ confuso
- [x] Remover perguntas duplicadas (mesmo conteÃºdo aparecendo em cima e embaixo)
- [x] Organizar sub-perguntas de forma hierÃ¡rquica e clara (indentaÃ§Ã£o/agrupamento)
- [x] Melhorar layout geral do modal de detalhes do prÃ©-cadastro para ser fÃ¡cil de entender

## Bug: Retomada de progresso ainda pede reenvio de documentos dinÃ¢micos (DOC CARRO)
- [x] Fix: Implementado upload imediato ao S3 quando arquivo Ã© selecionado + salvar URL no localStorage
- [x] Fix: Na retomada, ler URLs do localStorage e popular restoredFileUrls (sem depender do banco)
- [x] Fix: No submit, priorizar URL jÃ¡ salva (restoredFileUrls) em vez de re-enviar
- [x] Fix: Limpar UPLOADED_FILES_KEY em todos os pontos de reset (success, startFresh, resetAll, handleOption, handleService, startCartCheckout)

## Bug: Sub-perguntas fora de ordem na mensagem do WhatsApp
- [x] Ordenar perguntas por sortOrder na mensagem do WhatsApp/email
- [x] Indentar sub-perguntas abaixo da pergunta-pai com seta â†³ (hierarquia visual)
- [x] answersArray construÃ­do com ordenaÃ§Ã£o hierÃ¡rquica recursiva (pai â†’ filhos â†’ netos)

## Feature: Abertura automÃ¡tica de pedido ao pressionar Enter na busca
- [x] Ao pressionar Enter na barra de busca da pÃ¡gina de Pedidos com exatamente 1 resultado, abrir automaticamente o modal de detalhes desse pedido

## Feature: Exibir nome do produto/serviÃ§o nos agendamentos
- [x] Mostrar nome do produto (ex: UBER APP, UBER TAXI) em cada card da pÃ¡gina de Agendamentos

## Tutorial de Ajuda para Clientes
- [x] BotÃ£o flutuante â“ na tela de pagamento e sucesso
- [x] Modal com guia passo a passo (6 etapas): Copiar PIX â†’ Pagar no banco â†’ Enviar comprovante â†’ Finalizar â†’ Indicador â†’ WhatsApp
- [x] Componente isolado (PaymentTutorial.tsx) sem alterar lÃ³gica existente

## EdiÃ§Ã£o de Pedido e Pedido Manual
- [x] Incluir campo de valor (R$) no formulÃ¡rio de ediÃ§Ã£o de pedido
- [x] Mostrar perguntas do produto ao editar (carregar do produto selecionado se pedido nÃ£o tem)
- [ ] Verificar se pedido manual salva todos os dados corretamente (valor, perguntas)
- [x] Bug fix: FormulÃ¡rio de ediÃ§Ã£o de pedido - perguntas tipo 'select' agora mostram dropdown com opÃ§Ãµes (match flexÃ­vel do serviceOption com garantia, suporte a formato string separada por vÃ­rgula alÃ©m de JSON)
- [x] FormulÃ¡rio de ediÃ§Ã£o de pedido: sub-perguntas condicionais (parentQuestionId + triggerOption) agora respeitam a lÃ³gica de visibilidade - sÃ³ aparecem quando a resposta da pergunta pai bate com o triggerOption (ex: "QUANTAS?" sÃ³ aparece quando "TEVE CONTA FAKE?" = "SIM")
- [x] Sub-perguntas no formulÃ¡rio de ediÃ§Ã£o exibidas com indentaÃ§Ã£o visual (borda azul Ã  esquerda + â””) para diferenciar da pergunta pai

## Limite de Consultas por Semana (ServiÃ§os Extras)
- [ ] Adicionar configuraÃ§Ã£o global no admin: limite mÃ¡ximo de consultas por cliente por semana
- [ ] Backend: validar ao criar nova consulta se o cliente jÃ¡ atingiu o limite semanal
- [ ] Frontend cliente: bloquear envio e mostrar mensagem quando limite atingido
- [ ] Admin pode ajustar o limite a qualquer momento
- [x] Limite semanal de consultas: backend (countConsultaRequestsThisWeek, validaÃ§Ã£o no submit)
- [x] Limite semanal de consultas: admin pode configurar (0 = sem limite) na aba Gerenciar FormulÃ¡rios
- [x] Limite semanal de consultas: cliente vÃª aviso e botÃ£o desabilitado quando atingir o limite

## Mensagens RÃ¡pidas WhatsApp
- [ ] Criar tabela whatsappTemplates no banco (id, title, statusKey, message, imageUrl, videoUrl, mediaFileKey, mediaFileUrl, mediaType, sortOrder, isDefault, createdAt)
- [ ] Criar procedures tRPC: listTemplates, createTemplate, updateTemplate, deleteTemplate, uploadTemplateMedia
- [ ] Criar pÃ¡gina AdminWhatsappTemplates.tsx para gerenciar mensagens (CRUD + upload de mÃ­dia)
- [ ] Adicionar rota /admin/whatsapp-templates no App.tsx e no menu lateral
- [ ] Modificar botÃ£o "Notificar via WhatsApp" no AdminOrders.tsx para abrir modal de seleÃ§Ã£o
- [ ] Modal: mostrar mensagem padrÃ£o do status atual, opÃ§Ã£o de trocar por outro prÃ©-molde, editar texto, preview de imagem/vÃ­deo
- [ ] Suporte a imagem e vÃ­deo via URL ou arquivo prÃ©-definido no painel
- [x] Corrigir salvamento de templates WhatsApp - tabela criada no DB + router corrigido para usar sql template literals do Drizzle
- [x] Bug: BotÃµes de variÃ¡veis ({nome}, {pedido}, etc.) nos templates WhatsApp nÃ£o inserem na posiÃ§Ã£o do cursor - devem inserir onde o cursor estÃ¡ no textarea
- [x] Bug: VariÃ¡vel {servico} nÃ£o funciona nos templates WhatsApp - corrigido em todos os locais de substituiÃ§Ã£o (modal e envio direto)
- [x] Feature: Adicionar upload de fotos/imagens na pÃ¡gina de Upload de MÃ­dia (gerar URL pÃºblica como jÃ¡ faz com vÃ­deos)
- [x] Feature: Adicionar meta tags Open Graph completas nas rotas /foto/:slug e /video/:slug para miniatura ao compartilhar no WhatsApp/redes sociais
- [x] Bug: Upload de vÃ­deo preso em loop infinito "Processando..." - corrigido para processamento sÃ­ncrono
- [x] Bug: URL copiada era do CloudFront em vez da URL amigÃ¡vel com miniatura (h2colombiano.com/foto/slug ou /video/slug)
- [ ] Feature: Melhorar Gerador Completo com todos dados de pessoa fictÃ­cia: nome (campo opcional), data nascimento, pai/mÃ£e, endereÃ§o, email, gÃªnero + campo nome opcional
- [x] Feature: Melhorar Gerador Completo com todos dados de pessoa fictÃ­cia: nome (campo opcional), data nascimento (20-65 anos), pai/mÃ£e, endereÃ§o, email, gÃªnero
- [x] Feature: Gerador Completo - adicionar campos CNH completos (RENACH, FormulÃ¡rio CNH, NÂº Registro, PGU, Categoria, Validade, Primeira HabilitaÃ§Ã£o, Ã“rgÃ£o Expedidor, Local Nascimento, Nacionalidade) e formato de saÃ­da igual ao modelo fornecido

## Bug: Juros cobrados sobre valor total em vez da parcela vencida
- [x] Corrigir backend payInterestOnly: calcular juros sobre soma das parcelas vencidas (pendentes com dueDate < hoje) em vez do loan.amount total
- [x] Corrigir frontend InterestOnlySection: usar overdueAmount do listLoans em vez de loan.amount
- [x] Adicionar subquery overdueAmount no listLoans (soma das parcelas pendentes vencidas)
- [x] Label dinÃ¢mico: "Parcela(s) vencida(s)" quando hÃ¡ parcelas vencidas, "Principal em aberto" como fallback

## CorreÃ§Ãµes da SessÃ£o Atual (Jul 2026)
- [x] Campo paidAmount adicionado Ã  tabela loanInstallments via ALTER TABLE
- [x] payInterestOnly salva o valor cobrado em paidAmount (parcela pago_juros)
- [x] Subquery interestOnlyPaidTotal usa paidAmount (antes usava SUBSTRING_INDEX frÃ¡gil)
- [x] Resumo financeiro corrigido: "Pago (juros)" inclui interestOnlyPaidTotal das parcelas pago_juros
- [x] Resumo financeiro corrigido: ratio usa installments (parcelas originais) em vez de totalInstallments (que inclui roladas)
- [x] BotÃ£o "Recibo Juros" adicionado para parcelas pago_juros (ao lado de "Desfazer Juros")
- [x] generateReceiptPdf suporta isInterestOnly=true: tÃ­tulo "Recibo de Pagamento de Juros", linhas detalhadas, banner laranja "JUROS COBRADOS"
- [x] generateReceipt procedure: usa paidAmount como valor do recibo para parcelas pago_juros

## CorreÃ§Ã£o de SeguranÃ§a (Jul 2026)
- [x] BUG CRÃTICO: pÃ¡gina Acompanhar Pedido exibia pedido de outro cliente â€” corrigido sincronizando searchPhone com o phone da sessÃ£o autenticada (checkSession) e limpando sessionStorage quando a sessÃ£o Ã© invÃ¡lida

## PromoÃ§Ãµes com CronÃ´metro (Jul 2026)
- [ ] Adicionar campo endsAt (data de encerramento) na tabela promotions
- [ ] Atualizar painel admin de promoÃ§Ãµes para definir data/hora de encerramento
- [ ] Redesenhar bloco "PromoÃ§Ãµes Ativas" na Home com visual premium
- [ ] Adicionar cronÃ´metro decrescente por card de promoÃ§Ã£o (hh:mm:ss)
- [ ] CronÃ´metro com visual de urgÃªncia (vermelho pulsante quando < 1h)
- [ ] PromoÃ§Ã£o some automaticamente quando tempo zerar

## ReversÃ£o AutomÃ¡tica de PromoÃ§Ã£o Expirada
- [x] Quando promoEndsAt expira: reverter price = originalPrice, limpar originalPrice e promoEndsAt automaticamente
- [x] Backend verifica promoÃ§Ãµes expiradas ao listar produtos e reverte no banco
- [x] Frontend filtra promoÃ§Ãµes expiradas e invalida query ao expirar
- [x] Corrigir exclusivamente UTF-8 nas notificações de comissão/indicação, PIX e pagamento; testar sem envio real.
- [x] Reconstituir o handler real que ainda produz `�` na rota de comissão e validar a origem efetiva antes de nova correção.
- [x] Executar correção definitiva da origem real dos caracteres `�` nas notificações de comissão e validar em produção sem envio real.
