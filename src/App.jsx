import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchEvents } from './api';
import { useLocationData } from './hooks/useLocationData';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import StyleMenu from './components/StyleMenu';
import CompoundPanel from './components/CompoundPanel';
import MapClickPanel from './components/MapClickPanel';
import { detectCompoundEvents, initCompoundLayer } from './layers/correlationEngine';
function getEarthDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const MAP_STYLES = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  hybrid: {
    version: 8, projection: { type: 'globe' },
    sources: {
      esriImagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar', maxzoom: 19 },
      esriLabels:  { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
      esriRoads:   { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'esriImagery' },
      { id: 'roads',   type: 'raster', source: 'esriRoads'   },
      { id: 'labels',  type: 'raster', source: 'esriLabels'  },
    ],
  },
  satellite: {
    version: 8, projection: { type: 'globe' },
    sources: {
      esriImagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar', maxzoom: 19 },
      esriLabels:  { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'esriImagery' },
      { id: 'labels',  type: 'raster', source: 'esriLabels', minzoom: 8 },
    ],
  },
};

// ── Session persistence helpers ───────────────────────────────────────────────
// Persist UI state across refresh (but clear on tab close via sessionStorage)
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('atlas_session') || '{}'); } catch { return {}; }
}
function saveSession(patch) {
  try {
    const cur = loadSession();
    sessionStorage.setItem('atlas_session', JSON.stringify({ ...cur, ...patch }));
  } catch (_) {}
}

export default function App() {
  const mapRef          = useRef(null);
  const compoundCtrlRef = useRef(null);
  const session         = useMemo(loadSession, []);

  // ── State ─────────────────────────────────────────────────────────────────
  const [events,           setEvents]           = useState([]);
  const [eventsLoading,    setEventsLoading]     = useState(true);
  const [selectedEventId,  setSelectedEventId]   = useState(null);
  const [searchPin,        setSearchPin]         = useState(null);
  const [activeCategories, setActiveCategories]  = useState(() => session.activeCategories || []);
  const [measureA,         setMeasureA]          = useState(null);
  const [measureB,         setMeasureB]          = useState(null);
  const [compoundEvents,   setCompoundEvents]    = useState([]);
  const [selectedCompound, setSelectedCompound]  = useState(null);
  const [activeLayers,     setActiveLayers]      = useState(() => session.activeLayers || {});
  const [mapClickInfo,     setMapClickInfo]      = useState(null);
  const [markersVisible,   setMarkersVisible]    = useState(true);

  const [theme,       setTheme]       = useState(() => localStorage.getItem('eonet_theme')     || 'light');
  const [mapStyleKey, setMapStyleKey] = useState(() => localStorage.getItem('eonet_map_style') || 'light');
  const [is3D,        setIs3D]        = useState(() => localStorage.getItem('eonet_is_3d') === 'true');

  const { weatherData, wikiData, loadingWeather, loadingWiki } = useLocationData(searchPin);

  // ── Persist prefs ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('eonet_theme',     theme);
    localStorage.setItem('eonet_map_style', mapStyleKey);
    localStorage.setItem('eonet_is_3d',     String(is3D));
  }, [theme, mapStyleKey, is3D]);

  // Persist session state (survives refresh, clears on tab close)
  useEffect(() => { saveSession({ activeCategories }); }, [activeCategories]);
  useEffect(() => { saveSession({ activeLayers });     }, [activeLayers]);

  // ── Load events ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchEvents()
      .then(data => {
        const sorted = [...data].sort((a, b) => a.startTime - b.startTime);
        setEvents(sorted);
        setEventsLoading(false);
        setCompoundEvents(detectCompoundEvents(sorted));
      })
      .catch(() => setEventsLoading(false));
  }, []);

  // Re-apply saved layer toggles once map is ready
  useEffect(() => {
    if (!Object.keys(activeLayers).length) return;
    const t = setTimeout(() => {
      Object.entries(activeLayers).forEach(([key, on]) => {
        if (on) mapRef.current?.toggleLayer(key, true);
      });
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // ── Compound layer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!compoundEvents.length) return;
    const t = setTimeout(() => {
      try {
        compoundCtrlRef.current?.destroy();
        const rawMap = mapRef.current?.getRawMap?.();
        if (!rawMap) return;
        compoundCtrlRef.current = initCompoundLayer(rawMap, compoundEvents, setSelectedCompound);
      } catch (e) { console.warn('[compound] init failed:', e); }
    }, 2500);
    return () => clearTimeout(t);
  }, [compoundEvents]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedEvent = useMemo(
    () => events.find(e => e.id === selectedEventId),
    [selectedEventId, events]
  );

  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeCategories.length > 0)
      result = result.filter(e => activeCategories.includes(e.categoryId));
    if (searchPin)
      result = result.filter(e =>
        getEarthDistance(searchPin.latitude, searchPin.longitude, e.lat, e.lng) <= 1500
      );
    return result;
  }, [events, searchPin, activeCategories]);

  const geojsonData = useMemo(() => {
    if (!filteredEvents.length) return null;
    return {
      type: 'FeatureCollection',
      features: filteredEvents.map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: { id: e.id, color: e.color, status: e.status, startTime: e.startTime },
      })),
    };
  }, [filteredEvents]);

  const activeEventCount = useMemo(
    () => filteredEvents.filter(e => e.status === 'open').length,
    [filteredEvents]
  );

  const currentMapStyle = useMemo(() => {
    if (mapStyleKey === 'satellite') return MAP_STYLES.satellite;
    if (mapStyleKey === 'hybrid')    return MAP_STYLES.hybrid;
    return theme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light;
  }, [mapStyleKey, theme]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleEventClick = useCallback((eventId) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    setSelectedEventId(ev.id);
    setSearchPin(null);
    setMapClickInfo(null);
    mapRef.current?.flyTo({
      center: [ev.lng, ev.lat],
      zoom: Math.max(mapRef.current.getZoom(), 4),
      padding: { left: 400 }, duration: 1200,
    });
  }, [events]);

  const handleFlyTo = useCallback((pin) => {
    mapRef.current?.flyTo({
      center: [pin.longitude, pin.latitude],
      zoom: 16, padding: { left: 400 }, duration: 2500,
      easing: t => t * (2 - t),
    });
    setSearchPin(pin);
    setSelectedEventId(null);
    setMapClickInfo(null);
  }, []);

  const handleBack = useCallback(() => {
    setSearchPin(null);
    setSelectedEventId(null);
  }, []);

  const handleMeasure = useCallback((a, b) => {
    setMeasureA(a); setMeasureB(b);
    if (mapRef.current) {
      mapRef.current.fitBounds(
        [[Math.min(a.longitude, b.longitude), Math.min(a.latitude, b.latitude)],
         [Math.max(a.longitude, b.longitude), Math.max(a.latitude, b.latitude)]],
        { padding: { left: 420, top: 80, right: 80, bottom: 80 }, duration: 1800 }
      );
    }
  }, []);

  const handleMeasureClear = useCallback(() => { setMeasureA(null); setMeasureB(null); }, []);

  const handleToggleLayer = useCallback((key) => {
    setActiveLayers(prev => {
      const next = !prev[key];
      mapRef.current?.toggleLayer(key, next);
      return { ...prev, [key]: next };
    });
  }, []);

  const handleToggle3D = useCallback(() => {
    setIs3D(prev => {
      const next = !prev;
      mapRef.current?.easeTo({ pitch: next ? 55 : 0, bearing: next ? -15 : 0, duration: 1000 });
      return next;
    });
  }, []);

  const handleShare = useCallback(() => {
    const text = searchPin
      ? `${wikiData?.title || searchPin.name} — ${searchPin.latitude.toFixed(5)}, ${searchPin.longitude.toFixed(5)}`
      : selectedEvent
        ? `${selectedEvent.title} — ${selectedEvent.lat.toFixed(5)}, ${selectedEvent.lng.toFixed(5)}`
        : '';
    if (navigator.share) {
      navigator.share({ title: 'Atlas Location', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        const el = document.getElementById('copy-toast');
        if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2000); }
      });
    }
  }, [searchPin, selectedEvent, wikiData]);

  // Map bare click (not on a marker) → show geo info panel
  const handleMapBareClick = useCallback((lat, lng) => {
    setMapClickInfo({ lat, lng });
    setSelectedEventId(null);
    setSearchPin(null);
  }, []);

  return (
    <div className="map-wrapper">
      <div className="copy-toast" id="copy-toast">📋 Copied to clipboard</div>
      <div className="starfield" id="starfield" />

      <MapView
        ref={mapRef}
        mapStyle={currentMapStyle}
        geojsonData={!markersVisible ? null : geojsonData}
        searchPin={searchPin}
        theme={theme}
        is3D={is3D}
        onEventClick={handleEventClick}
        onBareClick={handleMapBareClick}
        onDoubleTap={handleMapBareClick}
        measureA={measureA}
        measureB={measureB}
      />

      <Sidebar
        searchPin={searchPin}
        selectedEvent={selectedEvent}
        wikiData={wikiData}
        weatherData={weatherData}
        loadingWiki={loadingWiki}
        loadingWeather={loadingWeather}
        activeCategories={activeCategories}
        onToggleCategory={catId =>
          setActiveCategories(prev =>
            prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
          )
        }
        activeEventCount={activeEventCount}
        events={filteredEvents}
        eventsLoading={eventsLoading}
        onEventClick={handleEventClick}
        onFlyTo={handleFlyTo}
        onBack={handleBack}
        onShare={handleShare}
        onMeasure={handleMeasure}
        onMeasureClear={handleMeasureClear}
        compoundCount={compoundEvents.length}
        markersVisible={markersVisible}
        onToggleMarkers={() => setMarkersVisible(v => !v)}
        activeLayers={activeLayers}
        onToggleLayer={handleToggleLayer}
      />

      <StyleMenu
        mapStyleKey={mapStyleKey}
        setMapStyleKey={setMapStyleKey}
        is3D={is3D}
        onToggle3D={handleToggle3D}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
      />

      {/* Map click geo info panel */}
      {mapClickInfo && (
        <MapClickPanel
          lat={mapClickInfo.lat}
          lng={mapClickInfo.lng}
          onClose={() => setMapClickInfo(null)}
        />
      )}

      {selectedCompound && (
        <CompoundPanel
          compound={selectedCompound}
          onClose={() => setSelectedCompound(null)}
        />
      )}
    </div>
  );
}
