/**
 * Preserve authenticated mailbox address while showing a recognizable From name
 * on H2 transaction emails. Do not change SMTP envelope or OTP semantics.
 */
export function h2MailFrom(configuredSender: string): string {
  const sender = configuredSender.trim();
  if (!sender || /[\r\n]/.test(sender)) throw new Error("INVALID_MAIL_FROM");
  // Respect existing configured display names, avoiding nested From headers.
  if (/^.+\s*<[^<>@\s]+@[^<>@\s]+>$/.test(sender)) return sender;
  if (!/^[^<>@\s]+@[^<>@\s]+$/.test(sender)) throw new Error("INVALID_MAIL_FROM");
  return "H2 Colombiano <" + sender + ">";
}
