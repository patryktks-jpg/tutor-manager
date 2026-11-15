import React, { useState, useRef } from 'react';
import { IconCheck, IconX } from './Icons';

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeRight?: () => void; // e.g. quick complete + BLIK
  onSwipeLeft?: () => void;  // e.g. cancel
  rightLabel?: string;
  leftLabel?: string;
}

export const SwipeableCard: React.FC<SwipeableCardProps> = ({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Zrealizowana + BLIK',
  leftLabel = 'Odwołaj'
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    isDragging.current = true;
    startX.current = 'touches' in e ? e.touches[0].clientX : e.clientX;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diff = currentX - startX.current;
    // Limit drag to reasonable range
    if (Math.abs(diff) < 140) {
      setOffsetX(diff);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (offsetX > 75 && onSwipeRight) {
      onSwipeRight();
    } else if (offsetX < -75 && onSwipeLeft) {
      onSwipeLeft();
    }

    setOffsetX(0);
  };

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        marginBottom: 12
      }}
    >
      {/* Background action for Swipe Right (Green: Done + Paid) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '50%',
          backgroundColor: 'var(--ios-green)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 20,
          gap: 8,
          fontWeight: 600,
          fontSize: 14,
          opacity: offsetX > 20 ? 1 : 0,
          transition: 'opacity 0.15s ease'
        }}
      >
        <IconCheck size={22} />
        <span>{rightLabel}</span>
      </div>

      {/* Background action for Swipe Left (Red: Cancel) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: '50%',
          backgroundColor: 'var(--ios-red)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 20,
          gap: 8,
          fontWeight: 600,
          fontSize: 14,
          opacity: offsetX < -20 ? 1 : 0,
          transition: 'opacity 0.15s ease'
        }}
      >
        <span>{leftLabel}</span>
        <IconX size={22} />
      </div>

      {/* Main card foreground */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseMove={handleTouchMove}
        onMouseUp={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'pan-y'
        }}
      >
        {children}
      </div>
    </div>
  );
};
