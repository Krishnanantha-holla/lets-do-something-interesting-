import React, { useRef, useEffect, useState } from 'react';
import { Layers, Cuboid, Moon, Sun } from 'lucide-react';

export default function StyleMenu({ mapStyleKey, setMapStyleKey, is3D, onToggle3D, theme, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (key) => { setMapStyleKey(key); setOpen(false); };

  return (
    <div className="style-menu-anchor" style={{ position: 'absolute', top: 32, right: 32, zIndex: 250 }} ref={ref}>
      <button className={`settings-btn ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
        <Layers size={18} />
      </button>

      <div className={`style-controls ${open ? 'open' : ''}`} style={{ top: 54, right: 0, width: 240 }}>
        <div className="style-section-label">Map Style</div>
        <div className="segmented-control">
          <button className={mapStyleKey === 'light'     ? 'active' : ''} onClick={() => pick('light')}>Standard</button>
          <button className={mapStyleKey === 'hybrid'    ? 'active' : ''} onClick={() => pick('hybrid')}>Hybrid</button>
          <button className={mapStyleKey === 'satellite' ? 'active' : ''} onClick={() => pick('satellite')}>Satellite</button>
        </div>

        <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '10px 0' }} />

        <div className="style-section-label">View</div>
        <div className="toggle-list">
          <button className={`toggle-btn ${is3D ? 'active' : ''}`} onClick={() => { onToggle3D(); setOpen(false); }}>
            <Cuboid size={15} /> 3D Built Environment
          </button>
          <button className="toggle-btn active" onClick={() => { onToggleTheme(); setOpen(false); }}>
            {theme === 'dark' ? <><Sun size={15} /> Use Light UI</> : <><Moon size={15} /> Use Dark UI</>}
          </button>
        </div>
      </div>
    </div>
  );
}
