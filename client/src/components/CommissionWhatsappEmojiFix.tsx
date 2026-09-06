// O fluxo de Comissões agora usa a mesma correção central de texto final usada
// por Pedidos/Status, aplicada imediatamente antes de gerar a URL wa.me.
//
// Este componente antigo interceptava window.open e links <a> globalmente e
// criava uma segunda etapa de codificação. Ele fica intencionalmente inativo
// para não alterar novamente uma mensagem que já foi reparada na fonte.
export default function CommissionWhatsappEmojiFix() {
  return null;
}
