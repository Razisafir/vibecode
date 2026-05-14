import React from 'react';

interface SkeletonCardProps {
  lines?: number;
  showAvatar?: boolean;
  className?: string;
}

/**
 * A card-shaped skeleton placeholder with optional avatar circle and multiple shimmer lines.
 */
const SkeletonCard: React.FC<SkeletonCardProps> = ({
  lines = 3,
  showAvatar = false,
  className = '',
}) => {
  return (
    <div
      className={`rounded-lg border border-border bg-bg-tertiary p-4 ${className}`}
      role="status"
      aria-label="Loading..."
    >
      <div className="flex gap-3">
        {showAvatar && (
          <div
            className="animate-shimmer h-10 w-10 flex-shrink-0 rounded-full"
          />
        )}
        <div className="flex-1 space-y-2.5">
          {Array.from({ length: lines }).map((_, i) => {
            const widthPct = i === lines - 1 ? '60%' : '100%';
            const heights = ['14px', '12px', '12px', '10px', '10px'];
            return (
              <div
                key={i}
                className="animate-shimmer rounded"
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
