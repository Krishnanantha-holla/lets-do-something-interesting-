import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Map, { Source, Layer, NavigationControl, GeolocateControl, Marker, FullscreenControl, ScaleControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchEvents, CATEGORY_COLORS, CATEGORY_LABELS } from './api';
import { Search, Activity, Layers, Moon, Sun, Cuboid, X, MapPin, Thermometer, Share2, Globe, ExternalLink } from 'lucide-react';

function getEarthDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  hybrid: {
    version: 8,
    projection: { type: "globe" },
    sources: {
      esriImagery: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Esri, Maxar", maxzoom: 19 },
      esriLabels: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
      esriRoads: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 }
    },
    layers: [
      { id: "imagery", type: "raster", source: "esriImagery" },
      { id: "roads", type: "raster", source: "esriRoads" },
      { id: "labels", type: "raster", source: "esriLabels" }
    ]
  },
  satellite: {
    version: 8,
    projection: { type: "globe" },
    sources: {
      esriImagery: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Esri, Maxar", maxzoom: 19 },
      esriLabels: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 }
    },
    layers: [
      { id: "imagery", type: "raster", source: "esriImagery" },
      { id: "labels", type: "raster", source: "esriLabels", minzoom: 8 }
    ]
  }
};

export default function App() {
  const mapRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [theme, setTheme] = useState(() => localStorage.getItem('eonet_theme') || 'light');
  const [mapStyleKey, setMapStyleKey] = useState(() => localStorage.getItem('eonet_map_style') || 'light');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [is3D, setIs3D] = useState(() => localStorage.getItem('eonet_is_3d') === 'true');
  const settingsMenuRef = useRef(null);

  const [searchPin, setSearchPin] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [wikiData, setWikiData] = useState(null);
  const [activeCategories, setActiveCategories] = useState([]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('eonet_theme', theme);
    localStorage.setItem('eonet_map_style', mapStyleKey);
    localStorage.setItem('eonet_is_3d', String(is3D));
  }, [theme, mapStyleKey, is3D]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) setStyleMenuOpen(false);
    };
    if (styleMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [styleMenuOpen]);

  useEffect(() => {
    fetchEvents().then(data => { setEvents([...data].sort((a,b)=>a.startTime-b.startTime)); setLoading(false); }).catch(err => { setError("Failed to fetch data"); setLoading(false); });
  }, []);

  // Weather & Wikipedia Logic
  useEffect(() => {
    if (searchPin) {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${searchPin.latitude}&longitude=${searchPin.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`)
        .then(res => res.json()).then(data => { 
           if(data?.current) {
             setWeatherData({
                temp: data.current.temperature_2m,
                humidity: data.current.relative_humidity_2m,
                wind: data.current.wind_speed_10m,
                max: data.daily?.temperature_2m_max[0] || '--',
                min: data.daily?.temperature_2m_min[0] || '--'
             });
           }
        }).catch(() => setWeatherData(null));
      
      const fetchWiki = async () => {
        try {
          const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchPin.name)}`);
          if (res.ok) {
             const data = await res.json();
             if (data.type !== 'disambiguation' && data.title) {
               setWikiData({ title: data.title, extract: data.extract, thumbnail: data.thumbnail?.source, url: data.content_urls?.desktop?.page });
               return;
             }
          }
          setWikiData(null);
        } catch(e) { setWikiData(null); }
      };
      if (searchPin.name) fetchWiki();
    } else {
      setWeatherData(null);
      setWikiData(null);
    }
  }, [searchPin]);

  const toggleCategory = (catId) => setActiveCategories(prev => prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]);

  const [geocoderResults, setGeocoderResults] = useState([]);
  const handleSearchChange = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.length > 2) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=4`);
        const data = await res.json();
        setGeocoderResults(data || []);
      } catch (err) { setGeocoderResults([]); }
    } else { setGeocoderResults([]); }
  };

  const flyToLocation = (location) => {
    const lon = parseFloat(location.lon); const lat = parseFloat(location.lat);
    let nameExt = location.display_name.split(',')[0];
    mapRef.current?.flyTo({ 
      center: [lon, lat], zoom: 16, padding: { left: 400 }, duration: 2500, essential: true,
      easing: (t) => t * (2 - t)
    });
    setSearchPin({ longitude: lon, latitude: lat, name: nameExt, full_name: location.display_name });
    setSearchQuery("");
    setGeocoderResults([]);
    setSelectedEventId(null);
  };

  const handleSearchSubmit = (e) => { if (e.key === 'Enter' && geocoderResults.length > 0) flyToLocation(geocoderResults[0]); };
  const clearSearch = () => { setSearchQuery(""); setGeocoderResults([]); };
  const backToHome = () => { setSearchPin(null); setSelectedEventId(null); setWikiData(null); setWeatherData(null); };

  const shareLocation = () => {
    const text = searchPin
      ? `${wikiData?.title || searchPin.name} — ${searchPin.latitude.toFixed(5)}, ${searchPin.longitude.toFixed(5)}`
      : selectedEvent ? `${selectedEvent.title} — ${selectedEvent.lat.toFixed(5)}, ${selectedEvent.lng.toFixed(5)}` : '';
    if (navigator.share) {
      navigator.share({ title: 'Atlas Location', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        const el = document.getElementById('copy-toast');
        if (el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2000); }
      });
    }
  };

  const filteredEvents = useMemo(() => {
    let result = events;
    if (activeCategories.length > 0) result = result.filter(e => activeCategories.includes(e.categoryId));
    if (searchPin) result = result.filter(e => getEarthDistance(searchPin.latitude, searchPin.longitude, e.lat, e.lng) <= 1500);
    else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const ms = result.filter(e => e.title.toLowerCase().includes(q) || e.categoryTitle.toLowerCase().includes(q));
      if (ms.length > 0 || geocoderResults.length === 0) result = ms;
    }
    return result;
  }, [events, searchQuery, searchPin, activeCategories, geocoderResults]);

  const geojsonData = useMemo(() => {
    if (!filteredEvents.length) return null;
    return { type: 'FeatureCollection', features: filteredEvents.map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { id: e.id, color: e.color, status: e.status, startTime: e.startTime } })) };
  }, [filteredEvents]);

  const activeEvents = filteredEvents.filter(e => e.status === 'open');

  const handleMapClick = (e) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const clickedEvent = events.find(ev => ev.id === feature.properties.id);
      if (clickedEvent) {
        setSelectedEventId(clickedEvent.id);
        setSearchPin(null);
        mapRef.current?.flyTo({ center: [clickedEvent.lng, clickedEvent.lat], zoom: Math.max(mapRef.current.getZoom(), 4), padding: { left: 400 }, duration: 1200 });
      }
    }
  };

  const toggle3D = () => {
    const next3D = !is3D; setIs3D(next3D);
    mapRef.current?.easeTo({ pitch: next3D ? 55 : 0, bearing: next3D ? -15 : 0, duration: 1000 });
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId), [selectedEventId, events]);

  const onStyleData = useCallback((e) => {
    const map = e.target;
    try { if (map.setProjection && map.getStyle()) map.setProjection({ type: 'globe' }); } catch(err) {}
  }, []);

  // Custom Trackpad Intercept & High-Velocity Parallax Starfield
  const onMapLoad = useCallback((e) => {
    const map = e.target;
    const starfield = document.getElementById('starfield');

    // --- Trackpad: Pinch-to-Zoom + Two-Finger-to-Pan ---
    const canvas = map.getCanvas();
    canvas.addEventListener('wheel', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.ctrlKey || evt.metaKey) {
        // Pinch gesture (trackpad reports ctrlKey=true for pinch)
        const zoomDelta = -evt.deltaY * 0.01;
        map.zoomTo(map.getZoom() + zoomDelta, { duration: 0 });
      } else {
        // Two-finger scroll → pan the map
        map.panBy([evt.deltaX, evt.deltaY], { duration: 0 });
      }
    }, { passive: false });

    // Infinite Unwrapped Longitude Tracker
    let prevLng = map.getCenter().lng;
    let accumulatedLng = prevLng;
    let starTicking = false;

    // Apple Maps 3D Parallax Starfield Effect
    map.on('move', () => {
      if (!starfield) return;
      
      if (!starTicking) {
         requestAnimationFrame(() => {
           const center = map.getCenter();
           const bearing = map.getBearing();
           
           let deltaLng = center.lng - prevLng;
           if (deltaLng > 180) deltaLng -= 360;
           else if (deltaLng < -180) deltaLng += 360;
           
           accumulatedLng += deltaLng;
           prevLng = center.lng;
           
           const x = (accumulatedLng * 8.5);
           const y = (center.lat * -8.5);
           
           starfield.style.transform = `rotate(${bearing}deg)`;
           starfield.style.backgroundPosition = `
             ${x * 0.2}px ${y * 0.2}px,
             ${x * 0.4}px ${y * 0.4}px,
             ${x * 0.7}px ${y * 0.7}px,
             ${x * 0.3}px ${y * 0.3}px,
             ${x * 0.8}px ${y * 0.8}px,
             ${x * 0.15}px ${y * 0.15}px,
             ${x * 1.0}px ${y * 1.0}px,
             ${x * 0.5}px ${y * 0.5}px,
             ${x * 0.6}px ${y * 0.6}px,
             ${x * 0.35}px ${y * 0.35}px
           `;
           starTicking = false;
         });
         starTicking = true;
      }
    });
  }, []);

  const currentMapStyle = mapStyleKey === 'satellite' ? MAP_STYLES.satellite : mapStyleKey === 'hybrid' ? MAP_STYLES.hybrid : (theme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light);

  return (
    <div className={`map-wrapper`}>
      <div className="copy-toast" id="copy-toast">📋 Copied to clipboard</div>
      <div className="starfield" id="starfield"></div>
      <div className={`map-container`}>
        <Map
          ref={mapRef}
          initialViewState={{ longitude: 0, latitude: 20, zoom: 1.5, pitch: is3D ? 55 : 0, bearing: 0 }}
          minZoom={1} maxZoom={22}
          mapStyle={currentMapStyle}
          interactiveLayerIds={['events-layer']}
          dragPan={true} dragRotate={true} scrollZoom={false} keyboard={true} doubleClickZoom={true} touchZoomRotate={true} touchPitch={true} pitchWithRotate={false}
        onClick={handleMapClick}
        onStyleData={onStyleData}
        onLoad={onMapLoad}
        getCursor={(s) => s.isHovering ? 'pointer' : (s.isDragging ? 'grabbing' : 'grab')}
      >
        <FullscreenControl position="bottom-right" />
        <NavigationControl position="bottom-right" visualizePitch={true} showCompass={true} showZoom={true} />
        <ScaleControl maxWidth={100} unit="metric" position="bottom-right" style={{ background: 'transparent', color: 'var(--text)', border: 'none', boxShadow: 'none' }}/>
        
        {searchPin && <Marker longitude={searchPin.longitude} latitude={searchPin.latitude} anchor="bottom"><MapPin size={38} color="#FF3B30" fill="#FF3B30" stroke="#FFF" strokeWidth={1.5} style={{ filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.4))', transform: 'translateY(-10px)' }} /></Marker>}
        {geojsonData && (
          <Source id="events" type="geojson" data={geojsonData}>
            <Layer id="events-layer" type="circle" paint={{ 
               'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 4, 5, 12, 10], 
               'circle-color': ['get', 'color'], 
               'circle-stroke-width': 1, 
               'circle-stroke-color': theme === 'dark' ? '#111' : '#FFF' 
            }} />
            <Layer id="events-pulse" type="circle" filter={['==', ['get', 'status'], 'open']} paint={{ 
               'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 4, 15, 12, 35], 
               'circle-color': ['get', 'color'], 
               'circle-opacity': 0.15, 
               'circle-stroke-width': 0 
            }} />
          </Source>
        )}
      </Map>

      {/* APPLE MAPS SIDEBAR */}
      <aside className="sidebar">
         <div className="sidebar-header">
            {searchPin || selectedEvent ? (
               <button onClick={backToHome} style={{ background: 'var(--control-bg)', border: '1px solid var(--panel-border-inner)', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', boxShadow: 'var(--shadow)'}}>
                 &larr; Back to Search
               </button>
            ) : (
              <>
                <h1 className="app-title"><Globe size={22} color="var(--accent)"/> Atlas</h1>
                <p className="app-subtitle">Interactive Global Map</p>
                <div className="search-container">
                  <Search className="search-icon" size={16} />
                  <input type="text" className="search-input" placeholder="Search global places or events..." value={searchQuery} onChange={handleSearchChange} onKeyDown={handleSearchSubmit} />
                  {searchQuery && <button className="search-clear" onClick={clearSearch}><X size={16} /></button>}
                </div>
                {geocoderResults.length > 0 && searchQuery && (
                  <div className="autocomplete-dropdown glass" style={{ position: 'absolute', top: '100%', left: '20px', right: '20px', zIndex: 100 }}>
                    {geocoderResults.map((loc, i) => <button key={i} className="auto-item" onClick={() => flyToLocation(loc)}>{loc.display_name}</button>)}
                  </div>
                )}
              </>
            )}
         </div>

         <div className="sidebar-content">
            {searchPin || selectedEvent ? (
              <div className="detail-view">
                 {wikiData && wikiData.thumbnail && <img src={wikiData.thumbnail} className="detail-hero" alt={wikiData.title} />}
                 
                 <h2 className="detail-title">{searchPin ? (wikiData?.title || searchPin.name) : selectedEvent.title}</h2>
                 <p className="detail-subtitle">{searchPin ? searchPin.full_name : selectedEvent.categoryTitle}</p>

                 <div className="action-row">
                    <button className="action-btn primary" onClick={shareLocation}><Share2 size={16}/> Share</button>
                    {wikiData?.url && <a href={wikiData.url} target="_blank" rel="noreferrer" className="action-btn" style={{textDecoration:'none'}}><ExternalLink size={16}/> Wikipedia</a>}
                    {selectedEvent?.sources?.length > 0 && <a href={selectedEvent.sources[0].url} target="_blank" rel="noreferrer" className="action-btn" style={{textDecoration:'none'}}><Globe size={16}/> Intel</a>}
                 </div>

                 <div className="about-card">
                    <h4 className="about-label">About</h4>
                    {wikiData ? (
                       <p>{wikiData.extract} <br/><a href={wikiData.url} target="_blank" rel="noreferrer" className="wiki-link">More on Wikipedia</a></p>
                    ) : ( selectedEvent ? (
                       <p>This is a recorded {selectedEvent.categoryTitle} event recognized by the Earth Observatory Natural Event Tracker (EONET).
                       Started on: {new Date(selectedEvent.startTime).toLocaleDateString()}. Status: {selectedEvent.status}.</p>
                    ) : ( 
                       <p><strong>Coordinates:</strong> {searchPin.latitude.toFixed(4)}, {searchPin.longitude.toFixed(4)}<br/>
                       <strong>Location:</strong> {searchPin.full_name}</p>
                    ))}
                 </div>

                 {weatherData && (
                    <div className="about-card weather-card" tabIndex={0}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '8px' }}>
                          <Thermometer size={24} color="var(--accent)" />
                          <div>
                            <h4 className="about-label" style={{ margin: 0 }}>Weather & Climate</h4>
                            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>Current temperature is <strong style={{ color: 'var(--text)' }}>{weatherData.temp}°C</strong>.</p>
                          </div>
                       </div>
                       <div className="weather-details">
                          <div className="weather-row"><span>High/Low</span> <span>{weatherData.max}°C / {weatherData.min}°C</span></div>
                          <div className="weather-row"><span>Humidity</span> <span>{weatherData.humidity}%</span></div>
                          <div className="weather-row"><span>Wind Speed</span> <span>{weatherData.wind} km/h</span></div>
                       </div>
                    </div>
                 )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div className="stat-item" style={{ background: 'var(--control-bg)', border: '1px solid var(--panel-border-inner)', padding: '8px 16px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                    <Activity size={16} color="var(--accent)" /> {activeEvents.length} Active Events
                  </div>
                </div>

                <h4 style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '16px 0 8px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Topologies</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(CATEGORY_LABELS).map(([catId, label]) => (
                    <button key={catId} onClick={() => toggleCategory(catId)} style={{ background: activeCategories.includes(catId) ? 'var(--panel-border)' : 'var(--control-bg)', border: '1px solid var(--panel-border-inner)', padding: '10px 14px', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', flexGrow: 1, justifyContent: 'center'}}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CATEGORY_COLORS[catId], flexShrink: 0 }}></span> {label}
                    </button>
                  ))}
                </div>
              </>
            )}
         </div>
      </aside>

      <div style={{ position: 'absolute', top: 32, right: 32, zIndex: 40 }} ref={settingsMenuRef}>
         <button className={`settings-btn ${styleMenuOpen ? 'active' : ''}`} onClick={() => setStyleMenuOpen(!styleMenuOpen)}>
           <Layers size={18} />
         </button>
         <div className={`style-controls ${styleMenuOpen ? 'open' : ''}`} style={{ top: 54, right: 0 }}>
           
           <div className="segmented-control">
              <button className={mapStyleKey === 'light' ? 'active' : ''} onClick={() => { setMapStyleKey('light'); setStyleMenuOpen(false); }}>Standard</button>
              <button className={mapStyleKey === 'hybrid' ? 'active' : ''} onClick={() => { setMapStyleKey('hybrid'); setStyleMenuOpen(false); }}>Hybrid</button>
              <button className={mapStyleKey === 'satellite' ? 'active' : ''} onClick={() => { setMapStyleKey('satellite'); setStyleMenuOpen(false); }}>Satellite</button>
           </div>
           
           <hr style={{ borderColor: 'var(--panel-border-inner)', margin: '8px 0' }} />
           
           <div className="toggle-list">
             <button className={`toggle-btn ${is3D ? 'active' : ''}`} onClick={() => { toggle3D(); setStyleMenuOpen(false); }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Cuboid size={16}/> 3D Built Environment</div>
             </button>
             <button className="toggle-btn active" onClick={() => { toggleTheme(); setStyleMenuOpen(false); }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{theme === 'dark' ? <><Sun size={16}/> Use Light UI</> : <><Moon size={16}/> Use Dark UI</>}</div>
             </button>
           </div>

          </div>
       </div>

    </div>
  </div>
  );
}
