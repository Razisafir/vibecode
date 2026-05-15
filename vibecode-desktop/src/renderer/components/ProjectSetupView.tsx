import React, { useState, useCallback, useEffect } from 'react';
import type {
  ProjectConfig, ProjectType, ExecutionMode, SafetyLevel,
  Provider, ProviderType, WizardStep, AIProjectObjective,
  ArchitecturePlan, TechStackItem, FileStructureNode,
  ExecutionRoadmap, ExecutionPhase,
} from '../types';
import { WIZARD_STEPS } from '../types';

// ─── Props ──────────────────────────────────────────────────────────────────

interface ProjectSetupViewProps {
  onLaunch: (config: ProjectConfig) => void;
  onBack: () => void;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const PROJECT_TYPES: { value: ProjectType; label: string; description: string; icon: string; gradient: string }[] = [
  { value: 'web-app', label: 'Web App', description: 'Full-stack web application with modern framework', icon: '▲', gradient: 'from-indigo-500 to-purple-500' },
  { value: 'api-server', label: 'API Server', description: 'RESTful or GraphQL backend service', icon: '◆', gradient: 'from-emerald-500 to-teal-500' },
  { value: 'cli-tool', label: 'CLI Tool', description: 'Command-line application or utility', icon: '▶', gradient: 'from-amber-500 to-orange-500' },
  { value: 'library', label: 'Library', description: 'Reusable package or SDK', icon: '■', gradient: 'from-pink-500 to-rose-500' },
  { value: 'data-pipeline', label: 'Data Pipeline', description: 'ETL, processing, or automation', icon: '⟳', gradient: 'from-cyan-500 to-blue-500' },
  { value: 'custom', label: 'Custom', description: 'Define your own project type', icon: '✦', gradient: 'from-violet-500 to-fuchsia-500' },
];

const PROVIDER_TYPES: { value: ProviderType; label: string; description: string; icon: string }[] = [
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o, GPT-4, o1, o3', icon: '○' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude 3.5 Sonnet, Haiku, Opus', icon: '△' },
  { value: 'google', label: 'Gemini', description: 'Gemini 2.0 Pro, Flash', icon: '◇' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Unified API for 200+ models', icon: '⬡' },
  { value: 'groq', label: 'Groq', description: 'Ultra-fast LPU inference', icon: '⚡' },
  { value: 'deepseek', label: 'DeepSeek', description: 'DeepSeek V3, Coder', icon: '⊛' },
  { value: 'ollama', label: 'Ollama', description: 'Local models on your machine', icon: '◎' },
  { value: 'lmstudio', label: 'LM Studio', description: 'Local model playground', icon: '⊙' },
  { value: 'custom', label: 'Custom', description: 'Any OpenAI-compatible endpoint', icon: '⚙' },
];

const EXECUTION_MODES: { value: ExecutionMode; label: string; description: string; detail: string; safetyLevels: SafetyLevel[] }[] = [
  { value: 'assisted', label: 'Assisted', description: 'AI suggests, you approve every change', detail: 'Full control, step-by-step confirmation', safetyLevels: ['high'] },
  { value: 'semi-autonomous', label: 'Semi-Autonomous', description: 'AI acts on safe changes, asks for risky ones', detail: 'Best balance of speed and safety', safetyLevels: ['medium', 'high'] },
  { value: 'autonomous', label: 'Autonomous', description: 'AI acts independently within safety bounds', detail: 'Fastest execution, safety guardrails active', safetyLevels: ['low', 'medium', 'high'] },
];

const SAFETY_LEVELS: { value: SafetyLevel; label: string; description: string; icon: string }[] = [
  { value: 'low', label: 'Low', description: 'Minimal restrictions, fast iteration', icon: '▸' },
  { value: 'medium', label: 'Medium', description: 'Balanced safety, confirm destructive actions', icon: '◆' },
  { value: 'high', label: 'High', description: 'Maximum safety, confirm all changes', icon: '■' },
];

// ─── Sub-Components ──────────────────────────────────────────────────────────

const StepIndicator: React.FC<{
  steps: typeof WIZARD_STEPS;
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  onStepClick: (step: WizardStep) => void;
}> = ({ steps, currentStep, completedSteps, onStepClick }) => {
  const currentIndex = steps.findIndex(s => s.id === currentStep);
  return (
    <div className="flex flex-col gap-0.5">
      {steps.map((step, i) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        const isAccessible = i <= currentIndex || isCompleted;
        return (
          <button
            key={step.id}
            onClick={() => isAccessible && onStepClick(step.id)}
            disabled={!isAccessible}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
              isCurrent
                ? 'bg-accent/10 text-text-primary'
                : isCompleted
                ? 'text-text-secondary hover:bg-bg-hover'
                : 'text-text-muted'
            }`}
          >
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold flex-shrink-0 transition-all duration-300 ${
              isCompleted
                ? 'bg-success/20 text-success'
                : isCurrent
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-bg-elevated text-text-muted border border-border'
            }`}>
              {isCompleted ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <div className="min-w-0">
              <div className={`text-xs font-medium ${isCurrent ? 'text-text-primary' : ''}`}>{step.label}</div>
              <div className="text-[10px] text-text-muted truncate">{step.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ─── Step Renderers ──────────────────────────────────────────────────────────

const ProjectTypeStep: React.FC<{
  config: ProjectConfig;
  onChange: (updates: Partial<ProjectConfig>) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-5 animate-fade-in">
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Project Name</label>
      <input
        type="text"
        className="input text-sm"
        placeholder="my-awesome-project"
        value={config.name}
        onChange={(e) => onChange({ name: e.target.value })}
        autoFocus
      />
    </div>
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-3">Project Type</label>
      <div className="grid grid-cols-3 gap-2.5">
        {PROJECT_TYPES.map((pt) => (
          <button
            key={pt.value}
            className={`group flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 ${
              config.type === pt.value
                ? 'border-accent bg-accent/8 shadow-glow'
                : 'border-border bg-bg-elevated/30 hover:bg-bg-elevated/70 hover:border-border-emphasis'
            }`}
            onClick={() => onChange({ type: pt.value })}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg mb-2.5 text-base bg-gradient-to-br ${pt.gradient} bg-clip-text`}
              style={{ color: 'transparent', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
            >
              <span style={{ color: 'inherit', WebkitTextFillColor: 'inherit' }}>{pt.icon}</span>
            </div>
            <span className="text-xs font-semibold text-text-primary mb-0.5">{pt.label}</span>
            <span className="text-[10px] text-text-muted leading-relaxed">{pt.description}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const ObjectiveStep: React.FC<{
  config: ProjectConfig;
  objective: AIProjectObjective;
  onConfigChange: (updates: Partial<ProjectConfig>) => void;
  onObjectiveChange: (updates: Partial<AIProjectObjective>) => void;
}> = ({ config, objective, onConfigChange, onObjectiveChange }) => (
  <div className="space-y-5 animate-fade-in">
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Project Objective</label>
      <textarea
        className="input resize-none text-sm"
        rows={4}
        placeholder="Describe what you want to build in detail... For example: 'Build a Next.js 14 e-commerce app with product listing, cart, checkout with Stripe, and admin dashboard'"
        value={config.objective}
        onChange={(e) => onConfigChange({ objective: e.target.value })}
        autoFocus
      />
    </div>
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Key Requirements</label>
      <textarea
        className="input resize-none text-xs"
        rows={3}
        placeholder="One requirement per line:&#10;- User authentication&#10;- Real-time notifications&#10;- Mobile responsive"
        value={objective.requirements.join('\n')}
        onChange={(e) => onObjectiveChange({ requirements: e.target.value.split('\n').filter(Boolean) })}
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-2">Constraints</label>
        <textarea
          className="input resize-none text-xs"
          rows={2}
          placeholder="Must use PostgreSQL&#10;Budget-conscious"
          value={objective.constraints.join('\n')}
          onChange={(e) => onObjectiveChange({ constraints: e.target.value.split('\n').filter(Boolean) })}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-2">Tech Preferences</label>
        <textarea
          className="input resize-none text-xs"
          rows={2}
          placeholder="Next.js, Tailwind, Prisma"
          value={objective.techPreferences.join('\n')}
          onChange={(e) => onObjectiveChange({ techPreferences: e.target.value.split('\n').filter(Boolean) })}
        />
      </div>
    </div>
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Priority</label>
      <div className="flex gap-2">
        {(['speed', 'quality', 'simplicity'] as const).map((p) => (
          <button
            key={p}
            className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-all duration-150 ${
              objective.priority === p
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-elevated/30 text-text-secondary hover:bg-bg-hover'
            }`}
            onClick={() => onObjectiveChange({ priority: p })}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  </div>
);

const ArchitectureStep: React.FC<{
  architecture: ArchitecturePlan | null;
  isGenerating: boolean;
  onGenerate: () => void;
}> = ({ architecture, isGenerating, onGenerate }) => (
  <div className="space-y-4 animate-fade-in">
    {!architecture && !isGenerating && (
      <div className="flex flex-col items-center py-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 mb-4">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-accent">
            <rect x="3" y="3" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="16" y="3" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3" y="16" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="16" y="16" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <h4 className="text-sm font-semibold text-text-primary mb-1">AI Architecture Planning</h4>
        <p className="text-xs text-text-muted mb-4 max-w-sm text-center">
          Let the AI analyze your objective and design the optimal architecture, tech stack, and file structure.
        </p>
        <button
          className="btn btn-primary rounded-lg px-6"
          onClick={onGenerate}
        >
          Generate Architecture
        </button>
      </div>
    )}
    {isGenerating && (
      <div className="flex flex-col items-center py-8 animate-fade-in">
        <div className="spinner spinner-lg mb-4" />
        <h4 className="text-sm font-semibold text-text-primary mb-1">Planning Architecture...</h4>
        <p className="text-xs text-text-muted">AI is analyzing your requirements and designing the optimal structure</p>
      </div>
    )}
    {architecture && (
      <div className="space-y-4 animate-fade-in">
        <div className="p-3 rounded-lg border border-accent/20 bg-accent/5">
          <h4 className="text-xs font-semibold text-accent mb-1">{architecture.title}</h4>
          <p className="text-[11px] text-text-secondary leading-relaxed">{architecture.description}</p>
        </div>
        <div>
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Tech Stack</h5>
          <div className="flex flex-wrap gap-1.5">
            {architecture.techStack.map((item, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-elevated border border-border text-[10px] text-text-secondary">
                <span className="font-medium">{item.name}</span>
                <span className="text-text-muted">{item.category}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">File Structure</h5>
          <div className="p-2 rounded-md bg-bg-deep border border-border font-mono text-[11px] text-text-secondary max-h-40 overflow-y-auto">
            {renderFileTree(architecture.fileStructure, 0)}
          </div>
        </div>
        <div className="p-2.5 rounded-md bg-bg-elevated/50 border border-border">
          <h5 className="text-[10px] font-semibold text-text-muted mb-1">AI Reasoning</h5>
          <p className="text-[11px] text-text-secondary leading-relaxed">{architecture.reasoning}</p>
        </div>
      </div>
    )}
  </div>
);

const renderFileTree = (nodes: FileStructureNode[], depth: number): React.ReactNode[] => {
  const result: React.ReactNode[] = [];
  for (const node of nodes) {
    const indent = '  '.repeat(depth);
    if (node.type === 'directory') {
      result.push(
        <div key={node.name + depth} className="text-accent/70">
          {indent}📁 {node.name}/
        </div>
      );
      if (node.children) {
        result.push(...renderFileTree(node.children, depth + 1));
      }
    } else {
      result.push(
        <div key={node.name + depth} className="text-text-secondary">
          {indent}📄 {node.name}
        </div>
      );
    }
  }
  return result;
};

const ProviderStep: React.FC<{
  config: ProjectConfig;
  providers: Provider[];
  customEndpoint: string;
  customApiKey: string;
  onConfigChange: (updates: Partial<ProjectConfig>) => void;
  onCustomEndpointChange: (v: string) => void;
  onCustomApiKeyChange: (v: string) => void;
}> = ({ config, providers, customEndpoint, customApiKey, onConfigChange, onCustomEndpointChange, onCustomApiKeyChange }) => (
  <div className="space-y-4 animate-fade-in">
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-3">AI Provider</label>
      <div className="grid grid-cols-3 gap-2">
        {PROVIDER_TYPES.map((pt) => {
          const isConfigured = providers.some(p => p.type === pt.value && p.isAvailable);
          return (
            <button
              key={pt.value}
              className={`group flex flex-col items-start p-3 rounded-lg border text-left transition-all duration-200 ${
                config.providerId === pt.value || (providers.length > 0 && providers.find(p => p.type === pt.value)?.id === config.providerId)
                  ? 'border-accent bg-accent/8'
                  : 'border-border bg-bg-elevated/30 hover:bg-bg-elevated/70 hover:border-border-emphasis'
              }`}
              onClick={() => {
                const found = providers.find(p => p.type === pt.value);
                if (found) {
                  onConfigChange({ providerId: found.id, model: found.models[0]?.id || '' });
                } else {
                  onConfigChange({ providerId: pt.value, model: '' });
                }
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{pt.icon}</span>
                <span className="text-xs font-semibold text-text-primary">{pt.label}</span>
                {isConfigured && (
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                )}
              </div>
              <span className="text-[10px] text-text-muted leading-relaxed">{pt.description}</span>
            </button>
          );
        })}
      </div>
    </div>
    {providers.length > 0 && (
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-2">Model</label>
        <select
          className="input text-sm"
          value={config.model}
          onChange={(e) => onConfigChange({ model: e.target.value })}
        >
          {providers.find(p => p.id === config.providerId)?.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          )) || <option value="">Select a model</option>}
        </select>
      </div>
    )}
    {config.providerId === 'custom' && (
      <div className="space-y-3 p-3 rounded-lg border border-border bg-bg-elevated/30">
        <div>
          <label className="block text-[10px] font-medium text-text-muted mb-1">Custom Endpoint URL</label>
          <input
            type="text"
            className="input input-mono text-xs"
            placeholder="https://api.example.com/v1"
            value={customEndpoint}
            onChange={(e) => onCustomEndpointChange(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-text-muted mb-1">API Key</label>
          <input
            type="password"
            className="input input-mono text-xs"
            placeholder="sk-..."
            value={customApiKey}
            onChange={(e) => onCustomApiKeyChange(e.target.value)}
          />
        </div>
      </div>
    )}
    <p className="text-[10px] text-text-muted leading-relaxed">
      VibeCode is BYOI — Bring Your Own Intelligence. Plug in any API key, add any OpenAI-compatible endpoint, or run local models. Provider compatibility is always free.
    </p>
  </div>
);

const WorkspaceStep: React.FC<{
  config: ProjectConfig;
  onChange: (updates: Partial<ProjectConfig>) => void;
  onBrowse: () => void;
}> = ({ config, onChange, onBrowse }) => (
  <div className="space-y-4 animate-fade-in">
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Workspace Location</label>
      <div className="flex gap-2">
        <input
          type="text"
          className="input input-mono flex-1 text-xs"
          placeholder="/path/to/workspace"
          value={config.workspacePath}
          onChange={(e) => onChange({ workspacePath: e.target.value })}
        />
        <button className="btn btn-secondary rounded-lg" onClick={onBrowse}>Browse</button>
      </div>
    </div>
    <p className="text-[10px] text-text-muted leading-relaxed">
      Choose a directory where your project files will be created. VibeCode will use this as the workspace root for all file operations and AI execution.
    </p>
  </div>
);

const ExecutionModeStep: React.FC<{
  config: ProjectConfig;
  onChange: (updates: Partial<ProjectConfig>) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4 animate-fade-in">
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-3">Execution Mode</label>
      <div className="space-y-2">
        {EXECUTION_MODES.map((em) => (
          <button
            key={em.value}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 ${
              config.executionMode === em.value
                ? 'border-accent bg-accent/8 shadow-glow'
                : 'border-border bg-bg-elevated/30 hover:bg-bg-elevated/70 hover:border-border-emphasis'
            }`}
            onClick={() => onChange({ executionMode: em.value })}
          >
            <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
              config.executionMode === em.value ? 'border-accent' : 'border-border'
            }`}>
              {config.executionMode === em.value && <div className="w-2 h-2 rounded-full bg-accent" />}
            </div>
            <div>
              <div className="text-xs font-semibold text-text-primary mb-0.5">{em.label}</div>
              <div className="text-[11px] text-text-secondary mb-1">{em.description}</div>
              <div className="text-[10px] text-text-muted">{em.detail}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-2">Safety Level</label>
      <div className="flex gap-2">
        {SAFETY_LEVELS.map((sl) => (
          <button
            key={sl.value}
            className={`flex-1 p-3 rounded-lg border text-center transition-all duration-150 ${
              config.safetyLevel === sl.value
                ? 'border-accent bg-accent/10 text-text-primary'
                : 'border-border bg-bg-elevated/30 text-text-secondary hover:bg-bg-hover'
            }`}
            onClick={() => onChange({ safetyLevel: sl.value })}
          >
            <span className="text-xs font-medium">{sl.label}</span>
            <p className="text-[10px] text-text-muted mt-0.5">{sl.description}</p>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const RoadmapStep: React.FC<{
  roadmap: ExecutionRoadmap | null;
  isGenerating: boolean;
  onGenerate: () => void;
}> = ({ roadmap, isGenerating, onGenerate }) => (
  <div className="space-y-4 animate-fade-in">
    {!roadmap && !isGenerating && (
      <div className="flex flex-col items-center py-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 mb-4">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-accent">
            <path d="M4 14h4l3-8 4 16 3-8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h4 className="text-sm font-semibold text-text-primary mb-1">Execution Roadmap</h4>
        <p className="text-xs text-text-muted mb-4 max-w-sm text-center">
          Generate an AI execution roadmap with phases, steps, and estimated timelines.
        </p>
        <button className="btn btn-primary rounded-lg px-6" onClick={onGenerate}>Generate Roadmap</button>
      </div>
    )}
    {isGenerating && (
      <div className="flex flex-col items-center py-8 animate-fade-in">
        <div className="spinner spinner-lg mb-4" />
        <h4 className="text-sm font-semibold text-text-primary mb-1">Creating Roadmap...</h4>
        <p className="text-xs text-text-muted">AI is decomposing your project into executable phases</p>
      </div>
    )}
    {roadmap && (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">{roadmap.phases.length} phases, {roadmap.totalSteps} steps</span>
          <span className="text-[10px] text-text-muted font-mono">~{roadmap.estimatedDuration}</span>
        </div>
        {roadmap.phases.map((phase, i) => (
          <div key={phase.id} className="p-3 rounded-lg border border-border bg-bg-elevated/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-5 h-5 rounded bg-accent/15 text-accent text-[10px] font-bold">
                {i + 1}
              </div>
              <span className="text-xs font-semibold text-text-primary">{phase.name}</span>
              <span className="text-[10px] text-text-muted ml-auto">{phase.steps.length} steps</span>
            </div>
            <p className="text-[10px] text-text-muted mb-2">{phase.description}</p>
            <div className="space-y-1">
              {phase.steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    step.riskLevel === 'high' ? 'bg-danger' : step.riskLevel === 'medium' ? 'bg-warning' : 'bg-success'
                  }`} />
                  <span className="text-text-secondary">{step.title}</span>
                  <span className="text-text-muted ml-auto font-mono">{step.estimatedTime}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const ReviewStep: React.FC<{
  config: ProjectConfig;
  objective?: AIProjectObjective;
  architecture?: ArchitecturePlan;
  roadmap?: ExecutionRoadmap;
}> = ({ config, objective, architecture, roadmap }) => (
  <div className="space-y-3 animate-fade-in">
    <div className="p-4 rounded-xl border border-border bg-bg-elevated/30 space-y-2.5">
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
    {config.objective && (
      <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border">
        <span className="text-[10px] text-text-muted block mb-1">Objective</span>
        <p className="text-xs text-text-primary leading-relaxed">{config.objective}</p>
      </div>
    )}
    {objective && objective.requirements.length > 0 && (
      <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border">
        <span className="text-[10px] text-text-muted block mb-1">Requirements</span>
        <div className="flex flex-wrap gap-1">
          {objective.requirements.map((r, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-accent/10 text-[10px] text-accent">{r}</span>
          ))}
        </div>
      </div>
    )}
    {architecture && (
      <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border">
        <span className="text-[10px] text-text-muted block mb-1">Architecture</span>
        <div className="flex flex-wrap gap-1">
          {architecture.techStack.map((item, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-bg-hover text-[10px] text-text-secondary">{item.name}</span>
          ))}
        </div>
      </div>
    )}
    {roadmap && (
      <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border">
        <span className="text-[10px] text-text-muted block mb-1">Roadmap</span>
        <div className="text-xs text-text-secondary">
          {roadmap.phases.length} phases, {roadmap.totalSteps} steps (~{roadmap.estimatedDuration})
        </div>
      </div>
    )}
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const ProjectSetupView: React.FC<ProjectSetupViewProps> = ({ onLaunch, onBack }) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('project-type');
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
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
  const [objective, setObjective] = useState<AIProjectObjective>({
    summary: '',
    requirements: [],
    constraints: [],
    techPreferences: [],
    priority: 'quality',
  });
  const [architecture, setArchitecture] = useState<ArchitecturePlan | null>(null);
  const [roadmap, setRoadmap] = useState<ExecutionRoadmap | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [isGeneratingArch, setIsGeneratingArch] = useState(false);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);

  // Load providers when on provider step
  useEffect(() => {
    if (currentStep === 'provider') {
      const loadProviders = async () => {
        try {
          const result = await window.vibecode?.provider.list();
          if (result?.success && result.data?.providers) {
            setProviders(result.data.providers);
            if (result.data.providers.length > 0 && !config.providerId) {
              setConfig(prev => ({
                ...prev,
                providerId: result.data!.providers[0].id,
                model: result.data!.providers[0].models[0]?.id || '',
              }));
            }
          }
        } catch { /* Not available */ }
      };
      loadProviders();
    }
  }, [currentStep]);

  const handleConfigChange = useCallback((updates: Partial<ProjectConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const handleObjectiveChange = useCallback((updates: Partial<AIProjectObjective>) => {
    setObjective(prev => ({ ...prev, ...updates }));
  }, []);

  const handleBrowseWorkspace = useCallback(async () => {
    try {
      const result = await window.vibecode?.workspace.open('');
      if (result?.success && result.data?.workspace) {
        setConfig(prev => ({ ...prev, workspacePath: result.data!.workspace!.rootPath }));
      }
    } catch { /* Browse not available */ }
  }, []);

  const handleGenerateArchitecture = useCallback(() => {
    setIsGeneratingArch(true);
    // Simulate AI architecture generation — in production this calls the AI
    setTimeout(() => {
      const plan: ArchitecturePlan = {
        id: `arch-${Date.now()}`,
        title: `${config.type === 'web-app' ? 'Full-Stack Web Application' : config.type === 'api-server' ? 'API Server Architecture' : 'Project'} Architecture`,
        description: `Optimized ${config.type} architecture designed for ${objective.priority === 'speed' ? 'rapid development' : objective.priority === 'quality' ? 'production quality' : 'simplicity and maintainability'}.`,
        techStack: getDefaultTechStack(config.type, objective),
        fileStructure: getDefaultFileStructure(config.type),
        dependencies: ['typescript', 'zod'],
        patterns: ['Clean Architecture', 'Repository Pattern'],
        estimatedComplexity: objective.requirements.length > 5 ? 'high' : objective.requirements.length > 2 ? 'medium' : 'low',
        reasoning: `Based on your objective and ${objective.requirements.length} requirements, this architecture uses a modular approach with clear separation of concerns. The tech stack is optimized for ${objective.priority === 'speed' ? 'fast iteration' : objective.priority === 'quality' ? 'reliability and testing' : 'simplicity'}.`,
      };
      setArchitecture(plan);
      setIsGeneratingArch(false);
    }, 2000);
  }, [config.type, objective]);

  const handleGenerateRoadmap = useCallback(() => {
    setIsGeneratingRoadmap(true);
    setTimeout(() => {
      const rm: ExecutionRoadmap = {
        id: `roadmap-${Date.now()}`,
        phases: [
          {
            id: 'phase-1', name: 'Project Setup', description: 'Initialize project structure and dependencies',
            order: 1, status: 'pending',
            steps: [
              { id: 's1', title: 'Initialize project', description: 'Create project with package manager', type: 'command', riskLevel: 'low', requiresApproval: false, estimatedTime: '30s' },
              { id: 's2', title: 'Install dependencies', description: 'Install core dependencies', type: 'command', riskLevel: 'low', requiresApproval: false, estimatedTime: '1m' },
              { id: 's3', title: 'Create config files', description: 'TypeScript, ESLint, build config', type: 'file_create', riskLevel: 'low', requiresApproval: false, estimatedTime: '30s' },
            ],
          },
          {
            id: 'phase-2', name: 'Core Implementation', description: 'Build the main application features',
            order: 2, status: 'pending',
            steps: [
              { id: 's4', title: 'Create data models', description: 'Define core types and schemas', type: 'file_create', riskLevel: 'low', requiresApproval: false, estimatedTime: '2m' },
              { id: 's5', title: 'Implement business logic', description: 'Core application services', type: 'code_generation', riskLevel: 'medium', requiresApproval: true, estimatedTime: '5m' },
              { id: 's6', title: 'Build API routes', description: 'REST/GraphQL endpoints', type: 'code_generation', riskLevel: 'medium', requiresApproval: true, estimatedTime: '4m' },
            ],
          },
          {
            id: 'phase-3', name: 'Frontend & Polish', description: 'UI implementation and final integration',
            order: 3, status: 'pending',
            steps: [
              { id: 's7', title: 'Build UI components', description: 'Create interface components', type: 'code_generation', riskLevel: 'medium', requiresApproval: true, estimatedTime: '6m' },
              { id: 's8', title: 'Integration testing', description: 'End-to-end feature validation', type: 'command', riskLevel: 'low', requiresApproval: false, estimatedTime: '2m' },
              { id: 's9', title: 'Final review', description: 'Code quality and architecture review', type: 'analysis', riskLevel: 'low', requiresApproval: false, estimatedTime: '1m' },
            ],
          },
        ],
        totalSteps: 9,
        estimatedDuration: '22 minutes',
        dependencies: [
          { from: 'phase-1', to: 'phase-2', type: 'hard' },
          { from: 'phase-2', to: 'phase-3', type: 'hard' },
        ],
      };
      setRoadmap(rm);
      setIsGeneratingRoadmap(false);
    }, 2500);
  }, []);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'project-type': return config.name.trim().length > 0;
      case 'objective': return config.objective.trim().length > 0;
      case 'architecture': return true; // Optional step
      case 'provider': return config.providerId.length > 0;
      case 'workspace': return config.workspacePath.length > 0;
      case 'execution-mode': return true;
      case 'roadmap': return true; // Optional step
      case 'review': return true;
      default: return false;
    }
  };

  const handleNext = useCallback(() => {
    const stepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep]);
    }
    if (stepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStep(WIZARD_STEPS[stepIndex + 1].id);
    } else {
      onLaunch(config);
    }
  }, [currentStep, completedSteps, config, onLaunch]);

  const handleBack = useCallback(() => {
    const stepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
    if (stepIndex > 0) {
      setCurrentStep(WIZARD_STEPS[stepIndex - 1].id);
    } else {
      onBack();
    }
  }, [currentStep, onBack]);

  const handleStepClick = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case 'project-type':
        return <ProjectTypeStep config={config} onChange={handleConfigChange} />;
      case 'objective':
        return <ObjectiveStep config={config} objective={objective} onConfigChange={handleConfigChange} onObjectiveChange={handleObjectiveChange} />;
      case 'architecture':
        return <ArchitectureStep architecture={architecture} isGenerating={isGeneratingArch} onGenerate={handleGenerateArchitecture} />;
      case 'provider':
        return <ProviderStep config={config} providers={providers} customEndpoint={customEndpoint} customApiKey={customApiKey} onConfigChange={handleConfigChange} onCustomEndpointChange={setCustomEndpoint} onCustomApiKeyChange={setCustomApiKey} />;
      case 'workspace':
        return <WorkspaceStep config={config} onChange={handleConfigChange} onBrowse={handleBrowseWorkspace} />;
      case 'execution-mode':
        return <ExecutionModeStep config={config} onChange={handleConfigChange} />;
      case 'roadmap':
        return <RoadmapStep roadmap={roadmap} isGenerating={isGeneratingRoadmap} onGenerate={handleGenerateRoadmap} />;
      case 'review':
        return <ReviewStep config={config} objective={objective} architecture={architecture || undefined} roadmap={roadmap || undefined} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full bg-bg-deep">
      {/* Left: Step Progress */}
      <div className="w-[280px] flex-shrink-0 border-r border-border bg-bg-base flex flex-col">
        <div className="px-6 pt-8 pb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent">
                <path d="M7 1L1 4l6 3 6-3-6-3z" fill="currentColor" opacity="0.4" />
                <path d="M1 7l6 3 6-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M1 10l6 3 6-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-text-primary">New AI Project</h2>
          </div>
          <p className="text-xs text-text-muted">Configure your AI-native project</p>
        </div>

        <div className="px-3 flex-1 overflow-y-auto">
          <StepIndicator
            steps={WIZARD_STEPS}
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />
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
        <div className="w-full max-w-xl animate-fade-in" key={currentStep}>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              {WIZARD_STEPS.find(s => s.id === currentStep)?.label}
            </h3>
            <p className="text-xs text-text-muted">
              {WIZARD_STEPS.find(s => s.id === currentStep)?.description}
            </p>
          </div>

          {renderStep()}

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={handleBack}
              className="btn btn-ghost text-xs"
            >
              {currentStep === 'project-type' ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="btn btn-primary rounded-lg px-6"
            >
              {currentStep === 'review' ? 'Launch Project' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Helper Functions ────────────────────────────────────────────────────────

function getDefaultTechStack(type: ProjectType, obj: AIProjectObjective): TechStackItem[] {
  const stacks: Record<string, TechStackItem[]> = {
    'web-app': [
      { name: 'Next.js', version: '14', category: 'framework', purpose: 'Full-stack React framework' },
      { name: 'TypeScript', category: 'language', purpose: 'Type safety' },
      { name: 'Tailwind CSS', version: '4', category: 'library', purpose: 'Utility-first styling' },
      { name: 'Prisma', category: 'tool', purpose: 'Database ORM' },
    ],
    'api-server': [
      { name: 'Express', category: 'framework', purpose: 'HTTP server' },
      { name: 'TypeScript', category: 'language', purpose: 'Type safety' },
      { name: 'Zod', category: 'library', purpose: 'Schema validation' },
      { name: 'PostgreSQL', category: 'database', purpose: 'Primary database' },
    ],
    'cli-tool': [
      { name: 'Node.js', category: 'framework', purpose: 'Runtime' },
      { name: 'TypeScript', category: 'language', purpose: 'Type safety' },
      { name: 'Commander', category: 'library', purpose: 'CLI framework' },
    ],
    'library': [
      { name: 'TypeScript', category: 'language', purpose: 'Type safety' },
      { name: 'Vite', category: 'tool', purpose: 'Build system' },
      { name: 'Vitest', category: 'tool', purpose: 'Testing' },
    ],
    'data-pipeline': [
      { name: 'Python', category: 'language', purpose: 'Pipeline logic' },
      { name: 'Pandas', category: 'library', purpose: 'Data processing' },
    ],
    'custom': [
      { name: 'TypeScript', category: 'language', purpose: 'Type safety' },
    ],
  };
  return stacks[type] || stacks['custom'];
}

function getDefaultFileStructure(type: ProjectType): FileStructureNode[] {
  const base: FileStructureNode[] = [
    { name: 'src', type: 'directory', children: [
      { name: 'index.ts', type: 'file', description: 'Entry point' },
    ]},
    { name: 'package.json', type: 'file', description: 'Dependencies' },
    { name: 'tsconfig.json', type: 'file', description: 'TypeScript config' },
    { name: 'README.md', type: 'file', description: 'Documentation' },
  ];

  if (type === 'web-app') {
    base[0].children = [
      { name: 'app', type: 'directory', children: [
        { name: 'page.tsx', type: 'file', description: 'Home page' },
        { name: 'layout.tsx', type: 'file', description: 'Root layout' },
        { name: 'api', type: 'directory', description: 'API routes' },
      ]},
      { name: 'components', type: 'directory', description: 'UI components' },
      { name: 'lib', type: 'directory', description: 'Utility functions' },
    ];
  } else if (type === 'api-server') {
    base[0].children = [
      { name: 'routes', type: 'directory', description: 'API route handlers' },
      { name: 'middleware', type: 'directory', description: 'Express middleware' },
      { name: 'models', type: 'directory', description: 'Data models' },
      { name: 'services', type: 'directory', description: 'Business logic' },
    ];
  }
  return base;
}

export default ProjectSetupView;
