# AI Text RPG MVP Plan (Svelte + Tailwind + Node.js + OpenRouter)

_Last updated: 2025-11-09 (UTC+8)_

---

## 0) MVP Goals & Non‑Goals

**Goals (v0.1 – v0.3):**
- Prompt‑driven, LLM‑generated text RPG (dungeon or story templates) with **choice options**.
- **RWD web app** (mobile‑first) using **Svelte + TailwindCSS**.
- **Node.js backend** that proxies to **OpenRouter** (model‑agnostic) with **streaming**.
- **Stateless guest sessions** + lightweight **local storage save**; **anonymous auth** token.
- **Content safety guardrails** (system prompts + output filters) and **token budget control**.

**Non‑Goals (for MVP):**
- No full account system or payments.
- No image generation or voice I/O.
- No world persistence across users (beyond local saves) or complex multiplayer.

---

## 1) Architecture Overview

**Frontend (Svelte + Tailwind)**
- Pages: `/` (Landing), `/play` (Game), `/admin` (Prompt Lab – protected by simple passcode in env), `/about`.
- Stores: `gameStore` (state machine), `settingsStore` (model, style), `sessionStore` (id, token usage).
- Components: `StoryPane`, `ChoiceList`, `InputBar`, `TokenMeter`, `ModelPicker`, `SaveSlotModal`, `Toast`.

**Backend (Node.js / Express or Hono)**
- Routes: `/api/session`, `/api/play` (LLM turn), `/api/models` (list from OpenRouter), `/api/moderate`, `/api/health`.
- Services: `openrouterClient`, `safetyService`, `promptService`, `usageService`.
- Middlewares: `rateLimit`, `requestId`, `auth(anonymous)`, `cors`, `streamSSE`.

**Data & State**
- MVP persistence: in‑memory + optional `SQLite` via `better-sqlite3` for usage logs.
- Client saves: `localStorage` (save slots) + export/import JSON.
- Telemetry: minimal event log (pageview, turn, tokens).

**Sequence (one turn)**
1) UI sends `{sessionId, history, player_input, mode, system_profile}` to `/api/play`.
2) Backend builds prompt (system + lore + tools + history + new user msg), calls OpenRouter with **stream**.
3) Backend parses model output JSON (choices + narration) or falls back to text parser.
4) Stream tokens to UI; UI appends to history; display choices.
5) Update usage counters + safety checks.

---

## 2) MVP Feature List (prioritized)

1. **Prompt‑driven story engine** with **structured output** (JSON) including `narration`, `choices[]`.
2. **Three starter modes**: "Dungeon Crawl", "Hero’s Journey", "Mystery Night" (prompt presets).
3. **Choice selection** to advance narrative; optional free‑text input.
4. **Save/Load** (local slots) and **Export/Import**.
5. **Streaming output** + **typing cursor** UX.
6. **Model selection** (OpenRouter route + temperature, max_tokens, top_p) with sensible defaults.
7. **Token meter** (soft budget per session).
8. **Safety**: content class filter + banned topic phrases; redaction for PII (basic).
9. **Admin Prompt Lab**: live edit system prompts, test a turn, view raw JSON.

Nice‑to‑have (stretch):
- Theming (dark/light), keyboard navigation, shareable transcript link (paste.gg).

---

## 3) UI/UX & RWD

**Layout** (mobile‑first):
- Sticky header: title, model badge, token meter.
- Main: `StoryPane` (scrollable prose), `ChoiceList` (cards, large tap targets), `InputBar` (optional text).
- Footer: Save/Load, Settings.

**Tailwind tokens**
- Typography: `prose prose-invert` in dark mode; `leading-relaxed`, `tracking-normal`.
- Containers: `max-w-screen-md mx-auto px-4 sm:px-6`.
- Cards: `rounded-2xl shadow-lg p-4 hover:shadow-xl transition`.
- Buttons: `rounded-2xl px-4 py-2 font-medium`.

**States & Feedback**
- Streaming: animated caret, "Stop" button.
- Errors: toast with retry; degraded mode (non‑stream).
- Accessibility: focus outlines, ARIA roles for choices, 44px tap targets.

---

## 4) Domain Model & Prompt Contracts

**Frontend message**
```json
{
  "sessionId": "uuid",
  "history": [
    {"role":"system","content":"…"},
    {"role":"assistant","content":{"narration":"…","choices":["A","B"]}},
    {"role":"user","content":"Take the left corridor."}
  ],
  "mode": "dungeon",
  "player_input": "…",
  "max_tokens": 600,
  "model": "openrouter/anthropic/claude-3.5-sonnet",
  "temperature": 0.7
}
```

**LLM Output (preferred JSON)**
```json
{
  "narration": "<rich, second-person scene>",
  "choices": [
    {"id":"left","label":"Take the left corridor"},
    {"id":"right","label":"Take the right corridor"},
    {"id":"inspect","label":"Inspect the door"}
  ],
  "meta": {"danger": 0.2, "loot": false}
}
```

**System Prompt (template)**
```
You are a text RPG engine. Output STRICT JSON only with keys: narration, choices[], meta.
Each choice must be concise (<= 9 words) and mutually exclusive. Avoid spoilers.
Tone: adventurous, vivid, PG-13 by default. Keep paragraphs <= 4 sentences.
If user enters free text, interpret and map to the closest choice.
```

**Mode Lore Snippets** (inserted after system):
- `dungeon`: gritty fantasy catacombs, traps, light puzzle mechanics.
- `journey`: character growth, companions, travel choices.
- `mystery`: modern noir, clues, time pressure.

**Safety Addendum**
- Refuse sexual content with minors, graphic gore, hate speech; soften or redirect.
- Keep within PG‑13 unless `settings.content_rating = "Mature"` with user confirmation.

---

## 5) Backend API Design (Node.js)

**Env**
- `OPENROUTER_API_KEY` (required)
- `ADMIN_PASSCODE` (for /admin)
- `ALLOWED_ORIGINS` (comma list)
- `MODEL_DEFAULT`, `TOKEN_BUDGET_PER_SESSION` (e.g., 20k)

**Routes**
- `POST /api/session` → returns `{sessionId, tokenBudget}` (create/refresh anonymous session).
- `POST /api/play` → body: message payload; **SSE** stream `data:` with JSON chunks or text fallback.
- `GET /api/models` → fetch & cache OpenRouter models list.
- `POST /api/moderate` → classify input/output, returns `{allowed, reasons[]}`.
- `GET /api/health` → `{ok:true}`.

**OpenRouter Client (stream)**
```ts
POST https://openrouter.ai/api/v1/chat/completions
headers: {
  "Authorization": "Bearer ${OPENROUTER_API_KEY}",
  "HTTP-Referer": "<your site>",
  "X-Title": "AI Text RPG"
}
body: { model, messages, temperature, max_tokens, stream: true }
```

**Server Streaming**
- Use `EventSource` in FE; in BE, pipe OpenRouter stream to SSE with backpressure control.
- Accumulate full text server‑side to parse final JSON; if parse fails, apply regex extraction.

**Rate Limiting & Budget**
- IP + session token window (e.g., 30 req/5min) via `lru-cache`.
- Track `prompt_tokens`, `completion_tokens`, `cost_estimate` per session.

---

## 6) Frontend Implementation Plan (Svelte)

**Scaffold**
- `npm create vite@latest` → `svelte-ts` + Tailwind plugin.
- Add `@tailwindcss/typography` and `@tailwindcss/forms`.

**Key Stores**
- `gameStore.ts`: `{history, mode, status: 'idle'|'streaming'|'error', choices, tokenUsed}`
- `settingsStore.ts`: `{model, temp, maxTokens, contentRating}`
- `sessionStore.ts`: `{id, budget, lastSave}`

**Core Components**
- `<StoryPane>`: renders narration; auto‑scroll on stream.
- `<ChoiceList>`: list of buttons; disable during stream.
- `<InputBar>`: optional free‑text; submit → `/api/play`.
- `<TokenMeter>`: ring or bar with soft cap.
- `<SaveSlotModal>`: local storage CRUD; import/export JSON.

**Networking**
- `useSSE(url, body)` composable to consume a turn.
- Graceful cancel on route change; retry on 429 with backoff.

**RWD Rules**
- Mobile: single column; desktop: two‑pane (story left 65%, choices right 35%).
- Use `sm`, `md`, `lg` breakpoints; ensure 44px tap targets.

---

## 7) Safety & Moderation

- Pre‑check `player_input` via `/api/moderate` (lightweight regex + optional 3rd‑party later).
- Post‑check model output; if flagged → replace with safer paraphrase + apology.
- Maintain an allowlist of models suitable for RPG and block others.
- Add **age‑gate** modal for Mature mode.

---

## 8) Observability & DX

- Server logs: `pino` JSON with `requestId`, latency, tokens.
- Frontend: console error capture + breadcrumb events.
- Feature flags via env: `ENABLE_PROMPT_LAB`, `ENABLE_FREE_TEXT`.
- Script: `npm run dev`, `npm run lint`, `npm run typecheck`.

---

## 9) Deployment

**Option A (fastest):**
- FE: Vite build → Netlify/Vercel static hosting.
- BE: Fly.io/Render/Denoflare Workers/Cloudflare Workers (Hono) with secrets.

**Option B (single node):**
- Docker compose: `frontend` (nginx static) + `backend` (Node) + optional `sqlite volume`.

**Domain & TLS**
- Use Cloudflare proxy; set Security headers (CSP, COEP/COOP if needed for SharedArrayBuffer not required here).

---

## 10) Milestones & Timeline (2–3 weeks)

**Week 1**
- Day 1–2: Scaffold FE/BE, Tailwind, SSE plumbing, session ID.
- Day 3–4: Prompt templates + first end‑to‑end streamed turn.
- Day 5: Choice selection loop + basic saves.

**Week 2**
- Day 6–7: Token meter, model picker, RWD polish.
- Day 8: Safety pass, error states, retries.
- Day 9: Admin Prompt Lab + logs.
- Day 10: Deploy to staging; dogfood.

**Week 3 (buffer)**
- Bugfix, theming, accessibility, performance audit.

---

## 11) Acceptance Criteria (MVP)

- User can start a game, see streamed narration, and pick among 2–4 choices per turn.
- Works on mobile (375px) and desktop (≥1280px) with clean layout.
- Switching model works; token usage is visible; soft cap enforced.
- Save/Load (local) and export/import operate correctly.
- Admin can edit system prompt and test a turn successfully.

---

## 12) Sample Code & Snippets

**Backend: OpenRouter call (Node + fetch)**
```ts
// POST /api/play
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://yourdomain.example',
    'X-Title': 'AI Text RPG'
  },
  body: JSON.stringify({
    model,
    stream: true,
    temperature,
    max_tokens,
    messages: promptService.buildMessages(payload)
  })
});
// Pipe to SSE client…
```

**Frontend: consuming SSE**
```ts
const es = new EventSource('/api/play', { withCredentials: false });
es.onmessage = (e) => { /* append chunk; render */ };
```

**LLM JSON Guard**
```ts
function extractJson(s: string) {
  const m = s.match(/\{[\s\S]*\}$/);
  return m ? JSON.parse(m[0]) : { narration: s, choices: [] };
}
```

---

## 13) Testing Plan

- Unit: prompt builder, JSON parser, safety filters.
- Integration: one‑turn flow against mock OpenRouter.
- E2E: Play 10 turns on mobile + desktop; verify token cap, saves.

---

## 14) Risks & Mitigations

- **Model variability** → enforce strict JSON with repair fallback.
- **Token overrun/cost** → session caps, short system lore, summarize history.
- **Streaming quirks** → retry with non‑stream when needed; server keep‑alive.
- **Safety regressions** → maintain rule tests; manual review in Prompt Lab.

---

## 15) Next Steps (Post‑MVP)

- User accounts + cloud saves; story templates marketplace.
- World state engine with entity stats; lightweight combat.
- Prompt‑programming UI (state graph) + evaluation harness.
- A/B testing of prompts and models; cost dashboards.

