import React, { useState, useEffect } from 'react';

/**
 * SkeletonLoader
 * Renders a pulsing placeholder that exactly mirrors the loaded app layout:
 * - Sidebar: 380px fixed left panel
 * - Globe area: absolute, same inset as .map-container (left:380px, rest:0)
 * Fades out when `loaded` becomes true, then unmounts.
 */
export default function SkeletonLoader({ loaded }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (loaded) {
      const t = setTimeout(() => setVisible(false), 700);
      return () => clearTimeout(t);
    }
  }, [loaded]);

  if (!visible) return null;

  return (
    <div className={`skeleton-overlay ${loaded ? 'skeleton-fade-out' : ''}`}>

      {/* ── Left sidebar skeleton — 380px, same as .sidebar ── */}
      <div className="skeleton-sidebar">
        <div className="skeleton-brand-row">
          <div className="skel skel-icon" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <div className="skel" style={{ width: '60%', height: 14 }} />
            <div className="skel" style={{ width: '40%', height: 10 }} />
          </div>
        </div>

        <div className="skel skel-search" />

        <div className="skeleton-tabs">
          <div className="skel skel-tab" />
          <div className="skel skel-tab" />
        </div>

        <div className="skel" style={{ width: '55%', height: 32, borderRadius: 999 }} />

        <div className="skeleton-chips">
          {[80, 90, 110, 75, 95].map((w, i) => (
            <div key={i} className="skel skel-chip" style={{ width: w }} />
          ))}
        </div>

        <div className="skeleton-stats">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skel skel-stat-card">
              <div className="skel-inner" style={{ width: '60%', height: 10, marginBottom: 8 }} />
              <div className="skel-inner" style={{ width: '40%', height: 18 }} />
            </div>
          ))}
        </div>

        <div className="skel" style={{ width: '80%', height: 10, marginTop: 8 }} />
      </div>

      {/* ── Globe area — position:absolute matching .map-container exactly ── */}
      <div className="skeleton-globe-area">
        {/* Full-bleed pulsing background — same footprint as the real globe */}
        <div className="skel-globe" />

        {/* Top-right style menu button */}
        <div className="skel skel-style-btn" />

        {/* Bottom-right map controls */}
        <div className="skeleton-controls">
          <div className="skel skel-ctrl" />
          <div className="skel skel-ctrl" />
          <div className="skel skel-ctrl" />
        </div>

        {/* Loading label — centered in the globe area */}
        <div className="skeleton-label">
          <div className="skeleton-spinner" />
          <span>Loading Atlas…</span>
        </div>
      </div>

    </div>
  );
}
