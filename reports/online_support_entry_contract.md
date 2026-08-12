# Contrato de integração — Atendimento Online pré-login

## Escopo preservado

Somente o **Atendimento Online** aberto antes do login será ampliado. O bot interno pós-login, o formulário tradicional e as páginas existentes continuarão como estão. O CEP permanece opcional e serve apenas para consultar e preencher automaticamente cidade e UF; não será criado endereço, número, bairro ou complemento porque esses campos não existem no cadastro tradicional atual.

## Identidade e cadastro

O bot deverá armazenar respostas temporárias por conversa antes de criar qualquer registro definitivo. A confirmação final chamará a mesma operação `customers.register` usada pelo formulário tradicional, que por sua vez usa a validação de perfil, normalização de telefone/e-mail, CPF matematicamente válido, busca global por CPF/telefone/e-mail e criação de cliente único.

| Campo atual | Regra no bot |
|---|---|
| Nome | Obrigatório, texto não vazio |
| Telefone | Obrigatório, normalizado e validado com DDD |
| CPF | Obrigatório, validado matematicamente |
| E-mail | Obrigatório, normalizado e validado |
| CEP | Opcional; consulta cidade e UF |
| Cidade e UF | Obrigatórios |
| Foto de perfil | Obrigatória; mesmo fluxo de armazenamento do formulário |
| Indicador | Opcional no formulário atual; se informado, validado no mesmo banco |

## Sessão autenticada do bot

A senha nunca será salva no estado do bot, no rascunho ou nas mensagens. Depois de telefone e senha serem verificados pelo login oficial do cliente, o Atendimento Online guardará somente um token aleatório de curta duração. O backend validará o token, o cliente, o escopo da rota e a propriedade de qualquer pedido, empréstimo, parcela ou comprovante a cada chamada.

## Regras por área

| Área | Consulta permitida após autenticação | Regra de acesso |
|---|---|---|
| Pedidos | Pedidos, status, previsão e dados já expostos em `/acompanhar` | Deve pertencer ao cliente autenticado |
| Empréstimos | Empréstimo, parcelas, saldo e próximo vencimento | Exige permissão `emprestimo` |
| Comprovante | Envio para parcela do próprio cliente | Mantém revisão manual e evita duplicidade pendente |
| Gastos | Entrada na área autorizada | Exige permissão `gastos` |
| Site de pedidos | Entrada na área autorizada | Exige permissão `site` |

## Liberação de rotas

A configuração persistente por rota terá modos `automatico` e `manual`. O padrão será automático para manter o comportamento existente. No modo manual, o cadastro/suporte cria somente uma solicitação pendente para o ADM; ele não libera a rota nem cria uma conta duplicada.

## Dados em tempo real

O bot não terá cópia de status, parcelas ou pedidos. Cada consulta buscará a fonte oficial no momento da solicitação, para refletir qualquer alteração feita pelo ADM sem sincronização paralela.

## Proteções obrigatórias

- nenhuma informação privada somente por CPF, telefone ou número de pedido;
- senha nunca retornada ou registrada em texto;
- token expirado ou sessão encerrada não pode consultar dados;
- ID de pedido, empréstimo e parcela é sempre conferido contra o cliente da sessão;
- comprovante recebido pelo bot mantém o fluxo atual de análise e baixa;
- cancelamento do cadastro remove apenas o rascunho, nunca cria cliente incompleto.
