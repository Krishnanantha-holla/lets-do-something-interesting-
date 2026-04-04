import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Map, { Source, Layer, NavigationControl, GeolocateControl, Marker } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchEvents, CATEGORY_COLORS, CATEGORY_LABELS } from './api';
import { Search, Activity, Flame, CloudLightning, Layers, Moon, Sun, Cuboid, X, MapPin, CloudRain, Thermometer } from 'lucide-react';

function getEarthDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth Radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  satellite: {
    version: 8,
    sources: {
      esriImagery: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "Esri, Maxar, Earthstar Geographics"
      }
    },
    layers: [{ id: "imagery", type: "raster", source: "esriImagery" }]
  }
};

export default function App() {
  const mapRef = useRef(null);
  
  // App States
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Theme & Map States
  const [theme, setTheme] = useState(() => localStorage.getItem('eonet_theme') || 'light');
  const [mapStyleKey, setMapStyleKey] = useState(() => localStorage.getItem('eonet_map_style') || 'light');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [is3D, setIs3D] = useState(() => localStorage.getItem('eonet_is_3d') === 'true');
  const settingsMenuRef = useRef(null);

  // Search Pin & Weather State
  const [searchPin, setSearchPin] = useState(null);
  const [weatherData, setWeatherData] = useState(null);

  const [activeCategories, setActiveCategories] = useState([]);

  // Sync Document Class for CSS Variables
  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    // Persist to local storage
    localStorage.setItem('eonet_theme', theme);
    localStorage.setItem('eonet_map_style', mapStyleKey);
    localStorage.setItem('eonet_is_3d', String(is3D));
  }, [theme, mapStyleKey, is3D]);

  // Detect click outside to close the settings menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setStyleMenuOpen(false);
      }
    };
    if (styleMenuOpen) {
       document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [styleMenuOpen]);

  // Load Data
  useEffect(() => {
    fetchEvents()
      .then(data => {
        const sorted = [...data].sort((a, b) => a.startTime - b.startTime);
        setEvents(sorted);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Failed to fetch EONET data.");
        setLoading(false);
      });
  }, []);

  // Open-Meteo Integration
  useEffect(() => {
    if (searchPin) {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${searchPin.latitude}&longitude=${searchPin.longitude}&current=temperature_2m,weather_code`)
        .then(res => res.json())
        .then(data => {
            if (data && data.current) setWeatherData(data.current);
        })
        .catch(err => {
            console.error("Weather fetch failed", err);
            setWeatherData(null);
        });
    } else {
      setWeatherData(null);
    }
  }, [searchPin]);

  const toggleCategory = (catId) => {
    setActiveCategories(prev => prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]);
  };

  // Advanced Geocoder Search with Autocomplete
  const [geocoderResults, setGeocoderResults] = useState([]);
  
  const handleSearchChange = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.length > 2) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=4`);
        const data = await res.json();
        setGeocoderResults(data || []);
      } catch (err) {
        setGeocoderResults([]);
      }
    } else {
      setGeocoderResults([]);
    }
  };

  const flyToLocation = (location) => {
    const lon = parseFloat(location.lon);
    const lat = parseFloat(location.lat);
    mapRef.current?.flyTo({
      center: [lon, lat],
      zoom: 12, duration: 2500, essential: true
    });
    setSearchPin({ longitude: lon, latitude: lat, name: location.display_name });
    setSearchQuery(location.display_name);
    setGeocoderResults([]);
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && geocoderResults.length > 0) {
      flyToLocation(geocoderResults[0]);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setGeocoderResults([]);
    setSearchPin(null);
  };

  // Distance based sorting and filtering
  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeCategories.length > 0) result = result.filter(e => activeCategories.includes(e.categoryId));
    
    if (searchPin) {
      // Find NASA events within 1,500km Haversine distance
      result = result.filter(e => getEarthDistance(searchPin.latitude, searchPin.longitude, e.lat, e.lng) <= 1500);
    } else if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchSearch = result.filter(e => e.title.toLowerCase().includes(query) || e.categoryTitle.toLowerCase().includes(query));
      if (matchSearch.length > 0 || geocoderResults.length === 0) result = matchSearch; 
    }
    return result;
  }, [events, searchQuery, searchPin, activeCategories, geocoderResults]);

  const geojsonData = useMemo(() => {
    if (!filteredEvents.length) return null;
    return {
      type: 'FeatureCollection',
      features: filteredEvents.map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: { id: e.id, color: e.color, status: e.status, startTime: e.startTime }
      }))
    };
  }, [filteredEvents]);

  const activeEvents = filteredEvents.filter(e => e.status === 'open');
  const fireCount = activeEvents.filter(e => e.categoryId === 'wildfires').length;
  const stormCount = activeEvents.filter(e => e.categoryId === 'severeStorms').length;

  const handleMapClick = (e) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const clickedEvent = events.find(ev => ev.id === feature.properties.id);
      if (clickedEvent) {
        setSelectedEventId(clickedEvent.id);
        mapRef.current?.flyTo({ center: [clickedEvent.lng, clickedEvent.lat], zoom: Math.max(mapRef.current.getZoom(), 4), padding: { right: 400 }, duration: 1200 });
      }
    } else {
      setSelectedEventId(null);
    }
  };

  const toggle3D = () => {
    const next3D = !is3D;
    setIs3D(next3D);
    if (next3D) mapRef.current?.easeTo({ pitch: 55, bearing: -15, duration: 1000 });
    else mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId), [selectedEventId, events]);

  // Robust projection interceptor
  const onStyleData = useCallback((e) => {
    const map = e.target;
    try {
      if (map.setProjection && map.getStyle()) {
        map.setProjection({ type: 'globe' });
      }
    } catch(err) {}
  }, []);

  const currentMapStyle = mapStyleKey === 'satellite' ? MAP_STYLES.satellite : (theme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light);

  return (
    <div className={`map-container ${selectedEvent ? 'detail-open' : ''}`}>
      <Map
        ref={mapRef}
        initialViewState={{ 
          longitude: 0, 
          latitude: 20, 
          zoom: 1.5, 
          pitch: is3D ? 55 : 0, 
          bearing: is3D ? -15 : 0 
        }}
        minZoom={1} maxZoom={14}
        mapStyle={currentMapStyle}
        interactiveLayerIds={['events-layer']}
        onClick={handleMapClick}
        onStyleData={onStyleData}
        getCursor={(s) => s.isHovering ? 'pointer' : 'default'}
      >
        <NavigationControl position="bottom-right" visualizePitch={true} />
        <GeolocateControl 
          position="bottom-right" 
          trackUserLocation={true} 
          showUserHeading={true} 
          onError={(err) => {
            console.error(err);
            setError("Location access denied or unavailable by browser.");
            setTimeout(() => setError(null), 5000);
          }}
        />

        {searchPin && (
          <Marker longitude={searchPin.longitude} latitude={searchPin.latitude} anchor="bottom">
            <MapPin size={38} color="#FF3B30" fill="#FF3B30" stroke="#FFF" strokeWidth={1.5} style={{ filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.4))', transform: 'translateY(-10px)' }} />
          </Marker>
        )}

        {geojsonData && (
          <Source id="events" type="geojson" data={geojsonData}>
            <Layer 
              id="events-layer" type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 12],
                'circle-color': ['get', 'color'],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': theme === 'dark' ? '#111' : '#FFF'
              }}
            />
              <Layer
              id="events-pulse" type="circle"
              filter={['==', ['get', 'status'], 'open']}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 12, 8, 28],
                'circle-color': ['get', 'color'],
                'circle-opacity': 0.25,
                'circle-stroke-width': 0
              }}
            />
          </Source>
        )}
      </Map>

      {/* HEADER DASHBOARD */}
      <header className="header glass">
        <div className="header-top">
          <div className="title-wrap">
            <h1 className="title">Earth Events</h1>
            <span className="subtitle">NASA Global Hazards Tracker</span>
          </div>
          
          {/* Settings / Layer Controls */}
          <div style={{ position: 'relative' }} ref={settingsMenuRef}>
            <button className={`settings-btn ${styleMenuOpen ? 'active' : ''}`} onClick={() => setStyleMenuOpen(!styleMenuOpen)}>
              <Layers size={18} />
            </button>
            <div className={`style-controls ${styleMenuOpen ? 'open' : ''}`}>
              <button className={`style-btn ${mapStyleKey !== 'satellite' ? 'active' : ''}`} onClick={() => { setMapStyleKey('light'); setStyleMenuOpen(false); }}>Standard Map</button>
              <button className={`style-btn ${mapStyleKey === 'satellite' ? 'active' : ''}`} onClick={() => { setMapStyleKey('satellite'); setStyleMenuOpen(false); }}>Satellite</button>
              <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '4px 0' }} />
              <button className={`style-btn ${is3D ? 'active' : ''}`} onClick={() => { toggle3D(); setStyleMenuOpen(false); }} style={{ display: 'flex', gap: 6, alignItems:'center' }}>
                <Cuboid size={14}/> 3D Tilt
              </button>
              <button className="style-btn" onClick={() => { toggleTheme(); setStyleMenuOpen(false); }} style={{ display: 'flex', gap: 6, alignItems:'center' }}>
                {theme === 'dark' ? <><Sun size={14}/> Light UI</> : <><Moon size={14}/> Dark UI</>}
              </button>
            </div>
          </div>
        </div>
        
        {/* Search Bar - Autocomplete */}
        <div style={{ position: 'relative' }}>
          <div className="search-bar">
            <Search size={18} color="var(--muted)" />
            <input 
              type="text" className="search-input" 
              placeholder="Search global places or events..." 
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchSubmit}
            />
            {searchQuery && (
              <button onClick={clearSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={16} />
              </button>
            )}
          </div>
          
          {/* Autocomplete Dropdown */}
          {geocoderResults.length > 0 && searchQuery && (
            <div className="autocomplete-dropdown glass">
              <div className="auto-group-label">Global Places</div>
              {geocoderResults.map((loc, i) => (
                <button key={i} className="auto-item" onClick={() => flyToLocation(loc)}>
                  {loc.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actionable Statistics & Weather Panel */}
        <div className="stats-grid">
          <div className="stat-item">
            <Activity size={14} color="var(--accent)" />
            <span>{searchPin ? `${activeEvents.length} Nearby` : `${activeEvents.length} Active`}</span>
          </div>
          {fireCount > 0 && <div className="stat-item"><Flame size={14} color="#ff3b30" /><span>{fireCount} Wildfires</span></div>}
          {stormCount > 0 && <div className="stat-item"><CloudLightning size={14} color="#5856d6" /><span>{stormCount} Storms</span></div>}
          
          {/* Weather Widget */}
          {weatherData && searchPin && (
             <div className="stat-item" style={{ background: 'var(--accent-light)', borderColor: 'transparent' }}>
                <Thermometer size={14} color="var(--accent)" />
                <span style={{ color: 'var(--accent)' }}>{weatherData.temperature_2m}°C</span>
             </div>
          )}
        </div>

        {/* Filter Pills */}
        <div className="filter-pills">
          {Object.entries(CATEGORY_LABELS).map(([catId, label]) => (
            <button key={catId} className={`filter-pill ${activeCategories.includes(catId) ? 'active' : ''}`} onClick={() => toggleCategory(catId)}>
              <span className="pill-color" style={{ '--pill-color': CATEGORY_COLORS[catId] }}></span>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* EMPTY STATE TOAST */}
      {searchQuery && filteredEvents.length === 0 && (
        <div className="toast show" style={{ background: 'rgba(255,255,255,0.8)', color: '#000' }}>No local NASA events found for "{searchQuery}"</div>
      )}
      {error && <div className="toast show">{error}</div>}<aside className={`detail-panel glass ${selectedEvent ? 'open' : ''}`} aria-hidden={!selectedEvent}>
        <div className="panel-head">
          <h2 className="panel-title">Overview</h2>
          <button className="close-panel" onClick={() => setSelectedEventId(null)}><X size={18} /></button>
        </div>
        <div className="panel-content">
          {selectedEvent && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedEvent.status === "open" && (
                   <div className="live-badge"><span className="live-dot"></span>Live Event</div>
                )}
                <h3 className="event-name">{selectedEvent.title}</h3>
                <span className="subtitle" style={{ fontSize: '0.9rem' }}>{selectedEvent.categoryTitle}</span>
              </div>

              <div className="meta-grid">
                <div className="meta-card">
                  <div className="meta-label">Started</div>
                  <div className="meta-value">{new Date(selectedEvent.startTime).toLocaleDateString()}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-label">Status</div>
                  <div className="meta-value">{selectedEvent.status === "open" ? "Active" : "Resolved"}</div>
                </div>
              </div>

              <section style={{ marginTop: 10 }}>
                <div className="meta-label">Sources & Intel</div>
                <ul className="source-list">
                  {selectedEvent.sources.length ? selectedEvent.sources.map((s, i) => (
                    <li key={i}><a className="source-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.id || "External Source"} ↗</a></li>
                  )) : <li className="meta-value" style={{ color: 'var(--muted)' }}>No source links available.</li>}
                </ul>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
