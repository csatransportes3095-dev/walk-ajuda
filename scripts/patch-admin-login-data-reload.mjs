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

const referrerLookupAnchor = `function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className="text-foreground flex-1 truncate">{value}</span>
    </div>
  );
}
`;

const referrerLookupComponent = `
function ReferrerLookup({ phone, onNameFound }: { phone: string; onNameFound: (name: string) => void }) {
  const cleanPhone = phone.replace(/\\D/g, '');
  const lookupQuery = trpc.orderStatus.lookupReferrerByPhone.useQuery(
    { phone: cleanPhone },
    { enabled: cleanPhone.length >= 10, staleTime: 0 }
  );

  useEffect(() => {
    if (lookupQuery.data?.found && lookupQuery.data.name) {
      onNameFound(lookupQuery.data.name);
    }
  }, [lookupQuery.data?.found, lookupQuery.data?.name]);

  if (cleanPhone.length < 10) return null;
  if (lookupQuery.isLoading) return <span className="text-xs text-muted-foreground block">Buscando indicador...</span>;
  if (lookupQuery.data?.found) return <span className="text-xs text-green-400 block">Indicador: {lookupQuery.data.name}</span>;
  if (lookupQuery.data && !lookupQuery.data.found) return <span className="text-xs text-yellow-400 block">Indicador não encontrado no sistema</span>;
  return null;
}
`;

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

if (!next.includes('function ReferrerLookup(')) {
  if (!next.includes(referrerLookupAnchor)) {
    throw new Error('Âncora InfoRow não encontrada; patch ReferrerLookup abortado.');
  }
  next = next.replace(referrerLookupAnchor, `${referrerLookupAnchor}${referrerLookupComponent}`);
}

fs.writeFileSync(file, next);
console.log('[patch-admin-login-data-reload] correções aplicadas.');
