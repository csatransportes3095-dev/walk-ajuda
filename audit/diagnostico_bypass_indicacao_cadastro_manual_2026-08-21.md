# Diagnóstico — bypass de indicação no cadastro manual

**Data:** 21/08/2026  
**Escopo:** criação, importação e liberação de clientes sem indicação válida.  
**Método:** auditoria de código e fluxos; nenhum cliente, pedido ou indicação foi alterado.

## Conclusão

A regra de indicação obrigatória está corretamente protegida no cadastro público principal. A procedure `customers.register` resolve o telefone do indicador no servidor e bloqueia o cadastro quando não existe indicador cadastrado e válido.

O problema ocorre no caminho **ADM → Clientes → Novo Cadastro Manual**. Essa tela cria clientes pela procedure `customers.adminCreate`, que recebe somente nome, telefone, e-mail, CPF, foto, cidade e UF. Ela chama `createCustomer` diretamente, sem perguntar indicação, sem validar telefone do indicador e sem registrar a resposta. Por isso os cards aparecem como **“Indicação: Não respondeu”**.

Os clientes mostrados no painel foram criados por esse fluxo ou por algum fluxo administrativo que reutiliza o mesmo cadastro manual. A aparência de “Cadastro” no card é compatível com esse caminho; a indicação não foi apagada depois, ela nunca foi solicitada.

## Caminhos auditados

| Caminho | Situação | Resultado atual |
|---|---|---|
| Cadastro público principal | Valida indicador no servidor antes do INSERT | Correto: bloqueia sem indicador válido |
| Rotas de primeiro acesso | Reutilizam a validação central de acesso restrito | Corretas conforme a regra publicada |
| ADM → Clientes → Novo Cadastro Manual | Não recebe nem valida indicador | Falha confirmada: cria cliente sem indicação |
| Importar CSV de clientes | Não cria cliente principal; retorna erro por falta de foto, e-mail e CPF | Não é bypass atualmente |
| Importar pedidos | Importa registros de pedido, não cria perfil principal pela função `createCustomer` | Não é a causa do cadastro sem indicação |

## Correção segura

A correção deve levar a mesma regra central de indicação obrigatória para `customers.adminCreate` e para o formulário ADM:

1. O formulário manual terá o campo obrigatório **Telefone do indicador cadastrado**.
2. Antes de criar, o servidor normaliza o telefone e chama a resolução central de indicação.
3. Se o indicador não existir, for o próprio cliente ou estiver inválido, o servidor bloqueia a criação.
4. Quando válido, salva nome/telefone do indicador e registra a origem como os demais cadastros.
5. A regra fica no servidor; não poderá ser ignorada por chamada direta ao ADM.

## Preservação de dados

A correção não deve modificar os clientes já existentes sem indicação, seus pedidos, acessos, dados de login, documentos ou status. Ela apenas impede novos cadastros sem indicação válida. A regularização dos registros antigos deve ser uma decisão separada e manual, pois não é seguro inventar um indicador retroativo.
