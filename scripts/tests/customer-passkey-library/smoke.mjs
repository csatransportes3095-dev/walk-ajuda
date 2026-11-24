// Isolated library smoke test. No production routes, DB, customer data or credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_BIN) {
  throw new Error("Set PLAYWRIGHT_MODULE and CHROME_BIN for the isolated browser test.");
}
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const built = await build({
  stdin: {
    contents: "import { startRegistration, startAuthentication } from '@simplewebauthn/browser'; window.testPasskey = { startRegistration, startAuthentication };",
    resolveDir: process.cwd(),
    loader: "js",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
});
const server = createServer((req, res) => {
  if (req.url === "/browser.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(built.outputFiles[0].text);
  } else if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<!doctype html><title>Isolated Passkey QA</title><script src="/browser.js"></script>');
  } else {
    res.writeHead(404); res.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const rpID = "localhost";
const origin = "http://localhost:" + server.address().port;
let browser;
async function rejectProof(verify, message) {
  let accepted = false;
  try { accepted = (await verify()).verified === true; } catch {}
  assert.equal(accepted, false, message);
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true });
  const context = await browser.newContext();
  await context.route("**/*", route => {
    if (route.request().url().startsWith(origin + "/")) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.testPasskey));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2", transport: "internal", hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  const userID = new Uint8Array(randomBytes(32));
  const registration = await generateRegistrationOptions({
    rpName: "Isolated H2 test", rpID, userName: "synthetic-test-account",
    userID, attestationType: "none", supportedAlgorithmIDs: [-7],
    authenticatorSelection: {
      authenticatorAttachment: "platform", residentKey: "required", userVerification: "required",
    },
  });
  const response = await page.evaluate(optionsJSON => window.testPasskey.startRegistration({ optionsJSON }), registration);
  const registrationInput = {
    response, expectedChallenge: registration.challenge, expectedOrigin: origin,
    expectedRPID: rpID, requireUserVerification: true,
  };
  await rejectProof(() => verifyRegistrationResponse({ ...registrationInput, expectedChallenge: "incorrect-challenge" }), "Wrong registration challenge accepted");
  await rejectProof(() => verifyRegistrationResponse({ ...registrationInput, expectedOrigin: "https://example.invalid" }), "Wrong registration origin accepted");
  const registered = await verifyRegistrationResponse(registrationInput);
  assert.equal(registered.verified, true);
  assert.ok(registered.registrationInfo?.credential);
  const credential = registered.registrationInfo.credential;
  console.log("PASS: genuine WebAuthn registration with a synthetic virtual authenticator");

  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const nextOptions = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  assert.notEqual(options.challenge, nextOptions.challenge);
  const assertion = await page.evaluate(optionsJSON => window.testPasskey.startAuthentication({ optionsJSON }), options);
  assert.equal(assertion.id, credential.id);
  assert.equal(assertion.response.userHandle, registration.user.id);
  const input = {
    response: assertion, expectedChallenge: options.challenge, expectedOrigin: origin,
    expectedRPID: rpID, credential, requireUserVerification: true,
  };
  await rejectProof(() => verifyAuthenticationResponse({ ...input, expectedChallenge: nextOptions.challenge }), "Wrong authentication challenge accepted");
  await rejectProof(() => verifyAuthenticationResponse({ ...input, expectedOrigin: "https://example.invalid" }), "Wrong authentication origin accepted");
  await rejectProof(() => verifyAuthenticationResponse({ ...input, expectedRPID: "example.invalid" }), "Wrong relying-party ID accepted");
  const verified = await verifyAuthenticationResponse(input);
  assert.equal(verified.verified, true);
  assert.ok(verified.authenticationInfo.newCounter > credential.counter);
  await rejectProof(() => verifyAuthenticationResponse({
    ...input, credential: { ...credential, counter: verified.authenticationInfo.newCounter },
  }), "An already-used signature counter was accepted");
  console.log("PASS: genuine WebAuthn authentication and rejection of mismatched challenges, origins, RP IDs and stale counters");
  console.log("Library-only smoke test passed. Production enrollment, sessions and ADM controls remain outside this test.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
