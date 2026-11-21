/** Step-level navigation for ColombiaBot. A checkpoint must include the
 *  visible, unanswered interactive card. A pre-question checkpoint can only
 *  restore an empty chat, which was the cause of the black Back screen.
 */
const interactiveTypes = new Set([
  "options", "storefront-options", "storefront-guarantees", "input", "audio-input",
]);

export function captureColombiaBotChoice<M extends { id: string; type: string; answered?: boolean }>(
  messages: readonly M[],
  choiceMessageId: string,
): M[] | null {
  const choice = messages.find(message =>
    message.id === choiceMessageId
    && interactiveTypes.has(message.type)
    && message.answered === false,
  );
  if (!choice) return null;
  // Each message is copied: later answered=true cannot mutate this snapshot.
  return messages.map(message => ({ ...message }));
}
