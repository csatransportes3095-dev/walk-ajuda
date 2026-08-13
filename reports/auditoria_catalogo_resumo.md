# Matriz de auditoria do catálogo H2

Produtos ativos: **5**
Opções ativas: **13**

| Produto | Product ID | Opção | Option ID | Preço | Perguntas | Documentos |
|---|---:|---|---:|---:|---:|---:|
| UBER APP | 60001 | NOME ALEATÓRIO | 3090001 | R$ 400,00 | 18 | 2 |
| UBER APP | 60001 | UBER 1º / NOME | 120001 | R$ 500,00 | 18 | 2 |
| UBER APP | 60001 | UBER NOME / COMPLETO | 2670001 | R$ 600,00 | 18 | 2 |
| UBER TAXI | 360001 | UBER TAXI N/ ALEATORIO | 300003 | R$ 400,00 | 18 | 4 |
| UBER TAXI | 360001 | UBER TAXI 1º / Nome | 300004 | R$ 500,00 | 18 | 4 |
| UBER TAXI | 360001 | NOME COMPLETO | 2850001 | R$ 650,00 | 18 | 4 |
| EDIÇÃO DOC VEICUILO | 960001 | SÓ PARA UBER. | 990001 | R$ 180,00 | 15 | 1 |
| EDIÇÃO DOC VEICUILO | 960001 | SÓ PARA 99. | 2730001 | R$ 150,00 | 15 | 1 |
| EDIÇÃO DOC VEICUILO | 960001 | PARA UBER E 99. | 2790001 | R$ 300,00 | 15 | 1 |
| EDIÇÃO DOC VEICUILO | 960001 | TAXI PARA UBER X OU 99 POP | 2820001 | R$ 350,00 | 15 | 1 |
| CRLV ORIGINAL  | 2610001 | CRLV | 3120001 | R$ 60,00 | 4 | 0 |
| 99 APP PARA MOTORISTA | 360002 | NOME ALEATORIO | 300005 | R$ 350,00 | 5 | 2 |
| 99 APP PARA MOTORISTA | 360002 | PRIMEIRO NOME | 300006 | R$ 450,00 | 5 | 2 |

## Regras observadas

- Cada opção guarda seu próprio `optionId`, preço, questionário, documentos e garantias.
- A vitrine atual usa o `productId` no produto e chama o fluxo original por `handleOptionSelection(option)`.
- O checkout e a criação de pedido recebem o produto selecionado e a opção selecionada, sem depender do visual do card.
