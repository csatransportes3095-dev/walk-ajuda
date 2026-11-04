import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("H2ADS: moldura visual isolada", () => {
  const shell = read("client/src/components/H2AdsPhoneFrame.tsx");
  const desktop = read("client/src/pages/H2Ads.tsx");
  const remote = read("client/src/pages/H2AdsMobileRemoteViewer.tsx");

  it("possui ícones de bateria, sinal, Wi-Fi e navegação apenas ilustrativos", () => {
    expect(shell).toContain("BatteryFull");
    expect(shell).toContain("Signal");
    expect(shell).toContain("WifiOff");
    expect(shell).toContain('aria-label="Bateria ilustrativa"');
    expect(shell).toContain("Barra de navegação ilustrativa; não envia comandos");
    expect(shell).toContain("Somente visual");
    expect(shell).not.toContain("trpc.");
    expect(shell).not.toContain("fetch(");
    expect(shell).not.toContain("onPointerUp");
  });

  it("abre prévia ao usar o comando existente, sem substituir launchBrowser ou proxy", () => {
    expect(desktop).toContain("await launchBrowser.mutateAsync({ instanceId });");
    expect(desktop).toContain("setPhonePreviewInstanceId(instanceId);");
    expect(desktop).toContain("<H2AdsPhoneFrame title={instance.name}>");
    expect(desktop).toContain("await prepareBrowser.mutateAsync({ instanceId });");
    expect(desktop).toContain("await closeBrowser.mutateAsync({ instanceId });");
    expect(desktop).toContain("await rotateProxyAuto.mutateAsync({ instanceId });");
  });

  it("mantém a imagem remota e os gestos dentro da moldura", () => {
    expect(remote).toContain('mode="remote"');
    expect(remote).toContain("src={frameData.image}");
    expect(remote).toContain("onPointerDown={pointerDown}");
    expect(remote).toContain("onPointerUp={pointerUp}");
    expect(remote).toContain('mobileRemoteInput.useMutation()');
    expect(remote).toContain('mobileRemoteFrame.useMutation()');
    expect(remote).toContain('mobileRemoteSelectTab.useMutation()');
  });
});
