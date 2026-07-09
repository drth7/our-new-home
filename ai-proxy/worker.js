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
const MODELS = {                       // app sends a short alias; add more here without touching the app
  pro:   'gemini-3-pro-image-preview', // "Nano Banana Pro" — best realism (~13¢/image)
  flash: 'gemini-2.5-flash-image',     // "Nano Banana" — cheaper (~4¢/image)
};
const DEFAULT_MODEL = 'pro';
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

    // ── link mode: a furniture product URL → one JSON recipe PER piece, at the page's real sizes ──
    if (body && body.fetchUrl){
      let target;
      try { target = new URL(String(body.fetchUrl)); } catch { return json({ error: 'Bad URL.' }, 400, origin); }
      if (!/^https?:$/.test(target.protocol)) return json({ error: 'Bad URL.' }, 400, origin);
      let page;
      try {
        const pr = await fetch(target.href, { redirect: 'follow', headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en',
        }});
        if (!pr.ok) return json({ error: 'Page said ' + pr.status }, 422, origin);
        page = await pr.text();
      } catch { return json({ error: 'Could not reach that page.' }, 422, origin); }
      // main product photo (og:image, twitter:image fallback) — the PRIMARY reference for the shape
      const og = (page.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || page.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
        || page.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) || page.match(/content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i) || [])[1];
      let imgPart = null;
      if (og){
        try {
          const ir = await fetch(new URL(og, target.href).href, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const mime = (ir.headers.get('Content-Type') || '').split(';')[0];
          if (ir.ok && /^image\/(jpeg|png|webp)$/.test(mime)){
            const buf = await ir.arrayBuffer();
            if (buf.byteLength < 1_800_000){
              let bin = ''; const bytes = new Uint8Array(buf);
              for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
              imgPart = { inline_data: { mime_type: mime, data: btoa(bin) } };
            }
          }
        } catch {}
      }
      // page text only (tags/scripts stripped, capped) — the dimensions almost always live in the text
      const text = page
        .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').slice(0, 14000);
      const sys = 'You are modelling the furniture in the attached product PHOTO (when present) sold on a webpage. Output ONLY minified JSON (no prose, no markdown): ' +
        '{"models":[MODEL,...]} with one MODEL per distinct furniture piece sold on the page (max 4; if the page sells a set of pieces, e.g. three different sofas, output each separately). ' +
        'MODEL schema: {"name":string<=16,"w":metres,"d":metres,"h":metres,"color":"#hex","parts":[{"shape":"box"|"cylinder"|"sphere"|"cone","w":m,"h":m,"d":m,"r":m,"x":m,"y":m,"z":m,"rx":deg,"ry":deg,"rz":deg,"color":"#hex"}]}. ' +
        'THE PHOTO IS THE REFERENCE: study it and reproduce what you SEE as faithfully as primitives allow — the silhouette, the proportions, arm/back/leg style, cushion count, base type, and the EXACT colours of each material in the photo. Use up to 14 parts per model when the shape needs them; a person who owns the product should recognise it. ' +
        'DIMENSIONS: w/d/h MUST be the REAL dimensions stated in the page text (convert cm/mm/inches to metres; width=w, depth=d, height=h). The photo drives the SHAPE, the text drives the SIZE. If a piece has no stated dimensions, estimate from the photo. ' +
        'Rules: origin at the CENTRE of the floor footprint, y is UP, each part y is its centre height so the object rests on the floor (nothing below y=0). ' +
        'PAGE TEXT: "' + text.replace(/"/g, "'") + '"';
      const parts = imgPart ? [imgPart, { text: sys }] : [{ text: sys }];   // photo first — it is the reference
      const gg = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } }),
      });
      const t = await gg.text();
      return new Response(t, { status: gg.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // ── text mode: describe an object → JSON shape recipe (cheap text model) ──
    if (body && body.generate){
      const thing = String(body.generate).slice(0, 600);
      const sys = 'You output ONLY minified JSON (no prose, no markdown) describing a simple low-poly 3D furniture/prop model made of primitive parts. ' +
        'Schema: {"name":string<=16,"w":metres,"d":metres,"h":metres,"color":"#hex","parts":[{"shape":"box"|"cylinder"|"sphere"|"cone","w":m,"h":m,"d":m,"r":m,"x":m,"y":m,"z":m,"rx":deg,"ry":deg,"rz":deg,"color":"#hex"}]}. ' +
        'Rules: real-world sizes in metres; origin at the CENTRE of the floor footprint, y is UP, each part y is its centre height so the whole object rests on the floor (nothing below y=0); w/d/h are the overall bounding size; box uses w/h/d, cylinder/cone use r+h, sphere uses r; at most 12 parts; keep it recognizable but simple. ' +
        'COLOURS: give EVERY part its own realistic "color", and use 2-4 DIFFERENT colours across the object to show its separate materials/sections — never make the whole thing one flat colour. Examples: floor lamp = dark metal base + slim pole + warm cream shade; dining chair = wooden legs + fabric seat + cushion; plant = terracotta pot + green foliage; toaster = steel body + dark slots + red lever. Pick tasteful, true-to-life hues. ' +
        'Object to model: "' + thing + '".';
      const gg = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: sys }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
      });
      const t = await gg.text();
      return new Response(t, { status: gg.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const image = body && body.image;
    if (!image || typeof image !== 'string') return json({ error: 'No image supplied.' }, 400, origin);
    if (image.length > MAX_IMAGE_CHARS)      return json({ error: 'Image too large.' }, 413, origin);
    const prompt = (body.prompt && String(body.prompt)) || DEFAULT_PROMPT;
    const model  = MODELS[body.model] || MODELS[DEFAULT_MODEL];

    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: image } }] }] }),
    });

    // pass Google's response (image data or error) straight back, with CORS
    const text = await g.text();
    return new Response(text, { status: g.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  },
};
