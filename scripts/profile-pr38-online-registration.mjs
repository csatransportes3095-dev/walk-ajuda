import fs from 'node:fs';

const path = 'client/src/components/OnlineRegistrationPanel.tsx';
const read = () => fs.readFileSync(path, 'utf8');
const write = (s) => fs.writeFileSync(path, s);
function replaceOnce(before, after) {
  const source = read();
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one match, found ${count}: ${before.slice(0, 100)}`);
  write(source.replace(before, after));
}
function assertHas(text) {
  if (!read().includes(text)) throw new Error(`${path}: missing ${text}`);
}

replaceOnce(
  `const steps = ['route', 'name', 'phone', 'cpf', 'email', 'cep', 'city', 'uf', 'referrer', 'photo', 'confirm', 'password'] as const;`,
  `const steps = ['route', 'name', 'phone', 'cpf', 'email', 'cep', 'addressLine', 'addressNumber', 'neighborhood', 'addressComplement', 'city', 'uf', 'referrer', 'photo', 'confirm', 'password'] as const;`,
);

replaceOnce(
  `  const [data, setData] = useState({ name: '', phone: '', cpf: '', email: '', cep: '', city: '', uf: '', referrerPhone: '', profilePhotoUrl: '' });`,
  `  const [data, setData] = useState({ name: '', phone: '', cpf: '', email: '', zipCode: '', addressLine: '', addressNumber: '', neighborhood: '', addressComplement: '', city: '', uf: '', referrerPhone: '', profilePhotoUrl: '' });`,
);

replaceOnce(
  `    cep: 'Informe seu CEP',\n    city: 'Qual é sua cidade?',`,
  `    cep: 'Informe seu CEP',\n    addressLine: 'Informe sua rua / logradouro',\n    addressNumber: 'Informe o número do endereço',\n    neighborhood: 'Informe seu bairro',\n    addressComplement: 'Complemento do endereço (opcional)',\n    city: 'Qual é sua cidade?',`,
);

replaceOnce(
  `    const field = step as keyof typeof data;\n    let cleaned = (value.trim() || ((step === 'city' || step === 'uf') ? data[field] : '')).trim();\n    if (step === 'phone' || step === 'cpf' || step === 'cep') cleaned = cleaned.replace(/\\D/g, '');`,
  `    const field = (step === 'cep' ? 'zipCode' : step) as keyof typeof data;\n    let cleaned = (value.trim() || ((step === 'city' || step === 'uf') ? data[field] : '')).trim();\n    if (step === 'phone' || step === 'cpf' || step === 'cep') cleaned = cleaned.replace(/\\D/g, '');`,
);

replaceOnce(
  `    if (step === 'cep' && cleaned.length !== 8) {\n      setError('Informe um CEP válido com 8 dígitos.');\n      return;\n    }`,
  `    if (step === 'cep' && cleaned.length !== 8) {\n      setError('Informe um CEP válido com 8 dígitos.');\n      return;\n    }\n    if (step === 'addressLine' && cleaned.length < 2) { setError('Informe sua rua / logradouro.'); return; }\n    if (step === 'addressNumber' && !cleaned) { setError('Informe o número do endereço.'); return; }\n    if (step === 'neighborhood' && cleaned.length < 2) { setError('Informe seu bairro.'); return; }`,
);

replaceOnce(
  `          next = { ...next, city: address.localidade || next.city, uf: address.uf || next.uf };`,
  `          next = { ...next, addressLine: address.logradouro || next.addressLine, neighborhood: address.bairro || next.neighborhood, city: address.localidade || next.city, uf: address.uf || next.uf };`,
);

replaceOnce(
  `<div><b>CEP:</b> {data.cep}</div><div><b>Cidade/UF:</b> {data.city}/{data.uf}</div>`,
  `<div><b>CEP:</b> {data.zipCode}</div><div><b>Endereço:</b> {data.addressLine}, {data.addressNumber} - {data.neighborhood}</div><div><b>Complemento:</b> {data.addressComplement || '-'}</div><div><b>Cidade/UF:</b> {data.city}/{data.uf}</div>`,
);

replaceOnce(
  `        <input value={value || (step === 'city' ? data.city : step === 'uf' ? data.uf : '')} onChange={e => { setValue(e.target.value); setError(''); setExistingCustomer(null); }} placeholder={step === 'cep' ? 'CEP com 8 dígitos' : 'Digite aqui'} inputMode={['phone', 'cpf', 'cep'].includes(step) ? 'numeric' : undefined} style={input} />`,
  `        <input value={value || (step === 'city' ? data.city : step === 'uf' ? data.uf : step === 'addressLine' ? data.addressLine : step === 'neighborhood' ? data.neighborhood : '')} onChange={e => { setValue(e.target.value); setError(''); setExistingCustomer(null); }} placeholder={step === 'cep' ? 'CEP com 8 dígitos' : step === 'addressComplement' ? 'Opcional — deixe vazio se não houver' : 'Digite aqui'} inputMode={['phone', 'cpf', 'cep'].includes(step) ? 'numeric' : undefined} style={input} />`,
);

assertHas("zipCode: ''");
assertHas("addressLine: ''");
assertHas("addressNumber: ''");
assertHas("neighborhood: ''");
assertHas("addressComplement: ''");
assertHas("field = (step === 'cep' ? 'zipCode' : step)");

console.log('PR #38 online guided registration now uses the canonical full address.');
