# Diagnóstico — Repouso da Render e keep-alive

**Data:** 21 de agosto de 2026  
**Escopo:** impedir a tela de “Service waking up” no `h2colombiano.com` sem afetar login, pedidos, banco de dados ou outros módulos.

## Evidência observada

O registro visual informado pelo usuário mostra a página padrão da Render com as mensagens “Incoming HTTP request detected”, “Service waking up” e “Application loading”. Isso caracteriza o despertar de uma instância gratuita após inatividade, e não uma falha da autenticação ou da rota `/admin/orders`.

A documentação oficial confirma que um serviço Web gratuito da Render entra em repouso depois de **15 minutos sem tráfego de entrada**. A primeira requisição posterior inicia o serviço e pode levar aproximadamente um minuto. Os health checks internos da Render verificam a saúde de uma instância que já está em execução; eles não substituem tráfego periódico externo para evitar o repouso.

## Auditoria do código existente

| Item | Local | Resultado | Risco / efeito |
|---|---|---|---|
| Rota HTTP pública simples | `server/_core/index.ts` | **Não existe** uma rota dedicada como `GET /api/ping` ou `GET /api/health`. | Não há URL leve, estável e explícita para um monitor externo chamar. |
| Procedimento tRPC atual | `server/_core/systemRouter.ts`, `system.health` | Responde `{ ok: true }`, porém exige `{ timestamp: number }` como entrada. | Uma chamada direta sem parâmetro retorna HTTP 400. Não deve ser usado como URL de monitoramento simples. |
| Keep-alive atual | `server/_core/index.ts`, linhas 518–531 | Há um `setInterval` de 10 minutos que chama a própria URL externa em `/api/trpc/system.health`, sem o parâmetro obrigatório. | O ping atual recebe HTTP 400. Além disso, por iniciar dentro da própria instância, ele deixa de existir assim que a Render coloca o processo em repouso; portanto, não consegue acordá-lo. |
| Teste em produção | `https://h2colombiano.com/api/trpc/system.health` | Sem input: HTTP 400, 287 bytes, com erro de validação. Com input tRPC correto: HTTP 200, 40 bytes. | Confirma a falha do endpoint hoje usado pelo intervalo interno. |

## Conclusão técnica

A correção segura tem duas partes independentes:

1. Criar `GET /api/ping` como rota pública mínima, sem autenticação, sessão, banco, arquivos, uploads ou alteração de dados. A resposta deve ser somente `200` com JSON pequeno, por exemplo `{ "ok": true, "ts": 0 }`, e cabeçalhos que impeçam cache indevido.
2. Configurar um monitor **fora da Render** para chamar essa rota a cada **10 minutos**. Assim haverá tráfego de entrada antes do limite de 15 minutos mesmo quando não houver ninguém no site. O intervalo é suficientemente abaixo do limite e gera volume desprezível: aproximadamente 144 respostas/dia, com poucas dezenas de bytes cada.

Não é indicado fazer refresh automático no navegador do cliente: o mecanismo só funcionaria enquanto uma aba estivesse aberta, aumentaria requisições e não protegeria o primeiro cliente do dia. Também não é indicado manter o `setInterval` interno, pois ele não sobrevive ao repouso e, no estado atual, chama uma URL inválida.

## Salvaguardas obrigatórias

- A rota não acessará MySQL, R2, upload, TOTP, autenticação, pedidos, empréstimos, comissões ou agendamentos.
- Não será registrada como acesso de cliente nem executará ações em segundo plano.
- O monitor externo chamará exclusivamente `https://h2colombiano.com/api/ping` por `GET`.
- Será preservado o domínio canônico `h2colombiano.com`.
- A alteração será compilada, testada localmente e validada em produção antes da confirmação final.

## Referências

[1] [Render — Free instances](https://render.com/docs/free#spinning-down-on-idle)  
[2] [Render — Health checks](https://render.com/docs/health-checks)
