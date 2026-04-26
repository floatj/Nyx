import 'dotenv/config';
import { ILLMProvider, ProviderType } from './llmProvider.js';
import { OpenRouterClient } from './openRouterClient.js';
import { GoogleAIClient } from './googleAIClient.js';
import { AnthropicClient } from './anthropicClient.js';

/**
 * Factory for creating LLM provider instances
 */
export class LLMProviderFactory {
  private static instance: ILLMProvider | null = null;

  /**
   * Create an LLM provider based on the specified type or environment configuration
   */
  static createProvider(providerType?: ProviderType): ILLMProvider {
    // Determine which provider to use
    const type =
      providerType ||
      (process.env.LLM_PROVIDER as ProviderType) ||
      LLMProviderFactory.detectProvider();

    console.log('=== LLM Provider Factory ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Provider Type:', type);
    console.log('===========================');

    switch (type) {
      case ProviderType.GOOGLE_AI:
        return new GoogleAIClient();
      case ProviderType.ANTHROPIC:
        return new AnthropicClient();
      case ProviderType.OPENROUTER:
        return new OpenRouterClient();
      default:
        console.warn(
          `Unknown provider type: ${type}, falling back to OpenRouter`,
        );
        return new OpenRouterClient();
    }
  }

  /**
   * Get or create a singleton provider instance
   * This is useful for reusing the same provider throughout the application
   */
  static getProvider(providerType?: ProviderType): ILLMProvider {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = LLMProviderFactory.createProvider(providerType);
    }
    return LLMProviderFactory.instance;
  }

  /**
   * Reset the singleton instance (useful for testing or switching providers)
   */
  static resetProvider(): void {
    LLMProviderFactory.instance = null;
  }

  /**
   * Auto-detect which provider to use based on available API keys
   */
  private static detectProvider(): ProviderType {
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('Detected Anthropic API key, using Anthropic provider');
      return ProviderType.ANTHROPIC;
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      console.log('Detected Google AI API key, using Google AI provider');
      return ProviderType.GOOGLE_AI;
    }

    if (process.env.OPENROUTER_API_KEY) {
      console.log('Detected OpenRouter API key, using OpenRouter provider');
      return ProviderType.OPENROUTER;
    }

    console.warn(
      'No API keys detected, defaulting to OpenRouter (will fail if key not set)',
    );
    return ProviderType.OPENROUTER;
  }
}

/**
 * Export a default provider instance for convenience
 */
export const llmProvider = LLMProviderFactory.getProvider();
