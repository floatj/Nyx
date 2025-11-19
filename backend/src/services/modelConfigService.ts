import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ModelCapabilities {
  streaming: boolean;
  json_mode: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  max_tokens: number;
  temperature: number;
  description: string;
  recommended: boolean;
  capabilities: ModelCapabilities;
}

export interface ModelSettings {
  models: ModelConfig[];
  defaultModel: string;
}

class ModelConfigService {
  private settings: ModelSettings | null = null;
  private configPath: string;

  constructor() {
    // Path to model_settings.json in the backend root directory
    this.configPath = path.join(__dirname, '../../model_settings.json');
    this.loadSettings();
  }

  /**
   * Load model settings from JSON file
   */
  private loadSettings(): void {
    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      this.settings = JSON.parse(fileContent);
      console.log('Model settings loaded successfully');
      console.log(`Available models: ${this.settings?.models.length || 0}`);
    } catch (error) {
      console.error('Failed to load model settings:', error);
      // Fallback to default configuration
      this.settings = {
        models: [
          {
            id: 'anthropic/claude-3-haiku',
            name: 'Claude 3 Haiku',
            provider: 'Anthropic',
            max_tokens: 2000,
            temperature: 0.7,
            description: 'Default fallback model',
            recommended: true,
            capabilities: {
              streaming: true,
              json_mode: true,
            },
          },
        ],
        defaultModel: 'anthropic/claude-3-haiku',
      };
    }
  }

  /**
   * Reload settings from file (useful for hot-reloading)
   */
  reloadSettings(): void {
    this.loadSettings();
  }

  /**
   * Get all available models
   */
  getAllModels(): ModelConfig[] {
    return this.settings?.models || [];
  }

  /**
   * Get model configuration by ID
   */
  getModelById(modelId: string): ModelConfig | undefined {
    return this.settings?.models.find((m) => m.id === modelId);
  }

  /**
   * Get default model ID
   */
  getDefaultModelId(): string {
    return this.settings?.defaultModel || 'anthropic/claude-3-haiku';
  }

  /**
   * Get default model configuration
   */
  getDefaultModel(): ModelConfig | undefined {
    return this.getModelById(this.getDefaultModelId());
  }

  /**
   * Get max_tokens for a specific model
   */
  getMaxTokens(modelId: string): number {
    const model = this.getModelById(modelId);
    return model?.max_tokens || 2000; // Default fallback
  }

  /**
   * Get temperature for a specific model
   */
  getTemperature(modelId: string): number {
    const model = this.getModelById(modelId);
    return model?.temperature || 0.7; // Default fallback
  }

  /**
   * Check if model supports JSON mode
   */
  supportsJsonMode(modelId: string): boolean {
    const model = this.getModelById(modelId);
    return model?.capabilities.json_mode || false;
  }

  /**
   * Check if model supports streaming
   */
  supportsStreaming(modelId: string): boolean {
    const model = this.getModelById(modelId);
    return model?.capabilities.streaming !== false; // Default to true
  }

  /**
   * Get recommended models
   */
  getRecommendedModels(): ModelConfig[] {
    return this.settings?.models.filter((m) => m.recommended) || [];
  }
}

export const modelConfigService = new ModelConfigService();
