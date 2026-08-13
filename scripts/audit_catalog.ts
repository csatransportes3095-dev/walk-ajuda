import fs from 'node:fs';

const endpoint = 'https://h2colombiano.com/api/trpc/products.listActive?batch=1&input=' + encodeURIComponent(JSON.stringify({ 0: { json: null } }));

const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
const payload = await response.json();
const products = payload?.[0]?.result?.data?.json ?? [];

const summary = products.map((product: any) => ({
  productId: product.id,
  produto: product.name,
  ativo: product.isActive === 1,
  precoNoProduto: product.price ?? null,
  descricao: product.description ?? null,
  opcoes: (product.options ?? []).map((option: any) => ({
    optionId: option.id,
    opcao: option.label,
    tipo: option.type ?? null,
    ativo: option.isActive === 1,
    preco: option.price,
    precoOriginal: option.originalPrice || null,
    perguntas: (option.questions ?? []).map((question: any) => ({
      questionId: question.id,
      pergunta: question.question,
      obrigatoria: question.isRequired === 1,
      tipo: question.fieldType,
    })),
    documentos: (option.documents ?? []).map((document: any) => ({
      documentId: document.id,
      documento: document.label,
      origem: document.inputSource ?? null,
    })),
    garantias: (option.warrantyTiers ?? []).map((tier: any) => ({
      warrantyTierId: tier.id,
      rotulo: tier.warrantyLabel ?? tier.warrantyType,
      preco: tier.price,
    })),
  })),
}));

fs.mkdirSync('/home/ubuntu/walk-ajuda-production/reports', { recursive: true });
fs.writeFileSync('/home/ubuntu/walk-ajuda-production/reports/auditoria_catalogo_produtos.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ produtoCount: summary.length, optionCount: summary.reduce((count: number, product: any) => count + product.opcoes.length, 0) }, null, 2));
