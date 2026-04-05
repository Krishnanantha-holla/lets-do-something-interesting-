import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchEvents } from './api';
import { useLocationData } from './hooks/useLocationData';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import StyleMenu from './components/StyleMenu';

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
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  hybrid: {
    version: 8, projection: { type: 'globe' },
    sources: {
      esriImagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar', maxzoom: 19 },
      esriLabels: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
      esriRoads: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'esriImagery' },
      { id: 'roads', type: 'raster', source: 'esriRoads' },
      { id: 'labels', type: 'raster', source: 'esriLabels' },
    ],
  },
  satellite: {
    version: 8, projection: { type: 'globe' },
    sources: {
      esriImagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar', maxzoom: 19 },
      esriLabels: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'esriImagery' },
      { id: 'labels', type: 'raster', source: 'esriLabels', minzoom: 8 },
    ],
  },
};

export default function App() {
  const mapRef = useRef(null);

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [searchPin, setSearchPin] = useState(null);
  const [activeCategories, setActiveCategories] = useState([]);
  const [measureA, setMeasureA] = useState(null);
  const [measureB, setMeasureB] = useState(null);

  const [theme, setTheme] = useState(() => localStorage.getItem('eonet_theme') || 'light');
  const [mapStyleKey, setMapStyleKey] = useState(() => localStorage.getItem('eonet_map_style') || 'light');
  const [is3D, setIs3D] = useState(() => localStorage.getItem('eonet_is_3d') === 'true');

  const { weatherData, wikiData, loadingWeather, loadingWiki } = useLocationData(searchPin);

  // Persist prefs & apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('eonet_theme', theme);
    localStorage.setItem('eonet_map_style', mapStyleKey);
    localStorage.setItem('eonet_is_3d', String(is3D));
  }, [theme, mapStyleKey, is3D]);

  // Load events
  useEffect(() => {
    fetchEvents()
      .then(data => setEvents([...data].sort((a, b) => a.startTime - b.startTime)))
      .catch(() => {});
  }, []);

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId), [selectedEventId, events]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeCategories.length > 0) result = result.filter(e => activeCategories.includes(e.categoryId));
    if (searchPin) result = result.filter(e => getEarthDistance(searchPin.latitude, searchPin.longitude, e.lat, e.lng) <= 1500);
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

  const activeEventCount = useMemo(() => filteredEvents.filter(e => e.status === 'open').length, [filteredEvents]);

  const currentMapStyle = useMemo(() => {
    if (mapStyleKey === 'satellite') return MAP_STYLES.satellite;
    if (mapStyleKey === 'hybrid') return MAP_STYLES.hybrid;
    return theme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light;
  }, [mapStyleKey, theme]);

  const handleEventClick = useCallback((eventId) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    setSelectedEventId(ev.id);
    setSearchPin(null);
    mapRef.current?.flyTo({
      center: [ev.lng, ev.lat],
      zoom: Math.max(mapRef.current.getZoom(), 4),
      padding: { left: 400 },
      duration: 1200,
    });
  }, [events]);

  const handleFlyTo = useCallback((pin) => {
    mapRef.current?.flyTo({
      center: [pin.longitude, pin.latitude],
      zoom: 16,
      padding: { left: 400 },
      duration: 2500,
      easing: t => t * (2 - t),
    });
    setSearchPin(pin);
    setSelectedEventId(null);
  }, []);

  const handleBack = useCallback(() => {
    setSearchPin(null);
    setSelectedEventId(null);
  }, []);

  const handleMeasure = useCallback((a, b) => {
    setMeasureA(a);
    setMeasureB(b);
    // Fit map to show both points
    if (mapRef.current) {
      const minLng = Math.min(a.longitude, b.longitude);
      const maxLng = Math.max(a.longitude, b.longitude);
      const minLat = Math.min(a.latitude, b.latitude);
      const maxLat = Math.max(a.latitude, b.latitude);
      mapRef.current.flyTo({
        center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
        zoom: Math.max(1, Math.min(10, 4 - Math.log2(Math.max(maxLng - minLng, maxLat - minLat) + 0.01))),
        padding: { left: 420, top: 60, right: 60, bottom: 60 },
        duration: 1800,
        easing: t => t * (2 - t),
      });
    }
  }, []);

  const handleMeasureClear = useCallback(() => {
    setMeasureA(null);
    setMeasureB(null);
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

  return (
    <div className="map-wrapper">
      <div className="copy-toast" id="copy-toast">📋 Copied to clipboard</div>
      <div className="starfield" id="starfield" />

      <MapView
        ref={mapRef}
        mapStyle={currentMapStyle}
        geojsonData={geojsonData}
        searchPin={searchPin}
        theme={theme}
        is3D={is3D}
        onEventClick={handleEventClick}
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
        onToggleCategory={catId => setActiveCategories(prev => prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId])}
        activeEventCount={activeEventCount}
        onFlyTo={handleFlyTo}
        onBack={handleBack}
        onShare={handleShare}
        onMeasure={handleMeasure}
        onMeasureClear={handleMeasureClear}
      />

      <StyleMenu
        mapStyleKey={mapStyleKey}
        setMapStyleKey={setMapStyleKey}
        is3D={is3D}
        onToggle3D={handleToggle3D}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
      />
    </div>
  );
}
