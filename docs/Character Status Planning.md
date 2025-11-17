Perfect! I've analyzed your codebase thoroughly. Let me provide comprehensive advice on implementing "Character Status" for Nyx.
📊 Current State Analysis

Key Findings:

    Your game is currently narrative-driven with no traditional character stats
    Character "state" exists only through:
        Narrative descriptions
        Choice history
        Meta flags (danger, loot, ending)
    Well-architected state machine and clean separation of concerns
    OpenRouter LLM generates structured JSON responses

🎯 Recommended Approaches (3 Options)
Option 1: Lightweight Meta-Based Status ⭐ (Recommended)

Philosophy: Keep the narrative focus, add minimal tracking

What to Track:

interface CharacterStatus {
  // Core vitals (simple numbers)
  health: number;        // 0-100
  stamina: number;       // 0-100
  
  // Conditional states (boolean flags)
  conditions: {
    injured: boolean;
    poisoned: boolean;
    blessed: boolean;
    cursed: boolean;
  };
  
  // Inventory (simple list)
  inventory: string[];   // ["torch", "rusty sword", "health potion"]
  
  // Mode-specific stat
  morale?: number;       // For 'journey' mode
  clues?: string[];      // For 'mystery' mode
}

Pros:

    ✅ Minimal complexity
    ✅ Fits existing narrative style
    ✅ Easy for LLM to manage
    ✅ Quick to implement

Cons:

    ❌ Limited depth
    ❌ May feel shallow for stat-focused players

Option 2: Full RPG Character Sheet 🎲

Philosophy: Traditional RPG mechanics with attributes

What to Track:

interface CharacterStatus {
  // Attributes
  attributes: {
    strength: number;     // 1-20
    dexterity: number;
    intelligence: number;
    constitution: number;
    wisdom: number;
    charisma: number;
  };
  
  // Derived stats
  health: {
    current: number;
    max: number;
  };
  
  stamina: {
    current: number;
    max: number;
  };
  
  // Skills (influenced by attributes)
  skills: {
    combat: number;
    stealth: number;
    perception: number;
    persuasion: number;
  };
  
  // Equipment slots
  equipment: {
    weapon?: Item;
    armor?: Item;
    accessory?: Item;
  };
  
  // Inventory
  inventory: Item[];
  
  // Status effects with durations
  effects: Array<{
    name: string;
    type: 'buff' | 'debuff';
    duration: number;     // Turns remaining
    modifier: {
      stat: string;
      value: number;
    };
  }>;
  
  // Progression
  level: number;
  experience: number;
}

interface Item {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'consumable' | 'quest';
  modifiers?: {
    strength?: number;
    health?: number;
  };
}

Pros:

    ✅ Deep gameplay mechanics
    ✅ Clear progression system
    ✅ Equipment/inventory management

Cons:

    ❌ Complex for LLM to manage consistently
    ❌ May distract from narrative
    ❌ Requires significant testing

Option 3: Narrative-Integrated Status 🎭 (Most Innovative)

Philosophy: Stats emerge from narrative, tracked invisibly

What to Track:

interface CharacterStatus {
  // Narrative-driven resources
  resources: {
    vitality: number;      // 0-100 (health abstraction)
    resolve: number;       // 0-100 (mental fortitude)
    luck: number;          // 0-100 (affects outcomes)
  };
  
  // Relationship tracking
  relationships: Map<string, {
    name: string;          // NPC name
    trust: number;         // -100 to +100
    status: 'ally' | 'neutral' | 'enemy';
  }>;
  
  // Story flags (for branching)
  achievements: string[];  // ["saved_villager", "found_secret_path"]
  
  // Reputation
  reputation: {
    heroic: number;        // -100 to +100
    cunning: number;
    merciful: number;
  };
  
  // Current burdens
  burdens: Array<{
    type: 'injury' | 'curse' | 'debt' | 'oath';
    description: string;
    severity: number;      // 1-10
  }>;
  
  // Acquired knowledge
  knowledge: string[];     // Clues, secrets, learned info
}

Pros:

    ✅ Enhances narrative immersion
    ✅ Flexible for different game modes
    ✅ Feels organic, not gamified

Cons:

    ❌ Harder to display clearly
    ❌ Requires careful prompt engineering

🛠️ Implementation Strategy (Option 1 - Recommended)
Phase 1: Backend Changes
1. Update Type Definitions (backend/src/types/index.ts)

export interface CharacterStatus {
  health: number;
  stamina: number;
  conditions: {
    injured: boolean;
    poisoned: boolean;
    blessed: boolean;
    cursed: boolean;
  };
  inventory: string[];
}

export interface LLMOutput {
  narration: string;
  choices: Choice[];
  characterStatus?: CharacterStatus;  // NEW: Optional status update
  meta?: {
    danger?: number;
    loot?: boolean;
    ending?: boolean;
  };
}

2. Update System Prompt (backend/src/services/promptService.ts)

const BASE_SYSTEM_PROMPT = `You are a text RPG engine. You MUST output ONLY valid JSON, nothing else.

CRITICAL REQUIREMENTS:
1. Output ONLY the JSON object, no explanations or markdown
2. ALWAYS provide 2-4 meaningful choices per turn
3. Each choice must be unique and lead to different outcomes
4. For normal turns, keep narration to 8-12 sentences
5. For the opening scene (first turn), you MAY use up to 12-24 sentences
6. Each choice label must be <= 15 words
7. ALWAYS include characterStatus reflecting current character state

EXACT FORMAT (copy this structure):
{
  "narration": "Your vivid second-person narration here.",
  "choices": [
    {"id": "option1", "label": "First meaningful action"},
    {"id": "option2", "label": "Second different action"},
    {"id": "option3", "label": "Third alternative action"}
  ],
  "characterStatus": {
    "health": 85,
    "stamina": 70,
    "conditions": {
      "injured": false,
      "poisoned": false,
      "blessed": false,
      "cursed": false
    },
    "inventory": ["torch", "rusty sword"]
  },
  "meta": {"danger": 0.3, "loot": false, "ending": false}
}

CHARACTER STATUS GUIDELINES:
- Health: 0-100. Combat/traps reduce it. Resting/healing increases it.
- Stamina: 0-100. Actions consume it. Resting restores it.
- Conditions: Set to true when narratively appropriate (poison trap, curse, blessing)
- Inventory: Add items when found, remove when used
- Update status to reflect narrative events (if character gets hurt, reduce health)

IMPORTANT: Do NOT wrap in markdown code blocks. Output the raw JSON only.`;

3. Initialize Character Status (new service or in promptService)

export function getInitialCharacterStatus(mode: GameMode): CharacterStatus {
  const baseStatus: CharacterStatus = {
    health: 100,
    stamina: 100,
    conditions: {
      injured: false,
      poisoned: false,
      blessed: false,
      cursed: false,
    },
    inventory: [],
  };

  // Mode-specific starting items
  switch (mode) {
    case 'dungeon':
      baseStatus.inventory = ['torch', 'rusty dagger'];
      break;
    case 'journey':
      baseStatus.inventory = ['traveler\'s cloak', 'waterskin'];
      break;
    case 'mystery':
      baseStatus.inventory = ['notepad', 'detective badge'];
      break;
  }

  return baseStatus;
}

4. Include Status in Context (modify buildInitialPrompt)

buildInitialPrompt(mode: GameMode, customPrompt?: string): string {
  const initialStatus = getInitialCharacterStatus(mode);
  
  if (mode === 'custom' && customPrompt) {
    return `Begin the adventure. Starting character status: ${JSON.stringify(initialStatus)}
    
Describe the opening scene and provide 3-4 initial choices for how to proceed.`;
  }

  const starters: Record<GameMode, string> = {
    dungeon: `Begin the adventure. The player stands at the entrance of dark catacombs with: ${JSON.stringify(initialStatus)}.
    
Describe what they see and provide 3-4 initial choices for how to proceed.`,
    // ... other modes
  };

  return starters[mode] || starters.dungeon;
}

Phase 2: Frontend Changes
1. Update Game Store (frontend/src/stores/gameStore.ts)

interface GameStoreState {
  state: GameState;
  previousState: GameState | null;
  mode: GameMode | null;
  customPrompt: string | null;
  history: Message[];
  currentNarration: string;
  streamBuffer: string;
  choices: Choice[];
  error: Error | null;
  sessionId: string | null;
  sessionToken: string | null;
  tokenUsed: number;
  
  // NEW: Character status tracking
  characterStatus: CharacterStatus | null;
}

// Update STREAM_COMPLETE event handler
case 'STREAM_COMPLETE': {
  const newHistory: Message[] = [
    ...state.history,
    {
      role: 'assistant',
      content: event.output,
    },
  ];

  return {
    ...state,
    currentNarration: event.output.narration,
    choices: event.output.choices,
    history: newHistory,
    streamBuffer: '',
    tokenUsed: event.tokenUsed !== undefined ? event.tokenUsed : state.tokenUsed,
    characterStatus: event.output.characterStatus || state.characterStatus,  // NEW
    state: event.output.meta?.ending ? 'game_over' : 'awaiting_choice',
  };
}

2. Create Character Sheet Component (new file: frontend/src/components/CharacterSheet.svelte)

<script lang="ts">
  import type { CharacterStatus } from '../stores/gameStore';

  export let status: CharacterStatus | null;

  $: healthPercent = status ? (status.health / 100) * 100 : 100;
  $: staminaPercent = status ? (status.stamina / 100) * 100 : 100;
  $: healthColor = healthPercent > 60 ? 'green' : healthPercent > 30 ? 'yellow' : 'red';
  $: staminaColor = staminaPercent > 60 ? 'blue' : staminaPercent > 30 ? 'yellow' : 'orange';
</script>

{#if status}
  <div class="character-sheet bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
    <h3 class="text-lg font-bold text-gray-100">Character Status</h3>
    
    <!-- Health Bar -->
    <div class="stat-bar">
      <div class="flex justify-between mb-1">
        <span class="text-sm text-gray-300">Health</span>
        <span class="text-sm text-gray-300">{status.health}/100</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2">
        <div 
          class="bg-{healthColor}-500 h-2 rounded-full transition-all duration-300"
          style="width: {healthPercent}%"
        ></div>
      </div>
    </div>
    
    <!-- Stamina Bar -->
    <div class="stat-bar">
      <div class="flex justify-between mb-1">
        <span class="text-sm text-gray-300">Stamina</span>
        <span class="text-sm text-gray-300">{status.stamina}/100</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2">
        <div 
          class="bg-{staminaColor}-500 h-2 rounded-full transition-all duration-300"
          style="width: {staminaPercent}%"
        ></div>
      </div>
    </div>
    
    <!-- Conditions -->
    {#if Object.values(status.conditions).some(c => c)}
      <div class="conditions">
        <span class="text-sm text-gray-400">Conditions:</span>
        <div class="flex flex-wrap gap-2 mt-1">
          {#if status.conditions.injured}
            <span class="badge bg-red-900 text-red-200 px-2 py-1 rounded text-xs">🩹 Injured</span>
          {/if}
          {#if status.conditions.poisoned}
            <span class="badge bg-green-900 text-green-200 px-2 py-1 rounded text-xs">☠️ Poisoned</span>
          {/if}
          {#if status.conditions.blessed}
            <span class="badge bg-yellow-900 text-yellow-200 px-2 py-1 rounded text-xs">✨ Blessed</span>
          {/if}
          {#if status.conditions.cursed}
            <span class="badge bg-purple-900 text-purple-200 px-2 py-1 rounded text-xs">🌑 Cursed</span>
          {/if}
        </div>
      </div>
    {/if}
    
    <!-- Inventory -->
    {#if status.inventory.length > 0}
      <div class="inventory">
        <span class="text-sm text-gray-400">Inventory:</span>
        <ul class="mt-1 space-y-1">
          {#each status.inventory as item}
            <li class="text-sm text-gray-300">• {item}</li>
          {/each}
        </ul>
      </div>
    {:else}
      <div class="text-sm text-gray-500 italic">No items</div>
    {/if}
  </div>
{/if}

<style>
  /* Add any custom styles here if Tailwind isn't enough */
</style>

3. Add to Play Page (frontend/src/pages/Play.svelte)

<script lang="ts">
  import CharacterSheet from '../components/CharacterSheet.svelte';
  import { gameStore } from '../stores/gameStore';
  
  // ... existing code
</script>

<div class="game-container grid grid-cols-3 gap-4">
  <!-- Left sidebar: Character Sheet -->
  <div class="col-span-1">
    <CharacterSheet status={$gameStore.characterStatus} />
  </div>
  
  <!-- Main content: Story + Choices -->
  <div class="col-span-2">
    <StoryPane />
    <ChoiceList />
  </div>
</div>

🎨 UI/UX Design Suggestions
Layout Options:

Option A: Sidebar Character Sheet (Recommended)

┌──────────────┬─────────────────────────────┐
│ Character    │  Narration                  │
│ Status       │  (streaming text...)        │
│              │                             │
│ [Health]     │                             │
│ [Stamina]    │                             │
│ [Conditions] │                             │
│ [Inventory]  │                             │
│              │                             │
│ [Token Info] │  Choices:                   │
│              │  [1] Go left                │
│              │  [2] Inspect torch          │
└──────────────┴─────────────────────────────┘

Option B: Collapsible Header

┌─────────────────────────────────────────┐
│ ▼ Character [HP: 85/100] [Stamina: 70] │ ← Click to expand
├─────────────────────────────────────────┤
│  Narration                              │
│  (streaming text...)                    │
│                                         │
│  Choices:                               │
│  [1] Go left                            │
└─────────────────────────────────────────┘

Option C: Overlay Panel (Modal/Drawer)

Main game screen with button:
[📊 Character] ← Click opens slide-out panel

Panel slides in from right with full character sheet

⚙️ Advanced Considerations
1. Save/Load Integration

Update frontend/src/services/storage.ts:

export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  mode: string;
  turnCount: number;
  tokenUsed: number;
  data: {
    history: Message[];
    currentNarration: string;
    choices: Choice[];
    sessionId: string | null;
    tokenUsed: number;
    mode: string;
    characterStatus: CharacterStatus | null;  // NEW
  };
}

2. Character Death Mechanic

Add to prompt service:

const BASE_SYSTEM_PROMPT = `...

CHARACTER DEATH RULES:
- If health reaches 0, set meta.ending = true and narrate character death
- Provide final narration explaining how the character died
- Do not offer choices if ending = true
...`;

Handle in frontend:

{#if $gameStore.characterStatus?.health === 0}
  <div class="death-screen bg-red-900 p-6 rounded">
    <h2 class="text-2xl font-bold text-white">You Have Died</h2>
    <button on:click={() => gameStore.dispatch({ type: 'RESET' })}>
      Start New Game
    </button>
  </div>
{/if}

3. LLM Consistency Validation

Add backend validation in routes/play.ts:

// After parsing LLM output
const output = promptService.parseModelOutput(fullText);

// Validate status changes are reasonable
if (output.characterStatus) {
  // Health/stamina must be 0-100
  output.characterStatus.health = Math.max(0, Math.min(100, output.characterStatus.health));
  output.characterStatus.stamina = Math.max(0, Math.min(100, output.characterStatus.stamina));
  
  // Inventory size limit
  if (output.characterStatus.inventory.length > 20) {
    output.characterStatus.inventory = output.characterStatus.inventory.slice(0, 20);
  }
}

4. Context Window Management

Update historyManager.ts to include last known status:

async prepareMessages(systemPrompt: string, fullHistory: Message[], mode: string) {
  // ... existing logic ...
  
  // Find latest character status from history
  const lastStatus = findLastCharacterStatus(fullHistory);
  
  if (lastStatus) {
    const statusContext = {
      role: 'system',
      content: `Current character status: ${JSON.stringify(lastStatus)}`
    };
    
    messages.push(statusContext);
  }
  
  return messages;
}

function findLastCharacterStatus(history: Message[]): CharacterStatus | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (typeof msg.content === 'object' && msg.content.characterStatus) {
      return msg.content.characterStatus;
    }
  }
  return null;
}

🧪 Testing Strategy
Unit Tests for Character Status

// frontend/src/test/characterStatus.test.ts
import { describe, it, expect } from 'vitest';
import { gameStore } from '../stores/gameStore';

describe('Character Status', () => {
  it('should initialize with full health/stamina', () => {
    const status = getInitialCharacterStatus('dungeon');
    expect(status.health).toBe(100);
    expect(status.stamina).toBe(100);
  });

  it('should update status on STREAM_COMPLETE', () => {
    gameStore.dispatch({
      type: 'STREAM_COMPLETE',
      output: {
        narration: 'You take damage!',
        choices: [],
        characterStatus: {
          health: 75,
          stamina: 90,
          conditions: { injured: true, poisoned: false, blessed: false, cursed: false },
          inventory: ['torch'],
        },
      },
    });

    // Assert status updated
  });
});

📋 Implementation Checklist
Minimal Viable Implementation (1-2 days)

    Add [object Object] interface to types
    Update [object Object] to include optional [object Object]
    Modify system prompt to include status tracking
    Add [object Object] to game store state
    Create basic [object Object] component
    Display health/stamina bars in UI
    Test with one game mode (dungeon)

Full Implementation (3-5 days)

    Implement all three approaches (choose one or blend)
    Add status validation in backend
    Integrate with save/load system
    Add character death mechanic
    Create comprehensive UI (sidebar + modal views)
    Update all game modes with appropriate starting items
    Write unit tests for status tracking
    Test LLM consistency across multiple turns
    Add animations for health/stamina changes
    Document character status in README

💡 Final Recommendations

    Start with Option 1 (Lightweight Meta-Based) - It's the sweet spot for your current architecture
    Iterate based on player feedback - You can always add depth later
    Keep the narrative focus - Stats should enhance, not overshadow the story
    Test LLM consistency - Claude models handle structured JSON well, but validate outputs
    Consider mode-specific stats - Mystery mode might track "clues found" instead of "health"

