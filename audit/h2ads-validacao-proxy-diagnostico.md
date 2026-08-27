# H2 Ads — diagnóstico da validação de rota

**Data:** 27/08/2026

O painel confirmou que a configuração foi cifrada e a validação foi iniciada. O código publicado grava uma falha de saúde e devolve uma mensagem única quando qualquer erro ocorre durante a conexão ou leitura da resposta.

| Achado | Consequência atual | Correção prevista |
|---|---|---|
| Exceções de DNS, conexão, timeout, autenticação e resposta inválida chegam no mesmo `catch`. | O ADM recebe apenas “A validação da rota falhou”. | Classificar o erro em categorias seguras sem registrar a rota ou credencial. |
| A mensagem persistida é genérica. | Não é possível distinguir correção de rota, autenticação ou indisponibilidade. | Persistir apenas a categoria sanitizada de falha. |
| O bloqueio da instância ocorre quando a validação falha. | A rota não é tratada como saudável sem uma confirmação externa válida. | Manter o bloqueio seguro. |

Não foram consultados nem copiados valores de proxy, utilizador ou palavra-passe.
