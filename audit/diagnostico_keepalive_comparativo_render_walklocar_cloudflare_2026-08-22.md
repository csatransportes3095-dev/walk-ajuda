# Diagnóstico comparativo de keep-alive — 22/08/2026

## Evidências observadas

- O serviço gratuito da Render do H2 entrou em repouso e exibiu a tela de despertar ao usuário às 04:47 (GMT-3), apesar da rota pública `/api/ping` existir.
- A automação inicial do repositório H2 (`caec2cf`) executou às 07:19Z e 07:50Z, equivalentes a 04:19 e 04:50 GMT-3. Portanto, ficaram ausentes execuções às 04:30 e 04:40; ela não é confiável para uma janela de repouso de 15 minutos.
- O repositório WalkLocar possui um workflow de GitHub a cada cinco minutos para expirar pré-reservas, mas seus eventos observados também apresentaram lacunas de 36 a 49 minutos. Logo, esse workflow não garante que o WalkLocar permaneça ativo; o funcionamento percebido pode decorrer de tráfego normal.
- As duas instâncias Render responderam diretamente pelos respectivos endereços `*.onrender.com` quando testadas após despertar. O H2 respondeu em `https://walk-ajuda.onrender.com/api/ping` com HTTP 200 e JSON mínimo.

## Fontes oficiais

- Render Free: https://render.com/docs/free — serviços gratuitos entram em repouso após 15 minutos sem tráfego de entrada; a próxima solicitação desperta o serviço e mostra tela de loading.
- GitHub Actions schedule: https://docs.github.com/actions/using-workflows/events-that-trigger-workflows — execuções agendadas podem atrasar ou ser descartadas em períodos de alta carga.
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/ — Workers aceitam gatilhos programados e expõem histórico de eventos.
- Cloudflare Scheduled Handler: https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ — um handler `scheduled()` pode realizar uma chamada `fetch()` programada.
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/ — a modalidade gratuita comporta chamadas leves desse tipo.

## Progresso da alternativa Cloudflare

1. A integração Cloudflare foi habilitada com confirmação do usuário.
2. A credencial de API existente foi verificada como ativa.
3. Foi publicado o Worker isolado `h2-render-keepalive`, que chama apenas `https://walk-ajuda.onrender.com/api/ping` e não possui rota no domínio principal.
4. A criação do cron retornou o erro Cloudflare `10063`: a conta ainda não possui subdomínio `workers.dev` inicializado.
5. A API oficial expõe `PUT /accounts/{account_id}/workers/subdomain` para inicializar esse requisito. Essa ação criará apenas um subdomínio técnico `*.workers.dev`; não altera DNS de h2colombiano.com, R2 ou o sistema web.

## Pendência técnica imediata

Inicializar um subdomínio técnico Workers, ativar o cron `*/5 * * * *` do Worker e verificar pelo histórico de eventos duas execuções consecutivas. Depois disso, remover o workflow de GitHub `render-keepalive.yml`, que se mostrou impreciso.

## Configuração final aplicada

- O subdomínio técnico `h2colombiano.workers.dev` foi inicializado na conta Cloudflare, conforme autorizado. Ele não altera o DNS de `h2colombiano.com`.
- O Worker isolado `h2-render-keepalive` foi publicado pela API Cloudflare. Ele não lê ou grava banco, R2, pedidos, login, clientes ou qualquer rota de negócio; no evento programado, chama somente `https://walk-ajuda.onrender.com/api/ping`.
- Foram configurados três cron triggers complementares para obter espaçamento real de nove minutos durante todas as 24 horas, pois a expressão cron padrão `*/9` reinicia ao completar cada hora e criaria intervalos de 12 minutos na virada.
- As expressões ativas são:
  - `0,9,18,27,36,45,54 0,3,6,9,12,15,18,21 * * *`
  - `3,12,21,30,39,48,57 1,4,7,10,13,16,19,22 * * *`
  - `6,15,24,33,42,51 2,5,8,11,14,17,20,23 * * *`
- A automação GitHub `.github/workflows/render-keepalive.yml` foi removida, pois seus atrasos invalidavam seu uso como prevenção de repouso.
- A cadência de nove minutos realiza 160 chamadas diárias e aproximadamente 4.800 chamadas em um mês de 30 dias.
