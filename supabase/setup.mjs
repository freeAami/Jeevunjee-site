#!/usr/bin/env node
// One-time Supabase setup for the Jeevunjee portal, run on your own computer.
//
//   node supabase/setup.mjs --admins first@gmail.com,second@gmail.com [--import path/to/import.sql]
//
// It opens Supabase in your browser so you can create an access token, then — using that token, which never
// leaves this computer — it:
//   1. picks (or creates) the Supabase project,
//   2. checks the project is empty or already ours, so nothing unrelated is overwritten,
//   3. creates the tables, security rules and file storage (schema.sql),
//   4. registers the trustees' emails,
//   5. optionally imports the existing students,
//   6. sets the sign-in settings (no confirmation emails; the site's address),
//   7. prints the Project URL and public key the website needs, and writes them to .env.production.
//
// Needs Node 18 or newer. No packages to install.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.SUPABASE_API_BASE || 'https://api.supabase.com';
const SITE_URL = 'https://freeaami.github.io/Jeevunjee-site/';
const TOKEN_PAGE = 'https://supabase.com/dashboard/account/tokens';
const OUR_TABLES = ['trusts', 'admin_emails', 'applications', 'students', 'profiles', 'courses', 'instalments', 'payments', 'documents', 'notes'];

// ---------- small helpers ----------
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  process.stdout.write(q);
  const { value, done } = await lines.next();
  if (done) throw new Error('No input — run this in a terminal.');
  return value.trim();
};
const say = (s = '') => console.log(s);
const step = (n, s) => console.log(`\n\x1b[1m${n}. ${s}\x1b[0m`);
const ok = (s) => console.log(`   \x1b[32m✓\x1b[0m ${s}`);
const warn = (s) => console.log(`   \x1b[33m!\x1b[0m ${s}`);
const die = (s) => {
  console.error(`\n\x1b[31m✗ ${s}\x1b[0m\n`);
  process.exit(1);
};

function openBrowser(url) {
  if (flag('no-browser')) return;
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

let TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.msg)) || text || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return data;
}
const sql = (ref, query) => api('POST', `/v1/projects/${ref}/database/query`, { query });
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- main ----------
async function main() {
  say('\n\x1b[1mJeevunjee portal — Supabase setup\x1b[0m');
  say('Nothing here is sent anywhere except to Supabase, over HTTPS.');

  const admins = (arg('admins') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) die('Add the trustees’ emails, e.g.  --admins first@gmail.com,second@gmail.com');
  if (admins.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) die(`That doesn’t look like an email list: ${admins.join(', ')}`);
  const importPath = arg('import') ? resolve(arg('import')) : null;
  if (importPath && !existsSync(importPath)) die(`Can’t find the import file: ${importPath}`);

  // 1. token
  step(1, 'Supabase access token');
  if (!TOKEN) {
    say(`   Opening ${TOKEN_PAGE}`);
    say('   → click “Generate new token”, name it “jeevunjee-setup”, then copy it.');
    openBrowser(TOKEN_PAGE);
    TOKEN = await ask('   Paste the token here and press Enter: ');
  }
  if (!TOKEN.startsWith('sbp_')) warn('Tokens usually start with “sbp_” — trying anyway.');

  // 2. project — with --project we go straight to it (works with tokens limited to one project)
  step(2, 'Choose the project');
  let project;
  if (arg('project')) {
    try {
      project = await api('GET', `/v1/projects/${arg('project')}`);
    } catch (e) {
      die(`Couldn’t open project “${arg('project')}” with this token. Check the ID (the part after /project/ in the dashboard address) and that the token covers it. (${e.message})`);
    }
  } else {
    let projects;
    try {
      projects = await api('GET', '/v1/projects');
    } catch (e) {
      if (/projects_read|403/.test(e.message))
        die('This token can’t list projects (it’s limited to one project). Add  --project YOUR_PROJECT_ID  to the command — the ID is the part after /project/ in the dashboard address.');
      die(`Supabase didn’t accept that token. (${e.message})`);
    }
    ok(`Signed in — ${projects.length} project(s) found`);
    projects.forEach((p, i) => say(`   ${i + 1}. ${p.name}  (${p.ref || p.id}, ${p.region}, ${p.status})`));
    say(`   ${projects.length + 1}. Create a new project called “jeevunjee” (recommended if the others are used for anything else)`);
    const pick = Number(await ask(`   Which one? [1-${projects.length + 1}]: `));
    if (!Number.isInteger(pick) || pick < 1 || pick > projects.length + 1) die('Please run again and type one of the numbers.');
    project = pick <= projects.length ? projects[pick - 1] : await createProject();
  }
  const ref = project.ref || project.id;
  await waitHealthy(ref);
  ok(`Using “${project.name}” (${ref})`);

  // 3. safety check
  step(3, 'Checking the project is safe to set up');
  const [{ t: tablesRaw }] = await sql(ref, `select coalesce(json_agg(table_name order by table_name), '[]') as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
  const tables = json(tablesRaw);
  const ours = tables.includes('students') && tables.includes('instalments');
  // Until the portal's own tables exist, ANY existing table (even one called "profiles") belongs to something else.
  const foreign = ours ? tables.filter((t) => !OUR_TABLES.includes(t)) : tables;
  const [{ t: trigRaw }] = await sql(ref, `select coalesce(json_agg(tgname), '[]') as t from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal and tgname <> 'on_auth_user_created'`);
  const otherTriggers = json(trigRaw);
  const [{ t: ourTrigRaw }] = await sql(ref, `select to_json(exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created')) as t`);
  const theirSignupTrigger = json(ourTrigRaw) && !ours;
  if (foreign.length || otherTriggers.length || theirSignupTrigger) {
    warn('This project already has things that aren’t part of the portal:');
    if (foreign.length) warn(`tables: ${foreign.join(', ')}`);
    if (otherTriggers.length || theirSignupTrigger) warn('a sign-up trigger on its users');
    warn('Setting up here could interfere with whatever uses them. Choose “Create a new project” instead,');
    warn('unless you’re sure this project is only for Jeevunjee.');
    const answer = await ask('   Type “use anyway” to continue here, or press Enter to stop: ');
    if (answer.toLowerCase() !== 'use anyway') die('Stopped — nothing was changed. Run again and pick “Create a new project”.');
  } else {
    ok(ours ? 'Portal tables already here — updating them' : 'Project is empty');
  }

  // 4. schema
  step(4, 'Creating tables, security rules and file storage');
  await sql(ref, readFileSync(join(HERE, 'schema.sql'), 'utf8'));
  const [{ t: check }] = await sql(ref, `select json_build_object('trusts', (select count(*) from public.trusts), 'buckets', (select count(*) from storage.buckets where id in ('files','applications'))) as t`);
  const c = json(check);
  if (Number(c.trusts) < 2 || Number(c.buckets) < 2) die(`Schema ran but something is missing: ${JSON.stringify(c)}`);
  ok('Tables, the two trusts, security rules and private storage are in place');

  // 5. trustees
  step(5, 'Registering the trustees');
  const values = admins.map((e) => `('${e.replace(/'/g, "''")}')`).join(', ');
  await sql(ref, `insert into public.admin_emails (email) values ${values} on conflict (email) do nothing`);
  ok(admins.join(', '));

  // 6. import
  step(6, 'Existing students');
  if (importPath) {
    await sql(ref, readFileSync(importPath, 'utf8'));
    const [{ t: n }] = await sql(ref, 'select to_json(count(*)) as t from public.students');
    ok(`${json(n)} student(s) in the portal now`);
  } else {
    say('   Skipped (add  --import path/to/import-existing-students.sql  to load them).');
  }

  // 7. auth settings
  step(7, 'Sign-in settings');
  try {
    await api('PATCH', `/v1/projects/${ref}/config/auth`, {
      site_url: SITE_URL,
      uri_allow_list: `${SITE_URL}**`,
      mailer_autoconfirm: true,
    });
    ok('Email confirmation off; site address and password-reset link set');
  } catch (e) {
    warn(`Couldn’t change these automatically (${e.message}).`);
    warn('Do it by hand: Authentication → Sign In / Providers → Email → turn off “Confirm email”;');
    warn(`Authentication → URL Configuration → Site URL ${SITE_URL} and redirect URL ${SITE_URL}**`);
  }

  // 8. keys
  step(8, 'The website’s keys');
  const keys = await api('GET', `/v1/projects/${ref}/api-keys?reveal=false`);
  const pub =
    keys.find((k) => k.name === 'anon' && k.api_key) ||
    keys.find((k) => k.type === 'publishable' && k.api_key && !String(k.api_key).includes('·'));
  if (!pub) die('Couldn’t read the anon/publishable key — copy it from Project Settings → API Keys instead.');
  const url = `https://${ref}.supabase.co`;
  const envPath = join(HERE, '..', '.env.production');
  writeFileSync(envPath, `# Public — safe to commit. The portal's database (see supabase/SETUP.md).\nVITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${pub.api_key}\n`);
  ok(`Written to ${envPath}`);

  say('\n\x1b[1mDone. Send these two lines back (they are public, not secret):\x1b[0m\n');
  say(`VITE_SUPABASE_URL=${url}`);
  say(`VITE_SUPABASE_ANON_KEY=${pub.api_key}`);
  say('\nThen delete the access token you made: ' + TOKEN_PAGE);
  if (project.__dbPassword) say(`\nDatabase password for the new project (save it somewhere safe): ${project.__dbPassword}`);
  say('');
  rl.close();
}

async function createProject() {
  const orgs = await api('GET', '/v1/organizations');
  if (!orgs.length) die('Your Supabase account has no organisation — create one at supabase.com first.');
  let org = orgs[0];
  if (orgs.length > 1) {
    orgs.forEach((o, i) => say(`   ${i + 1}. ${o.name}`));
    const n = Number(await ask(`   Which organisation? [1-${orgs.length}]: `));
    org = orgs[n - 1] || die('Please run again and type one of the numbers.');
  }
  const dbPassword = randomBytes(18).toString('base64url');
  say('   Creating “jeevunjee” in South Asia (Mumbai)…');
  const p = await api('POST', '/v1/projects', { name: 'jeevunjee', organization_id: org.id, region: 'ap-south-1', db_pass: dbPassword });
  p.__dbPassword = dbPassword;
  return p;
}

async function waitHealthy(ref) {
  for (let i = 0; i < 60; i++) {
    const p = await api('GET', `/v1/projects/${ref}`);
    if (p.status === 'ACTIVE_HEALTHY') return;
    if (/PAUSED|INACTIVE/.test(p.status)) die('That project is paused — open it at supabase.com, press “Restore”, then run this again.');
    if (i === 0) say(`   Waiting for the project to be ready (${p.status})…`);
    await sleep(5000);
  }
  die('The project took too long to start. Try again in a few minutes.');
}

main().catch((e) => die(e.message));
