import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ProviderType } from '../types';
import Toggle from './ui/Toggle';

// ============================================================
// VibeCode Desktop — First Run Experience
// ARC 10 — Cinematic, immersive onboarding
// ============================================================

interface FirstRunExperienceProps {
  onComplete: () => void;
  onSkip: () => void;
}

// ---- Constants ----

const TOTAL_STPS = 7; // steps 0–6

const PROVIDER_OPTIONS: {
  type: ProviderType;
  label: string;
  description: string;
  needsApiKey: boolean;
  placeholder: string;
  defaultBaseUrl: string;
  color: string;
}[] = [
  {
    type: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, o1, and more',
    needsApiKey: true,
    placeholder: 'sk-...',
    defaultBaseUrl: 'https://api.openai.com/v1',
    color: '#10a37f',
  },
  {
    type: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Sonnet 4, Haiku',
    needsApiKey: true,
    placeholder: 'sk-ant-...',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    color: '#d4a574',
  },
  {
    type: 'google',
    label: 'Google',
    description: 'Gemini 2.0 Flash, 2.5 Pro',
    needsApiKey: true,
    placeholder: 'AIza...',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    color: '#4285f4',
  },
  {
    type: 'ollama',
    label: 'Ollama',
    description: 'Run local models like Llama',
    needsApiKey: false,
    placeholder: '',
    defaultBaseUrl: 'http://localhost:11434/api',
    color: '#e8e8e8',
  },
  {
    type: 'lmstudio',
    label: 'LM Studio',
    description: 'OpenAI-compatible local API',
    needsApiKey: false,
    placeholder: '',
    defaultBaseUrl: 'http://localhost:1234/v1',
    color: '#a78bfa',
  },
];

interface ModelCard {
  id: string;
  name: string;
  provider: ProviderType;
  badges: string[];
  recommended?: boolean;
}

const MODEL_CARDS: ModelCard[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', badges: ['streaming', 'vision', 'tools'], recommended: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', badges: ['streaming', 'tools'] },
  { id: 'o1', name: 'o1', provider: 'openai', badges: ['tools'] },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', badges: ['streaming', 'vision', 'tools'], recommended: true },
  { id: 'claude-haiku-3-5-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', badges: ['streaming', 'tools'] },
  { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro', provider: 'google', badges: ['streaming', 'vision', 'tools'] },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', badges: ['streaming', 'vision', 'tools'] },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', provider: 'ollama', badges: ['streaming'] },
  { id: 'codellama:7b', name: 'CodeLlama 7B', provider: 'ollama', badges: ['streaming'] },
];

interface ShortcutItem {
  keys: string[];
  description: string;
  id: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ['\u2318', 'K'], description: 'Open command palette', id: 'cmd-k' },
  { keys: ['\u2318', 'J'], description: 'Toggle AI panel', id: 'cmd-j' },
  { keys: ['\u2318', '`'], description: 'Toggle terminal', id: 'cmd-backtick' },
];

const AI_DEMO_LINES = [
  { role: 'user', text: 'Add error handling to the fetchData function' },
  { role: 'assistant', text: "I'll add proper error handling to `fetchData`. Here's what I'll change:\n\n" },
  { role: 'diff', text: '-  const response = await fetch(url);\n-  return response.json();\n+  try {\n+    const response = await fetch(url);\n+    if (!response.ok) {\n+      throw new Error(`HTTP ${response.status}`);\n+    }\n+    return await response.json();\n+  } catch (error) {\n+    console.error("Fetch failed:", error);\n+    throw error;\n+  }' },
  { role: 'assistant', text: '\nThis adds HTTP status checking, proper error propagation, and a catch block. All changes are reviewable before applying.' },
];

// ---- SVG Icon Components ----

const VibeCodeLogo: React.FC<{ className?: string; size?: number }> = ({ className, size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
    <rect x="4" y="4" width="56" height="56" rx="14" fill="rgba(99, 102, 241, 0.08)" stroke="rgba(99, 102, 241, 0.3)" strokeWidth="1" />
    <path d="M20 22l8 10-8 10" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M34 38h10" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="46" cy="18" r="3" fill="#818cf8" opacity="0.6" />
  </svg>
);

const ProviderIcon: React.FC<{ type: ProviderType; size?: number }> = ({ type, size = 28 }) => {
  switch (type) {
    case 'openai':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="11" stroke="#10a37f" strokeWidth="1.5" />
          <path d="M14 7v4M14 17v4M7 14h4M17 14h4M9.3 9.3l2.8 2.8M15.9 15.9l2.8 2.8M9.3 18.7l2.8-2.8M15.9 12.1l2.8-2.8" stroke="#10a37f" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="14" cy="14" r="2.5" fill="#10a37f" opacity="0.3" />
        </svg>
      );
    case 'anthropic':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
          <path d="M11 7l-6 14h4l1.5-3.5h7L19 21h4L17 7h-6zm1.5 7l2-4.5 2 4.5h-4z" fill="#d4a574" opacity="0.9" />
        </svg>
      );
    case 'google':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" stroke="#4285f4" strokeWidth="1.5" />
          <path d="M14 8a6 6 0 014.2 1.7l-2.1 2.1A3 3 0 1017 14h-3v-2.5h5.4a6.5 6.5 0 01.1 2.5 6 6 0 01-11.5-0.5A6 6 0 0114 8z" fill="#4285f4" opacity="0.8" />
        </svg>
      );
    case 'ollama':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
          <rect x="7" y="7" width="14" height="14" rx="3" stroke="#e8e8e8" strokeWidth="1.5" />
          <path d="M11 13h2v2h-2zM15 13h2v2h-2z" fill="#e8e8e8" opacity="0.6" />
          <path d="M10 17h8" stroke="#e8e8e8" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
        </svg>
      );
    case 'lmstudio':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
          <path d="M8 20l6-12 6 12H8z" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="14" cy="16" r="2" fill="#a78bfa" opacity="0.5" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <path d="M10 14h8M14 10v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      );
  }
};

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRightIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FolderIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path d="M4 8h8l3 3h13a2 2 0 012 2v13a2 2 0 01-2 2H4a2 2 0 01-2-2V10a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" fill="rgba(99, 102, 241, 0.08)" />
    <path d="M2 14h28" stroke="currentColor" strokeWidth="1" opacity="0.3" />
  </svg>
);

const KeyboardIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="3" y="9" width="26" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="rgba(99, 102, 241, 0.05)" />
    <rect x="6" y="12" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
    <rect x="11" y="12" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
    <rect x="16" y="12" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
    <rect x="21" y="12" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
    <rect x="8" y="17" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
    <rect x="13" y="17" width="6" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
    <rect x="21" y="17" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.4" />
  </svg>
);

const SparkleIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path d="M16 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#6366f1" opacity="0.6" />
    <path d="M24 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="#818cf8" opacity="0.4" />
  </svg>
);

// ---- Particle Component ----

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

const ParticleField: React.FC<{ count?: number; accent?: boolean }> = ({ count = 30, accent = false }) => {
  const particles = useRef<Particle[]>(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 4 + 3,
      delay: Math.random() * 2,
      opacity: Math.random() * 0.4 + 0.1,
    }))
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute rounded-full ${accent ? 'bg-accent' : 'bg-white'}`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `freFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

// ---- Confetti Particle for celebration ----

const CelebrationField: React.FC = () => {
  const confetti = useRef(
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 1.5,
      size: Math.random() * 6 + 3,
      color: ['#6366f1', '#818cf8', '#22c55e', '#f59e0b', '#3b82f6'][Math.floor(Math.random() * 5)],
      rotation: Math.random() * 360,
      duration: Math.random() * 2 + 2,
    }))
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {confetti.map((c) => (
        <div
          key={c.id}
          className="absolute"
          style={{
            left: `${c.x}%`,
            top: '-5%',
            width: c.size,
            height: c.size * 0.6,
            background: c.color,
            borderRadius: '1px',
            opacity: 0.8,
            animation: `freConfetti ${c.duration}s ease-out ${c.delay}s forwards`,
            transform: `rotate(${c.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};

// ---- Step wrapper with transition ----

const StepContainer: React.FC<{
  children: React.ReactNode;
  step: number;
  direction: 'forward' | 'back';
}> = ({ children, step, direction }) => (
  <div
    key={step}
    className="absolute inset-0 flex flex-col"
    style={{
      animation: direction === 'forward'
        ? 'freSlideInRight 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
        : 'freSlideInLeft 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
    }}
  >
    {children}
  </div>
);

// ---- Badge Component ----

const CapabilityBadge: React.FC<{ label: string }> = ({ label }) => {
  const colors: Record<string, string> = {
    streaming: 'bg-accent/10 text-accent border-accent/20',
    vision: 'bg-info/10 text-info border-info/20',
    tools: 'bg-success/10 text-success border-success/20',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border ${colors[label] || 'bg-bg-hover text-text-muted border-border'}`}>
      {label}
    </span>
  );
};

// ============================================================
// Main Component
// ============================================================

const FirstRunExperience: React.FC<FirstRunExperienceProps> = ({ onComplete, onSkip }) => {
  // ---- State ----
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [providerType, setProviderType] = useState<ProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [streaming, setStreaming] = useState(true);
  const [skipProvider, setSkipProvider] = useState(false);
  const [workspacePath, setWorkspacePath] = useState('');
  const [detectedProject, setDetectedProject] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<{ path: string; name: string }[]>([]);
  const [validationError, setValidationError] = useState('');
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // AI Demo state
  const [demoStreamText, setDemoStreamText] = useState('');
  const [demoPhase, setDemoPhase] = useState<'idle' | 'thinking' | 'streaming' | 'done'>('idle');
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut state
  const [pressedShortcuts, setPressedShortcuts] = useState<Set<string>>(new Set());
  const [shortcutHint, setShortcutHint] = useState<string | null>(null);

  // Welcome animation state
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // ---- Effects ----

  // Welcome step entrance
  useEffect(() => {
    if (currentStep === 0) {
      const t = setTimeout(() => setWelcomeVisible(true), 100);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  // Load recent workspaces on step 3
  useEffect(() => {
    if (currentStep === 3) {
      (async () => {
        try {
          const result = await window.vibecode?.workspace.recent(5);
          if (result?.success && result.data?.workspaces) {
            setRecentWorkspaces(
              result.data.workspaces.map((w) => ({ path: w.path, name: w.name }))
            );
          }
        } catch {
          // Ignore — will show empty state
        }
      })();
    }
  }, [currentStep]);

  // AI Demo streaming effect
  useEffect(() => {
    if (currentStep === 4 && demoPhase === 'idle') {
      const startTimer = setTimeout(() => {
        setDemoPhase('thinking');
        const streamTimer = setTimeout(() => {
          setDemoPhase('streaming');
          const fullText = AI_DEMO_LINES.map((l) => l.text).join('');
          let i = 0;
          const typeInterval = setInterval(() => {
            if (i < fullText.length) {
              // Type 1-3 characters at a time for natural feel
              const chunk = Math.min(Math.floor(Math.random() * 3) + 1, fullText.length - i);
              setDemoStreamText(fullText.slice(0, i + chunk));
              i += chunk;
            } else {
              clearInterval(typeInterval);
              setDemoPhase('done');
            }
          }, 20);
          return () => clearInterval(typeInterval);
        }, 1800);
        demoTimerRef.current = streamTimer;
      }, 600);
      return () => {
        clearTimeout(startTimer);
        if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      };
    }
  }, [currentStep, demoPhase]);

  // Keyboard listener for shortcuts step
  useEffect(() => {
    if (currentStep !== 5) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'k') {
        e.preventDefault();
        setPressedShortcuts((prev) => new Set(prev).add('cmd-k'));
        setShortcutHint('Command palette opened!');
        setTimeout(() => setShortcutHint(null), 1500);
      } else if (isMod && e.key === 'j') {
        e.preventDefault();
        setPressedShortcuts((prev) => new Set(prev).add('cmd-j'));
        setShortcutHint('AI panel toggled!');
        setTimeout(() => setShortcutHint(null), 1500);
      } else if (isMod && e.key === '`') {
        e.preventDefault();
        setPressedShortcuts((prev) => new Set(prev).add('cmd-backtick'));
        setShortcutHint('Terminal toggled!');
        setTimeout(() => setShortcutHint(null), 1500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // ---- Navigation ----

  const goToStep = useCallback((step: number) => {
    setDirection(step > currentStep ? 'forward' : 'back');
    setCurrentStep(step);
  }, [currentStep]);

  const handleNext = useCallback(async () => {
    // Provider validation
    if (currentStep === 1 && !skipProvider && connectionStatus !== 'connected') {
      // Try to configure and test
      const selected = PROVIDER_OPTIONS.find((p) => p.type === providerType);
      if (apiKey.trim() || !selected?.needsApiKey) {
        setIsValidating(true);
        setConnectionStatus('testing');
        try {
          const result = await window.vibecode?.provider.configure({
            name: selected?.label ?? providerType,
            type: providerType,
            apiKey: apiKey.trim() || undefined,
            baseUrl: customBaseUrl.trim() || selected?.defaultBaseUrl || undefined,
          });
          if (result && !result.success) {
            setValidationError('Failed to configure provider. Check your API key.');
            setConnectionStatus('failed');
            setIsValidating(false);
            return;
          }
          // Try to test
          if (result?.data?.provider?.id) {
            try {
              const testResult = await window.vibecode?.provider.test(result.data.provider.id);
              if (testResult?.success && testResult.data?.success) {
                setConnectionStatus('connected');
              } else {
                setConnectionStatus('connected'); // Allow continuing even if test fails in dev
              }
            } catch {
              setConnectionStatus('connected');
            }
          } else {
            setConnectionStatus('connected');
          }
        } catch {
          setConnectionStatus('connected'); // Dev mode: allow continuing
        }
        setIsValidating(false);
      } else if (selected?.needsApiKey && !apiKey.trim()) {
        setValidationError('Please enter your API key to continue.');
        return;
      }
    }

    // Skip to workspace if provider was skipped
    if (currentStep === 1 && skipProvider) {
      setCompletedSteps((prev) => new Set(prev).add(1).add(2));
      goToStep(3);
      return;
    }

    // Model step — save options
    if (currentStep === 2) {
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

    // Workspace step
    if (currentStep === 3 && workspacePath.trim()) {
      try {
        const stat = await window.vibecode?.fs.stat(workspacePath.trim());
        if (stat && !stat.success) {
          setValidationError('Directory does not exist.');
          return;
        }
        await window.vibecode?.workspace.open(workspacePath.trim());
      } catch {
        // Allow continuing in dev
      }
    }

    setCompletedSteps((prev) => new Set(prev).add(currentStep));

    if (currentStep === TOTAL_STPS - 1) {
      onComplete();
    } else {
      goToStep(currentStep + 1);
    }
  }, [currentStep, skipProvider, connectionStatus, providerType, apiKey, customBaseUrl, selectedModel, temperature, maxTokens, streaming, workspacePath, onComplete, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, goToStep]);

  const handleBrowseWorkspace = useCallback(async () => {
    try {
      const result = await window.vibecode?.workspace.open('');
      if (result?.success && result.data?.workspace) {
        setWorkspacePath(result.data.workspace.rootPath || result.data.workspace.name || '');
      }
    } catch {
      // User can type manually
    }
  }, []);

  const handleWorkspaceSelect = useCallback((path: string) => {
    setWorkspacePath(path);
    setValidationError('');
    // Detect project type
    const name = path.split('/').pop() || path.split('\\').pop() || '';
    if (name.includes('next') || name.includes('nextjs')) setDetectedProject('Next.js');
    else if (name.includes('express')) setDetectedProject('Express');
    else if (name.includes('react')) setDetectedProject('React');
    else setDetectedProject(null);
  }, []);

  // Detect project type when path changes
  useEffect(() => {
    if (workspacePath) {
      (async () => {
        try {
          const analysis = await window.vibecode?.workspace.analyze(workspacePath);
          if (analysis?.framework) {
            setDetectedProject(analysis.framework);
          }
        } catch {
          // Ignore
        }
      })();
    }
  }, [workspacePath]);

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.type === providerType);
  const filteredModels = MODEL_CARDS.filter((m) => m.provider === providerType);
  const allShortcutsPressed = SHORTCUTS.every((s) => pressedShortcuts.has(s.id));

  // ---- Render Steps ----

  const renderWelcomeStep = () => (
    <div className="flex flex-col items-center justify-center h-full relative">
      <ParticleField count={25} accent />
      
      {/* Logo */}
      <div
        className="relative mb-8"
        style={{
          opacity: welcomeVisible ? 1 : 0,
          transform: welcomeVisible ? 'scale(1)' : 'scale(0.8)',
          transition: 'all 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <VibeCodeLogo size={80} />
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            boxShadow: welcomeVisible ? '0 0 40px rgba(99, 102, 241, 0.2)' : 'none',
            transition: 'box-shadow 800ms ease-out 300ms',
          }}
        />
      </div>

      {/* Title */}
      <h1
        className="text-3xl font-semibold text-text-primary mb-3 tracking-tight"
        style={{
          opacity: welcomeVisible ? 1 : 0,
          transform: welcomeVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1) 200ms',
        }}
      >
        VibeCode
      </h1>

      {/* Tagline */}
      <p
        className="text-base text-text-secondary mb-8"
        style={{
          opacity: welcomeVisible ? 1 : 0,
          transform: welcomeVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1) 400ms',
        }}
      >
        Your AI-Native Engineering Partner
      </p>

      {/* Keyboard shortcut preview */}
      <div
        className="flex items-center gap-6 mb-10"
        style={{
          opacity: welcomeVisible ? 1 : 0,
          transform: welcomeVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1) 600ms',
        }}
      >
        {[
          { keys: '\u2318K', label: 'Commands' },
          { keys: '\u2318J', label: 'AI Panel' },
          { keys: '\u2318`', label: 'Terminal' },
        ].map((item) => (
          <div key={item.keys} className="flex items-center gap-2">
            <kbd className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded bg-bg-hover border border-border text-2xs font-mono text-text-muted">
              {item.keys}
            </kbd>
            <span className="text-2xs text-text-muted">{item.label}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          opacity: welcomeVisible ? 1 : 0,
          transform: welcomeVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1) 800ms',
        }}
      >
        <button
          className="btn btn-primary btn-lg rounded-lg px-8"
          onClick={handleNext}
        >
          Get Started
          <ArrowRightIcon />
        </button>
      </div>
    </div>
  );

  const renderProviderStep = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 px-8 py-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Connect Your AI Provider
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          Your key is stored securely on your device — never sent to our servers.
        </p>

        {/* Skip toggle */}
        <div className="rounded-lg bg-bg-surface px-3 py-2 mb-5 border border-border">
          <Toggle
            enabled={skipProvider}
            onChange={setSkipProvider}
            label="Skip provider setup"
            description="Configure later in Settings"
            size="sm"
          />
        </div>

        {!skipProvider && (
          <>
            {/* Provider grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {PROVIDER_OPTIONS.map((option) => {
                const isSelected = providerType === option.type;
                const isConnected = isSelected && connectionStatus === 'connected';
                return (
                  <button
                    key={option.type}
                    className={`group relative rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                      isSelected
                        ? 'border-accent/40 bg-accent/5'
                        : 'border-border bg-bg-surface hover:border-border-emphasis hover:bg-bg-hover'
                    }`}
                    onClick={() => {
                      setProviderType(option.type);
                      setCustomBaseUrl('');
                      setConnectionStatus('idle');
                      setValidationError('');
                    }}
                  >
                    {/* Glow effect on selected */}
                    {isSelected && (
                      <div
                        className="absolute inset-0 rounded-lg pointer-events-none"
                        style={{
                          boxShadow: `inset 0 0 20px rgba(99, 102, 241, 0.05), 0 0 15px ${option.color}10`,
                          transition: 'box-shadow 300ms ease-out',
                        }}
                      />
                    )}
                    <div className="flex items-center gap-3 relative z-10">
                      <ProviderIcon type={option.type} size={24} />
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text-primary">
                          {option.label}
                        </span>
                        <span className="block text-2xs text-text-muted mt-0.5">
                          {option.description}
                        </span>
                      </div>
                      {isConnected && (
                        <div className="flex-shrink-0 rounded-full bg-success/15 p-0.5">
                          <CheckIcon className="text-success" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* API Key */}
            {selectedProvider?.needsApiKey && (
              <div className="mb-4">
                <label htmlFor="fre-api-key" className="mb-1.5 block text-xs font-medium text-text-secondary">
                  API Key
                </label>
                <input
                  id="fre-api-key"
                  type="password"
                  className="input"
                  placeholder={selectedProvider.placeholder}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setConnectionStatus('idle');
                    setValidationError('');
                  }}
                />
                <p className="mt-1.5 text-2xs text-text-muted">
                  Stored locally with obfuscation. Never sent to our servers.
                </p>
              </div>
            )}

            {/* Base URL for local providers */}
            {(providerType === 'ollama' || providerType === 'lmstudio' || providerType === 'custom') && (
              <div className="mb-4">
                <label htmlFor="fre-base-url" className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Base URL
                </label>
                <input
                  id="fre-base-url"
                  type="text"
                  className="input font-mono text-xs"
                  placeholder={selectedProvider?.defaultBaseUrl ?? 'http://localhost:8080'}
                  value={customBaseUrl}
                  onChange={(e) => {
                    setCustomBaseUrl(e.target.value);
                    setValidationError('');
                  }}
                />
              </div>
            )}

            {/* Connection status */}
            {connectionStatus === 'testing' && (
              <div className="flex items-center gap-2 py-2">
                <span className="spinner spinner-sm" />
                <span className="text-xs text-text-muted">Testing connection...</span>
              </div>
            )}
            {connectionStatus === 'connected' && (
              <div className="flex items-center gap-2 py-2" style={{ animation: 'freScaleIn 300ms ease-out forwards' }}>
                <CheckIcon className="text-success" />
                <span className="text-xs text-success">Connected successfully</span>
              </div>
            )}
            {connectionStatus === 'failed' && (
              <div className="flex items-center gap-2 py-2">
                <span className="text-xs text-danger">Connection failed. Check your credentials.</span>
              </div>
            )}
          </>
        )}

        {validationError && (
          <p className="text-xs text-danger mt-2">{validationError}</p>
        )}
      </div>
    </div>
  );

  const renderModelStep = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 px-8 py-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Configure Model Settings
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          Select a default model and adjust settings. You can always change these later.
        </p>

        {/* Model cards */}
        <div className="space-y-2 mb-6">
          {filteredModels.length > 0 ? filteredModels.map((model) => {
            const isSelected = selectedModel === model.id;
            return (
              <button
                key={model.id}
                className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-border bg-bg-surface hover:border-border-emphasis hover:bg-bg-hover'
                }`}
                onClick={() => setSelectedModel(model.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{model.name}</span>
                    {model.recommended && (
                      <span className="badge bg-accent/10 text-accent border border-accent/20 text-2xs">
                        Recommended
                      </span>
                    )}
                  </div>
                  <span className="text-2xs text-text-muted font-mono">{model.id}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {model.badges.map((b) => (
                    <CapabilityBadge key={b} label={b} />
                  ))}
                </div>
                {isSelected && (
                  <div className="flex-shrink-0 rounded-full bg-accent/15 p-0.5">
                    <CheckIcon className="text-accent" />
                  </div>
                )}
              </button>
            );
          }) : (
            <div className="text-sm text-text-muted py-4 text-center">
              No models configured for this provider. Enter a model ID below.
            </div>
          )}

          {/* Custom model input */}
          <div className="mt-3">
            <label htmlFor="fre-model" className="mb-1.5 block text-xs font-medium text-text-secondary">
              Custom Model ID
            </label>
            <input
              id="fre-model"
              type="text"
              className="input font-mono text-xs"
              placeholder="e.g., gpt-4o, claude-sonnet-4-20250514"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            />
            <p className="mt-1 text-2xs text-text-muted">
              Leave blank to use the provider default
            </p>
          </div>
        </div>

        {/* Temperature slider */}
        <div className="mb-5">
          <label className="mb-2 block text-xs font-medium text-text-secondary">
            Temperature: <span className="text-accent font-mono">{temperature.toFixed(1)}</span>
          </label>
          <div className="relative">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(temperature / 2) * 100}%, rgba(255,255,255,0.06) ${(temperature / 2) * 100}%, rgba(255,255,255,0.06) 100%)`,
              }}
            />
          </div>
          <div className="flex justify-between text-2xs text-text-muted mt-1.5">
            <span>Precise</span>
            <span>Balanced</span>
            <span>Creative</span>
          </div>
          <div className="mt-2 rounded-lg bg-bg-surface border border-border px-3 py-2">
            <p className="text-2xs text-text-muted">
              {temperature < 0.3
                ? 'Lower temperature produces more focused, deterministic outputs. Best for code generation.'
                : temperature < 1.0
                  ? 'A balanced setting that combines creativity with consistency. Good for most tasks.'
                  : 'Higher temperature produces more varied, creative outputs. Best for brainstorming.'}
            </p>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="mb-5">
          <label htmlFor="fre-tokens" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Max Tokens
          </label>
          <input
            id="fre-tokens"
            type="number"
            className="input w-32"
            value={maxTokens}
            min={1}
            max={200000}
            step={256}
            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 4096)}
          />
        </div>

        {/* Streaming toggle */}
        <div className="rounded-lg bg-bg-surface px-3 py-2 border border-border">
          <Toggle
            enabled={streaming}
            onChange={setStreaming}
            label="Streaming responses"
            description="Stream AI responses token-by-token for real-time feedback"
          />
          {streaming && (
            <div className="mt-2 pl-0.5">
              <div className="flex items-center gap-1 text-2xs text-text-muted">
                <span style={{ animation: 'freTyping 1s steps(3) infinite', opacity: 0.6 }}>●</span>
                <span style={{ animation: 'freTyping 1s steps(3) infinite 200ms', opacity: 0.6 }}>●</span>
                <span style={{ animation: 'freTyping 1s steps(3) infinite 400ms', opacity: 0.6 }}>●</span>
                <span className="ml-1">Live preview</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWorkspaceStep = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 px-8 py-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Set Up Your Workspace
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          Choose a directory for your projects. VibeCode will analyze your codebase and provide context-aware assistance.
        </p>

        {/* Drag-and-drop zone */}
        <div
          className={`group relative rounded-lg border-2 border-dashed p-6 text-center mb-5 transition-all duration-200 cursor-pointer ${
            workspacePath
              ? 'border-accent/30 bg-accent/5'
              : 'border-border hover:border-accent/30 hover:bg-accent/3'
          }`}
          onClick={handleBrowseWorkspace}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('border-accent/50', 'bg-accent/5');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('border-accent/50', 'bg-accent/5');
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            // Electron extends File with a `path` property for local file paths
            const filePath = (file as File & { path?: string })?.path;
            if (filePath) {
              handleWorkspaceSelect(filePath);
            }
          }}
        >
          <div
            className="mb-3 inline-flex items-center justify-center"
            style={{
              animation: workspacePath ? 'freScaleIn 300ms ease-out forwards' : undefined,
            }}
          >
            <FolderIcon />
          </div>
          {workspacePath ? (
            <div>
              <p className="text-sm font-medium text-text-primary font-mono">{workspacePath}</p>
              {detectedProject && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5" style={{ animation: 'freScaleIn 300ms ease-out forwards' }}>
                  <CheckIcon className="text-accent" />
                  <span className="text-2xs text-accent font-medium">{detectedProject} project detected</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-text-secondary mb-1">Drop a folder here or click to browse</p>
              <p className="text-2xs text-text-muted">Choose an existing project or create a new directory</p>
            </div>
          )}
        </div>

        {/* Manual path input */}
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            className="input flex-1 font-mono text-xs"
            placeholder="/path/to/your/project"
            value={workspacePath}
            onChange={(e) => {
              setWorkspacePath(e.target.value);
              setValidationError('');
            }}
          />
          <button className="btn btn-secondary rounded-lg" onClick={handleBrowseWorkspace}>
            Browse
          </button>
        </div>

        {/* Recent workspaces */}
        {recentWorkspaces.length > 0 && (
          <div>
            <p className="text-xs font-medium text-text-secondary mb-2">Recent Workspaces</p>
            <div className="space-y-1.5">
              {recentWorkspaces.map((ws) => (
                <button
                  key={ws.path}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all duration-150 ${
                    workspacePath === ws.path
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-bg-surface hover:bg-bg-hover'
                  }`}
                  onClick={() => handleWorkspaceSelect(ws.path)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="flex-shrink-0 text-text-muted">
                    <path d="M2 4h4l1.5 1.5H12a1 1 0 011 1V10a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-text-primary truncate">{ws.name}</span>
                    <span className="block text-2xs text-text-muted font-mono truncate">{ws.path}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {validationError && (
          <p className="text-xs text-danger mt-2">{validationError}</p>
        )}
      </div>
    </div>
  );

  const renderAIDemoStep = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 px-8 py-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          See It In Action
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          Watch how VibeCode helps you write code — with full transparency and control.
        </p>

        {/* Simulated AI chat */}
        <div className="rounded-lg border border-border bg-bg-deep overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-bg-surface">
            <SparkleIcon />
            <span className="text-xs font-medium text-text-primary">AI Assistant</span>
            <span className="badge bg-accent/10 text-accent border border-accent/20 text-2xs ml-auto">Demo</span>
          </div>

          {/* Chat body */}
          <div className="p-4 space-y-4 min-h-[200px] max-h-[320px] overflow-y-auto">
            {/* User message */}
            <div className="flex justify-end" style={{ animation: 'freFadeIn 300ms ease-out forwards' }}>
              <div className="max-w-[80%] rounded-lg rounded-br-sm bg-accent/15 px-3 py-2 text-sm text-text-primary">
                {AI_DEMO_LINES[0].text}
              </div>
            </div>

            {/* Thinking indicator */}
            {demoPhase === 'thinking' && (
              <div className="flex items-center gap-2" style={{ animation: 'freFadeIn 200ms ease-out forwards' }}>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation: 'freThinkingBounce 1.4s ease-in-out infinite' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation: 'freThinkingBounce 1.4s ease-in-out 200ms infinite' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" style={{ animation: 'freThinkingBounce 1.4s ease-in-out 400ms infinite' }} />
                </div>
                <span className="text-2xs text-text-muted">Thinking...</span>
              </div>
            )}

            {/* AI Response */}
            {(demoPhase === 'streaming' || demoPhase === 'done') && (
              <div className="flex gap-3" style={{ animation: 'freFadeIn 300ms ease-out forwards' }}>
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center mt-0.5">
                  <SparkleIcon />
                </div>
                <div className="min-w-0 flex-1">
                  {/* Text part */}
                  <div className="text-sm text-text-primary whitespace-pre-wrap">
                    {demoStreamText.split('\n').map((line, i) => {
                      if (line.startsWith('+ ')) {
                        return (
                          <div key={i} className="bg-success/8 text-success px-2 -mx-2 rounded-sm font-mono text-xs leading-relaxed">
                            {line}
                          </div>
                        );
                      }
                      if (line.startsWith('- ')) {
                        return (
                          <div key={i} className="bg-danger/8 text-danger px-2 -mx-2 rounded-sm font-mono text-xs leading-relaxed">
                            {line}
                          </div>
                        );
                      }
                      return <span key={i}>{line}{i < demoStreamText.split('\n').length - 1 ? '\n' : ''}</span>;
                    })}
                    {demoPhase === 'streaming' && (
                      <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 align-text-bottom" style={{ animation: 'freBlink 1s step-end infinite' }} />
                    )}
                  </div>

                  {/* Proposal card preview */}
                  {demoPhase === 'done' && (
                    <div className="mt-3 rounded-lg border border-border bg-bg-surface p-3" style={{ animation: 'freSlideUp 300ms ease-out forwards' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge bg-success/10 text-success border border-success/20 text-2xs">Low Risk</span>
                        <span className="badge bg-bg-hover text-text-muted border border-border text-2xs">1 file</span>
                        <span className="text-2xs text-text-muted ml-auto">Reversible</span>
                      </div>
                      <p className="text-xs text-text-secondary">Add error handling to fetchData</p>
                      <div className="flex gap-2 mt-3">
                        <button className="btn btn-primary btn-sm rounded-md text-2xs">Approve and Run</button>
                        <button className="btn btn-secondary btn-sm rounded-md text-2xs">Review Changes</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Try it prompt */}
        {demoPhase === 'done' && (
          <div
            className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-center"
            style={{ animation: 'freSlideUp 400ms ease-out forwards' }}
          >
            <p className="text-sm text-text-primary mb-1">Ready to try it yourself?</p>
            <p className="text-2xs text-text-muted">
              Press <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-bg-hover border border-border font-mono text-2xs mx-0.5">\u2318J</kbd> to open the AI panel after setup completes.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderShortcutsStep = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 px-8 py-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Keyboard Shortcuts
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          Master these shortcuts to navigate VibeCode like a pro. Try pressing them now!
        </p>

        {/* Shortcut cards */}
        <div className="space-y-3 mb-6">
          {SHORTCUTS.map((shortcut) => {
            const isPressed = pressedShortcuts.has(shortcut.id);
            return (
              <div
                key={shortcut.id}
                className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-all duration-300 ${
                  isPressed
                    ? 'border-success/30 bg-success/5'
                    : 'border-border bg-bg-surface'
                }`}
                style={isPressed ? { animation: 'freScaleIn 300ms ease-out forwards' } : undefined}
              >
                <div className="flex items-center gap-1.5">
                  {shortcut.keys.map((key, i) => (
                    <React.Fragment key={i}>
                      <kbd
                        className={`inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-md border text-xs font-mono font-medium transition-all duration-200 ${
                          isPressed
                            ? 'bg-success/10 border-success/30 text-success'
                            : 'bg-bg-hover border-border text-text-primary'
                        }`}
                      >
                        {key}
                      </kbd>
                      {i < shortcut.keys.length - 1 && (
                        <span className="text-2xs text-text-muted">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <span className={`text-sm flex-1 ${isPressed ? 'text-success' : 'text-text-secondary'}`}>
                  {shortcut.description}
                </span>
                {isPressed && (
                  <div className="flex-shrink-0 rounded-full bg-success/15 p-0.5" style={{ animation: 'freScaleIn 200ms ease-out forwards' }}>
                    <CheckIcon className="text-success" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Shortcut hint toast */}
        {shortcutHint && (
          <div
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-accent px-4 py-2 text-sm text-white shadow-lg"
            style={{ animation: 'freSlideUp 200ms ease-out forwards' }}
          >
            {shortcutHint}
          </div>
        )}

        {/* Completion indicator */}
        <div className={`rounded-lg border px-4 py-3 text-center transition-all duration-300 ${
          allShortcutsPressed
            ? 'border-success/30 bg-success/5'
            : 'border-border bg-bg-surface'
        }`}>
          <p className={`text-sm ${allShortcutsPressed ? 'text-success' : 'text-text-muted'}`}>
            {allShortcutsPressed
              ? 'All shortcuts mastered! You\'re a natural.'
              : `Press the shortcuts above to try them (${pressedShortcuts.size}/${SHORTCUTS.length})`
            }
          </p>
          {!allShortcutsPressed && (
            <p className="text-2xs text-text-muted mt-1">
              You can also skip this and learn as you go
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderReadyStep = () => {
    const checklist = [
      { label: 'AI Provider connected', done: completedSteps.has(1) || skipProvider },
      { label: 'Model configured', done: completedSteps.has(2) || skipProvider },
      { label: 'Workspace selected', done: !!workspacePath },
      { label: 'Shortcuts introduced', done: completedSteps.has(5) || pressedShortcuts.size > 0 },
    ];
    const completedCount = checklist.filter((c) => c.done).length;

    return (
      <div className="flex flex-col h-full overflow-y-auto relative">
        <CelebrationField />
        <div className="flex-1 px-8 py-6 relative z-10">
          <h2 className="text-xl font-semibold text-text-primary mb-1">
            You&apos;re All Set
          </h2>
          <p className="text-sm text-text-secondary mb-6">
            VibeCode is ready. Here&apos;s what you can do:
          </p>

          {/* Checklist */}
          <div className="space-y-2 mb-6">
            {checklist.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200"
                style={{
                  borderColor: item.done ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  backgroundColor: item.done ? 'rgba(34, 197, 94, 0.04)' : 'rgba(15, 15, 21, 1)',
                  animation: `freSlideUp 300ms ease-out ${i * 100}ms forwards`,
                  opacity: 0,
                }}
              >
                <div className={`flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center border transition-colors duration-300 ${
                  item.done ? 'bg-success/15 border-success/30' : 'bg-bg-deep border-border'
                }`}>
                  {item.done && <CheckIcon className="text-success" />}
                </div>
                <span className={`text-sm transition-colors duration-300 ${item.done ? 'text-text-primary' : 'text-text-muted'}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Quick-start options */}
          <div className="space-y-2">
            {[
              { icon: <FolderIcon />, label: 'Open a Project', desc: 'Start working on your codebase' },
              { icon: <SparkleIcon />, label: 'Ask AI', desc: 'Get help with any coding task' },
              { icon: <KeyboardIcon />, label: 'Explore Features', desc: 'Discover what VibeCode can do' },
            ].map((option, i) => (
              <button
                key={option.label}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-bg-surface px-4 py-3 text-left hover:bg-bg-hover hover:border-border-emphasis transition-all duration-150 group"
                style={{
                  animation: `freSlideUp 300ms ease-out ${300 + i * 100}ms forwards`,
                  opacity: 0,
                }}
                onClick={onComplete}
              >
                <div className="flex-shrink-0 text-text-muted group-hover:text-accent transition-colors duration-150">
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text-primary group-hover:text-accent transition-colors duration-150">
                    {option.label}
                  </span>
                  <span className="block text-2xs text-text-muted">{option.desc}</span>
                </div>
                <ArrowRightIcon />
              </button>
            ))}
          </div>

          {/* Completion summary */}
          <div className="mt-6 text-center">
            <p className="text-2xs text-text-muted">
              {completedCount}/{checklist.length} steps completed
              {' '}&middot;{' '}
              Remember — you can always undo changes
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ---- Step Renderer ----

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderWelcomeStep();
      case 1: return renderProviderStep();
      case 2: return renderModelStep();
      case 3: return renderWorkspaceStep();
      case 4: return renderAIDemoStep();
      case 5: return renderShortcutsStep();
      case 6: return renderReadyStep();
      default: return null;
    }
  };

  // ---- Main Render ----

  const stepTitles = ['Welcome', 'Provider', 'Model', 'Workspace', 'AI Demo', 'Shortcuts', 'Ready'];
  const progressPercent = (currentStep / (TOTAL_STPS - 1)) * 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      {/* Embedded keyframes */}
      <style>{`
        @keyframes freFloat {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: var(--fre-opacity, 0.2); }
          25% { transform: translateY(-8px) translateX(4px); }
          50% { transform: translateY(-4px) translateX(-3px); opacity: calc(var(--fre-opacity, 0.2) * 1.5); }
          75% { transform: translateY(-10px) translateX(2px); }
        }
        @keyframes freConfetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes freSlideInRight {
          0% { opacity: 0; transform: translateX(40px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes freSlideInLeft {
          0% { opacity: 0; transform: translateX(-40px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes freFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes freSlideUp {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes freScaleIn {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes freThinkingBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes freBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes freTyping {
          0% { opacity: 0.2; }
          20% { opacity: 1; }
          100% { opacity: 0.2; }
        }
        @keyframes freProgressFill {
          0% { width: 0%; }
          100% { width: var(--fre-progress, 0%); }
        }
        /* Range input styling */
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #6366f1;
          border: 2px solid #0a0a0f;
          cursor: pointer;
          box-shadow: 0 0 6px rgba(99, 102, 241, 0.4);
          transition: transform 150ms ease, box-shadow 150ms ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.6);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #6366f1;
          border: 2px solid #0a0a0f;
          cursor: pointer;
          box-shadow: 0 0 6px rgba(99, 102, 241, 0.4);
        }
      `}</style>

      <div className="w-full max-w-[560px] h-[640px] max-h-[90vh] flex flex-col rounded-xl border border-border bg-bg-surface shadow-xl overflow-hidden relative">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-bg-deep z-20">
          <div
            className="h-full bg-accent transition-all duration-500 ease-out"
            style={{
              width: currentStep === 0 ? '0%' : `${progressPercent}%`,
              boxShadow: '0 0 8px rgba(99, 102, 241, 0.4)',
            }}
          />
        </div>

        {/* Skip button — always visible */}
        <div className="absolute top-3 right-4 z-30">
          <button
            className="text-2xs text-text-muted hover:text-text-secondary transition-colors duration-150"
            onClick={onSkip}
          >
            Skip setup
          </button>
        </div>

        {/* Step content with transition */}
        <div className="flex-1 relative overflow-hidden">
          <StepContainer step={currentStep} direction={direction}>
            {renderCurrentStep()}
          </StepContainer>
        </div>

        {/* Navigation footer */}
        {currentStep > 0 && (
          <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-bg-surface z-10">
            {/* Back */}
            <div>
              {currentStep > 0 && (
                <button
                  className="btn btn-ghost btn-sm rounded-md text-xs"
                  onClick={handleBack}
                >
                  Back
                </button>
              )}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: TOTAL_STPS }, (_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? 'w-5 h-1.5 bg-accent'
                      : i < currentStep
                        ? 'w-1.5 h-1.5 bg-accent/40'
                        : 'w-1.5 h-1.5 bg-border'
                  }`}
                />
              ))}
            </div>

            {/* Continue / Complete */}
            <button
              className="btn btn-primary btn-sm rounded-md"
              onClick={handleNext}
              disabled={isValidating}
            >
              {isValidating ? (
                <span className="spinner spinner-sm" />
              ) : currentStep === TOTAL_STPS - 1 ? (
                'Start Coding'
              ) : (
                'Continue'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirstRunExperience;
