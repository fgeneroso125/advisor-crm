import { E, sleep, askClaudeJSON } from "./lib.mjs";
const SUBS = ["personalfinance", "retirement", "financialindependence", "Fire", "AskFinancialAdvisors", "investing", "financialplanning"];
const QUERIES = ["looking for financial advisor", "need a financial advisor", "401k rollover", "rollover IRA", "fee-only fiduciary advisor", "retiring pension lump sum advice"];
const UA = "advisor-crm-prospector/1.0 (by u/your_reddit_username)";

async function token() {
  const r = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${E.REDDIT_CLIENT_ID}:${E.REDDIT_CLIENT_SECRET}`).toString("base64"), "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("Reddit auth failed " + r.status);
  return (await r.json()).access_token;
}

export async function redditLeads() {
  const tok = await token(), seen = new Map(), cutoff = Date.now() / 1000 - 26 * 3600;
  for (const sub of SUBS) for (const q of QUERIES) {
    try {
      const r = await fetch(`https://oauth.reddit.com/r/${sub}/search?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=day&limit=10`, { headers: { Authorization: "Bearer " + tok, "User-Agent": UA } });
      if (!r.ok) continue;
      for (const c of (await r.json()).data.children) {
        const p = c.data;
        if (p.created_utc < cutoff || !p.selftext || p.selftext === "[removed]" || p.author === "[deleted]") continue;
        seen.set(p.id, { author: p.author, sub: p.subreddit, title: p.title, text: p.selftext.slice(0, 1500), link: "https://www.reddit.com" + p.permalink });
      }
    } catch (e) { console.log("reddit search error", sub, q, e.message); }
    await sleep(700);
  }
  const posts = [...seen.values()], rows = [];
  console.log("reddit posts:", posts.length);
  for (let i = 0; i < posts.length; i += 25) {
    const chunk = posts.slice(i, i + 25);
    const items = chunk.map((p, j) => `#${j} r/${p.sub} u/${p.author}\nTITLE: ${p.title}\n${p.text}`).join("\n---\n");
    try {
      const out = await askClaudeJSON(`You are a prospecting analyst for a nationwide RIA. Ideal client: age 35+, investable assets over $100,000, rolling over a retirement account or looking for a financial advisor.
From the Reddit posts below, return only posts whose author plausibly fits and is genuinely seeking advice or an advisor. Exclude under-35s, clearly under $100k, spam, advisors advertising, and purely educational questions. Never invent facts. Return ONLY a JSON array of:
{"i":post number,"age":number|null,"assets":number|null,"intent":"Rollover"|"Advisor seeker"|"Both","score":60-100,"signal":"one sentence why","draft":"short, helpful, non-promotional reply under 90 words, no performance claims or guarantees, free conversation only as a soft option"}
POSTS:\n${items}`);
      for (const m of out) {
        const p = chunk[m.i]; if (!p) continue;
        rows.push({ name: "u/" + p.author, age: m.age, assets: m.assets, intent: m.intent, score: m.score, source: "Reddit r/" + p.sub, link: p.link, consent: "Public post. Reply publicly or via Reddit per platform rules; no private contact data held.", signal: m.signal, draft: m.draft });
      }
    } catch (e) { console.log("reddit scoring error:", e.message); }
  }
  return { found: posts.length, rows };
}
