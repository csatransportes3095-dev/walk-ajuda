import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const indexSource = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf8");

describe("infra/security regression", () => {
  it("uses exactly Render configured PORT without scanning alternate ports", () => {
    expect(indexSource).toContain('Number.parseInt(process.env.PORT || "3000", 10)');
    expect(indexSource).toContain('server.listen(port, "0.0.0.0"');
    expect(indexSource).toContain('server.once("error"');
    expect(indexSource).not.toContain('function isPortAvailable');
    expect(indexSource).not.toContain('function findAvailablePort');
    expect(indexSource).not.toContain('import net from "net"');
  });

  it("does not publish the temporary Zoho OAuth debug route or embedded test secret", () => {
    expect(indexSource).not.toContain('/api/zoho-test-session');
    expect(indexSource).not.toContain('TEST_walk1');
    expect(indexSource).not.toMatch(/zohoClientSecret\s*:\s*["'][^"']+["']/);
    expect(indexSource).not.toContain('ClientSecret match');
  });
});
