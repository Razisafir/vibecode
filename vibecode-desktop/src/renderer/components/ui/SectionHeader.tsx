import React from 'react';

interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent section header for sidebar panels.
 * Replaces the repeated uppercase tracking-wider pattern.
 */
export default function SectionHeader({ title, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`mb-3 flex items-center justify-between ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
