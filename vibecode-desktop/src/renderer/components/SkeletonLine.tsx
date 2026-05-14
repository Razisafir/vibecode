import React from 'react';

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

/**
 * A single shimmer line used as a loading placeholder.
 */
const SkeletonLine: React.FC<SkeletonLineProps> = ({
  width = '100%',
  height = '14px',
  className = '',
}) => {
  return (
    <div
      className={`animate-shimmer rounded ${className}`}
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
