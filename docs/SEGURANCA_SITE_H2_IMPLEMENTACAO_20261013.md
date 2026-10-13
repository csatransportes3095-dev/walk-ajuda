# Segurança do Site H2 — implementação isolada (não publicar)

Branch: feat/site-security-authorized-access-20261013
Base: 3cdade75d4b4b67c3ae721d30b400e25ceec89a4
Deploy automático da Render: somente branch recovery/organizar-salvos-2026-08-24.

## Escopo
- Card Segurança do Site: modos Público, Restrito e 403.
- Lista por identidade individual: nome, e-mail, telefone/cadastro, validade, suspensão e auditoria.
- Somente Super Admin altera modos e permissões; backend deve distinguir de administrador comum.
- Código por e-mail com hash, expiração, limites de tentativas; cookie de sessão HttpOnly e revogação.
- Autorização para visualizar site não equivale a acesso ao ADM nem aos dados de outros clientes.
- Bloqueio obrigatório no servidor antes do React, páginas, APIs e arquivos privados.
- Sem mudanças nas rotas existentes antes de testes e aprovação; migração aditiva.

## Evidências da auditoria
- client/src/pages/AdminCodes.tsx: cards e ordenação responsivos.
- client/src/App.tsx: modo manutenção local false e manifesto visual.
- server/_core/trpc.ts: adminProcedure valida apenas role admin no JWT.
- server/routers.ts: adminAuth.login usa role admin; adminCredentials não tem role superadmin.
- server/_core/index.ts: várias rotas Express antes do tRPC, exigindo proteção central antecipada.
- Render: walk-ajuda faz deploy automático apenas da branch recovery/organizar-salvos-2026-08-24; endereço alternativo onrender.com habilitado.

## Testes obrigatórios
1. Modo público preserva todas as rotas existentes.
2. Modo restrito impede HTML, APIs e mídia privada sem sessão, mesmo por chamada direta.
3. Visitante autorizado consegue acessar o site, mas não dados de outras pessoas.
4. Modo 403 responde HTTP 403; acesso de recuperação do ADM não é bloqueado.
5. OTP usa rate limit IP/e-mail, expiração, teto de tentativas e respostas não enumeráveis.
6. Revogação e modo sincronizados entre desktop, celular e instâncias.
7. Falha do banco não permite acesso no modo restrito.
8. H2ADS, workers, webhooks, pagamentos, cron e integrações recebem política individual segura.
9. Super Admin validado no backend com sessão recente e proteção MFA.
10. Migração aditiva, backup e rollback testados antes de qualquer merge.

## Pendências
- Verificar Cloudflare e impossibilidade de contornar proteção pela Render.
- Identificar Super Admin real com segurança, sem adivinhar username.
- Implementar middleware, UI, endpoints, migração e testes em ambiente de homologação.
- Executar pipeline completo e obter autorização expressa de publicação.

ESTADO: somente schema inicial e plano isolados; nenhuma alteração na produção.
