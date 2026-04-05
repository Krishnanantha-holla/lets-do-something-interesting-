/**
 * magDeclination.js
 * Global magnetic declination grid overlay.
 * Samples NOAA WMM at 10° grid, builds colored GeoJSON polygons.
 * Caches in sessionStorage.
 */

const MAG_SOURCE = 'mag-decl-source';
const MAG_LAYER  = 'mag-decl-layer';
const CACHE_KEY  = 'atlas_mag_decl_v1';
let legendEl     = null;

async function fetchGrid() {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch (_) {} }

  const step = 10;
  const lats = [];
  const lngs = [];
  for (let lat = -80; lat <= 80; lat += step) lats.push(lat);
  for (let lng = -180; lng < 180; lng += step) lngs.push(lng);

  // Batch requests with small delay to avoid rate limiting
  const results = [];
  for (const lat of lats) {
    for (const lng of lngs) {
      results.push({ lat, lng, decl: null });
    }
  }

  // Fetch in batches of 10 with 50ms gap
  const BATCH = 10;
  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    await Promise.all(batch.map(async (pt) => {
      try {
        const url = `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat=${pt.lat}&lon=${pt.lng}&key=zNEw7&resultFormat=json`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        pt.decl = data?.result?.[0]?.declination ?? 0;
      } catch (_) { pt.decl = 0; }
    }));
    await new Promise(r => setTimeout(r, 60));
  }

  sessionStorage.setItem(CACHE_KEY, JSON.stringify(results));
  return results;
}

function buildGeoJSON(grid, step = 10) {
  const features = [];
  for (const pt of grid) {
    if (pt.decl === null || pt.decl === 0) continue;
    const { lat, lng, decl } = pt;
    const absD = Math.abs(decl);
    const alpha = Math.min(0.35, absD / 30 * 0.35);
    const color = decl < 0
      ? `rgba(0,100,255,${alpha.toFixed(3)})`
      : `rgba(255,50,0,${alpha.toFixed(3)})`;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lng,        lat],
          [lng + step, lat],
          [lng + step, lat + step],
          [lng,        lat + step],
          [lng,        lat],
        ]],
      },
      properties: { color, decl },
    });
  }
  return { type: 'FeatureCollection', features };
}

export async function initMagDeclination(map) {
  // Legend
  legendEl = document.createElement('div');
  legendEl.className = 'mag-legend';
  legendEl.innerHTML = `
    <div class="mag-legend-title">Magnetic Declination</div>
    <div class="mag-legend-bar">
      <span style="color:#6699ff">◀ West</span>
      <span style="color:var(--muted)">0°</span>
      <span style="color:#ff5533">East ▶</span>
    </div>
  `;
  legendEl.style.display = 'none';
  document.body.appendChild(legendEl);

  let loaded = false;

  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const grid = await fetchGrid();
      const geojson = buildGeoJSON(grid);
      if (map.getSource(MAG_SOURCE)) {
        map.getSource(MAG_SOURCE).setData(geojson);
      } else {
        map.addSource(MAG_SOURCE, { type: 'geojson', data: geojson });
        map.addLayer({
          id: MAG_LAYER, type: 'fill', source: MAG_SOURCE,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 1,
          },
          layout: { visibility: 'none' },
        }, 'events-layer');
      }
    } catch (e) { console.warn('[magDeclination] failed:', e); loaded = false; }
  };

  return {
    layers: [MAG_LAYER],
    onVisibilityChange(visible) {
      if (visible) { load(); if (legendEl) legendEl.style.display = 'block'; }
      else { if (legendEl) legendEl.style.display = 'none'; }
    },
    destroy() {
      if (legendEl) { legendEl.remove(); legendEl = null; }
      try { if (map.getLayer(MAG_LAYER))  map.removeLayer(MAG_LAYER);  } catch (_) {}
      try { if (map.getSource(MAG_SOURCE)) map.removeSource(MAG_SOURCE); } catch (_) {}
    },
  };
}
