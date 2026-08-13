# Auditoria H2 Assistente — voz em produção

## Sincronização confirmada

- Serviço Render: `walk-ajuda` (Web Service), domínio `h2colombiano.com`, branch `main`.
- Commit ativo verificado no painel Render em 13/08/2026: `1b80faa` (`feat: aprimora estados e fallback de voz do H2 Assistente`).
- Checkout local anterior: `ef8a98a`, sem alterações locais não commitadas.
- Foi executado somente `git fetch origin main --prune`; nenhuma alteração destrutiva foi aplicada ao checkout antigo.
- Foi criada cópia de trabalho isolada em `/home/ubuntu/walk-ajuda-production`, destacada no commit `1b80faa`.
- Os arquivos publicados do H2 Assistente estão presentes nessa cópia: `server/h2-assistant/{orchestrator,service,tools,write-actions}.ts` e `server/routers/h2Assistant.ts`.

## Autenticação já identificada

- O cliente tRPC usa `credentials: "include"` para `/api/trpc`.
- O aviso `[Auth] Missing session cookie` é emitido pela verificação global de sessão opcional do SDK no contexto tRPC.
- O H2 Assistente usa token autenticado da Planilha no payload dos procedimentos e não deve perder essa proteção.

## Próxima auditoria

Diagnosticar a propriedade de disponibilidade de voz no bootstrap e o caminho exato da transcrição usando a cópia sincronizada, com logs sanitizados e sem registrar chaves, tokens, cookies, áudio ou dados pessoais.

## Evidência do painel Render

O serviço de produção `walk-ajuda` foi visualizado no painel Render. Ele executa a branch `main` e mostra o commit `1b80faa` como deploy atual. A página de logs apresenta repetições de `[Auth] Missing session cookie` entre 02:59 e 03:02, mas não inclui o endpoint nem qualquer erro da OpenAI. Pelo código sincronizado, essa linha é emitida por `sdk.verifySession()` durante a criação do contexto tRPC, quando o cookie da sessão opcional não existe. O transporte tRPC do frontend já usa `credentials: "include"`, enquanto o H2 aplica a autorização efetiva pelo token da Planilha em `contextFromToken()`.

A propriedade de bootstrap é `health.openAIConfigured`, calculada exclusivamente como `Boolean(process.env.OPENAI_API_KEY)`; o bootstrap também retorna `health.voiceEnabled`, que vem das configurações do usuário. A interface atual não deve deduzir indisponibilidade da ausência do cookie de sessão global.

## Configuração verificada no Render

Na página **Environment** do Web Service de produção `walk-ajuda`, a variável `OPENAI_API_KEY` está listada no próprio serviço e o respectivo valor aparece mascarado, sem ser exposto. Isso confirma que a variável está cadastrada no serviço correto. Ainda falta validar somente a presença dela no processo em execução por meio de uma verificação booleana segura (`Boolean(process.env.OPENAI_API_KEY)`), sem imprimir o valor.

## Instrumentação temporária

Após confirmação do usuário, o commit `1a8d93f` (`chore: diagnostica voz do H2 Assistente com logs seguros`) foi enviado à branch `main`. O painel Render registrou o início do auto-deploy às 03:08. A instrumentação não altera layout, banco, permissões, token da Planilha, regras de confirmação nem envio da chave ao navegador; ela somente adiciona eventos de diagnóstico sanitizados no backend.

## Estado atual do deploy

Às 03:09, o painel Render ainda mostrava o deploy do commit `1a8d93f` em andamento; o commit anteriormente ativo continuava sendo `1b80faa`. Nenhum teste de voz deve ser considerado válido até que o novo commit apareça como **live**.

## Deploy ativo

Os detalhes do deploy no Render confirmaram que o serviço iniciou sem falha e ficou **live** às 03:10 no commit `1a8d93f`. O log de inicialização confirma o servidor em execução e a URL primária `https://h2colombiano.com`. A instrumentação temporária está ativa e pronta para registrar o próximo teste real do H2 Assistente.

## Evidência do teste web e APK

Os logs de produção confirmam que o site concluiu chamada de IA com `H2_OPENAI_REQUEST` seguido de `H2_OPENAI_OK` com status HTTP 200. Também registram bootstrap do H2 com `H2_AUTH_OK`, `H2_OPENAI_KEY_PRESENT {"present":true}` e `H2_BOOTSTRAP_OK {"enabled":true,"voiceEnabled":true,"openAIConfigured":true}`. Portanto, chave, backend, token da Planilha e bootstrap estão corretos em produção.

Durante a abertura que exibiu indisponibilidade não apareceu `H2_AUDIO_RECEIVED`, `H2_AUDIO_BYTES` nem `H2_TRANSCRIPTION_START`. Isso prova que o APK não chegou a enviar áudio ao backend. A hipótese técnica principal é ausência de `getUserMedia`/`MediaRecorder` ou permissão de WebChromeClient no WebView do APK; o frontend cai no fallback de reconhecimento do navegador e mostra indisponibilidade quando o WebView não expõe essa API. A confirmação final exige auditar o projeto-fonte e permissões do APK.

## Causa comprovada no APK Driver Pro

A auditoria estática do APK público `H2DriverPro.apk` confirmou duas falhas específicas no contêiner Android: o manifesto não declara `android.permission.RECORD_AUDIO`, e o `WebChromeClient` embutido trata somente progresso e seleção de arquivo. Não existe implementação de `onPermissionRequest(PermissionRequest)` para conceder ao WebView o recurso `RESOURCE_AUDIO_CAPTURE`. Como consequência, o WebView não expõe uma captura de áudio utilizável ao site; não há chamada para `h2Assistant.voice.transcribe` e, por isso, não aparecem os eventos `H2_AUDIO_RECEIVED`, `H2_AUDIO_BYTES` ou `H2_TRANSCRIPTION_START` no backend.

A correção mínima é exclusiva do projeto Android: declarar `RECORD_AUDIO`, solicitar a permissão Android em tempo de execução após ação explícita no microfone e implementar `WebChromeClient.onPermissionRequest` para conceder somente `RESOURCE_AUDIO_CAPTURE` quando a permissão Android já estiver autorizada. O site, o backend, a OpenAI, a chave privada, a Planilha e o fluxo de autenticação não precisam de alteração.

## APKs corrigidos

Foram compilados dois APKs assinados com os mesmos certificados das versões já instaladas: H2 Colombiano `2.0.1` (versionCode 3) e H2 Driver Pro `1.0.1` (versionCode 2). Ambos declaram `RECORD_AUDIO` e implementam a concessão restrita de `RESOURCE_AUDIO_CAPTURE` apenas para o domínio `h2colombiano.com` após ação explícita do cliente.

No painel administrativo, o upload do H2 Colombiano foi concluído com sucesso para `https://h2colombiano.com/app`. O upload do H2 Driver Pro para `https://h2colombiano.com/app-pro` foi iniciado e ainda estava em andamento na última verificação.

## Navegação universal da Planilha

O commit `3cbd37f` foi enviado à branch principal em 13 de agosto de 2026. A correção alinha o destino interno de Empréstimos a `/gastos`, fecha o painel do H2 Assistente ao executar uma navegação e aplica a mudança de módulo com foco visual no contêiner `planilha-modulos`. O Render recebeu o auto-deploy desse commit, que estava em execução na última consulta.
