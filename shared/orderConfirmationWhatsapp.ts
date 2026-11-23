/**
 * Mensagem do botão WHATSAPP em CONFIRMAÇÃO DO PEDIDO.
 * A configuração é global, independente do PEDIDO ENTREGUE e das orientações da página.
 * Enter e linhas em branco são preservados integralmente.
 */
export const DEFAULT_ORDER_CONFIRMATION_WHATSAPP_TEMPLATE =
  "Olá {nome}! Confira as orientações da confirmação do seu pedido, com fotos, textos e vídeos: {link}";

export function renderOrderConfirmationWhatsappMessage(
  template: string,
  customerName: string | null | undefined,
  link: string,
): string {
  const name = String(customerName || "").replace(/\s+/g, " ").trim() || "cliente";
  return template.replace(/\{nome\}/g, name).replace(/\{link\}/g, link);
}
