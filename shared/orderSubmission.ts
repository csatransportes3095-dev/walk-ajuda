export type OrderSubmissionResult = {
  success?: boolean;
  registrationId?: number | null;
};

/**
 * A resposta só representa um pedido persistido quando existe um registrationId
 * positivo. `success=true` isolado não é suficiente para alimentar os cards do ADM.
 */
export function isPersistedOrderResult(result: OrderSubmissionResult | null | undefined): boolean {
  if (result?.success !== true) return false;
  const registrationId = Number(result.registrationId);
  return Number.isInteger(registrationId) && registrationId > 0;
}
