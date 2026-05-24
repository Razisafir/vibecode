import React from 'react';

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

/**
 * A single shimmer line used as a loading placeholder.
 * Uses design tokens (bg-bg-elevated / bg-bg-hover) via the animate-shimmer CSS class
 * for a smooth, consistent shimmer effect that respects the design system.
 */
const SkeletonLine: React.FC<SkeletonLineProps> = ({
  width = '100%',
  height = '14px',
  className = '',
}) => {
  return (
    <div
      className={`animate-shimmer rounded bg-bg-elevated ${className}`}
      style={{
        width,
        height,
        minWidth: '40px',
      }}
      role="status"
      aria-label="Loading..."
    />
  );
};

export default SkeletonLine;
