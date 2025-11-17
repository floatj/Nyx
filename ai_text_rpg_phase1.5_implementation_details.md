# AI Text RPG - Phase 1.5: MVP Implementation Details

_Last updated: 2025-11-09 (UTC+8)_

---

## Overview

This document clarifies **critical implementation details** that are essential for the MVP to function properly. These items should be implemented **during MVP development (Weeks 1-3)** rather than deferred to Phase 2, as they form the foundation of the game engine.

**Classification**: Phase 1.5 (MVP-critical, between initial MVP and Phase 2 enhancements)

---

## 1) State Machine Definition (CRITICAL for MVP)

### 1.1) Why This Matters

The `gameStore` mentioned in Section 6 of the MVP plan references a "state machine" but doesn't define:
- What states exist
- Valid transitions between states
- Event handlers for each state
- Error recovery paths

**Without a clear state machine, the UI will have bugs:**
- Users might click choices while streaming is in progress
- Error states won't be handled consistently
- Race conditions between user actions and backend responses
- Unclear when to show/hide UI elements (loading spinners, choice buttons, etc.)

### 1.2) Complete State Machine Specification

#### States

```typescript
type GameState =
  | 'uninitialized'    // App loaded, no game started
  | 'mode_selection'   // User choosing game mode
  | 'starting'         // Loading lore, creating session
  | 'streaming'        // Receiving LLM response via SSE
  | 'awaiting_choice'  // Narration complete, showing choices
  | 'processing_input' // User selected choice, sending to backend
  | 'paused'           // User opened save/settings modal
  | 'error_recoverable'// Temporary error (network), can retry
  | 'error_fatal'      // Unrecoverable (budget exceeded, banned)
  | 'game_over';       // Story concluded naturally
```

#### State Transitions

```typescript
type GameEvent =
  | { type: 'SELECT_MODE', mode: 'dungeon' | 'journey' | 'mystery' }
  | { type: 'START_GAME' }
  | { type: 'SESSION_READY', sessionId: string, token: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_CHUNK', data: string }
  | { type: 'STREAM_COMPLETE', output: LLMOutput }
  | { type: 'SELECT_CHOICE', choiceId: string }
  | { type: 'INPUT_SUBMITTED', text: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ERROR', error: Error, recoverable: boolean }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'END_GAME', ending: 'victory' | 'defeat' | 'abandoned' };

interface LLMOutput {
  narration: string;
  choices: Choice[];
  meta?: {
    danger?: number;
    loot?: boolean;
    ending?: boolean; // Signals game conclusion
  };
}
```

#### Transition Rules

```typescript
const VALID_TRANSITIONS: Record<GameState, Partial<Record<GameEvent['type'], GameState>>> = {
  'uninitialized': {
    'SELECT_MODE': 'mode_selection'
  },

  'mode_selection': {
    'START_GAME': 'starting'
  },

  'starting': {
    'SESSION_READY': 'streaming',
    'ERROR': 'error_recoverable'
  },

  'streaming': {
    'STREAM_COMPLETE': 'awaiting_choice',
    'ERROR': 'error_recoverable',
    'PAUSE': 'paused'
  },

  'awaiting_choice': {
    'SELECT_CHOICE': 'processing_input',
    'INPUT_SUBMITTED': 'processing_input',
    'PAUSE': 'paused',
    'END_GAME': 'game_over'
  },

  'processing_input': {
    'STREAM_START': 'streaming',
    'ERROR': 'error_recoverable'
  },

  'paused': {
    'RESUME': '<<previous_state>>', // Return to state before pause
    'RESET': 'uninitialized'
  },

  'error_recoverable': {
    'RETRY': '<<previous_state>>',
    'RESET': 'uninitialized'
  },

  'error_fatal': {
    'RESET': 'uninitialized'
  },

  'game_over': {
    'RESET': 'uninitialized'
  }
};
```

### 1.3) Svelte Store Implementation

```typescript
// src/stores/gameStore.ts
import { writable, derived } from 'svelte/store';

interface GameStoreState {
  state: GameState;
  previousState: GameState | null;
  mode: 'dungeon' | 'journey' | 'mystery' | null;
  history: Message[];
  currentNarration: string;
  streamBuffer: string;
  choices: Choice[];
  error: Error | null;
  sessionId: string | null;
  tokenUsed: number;
}

const initialState: GameStoreState = {
  state: 'uninitialized',
  previousState: null,
  mode: null,
  history: [],
  currentNarration: '',
  streamBuffer: '',
  choices: [],
  error: null,
  sessionId: null,
  tokenUsed: 0
};

function createGameStore() {
  const { subscribe, update, set } = writable<GameStoreState>(initialState);

  // State transition validator
  function canTransition(currentState: GameState, event: GameEvent['type']): boolean {
    const allowed = VALID_TRANSITIONS[currentState];
    return allowed && event in allowed;
  }

  // Core actions
  return {
    subscribe,

    dispatch(event: GameEvent) {
      update(state => {
        if (!canTransition(state.state, event.type)) {
          console.warn(`Invalid transition: ${state.state} -> ${event.type}`);
          return state;
        }

        // Handle event
        switch (event.type) {
          case 'SELECT_MODE':
            return {
              ...state,
              mode: event.mode,
              state: 'mode_selection'
            };

          case 'START_GAME':
            return {
              ...state,
              state: 'starting',
              history: [],
              currentNarration: '',
              choices: [],
              error: null
            };

          case 'SESSION_READY':
            return {
              ...state,
              sessionId: event.sessionId,
              state: 'streaming'
            };

          case 'STREAM_START':
            return {
              ...state,
              streamBuffer: '',
              state: 'streaming'
            };

          case 'STREAM_CHUNK':
            return {
              ...state,
              streamBuffer: state.streamBuffer + event.data
            };

          case 'STREAM_COMPLETE':
            const newHistory = [
              ...state.history,
              {
                role: 'assistant',
                content: event.output
              }
            ];

            return {
              ...state,
              currentNarration: event.output.narration,
              choices: event.output.choices,
              history: newHistory,
              streamBuffer: '',
              state: event.output.meta?.ending ? 'game_over' : 'awaiting_choice'
            };

          case 'SELECT_CHOICE':
            const choice = state.choices.find(c => c.id === event.choiceId);
            if (!choice) return state;

            return {
              ...state,
              history: [
                ...state.history,
                { role: 'user', content: choice.label }
              ],
              state: 'processing_input'
            };

          case 'INPUT_SUBMITTED':
            return {
              ...state,
              history: [
                ...state.history,
                { role: 'user', content: event.text }
              ],
              state: 'processing_input'
            };

          case 'PAUSE':
            return {
              ...state,
              previousState: state.state,
              state: 'paused'
            };

          case 'RESUME':
            return {
              ...state,
              state: state.previousState || 'uninitialized',
              previousState: null
            };

          case 'ERROR':
            return {
              ...state,
              error: event.error,
              previousState: state.state,
              state: event.recoverable ? 'error_recoverable' : 'error_fatal'
            };

          case 'RETRY':
            return {
              ...state,
              error: null,
              state: state.previousState || 'uninitialized',
              previousState: null
            };

          case 'RESET':
            return {
              ...initialState
            };

          case 'END_GAME':
            return {
              ...state,
              state: 'game_over'
            };

          default:
            return state;
        }
      });
    },

    reset() {
      set(initialState);
    }
  };
}

export const gameStore = createGameStore();

// Derived stores for UI
export const isLoading = derived(
  gameStore,
  $game => ['starting', 'processing_input', 'streaming'].includes($game.state)
);

export const canSelectChoice = derived(
  gameStore,
  $game => $game.state === 'awaiting_choice'
);

export const showChoices = derived(
  gameStore,
  $game => $game.state === 'awaiting_choice' && $game.choices.length > 0
);

export const hasError = derived(
  gameStore,
  $game => $game.state.startsWith('error_')
);
```

### 1.4) UI Component Integration

```svelte
<!-- src/components/ChoiceList.svelte -->
<script>
  import { gameStore, canSelectChoice } from '../stores/gameStore';

  function handleChoice(choiceId) {
    gameStore.dispatch({ type: 'SELECT_CHOICE', choiceId });
  }
</script>

<div class="choice-list">
  {#each $gameStore.choices as choice (choice.id)}
    <button
      class="choice-button"
      disabled={!$canSelectChoice}
      on:click={() => handleChoice(choice.id)}
    >
      {choice.label}
    </button>
  {/each}
</div>

<style>
  .choice-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

```svelte
<!-- src/components/StoryPane.svelte -->
<script>
  import { gameStore, isLoading } from '../stores/gameStore';
</script>

<div class="story-pane">
  {#if $gameStore.currentNarration}
    <p class="narration">{$gameStore.currentNarration}</p>
  {/if}

  {#if $isLoading}
    <div class="streaming-indicator">
      {$gameStore.streamBuffer}<span class="cursor">▋</span>
    </div>
  {/if}
</div>
```

### 1.5) State Visualization (for debugging)

```typescript
// Optional: Add to gameStore for development
export const stateHistory = writable<Array<{state: GameState, timestamp: number}>>([]);

// In dispatch function, add:
if (import.meta.env.DEV) {
  stateHistory.update(h => [...h, { state: newState, timestamp: Date.now() }]);
}
```

**DevTools Component**:
```svelte
<!-- src/components/DevStateMonitor.svelte (dev only) -->
<script>
  import { gameStore, stateHistory } from '../stores/gameStore';
</script>

{#if import.meta.env.DEV}
  <div class="dev-monitor">
    <h4>State: {$gameStore.state}</h4>
    <details>
      <summary>History ({$stateHistory.length} transitions)</summary>
      <ul>
        {#each $stateHistory.slice(-10) as {state, timestamp}}
          <li>{state} @ {new Date(timestamp).toLocaleTimeString()}</li>
        {/each}
      </ul>
    </details>
  </div>
{/if}
```

---

## 2) History Management & Context Limits (CRITICAL for MVP)

### 2.1) Why This Matters

LLMs have token limits (typically 8k-200k tokens depending on model). Without history management:
- **Longer games will crash** when exceeding context window
- **Costs will spiral** as history grows linearly
- **Response quality degrades** with irrelevant old context

**This MUST be solved in MVP**, not Phase 2.

### 2.2) Token Budget Breakdown

Typical OpenRouter model context allocation:

| Component | Tokens | Notes |
|-----------|--------|-------|
| System prompt | 300-500 | Base instructions + mode lore |
| History (10 turns) | 3000-5000 | ~300-500 per turn (narration + choice) |
| Current input | 50-200 | User's choice or free text |
| **Total Input** | **3500-5700** | |
| Max completion | 600-800 | New narration + choices |
| **Total per Turn** | **4100-6500** | |

**Problem**: After 15-20 turns, history alone could exceed 8k tokens.

### 2.3) Sliding Window Strategy (Recommended for MVP)

Keep recent turns verbatim, summarize or discard old ones.

```typescript
// src/services/historyService.ts

const KEEP_RECENT_TURNS = 8;  // Keep last 8 turns in full
const MAX_TOTAL_TURNS = 15;   // Summarize beyond this

interface HistoryConfig {
  recentTurnLimit: number;
  totalTurnLimit: number;
  enableSummarization: boolean;
}

const defaultConfig: HistoryConfig = {
  recentTurnLimit: KEEP_RECENT_TURNS,
  totalTurnLimit: MAX_TOTAL_TURNS,
  enableSummarization: true
};

/**
 * Manages conversation history to stay within token limits
 */
export class HistoryManager {
  constructor(private config: HistoryConfig = defaultConfig) {}

  /**
   * Prepare history for API call
   * Returns: [systemMessage, ...processedHistory]
   */
  async prepareMessages(
    systemPrompt: string,
    fullHistory: Message[],
    mode: string
  ): Promise<Message[]> {
    const turnCount = this.countTurns(fullHistory);

    // Early return if history is short
    if (turnCount <= this.config.recentTurnLimit) {
      return [
        { role: 'system', content: systemPrompt },
        ...fullHistory
      ];
    }

    // Split history
    const splitPoint = fullHistory.length - (this.config.recentTurnLimit * 2);
    const olderHistory = fullHistory.slice(0, splitPoint);
    const recentHistory = fullHistory.slice(splitPoint);

    // Strategy A: Simple truncation (fast, loses context)
    if (!this.config.enableSummarization) {
      return [
        { role: 'system', content: systemPrompt },
        ...recentHistory
      ];
    }

    // Strategy B: Summarization (better quality, costs tokens)
    const summary = await this.summarizeHistory(olderHistory, mode);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Story so far: ${summary}` },
      ...recentHistory
    ];
  }

  /**
   * Count assistant-user turn pairs
   */
  private countTurns(history: Message[]): number {
    return history.filter(m => m.role === 'assistant').length;
  }

  /**
   * Generate summary of older turns using cheap LLM
   */
  private async summarizeHistory(messages: Message[], mode: string): Promise<string> {
    // Extract narration from assistant messages
    const narrations = messages
      .filter(m => m.role === 'assistant')
      .map(m => {
        if (typeof m.content === 'string') return m.content;
        return m.content.narration || '';
      })
      .join('\n\n');

    const summaryPrompt = `Summarize this ${mode} RPG story in 4-5 concise sentences. Focus on key events, decisions, and current situation:\n\n${narrations}`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku', // Cheap model for summaries
          messages: [{ role: 'user', content: summaryPrompt }],
          max_tokens: 250,
          temperature: 0.3
        })
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.warn('Summarization failed, using fallback', error);
      return this.fallbackSummary(messages);
    }
  }

  /**
   * Fallback: Extract key events without LLM
   */
  private fallbackSummary(messages: Message[]): string {
    const userChoices = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .slice(0, 5); // First 5 choices

    return `The adventurer made these key decisions: ${userChoices.join(', ')}. The story continues...`;
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(messages: Message[]): number {
    const text = messages.map(m =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    ).join('\n');

    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if history needs pruning
   */
  needsPruning(history: Message[]): boolean {
    return this.estimateTokens(history) > 4000; // Trigger at 4k tokens
  }
}

export const historyManager = new HistoryManager();
```

### 2.4) Backend Integration

```typescript
// src/routes/api/play.ts (Express handler)
import { historyManager } from '../../services/historyService';
import { promptService } from '../../services/promptService';

app.post('/api/play', async (req, res) => {
  const { sessionId, mode, history, player_input, model } = req.body;

  // 1. Prepare messages with history management
  const systemPrompt = promptService.buildSystemPrompt(mode);
  const messages = await historyManager.prepareMessages(
    systemPrompt,
    history,
    mode
  );

  // 2. Add new user input
  messages.push({
    role: 'user',
    content: player_input
  });

  // 3. Check token estimate
  const estimatedTokens = historyManager.estimateTokens(messages);
  console.log(`Estimated prompt tokens: ${estimatedTokens}`);

  if (estimatedTokens > 7000) {
    return res.status(400).json({
      error: 'History too long',
      suggestion: 'Start a new game or enable summarization'
    });
  }

  // 4. Call OpenRouter (streaming)
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 600
    })
  });

  // 5. Pipe stream to client
  res.setHeader('Content-Type', 'text/event-stream');
  response.body.pipeTo(res);
});
```

### 2.5) Frontend Usage

```svelte
<!-- src/pages/Play.svelte -->
<script>
  import { gameStore } from '../stores/gameStore';
  import { historyManager } from '../services/historyService';

  $: needsPruning = historyManager.needsPruning($gameStore.history);
</script>

{#if needsPruning}
  <div class="warning-banner">
    ⚠️ Long game session. Consider saving and starting a new chapter to maintain performance.
  </div>
{/if}
```

### 2.6) Alternative Strategies (Pick One for MVP)

| Strategy | Pros | Cons | Recommended for MVP? |
|----------|------|------|---------------------|
| **Sliding Window** (above) | Simple, predictable | Loses old context | ✅ **YES** |
| Hard Truncation | No extra cost | Abrupt context loss | ⚠️ Fallback only |
| Full Summarization | Best quality | Adds latency/cost | ❌ Phase 2 |
| Stateful World Model | Compact, rich | Complex to build | ❌ Post-MVP |

**MVP Recommendation**: Implement **Sliding Window (Strategy A+B)** with:
- Keep last 8 turns verbatim
- Summarize older turns every 15 turns
- Hard cap at 7000 input tokens
- Show warning UI when approaching limits

### 2.7) Configuration & Tuning

```typescript
// config/history.ts
export const HISTORY_CONFIG = {
  // Token limits per model (adjust based on OpenRouter models)
  models: {
    'anthropic/claude-3.5-sonnet': {
      maxContext: 200000,
      safeInput: 8000,  // Leave room for completion
      recentTurns: 10
    },
    'openai/gpt-4': {
      maxContext: 8192,
      safeInput: 6000,
      recentTurns: 6
    },
    'anthropic/claude-3-haiku': {
      maxContext: 200000,
      safeInput: 8000,
      recentTurns: 8
    }
  },

  // Summarization settings
  summarization: {
    enabled: true,
    model: 'anthropic/claude-3-haiku', // Cheap model
    triggerAfterTurns: 15,
    maxSummaryTokens: 250
  },

  // Fallback behavior
  fallback: {
    strategy: 'truncate', // 'truncate' | 'error' | 'force-summarize'
    warningThreshold: 0.8 // Warn at 80% of safeInput
  }
};
```

### 2.8) Testing History Management

```typescript
// tests/historyService.test.ts
import { describe, it, expect } from 'vitest';
import { HistoryManager } from '../src/services/historyService';

describe('HistoryManager', () => {
  const manager = new HistoryManager();

  it('should keep short history unchanged', async () => {
    const history = [
      { role: 'assistant', content: { narration: 'Test', choices: [] } },
      { role: 'user', content: 'Choice 1' }
    ];

    const result = await manager.prepareMessages('System', history, 'dungeon');
    expect(result.length).toBe(3); // system + 2 history
    expect(result[0].role).toBe('system');
  });

  it('should summarize long history', async () => {
    const longHistory = Array(20).fill(null).flatMap((_, i) => [
      { role: 'assistant', content: { narration: `Turn ${i}`, choices: [] } },
      { role: 'user', content: `Choice ${i}` }
    ]);

    const result = await manager.prepareMessages('System', longHistory, 'dungeon');

    // Should have: system + summary + recent turns
    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('system'); // Summary
    expect(result[1].content).toContain('Story so far');
    expect(result.length).toBeLessThan(longHistory.length + 2);
  });

  it('should estimate tokens approximately', () => {
    const messages = [
      { role: 'user', content: 'This is a test message' }
    ];

    const estimate = manager.estimateTokens(messages);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(100);
  });
});
```

---

## 3) Implementation Checklist

### Week 1 (Days 1-3)
- [ ] Implement complete `gameStore` with state machine
- [ ] Add state transition validator
- [ ] Create derived stores (`isLoading`, `canSelectChoice`, etc.)
- [ ] Build `HistoryManager` class with sliding window
- [ ] Add token estimation utility
- [ ] Write unit tests for state transitions

### Week 1 (Days 4-5)
- [ ] Integrate state machine into UI components
- [ ] Add history management to `/api/play` endpoint
- [ ] Implement fallback summarization
- [ ] Add dev state monitor component
- [ ] Test long game sessions (20+ turns)

### Week 2 (Days 6-7)
- [ ] Add LLM-based summarization (optional)
- [ ] Tune history window sizes per model
- [ ] Add warning UI for approaching limits
- [ ] Performance test with different history lengths
- [ ] Document state machine in codebase

---

## 4) Integration with MVP Plan

### Updates to Section 6 (Frontend Implementation)

**Add to Key Stores**:
```diff
  **Key Stores**
- - `gameStore.ts`: `{history, mode, status: 'idle'|'streaming'|'error', choices, tokenUsed}`
+ - `gameStore.ts`: Complete FSM with 9 states, event dispatcher, transition validator
+ - `historyService.ts`: Sliding window manager with summarization
  - `settingsStore.ts`: `{model, temp, maxTokens, contentRating}`
  - `sessionStore.ts`: `{id, budget, lastSave}`
```

### Updates to Section 8 (Observability)

**Add Metrics**:
```typescript
- Track `history_pruning_events` counter
- Monitor `history_token_count` gauge
- Log `state_transition` events with from/to states
```

---

## 5) Why Phase 1.5 (Not Phase 2)?

| Aspect | Phase 1.5 (MVP) | Phase 2 |
|--------|-----------------|---------|
| **State Machine** | REQUIRED - UI won't work without it | Enhancement: Better error recovery, undo/redo |
| **History Mgmt** | REQUIRED - Games will crash after 15 turns | Enhancement: Smarter summarization, world model |
| **Complexity** | Medium - essential foundation | High - optimization & features |
| **Timeline** | Weeks 1-2 of MVP | After MVP launch |
| **Risk** | High if skipped | Low - nice-to-haves |

**Verdict**: These are **foundational** rather than **enhancements**. Implement during MVP development.

---

## 6) Open Questions

1. **Summarization cost**: Budget ~50-100 tokens every 15 turns. Acceptable?
2. **Summary quality**: Should we use Claude Haiku or GPT-3.5 for summaries?
3. **User visibility**: Show users when summarization happens? ("Chapter 2 begins...")
4. **Testing**: Automate long-session tests in CI? (20+ turn scenarios)
5. **Fallback**: If summarization API fails, truncate or block new turns?

---

## 7) Success Metrics

By end of Week 2, we should have:
- ✅ State machine handles all user flows without bugs
- ✅ 30+ turn games work without crashing
- ✅ Token usage stays under budget (logged in metrics)
- ✅ UI correctly disables buttons during invalid states
- ✅ Dev tools show clear state transition history

---

## Conclusion

**State Machine** and **History Management** are NOT optional enhancements - they're critical MVP features that prevent:
- UI race conditions and button-mashing bugs
- Context window crashes after 15-20 turns
- Runaway token costs

**Action Items**:
1. Review this spec with the team
2. Add detailed tasks to MVP Week 1-2 plan
3. Assign implementation (1-2 devs, ~3-4 days)
4. Test thoroughly with long sessions before Week 3

These foundations will make Phase 2 enhancements much easier to build.
