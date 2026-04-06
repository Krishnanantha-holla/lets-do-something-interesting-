import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * FIX 9: Mobile bottom sheet wrapper for event/place detail.
 * On screens < 768px renders as a draggable bottom sheet.
 * On desktop renders nothing — parent renders DetailView inline.
 */
export default function MobileDetailSheet({ children, onClose }) {
  const sheetRef   = useRef(null);
  const startY     = useRef(0);
  const currentY   = useRef(0);
  const dragging   = useRef(false);
  const [translateY, setTranslateY] = useState(0);
  const [visible,    setVisible]    = useState(false);

  // Slide in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 280);
  }, [onClose]);

  // Touch drag handlers
  const onTouchStart = (e) => {
    startY.current   = e.touches[0].clientY;
    currentY.current = 0;
    dragging.current = true;
  };

  const onTouchMove = (e) => {
    if (!dragging.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy < 0) return; // don't allow dragging up
    currentY.current = dy;
    setTranslateY(dy);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    if (currentY.current > 100) {
      dismiss();
    } else {
      setTranslateY(0); // snap back
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 999,
          opacity: visible ? 1 : 0,
          transition: 'opacity 280ms ease',
        }}
        onClick={dismiss}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          height: '55vh',
          borderRadius: '16px 16px 0 0',
          zIndex: 1000,
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid var(--panel-border)',
          overflowY: 'auto',
          transform: visible
            ? `translateY(${translateY}px)`
            : 'translateY(100%)',
          transition: dragging.current ? 'none' : 'transform 280ms cubic-bezier(0.16,1,0.3,1)',
          willChange: 'transform',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{
            width: 32, height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.3)',
          }} />
        </div>

        {/* Content */}
        <div style={{ padding: '0 18px 24px' }}>
          {children}
        </div>
      </div>
    </>
  );
}
