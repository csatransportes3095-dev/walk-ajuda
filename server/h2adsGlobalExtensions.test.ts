import { describe, expect, it } from "vitest";
import { parseH2AdsExtensionUrl } from "./h2adsGlobalExtensions";

describe("H2ADS global extensions URL contract", () => {
  const id = "aabcgdmkeabbnleenpncegpcngjpnjkc";
  it("accepts the Chrome Web Store extension URL", () => {
    expect(parseH2AdsExtensionUrl("https://chromewebstore.google.com/detail/easy-auto-refresh/" + id)).toBe(id);
  });
  it("rejects arbitrary hosts and insecure protocols", () => {
    expect(() => parseH2AdsExtensionUrl("https://chromewebstore.google.com.evil.example/detail/test/" + id)).toThrow();
    expect(() => parseH2AdsExtensionUrl("http://chromewebstore.google.com/detail/test/" + id)).toThrow();
    expect(() => parseH2AdsExtensionUrl("https://evil.example/detail/test/" + id)).toThrow();
  });
  it("rejects malformed extension identifiers or non-detail links", () => {
    expect(() => parseH2AdsExtensionUrl("https://chromewebstore.google.com/detail/test/invalid")).toThrow();
    expect(() => parseH2AdsExtensionUrl("https://chromewebstore.google.com/search/" + id)).toThrow();
  });
});
