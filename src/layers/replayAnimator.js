/**
 * replayAnimator.js
 * Fetches a year's EONET events and animates them chronologically on the map.
 * Completely isolated — does not touch existing sources/layers.
 */

import { CATEGORY_COLORS } from '../api.js';

const REPLAY_SOURCE = 'replay-source';
const REPLAY_LAYER  = 'replay-layer';
const REPLAY_PULSE  = 'replay-pulse';

function normalizeReplayEvent(ev) {
  if (!ev?.geometry?.length) return null;
  const g = ev.geometry[0];
  const coords = g.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const cat = ev.categories?.[0] || {};
  const catId = cat.id || 'unknown';
  return {
    id: ev.id,
    title: ev.title || 'Event',
    color: CATEGORY_COLORS[catId] || '#aaa',
    lng: Number(coords[0]),
    lat: Number(coords[1]),
    date: new Date(g.date),
  };
}

export async function fetchReplayEvents(year) {
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=closed&start=${year}-01-01&end=${year}-12-31&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('EONET replay fetch failed');
  const data = await res.json();
  return (data.events || [])
    .map(normalizeReplayEvent)
    .filter(e => e && isFinite(e.lng) && isFinite(e.lat) && !isNaN(e.date))
    .sort((a, b) => a.date - b.date);
}

export function createReplayController(map) {
  let events    = [];
  let index     = 0;
  let timer     = null;
  let playing   = false;
  let onTick    = null; // callback(index, event, total)
  let onDone    = null;
  let revealed  = [];

  const SPEEDS = { '0.5': 600, '1': 300, '2': 150, '5': 60 };
  let speed = '1';

  // Init sources/layers once
  const ensureLayers = () => {
    if (!map.getSource(REPLAY_SOURCE)) {
      map.addSource(REPLAY_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: REPLAY_LAYER, type: 'circle', source: REPLAY_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 4, 6, 12, 11],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
        }
      });
      map.addLayer({
        id: REPLAY_PULSE, type: 'circle', source: REPLAY_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 8, 4, 20, 12, 40],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }
      });
    }
  };

  const flush = () => {
    try {
      const src = map.getSource(REPLAY_SOURCE);
      if (src) src.setData({
        type: 'FeatureCollection',
        features: revealed.map(e => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
          properties: { color: e.color }
        }))
      });
    } catch (_) {}
  };

  const step = () => {
    if (index >= events.length) { playing = false; onDone?.(); return; }
    const ev = events[index];
    revealed.push(ev);
    flush();
    onTick?.(index, ev, events.length);
    index++;
    if (playing) timer = setTimeout(step, SPEEDS[speed] || 300);
  };

  return {
    load(evs) {
      events = evs; index = 0; revealed = []; playing = false;
      clearTimeout(timer);
      ensureLayers();
      flush();
    },
    play() {
      if (playing) return;
      playing = true;
      step();
    },
    pause() {
      playing = false;
      clearTimeout(timer);
    },
    seek(i) {
      clearTimeout(timer);
      playing = false;
      index = Math.max(0, Math.min(i, events.length));
      revealed = events.slice(0, index);
      flush();
      onTick?.(index - 1, events[index - 1], events.length);
    },
    setSpeed(s) { speed = s; },
    setOnTick(fn) { onTick = fn; },
    setOnDone(fn) { onDone = fn; },
    get total() { return events.length; },
    get currentIndex() { return index; },
    destroy() {
      clearTimeout(timer);
      try { if (map.getLayer(REPLAY_PULSE)) map.removeLayer(REPLAY_PULSE); } catch (_) {}
      try { if (map.getLayer(REPLAY_LAYER)) map.removeLayer(REPLAY_LAYER); } catch (_) {}
      try { if (map.getSource(REPLAY_SOURCE)) map.removeSource(REPLAY_SOURCE); } catch (_) {}
    }
  };
}
