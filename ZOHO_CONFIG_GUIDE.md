# ðŸ”§ Troubleshooting - Erro "Zoho token error: invalid_client"

## âŒ Problema
Ao tentar criar uma conta de email, recebe erro:
```
Erro ao criar conta: Zoho token error: invalid_client
```

## âœ… SoluÃ§Ã£o

### Passo 1: Verificar o arquivo `.env`

VocÃª precisa ter um arquivo `.env` na raiz do projeto com estas variÃ¡veis:

```env
# Zoho Mail API Credentials
ZOHO_ORG_ID=xxxxx
ZOHO_CLIENT_ID=xxxxx
ZOHO_CLIENT_SECRET=xxxxx
ZOHO_REFRESH_TOKEN=xxxxx

# Database
DATABASE_URL=mysql://user:password@host:3306/database

# Email SMTP
SMTP_USER=h2@h2colombiano.com
SMTP_PASS=sua_senha_zoho
```

### Passo 2: Verificar as Credenciais

Se o erro persiste, pode ser que o **refresh token expirou**. VocÃª precisa regenerar:

1. Acesse: https://api-console.zoho.com/
2. VÃ¡ em **Settings â†’ Connections â†’ Zoho Mail**
3. Revogue o token atual
4. Gere um novo token:
   - Scope necessÃ¡rio: `ZohoMail.organization.accounts.ALL,ZohoMail.organization.accounts.CREATE,ZohoMail.organization.accounts.UPDATE,ZohoMail.organization.accounts.DELETE`
   - Selecione "Self Client"
   - Copie o novo `refresh_token`

### Passo 3: Verificar PermissÃµes

Certifique-se de que:
- âœ… A conta Zoho tem permissÃ£o de admin
- âœ… O plano Zoho permite criar mÃºltiplas contas de email
- âœ… O `ZOHO_ORG_ID` estÃ¡ correto (encontre em Zoho Admin â†’ Organization)

### Passo 4: Testar ConexÃ£o

ApÃ³s atualizar `.env`, reinicie o servidor:

```bash
# Kill any running dev server
# Then restart
npm run dev
```

### Passo 5: Verificar Logs

Se ainda der erro, verifique os logs do servidor para mais detalhes:

```bash
# Terminal do servidor deve mostrar qual variÃ¡vel estÃ¡ faltando
ZOHO_ORG_ID=undefined
ZOHO_CLIENT_ID=undefined
ZOHO_CLIENT_SECRET=undefined
ZOHO_REFRESH_TOKEN=undefined
```

## ðŸ” Checklist Final

- [ ] `.env` arquivo existe na raiz do projeto
- [ ] `ZOHO_ORG_ID` estÃ¡ preenchido
- [ ] `ZOHO_CLIENT_ID` estÃ¡ preenchido
- [ ] `ZOHO_CLIENT_SECRET` estÃ¡ preenchido
- [ ] `ZOHO_REFRESH_TOKEN` estÃ¡ preenchido (e nÃ£o expirado)
- [ ] `DATABASE_URL` estÃ¡ preenchido
- [ ] Servidor reiniciado apÃ³s configurar `.env`
- [ ] Tentando criar conta novamente

## ðŸ“ VariÃ¡veis NecessÃ¡rias (Resumo)

| VariÃ¡vel | Origem | Exemplo |
|----------|--------|---------|
| `ZOHO_ORG_ID` | Zoho Admin â†’ Organization | `123456789` |
| `ZOHO_CLIENT_ID` | Zoho API Console â†’ Client ID | `1000.xxxxx` |
| `ZOHO_CLIENT_SECRET` | Zoho API Console â†’ Client Secret | `xxxxxx` |
| `ZOHO_REFRESH_TOKEN` | Gerado em Zoho API Console | `1000.xxxxx` |
| `DATABASE_URL` | Seu servidor MySQL | `mysql://user:pass@localhost:3306/db` |
| `SMTP_USER` | Seu email Zoho | `h2@h2colombiano.com` |
| `SMTP_PASS` | Sua senha Zoho | `SuaSenha123` |

## ðŸš¨ Erro Comum

**Se o token foi regenerado no Zoho:**
1. O token antigo para de funcionar imediatamente
2. VocÃª precisa atualizar o `.env` com o novo token
3. Reiniciar o servidor

---

**Precisa de ajuda?** Certifique-se que:
- VocÃª Ã© admin no Zoho Mail
- Tem permissÃ£o de criar aplicaÃ§Ãµes OAuth
- O token nÃ£o foi revogado manualmente
