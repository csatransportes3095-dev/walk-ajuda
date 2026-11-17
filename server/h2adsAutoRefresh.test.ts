import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateH2AdsAutoRefreshInterval,
  H2ADS_AUTO_REFRESH_MIN_SECONDS,
  H2ADS_AUTO_REFRESH_MAX_SECONDS,
} from "./h2adsAutoRefreshPolicy";

const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");
const server=read("./h2adsWorkerRoute.ts");
const router=read("./routers/h2ads.ts");
const chrome=read("../workers/windows/browser-session.mjs");
const phone=read("../workers/windows/h2ads-phone-window.ps1");
const adm=read("../client/src/pages/H2Ads.tsx");

describe("H2 ADS opt-in per-instance refresh timer",()=>{
  it("starts OFF, rejects aggressive rates and accepts a full-day interval",()=>{
    expect(validateH2AdsAutoRefreshInterval(0)).toBe(0);
    expect(validateH2AdsAutoRefreshInterval(30)).toBe(H2ADS_AUTO_REFRESH_MIN_SECONDS);
    expect(validateH2AdsAutoRefreshInterval(3600)).toBe(3600);
    expect(validateH2AdsAutoRefreshInterval(86400)).toBe(H2ADS_AUTO_REFRESH_MAX_SECONDS);
    for(const invalid of [-1,1,10,29,86401,3.5,NaN,Infinity]) {
      expect(()=>validateH2AdsAutoRefreshInterval(invalid)).toThrow();
    }
  });
  it("enforces admin mutation and worker ownership for each instance",()=>{
    expect(router).toContain("setAutoRefreshPolicy: adminProcedure");
    expect(router).toContain("await requireConfigurableInstance(input.instanceId)");
    expect(server).toContain('"/api/h2ads/worker/auto-refresh/:instanceId"');
    expect(server).toContain("authenticateRequest(req, res)");
    expect(server).toContain("h2AdsRemoteOwnerForOpenInstance(instanceId)");
    expect(server).toContain("owner !== worker.id");
  });
  it("keeps local timer separate from proxy, Chrome and current stopwatch",()=>{
    expect(chrome).toContain('h2ads-auto-refresh-policy.json');
    expect(chrome).toContain('"/api/h2ads/worker/auto-refresh/" + instanceId');
    expect(chrome).toContain('"-RefreshPolicyPath", refreshPolicyPath');
    expect(chrome).toContain("if (refreshPolicyTimer) clearInterval(refreshPolicyTimer)");
    expect(phone).toContain("function Change-H2AdsRefresh");
    expect(phone).toContain("function Tick-H2AdsRefresh");
    expect(phone).toContain("Save-H2AdsRefreshToggle");
    expect(phone).toContain("Save-H2AdsWatchState");
    expect(phone).toContain('label="AUTO"');
    expect(phone).toContain('label="INICIAR"');
    expect(phone).toContain('label="PAUSAR"');
    expect(phone).toContain('label="ZERAR"');
  });
  it("refreshes only the owned, visible Chrome without stealing keyboard focus",()=>{
    expect(phone).toContain("RefreshBrowserPage(IntPtr chrome)");
    expect(phone).toContain("SendMessageTimeout(chrome, 0x0319");
    expect(phone).toContain("new IntPtr(15 << 16)");
    expect(phone).toContain("IsWindowVisible($chromeWindow)");
    expect(phone).toContain("IsIconic($chromeWindow)");
    expect(phone).not.toContain("SendKeys.Send");
    expect(phone).not.toContain("SetForegroundWindow");
  });
  it("configures the interval only from the open instance, never from ADM",()=>{
    expect(adm).not.toContain("function H2AdsAutoRefreshControl");
    expect(adm).not.toContain("<H2AdsAutoRefreshControl");
    expect(phone).toContain("function Set-H2AdsRefreshSettings");
    expect(phone).toContain("function Change-H2AdsRefresh");
    expect(phone).toContain('SALVAR E INICIAR');
    expect(phone).toContain('SALVAR PAUSADO');
    expect(phone).toContain('DESATIVAR');
    expect(phone).toContain('$dialog.ShowDialog($frame)');
    expect(phone).toContain('intervalSeconds=[int]$script:refreshSeconds');
    expect(phone).toContain('$script:refreshConfiguredLocally=$true');
    expect(phone).toContain('if($script:refreshConfiguredLocally){return}');
    expect(phone).toContain('if($script:refreshDialogOpen){$script:refreshNextAtMs=0;return}');
  });
  it("keeps each interval in its own local instance file and persists with atomic save",()=>{
    expect(phone).toContain('("instance-{0}-auto-refresh.json" -f $InstanceId)');
    expect(phone).toContain("Save-H2AdsRefreshToggle");
    expect(phone).toContain("[System.IO.File]::Replace");
    expect(phone).toContain("[System.IO.File]::Move");
    expect(phone).toContain('if($localSeconds -eq 0){$script:refreshEnabled=$false}');
    expect(phone).toContain('if($seconds -ne 0 -and ($seconds -lt 30 -or $seconds -gt 86400))');
    expect(chrome).toContain('contents.length <= 75000');
  });
});
