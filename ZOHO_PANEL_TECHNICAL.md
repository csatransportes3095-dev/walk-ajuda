# ✅ PAINEL DE CONFIGURAÇÃO ZOHO - RESUMO TÉCNICO

## 🎯 O que foi implementado

Um **painel completo no admin** para gerenciar múltiplas credenciais Zoho OAuth, permitindo:

✅ Adicionar/remover configurações Zoho
✅ Testar conexão antes de usar
✅ Alternar entre servidores sem reiniciar
✅ Guardar credenciais de forma segura no banco de dados
✅ Suportar até 10+ servidores (plano FREE: 5 contas por servidor)

---

## 📁 Arquivos Criados/Modificados

### Backend

#### 1. Banco de Dados
- **drizzle/schema.ts** - Adicionada tabela `zohoOAuthConfigs`
- **drizzle/0125_create_zoho_oauth_configs.sql** - Migration SQL
- **server/db.ts** - 6 funções CRUD para gerenciar configs

#### 2. API/Routers
- **server/routers.ts** - Novo router `zohoConfig` com 5 endpoints:
  - `list` - Listar todas as configurações
  - `create` - Adicionar nova configuração
  - `setActive` - Ativar uma configuração
  - `test` - Testar conexão
  - `delete` - Remover configuração

#### 3. Zoho Integration
- **server/zoho.ts** - Modificado para:
  - Primeiro tenta usar config ativa do banco de dados
  - Fallback para variáveis de `.env` se nenhuma ativa
  - Cache de credenciais por 60 segundos

### Frontend

#### 1. Nova Página
- **client/src/pages/AdminZohoConfig.tsx** - Painel completo com:
  - Tabela de configurações
  - Formulário para adicionar nova config
  - Botões para ativar/testar/deletar
  - Guia integrado com 5 passos
  - Visibilidade de senhas com botão eye/eye-off

#### 2. Navegação
- **client/src/App.tsx** - Adicionada rota `/admin/zoho-config`
- **client/src/pages/AdminCodes.tsx** - Adicionado link no menu principal

---

## 🔄 Fluxo de Funcionamento

```
┌─────────────────────────────────────────────┐
│  Admin clica em "Zoho Configuration"        │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│  Frontend: AdminZohoConfig.tsx              │
│  - Lista configs do DB                      │
│  - Mostra formulário para adicionar nova    │
│  - Permite testar conexão                   │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│  Backend: zohoConfig router (tRPC)          │
│  - list: retorna configs (sem secrets)      │
│  - create: salva nova config no DB          │
│  - test: verifica se token é válido         │
│  - setActive: marca como ativa              │
│  - delete: remove do DB                     │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│  Banco de Dados: zohoOAuthConfigs           │
│  - Armazena 10+ configurações              │
│  - Uma marcada como isActive = 1            │
│  - Status: active/inactive/error            │
└─────────────────────────────────────────────┘
```

---

## 🚀 Uso na Criação de Email

```
1. Admin vai a: Admin → Emails
   
2. Clica em "+ Nova Conta"
   
3. Backend (email.create):
   - Busca config ativa: getActiveZohoOAuthConfig()
   - Se encontrou: usa aquela
   - Se não: tenta .env
   - Se nenhuma: erro "Credenciais não configuradas"
   
4. Cria conta no Zoho com essas credenciais
   
5. Email aparece no painel
```

---

## 💾 Dados Armazenados

### Tabela: `zohoOAuthConfigs`

```sql
CREATE TABLE zohoOAuthConfigs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128),              -- Ex: "Servidor 1"
  zohoOrgId VARCHAR(64),          -- Organization ID do Zoho
  zohoClientId VARCHAR(256),      -- Client ID da app OAuth
  zohoClientSecret VARCHAR(256),  -- Client Secret (criptografado no BD ideal)
  zohoRefreshToken VARCHAR(512),  -- Refresh Token
  isActive INT,                   -- 1 = ativa, 0 = inativa
  status ENUM('active', 'inactive', 'error'),
  lastError TEXT,                 -- Última mensagem de erro
  lastTestAt BIGINT,              -- Timestamp último teste
  createdAt BIGINT,               -- Criação
  updatedAt BIGINT,               -- Última atualização
);
```

---

## 🔐 Segurança

⚠️ **Nota Importante**: Os secrets estão armazenados em texto plano no BD.
Para produção, considere:

1. Criptografar secrets antes de salvar
2. Usar variáveis de ambiente para chaves de encriptação
3. Nunca retornar secrets completos para o frontend

**Solução Atual** (Frontend):
- Secrets são mascarados como `••••••••` na listagem
- Só aparecem ao adicionar (uma única vez)
- Campo de password oculto por padrão

---

## 🧪 Testando

### 1. Adicionar Configuração via Painel

```
1. Admin → Zoho Configuration
2. "+ Adicionar Configuração"
3. Preencha:
   - Nome: "Servidor Teste"
   - Organization ID: xxxxx
   - Client ID: xxxxx
   - Client Secret: xxxxx
   - Refresh Token: xxxxx
4. Clique "Adicionar"
```

### 2. Testar Conexão

```
1. Clique no ícone ⚠️ (alerta)
2. Aguarde teste de conexão
3. Status deve ficar verde "active"
```

### 3. Ativar Configuração

```
1. Clique no ícone ✓ (check)
2. Agora essa é a configuração ativa
3. Criar emails usará essa configuração
```

### 4. Criar Email

```
1. Admin → Emails
2. "+ Nova Conta"
3. Cria com a configuração ativa
4. Pronto!
```

---

## 📦 Estrutura de Pastas

```
server/
  ├── routers.ts (router zohoConfig adicionado)
  ├── zoho.ts (modificado para suportar configs do DB)
  ├── db.ts (6 novas funções)
  └── _core/
      └── env.ts (variáveis de env como fallback)

drizzle/
  ├── schema.ts (tabela zohoOAuthConfigs adicionada)
  └── 0125_create_zoho_oauth_configs.sql (migration)

client/src/
  ├── App.tsx (rota /admin/zoho-config adicionada)
  ├── pages/
  │   ├── AdminZohoConfig.tsx (nova página)
  │   └── AdminCodes.tsx (menu adicionado)
  └── lib/
      └── trpc.ts (router zohoConfig disponível)
```

---

## 📝 Migrações Necessárias

Execute em ordem:

```bash
# 1. Migration da tabela emailAccounts (se não fez ainda)
pnpm run db:push  # Incluirá 0124_create_email_accounts.sql

# 2. Migration da tabela zohoOAuthConfigs
pnpm run db:push  # Incluirá 0125_create_zoho_oauth_configs.sql
```

---

## 🎮 Endpoints tRPC

### zohoConfig.list
```typescript
// Retorna todas as configs (sem secrets)
const configs = await trpc.zohoConfig.list.useQuery();
```

### zohoConfig.create
```typescript
// Adiciona nova configuração
await trpc.zohoConfig.create.useMutation({
  name: "Servidor 1",
  zohoOrgId: "123",
  zohoClientId: "xxx",
  zohoClientSecret: "xxx",
  zohoRefreshToken: "xxx",
});
```

### zohoConfig.setActive
```typescript
// Ativa uma configuração
await trpc.zohoConfig.setActive.useMutation({ id: 1 });
```

### zohoConfig.test
```typescript
// Testa conexão
await trpc.zohoConfig.test.useMutation({ id: 1 });
```

### zohoConfig.delete
```typescript
// Remove uma configuração
await trpc.zohoConfig.delete.useMutation({ id: 1 });
```

---

## 🐛 Troubleshooting

### Erro: "Configuração não encontrada"
- Você adicionou alguma configuração?
- Clicou no ✓ para ativar?

### Erro: "Conexão falhou"
- Clique em "Guia de Configuração" dentro do modal
- Verifique se o token expirou no Zoho
- Teste novamente após atualizar o token

### Erro: "Nenhuma configuração ativa"
- Adicione uma nova configuração
- Clique no ✓ para ativar
- Status deve ficar verde "active"

---

## ✅ Checklist Final

- [ ] Ran `pnpm run db:push` para criar tabelas
- [ ] Acessou Admin → Zoho Configuration
- [ ] Adicionou primeira configuração Zoho
- [ ] Testou conexão (status verde)
- [ ] Ativou a configuração (clicou ✓)
- [ ] Tentou criar email em Admin → Emails
- [ ] Email foi criado com sucesso

---

## 📚 Documentação Relacionada

- `ZOHO_PANEL_GUIDE.md` - Guia completo do painel
- `SETUP_CHECKLIST.md` - Checklist de configuração
- `ZOHO_CONFIG_GUIDE.md` - Como obter as credenciais

---

**Status**: ✅ Pronto para usar | Sem dependências externas
**Performance**: Cache de credenciais por 60s | Sem overhead DB
**Segurança**: Secrets mascarados no frontend | Recomenda-se encriptação no BD
