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
    expect(runner).toContain('"-BrowserPid", String(pid)');
    expect(runner).toContain('"-InstanceId", String(instanceId)');
    expect(runner).toContain("contents.length <= 45000");
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
    expect(native).toContain("SetPhoneGroup");
    expect(native).toContain("FitHostedChrome");
    expect(native).toContain("GetWindowRect(frame,out frameRect)");
    expect(native).toContain("SetThreadDpiAwarenessContext");
    expect(native).toContain("SWP_FRAMECHANGED");
    expect(native).toContain("$newFrameX=$frame.Left");
    expect(native).not.toContain("$syncFrameX=$r.Left-$bezel");
    expect(native).not.toContain("$newFrameX=$current.Left-$bezel");
    expect(native).toContain("HostChrome");
    expect(native).toContain("GWLP_HWNDPARENT");
    expect(native).toContain("WS_POPUP");
    expect(native).not.toContain("SetParent(");
    expect(native).not.toContain("AttachThreadInput(");
    expect(native).toContain("DetachChromeVisual");
    expect(native).toContain("WS_CHILD");
    expect(native).toContain("$frame.CreateControl()");
    expect(native).toContain("failed to host Chrome HWND inside phone");
    expect(native).toContain("SetPhoneGroup($chrome,$frame.Handle");
    expect(native).toContain("SWP_NOSENDCHANGING");
    expect(native).toContain("BrowserPid");
    expect(native).toContain("WinForms");
    expect(native).toContain("phone");
    expect(native).toContain("battery");
    expect(native).toContain("wifiOn");
    expect(native).toContain('DrawString("5G"');
    expect(native).toContain("Set-RoundedPanelRegion");
    expect(native).toContain("Set-PhoneChromeSize");
    expect(native).toContain("add_MouseDown");
    expect(native).toContain("add_MouseMove");
    expect(native).toContain("add_MouseUp");
    expect(native).not.toContain("New-Object System.Windows.Forms.Button");
    expect(native).toContain("footer");
    expect(native).not.toContain("Invoke-WebRequest");
    expect(native).not.toContain("proxy-server");
    expect(native).not.toContain("user-data-dir");
    expect(native).not.toContain("Chrome.exe");
    expect(native).not.toContain("Start-Process");
  });

  it("renders smartphone chassis and native corners without clipping real Chrome pixels", () => {
    expect(native).toContain("public sealed class H2PhoneDisplayForm");
    expect(native).toContain("Rounded(20f,84f,w-40f,h-146f,28f)");
    expect(native).toContain("$status.Location=New-Object System.Drawing.Point(22,14)");
    expect(native).toContain("$status.Width=$frame.Width-44");
    expect(native).not.toContain("$status.Location=New-Object System.Drawing.Point(19,7)");
    expect(native).toContain("Color.FromArgb(3,4,7)");
    expect(native).toContain("Color.FromArgb(13,15,21)");
    expect(native).toContain("$right=$e.X -ge ($frame.ClientSize.Width-28)");
    expect(native).toContain("$bottom=$e.Y -ge ($frame.ClientSize.Height-28)");
    // Avoid DPI-virtualized hard region truncation at 175 percent scaling.
    expect(native).not.toContain("CreateRoundRectRgn");
    expect(native).toContain("DwmSetWindowAttribute");
    expect(native).toContain("SetWindowRgn(hwnd,IntPtr.Zero,true)");
    expect(native).not.toContain("function Set-PhoneCorners");
    expect(native).not.toContain("$frame.add_SizeChanged({Set-PhoneCorners");
    expect(native).toContain("H2PhoneDisplayForm.OnResize");
    expect(native).toContain("SetWindowRgn");
    expect(native).toContain("RoundChromeWindow");
    expect(native).toContain("$frame.add_Move({");
    expect(native).toContain("$frame.add_SizeChanged({");
    expect(native).toContain("outline.FillMode=System.Drawing.Drawing2D.FillMode.Alternate");
    expect(native).toContain("IsZoomed");
    expect(native).toContain("RestoreChromeWindow");
    expect(native).toContain("VisualSelfTest");
    expect(native).toContain("DrawToBitmap");
    expect(native).toContain("ShowWithoutActivation");
    expect(native).not.toContain("Invoke-WebRequest");
    expect(native).not.toContain("Start-Process");
  });

  it("keeps native Chrome keyboard focus by using a click-through phone overlay and native top drag", () => {
    expect(native).toContain("props.ExStyle |= 0x00000080");
    expect(native).not.toContain("0x08000000 | 0x00000080");
    expect(native).toContain("protected override bool ShowWithoutActivation");
    expect(native).toContain("ReleaseCapture()");
    expect(native).toContain("SendMessage(");
    expect(native).toContain("WM_NCLBUTTONDOWN");
    expect(native).toContain("HTCAPTION");
    expect(native).toContain("$status.add_MouseDown");
    expect(native).toContain("if($e.Y -lt $topPad");
    expect(native).toContain("if($e.X -ge ($status.ClientSize.Width-135)){return}");
    expect(native).toContain("GetWindowLongPtr(frame,GWLP_HWNDPARENT)");
  });


  it("persists a manually controlled stopwatch by instance without touching Chrome focus", () => {
    expect(native).toContain("[int]$InstanceId = 0");
    expect(native).toContain('"H2AdsWorker\\stopwatches"');
    expect(native).toContain('("instance-{0}.json" -f $InstanceId)');
    expect(native).toContain("[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()");
    expect(native).toContain("function Get-H2AdsWatchElapsedMs");
    expect(native).toContain("function Save-H2AdsWatchState");
    expect(native).toContain("function Change-H2AdsWatch");
    expect(native).toContain('Change-H2AdsWatch "reset"');
    expect(native).toContain('Change-H2AdsWatch "toggle"');
    expect(native).toContain("Get-H2AdsWatchLayout");
    expect(native).toContain("$status.add_MouseClick");
    expect(native).not.toContain("New-Object System.Windows.Forms.Button");
    // Closing the optional cosmetic phone must NEVER pause or reset the clock.
    const closeHandler = native.slice(native.indexOf("$frame.add_FormClosed({"));
    expect(closeHandler).not.toContain("Change-H2AdsWatch");
    expect(closeHandler).not.toContain("watchRunning=$false");
    expect(runner).toContain('"--proxy-server=http://127.0.0.1:" + relayPort');
  });

  it("places the stopwatch after the measured clock, with responsive controls and camera clearance", () => {
    expect(native).toContain('MeasureText("23:59",$clockFont).Width');
    expect(native).toContain("$toggleX=20+$clockWidth+10");
    expect(native).toContain("$textX=$toggleX+17");
    expect(native).toContain("$resetX=[int][Math]::Floor($width/2)-29");
    expect(native).toContain("if(($resetX-$textX) -ge 47)");
    expect(native).toContain("$watchPlay=$e.X -ge ($watchLayout.toggleX-5)");
    expect(native).toContain("$watchReset=$e.X -ge ($watchLayout.resetX-4)");
    expect(native).not.toContain("return @{toggleX=74; textX=92;");
    expect(native).toContain("Change-H2AdsWatch");
    expect(native).toContain("Save-H2AdsWatchState");
  });

  it("never changes the browser arguments, proxy chain or profile backend", () => {
    expect(runner).toContain('"--user-data-dir=" + profileDirectory');
    expect(runner).toContain('"--proxy-server=http://127.0.0.1:" + relayPort');
    expect(runner).toContain('"--proxy-bypass-list=<-loopback>"');
    expect(runner).toContain("await syncPanelOpening(initial.observedIp)");
    expect(runner).toContain("void verifyChromeProxyAfterLaunch(executable");
  });
});
