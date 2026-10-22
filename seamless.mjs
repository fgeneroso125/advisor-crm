import { E, sleep, sb, getState, setState, askClaudeJSON } from "./lib.mjs";
const BASE = "https://api.seamless.ai/api/client/v1";
const CAP = +(E.SEAMLESS_DAILY_CAP || 30);          // total credits to spend per day (search + research)
const SENIORITY = ["Manager", "Director", "VP", "C-Level"];   // "management and above"
const SEARCHES = [
  // Job changers first: a recent new hire often has an old employer 401(k) to roll over.
  { key: "jobchange", label: "Job change", limit: 30, body: { jobChanges: { changeType: "New Hire", dayRange: "Last 60 Days" } }, share: 0.6 },
  { key: "mgmt", label: "Management", limit: 20, body: {}, share: 0.4 },
];

async function api(path, { method = "GET", body } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(BASE + path, { method, headers: { Token: E.SEAMLESS_API_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { await sleep(15000); continue; }
    const credits = r.headers.get("X-PublicAPI-Credits");
    if (credits !== null) console.log("seamless credits header:", credits);
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (r.status === 422) throw new Error("Seamless: insufficient credits or license: " + text.slice(0, 300));
    if (!r.ok) throw new Error(`Seamless ${path} ${r.status}: ${text.slice(0, 300)}`);
    return json;
  }
  throw new Error("Seamless rate limited");
}

const estAge = c => {
  const dates = [c.startedAtCurrentCompany, c.formerStartedAt, ...(c.jobHistory || []).map(j => j.startedAt)].filter(Boolean).map(d => new Date(d).getTime()).filter(Number.isFinite);
  if (!dates.length) return null;
  return Math.round(22 + (Date.now() - Math.min(...dates)) / (365.25 * 864e5));   // rough: career start ~ age 22
};

export async function seamlessLeads() {
  // Links we already hold, so we never spend credits twice on the same person.
  const ex = await sb("leads?select=link&source=like.Seamless*&limit=10000");
  const known = new Set((ex.ok ? await ex.json() : []).map(x => x.link));

  let budget = CAP, picks = [];
  for (const s of SEARCHES) {
    const stateKey = "seamless_next_" + s.key;
    const body = { limit: s.limit, contactCountry: ["United States"], seniority: SENIORITY, nextToken: await getState(stateKey), ...s.body };
    let res;
    try { res = await api("/search/contacts", { method: "POST", body }); }
    catch (e) { if (body.nextToken) { await setState(stateKey, null); res = await api("/search/contacts", { method: "POST", body: { ...body, nextToken: null } }); } else throw e; }
                  budget -= 1;     // each search call appears to cost about 1 credit
    await setState(stateKey, res.supplementalData?.nextToken || null);
    const fresh = (res.data || []).filter(c => c.searchResultId && !known.has(c.liUrl));
    console.log(`seamless ${s.key}: ${res.data?.length || 0} results, ${fresh.length} new`);
    picks.push({ s, fresh });
  }
  budget = Math.max(0, budget);
  const ids = [];
  const meta = new Map();
  for (const { s, fresh } of picks) {
    for (const c of fresh.slice(0, Math.floor(budget * s.share))) { ids.push(c.searchResultId); meta.set(c.searchResultId, { ...c, _kind: s.label }); }
  }
  console.log("seamless research requests:", ids.length, "of budget", budget);
  if (!ids.length) return { found: 0, rows: [] };

  const rq = await api("/contacts/research", { method: "POST", body: { searchResultIds: ids } });
  const requestIds = rq.requestIds || [];
  const done = new Map();
  for (let t = 0; t < 30 && done.size < requestIds.length; t++) {      // poll up to ~5 minutes
    await sleep(10000);
    const p = await api("/contacts/research/poll?requestIds=" + encodeURIComponent(requestIds.join(",")));
    for (const d of p.data || []) if (d.status === "done" && d.contact) done.set(d.requestId, d);
    if ((p.data || []).every(d => !["queued", "researching"].includes(d.status))) break;
  }
  console.log("seamless researched:", done.size);

  const people = [...done.values()].map(d => {
    const c = d.contact, m = meta.get(d.searchResultId) || {};
    return { c, kind: m._kind || "Management", age: estAge(c) };
  }).filter(p => p.c.lIProfileUrl || p.c.contactId)
    .filter(p => p.age === null ? ["Director", "VP", "C-Level"].includes(p.c.seniority) : p.age >= 35);

  const rows = [];
  for (let i = 0; i < people.length; i += 6) {
    const chunk = people.slice(i, i + 6);
    const items = chunk.map((p, j) => `#${j} ${p.c.fullName} | ${p.c.title} at ${p.c.company} (${p.c.companyIndustry || "?"}, ${p.c.companyStaffCountRange || "?"}) | seniority ${p.c.seniority} | ${p.c.contactLocation?.city || ""} ${p.c.contactLocation?.stateAbbr || ""} | est age ${p.age ?? "?"} | list: ${p.kind} | job change: ${p.c.jobChangeAlert || "none"}${p.c.formerCompany ? `, left ${p.c.formerCompany} (${p.c.formerEndedAt || "?"})` : ""} | time at company ${p.c.timeAtCompany || "?"}`).join("\n");
    try {
      const out = await askClaudeJSON(`You are a prospecting analyst for a nationwide RIA. Target: working professionals in management or above, age 35+, likely with $100k+ in retirement assets. Recent job changers (who left an employer) often have an old 401(k) to roll over.
Score each person 0-100 for fit (job change in last 60 days is a strong positive; senior roles, 45+, mid/large employers positive). Do NOT claim to know their assets or accounts; keep "assets" null. Return ONLY a JSON array of:
{"i":number,"score":0-100,"intent":"Rollover"|"Advisor seeker","signal":"one factual sentence (e.g. 'Joined X in the last 60 days after leaving Y; est. age 47')","draft":"short, warm, professional first-touch email under 100 words. If a job change, lightly mention that old workplace retirement accounts are easy to overlook, with no assumption they have one. No performance claims, guarantees, or urgency. Offer a free intro conversation. Include no unsubscribe text; the sender adds it."}
PEOPLE:\n${items}`);
      for (const m of out) {
        const p = chunk[m.i]; if (!p || m.score < 50) continue;
        const c = p.c, mobile = /mobile/i.test(c.contactPhone1DataType || "");
        rows.push({
          name: c.fullName, age: p.age, assets: null, intent: m.intent, score: m.score,
          email: c.email1EmailAI === "invalid" ? null : (c.email || c.email1 || null), phone: c.contactPhone1 || null,
          source: "Seamless " + p.kind, link: c.lIProfileUrl || "seamless:" + c.contactId,
          consent: "Seamless business-contact data" + (mobile ? " (mobile number: no calls/texts without prior consent; check Do-Not-Call)" : "") + ". Email needs CAN-SPAM opt-out and physical address.",
          signal: m.signal + (p.age ? ` (age is an estimate from career start)` : ""), draft: m.draft,
        });
      }
    } catch (e) { console.log("seamless scoring error:", e.message); }
  }
  return { found: done.size, rows };
}
