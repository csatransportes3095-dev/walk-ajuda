import fs from 'node:fs';

const path = 'server/routers/customerUpdate.ts';
let s = fs.readFileSync(path, 'utf8');
const from = `      const previousIdentity = { phone: customer.phone, cpf: customer.cpf };\n      const synchronization = await syncUnifiedCustomerRegistry([previousIdentity]);\n      await ensureCustomerUpdateCompletionInfrastructure(db);`;
const to = `      const previousIdentity = { phone: customer.phone, cpf: customer.cpf };\n\n      // Grava os dados atuais do perfil antes de concluir a atualização.\n      // O telefone não participa do UPDATE: continua sendo a identidade fixa do cliente.\n      await db.execute(sql\`\n        UPDATE customers SET\n          name=\${name},\n          email=\${email},\n          cpf=\${cpf},\n          cep=\${cep},\n          street=\${street},\n          addressNumber=\${addressNumber},\n          neighborhood=\${neighborhood},\n          addressComplement=\${addressComplement || null},\n          city=\${city},\n          uf=\${uf},\n          normalizedCpf=\${cpf},\n          normalizedEmail=\${email},\n          updatedAt=NOW()\n        WHERE id=\${customer.id} AND deletedAt IS NULL\n      \`);\n\n      const synchronization = await syncUnifiedCustomerRegistry([previousIdentity]);\n      await ensureCustomerUpdateCompletionInfrastructure(db);`;
const count = s.split(from).length - 1;
if (count !== 1) throw new Error(`save profile update: esperado 1 trecho, encontrado ${count}`);
s = s.replace(from, to);
fs.writeFileSync(path, s);
console.log('Persistencia do /atualizarcadastro corrigida.');
