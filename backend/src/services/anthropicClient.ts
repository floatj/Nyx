import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../types/index.js';
import type {
  ILLMProvider,
  CompletionParams,
  StreamCompletionParams,
  LLMResponse,
} from './llmProvider.js';
import { modelConfigService } from './modelConfigService.js';

export class AnthropicClient implements ILLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!key) {
      throw new Error('Anthropic API key is required');
    }
    this.client = new Anthropic({ apiKey: key });
  }

  // Maps shorthand/OpenRouter model IDs to Anthropic's required versioned IDs
  private static readonly MODEL_ALIASES: Record<string, string> = {
    'claude-opus-4-7':   'claude-opus-4-7',
    'claude-sonnet-4-6': 'claude-sonnet-4-6',
    'claude-haiku-4-5':  'claude-haiku-4-5-20251001',
  };

  private getModelName(modelId: string): string {
    // Strip provider prefix if present (e.g. "anthropic/claude-3-haiku" -> "claude-3-haiku")
    const bare = modelId.startsWith('anthropic/')
      ? modelId.replace('anthropic/', '')
      : modelId;
    return AnthropicClient.MODEL_ALIASES[bare] ?? bare;
  }

  private splitMessages(messages: Message[]): {
    system: string | undefined;
    userMessages: Anthropic.MessageParam[];
  } {
    const systemMsg = messages.find((m) => m.role === 'system');
    const system = typeof systemMsg?.content === 'string' ? systemMsg.content : undefined;

    const userMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

    return { system, userMessages };
  }

  async *streamCompletion(
    params: StreamCompletionParams,
  ): AsyncGenerator<string, void, unknown> {
    const modelId = params.model || modelConfigService.getDefaultModelId();
    const modelName = this.getModelName(modelId);
    const modelMaxTokens = modelConfigService.getMaxTokens(modelId);
    const modelTemperature = modelConfigService.getTemperature(modelId);

    const { system, userMessages } = this.splitMessages(params.messages);

    console.log('=== Anthropic API Stream Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Model:', modelName);
    console.log('Temperature:', params.temperature ?? modelTemperature);
    console.log('Max Tokens:', params.max_tokens ?? modelMaxTokens);
    console.log('Messages Count:', params.messages.length);
    console.log('Messages:', JSON.stringify(params.messages, null, 2));
    console.log('====================================');

    try {
      const stream = this.client.messages.stream({
        model: modelName,
        max_tokens: params.max_tokens ?? modelMaxTokens,
        temperature: params.temperature ?? modelTemperature,
        ...(system ? { system } : {}),
        messages: userMessages,
      });

      let chunkCount = 0;
      let totalContent = '';

      console.log('=== Anthropic Stream Started ===');
      console.log('Timestamp:', new Date().toISOString());

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const text = event.delta.text;
          if (text) {
            chunkCount++;
            totalContent += text;
            console.log(`Chunk ${chunkCount}:`, text);
            yield text;
          }
        }
      }

      console.log('=== Anthropic Stream Completed ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Total Chunks:', chunkCount);
      console.log('Total Content Length:', totalContent.length);
      console.log('Full Content:', totalContent);
      console.log('==================================');
    } catch (error: any) {
      console.error('=== Anthropic Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Error:', error);
      console.error('Error Message:', error.message);
      console.error('==============================');
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async complete(params: CompletionParams): Promise<LLMResponse> {
    const modelId = params.model || modelConfigService.getDefaultModelId();
    const modelName = this.getModelName(modelId);
    const modelMaxTokens = modelConfigService.getMaxTokens(modelId);
    const modelTemperature = modelConfigService.getTemperature(modelId);

    const { system, userMessages } = this.splitMessages(params.messages);

    console.log('=== Anthropic API Non-Stream Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Model:', modelName);
    console.log('Temperature:', params.temperature ?? modelTemperature);
    console.log('Max Tokens:', params.max_tokens ?? modelMaxTokens);
    console.log('JSON Output:', params.json_output ?? false);
    console.log('Messages Count:', params.messages.length);
    console.log('Messages:', JSON.stringify(params.messages, null, 2));
    console.log('=========================================');

    try {
      const response = await this.client.messages.create({
        model: modelName,
        max_tokens: params.max_tokens ?? modelMaxTokens,
        temperature: params.temperature ?? modelTemperature,
        ...(system ? { system } : {}),
        messages: userMessages,
      });

      const content = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');

      console.log('=== Anthropic API Response ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Response Content:', content);
      console.log('Usage:', response.usage);
      console.log('==============================');

      return {
        id: response.id,
        choices: [
          {
            message: { role: 'assistant', content },
            finish_reason: response.stop_reason || 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error: any) {
      console.error('=== Anthropic Non-Stream Error ===');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Error:', error);
      console.error('Error Message:', error.message);
      console.error('==================================');
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async getModels(): Promise<any[]> {
    return [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', description: 'Most capable' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced speed and quality' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest and most affordable' },
    ];
  }
}
