import React, { useState, useCallback } from 'react';
import type { ProjectConfig, ProjectType, ExecutionMode, SafetyLevel, Provider, ProviderType } from '../types';

interface ProjectSetupViewProps {
  onLaunch: (config: ProjectConfig) => void;
  onBack: () => void;
}

const PROJECT_TYPES: { value: ProjectType; label: string; description: string; icon: string }[] = [
  { value: 'web-app', label: 'Web App', description: 'Full-stack web application', icon: '🌐' },
  { value: 'api-server', label: 'API Server', description: 'REST or GraphQL backend', icon: '🔗' },
  { value: 'cli-tool', label: 'CLI Tool', description: 'Command-line application', icon: '⚡' },
  { value: 'library', label: 'Library', description: 'Reusable package or SDK', icon: '📦' },
  { value: 'data-pipeline', label: 'Data Pipeline', description: 'ETL / data processing', icon: '🔄' },
  { value: 'custom', label: 'Custom', description: 'Custom project type', icon: '✦' },
];

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'lmstudio', label: 'LM Studio' },
  { value: 'custom', label: 'Custom' },
];

const EXECUTION_MODES: { value: ExecutionMode; label: string; description: string; safetyLevels: SafetyLevel[] }[] = [
  { value: 'assisted', label: 'Assisted', description: 'AI suggests, you approve every change', safetyLevels: ['high'] },
  { value: 'semi-autonomous', label: 'Semi-Autonomous', description: 'AI acts on safe changes, asks for risky ones', safetyLevels: ['medium', 'high'] },
  { value: 'autonomous', label: 'Autonomous', description: 'AI acts independently within safety bounds', safetyLevels: ['low', 'medium', 'high'] },
];

const SAFETY_LEVELS: { value: SafetyLevel; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Minimal restrictions, fast iteration' },
  { value: 'medium', label: 'Medium', description: 'Balanced safety, confirm destructive actions' },
  { value: 'high', label: 'High', description: 'Maximum safety, confirm all file changes' },
];

const STEPS = ['Project Type', 'AI Provider', 'Workspace', 'Execution', 'Objective', 'Review'];

const ProjectSetupView: React.FC<ProjectSetupViewProps> = ({ onLaunch, onBack }) => {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<ProjectConfig>({
    name: '',
    type: 'web-app',
    providerId: '',
    model: '',
    workspacePath: '',
    executionMode: 'assisted',
    safetyLevel: 'high',
    objective: '',
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [customEndpoint, setCustomEndpoint] = useState('');

  // Load providers on step 1
  React.useEffect(() => {
    if (step === 1) {
      const loadProviders = async () => {
        try {
          const result = await window.vibecode?.provider.list();
          if (result?.success && result.data?.providers) {
            setProviders(result.data!.providers);
            if (result.data!.providers.length > 0) {
              setConfig((prev) => ({
                ...prev,
                providerId: result.data!.providers[0].id,
                model: result.data!.providers[0].models[0]?.id || '',
              }));
            }
          }
        } catch {
          // Not available
        }
      };
      loadProviders();
    }
  }, [step]);

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return config.name.trim().length > 0;
      case 1: return config.providerId.length > 0 && config.model.length > 0;
      case 2: return config.workspacePath.length > 0;
      case 3: return true;
      case 4: return config.objective.trim().length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = useCallback(() => {
    if (step < 5) setStep(step + 1);
    else onLaunch(config);
  }, [step, config, onLaunch]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
    else onBack();
  }, [step, onBack]);

  const handleBrowseWorkspace = useCallback(async () => {
    try {
      const result = await window.vibecode?.workspace.open('');
      if (result?.success && result.data?.workspace) {
        setConfig((prev) => ({ ...prev, workspacePath: result.data!.workspace!.rootPath }));
      }
    } catch {
      // Browse not available
    }
  }, []);

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Project Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="my-awesome-project"
                value={config.name}
                onChange={(e) => setConfig((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Project Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PROJECT_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    className={`flex flex-col items-start p-3 rounded-md border text-left transition-all duration-150 ${
                      config.type === pt.value
                        ? 'border-accent bg-accent-glow text-text-primary'
                        : 'border-border bg-bg-elevated/50 text-text-secondary hover:bg-bg-hover hover:border-border-emphasis'
                    }`}
                    onClick={() => setConfig((p) => ({ ...p, type: pt.value }))}
                  >
                    <span className="text-base mb-1">{pt.icon}</span>
                    <span className="text-xs font-medium">{pt.label}</span>
                    <span className="text-[10px] text-text-muted mt-0.5">{pt.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                AI Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDER_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    className={`flex items-center gap-2 p-3 rounded-md border text-xs transition-all duration-150 ${
                      config.providerId === pt.value || (providers.length > 0 && providers.find(p => p.type === pt.value)?.id === config.providerId)
                        ? 'border-accent bg-accent-glow text-text-primary'
                        : 'border-border bg-bg-elevated/50 text-text-secondary hover:bg-bg-hover'
                    }`}
                    onClick={() => {
                      const found = providers.find(p => p.type === pt.value);
                      if (found) {
                        setConfig((p) => ({ ...p, providerId: found.id, model: found.models[0]?.id || '' }));
                      } else {
                        setConfig((p) => ({ ...p, providerId: pt.value, model: '' }));
                      }
                    }}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {providers.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Model
                </label>
                <select
                  className="input"
                  value={config.model}
                  onChange={(e) => setConfig((p) => ({ ...p, model: e.target.value }))}
                >
                  {providers.find(p => p.id === config.providerId)?.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  )) || <option value="">Select a model</option>}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Custom Endpoint (optional)
              </label>
              <input
                type="text"
                className="input input-mono"
                placeholder="https://api.example.com/v1"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Workspace Location
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-mono flex-1"
                  placeholder="/path/to/workspace"
                  value={config.workspacePath}
                  onChange={(e) => setConfig((p) => ({ ...p, workspacePath: e.target.value }))}
                />
                <button
                  className="btn btn-secondary rounded"
                  onClick={handleBrowseWorkspace}
                >
                  Browse
                </button>
              </div>
            </div>
            <p className="text-xs text-text-muted">
              Choose a directory where your project files will be created. VibeCode will use this as the workspace root.
            </p>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Execution Mode
              </label>
              <div className="space-y-2">
                {EXECUTION_MODES.map((em) => (
                  <button
                    key={em.value}
                    className={`w-full flex items-start gap-3 p-3 rounded-md border text-left transition-all duration-150 ${
                      config.executionMode === em.value
                        ? 'border-accent bg-accent-glow'
                        : 'border-border bg-bg-elevated/50 hover:bg-bg-hover'
                    }`}
                    onClick={() => setConfig((p) => ({ ...p, executionMode: em.value }))}
                  >
                    <div className={`w-3 h-3 mt-0.5 rounded-full border-2 flex-shrink-0 ${
                      config.executionMode === em.value ? 'border-accent bg-accent/30' : 'border-border'
                    }`}>
                      {config.executionMode === em.value && (
                        <div className="w-1.5 h-1.5 rounded-full bg-accent m-auto mt-[1px]" />
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-text-primary">{em.label}</span>
                      <p className="text-[10px] text-text-muted mt-0.5">{em.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Safety Level
              </label>
              <div className="flex gap-2">
                {SAFETY_LEVELS.map((sl) => (
                  <button
                    key={sl.value}
                    className={`flex-1 p-2 rounded-md border text-center transition-all duration-150 ${
                      config.safetyLevel === sl.value
                        ? 'border-accent bg-accent-glow'
                        : 'border-border bg-bg-elevated/50 hover:bg-bg-hover'
                    }`}
                    onClick={() => setConfig((p) => ({ ...p, safetyLevel: sl.value }))}
                  >
                    <span className="text-xs font-medium text-text-primary">{sl.label}</span>
                    <p className="text-[10px] text-text-muted mt-0.5">{sl.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Project Objective
              </label>
              <textarea
                className="input resize-none"
                rows={5}
                placeholder="Describe what you want to build... For example: 'Build a Next.js e-commerce app with product listing, cart, and checkout using Stripe'"
                value={config.objective}
                onChange={(e) => setConfig((p) => ({ ...p, objective: e.target.value }))}
                autoFocus
              />
            </div>
            <p className="text-xs text-text-muted">
              Be as specific as possible. The AI will use this objective to plan and execute the project.
            </p>
          </div>
        );

      case 5:
        return (
          <div className="space-y-3">
            <div className="card p-4 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Project Name</span>
                <span className="text-xs text-text-primary font-medium">{config.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Type</span>
                <span className="text-xs text-text-primary font-medium">{PROJECT_TYPES.find(t => t.value === config.type)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">AI Model</span>
                <span className="text-xs text-text-primary font-medium">{config.model || config.providerId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Workspace</span>
                <span className="text-xs text-text-primary font-medium font-mono truncate ml-4 max-w-[200px]">{config.workspacePath}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Execution</span>
                <span className="text-xs text-text-primary font-medium capitalize">{config.executionMode} ({config.safetyLevel} safety)</span>
              </div>
            </div>
            <div className="p-3 rounded-md bg-bg-elevated/50 border border-border">
              <span className="text-xs text-text-muted block mb-1">Objective</span>
              <p className="text-xs text-text-primary leading-relaxed">{config.objective}</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full bg-bg-deep">
      {/* Left: Step Progress */}
      <div className="w-[280px] flex-shrink-0 border-r border-border bg-bg-base flex flex-col">
        <div className="px-6 pt-8 pb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-1">New AI Project</h2>
          <p className="text-xs text-text-muted">Configure your project settings</p>
        </div>

        <div className="px-6 flex-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-3 mb-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium flex-shrink-0 transition-all duration-200 ${
                i < step
                  ? 'bg-accent text-white'
                  : i === step
                  ? 'bg-accent/20 text-accent border border-accent'
                  : 'bg-bg-elevated text-text-muted border border-border'
              }`}>
                {i < step ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs transition-colors ${
                i <= step ? 'text-text-primary font-medium' : 'text-text-muted'
              }`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={handleBack}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Right: Step Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-12">
        <div className="w-full max-w-lg animate-fade-in" key={step}>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            {STEPS[step]}
          </h3>
          <p className="text-xs text-text-muted mb-6">
            {step === 0 && 'Choose a name and type for your new project.'}
            {step === 1 && 'Select the AI provider and model to power your project.'}
            {step === 2 && 'Choose where your project files will live.'}
            {step === 3 && 'Control how the AI executes tasks in your project.'}
            {step === 4 && 'Describe what you want the AI to build.'}
            {step === 5 && 'Review your configuration before launching.'}
          </p>

          {renderStep()}

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={handleBack}
              className="btn btn-ghost text-xs"
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="btn btn-primary rounded-lg px-6"
            >
              {step === 5 ? 'Launch Project' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSetupView;
