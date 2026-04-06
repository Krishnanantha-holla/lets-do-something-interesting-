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
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [focused, setFocused] = useState(false);
  const debounced = useDebounce(query, 400);

  // Fetch suggestions — never auto-select, only populate the dropdown
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
        if (!cancelled) setResults(data.map(d => ({
          type: 'place', lat: parseFloat(d.lat), lng: parseFloat(d.lon), display: d.display_name,
        })));
      })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [debounced]);

  // Explicit selection only — called from click or Enter key
  const select = (item) => {
    setQuery(item.display.split(',')[0]);
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
              select(results[0]); // Enter picks top result explicitly
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
      {/* Dropdown only while focused and no value confirmed yet */}
      {results.length > 0 && focused && !value && (
        <div className="autocomplete-dropdown glass" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4 }}>
          {results.map((r, i) => (
            <button key={i} className="auto-item" onMouseDown={() => select(r)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
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

export default function DistanceTool({ onMeasure, onClear, prefillA }) {
  const [pointA, setPointA] = useState(prefillA || null);
  const [pointB, setPointB] = useState(null);
  const [result, setResult] = useState(null);
  const [roadDist, setRoadDist]   = useState(null);   // FIX 6: OSRM road distance
  const [roadLoading, setRoadLoading] = useState(false);
  const [roadError,   setRoadError]   = useState(false);

  useEffect(() => {
    if (prefillA) { setPointA(prefillA); setResult(null); setRoadDist(null); onClear(); }
  }, [prefillA]);

  const calculate = async () => {
    if (!pointA || !pointB) return;
    const straight = haversine(pointA.latitude, pointA.longitude, pointB.latitude, pointB.longitude);
    setResult(straight);
    onMeasure(pointA, pointB);

    // FIX 6: fetch OSRM road route
    setRoadLoading(true);
    setRoadError(false);
    setRoadDist(null);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${pointA.longitude},${pointA.latitude};${pointB.longitude},${pointB.latitude}?overview=full&geometries=geojson`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        setRoadDist((data.routes[0].distance / 1000).toFixed(1));
        // Pass route geometry up so MapView can draw it
        onMeasure(pointA, pointB, data.routes[0].geometry);
      } else {
        setRoadError(true);
      }
    } catch {
      setRoadError(true);
    } finally {
      setRoadLoading(false);
    }
  };

  const reset = () => {
    setPointA(null); setPointB(null);
    setResult(null); setRoadDist(null); setRoadError(false);
    onClear();
  };

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
        onSelect={p => { setPointA(p); setResult(null); setRoadDist(null); }}
        onClear={() => { setPointA(null); setResult(null); setRoadDist(null); onClear(); }}
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
        onSelect={p => { setPointB(p); setResult(null); setRoadDist(null); }}
        onClear={() => { setPointB(null); setResult(null); setRoadDist(null); onClear(); }}
      />

      {/* Calculate button */}
      {pointA && pointB && !result && (
        <button className="calc-btn" onClick={calculate}>
          <Ruler size={15} /> Calculate Distance
        </button>
      )}

      {/* Result — FIX 6: shows both straight-line and road distance */}
      {result !== null && (
        <div className="distance-result">
          {/* Straight-line */}
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
            As the crow flies
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {result >= 1000 ? (result / 1000).toFixed(2) : Math.round(result)}
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--muted)' }}>
              {result >= 1000 ? 'thousand km' : 'km'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 4 }}>
              ≈ {Math.round(result * 0.621371).toLocaleString()} mi
            </span>
          </div>

          {/* Road distance */}
          <div style={{ borderTop: '1px solid var(--panel-border-inner)', paddingTop: 10 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
              Via roads
            </div>
            {roadLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '0.82rem' }}>
                <span className="replay-spinner" style={{ width: 14, height: 14 }} /> Fetching route…
              </div>
            ) : roadDist ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {roadDist}
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--muted)' }}>km</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 4 }}>
                  ≈ {Math.round(parseFloat(roadDist) * 0.621371).toLocaleString()} mi
                </span>
              </div>
            ) : roadError ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                Road route unavailable
              </div>
            ) : null}
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 8 }}>
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
