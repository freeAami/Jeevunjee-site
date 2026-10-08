// Generates verbatim hunter prompts from the skill files + ledger (security-audit skill, HUNTING.md "Required hunter prompt").
const fs = require('fs');
const path = require('path');
const [OUT, SKILL] = process.argv.slice(2);
const read = (f) => fs.readFileSync(path.join(SKILL, f), 'utf8');
const ledger = JSON.parse(fs.readFileSync(path.join(OUT, 'coverage-ledger.json'), 'utf8'));
const arch = fs.readFileSync(path.join(OUT, 'architecture.md'), 'utf8');
const hunting = read('HUNTING.md');
const fenced = (text, after) => {
  const i = text.indexOf(after);
  const s = text.indexOf('```text\n', i) + 8;
  return text.slice(s, text.indexOf('\n```', s));
};
const coreMethod = fenced(hunting, '#### Core hunting method');
const promotion = fenced(hunting, '#### Promotion procedure');
const coreValidation = fenced(hunting, '#### Core validation rules');
const resultBlock = (() => { const i = hunting.indexOf('## Structured hunter result'); return hunting.slice(i, hunting.indexOf('## Parent consolidation', i)).trim(); })();
const schema = JSON.parse(read('report-schema.json'));
const branch = (v) => JSON.stringify(schema.items.oneOf.find((b) => b.properties.verdict.const === v), null, 2);

// Exact block extraction
function boldBlock(file, name) {
  const t = read(file);
  const key = `**${name}**`;
  const i = t.indexOf(key);
  if (i < 0) throw new Error(`block not found: ${file}#${name}`);
  const rest = t.slice(i + key.length);
  const m = rest.search(/\n(\*\*[^*\n]+\*\*|#{2,4} )/);
  return (key + (m < 0 ? rest : rest.slice(0, m))).trim();
}
function sectionBlock(file, heading) {
  const t = read(file);
  const re = new RegExp(`^## ${heading}.*$`, 'm');
  const m = t.match(re);
  if (!m) throw new Error(`section not found: ${file}#${heading}`);
  const start = m.index;
  const next = t.slice(start + m[0].length).search(/\n## /);
  return t.slice(start, next < 0 ? undefined : start + m[0].length + next).trim();
}
const block = (ref) => {
  const [file, name] = ref.split('#');
  if (['Core discipline', 'Universal moves', 'Validation rules'].includes(name)) return sectionBlock(file, name);
  return boldBlock(file, name);
};

const groups = {};
for (const u of ledger) (groups[u.hunter_group] ||= []).push(u);
const allIds = ledger.map((u) => [u.hunter_group, u.coverage_id]);

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const [agent, units] of Object.entries(groups)) {
  if (only && !only.includes(agent)) continue;
  const scratch = path.join(OUT, 'agents', agent, 'scratch');
  const artifacts = path.join(OUT, 'agents', agent, 'artifacts');
  fs.mkdirSync(scratch, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  const blocks = new Set();
  for (const u of units) {
    if (u.ordinary_attack_class_block) blocks.add(u.ordinary_attack_class_block);
    for (const b of u.selected_companion_blocks) blocks.add(b);
  }
  // order: ordinary first, then per companion: Core discipline, classes, Universal moves, Validation rules
  const ordered = [...blocks].sort((a, b) => {
    const rank = (r) => (r.startsWith('ATTACK-CLASSES') ? 0 : 1);
    const sub = (r) => (r.endsWith('#Core discipline') ? 0 : r.endsWith('#Universal moves') ? 2 : r.endsWith('#Validation rules') ? 3 : 1);
    return rank(a) - rank(b) || a.split('#')[0].localeCompare(b.split('#')[0]) || sub(a) - sub(b) || a.localeCompare(b);
  });
  const assign = units.map((u) => ({
    coverage_id: u.coverage_id, surface: u.surface, boundary: u.boundary, subsystem: u.subsystem, attack_class: u.attack_class,
    starting_paths: u.starting_paths, ordinary_attack_class_block: u.ordinary_attack_class_block,
    selected_companion_blocks: u.selected_companion_blocks, excluded_blocks: u.excluded_blocks,
  }));
  const peers = allIds.filter(([g]) => g !== agent).map(([, id]) => id);
  const allow = Array.from({ length: 8 }, (_, i) => `evidence-${i + 1}.txt`);
  const prompt = `# Hunter prompt — ${agent}

## 1. Role
Your goal is to find source-grounded security invariant failures in your assigned coverage units of the target repository. You must return exactly one JSON object matching the structured-result contract at the end of this prompt, with no surrounding prose.

## 2. architecture.md (verbatim)

${arch}

## 3. Assigned units (from coverage-ledger.json)

Target repository root (read-only snapshot): \`/home/claude/audit-target\`. All paths you report must be repository-relative to that root.

\`\`\`json
${JSON.stringify(assign, null, 2)}
\`\`\`

## 4. Selected attack-class and companion blocks (verbatim)

${ordered.map((r) => `### ${r}\n\n${block(r)}`).join('\n\n')}

## 5. Excluded blocks

${[...new Map(units.flatMap((u) => u.excluded_blocks).map((e) => [e.block, e])).values()].map((e) => `- ${e.block} — ${e.reason}`).join('\n')}
- Any ordinary or companion class assigned to a peer unit listed in section 8 — owned by another hunter.

## 6. Core hunting method

\`\`\`text
${coreMethod}
\`\`\`

\`\`\`text
${promotion}
\`\`\`

## 7. Core validation rules

\`\`\`text
${coreValidation}
\`\`\`

## 8. Exclusions and peer-owned coverage

- Carried same-source prior confirmed exclusions: none (first run). Already-known candidates from wave 1 (do not re-report; link only if your unit hits the same root cause): ${JSON.stringify(ledger.flatMap((u) => u.result_fingerprints))}
- Peer-owned coverage IDs you must not duplicate (report a related gap under \`uncovered\` instead):
${peers.map((p) => `  - ${p}`).join('\n')}

## 9. Your workspace, sandbox, promotion allowlist and result contract

- Agent ID: \`${agent}\`
- Your scratch directory (the ONLY place you or target code may write): \`${scratch}\`
- Parent-owned artifacts directory (never write here): \`${artifacts}\`
- **Approved OS-enforced sandbox** for any target-controlled execution (builds, tests, node scripts importing target code, Postgres loading target SQL, browsers rendering target pages): \`/home/claude/audit-tools/sbx ${scratch} <command...>\`. It runs the command with no external network (loopback only), a new mount/PID namespace, the target \`/home/claude/audit-target\` read-only, an empty allowlisted environment (PATH, HOME=<scratch>/home, TMPDIR, LANG, PLAYWRIGHT_BROWSERS_PATH), uid 65534, no_new_privs, and limits cpu=300s, data=3GiB, file size=200MB, 256 processes, 1024 files, wall clock 600s. Working directory inside is your scratch dir. Write any multi-line command to a script file in scratch and run \`sbx <scratch> bash <script>\` to avoid quoting problems. Never run target code outside it.
- Useful local fixtures inside the sandbox: Postgres 16 binaries are on PATH. Example: \`initdb -D pg -U postgres -A trust && pg_ctl -D pg -o "-p 54329 -k $PWD -c listen_addresses=" -l pg.log start\`, then \`psql -h $PWD -p 54329 -U postgres\`. The repo's Supabase stand-in is \`supabase/tests/supabase_shim.sql\` (roles anon/authenticated, auth.users, auth.uid() from \`request.jwt.claim.sub\`, storage.objects with RLS, storage.foldername) and \`supabase/tests/run_security_tests.py\` shows how to act as anon/authenticated (\`set role ...; select set_config('request.jwt.claim.sub', '<uuid>', false)\`). Run with \`PGHOST=$PWD\`. Playwright + Chromium: \`require('/opt/node22/lib/node_modules/playwright')\`; \`node_modules\` for the target is at \`/home/claude/audit-target/node_modules\`. To build the site, copy the source into scratch first (the target is read-only), e.g. \`cp -r /home/claude/audit-target src-copy\` inside the sandbox.
- Do not use the network for anything. Do not contact Supabase, Google, GitHub, Vercel or any deployed URL. Do not read files outside the target, the skill directory \`/home/claude/sas/skills/security-audit\` and your scratch.
- Predeclared promotion allowlist (scratch-relative): ${allow.map((a) => `\`${a}\``).join(', ')}. Per-file limit 262144 bytes, cumulative 1048576 bytes. If you cite a local check artifact, write the evidence to one of those names in scratch and reference it as \`agents/${agent}/artifacts/<name>\`; the parent promotes it after you finish. Anything else in scratch is discarded.

${resultBlock}

### report-schema.json — \`confirmed\` branch (verbatim)

\`\`\`json
${branch('confirmed')}
\`\`\`

### report-schema.json — \`needs_validation\` branch (verbatim)

\`\`\`json
${branch('needs_validation')}
\`\`\`
`;
  fs.writeFileSync(path.join(OUT, 'agents', agent, 'prompt.md'), prompt);
  console.log(agent, units.length, 'units', ordered.length, 'blocks', prompt.length, 'chars');
}
