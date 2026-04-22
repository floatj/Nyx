import type { Message } from '../types/index.js';

/**
 * Common response structure for LLM providers
 */
export interface LLMResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Parameters for LLM completion requests
 */
export interface CompletionParams {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  json_output?: boolean;
}

/**
 * Parameters for streaming completion requests
 */
export interface StreamCompletionParams {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * Interface that all LLM providers must implement
 */
export interface ILLMProvider {
  /**
   * Stream completion from the LLM provider
   * Returns an async generator that yields content chunks
   */
  streamCompletion(params: StreamCompletionParams): AsyncGenerator<string, void, unknown>;

  /**
   * Non-streaming completion from the LLM provider
   */
  complete(params: CompletionParams): Promise<LLMResponse>;

  /**
   * Get available models from the provider (optional)
   */
  getModels?(): Promise<any[]>;
}

/**
 * Supported LLM provider types
 */
export enum ProviderType {
  OPENROUTER = 'openrouter',
  GOOGLE_AI = 'google-ai',
}
