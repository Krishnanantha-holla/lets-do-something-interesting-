import React, { useState, useEffect } from 'react';
import {
  Share2, ExternalLink, Globe, Thermometer, Ruler,
  Copy, Check, X, Map, MapPin, Mountain, Wind,
  Droplets, ArrowUp, ArrowDown, Navigation,
} from 'lucide-react';

// ── Elevation fetch ───────────────────────────────────────────────────────────
function useElevation(lat, lng) {
  const [elevation, setElevation] = useState(null);
  useEffect(() => {
    if (lat == null || lng == null) { setElevation(null); return; }
    let cancelled = false;
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setElevation(d?.results?.[0]?.elevation ?? null); })
      .catch(() => { if (!cancelled) setElevation(null); });
    return () => { cancelled = true; };
  }, [lat, lng]);
  return elevation;
}

// ── Weather code → description ────────────────────────────────────────────────
const WX = {
  0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Icy fog', 51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Light snow', 73:'Snow', 75:'Heavy snow',
  80:'Showers', 81:'Showers', 82:'Violent showers',
  95:'Thunderstorm', 96:'Thunderstorm + hail', 99:'Thunderstorm + heavy hail',
};

// ── Share modal ───────────────────────────────────────────────────────────────
function ShareModal({ title, lat, lng, onClose }) {
  const [copied, setCopied] = useState(false);
  const mapsUrl   = `https://www.google.com/maps?q=${lat},${lng}`;
  const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const shareText  = `${title} — ${coordsText}`;

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-sheet" onClick={e => e.stopPropagation()}>
        <div className="share-sheet-header">
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Share Location</span>
          <button className="share-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="share-location-name">{title}</div>
        <div className="share-coords">{coordsText}</div>
        <div className="share-actions">
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="share-action-btn">
            <Map size={18} /><span>Open in Maps</span>
          </a>
          <button className="share-action-btn" onClick={() => copy(coordsText)}>
            {copied ? <Check size={18} color="#34c759" /> : <Copy size={18} />}
            <span>{copied ? 'Copied!' : 'Copy Coords'}</span>
          </button>
          <button className="share-action-btn" onClick={() => copy(`${shareText}\n${mapsUrl}`)}>
            <Share2 size={18} /><span>Copy Link</span>
          </button>
          {typeof navigator.share === 'function' && (
            <button className="share-action-btn"
              onClick={() => navigator.share({ title: 'Atlas Location', text: shareText, url: mapsUrl }).catch(() => {})}>
              <ExternalLink size={18} /><span>More…</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main DetailView ───────────────────────────────────────────────────────────
export default function DetailView({
  searchPin, selectedEvent, wikiData, weatherData,
  loadingWiki, loadingWeather, onMeasureFromHere,
}) {
  const [showShare, setShowShare] = useState(false);

  const title    = searchPin ? (wikiData?.title || searchPin.name) : selectedEvent?.title?.replace(/\s+\d{6,}$/, '');
  const subtitle = searchPin ? searchPin.full_name : selectedEvent?.categoryTitle;
  const lat      = searchPin ? searchPin.latitude  : selectedEvent?.lat;
  const lng      = searchPin ? searchPin.longitude : selectedEvent?.lng;

  const elevation = useElevation(lat, lng);

  return (
    <div className="detail-view">
      {showShare && lat != null && (
        <ShareModal title={title} lat={lat} lng={lng} onClose={() => setShowShare(false)} />
      )}

      {/* ── Hero image (Wikipedia thumbnail) ── */}
      {wikiData?.thumbnail && (
        <img src={wikiData.thumbnail} className="detail-hero" alt={wikiData.title} />
      )}

      {/* ── Place name + subtitle ── */}
      <h2 className="detail-title">{title}</h2>
      {subtitle && <p className="detail-subtitle">{subtitle}</p>}

      {/* ── Coordinates pill ── */}
      {lat != null && (
        <div className="detail-coords-pill">
          <MapPin size={12} />
          <span>{lat.toFixed(5)}°, {lng.toFixed(5)}°</span>
          {elevation != null && (
            <span className="detail-coords-elev">
              <Mountain size={11} /> {Math.round(elevation)} m
            </span>
          )}
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="action-row">
        <button className="action-btn primary" onClick={() => setShowShare(true)}>
          <Share2 size={15} /> Share
        </button>
        <button className="action-btn" onClick={onMeasureFromHere}>
          <Ruler size={15} /> Distance
        </button>
        {wikiData?.url && (
          <a href={wikiData.url} target="_blank" rel="noreferrer" className="action-btn" style={{ textDecoration: 'none' }}>
            <ExternalLink size={15} /> Wiki
          </a>
        )}
        {selectedEvent?.sources?.length > 0 && (
          <a href={selectedEvent.sources[0].url} target="_blank" rel="noreferrer" className="action-btn" style={{ textDecoration: 'none' }}>
            <Globe size={15} /> Source
          </a>
        )}
      </div>

      {/* ── About / description ── */}
      <div className="about-card">
        <h4 className="about-label">About</h4>
        {loadingWiki ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Loading…</p>
        ) : wikiData ? (
          <p style={{ margin: 0 }}>
            {wikiData.extract}
            <br />
            <a href={wikiData.url} target="_blank" rel="noreferrer" className="wiki-link">
              More on Wikipedia
            </a>
          </p>
        ) : selectedEvent ? (
          <p style={{ margin: 0 }}>
            A <strong>{selectedEvent.categoryTitle}</strong> event tracked by NASA EONET.
            Started {new Date(selectedEvent.startTime).toLocaleDateString()}.
            Status: <strong>{selectedEvent.status}</strong>.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            {lat?.toFixed(5)}°, {lng?.toFixed(5)}°
            {elevation != null && <> · {Math.round(elevation)} m elevation</>}
          </p>
        )}
      </div>

      {/* ── Weather card — always expanded, Apple Maps style ── */}
      {loadingWeather ? (
        <div className="weather-card-am">
          <div className="wca-header">
            <Thermometer size={16} color="var(--accent)" />
            <span className="wca-title">Weather</span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>Loading weather…</p>
        </div>
      ) : weatherData ? (
        <div className="weather-card-am">
          {/* Top row: temp + condition */}
          <div className="wca-header">
            <Thermometer size={16} color="var(--accent)" />
            <span className="wca-title">Weather</span>
            <span className="wca-condition">{WX[weatherData.code] || 'Current conditions'}</span>
          </div>

          <div className="wca-temp-row">
            <span className="wca-temp">{weatherData.temp}°C</span>
            <div className="wca-hilo">
              <span><ArrowUp size={11} /> {weatherData.max}°</span>
              <span><ArrowDown size={11} /> {weatherData.min}°</span>
            </div>
          </div>

          {/* Detail grid */}
          <div className="wca-grid">
            <div className="wca-cell">
              <Droplets size={14} color="var(--muted)" />
              <span className="wca-cell-label">Humidity</span>
              <span className="wca-cell-value">{weatherData.humidity}%</span>
            </div>
            <div className="wca-cell">
              <Wind size={14} color="var(--muted)" />
              <span className="wca-cell-label">Wind</span>
              <span className="wca-cell-value">{weatherData.wind} km/h</span>
            </div>
            {elevation != null && (
              <div className="wca-cell">
                <Mountain size={14} color="var(--muted)" />
                <span className="wca-cell-label">Elevation</span>
                <span className="wca-cell-value">{Math.round(elevation)} m</span>
              </div>
            )}
            <div className="wca-cell">
              <Navigation size={14} color="var(--muted)" />
              <span className="wca-cell-label">Coords</span>
              <span className="wca-cell-value" style={{ fontSize: '0.72rem' }}>
                {lat?.toFixed(3)}°, {lng?.toFixed(3)}°
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
