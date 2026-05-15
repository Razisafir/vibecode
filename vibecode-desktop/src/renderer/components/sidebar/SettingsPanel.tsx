import React, { useState, useEffect, useCallback } from 'react';
import type { Provider, ProviderType, ModelInfo, ChatOptions } from '../../types';
import SkeletonCard from '../SkeletonCard';
import Toggle from '../ui/Toggle';
import SectionHeader from '../ui/SectionHeader';

// ─── Provider Type Definitions ──────────────────────────────────────────────

interface ProviderFormData {
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
}

const PROVIDER_TYPES: { value: ProviderType; label: string; needsApiKey: boolean; defaultBaseUrl: string }[] = [
  { value: 'openai', label: 'OpenAI', needsApiKey: true, defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', needsApiKey: true, defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { value: 'google', label: 'Gemini', needsApiKey: true, defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { value: 'ollama', label: 'Ollama', needsApiKey: false, defaultBaseUrl: 'http://localhost:11434/api' },
  { value: 'lmstudio', label: 'LM Studio', needsApiKey: false, defaultBaseUrl: 'http://localhost:1234/v1' },
  { value: 'custom', label: 'Custom', needsApiKey: false, defaultBaseUrl: '' },
];

// ─── Health indicator colors ────────────────────────────────────────────────

function getHealthColor(provider: Provider): string {
  if (provider.latency > 0 && provider.isAvailable) return 'bg-success';
  if (provider.latency > 0 && !provider.isAvailable) return 'bg-error';
  return 'bg-warning'; // Unknown
}

function getHealthLabel(provider: Provider): string {
  if (provider.latency > 0 && provider.isAvailable) return 'Available';
  if (provider.latency > 0 && !provider.isAvailable) return 'Unavailable';
  return 'Unknown';
}

// ─── Component ──────────────────────────────────────────────────────────────

const SettingsPanel: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [_editingProvider, setEditingProvider] = useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormData>({
    name: '',
    type: 'openai',
    apiKey: '',
    baseUrl: '',
  });
  const [workspacePath, setWorkspacePath] = useState('');
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [importanceThreshold, setImportanceThreshold] = useState(3);
  const [autoSaveInterval, setAutoSaveInterval] = useState(30);
  const [appVersion, setAppVersion] = useState('');
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; latency: number }>>({});
  const [chatOptionsMap, setChatOptionsMap] = useState<Record<string, ChatOptions>>({});

  // Load providers on mount
  useEffect(() => {
    const loadProviders = async () => {
      setIsLoading(true);
      try {
        const result = await window.vibecode?.provider.list();
        if (result?.success && result.data?.providers) {
          setProviders(result.data.providers);
          // Load chat options for each provider
          const optionsMap: Record<string, ChatOptions> = {};
          for (const p of result.data.providers) {
            if (p.chatOptions) {
              optionsMap[p.id] = p.chatOptions;
            }
          }
          setChatOptionsMap(optionsMap);
        }
      } catch {
        // Providers not available
      } finally {
        setIsLoading(false);
      }
    };
    loadProviders();

    window.vibecode?.app.getVersion().then((v) => {
      if (v) setAppVersion(v);
    }).catch(() => {});
  }, []);

  const reloadProviders = useCallback(async () => {
    try {
      const result = await window.vibecode?.provider.list();
      if (result?.success && result.data?.providers) {
        setProviders(result.data.providers);
        const optionsMap: Record<string, ChatOptions> = {};
        for (const p of result.data.providers) {
          if (p.chatOptions) {
            optionsMap[p.id] = p.chatOptions;
          }
        }
        setChatOptionsMap(optionsMap);
      }
    } catch {
      // Reload failed
    }
  }, []);

  const handleAddProvider = useCallback(() => {
    setIsAddingProvider(true);
    setProviderForm({ name: '', type: 'openai', apiKey: '', baseUrl: '' });
  }, []);

  const handleSaveProvider = useCallback(async () => {
    try {
      const selectedType = PROVIDER_TYPES.find((t) => t.value === providerForm.type);
      await window.vibecode?.provider.configure({
        name: providerForm.name || selectedType?.label || providerForm.type,
        type: providerForm.type,
        apiKey: providerForm.apiKey || undefined,
        baseUrl: providerForm.baseUrl || selectedType?.defaultBaseUrl || undefined,
      });
      setIsAddingProvider(false);
      await reloadProviders();
    } catch {
      // Save failed
    }
  }, [providerForm, reloadProviders]);

  const handleTestProvider = useCallback(async (id: string) => {
    setIsTesting(id);
    try {
      const result = await window.vibecode?.provider.test(id);
      if (result?.data) {
        const { success, latency } = result.data;
        setTestResult((prev) => ({
          ...prev,
          [id]: { success, latency },
        }));
        await reloadProviders();
      }
    } catch {
      setTestResult((prev) => ({
        ...prev,
        [id]: { success: false, latency: 0 },
      }));
    } finally {
      setIsTesting(null);
    }
  }, [reloadProviders]);

  const handleRemoveProvider = useCallback(async (id: string) => {
    try {
      await window.vibecode?.provider.remove(id);
      await reloadProviders();
    } catch {
      // Remove failed
    }
  }, [reloadProviders]);

  const handleSetActive = useCallback(async (id: string) => {
    try {
      await window.vibecode?.provider.setActive(id);
      await reloadProviders();
    } catch {
      // Set active failed
    }
  }, [reloadProviders]);

  const handleSetFallback = useCallback(async (id: string) => {
    try {
      await window.vibecode?.provider.setFallback(id);
      await reloadProviders();
    } catch {
      // Set fallback failed
    }
  }, [reloadProviders]);

  const handleChatOptionChange = useCallback(async (providerId: string, updates: Partial<ChatOptions>) => {
    try {
      await window.vibecode?.provider.setChatOptions(providerId, updates);
      setChatOptionsMap((prev) => ({
        ...prev,
        [providerId]: { ...(prev[providerId] ?? { temperature: 0.7, maxTokens: 4096, streaming: true }), ...updates },
      }));
    } catch {
      // Update failed
    }
  }, []);

  const handleBrowseWorkspace = useCallback(async () => {
    try {
      await window.vibecode?.workspace.open('');
    } catch {
      // Browse not available
    }
  }, []);

  const getTypeLabel = (type: ProviderType): string => {
    return PROVIDER_TYPES.find((t) => t.value === type)?.label ?? type;
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-custom">
      <div className="space-y-4 p-4">
        {/* ---- Provider Configuration ---- */}
        <section>
          <SectionHeader title="AI Providers" />

          {isLoading ? (
            <div className="space-y-2">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={3} />
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => {
                const isExpanded = expandedProvider === provider.id;
                const chatOpts = chatOptionsMap[provider.id] ?? provider.chatOptions ?? { temperature: 0.7, maxTokens: 4096, streaming: true };
                const currentTestResult = testResult[provider.id];

                return (
                  <div key={provider.id} className="card">
                    {/* Provider Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Active indicator */}
                        <button
                          className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            provider.isActive
                              ? 'border-accent bg-accent/20'
                              : 'border-border hover:border-accent/50'
                          }`}
                          onClick={() => handleSetActive(provider.id)}
                          title={provider.isActive ? 'Active provider' : 'Set as active'}
                        >
                          {provider.isActive && (
                            <div className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </button>

                        {/* Health dot */}
                        <div
                          className={`h-2 w-2 rounded-full flex-shrink-0 ${getHealthColor(provider)}`}
                          title={getHealthLabel(provider)}
                        />

                        <span className="text-sm font-medium text-text-primary truncate">
                          {provider.name}
                        </span>
                        <span className="badge bg-bg-hover text-text-muted flex-shrink-0">
                          {getTypeLabel(provider.type)}
                        </span>
                        {provider.isFallback && (
                          <span className="badge bg-warning/20 text-warning flex-shrink-0">
                            Fallback
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Test button */}
                        <button
                          className="btn btn-ghost btn-sm rounded p-1"
                          onClick={() => handleTestProvider(provider.id)}
                          disabled={isTesting === provider.id}
                          title="Test connection"
                        >
                          {isTesting === provider.id ? (
                            <span className="spinner spinner-sm" />
                          ) : (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <circle cx="6" cy="6" r="4" />
                              <path d="M4.5 6l1.5 1.5L8 4.5" />
                            </svg>
                          )}
                        </button>
                        {/* Expand/collapse */}
                        <button
                          className="btn btn-ghost btn-sm rounded p-1"
                          onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                          title={isExpanded ? 'Collapse' : 'Expand settings'}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          >
                            <polyline points="3,5 6,8 9,5" />
                          </svg>
                        </button>
                        {/* Remove */}
                        <button
                          className="btn btn-ghost btn-sm rounded p-1 text-error hover:text-error/80"
                          onClick={() => handleRemoveProvider(provider.id)}
                          title="Remove provider"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M2 2l8 8M10 2l-8 8" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Test result */}
                    {(currentTestResult || provider.latency > 0) && (
                      <div className="mt-2 text-xs">
                        {(() => {
                          const result = currentTestResult ?? (provider.isAvailable
                            ? { success: true, latency: provider.latency }
                            : provider.latency > 0
                              ? { success: false, latency: provider.latency }
                              : null);
                          if (!result) return null;
                          return result.success ? (
                            <span className="text-success">
                              Connected ({result.latency}ms)
                            </span>
                          ) : (
                            <span className="text-error">Connection failed</span>
                          );
                        })()}
                      </div>
                    )}

                    {/* Models list */}
                    {provider.models.length > 0 && !isExpanded && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {provider.models.map((model) => (
                          <span
                            key={model.id}
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              chatOpts.model === model.id
                                ? 'bg-accent/20 text-accent'
                                : 'bg-bg-deep text-text-muted'
                            }`}
                          >
                            {model.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded configuration */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3 border-t border-border pt-3">
                        {/* Model Selection */}
                        {provider.models.length > 0 && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-text-secondary">
                              Default Model
                            </label>
                            <select
                              className="input text-xs w-full"
                              value={chatOpts.model ?? provider.models[0]?.id ?? ''}
                              onChange={(e) => handleChatOptionChange(provider.id, { model: e.target.value })}
                            >
                              {provider.models.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({(m.contextWindow / 1000).toFixed(0)}k ctx)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Temperature */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">
                            Temperature: {chatOpts.temperature.toFixed(1)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={chatOpts.temperature}
                            onChange={(e) => handleChatOptionChange(provider.id, { temperature: parseFloat(e.target.value) })}
                            className="w-full accent-accent"
                          />
                          <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                            <span>Precise</span>
                            <span>Creative</span>
                          </div>
                        </div>

                        {/* Max Tokens */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">
                            Max Tokens
                          </label>
                          <input
                            type="number"
                            className="input text-xs w-full"
                            value={chatOpts.maxTokens}
                            min={1}
                            max={200000}
                            step={256}
                            onChange={(e) => handleChatOptionChange(provider.id, { maxTokens: parseInt(e.target.value, 10) || 4096 })}
                          />
                        </div>

                        {/* Streaming Toggle */}
                        <Toggle
                          enabled={chatOpts.streaming}
                          onChange={(v) => handleChatOptionChange(provider.id, { streaming: v })}
                          label="Streaming"
                          description="Stream responses token-by-token"
                        />

                        {/* Fallback toggle */}
                        <Toggle
                          enabled={provider.isFallback ?? false}
                          onChange={() => handleSetFallback(provider.id)}
                          label="Fallback Provider"
                          description="Used when active provider fails"
                        />

                        {/* Base URL (for local/custom) */}
                        {(provider.type === 'ollama' || provider.type === 'lmstudio' || provider.type === 'custom') && (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-text-secondary">
                              Base URL
                            </label>
                            <input
                              type="text"
                              className="input text-xs w-full"
                              value={provider.baseUrl ?? ''}
                              readOnly
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Provider */}
              {isAddingProvider ? (
                <div className="card space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">
                      Provider Type
                    </label>
                    <select
                      className="input text-xs"
                      value={providerForm.type}
                      onChange={(e) => {
                        const type = e.target.value as ProviderType;
                        const selectedType = PROVIDER_TYPES.find((t) => t.value === type);
                        setProviderForm((prev) => ({
                          ...prev,
                          type,
                          name: prev.name || selectedType?.label || type,
                          baseUrl: prev.baseUrl || selectedType?.defaultBaseUrl || '',
                        }));
                      }}
                    >
                      {PROVIDER_TYPES.map((pt) => (
                        <option key={pt.value} value={pt.value}>
                          {pt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-secondary">
                      Name
                    </label>
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Provider name..."
                      value={providerForm.name}
                      onChange={(e) =>
                        setProviderForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>

                  {/* API Key (only for types that need it) */}
                  {(PROVIDER_TYPES.find((t) => t.value === providerForm.type)?.needsApiKey || providerForm.type === 'custom') && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-secondary">
                        API Key
                      </label>
                      <input
                        type="password"
                        className="input text-xs"
                        placeholder="sk-..."
                        value={providerForm.apiKey}
                        onChange={(e) =>
                          setProviderForm((prev) => ({ ...prev, apiKey: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  {/* Base URL for local/custom providers */}
                  {(providerForm.type === 'ollama' || providerForm.type === 'lmstudio' || providerForm.type === 'custom') && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-secondary">
                        Base URL
                      </label>
                      <input
                        type="text"
                        className="input text-xs"
                        placeholder="http://localhost:8080"
                        value={providerForm.baseUrl}
                        onChange={(e) =>
                          setProviderForm((prev) => ({ ...prev, baseUrl: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-primary btn-sm rounded-md"
                      onClick={handleSaveProvider}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-ghost btn-sm rounded-md"
                      onClick={() => setIsAddingProvider(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-secondary btn-sm w-full rounded-md"
                  onClick={handleAddProvider}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <line x1="6" y1="2" x2="6" y2="10" />
                    <line x1="2" y1="6" x2="10" y2="6" />
                  </svg>
                  Add Provider
                </button>
              )}
            </div>
          )}
        </section>

        <div className="divider" />

        {/* ---- Workspace ---- */}
        <section>
          <SectionHeader title="Workspace" />
          <div className="card">
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Default Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input text-xs flex-1"
                placeholder="/path/to/workspace"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
              />
              <button
                className="btn btn-secondary btn-sm rounded-md"
                onClick={handleBrowseWorkspace}
              >
                Browse
              </button>
            </div>
          </div>
        </section>

        <div className="divider" />

        {/* ---- Memory Settings ---- */}
        <section>
          <SectionHeader title="Memory" />
          <div className="space-y-3">
            <div className="card">
              <Toggle
                enabled={autoSummarize}
                onChange={setAutoSummarize}
                label="Auto-summarize"
                description="Automatically generate project summaries"
              />
            </div>

            <div className="card">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Importance Threshold
              </label>
              <p className="mb-2 text-xs text-text-muted">
                Only store memories above this importance level
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={importanceThreshold}
                  onChange={(e) => setImportanceThreshold(Number(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="text-xs text-text-secondary w-4">
                  {importanceThreshold}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="divider" />

        {/* ---- Session Settings ---- */}
        <section>
          <SectionHeader title="Session" />
          <div className="card">
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Auto-save Interval
            </label>
            <p className="mb-2 text-xs text-text-muted">
              How often to auto-save your session (seconds)
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="120"
                step="10"
                value={autoSaveInterval}
                onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="text-xs text-text-secondary w-8">
                {autoSaveInterval}s
              </span>
            </div>
          </div>
        </section>

        <div className="divider" />

        {/* ---- About ---- */}
        <section>
          <SectionHeader title="About" />
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-accent"
                >
                  <path d="M10 2L2 6l8 4 8-4-8-4z" />
                  <path d="M2 10l8 4 8-4" />
                  <path d="M2 14l8 4 8-4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">VibeCode Desktop</p>
                <p className="text-xs text-text-muted">
                  {appVersion ? `v${appVersion}` : 'Version unknown'}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-text-muted">
                AI-native desktop operating environment
              </p>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  Documentation
                </a>
                <a
                  href="#"
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  GitHub
                </a>
                <a
                  href="#"
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                  onClick={(e) => e.preventDefault()}
                >
                  Changelog
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPanel;
