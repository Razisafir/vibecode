import React, { useState, useCallback } from 'react';
import type { ProviderType } from '../types';
import Toggle from './ui/Toggle';

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  gradient: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to VibeCode',
    description:
      'Your calm, intelligent engineering partner. Build with confidence — VibeCode understands your code, suggests changes, and lets you review everything before it happens.',
    gradient: 'from-accent/30 via-bg-tertiary to-bg-secondary',
  },
  {
    id: 'provider',
    title: 'Connect Your AI Provider',
    description:
      'Connect your AI provider to get started. Your key is stored securely on your device — never sent to our servers.',
    gradient: 'from-success/20 via-bg-tertiary to-bg-secondary',
  },
  {
    id: 'model',
    title: 'Configure Model Settings',
    description:
      'Select a default model and adjust settings for your provider. You can always change these later in Settings.',
    gradient: 'from-info/20 via-bg-tertiary to-bg-secondary',
  },
  {
    id: 'workspace',
    title: 'Set Up Your Workspace',
    description:
      'Choose a directory for your projects. VibeCode will analyze your codebase, remember decisions, and provide context-aware assistance.',
    gradient: 'from-accent/20 via-bg-tertiary to-bg-secondary',
  },
  {
    id: 'ready',
    title: "You're All Set!",
    description:
      'You are ready to build. Ask the AI assistant anything, open a project, or explore the workspace. Remember — you can always undo changes.',
    gradient: 'from-accent/30 via-success/20 to-bg-secondary',
  },
];

interface ProviderOption {
  type: ProviderType;
  label: string;
  description: string;
  needsApiKey: boolean;
  placeholder: string;
  defaultBaseUrl: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    type: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, o1, and more',
    needsApiKey: true,
    placeholder: 'sk-...',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    type: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Sonnet 4, Haiku',
    needsApiKey: true,
    placeholder: 'sk-ant-...',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
  },
  {
    type: 'google',
    label: 'Google',
    description: 'Gemini 2.0 Flash, 2.5 Pro',
    needsApiKey: true,
    placeholder: 'AIza...',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  {
    type: 'ollama',
    label: 'Ollama',
    description: 'Run local models like Llama, CodeLlama',
    needsApiKey: false,
    placeholder: '',
    defaultBaseUrl: 'http://localhost:11434/api',
  },
  {
    type: 'lmstudio',
    label: 'LM Studio',
    description: 'Run local models with OpenAI-compatible API',
    needsApiKey: false,
    placeholder: '',
    defaultBaseUrl: 'http://localhost:1234/v1',
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [providerType, setProviderType] = useState<ProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [streaming, setStreaming] = useState(true);
  const [skipProvider, setSkipProvider] = useState(false);

  const step = STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === STEPS.length - 1;
  const isProviderStep = currentStep === 1;
  const isModelStep = currentStep === 2;
  const isWorkspaceStep = currentStep === 3;

  const selectedProviderOption = PROVIDER_OPTIONS.find((p) => p.type === providerType);

  const handleNext = useCallback(async () => {
    // Validate provider step
    if (isProviderStep && !skipProvider && apiKey.trim()) {
      setIsValidating(true);
      setValidationError('');
      try {
        const result = await window.vibecode?.provider.configure({
          name: selectedProviderOption?.label ?? providerType,
          type: providerType,
          apiKey: apiKey.trim() || undefined,
          baseUrl: customBaseUrl.trim() || selectedProviderOption?.defaultBaseUrl || undefined,
        });
        if (result && !result.success) {
          setValidationError('Failed to configure provider. Please check your API key.');
          setIsValidating(false);
          return;
        }
      } catch {
        // In dev without full backend, allow continuing
      }
      setIsValidating(false);
    }

    // Skip model step if provider setup was skipped
    if (isProviderStep && skipProvider) {
      // Skip to workspace step
      setCurrentStep(3);
      return;
    }

    // Validate workspace step
    if (isWorkspaceStep && workspacePath.trim()) {
      try {
        const stat = await window.vibecode?.fs.stat(workspacePath.trim());
        if (stat && !stat.success) {
          setValidationError('Directory does not exist. Please enter a valid path.');
          return;
        }
        await window.vibecode?.workspace.open(workspacePath.trim());
      } catch {
        // In dev without full backend, allow continuing
      }
    }

    if (isModelStep && !skipProvider) {
      // Save model/chat options
      try {
        const listResult = await window.vibecode?.provider.list();
        if (listResult?.success && listResult.data?.providers?.length) {
          const latestProvider = listResult.data.providers[listResult.data.providers.length - 1];
          if (latestProvider) {
            await window.vibecode?.provider.setChatOptions(latestProvider.id, {
              temperature,
              maxTokens,
              streaming,
              model: selectedModel || undefined,
            });
            await window.vibecode?.provider.setActive(latestProvider.id);
          }
        }
      } catch {
        // Best-effort
      }
    }

    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, isProviderStep, isModelStep, isWorkspaceStep, isLastStep, apiKey, providerType, customBaseUrl, workspacePath, selectedProviderOption, skipProvider, selectedModel, temperature, maxTokens, streaming, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleBrowseWorkspace = useCallback(async () => {
    try {
      await window.vibecode?.workspace.open('');
    } catch {
      // Fallback: user can type path manually
    }
  }, []);

  const renderStepContent = () => {
    if (isProviderStep) {
      return (
        <div className="space-y-4">
          {/* Skip provider option */}
          <div className="rounded-lg bg-bg-base px-3 py-2">
            <Toggle
              enabled={skipProvider}
              onChange={setSkipProvider}
              label="Skip provider setup"
              description="Configure later in Settings"
            />
          </div>

          {!skipProvider && (
            <>
              {/* Provider selection grid */}
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                      providerType === option.type
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-bg-base text-text-secondary hover:border-accent/50'
                    }`}
                    onClick={() => {
                      setProviderType(option.type);
                      setCustomBaseUrl('');
                      setValidationError('');
                    }}
                  >
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="block text-xs opacity-70 mt-0.5">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              {/* API Key input (conditional) */}
              {selectedProviderOption?.needsApiKey && (
                <div>
                  <label
                    htmlFor="api-key"
                    className="mb-1.5 block text-xs font-medium text-text-secondary"
                  >
                    API Key
                  </label>
                  <input
                    id="api-key"
                    type="password"
                    className="input"
                    placeholder={selectedProviderOption.placeholder}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setValidationError('');
                    }}
                  />
                  <p className="mt-1.5 text-xs text-text-muted">
                    Your key is stored locally with obfuscation and never sent to our servers.
                  </p>
                </div>
              )}

              {/* Base URL for local providers */}
              {(providerType === 'ollama' || providerType === 'lmstudio' || providerType === 'custom') && (
                <div>
                  <label
                    htmlFor="base-url"
                    className="mb-1.5 block text-xs font-medium text-text-secondary"
                  >
                    Base URL
                  </label>
                  <input
                    id="base-url"
                    type="text"
                    className="input"
                    placeholder={selectedProviderOption?.defaultBaseUrl ?? 'http://localhost:8080'}
                    value={customBaseUrl}
                    onChange={(e) => {
                      setCustomBaseUrl(e.target.value);
                      setValidationError('');
                    }}
                  />
                </div>
              )}

              {validationError && (
                <p className="text-xs text-error">{validationError}</p>
              )}
            </>
          )}
        </div>
      );
    }

    if (isModelStep) {
      return (
        <div className="space-y-4">
          {/* Model selection would be populated from provider models */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Default Model
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g., gpt-4o, claude-sonnet-4-20250514"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            />
            <p className="mt-1 text-xs text-text-muted">
              Leave blank to use the provider default
            </p>
          </div>

          {/* Temperature */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Temperature: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>Precise (0)</span>
              <span>Creative (2)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Max Tokens
            </label>
            <input
              type="number"
              className="input"
              value={maxTokens}
              min={1}
              max={200000}
              step={256}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 4096)}
            />
          </div>

          {/* Streaming */}
          <Toggle
            enabled={streaming}
            onChange={setStreaming}
            label="Streaming"
            description="Stream responses token-by-token"
          />

          {validationError && (
            <p className="text-xs text-error">{validationError}</p>
          )}
        </div>
      );
    }

    if (isWorkspaceStep) {
      return (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="workspace-path"
              className="mb-1.5 block text-xs font-medium text-text-secondary"
            >
              Workspace Directory
            </label>
            <div className="flex gap-2">
              <input
                id="workspace-path"
                type="text"
                className="input flex-1"
                placeholder="/path/to/your/project"
                value={workspacePath}
                onChange={(e) => {
                  setWorkspacePath(e.target.value);
                  setValidationError('');
                }}
              />
              <button
                className="btn btn-secondary rounded-lg"
                onClick={handleBrowseWorkspace}
              >
                Browse
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Choose an existing project or create a new directory.
            </p>
          </div>
          {validationError && (
            <p className="text-xs text-error">{validationError}</p>
          )}
        </div>
      );
    }

    if (isLastStep) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Here are some ways to get started:
          </p>
          <div className="space-y-2">
            {[
              'Open a project and start coding',
              'Ask the AI to help with anything',
              'Use Cmd+K for quick actions',
              'All changes can be undone — experiment freely',
            ].map((suggestion) => (
              <div
                key={suggestion}
                className="flex items-center gap-2 rounded-md bg-bg-base px-3 py-2 text-sm text-text-secondary"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="flex-shrink-0 text-accent"
                >
                  <polyline points="2,7 5.5,10.5 12,3.5" />
                </svg>
                {suggestion}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {/* Illustration Area */}
        <div
          className={`onboarding-illustration bg-gradient-to-br ${step.gradient}`}
        >
          {/* Abstract decoration */}
          <div className="absolute inset-0 opacity-20">
            <div
              className="absolute left-1/4 top-1/4 h-32 w-32 rounded-full border border-accent/40"
              style={{ animation: 'spin 20s linear infinite' }}
            />
            <div
              className="absolute right-1/4 bottom-1/4 h-24 w-24 rounded-full border border-success/40"
              style={{ animation: 'spin 15s linear infinite reverse' }}
            />
          </div>

          {/* Center Icon */}
          <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-bg-elevated/80 shadow-lg backdrop-blur-sm">
            {currentStep === 0 && (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
              >
                <path d="M20 4L4 12l16 8 16-8-16-8z" />
                <path d="M4 20l16 8 16-8" />
                <path d="M4 28l16 8 16-8" />
              </svg>
            )}
            {currentStep === 1 && (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-success"
              >
                <path d="M20 4a16 16 0 100 32 16 16 0 000-32z" />
                <path d="M14 20l4 4 8-8" />
              </svg>
            )}
            {currentStep === 2 && (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-info"
              >
                <rect x="6" y="6" width="28" height="28" rx="4" />
                <path d="M14 16h12M14 20h8M14 24h10" />
              </svg>
            )}
            {currentStep === 3 && (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
              >
                <path d="M6 6h10l3 3h15a2 2 0 012 2v20a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" />
              </svg>
            )}
            {currentStep === 4 && (
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
              >
                <circle cx="20" cy="20" r="16" />
                <path d="M12 20l6 6 12-12" />
              </svg>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-4 pt-6">
          <h2 className="mb-2 text-xl font-semibold text-text-primary">
            {step.title}
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-text-secondary">
            {step.description}
          </p>

          {/* Step-specific content */}
          {renderStepContent()}
        </div>

        {/* Progress Dots & Actions */}
        <div className="border-t border-border px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Trust message + Skip */}
            <div className="flex items-center gap-3">
              <p className="text-2xs text-text-muted mr-auto">
                Your data stays on your device
              </p>
            </div>

            <button
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              onClick={onSkip}
            >
              Skip setup
            </button>

            {/* Progress Dots */}
            <div className="onboarding-progress">
              {STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`onboarding-dot ${
                    index === currentStep
                      ? 'active'
                      : index < currentStep
                        ? 'completed'
                        : ''
                  }`}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  className="btn btn-secondary btn-sm rounded-md"
                  onClick={handleBack}
                >
                  Back
                </button>
              )}
              <button
                className="btn btn-primary btn-sm rounded-md"
                onClick={handleNext}
                disabled={isValidating}
              >
                {isValidating ? (
                  <span className="spinner spinner-sm" />
                ) : isLastStep ? (
                  'Get Started'
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
