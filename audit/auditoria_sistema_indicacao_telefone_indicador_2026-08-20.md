# Auditoria do Sistema de Indicação — Telefone do Indicador

**Data:** 20 de agosto de 2026  
**Escopo:** auditoria somente leitura. Nenhum campo, cadastro, indicação, comissão, pedido, senha, pagamento ou outro módulo foi alterado.

## Resumo executivo

O sistema possui mais de um caminho para o cliente informar uma indicação. Esses caminhos não seguem exatamente a mesma regra. A consequência é que o telefone do indicador pode ser aceito em uma tela, bloqueado em outra, ou salvo apenas como declaração sem chegar ao cadastro e à comissão.

A regra central que deve ser preservada é clara: a indicação pertence ao primeiro cadastro/primeiro pedido elegível, não pode ser autorreferência, o texto digitado deve ser preservado e a comissão somente pode usar um indicador realmente vinculado. Nenhuma correção deve recalcular comissões antigas, alterar pedidos ou modificar dados financeiros.

## Caminhos auditados

| Caminho | Campos apresentados ao cliente | Validação atual | Destino atual | Situação |
|---|---|---|---|---|
| Cadastro principal protegido | Nome e telefone do indicador, opcionais | Telefone exigido com 11 dígitos quando preenchido; bloqueia autorreferência | `customers.referredBy` e `customers.referredByPhone`; cria histórico quando os dois existem | Funciona, mas diverge do backend que aceita 10 ou 11 dígitos |
| Cadastro principal no servidor | Nome e telefone opcionais | Telefone informado precisa existir em `customers`; caso contrário bloqueia o cadastro | Cadastro principal, histórico e estatística | Risco alto: contraria a regra original de não bloquear o cadastro por indicador não localizado |
| Manifesto pós-login de Gastos/Empréstimos | Nome e telefone, obrigatórios após escolher “Sim” | Apenas verifica preenchimento; não valida formato, autorreferência ou existência do indicador | `spreadsheetReferralDeclarations` | Risco alto: grava uma declaração isolada, sem refletir no cadastro ou comissão |
| Tela inicial de acesso | Somente telefone do indicador | Valida telefone e existência de cliente ativo | Apenas `sessionStorage` | Risco médio: funciona como porta de acesso, mas não grava a indicação de forma definitiva |
| Pergunta pós-pedido na vitrine | Somente telefone do indicador | Exige 11 dígitos, impede autorreferência e exige indicador cadastrado | Tenta atualizar cadastro | Risco alto: a própria API bloqueia atualização quando já existe pedido; o cliente pode ver um formulário que não consegue concluir |
| Edição administrativa do cliente | Nome e telefone editáveis | Normaliza dígitos, mas não valida existência, autorreferência ou combinação completa | Atualiza somente `customers` | Risco médio: pode criar dados parciais ou divergentes do histórico e das comissões |
| Pedido manual pelo ADM | Nome e telefone editáveis | Não valida indicador no fluxo manual | Atualiza o cadastro apenas se ele ainda não tiver indicação | Risco médio: pode salvar telefone não vinculado sem criar histórico de indicação |
| Cadastro guiado do suporte online | Não tem campo de indicação | Não se aplica | Não se aplica | Lacuna: o mesmo cadastro principal pode ser concluído por esse caminho sem a opção de indicação |

## Falhas confirmadas no código

### 1. Cadastro pode ser bloqueado porque o telefone do indicador não foi encontrado

No cadastro principal, se o cliente digita um telefone de indicador não localizado, o backend retorna erro e impede o cadastro. Isso é incompatível com a regra solicitada anteriormente: o cliente deve poder concluir o cadastro mesmo que o nome/telefone informado não seja localizado, preservando o texto como origem declarada.

**Risco:** perda de cadastro por erro de digitação ou porque o indicador ainda não possui cadastro reconhecido.

### 2. O manifesto de Gastos/Empréstimos aceita indicação, mas não integra essa indicação ao cadastro e à comissão

O manifesto pós-login guarda nome, telefone e a rota em `spreadsheetReferralDeclarations`. Ele não atualiza `customers.referredBy`, não cria `referralHistory` e não participa do congelamento de comissão.

Além disso, o servidor não exige 10/11 dígitos, não impede que o cliente informe o próprio telefone e permite que um telefone inexistente seja salvo. O campo `referrerCustomerId` só é preenchido por comparação exata do telefone, sem normalização equivalente à usada em outras telas.

**Risco:** o cliente recebe a confirmação de que informou a indicação, mas a indicação pode não existir para o painel de comissões, o histórico e a busca central.

### 3. A pergunta “pós-pedido” entra em conflito com a regra do servidor

A vitrine mostra a pergunta depois do pedido, mas a API `customers.updateReferral` recusa qualquer indicação quando já existe pedido para o telefone. Portanto, o cliente pode preencher o telefone e receber uma recusa, apesar de a tela convidá-lo a informar a indicação.

**Risco:** experiência confusa e falsa expectativa de registro.

### 4. A tela inicial valida, mas não persiste a indicação

A tela inicial de acesso confirma que o telefone informado pertence a um cliente existente e ativo. Entretanto, ela grava apenas em `sessionStorage`. Não existe consumo posterior desses valores para salvar no cadastro, no histórico ou na comissão.

**Risco:** a validação é temporária; recarregar, fechar a página ou seguir outro caminho pode descartar a informação.

### 5. Validações de telefone não são uniformes

| Local | Regra atual |
|---|---|
| Backend de cadastro | Aceita 10 ou 11 dígitos |
| Cadastro protegido do cliente | Aceita somente 11 dígitos |
| Manifesto pós-login | Aceita qualquer texto não vazio; o navegador normaliza, mas a API não garante o formato |
| Atualização pós-pedido | Aceita 10 ou 11 no servidor, mas a tela exige 11 |
| Edição ADM | Aceita texto livre e apenas remove símbolos antes de salvar |
| `validateReferrer` | Procura por igualdade exata de telefone, sem uma busca normalizada de contingência |

Isso não quebra todos os casos atuais, mas torna o resultado dependente da tela usada.

### 6. Nome e telefone podem ficar inconsistentes

O cadastro principal guarda o nome digitado e o telefone separadamente. No cadastro inicial o nome não é substituído pelo nome real encontrado pelo telefone; no pós-pedido ele é substituído; no manifesto ele fica como digitado. A edição administrativa pode alterar os campos sem refletir no histórico de indicação ou em uma comissão já congelada.

**Risco:** mesmo telefone pode aparecer com apelido, nome incompleto ou nome diferente entre Cadastro, Indicações, ADM de Gastos e Comissões.

## Verificação de dados reais — somente leitura

Foram analisados 307 cadastros existentes, sem modificar nada.

| Medida | Quantidade | Leitura correta |
|---|---:|---|
| Cadastros com ao menos um campo de indicação | 44 | Base atual de indicações declaradas |
| Telefone de indicador vinculado a cliente existente | 27 | Vínculos que podem ser resolvidos pelo telefone atual |
| Nome sem telefone | 6 | Origem declarada incompleta; não deve gerar comissão automática |
| Telefone sem nome | 3 | Dado parcial; deve ser completado ou apresentado como pendente de validação |
| Indicador por telefone não encontrado | 11 | Origem declarada preservada, mas sem vínculo automático seguro |
| Nome diferente do nome atual do telefone vinculado | 9 | Pode ser apelido, nome antigo ou erro; requer apenas sinalização, não correção automática |
| Telefones de indicador com tamanho inválido | 0 | Não foi encontrado formato inválido nos registros atuais |
| Autorreferências | 0 | Não foi encontrado caso de cliente indicando a si mesmo |

Também foram analisadas 18 linhas do painel de comissões.

| Medida | Quantidade | Leitura correta |
|---|---:|---|
| Comissões sem nome ou telefone completo do indicador | 1 | Registro antigo/incompleto; não deve ser alterado automaticamente |
| Comissões cujo telefone do indicador não está no cadastro atual | 1 | Registro legado/declarado; precisa de análise manual antes de qualquer pagamento |
| Comissões com autorreferência | 0 | Nenhum caso encontrado |
| Divergência entre telefone da comissão e telefone atual do cadastro indicado | 0 | Os registros com telefone preenchido estão coerentes nessa comparação |

No manifesto pós-login foram encontradas 16 declarações: 14 respostas “não” e 2 respostas “sim”. As duas respostas “sim” não foram refletidas no cadastro principal; uma delas aponta para telefone de indicador sem cliente correspondente. Isso confirma a separação entre o manifesto e o sistema central de indicação.

## O que está funcionando e não deve ser desfeito

| Proteção ou fluxo | Situação |
|---|---|
| Não permitir autorreferência no cadastro protegido e no pós-pedido | Preservar |
| Não recalcular comissão já congelada | Preservar integralmente |
| Comissão somente no primeiro pedido elegível | Preservar integralmente |
| Não notificar o indicador no simples cadastro | Preservar |
| Prioridade de registros novos sobre comissão antiga | Preservar |
| Cadastro único de clientes | Preservar; não criar tabela de cliente paralela |
| Declarações por rota de Gastos/Empréstimos visíveis no ADM correspondente | Preservar a visualização, mas integrar a origem de modo controlado |

## Correção segura proposta — ainda não aplicada

A correção deve criar uma única regra reutilizável de indicação, sem alterar as comissões antigas ou outros módulos.

1. Criar um normalizador único de telefone: remove símbolos, trata `+55`, aceita somente 10/11 dígitos e devolve um valor padrão.
2. Criar uma validação central única: bloqueia somente autorreferência e telefone estruturalmente inválido. Telefone não localizado não bloqueia o cadastro; fica como **origem declarada não vinculada**.
3. Salvar sempre a declaração original digitada. Quando o telefone encontrar cliente, salvar também o ID do indicador e o nome oficial como vínculo de referência, sem apagar o texto declarado.
4. Definir uma única origem central para comissão: apenas a indicação registrada no primeiro cadastro antes do primeiro pedido pode habilitar futura comissão. Manifestos pós-login devem ser informativos para Gastos/Empréstimos e não podem criar comissão retroativa sem uma regra explícita aprovada.
5. Ajustar a tela pós-pedido: removê-la desse momento ou transformá-la em aviso não editável, porque a API corretamente bloqueia indicação depois do primeiro pedido.
6. No ADM, mostrar estado claro: **Vinculada**, **Informada sem vínculo**, **Incompleta**, **Autorreferência bloqueada** e **Registro legado**. Não corrigir automaticamente os 44 cadastros já existentes.
7. Ao editar pelo ADM, validar o par completo e impedir que uma alteração silenciosa modifique vínculo que já possui comissão congelada.

## Testes realizados

| Teste | Resultado |
|---|---|
| Suíte existente de cadastro | 10 de 10 aprovada |
| Leitura dos campos reais de clientes | Concluída sem alteração |
| Leitura das declarações de Gastos/Empréstimos | Concluída sem alteração |
| Leitura do painel de comissões | Concluída sem alteração |
| Busca por autorreferência e telefone inválido | Nenhum caso atual encontrado |

## Arquivos auditados

- `client/src/components/PasswordGate.tsx`
- `client/src/components/PostLoginReferralManifest.tsx`
- `client/src/components/HomeAccessManifest.tsx`
- `client/src/components/OnlineRegistrationPanel.tsx`
- `client/src/pages/Home.tsx`
- `client/src/pages/AdminNewOrder.tsx`
- `client/src/pages/AdminCustomers.tsx`
- `server/routers.ts`
- `server/routers/spreadsheet.ts`
- `server/routers/online-support.ts`
- `server/db.ts`
- `drizzle/schema.ts`
