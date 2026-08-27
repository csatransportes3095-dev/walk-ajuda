# H2 Ads — modelo base isolado

**Data:** 27/08/2026
**Escopo desta fase:** grupos e registros de instâncias autorizadas dentro do mesmo Walk Ajuda. Não inclui proxy, credenciais de proxy, conexão de browser, worker, WebSocket, cookies, perfil de navegador, geolocalização, IP, ASN ou execução remota.

## Separação obrigatória

O módulo usará somente tabelas próprias com prefixo `h2ads_`. Não haverá `JOIN`, chave estrangeira ou leitura de `customers`, `accessCodes`, `orderStatusHistory`, empréstimos, gastos, cartões, `/ADSH2` ou qualquer sessão de cliente. A proteção de acesso permanece sob o JWT administrativo já existente, enquanto autenticação própria do H2 Ads não fizer parte de uma fase autorizada.

## Entidades desta fase

| Entidade | Tabela | Finalidade | Campos principais |
|---|---|---|---|
| Grupo | `h2ads_groups` | Organiza instâncias por operação autorizada, sem dados de cliente. | `id`, `name`, `description`, `status`, `sortOrder`, datas de auditoria. |
| Instância | `h2ads_instances` | Registra uma unidade lógica ainda sem browser, proxy ou perfil real. | `id`, `groupId`, `name`, `status`, `notes`, `sortOrder`, datas de auditoria. |

Os estados iniciais são intencionalmente administrativos. Um grupo pode ser `active` ou `archived`; uma instância pode ser `draft`, `paused` ou `archived`. O estado `ready` não será exposto nesta fase, pois não existirá proxy validado, worker ou navegador real.

## Contrato administrativo

| Procedimento | Proteção | Efeito |
|---|---|---|
| `h2Ads.listDashboard` | ADM | Lista apenas grupos H2 Ads e suas instâncias. |
| `h2Ads.createGroup` / `updateGroup` | ADM | Cria ou edita metadados de grupos H2 Ads. |
| `h2Ads.createInstance` / `updateInstance` | ADM | Cria ou edita metadados de instâncias H2 Ads. |

As operações de arquivamento serão alterações explícitas de status; esta fase não terá remoção física. Uma instância só poderá ser criada quando o `groupId` referir um grupo H2 Ads existente.

## Limites preservados

> Esta base é apenas o cadastro administrativo. Ela não abre um navegador, não recebe proxy, não recebe senha, não faz tráfego externo em nome de uma instância e não promete isolamento de rede.

Uma fase futura deverá tratar separadamente: armazenamento cifrado de segredo, teste de proxy, estado de saúde, IP/localização/ASN/latência, controles fail-closed e somente depois uma avaliação de capacidade para browser remoto no mesmo serviço Render.
