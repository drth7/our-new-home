# Product Requirements Document (PRD)
## "Our New Home" — Plan your home together, in real time

| | |
|---|---|
| **Product** | Our New Home |
| **Document** | Product Requirements Document |
| **Version** | 1.1 |
| **Date** | 2026-07-11 |
| **Author** | Abdulla (drth7) |
| **Status** | Live |
| **Live** | https://drth7.github.io/our-new-home/ |
| **Repo** | https://github.com/drth7/our-new-home |

> **What's new in v1.1 (2026‑07‑11):** the couple can now **redraw the apartment itself** in an in‑app **Layout / Wall Editor** (walls, doors, windows, arches, open‑plan room splits, ceiling lights) and Save it live to both phones; **Create with AI** turns a description or a furniture product link into a real‑size model; **lamps** cast switchable light; walls can be painted per‑room/per‑side and toggled **see‑through or solid**; and the app now runs an **adaptive frame rate** (with an on‑screen FPS meter) to spare iPhone battery.

---

## 1. Overview

**Our New Home** is a private, real‑time 3D planner a couple uses to design and furnish the apartment they're moving into — together, from their own phones. One partner drags a sofa into the living hall and the other watches it move on their screen, walks their avatar over to it, and reacts with a 💋. It turns the stressful, spreadsheet‑and‑tape‑measure chore of "will this fit / where should it go" into something shared, playful, and genuinely useful.

It is built as a single self‑contained web page (Three.js) on free static hosting, with a lightweight cloud database for live collaboration. No app store, no accounts, no server to run.

### One‑liner
> A shared, living 3D model of *our* new home — where we furnish it together in real time before we even move in.

---

## 2. Problem & Motivation

Furnishing a new home as a couple is hard to do together:
- **"Will it fit?"** — Store listings give dimensions in cm; it's hard to picture a 2.6 m sectional against a real wall.
- **"Where does it go?"** — Deciding layout over text messages and screenshots is clumsy; only one person can "hold" the plan at a time.
- **Not present together** — The two people making the decision are often in different places.
- **Generic tools are overkill** — CAD/room planners are complex, account‑gated, and not *ours* — they don't model *this* apartment or make the process feel personal and fun.

**Our New Home** solves this for one specific couple and their specific apartment: a faithful floor plan, a real furniture catalog with true dimensions, live shared editing, and a warm, personal, game‑like feel.

---

## 3. Goals & Non‑Goals

### 3.1 Goals
- **G1** Let both partners edit the same home **live** and always see the same state.
- **G2** Make furnishing **spatially trustworthy** — real dimensions, real walls, a measure tool.
- **G3** Keep it **effortless on a phone** — one‑handed, no accounts, opens instantly.
- **G4** Make it **feel like ours** — personal identities, greetings, avatars, a pet, small delights.
- **G5** **Zero‑cost, zero‑ops** — static hosting + free database; ship by pushing.

### 3.2 Non‑Goals
- Not a general CAD tool or a public product for arbitrary homes.
- Not an e‑commerce/checkout experience (though real products can be modeled).
- No public accounts, friend systems, or moderation.
- No server‑side logic or paid infrastructure.

---

## 4. Target Users & Personas

| Persona | Who | Needs | Behaviors |
|---|---|---|---|
| **Abdulla (husband)** | Co‑owner, more technical, drives changes | Plan layout, try furniture, measure fits | Adds/moves pieces, requests features, reviews on phone and desktop |
| **Miaad (wife)** | Co‑owner | Co‑decide layout, react, personalize | Edits together, uses avatar/gestures, keeps it homey |
| **Guest** | A visiting friend/relative | Take a look around | View‑only; walks through, can't change anything |

Primary context: **two iPhones**, often in different rooms or places, sometimes side by side.

---

## 5. Experience Principles
1. **Shared and live first** — every change is instantly visible to the other person; presence is felt (avatars, tags).
2. **Trustworthy space** — what you see reflects real dimensions and real walls; measuring is one tap away.
3. **Phone‑native** — big targets, thumb reach, minimal chrome, fast.
4. **Warm, not clinical** — it's *their* home: names, hearts, a cat, gentle sounds and animations.
5. **Forgiving** — undo, safe interrupts, and guardrails so nobody loses work.
6. **Modern & calm** — clean SVG icons, glassy surfaces, light/dark, subtle motion.

---

## 6. Key Use Cases / User Stories

- **US‑1** *As a partner,* I sign in as myself and see a warm greeting (and my partner's note) so entering feels personal.
- **US‑2** *As a couple,* we both edit the layout at the same time and instantly see each other's changes so we can decide together.
- **US‑3** *As a planner,* I add a real sofa at its true size and drag it against a wall so I know it fits.
- **US‑4** *As a planner,* I measure the gap between two points so I know a piece will pass/fit.
- **US‑5** *As a decorator,* I hang cabinets/art/curtains on a wall and paint a wall a color to visualize the room.
- **US‑6** *As a partner,* I walk my avatar over to my partner and send a 💋/🤗 so it feels like we're there together.
- **US‑7** *As a resident,* I clean up after our cat's little mess as a light, shared ritual.
- **US‑8** *As a viewer,* I switch between 3D, top‑down 2D, and a walk‑through to understand the space.
- **US‑9** *As an owner,* I export/save our layout so we don't lose it and can share a screenshot.
- **US‑10** *As an owner,* I redraw a wall, add a door, or split the kitchen off the living hall in the editor and Save it, and my partner's home updates to match.
- **US‑11** *As a planner,* I paste a link to a sofa we're considering (or just describe it) and get it modeled at real size to try in the room.

---

## 7. Features & Requirements (prioritized)

### P0 — Core (shipped)
| # | Feature | What it does | Ties to |
|---|---|---|---|
| F‑1 | **Faithful floor plan** | The couple's actual apartment: rooms, walls, doors, windows, balconies, glass walls, curtains rail | G2 |
| F‑2 | **Three views** | 3D orbit · 2D plan (1 m grid) · walk‑around with joystick/WASD | G2, G3 |
| F‑3 | **Furniture catalog** | Categorized parametric + 3D‑model pieces with real dimensions and thumbnails | G2 |
| F‑4 | **Place & arrange** | Tap/drag to add; move, rotate 45°, resize (typed cm/±5), recolor, delete | G1, G2 |
| F‑5 | **Stacking & rugs** | Stack items on surfaces/each other with exact heights; rugs always lie flat | G2 |
| F‑6 | **Real‑time collaboration** | Live sync of the whole home + avatars + live drag streaming | G1 |
| F‑7 | **Identities & greetings** | Fixed husband/wife/guest, personal message on entry | G4 |
| F‑8 | **Environment** | Time of day (manual/live), sun direction, light/dark theme, per‑wall paint, grid | G2, G4 |
| F‑9 | **Avatars & gestures** | Sit/sleep, radial menu, wave/kiss/hug with emoji bursts | G4 |
| F‑10 | **Pet cat + cleaning** | Wandering cat (pet/feed) and tap‑to‑clean dirt | G4 |
| F‑11 | **Persistence & share** | Save/load/export/import, screenshots, activity feed, achievements | G3, G5 |

### P1 — Recent additions (shipped)
| # | Feature | What it does |
|---|---|---|
| F‑12 | **Floor↔wall toggle** | Hang any eligible floor piece on a wall (and slide it up/down); great for kitchen wall storage |
| F‑13 | **Measure tool** | Tap two floor points for a distance; **draggable endpoints** update the reading live (2D & 3D) |
| F‑14 | **Modern UI pass** | Inline SVG icon system, grouped Settings cards, layered shadows, spring/entrance animations |
| F‑15 | **Data‑safety guard** | First‑sync adopts the cloud room and blocks saves until then, so a stale device can't overwrite the home |

### P1 — New since v1.0 (shipped, 2026‑07)
| # | Feature | What it does | Ties to |
|---|---|---|---|
| F‑16 | **Layout / Wall Editor** | An in‑app editor to **redraw the apartment**: draw/move/stretch/delete walls with live metre readouts; punch **doors, windows, archways** at any size with adjustable door swing; **split a room without a wall** (open‑plan zones — furniture and people pass freely); place ceiling lights; **automatic room detection** with rename; a 3D preview; and **Save that applies to the real home for both partners** (synced). Export/import/reset included. | G1, G2 |
| F‑17 | **Create with AI** | Describe a piece — or **paste a furniture product link** — and it's modeled at its real size and added to the catalog for both partners; a store page with several pieces (e.g., a modular kitchen) yields several models. | G2, G4 |
| F‑18 | **Lamps that light up** | Placeable lamps cast a warm light you can switch **on/off**; the state syncs to both devices. | G4 |
| F‑19 | **Advanced wall paint** | Paint the **whole home, a single room, or one wall side**; walls split per room so painting one never bleeds into the neighbour. | G2, G4 |
| F‑20 | **See‑through / solid walls** | Toggle wall transparency to peer into rooms from outside or view them solid. | G2 |
| F‑21 | **Battery‑savvy rendering** | **Adaptive frame rate** (≈30 fps idle, ≈60 fps while interacting) to spare iPhone battery, with an on‑screen **FPS meter**. | G3, G5 |
| F‑22 | **Warm welcome** | A calm animated entry that fades into the home with a gentle zoom‑in, plus the partner's greeting note. | G4 |

### P2 — Candidate backlog (not yet built)
| # | Idea | Value |
|---|---|---|
| F‑23 | Purpose‑built kitchen wall cabinets/drawers (upper‑cabinet shapes) | Nicer than hanging a counter |
| F‑24 | "Snap‑together" furniture presets (e.g., place a full sectional in one tap) | Faster layout |
| F‑25 | Multi‑segment / area measurements and saved dimensions | Deeper planning |
| F‑26 | Shopping links / price + source metadata per piece | Bridge plan → purchase (AI URL import already models from a store page) |
| F‑27 | Room‑by‑room camera tours / guided walkthrough | Presentation |
| F‑28 | Layout versions / snapshots ("before we bought the sofa") | History & compare |
| F‑29 | Upload a floor plan (photo/PDF) → AI traces it into an editable layout | Onboard any home |
| F‑30 | Dynamic members/family roster (beyond the fixed 3 roles) | Share with more people |
| F‑31 | Scoped, authenticated database rules; per‑couple room isolation | Hardening/scale |

---

## 8. UX Notes
- **Top bar:** Rooms · **Wall‑editor** (blueprint) · title/presence · **FPS meter** · view toggle · theme · Settings.
- **Bottom bar:** Add · Undo · **Measure** · Screenshot · Achievements · Activity.
- **Selection toolbar:** Rotate · Color · Resize · **Wall‑mount** · **Flip** (wall pieces) · **Light** (lamps) · Use (contextual) · Delete + live size readout.
- **Add sheet:** category tabs + thumbnail grid; tap or drag‑out; **✨ Create with AI** (describe or paste a product link).
- **Settings:** grouped cards — You / Environment (lighting, walls & floor incl. see‑through toggle, view helpers) / Multiplayer / Layout.
- **Layout / Wall Editor:** opens full‑screen in‑app; left rail of icon tools — **Tools** (Select · Split · Delete), **Add** (Wall · Door · Window · Arch · Light), **File** (Reset · Export · Import); Save · Back · Undo · 3D preview centred at top; **Rooms** toggles a room list; canvas with live measurements and a ✎ rename on each room.
- **Tone:** first‑person, affectionate ("Welcome home", hearts), calm modern visuals, light/dark.

---

## 9. Success Metrics
Because this is a private two‑person product, "success" is qualitative and usage‑based rather than growth‑based:
- **M1 Co‑use:** both partners are present/editing in the same session regularly.
- **M2 Decisions made:** real purchase/layout decisions are informed by the app (e.g., "we measured it, it fits").
- **M3 Fidelity:** the modeled plan matches reality closely enough to trust (few "that's wrong" corrections over time).
- **M4 Delight & return:** they open it often and use the social/ambient features, not just the editor.
- **M5 Zero data loss:** the shared home is never lost or clobbered.
- **M6 Performance:** smooth on their iPhones (no jank in normal use).

---

## 10. Technical Summary (for context)
- **Client:** one self‑contained `index.html` — Three.js scene, all UI, embedded character/furniture models (base64). A companion `wall-editor.html` provides the Layout Editor, opened as an in‑app same‑origin iframe (version cache‑busted).
- **Editable plan:** the apartment is a hardcoded `PLAN` baseline plus an optional **`planOverride`** (walls, room dividers/zones, room rects, lights) authored in the editor and **synced in the layout**; everything derived (floors, wall meshes, walkable area) is recomputed on adoption. Reset restores the baseline.
- **Create with AI:** a **Cloudflare Worker** (`ai-proxy/worker.js`) holds the Gemini key server‑side; the app posts a description or a product URL and gets back a shape recipe / real‑size dimensions. Generated recipes travel with the layout so both phones can build them.
- **Sync:** Firebase Realtime Database as a shared live store (`/room/*`); ~8–10 Hz for presence/drag; whole‑room layout node (incl. `planOv` + AI recipes) with author + timestamp; **adopt‑before‑save** guard.
- **Performance:** capped pixel ratio; **adaptive frame rate** (renders ~30 fps idle / ~60 fps while interacting) for battery; exact stack heights and wall/floor state serialized (never re‑guessed on the receiver).
- **Hosting:** GitHub Pages (static); ship via `git push`; `.nojekyll` required.
- **Auth:** fixed identities, cosmetic passwords, optional guest name — intended for a trusted private couple.
- **Persistence:** cloud + `localStorage` (layout, identity, preferences, achievements).

*(See `SRS.md` for the full functional/non‑functional specification and data model.)*

---

## 11. Risks & Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Stale/second device overwrites the shared home | Data loss | **Shipped:** first‑sync adopt + save‑gate (F‑15); recommend scoped DB rules |
| Open database rules | Privacy/abuse | Scope rules to `/room`; product is private‑use only |
| CDN/DB unavailable | Degraded collaboration | App loads/edits offline from local layout; syncs when back |
| Large single HTML (embedded models) | Load size / tooling breakage | Keep `.nojekyll`; edit with UTF‑8‑safe tools; models are cached by the browser |
| Furniture on walls looks odd for non‑storage items | Minor visual | Toggle limited to eligible pieces; add purpose‑built wall pieces (F‑16) |

---

## 12. Open Questions
- Add purpose‑built kitchen wall cabinets/drawers now, or rely on the floor↔wall toggle?
- Do we want saved/named measurements and layout versions?
- Should we tie pieces to real product links/prices to close the plan→buy loop?
- Harden database rules to `/room` scope before sharing more widely?

---

*End of PRD v1.1.*
