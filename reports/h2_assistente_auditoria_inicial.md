# Auditoria inicial — H2 Assistente

## Escopo analisado

A Planilha H2 já possui uma arquitetura React/TypeScript no cliente, tRPC/Express no servidor, banco MySQL via Drizzle e sessões próprias da Planilha. A tabela `spreadsheetSessions` vincula o token da sessão ao `spreadsheetClients.clientId`; a autorização central é reaplicada em cada uso por `resolveClientId()` no roteador da Planilha.

## Fonte de verdade e segurança existentes

A função `resolveClientId(token)` valida a existência e expiração da sessão, exige o perfil principal completo e confere a rota `gastos` por `getRouteAccess()`. Esse é o ponto que o H2 Assistente deve reutilizar como contexto autenticado. Não deve aceitar identificador de usuário fornecido pelo texto, áudio ou modelo de IA.

## Módulos e serviços já identificados

| Módulo | Serviços existentes mapeados | Base para o assistente |
|---|---|---|
| Planilha — Ganhos | `createEarning`, consultas mensais/anuais, atualização e exclusão | Consulta e prévia de criação; escrita somente após confirmação |
| Planilha — Gastos | `createExpense`, consultas mensais/anuais, atualização e exclusão | Consulta e prévia de criação; escrita somente após confirmação |
| Operacional | Criação, consulta mensal, atualização e exclusão | Consultas de km, tempo e produtividade por serviço existente |
| Metas | Criação, consulta, atualização e exclusão | Consulta direta; alteração somente mediante prévia e confirmação |
| Empréstimos | `loanRouter` separado, já ligado à fonte central de rotas | Tools devem chamar o roteador/serviço oficial, nunca recalcular parcelas |
| Cartões | `cartoesRouter` separado, faturas persistentes por `invoiceId` | Consultas oficiais e prévia de pagamento por fatura exata |
| H2 Particular | `privateTransportRouter`, clientes, agenda, orçamentos, viagens, pagamentos e recibos | Busca, consulta, agenda e orçamento pelos serviços do módulo |
| Chat e Atendimento | Roteadores de chat e atendimento online separados | Não devem ser usados como fonte financeira do assistente |

## Plataformas e integrações encontradas

Não foram localizados no repositório arquivos de manifest, service worker, Capacitor, `AndroidManifest.xml` ou `Info.plist`. Portanto, PWA/APK/iOS precisam ser auditados no projeto de empacotamento correspondente antes de prometer permissões nativas de microfone. O site e a Planilha são a base universal já disponível.

As integrações de voz e IA configuradas para a sessão estão desabilitadas: ElevenLabs API e OpenAI. Isso não impede o desenho da camada isolada, mas impede ativar transcrição, síntese ou orquestração remota sem uma decisão explícita de fornecedor e configuração de credenciais. O texto deve permanecer operacional como caminho garantido.

## Regras obrigatórias já consolidadas

1. A IA entende a intenção; serviços existentes e backend decidem; o usuário confirma ações de escrita.
2. Não haverá SQL livre gerado por IA.
3. Tools receberão somente a sessão autenticada e dados mínimos necessários.
4. Consultas e navegação podem ocorrer diretamente; criação, edição, exclusão, pagamento, cancelamento e estorno devem gerar prévia confirmável e chave de idempotência.
5. O Assistente será isolado: se estiver desativado ou se o provedor falhar, a Planilha continua funcionando sem alteração.

## Próximas etapas de auditoria

Ainda é necessário consolidar a matriz completa de endpoints dos módulos Cartões, Empréstimos e H2 Particular, além de mapear a infraestrutura de APK/PWA fora deste repositório se ela existir em outro projeto.

## Detalhamento de autenticação e ferramentas oficiais

### Sessão da Planilha

O roteador `spreadsheetRouter` já tem a barreira necessária para qualquer ferramenta do assistente ligada à Planilha: `resolveClientId(token)`. Ela verifica a sessão ativa, expiração, perfil principal obrigatório e rota `gastos` centralizada. A implementação do assistente deve chamar essa mesma resolução uma única vez por solicitação e repassar apenas o contexto interno autenticado às tools permitidas.

### Operações existentes reutilizáveis

| Área | Consultas oficiais existentes | Escritas existentes que exigirão prévia e confirmação |
|---|---|---|
| Ganhos | Consultas mensais e anuais por usuário | Criar, atualizar e excluir ganhos |
| Gastos | Consultas mensais e anuais por usuário | Criar, atualizar e excluir despesas categorizadas |
| Operacional | Consulta mensal de km, horários e corridas | Criar, atualizar e excluir registro operacional |
| Metas | Consulta mensal de metas | Criar, atualizar e excluir metas |
| H2 Particular | Dashboard, clientes, agenda, orçamento, viagem, recebíveis, recibos, CEP, rota e preço | Cliente, orçamento, agendamento, viagem, pagamento, estorno e alteração de status |
| Empréstimos | Rota própria já exige sessão da Planilha, perfil completo e acesso `emprestimo` | Pagamentos, quitação, estorno, cancelamento e alterações devem ser classificados como críticos |
| Cartões | Faturas persistentes, limite e vencimentos calculados no módulo oficial | Pagamento somente pela fatura exata identificada por `invoiceId`; estorno é ação crítica |

### Observações de segurança

O H2 Particular já reutiliza o mesmo token da Planilha por `resolvePrivateTransportUser(token)` e restringe todos os registros por `userId`. A rota de Empréstimos resolve a sessão, exige perfil completo e consulta a fonte central de rotas antes de usar dados legados. O módulo Cartões, por sua vez, mantém autenticação própria por cookie `cc_session`; portanto, a primeira versão do assistente poderá oferecer navegação e mensagens de orientação para Cartões, mas só poderá acessar ou alterar dados desse módulo depois de uma ponte segura de identidade autorizada — nunca aceitando telefone ou ID livre no comando.

### Lacunas verificadas

1. Alguns endpoints atuais de atualização e exclusão da Planilha apenas validam a sessão, mas a futura camada de tools deverá conferir a propriedade do registro no serviço antes de executar qualquer escrita.
2. Ainda não há uma infraestrutura de conversa, tool calls controladas, confirmações, idempotência ou auditoria específica do assistente.
3. A autenticação de Cartões ainda é separada da sessão da Planilha; a ponte de identidade deve ser tratada explicitamente no desenho técnico, não por atalho.
4. O repositório web não contém os projetos de empacotamento PWA/Android/iOS; a validação nativa de microfone depende de localizar esses projetos ou gerar builds a partir de sua origem.

## Estado da auditoria

A auditoria confirma que há serviços reais suficientes para iniciar um assistente controlado, desde que ele seja uma camada isolada que chama APIs e serviços oficiais existentes. A implementação não deve começar antes da matriz de tools, permissões, confirmações, providers e limitações ser aprovada.

## Pesquisa externa — capacidades de voz

| Alternativa | Capacidades verificadas | Consequência para o projeto |
|---|---|---|
| Web Speech API do navegador | A API Web Speech disponibiliza `SpeechRecognition` e `SpeechSynthesis`; o suporte de reconhecimento pode variar por navegador, política de permissões e serviço da plataforma. | Pode ser um caminho gratuito de melhor esforço para voz no Chrome/Android, mas não pode ser a única solução de transcrição nem o único caminho de acessibilidade. |
| OpenAI Audio | A documentação atual descreve entrada de áudio, transcrição, síntese e sessões de áudio em tempo real; integrações no navegador usam credencial efêmera emitida pelo servidor. | É uma opção de provedor único para STT, IA e TTS, desde que credenciais fiquem no backend e o custo seja aprovado. |
| ElevenLabs | A documentação confirma STT, STT em tempo real, TTS multilíngue e streaming de áudio; o conector da sessão está desativado. | É alternativa de maior qualidade de voz e transcrição, mas exige habilitação e credencial do usuário antes de uso. |

### Fontes consultadas

1. OpenAI, [Audio and speech](https://developers.openai.com/api/docs/guides/audio).
2. MDN, [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API).
3. ElevenLabs, [Speech to Text](https://elevenlabs.io/docs/overview/capabilities/speech-to-text).
4. ElevenLabs, [Text to Speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech).

As integrações de ElevenLabs e OpenAI identificadas na configuração atual estão desativadas. Nenhuma credencial foi habilitada ou modificada durante a auditoria.

# Arquitetura proposta para aprovação

## Diagnóstico conclusivo

O H2 Assistente é viável dentro do sistema atual como uma camada isolada. A Planilha, H2 Particular, Empréstimos e Cartões já têm serviços reais que podem ser usados como ferramentas controladas. O ponto crítico é não permitir que um modelo de IA acesse banco, SQL, IDs de outro usuário ou mutações sem passar por regras oficiais de sessão, propriedade, prévia e confirmação.

O site já possui PWA instalável: há `manifest.json`, registro de `sw.js`, modo standalone e estratégia network-first de cache. O projeto nativo de Android/iOS não está presente neste repositório; por isso, o painel universal pode ser publicado no site/PWA agora, mas permissão nativa de microfone, teste de APK e validação no iOS só podem ser concluídos com os projetos de empacotamento correspondentes.

## Decisão recomendada de voz e IA

Recomendo a configuração em três níveis:

| Nível | Componente | Papel | Fallback |
|---|---|---|---|
| Primário | OpenAI Audio/Realt ime | Transcrição, inteligência e, se ativado, resposta falada | Texto segue funcionando se falhar |
| Complementar local | Web Speech API | Síntese de voz do próprio dispositivo e reconhecimento quando suportado | Nunca bloqueia o texto |
| Opcional de alta qualidade | ElevenLabs | Voz mais natural e STT alternativo, apenas se a conta for habilitada | OpenAI/Texto |

A recomendação de primário único é OpenAI porque pode unificar raciocínio e áudio no backend, deixando credenciais fora do navegador. A Web Speech API será usada apenas como conveniência do aparelho, pois reconhecimento e disponibilidade variam por navegador e permissões [1]. A opção ElevenLabs deve ser ativada somente se for desejada uma voz de maior qualidade e se a integração for habilitada; a documentação confirma suporte a transcrição, streaming e português [2] [3].

## Matriz de ferramentas permitidas

| Domínio | Consultas permitidas sem confirmação | Ações que sempre mostram prévia e exigem confirmação | Bloqueios obrigatórios |
|---|---|---|---|
| Ganhos e Gastos | Saldos, totais, lançamentos, categorias e períodos | Criar, editar, excluir, duplicar ou mover lançamento | Apenas itens do usuário autenticado; valores e data visíveis na prévia |
| Operacional | Km, horas, produtividade e registros | Criar, editar ou excluir registro | Propriedade do registro e idempotência |
| Metas | Metas, progresso e previsão | Criar, editar ou excluir meta | Escopo do usuário e confirmação explícita |
| H2 Particular | Passageiros, agenda, conflitos, rota, orçamento, viagens, recebíveis e recibos | Criar/editar passageiro, agendamento, orçamento, viagem, pagamento, estorno, cancelamento ou status | Usuário dono do recurso; conflito e preço vêm do serviço oficial |
| Empréstimos | Empréstimos, parcelas, vencimentos, histórico e score já calculado pelo módulo | Pagamento, cancelamento, estorno, quitação e qualquer mudança de contrato | Rota `emprestimo` central, perfil completo e confirmação reforçada |
| Cartões | Limite, faturas, vencimentos e status oficiais por `invoiceId` | Pagamento de fatura, reversão, gasto e parcelamento | Sessão de cartões própria; sem ponte autenticada, o assistente apenas navega e explica |
| Suporte e navegação | Abrir módulos e explicar fluxos | Nenhuma operação financeira | Não revela dados pessoais fora do contexto logado |

## Fluxo de segurança proposto

1. O cliente fala ou digita uma intenção.
2. Voz vira texto; o texto chega ao orquestrador com o contexto mínimo da sessão autenticada.
3. O orquestrador só pode chamar tools declaradas no servidor. Cada tool usa o serviço oficial já existente e valida propriedade, rota, perfil e limites.
4. Consultas retornam dados resumidos e fonte/módulo de origem.
5. Escritas retornam uma prévia estruturada com valores, datas, consequência e um `confirmationId` curto. Nada é gravado nesta etapa.
6. Após o usuário confirmar pelo botão ou fala explícita, o backend executa a ferramenta com chave de idempotência. A repetição da mesma confirmação não duplica o lançamento.
7. Ação e resultado entram no histórico com usuário, ferramenta, resumo não sensível, confirmação, data e correlação.

## Plano de implantação

| Etapa | Entrega | Condição de aceite |
|---|---|---|
| 1 | Schema isolado de conversas, ações pendentes, confirmações, idempotência, preferências e auditoria | Assistente pode ser desligado sem afetar módulos atuais |
| 2 | Tools de consulta para Planilha e H2 Particular | Respostas idênticas às telas atuais e sem vazamento entre usuários |
| 3 | Prévia e confirmação para ganhos, gastos, metas, agenda e orçamento | Nenhuma escrita ocorre sem confirmação explícita |
| 4 | Painel universal persistente e opção por voz | Texto funciona mesmo sem microfone, IA ou provedor de voz |
| 5 | Orquestrador com ferramentas permitidas e contexto mínimo | IA não recebe SQL, tokens, segredos ou dados desnecessários |
| 6 | Integração progressiva de Empréstimos e Cartões | Ações críticas passam por sessão e controles próprios |
| 7 | Testes de confirmação, cancelamento, duplicidade, acesso negado, PWA e APK/iOS | Publicação somente com relatório de testes aprovado |

## Itens que precisam de decisão antes de construir

1. Aprovação do provedor primário de IA/voz: OpenAI como recomendado, ElevenLabs como opcional ou somente navegador como modo limitado.
2. Origem dos projetos Android e iOS para validar permissões de microfone e publicação nativa. Eles não estão presentes neste repositório.
3. Definição da política de retenção para áudio e histórico. A recomendação inicial é não salvar áudio bruto por padrão; salvar texto, intenção, prévia, confirmação e resultado auditável.

## Referências

[1] [MDN — Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API).

[2] [OpenAI — Audio and speech](https://developers.openai.com/api/docs/guides/audio).

[3] [ElevenLabs — Speech to Text](https://elevenlabs.io/docs/overview/capabilities/speech-to-text) e [Text to Speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech).
