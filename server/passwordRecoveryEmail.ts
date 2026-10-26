/** Compatibility entry point; password recovery uses the existing official H2 code generator and delivery. */
import { deliverOwnSiteCode } from "./siteAccessCodeDelivery";
export async function sendPasswordRecoveryEmail(email: string, code: string): Promise<void> {
  await deliverOwnSiteCode(email, code, "password-recovery");
}
