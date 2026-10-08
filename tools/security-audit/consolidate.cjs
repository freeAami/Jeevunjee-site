// Parent consolidation of one hunter result (security-audit skill, HUNTING.md "Parent consolidation and ledger update").
// usage: node consolidate.cjs <output-dir> <agent-id> <result.json>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [OUT, AGENT, RESULT] = process.argv.slice(2);
const AGENT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FP_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
const ledgerPath = path.join(OUT, 'coverage-ledger.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
let result;
try {
  result = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
} catch (e) {
  console.error('MALFORMED result (not JSON) — units stay in_progress for reassignment');
  process.exit(2);
}
const problems = [];
const relOk = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.split('/').includes('..');
const assigned = ledger.filter((u) => u.agent_id === AGENT && u.status === 'in_progress');
const seen = new Set();

// promote every cited local artifact first (trusted parent-side code)
const toPromote = new Set();
for (const u of result.units || []) for (const c of u.checks || []) {
  if (c.method === 'local' && typeof c.artifact === 'string') {
    const m = c.artifact.match(new RegExp(`^agents/${AGENT}/artifacts/(evidence-[1-8]\\.txt)$`));
    if (m) toPromote.add(m[1]);
    else problems.push(`artifact ${c.artifact} is not on ${AGENT}'s allowlist`);
  }
}
const promoted = new Set();
if (toPromote.size) {
  const out = execFileSync('python3', ['/home/claude/audit-tools/promote.py', OUT, AGENT, '262144', '1048576', ...toPromote], { encoding: 'utf8' });
  for (const line of out.trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.status === 'promoted') promoted.add(r.path);
    else problems.push(`promotion rejected ${r.path}: ${r.reason}`);
  }
}

for (const r of result.units || []) {
  const u = assigned.find((x) => x.coverage_id === r.coverage_id);
  if (!u) { problems.push(`unit not assigned to ${AGENT}: ${r.coverage_id}`); continue; }
  if (seen.has(r.coverage_id)) { problems.push(`duplicate unit ${r.coverage_id}`); continue; }
  seen.add(r.coverage_id);
  const checks = (r.checks || []).filter((c) => {
    const ok = AGENT_RE.test(c.agent_id || '') && Array.isArray(c.reviewed_paths) && c.reviewed_paths.length && c.reviewed_paths.every(relOk) &&
      ((c.method === 'source' && c.artifact === null) || (c.method === 'local' && promoted.has(c.artifact)));
    if (!ok) problems.push(`invalid check dropped in ${r.coverage_id}: ${JSON.stringify(c).slice(0, 200)}`);
    return ok;
  }).map((c) => ({ agent_id: c.agent_id, reviewed_paths: c.reviewed_paths, invariant: c.invariant, method: c.method, result: c.result, artifact: c.artifact }));
  const paths = [...new Set(checks.flatMap((c) => c.reviewed_paths))].sort();
  const fps = (r.candidate_fingerprints || []).filter((f) => FP_RE.test(f));
  const unresolved = (r.unresolved || []).filter((x) => typeof x === 'string' && x);
  let status = r.disposition;
  if (!checks.length || !paths.length) { problems.push(`${r.coverage_id}: no valid owned evidence — left in_progress`); continue; }
  if (status === 'candidate' && !fps.length) { problems.push(`${r.coverage_id}: candidate without fingerprint — left in_progress`); continue; }
  if (status === 'covered' && (fps.length || unresolved.length)) { problems.push(`${r.coverage_id}: covered with leftovers — left in_progress`); continue; }
  if (status === 'blocked' && (!unresolved.length || fps.length)) { problems.push(`${r.coverage_id}: invalid blocked — left in_progress`); continue; }
  if (!['covered', 'candidate', 'blocked'].includes(status)) { problems.push(`${r.coverage_id}: bad disposition — left in_progress`); continue; }
  Object.assign(u, { status, reviewed_paths: paths, local_checks: checks, result_fingerprints: fps, unresolved });
  u.hardening = (result.hardening || []).filter((h) => typeof h === 'string');
}
for (const u of assigned) if (!seen.has(u.coverage_id)) problems.push(`assigned unit missing from result: ${u.coverage_id}`);

// keep candidates and uncovered for the parent queue
fs.mkdirSync(path.join(OUT, 'candidates'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'candidates', `${AGENT}.json`), JSON.stringify(result.candidates || [], null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'candidates', `${AGENT}.uncovered.json`), JSON.stringify(result.uncovered || [], null, 2) + '\n');
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify({
  agent: AGENT,
  units: [...seen].length,
  statuses: assigned.map((u) => u.status),
  candidates: (result.candidates || []).map((c) => `${c.proposed_verdict}: ${c.fingerprint} — ${c.title}`),
  uncovered: (result.uncovered || []).length,
  hardening: (result.hardening || []).length,
  promoted: [...promoted],
  problems,
}, null, 2));
