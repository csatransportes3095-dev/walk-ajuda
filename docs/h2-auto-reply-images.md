# H2 Auto — imagens anexadas às respostas

## Cadastro

Em `/admin/h2-auto`, abra **Inteligência → Perguntas e respostas livres**. Cada
pergunta aceita uma imagem opcional abaixo do texto da resposta. O administrador
pode anexar, visualizar, trocar ou remover a foto e salvar a personalização do
aparelho. A resposta pode conter texto, imagem ou ambos; uma resposta sem nenhum
conteúdo não pode ser salva.

O APK precisa da capacidade `imageRepliesV1` (H2 Auto 2.14, versionCode 114).
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

## Validação isolada

O workflow `h2-auto-image-replies.yml` executa testes do contrato e da autorização,
o ciclo upload/salvar/sincronizar/responder/baixar em MySQL isolado, a tela real do
ADM em desktop/celular e a compilação com a preparação usada no Render. O R2 é
substituído por armazenamento em memória nos testes. Nenhuma mensagem ou foto é
enviada a clientes pelos testes.

Os testes de MySQL exigem `H2_AUTO_REPLY_IMAGES_TEST_DB_URL` apontando exclusivamente
para `h2_auto_reply_images_test` em um host local permitido; nenhuma conexão com
o banco de produção é utilizada.
