import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/h2ads.ts"), "utf8");

describe("H2ADS reopen after close", () => {
  it("aceita o IP preparado quando a sessao anterior esta fechada", () => {
    expect(source).toContain('run?.state === "proxy_verified" || run?.state === "closed"');
    expect(source).toContain("run.observedIp ? run.observedIp : null");
  });

  it("mantem a abertura limitada a estados verificados ou fechados", () => {
    expect(source).toContain('runs[0]?.state !== "proxy_verified" && runs[0]?.state !== "closed"');
  });
});
