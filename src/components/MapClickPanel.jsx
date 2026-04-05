import React, { useState, useEffect } from 'react';
import { X, MapPin, Thermometer, Mountain, Globe } from 'lucide-react';

function useGeoInfo(lat, lng) {
  const [weather,   setWeather]   = useState(null);
  const [elevation, setElevation] = useState(null);
  const [placeName, setPlaceName] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    setLoading(true);
    setWeather(null); setElevation(null); setPlaceName(null);

    // 1. Weather (Open-Meteo — free, no key)
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
    )
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.current) return;
        setWeather({
          temp:     d.current.temperature_2m,
          humidity: d.current.relative_humidity_2m,
          wind:     d.current.wind_speed_10m,
          max:      d.daily?.temperature_2m_max?.[0] ?? '—',
          min:      d.daily?.temperature_2m_min?.[0] ?? '—',
        });
      })
      .catch(() => {});

    // 2. Elevation (Open-Elevation — free, no key)
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const elev = d?.results?.[0]?.elevation;
        setElevation(elev != null ? Math.round(elev) : null);
      })
      .catch(() => setElevation(null));

    // 3. Reverse geocode (Nominatim — free)
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const addr = d?.address;
        const parts = [
          addr?.city || addr?.town || addr?.village || addr?.county,
          addr?.state,
          addr?.country,
        ].filter(Boolean);
        setPlaceName(parts.join(', ') || d?.display_name?.split(',').slice(0, 2).join(',') || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [lat, lng]);

  return { weather, elevation, placeName, loading };
}

const WX_CODES = {
  0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Icy fog', 51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Light snow', 73:'Snow', 75:'Heavy snow',
  80:'Rain showers', 81:'Rain showers', 82:'Violent showers',
  95:'Thunderstorm', 96:'Thunderstorm w/ hail', 99:'Thunderstorm w/ heavy hail',
};

export default function MapClickPanel({ lat, lng, onClose }) {
  const { weather, elevation, placeName, loading } = useGeoInfo(lat, lng);

  return (
    <div className="map-click-panel glass">
      <div className="mcp-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={15} color="var(--accent)" />
          <span className="mcp-title">Location Info</span>
        </div>
        <button className="share-close" onClick={onClose}><X size={14} /></button>
      </div>

      {/* Coordinates */}
      <div className="mcp-coords">
        {lat.toFixed(5)}°, {lng.toFixed(5)}°
      </div>

      {/* Place name */}
      {placeName && (
        <div className="mcp-place">
          <Globe size={12} style={{ flexShrink: 0 }} />
          {placeName}
        </div>
      )}

      {loading && <div className="mcp-loading">Fetching geo data…</div>}

      {/* Elevation */}
      {elevation != null && (
        <div className="mcp-row">
          <Mountain size={14} color="var(--muted)" />
          <span className="mcp-row-label">Elevation</span>
          <span className="mcp-row-value">{elevation} m</span>
        </div>
      )}

      {/* Weather */}
      {weather && (
        <div className="mcp-weather">
          <div className="mcp-row">
            <Thermometer size={14} color="var(--muted)" />
            <span className="mcp-row-label">Temperature</span>
            <span className="mcp-row-value">{weather.temp}°C</span>
          </div>
          <div className="mcp-row">
            <span style={{ width: 14 }} />
            <span className="mcp-row-label">High / Low</span>
            <span className="mcp-row-value">{weather.max}° / {weather.min}°C</span>
          </div>
          <div className="mcp-row">
            <span style={{ width: 14 }} />
            <span className="mcp-row-label">Humidity</span>
            <span className="mcp-row-value">{weather.humidity}%</span>
          </div>
          <div className="mcp-row">
            <span style={{ width: 14 }} />
            <span className="mcp-row-label">Wind</span>
            <span className="mcp-row-value">{weather.wind} km/h</span>
          </div>
        </div>
      )}
    </div>
  );
}
