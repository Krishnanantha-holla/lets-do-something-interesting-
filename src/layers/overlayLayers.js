/**
 * overlayLayers.js — RESET
 * Only 3 layers: Day/Night | ISS Tracker | Tectonic Plates
 */

function safeRemoveLayer(map, id) {
  try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
}
function safeRemoveSource(map, id) {
  try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
}
function setVisibility(map, layerIds, visible) {
  const v = visible ? 'visible' : 'none';
  layerIds.forEach(id => {
    try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v); } catch (_) {}
  });
}

// ─── 1. Day / Night Terminator ───────────────────────────────────────────────

function buildNightPolygon() {
  const SunCalc = window.SunCalc;
  if (!SunCalc) return null;

  const now    = new Date();
  const sunPos = SunCalc.getPosition(now, 0, 0);
  const sunLng = -((now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440) * 360 + 180;
  const sunLat = (sunPos.altitude * 180) / Math.PI;

  const coords = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const cosVal = -Math.cos((lng - sunLng) * Math.PI / 180) / Math.tan(sunLat * Math.PI / 180);
    // clamp to avoid NaN at poles
    const lat = Math.atan(Math.max(-1e6, Math.min(1e6, cosVal))) * 180 / Math.PI;
    coords.push([lng, lat]);
  }

  const poleLat    = sunLat > 0 ? -90 : 90;
  const nightCoords = [...coords, [180, poleLat], [-180, poleLat], coords[0]];

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [nightCoords] },
    properties: {}
  };
}

function initDayNight(map) {
  const SOURCE = 'day-night';
  const LAYER  = 'day-night-layer';
  let interval = null;

  const update = () => {
    const feature = buildNightPolygon();
    if (!feature) return;
    const src = map.getSource(SOURCE);
    if (src) {
      src.setData(feature);
    } else {
      try {
        map.addSource(SOURCE, { type: 'geojson', data: feature });
        map.addLayer({
          id: LAYER, type: 'fill', source: SOURCE,
          paint: { 'fill-color': 'rgba(0,0,30,0.42)', 'fill-opacity': 1 },
          layout: { visibility: 'none' }
        }, 'clusters');
      } catch (e) { console.warn('[daynight] init failed:', e); }
    }
  };

  update();

  return {
    layers: [LAYER],
    onVisibilityChange(visible) {
      if (visible) {
        update(); // refresh immediately on toggle on
        interval = setInterval(update, 60_000);
      } else {
        clearInterval(interval);
        interval = null;
      }
    },
    destroy() {
      clearInterval(interval);
      safeRemoveLayer(map, LAYER);
      safeRemoveSource(map, SOURCE);
    }
  };
}

// ─── 2. ISS Live Tracker ─────────────────────────────────────────────────────

function initISS(map) {
  let marker   = null;
  let interval = null;
  let issData  = null;

  // Create marker element
  const el = document.createElement('div');
  el.id = 'iss-marker-el';
  el.style.cssText = `
    width:28px; height:28px;
    background:rgba(255,255,255,0.15);
    border:1.5px solid rgba(255,255,255,0.7);
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:14px; cursor:pointer;
    box-shadow:0 0 8px rgba(255,255,255,0.4);
    display:none;
  `;
  el.innerHTML = '🛰';
  el.title = 'International Space Station';

  const getPopupHTML = (d) => `
    <div style="font-family:system-ui;font-size:13px;line-height:1.6;padding:4px 2px">
      <strong>🛰 ISS</strong><br/>
      Alt: ${Math.round(d.altitude)} km<br/>
      Speed: ${Math.round(d.velocity)} km/h<br/>
      Lat: ${d.latitude.toFixed(2)}° &nbsp; Lng: ${d.longitude.toFixed(2)}°
    </div>
  `;

  const fetchISS = () => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => {
        issData = d;
        const { longitude, latitude } = d;
        if (!marker) {
          const maplibre = window.maplibregl;
          if (!maplibre) return;
          const popup = new maplibre.Popup({ offset: 20, closeButton: false })
            .setHTML(getPopupHTML(d));
          marker = new maplibre.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .setPopup(popup)
            .addTo(map);
          el.addEventListener('click', () => marker.togglePopup());
        } else {
          marker.setLngLat([longitude, latitude]);
          marker.getPopup()?.setHTML(getPopupHTML(d));
        }
      })
      .catch(e => console.warn('[iss] fetch failed:', e));
  };

  return {
    layers: [], // no MapLibre layer — uses HTML marker
    onVisibilityChange(visible) {
      if (visible) {
        el.style.display = 'flex';
        fetchISS();
        interval = setInterval(fetchISS, 5_000);
      } else {
        el.style.display = 'none';
        clearInterval(interval);
        interval = null;
        if (marker) { marker.remove(); marker = null; }
        const existing = document.getElementById('iss-marker-el');
        if (existing) existing.remove();
      }
    },
    destroy() {
      clearInterval(interval);
      if (marker) marker.remove();
      const existing = document.getElementById('iss-marker-el');
      if (existing) existing.remove();
    }
  };
}

// ─── 3. Tectonic Plate Boundaries ────────────────────────────────────────────

function initTectonic(map) {
  const SOURCE = 'tectonic';
  const LAYER  = 'tectonic-layer';
  let loaded   = false;

  const load = () => {
    if (loaded) return;
    loaded = true;
    fetch('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json')
      .then(r => r.json())
      .then(data => {
        try {
          if (!map.getSource(SOURCE)) {
            map.addSource(SOURCE, { type: 'geojson', data });
            map.addLayer({
              id: LAYER, type: 'line', source: SOURCE,
              paint: { 'line-color': '#FF6B35', 'line-width': 1.2, 'line-opacity': 0.65 },
              layout: { visibility: 'none' }
            }, 'clusters');
          }
          map.setLayoutProperty(LAYER, 'visibility', 'visible');
        } catch (e) { console.warn('[tectonic] addLayer failed:', e); }
      })
      .catch(e => { console.warn('[tectonic] fetch failed:', e); loaded = false; });
  };

  return {
    layers: [LAYER],
    onVisibilityChange(visible) {
      if (visible) {
        load(); // fetch on first toggle, instant on subsequent
      } else {
        try { if (map.getLayer(LAYER)) map.setLayoutProperty(LAYER, 'visibility', 'none'); } catch (_) {}
      }
    },
    destroy() {
      safeRemoveLayer(map, LAYER);
      safeRemoveSource(map, SOURCE);
    }
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initOverlayLayers(map) {
  const controllers = {};
  let ready = false;
  const pending = [];

  const init = () => {
    ready = true;
    controllers.daynight = initDayNight(map);
    controllers.iss      = initISS(map);
    controllers.tectonic = initTectonic(map);

    // Flush any queued toggles
    pending.forEach(({ name, visible }) => {
      const ctrl = controllers[name];
      if (!ctrl) return;
      if (ctrl.layers.length) setVisibility(map, ctrl.layers, visible);
      ctrl.onVisibilityChange?.(visible);
    });
    pending.length = 0;
  };

  if (map.isStyleLoaded()) {
    init();
  } else {
    map.once('styledata', init);
  }

  return {
    toggle(name, visible) {
      if (!ready) { pending.push({ name, visible }); return; }
      const ctrl = controllers[name];
      if (!ctrl) return;
      if (ctrl.layers.length) setVisibility(map, ctrl.layers, visible);
      ctrl.onVisibilityChange?.(visible);
    },
    destroy() { Object.values(controllers).forEach(c => c?.destroy?.()); }
  };
}
