// Builds the seeded coverage ledger from units.json (security-audit skill, RECONNAISSANCE.md).
const fs = require('fs');
const units = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const enc = (s) => Array.from(Buffer.from(s.normalize('NFC'), 'utf8')).map((b) => {
  const c = String.fromCharCode(b);
  return /[A-Za-z0-9\-._~]/.test(c) ? c : '%' + b.toString(16).toUpperCase().padStart(2, '0');
}).join('');
const companionOf = (b) => b.split('#')[0];
const out = units.map((u) => {
  const refs = { surface: u.surface[1], boundary: u.boundary[1], subsystem: u.subsystem[1], attack_class: u.attack };
  const companions = new Set([...(u.comp || []), ...(u.companion_class ? [u.attack] : [])].map(companionOf).filter((f) => f !== 'ATTACK-CLASSES.md'));
  const selected = [...new Set([...(u.companion_class ? [u.attack] : []), ...(u.comp || [])])];
  for (const f of companions) selected.push(`${f}#Core discipline`, `${f}#Universal moves`, `${f}#Validation rules`);
  return {
    coverage_id: [refs.surface, refs.boundary, refs.subsystem, refs.attack_class].map(enc).join('::'),
    canonical_refs: refs,
    surface: u.surface[0], boundary: u.boundary[0], subsystem: u.subsystem[0], attack_class: u.attack.split('#')[1],
    starting_paths: u.paths,
    ordinary_attack_class_block: u.attack.startsWith('ATTACK-CLASSES.md') ? u.attack : null,
    selected_companion_blocks: selected,
    excluded_blocks: [
      { block: 'MEMORY-SAFETY-AND-BINARY.md#Core discipline', reason: 'no native or unsafe-memory code in the target' },
      { block: 'AI-AND-LLM.md#Core discipline', reason: 'no model, prompt or tool-calling component' },
      { block: 'PROTOCOLS-RPC-AND-MESSAGING.md#Core discipline', reason: 'no queues, brokers or custom RPC protocols; PostgREST functions are covered by access-control units' },
      { block: 'DESKTOP-MOBILE-AND-LOCAL-IPC.md#Core discipline', reason: 'web-only target with no native app or local IPC' },
    ],
    prior_status: 'none', attempts: [], wave: 1, status: 'planned', agent_id: null,
    reviewed_paths: [], local_checks: [], result_fingerprints: [], unresolved: [],
    hunter_group: u.h,
  };
}).sort((a, b) => (a.coverage_id < b.coverage_id ? -1 : a.coverage_id > b.coverage_id ? 1 : 0));
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2) + '\n');
console.log(`${out.length} units`);
