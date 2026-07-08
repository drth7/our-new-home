# Software Requirements Specification (SRS)
## "Our New Home" — Collaborative 3D Home Planner

| | |
|---|---|
| **Product** | Our New Home |
| **Document** | Software Requirements Specification |
| **Version** | 1.0 |
| **Date** | 2026-07-08 |
| **Status** | Baseline (live in production) |
| **Owner** | Abdulla (drth7) |
| **Live** | https://drth7.github.io/our-new-home/ |
| **Repository** | https://github.com/drth7/our-new-home |

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for **Our New Home**, a private, real‑time collaborative 3D application that lets a couple design and furnish the floor plan of their new apartment together from separate devices. It is intended for the maintainer(s) of the app and any future contributor.

### 1.2 Scope
Our New Home is a single‑page, self‑contained web application (one `index.html`) that renders an interactive 3D/2D model of a specific real apartment. Two named users (and optional guests) can browse the home in 3D orbit, a 2D plan, or a walk‑through view; place and arrange furniture from a catalog; paint walls; adjust lighting and time of day; measure distances; and interact through avatars, gestures, and a pet cat. All edits synchronize live between users through a cloud database. The product runs entirely on free static hosting with no application server and no user‑account system.

**In scope:** floor‑plan visualization; furniture catalog and manipulation; real‑time multi‑user sync; environment/lighting controls; avatars and social interactions; the cat and cleaning mini‑mechanic; measurement; persistence (save/load/export/import); achievements and activity feed.

**Out of scope:** general‑purpose CAD; arbitrary floor‑plan authoring by end users; e‑commerce/checkout; public accounts/social network; server‑side compute; native mobile apps.

### 1.3 Definitions, Acronyms, Abbreviations
| Term | Meaning |
|---|---|
| **RTDB** | Firebase Realtime Database (the cloud sync backend) |
| **Piece / item** | A placed furniture object in the scene |
| **Catalog** | The list of furniture types that can be added |
| **Parametric piece** | Furniture built from primitives at runtime (scales cleanly) |
| **Model piece** | Furniture loaded from an embedded FBX 3D model |
| **PLAN** | The data structure describing rooms (rectangles) and walls (centerlines) |
| **Wall‑mounted** | A piece hung on a wall at a hang height rather than on the floor |
| **Host role** | The device authoritative for the cat/dirt timer |
| **Guest** | A view‑only visitor identity |

### 1.4 References
- Game Design Document: `Our-New-Home-GDD_2.md`
- Three.js r0.160 (rendering) · Firebase JS SDK 10.12 (RTDB)
- Source of record: the single `index.html` in the repository

### 1.5 Overview
Section 2 gives the overall product context, users, and constraints. Section 3 enumerates external interfaces, functional requirements (FR‑*), and non‑functional requirements (NFR‑*). Section 4 defines the data/persistence model.

---

## 2. Overall Description

### 2.1 Product Perspective
The app is a standalone static web page. There is no backend service the team operates; the only external system is a hosted Firebase Realtime Database used purely as a shared, live key‑value store for room state and presence. The 3D scene, all UI, the furniture catalog, and the embedded character/furniture models are contained in one HTML file so the whole product deploys by pushing to a GitHub Pages branch.

```
┌────────────┐     live state (WebSocket)     ┌───────────────────┐
│  Device A   │ ◀────────────────────────────▶ │ Firebase RTDB      │
│ (index.html)│                                │  /room/layout      │
└────────────┘                                │  /room/players     │
┌────────────┐                                │  /room/drag, /cat  │
│  Device B   │ ◀────────────────────────────▶ │  /dirt, /activity… │
│ (index.html)│                                └───────────────────┘
└────────────┘
      ▲ served as static files from GitHub Pages
```

### 2.2 Product Functions (summary)
- Visualize a specific apartment in **3D orbit, 2D plan, and walk‑around** views.
- **Add, move, rotate, resize, recolor, stack, delete** furniture from a categorized catalog.
- **Hang pieces on walls** (inherent wall items + a floor↔wall toggle for any piece).
- **Real‑time collaboration:** both users see each other's edits, avatars, and cursors/drags live.
- **Environment:** time of day (manual or live clock), sun direction, day/night theme, per‑wall paint color, 1 m floor grid.
- **Social/ambient:** avatars with sit/sleep, radial gesture menus (wave/kiss/hug), a wandering pet cat, and a cleaning mini‑mechanic (dirt).
- **Utilities:** distance measure tool, screenshots, undo, achievements, activity feed, save/load/export/import.
- **Persistence & sync** of the entire room to the cloud and to local storage.

### 2.3 User Classes and Characteristics
| User class | Description | Rights |
|---|---|---|
| **Husband (Abdulla)** | Primary owner, blue avatar | Full edit; can send/receive greeting message; kiss/hug partner |
| **Wife (Miaad)** | Primary owner, pink avatar | Full edit; same as above |
| **Guest** | Named visitor, grey avatar | View‑only; can look around and walk; cannot edit or clean |

Both primary users are non‑technical and use the app mainly on iPhones. The two owners are a couple; the app's tone and social features assume mutual trust.

### 2.4 Operating Environment
- **Clients:** modern mobile and desktop browsers with WebGL2 (iOS Safari, Chrome, Edge). iPhone‑first.
- **Hosting:** GitHub Pages (static). `.nojekyll` required (the large embedded‑model HTML breaks the Jekyll build).
- **Backend:** Firebase RTDB (config baked into the page; connects automatically after sign‑in).

### 2.5 Design and Implementation Constraints
- **C‑1** Single self‑contained `index.html`; character/furniture models embedded as base64 — no external asset requests for core content.
- **C‑2** No application server, no build step required to ship; deploy = `git push`.
- **C‑3** No real authentication or private data store; identities are fixed and passwords are cosmetic/client‑side.
- **C‑4** Free‑tier friendly: minimal, coarse‑grained RTDB traffic.
- **C‑5** iPhone‑first, touch‑first interaction; must remain usable one‑handed.
- **C‑6** The file must be edited with encoding‑safe tooling (UTF‑8 without BOM) to avoid corrupting embedded data/emoji.

### 2.6 Assumptions and Dependencies
- Availability of the Firebase RTDB endpoint and the Three.js / Firebase CDN modules at runtime.
- Only a small number of concurrent users (the couple + occasional guest).
- The apartment's floor plan is fixed in code and changes only via developer edits.

---

## 3. Specific Requirements

### 3.1 External Interface Requirements

#### 3.1.1 User Interfaces
- **UI‑1** A top bar with: Rooms, app title + presence dot, current‑view toggle, theme toggle, Settings.
- **UI‑2** A bottom action bar with: **Add**, **Undo**, **Measure**, **Screenshot**, **Achievements**, **Activity** (with unread badge).
- **UI‑3** A floating selection toolbar ("pill") for the selected piece: Rotate, Color, Resize, **Wall‑mount toggle**, Use (sit/sleep, contextual), Delete, plus a live measurement readout.
- **UI‑4** A resize panel with typed Width/Depth/Height inputs, ±5 cm steppers, and a Raise control for wall‑mounted pieces.
- **UI‑5** An "Add furniture" bottom sheet with category tabs and a thumbnail grid; items can be tapped or dragged into the scene.
- **UI‑6** A Settings drawer grouped into cards: You, Environment, Multiplayer, Layout.
- **UI‑7** A radial context menu anchored to avatars/cat for gestures/actions.
- **UI‑8** Icons are crisp inline SVG (device‑consistent); UI uses a modern glass/blur style with light and dark themes and reduced‑motion support.

#### 3.1.2 Hardware Interfaces
- **HW‑1** GPU via WebGL2 for real‑time rendering.
- **HW‑2** Touch, mouse, and keyboard input (WASD/arrows + on‑screen joystick in walk mode).

#### 3.1.3 Software Interfaces
- **SW‑1** Three.js module (scene, cameras, OrbitControls, FBXLoader, SkeletonUtils).
- **SW‑2** Firebase RTDB SDK (`onValue`, `set`, `remove`) over the project database URL.
- **SW‑3** Browser `localStorage` for local persistence of layout, profile, achievements, preferences.

#### 3.1.4 Communications Interfaces
- **COM‑1** WebSocket to RTDB for live reads/writes of room state and presence.
- **COM‑2** Presence heartbeat and stale‑node cleanup for player nodes.
- **COM‑3** Live drag/position streaming at roughly 8–10 Hz; cleared on release.

### 3.2 Functional Requirements

#### FR‑1 Identity & Session
- **FR‑1.1** On entry the app shows a "who's here?" screen with the two owners and a Guest option.
- **FR‑1.2** Selecting an owner prompts for a magic word (case‑insensitive, client‑side); a wrong word shakes and re‑prompts.
- **FR‑1.3** Selecting Guest prompts for a display name and grants a view‑only session.
- **FR‑1.4** On successful entry the app shows a personal greeting, including the partner's saved entry message when available.
- **FR‑1.5** The chosen identity persists locally and can be switched from Settings.

#### FR‑2 Views & Navigation
- **FR‑2.1** Provide three views: **3D orbit**, **2D plan** (with optional 1 m grid), **Walk around**.
- **FR‑2.2** 3D: orbit/zoom; 2D: pan/zoom; both frame the whole plan on entry.
- **FR‑2.3** Walk: move the user's avatar with joystick/WASD, drag to look; collide with walls and furniture; tap seats/beds to use them.
- **FR‑2.4** A Rooms panel lists rooms with area; selecting a room focuses the camera and can rename it and toggle its light.

#### FR‑3 Furniture Catalog & Placement
- **FR‑3.1** Offer a categorized catalog (Seating, Tables, Beds, Storage, Kitchen, Bathroom, Art, Decor, Fun) of parametric and model pieces, each with a name, dimensions, and thumbnail.
- **FR‑3.2** Add a piece by tapping a catalog card (drops into the focused area) or dragging it out of the tray.
- **FR‑3.3** A piece spawns near the current view focus and animates into place.
- **FR‑3.4** Support custom plan‑view thumbnails per catalog entry (e.g., branded sofa modules).

#### FR‑4 Furniture Manipulation
- **FR‑4.1** Select a piece by tapping it; show its toolbar and live size/clearance readout.
- **FR‑4.2** **Move:** drag the selected piece; it slides across open‑plan boundaries and clamps at real walls; a metre grid appears while arranging.
- **FR‑4.3** **Rotate:** 45° increments.
- **FR‑4.4** **Resize:** per‑axis, by typing centimetres or ±5 cm steppers, within sane scale limits.
- **FR‑4.5** **Recolor:** apply a tint via a color picker.
- **FR‑4.6** **Delete:** remove the selected piece.
- **FR‑4.7** **Stacking:** a piece dropped with its centre over another rides on top of it (e.g., stack washers, put items on a tabletop); the exact stack height is preserved.
- **FR‑4.8** **Rugs/flat mats** always lie flat on the floor and never stack onto objects; other pieces placed over a rug rest on the floor above it.
- **FR‑4.9** **Wall mounting:** inherent wall pieces (art, curtains, wall TV, wall shelves) stick to the nearest wall facing inward at a hang height; a **floor↔wall toggle** lets any eligible floor piece be hung on a wall and slid up/down via the Raise control, and returned to the floor.
- **FR‑4.10** **Undo:** revert the last edit (add/move/rotate/resize/recolor/delete/paint) via a button or Ctrl/Cmd+Z, with a bounded history.

#### FR‑5 Real‑Time Collaboration
- **FR‑5.1** Persist and synchronize the full room (furniture, wall colors, room names, lights, sun, environment) to the cloud so both users always see the same home.
- **FR‑5.2** Show each connected user as a live avatar with name tag; stream their position/movement in near real time.
- **FR‑5.3** Stream live furniture drags so the partner sees a piece move as it is dragged; clear the stream on release.
- **FR‑5.4** Reflect remote edits without disrupting the local user's current interaction.
- **FR‑5.5** **Adopt‑before‑save safeguard:** on connect, the device must adopt the cloud room on the first sync (regardless of author) and must not push any save until it has done so — preventing a stale/second device from overwriting the shared home.
- **FR‑5.6** Detect and clean up stale presence nodes (a device gone for over ~5 minutes).

#### FR‑6 Avatars & Social Interactions
- **FR‑6.1** In walk view, the user's avatar can sit on seating and lie on beds via smart posing near the piece.
- **FR‑6.2** A radial menu offers context actions: self (stand, wave), partner (kiss, hug, wave), cat (pet, feed).
- **FR‑6.3** Kiss/hug trigger a shared animation with an emoji burst that appears between the two avatars and scales with zoom.
- **FR‑6.4** While a partner is offline, an owner may reposition the partner's avatar.

#### FR‑7 The Cat (Ambient Pet)
- **FR‑7.1** A pet cat autonomously wanders, may perch on furniture, recovers when stuck, and re‑plans when furniture changes.
- **FR‑7.2** The cat can be petted and fed via the radial menu; it can be picked up and set down.
- **FR‑7.3** One host device runs the cat/mess timing to avoid duplication; cat state syncs to all devices.

#### FR‑8 Cleaning Mini‑Mechanic (Dirt)
- **FR‑8.1** Messes (dirt spots) appear over time on open floor, revealed gradually and avoiding furniture footprints.
- **FR‑8.2** Dirt renders on top of any rug beneath it (never buried).
- **FR‑8.3** Tapping dirt cleans it (two taps to fully remove); dirt has a generous tap target and takes priority over a rug it sits on. Guests cannot clean.
- **FR‑8.4** Dirt state syncs across devices.

#### FR‑9 Environment & Lighting
- **FR‑9.1** Set the time of day either by entering a specific time or by following the real clock (dynamic).
- **FR‑9.2** Adjust sun direction via a compass slider; scene lighting/shadows update.
- **FR‑9.3** Toggle a light/dark theme for the scene and UI; the choice persists across reloads.
- **FR‑9.4** Paint walls: choose from preset colors, a custom color, or tap a single wall in the room to paint just that one; reset available.
- **FR‑9.5** Toggle a 1 m × 1 m floor grid in the plan view; per‑room ceiling lights can be toggled.

#### FR‑10 Measurement
- **FR‑10.1** A Measure tool lets the user tap two points on the floor to draw a line and show the distance (metres, or centimetres for short spans) at the line's midpoint, in both 2D and 3D.
- **FR‑10.2** Either endpoint can be grabbed and dragged; the line and reading update live.
- **FR‑10.3** A third tap starts a fresh measurement; toggling the tool off clears it. Measurements are purely visual and are not persisted or synced.

#### FR‑11 Persistence, Sharing & Housekeeping
- **FR‑11.1** Save/Load the layout locally; Export/Import the layout as a JSON file.
- **FR‑11.2** "Clear all furniture" with confirmation.
- **FR‑11.3** Capture a screenshot of the current scene for sharing.
- **FR‑11.4** Record an activity feed of notable changes with an unread badge.
- **FR‑11.5** Provide unlockable achievements for milestones (first piece, made‑to‑measure, full house, etc.).

### 3.3 Non‑Functional Requirements

#### Performance
- **NFR‑P1** Maintain interactive frame rates on a modern phone; render pixel ratio is capped (≤2) and a single continuous render loop drives the animated scene.
- **NFR‑P2** Live position/drag updates are throttled (~8–10 Hz) to limit database traffic.
- **NFR‑P3** Removed pieces dispose their GPU geometry/materials to avoid leaks over a long session.

#### Reliability & Data Integrity
- **NFR‑R1** A device must never overwrite the shared room with stale local state (see FR‑5.5).
- **NFR‑R2** Exact stack heights and wall/floor state are serialized so a synced/reloaded layout matches the author's screen (no re‑guessing).
- **NFR‑R3** Interrupted touches (pointer cancel / lost capture / blur) safely reset in‑progress interactions.

#### Usability
- **NFR‑U1** One‑handed, touch‑first operation on iPhone; large tap targets for key actions (e.g., dirt, measure endpoints).
- **NFR‑U2** Consistent, device‑independent iconography (inline SVG) and a modern, legible visual style with light/dark themes.
- **NFR‑U3** Respect `prefers-reduced-motion`.
- **NFR‑U4** Clear, friendly feedback via toasts, hints, and sounds.

#### Portability & Maintainability
- **NFR‑M1** Ship as one static file deployable by `git push`; no build server.
- **NFR‑M2** Keep core content self‑contained (embedded models) so the app works without external asset hosting.
- **NFR‑M3** Edits must preserve UTF‑8 (no BOM) to protect embedded data.

#### Security & Privacy
- **NFR‑S1** No collection of personal data beyond a chosen display name and an optional greeting message.
- **NFR‑S2** Identities are fixed and passwords are cosmetic; the app is intended for a trusted private couple, not public multi‑tenant use.
- **NFR‑S3** Database rules should be scoped to the room subtree (recommended hardening).

#### Availability
- **NFR‑A1** The app loads and is usable offline for viewing/editing the last local layout; collaboration resumes when connectivity and the database are available.

---

## 4. Data & Persistence Model

### 4.1 Cloud (RTDB) nodes under `/room`
| Node | Purpose |
|---|---|
| `layout` | Authoritative room: furniture list, wall colors, room names, lights, sun, profile, messages, author, timestamp |
| `players` | Live presence/position per role (with heartbeat) |
| `drag` | Transient live‑drag stream of a moving piece |
| `cat` | Cat position/state |
| `dirt` | Active mess spots |
| `activity` | Recent change log |
| `kiss`, `gesture`, `catfeed` | Transient social/interaction events |

### 4.2 Furniture record (per piece)
`id`, `type`, position `x/z/y`, rotation `rotY`, scale `sx/sy/sz`, `tint`, hang height `hy`, and `ow` (wall‑mounted flag). Positions are in metres; `+x` = east, `+z` = south.

### 4.3 Local storage
Theme, chosen identity, profile, entry messages, last layout, activity, achievements/progress, and preferences (grid, time‑of‑day).

### 4.4 Floor‑plan model (developer‑maintained)
`PLAN.rooms` — named rectangles in metres; `PLAN.walls` — wall centerlines (0.2 m thick) with openings (door/window/arch/glass wall/rail). Used to render walls/floors, clamp furniture, and drive navigation.

---

## 5. Acceptance Criteria (representative)
- Two devices signed in as the two owners see each other's avatars and edits within ~1 second.
- A stale device joining an existing room adopts the cloud layout and cannot overwrite it.
- Furniture can be added, moved, rotated, resized (typed cm), recolored, stacked, wall‑mounted, and deleted, with correct heights after reload.
- The measure tool reports correct distances in 2D and 3D and supports draggable endpoints.
- The app is fully operable one‑handed on an iPhone in both light and dark themes.

---

*End of SRS v1.0.*
