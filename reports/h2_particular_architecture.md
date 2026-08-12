# Arquitetura do módulo H2 Particular

## Objetivo

O H2 Particular será um módulo independente dentro da Planilha de Gastos, isolado por `userId` da sessão ativa da planilha. Nenhuma tabela financeira existente será substituída. O módulo utilizará dados persistentes próprios para clientes, orçamentos, agenda, viagens, pagamentos, recibos, configurações e eventos, com vínculos explícitos para evitar duplicidade financeira.

## Diagnóstico do projeto existente

| Área existente | Reutilização definida |
|---|---|
| Sessão da Planilha | O token será validado no backend e resolvido para `spreadsheetSessions.clientId`; este será o `userId` de todas as operações do H2 Particular. |
| Ganhos | Os ganhos por particular já são armazenados em `spreadsheetEarnings.particular`. Uma viagem paga gerará um lançamento controlado por vínculo único, sem criar duplicidade. |
| Operacional | A contagem de viagens particulares já existe em `spreadsheetOperational.ridesParticular`; a integração será efetuada uma única vez por viagem concluída. |
| Veículo e combustível | Serão reaproveitados `spreadsheetVehicleConfig.kmPerLiter`, `fuelPricePerLiter`, `minRatePerKm` e `minRatePerMin`. O custo por km será calculado no servidor como preço do litro dividido pelo consumo. |
| WhatsApp | A ação seguirá o padrão já existente do projeto, usando link `wa.me` com mensagem codificada. Não haverá API de WhatsApp neste fluxo. |
| PDF e QR | O projeto já contém PDFKit, QRCode e armazenamento R2. Os documentos serão gerados no servidor, persistidos e disponibilizados por links públicos com token seguro. |
| Mapas | Há proxy de Google Maps já integrado ao servidor, com geocodificação, autocomplete, directions e matriz de distância. O módulo consumirá esse serviço apenas pelo backend, sem expor credenciais ao navegador. |

## Decisões de arquitetura

> A fonte de verdade será o banco de dados. Nenhum cliente, agendamento, viagem, pagamento, recibo ou vínculo financeiro dependerá exclusivamente de `localStorage`.

### Identidade e segurança

Cada tabela funcional receberá `userId` obrigatório. Todas as consultas, atualizações, cancelamentos e documentos privados serão filtrados no backend por este identificador derivado do token. Um identificador recebido pela URL jamais será suficiente para acessar dados de outro motorista.

Links de orçamento e recibo serão públicos apenas pelo `publicToken` aleatório e revogável, nunca pelo ID interno sequencial. Os dados privados de clientes não serão exibidos em páginas públicas.

### Dados persistentes

| Entidade | Finalidade | Identificador público |
|---|---|---|
| `private_clients` | Cadastro permanente de passageiros | `clientCode` no formato `CLI-000001` |
| `private_settings` | Motorista, veículo, preços, espera, margem, agenda, recibo e pagamentos | Um registro por `userId` |
| `private_quotes` | Orçamentos, validade, aceite e token público | `quoteCode` no formato `ORC-000001` |
| `private_appointments` | Agenda, recorrência, conflito e status | ID interno protegido pelo usuário |
| `private_trips` | Execução, snapshots e resultado financeiro da viagem | ID interno protegido pelo usuário |
| `private_trip_stops` | Paradas ordenadas de uma viagem ou agendamento | ID interno protegido pelo usuário |
| `private_payments` | Pagamentos totais ou parciais vinculados à viagem | ID interno protegido pelo usuário |
| `private_receipts` | Recibos, token público, PDF e estado de envio | `receiptCode` no formato `REC-000001` |
| `private_events` | Timeline imutável de alterações importantes | ID interno protegido pelo usuário |

As viagens e orçamentos guardarão snapshots de cliente, origem, destino, valores e custos para que o histórico nunca mude após edição do cadastro principal do passageiro.

### Regras financeiras

A integração da viagem paga com a Planilha de Gastos ocorrerá no servidor e será idempotente. O vínculo será armazenado na viagem com campos equivalentes a `incomeId`, `incomeDate` e `incomePostedAt`. Antes de lançar um ganho, o serviço verifica esse vínculo. Nenhuma atualização de tela ou novo pagamento repetirá o lançamento.

O preço recomendado será calculado pelo serviço central: combustível, pedágio, estacionamento, adicionais, espera, outros custos e margem configurada. O valor final sempre poderá ser alterado pelo motorista. A qualidade da margem será derivada no backend como abaixo do custo, baixa, boa ou excelente.

### Agenda e lembretes

A agenda terá validação de conflito no backend. A duração estimada, o retorno opcional e a margem configurada entre viagens compõem a janela protegida. Recorrências serão materializadas com limite de data final para manter previsibilidade e desempenho.

Nesta primeira entrega, os lembretes serão alertas dentro do módulo, calculados quando o motorista abre a Planilha, evitando um serviço externo de execução contínua. A arquitetura manterá registros e preferências necessários para habilitar notificações automáticas em uma expansão posterior sem redesenho dos dados.

### Mapas e navegação

O backend converterá endereços em coordenadas e calculará rota, distância e duração com o proxy de mapas já disponível no projeto. As coordenadas e o resultado calculado serão armazenados para evitar nova cobrança e recalculação desnecessária. O botão de navegação abrirá link compatível com aplicativos de mapa disponíveis no aparelho.

## Ordem de implementação

1. Criar tabelas, índices, migração segura e serviço central.
2. Criar Clientes com busca normalizada e prevenção de duplicidade.
3. Criar agenda e agendamentos com conflito e recorrência.
4. Criar cálculo de rota, combustível, custos e preço recomendado.
5. Criar orçamentos, link público e aceite.
6. Criar viagens, pagamentos parciais, recebíveis e lançamento idempotente na Planilha.
7. Criar recibos, PDFs, links públicos, WhatsApp e histórico.
8. Criar dashboard, relatórios e configurações do motorista.
9. Testar isolamento por usuário, persistência, duplicidade, conflito, links públicos e responsividade.

## Dependências externas

O módulo pode usar o proxy de Google Maps existente para mapa, autocomplete e cálculo de rota. Caso a credencial desse proxy não esteja configurada no ambiente de produção, o módulo continuará permitindo cadastro e agendamento manual, mas os cálculos automáticos de rota e mapa exigirão a ativação da credencial já prevista pelo projeto.

O envio por WhatsApp não exige chave: seguirá o redirecionamento `wa.me` já usado pelo sistema. Os PDFs serão produzidos com PDFKit e poderão ser armazenados no R2 já configurado no projeto.

## Critérios de validação

A implementação somente será considerada concluída após validar cadastro e busca de cliente, impedimento de duplicidade, isolamento por `userId`, agendamento e conflito, cálculo de custos, pagamento total e parcial, prevenção de lançamento financeiro duplicado, persistência após novo login, links públicos com token e apresentação responsiva em celular e desktop.
