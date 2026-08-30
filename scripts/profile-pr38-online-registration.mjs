import fs from 'node:fs';

function fileApi(path) {
  const read = () => fs.readFileSync(path, 'utf8');
  const write = (s) => fs.writeFileSync(path, s);
  const replaceOnce = (before, after) => {
    const source = read();
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error(`${path}: expected one match, found ${count}: ${before.slice(0, 100)}`);
    write(source.replace(before, after));
  };
  const assertHas = (text) => {
    if (!read().includes(text)) throw new Error(`${path}: missing ${text}`);
  };
  return { read, write, replaceOnce, assertHas };
}

const panelPath = 'client/src/components/OnlineRegistrationPanel.tsx';
const panel = fileApi(panelPath);

panel.replaceOnce(
  `const steps = ['route', 'name', 'phone', 'cpf', 'email', 'cep', 'city', 'uf', 'referrer', 'photo', 'confirm', 'password'] as const;`,
  `const steps = ['route', 'name', 'phone', 'cpf', 'email', 'cep', 'addressLine', 'addressNumber', 'neighborhood', 'addressComplement', 'city', 'uf', 'referrer', 'photo', 'confirm', 'password'] as const;`,
);

panel.replaceOnce(
  `  const [data, setData] = useState({ name: '', phone: '', cpf: '', email: '', cep: '', city: '', uf: '', referrerPhone: '', profilePhotoUrl: '' });`,
  `  const [data, setData] = useState({ name: '', phone: '', cpf: '', email: '', zipCode: '', addressLine: '', addressNumber: '', neighborhood: '', addressComplement: '', city: '', uf: '', referrerPhone: '', profilePhotoUrl: '' });`,
);

panel.replaceOnce(
  `    cep: 'Informe seu CEP',\n    city: 'Qual é sua cidade?',`,
  `    cep: 'Informe seu CEP',\n    addressLine: 'Informe sua rua / logradouro',\n    addressNumber: 'Informe o número do endereço',\n    neighborhood: 'Informe seu bairro',\n    addressComplement: 'Complemento do endereço (opcional)',\n    city: 'Qual é sua cidade?',`,
);

panel.replaceOnce(
  `    const field = step as keyof typeof data;\n    let cleaned = (value.trim() || ((step === 'city' || step === 'uf') ? data[field] : '')).trim();\n    if (step === 'phone' || step === 'cpf' || step === 'cep') cleaned = cleaned.replace(/\\D/g, '');`,
  `    const field = (step === 'cep' ? 'zipCode' : step) as keyof typeof data;\n    let cleaned = (value.trim() || ((step === 'city' || step === 'uf') ? data[field] : '')).trim();\n    if (step === 'phone' || step === 'cpf' || step === 'cep') cleaned = cleaned.replace(/\\D/g, '');`,
);

panel.replaceOnce(
  `    if (step === 'cep' && cleaned.length !== 8) {\n      setError('Informe um CEP válido com 8 dígitos.');\n      return;\n    }`,
  `    if (step === 'cep' && cleaned.length !== 8) {\n      setError('Informe um CEP válido com 8 dígitos.');\n      return;\n    }\n    if (step === 'addressLine' && cleaned.length < 2) { setError('Informe sua rua / logradouro.'); return; }\n    if (step === 'addressNumber' && !cleaned) { setError('Informe o número do endereço.'); return; }\n    if (step === 'neighborhood' && cleaned.length < 2) { setError('Informe seu bairro.'); return; }`,
);

panel.replaceOnce(
  `          next = { ...next, city: address.localidade || next.city, uf: address.uf || next.uf };`,
  `          next = { ...next, addressLine: address.logradouro || next.addressLine, neighborhood: address.bairro || next.neighborhood, city: address.localidade || next.city, uf: address.uf || next.uf };`,
);

panel.replaceOnce(
  `<div><b>CEP:</b> {data.cep}</div><div><b>Cidade/UF:</b> {data.city}/{data.uf}</div>`,
  `<div><b>CEP:</b> {data.zipCode}</div><div><b>Endereço:</b> {data.addressLine}, {data.addressNumber} - {data.neighborhood}</div><div><b>Complemento:</b> {data.addressComplement || '-'}</div><div><b>Cidade/UF:</b> {data.city}/{data.uf}</div>`,
);

panel.replaceOnce(
  `        <input value={value || (step === 'city' ? data.city : step === 'uf' ? data.uf : '')} onChange={e => { setValue(e.target.value); setError(''); setExistingCustomer(null); }} placeholder={step === 'cep' ? 'CEP com 8 dígitos' : 'Digite aqui'} inputMode={['phone', 'cpf', 'cep'].includes(step) ? 'numeric' : undefined} style={input} />`,
  `        <input value={value || (step === 'city' ? data.city : step === 'uf' ? data.uf : step === 'addressLine' ? data.addressLine : step === 'neighborhood' ? data.neighborhood : '')} onChange={e => { setValue(e.target.value); setError(''); setExistingCustomer(null); }} placeholder={step === 'cep' ? 'CEP com 8 dígitos' : step === 'addressComplement' ? 'Opcional — deixe vazio se não houver' : 'Digite aqui'} inputMode={['phone', 'cpf', 'cep'].includes(step) ? 'numeric' : undefined} style={input} />`,
);

panel.assertHas("zipCode: ''");
panel.assertHas("addressLine: ''");
panel.assertHas("addressNumber: ''");
panel.assertHas("neighborhood: ''");
panel.assertHas("addressComplement: ''");
panel.assertHas("field = (step === 'cep' ? 'zipCode' : step)");

const routerPath = 'server/routers/online-support.ts';
const onlineRouter = fileApi(routerPath);
onlineRouter.replaceOnce(
  `      step: z.enum(['route', 'identity', 'name', 'phone', 'cpf', 'email', 'cep', 'uf', 'city', 'referrer', 'photo', 'confirm']),`,
  `      step: z.enum(['route', 'identity', 'name', 'phone', 'cpf', 'email', 'cep', 'addressLine', 'addressNumber', 'neighborhood', 'addressComplement', 'uf', 'city', 'referrer', 'photo', 'confirm']),`,
);
onlineRouter.assertHas("'addressLine', 'addressNumber', 'neighborhood', 'addressComplement'");

const registrationPath = 'server/online-support/registration.ts';
const registration = fileApi(registrationPath);
registration.replaceOnce(
  `export type OnlineRegistrationStep = 'route' | 'identity' | 'name' | 'phone' | 'cpf' | 'email' | 'cep' | 'uf' | 'city' | 'referrer' | 'photo' | 'confirm';`,
  `export type OnlineRegistrationStep = 'route' | 'identity' | 'name' | 'phone' | 'cpf' | 'email' | 'cep' | 'addressLine' | 'addressNumber' | 'neighborhood' | 'addressComplement' | 'uf' | 'city' | 'referrer' | 'photo' | 'confirm';`,
);
registration.replaceOnce(
  `  if (['name', 'uf', 'city', 'profilePhotoUrl'].includes(field) && !text) throw new Error('Campo obrigatório.');\n  if (field === 'phone' && !normalizeCustomerPhone(text)) throw new Error('Telefone inválido. Informe DDD e número.');\n  if (field === 'cpf' && !isValidCPF(normalizeCpf(text))) throw new Error('CPF inválido. Digite um CPF válido para continuar.');\n  if (field === 'email' && !normalizeCustomerEmail(text)) throw new Error('E-mail inválido.');\n  if (field === 'cep' && text && !/^\\d{8}$/.test(text.replace(/\\D/g, ''))) throw new Error('CEP inválido.');`,
  `  if (['name', 'uf', 'city', 'profilePhotoUrl', 'addressNumber'].includes(field) && !text) throw new Error('Campo obrigatório.');\n  if (['addressLine', 'neighborhood'].includes(field) && text.length < 2) throw new Error('Campo obrigatório.');\n  if (field === 'phone' && !normalizeCustomerPhone(text)) throw new Error('Telefone inválido. Informe DDD e número.');\n  if (field === 'cpf' && !isValidCPF(normalizeCpf(text))) throw new Error('CPF inválido. Digite um CPF válido para continuar.');\n  if (field === 'email' && !normalizeCustomerEmail(text)) throw new Error('E-mail inválido.');\n  if ((field === 'cep' || field === 'zipCode') && !/^\\d{8}$/.test(text.replace(/\\D/g, ''))) throw new Error('CEP inválido.');`,
);
registration.assertHas("'addressLine' | 'addressNumber' | 'neighborhood' | 'addressComplement'");
registration.assertHas("field === 'zipCode'");

console.log('PR #38 online guided registration now uses the canonical full address and matching draft schema.');
