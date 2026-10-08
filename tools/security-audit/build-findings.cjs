const fs = require('fs'); const path = require('path');
const OUT = process.argv[2];
const recs = [];
for (const d of fs.readdirSync(path.join(OUT, 'agents')).filter((x) => /^v\d/.test(x)).sort()) {
  const f = path.join(OUT, 'agents', d, 'result.json');
  if (!fs.existsSync(f)) { console.log('pending', d); continue; }
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!r.record || r.record.verdict !== r.decision) { console.log('MALFORMED', d); continue; }
  recs.push(r.record);
}
// Phase 5 replacements the parent judged non-material (wording/line corrections only), applied directly.
const applied = fs.existsSync(path.join(OUT, 'phase5-applied.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'phase5-applied.json'), 'utf8')) : [];
for (const id of applied) {
  const r = JSON.parse(fs.readFileSync(path.join(OUT, 'agents', id, 'result.json'), 'utf8'));
  const i = recs.findIndex((x) => x.fingerprint === r.record.fingerprint && x.verdict === r.record.verdict);
  if (i < 0) throw new Error('replacement does not match an existing record of the same verdict: ' + id);
  recs[i] = r.record; console.log('applied non-material replacement from', id);
}
// Non-material structural correction: only the last trace step may be a sink (earlier co-sinks become propagation).
for (const r of recs) if (r.trace) r.trace.forEach((t, i) => { if (t.kind === 'sink' && i < r.trace.length - 1) t.kind = 'propagation'; });
recs.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));
fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(recs, null, 2) + '\n');
console.log(recs.map((r) => `${r.verdict}\t${r.severity ? r.severity.overall_severity : '-'}\t${r.fingerprint}`).join('\n'));
