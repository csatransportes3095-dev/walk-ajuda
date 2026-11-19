import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { checkCpfVault, checkCpfVaultBatch, listCpfVault, saveCpfVault, saveCpfVaultBatch } from "../cpfVault";
import { CPF_VAULT_TEXT_LIMIT } from "../../shared/cpfVault";

const cpf = z.string().trim().min(1).max(64);
const note = z.string().trim().max(1000).optional();
const text = z.string().trim().min(1).max(CPF_VAULT_TEXT_LIMIT);
const orderFields = {
  registrationId: z.number().int().positive().optional(),
  subOrderIndex: z.number().int().min(0).max(100_000).optional(),
  expectedOrderNumber: z.number().int().positive().optional(),
  expectedOrderRootId: z.number().int().positive().optional(),
};
const validOrderScope = (input: { registrationId?: number; subOrderIndex?: number; expectedOrderNumber?: number; expectedOrderRootId?: number }) =>
  input.registrationId !== undefined || (input.subOrderIndex === undefined && input.expectedOrderNumber === undefined && input.expectedOrderRootId === undefined);

/** No public lookup, deletion, reassignment or release: registration means permanently used. */
export const cpfVaultRouter = router({
  check: adminProcedure.input(z.object({ cpf }).strict()).query(({ input }) => checkCpfVault(input)),
  save: adminProcedure.input(z.object({ cpf, note, ...orderFields }).strict()
    .refine(validOrderScope, "Informe o pedido para vincular o CPF.")
    .refine(input => input.registrationId === undefined || input.expectedOrderRootId !== undefined,
      "A identidade deste pedido não foi confirmada. Atualize a lista e abra o cofre novamente."))
    .mutation(({ input }) => saveCpfVault(input)),
  checkBatch: adminProcedure.input(z.object({ text }).strict()).mutation(({ input }) => checkCpfVaultBatch(input)),
  saveBatch: adminProcedure.input(z.object({ text, note }).strict()).mutation(({ input }) => saveCpfVaultBatch(input)),
  list: adminProcedure.input(z.object({
    query: z.string().trim().max(120).optional(), limit: z.number().int().min(1).max(100).optional(),
    cursor: z.number().int().positive().optional(), ...orderFields,
  }).strict().refine(validOrderScope, "Informe o pedido para consultar este vínculo."))
    .query(({ input }) => listCpfVault(input)),
});
