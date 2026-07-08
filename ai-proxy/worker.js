// ─────────────────────────────────────────────────────────────────────────────
//  Our New Home — "Realistic screenshot" proxy  (Cloudflare Worker)
//
//  Why this exists: Google says never put an API key in client-side code. This tiny
//  Worker keeps the Gemini key SERVER-SIDE. The app sends it a screenshot; the Worker
//  adds the secret key, calls Google's "Nano Banana" image model, and returns the photo.
//  The key lives in a Cloudflare *secret* (GEMINI_KEY) — never in this file or the repo.
//
//  Deploy (dashboard, no CLI needed):
//    1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → deploy the
//       starter, then "Edit code", paste THIS file, and Deploy.
//    2. That Worker → Settings → Variables and Secrets → add a SECRET named
//         GEMINI_KEY   = your Gemini key (from aistudio.google.com/apikey)
//    3. Copy the Worker URL (https://<name>.<you>.workers.dev) and give it to the app.
//
//  Safety: only the origins below may call it, and it caps the upload size. Set a small
//  budget/alert on your Google Cloud billing as the real backstop.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://drth7.github.io',   // the live app
  'http://localhost:8123',     // local preview
];
const MODEL = 'gemini-2.5-flash-image';
const MAX_IMAGE_CHARS = 8_000_000;   // ~6 MB of base64 — plenty for a 1024px screenshot
const DEFAULT_PROMPT =
  "Turn this 3D room-planner screenshot into a photorealistic interior photograph. " +
  "KEEP the exact same layout, camera angle, and every furniture piece in its exact " +
  "position, size and proportion. Only upgrade materials, lighting, shadows and textures " +
  "so they look real and high quality. Do NOT add, remove, resize or move any furniture, walls or windows.";

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
    if (request.method !== 'POST')   return json({ error: 'Method not allowed' }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'This proxy is private.' }, 403, origin);
    if (!env.GEMINI_KEY) return json({ error: 'Server is missing GEMINI_KEY.' }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request body.' }, 400, origin); }
    const image = body && body.image;
    if (!image || typeof image !== 'string') return json({ error: 'No image supplied.' }, 400, origin);
    if (image.length > MAX_IMAGE_CHARS)      return json({ error: 'Image too large.' }, 413, origin);
    const prompt = (body.prompt && String(body.prompt)) || DEFAULT_PROMPT;

    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: image } }] }] }),
    });

    // pass Google's response (image data or error) straight back, with CORS
    const text = await g.text();
    return new Response(text, { status: g.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  },
};
