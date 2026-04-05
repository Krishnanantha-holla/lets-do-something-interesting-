/**
 * timeMachine.js
 * Overlays NASA GIBS WMTS satellite imagery for a chosen date
 * and replaces live markers with events from that date only.
 */

import { CATEGORY_COLORS } from '../api.js';

const TM_WMTS_SOURCE  = 'tm-wmts-source';
const TM_WMTS_LAYER   = 'tm-wmts-layer';
const TM_EVENTS_SOURCE = 'tm-events-source';
const TM_EVENTS_LAYER  = 'tm-events-layer';
const TM_EVENTS_PULSE  = 'tm-events-pulse';

function normalizeEvent(ev) {
  if (!ev?.geometry?.length) return null;
  const g = ev.geometry[0];
  const coords = g.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const cat = ev.categories?.[0] || {};
  const catId = cat.id || 'unknown';
  return {
    id: ev.id,
    color: CATEGORY_COLORS[catId] || '#aaa',
    lng: Number(coords[0]),
    lat: Number(coords[1]),
  };
}

export function createTimeMachineController(map) {
  let active = false;

  const ensureLayers = (dateStr) => {
    // WMTS raster layer
    const tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${dateStr}/250m/{z}/{y}/{x}.jpg`;

    // Remove old if exists
    try { if (map.getLayer(TM_WMTS_LAYER))   map.removeLayer(TM_WMTS_LAYER);   } catch (_) {}
    try { if (map.getSource(TM_WMTS_SOURCE))  map.removeSource(TM_WMTS_SOURCE); } catch (_) {}

    try {
      map.addSource(TM_WMTS_SOURCE, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: 'NASA GIBS / MODIS Terra',
        scheme: 'tms',
      });
      // Insert below markers but above base map
      const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
      map.addLayer({ id: TM_WMTS_LAYER, type: 'raster', source: TM_WMTS_SOURCE,
        paint: { 'raster-opacity': 0.85 }
      }, firstSymbol || 'events-layer');
    } catch (e) { console.warn('[timeMachine] WMTS layer failed:', e); }

    // Events layer
    if (!map.getSource(TM_EVENTS_SOURCE)) {
      map.addSource(TM_EVENTS_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: TM_EVENTS_LAYER, type: 'circle', source: TM_EVENTS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 4, 6, 12, 11],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        }
      });
      map.addLayer({ id: TM_EVENTS_PULSE, type: 'circle', source: TM_EVENTS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 8, 4, 20, 12, 40],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.15,
          'circle-stroke-width': 0,
        }
      });
    }
  };

  return {
    async activate(dateStr, onHideLive, onShowLive) {
      active = true;
      onHideLive?.();
      ensureLayers(dateStr);

      // Fetch events for that date
      try {
        const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=all&start=${dateStr}&end=${dateStr}&limit=200`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        const features = (data.events || [])
          .map(normalizeEvent).filter(Boolean)
          .map(e => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
            properties: { color: e.color }
          }));
        const src = map.getSource(TM_EVENTS_SOURCE);
        if (src) src.setData({ type: 'FeatureCollection', features });
      } catch (e) { console.warn('[timeMachine] events fetch failed:', e); }
    },

    deactivate(onShowLive) {
      active = false;
      onShowLive?.();
      try { if (map.getLayer(TM_WMTS_LAYER))   map.removeLayer(TM_WMTS_LAYER);   } catch (_) {}
      try { if (map.getSource(TM_WMTS_SOURCE))  map.removeSource(TM_WMTS_SOURCE); } catch (_) {}
      try { if (map.getLayer(TM_EVENTS_PULSE))  map.removeLayer(TM_EVENTS_PULSE); } catch (_) {}
      try { if (map.getLayer(TM_EVENTS_LAYER))  map.removeLayer(TM_EVENTS_LAYER); } catch (_) {}
      try { if (map.getSource(TM_EVENTS_SOURCE)) map.removeSource(TM_EVENTS_SOURCE); } catch (_) {}
    },

    get isActive() { return active; },
  };
}
