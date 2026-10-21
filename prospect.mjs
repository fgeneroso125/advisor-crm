// Daily prospecting orchestrator. Zero dependencies (Node 20+).
import { E, sb } from "./lib.mjs";
import { redditLeads } from "./reddit.mjs";
import { seamlessLeads } from "./seamless.mjs";

const etHour = +new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
if (!E.FORCE && etHour !== 7) { console.log("Not 7am ET, skipping."); process.exit(0); }

let found = 0, all = [], notes = [];
for (const [name, fn, enabled] of [["Reddit", redditLeads, E.REDDIT_CLIENT_ID], ["Seamless", seamlessLeads, E.SEAMLESS_API_KEY]]) {
  if (!enabled) { notes.push(name + ": not configured"); continue; }
  try { const r = await fn(); found += r.found; all.push(...r.rows); notes.push(`${name}: ${r.found} found, ${r.rows.length} qualified`); }
  catch (e) { console.error(name, "failed:", e.message); notes.push(`${name}: ERROR ${e.message.slice(0, 120)}`); }
}

let added = 0, inserted = [];
if (all.length) {
  const r = await sb("leads?on_conflict=link", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(all.map(x => ({ stage: "New Lead", ...x }))) });
  if (!r.ok) { console.error("Supabase insert", r.status, await r.text()); process.exit(1); }
  inserted = await r.json(); added = inserted.length;
}
await sb("agent_runs", { method: "POST", body: JSON.stringify({ found, added, note: notes.join(" | ") }) });
console.log(notes.join("\n"), "\nadded:", added);

if (E.RESEND_API_KEY && E.DIGEST_EMAIL) {
  const list = inserted.sort((a, b) => b.score - a.score).map(l => `<li><b>${l.name}</b> (${l.score}) – ${l.intent}, ${l.source}<br>${l.signal}</li>`).join("");
  await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + E.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Advisor CRM <onboarding@resend.dev>", to: [E.DIGEST_EMAIL], subject: `${added} new prospects today`, html: (added ? `<ul>${list}</ul><p>Drafts are in your CRM for review.</p>` : "<p>No new qualified prospects today.</p>") + `<p style="color:#888;font-size:12px">${notes.join("<br>")}</p>` }),
  });
}
