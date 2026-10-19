import {
  getAppointmentByOrder, getCurrentSubOrderStatusSnapshot, getStatusLabelFromDb,
  isScheduleClosedByOrderStatus, completeOpenAppointmentsForOrder,
} from './db';
import { ensureActiveAutomaticScheduleForAnalysis } from './autoSchedule';
import { isAnalysisOrderStatusSemantic } from '../shared/scheduleOrderLifecycle';

/** A confirmation preceding the persisted return to analysis belongs to the old cycle. */
export function confirmationPredatesAnalysis(
  appointment: { status: string; confirmedAt?: unknown; createdAt?: unknown } | null,
  statusCreatedAt: unknown,
): boolean {
  if (appointment?.status !== 'confirmed') return false;
  const confirmedAt = new Date(String(appointment.confirmedAt ?? appointment.createdAt ?? '')).getTime();
  const changedAt = new Date(String(statusCreatedAt ?? '')).getTime();
  return Number.isFinite(confirmedAt) && Number.isFinite(changedAt) && changedAt > confirmedAt;
}

/**
 * Admin read repair is scoped to the exact registration/sub-order and reads the
 * persisted status; a cached status sent by the browser can never create a link.
 * No customer email is sent by reads. Checkout keeps its existing entry point.
 */
export async function reconcileAnalysisScheduleForOrder(registrationId: number, subOrderIndex: number) {
  const snapshot = await getCurrentSubOrderStatusSnapshot(registrationId, subOrderIndex);
  let appointment = await getAppointmentByOrder(registrationId, subOrderIndex);
  const statusKey = snapshot?.status ?? '';
  const statusLabel = statusKey ? await getStatusLabelFromDb(statusKey) : '';
  const isAnalysis = isAnalysisOrderStatusSemantic(statusKey, statusLabel);
  let closedByOrder = false;

  if (snapshot && isAnalysis) {
    await ensureActiveAutomaticScheduleForAnalysis({
      registrationId,
      subOrderIndex,
      customerPhone: snapshot.customerPhone,
      serviceName: snapshot.serviceName,
      serviceOption: snapshot.serviceOption,
      forceNewOnReturn: confirmationPredatesAnalysis(appointment, snapshot.createdAt),
      notifyCustomer: false,
    });
    appointment = await getAppointmentByOrder(registrationId, subOrderIndex);
    if (!appointment || !['pending', 'confirmed'].includes(appointment.status)) {
      throw new Error('Pedido em analise sem agendamento ativo. Nao foi possivel gerar o link.');
    }
  } else if (snapshot) {
    closedByOrder = await isScheduleClosedByOrderStatus({
      registrationId, orderNumber: snapshot.orderNumber,
      statusKey, statusLabel,
    });
    if (closedByOrder && appointment && ['pending', 'confirmed'].includes(appointment.status)) {
      await completeOpenAppointmentsForOrder(registrationId, subOrderIndex, snapshot.customerPhone, false);
      appointment = await getAppointmentByOrder(registrationId, subOrderIndex);
    }
  }

  return { appointment, snapshot, statusKey, statusLabel, isAnalysis, closedByOrder };
}
