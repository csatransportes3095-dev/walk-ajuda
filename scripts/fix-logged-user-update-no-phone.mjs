import fs from 'node:fs';

function replaceOnce(path, from, to, label) {
  const s = fs.readFileSync(path, 'utf8');
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  fs.writeFileSync(path, s.replace(from, to));
}

replaceOnce(
  'client/src/components/PasswordGate.tsx',
`        if (cpwdCheckSessionQuery.data.profileUpdateRequired) {\n          setAccessGranted(false);\n          if (phone) localStorage.setItem('customer_update_phone_hint', phone);\n          if (window.location.pathname !== '/atualizarcadastro') navigate('/atualizarcadastro');\n          return;\n        }`,
`        if (cpwdCheckSessionQuery.data.profileUpdateRequired) {\n          setAccessGranted(false);\n          const authenticatedToken = cpToken || localStorage.getItem(CP_TOKEN_KEY) || '';\n          if (authenticatedToken) localStorage.setItem('customer_update_token', authenticatedToken);\n          if (phone) localStorage.setItem('customer_update_phone_hint', phone);\n          if (window.location.pathname !== '/atualizarcadastro') navigate('/atualizarcadastro');\n          return;\n        }`,
  'handoff da sessao validada',
);

replaceOnce(
  'client/src/pages/AtualizarCadastro.tsx',
`  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");`,
`  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || localStorage.getItem("cp_token") || "");`,
  'reaproveitar cp_token quando cliente ja esta logado',
);

replaceOnce(
  'client/src/pages/AtualizarCadastro.tsx',
`              <PrimaryButton busy={busy}>CONTINUAR</PrimaryButton>`,
`              <PrimaryButton busy={busy}>CONTINUAR</PrimaryButton>\n              <button type="button" onClick={exitUpdate} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-400 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200">SAIR / VOLTAR AO INÍCIO</button>`,
  'saida tambem na tela de telefone',
);

replaceOnce(
  'client/src/pages/AtualizarCadastro.tsx',
`<p className="font-black">Atualização cadastral obrigatória pelo administrador.</p>`,
`<p className="font-black">Complete os dados obrigatórios que estão faltando.</p>`,
  'remover texto da regra manual do adm',
);

console.log('Fluxo corrigido: cliente logado abre atualizacao direto, sem pedir telefone novamente, com opcao de sair.');
