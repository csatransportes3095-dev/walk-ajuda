import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: nenhuma alteracao aplicada`);
  fs.writeFileSync(path, after);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  return source.replace(from, to);
}

edit('client/src/components/PasswordGate.tsx', (source) => {
  source = replaceOnce(
    source,
    `        if (result.profileUpdateRequired) {\n          localStorage.setItem('customer_update_phone_hint', getCanonicalPhone());\n          setAccessGranted(false);\n          toast.info("Atualização cadastral obrigatória pelo administrador.");\n          navigate('/atualizarcadastro');\n          return;\n        }`,
    `        if (result.profileUpdateRequired) {\n          // O login principal ja autenticou o cliente. Reaproveita a mesma sessao\n          // na tela de atualizacao para nao pedir telefone/senha novamente.\n          localStorage.setItem('customer_update_token', result.token);\n          localStorage.setItem('customer_update_phone_hint', getCanonicalPhone());\n          setAccessGranted(false);\n          toast.info("Complete os dados pendentes para continuar.");\n          navigate('/atualizarcadastro');\n          return;\n        }`,
    'handoff apos login com senha',
  );

  source = replaceOnce(
    source,
    `          if (profileUpdateRequiredAfterPasswordSetup) {\n            setAccessGranted(false);\n            toast.info("Atualização cadastral obrigatória pelo administrador.");\n            navigate('/atualizarcadastro');\n            return;\n          }`,
    `          if (profileUpdateRequiredAfterPasswordSetup) {\n            // A senha acabou de ser criada/autenticada; a atualizacao recebe\n            // diretamente essa sessao e abre o formulario sem nova identificacao.\n            localStorage.setItem('customer_update_token', result.token);\n            localStorage.setItem('customer_update_phone_hint', getCanonicalPhone());\n            setAccessGranted(false);\n            toast.info("Complete os dados pendentes para continuar.");\n            navigate('/atualizarcadastro');\n            return;\n          }`,
    'handoff apos criacao de senha',
  );

  return source;
});

edit('client/src/pages/AtualizarCadastro.tsx', (source) => {
  source = replaceOnce(
    source,
    `  function restart() {\n    localStorage.removeItem(TOKEN_KEY);\n    setToken("");\n    setPhone("");\n    setPassword("");\n    setStep("phone");\n  }`,
    `  function exitUpdate() {\n    // Cliente optou por nao atualizar agora: encerra a identificacao atual\n    // e volta para a tela inicial sem manter uma sessao de cliente ativa.\n    const keys = [\n      TOKEN_KEY,\n      "cp_token",\n      "walk_access_granted",\n      "walk_access_code",\n      "walk_access_type",\n      "walk_access_expires",\n      "walk_client_phone",\n      "customer_update_phone_hint",\n    ];\n    for (const key of keys) localStorage.removeItem(key);\n    sessionStorage.removeItem("walk_welcome_choice");\n    sessionStorage.removeItem("walk_home_existing_phone");\n    setToken("");\n    window.location.replace("/");\n  }`,
    'trocar restart por sair',
  );

  source = replaceOnce(
    source,
    `<div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Complete seus dados</h2><p className="text-xs text-slate-400">Telefone confirmado: {formatPhone(profileQuery.data.phone)}</p></div><button type="button" onClick={restart} className="text-xs font-bold text-violet-300">Trocar telefone</button></div>`,
    `<div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Complete seus dados</h2><p className="text-xs text-slate-400">Telefone confirmado: {formatPhone(profileQuery.data.phone)}</p></div><button type="button" onClick={exitUpdate} className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-200 hover:bg-red-500/20">SAIR</button></div>`,
    'botao sair no formulario',
  );

  source = replaceOnce(
    source,
    `<PrimaryButton busy={saveMutation.isPending || uploadPhotoMutation.isPending}>SALVAR EM TODO O SISTEMA</PrimaryButton>`,
    `<PrimaryButton busy={saveMutation.isPending || uploadPhotoMutation.isPending}>SALVAR EM TODO O SISTEMA</PrimaryButton>\n              <button type="button" onClick={exitUpdate} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-400 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200">NÃO QUERO ATUALIZAR AGORA · SAIR</button>`,
    'segundo botao sair',
  );

  return source;
});

console.log('Fluxo corrigido: login entrega sessao diretamente ao formulario de atualizacao e cliente pode sair.');
