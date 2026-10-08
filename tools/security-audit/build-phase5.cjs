const fs = require('fs'); const path = require('path');
const [OUT, SKILL] = process.argv.slice(2);
const vr = fs.readFileSync(path.join(SKILL, 'VALIDATION-AND-REPORTING.md'), 'utf8');
const p5 = vr.slice(vr.indexOf('### Phase 5'), vr.indexOf('Do not apply a Phase 5 replacement'));
const promo = (() => { const i = vr.indexOf('Copy this promotion procedure verbatim'); const s = vr.indexOf('```text\n', i) + 8; return vr.slice(s, vr.indexOf('\n```', s)); })();
const schema = JSON.parse(fs.readFileSync(path.join(SKILL, 'report-schema.json'), 'utf8'));
const branch = (v) => JSON.stringify(schema.items.oneOf.find((b) => b.properties.verdict.const === v), null, 2);
const recs = JSON.parse(fs.readFileSync(path.join(OUT, 'findings.json'), 'utf8'));
const ids = [];
recs.forEach((r, i) => {
  const id = `f${i + 1}-final`; ids.push([id, r.fingerprint]);
  const scratch = path.join(OUT, 'agents', id, 'scratch'); const art = path.join(OUT, 'agents', id, 'artifacts');
  fs.mkdirSync(scratch, { recursive: true }); fs.mkdirSync(art, { recursive: true });
  const cited = [...new Set(JSON.stringify(r).match(/agents\/[a-z0-9-]+\/artifacts\/evidence-\d\.txt/g) || [])].map((a) => path.join(OUT, a));
  fs.writeFileSync(path.join(OUT, 'agents', id, 'prompt.md'), `# Phase 5 final-record verifier — ${id}

You are a fresh \`research\` verifier. You did not hunt, validate or write this record. Check the structured record below with fresh eyes, staying inside source/local boundaries. Do not contact any deployed endpoint or external service.

## Phase 5 instructions (from the skill, verbatim)

${p5.trim()}

## The record to check (verdict: ${r.verdict})

\`\`\`json
${JSON.stringify(r, null, 2)}
\`\`\`

Cited parent-promoted artifacts you may read: ${cited.map((c) => '`' + c + '`').join(', ') || 'none'}.

## Boundaries and workspace

- Target (read-only snapshot, commit 3f4d1a4): \`/home/claude/audit-target\`. Paths in the record are repository-relative to it.
- Agent ID \`${id}\`. Scratch (only writable place): \`${scratch}\`. Parent-owned artifacts (never write): \`${art}\`.
- Any target-controlled execution only inside the approved OS sandbox: \`/home/claude/audit-tools/sbx ${scratch} <command...>\` (no external network, read-only target, env allowlist, uid 65534, cpu 300 s, data 3 GiB, fsize 200 MB, 256 procs, 1024 files, 600 s wall clock). Postgres 16 binaries and the repo shim \`supabase/tests/supabase_shim.sql\` are available; see \`supabase/tests/run_security_tests.py\` for acting as anon/authenticated.
- Promotion allowlist \`evidence-1.txt\`…\`evidence-8.txt\` (256 KiB each, 1 MiB total), cited as \`agents/${id}/artifacts/<name>\`. Promotion procedure (performed only by trusted parent code):

\`\`\`text
${promo}
\`\`\`

## report-schema.json branches (verbatim), for a replacement record

### confirmed
\`\`\`json
${branch('confirmed')}
\`\`\`
### needs_validation
\`\`\`json
${branch('needs_validation')}
\`\`\`
### rejected
\`\`\`json
${branch('rejected')}
\`\`\`

Return exactly one JSON object and no surrounding prose: {"decision":"verified","fingerprint":"${r.fingerprint}"} or {"decision":"replace","reason":"...","record":{...}}.
`);
});
fs.writeFileSync(path.join(OUT, 'phase5-ids.json'), JSON.stringify(ids, null, 2));
console.log(ids.map((x) => x.join('  ')).join('\n'));
