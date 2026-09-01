import fs from 'node:fs';

for (const path of ['client/src/pages/GastosPage.tsx', 'client/src/pages/EmprestimoPage.tsx']) {
  let src = fs.readFileSync(path, 'utf8');
  const oldLine = `  const [isLoading, setIsLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY));`;
  const newLine = `  const [isLoading, setIsLoading] = useState<boolean>(() => !!(localStorage.getItem(TOKEN_KEY) || localStorage.getItem('cp_token')));`;
  if (!src.includes(oldLine)) throw new Error(`hydration anchor missing: ${path}`);
  src = src.replace(oldLine, newLine);
  fs.writeFileSync(path, src);
}

const testPath = 'server/customerSessionRefreshRegression.test.ts';
let test = fs.readFileSync(testPath, 'utf8');
const anchor = `    expect(emprestimo).toContain("localStorage.getItem('cp_token')");\n    expect(entry).toContain("localStorage.getItem('cp_token')");`;
const replacement = `    expect(emprestimo).toContain("localStorage.getItem('cp_token')");\n    expect(entry).toContain("localStorage.getItem('cp_token')");\n    expect(gastos).toContain("!!(localStorage.getItem(TOKEN_KEY) || localStorage.getItem('cp_token'))");\n    expect(emprestimo).toContain("!!(localStorage.getItem(TOKEN_KEY) || localStorage.getItem('cp_token'))");`;
if (!test.includes(anchor)) throw new Error('regression test anchor missing');
test = test.replace(anchor, replacement);
fs.writeFileSync(testPath, test);
console.log('unified session hydration finalized');
