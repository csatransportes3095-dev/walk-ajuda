# Diagnóstico — Agendamento e miniaturas do WhatsApp

**Data:** 21 de agosto de 2026  
**Caso auditado:** pedido `#17760002` (consulta somente leitura)  
**Escopo:** links de agendamento/reagendamento, página pública e miniaturas compartilhadas no WhatsApp.

## Resultado do caso real

O token enviado para o cliente foi consultado diretamente na API pública de produção. Ele existe, pertence ao pedido `#17760002`, está em estado `pending` — liberado para escolha/reagendamento — e retorna 19 horários disponíveis. A página pública também foi aberta e apresentou o aviso de agendamento, sem mensagem de link inválido.

| Verificação | Resultado |
|---|---|
| Link de reagendamento | Válido e público. |
| Estado do agendamento | `pending`, sem data/hora reservada, que é o estado correto após reabrir. |
| Horários disponíveis | 19 horários retornados pela API. |
| Foto vinculada ao agendamento | Existe e a origem responde JPEG em aproximadamente 0,14 s. |
| Alteração de status do pedido | Não encerra nem cancela a agenda automaticamente. |

Portanto, o **agendamento do pedido real está funcional**. O erro comprovado no fluxo enviado pelo WhatsApp é a miniatura do link, não a validade do token ou a disponibilidade de horários.

## Causa comprovada da miniatura

| Problema | Evidência | Efeito no WhatsApp |
|---|---|---|
| Metadados genéricos | `/agendar/:token` recebe `og:title`, `og:description` e `og:url` do site inteiro. O `og:url` foi entregue como `http://h2colombiano.com/`, e não como a URL HTTPS individual do agendamento. | O WhatsApp não identifica corretamente cada link de agendamento como uma página própria. |
| Imagem externa lenta | O HTML aponta a miniatura para `midia.h2colombiano.com/...png`. A resposta medida foi 1,9 MB em aproximadamente 55 s. | O robô do WhatsApp abandona ou falha a captura da miniatura antes de terminar. |
| Tipo de imagem incompatível | O HTML declara `og:image:type=image/jpeg`, porém o arquivo real entregue é PNG. | Acrescenta incompatibilidade à leitura do preview. |
| Rota rápida não utilizada | Já existe `https://h2colombiano.com/og.jpg`, JPEG de 800×420 e 41 KB. | A rota correta existe, mas o HTML atual não a usa para o link de agendamento. |
| Origem de links variável | O bloco administrativo monta links a partir de `window.location.origin` e encaminha essa origem ao servidor. | Pode voltar a gerar link com domínio/protocolo não canônico dependendo de onde o ADM estiver aberto. |

## Correção definida

A correção será limitada a agendamento e previews de compartilhamento:

1. O link `/agendar/:token` receberá metadados Open Graph próprios, com título e descrição claros de agendamento, URL HTTPS canônica `https://h2colombiano.com/agendar/:token` e miniatura JPEG leve `https://h2colombiano.com/og.jpg`.
2. Os links enviados, copiados, enviados por e-mail ou reabertos para reagendamento passarão a usar exclusivamente `https://h2colombiano.com`, sem depender da origem do navegador administrativo.
3. O conteúdo da página, horários, mensagens, token, foto, status do pedido e dados já cadastrados não serão alterados.
4. Serão adicionados testes automatizados para o HTML da miniatura, URL canônica e fluxo de reagendamento.

## Critérios de validação

- O token real continua em `pending` e mostra horários disponíveis.
- O HTML do link de agendamento expõe `og:url` HTTPS do próprio link, título/descrição de agendamento e imagem JPEG leve no domínio `h2colombiano.com`.
- O link de reagendamento gerado pelo ADM usa sempre o domínio canônico.
- Nenhuma confirmação, cancelamento, slot, horário ou dado do cliente é modificado durante a correção.
