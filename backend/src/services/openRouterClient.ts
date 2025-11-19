import 'dotenv/config';
import type { Message } from '../types/index.js';

export interface OpenRouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
  }

  /**
   * Stream completion from OpenRouter
   * Returns an async generator that yields content chunks
   */
  async *streamCompletion(params: {
    model: string;
    messages: Message[];
    temperature?: number;
    max_tokens?: number;
  }): AsyncGenerator<string, void, unknown> {
    const requestBody: any = {
      model: params.model || 'anthropic/claude-3-haiku',
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2000, // Increased from 600 to 2000 for longer responses
      stream: true,
    };

    // Only add response_format for models that support it
    // Gemini models may not handle this well, so we make it conditional
    const model = requestBody.model.toLowerCase();
    if (model.includes('anthropic') || model.includes('claude') || model.includes('gpt')) {
      requestBody.response_format = { type: 'json_object' };
    }

    // Log full request details before sending
    console.log('=== OpenRouter API Stream Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Model:', requestBody.model);
    console.log('Temperature:', requestBody.temperature);
    console.log('Max Tokens:', requestBody.max_tokens);
    console.log('Stream:', requestBody.stream);
    console.log('Messages Count:', requestBody.messages.length);
    console.log('Messages:', JSON.stringify(requestBody.messages, null, 2));
    console.log('Full Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('=====================================');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Text RPG',
      },
      body: JSON.stringify(requestBody),
    });

    // Log response status
    console.log('=== OpenRouter API Stream Response ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    console.log('======================================');

    if (!response.ok) {
      const error = await response.text();
      console.error('=== OpenRouter API Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Status:', response.status);
      console.error('Error:', error);
      console.error('===================================');
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      console.error('=== OpenRouter API Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Error: No response body from OpenRouter');
      console.error('===================================');
      throw new Error('No response body from OpenRouter');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;
    let totalContent = '';

    console.log('=== OpenRouter Stream Started ===');
    console.log('Timestamp:', new Date().toISOString());

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              console.log('=== OpenRouter Stream Completed ===');
              console.log('Timestamp:', new Date().toISOString());
              console.log('Total Chunks:', chunkCount);
              console.log('Total Content Length:', totalContent.length);
              console.log('Full Content:', totalContent);
              console.log('===================================');
              return;
            }

            try {
              const chunk: OpenRouterStreamChunk = JSON.parse(data);
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                chunkCount++;
                totalContent += content;
                console.log(`Chunk ${chunkCount}:`, content);
                yield content;
              }
            } catch (e) {
              console.warn('Failed to parse SSE chunk:', data);
            }
          }
        }
      }
    } catch (error) {
      console.error('=== OpenRouter Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Error:', error);
      console.error('Chunks received before error:', chunkCount);
      console.error('==============================');
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Non-streaming completion (fallback)
   */
  async complete(params: {
    model: string;
    messages: Message[];
    temperature?: number;
    max_tokens?: number;
    json_output?: boolean;
  }): Promise<OpenRouterResponse> {
    const bodyParams: any = {
      model: params.model || 'anthropic/claude-3-haiku',
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2000, // Increased from 600 to 2000 for longer responses
      stream: false,
    };

    // Only add response_format if json_output is explicitly true
    // and the model supports it (skip for Gemini and other models that may not handle it)
    if (params.json_output) {
      const model = bodyParams.model.toLowerCase();
      if (model.includes('anthropic') || model.includes('claude') || model.includes('gpt')) {
        bodyParams.response_format = { type: 'json_object' };
      }
    }

    // Log full request details before sending
    console.log('=== OpenRouter API Non-Stream Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Model:', bodyParams.model);
    console.log('Temperature:', bodyParams.temperature);
    console.log('Max Tokens:', bodyParams.max_tokens);
    console.log('Stream:', bodyParams.stream);
    console.log('JSON Output:', params.json_output ?? false);
    console.log('Messages Count:', bodyParams.messages.length);
    console.log('Messages:', JSON.stringify(bodyParams.messages, null, 2));
    console.log('Full Request Body:', JSON.stringify(bodyParams, null, 2));
    console.log('=========================================');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Text RPG',
      },
      body: JSON.stringify(bodyParams),
    });

    // Log response status
    console.log('=== OpenRouter API Non-Stream Response ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    console.log('==========================================');

    if (!response.ok) {
      const error = await response.text();
      console.error('=== OpenRouter API Non-Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Status:', response.status);
      console.error('Error:', error);
      console.error('=======================================');
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const responseData = await response.json();

    // Log full response data
    console.log('=== OpenRouter API Response Data ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Response:', JSON.stringify(responseData, null, 2));
    console.log('Message Content:', responseData.choices?.[0]?.message?.content);
    console.log('Usage:', responseData.usage);
    console.log('====================================');

    return responseData;
  }

  /**
   * Fetch available models
   */
  async getModels(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }
}

export const openRouterClient = new OpenRouterClient();
