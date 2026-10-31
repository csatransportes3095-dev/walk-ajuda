# Migração OTP — estado do PR #511

Este PR é **draft** e não deve ser mesclado ou publicado apenas porque os checks anteriores passaram.

O backend já possui uma proposta de desafio por telefone e código no e-mail, mas ainda há fluxos legados nos arquivos `PasswordGate.tsx`, `GastosLoginPage.tsx`, `AtualizarCadastro.tsx`, `customerPassword.ts`, `spreadsheet.ts` e `customerUpdate.ts`.

A configuração `H2_CUSTOMER_OTP_V2_ENABLED` fica **desativada por padrão** e não deve ser ativada no Render até:
1. Migrar todos os fluxos de clientes para telefone + código.
2. Desabilitar os endpoints de autenticação por senha no servidor.
3. Substituir sessões de 90 dias, renovação e fallbacks de senha por sessão OTP revogável.
4. Preservar autenticação administrativa, regras de bloqueio e controles próprios de serviço.
5. Executar testes automatizados, de banco de dados e testes reais de emissão de e-mail.
6. Confirmar rollback, assinatura do APK e funcionamento do H2 AUTO 1.60 sem mudanças.

**Observação:** o workflow de migração executa também TypeScript e build; sua aprovação não substitui teste de DB/e-mail.
