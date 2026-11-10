import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./browser-session.mjs", import.meta.url), "utf8");
const recovery = source.slice(source.indexOf("async function resumeProxyTraffic()"), source.indexOf("async function reportObservedIp()"));
function harness({ ip = "198.51.100.1", latched = false, probeError = false, routeError = false } = {}) {
  const records = [];
  const state = {
    networkSuspended: true, browserExitHandled: false, browserProbeInProgress: false, sessionIpChanged: latched,
    sessionLockedIp: "198.51.100.1", backendRelay: null, frontRelay: { port: 9000 },
    relayPort: 9000, activeBackendPort: undefined, probes: 0, records,
    suspendingProxyTraffic: null, browserProbeInProgress: false,
    createBackendRelay: () => ({ port: 9001, listen: async () => {} }),
    checkIpThroughPort: async () => { if (routeError) throw new Error("proxy_path_unverified"); return ip; },
    normalizeIp: (value) => value.trim().toLowerCase(),
    chromeExecutable: () => "chrome.exe",
    verifyChromeProxyPath: async () => { state.probes++; if (probeError) throw new Error("exit_ip_mismatch"); return ip; },
    createFrontRelay: () => ({ listen: async () => {} }),
    checkIp: async () => ip,
    writeSession: (value) => records.push(value),
    syncPanelOpening: async () => {},
    post: async () => {},
    panelFailure: () => {},
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
test("latched session resumes only when the originally locked IP returns", async () => {
  const state = harness({ latched: true });
  await state.resume();
  assert.equal(state.networkSuspended, false);
  assert.equal(state.activeBackendPort, 9001);
  assert.equal(state.sessionIpChanged, false);
  assert.equal(state.probes, 1);
});
test("latched session refuses a different exit IP before Chrome verification", async () => {
  const state = harness({ latched: true, ip: "198.51.100.2" });
  await state.resume();
  assert.equal(state.networkSuspended, true);
  assert.equal(state.sessionIpChanged, true);
  assert.equal(state.activeBackendPort, undefined);
  assert.equal(state.probes, 0);
});
test("recovery waits for an already running Chrome probe", async () => {
  const state = harness();
  state.browserProbeInProgress = true;
  await state.resume();
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
  assert.equal(state.probes, 0);
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

const suspensionSource = source.slice(source.indexOf("let suspendingProxyTraffic = null;"), source.indexOf("async function resumeProxyTraffic()"));
function suspensionHarness({ failBind = false } = {}) {
  const records = [];
  const calls = { closes: 0, binds: 0 };
  const state = {
    browserExitHandled: false, networkSuspended: false,
    activeBackendPort: 9001, frontRelay: { port: 9000 }, backendRelay: { port: 9001 },
    relayPort: 9000, suspendingProxyTraffic: null,
    classifyNetworkError: () => "proxy_path_unverified",
    closeRelay: async () => { calls.closes++; await Promise.resolve(); },
    createFrontRelay: () => ({ port: 9000, listen: async () => { calls.binds++; if (failBind) throw new Error("EADDRINUSE"); } }),
    writeSession: (row) => records.push(row),
  };
  vm.createContext(state);
  vm.runInContext(suspensionSource + "\nthis.suspend = suspendProxyTraffic;", state);
  return { state, calls, records };
}
test("concurrent tunnel failures rebind the local front only once", async () => {
  const { state, calls, records } = suspensionHarness();
  await Promise.all([state.suspend("proxy_path_unverified"), state.suspend("proxy_path_unverified")]);
  assert.equal(calls.closes, 2);
  assert.equal(calls.binds, 1);
  assert.equal(state.frontRelay.port, 9000);
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
  assert.equal(records.at(-1).privacyGuard, "blocked");
});
test("failed local front bind never reports an active relay", async () => {
  const { state, calls } = suspensionHarness({ failBind: true });
  await state.suspend("local_relay_down");
  assert.equal(calls.binds, 1);
  assert.equal(state.frontRelay, undefined);
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
});


const ipCheckSource = source.slice(source.indexOf("async function checkIpThroughPort(localPort)"), source.indexOf("async function checkIp()"));
assert.ok(ipCheckSource.includes("https://api.ipify.org?format=json"), "primary IP check must remain");
function ipCheckHarness({ primaryFails = false, secondaryFails = false, primaryIp = "198.51.100.1", secondaryIp = "198.51.100.1" } = {}) {
  const calls = [];
  const state = {
    calls,
    execFileAsync: async (_exe, args) => {
      calls.push(args);
      const target = args.at(-1);
      assert.ok(args.includes("--proxy"), "probe must always use the proxy");
      assert.ok(args.includes("http://127.0.0.1:9001"), "probe must use the dedicated relay");
      if (target.includes("ipify.org")) {
        if (primaryFails) throw new Error("primary_ip_provider_down");
        return { stdout: JSON.stringify({ ip: primaryIp }) };
      }
      if (secondaryFails) throw new Error("secondary_ip_provider_down");
      return { stdout: JSON.stringify({ ip: secondaryIp }) };
    },
    classifyNetworkError: () => "proxy_path_unverified",
  };
  vm.createContext(state);
  vm.runInContext(ipCheckSource + "\nthis.checkIp = checkIpThroughPort;", state);
  return state;
}
test("healthy primary IP check never calls fallback", async () => {
  const s = ipCheckHarness();
  assert.equal(await s.checkIp(9001), "198.51.100.1");
  assert.equal(s.calls.length, 1);
});
test("IP check recovers with same proxy when the primary provider fails", async () => {
  const s = ipCheckHarness({ primaryFails: true });
  assert.equal(await s.checkIp(9001), "198.51.100.1");
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls[1].at(-1).includes("ipapi.co"));
});
test("both IP check providers down leaves the session protected", async () => {
  const s = ipCheckHarness({ primaryFails: true, secondaryFails: true });
  await assert.rejects(s.checkIp(9001), /proxy_path_unverified/);
  assert.equal(s.calls.length, 2);
});
test("changed IP from fallback is not silently replaced by the original IP", async () => {
  const s = ipCheckHarness({ primaryFails: true, secondaryIp: "198.51.100.2" });
  assert.equal(await s.checkIp(9001), "198.51.100.2");
  assert.equal(s.calls.length, 2);
  // Existing session IP lock in resumeProxyTraffic rejects this changed IP.
  assert.ok(recovery.includes("normalizeIp(observedIp) !== normalizeIp(sessionLockedIp)"));
});
