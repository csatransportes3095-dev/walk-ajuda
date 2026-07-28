# ✅ Checklist - Configurar Funcionamento Completo

## 🔴 PROBLEMA ATUAL
```
Erro ao criar conta: Zoho token error: invalid_client
```

Isso significa que as **credenciais do Zoho estão faltando/inválidas**.

---

## ✅ SOLUÇÃO - Faça Isso:

### 1️⃣ Verificar `.env`
Você precisa de um arquivo `.env` na raiz com:

```env
# ⭐ OBRIGATÓRIO - Zoho Mail Credentials
ZOHO_ORG_ID=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=

# ⭐ OBRIGATÓRIO - Database
DATABASE_URL=mysql://user:password@host:3306/database

# ⭐ SMTP (email)
SMTP_USER=walkajuda@walkajuda.com
SMTP_PASS=sua_senha_aqui
```

**Se não sabe esses valores:**
- Vá em: https://api-console.zoho.com/
- Procure por suas credenciais OAuth do Zoho Mail
- Copie e cole no `.env`

---

### 2️⃣ Executar Migração do Banco de Dados

```bash
# Com as credenciais configuradas, execute:
pnpm run db:push

# Isso vai criar a tabela `emailAccounts` automaticamente
```

Se der erro, siga `MIGRATION_GUIDE.md` para mais detalhes.

---

### 3️⃣ Reiniciar o Servidor

```bash
# Kill o servidor que está rodando (Ctrl+C)
# Depois reinicie:
npm run dev
```

---

### 4️⃣ Testar Novamente

1. Vá ao Admin → Emails
2. Clique em "Nova Conta"
3. Preencha o formulário
4. Clique "Criar Conta"

✅ Deve funcionar agora!

---

## 🔍 Se Ainda Não Funcionar

### Verifique:
- [ ] Arquivo `.env` existe na raiz do projeto?
- [ ] `ZOHO_ORG_ID` não está vazio?
- [ ] `ZOHO_CLIENT_ID` não está vazio?
- [ ] `ZOHO_CLIENT_SECRET` não está vazio?
- [ ] `ZOHO_REFRESH_TOKEN` não está vazio?
- [ ] `DATABASE_URL` não está vazio?
- [ ] Servidor foi reiniciado após configurar `.env`?
- [ ] Migração foi executada (`pnpm run db:push`)?

### Veja os Logs:
No terminal do servidor, deve aparecer:
```
ZOHO_ORG_ID = [seu_id_aqui]
ZOHO_CLIENT_ID = [seu_client_id]
... (não deve ter undefined)
```

Se aparecer `undefined` em qualquer uma, a variável não está no `.env`.

---

## 📚 Documentação

- `ZOHO_CONFIG_GUIDE.md` - Guia completo para configurar Zoho
- `MIGRATION_GUIDE.md` - Guia para executar migração do banco
- `EMAIL_REFACTOR_SUMMARY.md` - Resumo das mudanças feitas
