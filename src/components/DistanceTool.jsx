import React, { useState, useEffect } from 'react';
import { Search, X, Ruler, ArrowRight, RotateCcw, MapPin } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCoords(str) {
  const m = str.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function toPin(item) {
  return { latitude: item.lat, longitude: item.lng, name: item.display.split(',')[0], full_name: item.display };
}

function PointInput({ label, color, value, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [focused, setFocused] = useState(false);
  const debounced = useDebounce(query, 400);

  // Fetch results
  useEffect(() => {
    if (!debounced || debounced.length < 2) { setResults([]); return; }
    const coords = parseCoords(debounced);
    if (coords) {
      setResults([{ type: 'coords', lat: coords.lat, lng: coords.lng, display: `${coords.lat}, ${coords.lng}` }]);
      return;
    }
    let cancelled = false;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(debounced)}&limit=5`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setResults(data.map(d => ({ type: 'place', lat: parseFloat(d.lat), lng: parseFloat(d.lon), display: d.display_name })));
      })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [debounced]);


  const select = (item) => {
    setQuery('');
    setResults([]);
    setFocused(false);
    onSelect(toPin(item));
  };

  const clear = () => { setQuery(''); setResults([]); onClear(); };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 0 3px ${color}33` }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      </div>
      <div className={`dist-input-wrap ${focused ? 'focused' : ''}`}>
        <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          className="dist-input"
          placeholder="Place name or lat, lng…"
          value={query}
          onChange={e => { setQuery(e.target.value); if (value) onClear(); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results.length > 0) {
              e.preventDefault();
              select(results[0]);
            }
          }}
        />
        {value && <button className="search-clear" onClick={clear}><X size={13} /></button>}
      </div>
      {value && (
        <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 4, paddingLeft: 2, fontWeight: 500 }}>
          📍 {value.name} ({value.latitude.toFixed(4)}, {value.longitude.toFixed(4)})
        </div>
      )}
      {/* Dropdown — only shown while focused so user can override the auto-select */}
      {results.length > 0 && focused && (
        <div className="autocomplete-dropdown glass" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4 }}>
          {results.map((r, i) => (
            <button key={i} className="auto-item" onMouseDown={() => select(r)} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ marginTop: '1px', display: 'flex' }}>
                {r.type === 'coords' ? '📌' : <MapPin size={14} color={color} />}
              </span>
              <span style={{ textAlign: 'left', lineHeight: '1.2' }}>{r.display}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DistanceTool({ onMeasure, onClear }) {
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);
  const [result, setResult] = useState(null);

  const calculate = () => {
    if (!pointA || !pointB) return;
    setResult(haversine(pointA.latitude, pointA.longitude, pointB.latitude, pointB.longitude));
    onMeasure(pointA, pointB);
  };

  const reset = () => { setPointA(null); setPointB(null); setResult(null); onClear(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ruler size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Measure Distance</span>
        </div>
        {(pointA || pointB) && (
          <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', fontFamily: 'var(--font-family)' }}>
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      {/* Point A */}
      <PointInput
        label="Point A" color="#007aff"
        value={pointA}
        onSelect={p => { setPointA(p); setResult(null); }}
        onClear={() => { setPointA(null); setResult(null); onClear(); }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--panel-border-inner)' }} />
        <ArrowRight size={14} color="var(--muted)" />
        <div style={{ flex: 1, height: 1, background: 'var(--panel-border-inner)' }} />
      </div>

      {/* Point B */}
      <PointInput
        label="Point B" color="#ff3b30"
        value={pointB}
        onSelect={p => { setPointB(p); setResult(null); }}
        onClear={() => { setPointB(null); setResult(null); onClear(); }}
      />

      {/* Calculate button — only when both filled and no result yet */}
      {pointA && pointB && !result && (
        <button className="calc-btn" onClick={calculate}>
          <Ruler size={15} /> Calculate Distance
        </button>
      )}

      {/* Result */}
      {result !== null && (
        <div className="distance-result">
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
            Great-circle distance
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {result >= 1000 ? (result / 1000).toFixed(2) : Math.round(result)}
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--muted)' }}>
              {result >= 1000 ? 'thousand km' : 'km'}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            ≈ {Math.round(result * 0.621371).toLocaleString()} miles
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 3 }}>
            {pointA.name} → {pointB.name}
          </div>
        </div>
      )}

      {/* Hint */}
      {!pointA && !pointB && (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
          Type a place name or coordinates like{' '}
          <code style={{ background: 'var(--control-bg)', padding: '1px 6px', borderRadius: 4 }}>28.6, 77.2</code>{' '}
          in both fields, then hit Calculate.
        </p>
      )}
    </div>
  );
}
