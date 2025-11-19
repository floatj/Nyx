import 'dotenv/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type { Message } from '../types/index.js';
import type {
  ILLMProvider,
  CompletionParams,
  StreamCompletionParams,
  LLMResponse,
} from './llmProvider.js';
import { modelConfigService } from './modelConfigService.js';

/**
 * Google AI Studio client implementation
 */
export class GoogleAIClient implements ILLMProvider {
  private apiKey: string;
  private genAI: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_AI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Google AI API key is required');
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  /**
   * Convert OpenRouter-style messages to Google AI format
   */
  private convertMessages(messages: Message[]): any[] {
    // Google AI expects a different format than OpenRouter
    // We need to convert the message array to Google's format
    const contents: any[] = [];

    for (const message of messages) {
      // Map role: 'assistant' -> 'model' for Google AI
      const role = message.role === 'assistant' ? 'model' : message.role;

      // Skip system messages as Google AI handles them differently
      if (message.role === 'system') {
        continue;
      }

      contents.push({
        role,
        parts: [{ text: message.content }],
      });
    }

    return contents;
  }

  /**
   * Extract system instruction from messages
   */
  private extractSystemInstruction(messages: Message[]): string | undefined {
    const systemMessage = messages.find((m) => m.role === 'system');
    // Content can be string or LLMOutput, but for system messages it's always a string
    const content = systemMessage?.content;
    return typeof content === 'string' ? content : undefined;
  }

  /**
   * Get the model name in Google AI format
   * Converts from OpenRouter format (google/gemini-2.5-pro) to Google format (gemini-2.5-pro)
   */
  private getModelName(modelId: string): string {
    // Remove provider prefix if present
    if (modelId.startsWith('google/')) {
      return modelId.replace('google/', '');
    }
    return modelId;
  }

  /**
   * Stream completion from Google AI
   * Returns an async generator that yields content chunks
   */
  async *streamCompletion(
    params: StreamCompletionParams,
  ): AsyncGenerator<string, void, unknown> {
    const modelId = params.model || modelConfigService.getDefaultModelId();
    const modelName = this.getModelName(modelId);

    // Get model-specific configuration
    const modelMaxTokens = modelConfigService.getMaxTokens(modelId);
    const modelTemperature = modelConfigService.getTemperature(modelId);

    const systemInstruction = this.extractSystemInstruction(params.messages);
    const contents = this.convertMessages(params.messages);

    // Log full request details before sending
    console.log('=== Google AI API Stream Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Model:', modelName);
    console.log('Temperature:', params.temperature ?? modelTemperature);
    console.log('Max Tokens:', params.max_tokens ?? modelMaxTokens);
    console.log('System Instruction:', systemInstruction);
    console.log('Messages Count:', params.messages.length);
    console.log('Messages:', JSON.stringify(params.messages, null, 2));
    console.log('Converted Contents:', JSON.stringify(contents, null, 2));
    console.log('====================================');

    try {
      const model: GenerativeModel = this.genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          temperature: params.temperature ?? modelTemperature,
          maxOutputTokens: params.max_tokens ?? modelMaxTokens,
        },
      });

      console.log('=== Google AI Stream Started ===');
      console.log('Timestamp:', new Date().toISOString());

      const result = await model.generateContentStream({
        contents,
      });

      let chunkCount = 0;
      let totalContent = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          chunkCount++;
          totalContent += chunkText;
          console.log(`Chunk ${chunkCount}:`, chunkText);
          yield chunkText;
        }
      }

      console.log('=== Google AI Stream Completed ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Total Chunks:', chunkCount);
      console.log('Total Content Length:', totalContent.length);
      console.log('Full Content:', totalContent);
      console.log('==================================');
    } catch (error: any) {
      console.error('=== Google AI Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Error:', error);
      console.error('Error Message:', error.message);
      console.error('==============================');
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }

  /**
   * Non-streaming completion from Google AI
   */
  async complete(params: CompletionParams): Promise<LLMResponse> {
    const modelId = params.model || modelConfigService.getDefaultModelId();
    const modelName = this.getModelName(modelId);

    // Get model-specific configuration
    const modelMaxTokens = modelConfigService.getMaxTokens(modelId);
    const modelTemperature = modelConfigService.getTemperature(modelId);

    const systemInstruction = this.extractSystemInstruction(params.messages);
    const contents = this.convertMessages(params.messages);

    // Log full request details before sending
    console.log('=== Google AI API Non-Stream Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Model:', modelName);
    console.log('Temperature:', params.temperature ?? modelTemperature);
    console.log('Max Tokens:', params.max_tokens ?? modelMaxTokens);
    console.log('JSON Output:', params.json_output ?? false);
    console.log('System Instruction:', systemInstruction);
    console.log('Messages Count:', params.messages.length);
    console.log('Messages:', JSON.stringify(params.messages, null, 2));
    console.log('Converted Contents:', JSON.stringify(contents, null, 2));
    console.log('========================================');

    try {
      const generationConfig: any = {
        temperature: params.temperature ?? modelTemperature,
        maxOutputTokens: params.max_tokens ?? modelMaxTokens,
      };

      // Add JSON mode if requested
      if (params.json_output) {
        generationConfig.responseMimeType = 'application/json';
      }

      const model: GenerativeModel = this.genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig,
      });

      const result = await model.generateContent({
        contents,
      });

      const response = await result.response;
      const content = response.text();

      // Log response
      console.log('=== Google AI API Response ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Response Content:', content);
      console.log('==============================');

      // Convert to standard LLMResponse format
      return {
        id: `google-${Date.now()}`,
        choices: [
          {
            message: {
              role: 'assistant',
              content,
            },
            finish_reason: 'stop',
          },
        ],
        usage: response.usageMetadata
          ? {
              prompt_tokens: response.usageMetadata.promptTokenCount || 0,
              completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
              total_tokens: response.usageMetadata.totalTokenCount || 0,
            }
          : undefined,
      };
    } catch (error: any) {
      console.error('=== Google AI Non-Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Error:', error);
      console.error('Error Message:', error.message);
      console.error('==================================');
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }

  /**
   * Get available models from Google AI
   */
  async getModels(): Promise<any[]> {
    try {
      // Note: The Google AI SDK doesn't provide a direct listModels() method
      // This is a placeholder implementation
      // You can manually return the list of available models or fetch from Google's API docs
      return [
        {
          id: 'gemini-2.0-flash-exp',
          name: 'Gemini 2.0 Flash (Experimental)',
          description: 'Latest experimental flash model',
        },
        {
          id: 'gemini-1.5-pro',
          name: 'Gemini 1.5 Pro',
          description: 'Advanced reasoning and generation',
        },
        {
          id: 'gemini-1.5-flash',
          name: 'Gemini 1.5 Flash',
          description: 'Fast and versatile performance',
        },
      ];
    } catch (error: any) {
      console.error('Failed to fetch Google AI models:', error);
      throw new Error(`Failed to fetch Google AI models: ${error.message}`);
    }
  }
}
