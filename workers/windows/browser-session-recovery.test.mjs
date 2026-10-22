import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./browser-session.mjs", import.meta.url), "utf8");
const recovery = source.slice(source.indexOf("async function resumeProxyTraffic()"), source.indexOf("async function reportObservedIp()"));
function harness({ ip = "198.51.100.1", latched = false, probeError = false, routeError = false } = {}) {
  const records = [];
  const state = {
    networkSuspended: true, browserExitHandled: false, sessionIpChanged: latched,
    sessionLockedIp: "198.51.100.1", backendRelay: null, frontRelay: { port: 9000 },
    relayPort: 9000, activeBackendPort: undefined, probes: 0, records,
    createBackendRelay: () => ({ port: 9001, listen: async () => {} }),
    checkIpThroughPort: async () => { if (routeError) throw new Error("proxy_path_unverified"); return ip; },
    normalizeIp: (value) => value.trim().toLowerCase(),
    chromeExecutable: () => "chrome.exe",
    verifyChromeProxyPath: async () => { state.probes++; if (probeError) throw new Error("exit_ip_mismatch"); return ip; },
    createFrontRelay: () => ({ listen: async () => {} }),
    checkIp: async () => ip,
    writeSession: (value) => records.push(value),
    syncPanelOpening: async () => {},
    suspendProxyTraffic: async (reason) => { state.networkSuspended = true; state.activeBackendPort = undefined; records.push({ reason }); },
  };
  vm.createContext(state);
  vm.runInContext(recovery + "\nthis.resume = resumeProxyTraffic;", state);
  return state;
}
test("same session IP resumes only after Chrome verification", async () => {
  const state = harness();
  await state.resume();
  assert.equal(state.probes, 1);
  assert.equal(state.networkSuspended, false);
  assert.equal(state.activeBackendPort, 9001);
});
test("changed IP after outage stays blocked before any Chrome probe", async () => {
  const state = harness({ ip: "198.51.100.2" });
  await state.resume();
  assert.equal(state.sessionIpChanged, true);
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
  assert.equal(state.probes, 0);
  assert.ok(state.records.some((row) => row.killSwitchReason === "session_ip_changed"));
  await state.resume();
  assert.equal(state.probes, 0);
  assert.equal(state.activeBackendPort, undefined);
});
test("already latched session never recovers automatically", async () => {
  const state = harness({ latched: true });
  await state.resume();
  assert.equal(state.backendRelay, null);
  assert.equal(state.activeBackendPort, undefined);
});
test("unreachable proxy keeps traffic suspended", async () => {
  const state = harness({ routeError: true });
  await state.resume();
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
  assert.equal(state.probes, 0);
});
test("Chrome verification failure keeps traffic suspended", async () => {
  const state = harness({ probeError: true });
  await state.resume();
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
});
test("new session can accept its own newly locked IP", async () => {
  const state = harness({ ip: "198.51.100.2" });
  state.sessionLockedIp = "198.51.100.2";
  await state.resume();
  assert.equal(state.networkSuspended, false);
  assert.equal(state.activeBackendPort, 9001);
});
