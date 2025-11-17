import { describe, it, expect } from 'vitest';
import { promptService, getInitialCharacterStatus } from '../promptService.js';

describe('PromptService', () => {
  describe('buildSystemPrompt', () => {
    it('should build system prompt for dungeon mode', () => {
      const prompt = promptService.buildSystemPrompt('dungeon');

      expect(prompt).toContain('text RPG engine');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('Gritty fantasy catacombs');
      expect(prompt).toContain('Traps, monsters, puzzles');
    });

    it('should build system prompt for journey mode', () => {
      const prompt = promptService.buildSystemPrompt('journey');

      expect(prompt).toContain('text RPG engine');
      expect(prompt).toContain('Epic fantasy world');
      expect(prompt).toContain('Companions, moral choices');
    });

    it('should build system prompt for mystery mode', () => {
      const prompt = promptService.buildSystemPrompt('mystery');

      expect(prompt).toContain('text RPG engine');
      expect(prompt).toContain('Modern noir city');
      expect(prompt).toContain('Clues, suspects, red herrings');
    });

    it('should include safety guidelines in all prompts', () => {
      const modes: Array<'dungeon' | 'journey' | 'mystery'> = ['dungeon', 'journey', 'mystery'];

      for (const mode of modes) {
        const prompt = promptService.buildSystemPrompt(mode);
        expect(prompt).toContain('CONTENT SAFETY');
      }
    });

    it('should include JSON format instructions', () => {
      const prompt = promptService.buildSystemPrompt('dungeon');

      expect(prompt).toContain('ONLY valid JSON');
      expect(prompt).toContain('narration');
      expect(prompt).toContain('choices');
      expect(prompt).toContain('meta');
    });

    it('should build system prompt for custom mode with language instruction', () => {
      const customPrompt = '你是一個勇敢的武士，在古代中國的江湖中冒險。';
      const prompt = promptService.buildSystemPrompt('custom', customPrompt);

      expect(prompt).toContain('text RPG engine');
      expect(prompt).toContain('LANGUAGE INSTRUCTION');
      expect(prompt).toContain('SAME LANGUAGE');
      expect(prompt).toContain('CUSTOM SETTING');
      expect(prompt).toContain(customPrompt);
      expect(prompt).toContain('CONTENT SAFETY');
    });

    it('should build system prompt for custom mode in English', () => {
      const customPrompt = 'You are a space explorer in the year 3000.';
      const prompt = promptService.buildSystemPrompt('custom', customPrompt);

      expect(prompt).toContain('LANGUAGE INSTRUCTION');
      expect(prompt).toContain(customPrompt);
    });
  });

  describe('buildInitialPrompt', () => {
    it('should build initial prompt for dungeon mode', () => {
      const prompt = promptService.buildInitialPrompt('dungeon');

      expect(prompt).toContain('catacombs');
      expect(prompt).toContain('3-4 initial choices');
    });

    it('should build initial prompt for journey mode', () => {
      const prompt = promptService.buildInitialPrompt('journey');

      expect(prompt).toContain('humble villager');
      expect(prompt).toContain('mysterious summons');
    });

    it('should build initial prompt for mystery mode', () => {
      const prompt = promptService.buildInitialPrompt('mystery');

      expect(prompt).toContain('detective');
      expect(prompt).toContain('crime scene');
    });

    it('should build initial prompt for custom mode with language reminder', () => {
      const customPrompt = '你是一個勇敢的武士，在古代中國的江湖中冒險。';
      const prompt = promptService.buildInitialPrompt('custom', customPrompt);

      expect(prompt).toContain('Begin the adventure');
      expect(prompt).toContain('same language');
      expect(prompt).toContain('3-4 initial choices');
    });
  });

  describe('parseModelOutput', () => {
    it('should parse valid JSON output', () => {
      const json = JSON.stringify({
        narration: 'You enter a dark room.',
        choices: [
          { id: 'left', label: 'Go left' },
          { id: 'right', label: 'Go right' },
        ],
        meta: { danger: 0.5 },
      });

      const result = promptService.parseModelOutput(json);

      expect(result.narration).toBe('You enter a dark room.');
      expect(result.choices).toHaveLength(2);
      expect(result.choices[0].id).toBe('left');
      expect(result.meta?.danger).toBe(0.5);
    });

    it('should extract JSON from markdown code block', () => {
      const markdown = `Here's the response:
\`\`\`json
{
  "narration": "Test narration",
  "choices": [{"id": "a", "label": "Choice A"}]
}
\`\`\``;

      const result = promptService.parseModelOutput(markdown);

      expect(result.narration).toBe('Test narration');
      expect(result.choices).toHaveLength(1);
    });

    it('should extract JSON from mixed text', () => {
      const mixed = `Sure, here's the game response:
{
  "narration": "You found treasure!",
  "choices": [{"id": "take", "label": "Take it"}]
}
That should work!`;

      const result = promptService.parseModelOutput(mixed);

      expect(result.narration).toBe('You found treasure!');
      expect(result.choices).toHaveLength(1);
    });

    it('should handle plain text fallback', () => {
      const plainText = 'This is just plain text without any JSON.';

      const result = promptService.parseModelOutput(plainText);

      expect(result.narration).toBe(plainText);
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].id).toBe('continue');
      expect(result.meta?.parseFailed).toBe(true);
    });

    it('should handle empty input', () => {
      const result = promptService.parseModelOutput('');

      expect(result.narration).toBe('');
      expect(result.choices).toHaveLength(1);
      expect(result.meta?.parseFailed).toBe(true);
    });

    it('should handle malformed JSON gracefully', () => {
      const malformed = '{ "narration": "Test", "choices": [{"id": "a", "label": }';

      const result = promptService.parseModelOutput(malformed);

      expect(result).toBeDefined();
      expect(result.choices).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle JSON with extra whitespace', () => {
      const json = `
        {
          "narration": "Whitespace test",
          "choices": [
            {
              "id": "opt1",
              "label": "Option 1"
            }
          ]
        }
      `;

      const result = promptService.parseModelOutput(json);

      expect(result.narration).toBe('Whitespace test');
      expect(result.choices).toHaveLength(1);
    });

    it('should handle nested JSON structures', () => {
      const json = JSON.stringify({
        narration: 'Complex structure',
        choices: [{ id: 'a', label: 'Label', extra: { nested: 'data' } }],
        meta: { stats: { health: 100, mana: 50 } },
      });

      const result = promptService.parseModelOutput(json);

      expect(result.narration).toBe('Complex structure');
      expect(result.meta).toBeDefined();
    });
  });

  describe('getInitialCharacterStatus', () => {
    it('should initialize character status for dungeon mode', () => {
      const status = getInitialCharacterStatus('dungeon');

      expect(status.health).toBe(100);
      expect(status.stamina).toBe(100);
      expect(status.conditions).toEqual({
        injured: false,
        poisoned: false,
        blessed: false,
        cursed: false,
      });
      expect(status.inventory).toContain('torch');
      expect(status.inventory).toContain('rusty dagger');
    });

    it('should initialize character status for journey mode', () => {
      const status = getInitialCharacterStatus('journey');

      expect(status.health).toBe(100);
      expect(status.stamina).toBe(100);
      expect(status.inventory).toContain("traveler's cloak");
      expect(status.inventory).toContain('waterskin');
      expect(status.inventory).toContain('map');
    });

    it('should initialize character status for mystery mode', () => {
      const status = getInitialCharacterStatus('mystery');

      expect(status.health).toBe(100);
      expect(status.stamina).toBe(100);
      expect(status.inventory).toContain('notepad');
      expect(status.inventory).toContain('detective badge');
      expect(status.inventory).toContain('pen');
    });

    it('should initialize character status for custom mode', () => {
      const status = getInitialCharacterStatus('custom');

      expect(status.health).toBe(100);
      expect(status.stamina).toBe(100);
      expect(status.inventory).toContain('basic supplies');
    });

    it('should initialize all conditions as false', () => {
      const modes: Array<'dungeon' | 'journey' | 'mystery' | 'custom'> = [
        'dungeon',
        'journey',
        'mystery',
        'custom',
      ];

      for (const mode of modes) {
        const status = getInitialCharacterStatus(mode);
        expect(status.conditions.injured).toBe(false);
        expect(status.conditions.poisoned).toBe(false);
        expect(status.conditions.blessed).toBe(false);
        expect(status.conditions.cursed).toBe(false);
      }
    });
  });

  describe('buildInitialPrompt with character status', () => {
    it('should include character status in dungeon initial prompt', () => {
      const prompt = promptService.buildInitialPrompt('dungeon');

      expect(prompt).toContain('Starting character status');
      expect(prompt).toContain('"health":100');
      expect(prompt).toContain('"stamina":100');
      expect(prompt).toContain('torch');
      expect(prompt).toContain('rusty dagger');
    });

    it('should include character status in journey initial prompt', () => {
      const prompt = promptService.buildInitialPrompt('journey');

      expect(prompt).toContain('Starting character status');
      expect(prompt).toContain('"health":100');
      expect(prompt).toContain("traveler's cloak");
    });

    it('should include character status in mystery initial prompt', () => {
      const prompt = promptService.buildInitialPrompt('mystery');

      expect(prompt).toContain('Starting character status');
      expect(prompt).toContain('notepad');
      expect(prompt).toContain('detective badge');
    });

    it('should include character status in custom initial prompt', () => {
      const customPrompt = 'You are a space explorer.';
      const prompt = promptService.buildInitialPrompt('custom', customPrompt);

      expect(prompt).toContain('Starting character status');
      expect(prompt).toContain('basic supplies');
    });
  });

  describe('parseModelOutput with character status', () => {
    it('should parse JSON with characterStatus field', () => {
      const json = JSON.stringify({
        narration: 'You take damage from the trap!',
        choices: [
          { id: 'heal', label: 'Use healing potion' },
          { id: 'continue', label: 'Press on' },
        ],
        characterStatus: {
          health: 75,
          stamina: 90,
          conditions: {
            injured: true,
            poisoned: false,
            blessed: false,
            cursed: false,
          },
          inventory: ['torch', 'rusty dagger', 'healing potion'],
        },
        meta: { danger: 0.6 },
      });

      const result = promptService.parseModelOutput(json);

      expect(result.narration).toBe('You take damage from the trap!');
      expect(result.characterStatus).toBeDefined();
      expect(result.characterStatus?.health).toBe(75);
      expect(result.characterStatus?.stamina).toBe(90);
      expect(result.characterStatus?.conditions.injured).toBe(true);
      expect(result.characterStatus?.inventory).toContain('healing potion');
    });

    it('should handle JSON without characterStatus field', () => {
      const json = JSON.stringify({
        narration: 'You enter a room.',
        choices: [{ id: 'explore', label: 'Explore' }],
        meta: { danger: 0.3 },
      });

      const result = promptService.parseModelOutput(json);

      expect(result.narration).toBe('You enter a room.');
      expect(result.characterStatus).toBeUndefined();
    });

    it('should parse characterStatus with all conditions active', () => {
      const json = JSON.stringify({
        narration: 'You are in a terrible state!',
        choices: [{ id: 'rest', label: 'Rest and recover' }],
        characterStatus: {
          health: 25,
          stamina: 15,
          conditions: {
            injured: true,
            poisoned: true,
            blessed: false,
            cursed: true,
          },
          inventory: ['cursed amulet'],
        },
        meta: { danger: 0.9 },
      });

      const result = promptService.parseModelOutput(json);

      expect(result.characterStatus?.health).toBe(25);
      expect(result.characterStatus?.conditions.injured).toBe(true);
      expect(result.characterStatus?.conditions.poisoned).toBe(true);
      expect(result.characterStatus?.conditions.cursed).toBe(true);
      expect(result.characterStatus?.conditions.blessed).toBe(false);
    });
  });

  describe('buildSystemPrompt with character status instructions', () => {
    it('should include character status guidelines in system prompt', () => {
      const prompt = promptService.buildSystemPrompt('dungeon');

      expect(prompt).toContain('characterStatus');
      expect(prompt).toContain('CHARACTER STATUS GUIDELINES');
      expect(prompt).toContain('Health: 0-100');
      expect(prompt).toContain('Stamina: 0-100');
      expect(prompt).toContain('Conditions:');
      expect(prompt).toContain('Inventory:');
    });

    it('should mention character death at health 0', () => {
      const prompt = promptService.buildSystemPrompt('journey');

      expect(prompt).toContain('Death occurs at 0');
      expect(prompt).toContain('health reaches 0');
      expect(prompt).toContain('meta.ending = true');
    });
  });
});
