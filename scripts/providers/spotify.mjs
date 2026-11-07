/*
 * Spotify (optional, build-time) — supplementary album artwork and "Listen on Spotify" links via the
 * official Web API (client-credentials flow). Never scrapes Spotify.
 * Enabled only when SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set (GitHub Actions secrets).
 * The access token is kept in memory, renewed by expires_in, and never published.
 * Spotify's Developer Terms require showing Spotify branding next to Spotify content and linking back.
 */
import { getJSON, limitHost } from "../lib/http.mjs";

limitHost("api.spotify.com", 5);
let token = null;

export const spotifyConfigured = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

async function accessToken() {
  if (token && Date.now() < token.expiresAt) return token.value;
  const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const { data } = await getJSON("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", retries: 2,
  });
  if (!data?.access_token) throw new Error("Spotify: no access token");
  token = { value: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 };
  return token.value;
}

/** Find an album by title + artist; returns { url, image } only on an exact (normalised) title match. */
export async function findAlbum(title, artist) {
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const q = encodeURIComponent(`album:${title} artist:${artist}`);
  const { data } = await getJSON(`https://api.spotify.com/v1/search?type=album&limit=5&q=${q}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` }, okStatuses: [404],
  });
  const hit = (data?.albums?.items || []).find((a) => norm(a.name) === norm(title) &&
    a.artists.some((x) => norm(artist).includes(norm(x.name))));
  return hit ? { url: hit.external_urls?.spotify || null, image: hit.images?.[1]?.url || hit.images?.[0]?.url || null } : null;
}
