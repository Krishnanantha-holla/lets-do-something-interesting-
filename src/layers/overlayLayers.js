/**
 * overlayLayers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Five isolated, toggleable overlay layers for the Atlas map.
 * Call initOverlayLayers(map) once after the map 'load' event.
 * Returns a controller object with toggle(layerName, bool) method.
 *
 * Layers: daynight | iss | tectonic | aurora | currents | faults
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initFaultLines } from './faultLines.js';
import { initPopulationHeatmap, getPopulationEstimate } from './populationHeatmap.js';
import { initFirmsTracker } from './firmsTracker.js';
import { initMagDeclination } from './magDeclination.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeAdd(map, id, source, layer) {
  try {
    if (!map.getSource(id)) map.addSource(id, source);
    if (!map.getLayer(layer.id)) map.addLayer(layer, 'events-layer'); // below event markers
  } catch (e) { console.warn('[overlayLayers] addLayer failed:', e); }
}

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
  // SunCalc is loaded globally via CDN
  const SunCalc = window.SunCalc;
  if (!SunCalc) return null;

  const now = new Date();
  const pos = SunCalc.getPosition(now, 0, 0);
  // Sun's sub-solar point
  const sunLat = pos.altitude * (180 / Math.PI);
  // Use SunCalc.getTimes to get solar noon longitude
  const times = SunCalc.getTimes(now, 0, 0);
  const solarNoon = times.solarNoon;
  const utcHours = solarNoon.getUTCHours() + solarNoon.getUTCMinutes() / 60;
  const sunLng = (utcHours - 12) * -15;

  // Build terminator: great circle 90° from sub-solar point
  const coords = [];
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  const φs = toRad(sunLat);
  const λs = toRad(sunLng);

  for (let i = 0; i <= 360; i++) {
    const az = toRad(i);
    // Point 90° from sub-solar point along azimuth
    const φ = Math.asin(
      Math.sin(φs) * Math.cos(Math.PI / 2) +
      Math.cos(φs) * Math.sin(Math.PI / 2) * Math.cos(az)
    );
    const λ = λs + Math.atan2(
      Math.sin(az) * Math.sin(Math.PI / 2) * Math.cos(φs),
      Math.cos(Math.PI / 2) - Math.sin(φs) * Math.sin(φ)
    );
    coords.push([toDeg(λ), toDeg(φ)]);
  }

  // Build night polygon: terminator ring + pole cap on the night side
  // Night side is opposite the sun — add south pole if sun is in north, vice versa
  const nightPole = sunLat >= 0 ? -90 : 90;
  const ring = [...coords, coords[0]];

  // Insert pole corners to close the polygon correctly
  const poly = [
    [coords[0][0], nightPole],
    ...ring,
    [coords[coords.length - 1][0], nightPole],
  ];

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [poly] },
    properties: {}
  };
}

function initDayNight(map) {
  const SOURCE = 'daynight-source';
  const LAYER  = 'daynight-layer';

  const update = () => {
    const feature = buildNightPolygon();
    if (!feature) return;
    const geojson = { type: 'FeatureCollection', features: [feature] };
    const src = map.getSource(SOURCE);
    if (src) {
      src.setData(geojson);
    } else {
      try {
        map.addSource(SOURCE, { type: 'geojson', data: geojson });
        map.addLayer({
          id: LAYER, type: 'fill', source: SOURCE,
          paint: { 'fill-color': 'rgba(0,0,20,0.45)', 'fill-opacity': 1 },
          layout: { visibility: 'none' }
        }, 'events-layer');
      } catch (e) { console.warn('[daynight] init failed:', e); }
    }
  };

  update();
  const interval = setInterval(update, 60_000);

  return {
    layers: [LAYER],
    destroy: () => {
      clearInterval(interval);
      safeRemoveLayer(map, LAYER);
      safeRemoveSource(map, SOURCE);
    }
  };
}

// ─── 2. ISS Live Tracker ─────────────────────────────────────────────────────

function initISS(map) {
  const SOURCE  = 'iss-source';
  const LAYER   = 'iss-layer';
  const TRAIL_S = 'iss-trail-source';
  const TRAIL_L = 'iss-trail-layer';
  let marker    = null;
  let tooltip   = null;
  let interval  = null;
  let trail     = []; // last N positions

  const geojsonPoint = (lng, lat) => ({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }]
  });

  const geojsonTrail = (coords) => ({
    type: 'FeatureCollection',
    features: coords.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }] : []
  });

  // Custom HTML marker
  const el = document.createElement('div');
  el.className = 'iss-marker';
  el.innerHTML = `<div class="iss-dot"></div><div class="iss-label">ISS</div>`;
  el.style.cssText = 'display:none;cursor:pointer;';

  // Tooltip
  tooltip = document.createElement('div');
  tooltip.className = 'iss-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  let issData = null;

  el.addEventListener('mouseenter', () => {
    if (!issData) return;
    tooltip.innerHTML = `
      <div class="iss-tt-title">🛰 ISS</div>
      <div class="iss-tt-row"><span>Latitude</span><span>${issData.latitude.toFixed(4)}°</span></div>
      <div class="iss-tt-row"><span>Longitude</span><span>${issData.longitude.toFixed(4)}°</span></div>
      <div class="iss-tt-row"><span>Altitude</span><span>${issData.altitude.toFixed(1)} km</span></div>
      <div class="iss-tt-row"><span>Velocity</span><span>${Math.round(issData.velocity)} km/h</span></div>
    `;
    tooltip.style.display = 'block';
  });
  el.addEventListener('mousemove', (e) => {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
  });
  el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  el.addEventListener('click', () => {
    if (!issData) return;
    map.flyTo({ center: [issData.longitude, issData.latitude], zoom: 3, duration: 1200 });
  });

  // Add trail source/layer
  try {
    map.addSource(TRAIL_S, { type: 'geojson', data: geojsonTrail([]) });
    map.addLayer({
      id: TRAIL_L, type: 'line', source: TRAIL_S,
      paint: { 'line-color': 'rgba(255,255,255,0.25)', 'line-width': 1.5, 'line-dasharray': [2, 3] },
      layout: { visibility: 'none' }
    }, 'events-layer');
  } catch (e) { console.warn('[iss] trail init failed:', e); }

  const { Marker: MLMarker } = window.maplibregl || {};

  const fetch5s = () => {
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(r => r.json())
      .then(d => {
        issData = d;
        const { longitude, latitude } = d;

        // Update trail
        trail.push([longitude, latitude]);
        if (trail.length > 60) trail.shift();
        const ts = map.getSource(TRAIL_S);
        if (ts) ts.setData(geojsonTrail(trail));

        // Move marker
        if (!marker) {
          // Use maplibre-gl Marker directly
          const maplibre = window.maplibregl;
          if (maplibre) {
            marker = new maplibre.Marker({ element: el })
              .setLngLat([longitude, latitude])
              .addTo(map);
          }
        } else {
          marker.setLngLat([longitude, latitude]);
        }

        // Show/hide based on layer visibility
        const vis = map.getLayoutProperty(TRAIL_L, 'visibility');
        el.style.display = vis === 'visible' ? 'block' : 'none';
      })
      .catch(e => console.warn('[iss] fetch failed:', e));
  };

  fetch5s();
  interval = setInterval(fetch5s, 5_000);

  return {
    layers: [TRAIL_L],
    markerEl: el,
    onVisibilityChange: (visible) => {
      el.style.display = visible ? 'block' : 'none';
    },
    destroy: () => {
      clearInterval(interval);
      if (marker) marker.remove();
      if (tooltip) tooltip.remove();
      safeRemoveLayer(map, TRAIL_L);
      safeRemoveSource(map, TRAIL_S);
    }
  };
}

// ─── 3. Tectonic Plate Boundaries ────────────────────────────────────────────

function initTectonic(map) {
  const SOURCE = 'tectonic-source';
  const LAYER  = 'tectonic-layer';
  const URL    = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json';

  fetch(URL)
    .then(r => r.json())
    .then(data => {
      try {
        map.addSource(SOURCE, { type: 'geojson', data });
        map.addLayer({
          id: LAYER, type: 'line', source: SOURCE,
          paint: { 'line-color': '#FF6B35', 'line-opacity': 0.7, 'line-width': 1.2 },
          layout: { visibility: 'none' }
        }, 'events-layer');
      } catch (e) { console.warn('[tectonic] addLayer failed:', e); }
    })
    .catch(e => console.warn('[tectonic] fetch failed:', e));

  return {
    layers: [LAYER],
    destroy: () => { safeRemoveLayer(map, LAYER); safeRemoveSource(map, SOURCE); }
  };
}

// ─── 4. Aurora Forecast Zones ────────────────────────────────────────────────

function kpToMinLat(kp) {
  if (kp >= 7) return 40;
  if (kp >= 5) return 50;
  if (kp >= 3) return 60;
  return 67;
}

function buildAuroraPolygons(minLat) {
  // North polar cap
  const northRing = [];
  const southRing = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    northRing.push([lng,  minLat]);
    southRing.push([lng, -minLat]);
  }
  northRing.push([-180,  minLat]);
  southRing.push([-180, -minLat]);

  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...northRing, [-180, 90], [180, 90], [-180, minLat]]] }, properties: {} },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...southRing, [-180, -90], [180, -90], [-180, -minLat]]] }, properties: {} },
    ]
  };
}

function initAurora(map) {
  const SOURCE = 'aurora-source';
  const LAYER  = 'aurora-layer';
  let kpBadge  = null;
  let interval = null;

  // Create Kp badge element
  kpBadge = document.createElement('div');
  kpBadge.className = 'kp-badge';
  kpBadge.style.display = 'none';
  kpBadge.textContent = 'Kp: —';
  document.body.appendChild(kpBadge);

  const update = () => {
    fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
      .then(r => r.json())
      .then(data => {
        const latest = data[data.length - 1];
        const kp = parseFloat(latest?.kp_index ?? latest?.Kp ?? 2);
        const minLat = kpToMinLat(kp);
        const geojson = buildAuroraPolygons(minLat);

        if (kpBadge) kpBadge.textContent = `Kp: ${kp.toFixed(1)}`;

        const src = map.getSource(SOURCE);
        if (src) {
          src.setData(geojson);
        } else {
          try {
            map.addSource(SOURCE, { type: 'geojson', data: geojson });
            map.addLayer({
              id: LAYER, type: 'fill', source: SOURCE,
              paint: { 'fill-color': 'rgba(0,255,180,0.18)', 'fill-opacity': 1 },
              layout: { visibility: 'none' }
            }, 'events-layer');
          } catch (e) { console.warn('[aurora] addLayer failed:', e); }
        }
      })
      .catch(e => console.warn('[aurora] fetch failed:', e));
  };

  update();
  interval = setInterval(update, 5 * 60_000);

  return {
    layers: [LAYER],
    kpBadge,
    onVisibilityChange: (visible) => {
      if (kpBadge) kpBadge.style.display = visible ? 'block' : 'none';
    },
    destroy: () => {
      clearInterval(interval);
      if (kpBadge) kpBadge.remove();
      safeRemoveLayer(map, LAYER);
      safeRemoveSource(map, SOURCE);
    }
  };
}

// ─── 5. Ocean Currents (animated) ────────────────────────────────────────────

const OCEAN_CURRENTS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Gulf Stream' },
      geometry: { type: 'LineString', coordinates: [[-80,25],[-79,28],[-76,32],[-72,36],[-65,40],[-55,43],[-45,45],[-35,47],[-20,50],[-10,52],[0,53]] } },
    { type: 'Feature', properties: { name: 'Kuroshio' },
      geometry: { type: 'LineString', coordinates: [[122,25],[127,28],[132,32],[138,36],[142,40],[148,43],[155,45],[160,44],[165,42]] } },
    { type: 'Feature', properties: { name: 'Antarctic Circumpolar' },
      geometry: { type: 'LineString', coordinates: [[-180,-55],[-150,-57],[-120,-58],[-90,-57],[-60,-56],[-30,-55],[0,-54],[30,-55],[60,-56],[90,-57],[120,-58],[150,-57],[180,-55]] } },
    { type: 'Feature', properties: { name: 'Labrador' },
      geometry: { type: 'LineString', coordinates: [[-55,60],[-57,55],[-58,50],[-57,45],[-55,42],[-52,40]] } },
    { type: 'Feature', properties: { name: 'California' },
      geometry: { type: 'LineString', coordinates: [[-125,48],[-124,44],[-122,38],[-118,32],[-115,26],[-112,22]] } },
    { type: 'Feature', properties: { name: 'Humboldt' },
      geometry: { type: 'LineString', coordinates: [[-70,-50],[-72,-45],[-74,-38],[-76,-30],[-78,-22],[-80,-15],[-82,-8],[-83,0]] } },
    { type: 'Feature', properties: { name: 'Agulhas' },
      geometry: { type: 'LineString', coordinates: [[40,-25],[38,-28],[35,-32],[32,-35],[28,-37],[24,-38],[20,-38],[16,-36]] } },
    { type: 'Feature', properties: { name: 'North Atlantic Drift' },
      geometry: { type: 'LineString', coordinates: [[-40,45],[-30,48],[-20,50],[-10,52],[0,53],[10,55],[15,57],[20,58]] } },
  ]
};

function initOceanCurrents(map) {
  const SOURCE = 'currents-source';
  const LAYER  = 'currents-layer';
  let rafId    = null;
  let offset   = 0;

  try {
    map.addSource(SOURCE, { type: 'geojson', data: OCEAN_CURRENTS_GEOJSON });
    map.addLayer({
      id: LAYER, type: 'line', source: SOURCE,
      paint: {
        'line-color': 'rgba(0,180,255,0.55)',
        'line-width': 2,
        'line-dasharray': [3, 3],
      },
      layout: { visibility: 'none' }
    }, 'events-layer');
  } catch (e) { console.warn('[currents] addLayer failed:', e); }

  // Animate dash offset to simulate flow
  const animate = () => {
    offset = (offset + 0.05) % 6;
    try {
      if (map.getLayer(LAYER) && map.getLayoutProperty(LAYER, 'visibility') === 'visible') {
        map.setPaintProperty(LAYER, 'line-dasharray', [3, 3]);
        // MapLibre doesn't support line-dash-offset directly, so we cycle the array
        const d = offset % 1;
        map.setPaintProperty(LAYER, 'line-dasharray', [3 - d, 3 + d]);
      }
    } catch (_) {}
    rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);

  return {
    layers: [LAYER],
    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      safeRemoveLayer(map, LAYER);
      safeRemoveSource(map, SOURCE);
    }
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function initOverlayLayers(map) {
  const controllers = {};
  let ready = false;
  const pending = []; // queued toggle calls before init completes

  const init = () => {
    ready = true;
    controllers.daynight   = initDayNight(map);
    controllers.iss        = initISS(map);
    controllers.tectonic   = initTectonic(map);
    controllers.aurora     = initAurora(map);
    controllers.currents   = initOceanCurrents(map);
    controllers.faults     = initFaultLines(map);
    controllers.population = initPopulationHeatmap(map);
    controllers.firms      = initFirmsTracker(map, null, []);
    initMagDeclination(map).then(ctrl => {
      controllers.magdecl = ctrl;
      // Flush any pending magdecl toggles
      pending.filter(p => p.name === 'magdecl').forEach(p => {
        setVisibility(map, ctrl.layers, p.visible);
        ctrl.onVisibilityChange?.(p.visible);
      });
    });
    // Flush pending toggles for non-async layers
    pending.forEach(({ name, visible }) => {
      if (name === 'magdecl') return; // handled above
      const ctrl = controllers[name];
      if (!ctrl) return;
      setVisibility(map, ctrl.layers, visible);
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
      if (!ctrl) { pending.push({ name, visible }); return; } // e.g. magdecl still loading
      setVisibility(map, ctrl.layers, visible);
      ctrl.onVisibilityChange?.(visible);
    },
    getPopulationEstimate(lng, lat) { return getPopulationEstimate(map, lng, lat); },
    getFirmsCount()          { return controllers.firms?.getCount?.() ?? 0; },
    setFirmsCountCallback(fn){ controllers.firms?.setOnCountUpdate?.(fn); },
    reinitFirms(apiKey, evs) {
      controllers.firms?.destroy?.();
      controllers.firms = initFirmsTracker(map, apiKey, evs);
    },
    destroy() { Object.values(controllers).forEach(c => c?.destroy?.()); }
  };
}
