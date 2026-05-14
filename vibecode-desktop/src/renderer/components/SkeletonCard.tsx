import React from 'react';

interface SkeletonCardProps {
  lines?: number;
  showAvatar?: boolean;
  className?: string;
}

/**
 * A card-shaped skeleton placeholder with optional avatar circle and multiple shimmer lines.
 * Uses design tokens (bg-bg-tertiary / bg-bg-hover) via the animate-shimmer CSS class.
 */
const SkeletonCard: React.FC<SkeletonCardProps> = ({
  lines = 3,
  showAvatar = false,
  className = '',
}) => {
  return (
    <div
      className={`rounded-lg border border-border bg-bg-tertiary p-4 animate-fade-in ${className}`}
      role="status"
      aria-label="Loading..."
    >
      <div className="flex gap-3">
        {showAvatar && (
          <div
            className="animate-shimmer h-10 w-10 flex-shrink-0 rounded-full bg-bg-tertiary"
          />
        )}
        <div className="flex-1 space-y-2.5">
          {Array.from({ length: lines }).map((_, i) => {
            const widthPct = i === lines - 1 ? '60%' : '100%';
            const heights = ['14px', '12px', '12px', '10px', '10px'];
            return (
              <div
                key={i}
                className="animate-shimmer rounded bg-bg-tertiary"
                style={{
                  width: widthPct,
                  height: heights[i] ?? '10px',
                  minWidth: '40px',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SkeletonCard;
