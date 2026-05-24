import React, { useCallback, useRef, useState } from 'react';

interface ResizeHandleProps {
  /**
   * Called on every mouse-move with the new desired width delta.
   * `delta` is the pixel distance dragged (positive = larger panel).
   */
  onResize: (delta: number) => void;

  /**
   * Which edge the handle sits on. Determines cursor and drag axis.
   * - 'right': handle on the right edge of a left panel (drag right → wider)
   * - 'left': handle on the left edge of a right panel (drag left → wider)
   */
  side: 'right' | 'left';
}

/**
 * A thin, draggable vertical handle for resizing adjacent panels.
 * Renders a 4px-wide hit area that expands on hover.
 */
const ResizeHandle: React.FC<ResizeHandleProps> = ({ onResize, side }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startXRef.current = e.clientX;
      setIsDragging(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        // For 'right' side: positive delta means wider panel
        // For 'left' side: negative delta means wider panel
        const effectiveDelta = side === 'right' ? delta : -delta;
        onResize(effectiveDelta);
        startXRef.current = moveEvent.clientX;
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize, side],
  );

  const isActive = isDragging || isHovered;

  return (
    <div
      className={`
        relative flex-shrink-0
        ${side === 'right' ? 'border-r' : 'border-l'}
        ${isActive ? 'border-accent' : 'border-transparent'}
        transition-colors duration-150
      `}
      style={{
        width: '4px',
        cursor: 'col-resize',
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visible indicator line */}
      <div
        className={`
          absolute top-0 bottom-0
          ${side === 'right' ? 'left-0' : 'right-0'}
          ${isActive ? 'w-0.5 bg-accent' : 'w-px bg-border'}
          transition-all duration-150
        `}
      />
    </div>
  );
};

export default ResizeHandle;
