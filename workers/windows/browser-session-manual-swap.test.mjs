import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./browser-session.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function applyVerifiedManualProxySwap(next)");
const end = source.indexOf("async function syncCurrentProxyCredential()", start);
assert.ok(start >= 0 && end > start, "manual swap handler must exist");
const code = source.slice(start, end);

function makeHarness({ candidateIp = "198.51.100.2", failCandidate = false, failFront = false } = {}) {
  const events = [];
  const currentProxy = { host: "old.example", port: 3128, username: "u", password: "p", protocol: "http" };
  const next = { ...currentProxy, host: "new.example" };
  const oldBackend = { port: 8000 };
  const state = {
    rotationInProgress: false,
    browserExitHandled: false,
    browser: { exitCode: null },
    proxy: currentProxy,
    backendRelay: oldBackend,
    frontRelay: { port: 7999 },
    activeBackendPort: 8000,
    networkSuspended: false,
    sessionLockedIp: "198.51.100.1",
    sessionIpChanged: false,
    lastReportedIp: "198.51.100.1",
    instanceId: 9,
    events,
    createBackendRelay: () => ({ port: 8001, listen: async () => events.push("candidate-listening") }),
    checkIpThroughPort: async () => {
      if (failCandidate) throw new Error("proxy_path_unverified");
      return candidateIp;
    },
    chromeExecutable: () => "chrome.exe",
    verifyChromeProxyPath: async () => candidateIp,
    normalizeIp: (ip) => String(ip).toLowerCase(),
    suspendProxyTraffic: async (why) => {
      events.push("suspended:" + why);
      state.networkSuspended = true;
      state.activeBackendPort = undefined;
    },
    checkIp: async () => {
      if (failFront) throw new Error("exit_ip_mismatch");
      return candidateIp;
    },
    writeSession: (record) => events.push(record),
    post: async () => events.push("state-posted"),
    syncPanelOpening: async () => {},
    closeRelay: async () => events.push("closed-candidate"),
    classifyNetworkError: (e) => e.message,
  };
  vm.createContext(state);
  vm.runInContext(code + "\nthis.apply = applyVerifiedManualProxySwap;", state);
  return { state, next };
}

test("validated operator swap changes IP without closing Chrome", async () => {
  const { state, next } = makeHarness();
  await state.apply(next);
  assert.equal(state.browser.exitCode, null);
  assert.equal(state.proxy.host, "new.example");
  assert.equal(state.sessionLockedIp, "198.51.100.2");
  assert.equal(state.networkSuspended, false);
  assert.equal(state.activeBackendPort, 8001);
  assert.equal(state.sessionIpChanged, false);
  assert.ok(state.events.some((event) => event.hotSwapState === "online"));
});

test("invalid candidate keeps old proxy and Chrome running", async () => {
  const { state, next } = makeHarness({ failCandidate: true });
  await state.apply(next);
  assert.equal(state.proxy.host, "old.example");
  assert.equal(state.activeBackendPort, 8000);
  assert.equal(state.networkSuspended, false);
  assert.ok(state.events.includes("closed-candidate"));
});

test("failure after switching path leaves traffic blocked, not direct", async () => {
  const { state, next } = makeHarness({ failFront: true });
  await state.apply(next);
  assert.equal(state.browser.exitCode, null);
  assert.equal(state.networkSuspended, true);
  assert.equal(state.activeBackendPort, undefined);
});
