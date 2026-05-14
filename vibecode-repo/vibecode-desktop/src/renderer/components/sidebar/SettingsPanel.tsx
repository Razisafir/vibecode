import React, { useState, useEffect, useCallback } from 'react';
import type { Provider, ProviderType } from '../../types';

interface ProviderFormData {
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
}

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'local', label: 'Local' },
  { value: 'custom', label: 'Custom' },
];

const SettingsPanel: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = useState(false);
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

  // Load providers on mount
  useEffect(() => {
    const loadProviders = async () => {
      setIsLoading(true);
      try {
        const result = await window.vibecode?.provider.list();
        if (result) {
          setProviders(result);
        }
      } catch {
        // Providers not available
      } finally {
        setIsLoading(false);
      }
    };
    loadProviders();

    // Get app version
    window.vibecode?.app.getVersion().then((v) => {
      if (v) setAppVersion(v);
    }).catch(() => {});
  }, []);

  const handleAddProvider = useCallback(() => {
    setIsAddingProvider(true);
    setProviderForm({ name: '', type: 'openai', apiKey: '', baseUrl: '' });
  }, []);

  const handleSaveProvider = useCallback(async () => {
    try {
      await window.vibecode?.provider.configure({
        name: providerForm.name,
        type: providerForm.type,
        apiKey: providerForm.apiKey || undefined,
        baseUrl: providerForm.baseUrl || undefined,
      });
      setIsAddingProvider(false);
      // Reload providers
      const result = await window.vibecode?.provider.list();
      if (result) setProviders(result);
    } catch {
      // Save failed
    }
  }, [providerForm]);

  const handleTestProvider = useCallback(async (id: string) => {
    setIsTesting(id);
    try {
      const result = await window.vibecode?.provider.test(id);
      if (result) {
        setTestResult((prev) => ({
          ...prev,
          [id]: { success: result.success, latency: result.latency },
        }));
      }
    } catch {
      setTestResult((prev) => ({
        ...prev,
        [id]: { success: false, latency: 0 },
      }));
    } finally {
      setIsTesting(null);
    }
  }, []);

  const handleBrowseWorkspace = useCallback(async () => {
    try {
      await window.vibecode?.workspace.open('');
    } catch {
      // Browse not available
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-custom">
      <div className="space-y-4 p-4">
        {/* ---- Provider Configuration ---- */}
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            AI Providers
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <span className="spinner" />
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          provider.isAvailable ? 'bg-success' : 'bg-error'
                        }`}
                      />
                      <span className="text-sm font-medium text-text-primary">
                        {provider.name}
                      </span>
                      <span className="badge bg-bg-hover text-text-muted">
                        {provider.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
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
                      <button
                        className="btn btn-ghost btn-sm rounded p-1"
                        onClick={() => setEditingProvider(provider.id)}
                        title="Edit provider"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M8.5 1.5l2 2L4 10H2v-2l6.5-6.5z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Test result */}
                  {testResult[provider.id] && (
                    <div className="mt-2 text-xs">
                      {testResult[provider.id].success ? (
                        <span className="text-success">
                          Connected ({testResult[provider.id].latency}ms)
                        </span>
                      ) : (
                        <span className="text-error">Connection failed</span>
                      )}
                    </div>
                  )}

                  {/* Models list */}
                  {provider.models.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {provider.models.map((model) => (
                        <span
                          key={model.id}
                          className="rounded bg-bg-primary px-1.5 py-0.5 text-[10px] text-text-muted"
                        >
                          {model.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

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
                      onChange={(e) =>
                        setProviderForm((prev) => ({
                          ...prev,
                          type: e.target.value as ProviderType,
                          name:
                            PROVIDER_TYPES.find((t) => t.value === e.target.value)
                              ?.label || prev.name,
                        }))
                      }
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

                  {providerForm.type === 'custom' || providerForm.type === 'local' ? (
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
                  ) : null}

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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Workspace
          </h3>
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Memory
          </h3>
          <div className="space-y-3">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Auto-summarize</p>
                  <p className="text-xs text-text-muted">
                    Automatically generate project summaries
                  </p>
                </div>
                <button
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    autoSummarize ? 'bg-accent' : 'bg-border'
                  }`}
                  onClick={() => setAutoSummarize(!autoSummarize)}
                  role="switch"
                  aria-checked={autoSummarize}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      autoSummarize ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Session
          </h3>
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            About
          </h3>
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
