# Auditoria de autenticação SEM SENHA — telefone + código por e-mail

**Data:** 30/10/2026  
**Escopo:** somente autenticação de clientes do site H2 Colombiano e seus serviços, integrada ao H2 AUTO/ADM.  
**Branch de referência do Render:** `recovery/organizar-salvos-2026-08-24` — commit `6356666b0a79ef7334aa26a503978d790778bbad`.  
**Condição para publicar:** não alterar produção nem o APK H2 AUTO 1.60 antes de a migração completa passar pelos testes.  
**Estado:** AUDITORIA, não é implementação do acesso sem senha.

## Solicitação e destino

O cliente que **já está cadastrado** digita exclusivamente (1) o telefone com DDD e (2) os seis dígitos recebidos no **e-mail já cadastrado**. O servidor localiza um único cadastro elegível, envia o código pelo gerador de e-mail existente, valida a resposta e cria sessão vinculada ao cliente. Nenhuma senha é criada, digitada, exigida, aprovada, renovada ou recuperada. O telefone sozinho **não libera** acesso.

**Novo cliente:** o cadastro precisa coletar um e-mail e provar sua titularidade por código antes de ativar a conta. O CPF, foto, indicador e demais campos cadastrais permanecem sujeitos às regras atuais; nunca criar senha depois de cadastrar.

**Administrador:** retirar somente as funções relativas à **senha de cadastro do cliente**: automático/manual, criação pelo cliente, liberação manual, definição manual, expiração de senha, reset e recuperação. **Manter** acesso administrativo, autenticação do ADM, bloqueio real de clientes, antifraude, validade de sessões, permissões por serviço, vínculo dos dispositivos, certificados e segredos operacionais. Essas funções não são "senha de cliente".

## Inventário de pontos reais de dependência

| Área | Fonte atual | Dependência encontrada | Ação segura |
|---|---|---|---|
| Login principal e primeiro cadastro | `client/src/components/PasswordGate.tsx` (3060 linhas) | telefone → e-mail → código → senha existente, criação automática/manual, foto/CPF, indicação, sessão legada | substituir decisão após OTP por criação de sessão; manter cadastro/foto/indicador/perm. de rota, eliminar UI de senha |
| Serviço de senha central | `server/routers/customerPassword.ts` (972 linhas) | `getMode/setMode`, `clientCreateAuto/Manual`, `login/loginVerified`, `adminApprove/Reset/SetPassword`, `request/finishPasswordRecovery` | novo contrato OTP único e session token; desativar rotas de senha em **backend** quando todos os consumidores forem migrados |
| Envio/verificação de e-mail | `customerPassword.startLoginEmailVerification/verifyLoginEmailCode`, `server/customerLoginEmailProof.ts`, `server/siteAccessCodeDelivery.ts` | gerador SMTP/Resend atual, prova assinada por telefone+e-mail, duração 20 min | reaproveitar entrega; tornar OTP de uso único e durável no banco |
| Painel ADM senha | `client/src/pages/AdminCustomerPasswordPage.tsx` | auto/manual, senha pendente, liberação, reset, validade e definição | substituir por painel "Acesso por código" sem funções de senha; preservar autorização por rota |
| Página recuperação | `client/src/pages/RecuperarSenha.tsx`, rota `/recuperarsenha` | telefone → código → nova senha | remover formulário e endpoint; redirecionar para login por código |
| Gastos e Empréstimos | `GastosLoginPage.tsx`, `GastosPage.tsx`, `EmprestimoPage.tsx`, `trpc.spreadsheet.login` | segunda senha independente com criar/renovar/expirar; fallback de `gastos_token` | mesmo `cp_token` gerado após OTP, sem segundo login; **manter** autorização e permissões financeiras |
| Atualizar cadastro | `AtualizarCadastro.tsx`, `server/routers/customerUpdate.ts` | senha existente ou criar senha; `customerUpdate.login/createPassword` também emitem sessão | aceitar somente sessão emitida por OTP; sem atalho telefone+senha; preservar upload, CPF, e-mail e integridade do perfil |
| Pedidos / site | `server/routers.ts`, `server/customerSession.ts`, `Home.tsx` | `cpToken`, `customerPasswordSessions`, `requireCustomerSession`, permissões e produtos | manter contrato de sessão por cliente e endpoint autenticado |
| Validade e logout | `customerPassword.checkSession/logout`, `customerSession.ts` | token de até **90 dias**, renovação automática ao consultar, fallback para `spreadsheetSessions` | exigir sessão emitida pelo OTP e validade fixa configurada, revogável; não aceitar sessões legadas como atalho |
| Autorização no WhatsApp | `server/h2-auto-access.ts`, `server/h2-auto-orders.ts`, `android-overrides/OrderConversation.java` | fluxo de telefone+código de e-mail já existente, sessão separada por dispositivo/conversa | preservar; comparar regras de vínculo, bloqueio, expiração e envio; não alterar o APK 1.60 |
| Restrição legítima do cadastro | `customers.blocked`, `customerAccess.ts`, `h2-auto-validation-blocks` | bloqueios administrativos/validação independentes de senha | **NÃO REMOVER:** desativar apenas bloqueio/expiração de senha, não sanções e proteção antifraude |
| Senhas de outras finalidades | `adminAuth`, `adminAuthenticator`, chave de assinatura APK, SMTP, sorteio, VIP, automações | privilégios diferentes, segredos de integração, funções pagas | não entrar na migração de identidade do cliente sem outra análise individual |

## Achados críticos de segurança

1. **Vários logins independentes:** eliminar senha somente no login principal deixaria `spreadsheet.login`, `customerUpdate.login` e outros endpoints aceitando senha. Ao habilitar OTP deve-se bloquear essas rotas no servidor, não apenas esconder botões.
2. **OTP de login principal mantido em memória:** `loginEmailPending` é `Map` com código em texto e hash SHA-256, sem persistência transacional ou limite global por remetente/IP. Reiniciar Render perde códigos; tentativa distribuída por reinício não fica registrada. Implantar ledger persistente + HMAC secreto + limite por telefone/IP e entrega confirmada.
3. **Código com pouca entropia:** seis dígitos precisam de expiração (por exemplo 10 min), tentativas limitadas por desafio, cooldown de reenvio, limite por janela/IP e consumo único. Evitar armazenamento de código em texto e de SHA-256 não secreto.
4. **Prova assinada reutilizável:** `issueLoginEmailProof` tem validade de 20 min, mas não é consumida em um banco. Para emitir sessão SEM senha, impedir que a mesma prova gere várias sessões (registro de nonce/digest com unicidade no banco, transacional).
5. **Sessões legadas e extensão de 90 dias:** `checkSession` prolonga a validade de sessões. Em OTP-only, adotar validade absoluta (proposta: 30 dias) e revogar por logout, bloqueio, troca de telefone/e-mail e ação do ADM. Na ativação, invalidar sessões emitidas por senha; não excluir dados de clientes.
6. **Mudança de e-mail/telefone:** a sessão deve estar vinculada ao cadastro único e ao e-mail efetivamente verificado; checar vínculo a cada operação sensível. Bloquear códigos enviados para endereço antigo e impedir duplicidade de identidade.
7. **Email no login atual:** há tela para digitar endereço de e-mail. Para cliente existente, dispensar esse campo e enviar **somente para o endereço cadastrado**, nunca para e-mail fornecido por terceiro. Novo cadastro continua exigindo informar e comprovar e-mail próprio.
8. **Caminhos de sessão antiga no navegador:** `PasswordGate` usa `walk_access_granted` / `walk_access_code` e `cp_token` com retornos legados; `Gastos/Empréstimos` usam `gastos_token`. A API protegida deve validar sessão emitida por OTP independentemente de valores de localStorage.
9. **Cliente bloqueado:** telefone ou OTP corretos não autorizam cadastro `blocked` / excluído, nem levantam bloqueio de validação H2 AUTO ou restrição por serviço. Não remover blocklist, rate limit e controles de fraude.
10. **Dados de senha histórica:** manter em backup até concluir migração; após corte, desativar uso e remover de forma planejada. Não deletar tabelas `customerPasswords` nem `customerPasswordSessions` às cegas: ainda têm consumidores.

## Contrato de API sugerido (separado das credenciais do ADM)

- `POST requestCustomerLoginCode({phone})`: normaliza o telefone, identifica um único cliente ativo, valida e-mail registrado, registra desafio no banco, envia código pela infraestrutura atual e retorna resposta genérica; não expõe o e-mail completo nem o status interno do cadastro.
- `POST verifyCustomerLoginCode({phone,code})`: consome código uma vez, valida pessoa não bloqueada e vínculo atual de telefone/e-mail, cria sessão aleatória revogável e retorna `cp_token`. Um segundo uso do mesmo código falha.
- `checkSession/logout`: só reconhecem sessões aptas ao novo modelo; verificam validade e vínculo. Dados sensíveis e permissão de cada rota continuam validados no **servidor**, não pela tela.
- `requestPasswordRecovery`, `finishPasswordRecovery`, `clientCreateAuto/Manual`, `login/loginVerified`, `customerUpdate.createPassword/login`, `spreadsheet.clientCreatePassword*/login`, `adminSetPassword/Reset/Approve`, `getMode/setMode`: desativação server-side após migração de todos os consumidores; não apagar códigos de recuperação/senhas de administradores que não pertençam ao login do cliente.

## Implementação em sequência obrigatória (não publicar parcialmente)

1. **Backup e identificação:** banco, configurações, rotas, endpoints, testes e rollback; separar credenciais de cliente vs outras finalidades.
2. **Autenticação nova no backend:** OTP persistente com limite/uso único, emissão de sessão, validade fixa, revogação e testes de troca de e-mail/telefone/ADM.
3. **Atualizar frontend completo:** `PasswordGate` existentes/novos, `Gastos`, `Empréstimos`, `AtualizarCadastro`, consulta de pedido e ADM. Somente após mudança visual completa, desligar endpoints antigos.
4. **Migração de sessões:** confirmar login novo funcionando, encerrar antigas sessões por senha no corte; impedir fallback local ou `spreadsheetSessions`. Preservar dados de cadastro, pedidos e histórico.
5. **Desativar senhas antigas no servidor:** endpoints de login/criação/reset/cadastro manual devem negar ações, não só sumir do menu; preservar autorização por rota e bloqueio real.
6. **Testes gerais:** execução automatizada, TypeScript, build do site, integração OTP com banco de teste e provedor de e-mail, regressões de pedidos, gastos, empréstimos, agendamento, indicação, ADM e H2 AUTO.
7. **Publicação segura:** branch de alteração/PR com revisão, deploy controlado com logs, rollback para commit anterior; testar em celular Android/Xiaomi, navegador e WhatsApp; não lançar fallback inseguro.
8. **Descarte posterior:** somente após estabilização e backup, remover senhas obsoletas do banco de modo documentado.

## Matriz mínima de aceitação

| Teste | Resultado exigido |
|---|---|
| Telefone cadastrado, e-mail válido, código correto | sessão do cliente certo |
| Telefone não cadastrado | não libera sessão; fluxo de novo cadastro separado |
| Mesmo telefone / e-mail pertencente a outro cadastro | nenhum código útil nem acesso cruzado |
| E-mail alterado entre solicitação e confirmação | código rejeitado |
| Código errado, expirado, reutilizado, reenviado, muitas tentativas | bloqueio temporário do OTP sem bloquear permanentemente o cadastro |
| Reinício do Render entre envio e verificação | código existente continua válido até expirar, sem duplicação |
| Duas verificações simultâneas do mesmo código | uma única sessão autorizada |
| Cliente bloqueado, excluído ou sem permissão para rota | acesso negado, mesmo com OTP correto |
| Login no site, pedidos e acompanhamento | autenticação compartilhada e permissão específica preservada |
| Gastos e Empréstimos | mesma sessão OTP, sem telas ou endpoints de senha |
| Atualizar cadastro | autenticação por OTP, preservando uploads, CPF, e-mail, endereço |
| Novo cadastro (com foto/indicador) | e-mail validado, sem criação de senha |
| Admin muda e-mail/telefone ou bloqueia cliente | sessões e provas anteriores revogadas |
| Visitante envia token antigo ou usa localStorage manipulado | negado pelo servidor |
| Recuperar senha / criar senha auto, manual, reset via API antiga | bloqueado pelo servidor |
| Admin login, PINs não relacionados, SMTP e assinatura APK | permanecem funcionando |
| H2 AUTO WhatsApp Business normal e Business, pausas, notificações | funcionamento 1.60 intocado |
| Reverter implantação | dados preservados, rollback testado |

## Conclusão

**Não foi feita remoção de senha na produção.** O desenho desejado é factível, mas exige a migração coordenada de múltiplos pontos independentes. Remover apenas tela/coluna seria inseguro. Esta auditoria delimita a implementação e protege a versão funcionando do H2 AUTO.
