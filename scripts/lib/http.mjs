/*
 * Shared HTTP helper for the build-time provider modules.
 * - Per-host request spacing (each provider declares its own rate limit)
 * - Retries on network errors, 5xx and 429 (honours Retry-After)
 * - JSON parsing with clear errors
 */
const hosts = new Map(); // host -> { minGap, last, chain }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Declare a host's rate limit: at most `perSecond` requests per second. */
export function limitHost(host, perSecond) {
  hosts.set(host, { minGap: 1000 / perSecond, last: 0, chain: Promise.resolve() });
}

async function waitTurn(host) {
  const h = hosts.get(host);
  if (!h) return;
  const turn = h.chain.then(async () => {
    const wait = h.last + h.minGap - Date.now();
    if (wait > 0) await sleep(wait);
    h.last = Date.now();
  });
  h.chain = turn.catch(() => {});
  return turn;
}

/**
 * fetch + JSON with retries.
 * @param {string} url
 * @param {RequestInit & {retries?: number, okStatuses?: number[]}} opts
 * @returns {Promise<{status:number, data:any, headers:Headers}>}
 */
export async function getJSON(url, opts = {}) {
  const { retries = 4, okStatuses = [], ...init } = opts;
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await waitTurn(host);
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
    } catch (err) {
      if (attempt >= retries) throw new Error(`${host}: ${err.message}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = +res.headers.get("retry-after");
      await sleep(ra ? ra * 1000 : 1500 * 2 ** attempt);
      continue;
    }
    if (!res.ok && !okStatuses.includes(res.status)) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      const err = new Error(`${host} ${res.status}: ${body}`);
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: res.status, data, headers: res.headers };
  }
}

/** Run fn over items with limited concurrency, keeping order; failures become null. */
export async function pool(items, limit, fn, onError = (e) => console.warn(`! ${e.message}`)) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { onError(e); out[i] = null; }
    }
  }));
  return out;
}

export const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);
