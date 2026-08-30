import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(path, before, after) {
  const source = read(path);
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one match, found ${count}: ${before.slice(0, 90)}`);
  write(path, source.replace(before, after));
}
function replaceRegex(path, regex, replacement, expected = 1) {
  const source = read(path);
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const hits = [...source.matchAll(new RegExp(regex.source, flags))];
  if (hits.length !== expected) throw new Error(`${path}: expected ${expected} regex match(es), found ${hits.length}: ${regex}`);
  write(path, source.replace(regex, replacement));
}
function assertHas(path, text) {
  if (!read(path).includes(text)) throw new Error(`${path}: missing audit marker: ${text}`);
}

const gate = 'client/src/components/PasswordGate.tsx';

replaceOnce(gate,
  `  const [regCep, setRegCep] = useState("");\n  const [cepLoading, setCepLoading] = useState(false);`,
  `  const [regCep, setRegCep] = useState("");\n  const [regStreet, setRegStreet] = useState("");\n  const [regAddressNumber, setRegAddressNumber] = useState("");\n  const [regNeighborhood, setRegNeighborhood] = useState("");\n  const [regAddressComplement, setRegAddressComplement] = useState("");\n  const [cepLoading, setCepLoading] = useState(false);`);

replaceOnce(gate,
  `        const uf = data.uf?.toUpperCase() || '';\n        const cidade = data.localidade || '';\n        const estadoObj = ESTADOS_BR.find(e => e.uf === uf);`,
  `        const uf = data.uf?.toUpperCase() || '';\n        const cidade = data.localidade || '';\n        if (data.logradouro) setRegStreet(String(data.logradouro));\n        if (data.bairro) setRegNeighborhood(String(data.bairro));\n        const estadoObj = ESTADOS_BR.find(e => e.uf === uf);`);

replaceOnce(gate,
  `    if (enteredByCpf && getPhoneDigits(regPhone).length !== 11) { toast.error("Preencha o telefone com DDD (11 dígitos)"); return; }\n    if (!regCity.trim()) { toast.error("Selecione a cidade"); return; }`,
  `    if (enteredByCpf && getPhoneDigits(regPhone).length !== 11) { toast.error("Preencha o telefone com DDD (11 dígitos)"); return; }\n    if (regCep.replace(/\\D/g, '').length !== 8) { toast.error("Preencha um CEP válido com 8 dígitos"); return; }\n    if (regStreet.trim().length < 2) { toast.error("Preencha a rua / logradouro"); return; }\n    if (!regAddressNumber.trim()) { toast.error("Preencha o número do endereço"); return; }\n    if (regNeighborhood.trim().length < 2) { toast.error("Preencha o bairro"); return; }\n    if (!regCity.trim()) { toast.error("Selecione a cidade"); return; }`);

replaceOnce(gate,
  `        cpf: regCpf.trim(),\n        city: regCity.trim(),`,
  `        cpf: regCpf.trim(),\n        zipCode: regCep.replace(/\\D/g, ''),\n        addressLine: regStreet.trim(),\n        neighborhood: regNeighborhood.trim(),\n        addressNumber: regAddressNumber.trim(),\n        addressComplement: regAddressComplement.trim() || undefined,\n        city: regCity.trim(),`);

replaceOnce(gate,
  `                    setRegCep("");\n                    setRegCity("");`,
  `                    setRegCep("");\n                    setRegStreet("");\n                    setRegAddressNumber("");\n                    setRegNeighborhood("");\n                    setRegAddressComplement("");\n                    setRegCity("");`);

replaceOnce(gate,
  `<label className="text-white mb-2 block text-sm font-medium">CEP <span className="text-gray-400 font-normal text-xs">(opcional — preenche Estado e Cidade)</span></label>`,
  `<label className="text-white mb-2 block text-sm font-medium">CEP <span className="text-red-400">*</span></label>`);

const addressUi = `\n\n                {/* Endereço completo obrigatório */}\n                <div>\n                  <label className="text-white mb-2 block text-sm font-medium">Rua / Logradouro <span className="text-red-400">*</span></label>\n                  <input type="text" value={regStreet} onChange={(e) => setRegStreet(e.target.value)} required placeholder="Rua, Avenida..." className="w-full px-4 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />\n                </div>\n                <div className="grid grid-cols-[120px_1fr] gap-3">\n                  <div><label className="text-white mb-2 block text-sm font-medium">Número <span className="text-red-400">*</span></label><input type="text" value={regAddressNumber} onChange={(e) => setRegAddressNumber(e.target.value)} required placeholder="123 ou S/N" className="w-full px-3 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary outline-none" /></div>\n                  <div><label className="text-white mb-2 block text-sm font-medium">Bairro <span className="text-red-400">*</span></label><input type="text" value={regNeighborhood} onChange={(e) => setRegNeighborhood(e.target.value)} required placeholder="Bairro" className="w-full px-3 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary outline-none" /></div>\n                </div>\n                <div>\n                  <label className="text-white mb-2 block text-sm font-medium">Complemento <span className="text-white/45">(opcional)</span></label>\n                  <input type="text" value={regAddressComplement} onChange={(e) => setRegAddressComplement(e.target.value)} placeholder="Apto, bloco, referência..." className="w-full px-4 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary outline-none" />\n                </div>`;
replaceRegex(gate, /(\s*\{\/\* CEP \*\/\}[\s\S]*?\n\s*<\/div>\n)(\n\s*\{\/\* Estado com autocomplete \*\/\})/, `$1${addressUi}$2`);

const routers = 'server/routers.ts';
replaceOnce(routers,
  `        cpf: z.string().min(11, "CPF inválido").max(18),\n        city: z.string().min(1, "Cidade é obrigatória"),`,
  `        cpf: z.string().min(11, "CPF inválido").max(18),\n        zipCode: z.string().transform(value => value.replace(/\\D/g, '')).refine(value => /^\\d{8}$/.test(value), "CEP obrigatório e inválido"),\n        addressLine: z.string().trim().min(2, "Rua obrigatória").max(255),\n        neighborhood: z.string().trim().min(2, "Bairro obrigatório").max(128),\n        addressNumber: z.string().trim().min(1, "Número obrigatório").max(32),\n        addressComplement: z.string().trim().max(128).optional(),\n        city: z.string().min(1, "Cidade é obrigatória"),`);

// O patch principal já pode ter reorganizado o objeto de perfil. A âncora abaixo é
// única no cadastro público e adiciona os campos canônicos sem depender da ordem de city/uf.
replaceOnce(routers,
  `          profilePhotoUrl: input.profilePhotoUrl.trim(),`,
  `          zipCode: input.zipCode.replace(/\\D/g, ''),\n          addressLine: input.addressLine.trim(),\n          neighborhood: input.neighborhood.trim(),\n          addressNumber: input.addressNumber.trim(),\n          addressComplement: input.addressComplement?.trim() || undefined,\n          profilePhotoUrl: input.profilePhotoUrl.trim(),`);

assertHas(gate, `zipCode: regCep.replace(/\\D/g, '')`);
assertHas(gate, 'Rua / Logradouro');
assertHas(gate, 'Bairro');
assertHas(gate, 'Complemento');
assertHas(routers, 'addressLine: z.string().trim().min(2, "Rua obrigatória")');
assertHas(routers, `zipCode: input.zipCode.replace(/\\D/g, '')`);

console.log('PR #38 new registration now requires complete canonical address.');
