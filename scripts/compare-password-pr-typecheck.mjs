import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const baseline = resolve(".baseline");
if (!existsSync(resolve(baseline, "tsconfig.json"))) {
  console.error("Missing original branch checkout: cannot attest no-regression.");
  process.exit(1);
}

function run(name, project, buildInfo) {
  const result = spawnSync("pnpm", [
    "exec", "tsc", "--noEmit", "--pretty", "false", "--project", project,
    "--tsBuildInfoFile", buildInfo
  ], { encoding: "utf8", maxBuffer: 32*1024*1024 });
  if (result.error || (result.status !== 0 && result.status !== 2)) {
    console.error(name + ": compiler failed abnormally", result.error?.message || result.stderr);
    process.exit(1);
  }
  const lines = (result.stdout + "\n" + result.stderr).split(/\r?\n/);
  const diagnostic = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;
  const errors = lines.map(line => {
    const match = line.match(diagnostic);
    if (!match) return null;
    const rel = match[1].replace(/\\/g, "/").replace(/^\.baseline\//, "").replace(/^\/home\/runner\/work\/[^/]+\/[^/]+\/\.baseline\//, "");
    return { file:rel, code:match[4], description:match[5],
      key:rel + "|TS" + match[4] + "|" + match[5], line:line };
  }).filter(Boolean);
  if (result.status !== 0 && errors.length === 0) {
    console.error(name + " compiler error not matched; do not silently pass:\n" + (result.stdout + result.stderr).slice(-4000));
    process.exit(1);
  }
  console.log(name + ": " + errors.length + " TypeScript diagnostics");
  return errors;
}
const before = run("BASELINE", ".baseline/tsconfig.json", "/tmp/h2-password-baseline.tsbuildinfo");
const current = run("PR HEAD", "tsconfig.json", "/tmp/h2-password-head.tsbuildinfo");
const counts = new Map();
for (const error of before) counts.set(error.key,(counts.get(error.key)||0)+1);
const introduced = [];
for (const error of current) {
  const count=counts.get(error.key)||0;
  if(count>0)counts.set(error.key,count-1);
  else introduced.push(error);
}
const summary = [
  "### H2 password PR: TypeScript change regression audit",
  "",
  "- Baseline branch diagnostics: **" + before.length + "**",
  "- Proposed PR diagnostics: **" + current.length + "**",
  "- New diagnostics introduced by PR: **" + introduced.length + "**",
  "- The baseline errors are not ignored as a claim of full project health. They remain a separate release blocker until triaged.",
  "",
  introduced.length ? "#### Introduced diagnostics\n" + introduced.slice(0,40).map(e => "- " + e.line).join("\n") : "No new TypeScript diagnostics compared with untouched base.",
  ""
].join("\n");
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
if(introduced.length)process.exit(1);
