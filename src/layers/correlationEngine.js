/**
 * correlationEngine.js
 * Detects compound events: 3+ different disaster categories
 * within 500km and 30 days of each other.
 * Uses Turf.js (global) for distance.
 */

const COMP_SOURCE = 'compound-source';
const COMP_LAYER  = 'compound-layer';
const COMP_PULSE  = 'compound-pulse';
const MS_30_DAYS  = 30 * 24 * 60 * 60 * 1000;

export function detectCompoundEvents(events) {
  const turf = window.turf;
  if (!turf || !events?.length) return [];

  const compounds = [];
  const used = new Set();

  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    const a = events[i];
    const cluster = [a];
    const clusterIdx = [i];

    for (let j = i + 1; j < events.length; j++) {
      if (used.has(j)) continue;
      const b = events[j];
      // Time window check
      if (Math.abs(a.startTime - b.startTime) > MS_30_DAYS) continue;
      // Distance check
      try {
        const dist = turf.distance(
          turf.point([a.lng, a.lat]),
          turf.point([b.lng, b.lat]),
          { units: 'kilometers' }
        );
        if (dist <= 500) { cluster.push(b); clusterIdx.push(j); }
      } catch (_) {}
    }

    // Need 3+ different categories
    const cats = new Set(cluster.map(e => e.categoryId));
    if (cats.size >= 3) {
      // Mark all as used
      clusterIdx.forEach(idx => used.add(idx));
      // Centroid
      const avgLng = cluster.reduce((s, e) => s + e.lng, 0) / cluster.length;
      const avgLat = cluster.reduce((s, e) => s + e.lat, 0) / cluster.length;
      compounds.push({
        id: `compound-${i}`,
        lng: avgLng,
        lat: avgLat,
        events: cluster,
        categories: [...cats],
        severity: cats.size * 10,
      });
    }
  }

  return compounds;
}

export function initCompoundLayer(map, compounds, onCompoundClick) {
  const geojson = {
    type: 'FeatureCollection',
    features: compounds.map(c => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { id: c.id, severity: c.severity, count: c.events.length },
    })),
  };

  try {
    if (map.getSource(COMP_SOURCE)) {
      map.getSource(COMP_SOURCE).setData(geojson);
    } else {
      map.addSource(COMP_SOURCE, { type: 'geojson', data: geojson });

      // Outer pulse ring
      map.addLayer({
        id: COMP_PULSE, type: 'circle', source: COMP_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 18, 4, 30, 8, 45],
          'circle-color': 'rgba(255,255,255,0)',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
          'circle-stroke-opacity': 0.9,
        },
      });

      // Inner dot
      map.addLayer({
        id: COMP_LAYER, type: 'circle', source: COMP_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,200,0,0.9)',
        },
      });
    }
  } catch (e) { console.warn('[correlationEngine] layer failed:', e); }

  // Click handler
  const clickHandler = (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [COMP_LAYER] });
    if (!features.length) return;
    const id = features[0].properties.id;
    const compound = compounds.find(c => c.id === id);
    if (compound) onCompoundClick(compound);
  };
  map.on('click', clickHandler);

  // Animate pulse with CSS — add pulsing class via DOM
  // (MapLibre doesn't support CSS animations natively, so we animate stroke-opacity via RAF)
  let raf = null;
  let t = 0;
  const animate = () => {
    t += 0.03;
    const opacity = 0.4 + 0.5 * Math.abs(Math.sin(t));
    try {
      if (map.getLayer(COMP_PULSE))
        map.setPaintProperty(COMP_PULSE, 'circle-stroke-opacity', opacity);
    } catch (_) {}
    raf = requestAnimationFrame(animate);
  };
  raf = requestAnimationFrame(animate);

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      map.off('click', clickHandler);
      try { if (map.getLayer(COMP_PULSE))  map.removeLayer(COMP_PULSE);  } catch (_) {}
      try { if (map.getLayer(COMP_LAYER))  map.removeLayer(COMP_LAYER);  } catch (_) {}
      try { if (map.getSource(COMP_SOURCE)) map.removeSource(COMP_SOURCE); } catch (_) {}
    },
  };
}
