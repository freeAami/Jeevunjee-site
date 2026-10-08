const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const v = [];
  p.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) v.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => v.push('ERR ' + e.message));
  for (const u of ['http://127.0.0.1:4180/', 'http://127.0.0.1:4180/#/portal']) { await p.goto(u); await p.waitForTimeout(2500); }
  await p.getByText('Preview as a trustee').click(); await p.waitForTimeout(1500);
  await p.goto('http://127.0.0.1:4180/#/portal/applications'); await p.waitForTimeout(1500);
  console.log('title', await p.title(), '| h1', await p.locator('h1').first().textContent());
  console.log(v.length ? v.join('\n') : 'no CSP violations');
  await b.close();
})();
