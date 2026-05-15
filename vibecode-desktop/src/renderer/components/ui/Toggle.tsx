import React from 'react';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Toggle switch component — consistent with design system.
 * Replaces the inline toggle pattern duplicated across Onboarding and Settings.
 */
export default function Toggle({ 
  enabled, 
  onChange, 
  label, 
  description, 
  disabled = false,
  size = 'md' 
}: ToggleProps) {
  const trackSize = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const thumbSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const thumbOffset = size === 'sm' 
    ? (enabled ? 'left-[14px]' : 'left-0.5') 
    : (enabled ? 'left-[18px]' : 'left-0.5');

  return (
    <div className="flex items-center justify-between gap-3">
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && <p className="text-sm text-text-primary">{label}</p>}
          {description && <p className="text-xs text-text-muted">{description}</p>}
        </div>
      )}
      <button
        className={`relative ${trackSize} rounded-full transition-colors duration-150 flex-shrink-0 ${
          enabled ? 'bg-accent' : 'bg-border'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !disabled && onChange(!enabled)}
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
      >
        <span
          className={`absolute top-0.5 ${thumbSize} rounded-full bg-white transition-transform duration-150 ${thumbOffset}`}
        />
      </button>
    </div>
  );
}
