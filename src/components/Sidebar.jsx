import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Activity, X, Globe, Ruler, Zap, Flame, Mountain,
  CloudLightning, Waves, Sun, Wind, ArrowDownCircle, Snowflake,
  Anchor, Thermometer, List, Eclipse, Satellite, Sparkles, Users, Compass, Download,
  Eye, EyeOff, ChevronDown, ChevronRight,
} from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../api';
import { useDebounce } from '../hooks/useDebounce';
import DetailView from './DetailView';
import DistanceTool from './DistanceTool';
import ReplayBar from './ReplayBar';
import TimeMachineBar from './TimeMachineBar';
import ExportModal from './ExportModal';

const CATEGORY_ICONS = {
  wildfires: Flame, volcanoes: Mountain, severeStorms: CloudLightning,
  earthquakes: Activity, floods: Waves, drought: Sun, dustHaze: Wind,
  landslides: ArrowDownCircle, snow: Snowflake, seaLakeIce: Anchor,
  tempExtremes: Thermometer,
};

const OVERLAY_LAYERS = [
  { key: 'daynight',   label: 'Day / Night',         icon: Eclipse   },
  { key: 'iss',        label: 'ISS Tracker',          icon: Satellite },
  { key: 'tectonic',   label: 'Tectonic Plates',      icon: Mountain  },
  { key: 'aurora',     label: 'Aurora Forecast',      icon: Sparkles  },
  { key: 'currents',   label: 'Ocean Currents',       icon: Waves     },
  { key: 'faults',     label: 'Fault Lines',          icon: Mountain  },
  { key: 'population', label: 'Population Density',   icon: Users     },
  { key: 'firms',      label: 'FIRMS Wildfires',      icon: Flame     },
  { key: 'magdecl',    label: 'Magnetic Declination', icon: Compass   },
];

function parseCoords(str) {
  const m = str.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

const US_STATES = ['Iowa','California','Texas','Florida','Oregon','Washington','Montana',
  'Idaho','Colorado','Arizona','New Mexico','Georgia','Alaska','Hawaii','Nevada','Utah',
  'Wyoming','Nebraska','Kansas','Oklahoma','Arkansas','Louisiana','Mississippi','Alabama',
  'Tennessee','Kentucky','Indiana','Ohio','Michigan','Wisconsin','Minnesota','Illinois',
  'Missouri','North Dakota','South Dakota','Virginia','West Virginia','Maryland','Delaware',
  'Pennsylvania','New York','New Jersey','Connecticut','Rhode Island','Massachusetts',
  'Vermont','New Hampshire','Maine','North Carolina','South Carolina'];

const COUNTRY_KEYWORDS = [
  'Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bangladesh','Belarus','Bolivia','Brazil','Bulgaria','Cambodia','Cameroon',
  'Canada','Chile','China','Colombia','Congo','Croatia','Czech','Denmark','Ecuador','Egypt',
  'Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Honduras',
  'Hungary','India','Indonesia','Iran','Iraq','Israel','Italy','Japan','Jordan','Kazakhstan',
  'Kenya','Kyrgyzstan','Laos','Lebanon','Libya','Madagascar','Malaysia','Mali','Mexico',
  'Moldova','Mongolia','Morocco','Mozambique','Myanmar','Nepal','Netherlands','New Zealand',
  'Nicaragua','Niger','Nigeria','North Korea','Norway','Pakistan','Panama','Papua','Paraguay',
  'Peru','Philippines','Poland','Portugal','Romania','Russia','Rwanda','Saudi Arabia',
  'Senegal','Serbia','Somalia','South Africa','South Korea','Spain','Sri Lanka','Sudan',
  'Sweden','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Tunisia','Turkey','Uganda',
  'Ukraine','United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam',
  'Yemen','Zambia','Zimbabwe',
  ...US_STATES,
];

function countCountries(events) {
  const found = new Set();
  events.forEach(ev => {
    const title = (ev.title || '').toLowerCase();
    COUNTRY_KEYWORDS.forEach(kw => {
      if (title.includes(kw.toLowerCase())) {
        found.add(US_STATES.includes(kw) ? 'United States' : kw);
      }
    });
  });
  if (found.size < 3) {
    // Fallback: count unique 30° grid cells as rough proxy
    const cells = new Set();
    events.forEach(ev => {
      if (ev.lng != null && ev.lat != null) {
        cells.add(`${Math.round(ev.lat / 30) * 30},${Math.round(ev.lng / 30) * 30}`);
      }
    });
    return Math.min(cells.size * 4, 80);
  }
  return found.size;
}

function mostActiveCategory(events) {
  const counts = {};
  events.forEach(ev => {
    counts[ev.categoryId] = (counts[ev.categoryId] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return '—';
  const label = CATEGORY_LABELS[top[0]] || top[0];
  const Icon = CATEGORY_ICONS[top[0]];
  return { label, catId: top[0], Icon };
}

function formatLastUpdated() {
  return new Date().toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ── Activity Feed Drawer ──────────────────────────────────────────────────────

function FeedDrawer({ events, eventsLoading, onEventClick, onClose, drawerRef }) {
  return (
    <div className="feed-drawer" ref={drawerRef}>
      <div className="feed-drawer-header">
        <span className="feed-drawer-title">Activity Feed</span>
        <button className="share-close" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="feed-drawer-body">
        {eventsLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '16px 0' }}>Loading events…</div>
        ) : (
          events.slice().reverse().slice(0, 100).map(ev => {
            const Icon = CATEGORY_ICONS[ev.categoryId] || Flame;
            const d = new Date(ev.startTime);
            const dateStr = !isNaN(d)
              ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Recent';
            const cleanTitle = ev.title.replace(/\s+\d{6,}$/, '');
            return (
              <div
                key={ev.id}
                className="event-feed-card"
                onClick={() => { onEventClick(ev.id); onClose(); }}
                style={{ '--cat-color': ev.color }}
              >
                <div className="event-card-top">
                  <div className="event-cat-badge" style={{ backgroundColor: `${ev.color}22`, color: ev.color }}>
                    <Icon size={12} strokeWidth={2.5} /> <span>{ev.categoryTitle}</span>
                  </div>
                  <div className="event-date">{dateStr}</div>
                </div>
                <div className="event-card-title">{cleanTitle}</div>
                {ev.status === 'open' && (
                  <div className="event-status-live">
                    <span className="live-dot-small" /> Active Now
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Stats Grid ────────────────────────────────────────────────────────────────

function StatsGrid({ events, activeEventCount, eventsLoading, lastUpdated }) {
  const countryCount = useMemo(() => countCountries(events), [events]);
  const topCat       = useMemo(() => mostActiveCategory(events), [events]);

  const cards = [
    {
      label: 'Active Events',
      value: eventsLoading ? '—' : activeEventCount,
      sub: 'currently open',
    },
    {
      label: 'Countries Affected',
      value: eventsLoading ? '—' : countryCount,
      sub: 'regions impacted',
    },
    {
      label: 'Most Active Type',
      value: eventsLoading ? '—' : (topCat?.label || '—'),
      sub: topCat && !eventsLoading ? `${CATEGORY_LABELS[topCat.catId] || ''}` : '',
      color: topCat ? CATEGORY_COLORS[topCat.catId] : undefined,
    },
    {
      label: 'Last Updated',
      value: lastUpdated,
      sub: 'refreshes every 5 min',
    },
  ];

  return (
    <div className="stats-section">
      <div className="stats-2x2">
        {cards.map((c, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-label">{c.label}</div>
            <div className="stat-card-value" style={c.color ? { color: c.color } : {}}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
      <div className="stats-footer">
        Data source: NASA EONET API v3 · Refreshes every 5 min
      </div>
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({
  searchPin, selectedEvent,
  wikiData, weatherData, loadingWiki, loadingWeather,
  activeCategories, onToggleCategory,
  activeEventCount, eventsLoading,
  events, onEventClick,
  onFlyTo, onBack, onShare,
  onMeasure, onMeasureClear,
  compoundCount,
  activeLayers, onToggleLayer, firmsCount,
  mapRef, onHideLive, onShowLive,
  markersVisible, onToggleMarkers,
}) {
  const [tab,           setTab]           = useState('explore');
  const [measurePrefill,setMeasurePrefill]= useState(null);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [geocoderResults,setGeocoderResults] = useState([]);
  const [feedOpen,      setFeedOpen]      = useState(false);
  const [showExport,    setShowExport]    = useState(false);
  const [layersOpen,    setLayersOpen]    = useState(false); // collapsed by default
  const [lastUpdated]                     = useState(formatLastUpdated);
  const drawerRef = useRef(null);
  const debouncedQuery = useDebounce(searchQuery, 350);

  // Count events from today for the badge
  const todayCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (events || []).filter(ev => new Date(ev.startTime) >= today).length;
  }, [events]);

  // Geocoder
  useEffect(() => {
    if (debouncedQuery.length < 2) { setGeocoderResults([]); return; }
    const coords = parseCoords(debouncedQuery);
    if (coords) {
      setGeocoderResults([{ lon: coords.lng, lat: coords.lat, display_name: `${coords.lat}, ${coords.lng}`, _isCoord: true }]);
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

  // Close drawer on outside click
  useEffect(() => {
    if (!feedOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setFeedOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [feedOpen]);

  const flyToLocation = useCallback((loc) => {
    const lon = parseFloat(loc.lon), lat = parseFloat(loc.lat);
    const name = loc._isCoord ? `${lat}, ${lon}` : loc.display_name.split(',')[0];
    onFlyTo({ longitude: lon, latitude: lat, name, full_name: loc.display_name });
    setSearchQuery(''); setGeocoderResults([]);
  }, [onFlyTo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && geocoderResults.length > 0) flyToLocation(geocoderResults[0]);
  };

  const showDetail = searchPin || selectedEvent;

  const handleMeasureFromHere = useCallback(() => {
    const pin = searchPin
      ? { latitude: searchPin.latitude, longitude: searchPin.longitude, name: searchPin.name, full_name: searchPin.full_name }
      : selectedEvent
        ? { latitude: selectedEvent.lat, longitude: selectedEvent.lng, name: selectedEvent.title.replace(/\s+\d{6,}$/, ''), full_name: selectedEvent.categoryTitle }
        : null;
    if (!pin) return;
    setMeasurePrefill(pin);
    onBack();
    setTab('measure');
  }, [searchPin, selectedEvent, onBack]);

  return (
    <aside className="sidebar">
      {showExport && (
        <ExportModal events={events || []} onClose={() => setShowExport(false)} />
      )}
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
              {compoundCount > 0 && (
                <div className="compound-counter" title="Compound events detected">⚠ {compoundCount}</div>
              )}
            </div>

            <div className="search-container">
              <Search className="search-icon" size={15} />
              <input
                type="text" className="search-input"
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
                    {loc._isCoord
                      ? <><span style={{ color: 'var(--accent)', marginRight: 6 }}>📌</span>{loc.display_name}</>
                      : loc.display_name}
                  </button>
                ))}
              </div>
            )}

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
            onMeasureFromHere={handleMeasureFromHere}
          />
        ) : tab === 'measure' ? (
          <DistanceTool onMeasure={onMeasure} onClear={onMeasureClear} prefillA={measurePrefill} />
        ) : (
          <>
            {/* Active events badge + markers toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="stat-badge">
                <span className="live-dot" />
                <Activity size={13} color="var(--accent)" />
                <span>{eventsLoading ? '—' : activeEventCount} active events</span>
              </div>
              <button
                className={`markers-toggle-btn ${markersVisible ? '' : 'hidden'}`}
                onClick={onToggleMarkers}
                title={markersVisible ? 'Hide event markers' : 'Show event markers'}
              >
                {markersVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>

            {/* Category filter chips — horizontally scrollable, no wrap */}
            <div className="filter-scroll-wrap">
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
            </div>

            {/* Stats 2×2 grid */}
            <StatsGrid
              events={events || []}
              activeEventCount={activeEventCount}
              eventsLoading={eventsLoading}
              lastUpdated={lastUpdated}
            />

            {/* ── Live Layers — collapsible ── */}
            <div>
              <button
                className="section-accordion-btn"
                onClick={() => setLayersOpen(v => !v)}
              >
                <span className="section-label" style={{ margin: 0 }}>Live Layers</span>
                {layersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {layersOpen && (
                <div className="toggle-list" style={{ marginTop: 8 }}>
                  {OVERLAY_LAYERS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      className={`toggle-btn overlay-toggle ${activeLayers?.[key] ? 'active' : ''}`}
                      onClick={() => onToggleLayer?.(key)}
                    >
                      <Icon size={14} />
                      <span style={{ flex: 1 }}>
                        {label}{key === 'firms' && firmsCount > 0 ? ` (${firmsCount.toLocaleString()})` : ''}
                      </span>
                      <span className={`layer-pill ${activeLayers?.[key] ? 'on' : 'off'}`}>
                        {activeLayers?.[key] ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Tools ── */}
            <div className="sidebar-tools-section">
              <div className="section-label" style={{ marginBottom: 8 }}>Tools</div>
              <div className="sidebar-tools-grid">
                <ReplayBar mapRef={mapRef} onHideLive={onHideLive} onShowLive={onShowLive} inline />
                <TimeMachineBar mapRef={mapRef} onHideLive={onHideLive} onShowLive={onShowLive} inline />
                <button className="tool-card-btn" onClick={() => setShowExport(true)}>
                  <Download size={16} color="var(--accent)" />
                  <div>
                    <div className="tool-card-title">Export Events</div>
                    <div className="tool-card-sub">GeoJSON or PDF report</div>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Activity Feed toggle button (bottom of sidebar) ── */}
      {!showDetail && tab === 'explore' && (
        <div className="feed-toggle-bar">
          <button className="feed-toggle-btn" onClick={() => setFeedOpen(v => !v)}>
            <List size={15} />
            <span>Activity Feed</span>
            {todayCount > 0 && (
              <span className="feed-count-badge">{todayCount} new</span>
            )}
          </button>
        </div>
      )}

      {/* ── Feed Drawer (slides up) ── */}
      <div className={`feed-drawer-container ${feedOpen ? 'open' : ''}`}>
        <FeedDrawer
          events={events || []}
          eventsLoading={eventsLoading}
          onEventClick={onEventClick}
          onClose={() => setFeedOpen(false)}
          drawerRef={drawerRef}
        />
      </div>
    </aside>
  );
}
