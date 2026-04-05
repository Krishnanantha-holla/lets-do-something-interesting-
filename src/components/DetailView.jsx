import React from 'react';
import { Share2, ExternalLink, Globe, Thermometer } from 'lucide-react';

export default function DetailView({ searchPin, selectedEvent, wikiData, weatherData, loadingWiki, loadingWeather, onShare }) {
  const title = searchPin ? (wikiData?.title || searchPin.name) : selectedEvent?.title;
  const subtitle = searchPin ? searchPin.full_name : selectedEvent?.categoryTitle;

  return (
    <div className="detail-view">
      {wikiData?.thumbnail && (
        <img src={wikiData.thumbnail} className="detail-hero" alt={wikiData.title} />
      )}

      <h2 className="detail-title">{title}</h2>
      <p className="detail-subtitle">{subtitle}</p>

      <div className="action-row">
        <button className="action-btn primary" onClick={onShare}>
          <Share2 size={16} /> Share
        </button>
        {wikiData?.url && (
          <a href={wikiData.url} target="_blank" rel="noreferrer" className="action-btn" style={{ textDecoration: 'none' }}>
            <ExternalLink size={16} /> Wikipedia
          </a>
        )}
        {selectedEvent?.sources?.length > 0 && (
          <a href={selectedEvent.sources[0].url} target="_blank" rel="noreferrer" className="action-btn" style={{ textDecoration: 'none' }}>
            <Globe size={16} /> Intel
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
            This is a recorded {selectedEvent.categoryTitle} event recognized by the Earth Observatory
            Natural Event Tracker (EONET). Started on:{' '}
            {new Date(selectedEvent.startTime).toLocaleDateString()}. Status: {selectedEvent.status}.
          </p>
        ) : (
          <p>
            <strong>Coordinates:</strong> {searchPin.latitude.toFixed(4)}, {searchPin.longitude.toFixed(4)}
            <br />
            <strong>Location:</strong> {searchPin.full_name}
          </p>
        )}
      </div>

      {loadingWeather ? (
        <div className="about-card" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading weather…</div>
      ) : weatherData ? (
        <div className="about-card weather-card" tabIndex={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '8px' }}>
            <Thermometer size={24} color="var(--accent)" />
            <div>
              <h4 className="about-label" style={{ margin: 0 }}>Weather & Climate</h4>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Current temperature is{' '}
                <strong style={{ color: 'var(--text)' }}>{weatherData.temp}°C</strong>.
              </p>
            </div>
          </div>
          <div className="weather-details">
            <div className="weather-row"><span>High/Low</span><span>{weatherData.max}°C / {weatherData.min}°C</span></div>
            <div className="weather-row"><span>Humidity</span><span>{weatherData.humidity}%</span></div>
            <div className="weather-row"><span>Wind Speed</span><span>{weatherData.wind} km/h</span></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
