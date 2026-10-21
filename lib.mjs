export const E = process.env;
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const sb = (path, opt = {}) => fetch(E.SUPABASE_URL + "/rest/v1/" + path, {
  ...opt,
  headers: { apikey: E.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + E.SUPABASE_SERVICE_KEY, "Content-Type": "application/json", ...(opt.headers || {}) },
});

export async function getState(key) {
  const r = await sb(`agent_state?key=eq.${encodeURIComponent(key)}&select=value`);
  const j = r.ok ? await r.json() : [];
  return j[0]?.value ?? null;
}
export async function setState(key, value) {
  await sb("agent_state?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value }) });
}

// Ask Claude for a JSON array back.
export async function askClaudeJSON(prompt, max_tokens = 4000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": E.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error("Claude API " + r.status + " " + await r.text());
  const t = (await r.json()).content.filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));
}
