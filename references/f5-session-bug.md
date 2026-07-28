# Bug: F5 volta ao login (Gestor de Gastos /gastos)

## Relato do usuário
- Login entra normalmente.
- Ao dar F5 (atualizar) pede login de novo, MESMO com senha/sessão válida.
- NÃO é a validade da senha do cliente (essa é controlada pelo admin — não mexer).

## Arquivos-chave
- client/src/pages/GastosPage.tsx  → estado isLoggedIn, verifySession ao carregar
- client/src/pages/GastosLoginPage.tsx → salva gastos_token no localStorage
- client/src/pages/SpreadsheetPage.tsx → usa token (prop + fallback localStorage)
- server/routers/spreadsheet.ts → login, verifySession, resolveClientId, logout
  - SESSION_DURATION_MS = 90 dias; sliding renew em resolveClientId

## Suspeitas para o F5
1. localStorage não persiste entre reloads (modo anônimo? cookies/storage bloqueados no navegador do cliente?).
2. verifySession useQuery com input {token: savedToken} — se savedToken vazio na primeira render e depois muda, ou refetch causa estado errado.
3. Possível: em produção, a rota /gastos recarrega e o React monta antes do localStorage? (não, localStorage é síncrono).
4. Possível: verifyQuery.isSuccess && !valid limpando token indevidamente por race (isLoading inicial).
5. Verificar se o token salvo no login realmente existe no banco (login usa insert; ok).

## A investigar
- Testar no navegador real: logar em /gastos e dar reload, ver Network (verifySession) e localStorage.
