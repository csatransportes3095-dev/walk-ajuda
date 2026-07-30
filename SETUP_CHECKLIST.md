# âœ… Checklist - Configurar Funcionamento Completo

## ðŸ”´ PROBLEMA ATUAL
```
Erro ao criar conta: Zoho token error: invalid_client
```

Isso significa que as **credenciais do Zoho estÃ£o faltando/invÃ¡lidas**.

---

## âœ… SOLUÃ‡ÃƒO - FaÃ§a Isso:

### 1ï¸âƒ£ Verificar `.env`
VocÃª precisa de um arquivo `.env` na raiz com:

```env
# â­ OBRIGATÃ“RIO - Zoho Mail Credentials
ZOHO_ORG_ID=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=

# â­ OBRIGATÃ“RIO - Database
DATABASE_URL=mysql://user:password@host:3306/database

# â­ SMTP (email)
SMTP_USER=h2@h2colombiano.com
SMTP_PASS=sua_senha_aqui
```

**Se nÃ£o sabe esses valores:**
- VÃ¡ em: https://api-console.zoho.com/
- Procure por suas credenciais OAuth do Zoho Mail
- Copie e cole no `.env`

---

### 2ï¸âƒ£ Executar MigraÃ§Ã£o do Banco de Dados

```bash
# Com as credenciais configuradas, execute:
pnpm run db:push

# Isso vai criar a tabela `emailAccounts` automaticamente
```

Se der erro, siga `MIGRATION_GUIDE.md` para mais detalhes.

---

### 3ï¸âƒ£ Reiniciar o Servidor

```bash
# Kill o servidor que estÃ¡ rodando (Ctrl+C)
# Depois reinicie:
npm run dev
```

---

### 4ï¸âƒ£ Testar Novamente

1. VÃ¡ ao Admin â†’ Emails
2. Clique em "Nova Conta"
3. Preencha o formulÃ¡rio
4. Clique "Criar Conta"

âœ… Deve funcionar agora!

---

## ðŸ” Se Ainda NÃ£o Funcionar

### Verifique:
- [ ] Arquivo `.env` existe na raiz do projeto?
- [ ] `ZOHO_ORG_ID` nÃ£o estÃ¡ vazio?
- [ ] `ZOHO_CLIENT_ID` nÃ£o estÃ¡ vazio?
- [ ] `ZOHO_CLIENT_SECRET` nÃ£o estÃ¡ vazio?
- [ ] `ZOHO_REFRESH_TOKEN` nÃ£o estÃ¡ vazio?
- [ ] `DATABASE_URL` nÃ£o estÃ¡ vazio?
- [ ] Servidor foi reiniciado apÃ³s configurar `.env`?
- [ ] MigraÃ§Ã£o foi executada (`pnpm run db:push`)?

### Veja os Logs:
No terminal do servidor, deve aparecer:
```
ZOHO_ORG_ID = [seu_id_aqui]
ZOHO_CLIENT_ID = [seu_client_id]
... (nÃ£o deve ter undefined)
```

Se aparecer `undefined` em qualquer uma, a variÃ¡vel nÃ£o estÃ¡ no `.env`.

---

## ðŸ“š DocumentaÃ§Ã£o

- `ZOHO_CONFIG_GUIDE.md` - Guia completo para configurar Zoho
- `MIGRATION_GUIDE.md` - Guia para executar migraÃ§Ã£o do banco
- `EMAIL_REFACTOR_SUMMARY.md` - Resumo das mudanÃ§as feitas
