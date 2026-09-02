import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'client/src/pages/AdminOrders.tsx');
const source = fs.readFileSync(file, 'utf8');

const loginBefore = `  const loginDataQuery = trpc.loginData.get.useQuery(
    { registrationId: expandedNumericId },
    { enabled: expandedId !== null && activeTab[expandedId!] === "status" }
  );`;

const loginAfter = `  const isExpandedStatusTab = expandedId !== null && (!activeTab[expandedId] || activeTab[expandedId] === "status");

  const loginDataQuery = trpc.loginData.get.useQuery(
    { registrationId: expandedNumericId },
    { enabled: isExpandedStatusTab, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );`;

const pinBefore = `  const customerPinQuery = trpc.customerPin.adminGet.useQuery(
    { phone: expandedPhone },
    { enabled: !!expandedPhone && expandedId !== null && activeTab[expandedId!] === "status" }
  );`;

const pinAfter = `  const customerPinQuery = trpc.customerPin.adminGet.useQuery(
    { phone: expandedPhone },
    { enabled: !!expandedPhone && isExpandedStatusTab, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );`;

let next = source;

if (next.includes(loginBefore)) {
  next = next.replace(loginBefore, loginAfter);
} else if (!next.includes('const isExpandedStatusTab = expandedId !== null')) {
  throw new Error('Trecho loginData esperado não encontrado; patch abortado.');
}

if (next.includes(pinBefore)) {
  next = next.replace(pinBefore, pinAfter);
} else if (!next.includes('{ enabled: !!expandedPhone && isExpandedStatusTab')) {
  throw new Error('Trecho customerPin esperado não encontrado; patch abortado.');
}

fs.writeFileSync(file, next);
console.log('[patch-admin-login-data-reload] correção aplicada.');
