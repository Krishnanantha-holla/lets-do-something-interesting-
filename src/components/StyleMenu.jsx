import React, { useRef, useEffect } from 'react';
import { Layers, Cuboid, Moon, Sun } from 'lucide-react';

export default function StyleMenu({ mapStyleKey, setMapStyleKey, is3D, onToggle3D, theme, onToggleTheme }) {
  const [open, setOpen] = React.useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (key) => { setMapStyleKey(key); setOpen(false); };

  return (
    <div style={{ position: 'absolute', top: 32, right: 32, zIndex: 40 }} ref={ref}>
      <button className={`settings-btn ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
        <Layers size={18} />
      </button>

      <div className={`style-controls ${open ? 'open' : ''}`} style={{ top: 54, right: 0 }}>
        <div className="segmented-control">
          <button className={mapStyleKey === 'light' ? 'active' : ''} onClick={() => pick('light')}>Standard</button>
          <button className={mapStyleKey === 'hybrid' ? 'active' : ''} onClick={() => pick('hybrid')}>Hybrid</button>
          <button className={mapStyleKey === 'satellite' ? 'active' : ''} onClick={() => pick('satellite')}>Satellite</button>
        </div>

        <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '8px 0' }} />

        <div className="toggle-list">
          <button className={`toggle-btn ${is3D ? 'active' : ''}`} onClick={() => { onToggle3D(); setOpen(false); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cuboid size={16} /> 3D Built Environment
            </div>
          </button>
          <button className="toggle-btn active" onClick={() => { onToggleTheme(); setOpen(false); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {theme === 'dark' ? <><Sun size={16} /> Use Light UI</> : <><Moon size={16} /> Use Dark UI</>}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
