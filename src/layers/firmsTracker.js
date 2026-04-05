/**
 * firmsTracker.js
 * NASA FIRMS near-real-time fire hotspots.
 * Falls back to EONET wildfire events if no API key is available.
 */

const FIRMS_SOURCE  = 'firms-source';
const FIRMS_LAYER   = 'firms-layer';
const FIRMS_CLICK_L = 'firms-click-layer'; // wider invisible hit area

let firmsTooltip = null;
let firmsCount   = 0;
let onCountUpdate = null;

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return obj;
  }).filter(r => r.latitude && r.longitude);
}

function buildGeoJSON(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)] },
      properties: {
        confidence: r.confidence || r.conf || '—',
        frp: r.frp || '—',
        acq_date: r.acq_date || '—',
        acq_time: r.acq_time || '—',
      },
    })),
  };
}

export function initFirmsTracker(map, apiKey, eonetWildfires = []) {
  // Tooltip element
  firmsTooltip = document.createElement('div');
  firmsTooltip.className = 'firms-tooltip';
  firmsTooltip.style.display = 'none';
  document.body.appendChild(firmsTooltip);

  const setData = (geojson) => {
    firmsCount = geojson.features.length;
    onCountUpdate?.(firmsCount);
    const src = map.getSource(FIRMS_SOURCE);
    if (src) { src.setData(geojson); return; }
    try {
      map.addSource(FIRMS_SOURCE, { type: 'geojson', data: geojson });
      map.addLayer({
        id: FIRMS_LAYER, type: 'circle', source: FIRMS_SOURCE,
        paint: {
          'circle-radius': 3,
          'circle-color': '#FF2200',
          'circle-opacity': 0.8,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': 'rgba(255,100,0,0.5)',
        },
        layout: { visibility: 'none' },
      }, 'events-layer');
      // Wider invisible hit layer for easier clicking
      map.addLayer({
        id: FIRMS_CLICK_L, type: 'circle', source: FIRMS_SOURCE,
        paint: { 'circle-radius': 10, 'circle-opacity': 0 },
        layout: { visibility: 'none' },
      });
    } catch (e) { console.warn('[firms] addLayer failed:', e); }
  };

  // Click handler
  const clickHandler = (e) => {
    try {
      if (map.getLayoutProperty(FIRMS_LAYER, 'visibility') !== 'visible') return;
    } catch (_) { return; }
    const features = map.queryRenderedFeatures(e.point, { layers: [FIRMS_CLICK_L] });
    if (!features.length) return;
    const p = features[0].properties;
    if (firmsTooltip) {
      firmsTooltip.innerHTML = `
        <div class="firms-tt-title">🔥 Active Fire Detection</div>
        <div class="firms-tt-row"><span>Confidence</span><span>${p.confidence}%</span></div>
        <div class="firms-tt-row"><span>FRP</span><span>${p.frp} MW</span></div>
        <div class="firms-tt-row"><span>Date</span><span>${p.acq_date} ${p.acq_time?.slice(0,2)}:${p.acq_time?.slice(2) || '00'} UTC</span></div>
      `;
      firmsTooltip.style.display = 'block';
      firmsTooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
      firmsTooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
    }
  };
  const hideTooltip = () => { if (firmsTooltip) firmsTooltip.style.display = 'none'; };
  map.on('click', clickHandler);
  map.on('movestart', hideTooltip);

  // Fetch FIRMS data
  const load = async () => {
    if (apiKey) {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/-180,-90,180,90/1`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('FIRMS API error');
        const text = await res.text();
        const rows = parseCSV(text);
        if (rows.length > 0) { setData(buildGeoJSON(rows)); return; }
      } catch (e) { console.warn('[firms] API fetch failed, using fallback:', e); }
    }
    // Fallback: use EONET wildfire events
    const fallback = {
      type: 'FeatureCollection',
      features: eonetWildfires.map(ev => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
        properties: { confidence: '—', frp: '—', acq_date: new Date(ev.startTime).toISOString().split('T')[0], acq_time: '0000' },
      })),
    };
    setData(fallback);
  };

  load();

  return {
    layers: [FIRMS_LAYER, FIRMS_CLICK_L],
    onVisibilityChange(visible) {
      try {
        if (map.getLayer(FIRMS_CLICK_L))
          map.setLayoutProperty(FIRMS_CLICK_L, 'visibility', visible ? 'visible' : 'none');
      } catch (_) {}
      if (!visible && firmsTooltip) firmsTooltip.style.display = 'none';
    },
    setOnCountUpdate(fn) { onCountUpdate = fn; fn(firmsCount); },
    getCount() { return firmsCount; },
    destroy() {
      map.off('click', clickHandler);
      map.off('movestart', hideTooltip);
      if (firmsTooltip) { firmsTooltip.remove(); firmsTooltip = null; }
      try { if (map.getLayer(FIRMS_CLICK_L)) map.removeLayer(FIRMS_CLICK_L); } catch (_) {}
      try { if (map.getLayer(FIRMS_LAYER))   map.removeLayer(FIRMS_LAYER);   } catch (_) {}
      try { if (map.getSource(FIRMS_SOURCE)) map.removeSource(FIRMS_SOURCE); } catch (_) {}
    },
  };
}
