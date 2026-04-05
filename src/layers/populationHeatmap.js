/**
 * populationHeatmap.js
 * Kontur population density as a heatmap layer.
 * Also exposes getPopulationEstimate(map, lng, lat) for event detail panel.
 */

const POP_SOURCE = 'kontur-pop-source';
const POP_LAYER  = 'kontur-pop-layer';

export function initPopulationHeatmap(map) {
  try {
    map.addSource(POP_SOURCE, {
      type: 'vector',
      tiles: ['https://vector.kontur.io/kontur_population/{z}/{x}/{y}.mvt'],
      minzoom: 0,
      maxzoom: 8,
      attribution: '© Kontur Population',
    });

    map.addLayer({
      id: POP_LAYER,
      type: 'heatmap',
      source: POP_SOURCE,
      'source-layer': 'kontur_population',
      maxzoom: 12,
      paint: {
        // Weight by population field
        'heatmap-weight': [
          'interpolate', ['linear'],
          ['coalesce', ['get', 'population'], ['get', 'pop'], 0],
          0, 0,
          1000, 0.3,
          10000, 0.6,
          100000, 1,
        ],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 8, 2],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(0,0,0,0)',
          0.2, 'rgba(255,165,0,0.15)',
          0.5, 'rgba(255,120,0,0.3)',
          0.8, 'rgba(255,50,0,0.5)',
          1,   'rgba(255,0,0,0.65)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 8, 24],
        'heatmap-opacity': 0.85,
      },
      layout: { visibility: 'none' },
    }, 'events-layer');
  } catch (e) {
    console.warn('[populationHeatmap] init failed:', e);
  }

  return {
    layers: [POP_LAYER],
    destroy() {
      try { if (map.getLayer(POP_LAYER))  map.removeLayer(POP_LAYER);  } catch (_) {}
      try { if (map.getSource(POP_SOURCE)) map.removeSource(POP_SOURCE); } catch (_) {}
    },
  };
}

/**
 * Returns a rough population estimate near [lng, lat] by querying
 * rendered features from the Kontur vector tile source.
 */
export function getPopulationEstimate(map, lng, lat) {
  try {
    if (!map.getLayer(POP_LAYER)) return null;
    if (map.getLayoutProperty(POP_LAYER, 'visibility') !== 'visible') return null;

    const pt = map.project([lng, lat]);
    const features = map.queryRenderedFeatures(
      [[ pt.x - 20, pt.y - 20 ], [ pt.x + 20, pt.y + 20 ]],
      { layers: [POP_LAYER] }
    );
    if (!features.length) return null;

    const total = features.reduce((sum, f) => {
      const p = f.properties?.population ?? f.properties?.pop ?? 0;
      return sum + Number(p);
    }, 0);

    return total > 0 ? total : null;
  } catch (_) {
    return null;
  }
}
