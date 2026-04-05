import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../api';

export default function CompoundPanel({ compound, onClose }) {
  if (!compound) return null;

  return (
    <div className="compound-panel glass">
      <div className="compound-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#ffd60a" />
          <span className="compound-title">Compound Event Detected</span>
        </div>
        <button className="share-close" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="compound-severity">
        Severity Score: <strong style={{ color: '#ffd60a' }}>{compound.severity}</strong>
        <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 6 }}>
          ({compound.categories.length} co-occurring categories × 10)
        </span>
      </div>

      <div className="compound-cats">
        {compound.categories.map(catId => (
          <span key={catId} className="compound-cat-badge"
            style={{ background: `${CATEGORY_COLORS[catId] || '#aaa'}22`, color: CATEGORY_COLORS[catId] || '#aaa' }}>
            {CATEGORY_LABELS[catId] || catId}
          </span>
        ))}
      </div>

      <div className="compound-events-label">Correlated Events ({compound.events.length})</div>
      <div className="compound-events-list">
        {compound.events.map(ev => (
          <div key={ev.id} className="compound-event-row">
            <span className="compound-event-dot" style={{ background: CATEGORY_COLORS[ev.categoryId] || '#aaa' }} />
            <div>
              <div className="compound-event-title">{ev.title.replace(/\s+\d{6,}$/, '')}</div>
              <div className="compound-event-meta">
                {ev.categoryTitle} · {new Date(ev.startTime).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
