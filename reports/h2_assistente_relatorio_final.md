# Relatório de implantação — H2 Assistente

**Projeto:** Walk Ajuda / H2 Colombiano  
**Módulo:** H2 Assistente universal de texto e voz  
**Data:** 12 de agosto de 2026  
**Status:** Implementado localmente, compilado e pronto para publicação.

O H2 Assistente foi desenvolvido como uma camada independente sobre a Planilha de Gastos. A implementação não substitui cálculos financeiros, autenticação, módulos de empréstimo, cartões ou H2 Particular já existentes. Ela reutiliza as rotinas oficiais do sistema somente depois de uma confirmação explícita do usuário.

> **Regra central:** consultas e navegação podem ocorrer imediatamente. Toda escrita gera uma prévia e só é persistida após o usuário pressionar **Confirmar**.

## Módulos integrados

| Área | Entrega implementada | Comportamento |
|---|---|---|
| Planilha | Ganhos, gastos e metas | Consulta segura e criação por prévia confirmável. |
| H2 Particular | Painel, agenda de amanhã, busca de passageiros, agendamento e orçamento | Consultas diretas; agendamento e orçamento usam as rotinas oficiais após confirmação. |
| Navegação | Gastos, ganhos, operacional, metas, gráficos, empréstimos, analisador, particular e cartões | O painel abre abas internas ou direciona para a rota externa correta. |
| Voz | Gravação iniciada somente por clique, transcrição OpenAI e resposta falada OpenAI | Há fallback de reconhecimento e fala do navegador quando necessário. |
| Auditoria | Conversas, mensagens, ações, uso e eventos | Registra prévias, confirmações, cancelamentos, falhas, transcrição e uso sem registrar chaves. |

## Comandos e interpretações iniciais

| Pedido do usuário | Resultado esperado |
|---|---|
| “Como foi hoje?” | Consulta ganhos, gastos e resultado de hoje. |
| “Meu resumo do mês” | Consulta ganhos, gastos e resultado do mês atual. |
| “Minhas metas” | Consulta metas diária, semanal e mensal do mês. |
| “Agenda de amanhã” | Consulta os agendamentos H2 Particular do dia seguinte. |
| “Abrir gastos”, “Abrir metas”, “Abrir particular” | Navega diretamente para o módulo solicitado. |
| “Lançar gasto de combustível” | A IA identifica os dados disponíveis e gera prévia; nada é salvo antes da confirmação. |
| “Criar ganho”, “Criar meta” | Gera prévia com categoria, data, valor e resumo para conferência. |
| “Criar agendamento” ou “Criar orçamento” | Exige passageiro ativo e os campos obrigatórios; a persistência só ocorre após confirmação. |

A linguagem natural é processada no servidor com modelo OpenAI configurável. As consultas e navegações mais frequentes também possuem identificação determinística, o que mantém os comandos essenciais utilizáveis mesmo quando o provider externo estiver temporariamente indisponível.

## Ferramentas controladas

| Ferramenta | Tipo | Limite de acesso |
|---|---|---|
| `finance_today` | Leitura | Soma somente os lançamentos da Planilha do usuário autenticado. |
| `finance_month` | Leitura | Soma somente o mês atual da Planilha do usuário autenticado. |
| `goal_month` | Leitura | Lê somente as metas mensais do usuário autenticado. |
| `private_dashboard` | Leitura | Usa o painel oficial H2 Particular do usuário autenticado. |
| `private_tomorrow` | Leitura | Lista somente a agenda particular de amanhã do usuário autenticado. |
| `private_client_search` | Leitura | Busca passageiros pertencentes ao usuário autenticado. |
| `navigate` | Navegação | Aceita apenas destinos presentes na lista fechada do assistente. |
| `draft_expense`, `draft_earning`, `draft_goal` | Escrita preparada | Cria prévia; não grava a informação financeira. |
| `draft_appointment`, `draft_quote` | Escrita preparada | Cria prévia; a rotina oficial confere passageiro, endereço e conflito ao confirmar. |

Não existe SQL montado pela IA. A IA apenas escolhe uma intenção estruturada; o backend valida e executa exclusivamente funções pré-definidas.

## Endpoints tRPC

| Endpoint | Finalidade |
|---|---|
| `h2Assistant.bootstrap` | Carrega configurações, saúde e conversas da conta autenticada. |
| `h2Assistant.settings.get/update` | Lê e atualiza preferências seguras do assistente. |
| `h2Assistant.conversations.list/messages` | Exibe histórico isolado por usuário. |
| `h2Assistant.chat.send` | Recebe texto, aplica limites, orquestra intenção, consulta ferramenta ou gera prévia. |
| `h2Assistant.voice.transcribe` | Transcreve áudio limitado com OpenAI, sem expor chave no cliente. |
| `h2Assistant.voice.synthesize` | Produz resposta falada pelo backend quando ativada pelo usuário. |
| `h2Assistant.tools.read/navigate` | Permite uso controlado de consulta e navegação. |
| `h2Assistant.actions.draft.*` | Gera prévias de ganho, gasto, meta, agendamento e orçamento. |
| `h2Assistant.actions.get/confirm/cancel` | Consulta, confirma uma única vez ou cancela uma prévia. |
| `h2Assistant.audit` | Retorna auditoria isolada da conta autenticada. |

## Banco de dados e migração

O módulo declara seis tabelas no schema Drizzle e as garante no startup com `CREATE TABLE IF NOT EXISTS`. Isso evita uma alteração destrutiva no banco durante a primeira publicação.

| Tabela | Finalidade |
|---|---|
| `h2AssistantSettings` | Preferências de voz, provider, retenção e limites diários. |
| `h2AssistantConversations` | Conversas isoladas por usuário. |
| `h2AssistantMessages` | Histórico mínimo de mensagens e metadados. |
| `h2AssistantActions` | Prévias, status, expiração, idempotência e resultado de escritas. |
| `h2AssistantUsage` | Contagem diária de texto e segundos de áudio. |
| `h2AssistantAudit` | Eventos de segurança e rastreabilidade. |

A tabela de ações possui chave única de idempotência. A confirmação troca atomicamente o status de `PENDENTE` para `PROCESSANDO` usando condição no próprio `UPDATE`; uma segunda confirmação concorrente é recusada. Depois da execução, a ação é marcada como `CONCLUIDA` ou `FALHOU`.

## Segurança e privacidade

| Controle | Implementação |
|---|---|
| Autenticação | O contexto é obtido exclusivamente por `resolveClientId(token)`. A IA não envia `clientId` ou `userId` livre para consultar dados. |
| Escritas | Prévia obrigatória, expiração de dez minutos, confirmação explícita, cancelamento e idempotência. |
| Operações críticas | Exclusão, quitação, estorno, cancelamento e alteração de pagamentos, faturas ou empréstimos não foram expostos ao assistente nesta versão. |
| Banco | Ferramentas fechadas; sem SQL livre produzido por modelo. |
| Chaves | `OPENAI_API_KEY` permanece somente no backend/Render; não existe chave no site, PWA ou APK. |
| Limites | 12 solicitações por minuto, 2.000 caracteres por mensagem, 80 solicitações por dia, 90 segundos por áudio e 900 segundos de áudio por dia por padrão. |
| Áudio | Microfone é acionado somente após toque do usuário e é liberado ao parar, concluir ou atingir 90 segundos. |
| Contexto | O orquestrador usa somente histórico reduzido da conversa atual. |

## Provider e variáveis de ambiente

O provider principal é **OpenAI**. A camada foi mantida concentrada em `server/h2-assistant/orchestrator.ts`, permitindo troca futura de provider sem mudar interface, banco, autenticação ou ferramentas.

| Variável | Uso |
|---|---|
| `OPENAI_API_KEY` | Chave privada do backend para texto, transcrição e fala. |
| `H2_ASSISTANT_OPENAI_MODEL` | Modelo de interpretação de texto; padrão `gpt-4.1-mini`. |
| `H2_ASSISTANT_OPENAI_TRANSCRIPTION_MODEL` | Modelo de transcrição; padrão `gpt-4o-mini-transcribe`. |
| `H2_ASSISTANT_OPENAI_TTS_MODEL` | Modelo de voz; padrão `gpt-4o-mini-tts`. |
| `H2_ASSISTANT_OPENAI_TTS_VOICE` | Voz padrão; padrão `alloy`. |
| `H2_ASSISTANT_MAX_REQUESTS_PER_MINUTE` | Documenta o limite de proteção operacional. |
| `H2_ASSISTANT_MAX_AUDIO_SECONDS_PER_REQUEST` | Documenta o limite de áudio por envio. |

A configuração real deve ser cadastrada somente no ambiente seguro do Render. O arquivo `.env.example` não contém valores secretos.

## Custos e proteção operacional

O custo externo vem de três chamadas opcionais da OpenAI: interpretação de texto, transcrição e fala. Texto sempre permanece disponível; quando a chave não estiver configurada, comandos determinísticos de consulta e navegação continuam disponíveis e o sistema informa claramente a limitação. A fala só é sintetizada quando o usuário ativa a opção de resposta falada. O áudio possui corte no cliente e validação de tamanho, duração e formato no servidor.

## Interface e compatibilidade

O painel é flutuante, mobile-first e independente dos cards da Planilha. Inclui botão H2 minimizável, histórico, atalhos, campo de texto, botão de microfone, estados de ouvindo/transcrevendo/consultando e cartões de confirmação **Confirmar**, **Corrigir** e **Cancelar**.

A camada funciona no site e PWA. Em Android e iOS, a entrada de voz usa APIs web quando disponibilizadas pelo WebView; caso gravação ou transcrição não estejam presentes, há reconhecimento do navegador como conveniência. A integração nativa específica para Android/iOS permanece preparada para quando os projetos-fonte nativos forem fornecidos, sem exigir mudança no backend do assistente.

## Testes executados

| Teste | Resultado |
|---|---|
| `pnpm run build` | Aprovado. Frontend Vite e backend esbuild compilados com sucesso. |
| Checagem estática direcionada ao H2 Assistente | Aprovada sem erros nos arquivos adicionados ou modificados pelo módulo. |
| `git diff --check` | Aprovado, sem erros de whitespace. |
| Auditoria de segredo no frontend | Aprovada; não há `OPENAI_API_KEY` nem header Bearer no painel ou Planilha. |
| Auditoria de confirmação/idempotência | Aprovada por inspeção: status pendente, `UPDATE` condicional, `affectedRows`, auditoria e resultado persistido. |

A checagem TypeScript integral do repositório ainda apresenta erros legados fora do H2 Assistente, incluindo configuração de depreciação do TypeScript e erros preexistentes em módulos de empréstimo, cartões, mercado, e-mail e H2 Particular. A compilação oficial do projeto permanece aprovada.

## Pendências intencionais da primeira versão

A primeira versão não expõe ao assistente nenhuma operação crítica de exclusão, quitação, estorno, cancelamento, pagamento de fatura, alteração de empréstimo ou mudança de pagamento. Essas capacidades devem ser incluídas somente em uma fase posterior com confirmação reforçada específica por operação.

Leituras aprofundadas e escritas de cartões e empréstimos também não foram expostas nesta entrega; o assistente pode navegar até os módulos, mas não opera dados críticos deles. Nenhum banco financeiro paralelo foi criado.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `drizzle/schema.ts` | Seis definições de tabela do H2 Assistente. |
| `server/h2-assistant/service.ts` | Contexto autenticado, tabelas, limites, conversas, ações e auditoria. |
| `server/h2-assistant/tools.ts` | Consultas e navegação em lista fechada. |
| `server/h2-assistant/write-actions.ts` | Prévias e confirmações de ganho, gasto, meta, agendamento e orçamento. |
| `server/h2-assistant/orchestrator.ts` | OpenAI, formato estruturado, limites, transcrição e resposta falada. |
| `server/routers/h2Assistant.ts` | Endpoints tRPC autenticados. |
| `client/src/components/H2AssistantPanel.tsx` | Painel flutuante premium de texto e voz. |
| `client/src/pages/SpreadsheetPage.tsx` | Integração isolada do painel à Planilha. |
| `.env.example` | Variáveis seguras para configuração do servidor. |

## Publicação

Depois do push, o Render executará o deploy automático. Antes de testar voz e linguagem natural completa em produção, é obrigatório cadastrar `OPENAI_API_KEY` e, se desejado, ajustar os modelos do H2 Assistente nas variáveis de ambiente do serviço backend.
