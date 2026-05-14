import { v4 as uuidv4 } from 'uuid';
import { ProviderStore, PersistedProvider, maskApiKey } from './provider-store';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'lmstudio' | 'custom';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  models: ModelInfo[];
  isAvailable: boolean;
  lastChecked: number;
  latency: number;
  priority: number;
  isActive?: boolean;
  isFallback?: boolean;
  chatOptions?: ChatOptions;
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
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  models?: ModelInfo[];
  priority?: number;
  chatOptions?: ChatOptions;
}

export interface ChatOptions {
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  model?: string;
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
  preferredType?: ProviderType;
}

// ─── Default Models Per Provider Type ────────────────────────────────────────

const DEFAULT_MODELS: Record<ProviderType, ModelInfo[]> = {
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
  lmstudio: [
    {
      id: 'default',
      name: 'Default Model',
      contextWindow: 128000,
      supportsStreaming: true,
      supportsTools: false,
      supportsVision: false,
    },
  ],
  custom: [],
};

const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://localhost:11434/api',
  lmstudio: 'http://localhost:1234/v1',
  custom: '',
};

const DEFAULT_CHAT_OPTIONS: ChatOptions = {
  temperature: 0.7,
  maxTokens: 4096,
  streaming: true,
};

// ─── ProviderManager ────────────────────────────────────────────────────────

export class ProviderManager {
  private providers: Map<string, Provider> = new Map();
  private activeProviderId: string | null = null;
  private fallbackProviderId: string | null = null;
  private store: ProviderStore;

  constructor() {
    this.store = new ProviderStore();
    this.loadFromStore();
  }

  // ─── Persistence ──────────────────────────────────────────────────────

  private loadFromStore(): void {
    const data = this.store.loadProviders();

    for (const persisted of data.providers) {
      const provider: Provider = {
        id: persisted.id,
        name: persisted.name,
        type: persisted.type as ProviderType,
        apiKey: persisted.apiKey,
        baseUrl: persisted.baseUrl ?? DEFAULT_BASE_URLS[persisted.type as ProviderType] ?? '',
        models: persisted.models ?? DEFAULT_MODELS[persisted.type as ProviderType] ?? [],
        isAvailable: false,
        lastChecked: 0,
        latency: -1,
        priority: persisted.priority ?? 10,
        isActive: persisted.isActive ?? false,
        isFallback: persisted.isFallback ?? false,
        chatOptions: persisted.chatOptions ?? { ...DEFAULT_CHAT_OPTIONS },
      };

      this.providers.set(persisted.id, provider);

      // Log masked key for debugging
      if (provider.apiKey) {
        console.log(`[ProviderManager] Loaded provider ${provider.name} with key: ${maskApiKey(provider.apiKey)}`);
      }
    }

    // Restore active/fallback
    if (data.activeProviderId && this.providers.has(data.activeProviderId)) {
      this.activeProviderId = data.activeProviderId;
    }
    if (data.fallbackProviderId && this.providers.has(data.fallbackProviderId)) {
      this.fallbackProviderId = data.fallbackProviderId;
    }

    // Do background health checks for all loaded providers
    this.checkHealth().catch(() => {});

    console.log(`[ProviderManager] Loaded ${this.providers.size} providers from store`);
  }

  private persistToStore(): void {
    const persisted: PersistedProvider[] = Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      models: p.models,
      priority: p.priority,
      isActive: p.isActive,
      isFallback: p.isFallback,
      chatOptions: p.chatOptions,
    }));

    this.store.saveProviders(persisted, this.activeProviderId ?? undefined, this.fallbackProviderId ?? undefined);
  }

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
      chatOptions: config.chatOptions ?? { ...DEFAULT_CHAT_OPTIONS },
    };

    this.providers.set(id, provider);

    // If this is the first provider, make it active
    if (this.providers.size === 1) {
      this.activeProviderId = id;
      provider.isActive = true;
    }

    // Auto-persist
    this.persistToStore();

    // Do a background health check
    this.testProvider(id).catch(() => {});

    return provider;
  }

  /** Remove a provider */
  removeProvider(id: string): boolean {
    const existed = this.providers.delete(id);

    if (existed) {
      // Clear active/fallback if this provider was set
      if (this.activeProviderId === id) {
        this.activeProviderId = null;
        // Set a new active provider if available
        const first = this.listProviders()[0];
        if (first) {
          this.activeProviderId = first.id;
          first.isActive = true;
        }
      }
      if (this.fallbackProviderId === id) {
        this.fallbackProviderId = null;
      }

      this.persistToStore();
    }

    return existed;
  }

  /** Get a provider by ID */
  getProvider(id: string): Provider | null {
    return this.providers.get(id) ?? null;
  }

  /** List all registered providers */
  listProviders(): Provider[] {
    return Array.from(this.providers.values()).sort((a, b) => a.priority - b.priority);
  }

  /** Update a provider's configuration */
  updateProvider(id: string, updates: Partial<Omit<ProviderConfig, 'type'>> & { type?: ProviderType }): Provider | null {
    const provider = this.providers.get(id);
    if (!provider) return null;

    if (updates.name !== undefined) provider.name = updates.name;
    if (updates.type !== undefined) provider.type = updates.type;
    if (updates.apiKey !== undefined) provider.apiKey = updates.apiKey;
    if (updates.baseUrl !== undefined) provider.baseUrl = updates.baseUrl;
    if (updates.models !== undefined) provider.models = updates.models;
    if (updates.priority !== undefined) provider.priority = updates.priority;
    if (updates.chatOptions !== undefined) provider.chatOptions = updates.chatOptions;

    this.persistToStore();
    return provider;
  }

  // ─── Active / Fallback ────────────────────────────────────────────────

  /** Set the active provider by ID */
  setActiveProvider(id: string): boolean {
    if (!this.providers.has(id)) return false;

    // Clear isActive flag on previous active provider
    if (this.activeProviderId) {
      const prev = this.providers.get(this.activeProviderId);
      if (prev) prev.isActive = false;
    }

    this.activeProviderId = id;
    const provider = this.providers.get(id);
    if (provider) provider.isActive = true;

    this.persistToStore();
    return true;
  }

  /** Get the active provider */
  getActiveProvider(): Provider | null {
    if (this.activeProviderId) {
      return this.providers.get(this.activeProviderId) ?? null;
    }
    // Fallback to first available
    const available = this.listProviders().filter((p) => p.isAvailable);
    return available[0] ?? this.listProviders()[0] ?? null;
  }

  /** Set the fallback provider by ID */
  setFallbackProvider(id: string): boolean {
    if (!this.providers.has(id)) return false;

    // Clear isFallback flag on previous fallback provider
    if (this.fallbackProviderId) {
      const prev = this.providers.get(this.fallbackProviderId);
      if (prev) prev.isFallback = false;
    }

    this.fallbackProviderId = id;
    const provider = this.providers.get(id);
    if (provider) provider.isFallback = true;

    this.persistToStore();
    return true;
  }

  /** Get the fallback provider */
  getFallbackProvider(): Provider | null {
    if (this.fallbackProviderId) {
      return this.providers.get(this.fallbackProviderId) ?? null;
    }
    return null;
  }

  /** Get sanitized config for a provider (no full API key) */
  getSanitizedConfig(id: string): Record<string, unknown> | null {
    const provider = this.providers.get(id);
    if (!provider) return null;

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      apiKey: maskApiKey(provider.apiKey),
      baseUrl: provider.baseUrl,
      models: provider.models,
      isAvailable: provider.isAvailable,
      lastChecked: provider.lastChecked,
      latency: provider.latency,
      priority: provider.priority,
      isActive: provider.isActive ?? false,
      isFallback: provider.isFallback ?? false,
      chatOptions: provider.chatOptions,
    };
  }

  /** Get chat options for a provider */
  getChatOptions(id: string): ChatOptions | null {
    const provider = this.providers.get(id);
    if (!provider) return null;
    return provider.chatOptions ?? { ...DEFAULT_CHAT_OPTIONS };
  }

  /** Set chat options for a provider */
  setChatOptions(id: string, options: Partial<ChatOptions>): boolean {
    const provider = this.providers.get(id);
    if (!provider) return false;

    provider.chatOptions = {
      ...(provider.chatOptions ?? DEFAULT_CHAT_OPTIONS),
      ...options,
    };

    this.persistToStore();
    return true;
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
    // Prefer active provider if available
    const active = this.getActiveProvider();
    if (active && active.isAvailable) {
      return active;
    }

    // Try fallback provider
    const fallback = this.getFallbackProvider();
    if (fallback && fallback.isAvailable) {
      return fallback;
    }

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
      case 'lmstudio':
        yield* this.lmStudioChatCompletion(provider, model, messages, options, stream);
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
          return res.ok || res.status === 400;
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
        case 'lmstudio': {
          const res = await fetch(`${provider.baseUrl}/models`, {
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
      temperature: options.temperature ?? provider.chatOptions?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? provider.chatOptions?.maxTokens ?? 4096,
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
      max_tokens: options.maxTokens ?? provider.chatOptions?.maxTokens ?? 4096,
      stream,
      temperature: options.temperature ?? provider.chatOptions?.temperature ?? 0.7,
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
        temperature: options.temperature ?? provider.chatOptions?.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? provider.chatOptions?.maxTokens ?? 4096,
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

    const text = await response.text();
    try {
      const cleaned = text.replace(/\]\s*\[/g, ',');
      const parsed = JSON.parse(`[${cleaned}]`);
      for (const chunk of Array.isArray(parsed) ? parsed : [parsed]) {
        const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) yield content;
      }
    } catch {
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
        temperature: options.temperature ?? provider.chatOptions?.temperature ?? 0.7,
        num_predict: options.maxTokens ?? provider.chatOptions?.maxTokens ?? 4096,
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

  private async *lmStudioChatCompletion(
    provider: Provider,
    model: string,
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean
  ): AsyncGenerator<string> {
    // LM Studio uses an OpenAI-compatible API
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
      temperature: options.temperature ?? provider.chatOptions?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? provider.chatOptions?.maxTokens ?? 4096,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
    }

    if (!stream) {
      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content ?? '';
      yield content;
      return;
    }

    yield* this.parseSSEStream(response);
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
      temperature: options.temperature ?? provider.chatOptions?.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? provider.chatOptions?.maxTokens ?? 4096,
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
