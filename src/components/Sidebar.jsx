import React, { useState, useEffect, useCallback } from 'react';
import { Search, Activity, X, Globe, Ruler, Zap, Flame, Mountain, CloudLightning, Waves, Sun, Wind, ArrowDownCircle, Snowflake, Anchor, Thermometer } from 'lucide-react';

const CATEGORY_ICONS = {
  wildfires: Flame,
  volcanoes: Mountain,
  severeStorms: CloudLightning,
  earthquakes: Activity,
  floods: Waves,
  drought: Sun,
  dustHaze: Wind,
  landslides: ArrowDownCircle,
  snow: Snowflake,
  seaLakeIce: Anchor,
  tempExtremes: Thermometer,
};
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../api';
import { useDebounce } from '../hooks/useDebounce';
import DetailView from './DetailView';
import DistanceTool from './DistanceTool';

// Detect "lat, lng" pattern
function parseCoords(str) {
  const m = str.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function Sidebar({
  searchPin, selectedEvent,
  wikiData, weatherData, loadingWiki, loadingWeather,
  activeCategories, onToggleCategory,
  activeEventCount,
  events, onEventClick,
  onFlyTo, onBack, onShare,
  onMeasure, onMeasureClear,
}) {
  const [tab, setTab] = useState('explore'); // 'explore' | 'measure'
  const [searchQuery, setSearchQuery] = useState('');
  const [geocoderResults, setGeocoderResults] = useState([]);
  const debouncedQuery = useDebounce(searchQuery, 350);

  useEffect(() => {
    if (debouncedQuery.length < 2) { setGeocoderResults([]); return; }

    // Coordinate shortcut — no network call needed
    const coords = parseCoords(debouncedQuery);
    if (coords) {
      setGeocoderResults([{
        lon: coords.lng, lat: coords.lat,
        display_name: `${coords.lat}, ${coords.lng}`,
        _isCoord: true,
      }]);
      return;
    }

    if (debouncedQuery.length < 3) return;
    let cancelled = false;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(debouncedQuery)}&limit=5`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setGeocoderResults(data || []); })
      .catch(() => { if (!cancelled) setGeocoderResults([]); });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const flyToLocation = useCallback((loc) => {
    const lon = parseFloat(loc.lon);
    const lat = parseFloat(loc.lat);
    const name = loc._isCoord ? `${lat}, ${lon}` : loc.display_name.split(',')[0];
    onFlyTo({ longitude: lon, latitude: lat, name, full_name: loc.display_name });
    setSearchQuery('');
    setGeocoderResults([]);
  }, [onFlyTo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && geocoderResults.length > 0) flyToLocation(geocoderResults[0]);
  };

  const showDetail = searchPin || selectedEvent;

  return (
    <aside className="sidebar">
      {/* ── Header ── */}
      <div className="sidebar-header">
        {showDetail ? (
          <button className="back-btn" onClick={onBack}>
            <span style={{ fontSize: '1.1rem' }}>←</span> Back
          </button>
        ) : (
          <>
            <div className="sidebar-brand">
              <div className="brand-icon"><Globe size={18} color="#fff" /></div>
              <div>
                <h1 className="app-title">Atlas</h1>
                <p className="app-subtitle">Interactive Global Map</p>
              </div>
            </div>

            {/* Search */}
            <div className="search-container">
              <Search className="search-icon" size={15} />
              <input
                type="text"
                className="search-input"
                placeholder="Search places, events or coordinates…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {searchQuery && (
                <button className="search-clear" onClick={() => { setSearchQuery(''); setGeocoderResults([]); }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {geocoderResults.length > 0 && searchQuery && (
              <div className="autocomplete-dropdown glass">
                {geocoderResults.map((loc, i) => (
                  <button key={i} className="auto-item" onClick={() => flyToLocation(loc)}>
                    {loc._isCoord ? <><span style={{ color: 'var(--accent)', marginRight: 6 }}>📌</span>{loc.display_name}</> : loc.display_name}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="sidebar-tabs">
              <button className={`sidebar-tab ${tab === 'explore' ? 'active' : ''}`} onClick={() => setTab('explore')}>
                <Zap size={13} /> Explore
              </button>
              <button className={`sidebar-tab ${tab === 'measure' ? 'active' : ''}`} onClick={() => setTab('measure')}>
                <Ruler size={13} /> Measure
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Content ── */}
      <div className="sidebar-content">
        {showDetail ? (
          <DetailView
            searchPin={searchPin}
            selectedEvent={selectedEvent}
            wikiData={wikiData}
            weatherData={weatherData}
            loadingWiki={loadingWiki}
            loadingWeather={loadingWeather}
            onShare={onShare}
          />
        ) : tab === 'measure' ? (
          <DistanceTool onMeasure={onMeasure} onClear={onMeasureClear} />
        ) : (
          <>
            {/* Active events badge */}
            <div className="stat-badge">
              <span className="live-dot" />
              <Activity size={13} color="var(--accent)" />
              <span>{activeEventCount} active events</span>
            </div>

            {/* Horizontal Filter Chips */}
            <div className="filter-scroll">
              {Object.entries(CATEGORY_LABELS).map(([catId, label]) => {
                const active = activeCategories.includes(catId);
                const Icon = CATEGORY_ICONS[catId] || Flame;
                return (
                  <button
                    key={catId}
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() => onToggleCategory(catId)}
                    style={{ '--cat-color': CATEGORY_COLORS[catId] }}
                  >
                    <Icon size={13} /> {label}
                  </button>
                );
              })}
            </div>

            {/* Event Feed */}
            <div className="section-label" style={{ marginTop: 12, marginBottom: 8 }}>Latest Activity Feed</div>
            <div className="event-feed">
              {events && events.slice(0, 100).map(ev => {
                const Icon = CATEGORY_ICONS[ev.categoryId] || Flame;
                const d = new Date(ev.startTime);
                const dateStr = !isNaN(d) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
                return (
                  <div key={ev.id} className="event-feed-card" onClick={() => onEventClick(ev.id)} style={{ '--cat-color': ev.color }}>
                    <div className="event-card-top">
                      <div className="event-cat-badge" style={{ backgroundColor: `${ev.color}22`, color: ev.color }}>
                        <Icon size={12} strokeWidth={2.5} /> <span>{ev.categoryTitle}</span>
                      </div>
                      <div className="event-date">{dateStr}</div>
                    </div>
                    <div className="event-card-title">{ev.title}</div>
                    {ev.status === 'open' && (
                      <div className="event-status-live">
                        <span className="live-dot-small" /> Active Now
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
