# H2 Auto — imagens anexadas às respostas

## Cadastro

Em `/admin/h2-auto`, abra **Inteligência → Perguntas e respostas livres**. Cada
pergunta aceita uma imagem opcional abaixo do texto da resposta. O administrador
pode anexar, visualizar, trocar ou remover a foto e salvar a personalização do
aparelho. A resposta pode conter texto, imagem ou ambos; uma resposta sem nenhum
conteúdo não pode ser salva.

O APK precisa da capacidade `imageRepliesV1`, introduzida na versão 2.14.
A versão recomendada é **2.15, versionCode 115**, com correções de envio e a área
local **Fotos** para acompanhar carregamento e diagnóstico.
Depois dessa atualização inicial, trocar a foto no ADM não exige reconstruir ou
reinstalar o APK. A resposta continua sendo acionada pela mensagem recebida do
cliente, sujeita às regras existentes de identificação, horário, pausa e bloqueio.

## Arquivo e sincronização

- Upload autenticado por ADM em `h2AutoAdmin.uploadReplyImage`.
- Entrada JPEG, PNG ou WebP de até 5 MiB; decodificação real dos pixels, rejeição
  de animação e normalização para JPEG/PNG com dimensão máxima de 2048 pixels.
- O registro `h2_auto_reply_images` associa o arquivo R2 ao aparelho, com ID,
  SHA-256, MIME, tamanho e dimensões. Metadados enviados pelo navegador são
  conferidos com esse registro antes de salvar a pergunta.
- A configuração mantém `personalization.faq[].image`. O endereço de download é
  relativo e fixo: `/api/h2-auto/reply-images/{deviceId}/{imageId}`.
- O download exige o token do mesmo aparelho e uma pergunta ativa ainda ligada
  à imagem. A sessão ADM pode abrir a prévia antes de a pergunta ser salva.
- O arquivo baixado é verificado novamente pelo APK e mantido no armazenamento
  privado. O endereço é usado apenas pelo transporte entre site e aplicativo;
  ele não é incluído automaticamente no texto enviado ao cliente.

## Contrato de resposta

O APK informa `x-h2-capabilities: imageRepliesV1`. A resposta de `/access/step`
mantém o campo textual `message` e acrescenta `images`, com até três objetos de
metadados e o `faqId` correspondente. O mesmo arquivo é deduplicado por ID e hash.
Se mais de três imagens diferentes corresponderem às perguntas agrupadas, o
cliente recebe orientação para enviar as demais perguntas separadamente.

O texto completo acompanha as fotos como mensagem, evitando truncá-lo em uma
legenda. O envio de arquivos exige a implementação correspondente no APK; a
sincronização de metadados, isoladamente, não significa que o WhatsApp enviou uma
foto. APKs anteriores continuam recebendo o texto disponível e não recebem URLs
como substituto da fotografia.

## Integridade e observação

Salvar as perguntas usa revisão para impedir que uma edição concorrente apague
outra. Formulários gerais antigos e importações do APK preservam as associações
de imagens já gravadas. Remover, substituir ou desativar uma pergunta impede
novos downloads da imagem antiga pelo aparelho.

O diagnóstico diferencia arquivo disponível, falha de download, fila, tentativa
de envio e ação aceita sem comprovação de saída. Aceitação de uma ação Android
não é recibo de entrega ou leitura do WhatsApp. O funcionamento real das árvores
de acessibilidade do WhatsApp deve ser observado no aparelho; testes de servidor,
JVM e navegador não equivalem a essa confirmação.

## Fotos no APK e diagnóstico da tentativa

A entrada **Fotos** aparece no topo da tela inicial, abaixo do vínculo com o ADM.
Ela mostra quantas imagens foram carregadas, falhas, fila, horário, estado da
tentativa, etapa de texto/foto e motivo específico. Os dados são atualizados
enquanto a página está aberta, sem reescrever a configuração de atendimento.
**Sincronizar fotos** reutiliza a sincronização existente; não dispara fotos
para clientes. O fluxo existente de sincronização pode continuar processando
códigos de login pendentes.

Os campos opcionais `imageReplyDetailCode`, `imageReplyStage` e
`imageReplyAccessibilityConnected` complementam os códigos de estado já usados.
O servidor aceita somente motivos enumerados e etapas `NONE`, `TEXT` e `IMAGE`;
não recebe texto de conversa, exceções arbitrárias nem dados do destinatário.
APKs anteriores continuam enviando ACK sem esses três campos.

`UNSUPPORTED` significa que a tentativa não pôde iniciar; não prova
incompatibilidade do aparelho. A conexão de acessibilidade também não equivale
à configuração da permissão: um serviço pode estar autorizado e desconectado.
O detalhe registrado na tentativa permanece separado da conexão atual.

O módulo de imagens busca a ação atual da mesma notificação antes das ações de
envio, verificando aplicativo, conversa, evento recebido e destinatário. Inputs
de mídia exclusivos de `getDataOnlyRemoteInputs()` são considerados quando o
WhatsApp anuncia suporte ao MIME. O caminho de tela trata o resultado real do
lançamento, em vez de concluir indisponibilidade só pela consulta prévia de
resolução do Android. Isso não remove as verificações de destinatário e prévia.

## Validação isolada

O workflow `h2-auto-image-replies.yml` executa testes do contrato e da autorização,
o ciclo upload/salvar/sincronizar/responder/baixar em MySQL isolado, a tela real do
ADM em desktop/celular e a compilação com a preparação usada no Render. O R2 é
substituído por armazenamento em memória nos testes. Nenhuma mensagem ou foto é
enviada a clientes pelos testes.

Os testes de MySQL exigem `H2_AUTO_REPLY_IMAGES_TEST_DB_URL` apontando exclusivamente
para `h2_auto_reply_images_test` em um host local permitido; nenhuma conexão com
o banco de produção é utilizada.

O workflow Android `image-status-ui.yml` abre a tela nativa em um emulador
isolado, com preferências sintéticas e sem conta WhatsApp ou pareamento. Confere
a entrada Fotos, diagnóstico, navegação e tamanho de fonte maior. Essa inspeção
da interface do H2 Auto não representa um teste de envio no WhatsApp real.
