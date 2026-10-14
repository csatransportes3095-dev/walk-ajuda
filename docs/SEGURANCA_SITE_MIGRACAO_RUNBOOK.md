# Procedimento controlado — Migração Segurança do Site H2

Estado: **PREPARAÇÃO**, sem execução no banco de produção. PR #297 em rascunho.

## Ambiente correto

- Serviço Render: `walk-ajuda` (`srv-d9k6ieijobas7384h4v0`).
- Branch em produção: `recovery/organizar-salvos-2026-08-24`.
- Banco: **MySQL/TiDB apontado por `DATABASE_URL` do serviço**; NÃO é o Postgres gerenciado pela Render.
- A migração deve ser executada como tarefa **manual e única**, em terminal seguro com acesso ao mesmo banco; NÃO colocar em `render-start.sh`, NÃO acrescentar `H2_SECURITY_MIGRATION_APPROVED` como variável permanente do serviço e NÃO usar GitHub Actions com credenciais de produção.
- A API Render conectada nesta conversa não oferece terminal nem SQL MySQL. Um operador com acesso ao terminal de execução da aplicação ou a um host administrativo autorizado terá de executar o comando, após a validação deste PR.

## Pré-condições obrigatórias

1. Backup Core recente (concluído nas últimas 24h), 100%, integridade profunda **verified**, SHA-256 e tamanho conferidos. Backup no computador e chave de criptografia guardada separadamente. A recuperação deve constar no manifesto como `disasterRecovery.version=1` e nenhuma variável essencial ausente. Idealmente testar restauração em ambiente isolado antes da alteração.
2. Confirmar servidor e banco de destino por consulta somente leitura sem mostrar `DATABASE_URL` ou senha; comparar com o banco registrado no backup. Se diferir, PARAR.
3. Verificar se as cinco tabelas `siteAccessConfig`, `siteAccessEntries`, `siteAccessChallenges`, `siteAccessRateLimits`, `siteAccessAudit` já existem e se têm estrutura compatível. Não sobrescrever objetos incompatíveis.
4. Site deve permanecer **Público**. `H2_SITE_ACCESS_ENFORCE` não deve ser `true`. Nenhuma liberação dos modos Restrito/Bloqueado nesta etapa.
5. Verificar `systemBackups` e que o `H2_SITE_SECURITY_BACKUP_ID` corresponde exatamente ao backup conferido. Não copiar o valor de `DATABASE_URL`, tokens ou `BACKUP_ENCRYPTION_KEY` para histórico de comandos, logs, chat ou repositório.
6. Executar com usuário MySQL de privilégio mínimo que tenha `CREATE` apenas nas novas tabelas e `SELECT` para o catálogo e registro de backup; use janela de mudança e plano de recuperação.

## Execução: somente depois da aprovação de liberação e em terminal seguro

Usar checkout revisado do PR #297 e dependências instaladas (`pnpm install --frozen-lockfile`). `DATABASE_URL` deve existir apenas no ambiente do terminal, apontando para o MySQL correto; **não** incluí-la na linha de comando.

A preparação do processo deve exportar somente para aquela sessão de execução, após conferência das condições acima:

```sh
export H2_SITE_SECURITY_MIGRATION_TARGET=production
export H2_SECURITY_MIGRATION_APPROVED=yes
export H2_SITE_SECURITY_PRODUCTION_APPROVED=YES_I_APPROVE_THIS_MIGRATION
export H2_SITE_SECURITY_BACKUP_ID=<ID_HEXADECIMAL_VALIDADO_DE_48_CARACTERES>
pnpm exec tsx scripts/apply-site-security-migration.ts
unset H2_SECURITY_MIGRATION_APPROVED H2_SITE_SECURITY_PRODUCTION_APPROVED H2_SITE_SECURITY_BACKUP_ID H2_SITE_SECURITY_MIGRATION_TARGET
```

O comando deve ser feito uma única vez como operação supervisionada. Variáveis de aprovação jamais devem permanecer no painel Render. Atenção: `CREATE TABLE` realiza commit implícito em MySQL; backup e validação devem preceder execução, e rollback NÃO é uma transação única.

## Pós-execução

- Conferir as cinco novas tabelas, colunas, índices únicos, `ENGINE=InnoDB`, `mode DEFAULT 'public'`, e ausência de linhas de configuração inesperadas.
- Conferir contagens e amostras não sensíveis de tabelas legadas críticas (clientes, pedidos, empréstimos e `systemBackups`) comparando com o registro prévio.
- Confirmar funcionamento atual de login ADM, login clientes, acompanhamento, H2ADS, backups e integrações.
- Documentar hora de início/fim, resultado e identificação do backup sem revelar segredos.
- Em falha: PARAR, registrar diagnóstico e avaliar plano de restauração. **Não** executar `DROP TABLE` automático nem restaurar banco sem revisão de dados criados após o backup.

## Separação da etapa futura

A migração apenas cria estrutura. A publicação do PR #293 (card Segurança do Site, gateways, APIs e interface) é **outra mudança**, que requer homologação completa e nova autorização. Não mesclar o PR #297 nem publicar o PR #293 como parte deste runbook sem o teste/controle de mudança correspondente.
