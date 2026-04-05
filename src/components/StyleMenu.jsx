import React, { useRef, useEffect, useState } from 'react';
import { Layers, Cuboid, Moon, Sun, Eclipse, Satellite, Mountain, Sparkles, Waves, Users, Flame, Compass, Download } from 'lucide-react';
import ExportModal from './ExportModal';

const OVERLAY_LAYERS = [
  { key: 'daynight',    label: 'Day / Night',          icon: Eclipse   },
  { key: 'iss',         label: 'ISS Tracker',           icon: Satellite },
  { key: 'tectonic',    label: 'Tectonic Plates',       icon: Mountain  },
  { key: 'aurora',      label: 'Aurora Forecast',       icon: Sparkles  },
  { key: 'currents',    label: 'Ocean Currents',        icon: Waves     },
  { key: 'faults',      label: 'Fault Lines',           icon: Mountain  },
  { key: 'population',  label: 'Population Density',    icon: Users     },
  { key: 'firms',       label: 'FIRMS Wildfires',       icon: Flame     },
  { key: 'magdecl',     label: 'Magnetic Declination',  icon: Compass   },
];

export default function StyleMenu({ mapStyleKey, setMapStyleKey, is3D, onToggle3D, theme, onToggleTheme, mapRef, filteredEvents }) {
  const [open, setOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState({});
  const [firmsCount, setFirmsCount] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (key) => { setMapStyleKey(key); setOpen(false); };

  const toggleOverlay = (key) => {
    setActiveLayers(prev => {
      const next = !prev[key];
      mapRef?.current?.toggleLayer(key, next);
      if (key === 'firms' && next) {
        // Register count callback
        setTimeout(() => mapRef?.current?.setFirmsCountCallback(setFirmsCount), 500);
      }
      return { ...prev, [key]: next };
    });
  };

  return (
    <>
    {showExport && (
      <ExportModal events={filteredEvents || []} onClose={() => setShowExport(false)} />
    )}
    <div style={{ position: 'absolute', top: 32, right: 32, zIndex: 40 }} ref={ref}>
      <button className={`settings-btn ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
        <Layers size={18} />
      </button>

      <div className={`style-controls ${open ? 'open' : ''}`} style={{ top: 54, right: 0, width: 270 }}>

        {/* Map style */}
        <div className="style-section-label">Map Style</div>
        <div className="segmented-control">
          <button className={mapStyleKey === 'light'    ? 'active' : ''} onClick={() => pick('light')}>Standard</button>
          <button className={mapStyleKey === 'hybrid'   ? 'active' : ''} onClick={() => pick('hybrid')}>Hybrid</button>
          <button className={mapStyleKey === 'satellite'? 'active' : ''} onClick={() => pick('satellite')}>Satellite</button>
        </div>

        <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '10px 0' }} />

        {/* View options */}
        <div className="style-section-label">View</div>
        <div className="toggle-list">
          <button className={`toggle-btn ${is3D ? 'active' : ''}`} onClick={() => { onToggle3D(); setOpen(false); }}>
            <Cuboid size={15} /> 3D Built Environment
          </button>
          <button className="toggle-btn active" onClick={() => { onToggleTheme(); setOpen(false); }}>
            {theme === 'dark' ? <><Sun size={15} /> Use Light UI</> : <><Moon size={15} /> Use Dark UI</>}
          </button>
        </div>

        <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '10px 0' }} />

        {/* Overlay layers */}
        <div className="style-section-label">Live Layers</div>
        <div className="toggle-list">
          {OVERLAY_LAYERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`toggle-btn overlay-toggle ${activeLayers[key] ? 'active' : ''}`}
              onClick={() => toggleOverlay(key)}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{label}{key === 'firms' && firmsCount > 0 ? ` (${firmsCount.toLocaleString()})` : ''}</span>
              <span className={`layer-pill ${activeLayers[key] ? 'on' : 'off'}`}>
                {activeLayers[key] ? 'ON' : 'OFF'}
              </span>
            </button>
          ))}
        </div>

        <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '10px 0' }} />

        {/* Export */}
        <button className="toggle-btn" onClick={() => { setShowExport(true); setOpen(false); }}
          style={{ color: 'var(--accent)', fontWeight: 600 }}>
          <Download size={15} /> Export Events
        </button>

      </div>
    </div>
    </>
  );
}
