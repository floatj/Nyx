import { Router } from 'express';
import type { Request, Response } from 'express';
import { openRouterClient } from '../services/openRouterClient.js';

const router = Router();

/**
 * POST /api/prompt/generate
 * Generate a random RPG story template prompt
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const systemPrompt = `You are a creative RPG story generator. Generate a unique and engaging RPG story setting/scenario prompt.
Be creative, diverse, and include interesting elements that would make for an exciting text-based RPG adventure.

The prompt should:
1. Set up an intriguing premise or scenario
2. Establish the setting (fantasy, sci-fi, horror, mystery, historical, etc.)
3. Introduce a compelling situation or challenge
4. Be 3-5 sentences long
5. Be written in second person ("You are...")

Examples of good prompts:
- "You are a space explorer who has just discovered an ancient alien artifact on a remote planet. The artifact begins to glow as you approach it, and strange visions flood your mind."
- "You are a detective in 1920s New York investigating a series of mysterious disappearances. Your only lead is a cryptic message left at each crime scene."
- "You are a apprentice wizard whose mentor has vanished, leaving behind only a strange magical tome that seems to write itself."`;

    const userPrompt = 'Generate a creative RPG story prompt.';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Use non-streaming completion for prompt generation
    const response = await openRouterClient.complete({
      model: process.env.MODEL_DEFAULT || 'anthropic/claude-3-haiku',
      messages,
      temperature: 0.9, // Higher temperature for more creativity
      max_tokens: 300,
    });

    const generatedPrompt = response.choices[0]?.message?.content || '';

    res.json({ prompt: generatedPrompt });
  } catch (error) {
    console.error('Prompt generation error:', error);
    res.status(500).json({
      error: 'Failed to generate prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prompt/optimize
 * Optimize and refine a user's RPG story prompt
 */
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Detect the language of the input prompt
    const detectLanguagePrompt = `Detect the language of this text and respond with ONLY the language name (e.g., "English", "Chinese", "Spanish", etc.):

"${prompt.substring(0, 200)}"`;

    const langResponse = await openRouterClient.complete({
      model: process.env.MODEL_DEFAULT || 'anthropic/claude-3-haiku',
      messages: [{ role: 'user', content: detectLanguagePrompt }],
      temperature: 0.3,
      max_tokens: 50,
    });

    const detectedLanguage = langResponse.choices[0]?.message?.content?.trim() || 'English';

    const systemPrompt = `You are an expert RPG story editor. Your task is to optimize and refine RPG story prompts to make them more engaging and suitable for text-based adventures.

When optimizing a prompt:
1. Keep the core concept and setting intact
2. Enhance the description with vivid details
3. Make the opening situation more compelling
4. Ensure it's written in second person ("You are...")
5. Keep it concise (3-5 sentences)
6. Fix any grammar or clarity issues
7. CRITICAL: Respond in ${detectedLanguage} language - the SAME language as the input prompt

Output ONLY the optimized prompt, nothing else.`;

    const userPrompt = `Optimize this RPG prompt:\n\n${prompt}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await openRouterClient.complete({
      model: process.env.MODEL_DEFAULT || 'anthropic/claude-3-haiku',
      messages,
      temperature: 0.7,
      max_tokens: 800, // Increased for better compatibility with larger models
    });

    const optimizedPrompt = response.choices[0]?.message?.content || prompt;

    res.json({ prompt: optimizedPrompt, language: detectedLanguage });
  } catch (error) {
    console.error('Prompt optimization error:', error);
    res.status(500).json({
      error: 'Failed to optimize prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
