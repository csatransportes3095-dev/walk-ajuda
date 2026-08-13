# Auditoria prévia — novo tipo de pergunta **Áudio**

## Escopo confirmado

O áudio deve ser uma **resposta de pergunta** dentro do fluxo existente `Perguntas → Documentos → Checkout → Pedido`. Não será tratado como documento, etapa separada, transcrição de IA ou função do H2 Assistente. Nenhuma alteração foi feita nesta etapa.

## 1. Como os tipos atuais estão definidos

| Camada | Situação atual | Evidência |
|---|---|---|
| Banco | `productQuestions.fieldType` é um enum MySQL limitado a `text`, `select` e `textarea`. | `drizzle/schema.ts`, linhas 148–162 |
| API de perguntas | Os procedimentos de criar e editar repetem a mesma enumeração. | `server/routers.ts`, linhas 760–862 |
| ADM de produtos | Os seletores de tipo exibem apenas Texto, Seleção e Área Texto. | `client/src/pages/AdminProducts.tsx`, linhas 192–249 e 791–1055 |
| Cliente | A interface decide entre seleção, área de texto e texto simples pelo `fieldType`. | `client/src/pages/Home.tsx`, linhas 2060–2182 e 2860–3163 |
| Bot | O fluxo alternativo entende somente seleção, área de texto e texto livre. | `client/src/components/ColombiaBot.tsx`, linhas 332–376 |

A inclusão de Áudio exige adicionar o valor `audio` somente onde o tipo de pergunta já é tratado. As perguntas atuais permanecerão com os comportamentos existentes.

## 2. Onde perguntas e respostas são armazenadas

| Elemento | Armazenamento atual | Limitação para áudio |
|---|---|---|
| Definição de pergunta | `productQuestions`, ligada a `productId` e, quando aplicável, `optionId`. | Não possui configurações de duração, upload de arquivo ou texto de apoio. |
| Respostas do pedido | JSON no campo `orderStatusHistory.answers`. | A estrutura atual contém `question`, `answer`, `depth` e opcionalmente `optionsMeta`; não mantém `questionId`. |
| Arquivos de pedido | `orderFiles`, com `registrationId`, telefone, URL, chave e MIME. | Não possui `questionId`, duração, tipo de resposta nem vínculo inequívoco a uma pergunta. |

> A resposta atual é textual e o ADM associa uma resposta a uma pergunta pelo texto da pergunta. Esse casamento é heurístico e não é adequado para um áudio que deve pertencer exatamente a `questionId`.

## 3. Fluxo atual no cliente

O fluxo principal usa `Home.tsx`. Ele mantém `questionAnswers` em memória como `Record<number, string>`, grava esse progresso no `localStorage`, renderiza as perguntas de forma sequencial com Próximo e Voltar e, no envio final, serializa as respostas no JSON do pedido. A validação de obrigatoriedade também consulta esse mesmo estado.

O fluxo alternativo `ColombiaBot.tsx` reutiliza produtos e perguntas, mas tem o seu próprio motor de perguntas, progresso e upload de documentos. Portanto, se uma pergunta for configurada como Áudio e o bot não for adaptado, ela será tratada incorretamente como texto. Esta compatibilidade precisa ser tratada de forma explícita e isolada.

## 4. Storage existente e autenticação

O projeto já usa Cloudflare R2 via `storagePut`/`r2PutObject`. O endpoint atual `/api/upload/client-file-base64` grava em `order-docs/`, aceita base64 e limita a 20 MB. Porém, ele não valida sessão, pergunta, produto ou opção. Por essa razão, ele **não deve ser reutilizado diretamente** para áudio de pergunta.

A submissão final do pedido valida `cpToken` ou `accessCode` antes de criar o status do pedido. Essa é a política que o novo upload precisa reutilizar: o backend deve validar a sessão, obter o telefone autorizado a partir dela e confirmar que `productId + optionId + questionId` representam uma pergunta de áudio real daquela opção. O navegador nunca deve escolher livremente a chave do R2, o pedido nem o proprietário do arquivo.

## 5. Migração mínima e segura proposta

A solução mínima e segura requer duas extensões aditivas, sem migrar respostas antigas:

| Estrutura | Alteração proposta | Motivo |
|---|---|---|
| `productQuestions` | Expandir `fieldType` com `audio` e acrescentar: `helpText`, `audioMinDurationSeconds`, `audioMaxDurationSeconds`, `allowAudioRerecord`, `allowAudioFileUpload`. | Permite que o ADM configure a pergunta sem criar um modelo paralelo de formulário. |
| `orderQuestionAudioAnswers` (nova tabela) | `id`, `registrationId`, `orderStatusId`, `customerPhone`, `productId`, `optionId`, `questionId`, `storageKey`, `audioUrl`, `durationSeconds`, `mimeType`, `fileSize`, `createdAt`, além de índice único por pedido/pergunta. | Mantém o arquivo fora do banco, vincula a resposta à pergunta exata e evita depender do texto da pergunta. |

A tabela nova é necessária porque `orderFiles` não tem `questionId` e não pode diferenciar documento de resposta de pergunta sem criar ambiguidade. O campo textual `orderStatusHistory.answers` continuará sendo preservado e receberá um item de apresentação para o áudio, com `questionId`, `answerType: "audio"`, duração e referência segura. Pedidos antigos, que não possuem esse item, continuam no fluxo de renderização atual.

## 6. Arquitetura de upload proposta

O arquivo será gravado no R2 com chave aleatória, sem nome de cliente, em uma estrutura equivalente a:

```text
question-audio/<uuid-da-sessao-de-fluxo>/<uuid-do-arquivo>.<extensão>
```

O upload será feito somente após o cliente escolher **Usar este áudio**. Antes disso, a gravação fica como `Blob` local para ouvir e regravar. Ao confirmar, o backend valida MIME, assinatura, extensão, tamanho, sessão e pertencimento da pergunta. O limite inicial será calculado com teto seguro no servidor, respeitando o máximo configurado na pergunta. Arquivos suportados serão `audio/webm`, `audio/ogg`, `audio/mp4` e `audio/mpeg`, desde que a assinatura de arquivo corresponda ao tipo declarado.

Como o pedido ainda não possui `registrationId` enquanto o cliente responde às perguntas, o upload ficará associado a um identificador temporário de fluxo emitido e validado pelo backend. Na confirmação do checkout, o backend criará o pedido e promoverá somente o áudio confirmado para a linha definitiva em `orderQuestionAudioAnswers`. Regravação substituirá o rascunho ativo e eliminará o objeto temporário anterior com segurança. O áudio de pedido concluído ficará imutável.

## 7. Arquivos que precisam mudar

| Arquivo | Alteração necessária |
|---|---|
| `drizzle/schema.ts` | Enum `audio`, configurações da pergunta e tabela de respostas de áudio. |
| Nova migration SQL em `drizzle/` | Alterações aditivas de enum/tabela/índices, sem apagar dados. |
| `server/db.ts` | CRUD para configurações de pergunta e respostas de áudio. |
| `server/routers.ts` | Validação de tipo, procedimentos de upload/promover resposta e inclusão segura no envio do pedido. |
| `client/src/pages/AdminProducts.tsx` | Tipo Áudio e campos de configuração no editor de pergunta. |
| Novo componente `client/src/components/QuestionAudioRecorder.tsx` | Gravação com gesto explícito, cronômetro, duração mínima/máxima, prévia, regravação, upload opcional e encerramento de tracks. |
| `client/src/pages/Home.tsx` | Inserir o componente no render sequencial e preservar referência no progresso/retorno. |
| `client/src/components/ColombiaBot.tsx` | Exibir a mesma coleta de áudio no fluxo alternativo ou impedir de modo claro que esse fluxo aceite uma pergunta de áudio; a proposta é integrá-lo. |
| `client/src/pages/AdminOrders.tsx` | Player dentro da resposta correspondente, com duração e link de download opcional. |
| `client/src/pages/AdminNewOrder.tsx` | Tornar explícito o comportamento para pedido manual ao encontrar uma pergunta de áudio; não poderá serializar como texto. |

## 8. Impacto em pedidos antigos e áreas preservadas

A migration será apenas aditiva. Perguntas existentes continuam com `text`, `select` e `textarea`; respostas antigas continuam no JSON atual e o ADM mantém sua renderização anterior. Documentos, upload de documento, carrinho, checkout, pagamentos, login, empréstimos, Planilha, H2 Assistente, OpenAI, WhatsApp e rotas existentes não serão modificados.

## 9. Compatibilidade esperada

| Ambiente | Expectativa | Limite da validação atual |
|---|---|---|
| Chrome Android | `MediaRecorder` com WEBM/Opus normalmente disponível; gravação por toque explícito. | Teste funcional real após implementação. |
| PWA Android | Deve seguir o navegador, com tratamento de permissão negada. | Teste funcional real após implementação. |
| Safari iPhone / PWA iOS | Deve preferir MIME detectado em runtime, incluindo MP4 quando disponível. | Teste físico necessário; não é possível certificar por emulação. |
| APK/WebView | Depende da versão do WebView e da permissão nativa de microfone. | Não será modificado sem autorização específica; teste no APK disponível após publicação. |

A transcrição por OpenAI **não será ativada**, não haverá chamada à OpenAI e nenhuma chave será enviada ao frontend.

## 10. Riscos a controlar durante a implementação

| Prioridade | Risco comprovado | Contenção planejada |
|---|---|---|
| Crítica | Upload existente de documento aceita telefone e rótulo sem autenticação contextual. | Criar procedimento protegido específico para áudio de pergunta; não reutilizar essa rota. |
| Crítica | Respostas atuais não carregam `questionId` no pedido. | Incluir `questionId` e `answerType` nas novas respostas e persistir áudio em tabela própria. |
| Alta | O bot é outro consumidor de perguntas. | Adaptar o motor do bot ao novo tipo antes de permitir configuração de áudio. |
| Alta | Pedido manual atualmente reduz respostas a texto. | Não permitir salvar valor textual falso; integrar upload/admin ou sinalizar pergunta de áudio pendente até a implementação específica. |
| Média | Áudio pode ficar órfão após regravação/saída. | Chave temporária, substituição idempotente e limpeza do rascunho anterior. |
| Média | Cache local não consegue restaurar `Blob` após recarregar. | Persistir apenas áudio já confirmado no servidor; sem inventar recuperação de gravação local não enviada. |

## Conclusão da auditoria

O projeto tem uma base adequada de produtos, perguntas, R2 e envio de pedido, mas não possui resposta de pergunta estruturada nem upload contextual autenticado. A implementação correta não é adicionar áudio aos documentos nem gravar base64 no campo `answers`. Ela requer: novo tipo `audio`, configurações aditivas, upload protegido, armazenamento R2 por chave aleatória e uma tabela de resposta que use `questionId`.

Nenhuma modificação de código, banco, produto, documento ou pedido foi realizada nesta auditoria.
