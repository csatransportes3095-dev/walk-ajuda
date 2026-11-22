/**
 * Mensagem global do botão WHATSAPP em PEDIDO ENTREGUE.
 * Apenas {nome} e {link} são campos dinâmicos; as quebras de linha são mantidas.
 */
export const DEFAULT_DELIVERED_ORDER_WHATSAPP_TEMPLATE = [
  "⚡ *H2 COLOMBIANO* 🇨🇴",
  "",
  "👋 Olá, *{nome}*!",
  "",
  "✅ *SEU PEDIDO FOI ENTREGUE!*",
  "",
  "📲 As orientações para acessar e utilizar sua conta estão disponíveis.",
  "",
  "📌 *LEIA COM ATENÇÃO*",
  "Siga as instruções da página antes de começar.",
  "",
  "🔗 *ACESSAR ORIENTAÇÕES*",
  "{link}",
  "",
  "⚠️ Respeite todas as recomendações para evitar problemas com a conta.",
].join("\n");

export function renderDeliveredOrderWhatsappMessage(
  template: string,
  customerName: string | null | undefined,
  link: string,
): string {
  const name = String(customerName || "").replace(/\s+/g, " ").trim() || "cliente";
  return template.replace(/\{nome\}/g, name).replace(/\{link\}/g, link);
}
