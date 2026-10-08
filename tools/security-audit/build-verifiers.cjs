// Phase 3 candidate-verifier prompts (VALIDATION-AND-REPORTING.md "Candidate-verifier prompt").
const fs = require('fs'); const path = require('path');
const [OUT, SKILL] = process.argv.slice(2);
const read = (f) => fs.readFileSync(path.join(SKILL, f), 'utf8');
const vr = read('VALIDATION-AND-REPORTING.md');
const fenced = (t, after) => { const i = t.indexOf(after); const s = t.indexOf('```text\n', i) + 8; return t.slice(s, t.indexOf('\n```', s)); };
const verifierText = fenced(vr, '#### Candidate-verifier prompt');
const promotion = fenced(vr, 'Copy this promotion procedure verbatim into every candidate-verifier prompt');
const schema = JSON.parse(read('report-schema.json'));
const branch = (v) => JSON.stringify(schema.items.oneOf.find((b) => b.properties.verdict.const === v), null, 2);
const sectionBlock = (file, heading) => { const t = read(file); const m = t.match(new RegExp(`^## ${heading}.*$`, 'm')); const s = m.index; const n = t.slice(s + m[0].length).search(/\n## /); return t.slice(s, n < 0 ? undefined : s + m[0].length + n).trim(); };
const ledger = JSON.parse(fs.readFileSync(path.join(OUT, 'coverage-ledger.json'), 'utf8'));
const arch = fs.readFileSync(path.join(OUT, 'architecture.md'), 'utf8');
const jobs = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
for (const j of jobs) {
  const scratch = path.join(OUT, 'agents', j.id, 'scratch'); const art = path.join(OUT, 'agents', j.id, 'artifacts');
  fs.mkdirSync(scratch, { recursive: true }); fs.mkdirSync(art, { recursive: true });
  const cands = j.sources.map(([agent, fp]) => JSON.parse(fs.readFileSync(path.join(OUT, 'candidates', agent + '.json'), 'utf8')).find((c) => c.fingerprint === fp));
  const units = ledger.filter((u) => u.result_fingerprints.some((f) => j.sources.some(([, fp]) => fp === f)));
  const companions = [...new Set(units.flatMap((u) => u.selected_companion_blocks.map((b) => b.split('#')[0])))];
  const allow = Array.from({ length: 8 }, (_, i) => `evidence-${i + 1}.txt`);
  const p = `# Candidate verifier — ${j.id}

${verifierText}

## Canonical fingerprint
\`${j.fingerprint}\`${j.sources.length > 1 ? `\n\nTwo hunters independently proposed this same root cause; both proposals are below. Decide one record under the canonical fingerprint above.` : ''}

## Candidate(s) as proposed by the hunter(s)

\`\`\`json
${JSON.stringify(cands, null, 2)}
\`\`\`

## Linked coverage-unit checks (from coverage-ledger.json)

\`\`\`json
${JSON.stringify(units.map((u) => ({ coverage_id: u.coverage_id, boundary: u.boundary, local_checks: u.local_checks })), null, 2)}
\`\`\`

Hunter artifacts you may read (parent-promoted): ${[...new Set(units.flatMap((u) => u.local_checks.map((c) => c.artifact).filter(Boolean)))].map((a) => '`' + path.join(OUT, a) + '`').join(', ') || 'none'}.

## Architecture facts (architecture.md, verbatim)

${arch}

## Companion validation rules (verbatim)

${companions.map((f) => `### ${f}\n\n${sectionBlock(f, 'Validation rules')}`).join('\n\n')}

## Promotion procedure (verbatim)

\`\`\`text
${promotion}
\`\`\`

## Source/local execution boundary and your workspace

- Target repository (read-only snapshot): \`/home/claude/audit-target\`. All paths in your record are repository-relative to it.
- Agent ID: \`${j.id}\`. Scratch (the ONLY place you or target code write): \`${scratch}\`. Parent-owned artifacts dir (never write): \`${art}\`.
- Approved OS-enforced sandbox for ANY target-controlled execution: \`/home/claude/audit-tools/sbx ${scratch} <command...>\` — no external network (loopback only), new mount/PID namespaces, target read-only, env -i allowlist (PATH, HOME=<scratch>/home, TMPDIR, LANG, PLAYWRIGHT_BROWSERS_PATH), uid 65534, no_new_privs, cpu=300s, data=3GiB, fsize=200MB, nproc=256, nofile=1024, wall clock 600s. Put multi-line commands in a script in scratch and run \`sbx <scratch> bash <script>\`.
- Fixtures: Postgres 16 binaries on PATH (\`initdb -D pg -U postgres -A trust && pg_ctl -D pg -o "-p 54329 -k $PWD -c listen_addresses=" -l pg.log start\`, then \`psql -h $PWD -p 54329 -U postgres\`); repo shim \`supabase/tests/supabase_shim.sql\`; see \`supabase/tests/run_security_tests.py\` for acting as anon/authenticated. Playwright+Chromium: \`require('/opt/node22/lib/node_modules/playwright')\`. Target node_modules at \`/home/claude/audit-target/node_modules\`. Apps Script can be loaded in node with mocked Google services.
- Never use the network. Never contact Supabase, Google, GitHub, Vercel or any deployed URL. Read only the target, the skill dir \`${SKILL}\`, the hunter artifacts named above and your scratch.
- Promotion allowlist (scratch-relative): ${allow.map((a) => '`' + a + '`').join(', ')}; 262144 bytes per file, 1048576 total. Cite promoted evidence as \`agents/${j.id}/artifacts/<name>\`.

## report-schema.json — \`confirmed\` branch (verbatim)

\`\`\`json
${branch('confirmed')}
\`\`\`

## report-schema.json — \`needs_validation\` branch (verbatim)

\`\`\`json
${branch('needs_validation')}
\`\`\`

## report-schema.json — \`rejected\` branch (verbatim)

\`\`\`json
${branch('rejected')}
\`\`\`

## Prior records with the same fingerprint
None (first run).
`;
  fs.writeFileSync(path.join(OUT, 'agents', j.id, 'prompt.md'), p);
  console.log(j.id, p.length);
}
