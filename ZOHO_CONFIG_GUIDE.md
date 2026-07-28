# 🔧 Troubleshooting - Erro "Zoho token error: invalid_client"

## ❌ Problema
Ao tentar criar uma conta de email, recebe erro:
```
Erro ao criar conta: Zoho token error: invalid_client
```

## ✅ Solução

### Passo 1: Verificar o arquivo `.env`

Você precisa ter um arquivo `.env` na raiz do projeto com estas variáveis:

```env
# Zoho Mail API Credentials
ZOHO_ORG_ID=xxxxx
ZOHO_CLIENT_ID=xxxxx
ZOHO_CLIENT_SECRET=xxxxx
ZOHO_REFRESH_TOKEN=xxxxx

# Database
DATABASE_URL=mysql://user:password@host:3306/database

# Email SMTP
SMTP_USER=walkajuda@walkajuda.com
SMTP_PASS=sua_senha_zoho
```

### Passo 2: Verificar as Credenciais

Se o erro persiste, pode ser que o **refresh token expirou**. Você precisa regenerar:

1. Acesse: https://api-console.zoho.com/
2. Vá em **Settings → Connections → Zoho Mail**
3. Revogue o token atual
4. Gere um novo token:
   - Scope necessário: `ZohoMail.organization.accounts.ALL,ZohoMail.organization.accounts.CREATE,ZohoMail.organization.accounts.UPDATE,ZohoMail.organization.accounts.DELETE`
   - Selecione "Self Client"
   - Copie o novo `refresh_token`

### Passo 3: Verificar Permissões

Certifique-se de que:
- ✅ A conta Zoho tem permissão de admin
- ✅ O plano Zoho permite criar múltiplas contas de email
- ✅ O `ZOHO_ORG_ID` está correto (encontre em Zoho Admin → Organization)

### Passo 4: Testar Conexão

Após atualizar `.env`, reinicie o servidor:

```bash
# Kill any running dev server
# Then restart
npm run dev
```

### Passo 5: Verificar Logs

Se ainda der erro, verifique os logs do servidor para mais detalhes:

```bash
# Terminal do servidor deve mostrar qual variável está faltando
ZOHO_ORG_ID=undefined
ZOHO_CLIENT_ID=undefined
ZOHO_CLIENT_SECRET=undefined
ZOHO_REFRESH_TOKEN=undefined
```

## 🔍 Checklist Final

- [ ] `.env` arquivo existe na raiz do projeto
- [ ] `ZOHO_ORG_ID` está preenchido
- [ ] `ZOHO_CLIENT_ID` está preenchido
- [ ] `ZOHO_CLIENT_SECRET` está preenchido
- [ ] `ZOHO_REFRESH_TOKEN` está preenchido (e não expirado)
- [ ] `DATABASE_URL` está preenchido
- [ ] Servidor reiniciado após configurar `.env`
- [ ] Tentando criar conta novamente

## 📝 Variáveis Necessárias (Resumo)

| Variável | Origem | Exemplo |
|----------|--------|---------|
| `ZOHO_ORG_ID` | Zoho Admin → Organization | `123456789` |
| `ZOHO_CLIENT_ID` | Zoho API Console → Client ID | `1000.xxxxx` |
| `ZOHO_CLIENT_SECRET` | Zoho API Console → Client Secret | `xxxxxx` |
| `ZOHO_REFRESH_TOKEN` | Gerado em Zoho API Console | `1000.xxxxx` |
| `DATABASE_URL` | Seu servidor MySQL | `mysql://user:pass@localhost:3306/db` |
| `SMTP_USER` | Seu email Zoho | `walkajuda@walkajuda.com` |
| `SMTP_PASS` | Sua senha Zoho | `SuaSenha123` |

## 🚨 Erro Comum

**Se o token foi regenerado no Zoho:**
1. O token antigo para de funcionar imediatamente
2. Você precisa atualizar o `.env` com o novo token
3. Reiniciar o servidor

---

**Precisa de ajuda?** Certifique-se que:
- Você é admin no Zoho Mail
- Tem permissão de criar aplicações OAuth
- O token não foi revogado manualmente
