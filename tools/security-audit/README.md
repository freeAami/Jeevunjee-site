# Security-audit tooling (parent-side helpers)

Helpers used to run the [Cloudflare security-audit skill](https://github.com/cloudflare/security-audit-skill) in
full mode on this repo (October 2026 run, results in `docs/security-audit/2026-10/`). They are the trusted
"parent" side of that skill: sandboxing, artifact promotion, ledger bookkeeping and prompt generation.

Paths inside are hard-coded to the original cloud container (`/home/claude/audit-target`,
`/home/claude/audit-tools`, `/home/claude/sas/skills/security-audit`,
`/home/claude/security-audit-skill/jeevunjee-site/run-N`). Adjust them before reuse.

| File | What it does |
|---|---|
| `sbx` | OS sandbox for running target code: unshare mount/net/pid, loopback only, read-only target, `env -i` allowlist, uid 65534, no_new_privs, prlimits, 600 s timeout. Usage: `sbx <scratch-dir> <cmd…>` (needs root to set up namespaces). |
| `promote.py` | Race-safe, no-follow promotion of allowlisted `scratch/evidence-N.txt` files into `artifacts/`. |
| `units.json` | The 18 reconnaissance coverage units (wave 1). |
| `build-ledger.cjs` | Builds `coverage-ledger.json` from `units.json`. |
| `build-prompts.cjs` | Generates hunter prompts with the skill's blocks copied verbatim. `ONLY=a,b` limits it to some hunters. |
| `consolidate.cjs` | Validates a hunter's JSON result, promotes cited evidence and updates the ledger. |
| `build-verifiers.cjs` | Phase 3 candidate-verifier prompts. Takes a jobs JSON of `{id, fingerprint, sources}`. |
| `build-findings.cjs` | Assembles `findings.json` from verifier results and applies non-material Phase 5 corrections. |
| `build-phase5.cjs` | Phase 5 final-record verifier prompts. |

To run a follow-up audit, give the skill the previous run's `docs/security-audit/2026-10/` as the prior run. Its
findings are all fixed in commit `045bf1a`, so it should revalidate them as changed source.
