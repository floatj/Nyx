# AI Text RPG - Phase 2 Enhancements

_Last updated: 2025-11-09 (UTC+8)_

---

## Overview

This document captures recommended enhancements and corrections to be implemented **after MVP (v0.1-v0.3)**. These items improve robustness, security, observability, and user experience without blocking initial release.

---

## 1) Critical Technical Corrections

### 1.1) SSE/EventSource Implementation Fix

**Issue**: `EventSource` API only supports GET requests; `/api/play` requires POST with body.

**Current (MVP) - Won't Work**:
```ts
// ❌ WRONG - EventSource can't POST
const es = new EventSource('/api/play', { withCredentials: false });
```

**Phase 2 Solution**:
```ts
// ✅ Use fetch with ReadableStream
async function streamPlayTurn(payload) {
  const response = await fetch('/api/play', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

  while (true) {
    const {value, done} = await reader.read();
    if (done) break;

    // Parse SSE format: "data: {json}\n\n"
    const lines = value.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const chunk = JSON.parse(line.slice(6));
        yield chunk;
      }
    }
  }
}
```

**Alternative**: Use `@microsoft/fetch-event-source` library for better SSE handling with POST.

**Priority**: HIGH (Week 1 of Phase 2)

---

### 1.2) Robust JSON Parsing

**Issue**: Regex-based JSON extraction is fragile; models may output markdown, partial JSON, or extra text.

**Phase 2 Solution**:
```ts
import { jsonrepair } from 'jsonrepair';

function parseModelOutput(rawText: string) {
  // Step 1: Try direct parse
  try {
    return JSON.parse(rawText);
  } catch {}

  // Step 2: Extract JSON from markdown code block
  const codeBlockMatch = rawText.match(/```json?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {}
  }

  // Step 3: Try jsonrepair for malformed JSON
  try {
    const repaired = jsonrepair(rawText);
    return JSON.parse(repaired);
  } catch {}

  // Step 4: Regex fallback (last resort)
  const jsonMatch = rawText.match(/\{[\s\S]*"narration"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonrepair(jsonMatch[0]));
    } catch {}
  }

  // Step 5: Fallback to plain text
  return {
    narration: rawText,
    choices: [
      { id: 'continue', label: 'Continue' }
    ],
    meta: { parseFailed: true }
  };
}
```

**Additional**: Configure OpenRouter to use JSON mode if model supports it:
```ts
body: {
  model,
  response_format: { type: 'json_object' }, // For compatible models
  messages: [...]
}
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

## 2) Enhanced Session Management

### 2.1) Secure Anonymous Tokens

**Current Gap**: "Anonymous auth token" mentioned but implementation unclear.

**Phase 2 Implementation**:
```ts
// Backend: Generate signed JWT
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

function createSession() {
  const sessionId = randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      sessionId,
      type: 'anonymous',
      createdAt: Date.now(),
      tokenBudget: parseInt(process.env.TOKEN_BUDGET_PER_SESSION || '20000')
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { sessionId, token, expiresIn: 7 * 24 * 60 * 60 };
}

// Middleware
function validateSession(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try {
    req.session = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
```

**Security Features**:
- Signed tokens prevent tampering
- Expiration limits session lifetime
- Session ID is cryptographically random
- Token includes budget metadata

**Priority**: HIGH (Week 1 of Phase 2)

---

### 2.2) Session State Persistence

**Enhancement**: Optional Redis/SQLite session store for crash recovery.

```ts
// sessions table schema
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_used INTEGER DEFAULT 0,
  turn_count INTEGER DEFAULT 0,
  created_at INTEGER,
  last_active INTEGER,
  metadata JSON
);

// Update on each turn
UPDATE sessions
SET token_used = token_used + ?,
    turn_count = turn_count + 1,
    last_active = ?
WHERE id = ?;
```

**Priority**: LOW (Phase 2 stretch)

---

## 3) Hardened Cost Controls

### 3.1) Pre-flight Cost Estimation

**Gap**: Token budget tracked but no pre-flight check.

**Phase 2 Addition**:
```ts
import { encode } from 'gpt-tokenizer'; // or tiktoken

function estimateCost(payload) {
  const messages = promptService.buildMessages(payload);
  const promptText = messages.map(m =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  ).join('\n');

  const promptTokens = encode(promptText).length;
  const maxCompletionTokens = payload.max_tokens || 600;

  // Rough cost per 1M tokens (update based on model)
  const costs = {
    'anthropic/claude-3.5-sonnet': { prompt: 3, completion: 15 },
    'openai/gpt-4': { prompt: 30, completion: 60 }
  };

  const modelCost = costs[payload.model] || { prompt: 5, completion: 10 };
  const estimatedCost =
    (promptTokens * modelCost.prompt + maxCompletionTokens * modelCost.completion) / 1_000_000;

  return { promptTokens, maxCompletionTokens, estimatedCost };
}

// In /api/play endpoint
const estimate = estimateCost(payload);
const session = await getSession(sessionId);

if (session.tokenUsed + estimate.promptTokens + estimate.maxCompletionTokens > session.budget) {
  return res.status(429).json({
    error: 'Token budget exceeded',
    used: session.tokenUsed,
    budget: session.budget,
    estimate
  });
}
```

**Priority**: HIGH (Week 1 of Phase 2)

---

### 3.2) Real-time Budget Dashboard

**Frontend Component**:
```svelte
<script>
  export let used, budget, estimate;
  $: percentage = (used / budget) * 100;
  $: remaining = budget - used;
  $: color = percentage > 80 ? 'red' : percentage > 60 ? 'yellow' : 'green';
</script>

<div class="token-meter">
  <div class="meter-bar bg-{color}-500" style="width: {percentage}%"></div>
  <span class="text-sm">
    {used.toLocaleString()} / {budget.toLocaleString()} tokens
    {#if estimate}
      (next: ~{estimate.promptTokens + estimate.maxCompletionTokens})
    {/if}
  </span>
</div>
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

## 4) Advanced Safety & Moderation

### 4.1) Third-party Moderation Integration

**Current**: "Lightweight regex + optional 3rd-party later"

**Phase 2 Options**:

**Option A: OpenAI Moderation API** (Free, reliable)
```ts
async function moderateContent(text: string) {
  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input: text })
  });

  const data = await response.json();
  const flagged = data.results[0].flagged;
  const categories = Object.entries(data.results[0].categories)
    .filter(([_, v]) => v)
    .map(([k]) => k);

  return { allowed: !flagged, reasons: categories };
}
```

**Option B: Local NLP classifier** (e.g., `compromise` library)
```ts
import nlp from 'compromise';

const bannedPatterns = [
  /\b(explicit terms here)\b/i,
  // ... PII patterns
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/i, // Email
];

function localModeration(text: string) {
  const doc = nlp(text);
  const reasons = [];

  for (const pattern of bannedPatterns) {
    if (pattern.test(text)) reasons.push('banned_content');
  }

  // Check for PII
  if (doc.people().length > 3) reasons.push('potential_pii');
  if (doc.phoneNumbers().length) reasons.push('phone_number');

  return { allowed: reasons.length === 0, reasons };
}
```

**Recommendation**: Start with OpenAI Moderation (free tier) + local PII detection.

**Priority**: MEDIUM (Week 2 of Phase 2)

---

### 4.2) Explicit Safety Filters

**PII Detection Patterns**:
```ts
const PII_PATTERNS = {
  email: /\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,
  phone: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  address: /\b\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct)\b/gi
};

function redactPII(text: string): string {
  let redacted = text;
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    redacted = redacted.replace(pattern, `[${type.toUpperCase()}_REDACTED]`);
  }
  return redacted;
}
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

## 5) State Machine Formalization

### 5.1) Explicit FSM Definition

**Current Gap**: State machine mentioned but states not fully defined.

**Phase 2 Implementation**:
```ts
// gameStore.ts
type GameState =
  | 'idle'           // Initial or reset
  | 'starting'       // Loading mode/lore
  | 'streaming'      // Receiving LLM output
  | 'awaiting_choice'// Waiting for user selection
  | 'processing'     // Sending choice to backend
  | 'error'          // Recoverable error
  | 'budget_exceeded'// Hard stop
  | 'completed';     // Story ended

type GameEvent =
  | { type: 'START_GAME', mode: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_CHUNK', chunk: any }
  | { type: 'STREAM_END' }
  | { type: 'SELECT_CHOICE', choiceId: string }
  | { type: 'ERROR', error: Error }
  | { type: 'RESET' };

function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (state) {
    case 'idle':
      return event.type === 'START_GAME' ? 'starting' : state;
    case 'starting':
      return event.type === 'STREAM_START' ? 'streaming' : state;
    case 'streaming':
      if (event.type === 'STREAM_END') return 'awaiting_choice';
      if (event.type === 'ERROR') return 'error';
      return state;
    case 'awaiting_choice':
      return event.type === 'SELECT_CHOICE' ? 'processing' : state;
    case 'processing':
      return event.type === 'STREAM_START' ? 'streaming' : state;
    case 'error':
      return event.type === 'RESET' ? 'idle' : state;
    default:
      return state;
  }
}
```

**Transition Guards**:
```ts
const ALLOWED_TRANSITIONS = {
  'idle': ['starting'],
  'starting': ['streaming', 'error'],
  'streaming': ['awaiting_choice', 'error'],
  'awaiting_choice': ['processing'],
  'processing': ['streaming', 'error'],
  'error': ['idle'],
  'budget_exceeded': ['idle'],
  'completed': ['idle']
};
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

## 6) History Management & Summarization

### 6.1) Sliding Window with Summarization

**Issue**: Long games will exceed context limits.

**Phase 2 Strategy**:
```ts
const MAX_HISTORY_TURNS = 10;
const SUMMARY_THRESHOLD = 8;

async function buildMessages(payload) {
  let history = payload.history;

  // If history > threshold, summarize older turns
  if (history.length > SUMMARY_THRESHOLD) {
    const recentTurns = history.slice(-MAX_HISTORY_TURNS);
    const olderTurns = history.slice(0, -MAX_HISTORY_TURNS);

    const summary = await summarizeHistory(olderTurns);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Story so far: ${summary}` },
      ...recentTurns
    ];
  }

  return [
    { role: 'system', content: systemPrompt },
    ...history
  ];
}

async function summarizeHistory(turns) {
  const combined = turns.map(t =>
    typeof t.content === 'string' ? t.content : t.content.narration
  ).join('\n\n');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    // ... headers
    body: JSON.stringify({
      model: 'anthropic/claude-3-haiku', // Cheap model for summaries
      messages: [{
        role: 'user',
        content: `Summarize this RPG story in 3-4 sentences:\n\n${combined}`
      }],
      max_tokens: 200
    })
  });

  return (await response.json()).choices[0].message.content;
}
```

**Priority**: HIGH (Week 3 of Phase 2)

---

### 6.2) Export Full vs. Compressed History

**Enhancement**: Offer two export formats.

```ts
// Full export (for archiving)
function exportFull(gameState) {
  return JSON.stringify({
    version: '1.0',
    mode: gameState.mode,
    history: gameState.history, // All turns
    metadata: {
      tokensUsed: gameState.tokenUsed,
      turnCount: gameState.history.length,
      exportedAt: new Date().toISOString()
    }
  }, null, 2);
}

// Compressed export (for sharing)
function exportCompressed(gameState) {
  const compressed = {
    v: '1.0',
    m: gameState.mode,
    h: gameState.history.map(t => ({
      r: t.role[0], // 's', 'a', 'u'
      c: typeof t.content === 'string'
        ? t.content
        : { n: t.content.narration, ch: t.content.choices?.map(c => c.label) }
    }))
  };
  return JSON.stringify(compressed);
}
```

**Priority**: LOW (Phase 2 stretch)

---

## 7) Error Handling & Resilience

### 7.1) Retry Strategy with Exponential Backoff

**Current Gap**: "Toast with retry" mentioned but strategy unclear.

**Phase 2 Implementation**:
```ts
async function fetchWithRetry(url, options, maxRetries = 3) {
  const delays = [1000, 2000, 4000]; // Exponential backoff

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on 429, 502, 503, 504
      if ([429, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
}
```

**Frontend Toast System**:
```svelte
<!-- Toast.svelte -->
<script>
  export let message, type = 'error', retry = null;
</script>

<div class="toast toast-{type}">
  <span>{message}</span>
  {#if retry}
    <button on:click={retry}>Retry</button>
  {/if}
</div>
```

**Priority**: HIGH (Week 1 of Phase 2)

---

### 7.2) Circuit Breaker Pattern

**For persistent failures**:
```ts
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

const openRouterBreaker = new CircuitBreaker();
```

**Priority**: MEDIUM (Week 3 of Phase 2)

---

### 7.3) Degraded Mode

**Fallback when streaming fails**:
```ts
async function playTurn(payload) {
  try {
    return await playTurnStreaming(payload);
  } catch (error) {
    console.warn('Streaming failed, falling back to non-stream', error);
    return await playTurnNonStreaming(payload);
  }
}

async function playTurnNonStreaming(payload) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    // ... headers
    body: JSON.stringify({
      ...payload,
      stream: false // Disable streaming
    })
  });

  const data = await response.json();
  return parseModelOutput(data.choices[0].message.content);
}
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

## 8) Testing Infrastructure

### 8.1) Testing Framework Selection

**Unit Tests**: Vitest (fast, Vite-native)
```ts
// tests/promptService.test.ts
import { describe, it, expect } from 'vitest';
import { buildMessages } from '../src/services/promptService';

describe('promptService', () => {
  it('should build system + history messages', () => {
    const result = buildMessages({
      mode: 'dungeon',
      history: [
        { role: 'user', content: 'Go left' }
      ]
    });

    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('text RPG engine');
  });
});
```

**E2E Tests**: Playwright (cross-browser)
```ts
// tests/e2e/gameplay.spec.ts
import { test, expect } from '@playwright/test';

test('complete a full turn', async ({ page }) => {
  await page.goto('/play');

  // Start game
  await page.click('[data-test="start-dungeon"]');

  // Wait for streaming
  await expect(page.locator('.story-pane')).toContainText('You find yourself', {
    timeout: 10000
  });

  // Select choice
  await page.click('[data-test^="choice-"]');

  // Verify token meter updated
  const tokenUsed = await page.locator('[data-test="token-used"]').textContent();
  expect(parseInt(tokenUsed)).toBeGreaterThan(0);
});
```

**Priority**: HIGH (Week 1 of Phase 2)

---

### 8.2) Mock OpenRouter for Tests

```ts
// tests/mocks/openrouter.ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const mockOpenRouter = setupServer(
  http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
    const body = await request.json();

    const mockResponse = {
      narration: "You enter a dimly lit corridor.",
      choices: [
        { id: 'left', label: 'Go left' },
        { id: 'right', label: 'Go right' }
      ]
    };

    if (body.stream) {
      // Return SSE stream
      return new HttpResponse(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(mockResponse) } }] })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    return HttpResponse.json({
      choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      usage: { prompt_tokens: 150, completion_tokens: 75 }
    });
  })
);
```

**Priority**: HIGH (Week 1 of Phase 2)

---

### 8.3) Load Testing

**For streaming endpoints**:
```ts
// tests/load/k6-script.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  const payload = JSON.stringify({
    sessionId: 'test-session',
    mode: 'dungeon',
    history: [],
    player_input: 'Start adventure',
    model: 'anthropic/claude-3-haiku'
  });

  const res = http.post('http://localhost:3000/api/play', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });

  sleep(5);
}
```

**Priority**: MEDIUM (Week 3 of Phase 2)

---

## 9) Monitoring & Observability

### 9.1) Metrics Collection

**Backend metrics** (Prometheus format):
```ts
import promClient from 'prom-client';

const turnCounter = new promClient.Counter({
  name: 'rpg_turns_total',
  help: 'Total number of game turns',
  labelNames: ['mode', 'model', 'status']
});

const turnDuration = new promClient.Histogram({
  name: 'rpg_turn_duration_seconds',
  help: 'Turn completion time',
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const tokenUsage = new promClient.Gauge({
  name: 'rpg_tokens_used',
  help: 'Tokens consumed per turn',
  labelNames: ['type'] // 'prompt' or 'completion'
});

// Expose metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

### 9.2) Error Tracking

**Sentry integration** (or similar):
```ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  beforeSend(event, hint) {
    // Filter out low-priority errors
    if (event.exception?.values?.[0]?.type === 'AbortError') {
      return null; // User cancelled request
    }
    return event;
  }
});

// In error handler
app.use((err, req, res, next) => {
  Sentry.captureException(err, {
    tags: {
      endpoint: req.path,
      sessionId: req.session?.sessionId
    }
  });
  // ... send response
});
```

**Frontend**:
```ts
import * as Sentry from '@sentry/svelte';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [new Sentry.BrowserTracing()],
  tracesSampleRate: 0.1
});
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

### 9.3) Structured Logging

**Enhance pino logging**:
```ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      sessionId: req.session?.sessionId
    }),
    res: (res) => ({
      statusCode: res.statusCode
    })
  }
});

// Usage
logger.info({
  msg: 'Turn completed',
  sessionId: session.id,
  model: payload.model,
  tokensUsed: usage.total_tokens,
  duration: Date.now() - startTime
});
```

**Priority**: MEDIUM (Week 2 of Phase 2)

---

## 10) Performance Optimizations

### 10.1) Response Caching

**Cache model list**:
```ts
import NodeCache from 'node-cache';

const modelCache = new NodeCache({ stdTTL: 3600 }); // 1 hour

app.get('/api/models', async (req, res) => {
  const cached = modelCache.get('models');
  if (cached) return res.json(cached);

  const response = await fetch('https://openrouter.ai/api/v1/models');
  const models = await response.json();

  modelCache.set('models', models);
  res.json(models);
});
```

**Priority**: LOW (Phase 2 stretch)

---

### 10.2) Prompt Template Pre-compilation

**Compile templates once at startup**:
```ts
import Handlebars from 'handlebars';

const templates = {
  dungeon: Handlebars.compile(`You are a text RPG engine for a gritty fantasy dungeon crawl.
Setting: {{setting}}
Player stats: {{stats}}`),

  journey: Handlebars.compile(`You are a text RPG engine for a hero's journey.
Quest: {{quest}}`)
};

function buildSystemPrompt(mode, variables) {
  return templates[mode](variables);
}
```

**Priority**: LOW (Phase 2 stretch)

---

### 10.3) Frontend Code Splitting

**Lazy-load routes**:
```ts
// routes.ts
import { lazy } from 'svelte';

export const routes = {
  '/': lazy(() => import('./pages/Landing.svelte')),
  '/play': lazy(() => import('./pages/Play.svelte')),
  '/admin': lazy(() => import('./pages/Admin.svelte')),
  '/about': lazy(() => import('./pages/About.svelte'))
};
```

**Priority**: LOW (Phase 2 stretch)

---

## 11) Additional Features

### 11.1) Keyboard Shortcuts

```svelte
<script>
  import { onMount } from 'svelte';

  onMount(() => {
    function handleKeydown(e) {
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (choices[index]) selectChoice(choices[index].id);
      }
      if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        openSaveModal();
      }
      if (e.key === 'Escape') {
        cancelStream();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>
```

**Priority**: MEDIUM (Week 3 of Phase 2)

---

### 11.2) Share Transcript

**Generate shareable link**:
```ts
// Backend
app.post('/api/share', async (req, res) => {
  const { history } = req.body;

  // Option 1: Paste service
  const pasteResponse = await fetch('https://api.paste.gg/v1/pastes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'RPG Transcript',
      files: [{
        name: 'transcript.json',
        content: { format: 'text', value: JSON.stringify(history, null, 2) }
      }]
    })
  });

  const data = await pasteResponse.json();
  const shareUrl = `https://paste.gg/${data.result.id}`;

  res.json({ shareUrl });
});
```

**Priority**: LOW (Phase 2 stretch)

---

### 11.3) Dark/Light Theme Toggle

```svelte
<!-- ThemeToggle.svelte -->
<script>
  import { writable } from 'svelte/store';

  const theme = writable(localStorage.getItem('theme') || 'dark');

  function toggleTheme() {
    theme.update(t => {
      const newTheme = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      return newTheme;
    });
  }
</script>

<button on:click={toggleTheme} class="theme-toggle">
  {$theme === 'dark' ? '☀️' : '🌙'}
</button>
```

**Tailwind config**:
```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  // ...
};
```

**Priority**: LOW (Phase 2 stretch)

---

## 12) Security Hardening

### 12.1) Rate Limiting Enhancement

**Improved multi-layer rate limiting**:
```ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// IP-based (coarse protection)
const ipLimiter = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: 'Too many requests from this IP'
});

// Session-based (fine-grained)
const sessionLimiter = rateLimit({
  store: new RedisStore({ client: redis, prefix: 'session:' }),
  windowMs: 5 * 60 * 1000, // 5 min
  max: 30,
  keyGenerator: (req) => req.session.sessionId,
  message: 'Session rate limit exceeded'
});

app.use('/api/play', ipLimiter, sessionLimiter);
```

**Priority**: HIGH (Week 1 of Phase 2)

---

### 12.2) Input Sanitization

```ts
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

const PlayRequestSchema = z.object({
  sessionId: z.string().uuid(),
  mode: z.enum(['dungeon', 'journey', 'mystery']),
  player_input: z.string().max(500),
  model: z.string().regex(/^[\w\/-]+$/),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().min(100).max(2000)
});

app.post('/api/play', (req, res) => {
  // Validate schema
  const validated = PlayRequestSchema.parse(req.body);

  // Sanitize text input
  validated.player_input = DOMPurify.sanitize(validated.player_input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });

  // Continue processing...
});
```

**Priority**: HIGH (Week 1 of Phase 2)

---

### 12.3) CORS & Security Headers

```ts
import helmet from 'helmet';
import cors from 'cors';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // For Vite HMR in dev
      connectSrc: ["'self'", 'https://openrouter.ai'],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true
}));
```

**Priority**: HIGH (Week 1 of Phase 2)

---

## 13) Documentation

### 13.1) API Documentation

**OpenAPI/Swagger spec**:
```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: AI Text RPG API
  version: 1.0.0

paths:
  /api/session:
    post:
      summary: Create anonymous session
      responses:
        '200':
          description: Session created
          content:
            application/json:
              schema:
                type: object
                properties:
                  sessionId: { type: string, format: uuid }
                  token: { type: string }
                  tokenBudget: { type: integer }

  /api/play:
    post:
      summary: Execute game turn
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PlayRequest'
      responses:
        '200':
          description: SSE stream of turn response
          content:
            text/event-stream:
              schema:
                type: string
```

**Priority**: LOW (Phase 2 stretch)

---

### 13.2) Developer Guide

**Create `CONTRIBUTING.md`**:
- Setup instructions
- Architecture diagrams
- Prompt engineering guidelines
- Testing procedures
- Deployment checklist

**Priority**: LOW (Phase 2 stretch)

---

## 14) Phase 2 Timeline

### Week 1 (High Priority)
- [ ] Fix SSE/EventSource implementation
- [ ] Implement secure session tokens (JWT)
- [ ] Add pre-flight cost estimation
- [ ] Enhance rate limiting
- [ ] Input sanitization & security headers
- [ ] Setup test framework (Vitest + Playwright)
- [ ] Retry strategy with exponential backoff

### Week 2 (Medium Priority)
- [ ] Robust JSON parsing with jsonrepair
- [ ] Third-party moderation integration
- [ ] Formalize state machine
- [ ] Error tracking (Sentry)
- [ ] Structured logging
- [ ] Metrics collection
- [ ] Circuit breaker pattern
- [ ] Degraded mode fallback
- [ ] Token budget dashboard

### Week 3 (Low Priority + Polish)
- [ ] History summarization
- [ ] Keyboard shortcuts
- [ ] Load testing
- [ ] Performance optimizations
- [ ] Dark/light theme (stretch)
- [ ] Share transcript (stretch)
- [ ] API documentation (stretch)

---

## 15) Dependencies to Add

```json
{
  "dependencies": {
    "jsonwebtoken": "^9.0.2",
    "jsonrepair": "^3.4.0",
    "@microsoft/fetch-event-source": "^2.0.1",
    "node-cache": "^5.1.2",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "rate-limit-redis": "^4.2.0",
    "ioredis": "^5.3.2",
    "isomorphic-dompurify": "^2.9.0",
    "zod": "^3.22.4",
    "prom-client": "^15.1.0",
    "@sentry/node": "^7.99.0",
    "@sentry/svelte": "^7.99.0"
  },
  "devDependencies": {
    "vitest": "^1.2.0",
    "@playwright/test": "^1.41.0",
    "msw": "^2.0.11",
    "k6": "^0.48.0"
  }
}
```

---

## 16) Open Questions for Phase 2

1. **Model whitelist**: Which OpenRouter models should be supported? (performance vs. cost tradeoff)
2. **Summarization frequency**: Summarize every N turns or based on token count?
3. **Error UX**: Should errors pause the game or allow retry with degraded experience?
4. **Analytics**: Track user behavior (opt-in)? Which metrics matter most?
5. **Internationalization**: Support for non-English prompts/UI in future?

---

## Conclusion

These enhancements address the gaps identified in the MVP plan while maintaining focus on production-readiness, security, and user experience. Prioritize Week 1 items for a stable v0.4 release, then incrementally add Week 2-3 features based on user feedback and operational needs.

**Estimated effort**: 3-4 weeks for full Phase 2 completion (high + medium priority items).
