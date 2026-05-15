import React, { useState, useEffect, useCallback } from 'react';

// ─── Glass Panel ─────────────────────────────────────────────────────────────
// Premium frosted glass panel with subtle border and depth

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  border?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'sm' | 'md' | 'lg' | 'xl';
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className = '',
  intensity = 'medium',
  border = true,
  padding = 'md',
  rounded = 'lg',
}) => {
  const bgMap = { low: 'rgba(15, 15, 21, 0.4)', medium: 'rgba(15, 15, 21, 0.6)', high: 'rgba(15, 15, 21, 0.85)' };
  const padMap = { none: '', sm: 'p-2', md: 'p-4', lg: 'p-6' };
  const roundMap = { sm: 'rounded-md', md: 'rounded-lg', lg: 'rounded-xl', xl: 'rounded-2xl' };

  return (
    <div
      className={`${padMap[padding]} ${roundMap[rounded]} ${className}`}
      style={{
        backgroundColor: bgMap[intensity],
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: border ? '1px solid rgba(255, 255, 255, 0.06)' : undefined,
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
      }}
    >
      {children}
    </div>
  );
};

// ─── Intelligent Empty State ─────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  suggestions,
  onSuggestionClick,
}) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 animate-fade-in">
    {icon && (
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 mb-4">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-text-primary mb-1 text-center">{title}</h3>
    <p className="text-xs text-text-muted mb-4 max-w-[240px] text-center leading-relaxed">{description}</p>
    {action && (
      <button className="btn btn-primary rounded-lg px-5" onClick={action.onClick}>
        {action.label}
      </button>
    )}
    {suggestions && suggestions.length > 0 && (
      <div className="flex flex-wrap justify-center gap-1.5 mt-3">
        {suggestions.map((s) => (
          <button
            key={s}
            className="rounded-full border border-border bg-bg-elevated/50 px-2.5 py-1 text-[10px] text-text-secondary transition-all duration-150 hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
            onClick={() => onSuggestionClick?.(s)}
          >
            {s}
          </button>
        ))}
      </div>
    )}
  </div>
);

// ─── Contextual Action Bar ───────────────────────────────────────────────────

interface ContextualAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  variant?: 'default' | 'primary' | 'danger';
  onClick: () => void;
}

interface ContextualActionBarProps {
  actions: ContextualAction[];
  visible: boolean;
  context?: string;
}

export const ContextualActionBar: React.FC<ContextualActionBarProps> = ({
  actions, visible, context,
}) => {
  if (!visible || actions.length === 0) return null;
  return (
    <div className="animate-slide-up flex items-center gap-1.5 px-3 py-2 rounded-xl border border-accent/20 bg-accent/5 backdrop-blur-md shadow-glow">
      {context && <span className="text-[10px] text-accent font-medium mr-2">{context}</span>}
      {actions.map((action) => (
        <button
          key={action.id}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
            action.variant === 'primary'
              ? 'bg-accent/20 text-accent hover:bg-accent/30'
              : action.variant === 'danger'
              ? 'bg-danger/10 text-danger hover:bg-danger/20'
              : 'bg-bg-elevated/50 text-text-secondary hover:bg-bg-hover hover:text-text-primary'
          }`}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
          {action.shortcut && (
            <kbd className="ml-1 px-1 py-0.5 rounded text-[9px] bg-bg-deep text-text-muted border border-border font-mono">
              {action.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
};

// ─── Premium Skeleton Loaders ────────────────────────────────────────────────

export const SkeletonText: React.FC<{ lines?: number; width?: string }> = ({ lines = 3, width }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="h-3 rounded animate-shimmer"
        style={{
          width: i === lines - 1 ? '60%' : width || '100%',
          background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 37%, var(--bg-elevated) 63%)',
          backgroundSize: '800px 100%',
        }}
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ rows?: number }> = ({ rows = 2 }) => (
  <div className="p-4 rounded-lg border border-border bg-bg-elevated/30">
    <div className="h-4 w-2/3 rounded mb-3 animate-shimmer" style={{ background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 37%, var(--bg-elevated) 63%)', backgroundSize: '800px 100%' }} />
    <SkeletonText lines={rows} />
  </div>
);

export const SkeletonList: React.FC<{ items?: number }> = ({ items = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-2">
        <div className="w-8 h-8 rounded-lg animate-shimmer" style={{ background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 37%, var(--bg-elevated) 63%)', backgroundSize: '800px 100%' }} />
        <div className="flex-1">
          <div className="h-3 w-3/4 rounded mb-1.5 animate-shimmer" style={{ background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 37%, var(--bg-elevated) 63%)', backgroundSize: '800px 100%' }} />
          <div className="h-2 w-1/2 rounded animate-shimmer" style={{ background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 37%, var(--bg-elevated) 63%)', backgroundSize: '800px 100%' }} />
        </div>
      </div>
    ))}
  </div>
);

// ─── Animated Counter ────────────────────────────────────────────────────────

export const AnimatedCounter: React.FC<{ value: number; duration?: number; suffix?: string }> = ({
  value, duration = 600, suffix = '',
}) => {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayed;
    const diff = value - startValue;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplayed(Math.round(startValue + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{displayed}{suffix}</span>;
};

// ─── Execution Confidence Ring ───────────────────────────────────────────────

interface ConfidenceRingProps {
  value: number; // 0-100
  size?: number;
  label?: string;
}

export const ConfidenceRing: React.FC<ConfidenceRingProps> = ({ value, size = 48, label }) => {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--bg-elevated)" strokeWidth={strokeWidth} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>{value}%</span>
        {label && <span className="text-[8px] text-text-muted">{label}</span>}
      </div>
    </div>
  );
};

// ─── Hover Reveal Actions ────────────────────────────────────────────────────

interface HoverRevealProps {
  children: React.ReactNode;
  actions: React.ReactNode;
}

export const HoverReveal: React.FC<HoverRevealProps> = ({ children, actions }) => (
  <div className="group relative">
    {children}
    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1">
      {actions}
    </div>
  </div>
);
