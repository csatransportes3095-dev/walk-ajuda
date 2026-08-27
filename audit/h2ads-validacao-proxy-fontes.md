# H2 Ads — referências públicas para classificação de falhas de proxy

**Data:** 27/08/2026

Durante o diagnóstico, não foi localizada documentação pública verificável do fornecedor referido pelo ADM. Portanto, esta fonte não é usada para assumir protocolo ou parâmetros específicos do fornecedor.

| Evidência pública | Uso permitido no H2 Ads |
|---|---|
| [HTTP 407 Proxy Authentication Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/407) | Classificar com segurança uma rejeição de autenticação do proxy, sem revelar a credencial. |
| [Cabeçalho Proxy-Authenticate](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Proxy-Authenticate) | Explicar que um proxy pode desafiar a autenticação numa resposta 407. |
| [HTTP Node.js](https://nodejs.org/api/http.html) | Manter a chamada pontual isolada, sem reutilização persistente de conexão. |

O painel deve mostrar apenas categorias seguras — autenticação recusada, tempo esgotado, destino indisponível, conexão recusada ou resposta inválida — e nunca a configuração, host, utilizador ou palavra-passe.
