import fs from 'node:fs';

const path = 'vite.config.ts';
let source = fs.readFileSync(path, 'utf8');

if (source.includes('ascii_only: true')) {
  console.log('[vite-ascii] ascii_only já configurado.');
  process.exit(0);
}

const anchor = `      format: {\n        comments: false, // Remover comentários\n      },`;
const replacement = `      format: {\n        comments: false, // Remover comentários\n        // Força o bundle final a usar escapes ASCII (\\uXXXX) para caracteres\n        // Unicode. Evita que emojis de mensagens WhatsApp virem \uFFFD (�)\n        // em qualquer etapa entre minificação, entrega do JS e abertura do app.\n        ascii_only: true,\n      },`;

if (!source.includes(anchor)) {
  throw new Error('[vite-ascii] bloco terserOptions.format não encontrado; build interrompido para não publicar sem a correção.');
}

source = source.replace(anchor, replacement);
fs.writeFileSync(path, source, 'utf8');
console.log('[vite-ascii] ascii_only ativado no Terser para o build de produção.');
