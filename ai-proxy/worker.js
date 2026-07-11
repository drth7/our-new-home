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

// fetch up to `max` real product photos from a shop URL → Gemini inline_data parts.
// Used by the realistic-render mode to show the model what each labelled product actually looks like.
// Prefers CLEAN product-only photos: the variant's own packshot first, then PNGs (often transparent
// cutouts), and it drops the first image (usually the staged lifestyle hero) when there are alternatives.
async function fetchPhotos(rawUrl, max){
  let target;
  try { target = new URL(String(rawUrl)); } catch { return []; }
  if (!/^https?:$/.test(target.protocol)) return [];
  const UA = { 'User-Agent': 'Mozilla/5.0' };
  const norm = u => { u = String(u || ''); return u.startsWith('//') ? 'https:' + u : u; };
  const isPng = u => /\.png(\?|$)/i.test(u);
  const variantId = target.searchParams.get('variant');
  let imgUrls = [];
  try {                                                     // Shopify product JSON (most furniture shops)
    const r = await fetch(target.origin + target.pathname.replace(/\/+$/, '') + '.js', { headers: UA });
    if (r.ok){
      const p = await r.json();
      const cand = [];
      if (variantId && Array.isArray(p.variants)){          // the packshot for THIS variant/colour = cleanest, most on-point
        const v = p.variants.find(x => String(x.id) === variantId);
        const fi = v && v.featured_image && (v.featured_image.src || v.featured_image);
        if (fi) cand.push(norm(fi));
      }
      let imgs = (Array.isArray(p.images) ? p.images : []).map(norm);
      if (imgs.length > 3) imgs = imgs.slice(1);            // drop the first image — usually the staged lifestyle hero
      imgs.sort((a, b) => (isPng(b) ? 1 : 0) - (isPng(a) ? 1 : 0));   // PNGs (often transparent cutouts) first
      for (const u of cand.concat(imgs)) if (u && !imgUrls.includes(u)) imgUrls.push(u);
    }
  } catch {}
  if (!imgUrls.length){                                     // fallback: the page's og:image
    try {
      const r = await fetch(target.href, { headers: UA });
      if (r.ok){
        const page = await r.text();
        const og = (page.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                 || page.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i) || [])[1];
        if (og) imgUrls = [norm(og)];
      }
    } catch {}
  }
  const out = [];
  for (const iu of imgUrls){
    if (out.length >= max) break;
    try {
      const ir = await fetch(new URL(iu, target.href).href, { headers: UA });
      const mime = (ir.headers.get('Content-Type') || '').split(';')[0];
      if (!ir.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) continue;
      const buf = await ir.arrayBuffer();
      if (buf.byteLength >= 1_500_000) continue;
      let bin = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      out.push({ inline_data: { mime_type: mime, data: btoa(bin) } });
    } catch {}
  }
  return out;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
    if (request.method !== 'POST')   return json({ error: 'Method not allowed' }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'This proxy is private.' }, 403, origin);
    if (!env.GEMINI_KEY) return json({ error: 'Server is missing GEMINI_KEY.' }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request body.' }, 400, origin); }

    // ── repair mode: the app measured geometry problems in a recipe → one focused fix pass ──
    if (body && body.repair && body.repair.spec){
      const specJson = JSON.stringify(body.repair.spec).slice(0, 20000);
      const problems = (Array.isArray(body.repair.problems) ? body.repair.problems : []).slice(0, 10).map(String).join('; ').slice(0, 1500);
      const sys = 'You wrote this low-poly furniture recipe JSON: ' + specJson + ' — the app measured these geometry problems: "' + problems.replace(/"/g, "'") + '". ' +
        'Return ONLY the corrected minified JSON for the SAME single model — identical schema, keep the name/kind/dimensions/colours and the overall design, fix ONLY the listed problems (move or resize the offending parts, delete redundant shells, turn a slab-capsule into a box). No prose, no markdown.';
      const gg = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: sys }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
      });
      const t = await gg.text();
      return new Response(t, { status: gg.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }

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
            imgUrls = p.images.slice(0, 6).map(u => {
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
                  imgUrls = (Array.isArray(im) ? im : [im]).filter(x => typeof x === 'string').slice(0, 6);
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

      // fetch ALL the product photos (up to 6) — different angles show the base, the back, the details
      const parts = [];
      for (const iu of imgUrls){
        if (parts.length >= 6) break;
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

      const sys = 'You are modelling the furniture sold on a product page, using ALL the attached product PHOTOS as ground truth — study every photo and cross-reference them: different angles reveal the base, the legs, the back and the details (the first photo may be a staged set; later ones usually show the piece alone). The page text may be in any language. ' +
        'Output ONLY minified JSON (no prose, no markdown): {"models":[MODEL,...]} — one MODEL per DISTINCT piece type on the page (a set = e.g. table + chair + buffet; never duplicates; max 4 — EXCEPT modular systems, see KITCHENS). ' +
        'MODEL schema: {"name":string<=16,"kind":"chair"|"sofa"|"stool"|"bench"|"bed"|"table"|"desk"|"rug"|"storage"|"counter"|"wallcabinet"|"appliance"|"lamp"|"decor","seatH":m,"w":metres,"d":metres,"h":metres,"color":"#hex","parts":[{"shape":"box"|"cylinder"|"sphere"|"cone"|"capsule","w":m,"h":m,"d":m,"r":m,"x":m,"y":m,"z":m,"rx":deg,"ry":deg,"rz":deg,"arc":deg,"sx":n,"sy":n,"sz":n,"glass":true,"glow":true,"color":"#hex"}]}. ' +
        'KITCHENS & modular systems (kitchen runs, wardrobe walls): decompose the photo into REUSABLE MODULES — output one MODEL per distinct module you can see, up to 8: base cabinet (kind "counter": w per photo 0.4-1.0 typical 0.6, d 0.6, h 0.9 including a 0.1 plinth and a 0.03 worktop slab on top in the worktop colour), sink base (counter w 0.8-1.0 with a sunken basin hint), hob base (counter with a dark 0.03 slab + burner circles), wall cabinet (kind "wallcabinet": w 0.6-0.9, d 0.33, h 0.7), tall unit (kind "storage": w 0.6, d 0.6, h 2.1), cooker hood (kind "wallcabinet": w 0.6-0.9, d 0.45, h 0.5), island (kind "counter" at its photographed proportions). Kitchen pages rarely state dimensions — use these STANDARDS sized to what the photo shows, match the door style, handles and the exact cabinet/worktop colours, and name modules clearly ("Base 60", "Sink base", "Wall 60", "Tall unit"). ' +
        'ALWAYS set "kind" (what the piece IS — the app makes chairs/sofas sittable, beds sleepable, tables stackable, rugs flat, lamps light up) and, for anything sittable, "seatH" = the seat surface height in metres. ' +
        'THE BASE MATTERS: count the legs in the photos and match their exact angle, thickness and material; a footrest ring or stretcher must SPAN between the legs (start and end AT a leg), never float. ' +
        'KITCHENS are MODULAR: when the page/photos show a kitchen, output SEPARATE models for its units — e.g. one base-cabinet run (counter included), one wall-cabinet run, one tall/fridge unit, one island (max 4 total). Kitchens rarely state dimensions — derive the scale from the WORLDWIDE STANDARD counter height of 0.90 m: base cabinets 0.60 m deep; wall cabinets 0.35 m deep, bottom at ~1.40 m, top at ~2.10 m; tall units 0.60 m deep and 2.10-2.40 m tall; get each run\'s LENGTH by counting door/drawer modules in the photos (one module is 0.40-0.60 m). Model the doors/drawers/handles as thin face parts so the runs read as real cabinetry. ' +
        'MATERIALS: mark transparent parts (glass/acrylic tabletops, cabinet doors, vases) with "glass":true; on a lamp, mark the part that emits light (shade/bulb) with "glow":true. ' +
        'CURVED SHAPES — use them (most furniture is not boxy), but use each CORRECTLY: ' +
        '"capsule" is a thin PILL defined ONLY by r (thickness) and h (TOTAL length); w/d are IGNORED — capsules are for legs, piping and thin rounded arms, NEVER for seats/cushions/slabs (make those a box or a short fat cylinder). ' +
        'cylinder+"arc" (120-270) = ONE open curved shell centred on +z, aimed with ry (a chair back behind the seat needs ry 180); give it a radius close to the seat radius, start it AT seat height so it touches the seat, use exactly ONE shell (never two stacked), and never squash a shell (sx/sz stay >= 0.7). ' +
        '"sx"/"sy"/"sz" scale a part: oval tabletop = cylinder with sz 0.7; dome cushion = sphere with sy 0.35 resting ON the seat. ' +
        'EXAMPLE — curved-back dining chair 0.61w 0.62d 0.80h: seat {"shape":"cylinder","r":0.27,"h":0.07,"sz":0.9,"y":0.42}, back {"shape":"cylinder","r":0.26,"h":0.38,"arc":190,"ry":180,"y":0.60,"z":0}, cushion {"shape":"sphere","r":0.2,"sy":0.3,"sz":0.85,"y":0.47,"z":0.02}, and four splayed capsule legs {"shape":"capsule","r":0.012,"h":0.42,"y":0.19} at x ±0.2, z ±0.19. ' +
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
        if (gg.status !== 404 && gg.status !== 503 && gg.status !== 429) break;   // missing (404) or overloaded/limited (503/429) — try the next model
      }
      return new Response(t, { status: gg.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // ── text mode: describe an object → JSON shape recipe (cheap text model) ──
    if (body && body.generate){
      const thing = String(body.generate).slice(0, 600);
      const sys = 'You output ONLY minified JSON (no prose, no markdown) describing a simple low-poly 3D furniture/prop model made of primitive parts. ' +
        'Schema: {"name":string<=16,"kind":"chair"|"sofa"|"stool"|"bench"|"bed"|"table"|"desk"|"rug"|"storage"|"appliance"|"lamp"|"decor","seatH":m,"w":metres,"d":metres,"h":metres,"color":"#hex","parts":[{"shape":"box"|"cylinder"|"sphere"|"cone"|"capsule","w":m,"h":m,"d":m,"r":m,"x":m,"y":m,"z":m,"rx":deg,"ry":deg,"rz":deg,"arc":deg,"sx":n,"sy":n,"sz":n,"glass":true,"glow":true,"color":"#hex"}]}. ' +
        'ALWAYS set "kind" (the app makes chairs/sofas sittable, beds sleepable, tables stackable, rugs flat, lamps light up) and, for anything sittable, "seatH" = the seat surface height in metres. Mark transparent parts "glass":true; on a lamp, mark the light-emitting part (shade/bulb) "glow":true. ' +
        'CURVED SHAPES: "capsule" is a thin PILL defined ONLY by r + h (total length; w/d ignored) — legs, piping, thin arms, NEVER seats/slabs; cylinder+"arc" (120-270) = ONE open curved shell centred on +z (aim with ry, e.g. 180 for a chair back), radius near the seat radius, starting at seat height, never squashed below sx/sz 0.7 and never doubled; "sx"/"sy"/"sz" scale a part — oval tops (cylinder, sz 0.7), dome cushions (sphere, sy 0.35). ' +
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

    const parts = [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: image } }];
    // reference product photos: for each labelled real product (from the app), fetch its shop photos so
    // the model renders it to match the real thing instead of the low-poly placeholder.
    const refs = Array.isArray(body.refs) ? body.refs.slice(0, 6) : [];
    if (refs.length){
      const blocks = await Promise.all(refs.map(async ref => {
        if (!ref || !ref.url) return null;
        const photos = await fetchPhotos(ref.url, 2);
        return photos.length ? { ref, photos } : null;
      }));
      for (const b of blocks){
        if (!b) continue;
        parts.push({ text: 'Reference photos for item #' + b.ref.label + (b.ref.name ? ' ("' + String(b.ref.name).slice(0, 40).replace(/"/g, "'") + '")' : '') + ' — render this item to match these:' });
        for (const ph of b.photos) parts.push(ph);
      }
    }

    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    // pass Google's response (image data or error) straight back, with CORS
    const text = await g.text();
    return new Response(text, { status: g.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  },
};
