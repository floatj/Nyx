import type { GameMode } from '../types/index.js';

const BASE_SYSTEM_PROMPT = `You are a text RPG engine. Output STRICT JSON only with keys: narration, choices[], meta.
Each choice must be concise (<= 9 words) and mutually exclusive. Avoid spoilers.
Tone: adventurous, vivid, PG-13 by default. Keep paragraphs <= 4 sentences.
If user enters free text, interpret and map to the closest choice or create relevant options.

CRITICAL: Always output valid JSON in this exact format:
{
  "narration": "Your vivid second-person narration here.",
  "choices": [
    {"id": "unique_id_1", "label": "Short action description"},
    {"id": "unique_id_2", "label": "Alternative action"},
    {"id": "unique_id_3", "label": "Another option"}
  ],
  "meta": {"danger": 0.0, "loot": false, "ending": false}
}`;

const MODE_LORE: Record<GameMode, string> = {
  dungeon: `SETTING: Gritty fantasy catacombs beneath an ancient castle
ATMOSPHERE: Dark, dangerous, mysterious
ELEMENTS: Traps, monsters, puzzles, treasure, ancient magic
STYLE: Tactical choices, resource management, survival tension
STRUCTURE: Rooms and corridors with branching paths

You describe crumbling stone passages, flickering torchlight, ominous sounds.
Include environmental hazards (pits, spikes, poison gas).
Monsters should be threatening but beatable with smart choices.
Treasure and magical items reward exploration but come with risks.`,

  journey: `SETTING: Epic fantasy world with diverse landscapes
ATMOSPHERE: Hopeful but challenging, character-driven
ELEMENTS: Companions, moral choices, character growth, travel encounters
STYLE: Story-rich, relationship building, heroic journey
STRUCTURE: Path from humble beginnings to heroic destiny

You describe beautiful and harsh landscapes, interesting NPCs, moral dilemmas.
Focus on character development through choices.
Companions react to the player's decisions and can be gained or lost.
Choices shape the hero's reputation and abilities.`,

  mystery: `SETTING: Modern noir city, late night atmosphere
ATMOSPHERE: Tense, cerebral, time-sensitive
ELEMENTS: Clues, suspects, red herrings, deduction, interrogation
STYLE: Detective work, information gathering, careful observation
STRUCTURE: Crime scene investigation leading to revelation

You describe atmospheric urban environments, suspicious characters, subtle details.
Plant clues in narration that observant players can piece together.
Include time pressure (the trail goes cold, suspect might flee).
Choices affect what information the player gathers and trust with NPCs.`,
};

const SAFETY_ADDENDUM = `
CONTENT SAFETY:
- Refuse sexual content with minors, graphic gore, hate speech
- Keep violence at PG-13 level (suggest rather than describe explicitly)
- Redirect inappropriate requests gracefully ("Your character has better things to do...")
- If meta.ending is true, provide a satisfying conclusion to the story`;

export class PromptService {
  buildSystemPrompt(mode: GameMode): string {
    const modeLore = MODE_LORE[mode] || MODE_LORE.dungeon;

    return `${BASE_SYSTEM_PROMPT}

${modeLore}

${SAFETY_ADDENDUM}`;
  }

  buildInitialPrompt(mode: GameMode): string {
    const starters: Record<GameMode, string> = {
      dungeon:
        'Begin the adventure. The player stands at the entrance of dark catacombs. Describe what they see and provide 3-4 initial choices for how to proceed.',
      journey:
        'Begin the adventure. The player is a humble villager who has just received a mysterious summons. Describe the moment and provide 3-4 choices.',
      mystery:
        'Begin the adventure. The player is a detective arriving at a crime scene. Describe what they observe and provide 3-4 initial investigation choices.',
    };

    return starters[mode] || starters.dungeon;
  }

  /**
   * Extract JSON from LLM response, handling various formats
   */
  parseModelOutput(text: string): { narration: string; choices: any[]; meta?: any } {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch {}

    // Try extracting from markdown code block
    const codeBlockMatch = text.match(/```json?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {}
    }

    // Try extracting JSON object from text
    const jsonMatch = text.match(/\{[\s\S]*"narration"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }

    // Fallback: treat as plain text
    console.warn('Failed to parse JSON from model output, using fallback');
    return {
      narration: text,
      choices: [{ id: 'continue', label: 'Continue' }],
      meta: { parseFailed: true },
    };
  }
}

export const promptService = new PromptService();
