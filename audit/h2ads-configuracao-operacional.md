# H2 Ads — fundação de configuração operacional isolada

**Data:** 27/08/2026

## Objetivo desta entrega

Esta etapa amplia os registros lógicos já existentes com uma configuração administrativa de conectividade por instância. O objetivo é deixar cada instância preparada para receber, numa fase futura e autorizada, uma rota de rede validada e a visualização de saúde correspondente.

O módulo permanece no projeto Walk Ajuda e na rota interna `h2colombiano.com/h2ads`, mas usa somente tabelas com o prefixo `h2ads_`. Não há leitura, escrita, sessão, chave estrangeira ou junção com clientes, pedidos, empréstimos, gastos, cartões ou `/ADSH2`.

## Dados permitidos nesta fase

| Categoria | Campos administrativos | Regra |
|---|---|---|
| Identificação de rota | fornecedor, rótulo da rota, país e cidade planejados | Não aceita URL, host, porta, utilizador ou palavra-passe de proxy. |
| Expectativa declarada | ISP e ASN esperados | Servem apenas como referência administrativa. |
| Estado | configuração pendente, metadados prontos ou bloqueado | Não declara que a instância está ligada à internet. |
| Saúde futura | não verificado, saudável, degradado, falhou ou bloqueado | Nesta entrega o ADM só pode manter `não verificado` ou `bloqueado`; os demais estados serão exclusivos de uma verificação técnica futura. |
| Evidência futura | IP de saída, localização observada, latência, mensagem e data da última checagem | Nenhuma verificação externa será executada nesta etapa. |

## Tabela nova e isolada

`h2ads_instance_network_profiles` terá no máximo um perfil administrativo por `h2ads_instances.id`. O vínculo usa somente o identificador interno da instância H2 Ads e não cria relação com tabelas de outros módulos.

> A tabela não possui coluna para segredo de proxy, endpoint, WebSocket, cookie, perfil de browser ou credencial de conta. Esses elementos exigem arquitetura e autorização separadas.

## Controlo fail-closed preparado

O estado `blocked` estará disponível desde já. Ele representa a regra de que, no futuro, a execução não poderá iniciar ou continuar se a conectividade estiver ausente, falhar ou divergir da configuração esperada. Nesta entrega, não há processo de execução a bloquear: há somente o estado administrativo e a interface de preparação.

## Fase futura separada

Uma etapa posterior poderá integrar uma verificação de rota e preencher os campos observados somente após receber autorização específica e os requisitos do fornecedor. Browser remoto, WebSocket/noVNC, perfis/cookies e qualquer processo contínuo exigem ambiente de execução adequado e não serão habilitados pelo cadastro administrativo.
