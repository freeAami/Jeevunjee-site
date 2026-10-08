# CSP check

Serves `dist/` with the headers from `vercel.json`, opens the site and portal in Chromium, and reports any
Content-Security-Policy violations or page errors.

```bash
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build     # demo mode, no live database calls
node tools/csp-check/serve.cjs dist vercel.json &            # http://127.0.0.1:4180
node tools/csp-check/check.cjs                               # needs Playwright (path at the top of the file)
```
