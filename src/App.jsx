import React, { useState, useEffect, useMemo, useRef } from 'react';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchEvents, CATEGORY_COLORS, CATEGORY_LABELS } from './api';
import { Play, Pause, X } from 'lucide-react';

const SPEEDS = { slow: 900, normal: 450, fast: 180 };

const mapStyle = {
  version: 8,
  sources: {
    esriImagery: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics"
    },
    topoContours: {
      type: "raster",
      tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenTopoMap contributors"
    }
  },
  layers: [
    { id: "space-bg", type: "background", paint: { "background-color": "#05060d" } },
    { id: "imagery", type: "raster", source: "esriImagery", paint: { "raster-brightness-max": 0.72, "raster-contrast": 0.24, "raster-saturation": -0.22 } },
    { id: "contours", type: "raster", source: "topoContours", paint: { "raster-opacity": 0.16, "raster-contrast": 0.35, "raster-saturation": -0.6, "raster-brightness-max": 0.65 } },
    { id: "night-filter", type: "background", paint: { "background-color": "#03040b", "background-opacity": 0.28 } }
  ]
};

export default function App() {
  const mapRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Timeline state
  const [currentTime, setCurrentTime] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('normal');

  useEffect(() => {
    fetchEvents()
      .then(data => {
        const sorted = [...data].sort((a, b) => a.startTime - b.startTime);
        setEvents(sorted);
        if (sorted.length > 0) {
          setCurrentTime(sorted[sorted.length - 1].startTime);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Failed to fetch EONET data.");
        setLoading(false);
      });
  }, []);

  // Animation Loop
  useEffect(() => {
    let intervalId;
    if (isPlaying && events.length > 0) {
      intervalId = setInterval(() => {
        setCurrentTime(prevTime => {
          // Find next event time
          const nextEvent = events.find(e => e.startTime > prevTime + 1000);
          if (!nextEvent) {
             setIsPlaying(false);
             return prevTime; // Reached the end
          }
          return nextEvent.startTime;
        });
      }, SPEEDS[speed]);
    }
    return () => clearInterval(intervalId);
  }, [isPlaying, speed, events]);

  const handlePlayPause = () => {
    if (!isPlaying && events.length > 0) {
      const isAtEnd = !events.find(e => e.startTime > currentTime + 1000);
      if (isAtEnd) {
        // restart from beginning
        setCurrentTime(events[0].startTime);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const geojsonData = useMemo(() => {
    if (!events.length) return null;
    return {
      type: 'FeatureCollection',
      features: events.map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: {
          id: e.id,
          color: e.color,
          status: e.status,
          startTime: e.startTime,
        }
      }))
    };
  }, [events]);

  const liveCount = events.filter(e => e.status === 'open').length;

  const handleMapClick = (e) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const clickedEvent = events.find(ev => ev.id === feature.properties.id);
      if (clickedEvent) {
        setSelectedEventId(clickedEvent.id);
        mapRef.current?.flyTo({ center: [clickedEvent.lng, clickedEvent.lat], zoom: Math.max(mapRef.current.getZoom(), 4), duration: 900 });
      }
    }
  };

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId), [selectedEventId, events]);

  const cursorStyle = (state) => state.isHovering ? 'pointer' : 'default';

  return (
    <div className="map-container">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 0, latitude: 16, zoom: 1.7 }}
        minZoom={1} maxZoom={8}
        mapStyle={mapStyle}
        interactiveLayerIds={['events-layer']}
        onClick={handleMapClick}
        getCursor={cursorStyle}
      >
        <NavigationControl position="bottom-right" />

        {geojsonData && (
          <Source id="events" type="geojson" data={geojsonData}>
            {/* Base marker layer filtered by current animation time */}
            <Layer 
              id="events-layer"
              type="circle"
              filter={['<=', ['get', 'startTime'], currentTime || Date.now()]}
              paint={{
                'circle-radius': 7,
                'circle-color': ['get', 'color'],
                'circle-stroke-width': 1,
                'circle-stroke-color': 'rgba(255, 255, 255, 0.8)'
              }}
            />
            {/* Pulse effect layer for Live (open) events only */}
            <Layer
              id="events-pulse"
              type="circle"
              filter={['all', ['<=', ['get', 'startTime'], currentTime || Date.now()], ['==', ['get', 'status'], 'open']]}
              paint={{
                'circle-radius': 14,
                'circle-color': ['get', 'color'],
                'circle-opacity': 0.3,
                'circle-stroke-width': 0
              }}
            />
          </Source>
        )}
      </Map>

      {/* HEADER */}
      <header className="header glass">
        <div className="title-wrap">
          <h1 className="title">EONET // Earth Events</h1>
          <span className="subtitle">NASA Near Real-Time Natural Hazard Tracker</span>
        </div>
        <div className="live-badge">
          <span className="live-dot"></span>
          <span><strong>{liveCount}</strong> live events</span>
        </div>
      </header>

      {/* LEGEND */}
      <aside className={`legend glass ${legendOpen ? 'expanded' : ''}`}>
        <div className="legend-head">
          <h2 className="legend-title">Category Legend</h2>
          <button className="legend-toggle" onClick={() => setLegendOpen(!legendOpen)}>
            {legendOpen ? "Hide" : "Show"}
          </button>
        </div>
        {legendOpen && (
          <ul className="legend-items">
            {Object.keys(CATEGORY_LABELS).map(key => (
              <li key={key} className="legend-item">
                <span className="legend-color" style={{ '--legend-color': CATEGORY_COLORS[key] }}></span>
                <span>{CATEGORY_LABELS[key]}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* TIMELINE */}
      <section className="timeline-controls glass">
        <button className="control-btn" onClick={handlePlayPause}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <select className="control-select" value={speed} onChange={e => setSpeed(e.target.value)}>
          <option value="slow">Slow</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
        <div className="date-counter">
          {currentTime ? new Date(currentTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : (loading ? "Loading..." : "No events")}
        </div>
      </section>

      {/* ERROR TOAST */}
      {error && <div className="toast show">{error}</div>}

      {/* DETAIL PANEL */}
      <aside className={`detail-panel glass ${selectedEvent ? 'open' : ''}`} aria-hidden={!selectedEvent}>
        <div className="panel-head">
          <h2 className="panel-title">Event Details</h2>
          <button className="close-panel" onClick={() => setSelectedEventId(null)}><X size={16} /></button>
        </div>
        <div className="panel-content">
          {selectedEvent ? (
            <>
              <h3 className="event-name">{selectedEvent.title}</h3>
              <div className="meta-grid">
                <div className="meta-card">
                  <div className="meta-label">Category</div>
                  <div className="meta-value">{selectedEvent.categoryTitle}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-label">Status</div>
                  <div className="meta-value">{selectedEvent.status === "open" ? "Open / Live" : "Closed"}</div>
                </div>
                <div className="meta-card">
                  <div className="meta-label">Start</div>
                  <div className="meta-value">{new Date(selectedEvent.startTime).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
              <section>
                <div className="meta-label" style={{ marginBottom: 8 }}>Source Links</div>
                <ul className="source-list">
                  {selectedEvent.sources.length ? selectedEvent.sources.map((s, i) => (
                    <li key={i}><a className="source-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.id || "Source"} ↗</a></li>
                  )) : <li className="meta-value">No source links available.</li>}
                </ul>
              </section>
            </>
          ) : (
            <p className="meta-value">Click any event marker to inspect details.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
