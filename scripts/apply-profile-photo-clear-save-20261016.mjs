import fs from 'node:fs';

const file = 'client/src/pages/AdminCustomers.tsx';
let source = fs.readFileSync(file, 'utf8');
function once(before, after, label) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one target, got ${count}`);
  source = source.replace(before, after);
}
const helperImport = 'import { createCustomerSaveGate, reconcileConfirmedProfilePhoto, replaceConfirmedProfilePhoto } from "@/lib/confirmedProfilePhotoSave";';
if (!source.includes(helperImport)) source = helperImport + '\n' + source;
once('  const profilePhotoUtils = trpc.useUtils();', '  const profilePhotoUtils = trpc.useUtils();\n  const [customerSaveGate] = useState(createCustomerSaveGate);', 'save gate');
once(`  const updateMut = trpc.customers.update.useMutation({
    onSuccess: () => { customersQuery.refetch(); toast.success("Cliente atualizado!"); setEditingId(null); },
    onError: (error) => toast.error(error.message || "Erro ao atualizar cliente"),
  });`, `  const updateMut = trpc.customers.update.useMutation({
    onSuccess: async (saved, input) => {
      try {
        const photoChanged = await reconcileConfirmedProfilePhoto(input, saved, {
          cancelReads: async () => {
            await Promise.all([
              profilePhotoUtils.customers.list.cancel(),
              profilePhotoUtils.orderStatus.listOrders.cancel(),
            ]);
          },
          applyConfirmed: (id, url) => {
            profilePhotoUtils.customers.list.setData(undefined, previous => replaceConfirmedProfilePhoto(previous, id, url));
            setFailedProfilePhotoIds(previous => { const next = new Map(previous); next.delete(id); return next; });
            if (editingId === id) {
              setEditProfilePhotoUrl(url ?? "");
              setEditOriginal(previous => previous ? { ...previous, profilePhotoUrl: url ?? "" } : previous);
            }
          },
        });
        toast.success(photoChanged && !input.profilePhotoUrl?.trim()
          ? "Foto removida do cadastro. O cliente poderá enviar uma nova foto."
          : "Cliente atualizado!");
        setEditingId(current => current === input.id ? null : current);
        // The acknowledged photo is already visible. Refresh other computed fields separately.
        void Promise.allSettled([
          profilePhotoUtils.customers.invalidate(),
          profilePhotoUtils.orderStatus.listOrders.invalidate(),
        ]);
      } catch (error) {
        // Keep the draft/editor; never turn an unconfirmed response into a success toast.
        toast.error(error instanceof Error ? error.message : "Não foi possível confirmar o salvamento da foto.");
      }
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar cliente"),
    onSettled: () => { customerSaveGate.finish(); },
  });`, 'confirmed mutation callback');
once('  const startEdit = (c: Customer) => {', '  const startEdit = (c: Customer) => {\n    if (customerSaveGate.isBusy()) { toast.info("Aguarde a confirmação do salvamento em andamento."); return; }', 'avoid switching while saving');
for (const name of ['savePhoneEdit', 'saveEdit']) {
  once(`  const ${name} = () => {\n    if (!editingId) return;`, `  const ${name} = () => {\n    if (!editingId || customerSaveGate.isBusy()) return;\n    if (uploadingPhotoFor === editingId || uploadPhotoMut.isPending) { toast.info("Aguarde o envio da foto antes de salvar."); return; }`, `${name} pending guard`);
}
once('    updateMut.mutate({ id: editingId, phone: phoneDigits } as any);', '    if (!customerSaveGate.tryStart()) return;\n    updateMut.mutate({ id: editingId, phone: phoneDigits } as any);', 'phone same-tick guard');
once('    updateMut.mutate(payload as any);', '    if (!customerSaveGate.tryStart()) return;\n    updateMut.mutate(payload as any);', 'form same-tick guard');
once('  const handlePhotoUpload = (customer: Customer, file: File) => {', '  const handlePhotoUpload = (customer: Customer, file: File) => {\n    if (customerSaveGate.isBusy()) { toast.info("Aguarde o salvamento antes de enviar outra foto."); return; }', 'upload overlap guard');
once('                <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">', '                <fieldset disabled={updateMut.isPending} className="min-w-0 px-4 pb-4 space-y-2 border-t border-border/50 pt-3">', 'freeze submitted edit fields');
once(`                    <button onClick={saveEdit} disabled={updateMut.isPending} className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                      {updateMut.isPending ? "Salvando..." : "Salvar"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                  </div>
                </div>`, `                    <button type="button" onClick={saveEdit} disabled={updateMut.isPending} className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                      {updateMut.isPending ? "Salvando..." : "Salvar alterações"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                  </div>
                </fieldset>`, 'explicit full-form save');
fs.writeFileSync(file, source);
console.log('Scoped photo-removal confirmation, cache reconciliation and repeated-save guards applied.');
