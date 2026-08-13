import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync('/home/ubuntu/walk-ajuda-production/reports/auditoria_catalogo_produtos.json', 'utf8'));
const lines: string[] = ['# Matriz de auditoria do catálogo H2', '', `Produtos ativos: **${catalog.length}**`, `Opções ativas: **${catalog.reduce((total: number, product: any) => total + product.opcoes.length, 0)}**`, '', '| Produto | Product ID | Opção | Option ID | Preço | Perguntas | Documentos |', '|---|---:|---|---:|---:|---:|---:|'];
for (const product of catalog) {
  for (const option of product.opcoes) {
    lines.push(`| ${product.produto} | ${product.productId} | ${option.opcao.trim()} | ${option.optionId} | R$ ${option.preco} | ${option.perguntas.length} | ${option.documentos.length} |`);
  }
}
lines.push('', '## Regras observadas', '', '- Cada opção guarda seu próprio `optionId`, preço, questionário, documentos e garantias.', '- A vitrine atual usa o `productId` no produto e chama o fluxo original por `handleOptionSelection(option)`.', '- O checkout e a criação de pedido recebem o produto selecionado e a opção selecionada, sem depender do visual do card.');
fs.writeFileSync('/home/ubuntu/walk-ajuda-production/reports/auditoria_catalogo_resumo.md', lines.join('\n') + '\n');
console.log(lines.slice(0, 8).join('\n'));
