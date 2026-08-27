# H2 Ads — importação de proxy por colagem protegida

**Data:** 27/08/2026

## Finalidade

O painel H2 Ads poderá receber uma configuração de proxy por instância num campo protegido. O servidor interpreta a configuração e armazena o conteúdo completo somente cifrado. A interface nunca volta a mostrar a linha original, nem o utilizador, palavra-passe, host ou porta.

## Formato suportado

O formulário aceita somente a estrutura abaixo, sem protocolo e sem espaços:

```text
host:porta:utilizador:palavra-passe
```

O primeiro e o segundo separadores identificam o host e a porta. O conteúdo após o terceiro separador é a palavra-passe, podendo conter caracteres próprios do fornecedor. O formato não é incluído em respostas de API, notificações, mensagens de erro ou logs da aplicação.

## Armazenamento

| Elemento | Regra |
|---|---|
| Configuração original | Cifrada com AES-256-GCM antes da persistência. |
| Chave de cifra | Variável exclusiva `H2ADS_PROXY_ENCRYPTION_KEY` no ambiente seguro do Render; nunca no código, painel ou banco. |
| Banco | Tabela isolada `h2ads_instance_proxy_credentials`, contendo somente versão e conteúdo cifrado. |
| Painel | Mostra apenas “credencial protegida” e a data de atualização. |
| Logs e erros | Não incluem a configuração, utilizador, palavra-passe, host ou porta. |

## Validação por clique

Depois de uma importação bem-sucedida, o ADM poderá clicar em **Validar rota** para realizar uma única chamada externa através da rota da instância. A resposta permitida contém IP de saída, país, cidade, ASN, organização e latência. A implementação recusa destinos locais, privados ou sem DNS público.

Se a chamada falhar, exceder o tempo ou divergir do país, ISP ou ASN esperado que o ADM tenha definido, a configuração administrativa recebe estado **bloqueado**. Não há browser remoto nesta fase, portanto não existe sessão de browser a iniciar ou interromper.

## Limites explícitos

Esta entrega não cria contas, não automatiza websites, não abre browsers remotos, não recolhe cookies, não altera fingerprint, não executa validações recorrentes e não usa dados de clientes ou de outros módulos. A validação é manual, uma instância por vez, e requer ação explícita do ADM.
