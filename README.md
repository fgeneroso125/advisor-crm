# Advisor CRM: setup (about 30 minutes, one time)

## 1. Supabase (database + login)
1. supabase.com > New project (free tier is fine). Save the database password.
2. SQL Editor > New query > paste `schema.sql`. **Change both `YOUR_EMAIL` values to your login email first.** Run.
3. Project Settings > API: copy the **Project URL**, the **anon public key**, and the **service_role key** (secret; never put it in index.html).
4. Authentication > URL Configuration: set Site URL to your GitHub Pages address (step 3 below).

## 2. Keys you need
- **Anthropic API key:** console.anthropic.com
- **Reddit app:** reddit.com/prefs/apps > create "script" app (any redirect URL). Copy client ID and secret. Edit the User-Agent in `scripts/prospect.mjs` with your Reddit username. Note: Reddit's terms require approval for commercial use of its API; apply via their API access form before relying on this for your business.
- **Seamless API key:** Seamless > Settings > Public API > API Key tab. Add as secret `SEAMLESS_API_KEY`. Daily credit cap defaults to 30 (searches + researched contacts); change it under Settings > Variables > Actions as `SEAMLESS_DAILY_CAP`. **First test: set it to 5.**
- **Resend key (email digest):** resend.com, free tier. Sends to your own email from onboarding@resend.dev.

## 3. GitHub
1. Create a repo and upload all these files (keep the `.github` and `scripts` folders).
2. Settings > Secrets and variables > Actions > add: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `SEAMLESS_API_KEY`, `RESEND_API_KEY`, `DIGEST_EMAIL`. Also re-run the new `agent_state` lines at the bottom of `schema.sql` if you already ran the earlier version.
3. In `index.html`, paste your Supabase URL and **anon** key at the top of the script. (The anon key is designed to be public; row-level security limits data to your email.)
4. Settings > Pages > deploy from the main branch. Your CRM is at `https://USERNAME.github.io/REPO/`.
5. Actions tab > "Daily prospecting" > Run workflow to test now. After that it runs itself every day at 7am ET.

## Notes
- GitHub may pause scheduled workflows after 60 days of repo inactivity; open the Actions tab and re-enable if that happens.
- Seamless runs automatically via its API: job changers (last 60 days) plus managers and above in the U.S. Age is estimated from career start (roughly 22 + years worked), not looked up. Contacts already in the CRM are never re-researched.
- Sales Navigator cannot be automated without breaking LinkedIn's terms; export a CSV and use **Import CSV**.
- Reddit leads are usernames and post links, not contact details. Outreach is a public reply or a Reddit message under Reddit's rules. Drafts are suggestions only; nothing is sent automatically.
- Have your compliance process review outreach templates (SEC Marketing Rule, CAN-SPAM, TCPA).
