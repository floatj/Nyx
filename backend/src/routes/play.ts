import { Router } from 'express';
import type { Request, Response } from 'express';
import { llmProvider } from '../services/llmProviderFactory.js';
import { promptService } from '../services/promptService.js';
import { historyManager } from '../services/historyManager.js';
import { sessionManager } from '../services/sessionManager.js';
import { modelConfigService } from '../services/modelConfigService.js';
import type { PlayRequest } from '../types/index.js';

const router = Router();

/**
 * POST /api/play
 * Execute a game turn with SSE streaming
 */
router.post('/', async (req: Request, res: Response) => {
  const playRequest: PlayRequest = req.body;

  try {
    // Validate request
    if (!playRequest.sessionId || !playRequest.mode) {
      return res.status(400).json({ error: 'Missing required fields: sessionId, mode' });
    }

    // Check session exists
    const session = sessionManager.getSession(playRequest.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Estimate token cost and check budget
    const characterStatusEnabled = playRequest.characterStatusEnabled !== false; // Default to true if not specified
    const language = playRequest.language || 'en'; // Default to English if not specified
    const systemPrompt = promptService.buildSystemPrompt(
      playRequest.mode,
      playRequest.customPrompt,
      characterStatusEnabled,
      language
    );
    const messages = await historyManager.prepareMessages(
      systemPrompt,
      playRequest.history,
      playRequest.mode,
      characterStatusEnabled
    );

    const estimatedTokens = historyManager.estimateTokens(messages);

    // Get model-specific max_tokens or use provided value
    const selectedModel = playRequest.model || modelConfigService.getDefaultModelId();
    const modelMaxTokens = modelConfigService.getMaxTokens(selectedModel);
    const maxCompletionTokens = playRequest.max_tokens || modelMaxTokens;

    if (!sessionManager.hasTokenBudget(playRequest.sessionId, estimatedTokens + maxCompletionTokens)) {
      return res.status(429).json({
        error: 'Token budget exceeded',
        used: session.tokenUsed,
        budget: session.tokenBudget,
        estimated: estimatedTokens + maxCompletionTokens,
      });
    }

    // Add user input to messages only if last message is not already a user message
    const lastMsg = messages[messages.length - 1];
    const lastIsUser = lastMsg?.role === 'user';

    if (playRequest.player_input && !lastIsUser) {
      messages.push({
        role: 'user',
        content: playRequest.player_input,
      });
    } else if (playRequest.history.length === 0) {
      // First turn - add initial prompt
      messages.push({
        role: 'user',
        content: promptService.buildInitialPrompt(
          playRequest.mode,
          playRequest.customPrompt,
          characterStatusEnabled,
          playRequest.customInitialCharacterStatus,
          language
        ),
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    let fullResponse = '';
    let tokenCount = 0;

    try {
      // Stream from LLM provider
      for await (const chunk of llmProvider.streamCompletion({
        model: playRequest.model || process.env.MODEL_DEFAULT || 'anthropic/claude-3-haiku',
        messages,
        temperature: playRequest.temperature,
        max_tokens: maxCompletionTokens,
      })) {
        fullResponse += chunk;
        tokenCount++;

        // Send chunk to client as SSE
        res.write(`data: ${JSON.stringify({ chunk, type: 'content' })}\n\n`);
      }

      // Parse final response
      const parsed = promptService.parseModelOutput(fullResponse);

      // Update session token usage (rough estimate)
      sessionManager.updateTokenUsage(playRequest.sessionId, estimatedTokens + tokenCount);

      // Get updated session to include current token usage
      const updatedSession = sessionManager.getSession(playRequest.sessionId);

      // Send final parsed output with token usage
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        output: parsed,
        tokenUsed: updatedSession?.tokenUsed || 0
      })}\n\n`);

      // Send final event
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: streamError instanceof Error ? streamError.message : 'Stream failed',
        })}\n\n`
      );
      res.end();
    }
  } catch (error) {
    console.error('Play endpoint error:', error);

    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }
});

export default router;
