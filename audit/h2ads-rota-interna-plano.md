# H2 Ads — plano corrigido de rota interna

**Data:** 27/08/2026
**Estado do escopo:** a entrega inicial inclui card ADM, rota interna protegida e interface H2 Colombia. Não foram criados proxies, browsers remotos, tabelas, dados ou domínios adicionais.

## Decisão correta de escopo

O H2 Ads será criado **no projeto e serviço Walk Ajuda já existentes**, com a URL pública exata `https://h2colombiano.com/h2ads`. Não será criado outro domínio, outro serviço Render ou outra hospedagem para o painel.

O ponto de entrada é um **card no painel ADM atual**, em `client/src/pages/AdminCodes.tsx`, que abre internamente `/h2ads`. A rota foi registrada no roteador existente `client/src/App.tsx` e, nesta primeira entrega, usa o guard ADM já existente somente para restringir o acesso. A autenticação e as permissões próprias do H2 Ads ainda não foram criadas. A interface inicial não consulta, altera ou reaproveita cadastros de clientes, pedidos, empréstimos, gastos, cartões ou regras de `/ADSH2`.

| Elemento | Local correto | Regra de isolamento |
|---|---|---|
| Card de entrada | `AdminCodes.tsx`, lista `ADMIN_SHORTCUTS` | Apenas abre `/h2ads`; não leva dados de clientes. |
| Rota | `App.tsx`, mesma SPA e mesmo domínio | Classificada fora dos gates públicos e protegida temporariamente pelo guard ADM existente. |
| Interface | Nova página `H2Ads.tsx` | Identidade visual H2 Colombia; nenhum componente de negócio de `/ADSH2`. |
| Backend | Futuro router H2 Ads no servidor atual | Prefixo próprio e procedimentos administrativos específicos. |
| Dados | Futuras tabelas com prefixo `h2ads_` | Sem joins, migrations ou operações em tabelas atuais. |
| Sessões internas de browser | Futuros modelos próprios de instância e sessão | Nenhum cookie, sessão ou conteúdo de cliente Walk Ajuda. |

## Pontos de extensão verificados

O arquivo `App.tsx` já usa Wouter e concentra as rotas administrativas no componente `AdminGuard`. A rota `/h2ads` foi integrada sem exigir DNS, Cloudflare, proxy reverso, redirect ou outro serviço. A URL pública continua atendida pelo mesmo serviço Express/Render porque a aplicação tem fallback de SPA.

Há um detalhe obrigatório: `AppContent` identifica como administrativa principalmente a rota cujo caminho começa por `/admin`. Por isso, a integração criou a classificação explícita `isH2AdsRoute`, encaminha `/h2ads` diretamente ao `Router` e aplica o guard H2 Ads. Assim, a rota não herda login de cliente, sessão de cliente nem regras funcionais de `/ADSH2`.

O arquivo `AdminCodes.tsx` mantém os atalhos administrativos na constante `ADMIN_SHORTCUTS`, com `id`, `href`, `label`, ícone e cores. O novo card foi incluído nessa lista com `href: '/h2ads'`, identidade dourada/azul H2 Colombia e texto inequívoco `H2 ADS` / `Abrir painel de instâncias`.

## Limite técnico importante

O painel, as tabelas e a gestão das instâncias podem viver na hospedagem atual. Contudo, **navegadores remotos reais com visualização dentro da página** exigem Chromium, memória, CPU, processos persistentes, disco de perfis e WebSockets. O serviço Render atual está no plano Starter, com 0,5 CPU e 512 MB RAM; isto não é suficiente para operar browsers remotos isolados de forma estável. [1]

Sem criar outra hospedagem, existem apenas duas opções técnicas futuras:

| Opção | Mantém a hospedagem atual? | Resultado |
|---|---|---|
| Painel H2 Ads + validação de proxy, sem browser remoto real | Sim, no serviço atual. | Permite grupos, instâncias, segredos, IP/localização e saúde; não abre Chromium dentro da página. |
| Mesmo serviço Render com upgrade de plano, Docker customizado e disco persistente | Sim, é o mesmo serviço/domínio, mas com mais recursos. | Pode suportar um piloto de poucas instâncias, com limites rigorosos e testes. |

Um Chromium não deve ser colocado no plano Starter. A documentação Playwright confirma que browsers em container precisam de dependências próprias e recomenda isolamento por utilizador, perfil de sandbox e inicialização adequada do processo. [2] A documentação Render confirma que WebSockets podem ser interrompidos durante manutenção ou troca de instância; a visualização remota precisa de reconnect e encerramento seguro. [3]

## Regra fail-closed dentro do mesmo serviço

Na futura implementação, a instância só ficará disponível depois que o worker validar pelo proxy o IP público, país/cidade aproximados, ASN/ISP, latência e momento da verificação. A interface deverá suspender a sessão quando a saúde expirar, houver timeout, o IP mudar sem aprovação ou o proxy não responder.

Entretanto, a garantia total de que o Chromium nunca possa usar saída direta depende de controlo de egress na camada de rede. No Render atual essa política de rede ainda não foi verificada. Portanto, a primeira implementação deve declarar corretamente o alcance: **bloqueio pela aplicação e encerramento imediato da sessão**, sem prometer isolamento absoluto de rede até que exista teste de egress na infraestrutura escolhida.

## Próxima implementação, após autorização explícita

1. Criar schema e API isolados para grupos, instâncias, saúde e segredos cifrados, sem tocar em dados atuais.
2. Implementar autenticação e permissões funcionais próprias do H2 Ads, se autorizadas, sem reutilizar sessões de clientes.
3. Implementar o painel de gestão e o validador de proxy sem guardar ou exibir a senha original.
4. Testar IP, localização aproximada, latência, timeout, proxy indisponível e ausência de segredo nas respostas.
5. Somente depois avaliar o upgrade do mesmo serviço Render e o piloto de browser remoto, sem criar outra hospedagem ou domínio.

## Referências

[1]: https://render.com/docs/web-services "Render — Web Services"
[2]: https://playwright.dev/docs/docker "Microsoft Playwright — Docker"
[3]: https://render.com/docs/websocket "Render — WebSockets"
