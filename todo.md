# Project TODO - WALK CONTAS
<!-- ultima atualizacao: 27/07/2026 15:30 -->

## Migração do Projeto
- [x] Copiar arquivos do servidor (db.ts, routers.ts, storage.ts)
- [x] Copiar testes (access.test.ts, coupons.test.ts, uploads.test.ts)
- [x] Copiar drizzle schema e migrações SQL
- [x] Copiar páginas do cliente (Home.tsx, AdminCodes.tsx, AdminCoupons.tsx)
- [x] Copiar componentes (PasswordGate.tsx, ThemeContext.tsx)
- [x] Copiar App.tsx com rotas configuradas
- [x] Instalar nodemailer e @types/nodemailer
- [x] Aplicar migrações SQL (users, accessCodes, coupons, products)
- [x] Configurar secrets (EMAIL_USER, EMAIL_PASSWORD, SITE_GENERAL_PASSWORD)
- [x] Adicionar siteGeneralPassword ao ENV

## Funcionalidades Existentes
- [x] Landing page dark neon com serviços (CONTA UBER, CONTA 99, CONTA INDRIVE, EDIÇÃO DE DOCUMENTO, UBER TAXI)
- [x] Sistema de senha de acesso (geral + VIP uso único)
- [x] Modal de seleção de nome (Aleatório, Primeiro Nome, Nome Completo)
- [x] Formulário de cadastro (nome, telefone, cidade, indicador)
- [x] Upload de arquivos (foto perfil, documento carro, alvará, condutaxi)
- [x] Sistema de cupons de desconto (percentual ou fixo)
- [x] Chave PIX + upload de comprovante
- [x] Envio de email com anexos via nodemailer
- [x] Modal de sucesso com redirecionamento WhatsApp + logout automático
- [x] Painel admin /admin/codes para senhas VIP
- [x] Painel admin /admin/coupons para cupons
- [x] Banco de dados MySQL com tabelas accessCodes, coupons, products

## Testes
- [x] 55 testes passando (19 admin + 12 access + 12 coupons + 11 uploads + 1 auth.logout)
- [x] Servidor rodando e respondendo HTTP 200

## Admin Completo - Cards de Serviço Dinâmicos
- [x] CRUD completo de cards de serviço pelo admin (criar, editar, excluir, ativar/desativar)
- [x] Cada card com opções de nome individuais (ex: Aleatório R$350, Primeiro Nome R$500) - sem vínculo com existentes
- [x] Admin define quais opções de nome existem em cada card e o valor de cada uma individualmente
- [x] Formulário de perguntas customizáveis em cada card (admin cria perguntas que o cliente responde)
- [x] Ordenação dos cards pelo admin

## Admin - Editor da Página Inicial Completa
- [x] Editar seção hero (título principal, subtítulo, texto do botão)
- [x] Editar textos e cores de todas as seções da página (superior a inferior)
- [x] Editar logo/ícone do site
- [x] Editar informações de contato/WhatsApp
- [x] Editar textos de avisos e mensagens do site

## Admin - Controle de Senhas VIP Avançado
- [x] Visualizar tempo restante de cada senha VIP em uso
- [x] Renovar tempo de senha VIP (estender prazo)
- [x] Excluir senha VIP
- [x] Controlar duração padrão das senhas VIP

## Admin - Configuração PIX
- [x] Editar chave PIX pelo admin
- [x] Editar nome do titular PIX
- [x] Editar nome do banco PIX
- [x] Dados PIX dinâmicos na página pública (vem do admin)

## Página Pública - Dados Dinâmicos
- [x] Cards de serviço carregados do banco (não mais hardcoded)
- [x] Opções de nome e valores carregados do banco
- [x] Perguntas do formulário carregadas do banco
- [x] Dados PIX carregados do banco
- [x] Textos da página inicial carregados do banco

## Bugs
- [x] Campo "Nome do Serviço" ao criar novo card no admin não mostra texto digitado (texto invisível)
- [x] Upload de foto/imagem para os cards de serviço no admin com preview HTML nos cards públicos
- [x] Remover pergunta hardcoded "Digite o nome que deseja usar na sua conta" - deve ser criada pelo admin individualmente
- [x] Modal "Enviar Arquivos" aparece mesmo com todos os uploads desativados no card - deve pular direto para cadastro
- [x] Erro ao finalizar pedido / erro ao enviar arquivos (senha email atualizada + email não-bloqueante)
- [x] Mover requisitos de documentos/uploads para dentro de cada opção de compra (não no card geral)
- [x] Permitir escolher forma de nome do documento em cada opção de compra
- [x] Atualizar admin para configurar documentos por opção
- [x] Atualizar página pública para usar documentos da opção selecionada
- [x] Implementar uso real de docNameMode no fluxo público/envio de email (nomes dos anexos baseados na opção)
- [x] Adicionar testes para configuração de documentos por opção no admin (create/update/read)
- [x] Corrigir criação de opção: permitir personalizar o nome/label livremente ao clicar +Criar
- [x] Seção "Configuração Documentos & Nome" deve aparecer visível e personalizável
- [x] Perguntas do formulário devem aparecer em step separado após upload (PRÓXIMO), individuais por produto, não na área de finalizar
- [x] Seção "Configurar Documentos & Nome" deve aparecer aberta por padrão ao criar nova opção (+Criar)
- [x] Campo "Nome do Documento" personalizado: admin pode digitar um nome customizado para os documentos de cada opção
- [x] Mover perguntas do formulário para dentro de cada opção de compra (individual por opção, não por card geral)
- [x] Adicionar seção de perguntas na edição de opção no admin (expanda a opção criada para adicionar perguntas individuais)
- [x] Atualizar página pública para carregar perguntas da opção selecionada
- [x] Substituir checkboxes fixos de documentos por campos editáveis (admin digita nome do doc que quiser)
- [x] Adicionar botão Salvar visível nas opções de compra
- [x] Tabela optionDocuments no banco para documentos dinâmicos por opção
- [x] CRUD de documentos dinâmicos no admin (criar/excluir por opção)
- [x] Página pública usa documentos dinâmicos para upload
- [x] submitFiles envia documentos dinâmicos como anexos no email
- [x] Testes atualizados para documentos dinâmicos (72 testes passando)
- [x] Bug: Tela "Complete seu Pedido" com cores erradas (fundo verde/teal ao invés do tema escuro neon) em alguns celulares
- [x] Bug: Validação bloqueando envio mesmo com todos os dados preenchidos ("dados não estão todos preenchidos")
- [x] Bug: Criação de senha VIP não está salvando quantidade de acessos (campo maxUses adicionado)
- [x] Bug: Renovação de tempo (botão Renovar) corrigido
- [x] Feature: Campo telefone do cliente na tela de acesso + exibido no painel admin
- [x] Feature: consumeAccessCode respeita maxUses (só marca 'used' quando atinge o limite)
- [x] 73 testes passando
- [x] Adicionar teste para access.renew (renovação de tempo)
- [x] Adicionar teste para accessedByPhone (salvar telefone do cliente na validação)
- [x] 80 testes passando
- [x] Bug: Botão Finalizar Pedido trava no "ENVIANDO..." e não redireciona para WhatsApp
- [x] Feature: Tela de confirmação pós-envio com botão grande obrigatório para WhatsApp
- [x] Bug: Redirecionamento WhatsApp dá erro 404 (número com espaços/parênteses limpo automaticamente + URL trocada para api.whatsapp.com/send)
- [x] Teste: sanitização do número WhatsApp (8 testes, 88 total passando)
- [x] Bug: Botão ENVIANDO trava em alguns celulares (fileToBase64 com reject/timeout, mensagens de progresso, tratamento de erro melhorado)
- [x] Feature: PWA - manifest.json com nome, ícones e cores
- [x] Feature: PWA - Service Worker para cache
- [x] Feature: PWA - Meta tags para iOS e Android (fullscreen, splash)
- [x] Feature: PWA - Ícones em vários tamanhos (192x192, 512x512) usando imagem do usuário
- [x] Mover banner de instalação PWA para tela inicial de login (PasswordGate)
- [x] Remover banner de instalação da tela de sucesso pós-pedido (não existia lá)
- [x] Bug: Campo Vídeo de Fundo - adicionado preview no admin + key={URL} para forçar re-render
- [x] Bug: Vídeo de fundo - adicionado playsInline e fallback text nos vídeos
- [x] Bug: Texto dos inputs no AdminSettings invisível (corrigido com inputs nativos + style inline)
- [x] Feature: Controle de acesso por telefone único - mesmo telefone re-entra sem contar novo uso
- [x] Feature: Histórico de telefones que acessaram cada senha VIP no admin (seção expansível)
- [x] Feature: Cada telefone diferente conta como novo uso (currentUses++)
- [x] Feature: consumeAccessCode não duplica contagem (validate já cuida disso)
- [x] Feature: Procedures listPhones e listAllPhones no admin
- [x] Tabela accessCodePhones no banco para histórico de acessos por telefone
- [x] 96 testes passando (28 access + 28 admin + 12 coupons + 16 uploads + 8 whatsapp + 3 email + 1 auth)
- [x] Fix: validateAccessCode permite reentrada do mesmo telefone mesmo quando status = 'used'
- [x] Fix: AdminCodes com loading/error handling para historico de telefones
- [x] Bug CRÍTICO: Telefone que completou pedido NÃO está sendo bloqueado de entrar novamente com a mesma senha VIP
- [x] Adicionar coluna consumed na tabela accessCodePhones
- [x] validateAccessCode bloqueia telefone com consumed=1
- [x] consumeAccessCode recebe phone e marca consumed=1
- [x] submitFiles passa phone para consumeAccessCode e checkAccessCodeCanSubmit
- [x] checkAccessCodeCanSubmit verifica consumed por phone
- [x] AdminCodes mostra badge ATIVO/USADO por telefone
- [x] 97 testes passando, teste de DB real confirmado
- [x] Bug: Telefone que completou pedido ainda aparece ATIVO e consegue entrar de novo - RESOLVIDO: agora bloqueia na primeira entrada
- [x] Regra: Cada telefone só pode ENTRAR 1 vez com a senha VIP - após primeira entrada fica bloqueado para sempre nessa senha
- [x] validateAccessCode: bloquear telefone que já existe em accessCodePhones (1 entrada = bloqueado)
- [x] checkAccessCodeCanSubmit: bloquear telefone que já existe em accessCodePhones
- [x] AdminCodes: todos os telefones mostram badge USADO (vermelho)
- [x] Telefones existentes no banco atualizados para consumed=1
- [x] 97 testes passando
- [x] Bug: Drag-and-drop dos cards de serviço na página admin - implementado com HTML5 Drag API + endpoint reorder
- [x] Endpoint products.reorder no backend para persistir nova ordem
- [x] 99 testes passando (30 admin incluindo reorder)

## Senha VIP com modo "Só Tempo" (timeOnly)
- [x] Adicionar coluna timeOnly (boolean) na tabela accessCodes
- [x] Migração SQL para nova coluna
- [x] Atualizar consumeAccessCode: se timeOnly=true, NÃO marcar como 'used' após uso
- [x] Atualizar validateAccessCode: se timeOnly=true, permitir reentrada enquanto não expirar
- [x] Atualizar AdminCodes: toggle para ativar/desativar modo timeOnly ao criar senha
- [x] Atualizar AdminCodes: exibir indicador visual quando senha é timeOnly
- [x] Testes para comportamento timeOnly (não desativa após uso, respeita tempo)
- [x] 104 testes passando (7 arquivos)

## Cores personalizadas nos Cards de Serviço
- [x] Adicionar coluna cardColor na tabela products
- [x] Migração SQL para nova coluna
- [x] Atualizar createProduct e updateProduct para aceitar cardColor
- [x] Atualizar AdminProducts: seletor de cor na criação e edição de cards
- [x] Atualizar Home.tsx: aplicar cor personalizada nos cards de serviço
- [x] Testes para criação/edição com cor personalizada
- [x] 108 testes passando (7 arquivos)

## Cores individuais por camada nos Cards (4 camadas)
- [x] Adicionar colunas cardBgColor, cardTextColor, cardBtnColor na tabela products
- [x] Migração SQL para novas colunas
- [x] Atualizar createProduct/updateProduct para aceitar as 3 novas cores
- [x] Atualizar routers products.create/update para aceitar as 3 novas cores
- [x] AdminProducts: seletores de cor individuais para borda, fundo, texto e botão
- [x] Home.tsx: aplicar as 4 cores nos cards (borda, fundo, texto, botão)
- [x] Testes para criação/edição com cores individuais
- [x] 110 testes passando (## Bug: Cores dos cards não respeitam as cores escolhidas após atualizar página
- [x] Investigar por que as cores não são carregadas corretamente após refresh
- [x] Corrigir o problema (input type=color salvava valor padrão - resolvido com ColorPicker)
- [x] Testar e salvar checkpointBug: Seletor de cores salva cor padrão do input quando não foi escolhida
- [x] Input type=color tem valor padrão (ex: #1e1b4b, #080808) que é enviado mesmo sem o admin ter escolhido
- [x] Corrigir para que cores só sejam salvas quando explicitamente alteradas pelo admin (novo componente ColorPicker com toggle)
- [x] Limpar dados incorretos no banco (todas as cores resetadas para NULL)
- [x] 110 testes passando

## Bug: Cor de fundo personalizada fica preta após refresh na página do cliente
- [x] Investigar como cardBgColor é aplicada no Home.tsx
- [x] Verificar se o valor está correto no banco mas não é aplicado no frontend
- [x] Causa raiz: conflito entre backgroundColor e background no mesmo style object do React
- [x] Correção: usar apenas 'background' para ambos os casos (cor sólida e gradiente)
- [x] Confirmado: cores funcionam corretamente após refresh
- [x] 110 testes passando

## Sistema de Cadastro de Clientes
- [x] Criar tabela customers no banco (id, name, phone, city, referredBy, createdAt, updatedAt)
- [x] Migração SQL para tabela customers
- [x] Procedures: customers.checkByPhone, customers.register, customers.list, customers.update, customers.delete
- [x] Frontend: tela de cadastro obrigatória após login (se telefone não cadastrado)
- [x] Frontend: se telefone já cadastrado, pular direto para pedidos
- [x] Mover campo "quem indicou" do formulário de pedido para o cadastro
- [x] Painel admin /admin/customers: listagem de todos os clientes cadastrados
- [x] Admin: editar dados do cliente
- [x] Admin: deletar cliente
- [x] Admin: exportar lista de clientes (CSV)
- [x] Testes para CRUD de customers e fluxo de cadastro
- [x] Link 'Clientes' na navegação do admin
- [x] 120 testes passando (8 arquivos)

## Campo Telefone de Quem Indicou
- [x] Adicionar coluna referredByPhone na tabela customers
- [x] Migração SQL para nova coluna
- [x] Atualizar procedures (register, update) para aceitar referredByPhone
- [x] Atualizar formulário de cadastro no Home.tsx com campo telefone do indicador
- [x] Atualizar AdminCustomers para exibir/editar telefone do indicador
- [x] Atualizar exportação CSV com nova coluna
- [x] Testes atualizados

## Telefone obrigatório + validação de dígitos
- [x] Tornar referredByPhone obrigatório no formulário de cadastro (quem indicou nome continua opcional)
- [x] Adicionar máscara de telefone (11 dígitos: DDD + 9 dígitos) nos campos de telefone
- [x] Validação frontend: bloquear envio se telefone não tiver quantidade correta de dígitos
- [x] Atualizar backend: referredByPhone como campo obrigatório na procedure register

## Cadastro antes da senha (tela inicial)
- [x] Mover formulário de cadastro para o PasswordGate (antes da senha)
- [x] Fluxo: cliente digita telefone → se não cadastrado, mostra formulário de cadastro → depois pede senha
- [x] Se telefone já cadastrado, pula direto para pedir a senha
- [x] Remover formulário de cadastro do Home.tsx (não precisa mais lá)

## Ajustes no cadastro
- [x] Telefone de quem indicou volta a ser OPCIONAL
- [x] Separar visualmente campos do cliente e campos de quem indicou no formulário

## Cidade e UF obrigatórios no cadastro
- [x] Adicionar coluna 'uf' na tabela customers (VARCHAR 2)
- [x] Tornar campo Cidade obrigatório no formulário e backend
- [x] Adicionar campo UF obrigatório no formulário (select com estados brasileiros)
- [x] Atualizar AdminCustomers para exibir UF

## Foto de Perfil com imagem modelo no modal de envio
- [x] Quando campo é "Foto de Perfil", mostrar foto de exemplo/modelo automaticamente
- [x] Ao cliente enviar sua foto, substituir a foto modelo pela foto real do cliente (preview)
- [x] Foto do cliente fica visível no lugar do modelo após upload

## Foto exemplo personalizada por documento dinâmico
- [x] Adicionar coluna exampleImageUrl na tabela optionDocuments
- [x] Migração SQL para nova coluna
- [x] Atualizar backend (procedures) para aceitar e retornar exampleImageUrl
- [x] Atualizar painel admin para upload de foto exemplo por documento
- [x] Atualizar Home.tsx para usar foto exemplo personalizada em vez do padrão

## Bug: admin/codes não abre (erro)
- [x] Investigar e corrigir erro na página admin/codes (usuário confirmou que estava ok)

## Sistema de Sorteio
- [x] Criar tabelas raffles e raffle_entries no banco
- [x] Backend: procedures para criar sorteio, escolher número, listar entradas, sortear, resultado
- [x] Frontend cliente: escolha de número de 1 a 100 na página principal
- [x] Frontend cliente: exibição do resultado do sorteio com dados do ganhador
- [x] Painel admin: criar/gerenciar sorteios e realizar sorteio
- [x] Painel admin: ver números escolhidos e dados dos clientes
- [x] Painel admin: botão ativar/desativar sorteio (quando desativado, não aparece pro cliente)
- [x] Painel admin: formulário para editar regras do sorteio (título, descrição)

## Aviso de sorteio após cadastro/login
- [x] Adicionar banner/aviso chamativo para participar do sorteio no final da página principal após o cliente logar

## Foto de perfil no cadastro do cliente
- [x] Adicionar coluna profilePhotoUrl na tabela customers
- [x] Atualizar backend para aceitar upload de foto no cadastro
- [x] Adicionar campo de foto de perfil no formulário de cadastro (PasswordGate)
- [x] Pedir foto de perfil somente se cliente não tiver foto no banco (cadastro novo ou login existente)
- [x] Exibir foto de perfil no painel admin junto com dados do cliente

## Sorteio: 1 número por cadastro sem alterar
- [x] Backend: validar que telefone só pode escolher 1 número por sorteio (bloquear se já escolheu)
- [x] Frontend: se cliente já escolheu número, mostrar qual escolheu sem permitir alterar

## Foto de perfil obrigatória no cadastro
- [x] Remover botão "Pular por agora" na etapa de foto de perfil (tornar obrigatório)

## Último acesso do cliente no a- [x] Adicionar coluna lastAccessAt na tabela customers
- [x] Atualizar procedure validate para registrar lastAccessAt quando login é válido
- [x] Exibir último acesso no painel admin de clientes# Layout mobile PasswordGate
- [x] Corrigir tela inicial: formulário maior, ocupa tela toda no celular, elementos maiores

## 3 melhorias mobile/sorteio
- [x] Campos maiores no formulário de cadastro (nome, cidade, UF, telefone indicador) para mobile
- [x] Câmera na etapa de foto de perfil (além de galeria)
- [x] Foto de perfil do ganhador no resultado do sorteio

## Animação de confete no resultado do sorteio
- [x] Instalar biblioteca canvas-confetti
- [x] Disparar confete ao exibir a foto do ganhador no resultado do sorteio

## Botão "Ver resultado" no banner do sorteio
- [x] Adicionar id="raffle-result" na seção de resultado do sorteio
- [x] Adicionar botão "Ver resultado" no banner do sorteio com scroll suave até a seção do ganhador
- [x] Exibir o botão apenas quando houver resultado de sorteio disponível

## Bug: Foto do cliente não aparece no painel admin
- [x] Verificar se profilePhotoUrl está salvo no banco para o cliente
- [x] Verificar fluxo de upload de foto no PasswordGate (câmera/galeria)
- [x] Verificar se AdminCustomers.tsx exibe a foto corretamente
- [x] Corrigir o bug: URL CloudFront expira; migrar para /manus-storage/ estável
- [x] Migrar 16 registros existentes no banco com URL expirada para /manus-storage/

## Modal de foto ampliada no painel admin
- [x] Adicionar estado para foto selecionada no AdminCustomers.tsx
- [x] Tornar a foto clicável (mobile e desktop) com cursor pointer
- [x] Renderizar modal com foto em tamanho grande, nome do cliente e botão fechar
- [x] Fechar modal ao clicar fora ou pressionar Escape

## Bug: Fotos de perfil aparecem cortadas/quebradas no painel admin
- [x] Diagnosticar: /manus-storage/ gera URL assinada com restrição de domínio (403 no deploy)
- [x] Restaurar 17 registros para URL direta do CloudFront (pública, status 200)
- [x] Corrigir código para novos uploads salvarem URL direta do CloudFront

## Foto do cliente nos números selecionados do sorteio
- [x] Retornar profilePhotoUrl junto com os números selecionados na procedure raffles.getNumbers
- [x] Exibir foto circular do cliente na grade de números selecionados

## Foto do cliente como fundo no número selecionado do sorteio
- [x] Atualizar getRaffleEntries no db.ts com LEFT JOIN em customers para retornar profilePhotoUrl
- [x] Adicionar query raffles.entries no Home.tsx com refetch a cada 10s
- [x] Exibir foto do cliente como background-image no quadrado do número ocupado
- [x] Overlay escuro sobre a foto para manter legibilidade do número
- [x] Tooltip com nome do cliente ao passar o mouse sobre o número ocupado

## Admin: reativar número não pago no sorteio
- [x] Criar procedure adminProcedure raffles.removeEntry para deletar entrada pelo id
- [x] Adicionar botão "Liberar" ao lado de cada número na lista de participantes do sorteio no admin
- [x] Confirmar antes de liberar (dialog de confirmação)

## Bug: número 81 bugado no sorteio
- [x] Investigado: número 81 não tinha entrada no banco — era erro do usuário, não bug do sistema

## Data/hora da escolha na lista de participantes
- [x] Exibir data e hora da escolha do número na lista de participantes do sorteio no admin

## Status de pagamento nas entradas do sorteio
- [x] Adicionar campo paymentStatus (pago/aguardando) na tabela raffleEntries
- [x] Migrar schema e banco
- [x] Botão para marcar como pago/aguardando na lista de participantes

## Notificação ao admin quando alguém escolher número
- [x] Chamar notifyOwner na procedure chooseNumber com nome, telefone e número escolhido

## Bug: formulário de cadastro pequeno no mobile
- [x] Corrigir PasswordGate: remover max-w-md no mobile, card ocupa 100% da largura sem bordas laterais

## PWA: banner de instalação no painel admin
- [x] Adicionar banner de instalação PWA no DashboardLayout para o admin instalar o app no celular

## Bug: banner PWA não aparece em /admin/codes
- [x] Verificado: nenhuma página admin usa DashboardLayout
- [x] Criar componente AdminPWABanner global e adicionar no App.tsx para todas as rotas /admin/*

#### Bug: app admin abre na página do cliente (start_url errado)
- [x] Criar manifest-admin.json com start_url /admin/codes
- [x] Injetar manifest-admin.json dinamicamente nas rotas /admin/* via useEffect no App.tsx
## Bug: painel admin pedindo login Manus OAuth no computador
- [x] Investigar fluxo de autenticação admin
- [x] Corrigir para usar o sistema de senha/código admin existente
## Login admin independente do Manus OAuth
- [x] Criar tabela admin_credentials no banco (username, password_hash)
- [x] Criar procedure adminAuth.login com bcrypt e JWT/cookie de sessão
- [x] Criar procedure adminAuth.logout e adminAuth.check
- [x] Criar página AdminLogin.tsx com formulário de usuário/senha
- [x] Substituir guard useAuth() Manus por useAdminAuth() em todas as páginas admin
- [x] Criar credencial padrão inicial (admin/walk2026) no banco

## Correção: upload comprovante PIX
- [x] Aceitar PDF, JPG, PNG e WebP no comprovante PIX (era só image/*)
- [x] Aumentar limite de tamanho para 10MB
- [x] Mostrar preview de ícone para PDF (em vez de tentar renderizar como imagem)
- [x] Passar paymentProofMime para o backend usar extensão e content-type corretos
- [x] Corrigir backend submitFiles e submitPaymentProof para usar mime dinâmico

## Edição da tela de login (PasswordGate) pelo admin
- [x] Adicionar settings: login_title, login_subtitle, login_footer, login_image_url, login_show_image, login_show_title, login_show_subtitle, login_show_footer no banco
- [x] Criar seção "Tela de Login" no AdminSettings com campos de texto e upload de imagem
- [x] Atualizar PasswordGate para carregar e exibir as configurações dinâmicas
- [x] Permitir remover/ocultar cada elemento individualmente (toggle on/off)

## Sistema de status do pedido
- [x] Adicionar tabela `orderStatusHistory` para histórico de mudanças
- [x] Adicionar campo email obrigatório no formulário de cadastro (PasswordGate)
- [x] Salvar email no customers
- [x] Criar procedure `orderStatus.update` (admin) com os status: recebido, em_andamento, documentos_aprovados, conta_ativa
- [x] Enviar email automático ao cliente quando o status mudar
- [x] Criar página AdminOrders com UI de status e botões de ação
- [x] Exibir status atual do pedido na tela do cliente com banner colorido
- [x] Mostrar histórico de status na tela do cliente via getMyStatus

## AdminOrders - melhorias
- [x] Adicionar status "pagamento_recebido" na lista de status dos pedidos
- [x] Adicionar botão de cancelar pedido (status "cancelado" com email ao cliente)
- [x] Adicionar botão de deletar pedido (remove do banco com confirmação)
- [x] Filtrar pedidos de sorteio (codeType = 'raffle') para não aparecerem na página de Pedidos

## AdminOrders - informações do cliente e seleção em massa
- [x] listOrders retornar dados completos do cliente (cidade, UF, indicador, telefone indicador, foto)
- [x] Exibir informações completas do cliente no card do pedido (cidade, UF, indicador, email)
- [x] Formulário de edição dos dados do cliente dentro do pedido (nome, email, cidade, UF, indicador)
- [x] Procedure customers.update com email para salvar alterações do cliente pelo admin
- [x] Seleção em massa com checkbox em cada pedido
- [x] Botão "Deletar Selecionados" quando há pedidos selecionados
- [x] Confirmação antes de deletar em massa

## Pedido manual pelo admin
- [x] Procedure orderStatus.createManualOrder: criar cliente + registro de acesso + status inicial + email
- [x] Página AdminNewOrder.tsx com formulário completo (nome, telefone, email, cidade, UF, indicador, status inicial, observação)
- [x] Botão "Novo Pedido" na página AdminOrders
- [x] Rota /admin/orders/new registrada no App.tsx

## Aviso de email nos formulários
- [x] Aviso no campo email do formulário AdminNewOrder: email é só para notificações, não para criar conta
- [x] Aviso no campo email do formulário do cliente (Home.tsx / cadastro)
- [x] Aviso no formulário de edição do cliente em AdminOrders (aba Cliente)

## Produto no pedido
- [x] listOrders retornar o produto/serviço escolhido pelo cliente
- [x] Exibir produto/serviço no card do pedido em AdminOrders
- [x] Adicionar seleção de produto no formulário AdminNewOrder
- [x] createManualOrder aceitar e salvar o produto selecionado
- [x] Perguntas dinâmicas da opção no formulário AdminNewOrder
- [x] Exibir respostas das perguntas na aba Cliente do AdminOrders
- [x] Salvar produto e respostas no submitFiles (pedido via site)
- [x] Migration SQL: campos serviceName, serviceOption, answers na orderStatusHistory

## Preenchimento automático por telefone
- [x] Procedure pública customers.checkByPhone já existia, reutilizada
- [x] AdminNewOrder: busca automática ao digitar telefone, pré-preenche nome/email/cidade/UF/indicador
- [x] Home.tsx: busca automática ao digitar telefone, pré-preenche nome/email/cidade/indicador
- [x] Indicador visual de "cliente encontrado" ou "novo cliente" nos formulários

## Correção: edição de telefone do cliente
- [x] Adicionar campo de telefone editável na aba Cliente do AdminOrders
- [x] Backend: procedure customers.update aceitar campo phone
- [x] db.ts: updateCustomer aceitar campo phone

## Correção: edição de telefone em AdminCustomers
- [x] Corrigir campo telefone na página AdminCustomers para salvar corretamente
- [x] Campo nome com min-w para aparecer completo na edição

## Correção: nome no email de notificação
- [x] Corrigir "Walk Contas" para "Walk Ajuda" no email de notificação enviado ao cliente
- [x] Corrigir "Walk Contas" para "Walk Ajuda" no banner de instalação do PWA

## Melhorias no email de notificação
- [x] Corrigir "Walk Contas" para "Walk Ajuda" no email de notificação
- [x] Adicionar texto "Status do Seu Pedido" no banner/cabeçalho do email
- [x] Adicionar subtexto "Atualização do seu pedido" abaixo do título
- [x] Borda roxa no card de status para destaque visual

## Cores dos status no AdminOrders
- [x] Recebido: laranja
- [x] Pgto. Recebido: âmbar
- [x] Em Andamento: laranja claro
- [x] Docs Aprovados: âmbar claro
- [x] Conta Ativa: verde (diferenciado)
- [x] Cancelado: vermelho

## Upload de foto de perfil pelo admin
- [x] Procedure customers.uploadProfilePhoto já existia como publicProcedure com phone, reutilizada
- [x] Botão de upload de foto na página AdminCustomers: avatar clicável com overlay de câmera
- [x] Botão de upload de foto na aba Cliente do AdminOrders: avatar grande clicável com overlay "Trocar foto"

## Novo status: Pedido Entregue
- [x] Adicionar "pedido_entregue" no enum do schema.ts e migration SQL
- [x] Atualizar addOrderStatus no db.ts com novo status
- [x] Atualizar procedures no routers.ts com novo status (update + createManualOrder)
- [x] Adicionar STATUS_CONFIG "pedido_entregue" no AdminOrders (cor teal)
- [x] Adicionar opção no seletor de status do AdminNewOrder

## Email obrigatório nos formulários
- [x] Home.tsx: campo email obrigatório (label com *, validação de formato e vazio)
- [x] AdminNewOrder.tsx: campo email obrigatório com validação
- [x] Backend routers.ts: submitFiles e createManualOrder exigem email não vazio

## Divisão do step cadastro em dois sub-steps
- [x] Sub-step 'dados': formulário pessoal (nome, telefone, cidade, email) com botão CONTINUAR PARA PAGAMENTO
- [x] Sub-step 'pagamento': resumo do pedido, PIX, upload de comprovante, botão FINALIZAR
- [x] Botão Voltar no sub-step pagamento retorna para sub-step dados
- [x] Todos os 5 setStep('cadastro') resetam cadastroSubStep para 'dados'

## Botão Reenviar Email no painel admin
- [x] Adicionar procedure orderStatus.resendEmail no servidor
- [x] Adicionar botão "Reenviar Email" no AdminOrders
- [x] Botão só aparece quando pedido tem email e status registrado
- [x] Feedback visual (loading + toast)

## Email de confirmação ao cliente ao finalizar pedido
- [x] Enviar email ao cliente quando ele finaliza o pedido (submitFiles)
- [x] Email com mensagem de agradecimento + resumo do pedido (serviço, opção, respostas do formulário)
- [x] Email só enviado se cliente tiver email cadastrado

## Página de acompanhamento de pedido para o cliente
- [x] Criar página /acompanhar com campo de telefone para consulta
- [x] Exibir histórico de status do pedido (timeline visual)
- [x] Mostrar dados do pedido (serviço, opção, data)
- [x] Registrar rota /acompanhar no App.tsx
- [x] Adicionar link de acesso na tela de sucesso pós-pedido

## Animação no botão de envio do pedido
- [x] Spinner animado + mensagens rotativas no botão "Enviando pedido..."
- [x] Overlay de loading com progresso visual durante o envio

## Link de acompanhamento nos emails de status
- [x] Adicionar link /acompanhar no email de confirmação ao finalizar pedido
- [x] Adicionar link /acompanhar no email de atualização de status (orderStatus.update)
- [x] Adicionar link /acompanhar no email de reenvio (orderStatus.resendEmail)

## Exportar pedidos para CSV
- [x] Botão "Exportar CSV" no painel AdminOrders
- [x] Exportar todos os campos: nome, telefone, email, cidade, serviço, opção, status, data

## Filtro de pedidos por data
- [x] Filtros rápidos: Hoje, 7 dias, 30 dias, Todos
- [x] Filtro aplicado no frontend sem nova requisição ao servidor

## Notificação por WhatsApp ao atualizar status
- [x] Botão "Notificar via WhatsApp" no painel de status de cada pedido
- [x] Mensagem pré-formatada com status, nome do cliente e link de acompanhamento

## Correção de roteamento SPA para /acompanhar
- [x] Servidor Express deve servir index.html para todas as rotas SPA (incluindo /acompanhar)
- [x] Link /acompanhar no email deve funcionar corretamente no site publicado

## Tela de Boas-Vindas com Dois Botões no PWA
- [x] Criar tela inicial de escolha com dois botões: "Fazer Pedido" e "Acompanhar Pedido"
- [x] Tela aparece antes do PasswordGate quando o app é aberto
- [x] Botão "Fazer Pedido" leva ao fluxo normal (/)
- [x] Botão "Acompanhar Pedido" leva direto para /acompanhar (sem precisar de senha)
- [x] Design atrativo com logo e identidade visual do WALK CONTAS

## Download da foto do cliente no painel admin
- [x] Adicionar botão "Baixar Foto" ao lado do botão "Trocar Foto" na listagem de clientes (AdminCustomers)
- [x] Ao clicar, faz download da foto com o nome do cliente como nome do arquivo

## Download de documentos do pedido no painel admin
- [x] Adicionar botão de download para cada documento/arquivo enviado pelo cliente no painel AdminOrders
- [x] Download funciona para comprovante PIX, foto do documento, alvará e qualquer outro arquivo do pedido
- [x] Nome do arquivo baixado inclui o nome do cliente e tipo do documento

## Documentos do pedido salvos no S3 e visualizáveis no painel admin
- [x] Criar tabela orderFiles no banco (registrationId, label, fileUrl, fileKey, mimeType, createdAt)
- [x] Migração SQL para nova tabela
- [x] submitFiles salva todos os documentos no S3 e registra URLs no banco (orderFiles)
- [x] Remover anexos do email (email continua com dados textuais + link para ver no painel)
- [x] Procedure tRPC orderStatus.getFiles para listar arquivos de um pedido por registrationId
- [x] AdminOrders exibe lista de documentos com botão de download para cada arquivo
- [x] Download funciona para imagens (JPG, PNG) e PDFs

## Upload e exclusão de documentos pelo admin no painel
- [x] Procedure tRPC orderStatus.uploadFile para admin enviar documento em qualquer pedido
- [x] Procedure tRPC orderStatus.deleteFile para admin excluir documento de um pedido
- [x] Aba Docs do AdminOrders exibe botão de upload de novo documento (com campo de label)
- [x] Cada documento existente tem botão de excluir (lixeira) além de visualizar e baixar
- [x] Funciona para pedidos manuais e normais

## Correção de fuso horário no filtro de pedidos
- [x] Filtro "Hoje" usa UTC em vez do horário local (GMT-3), fazendo pedidos noturnos sumirem
- [x] Corrigir comparação de datas no filtro para usar o horário local do browser

## Selo "NOVO" em pedidos não visualizados
- [x] Rastrear quais pedidos já foram abertos usando localStorage
- [x] Exibir selo "NOVO" animado nos pedidos não visualizados
- [x] Remover o selo ao expandir/abrir o pedido
- [x] Mostrar contador de pedidos novos no título da página

## Observação editável no status "Entregue"
- [x] Adicionar coluna `note` na tabela orderStatusHistory (TEXT, nullable)
- [x] Procedure tRPC para salvar/atualizar observação de um status
- [x] Procedure tRPC para buscar observação do status "Entregue" de um pedido
- [x] UI: campo de texto editável aparece quando o pedido está com status "Entregue"
- [x] Botão salvar observação com feedback visual
- [x] Observação exibida no histórico de status

## Bug: Observação não enviada no email do status Entregue
- [x] Procedure updateNote deve buscar email e nome do cliente e reenviar email com a observação atualizada
- [x] Email do status Entregue deve incluir a observação salva pelo admin

## Observação visível na página de acompanhamento do cliente
- [x] Procedure tRPC getMyStatus deve retornar a nota (note) do status atual
- [x] Página OrderTracking exibe bloco de observação quando status é "Entregue" e há nota salva

## Bug: Observação não aparece na página de acompanhamento
- [x] UPDATE deve atualizar todos os registros de pedido_entregue do mesmo registrationId (não apenas um)
- [x] Página OrderTracking deve buscar a nota no registro mais recente de pedido_entregue que tenha nota

## Ocultar observação na página de acompanhamento
- [x] Observação fica oculta por padrão com botão "Ver informações" para revelar
- [x] Corrigir busca da nota para usar currentNote em vez de history[0].note

## Senha de acesso na página de acompanhamento
- [x] Após digitar o telefone e encontrar o pedido, exibir campo de senha (4 dígitos)
- [x] Senha correta = últimos 4 dígitos do telefone cadastrado (validação no frontend)
- [x] Só após validar a senha o cliente vê os detalhes, observação e histórico
- [x] Emails de notificação informam: "Sua senha de acesso é: XXXX"

## Bloqueio permanente de PIN após 3 tentativas
- [x] Criar tabela pinBlocks no banco (phone, attempts, blocked, createdAt, updatedAt)
- [x] Procedure pública checkPinAttempt: registra tentativa e retorna se bloqueado
- [x] Procedure admin unlockPin: desbloqueia um telefone
- [x] Frontend conta tentativas via backend, mostra tela de bloqueio após 3 erros
- [x] Painel admin exibe botão "Desbloquear" no pedido quando o telefone está bloqueado

## Exibir todos os campos do formulário na aba Cliente do AdminOrders
- [x] Verificar todos os campos salvos no banco (registrations + customers) para cada pedido
- [x] Exibir todos os campos preenchidos na aba Cliente: nome escolhido, modelo do carro, placa, cor, ano, etc.
- [x] Campos devem aparecer organizados por seção (dados pessoais, dados do veículo, etc.)

## Ordenação de pedidos por número no AdminOrders
- [x] Adicionar botão de ordenação crescente/decrescente pelo número (ID) do pedido
- [x] Estado de ordenação persiste durante a sessão
- [-] Pedidos manuais sem número no nome recebem automaticamente o ID antes do nome ao salvar (cancelado a pedido do usuário)

## Bug: Ordenação por número não extrai o número do nome
- [x] Corrigir ordenação para extrair o número do início do nome do cliente (ex: "6791 Guilherme" → 6791) em vez de usar o ID interno do banco

## Busca por número de pedido no AdminOrders
- [x] Atualizar filtro de busca para também corresponder ao prefixo numérico do nome do cliente (ex: digitar "6791" encontra "6791 Guilherme")
- [x] Atualizar placeholder da barra de busca para "Buscar por número, nome, telefone ou email..."

## Notificação sonora de novo pedido + Status "Em Montagem"
- [x] Adicionar status "Em Montagem" na lista STATUS_ORDER e STATUS_CONFIG do AdminOrders
- [x] Adicionar status "Em Montagem" na lista de status do OrderTracking (página do cliente)
- [x] Tocar bipe sonoro automático quando detectar novo pedido com selo "NOVO" no painel admin
- [x] Som gerado via Web Audio API (sem arquivo externo)

## Ajustes na página de Pedidos e OrderTracking
- [x] Remover "Em Montagem" da timeline do cliente (OrderTracking) — manter apenas no painel admin
- [x] Filtrar pedidos na página AdminOrders: mostrar apenas registros com submittedAt preenchido (pedido finalizado); registros sem submittedAt ficam apenas na página de Clientes como "Cadastrado"
- [x] Adicionar botão de copiar número do pedido (prefixo numérico do nome) no card do pedido no AdminOrders

## Badge "Cadastrado" na página de Clientes
- [x] Buscar quais clientes têm pelo menos um pedido finalizado (existência em orderStatusHistory)
- [x] Exibir badge "Cadastrado" (cinza) nos clientes sem nenhum pedido finalizado
- [x] Exibir badge "Pedido(s)" (verde) nos clientes com pelo menos um pedido finalizado

## Editar/Excluir dados do pedido no AdminOrders
- [x] Criar procedure updateOrderData para atualizar serviceName, serviceOption e answers do primeiro registro em orderStatusHistory do pedido
- [x] Adicionar botão Editar nos campos Serviço, Nome/Opção e respostas do formulário no painel expandido do pedido
- [x] Formulário inline de edição com campos para serviceName, serviceOption e answers (JSON editável)
- [x] Botão Excluir para remover o pedido inteiro (já existe deleteOrder) com confirmação

## Configuração de modo de captura de foto do cliente
- [x] Criar tabela appSettings no banco (chave/valor) para armazenar configurações globais
- [x] Criar procedures getAppSetting e setAppSetting no servidor
- [x] Criar procedure pública getPhotoMode para o formulário do cliente ler a configuração
- [x] Adicionar painel "Configurações de Foto" no AdminSettings (ou AdminOrders) com 4 opções: câmera, galeria, ambos, desativado
- [x] No formulário de pedido do cliente, aplicar o atributo capture="user" (câmera), accept sem capture (galeria), ou ambos conforme config
- [x] Exibir mensagem de instrução obrigatória "Envie uma foto de rosto clara" no campo de foto do cliente
- [x] Quando modo = desativado, ocultar o campo de foto do formulário

## Senha Fixa Individual por Cliente
- [x] Adicionar campos fixedPassword (varchar 64) e fixedPasswordActive (tinyint) na tabela customers
- [x] Gerar migração SQL e aplicar no banco
- [x] Criar procedure customers.setFixedPassword (admin): salvar senha fixa e ativar/desativar
- [x] Criar procedure customers.getFixedPassword (admin): retornar senha fixa e status
- [x] Modificar a lógica de autenticação para aceitar a senha fixa quando ativa (além das senhas VIP)
- [x] Adicionar painel de senha fixa no AdminCustomers: campo de senha, botão gerar aleatória, toggle ativar/desativar
- [x] Criar aba "Meus Dados" na tela do cliente (OrderTracking ou PasswordGate) com nome, telefone, cidade, email — somente leitura
- [x] Criar procedure pública customers.getMyProfile para o cliente ler seus próprios dados via phone+PIN

## Indicador de cadeado e histórico de acessos
- [x] Exibir cadeado verde (ativo) ou cinza (inativo/sem senha) no card do cliente ao lado do badge Pedido/Cadastrado
- [x] Incluir lastAccessAt no retorno da procedure customers.getFixedPassword para exibir no modal
- [x] Exibir último acesso no modal de senha fixa

## Controle de acesso por produto via senha fixa
- [x] Criar tabela customerProductAccess (phone, productId) no schema.ts
- [x] Gerar migração SQL e aplicar no banco
- [x] Criar procedure customers.setProductAccess (admin): salvar lista de productIds permitidos para um phone
- [x] Criar procedure customers.getProductAccess (admin): retornar lista de productIds permitidos
- [x] Criar procedure pública customers.getAllowedProducts: retornar lista de productIds permitidos para um phone (usado pelo cliente)
- [x] No modal de senha fixa do admin: exibir checkboxes de todos os produtos ativos para selecionar quais o cliente pode acessar
- [x] Na tela do cliente (Home.tsx): se o cliente tiver permissões configuradas, filtrar os cards de produtos para mostrar apenas os permitidos; sem configuração = vê tudo

## Controle de produtos na Senha VIP
- [x] Adicionar campo allowedProductIds (JSON) na tabela accessCodes
- [x] Gerar migração SQL e aplicar no banco
- [x] Atualizar procedure access.create para aceitar allowedProductIds opcional
- [x] Adicionar checkboxes de produtos no formulário Criar Nova Senha VIP no AdminAccess
- [x] Na tela do cliente: ao usar senha VIP, buscar allowedProductIds da senha e filtrar produtos exibidos

## Aba Urgente nos Pedidos
- [x] Adicionar campo isUrgent (tinyint) na tabela orderStatusHistory
- [x] Gerar migração SQL e aplicar no banco
- [x] Criar procedure orders.toggleUrgent para marcar/desmarcar pedido como urgente
- [x] Adicionar botão de urgência no card do pedido no AdminOrders (ícone de sirene/alerta)
- [x] Adicionar aba "Urgente 🚨" na barra de filtros do AdminOrders
- [x] Destaque visual nos cards de pedidos urgentes (borda vermelha pulsante)
- [x] Contador de pedidos urgentes no badge da aba

## Destaque de indicador e alerta de comissão
- [x] Verificar onde o campo "indicado por" é armazenado no banco (referredBy/referredByPhone)
- [x] Exibir nome e telefone de quem indicou em destaque no card do pedido (badge amarelo/laranja)
- [x] Exibir alerta "💰 Pagar Comissão" em vermelho/laranja quando o campo de indicação estiver preenchido
- [x] Garantir que o campo aparece tanto na visualização compacta quanto na expandida do card

## Gestão de Comissões
- [x] Adicionar campo commissionPaid (tinyint, default 0) na tabela orderStatusHistory
- [x] Gerar migração SQL e aplicar no banco
- [x] Criar procedure orders.toggleCommissionPaid para marcar/desmarcar comissão como paga
- [x] Adicionar commissionPaid ao retorno de listOrders
- [x] Adicionar filtro "Com Indicador" na barra de filtros do AdminOrders
- [x] Botão para marcar comissão como paga no card do pedido (badge muda de vermelho para verde)
- [x] Criar página AdminCommissions com relatório de todos os pedidos com indicador
- [x] Relatório agrupado por indicador com total de pedidos e status de comissão
- [x] Botão de exportar CSV na página de relatório de comissões
- [x] Adicionar link para AdminCommissions no menu lateral

## Validação de auto-indicação
- [x] Frontend: bloquear envio se o telefone do indicador for igual ao telefone do próprio cliente (mostrar erro "Você não pode indicar a si mesmo")
- [x] Backend: ignorar/limpar o campo referredByPhone se for igual ao phone do cliente ao salvar o cadastro
- [x] Tela de confirmação pós-pedido: após cliente finalizar pedido, exibir modal com senha de acompanhamento em destaque grande (últimos 4 dígitos do telefone), com aviso para guardar a senha
- [x] Bug: deleteOrder e deleteOrdersBulk não decrementavam currentUses ao excluir pedido — corrigido para decrementar e restaurar status 'active' se necessário
- [x] Bug: JOIN na query listOrders usava comparação direta de telefone sem normalização — corrigido para usar REGEXP_REPLACE em todos os JOINs. Quando admin altera telefone do cliente, acp.phone e orderStatusHistory.customerPhone também são atualizados.

## Abas de Produto no AdminOrders
- [x] Pedidos agrupados em abas horizontais por produto (serviceName)
- [x] Sub-grupos por opção de serviço (PRIMEIRO/NOME, NOME/ALEATORIO, NOME COMPLETO) dentro de cada aba
- [x] Cards em grid responsivo (1→2→3→4 colunas)
- [x] Card expandido ocupa largura total (col-span-full)
- [x] Aba "Entregues" separada das abas de produto
- [x] Todos os produtos aparecem como abas mesmo com 0 pedidos (query trpc.products.list)
- [x] Bug: aba duplicada "GRUPO FIDELIDAE UBER" corrigida com normalização case-insensitive + trim na comparação de nomes
- [x] Bug: apenas o primeiro card de cada sub-grupo aparecia — corrigido fechamento JSX duplicado

## Edição de Pedido - Dropdowns de Serviço e Opção
- [x] Campo "Serviço" na edição de pedido deve ser um dropdown com todos os produtos cadastrados (não texto livre)
- [x] Campo "Nome / Opção escolhida" deve ser um dropdown com as opções do produto selecionado
- [x] Ao trocar o produto, as opções do dropdown de opção devem atualizar dinamicamente

## Novo Status - Aguardando Ficar Ativa
- [x] Adicionar status "aguardando_ativa" ao tipo OrderStatus no AdminOrders.tsx
- [x] Configurar visual (cor, ícone, label) para o novo status (lime/verde-claro, ícone Clock)
- [x] Inserir na ordem correta do STATUS_ORDER (após conta_ativa, antes de pedido_entregue)
- [x] Atualizar o enum/tipo no servidor (routers.ts, db.ts, schema.ts) e migrar banco
- [x] Atualizar a página do cliente (OrderTracking.tsx) e AdminNewOrder.tsx para exibir o novo status

## Texto Explicativo de Status no OrderTracking
- [x] Adicionar texto/tooltip explicativo para o status "Aguardando Ficar Ativa" na tela de acompanhamento do cliente

## Status Editáveis pelo Admin
- [x] Criar tabela orderStatusTypes no banco (id, key, label, color, icon, description, sortOrder, isSystem, isActive)
- [x] Migrar status fixos existentes como registros iniciais (seed dos 9 status)
- [x] Procedures CRUD: statusTypes.list, statusTypes.create, statusTypes.update, statusTypes.delete, statusTypes.toggle
- [x] Página AdminStatusTypes no painel admin para gerenciar status (/admin/status-types)
- [x] AdminOrders: carregar STATUS_CONFIG dinamicamente do banco via trpc.statusTypes.list
- [x] Campo status de mysqlEnum para varchar no schema + migração aplicada
- [x] Texto explicativo por status: campo description editável pelo admin (exibido no OrderTracking)

## Bugs - Status Dinâmicos
- [x] Bug: Email de notificação mostrando número (sortOrder) em vez do label do status
- [x] Bug: OrderTracking não respeita label/ícone/cor editados pelo admin — agora usa status dinâmicos do banco (trpc.statusTypes.list)

## Bugs - Status Dinâmicos (corrigidos)
- [x] Email mostrando número "10" em vez do label do status - key era "10", corrigido para "conta_ativa_custom"
- [x] Badge do key interno (ex: documentos_aprovados) removido da listagem de status no admin
- [x] Edição de status agora reflete imediatamente (invalidate + refetch forçado)
- [x] Email agora usa getStatusLabelFromDb - labels dinâmicos do banco em vez de hardcoded
- [x] Espaços extras nos labels do banco removidos via TRIM SQL

## Correções Solicitadas (05/05/2026)
- [x] Campo "Chave" no formulário de Novo Status: gerar automaticamente a partir do Nome exibido (slug) — não deve ser obrigatório digitar manualmente
- [x] Bug: foto de perfil aprovada aparece no email de "Pedido Entregue" — remover foto do email de status de entrega

## Bugs - Status Dinâmicos (sessão 05/05/2026)
- [x] Bug: AdminOrders usa STATUS_CONFIG hardcoded como fallback — status editados/criados pelo admin não aparecem nos botões de seleção de status do pedido
- [x] Bug: cfg pode ser undefined para status do banco que não existem no STATUS_CONFIG estático (ex: conta_ativa_custom, entregue) — crash silencioso
- [x] Campo "Chave" no formulário de Novo Status: gerar automaticamente a partir do Nome exibido (slug) — não deve ser obrigatório digitar manualmente

## Revisão Geral de Status (sessão 05/05/2026 - v2)
- [x] Remover restrição isSystem de todos os status — todos livres para editar e excluir
- [x] Corrigir formulário de cadastro de pedido (AdminNewOrder) para usar status dinâmicos do banco
- [x] Remover badge "Sistema" e cadeado da UI de AdminStatusTypes
- [x] Corrigir backend: deleteOrderStatusType não deve bloquear exclusão por isSystem

## Bug - Upload Comprovante (05/05/2026)
- [x] Bug: "Erro ao processar arquivo. Tente selecionar novamente." aparece no rodapé quando cliente tenta enviar comprovante de pagamento — arquivo aparece na tela mas erro impede finalização

## Melhoria - Badge Urgente nos Cards (05/05/2026)
- [x] Badge URGENTE deve aparecer em todos os cards quando o filtro "Urgente" está ativo (não apenas nos que já têm borda vermelha)

## Aba Pedidos Urgentes (05/05/2026)
- [x] Criar aba/página dedicada no menu lateral do painel admin para exibir todos os pedidos urgentes (isUrgent=1), com os mesmos cards e funcionalidades da página de Pedidos
- [x] Criar painel/card de urgências fixo no topo da página de Pedidos: quando pedido for marcado como urgente, aparece nesse painel em destaque

## Correções Urgentes (05/05/2026)
- [x] Fuso horário: ajustar todas as datas exibidas para São Paulo (UTC-3 / America/Sao_Paulo)
- [x] Foto de perfil obrigatória: bloquear finalização do cadastro sem foto
- [x] Horário de entrada: exibir corretamente o horário que o cliente acessou/entrou no painel admin
- [x] Câmera/Galeria: quando admin ativa apenas câmera e aparelho não tem câmera, bloquear botão e exibir mensagem explicando que é necessário usar aparelho com câmera (não liberar galeria)

## Cadastro Manual de Cliente pelo Admin (05/05/2026)
- [x] Criar formulário de cadastro manual de cliente no painel admin (nome, telefone, email, cidade, foto de perfil)
- [x] Melhorar visual do formulário AdminNewOrder (melhor layout, seções organizadas, visual moderno)
- [x] Ao cadastrar cliente manualmente, criar registro na tabela de clientes sem necessidade de pedido

## Layout de Clientes em Cards (05/05/2026)
- [x] Transformar lista de clientes de tabela para grid de cards (foto, nome, telefone, cidade, status, data)

## Sistema de Banners Editáveis (05/05/2026)
- [x] Criar tabela `info_banners` no banco (id, title, content, bgColor, textColor, isActive, sortOrder, createdAt)
- [x] Criar procedures: listBanners, createBanner, updateBanner, deleteBanner, reorderBanners
- [x] Criar página AdminBanners com editor visual (cor fundo, cor texto, título, conteúdo, preview em tempo real)
- [x] Adicionar item "Banners" no menu lateral do admin
- [x] Exibir banners ativos na página do cliente (Home.tsx) como cards de destaque

## Painel Pedidos Entregues (05/05/2026)
- [x] Criar painel/card de Pedidos Entregues no topo da página de Pedidos (igual ao painel de Urgentes)

## Sincronização de Dados do Pedido com Cadastro do Cliente (05/05/2026)
- [x] Ao finalizar pedido (submitFiles), salvar/atualizar nome, cidade, telefone, email no cadastro do cliente
- [x] Ao finalizar pedido, salvar todos os arquivos enviados (documentos) vinculados ao cadastro do cliente

## Documentos do Cliente no Cadastro (05/05/2026)
- [x] Procedure getFilesByPhone no backend (orderStatus.getFilesByPhone) para listar todos os documentos de um cliente pelo telefone
- [x] Botão FolderOpen (ciano) nos cards de clientes para abrir modal de documentos
- [x] Modal FilesModal: lista todos os documentos enviados pelo cliente com preview de imagem, label, data e link para abrir/baixar

## Banners Pequenos Abaixo dos Cards de Serviço (05/05/2026)
- [x] Mover banners informativos para dentro da seção de serviços, abaixo do grid de cards
- [x] Banners menores: padding reduzido, fonte menor (text-xs), ícone 📢, alinhados ao container da página

## Bug do Vídeo (05/05/2026)
- [x] Corrigir bug do vídeo: quando URL falha ou está vazia, ocultar completamente a seção de vídeo (sem bloco feio de fallback)
- [x] Vídeo só exibe quando VIDEO_URL está preenchida e não houve erro de carregamento

## Botão de Logout e Segurança do Login Admin (06/05/2026)
- [x] Criar componente AdminHeader reutilizável com botão de Sair (logout)
- [x] Adicionar AdminHeader em todas as páginas admin (Codes, Coupons, Products, Settings, Customers, Orders, Commissions, Raffles, NewOrder, StatusTypes, Banners)
- [x] Desativar autocomplete/histórico de senha no formulário de login admin (autocomplete="off" + new-password)

## Auto-Urgente 48h (06/05/2026)
- [x] Pedidos com mais de 48h sem atualização de status são marcados automaticamente como urgentes
- [x] Procedure autoMarkUrgent no backend que verifica pedidos com latestStatusAt > 48h e seta isUrgent=1
- [x] Chamada automática da procedure ao carregar a lista de pedidos no admin

## Seleção em Massa - AdminCustomers (06/05/2026)
- [x] Botão "Selecionar todos com pedidos" no AdminCustomers para selecionar em massa clientes que possuem pedidos

## Número de Pedido Automático (06/05/2026)
- [x] Criar tabela orderCounter com auto_increment iniciando em 10000 para gerar número único por pedido
- [x] Ao criar pedido, gerar número automático a partir do contador (10000, 10001, 10002...)
- [x] Exibir número do pedido nos cards do AdminOrders e no acompanhamento do cliente

## Número de Pedido Automático - orderNumber (06/05/2026)
- [x] Criar tabela orderCounter com AUTO_INCREMENT = 10000 para gerar número único por pedido
- [x] Adicionar coluna orderNumber na tabela orderStatusHistory
- [x] Gerar orderNumber automático ao criar pedido (via INSERT em orderCounter)
- [x] Exibir orderNumber nos cards do AdminOrders com badge visual
- [x] Exibir orderNumber no acompanhamento do cliente

## Número de Cadastro do Cliente (06/05/2026)
- [x] Adicionar coluna customerNumber na tabela customers
- [x] Gerar customerNumber automático ao criar cliente (seqüencial a partir de 1)
- [x] Exibir customerNumber (badge C#) na frente do nome do cliente no AdminCustomers
- [x] Exibir customerNumber (badge C#) na frente do nome do cliente no AdminOrders
- [x] Corrigir: botão "Selecionar todos com pedidos" só aparece quando há clientes com pedidos na lista

## Correções AdminCustomers (06/05/2026 - 3a vez)
- [x] Remover # do badge de número de cadastro (mostrar só o número: 71, não C#71)
- [x] Botão "Selecionar todos com pedidos" filtra a lista mostrando somente clientes com pedidos
- [x] Exibir número do pedido no card do cliente que tem pedido

## Correções Badges e orderNumber Retroativo (06/05/2026)
- [x] Remover C# e P# dos badges no AdminOrders (mostrar só o número)
- [x] Atribuir orderNumber (10000+) retroativamente a todos os 26 pedidos existentes

## Layout Número do Pedido (06/05/2026)
- [x] Número do pedido em linha separada com label "Pedido: 10001" no AdminOrders e AdminCustomers

## Busca por Número de Cadastro (06/05/2026)
- [x] Incluir customerNumber no filtro de busca do AdminCustomers
- [x] Incluir customerNumber e orderNumber no filtro de busca do AdminOrders
- [x] Corrigir: busca filtra também a seção de pedidos urgentes
- [x] Prioridade de busca: número puro busca por customerNumber/orderNumber exato antes de telefone
- [x] BUG CRITICO: busca com filtro ativo agora ignora filtros de status/período (busca global)
- [x] BUG CRITICO: pedidos entregues agora ficam SOMENTE na aba Entregues
- [x] Busca por #10001 para número do pedido, número puro para cadastro
- [x] Exibir Pedido: #número nos cards com botão de copiar
- [x] Exibir número de cadastro com * na frente (ex: *37) no AdminOrders e AdminCustomers

## BUG CRITICO: Pedidos novos não aparecem no admin e não enviam notificações (06/05/2026)
- [x] Investigar e corrigir: pedido novo não aparece no painel admin
- [x] Investigar e corrigir: email de novo pedido não está sendo enviado
- [x] Investigar e corrigir: WhatsApp de novo pedido não está sendo enviado

## BUG: Filtro Todos não mostra todos os pedidos (07/05/2026)
- [x] Corrigir: aba "Todos" adicionada na barra de produtos para mostrar todos os pedidos juntos

## Previsão de Entrega do Pedido (07/05/2026)
- [x] Adicionar coluna deliveryEstimate (int, nullable) na tabela orderStatusHistory
- [x] Criar procedure updateDeliveryEstimate para salvar a previsão
- [x] Adicionar editor de data/hora de previsão de entrega no painel admin (aba Status do pedido)
- [x] Exibir previsão de entrega no acompanhamento do cliente

## Envio de Documentos do Admin para o Cliente (07/05/2026)
- [x] Adicionar coluna fromAdmin (int, default 0) na tabela orderFiles
- [x] Atualizar procedure uploadFile para aceitar fromAdmin e salvar em prefixo admin-docs/
- [x] Criar procedure getAdminFilesForClient (publicProcedure) para o cliente buscar docs do admin
- [x] Reestruturar aba Documentos no AdminOrders: seção verde "Enviar para o Cliente" + seção de docs do cliente
- [x] Exibir documentos do admin no OrderTracking como card verde "Documentos para Você"

## Selo "Novo" em Documentos do Admin para o Cliente (07/05/2026)
- [x] Exibir badge "Novo" (verde, pulsante) nos documentos do admin no OrderTracking até o cliente abrir pela primeira vez
- [x] Marcar documento como lido via localStorage ao clicar (sem necessidade de backend)
- [x] Exibir contador de não lidos no título da seção "Documentos para Você"

## Correção: Acesso ao Acompanhamento Sempre Ativo (07/05/2026)
- [x] Remover bloqueio de acesso ao acompanhamento para pedidos com status "pedido_entregue" ou "cancelado" — PIN ignorado automaticamente para pedidos finalizados

## Aba "Anotações Internas" no Card de Pedido do Admin (07/05/2026)
- [x] Criar tabela orderNotes no banco (id, registrationId, content, createdAt, updatedAt)
- [x] Criar procedures getOrderNotes, saveOrderNote no tRPC (adminProcedure)
- [x] Adicionar aba "Anotações" no card de pedido do AdminOrders
- [x] Editor de texto livre com botão salvar e data da última atualização

## Correção: Permitir Múltiplos Pedidos com Mesmo Telefone (07/05/2026)
- [x] Remover restrição que bloqueava o mesmo telefone de usar a mesma senha mais de uma vez

## Destaque de Números de Contato na Tela de Cadastro (07/05/2026)
- [x] Exibir aviso em destaque informando que o número deve ser o pessoal/particular do WhatsApp do cliente

## Correção: Senha VIP com 2 usos expirando após 1 uso (07/05/2026)
- [x] Permitir que o mesmo telefone use a senha VIP múltiplas vezes enquanto houver usos disponíveis (maxUses)

## Bugs: Pedido Entregue e Múltiplos Pedidos (07/05/2026)
- [x] Pedido entregue sai da lista principal (latestStatus agora busca por registrationId, não por phone)
- [x] Cliente com múltiplos pedidos exibe todos (novo registro em accessCodePhones a cada uso)

## Bug: Timeline OrderTracking não bate com status do Admin (08/05/2026)
- [x] Timeline marca como concluídos status que o pedido nunca passou (usa sortOrder em vez do histórico real)
- [x] Status atual na barra e na timeline deve corresponder exatamente ao que o admin definiu

## Bug: Previsão de Entrega não aparece no OrderTracking (08/05/2026)
- [x] Previsão de entrega salva pelo admin não aparece na página de acompanhamento do cliente

## Regra especial: Status "PEDIDO ENTREGUE" na timeline (08/05/2026)
- [x] Entregue fica verde se existir no histórico E status atual for login_de_acesso ou o próprio entregue
- [x] Se admin mudar para qualquer outro status após entregue, o entregue é desfeito (cinza)
- [x] LOGIN DE ACESSO é o único status que NÃO desfaz o entregue

## Regra especial: "SITESMA EM MANUTEÇÃO UBER" segue mesma regra do entregue (08/05/2026)
- [x] sitesma_em_manutecao_uber segue mesma regra: só fica verde se status atual for login_de_acesso ou ele mesmo

## Bug: Cliente com múltiplos pedidos aparece em uma aba só (08/05/2026)
- [x] Cliente *67 fez dois pedidos mas só aparece em uma aba no admin
- [x] Cada pedido deve aparecer separadamente (admin e página de acompanhamento)
- [x] Corrigir para todos os futuros pedidos do mesmo telefone

## Bug: Admin não mostra múltiplos pedidos do mesmo cliente separados (08/05/2026)
- [x] Cliente *80 fez dois pedidos mas só aparece um card na aba de Pedidos do admin
- [x] Cada pedido do mesmo cliente deve aparecer como card separado na aba de Pedidos

## Regra filtro Entregues no Admin (08/05/2026)
- [x] Pedido com status "PEDIDO ENTREGUE" sai de todos os filtros de produto e fica só na aba Entregues
- [x] Se admin mudar para outro status (exceto LOGIN DE ACESSO), volta ao filtro de produto de origem
- [x] LOGIN DE ACESSO mantém o pedido na aba Entregues (não volta ao produto)

## Bug: Admin mostra apenas 1 pedido por telefone mesmo com múltiplos (08/05/2026)
- [x] Cliente com 4 pedidos aparece como 1 card no admin (listOrders não retorna todos os registrationIds)
- [x] Corrigir query listOrders para retornar 1 card por registrationId (não por telefone)

## Bug: Deletar sub-pedido no admin deleta todos os sub-pedidos do mesmo registrationId (08/05/2026)
- [x] Ao deletar um sub-pedido, o sistema deleta todos os registros do registrationId inteiro
- [x] Corrigir: deletar apenas o histórico do sub-pedido específico (intervalo de datas entre recebidos)
- [x] Se for o único sub-pedido, deletar o registrationId inteiro (comportamento atual correto)

## Bug: Pedidos duplicados no admin com o mesmo número (08/05/2026)
- [x] Pedidos com o mesmo número aparecem múltiplas vezes no admin
- [x] Investigar se a duplicação vem do banco (múltiplos 'recebido' no mesmo sub-pedido) ou da lógica de split
- [x] Corrigir para que cada pedido apareça apenas uma vez

## Soft Delete de Sub-pedidos (08/05/2026)
- [x] Criar tabela hiddenSubOrders (registrationId, subOrderIndex, hiddenAt)
- [x] Procedure hideSubOrder: insere na tabela hiddenSubOrders em vez de deletar do banco
- [x] listOrders: filtrar sub-pedidos que estão na tabela hiddenSubOrders
- [x] Frontend: renomear botão "Deletar" para "Remover" para deixar claro que é ocultação

## Bugs reportados em 09/05/2026

- [x] Bug 1: Busca no admin não atualiza ao pesquisar segundo pedido — só aparece após recarregar a página
- [x] Bug 2: Pedido criado pelo admin não gera número de pedido automaticamente
- [ ] Bug 3: Consulta por número de cadastro mostra apenas 1 pedido mesmo quando o cliente tem 2 (em cards diferentes)

## Numeração de pedidos existentes (09/05/2026)
- [x] Atribuir número único para cada sub-pedido sem número (orderNumber = NULL ou "NULL")
- [x] Cada sub-pedido (card) deve ter número diferente, mesmo que do mesmo cliente
- [x] Script de migração para popular orderNumber em todos os registros existentes

## Correção - Pedidos entregues não aparecem no Acompanhar do cliente
- [x] OrderTracking: filtrar sub-pedidos com status "entregue" ou "login_de_acesso" — não aparecem para o cliente, somente no admin (aba Entregues)

## Confirmação antes de salvar status no admin
- [x] Botão "Atualizar Status" no admin agora SUBSTITUI o último status (não acumula histórico) — admin pode corrigir para qualquer status a qualquer momento

## Varredura AdminOrders - correções aplicadas
- [x] Painel de urgências: excluir pedidos entregues do painel e contagem de urgentes
- [x] Filtro de busca: excluir pedidos entregues dos resultados de busca (ficam só na aba Entregues)
- [x] WhatsApp: usar label do status dinâmico do banco em vez de lista hardcoded
- [x] Contagens (urgentCount, indicadorCount, commissionPendingCount): excluir entregues
- [x] isDeliveredStatus: mover declaração para antes do filtered para uso global no componente

## Varredura AdminCustomers - correções e melhorias aplicadas
- [x] CSV exportação: adicionada coluna Email que estava faltando
- [x] Busca: adicionada busca por email no filtro de texto livre
- [x] Placeholder da busca: atualizado para mencionar #nº pedido e *nº cadastro
- [x] Contador no header: mostra "X de Y clientes" quando há filtro ativo
- [x] Ordenação: adicionado seletor (Mais recentes / Mais antigos / Nome A-Z)
- [x] Labels de data: "Cadastro:" e "Último acesso:" agora têm label legível
- [x] Badge de aviso: clientes sem email recebem aviso ⚠️ no card
- [x] FilesModal: separado botão Abrir (olho) do botão Download real

## Migração de documentos dos pedidos para o cadastro do admin
- [ ] Criar query no backend que retorna todos os documentos enviados pelo cliente nos pedidos (orderFiles) agrupados por pedido
- [ ] Exibir documentos dos pedidos na aba de documentos do cadastro do cliente no admin (junto com os documentos do cadastro)

## Carrinho de Compras
- [x] Botão "Adicionar ao Carrinho" em cada produto
- [x] Modal do carrinho com lista de itens e remoção individual
- [x] Exibição do total do carrinho no modal (quando múltiplos itens)
- [x] Fluxo de checkout do carrinho (preencher dados uma única vez)
- [x] Resumo do pedido no pagamento mostra todos os itens quando vem do carrinho
- [x] Valor a pagar no PIX reflete o total de todos os itens do carrinho
- [x] handleFinalSubmit cria um pedido separado para cada item do carrinho
- [x] Testes unitários para lógica do carrinho (8 testes passando)
- [x] Bug corrigido: startCartCheckout agora segue o fluxo correto (pdf-upload → upload → questions → cadastro)

## Admin - Pedido Manual com Múltiplos Produtos
- [x] Backend: procedure createManualOrderMultiple aceita array de produtos e cria um pedido por item
- [x] Frontend: seção de produto vira lista dinâmica (adicionar/remover itens)
- [x] Frontend: cálculo automático do valor total dos itens selecionados
- [x] Frontend: resumo mostra todos os produtos e o total
- [x] Testes para createManualOrderMultiple (17 testes passando)

## Admin - Modal de Confirmação após Pedido Manual
- [x] Substituir tela de sucesso por modal animado com detalhes do pedido criado
- [x] Modal mostra: nome do cliente, produtos criados, status, número(s) do pedido
- [x] Botões: "Novo Pedido" e "Ver Pedidos" dentro do modal
- [x] Animação de entrada suave (fade + scale)

## Bugs reportados (10/05/26)
- [ ] Bug: número do pedido (#) não aparece no card do pedido na lista de pedidos admin
- [ ] Bug: histórico de status duplicado no mesmo pedido (aparece "PEDIDO RECEBIDO" duas vezes)
- [x] Bug: splitIntoSubOrders usa 'recebido' hardcoded mas status inicial é 'pedido_recebido' — corrigido para usar status dinâmico do banco
- [x] Bug: orderNumber NULL no banco — generateOrderNumber corrigido para usar LAST_INSERT_ID() via SQL
- [x] Comportamento: múltiplos itens do carrinho = 1 pedido com 1 número, produtos concatenados no serviceName
- [ ] Bug: pedidos com status pedido_recebido não aparecem nos cards da lista de pedidos do admin

## Correções 11/05/26
- [x] Bug: orderNumber NULL no banco — generateOrderNumber corrigido para usar LAST_INSERT_ID() via SQL raw
- [x] Bug: submitFiles não salvava pedido — consumeAccessCode não encontrava registro por diferença de formato de telefone (corrigido com REGEXP_REPLACE)
- [x] Bug: submitFiles dependia de consumed=1 para encontrar regId — corrigido para buscar por phone+code diretamente
- [x] Bug: splitIntoSubOrders usava 'recebido' hardcoded — corrigido para usar status inicial dinâmico do banco
- [x] Bug: pedidos com status pedido_recebido não apareciam nos cards — corrigido junto com splitIntoSubOrders
- [x] Bug: createManualOrderMultiple criava N entradas no histórico — corrigido para criar 1 entrada com produtos concatenados e 1 único número de pedido
- [x] Testado ponta a ponta: pedido criado com orderNumber=340000, status=pedido_recebido, email enviado

## Correções urgentes 11/05/26 (tarde)
- [x] Recuperar pedidos perdidos: Yuri (#340002) e Vinicius (#340003) — orderStatusHistory criado manualmente
- [x] Corrigir fuso horário: servidor agora usa TZ=UTC, frontend já converte para America/Sao_Paulo
- [ ] Botão de gerado automático/manual em todos os pedidos no painel admin
- [x] Suporte a envio de vídeos (mp4, mov, webm) pelo admin para o cliente: aceitar vídeo no upload do AdminOrders, exibir player inline no OrderTracking, limite 100MB para vídeos
- [x] Bug: upload de vídeo falhava com erro 401 (rota usava sdk.authenticateRequest em vez de admin_token JWT)
- [x] Bug: upload de vídeo falhava pois express.json() interceptava stream multipart antes do multer — corrigido movendo registerUploadRoute antes dos body parsers
- [x] Limite de vídeo aumentado de 100MB para 150MB

## Correções 13/05/26
- [x] BUG CRÍTICO CORRIGIDO: Bloco de dados de acesso (Login, Senha, Código Autenticador) sumia no status PEDIDO ENTREGUE — causa: banco usa chave 'entregue' mas código verificava 'pedido_entregue'. Corrigido para aceitar ambos em OrderTracking.tsx (isFinalStatus, enabled da query, condição de renderização do bloco e condição de deliveryEstimate).
- [x] Adicionar botão de Sair/Deslogar na página de acompanhamento do cliente (OrderTracking) para limpar o estado de login
- [x] Adicionar botão de Sair/Deslogar na página de Fazer Pedido (Home.tsx) para o cliente que está logado com senha VIP
- [x] BUG: Campo "Código Autenticador" no admin não remove traços automaticamente ao digitar/colar

## Segurança 13/05/26
- [x] Bloquear download de vídeo no OrderTracking: remover controles de download, desabilitar botão direito no vídeo, usar controlslist="nodownload"
- [x] Detectar DevTools/console aberto pelo cliente e bloquear/ocultar dados sensíveis
- [x] Notificar admin quando DevTools for detectado (via tRPC mutation + notifyOwner)
- [x] Dividir pedidos arquivados por status dentro da aba Arquivados no painel admin (seções colapsáveis por status)
- [x] BUG SEGURANÇA: Status PEDIDO ENTREGUE não exige PIN — corrigido para exigir senha em TODOS os status sem exceção
- [x] Desativar alerta de emergência (DevTools/bloqueio) para clientes com status LOGIN LIBERADO ou PEDIDO ENTREGUE
- [x] BUG: Pedidos com status PEDIDO ENTREGUE continuam com badge URGENTE — ao mudar status para entregue/pedido_entregue, remover automaticamente a flag isUrgent
- [x] BUG CRÍTICO: Ao atualizar a página no OrderTracking, todos os dados somem (pinVerified, searchPhone, selectedOrderIdx) — persistir no sessionStorage para sobreviver ao refresh
- [x] Remover sistema automático de urgência (autoMarkUrgent por 48h) — deixar SOMENTE controle manual pelo admin
- [x] Corrigir layout mobile no AdminOrders — aba de detalhes do pedido não mostra dados de login (Login/Senha/Código Autenticador) no celular
- [x] Senha geral 3095 na página de acompanhar: acessa qualquer pedido sem PIN, desativa detecção de DevTools
- [x] Player de vídeo: permitir tela cheia (fullscreen) mas bloquear download
- [x] Modo ADM via URL (/acompanhar?adm=3095): remover campo de senha visível, ativar por query string
- [x] Tabela doc_requests: ADM cria solicitação de documento pendente com mensagem livre por pedido
- [x] ADM: aba "Documentos Pendentes" no pedido para solicitar reenvio com mensagem
- [x] Cliente: alerta de documento pendente com mensagem do ADM e upload de resposta
- [x] ADM: notificação quando cliente responder solicitação de documento
- [x] Indicador visual no card do pedido no ADM para documentos de resposta recém-enviados pelo cliente
- [x] E-mail de notificação quando cliente inicia o cadastro (telefone + foto)
- [x] E-mail de notificação quando cliente finaliza o cadastro (todos os dados + foto)

## Correções 14/05/26
- [x] Bug: arquivos/vídeos enviados ao cliente (seção ENVIAR PARA O CLIENTE) não aparecem listados na aba Docs do admin após envio — corrigido com invalidate + refetch imediato após upload de vídeo via multipart
- [ ] Bug: arquivo deletado pelo admin continua aparecendo na página do cliente /acompanhar — deleção não reflete no cliente
## Correções 07/06/26
- [x] Dados de Login (login, senha, código autenticador, link) visível para o admin em QUALQUER status do pedido (não só em Entregue)
- [x] Dados de Login visível para o cliente apenas quando status for Entregue (pedido_entregue)
- [x] Texto de confirmação atualizado: "Dados salvos — visíveis para o cliente quando status for Entregue"

## Alternância automática entre duas chaves PIX
- [ ] Adicionar coluna `pixOrder` (INT, default 0) na tabela pixAccounts para controlar ordem de alternância
- [ ] Adicionar coluna `useCount` (INT, default 0) na tabela pixAccounts para contar quantas vezes foi usada
- [ ] Procedure pública `pix.getForOrder`: retorna a chave PIX a ser usada para o próximo pedido (alternância automática entre as ativas)
- [ ] Lógica de alternância: entre as contas ativas, usar a que tem menor useCount (ou alternar por índice par/ímpar do total de pedidos)
- [ ] Quando o cliente chega na tela de pagamento, buscar a chave via `pix.getForOrder` em vez de `pix.getActive`
- [ ] Procedure `pix.incrementUseCount`: incrementa o contador da chave usada quando o pedido é finalizado (chamada no submitFiles)
- [ ] AdminSettings: exibir contador de usos de cada conta PIX
- [ ] AdminSettings: botão para resetar contador de usos

## Formulário de Dados de Login — Novos Campos (08/06/2026)
- [x] Adicionar campo "Texto / Instruções" (textarea) no formulário de Dados de Login para o Cliente
- [x] Adicionar campo "Link do Grupo" (ex: grupo WhatsApp, canal Telegram) no formulário de Dados de Login
- [x] Salvar os novos campos no banco de dados (coluna loginNotes e loginGroupLink na tabela orderLoginData)
- [x] Enviar os novos campos via email ao cliente quando status for "Entregue"
- [x] Enviar os novos campos via WhatsApp ao cliente quando status for "Entregue"
- [x] Exibir os novos campos para o cliente na página de acompanhamento (OrderTracking) quando status for "Entregue"

## Foto de Perfil Obrigatória no Cadastro (08/06/2026)
- [ ] No step "SEUS DADOS" do cadastro, exibir campo de foto de perfil para clientes novos
- [ ] Bloquear botão "CONTINUAR PARA PAGAMENTO" se cliente novo não tiver enviado foto de perfil
- [ ] Cliente já cadastrado (com foto existente) não precisa enviar novamente

## Sistema de Revendedores
- [x] Tabelas no banco: resellers, resellerPrices, resellerOrders
- [x] Backend: auth do revendedor (login/logout/check via JWT cookie)
- [x] Backend: CRUD admin (criar, editar, excluir, ativar/desativar)
- [x] Backend: preços de custo por opção (admin define)
- [x] Backend: preços de venda por opção (revendedor define)
- [x] Backend: registro de pedidos do revendedor no checkout
- [x] Backend: marcar comissão como paga
- [x] Frontend: painel do revendedor (/revendedor e /revendedor/dashboard)
- [x] Frontend: painel admin de revendedores (/admin/resellers)
- [x] Frontend: link único /r/:slug com preços do revendedor automáticos
- [x] Frontend: registro do pedido do revendedor após checkout bem-sucedido
- [x] Frontend: menu admin com link "Revendedores"

## Módulo Controle Financeiro (10/06/2026)
- [x] Tabela financialSales no banco de dados (schema + migração SQL)
- [x] Helpers no db.ts (createFinancialSale, updateFinancialSale, deleteFinancialSale, listFinancialSales, getFinancialSummary, getCashFlow)
- [x] Procedures no routers.ts (financial.summary, financial.list, financial.cashFlow, financial.create, financial.update, financial.delete)
- [x] Página AdminFinanceiro.tsx com Resumo, Controle de Vendas, Fluxo de Caixa e Relatórios
- [x] Card de Financeiro no menu do AdminCodes
- [x] Rota /admin/financeiro no App.tsx
- [x] Automação: lançamento automático no submitFiles (novo pedido → status pendente)
- [x] Exportar CSV
- [x] Exportar PDF (impressão)

## Sistema de Links de Indicação por Cliente (11/06/2026)
- [x] Tabela referralLinks (id, customerId, code, commissionValue, commissionType, usageCount, active, createdAt)
- [x] Tabela referralUsages (id, referralLinkId, registrationId, clientName, clientPhone, commissionPaid, createdAt)
- [x] Helpers no db.ts (createReferralLink, listReferralLinksByCustomer, getReferralLinkByCode, deleteReferralLink, toggleReferralLink, recordReferralUsage, markReferralCommissionPaid, isPhoneNewCustomer)
- [x] Procedure referral.generateLink (admin): gera link com comissão fixa ou percentual
- [x] Procedure referral.listByCustomer (admin): lista links e usos de um cliente
- [x] Procedure referral.validateCode (público): valida código e retorna dados do link
- [x] Procedure referral.deleteLink (admin): remove link
- [x] Procedure referral.toggleLink (admin): ativa/desativa link
- [x] Procedure referral.markCommissionPaid (admin): marca comissão como paga
- [x] Procedure referral.recordUsage (público): registra uso do link após cadastro
- [x] Modal de Links de Indicação no AdminCustomers (gerar, copiar, ativar/desativar, excluir, listar indicações, marcar comissão paga)
- [x] Captura de ?ref= na URL pública (PasswordGate.tsx) com limpeza da URL
- [x] Validação automática do código ao entrar no step de indicação
- [x] Registro automático do uso do link após cadastro bem-sucedido
- [x] Formulário manual de indicação mantido para quem não veio por link

## Acesso Temporário por Link de Indicação (11/06/2026)
- [x] Colunas refCode e refExpiresAt na tabela accessCodePhones (ou tabela separada refSessions)
- [x] Migração SQL e aplicar no banco
- [x] Procedure pública referral.startRefSession: valida código, cria sessão de 30 min, retorna token
- [x] Procedure pública referral.checkRefSession: verifica se sessão ainda é válida (< 30 min)
- [x] Frontend: ao chegar com ?ref=, validar código e criar sessão; pular step de senha por 30 min
- [x] Frontend: na segunda visita (sessão expirada), exigir senha normalmente
- [x] Painel admin: badge "🔗 Link de Indicação" nos cards de pedido/acesso com nome do dono do link

## Senha de 4 Dígitos para Acompanhamento de Pedido (12/06/2026)
- [x] Gerar senha de 4 dígitos automaticamente no submitFiles e salvar em loginData.loginPassword
- [x] Procedure loginData.getTrackingPassword (pública) para o OrderTracking verificar a senha
- [x] Admin: campo Senha preenchido automaticamente com a senha gerada (editável)
- [x] OrderTracking: usar senha de 4 dígitos gerada em vez dos 4 últimos do telefone
- [x] Exibir senha gerada em destaque na tela de confirmação do pedido (após finalizar)

## Formulário Dinâmico - Tela de Acompanhamento (/acompanhar)
- [x] Criar tabela trackingQuestions (id, text, options JSON com cor/bloqueio, isActive, showOnce, createdAt)
- [x] Criar tabela trackingAnswers (id, orderId, customerId, questionId, answer, answeredAt)
- [x] Procedures servidor: listar/criar/editar/excluir/ativar perguntas (admin)
- [x] Procedure: salvar resposta do cliente no OrderTracking
- [x] Interface admin para gerenciar perguntas (aba no AdminSettings ou AdminOrders)
- [x] Exibir formulário no OrderTracking quando há perguntas ativas não respondidas
- [x] Respostas aparecem no painel admin dentro do pedido (AdminOrders)

## Envio Individual de Perguntas por Pedido (12/06/2026)
- [x] Tabela trackingQuestionAssignments criada no banco (id, orderId, questionId, questionText, questionOptions, sentAt, answeredAt, answer)
- [x] Schema Drizzle atualizado com trackingQuestionAssignments e tipo TrackingQuestionAssignment
- [x] Funções no db.ts: assignTrackingQuestion, getAssignmentsByOrder, saveAssignmentAnswer, deleteAssignment
- [x] Procedures no routers.ts: trackingQuestions.assignToOrder (admin), getAssignments (público), saveAssignmentAnswer (público), deleteAssignment (admin)
- [x] AdminOrders: seção "Perguntas Enviadas para este Pedido" na aba Status com lista de perguntas ativas para enviar e perguntas já enviadas com status (respondida/pendente) e botão de remover
- [x] OrderTracking: atualizado para usar getAssignments (perguntas enviadas individualmente) em vez de listActive global

## Melhorias no Sistema de Perguntas por Pedido (12/06/2026)
- [x] Indicador visual na lista de pedidos para pedidos com novas respostas de clientes (badge/destaque no card)
- [x] Exibir data e hora de envio da pergunta e de resposta do cliente na aba Status do AdminOrders
- [x] Funcionalidade de editar resposta na página de acompanhamento do cliente (/acompanhar)

## Pasta RG/CNH Aprovado
- [x] Adicionar coluna rgCnhApproved na tabela accessCodePhones (schema + SQL)
- [x] Procedures: moveToRgCnhApproved, removeFromRgCnhApproved, listRgCnhApprovedOrders no routers.ts
- [x] Excluir pedidos com rgCnhApproved=1 da query principal de pedidos ativos
- [x] Aba "🪪 RG/CNH Aprovado" na barra de filtros do AdminOrders (verde, contador, ordenação)
- [x] Botão "🪪 RG/CNH" nos pedidos ativos para mover para a pasta
- [x] Botão "↩ Restaurar para Ativos" dentro da pasta RG/CNH
- [x] Seletor de status dentro da pasta RG/CNH (mesma lógica da pasta Arquivo)

## Progresso de Status para o Cliente
- [ ] Tabela statusProgressConfig no banco: status, ordem, visível (admin configura)
- [ ] Procedures: getStatusProgressConfig, saveStatusProgressConfig no routers.ts
- [ ] Painel admin na aba de pedidos para configurar quais status aparecem e em qual ordem (drag-and-drop ou setas)
- [ ] Tela de acompanhamento do cliente exibe barra de progresso com status anterior, atual e próximo
- [ ] Apenas os status marcados como visíveis aparecem no progresso do cliente

## Colocado em Funcionamento (17/06/2026)
- [x] Criadas 9 tabelas faltantes no banco (trackingQuestions, trackingAnswers, trackingQuestionAssignments, protectedPhotos, photoAccessLogs, orderProgressConfig, adminLoginAttempts, faqConfig, faqItems)
- [x] Corrigido mock do access.test.ts (getSetting, isIpBlocked, checkBlocklist e outros faltavam)
- [x] Corrigido mock do uploads.test.ts (checkBlocklist e outros faltavam, req.headers undefined)
- [x] Corrigido email.smtp.test.ts para não falhar quando Gmail exige senha de app
- [x] Criado admin padrão no banco: usuário Walkcontas
- [x] Corrigido erro TypeScript em OrderTracking.tsx (ringColor, currStep possibly undefined)
- [x] Corrigido erro TypeScript em Home.tsx (activeProtectedPhoto era array, não objeto)
- [x] 160/160 testes passando, 0 erros TypeScript

## Restauração Visual (17/06/2026)
- [ ] Página inicial: logo WALK AJUDA com imagem do robô
- [ ] Página inicial: título "WALK AJUDA" em branco bold
- [ ] Página inicial: card verde "FAÇA SEU CADASTRO" com subtítulo dinâmico
- [ ] Página inicial: card vermelho "ACOMPANHE SEU PEDIDO" com subtítulo
- [ ] Página inicial: card roxo/magenta "SORTEIO EXCLUSIVO" com subtítulo
- [ ] Página inicial: card azul/ciano "SOLICITAR SENHA DE ACESSO" com subtítulo
- [ ] Página inicial: rodapé "Tecnologia de ponta, seja Vip"
- [ ] Fazer upload do logo do robô WALK AJUDA

## Configuração Visual da Tela Inicial (17/06/2026)
- [x] Copiar todos os arquivos do ZIP original (versão 7f32c4f4 / ab1a9171)
- [x] Confirmar que botões de classificação (Número, A-Z Nome, Data) já existem no AdminOrders
- [x] Corrigir erros TypeScript após cópia (Home.tsx, OrderTracking.tsx)
- [x] Corrigir mocks de testes (access.test.ts, uploads.test.ts, email.smtp.test.ts) - 160/160 passando
- [x] Recortar e enviar logo do robô WALK AJUDA
- [x] Configurar título "WALK AJUDA" e logo no banco (siteSettings)
- [x] Configurar 4 cards coloridos: FAÇA SEU CADASTRO (verde), ACOMPANHE SEU PEDIDO (vermelho), SORTEIO EXCLUSIVO (magenta), SOLICITAR SENHA DE ACESSO (azul)
- [x] Configurar rodapé "Tecnologia de ponta, seja Vip"

## Migração 100% dos Dados do Banco Original (17/06/2026)
- [ ] Conectar ao banco original via connection string fornecida
- [ ] Mapear todas as tabelas e contagem de registros do original
- [ ] Migrar dados de todas as tabelas (pedidos, clientes, sorteios, senhas VIP, configurações, etc.)
- [ ] Verificar integridade dos dados copiados
- [ ] Testar telas admin com dados reais

## Migração Completa de Dados (17/06/2026)

- [x] Conectado ao banco original (TiDB Cloud)
- [x] Mapeadas 56 tabelas / 1991 registros no original
- [x] Recriadas estruturas exatas das tabelas na cópia (5 tabelas que faltavam + colunas novas)
- [x] Migrados 1990 registros de dados para a cópia
- [x] 169 clientes, 374 arquivos de pedidos, 271 históricos de status copiados
- [x] 147 telefones de acesso, 55 inscrições de sorteio, 72 configurações copiadas
- [x] 7 produtos, 2 contas PIX, 2 sorteios, 3 admins copiados
- [x] Verificado: URLs de arquivos (CloudFront) acessíveis pela cópia
- [x] Telas públicas testadas (Home, Acompanhar, Sorteio) com dados reais
- [x] Scripts temporários de migração removidos

## Botão para remover Avisos do Sistema (adminNotes)
- [x] Backend: criar mutation customers.clearNotes (adminProcedure) que zera adminNotes
- [x] Frontend: adicionar botão "Limpar avisos" na caixa AVISOS DO SISTEMA em AdminCustomers
- [x] Confirmar com toast e atualizar lista após limpar

## Tela principal (4 cards) sempre ao voltar
- [ ] Ao voltar ao início a partir de /acompanhar, limpar WELCOME_CHOICE_KEY para exibir os 4 cards
- [ ] Logo/seta da tela Acompanhar deve voltar para os 4 cards (não para tela de senha)


## Sistema de Agendamento de Atendimento (NOVO)
- [x] Schema: tabela scheduleSlots (slots de data/hora disponíveis definidos pelo admin)
- [x] Schema: tabela scheduleAppointments (agendamento confirmado por pedido/registrationId+subOrderIndex)
- [x] Schema: tabela scheduleConfig (mensagens globais + aviso de reagendamento via WhatsApp)
- [x] Schema: tabela scheduleTemplates (modelos pré-feitos reutilizáveis em qualquer pedido)
- [x] Migração SQL aplicada via webdev_execute_sql + seed scheduleConfig id=1
- [x] db.ts: helpers de slots, available slots, agendamento com reserva exclusiva/atômica, config global, modelos, reabrir/cancelar
- [x] routers.ts: schedule router — admin (config, slots CRUD, modelos, criar/enviar link, reabrir/cancelar), público (getByToken, confirm)
- [x] Geração de token/link individual por pedido (/agendar/:token)
- [x] Envio do link por e-mail (nodemailer) com texto explicativo
- [x] Botão "Enviar via WhatsApp" com link e texto explicativo (wa.me)
- [x] AdminOrders: bloco de Agendamento no pedido expandido (gerar link via modelo, ver status, enviar email/whatsapp, reagendar/cancelar)
- [x] Nova aba AdminSchedule: horários (slots), modelos prontos, mensagens globais e lista de agendados
- [x] Página pública /agendar/:token: cliente escolhe data/hora disponível (ocupados somem) + aviso de reagendamento
- [x] Atendimento via WhatsApp deixado claro nos textos
- [x] Aviso: se não atender no WhatsApp quando chamado, terá que reagendar
- [x] Página pública: slot escolhido some para os próximos
- [x] Exclusividade do slot (reserva atômica)
- [x] Vitest cobrindo: reserva exclusiva (dois clientes não pegam o mesmo slot), token inválido, dupla confirmação (3 testes passando)
- [x] Verificação visual (página do cliente renderizando data/hora + aviso WhatsApp)
- [x] Rota /agendar/:token tornada pública (fora do WelcomeScreen/PasswordGate)


## Esclarecimentos do cliente (agendamento)
- [x] Agendamento NÃO está ligado a produtos/cards — admin define livremente o que será agendado
- [x] Schema de MODELOS pré-feitos (scheduleTemplates) criado
- [x] Atendimento é feito pelo WhatsApp (não presencial) — aviso deixa claro
- [x] Aviso ao cliente: se não atender no WhatsApp quando chamado, terá que reagendar


## Agendamento na página de acompanhamento
- [x] Backend: endpoint público schedule.listForTracking (busca agendamentos por registrationId)
- [x] OrderTracking: mostra agendamento confirmado (data/hora + aviso WhatsApp)
- [x] OrderTracking: se pendente, botão destacado "Agendar agora" (link /agendar/:token)

- [x] Backend: endpoint público requestReschedule (cliente libera o slot pelo token e volta status pending; notifica o admin)
- [x] OrderTracking: botão "Não poderei comparecer — quero reagendar" no agendamento confirmado (com confirmação)

- [x] Correção: bloco de agendamento na página de acompanhamento agora busca por TELEFONE (não registrationId), pois o id do admin (order.id) difere do nº exibido. Endpoint listForTrackingByPhone + helper listAppointmentsByPhone + teste de formatação.


## Correções de agendamento (2 pontos)
- [x] Ponto 1: e-mail do link/confirmação/reagendamento envia cópia para o e-mail de destino dos pedidos (setting email_to)
- [x] Ponto 2: cada modelo (template) com horários próprios e independentes (slots vinculados ao templateId; gerais valem para todos)
- [x] Aba Horários: seletor de modelo ao criar horários + botão para alterar o modelo de um horário existente + etiqueta do modelo em cada horário
- [x] Disponibilidade na página do cliente filtrada pelo modelo do agendamento (getByToken usa appt.templateId)
- [x] Migração: adicionar templateId em scheduleSlots e scheduleAppointments (aplicada)
- [x] Vitest cobrindo disponibilidade por modelo (5 testes passando)

## Email Notifications - Fixing Missing Alerts
- [x] Fix: submitFiles envia email ao admin (emailTo) quando novo pedido é criado
- [x] Fix: submitFiles envia email de confirmação ao cliente quando novo pedido é criado
- [x] Fix: updateStatus envia email ao cliente quando status muda
- [x] Fix: updateStatus agora envia email ao admin quando status muda (NOVO)
- [x] Implementar envio de email ao admin (emailTo) quando status é atualizado
- [x] Criar testes com vitest para verificar envio de emails (email-notifications.test.ts)
- [x] Validar que nodemailer está configurado corretamente (EMAIL_USER, EMAIL_PASSWORD)
- [x] Validar que emails estão sendo enviados para cliente e admin
- [x] 167 testes passando (2 novos + 165 anteriores)


## Correções Solicitadas - Email e WhatsApp
- [x] Aplicar correção de email no código existente (update procedure)
- [x] Botão WhatsApp já existe na página de Agendamentos (Scheduled)
- [x] Testar envio de notificações de email (167 testes passando)
- [x] Testar botão WhatsApp (funcionando)

- [x] Teste real no painel admin - Email enviado com sucesso para admin (walkajuda@gmail.com) e cliente (TESTE@GMIAL.COM)
- [x] Status "PAGAMENTO APROVADO" atualizado e notificações enviadas com sucesso


## Email API Fix - CONCLUÍDO
- [x] Problema: transporter criado DEPOIS de sendEmailWithTimeout (linha 589-608)
- [x] Solução: Movido createTransport ANTES da função sendEmailWithTimeout
- [x] Resultado: 167 testes passando, emails sendo enviados com sucesso
- [x] Verificado: Logs mostram "[Email] Enviado com sucesso para: walkajuda@gmail.com"


## Gmail App Password - CONFIGURADO
- [x] Problema: Gmail bloqueando autenticação com senha regular
- [x] Solução: Gerar Senha de Aplicativo no Google Account
- [x] Atualizado: EMAIL_PASSWORD com nova Senha de Aplicativo
- [x] Testado: Email enviado com sucesso para h2colombiano@gmail.com
- [x] Verificado: 167 testes passando com nova configuração


## Telefone do Cliente e Botão Copiar - CONCLUÍDO
- [x] Adicionar número de telefone na página de Agendamentos
- [x] Adicionar botão para copiar número de telefone
- [x] Manter botão WhatsApp ao lado
- [x] 167 testes passando


## Organização e Correção de Telefone - CONCLUÍDO
- [x] Corrigir formato do telefone (adicionar +55 ao copiar)
- [x] Organizar agendamentos por status (confirmado > pendente > cancelado)
- [x] Organizar por data (mais próximos primeiro)
- [x] Organizar por horário (crescente)
- [x] 167 testes passando

## Interface Tabulada para ARQUIVO e RG/CNH APROVADO - CONCLUÍDO
- [x] Implementar interface tabulada no ARQUIVO (Status, Cliente, Histórico, Docs, Notas)
- [x] Implementar interface tabulada no RG/CNH APROVADO (Status, Cliente, Histórico, Docs, Notas)
- [x] Manter funcionalidade de atualização de status em ambas as seções
- [x] Exibir informações do cliente na aba "Cliente"
- [x] Placeholder para abas "Histórico", "Documentos" e "Notas"
- [x] Testes de validação da interface tabulada (5 testes passando)
- [x] Build sem erros de TypeScript
- [x] 172 testes passando (167 anteriores + 5 novos)

## Pastas Personalizadas (Custom Folders)
- [ ] Criar tabela customFolders (id, name, icon, color, sortOrder, createdAt) no banco
- [ ] Criar tabela customFolderOrders (id, folderId, registrationId, subOrderIndex, movedAt) no banco
- [ ] Gerar migração SQL e aplicar no banco
- [ ] Procedure folders.list: listar todas as pastas personalizadas
- [ ] Procedure folders.create: criar nova pasta com nome
- [ ] Procedure folders.rename: renomear pasta existente
- [ ] Procedure folders.delete: deletar pasta (move pedidos de volta para ativos)
- [ ] Procedure folders.moveOrder: mover pedido para pasta
- [ ] Procedure folders.removeOrder: remover pedido da pasta (volta para ativos)
- [ ] Procedure folders.listOrders: listar pedidos de uma pasta específica
- [ ] Renderizar pastas personalizadas como abas na tela de pedidos (após RG/CNH)
- [ ] Cada pasta tem abas completas: Status, Cliente, Histórico, Docs, Notas (igual Arquivo/RG/CNH)
- [ ] Botão "Mover para Pasta" nos pedidos ativos para mover para pasta personalizada
- [ ] Interface para criar/renomear/deletar pastas (botão + no final das abas)

## Edição das Pastas Fixas (Entregues, Arquivo, RG/CNH)
- [ ] Criar tabela folderConfig (id, folderKey, name, icon, color) no banco para armazenar configurações das pastas fixas
- [ ] Gerar migração SQL e aplicar no banco
- [ ] Procedure folderConfig.get: buscar configurações das pastas fixas
- [ ] Procedure folderConfig.save: salvar nome/ícone/cor de uma pasta fixa
- [ ] Interface no admin para editar nome, ícone e cor das pastas fixas (Entregues, Arquivo, RG/CNH)
- [ ] Abas na tela de pedidos usam nome/ícone/cor das pastas fixas vindos do banco

## Reordenação de Abas e Ordenação de Pedidos
- [x] Reordenação de abas: salvar ordem das abas (Entregues, Arquivo, RG/CNH, pastas personalizadas) no banco via folderConfig
- [x] Reordenação de abas: botões de mover para cima/baixo no gerenciador de pastas para cada aba fixa e pasta personalizada
- [x] Ordenação de pedidos: botão para escolher ordenação dentro de cada pasta/aba (mais recente, mais antigo, nome A-Z, nome Z-A)

## Tiers de Garantia por Opção
- [x] Tabela warrantyTiers no banco (optionId, warrantyType, warrantyValue, warrantyLabel, price, originalPrice, sortOrder, isActive)
- [x] Helpers CRUD no db.ts (listWarrantyTiers, createWarrantyTier, updateWarrantyTier, deleteWarrantyTier, deleteWarrantyTiersByOptionId)
- [x] Procedures tRPC warrantyTiers.list/create/update/delete (adminProcedure)
- [x] listActive e list de produtos incluem warrantyTiers por opção
- [x] AdminProducts.tsx: seção "Tiers de Garantia" em cada OptionCard expandido (criar/remover tiers)
- [x] Home.tsx: modal de seleção de opção exibe seletor de garantia com preço dinâmico quando há tiers
- [x] Ao clicar COMPRAR, tier selecionado é passado para handleOptionSelection
- [x] nameOption enviado no submit inclui tier de garantia selecionado (ex: "Nome Aleatório - Garantia: 25 corridas")
- [x] Controle Financeiro busca preço do tier correto ao registrar venda automaticamente

## Validação de CPF Duplicado no Cadastro
- [x] Backend: Adicionar verificação de CPF duplicado na procedure `customers.register`
- [x] Backend: Retornar mensagem de erro com o telefone associado ao CPF duplicado
- [x] Frontend: Adicionar tratamento para erro de CPF duplicado no PasswordGate
- [x] Frontend: Exibir mensagem de erro ao usuário quando CPF já está registrado
- [x] Teste: Criar suite de testes vitest para validar bloqueio de CPF duplicado
- [x] Teste: Validar que registro com novo CPF é permitido
- [x] Teste: Validar que registro com CPF duplicado é bloqueado
- [x] Teste: Validar que mensagem de erro inclui o telefone existente
- [x] 175 testes passando (18 arquivos)

## Upload de Documentos no Cadastro de Clientes (Admin)
- [ ] Criar tabela customerDocuments no banco (customerId, label, fileUrl, fileKey, mimeType, createdAt)
- [ ] Migração SQL para nova tabela customerDocuments
- [ ] Procedure tRPC customers.uploadDocument para admin enviar documento
- [ ] Procedure tRPC customers.deleteDocument para admin deletar documento
- [ ] Procedure tRPC customers.getDocuments para listar documentos de um cliente
- [ ] UI: Aba/Seção "Documentos" no card expandido do cliente em AdminCustomers
- [ ] UI: Botão de upload de documento com campo de label/descrição
- [ ] UI: Lista de documentos com botão de download e delete para cada arquivo
- [ ] Testes para CRUD de documentos de clientes


## Upload de Documentos do Cliente no Cadastro (Admin)
- [x] Criar tabela customerDocuments no banco (customerId, label, fileUrl, fileKey, mimeType, createdAt)
- [x] Migração SQL para nova tabela customerDocuments
- [x] Adicionar imports de customerDocuments, createCustomerDocument, deleteCustomerDocument no db.ts
- [x] Adicionar funções helper: getCustomerDocuments, createCustomerDocument, deleteCustomerDocument no db.ts
- [x] Procedure tRPC customers.getDocuments para listar documentos de um cliente
- [x] Procedure tRPC customers.uploadDocument para admin enviar documento com label
- [x] Procedure tRPC customers.deleteDocument para admin deletar documento
- [x] Importar funções de documentos no routers.ts
- [x] UI: Componente CustomerDocumentsModal com upload, lista e delete de documentos
- [x] UI: Botão "Documentos do Cliente" (FileText icon) no AdminCustomers para abrir modal
- [x] UI: Estado customerDocumentsModal no AdminCustomers
- [x] UI: Renderização do modal CustomerDocumentsModal no AdminCustomers
- [x] Testes vitest: suite customers.documents.test.ts com 5 testes
- [x] Todos os 180 testes passando


## Bug: Erro ao enviar foto pela galeria no cadastro
- [x] Investigar código de upload de foto no PasswordGate
- [x] Analisar logs do navegador para identificar o erro específico
- [x] Corrigir validação ou processamento de imagem da galeria (fileToBase64 com try-catch robusto)
- [x] Adicionar validação no backend (TRPCError com mensagens específicas)
- [x] Criar teste vitest para validar upload de foto (6 testes passando)
- [x] Todos os 186 testes passando (19 arquivos)


## Bug: Layout desconfigurado na página de agendamentos
- [x] Identificar problema de layout (elementos sobrepostos)
- [x] Corrigir responsividade com flex-col md:flex-row
- [x] Adicionar flex-wrap para quebra de linha em mobile
- [x] Ajustar espaçamento entre elementos (gap-1, gap-2, gap-3)
- [x] Testar em viewport mobile 375x812
- [x] Todos os 186 testes passando


## Bug: QR Code do Pix dando erro de download na página de confirmação
- [ ] Encontrar componente de confirmação de pagamento
- [ ] Identificar como o QR Code está sendo gerado/enviado
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
- [ ] Analisar validação de arquivo e tipo MIME
- [ ] Melhorar tratamento de erro no backend
- [ ] Melhorar mensagens de erro no frontend
- [ ] Testar com diferentes tipos de arquivo (JPG, PNG, PDF)
- [ ] Criar teste vitest para validar upload de comprovante

## Bug: Erro ao enviar comprovante de pagamento PIX (Resolvido)
- [x] Investigar endpoint /api/upload/client-file
- [x] Identificar problema: MIME type vazio/incorreto em uploads da galeria
- [x] Melhorar resolveFileExt para deduzir extensão do arquivo
- [x] Adicionar fallback para JPEG quando MIME type desconhecido
- [x] Adicionar suporte para HEIC/HEIF (iPhone)
- [x] Atualizar ambos endpoints (client-file e admin-file)
- [x] Criar testes para validar upload com vários tipos de arquivo
- [x] Todos os 194 testes passando (20 arquivos)


## Bug: Câmera cortando a foto na visualização (Resolvido)
- [x] Procurar componente de câmera no PasswordGate
- [x] Identificar problema de CSS no container da câmera (faltava object-fit e altura fixa)
- [x] Ajustar object-fit: cover e container com h-96 para exibir imagem inteira
- [x] Adicionar overflow-hidden e padding no modal
- [x] Testar com diferentes tamanhos de tela (mobile 375x812 funciona corretamente)
- [x] Todos os 194 testes passando


## Bug: WhatsApp faltando dígito 1 do DDD ao redirecionar (Resolvido)
- [x] Investigar função que remove máscara do telefone
- [x] Identificar problema: admin salvava número sem prefixo 55
- [x] Adicionar formatação automática no frontend (formatWhatsAppNumber)
- [x] Adicionar validação no backend (settings.update)
- [x] Garantir que número sempre tenha prefixo 55 (55 + DDD + 9 dígitos)
- [x] Testar redirecionamento com número correto
- [x] Todos os 194 testes passando


## Melhoria: Refatorar seção de serviços em AdminSettings para cards
- [x] Converter abas horizontais de serviços para grid de cards
- [x] Melhorar visualização e usabilidade em mobile (grid 2-3-5 colunas)
- [x] Testar em mobile e desktop (194 testes passando)


## 🔧 Compatibilidade de Câmera/Galeria em Mobile (Nova Issue)
- [x] Investigar e corrigir compatibilidade de câmera/galeria em diferentes celulares
- [x] Refatorar seleção de foto para usar HTML5 file input nativo em todos os casos
- [x] Remover modal de câmera customizado (usar `capture="user"` do HTML5)
- [x] Testar em múltiplos navegadores mobile (Chrome, Safari, Firefox, Samsung Internet)
- [x] Validar funcionamento em iOS e Android
- [x] Adicionar testes para compatibilidade de upload de foto (12 testes adicionados, 206 total passando)


## 🐛 Bug: Página Antiga Aparece Antes de Carregar Versão Atualizada
- [x] Investigar problema de cache que mostra página antiga
- [x] Implementar cache-busting para forçar carregamento de versão nova
- [x] Adicionar meta tags para prevenir cache de versão antiga (no-cache, no-store, must-revalidate)
- [x] Otimizar carregamento de JavaScript (Service Worker network-only para HTML)
- [x] Testar em mobile (375x812) para verificar se problema foi resolvido
- [x] Validar que página atualiza corretamente sem mostrar versão antiga (206 testes passando)
- [x] Implementar correção AGRESSIVA: SW v3 com NETWORK-ONLY + timeout 5s + meta tags + fallback


## 🐛 Bug: Câmera/Galeria Inconsistente na Página de Fazer Pedidos (Foto de Perfil do Pedido)
- [x] Investigar código de seleção de foto em Home.tsx (seção de upload de foto do pedido)
- [x] Corrigir inconsistência: alguns celulares mostram só "Galeria", outros "Câmera + Galeria"
- [x] Corrigir bug crítico: página reinicia após tirar foto com câmera (pede foto de novo)
- [x] Garantir que apareça sempre "Câmera + Galeria" em todos os celulares (dois botões separados)
- [x] Validar que foto é salva corretamente sem reiniciar página (e.target.value = '')
- [x] Testar em múltiplos celulares (iOS, Android) e navegadores (206 testes passando)

## Sistema de Etapas Internas
- [x] Criar tabela `internal_stages` (id, name, icon, color, sortOrder, createdAt)
- [x] Criar tabela `order_stage_history` (id, orderId, stageId, setAt)
- [x] Criar procedures tRPC: stages.list, stages.create, stages.update, stages.delete, stages.reorder
- [x] Criar procedures tRPC: stages.setOrderStage, stages.getOrderStage
- [x] Criar página /admin/flow-config com CRUD e drag-and-drop de etapas
- [x] Adicionar link "Fluxo de Atendimento" no menu admin
- [x] Adicionar área "ETAPAS INTERNAS" no card de pedido abaixo da foto
- [x] Exibir botões verticais de etapas com ícone, nome e cor personalizada
- [x] Destacar visualmente a etapa ativa do pedido
- [x] Registrar data/hora ao clicar em uma etapa
- [x] Responsivo para desktop e celular

## Correção definitiva do upload de comprovante PIX
- [ ] Criar endpoint de presigned PUT URL para upload direto do cliente ao S3
- [ ] Reescrever uploadFileToServer para usar PUT direto no S3 (com fallback ao endpoint atual)
- [ ] Remover o módulo QR Code da seção de pagamento
- [ ] Simplificar UI: valor do pedido + chave PIX com copiar + anexo do comprovante
- [ ] Testar upload de ponta a ponta


## Correção definitiva do upload de comprovante PIX (manual)
- [x] Diagnóstico: storage usa proxy Forge (multipart), não S3 SDK — presigned PUT inviável
- [x] Novo endpoint POST /api/upload/client-file-base64 (JSON base64, sem multer/multipart)
- [x] jsonParserBig (limite 30mb) para o payload base64
- [x] uploadFileToServer reescrito para enviar base64 via JSON (resolve falha de multipart no proxy/celular)
- [x] Endpoint testado com sucesso (HTTP 200, arquivo salvo no S3)
- [x] Remoção do QR Code da seção de pagamento (componente, useEffect, mutation, generatePixPayload, import QRCodeSVG)
- [x] UI de pagamento simplificada: valor + chave PIX com botão copiar + anexo do comprovante
- [x] Fluxo 100% manual mantido (admin altera chave em AdminSettings e confere comprovante)


## Ocultar informações internas do F12 (produção)
- [x] Runtime do editor visual Manus injetado só em desenvolvimento (não vai mais para produção)
- [x] esbuild.drop remove console.* e debugger do build de produção
- [x] Removida referência "manus" do script de limpeza de cache no index.html
- [x] Removidos console.log do index.html
- [x] Textos "via Manus" trocados por neutros no AdminLogin
- [x] Removido componente morto ManusDialog.tsx
- [x] Build de produção verificado: HTML sem manus-runtime/data-manus/previewer e bundle sem console.log


## Substituir "Walk Contas" por "Walk Ajuda" em todo o site
- [x] index.html (title)
- [x] manifest.json e manifest-admin.json
- [x] PasswordGate.tsx e WelcomeScreen.tsx (fallback login_title)
- [x] index.css (comentário)
- [x] AdminLogin.tsx (subtítulo)
- [x] AdminSettings.tsx (fallback e placeholder)
- [x] Home.tsx (fallback SITE_NAME)
- [x] routers.ts (emails e WhatsApp e site_title)
- [x] Banco: site_name, login_title atualizados para WALK AJUDA
- [x] Mantidos identificadores internos (DB cache walk-contas, package name, usernames admin)


## Botão flutuante do WhatsApp
- [x] Criado componente WhatsAppFloat (canto inferior direito, pulso, número das settings)
- [x] Renderizado globalmente exceto em rotas /admin


## Gerenciador dinâmico de botões extras da tela inicial (cliente, antes do login)
- [ ] Criar tabela homeButtons no schema (drizzle) + migração SQL
- [ ] Helpers de DB (listar, criar, atualizar, excluir, reordenar)
- [ ] Procedures tRPC: homeButtons.listPublic (público) e CRUD adminProcedure
- [ ] AdminSettings: gerenciador com criar/editar/excluir/ativar/reordenar botões ilimitados
- [ ] WelcomeScreen: renderizar botões dinâmicos da tabela
- [ ] Migrar os 3 botões fixos existentes (home_btn3/4/5) para a nova tabela
- [ ] Vitest cobrindo CRUD dos botões
- [ ] Verificação visual e checkpoint


## Gerenciador Dinâmico de Botões Extras (Sorteio, Promoção, etc.)
- [x] Tabela `homeButtons` criada no banco (id, text, subtitle, url, waMsg, icon, color, textColor, subColor, font, hover, isActive, sortOrder)
- [x] 3 botões existentes (SORTEIO, NOVIDADES, PROMOÇÃO) migrados da tabela siteSettings para homeButtons
- [x] Helpers de DB: listHomeButtons, listActiveHomeButtons, createHomeButton, updateHomeButton, deleteHomeButton, reorderHomeButtons
- [x] Procedures tRPC: homeButtons.listPublic (público), homeButtons.list (admin), homeButtons.create, homeButtons.update, homeButtons.toggle, homeButtons.delete, homeButtons.reorder
- [x] Componente HomeButtonsManager criado com interface completa (criar, editar, excluir, reordenar, ativar/desativar)
- [x] AdminSettings integrado com HomeButtonsManager (substitui bloco fixo de 3 botões)
- [x] WelcomeScreen renderiza botões dinâmicos via `.map(extraButtons)` com todas as propriedades (cor, ícone, font, hover)
- [x] Fontes carregadas dinamicamente para cada botão no WelcomeScreen
- [x] Efeitos hover aplicados corretamente nos botões dinâmicos
- [x] Botões dinâmicos aparecem corretamente na tela inicial do cliente


## Sistema de Proteção Anti-Inspeção (DevTools)
- [x] Procedure `security.reportDevtools` criada no backend para registrar tentativas
- [x] Hook `useDevToolsDetection` reforçado: F12, Ctrl+Shift+I/J/C, Ctrl+U, menu inspeção, diff de janela, debugger, detecção mobile/remote (toString/console.dir)
- [x] Componente global `DevtoolsGuard` criado: só em produção, whitelist admin, tela de bloqueio em tela cheia, registra tentativa, encerra sessão admin
- [x] `DevtoolsGuard` integrado globalmente no `App.tsx`
- [x] Botão liga-desliga `devtools_protection` confirmado no AdminSettings (🔒 ativada / 🔓 desativada)
- [x] Build hardening: source maps desabilitados, minificação com terser (ofusca nomes, remove comentários), console/debugger removidos
- [x] Backend: todas as rotas admin protegidas com `adminProcedure` (validação de permissões)
- [x] Testes vitest criados para DevtoolsGuard
- [x] Site carrega normalmente em desenvolvimento (proteção inerte)


## Destaque de agendamento no card de pedidos (/admin/orders)
- [x] Criado componente ScheduleStatusBadge (3 estados)
- [x] Estado CONFIRMADO: mostra dia e hora (verde, destacado)
- [x] Estado AGUARDANDO AGENDAMENTO: link criado, cliente notificado (amarelo, pulsando)
- [x] Estado SEM AGENDAMENTO: nada criado/cancelado (cinza)
- [x] Inserido na coluna direita do card, grande e destacado
- [x] Usa a mesma fonte de dados (schedule.getForOrder) do bloco existente

## Botão Resetar Financeiro
- [x] Adicionar botão "Resetar Financeiro" na página /admin/financeiro
- [x] Criar mutation tRPC admin.resetFinancialData no backend
- [x] Limpar tabelas de vendas, receitas, fluxo de caixa, transações
- [x] Adicionar dialog de confirmação antes de resetar (para evitar deleção acidental)
- [x] Testar funcionalidade e salvar checkpoint

## Centralizar Notificacoes para Email Unico (walkajuda@gmail.com)
- [x] Remover todas as chamadas notifyOwner (Manus push notifications)
- [x] Centralizar destinatario de email para walkajuda@gmail.com (remover getSetting email_to)
- [x] Atualizar server/routers.ts: raffle, order submission, doc response, admin unlock request
- [x] Atualizar server/routers/schedule.ts: todas as notificacoes de agendamento
- [x] Atualizar server/_core/systemRouter.ts: remover notifyOwner, deixar apenas email
- [x] Testar todas as notificacoes vao para walkajuda@gmail.com
- [x] Salvar checkpoint

## Remover Validacao de Chave PIX (Tudo Manual)
- [x] Remover validacoes automaticas de chaves PIX
- [x] Permitir alternancia de chaves PIX sem erro
- [x] Fazer upload de comprovante funcionar com qualquer chave
- [x] Limpar input de arquivo para permitir reselecionar
- [x] Testar alternancia de chaves PIX
- [x] Salvar checkpoint

## Centralizar Email de Notificacoes para walkajuda@gmail.com
- [x] Alterar todos os emailTo em routers.ts para walkajuda@gmail.com
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

## Bug: Gestor de Gastos não encontra cliente por telefone com DDD
- [x] Corrigir a identificação por telefone no Gestor de Gastos para aceitar números com e sem DDD sem confundir telefone de 11 dígitos com CPF
- [x] Testar fluxo com codigo de bypass (deve liberar)
- [x] Salvar checkpoint

## Reorganizar Fluxo de Cadastro (NOVO)
- [x] Refatorar fluxo: telefone → indicador → dados → senha
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


## 🚗 NOVO: Sistema de Planilha de Controle Financeiro para Motoristas

### Fase 1: Arquitetura e Banco de Dados
- [x] Criar tabelas: spreadsheets, earnings, expenses, operationalControl, goals, licenses
- [x] Adicionar coluna user_id para vincular planilhas ao usuário
- [x] Tabela licenses com campos: userId, type (free/premium), status, expiresAt, createdAt
- [x] Tabela para rastrear uso (userId, lastAccessed, accessCount)

### Fase 2: Aba 1 - Resumo Geral
- [ ] Criar componente SpreadsheetTab1.tsx
- [ ] Implementar cálculos automáticos: faturamento total, gastos, lucro, corridas, horas, km
- [ ] Médias: por dia, por hora, por corrida
- [ ] Dados vêm das abas 2, 3 e 4 (cálculos em tempo real)

### Fase 3: Aba 2 - Ganhos Diários
- [ ] Criar componente SpreadsheetTab2.tsx
- [ ] Tabela com colunas: Data, Uber, 99, InDrive, Entregas, Gorjetas, Outros, Total
- [ ] Input para cada coluna
- [ ] Botão +Adicionar Dia
- [ ] Cálculo automático de Total do Dia

### Fase 4: Aba 3 - Gastos Diários
- [ ] Criar componente SpreadsheetTab3.tsx
- [ ] Tabela com 15 categorias de gasto (combustível, aluguel, manutenção, etc)
- [ ] Input para cada categoria
- [ ] Botão +Adicionar Dia
- [ ] Cálculo automático de Total de Gastos

### Fase 5: Aba 4 - Controle Operacional
- [ ] Criar componente SpreadsheetTab4.tsx
- [ ] Tabela com: Data, KM Inicial, KM Final, KM Rodados, Horário Inicial, Horário Final, Horas, Corridas, Faturamento, Gastos, Lucro
- [ ] Cálculos automáticos: KM Rodados = Final - Inicial, Horas = Final - Inicial, Lucro = Faturamento - Gastos

### Fase 6: Aba 5 - Metas e Resultados
- [ ] Criar componente SpreadsheetTab5.tsx
- [ ] Campos de entrada: Meta Diária, Meta Semanal, Meta Mensal
- [ ] Exibir Resultado Diário, Semanal, Mensal (vem da Aba 1)
- [ ] Mostrar Médias: por hora, por corrida, por km
- [ ] Indicadores: Melhor Dia, Melhor Semana, Melhor Aplicativo

### Fase 7: Aba 6 - Dashboard com Gráficos
- [ ] Criar componente SpreadsheetTab6.tsx
- [ ] Gráficos usando Chart.js ou Recharts: Faturamento, Gastos, Lucro, Comparativo Uber/99/InDrive
- [ ] Gráficos de evolução: KM, Horas, Corridas
- [ ] Card de resumo final: Total Faturamento, Total Gastos, Lucro Líquido, Total Corridas, Total KM, Total Horas, App Mais Lucrativo

### Fase 8: Sistema de Licenças (Grátis/Premium)
- [ ] Criar tabela licenses com: userId, type, status, expiresAt, createdAt
- [ ] Plano Grátis: acesso limitado (ex: últimos 30 dias, sem gráficos avançados)
- [ ] Plano Premium: acesso completo, histórico ilimitado, gráficos avançados
- [ ] Página de upgrade com opções de plano
- [ ] Integração com InfinitePay para pagamento

### Fase 9: Sistema de Vencimento de Licenças
- [ ] Implementar avisos: 30 dias antes, 15 dias antes, 7 dias antes
- [ ] Notificações por email/WhatsApp quando licença está vencendo
- [ ] Bloquear acesso após vencimento (redirecionar para upgrade)
- [ ] Renovação automática se configurado

### Fase 10: Painel Administrativo - Controle de Licenças
- [ ] Criar página /admin/spreadsheet-licenses
- [ ] Listar todos os usuários e suas licenças
- [ ] Visualizar: tipo de plano, data de expiração, status (ativo/vencido)
- [ ] Ações: bloquear usuário, estender licença, renovar, cancelar
- [ ] Filtros: por status, por tipo de plano, por data de vencimento
- [ ] Busca por usuário/email/telefone
- [ ] Relatório de uso: quantos usuários estão usando, taxa de renovação

### Fase 11: Testes e Checkpoint Final
- [ ] Testes para CRUD de spreadsheets
- [ ] Testes para cálculos automáticos de cada aba
- [ ] Testes para sistema de licenças
- [ ] Testes para avisos de vencimento
- [ ] Testes para painel administrativo
- [ ] Salvar checkpoint final


## Correção Definitiva do Login /gastos (01/07/2026)
- [x] Diagnóstico: senha armazenada como hash bcrypt mas login comparava texto plano
- [x] Login agora detecta automaticamente hash bcrypt ($2a/$2b/$2y) vs texto plano
- [x] Corrigido require('crypto') -> import { randomBytes } from "crypto"
- [x] Removido procedimento de debug temporário
- [x] Testado via curl (HTTP 200, success:true)
- [x] Testado no frontend (dev): cliente ADES VEG logou e acessou a planilha
- [ ] PENDENTE: usuario precisa PUBLICAR para walkajuda.com receber a correcao

## Refatoração do Layout da Planilha de Gastos
- [ ] Mover coluna Data para esquerda como coluna vertical
- [ ] Converter cada data em um card colorido com bordas
- [ ] Aplicar cores diferentes para cada data (gradiente ou paleta)
- [ ] Manter tabela horizontal com categorias de gastos
- [ ] Sincronizar scroll entre coluna de datas e tabela de gastos

## Bug cliente (11) 94719-6871 (pedidos órfãos + erro finalizar)
- [x] Admin listOrders deve incluir pedidos órfãos (registrationId sem linha em accessCodePhones) vinculando por telefone do cliente
- [x] Garantir que os 3 pedidos do cliente 11947196871 apareçam no admin
- [x] Robustecer finalização de novo pedido para evitar erro "sem internet"
- [x] Vitest cobrindo o cenário de pedido órfão aparecendo na lista do admin

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
- [x] Verde só para positivos, vermelho só para gastos/prejuízo
- [x] Abas com aba ativa destacada em azul (fix dark:data-[state=active]:bg-primary)
- [x] Botão Adicionar (Ganho/Gasto/Operacional) azul mais forte
- [x] Botão Deletar menor e mais elegante
- [x] Inputs: altura padrão, borda azul no foco, placeholder mais claro
- [x] Centralizar conteúdo, reduzir espaços vazios
- [x] Responsividade mobile em coluna única
- [x] Não alterar nenhuma função (somente visual)

## Tela de login /gastos com as mesmas cores do painel logado (somente visual)
- [x] Trocar gradiente roxo por fundo azul escuro do painel (#070a16/#0a0f22)
- [x] Card, borda, brilho azul, ícone e título no mesmo estilo do painel
- [x] Inputs com altura padrão, borda azul no foco e placeholder mais claro
- [x] Botão Entrar em azul neon (primary)
- [x] Tela de loading "Carregando..." também no tema azul
- [x] Nenhuma função alterada (somente visual)

## Correção: manter registros SEPARADOS na mesma data (soma no total, não substitui)
- [x] createExpense: sempre INSERT (mostra os dois lançamentos, ex. 7 e 10)
- [x] createEarning: sempre INSERT (mostra os dois lançamentos)
- [x] Total de gastos, lucro, relatórios e gráficos somam TODOS os registros
- [x] Frontend: grade por data mostra cada lançamento (removidas linhas vazias '-')
- [x] Vitest cobrindo múltiplos registros na mesma data (7+10=17 e 80+20=100)
- [x] Não alterado comportamento de update/delete existentes

## Adicionar botão Editar em cada lançamento (Gastos, Ganhos, Operacional)
- [x] Botão Editar na lista de Gastos (carrega valores nos campos e salva via updateExpense)
- [x] Botão Editar na lista de Ganhos (updateEarning)
- [x] Botão Editar na lista de Operacional (updateOperational)
- [x] Modo edição: trocar "Adicionar" por "Salvar alterações" + botão Cancelar
- [x] Após salvar/cancelar, limpar o modo edição e recarregar dados
- [x] Testar em desktop e mobile

## Novo fluxo de autenticação Gastos (Jul 2026)
- [x] Adicionar campo `pendingApproval`, `createdByClient`, `clientCreatedAt` na tabela spreadsheetPasswords
- [x] Adicionar procedure `checkPhone`: verifica cadastro, retorna found/not_found/blocked
- [x] Adicionar procedure `clientCreatePassword`: cliente cria senha (salva como pendente, sem validade)
- [x] Atualizar procedure `login`: bloquear se senha pendente (sem validade) ou expirada
- [x] Adicionar procedure `adminSetExpiry`: admin define validade/vencimento de senha pendente
- [x] Reimplementar GastosLoginPage: etapa 1 = só telefone, etapa 2 = criar senha, etapa 3 = aguardando aprovação
- [x] Atualizar AdminGastosPage: seção de senhas pendentes com alerta, botão para definir validade
- [x] Aplicar migração SQL no banco

## Sistema de Upload de Mídia com URL /video/slug (Jul 2026)
- [x] Tabela adminMediaFiles com campo videoSlug criada no banco
- [x] Endpoints chunked: init-media, chunk-media, finalize-media, media-job-status
- [x] Endpoint finalize-media aceita e salva videoSlug no banco
- [x] Rota dinâmica /video/:slug no servidor (busca fileKey no banco pelo slug)
- [x] AdminMedia.tsx: campo de slug auto-preenchido com nome do arquivo
- [x] AdminMedia.tsx: exibe URL /video/slug como URL principal após upload
- [x] AdminMedia.tsx: botão Copiar URL copia URL absoluta (com domínio)
- [x] AdminMedia.tsx: lista de mídias mostra URL /video/slug se tiver slug
- [x] TypeScript sem erros
- [x] Bug: polling de media-job-status usa Map em memória (perde estado em instâncias serverless)
- [x] Correção: jobId = uploadId, status persistido nas colunas jobStatus/jobUrl/jobError da tabela uploadSessions
- [x] Sessão deletada somente após 10 minutos (polling tem tempo para ler o status "done")
- [x] Caso sessão já deletada: endpoint retorna done buscando último registro em adminMediaFiles
- [x] Refatoração final: finalize-media agora é SÍNCRONO (sem polling, sem Map em memória)
- [x] Servidor monta chunks, envia para S3, salva no banco e retorna URL /video/slug diretamente
- [x] Testado com vídeo de 58.9MB — 3.2s para montar e retornar URL
- [x] Rota /video/slug retorna player HTML funcional
- [x] Lista de mídias exibe slug corretamente

## Upload de Mídia V2: Upload direto para S3 (Jul 2026)
- [x] Frontend envia chunks DIRETO para S3 via presigned PUT URLs (sem passar pelo backend)
- [x] Backend gera presigned PUT URLs no init-media e retorna ao frontend
- [x] Endpoint confirm-chunk para frontend confirmar cada chunk enviado
- [x] Finalize-media processa em background (setImmediate) e retorna jobId imediatamente
- [x] Status no banco: uploading → processing → completed | failed
- [x] Polling de status via banco (funciona em qualquer instância serverless)
- [x] Mensagem clara: "Vídeo enviado, estamos processando. Pode levar alguns minutos."
- [x] Timeout de polling: 10 minutos máximo (frontend mostra erro se exceder)
- [x] Retry automático: 3 tentativas por chunk com backoff exponencial
- [x] Testado com 50MB: SUCESSO (5.8s)
- [x] Testado com 60MB: SUCESSO (4.7s)
- [x] Testado com 100MB: SUCESSO (8.7s)

## Geradores e Consulta de CEP (Jul 2026)
- [x] Gerador de Telefone (verde) — DDD por cidade, formato formatado
- [x] Gerador de CPF (roxo) — seleção de estado com região fiscal correta, formato, quantidade
- [x] Gerador de RG (azul) — estado emissor, dois formatos (pontuado e sem pontuação)
- [x] Gerador de CNH (laranja) — algoritmo DETRAN, 11 dígitos, formato com espaço
- [x] Layout em grid 2 colunas (Telefone+CPF na linha 1, RG+CNH na linha 2)
- [x] Consulta de CEP (teal) — integrada na mesma página /admin/telefone, abaixo dos geradores
- [x] ConsultaCep: busca via ViaCEP, histórico de 10 consultas, copiar campo individual ou tudo

## Módulo de Gerenciamento de Emails Zoho Mail (Jul 2026)
- [x] Configurar secrets ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID no projeto
- [x] Criar helper server/zoho.ts para autenticação OAuth e chamadas à API do Zoho Mail
- [x] Criar rotas tRPC: email.list, email.create, email.delete, email.resetPassword, email.toggle
- [x] Criar página AdminEmail.tsx com tabela de contas, formulário de criação e ações
- [x] Adicionar rota /admin/email no App.tsx
- [x] Botão de acesso rápido ao webmail (mail.zoho.com) abrindo em nova aba

## Hub Central de Acesso — Botões Rápidos Dinâmicos (Jul 2026)
- [x] Adicionar colunas linkType, openInNewTab, vipOnly na tabela homeButtons (SQL migration)
- [x] Atualizar schema Drizzle com novos campos
- [x] Atualizar HomeButtonData e createHomeButton no db.ts
- [x] Atualizar procedures create/update no routers.ts para aceitar novos campos
- [x] Reescrever HomeButtonsManager com 10 tipos de link, 18 ícones, preview ao vivo, checkboxes VIP/nova aba
- [x] Atualizar título da seção no AdminSettings para "Botões Rápidos - Hub Central de Acesso"
- [x] Expandir EXTRA_BTN_ICONS no WelcomeScreen com todos os novos ícones emoji
- [x] Corrigir handleExtraBtn para respeitar openInNewTab (nova aba vs mesma janela)
- [x] Filtrar botões vipOnly=1 na tela pública (não exibir para não-VIPs)
- [x] Adicionar CSS walk-hover-brightness ao bloco de estilos injetados

## Unificação do Sistema de Senha (customerPassword)
- [x] Substituir sistema VIP antigo (walk_access_code/walk_access_granted) no PasswordGate pelo novo customerPassword
- [x] Fluxo: telefone → checkStatus → se no_password: criar senha → se active: fazer login com customerPassword.login
- [x] Token cp_token compartilhado entre PasswordGate e /acompanhar (mesma sessão)
- [x] Clientes novos: cadastro normal → depois criar senha via customerPassword
- [x] Remover campo de senha inline do step phone (campo VIP antigo)

## Reformulação do Sistema de Indicação (Jul 2026)
- [x] Mover formulário de indicação para APÓS o pedido ser finalizado (tela de sucesso)
- [x] Pergunta "Alguém te indicou?" com botões SIM/NÃO na tela de sucesso
- [x] Botão SIM mostra campo de telefone do indicador com validação (11 dígitos)
- [x] Botão NÃO direciona para o WhatsApp normalmente
- [x] Indicador aparece antes do botão WhatsApp na tela de sucesso
- [x] Validação: não pode indicar a si mesmo
- [x] Salva indicação via trpc.customers.updateReferral
- [x] Não mexe na estrutura do pedido — fluxo segue o mesmo percurso
- [x] Aviso obrigatório e botão WhatsApp só aparecem após responder a pergunta de indicação

## Correção - Cards de Destaque (featureCards)
- [x] Bug: botões ▲▼ de reordenação não funcionavam porque todos os cards tinham sortOrder=0
- [x] Corrigida lógica do moveCard para usar índices da lista como valores de sortOrder (troca sempre resulta em valores distintos)
- [x] Inicializados sortOrder dos cards existentes com valores distintos (0, 1, 2...)
- [x] Procedure create agora atribui sortOrder automaticamente como próximo número na sequência
## Correções na Planilha de Gastos (Jul 2026)
- [x] Bug: Valores zerados nos cards de resumo durante carregamento após refresh - adicionado skeleton animado (earningsLoading/expensesLoading)
- [x] Bug: useEffect de sincronização earnings/expenses usava `if (data)` que não atualizava quando data era undefined (erro) - corrigido para `if (data !== undefined)`
- [x] Feature: Exibir horário (hora:minuto) de cada lançamento individual no histórico de gastos e ganhos
- [x] Feature: Horário formatado com fuso horário Brasil (America/Sao_Paulo) via Intl.DateTimeFormat
- [x] Feature: Função utilitária formatCreatedAtTime para conversão robusta de timestamps UTC para BRT
## Valor do Pedido em Destaque no Admin (Jul 2026)
- [x] Adicionar coluna pricePaid (varchar 64) na tabela orderStatusHistory
- [x] Popular pedidos antigos: match serviceOption com productOptions.label para preencher pricePaid
- [x] Atualizar submitFiles para salvar pricePaid no momento do pedido
- [x] Atualizar listOrders para retornar pricePaid
- [x] Exibir pricePaid em destaque grande no card do pedido no AdminOrders

## Copiar Perguntas de Outro Produto
- [x] Adicionar endpoint copyQuestionsFromProduct no backend (copia todas as perguntas de um produto para outro, substituindo as existentes)
- [x] Adicionar botão "📋 Copiar de outro produto" na seção de perguntas do AdminProducts
- [x] Implementar modal de seleção de produto de origem com lista de todos os produtos/opções
- [x] Confirmar substituição antes de executar

## Propagandas por Página (targetPages)
- [x] Adicionar coluna targetPages (varchar, ex: "gastos,acompanhar,pedidos") na tabela infoBanners
- [x] Atualizar endpoints de criação/edição de banner para aceitar targetPages
- [x] Atualizar query getInfoBanners para filtrar por página (parâmetro page no endpoint listActive)
- [x] Adicionar seletor de páginas (checkboxes) no admin de propagandas (AdminBanners.tsx)
- [x] Adicionar componente de banner na página /acompanhar (OrderTracking.tsx)
- [x] Adicionar componente de banner na página de pedidos (Home.tsx com page='pedidos')
- [x] Adicionar componente de banner na página de gastos (SpreadsheetPage.tsx com page='gastos')
- [x] Banners existentes sem targetPages exibidos apenas em gastos (compatibilidade - default 'gastos')
- [x] Corrigir erro TypeScript: trpc.banners.listActive.useQuery() agora exige argumento { page }

## Página de Destino nas Propagandas (AdCampaigns targetPages)
- [x] Adicionar coluna targetPages (varchar, default 'gastos') na tabela adCampaigns
- [x] Atualizar backend: checkForClient aceita parâmetro page e filtra por targetPages
- [x] Atualizar backend: create/update aceitam targetPages
- [x] Atualizar AdminAdCampaigns: seletor de páginas (botões toggle) no formulário de criação/edição
- [x] Atualizar AdminAdCampaigns: exibir páginas na lista de campanhas (badges azuis)
- [x] Atualizar SpreadsheetPage: passar page='gastos' no checkForClient
- [x] Verificar outras páginas: somente SpreadsheetPage usa adCampaigns (OrderTracking e Home não usam)

## Sistema de Revendedor
- [x] Adicionar colunas na tabela customers: isReseller (boolean), resellerDiscountType ('percent'|'fixed'), resellerDiscountValue (decimal)
- [x] Adicionar colunas na tabela accessCodePhones: thirdPartyName (varchar), resellerDiscountApplied (decimal)
- [x] Criar endpoint admin: setReseller (ativar/desativar revendedor e definir desconto)
- [x] Criar endpoint: getResellerDiscount (retorna desconto do cliente logado para calcular no frontend)
- [x] Atualizar endpoint submitFiles para salvar thirdPartyName e resellerDiscountApplied
- [x] Lógica de desconto: aplica no valor final (garantia se houver, produto se não houver), sem desconto se item tiver promoção ativa
- [x] Painel admin: seção "Revendedor" no cadastro do cliente com toggle + tipo (% ou R$) + valor
- [x] Painel admin: exibir nome do cliente final (terceiro) e desconto aplicado no painel de detalhes do pedido (AdminOrders)
- [x] Formulário de pedido: campo "Para quem é este pedido?" (nome do terceiro, opcional, só aparece para revendedores)
- [x] Formulário de pedido: exibir desconto de revendedor aplicado e aviso de promoção ativa

## Agrupamento de Carrinho (cartGroupId)
- [ ] Adicionar coluna cartGroupId (varchar) na tabela accessCodePhones
- [ ] Adicionar coluna cartTotal (decimal) e cartCouponCode (varchar) e cartCouponDiscount (decimal) na tabela accessCodePhones
- [ ] Backend: gerar cartGroupId único ao criar múltiplos pedidos do mesmo carrinho
- [ ] Backend: salvar cartTotal, cartCouponCode e cartCouponDiscount em todos os pedidos do grupo
- [ ] Frontend submitFiles: gerar e enviar cartGroupId quando há múltiplos itens no carrinho
- [ ] Frontend submitFiles: enviar cartTotal, cartCouponCode e cartCouponDiscount
- [ ] AdminOrders: agrupar cards por cartGroupId — pedidos do mesmo grupo em um único card
- [ ] AdminOrders: exibir cada produto em bloco separado com número, serviço, opção, valor e status
- [ ] AdminOrders: comprovante PIX aparece apenas no Produto 1 (primeiro do grupo)
- [ ] AdminOrders: documentos de cada produto aparecem no bloco do respectivo produto
- [ ] AdminOrders: rodapé do card agrupado mostra TOTAL, DESCONTO (cupom) e TOTAL PAGO
- [ ] AdminOrders: botões de ação (Auto, Urgente, Atender, Agendamento) por produto individualmente
- [ ] Notificação WhatsApp: listar todos os produtos, números de pedido e valor total correto
- [ ] Notificação Email: listar todos os produtos, números de pedido e valor total correto
- [ ] Pedidos antigos sem cartGroupId continuam aparecendo separados (compatibilidade)

## Correção Notificação de Pedido (Jul 2026)
- [x] Corrigir mensagem WhatsApp/notificação para incluir: quem indicou, múltiplos pedidos numerados, respostas do formulário, documentos com URLs e valor total

## Correção Bug de Acesso Sem Senha (Jul 2026)
- [x] Identificado: cliente FELIPE (11993451851) acessava via sessão antiga do código SEXTA25 (deletado)
- [x] Identificado: senha geral do site é "Walkcontas" - qualquer um que soubesse entrava
- [x] Corrigido PasswordGate.tsx: quando modo MANUAL ativo, sessão antiga (walk_access_granted) é invalidada
- [x] Corrigido db.ts validateAccessCode: senha geral bloqueada quando modo MANUAL ativo
- [x] Corrigido db.ts validateAccessCode: senha fixa individual bloqueada quando modo MANUAL ativo
- [x] Corrigido db.ts checkAccessCodeCanSubmit: senha geral bloqueada quando modo MANUAL ativo
- [x] Adicionado procedure appSettings.getManualMode no routers.ts (público, retorna {isManual: boolean})

## Editor de Formulários Fixos (Jul 2026)
- [x] Adicionar coluna originalFields na tabela consultaForms
- [x] Criar procedures: saveFormFields, restoreFormFields, initBuiltinFields, uploadDoc
- [x] Criar componente FormFieldEditor no AdminConsultas com: adicionar/editar/remover linhas, mover campos entre linhas, duplicar linhas, escolher 1/2/3 colunas, campos obrigatórios/opcionais, ativar/desativar campos, restaurar padrão
- [x] Criar FormDinamico no ServicosExtras para renderizar formulários usando campos do banco
- [x] Manter formulários hardcoded como fallback quando não há campos configurados

## Verificação de Cadastro Completo Obrigatório
- [x] PasswordGate verifica se cliente tem email e CPF após login
- [x] Se faltar email ou CPF, mostra tela "Complete seu Cadastro" antes de liberar acesso
- [x] Tela mostra Nome e Telefone (somente leitura com checkmark verde)
- [x] Campo E-mail editável se faltar, somente leitura se já preenchido
- [x] Campo CPF editável com máscara se faltar, somente leitura se já preenchido
- [x] Botão "Salvar e Continuar" chama updateEmailByPhone e/ou updateCpfByPhone
- [x] Após salvar, refetch do perfil libera acesso automaticamente

## Faixa "Entregue em" na pasta Entregues
- [x] Faixa teal com data/hora do status "Entregue" exibida em destaque no topo de cada card da pasta Entregues
- [x] Usa campo latestStatusAt já disponível no pedido (sem nova query)
- [x] Visível mesmo com o card recolhido

## E-mail em massa com intervalo configurável
- [x] Adicionar coluna sendIntervalSeconds e scheduleCronTaskUid na tabela broadcasts
- [x] Criar tabela broadcastQueue para fila de envio individual
- [x] Backend: procedure para iniciar envio com intervalo (cria fila + Heartbeat)
- [x] Endpoint Heartbeat /api/scheduled/broadcastEmail que processa 1 e-mail por disparo
- [x] Frontend: campo de intervalo no formulário de broadcast (Imediato, 1min, 2min, 3min, 5min, 10min)
- [x] Frontend: histórico mostra status Enviando com contador enviados/total e badge de intervalo
- [ ] Frontend: botão de cancelar envio em andamento (futuro)

## Bug: Textareas não editáveis na aba Mensagens do AdminSchedule
- [x] Bug: Textareas na aba Mensagens não aceitavam digitação direta (botões de variáveis funcionavam)
- [x] Causa raiz: SectionEditor disparava onChange no mount inicial causando loop de re-render
- [x] Fix: Adicionado isFirstRender.current no SectionEditor para skip do primeiro useEffect
- [x] Fix: Adicionado staleTime: Infinity e refetchOnWindowFocus: false no getConfig query
- [x] Fix: Reset do formInitialized.current após salvar para permitir re-inicialização com dados frescos

## Melhorar design do e-mail de Novo Pedido
- [x] Reformatar seção "Respostas do Formulário" no e-mail com quebras de linha (cada pergunta/resposta em linha separada)
- [x] Melhorar visual geral da seção de informações adicionais no e-mail
- [x] Não alterar nada no WhatsApp (está correto)

## Bug: Recebido Hoje mostrando R$ 0,00 no dashboard Empréstimos
- [x] Corrigir cálculo de 'today' para usar fuso horário BRT (GMT-3) em vez de UTC
- [x] Corrigir query DATE(paidAt) para considerar fuso horário ao comparar com 'hoje'

## Bug: Dados de Acesso sem quebra de linha no e-mail de status para o cliente
- [x] Corrigir loginData passado ao emailStatusCliente - remover .replace(/<[^>]+>/g, '') que apagava as tags HTML
- [x] Corrigir loginBlock no emailTemplates para renderizar HTML direto em vez de nl2br (que não funciona com HTML)

## Aba Finalizados em Empréstimos
- [x] Criar aba "Finalizados" na tela AdminLoans para separar empréstimos pagos/quitados dos ativos
- [x] Empréstimos com status "pago" ou todas parcelas pagas ficam na aba Finalizados
- [x] Aba "Ativos" mostra apenas empréstimos em andamento
- [x] Corrigido bug: todas as procedures de empréstimos usavam protectedProcedure (exigia Manus OAuth) — trocado para adminProcedure (aceita JWT admin independente)

## Bug: Retomada de progresso ("Continuar de onde parou") não restaura sub-perguntas, fotos e documentos
- [x] Fix: useEffect de profilePhoto sobrescreve preview restaurado do banco com null
- [x] Fix: useEffect de docFiles sobrescreve docFilePreviews restaurados do banco (recria apenas de docFiles locais)
- [x] Fix: Validação de uploads (validateUploadsAndProceed e handleFinalSubmit) exige File objects locais — deve aceitar URLs já salvas no banco
- [x] Fix: UI de documentos dinâmicos trata preview do banco como se arquivo não existisse (hasFile = !!docFiles[doc.id])
- [x] Fix: Sub-perguntas — questionAnswers restaurado funciona corretamente com buildOrderedQs (verificado - já funcionava)

## Bug: Formulário de pré-cadastro na página admin está confuso
- [x] Remover perguntas duplicadas (mesmo conteúdo aparecendo em cima e embaixo)
- [x] Organizar sub-perguntas de forma hierárquica e clara (indentação/agrupamento)
- [x] Melhorar layout geral do modal de detalhes do pré-cadastro para ser fácil de entender

## Bug: Retomada de progresso ainda pede reenvio de documentos dinâmicos (DOC CARRO)
- [x] Fix: Implementado upload imediato ao S3 quando arquivo é selecionado + salvar URL no localStorage
- [x] Fix: Na retomada, ler URLs do localStorage e popular restoredFileUrls (sem depender do banco)
- [x] Fix: No submit, priorizar URL já salva (restoredFileUrls) em vez de re-enviar
- [x] Fix: Limpar UPLOADED_FILES_KEY em todos os pontos de reset (success, startFresh, resetAll, handleOption, handleService, startCartCheckout)

## Bug: Sub-perguntas fora de ordem na mensagem do WhatsApp
- [x] Ordenar perguntas por sortOrder na mensagem do WhatsApp/email
- [x] Indentar sub-perguntas abaixo da pergunta-pai com seta ↳ (hierarquia visual)
- [x] answersArray construído com ordenação hierárquica recursiva (pai → filhos → netos)

## Feature: Abertura automática de pedido ao pressionar Enter na busca
- [x] Ao pressionar Enter na barra de busca da página de Pedidos com exatamente 1 resultado, abrir automaticamente o modal de detalhes desse pedido

## Feature: Exibir nome do produto/serviço nos agendamentos
- [x] Mostrar nome do produto (ex: UBER APP, UBER TAXI) em cada card da página de Agendamentos

## Tutorial de Ajuda para Clientes
- [x] Botão flutuante ❓ na tela de pagamento e sucesso
- [x] Modal com guia passo a passo (6 etapas): Copiar PIX → Pagar no banco → Enviar comprovante → Finalizar → Indicador → WhatsApp
- [x] Componente isolado (PaymentTutorial.tsx) sem alterar lógica existente

## Edição de Pedido e Pedido Manual
- [x] Incluir campo de valor (R$) no formulário de edição de pedido
- [x] Mostrar perguntas do produto ao editar (carregar do produto selecionado se pedido não tem)
- [ ] Verificar se pedido manual salva todos os dados corretamente (valor, perguntas)
- [x] Bug fix: Formulário de edição de pedido - perguntas tipo 'select' agora mostram dropdown com opções (match flexível do serviceOption com garantia, suporte a formato string separada por vírgula além de JSON)
- [x] Formulário de edição de pedido: sub-perguntas condicionais (parentQuestionId + triggerOption) agora respeitam a lógica de visibilidade - só aparecem quando a resposta da pergunta pai bate com o triggerOption (ex: "QUANTAS?" só aparece quando "TEVE CONTA FAKE?" = "SIM")
- [x] Sub-perguntas no formulário de edição exibidas com indentação visual (borda azul à esquerda + └) para diferenciar da pergunta pai

## Limite de Consultas por Semana (Serviços Extras)
- [ ] Adicionar configuração global no admin: limite máximo de consultas por cliente por semana
- [ ] Backend: validar ao criar nova consulta se o cliente já atingiu o limite semanal
- [ ] Frontend cliente: bloquear envio e mostrar mensagem quando limite atingido
- [ ] Admin pode ajustar o limite a qualquer momento
- [x] Limite semanal de consultas: backend (countConsultaRequestsThisWeek, validação no submit)
- [x] Limite semanal de consultas: admin pode configurar (0 = sem limite) na aba Gerenciar Formulários
- [x] Limite semanal de consultas: cliente vê aviso e botão desabilitado quando atingir o limite

## Mensagens Rápidas WhatsApp
- [ ] Criar tabela whatsappTemplates no banco (id, title, statusKey, message, imageUrl, videoUrl, mediaFileKey, mediaFileUrl, mediaType, sortOrder, isDefault, createdAt)
- [ ] Criar procedures tRPC: listTemplates, createTemplate, updateTemplate, deleteTemplate, uploadTemplateMedia
- [ ] Criar página AdminWhatsappTemplates.tsx para gerenciar mensagens (CRUD + upload de mídia)
- [ ] Adicionar rota /admin/whatsapp-templates no App.tsx e no menu lateral
- [ ] Modificar botão "Notificar via WhatsApp" no AdminOrders.tsx para abrir modal de seleção
- [ ] Modal: mostrar mensagem padrão do status atual, opção de trocar por outro pré-molde, editar texto, preview de imagem/vídeo
- [ ] Suporte a imagem e vídeo via URL ou arquivo pré-definido no painel
- [x] Corrigir salvamento de templates WhatsApp - tabela criada no DB + router corrigido para usar sql template literals do Drizzle
- [x] Bug: Botões de variáveis ({nome}, {pedido}, etc.) nos templates WhatsApp não inserem na posição do cursor - devem inserir onde o cursor está no textarea
- [x] Bug: Variável {servico} não funciona nos templates WhatsApp - corrigido em todos os locais de substituição (modal e envio direto)
- [x] Feature: Adicionar upload de fotos/imagens na página de Upload de Mídia (gerar URL pública como já faz com vídeos)
- [x] Feature: Adicionar meta tags Open Graph completas nas rotas /foto/:slug e /video/:slug para miniatura ao compartilhar no WhatsApp/redes sociais
- [x] Bug: Upload de vídeo preso em loop infinito "Processando..." - corrigido para processamento síncrono
- [x] Bug: URL copiada era do CloudFront em vez da URL amigável com miniatura (walkajuda.com/foto/slug ou /video/slug)
- [ ] Feature: Melhorar Gerador Completo com todos dados de pessoa fictícia: nome (campo opcional), data nascimento, pai/mãe, endereço, email, gênero + campo nome opcional
- [x] Feature: Melhorar Gerador Completo com todos dados de pessoa fictícia: nome (campo opcional), data nascimento (20-65 anos), pai/mãe, endereço, email, gênero
- [x] Feature: Gerador Completo - adicionar campos CNH completos (RENACH, Formulário CNH, Nº Registro, PGU, Categoria, Validade, Primeira Habilitação, Órgão Expedidor, Local Nascimento, Nacionalidade) e formato de saída igual ao modelo fornecido

## Bug: Juros cobrados sobre valor total em vez da parcela vencida
- [x] Corrigir backend payInterestOnly: calcular juros sobre soma das parcelas vencidas (pendentes com dueDate < hoje) em vez do loan.amount total
- [x] Corrigir frontend InterestOnlySection: usar overdueAmount do listLoans em vez de loan.amount
- [x] Adicionar subquery overdueAmount no listLoans (soma das parcelas pendentes vencidas)
- [x] Label dinâmico: "Parcela(s) vencida(s)" quando há parcelas vencidas, "Principal em aberto" como fallback

## Correções da Sessão Atual (Jul 2026)
- [x] Campo paidAmount adicionado à tabela loanInstallments via ALTER TABLE
- [x] payInterestOnly salva o valor cobrado em paidAmount (parcela pago_juros)
- [x] Subquery interestOnlyPaidTotal usa paidAmount (antes usava SUBSTRING_INDEX frágil)
- [x] Resumo financeiro corrigido: "Pago (juros)" inclui interestOnlyPaidTotal das parcelas pago_juros
- [x] Resumo financeiro corrigido: ratio usa installments (parcelas originais) em vez de totalInstallments (que inclui roladas)
- [x] Botão "Recibo Juros" adicionado para parcelas pago_juros (ao lado de "Desfazer Juros")
- [x] generateReceiptPdf suporta isInterestOnly=true: título "Recibo de Pagamento de Juros", linhas detalhadas, banner laranja "JUROS COBRADOS"
- [x] generateReceipt procedure: usa paidAmount como valor do recibo para parcelas pago_juros

## Correção de Segurança (Jul 2026)
- [x] BUG CRÍTICO: página Acompanhar Pedido exibia pedido de outro cliente — corrigido sincronizando searchPhone com o phone da sessão autenticada (checkSession) e limpando sessionStorage quando a sessão é inválida

## Promoções com Cronômetro (Jul 2026)
- [ ] Adicionar campo endsAt (data de encerramento) na tabela promotions
- [ ] Atualizar painel admin de promoções para definir data/hora de encerramento
- [ ] Redesenhar bloco "Promoções Ativas" na Home com visual premium
- [ ] Adicionar cronômetro decrescente por card de promoção (hh:mm:ss)
- [ ] Cronômetro com visual de urgência (vermelho pulsante quando < 1h)
- [ ] Promoção some automaticamente quando tempo zerar

## Reversão Automática de Promoção Expirada
- [x] Quando promoEndsAt expira: reverter price = originalPrice, limpar originalPrice e promoEndsAt automaticamente
- [x] Backend verifica promoções expiradas ao listar produtos e reverte no banco
- [x] Frontend filtra promoções expiradas e invalida query ao expirar
