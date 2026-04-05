import React, { useState } from 'react';
import { Share2, ExternalLink, Globe, Thermometer, Ruler, Copy, Check, X, Map } from 'lucide-react';

function ShareModal({ title, lat, lng, onClose }) {
  const [copied, setCopied] = useState(false);
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const shareText = `${title} — ${coordsText}`;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const nativeShare = () => {
    navigator.share({ title: 'Atlas Location', text: shareText, url: mapsUrl }).catch(() => {});
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
          {/* Google Maps link */}
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="share-action-btn">
            <Map size={18} />
            <span>Open in Maps</span>
          </a>

          {/* Copy coordinates */}
          <button className="share-action-btn" onClick={() => copyToClipboard(coordsText)}>
            {copied ? <Check size={18} color="#34c759" /> : <Copy size={18} />}
            <span>{copied ? 'Copied!' : 'Copy Coords'}</span>
          </button>

          {/* Copy full share text */}
          <button className="share-action-btn" onClick={() => copyToClipboard(`${shareText}\n${mapsUrl}`)}>
            <Share2 size={18} />
            <span>Copy Link</span>
          </button>

          {/* Native share if available */}
          {typeof navigator.share === 'function' && (
            <button className="share-action-btn" onClick={nativeShare}>
              <ExternalLink size={18} />
              <span>More…</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DetailView({
  searchPin, selectedEvent, wikiData, weatherData,
  loadingWiki, loadingWeather, onMeasureFromHere,
}) {
  const [showShare, setShowShare] = useState(false);

  const title = searchPin ? (wikiData?.title || searchPin.name) : selectedEvent?.title;
  const subtitle = searchPin ? searchPin.full_name : selectedEvent?.categoryTitle;
  const lat = searchPin ? searchPin.latitude : selectedEvent?.lat;
  const lng = searchPin ? searchPin.longitude : selectedEvent?.lng;

  return (
    <div className="detail-view">
      {showShare && lat != null && (
        <ShareModal title={title} lat={lat} lng={lng} onClose={() => setShowShare(false)} />
      )}

      {wikiData?.thumbnail && (
        <img src={wikiData.thumbnail} className="detail-hero" alt={wikiData.title} />
      )}

      <h2 className="detail-title">{title}</h2>
      <p className="detail-subtitle">{subtitle}</p>

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
            <Globe size={15} /> Intel
          </a>
        )}
      </div>

      <div className="about-card">
        <h4 className="about-label">About</h4>
        {loadingWiki ? (
          <p style={{ color: 'var(--muted)' }}>Loading…</p>
        ) : wikiData ? (
          <p>
            {wikiData.extract}{' '}
            <br />
            <a href={wikiData.url} target="_blank" rel="noreferrer" className="wiki-link">
              More on Wikipedia
            </a>
          </p>
        ) : selectedEvent ? (
          <p>
            This is a recorded {selectedEvent.categoryTitle} event tracked by NASA's Earth Observatory
            Natural Event Tracker. Started {new Date(selectedEvent.startTime).toLocaleDateString()}. Status: {selectedEvent.status}.
          </p>
        ) : (
          <p>
            <strong>Coordinates:</strong> {lat?.toFixed(5)}, {lng?.toFixed(5)}<br />
            <strong>Location:</strong> {searchPin?.full_name}
          </p>
        )}
      </div>

      {loadingWeather ? (
        <div className="about-card" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading weather…</div>
      ) : weatherData ? (
        <div className="about-card weather-card" tabIndex={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '8px' }}>
            <Thermometer size={22} color="var(--accent)" />
            <div>
              <h4 className="about-label" style={{ margin: 0 }}>Weather & Climate</h4>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
                Current temperature is <strong style={{ color: 'var(--text)' }}>{weatherData.temp}°C</strong>
              </p>
            </div>
          </div>
          <div className="weather-details">
            <div className="weather-row"><span>High / Low</span><span>{weatherData.max}°C / {weatherData.min}°C</span></div>
            <div className="weather-row"><span>Humidity</span><span>{weatherData.humidity}%</span></div>
            <div className="weather-row"><span>Wind Speed</span><span>{weatherData.wind} km/h</span></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
