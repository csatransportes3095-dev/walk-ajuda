# ðŸ”§ Painel de ConfiguraÃ§Ã£o Zoho - Guia de Uso

## ðŸ“‹ VisÃ£o Geral

Agora vocÃª pode **adicionar mÃºltiplas configuraÃ§Ãµes Zoho OAuth diretamente pelo painel**, sem precisar editar `.env`. Perfeito para gerenciar mÃºltiplos servidores no plano FREE!

**Plano FREE Zoho**: 5 contas de email por login OAuth. Com esse painel, vocÃª pode:
- âœ… Adicionar 10+ configuraÃ§Ãµes diferentes
- âœ… Alternar entre elas facilmente
- âœ… Testar conexÃ£o antes de usar
- âœ… Sem reiniciar o servidor

---

## ðŸš€ Como ComeÃ§ar

### 1. Acessar o Painel

```
Admin â†’ Zoho Configuration
```

### 2. Clique em "Adicionar ConfiguraÃ§Ã£o"

### 3. Preencha os Campos

VocÃª precisa de:

| Campo | O que Ã© | Onde encontrar |
|-------|---------|----------------|
| **Nome** | Identifique esta config | Digite algo como "Servidor 1" |
| **Organization ID** | ID da sua organizaÃ§Ã£o Zoho | Zoho Admin â†’ Organization Settings |
| **Client ID** | ID da aplicaÃ§Ã£o OAuth | API Console â†’ Client ID |
| **Client Secret** | Chave secreta da aplicaÃ§Ã£o | API Console â†’ Client Secret |
| **Refresh Token** | Token de autorizaÃ§Ã£o | API Console â†’ Refresh Token |

---

## ðŸ“– Passo a Passo: Obter as Credenciais

### 1ï¸âƒ£ Acesse o API Console

- VÃ¡ em: https://api-console.zoho.com/
- Login com sua conta Zoho

### 2ï¸âƒ£ Criar ou Selecionar AplicaÃ§Ã£o

1. Clique em **"Zoho Mail"**
2. Clique em **"Create Self Client"** (ou selecione uma existente)
3. Escolha um nome (ex: "H2 COLOMBIANO - Servidor 1")

### 3ï¸âƒ£ Copiar Client ID e Secret

1. ApÃ³s criar, vocÃª verÃ¡ a pÃ¡gina de credenciais
2. **Client ID**: Copie o primeiro campo grande
3. **Client Secret**: Copie o segundo campo grande

### 4ï¸âƒ£ Gerar Refresh Token

1. No mesmo console, vÃ¡ em **"Generate Code"**
2. Selecione os escopos (scopes):
   ```
   ZohoMail.organization.accounts.ALL
   ```
3. Clique em **"Generate"**
4. Copie o cÃ³digo exibido
5. Agora execute em outro aba:
   ```
   https://accounts.zoho.com/oauth/v2/token?code=CODIGO_QUE_VOCE_COPIOU&grant_type=authorization_code&client_id=SEU_CLIENT_ID&client_secret=SEU_CLIENT_SECRET
   ```
6. Na resposta JSON, procure por: `"refresh_token": "xxxxx"`
7. Copie esse valor

### 5ï¸âƒ£ Encontrar Organization ID

1. VÃ¡ em **Zoho Admin** (ou Zoho Mail Admin)
2. Procure **"Organization Settings"** ou **"Organization"**
3. Copie o **Organization ID** listado lÃ¡

---

## âš™ï¸ Usando o Painel

### Adicionar ConfiguraÃ§Ã£o

```
1. Clique em "+ Adicionar ConfiguraÃ§Ã£o"
2. Preencha todos os campos
3. Clique em "Adicionar"
4. A configuraÃ§Ã£o aparecerÃ¡ na tabela
```

### Ativar ConfiguraÃ§Ã£o

```
1. Clique no Ã­cone âœ“ (check)
2. Aquela configuraÃ§Ã£o agora serÃ¡ usada para criar emails
3. Apenas UMA configuraÃ§Ã£o pode estar ativa
```

### Testar ConexÃ£o

```
1. Clique no Ã­cone âš ï¸ (alerta) na linha da configuraÃ§Ã£o
2. Aguarde o teste
3. Se OK: Status fica verde "active"
4. Se erro: Status fica vermelho "error"
```

### Excluir ConfiguraÃ§Ã£o

```
1. Clique no Ã­cone ðŸ—‘ï¸ (lixeira)
2. Confirme a exclusÃ£o
```

---

## ðŸ’¡ Dicas PrÃ¡ticas

### Para Usar MÃºltiplos Servidores

1. Crie 3 aplicaÃ§Ãµes OAuth diferentes no Zoho
2. Adicione as 3 configuraÃ§Ãµes no painel
3. Alterne entre elas conforme precisar
4. Cada uma permite 5 contas de email

**Exemplo:**
```
ConfiguraÃ§Ã£o 1: Servidor Principal (ativo)
ConfiguraÃ§Ã£o 2: Servidor Backup
ConfiguraÃ§Ã£o 3: Servidor Teste
```

### Se Ocorrer Erro

1. Clique em **"Guia de ConfiguraÃ§Ã£o"** dentro do modal
2. Verifique se o token expirou
3. Se expirou, gere um novo no API Console
4. Atualize a configuraÃ§Ã£o
5. Clique em "Testar ConexÃ£o"

### Escopos NecessÃ¡rios

Para criar/gerenciar contas de email, o token DEVE ter esse escopo:

```
ZohoMail.organization.accounts.ALL
```

Se faltar, vocÃª terÃ¡ erro: `invalid_client`

---

## ðŸ”„ MigraÃ§Ã£o do .env

### Se vocÃª jÃ¡ tem credenciais no `.env`:

1. Copie os valores:
   - `ZOHO_ORG_ID`
   - `ZOHO_CLIENT_ID`
   - `ZOHO_CLIENT_SECRET`
   - `ZOHO_REFRESH_TOKEN`

2. Abra o painel de ConfiguraÃ§Ã£o Zoho
3. Clique em "+ Adicionar ConfiguraÃ§Ã£o"
4. Cole os valores nos campos
5. Clique em "Adicionar"

**Agora vocÃª pode remover do `.env`** (opcional - mantÃ©m como fallback)

---

## ðŸ› Troubleshooting

### Erro: "invalid_client"

**Causa**: Credenciais invÃ¡lidas ou expiradas

**SoluÃ§Ã£o**:
1. Verifique se o Client ID/Secret estÃ£o corretos
2. Se o refresh token foi revogado, gere um novo
3. Clique em "Testar ConexÃ£o" para confirmar

### Erro: "Invalid_grant"

**Causa**: Refresh token expirado

**SoluÃ§Ã£o**:
1. VÃ¡ ao API Console
2. Gere um novo Refresh Token
3. Atualize a configuraÃ§Ã£o
4. Teste novamente

### Erro: "Limit exceeded"

**Causa**: JÃ¡ tem 5 contas criadas neste servidor

**SoluÃ§Ã£o**:
1. Adicione uma nova configuraÃ§Ã£o Zoho
2. Alterne para essa configuraÃ§Ã£o
3. Crie mais contas com a nova configuraÃ§Ã£o

---

## ðŸ“ VariÃ¡veis de Ambiente (Backup)

VocÃª ainda pode usar `.env` como fallback:

```env
# Zoho OAuth (usado se nenhuma config ativa no DB)
ZOHO_ORG_ID=sua_org_id
ZOHO_CLIENT_ID=seu_client_id
ZOHO_CLIENT_SECRET=seu_secret
ZOHO_REFRESH_TOKEN=seu_token
```

**Prioridade**:
1. ConfiguraÃ§Ã£o ativa no painel (banco de dados)
2. VariÃ¡veis de `.env`
3. Erro se nenhuma disponÃ­vel

---

## âœ… Checklist de ConfiguraÃ§Ã£o

- [ ] Acessar Admin â†’ Zoho Configuration
- [ ] Ter em mÃ£o: Org ID, Client ID, Client Secret, Refresh Token
- [ ] Clique "+ Adicionar ConfiguraÃ§Ã£o"
- [ ] Preencha todos os campos
- [ ] Clique "Adicionar"
- [ ] Clique no Ã­cone âš ï¸ para testar
- [ ] Verifique se status ficou verde
- [ ] Se verde, clique no âœ“ para ativar
- [ ] Tente criar um email no painel Admin

---

## ðŸŽ¯ PrÃ³ximo Passo

ApÃ³s configurar, vÃ¡ para **Admin â†’ Emails** e crie sua primeira conta de email!

A configuraÃ§Ã£o ativa serÃ¡ usada automaticamente.
