"""Read-only syntax checks for old branch-specific patch workflows.
Never execute the embedded Python, shell commands, git pushes or deployments.
"""
import ast
import pathlib
import yaml

EXPECTED = {
    "product-manifest-acceptance.yml": "feat/product-manifest-acceptance-20260901",
    "backup-auto-recovery-20260909.yml": "recovery/organizar-salvos-2026-08-24",
    "h2ads-schedule-single-block.yml": "recovery/organizar-salvos-2026-08-24",
    "fix-h2ads-worker-crash-prod-20260908.yml": "recovery/organizar-salvos-2026-08-24",
    "fix-loan-settlement-reconciliation-20260907.yml": "recovery/organizar-salvos-2026-08-24",
    "h2ads-privacy-guard-cdp-hotfix.yml": "fix/h2ads-privacy-guard-cdp-2026-09-17",
}

for filename, branch in EXPECTED.items():
    path = pathlib.Path(".github/workflows") / filename
    config = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    assert set(config["on"]) == {"push"}, f"{filename}: historical trigger changed"
    assert config["on"]["push"]["branches"] == [branch], f"{filename}: branch scope changed"
    parsed = 0
    for job in config["jobs"].values():
        for step in job.get("steps", []):
            script = step.get("run", "")
            if step.get("shell") == "python":
                ast.parse(script, filename=filename)
                parsed += 1
            elif "<<'PY'" in script:
                block = script.split("<<'PY'", 1)[1].lstrip("\n").split("\nPY\n", 1)[0]
                ast.parse(block, filename=filename)
                parsed += 1
    assert parsed, f"{filename}: embedded Python not found"
    print(f"OK {filename}: YAML and {parsed} Python block(s), original branch only")
