import { Router } from 'express';
import { sessionManager } from '../services/sessionManager.js';

const router = Router();

/**
 * POST /api/session
 * Create a new anonymous session
 */
router.post('/', (req, res) => {
  try {
    const { tokenBudget } = req.body || {};
    const sessionResponse = sessionManager.createSession(tokenBudget ? parseInt(tokenBudget) : undefined);
    res.json(sessionResponse);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/session/:id
 * Get session info
 */
router.get('/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  res.json({
    sessionId: session.id,
    tokenUsed: session.tokenUsed,
    tokenBudget: session.tokenBudget,
    remainingBudget: session.tokenBudget - session.tokenUsed,
  });
});

export default router;
