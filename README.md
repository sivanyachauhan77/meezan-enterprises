# Scale Ops — Netlify + Supabase version

Same tracker (Dashboard, Branches, New orders, Restamping, Replacements,
logins, notifications, CSV import) rebuilt to run on Netlify. Two differences
from the Railway version:

- **Data lives in Supabase** (a free hosted Postgres database) instead of a
  file on disk — Netlify Functions can't keep files, so this is required, not
  optional.
- **Updates refresh automatically every ~7 seconds** instead of instantly.
  Netlify Functions can't hold a live WebSocket connection open, so true
  instant push isn't possible here — a teammate's change appears within a
  few seconds instead of immediately.

---

## 1. Create the database (Supabase — free)

1. Go to https://supabase.com → sign up → **New project**.
2. Pick any name and a database password (save that password somewhere safe).
3. Once the project finishes setting up, go to **SQL Editor** (left sidebar)
   → **New query**.
4. Open `supabase.sql` from this folder, copy all of it, paste it in, click
   **Run**. This creates the tables the app needs.
5. Go to **Project Settings** (gear icon) → **API**. Copy two values, you'll
   need them in step 3 below:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role key** (a long secret string — keep this private, never
     put it in frontend code or share it publicly)

## 2. Put the project on GitHub

1. Go to https://github.com/new → create a repository (e.g. `scale-ops-netlify`,
   set to Private).
2. Upload every file in this folder to that repository (GitHub's web
   interface: **Add file** → **Upload files**, drag the whole folder in).

## 3. Deploy on Netlify

1. Go to https://app.netlify.com → sign up/log in.
2. **Add new site** → **Import an existing project** → connect GitHub →
   choose the repository you just created.
3. Netlify should auto-detect the settings from `netlify.toml`. Click
   **Deploy**.
4. Once it's deployed, go to **Site configuration** → **Environment
   variables** → add these:
   - `SUPABASE_URL` — the Project URL from step 1.5
   - `SUPABASE_SERVICE_ROLE_KEY` — the service_role key from step 1.5
   - `JWT_SECRET` — any long random text, e.g. `9f2-my-own-secret-83kd`
   - `SETUP_SECRET` — another random string, just for you — this protects the
     one-time setup step below from anyone else finding your site and
     creating an account
5. Go to **Deploys** → trigger a redeploy so the new environment variables
   take effect (**Trigger deploy** → **Deploy site**).
6. Your site is now live at something like
   `https://your-site-name.netlify.app` — find the exact address on the
   Netlify site overview page. You can rename it or add a custom domain
   under **Domain settings**.

## 4. Create your first login

Netlify has no shell to run a seed script, so this is done through a small
setup page instead:

1. Visit `https://your-site-name.netlify.app/setup.html`
2. Enter the `SETUP_SECRET` you set in step 3.4, plus a username and password
   for your first account.
3. Submit. This only works once — if you try again later, it will refuse
   (an account already exists), so it's safe to leave this page's URL
   sitting around.
4. Go to `https://your-site-name.netlify.app` and sign in.

## 5. Loading your existing data

Same as before — sign in, then for each tab (**Branches** first, since the
others look up branch names by SOL ID) click **Import** and upload the
matching CSV: `import_branches.csv`, `import_orders.csv`,
`import_restampings.csv`, `import_replacements.csv`.

## 6. Adding your team

**Settings** (bottom of the sidebar) → **Add teammate** → give them a
username and temporary password directly. Ask them to change it after their
first login (Settings → Change password).

## 7. A couple of things worth knowing

- **Updates aren't instant.** Everyone's screen refreshes roughly every 7
  seconds automatically. If you need truly instant updates across everyone's
  screen the moment something changes, that's the one thing the Railway
  version does that this one doesn't (WebSockets aren't available on
  Netlify's serverless functions).
- **Supabase's free tier** is generous for a small team's usage but does
  have limits (project pauses after a week of no activity on the free tier,
  and there are some usage-based upgrade tiers) — worth knowing about before
  you rely on this for daily work. If it ever matters, upgrading Supabase's
  plan removes those limits without needing to change any of this code.
- Real email/SMS/WhatsApp sending is still a separate step, same as before —
  it would be a Netlify **scheduled function** (runs once a day, checks due
  dates, sends through Twilio/SendGrid). I can build that once this version
  is confirmed working.

## 8. Testing changes locally (optional)

```
npm install -g netlify-cli
npm install
netlify dev
```

This runs the functions and static site locally at http://localhost:8888,
using a `.env` file in this folder for the same environment variables listed
in step 3.4.
