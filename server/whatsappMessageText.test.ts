import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodeWhatsappMessage,
  prepareWhatsappMessage,
  repairCommissionWhatsappMessage,
  repairWhatsappReplacementIcons,
  WHATSAPP_ICON,
} from "../shared/whatsappMessageText";

const projectRoot = path.resolve(import.meta.dirname, "..");

function collectSourceFiles(root: string): string[] {
  const output: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue;
    output.push(full);
  }
  return output;
}

describe("mensagens WhatsApp", () => {
  it("recupera marcadores operacionais conhecidos que chegaram como U+FFFD", () => {
    const legacyText = [
      "\uFFFD SEUS DADOS DE ACESSO ESTÃO PRONTOS!",
      "\uFFFD IMPORTANTE",
      "\uFFFD VÍDEO — COMO ENTRAR NA SUA CONTA",
      "\uFFFD Não tente acessar diretamente pelo aplicativo.",
      "\uFFFD SORTEIO H2 COLOMBIANO — LISTA ATUALIZADA",
      "\uFFFD TODOS OS ESCOLHIDOS",
      "\uFFFD RESUMO",
      "\uFFFD Pagos: 2",
      "\uFFFD Aguardando: 1",
      "\uFFFD Disponíveis: 97",
    ].join("\n");

    const repaired = repairWhatsappReplacementIcons(legacyText);
    expect(repaired).toContain(WHATSAPP_ICON.lock);
    expect(repaired).toContain(WHATSAPP_ICON.warning);
    expect(repaired).toContain(WHATSAPP_ICON.video);
    expect(repaired).toContain(WHATSAPP_ICON.ticket);
    expect(repaired).toContain(WHATSAPP_ICON.clipboard);
    expect(repaired).toContain(WHATSAPP_ICON.chart);
    expect(repaired).toContain(WHATSAPP_ICON.paid);
    expect(repaired).toContain(WHATSAPP_ICON.pending);
    expect(repaired).toContain(WHATSAPP_ICON.numbers);
  });

  it("preserva emojis válidos e codifica UTF-8 sem U+FFFD", () => {
    const encoded = encodeWhatsappMessage(`${WHATSAPP_ICON.paid} PAGO ${WHATSAPP_ICON.party}`);
    expect(encoded).toContain("%E2%9C%85");
    expect(encoded).toContain("%F0%9F%8E%89");
    expect(encoded).not.toContain("%EF%BF%BD");
  });

  it("remove U+FFFD residual antes de montar o wa.me", () => {
    expect(prepareWhatsappMessage("Teste \uFFFD desconhecido")).toBe("Teste  desconhecido");
    expect(encodeWhatsappMessage("Teste \uFFFD desconhecido")).not.toContain("%EF%BF%BD");
  });

  it("mantém compatibilidade do fluxo de comissão", () => {
    const text = repairCommissionWhatsappMessage("\uFFFD *INDICAÇÃO CONFIRMADA*\n\uFFFD *Valor da comissão:* R$ 10,00");
    expect(text).toContain(WHATSAPP_ICON.party);
    expect(text).toContain(WHATSAPP_ICON.money);
    expect(text).not.toContain("\uFFFD");
  });

  it("proíbe encodeURIComponent direto em links de mensagem do WhatsApp", () => {
    const roots = [
      path.join(projectRoot, "client", "src"),
      path.join(projectRoot, "server"),
    ];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of collectSourceFiles(root)) {
        const source = fs.readFileSync(file, "utf8");
        if (!source.includes("wa.me")) continue;
        if (source.includes("?text=${encodeURIComponent")) {
          offenders.push(path.relative(projectRoot, file) + ": ?text encodeURIComponent");
        }
        if (/const\s+(msg|encodedMsg)\s*=\s*encodeURIComponent\(/.test(source)) {
          offenders.push(path.relative(projectRoot, file) + ": mensagem pré-codificada com encodeURIComponent");
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("mantém a correção específica do painel de comissões ligada ao codificador central", () => {
    const source = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminCommissions.tsx"), "utf8");
    expect(source).toContain('encodeWhatsappMessage(repairCommissionWhatsappMessage(msg))');
    expect(source).toContain('encodeWhatsappMessage(repairCommissionWhatsappMessage(msgPix))');
  });
});
