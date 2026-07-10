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
    // Reads STRUCTURED product data when available (Shopify product .js, then JSON-LD), with up to
    // THREE product photos — far more reliable than scraping raw page text with one staged photo.
    if (body && body.fetchUrl){
      let target;
      try { target = new URL(String(body.fetchUrl)); } catch { return json({ error: 'Bad URL.' }, 400, origin); }
      if (!/^https?:$/.test(target.protocol)) return json({ error: 'Bad URL.' }, 400, origin);
      const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                   'Accept-Language': 'en, ar;q=0.8' };
      const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
      let title = '', desc = '', imgUrls = [], pageText = '';

      // 1) Shopify's product JSON (most furniture shops): clean title, description, product photos
      try {
        const pj = await fetch(target.origin + target.pathname.replace(/\/+$/, '') + '.js', { headers: UA });
        if (pj.ok && (pj.headers.get('Content-Type') || '').includes('json')){
          const p = await pj.json();
          if (p && p.title && Array.isArray(p.images)){
            title = p.title;
            desc = strip(p.description).slice(0, 9000);
            imgUrls = p.images.slice(0, 3).map(u => {
              u = String(u); if (u.startsWith('//')) u = 'https:' + u;
              return u + (u.includes('?') ? '&' : '?') + 'width=900';        // Shopify CDN resizes — keeps uploads small
            });
          }
        }
      } catch {}

      // 2) the page itself: JSON-LD Product (any modern shop) and og/twitter image + text fallback
      if (!title || !imgUrls.length){
        let page = '';
        try {
          const pr = await fetch(target.href, { redirect: 'follow', headers: { ...UA, 'Accept': 'text/html,application/xhtml+xml' } });
          if (!pr.ok) return json({ error: 'Page said ' + pr.status }, 422, origin);
          page = await pr.text();
        } catch { return json({ error: 'Could not reach that page.' }, 422, origin); }
        for (const m of page.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)){
          try {
            const d = JSON.parse(m[1]);
            const nodes = Array.isArray(d) ? d : (d['@graph'] || [d]);
            for (const n of nodes){
              const ty = n && n['@type'];
              if (ty === 'Product' || (Array.isArray(ty) && ty.includes('Product'))){
                title = title || n.name || '';
                desc = desc || strip(n.description).slice(0, 9000);
                if (!imgUrls.length){
                  const im = n.image;
                  imgUrls = (Array.isArray(im) ? im : [im]).filter(x => typeof x === 'string').slice(0, 3);
                }
              }
            }
          } catch {}
        }
        if (!imgUrls.length){
          const og = (page.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || page.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
            || page.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) || page.match(/content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i) || [])[1];
          if (og) imgUrls = [og];
        }
        pageText = page.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
        pageText = strip(pageText).slice(0, 8000);                           // dims sometimes live outside the description
      }

      // fetch up to 3 photos (photo 1 is often the staged set; the rest are individual pieces)
      const parts = [];
      for (const iu of imgUrls){
        if (parts.length >= 3) break;
        try {
          const ir = await fetch(new URL(iu, target.href).href, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const mime = (ir.headers.get('Content-Type') || '').split(';')[0];
          if (!ir.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) continue;
          const buf = await ir.arrayBuffer();
          if (buf.byteLength >= 1_500_000) continue;
          let bin = ''; const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          parts.push({ inline_data: { mime_type: mime, data: btoa(bin) } });
        } catch {}
      }

      const sys = 'You are modelling the furniture sold on a product page, using the attached product PHOTOS as ground truth (the first photo may show the whole staged set; later photos usually show individual pieces). The page text may be in any language. ' +
        'Output ONLY minified JSON (no prose, no markdown): {"models":[MODEL,...]} — one MODEL per DISTINCT piece type on the page (a set = e.g. table + chair + buffet; never duplicates; max 4). ' +
        'MODEL schema: {"name":string<=16,"w":metres,"d":metres,"h":metres,"color":"#hex","parts":[{"shape":"box"|"cylinder"|"sphere"|"cone","w":m,"h":m,"d":m,"r":m,"x":m,"y":m,"z":m,"rx":deg,"ry":deg,"rz":deg,"color":"#hex"}]}. ' +
        'MATCH THE PHOTOS: silhouette, proportions, leg/arm/back style, and the EXACT material colours you see (two-tone finishes get two colours — e.g. a white-washed base with a wood top must not come out one flat colour). Use up to 16 parts when the shape needs them; someone who owns the product should recognise it. ' +
        'GEOMETRY RULES (strict): origin at the CENTRE of the floor footprint, y UP, nothing below y=0; EVERY part must fit inside the model box — |x| + partWidth/2 <= w/2, |z| + partDepth/2 <= d/2, partY + partHeight/2 <= h. Legs go UNDER the top and INSET >= 0.03 m from its edges — never outside it. Tabletops sit at 0.73-0.78 m, chair seats at ~0.45 m. ' +
        'DIMENSIONS: w/d/h MUST be the real dimensions stated in the text (convert cm/mm/inches to metres; width=w, depth=d, height=h). Each piece of a set uses ITS OWN stated dimensions; a piece with none gets a typical real size consistent with the photos. ' +
        'PRODUCT TITLE: "' + String(title).slice(0, 200).replace(/"/g, "'") + '". ' +
        'PRODUCT DESCRIPTION: "' + desc.replace(/"/g, "'") + '". ' +
        (pageText ? 'PAGE TEXT: "' + pageText.replace(/"/g, "'") + '".' : '');
      parts.push({ text: sys });
      // model availability depends on the key's age — try the best current model, fall back on 404
      const MODEL_TRY = ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
      let gg = null, t = '';
      for (const model of MODEL_TRY){
        gg = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.25 } }),
        });
        t = await gg.text();
        if (gg.status !== 404) break;                 // 404 = this key doesn't have that model — try the next one
      }
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
