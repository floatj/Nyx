import { describe, it, expect } from 'vitest';
import { promptService } from '../promptService.js';

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
        expect(prompt).toContain('PG-13');
      }
    });

    it('should include JSON format instructions', () => {
      const prompt = promptService.buildSystemPrompt('dungeon');

      expect(prompt).toContain('STRICT JSON');
      expect(prompt).toContain('narration');
      expect(prompt).toContain('choices[]');
      expect(prompt).toContain('meta');
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
});
