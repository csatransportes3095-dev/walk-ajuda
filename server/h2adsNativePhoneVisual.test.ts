import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("H2ADS: native phone appearance on real Chrome window", () => {
  const runner = source("workers/windows/browser-session.mjs");
  const agent = source("workers/windows/H2AdsWorker.ps1");
  const route = source("server/h2adsWorkerRoute.ts");
  const native = source("workers/windows/h2ads-phone-window.ps1");
  const main = source("client/src/pages/H2Ads.tsx");
  const remote = source("client/src/pages/H2AdsMobileRemoteViewer.tsx");

  it("removes the fake preview from website and remote viewer", () => {
    expect(main).not.toContain("H2AdsPhoneFrame");
    expect(main).not.toContain("phonePreviewInstanceId");
    expect(remote).not.toContain("H2AdsPhoneFrame");
    expect(main).toContain("launchBrowser.mutateAsync({ instanceId })");
  });

  it("starts the native frame from the single existing Chrome launch used by panel and orders", () => {
    expect(runner).toContain("browser = spawn(executable");
    expect(runner).toContain('join(profileDirectory, "..", "..", "h2ads-phone-window.ps1")');
    expect(runner).toContain('"BrowserPid", String(browser.pid)');
    expect(runner).toContain('phoneWindowProcess = spawn("powershell.exe"');
    expect(runner).toContain("phoneWindowProcess?.kill()");
    expect(runner).toContain('const cachedScript = join(profileDirectory, "..", "..", "h2ads-phone-window.ps1")');
    expect(runner).toContain('h2ads-phone-window-${instanceId}.ps1');
    expect(runner).toContain('cache: "no-store"');
    expect(runner).not.toContain("if (!existsSync(script))");
    expect(runner).toContain("writeFileSync(currentVisualScript, contents");
    expect(runner).toContain("mobileRemoteRequested");
  });

  it("automatically downloads the optional native visual via the existing Worker", () => {
    expect(agent).toContain("/api/h2ads/worker/windows-phone-window.ps1");
    expect(agent).toContain("catch {");
    expect(route).toContain('app.get("/api/h2ads/worker/windows-phone-window.ps1"');
  });

  it("draws phone chrome around the REAL HWND, not another browser or website modal", () => {
    expect(native).toContain("GetWindowThreadProcessId");
    expect(native).toContain("Chrome_WidgetWin_");
    expect(native).toContain("MoveWindow");
    expect(native).toContain("SetWindowPos");
    expect(native).toContain("BrowserPid");
    expect(native).toContain("WinForms");
    expect(native).toContain("phone");
    expect(native).toContain("battery");
    expect(native).toContain("wifiOn");
    expect(native).toContain("footer");
    expect(native).not.toContain("Invoke-WebRequest");
    expect(native).not.toContain("proxy-server");
    expect(native).not.toContain("user-data-dir");
    expect(native).not.toContain("Chrome.exe");
    expect(native).not.toContain("Start-Process");
  });

  it("renders smartphone chassis and native corners without clipping real Chrome pixels", () => {
    expect(native).toContain("public sealed class H2PhoneDisplayForm");
    expect(native).toContain("Rounded(15f,67f");
    // Avoid DPI-virtualized hard region truncation at 175 percent scaling.
    expect(native).not.toContain("CreateRoundRectRgn");
    expect(native).toContain("DwmSetWindowAttribute");
    expect(native).toContain("SetWindowRgn(hwnd,IntPtr.Zero,true)");
    expect(native).not.toContain("function Set-PhoneCorners");
    expect(native).not.toContain("$frame.add_SizeChanged({Set-PhoneCorners");
    expect(native).toContain("H2PhoneDisplayForm.OnResize");
    expect(native).toContain("SetWindowRgn");
    expect(native).toContain("RoundChromeWindow");
    expect(native).toContain("IsZoomed");
    expect(native).toContain("RestoreChromeWindow");
    expect(native).toContain("VisualSelfTest");
    expect(native).toContain("DrawToBitmap");
    expect(native).toContain("ShowWithoutActivation");
    expect(native).not.toContain("Invoke-WebRequest");
    expect(native).not.toContain("Start-Process");
  });

  it("never changes the browser arguments, proxy chain or profile backend", () => {
    expect(runner).toContain('"--user-data-dir=" + profileDirectory');
    expect(runner).toContain('"--proxy-server=http://127.0.0.1:" + relayPort');
    expect(runner).toContain('"--proxy-bypass-list=<-loopback>"');
    expect(runner).toContain("await syncPanelOpening(initial.observedIp)");
    expect(runner).toContain("void verifyChromeProxyAfterLaunch(executable");
  });
});
