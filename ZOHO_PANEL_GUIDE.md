# 🔧 Painel de Configuração Zoho - Guia de Uso

## 📋 Visão Geral

Agora você pode **adicionar múltiplas configurações Zoho OAuth diretamente pelo painel**, sem precisar editar `.env`. Perfeito para gerenciar múltiplos servidores no plano FREE!

**Plano FREE Zoho**: 5 contas de email por login OAuth. Com esse painel, você pode:
- ✅ Adicionar 10+ configurações diferentes
- ✅ Alternar entre elas facilmente
- ✅ Testar conexão antes de usar
- ✅ Sem reiniciar o servidor

---

## 🚀 Como Começar

### 1. Acessar o Painel

```
Admin → Zoho Configuration
```

### 2. Clique em "Adicionar Configuração"

### 3. Preencha os Campos

Você precisa de:

| Campo | O que é | Onde encontrar |
|-------|---------|----------------|
| **Nome** | Identifique esta config | Digite algo como "Servidor 1" |
| **Organization ID** | ID da sua organização Zoho | Zoho Admin → Organization Settings |
| **Client ID** | ID da aplicação OAuth | API Console → Client ID |
| **Client Secret** | Chave secreta da aplicação | API Console → Client Secret |
| **Refresh Token** | Token de autorização | API Console → Refresh Token |

---

## 📖 Passo a Passo: Obter as Credenciais

### 1️⃣ Acesse o API Console

- Vá em: https://api-console.zoho.com/
- Login com sua conta Zoho

### 2️⃣ Criar ou Selecionar Aplicação

1. Clique em **"Zoho Mail"**
2. Clique em **"Create Self Client"** (ou selecione uma existente)
3. Escolha um nome (ex: "Walk Ajuda - Servidor 1")

### 3️⃣ Copiar Client ID e Secret

1. Após criar, você verá a página de credenciais
2. **Client ID**: Copie o primeiro campo grande
3. **Client Secret**: Copie o segundo campo grande

### 4️⃣ Gerar Refresh Token

1. No mesmo console, vá em **"Generate Code"**
2. Selecione os escopos (scopes):
   ```
   ZohoMail.organization.accounts.ALL
   ```
3. Clique em **"Generate"**
4. Copie o código exibido
5. Agora execute em outro aba:
   ```
   https://accounts.zoho.com/oauth/v2/token?code=CODIGO_QUE_VOCE_COPIOU&grant_type=authorization_code&client_id=SEU_CLIENT_ID&client_secret=SEU_CLIENT_SECRET
   ```
6. Na resposta JSON, procure por: `"refresh_token": "xxxxx"`
7. Copie esse valor

### 5️⃣ Encontrar Organization ID

1. Vá em **Zoho Admin** (ou Zoho Mail Admin)
2. Procure **"Organization Settings"** ou **"Organization"**
3. Copie o **Organization ID** listado lá

---

## ⚙️ Usando o Painel

### Adicionar Configuração

```
1. Clique em "+ Adicionar Configuração"
2. Preencha todos os campos
3. Clique em "Adicionar"
4. A configuração aparecerá na tabela
```

### Ativar Configuração

```
1. Clique no ícone ✓ (check)
2. Aquela configuração agora será usada para criar emails
3. Apenas UMA configuração pode estar ativa
```

### Testar Conexão

```
1. Clique no ícone ⚠️ (alerta) na linha da configuração
2. Aguarde o teste
3. Se OK: Status fica verde "active"
4. Se erro: Status fica vermelho "error"
```

### Excluir Configuração

```
1. Clique no ícone 🗑️ (lixeira)
2. Confirme a exclusão
```

---

## 💡 Dicas Práticas

### Para Usar Múltiplos Servidores

1. Crie 3 aplicações OAuth diferentes no Zoho
2. Adicione as 3 configurações no painel
3. Alterne entre elas conforme precisar
4. Cada uma permite 5 contas de email

**Exemplo:**
```
Configuração 1: Servidor Principal (ativo)
Configuração 2: Servidor Backup
Configuração 3: Servidor Teste
```

### Se Ocorrer Erro

1. Clique em **"Guia de Configuração"** dentro do modal
2. Verifique se o token expirou
3. Se expirou, gere um novo no API Console
4. Atualize a configuração
5. Clique em "Testar Conexão"

### Escopos Necessários

Para criar/gerenciar contas de email, o token DEVE ter esse escopo:

```
ZohoMail.organization.accounts.ALL
```

Se faltar, você terá erro: `invalid_client`

---

## 🔄 Migração do .env

### Se você já tem credenciais no `.env`:

1. Copie os valores:
   - `ZOHO_ORG_ID`
   - `ZOHO_CLIENT_ID`
   - `ZOHO_CLIENT_SECRET`
   - `ZOHO_REFRESH_TOKEN`

2. Abra o painel de Configuração Zoho
3. Clique em "+ Adicionar Configuração"
4. Cole os valores nos campos
5. Clique em "Adicionar"

**Agora você pode remover do `.env`** (opcional - mantém como fallback)

---

## 🐛 Troubleshooting

### Erro: "invalid_client"

**Causa**: Credenciais inválidas ou expiradas

**Solução**:
1. Verifique se o Client ID/Secret estão corretos
2. Se o refresh token foi revogado, gere um novo
3. Clique em "Testar Conexão" para confirmar

### Erro: "Invalid_grant"

**Causa**: Refresh token expirado

**Solução**:
1. Vá ao API Console
2. Gere um novo Refresh Token
3. Atualize a configuração
4. Teste novamente

### Erro: "Limit exceeded"

**Causa**: Já tem 5 contas criadas neste servidor

**Solução**:
1. Adicione uma nova configuração Zoho
2. Alterne para essa configuração
3. Crie mais contas com a nova configuração

---

## 📝 Variáveis de Ambiente (Backup)

Você ainda pode usar `.env` como fallback:

```env
# Zoho OAuth (usado se nenhuma config ativa no DB)
ZOHO_ORG_ID=sua_org_id
ZOHO_CLIENT_ID=seu_client_id
ZOHO_CLIENT_SECRET=seu_secret
ZOHO_REFRESH_TOKEN=seu_token
```

**Prioridade**:
1. Configuração ativa no painel (banco de dados)
2. Variáveis de `.env`
3. Erro se nenhuma disponível

---

## ✅ Checklist de Configuração

- [ ] Acessar Admin → Zoho Configuration
- [ ] Ter em mão: Org ID, Client ID, Client Secret, Refresh Token
- [ ] Clique "+ Adicionar Configuração"
- [ ] Preencha todos os campos
- [ ] Clique "Adicionar"
- [ ] Clique no ícone ⚠️ para testar
- [ ] Verifique se status ficou verde
- [ ] Se verde, clique no ✓ para ativar
- [ ] Tente criar um email no painel Admin

---

## 🎯 Próximo Passo

Após configurar, vá para **Admin → Emails** e crie sua primeira conta de email!

A configuração ativa será usada automaticamente.
