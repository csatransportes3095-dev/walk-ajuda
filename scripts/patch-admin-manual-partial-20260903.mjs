import fs from 'node:fs';

const file = 'client/src/pages/AdminCustomers.tsx';
const source = fs.readFileSync(file, 'utf8');
const before = `      } else {\n        setCreateError(data.message || 'Erro ao cadastrar cliente');\n      }`;
const after = `      }`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`${file}: retorno antigo esperado uma vez, encontrado ${count}`);
fs.writeFileSync(file, source.replace(before, after));
console.log('Retorno do cadastro manual parcial ajustado com sucesso.');
