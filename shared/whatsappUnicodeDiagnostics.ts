export type UnicodeTextSnapshot = {
  value: string;
  json: string;
  utf16Length: number;
  codePoints: string[];
  utf8BytesHex: string;
  hasReplacementCharacter: boolean;
};

export function snapshotUnicodeText(value: string): UnicodeTextSnapshot {
  const text = String(value);
  const utf8Bytes = new TextEncoder().encode(text);

  return {
    value: text,
    json: JSON.stringify(text),
    utf16Length: text.length,
    codePoints: Array.from(text, character => `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`),
    utf8BytesHex: Array.from(utf8Bytes, byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" "),
    hasReplacementCharacter: text.includes("\uFFFD"),
  };
}

export function createWhatsappMessageUrl(phone: string, message: string): string {
  const digits = String(phone).replace(/\D/g, "");
  const url = new URL(`https://wa.me/${digits}`);
  url.searchParams.set("text", message);
  return url.toString();
}

export function readWhatsappMessageFromUrl(urlValue: string): string {
  return new URL(urlValue).searchParams.get("text") ?? "";
}
