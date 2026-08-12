# Auditoria de identidade — 12 de agosto de 2026

Esta auditoria é **somente de leitura**. Nenhum cliente foi excluído, mesclado, bloqueado ou alterado.

## Resumo do cadastro principal

| Verificação | Resultado |
|---|---:|
| Clientes ativos no cadastro principal | 297 |
| Telefones normalizados duplicados | 0 |
| CPFs normalizados duplicados | 0 |
| E-mails normalizados duplicados | 8 grupos |
| Perfis ativos com pelo menos um campo obrigatório ausente | 114 |

Os 114 perfis incompletos são cadastros antigos. Eles não serão apagados, bloqueados ou alterados pela migração. A exigência integral de foto, e-mail, CPF e telefone permanece apenas para novas criações e para liberação de novos módulos, conforme a regra vigente.

## Relação de e-mails repetidos

| E-mail normalizado | Cadastros envolvidos |
|---|---|
| h2colombiano@gmail.com | #381 ADM (11993425306); #58 MARCELO (11978787878); #54 WALK SANTOS (11996369658); #47 THIAGO IZAIAS DA SILVA SANTOS (11977276496) |
| allancrd157@gmail.com | #247 ALLAN ARIVALDO CORREIA DA SILVA (11984913146); #49 6614 ALAN SP (11948913146) |
| patrickbarbosa294@gmail.com | #178 PATRICK BARBOSA DE SOUZA (11942830374); #177 PATRICK SOUZA (11942840374) |
| rodrigobraz933@gmail.com | #142 RODRIGO DE OLIVEIRA BRAZ (11982091087); #131 RODRIGO DE OLIVEIRA BRAZ (11914947866) |
| jonathaaan021@gmail.com | #109 JONATHAN DA CUNHA (21964748748); #108 JONATHAN DA CUNHA (21920123780) |
| william84vieira@gmail.com | #68 WILLIAM SANTOS VIEIRA (11987893287); #67 WILLIAM VIEIRA (11987793287) |
| h2reidascontas@gmail.com | #65 .MANOEL (11944230847); #56 PAULO (11945458585) |
| csatransportes3095@gmail.com | #61 PEDIODO (11993425959); #57 WALK (11939369567) |

> A relação existe para revisão administrativa. Esses casos impedem adicionar um índice `UNIQUE` de e-mail neste momento, pois a base possui e-mails compartilhados legítimos ou históricos. A proteção de cadastro novo será feita por consulta normalizada e tratamento de conflito; e-mail novo será bloqueado quando pertencer a uma identidade existente, sem modificar os registros antigos.

## Caso exibido nas imagens

O cadastro principal #381 foi localizado com telefone `11993425306`, CPF, e-mail e foto preenchidos. Também existe um vínculo técnico de Gastos para o mesmo telefone. A verificação real da rota `/gastos` retornou o estado `no_password`, isto é, o cadastro é reconhecido e deve seguir para criação/entrada de senha — não para criar outro perfil.

## Próxima proteção planejada

A migração compatível utilizará o cadastro principal como identidade canônica, com telefone e CPF normalizados. As permissões de Gastos, Empréstimos e área principal serão associadas ao mesmo cliente, sem apagar dados técnicos existentes. Não será criada `UNIQUE` para e-mail no banco enquanto os oito grupos acima não forem revisados manualmente.
