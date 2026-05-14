import { v4 as uuidv4 } from 'uuid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Provider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  models: ModelInfo[];
  isAvailable: boolean;
  lastChecked: number;
  latency: number;
  priority: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

export interface ProviderConfig {
  name: string;
  type: Provider['type'];
  apiKey?: string;
  baseUrl?: string;
  models?: ModelInfo[];
  priority?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  tools?: unknown[];
}

export interface RouteRequirements {
  requiresStreaming?: boolean;
  requiresTools?: boolean;
  requiresVision?: boolean;
  minContextWindow?: number;
  preferredType?: Provider['type'];
}

// ─── Default Models Per Provider Type ────────────────────────────────────────

const DEFAULT_MODELS: Record<Provider['type'], ModelInfo[]> = {
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextWindow: 128000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: 'o1',
      name: 'o1',
      contextWindow: 200000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
  ],
  anthropic: [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      contextWindow: 200000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      contextWindow: 200000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
  ],
  google: [
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      contextWindow: 1048576,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      contextWindow: 1048576,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    },
  ],
  ollama: [
    {
      id: 'llama3.1:8b',
      name: 'Llama 3.1 8B',
      contextWindow: 128000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: false,
    },
    {
      id: 'codellama:13b',
      name: 'Code Llama 13B',
      contextWindow: 16384,
      supportsStreaming: true,
      supportsTools: false,
      supportsVision: false,
    },
  ],
  custom: [],
};

const DEFAULT_BASE_URLS: Record<Provider['type'], string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://localhost:11434/api',
  custom: '',
};

// ─── ProviderManager ────────────────────────────────────────────────────────

export class ProviderManager {
  private providers: Map<string, Provider> = new Map();

  // ─── Provider Management ──────────────────────────────────────────────

  /** Register a new AI provider */
  registerProvider(config: ProviderConfig): Provider {
    const id = uuidv4();
    const provider: Provider = {
      id,
      name: config.name,
      type: config.type,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URLS[config.type],
      models: config.models ?? DEFAULT_MODELS[config.type] ?? [],
      isAvailable: false,
      lastChecked: 0,
      latency: -1,
      priority: config.priority ?? 10,
    };

    this.providers.set(id, provider);

    // Do a background health check
    this.testProvider(id).catch(() => {
      // Provider marked as unavailable
    });

    return provider;
  }

  /** Remove a provider */
  removeProvider(id: string): boolean {
    return this.providers.delete(id);
  }

  /** Get a provider by ID */
  getProvider(id: string): Provider | null {
    return this.providers.get(id) ?? null;
  }

  /** List all registered providers */
  listProviders(): Provider[] {
    return Array.from(this.providers.values()).sort((a, b) => a.priority - b.priority);
  }

  // ─── Health & Testing ─────────────────────────────────────────────────

  /** Test a provider's connectivity and measure latency */
  async testProvider(id: string): Promise<{ success: boolean; latency: number }> {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Provider not found: ${id}`);

    const start = Date.now();

    try {
      const result = await this.performHealthCheck(provider);
      const latency = Date.now() - start;

      provider.isAvailable = result;
      provider.latency = latency;
      provider.lastChecked = Date.now();

      return { success: result, latency };
    } catch {
      provider.isAvailable = false;
      provider.latency = -1;
      provider.lastChecked = Date.now();
      return { success: false, latency: -1 };
    }
  }

  /** Check health of all providers */
  async checkHealth(): Promise<void> {
    const checks = Array.from(this.providers.keys()).map((id) =>
      this.testProvider(id).catch(() => ({ success: false, latency: -1 }))
    );
    await Promise.allSettled(checks);
  }

  // ─── Routing ──────────────────────────────────────────────────────────

  /** Route a request to the best available provider */
  routeRequest(requirements: RouteRequirements = {}): Provider {
    const available = this.listProviders().filter((p) => p.isAvailable);

    if (available.length === 0) {
      throw new Error('No providers available. Configure at least one provider.');
    }

    // Filter by requirements
    let candidates = available;

    if (requirements.preferredType) {
      const preferred = candidates.filter((p) => p.type === requirements.preferredType);
      if (preferred.length > 0) candidates = preferred;
    }

    if (requirements.requiresStreaming) {
      candidates = candidates.filter((p) =>
        p.models.some((m) => m.supportsStreaming)
      );
    }

    if (requirements.requiresTools) {
      candidates = candidates.filter((p) =>
        p.models.some((m) => m.supportsTools)
      );
    }

    if (requirements.requiresVision) {
      candidates = candidates.filter((p) =>
        p.models.some((m) => m.supportsVision)
      );
    }

    if (requirements.minContextWindow) {
      candidates = candidates.filter((p) =>
        p.models.some((m) => m.contextWindow >= requirements.minContextWindow!)
      );
    }

    if (candidates.length === 0) {
      throw new Error('No providers match the specified requirements.');
    }

    // Score candidates: lower is better
    const scored = candidates.map((provider) => {
      let score = 0;

      // Priority (lower priority number = better)
      score += provider.priority * 10;

      // Latency (lower is better, unknown latency gets penalty)
      if (provider.latency > 0) {
        score += provider.latency / 100;
      } else {
        score += 50; // Penalty for unknown latency
      }

      // Availability bonus
      if (provider.isAvailable) {
        score -= 20;
      }

      return { provider, score };
    });

    scored.sort((a, b) => a.score - b.score);
    return scored[0].provider;
  }

  // ─── Chat Completion ──────────────────────────────────────────────────

  /** Stream a chat completion from a specific provider */
  async *chatCompletion(
    providerId: string,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): AsyncGenerator<string> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    const stream = options.stream !== false; // Default to streaming

    switch (provider.type) {
      case 'openai':
        yield* this.openAIChatCompletion(provider, model, messages, options, stream);
        break;
      case 'anthropic':
        yield* this.anthropicChatCompletion(provider, model, messages, options, stream);
        break;
      case 'google':
        yield* this.googleChatCompletion(provider, model, messages, options, stream);
        break;
      case 'ollama':
        yield* this.ollamaChatCompletion(provider, model, messages, options, stream);
        break;
      case 'custom':
        yield* this.customChatCompletion(provider, model, messages, options, stream);
        break;
      default:
        throw new Error(`Unsupported provider type: ${provider.type}`);
    }
  }

  /** List available models for a provider */
  getModels(providerId: string): ModelInfo[] {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return provider.models;
  }

  // ─── Private: Health Checks ───────────────────────────────────────────

  private async performHealthCheck(provider: Provider): Promise<boolean> {
    try {
      switch (provider.type) {
        case 'openai': {
          const res = await fetch(`${provider.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          return res.ok;
        }
        case 'anthropic': {
          // Anthropic doesn't have a simple health endpoint; send a minimal request
          const res = await fetch(`${provider.baseUrl}/messages`, {
            method: 'POST',
            headers: {
              'x-api-key': provider.apiKey ?? '',
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: provider.models[0]?.id ?? 'claude-sonnet-4-20250514',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
            signal: AbortSignal.timeout(15000),
          });
          return res.ok || res.status === 400; // 400 = auth works but bad request
        }
        case 'google': {
          const res = await fetch(
            `${provider.baseUrl}/models?key=${provider.apiKey}`,
            { signal: AbortSignal.timeout(10000) }
          );
          return res.ok;
        }
        case 'ollama': {
          const res = await fetch(`${provider.baseUrl}/tags`, {
            signal: AbortSignal.timeout(5000),
          });
          return res.ok;
        }
        case 'custom': {
          if (!provider.baseUrl) return false;
          const res = await fetch(provider.baseUrl, {
            signal: AbortSignal.timeout(10000),
          });
          return res.ok;
        }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  // ─── Private: Provider-Specific Chat Implementations ───────────────────

  private async *openAIChatCompletion(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean
  ): AsyncGenerator<string> {
    const url = `${provider.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    };

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stop: options.stop,
    };

    if (options.tools) {
      body.tools = options.tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    if (!stream) {
      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content ?? '';
      yield content;
      return;
    }

    // Stream SSE
    yield* this.parseSSEStream(response);
  }

  private async *anthropicChatCompletion(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean
  ): AsyncGenerator<string> {
    const url = `${provider.baseUrl}/messages`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    };

    // Separate system message from conversation messages
    let systemPrompt: string | undefined;
    const conversationMessages = messages.filter((m) => {
      if (m.role === 'system') {
        systemPrompt = m.content;
        return false;
      }
      return true;
    });

    const body: Record<string, unknown> = {
      model,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options.maxTokens ?? 4096,
      stream,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stop_sequences: options.stop,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    if (!stream) {
      const data = (await response.json()) as any;
      const content = data.content?.[0]?.text ?? '';
      yield content;
      return;
    }

    // Parse Anthropic SSE format
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                yield parsed.delta.text;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *googleChatCompletion(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean
  ): AsyncGenerator<string> {
    const url = `${provider.baseUrl}/models/${model}:${
      stream ? 'streamGenerateContent' : 'generateContent'
    }?key=${provider.apiKey}`;

    // Convert to Google's format
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === 'system');

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
        topP: options.topP,
        stopSequences: options.stop,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction.content }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error (${response.status}): ${errorText}`);
    }

    if (!stream) {
      const data = (await response.json()) as any;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      yield content;
      return;
    }

    // Google streaming format
    const text = await response.text();
    // Google returns JSON arrays for streaming
    try {
      // Try to parse as concatenated JSON objects
      const cleaned = text.replace(/\]\s*\[/g, ',');
      const parsed = JSON.parse(`[${cleaned}]`);
      for (const chunk of Array.isArray(parsed) ? parsed : [parsed]) {
        const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) yield content;
      }
    } catch {
      // Fallback: return raw
      yield text;
    }
  }

  private async *ollamaChatCompletion(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean
  ): AsyncGenerator<string> {
    const url = `${provider.baseUrl}/chat`;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
        top_p: options.topP,
        stop: options.stop,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    if (!stream) {
      const data = (await response.json()) as any;
      yield data.message?.content ?? '';
      return;
    }

    // Ollama streams newline-delimited JSON
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
            if (parsed.done) return;
          } catch {
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *customChatCompletion(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean
  ): AsyncGenerator<string> {
    // Assume OpenAI-compatible format for custom providers
    const url = `${provider.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom provider API error (${response.status}): ${errorText}`);
    }

    if (!stream) {
      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content ?? '';
      yield content;
      return;
    }

    yield* this.parseSSEStream(response);
  }

  // ─── Private: SSE Parser ──────────────────────────────────────────────

  private async *parseSSEStream(response: Response): AsyncGenerator<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) yield delta;
            } catch {
              // Skip malformed SSE data
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
