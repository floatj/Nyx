import { Router } from 'express';
import type { Request, Response } from 'express';
import { modelConfigService } from '../services/modelConfigService.js';

const router = Router();

/**
 * GET /api/models
 * Get all available models
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const models = modelConfigService.getAllModels();
    const defaultModelId = modelConfigService.getDefaultModelId();

    res.json({
      models,
      defaultModel: defaultModelId,
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/models/recommended
 * Get recommended models
 */
router.get('/recommended', async (req: Request, res: Response) => {
  try {
    const models = modelConfigService.getRecommendedModels();
    res.json({ models });
  } catch (error) {
    console.error('Error fetching recommended models:', error);
    res.status(500).json({
      error: 'Failed to fetch recommended models',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/models/:modelId
 * Get specific model configuration
 */
router.get('/:modelId(*)', async (req: Request, res: Response) => {
  try {
    const modelId = req.params.modelId;
    const model = modelConfigService.getModelById(modelId);

    if (!model) {
      return res.status(404).json({
        error: 'Model not found',
        modelId,
      });
    }

    res.json({ model });
  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({
      error: 'Failed to fetch model',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
