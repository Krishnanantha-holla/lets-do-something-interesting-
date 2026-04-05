/**
 * faultLines.js
 * Renders major global fault lines and checks proximity on map click.
 * Uses Turf.js (loaded globally via CDN) for distance calculation.
 */

export const FAULT_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type:'Feature', properties:{ name:'San Andreas Fault' },
      geometry:{ type:'LineString', coordinates:[[-124.2,40.4],[-122.4,37.8],[-119.5,35.2],[-117.6,33.9],[-116.5,32.7]] }},
    { type:'Feature', properties:{ name:'Cascadia Subduction Zone' },
      geometry:{ type:'LineString', coordinates:[[-128,49],[-126,46],[-124.5,43],[-124,41]] }},
    { type:'Feature', properties:{ name:'Hayward Fault' },
      geometry:{ type:'LineString', coordinates:[[-122.1,37.9],[-121.9,37.6],[-121.7,37.3]] }},
    { type:'Feature', properties:{ name:'North Anatolian Fault' },
      geometry:{ type:'LineString', coordinates:[[26.5,41],[28,40.8],[30,40.5],[32,40.2],[34,39.8],[36,39.5],[38,39.2],[40,39],[42,39.2]] }},
    { type:'Feature', properties:{ name:'East Anatolian Fault' },
      geometry:{ type:'LineString', coordinates:[[36.2,36.8],[37.5,37.5],[38.5,38],[39.5,38.5],[40.5,39],[41.5,39.5]] }},
    { type:'Feature', properties:{ name:'Alpine Fault (New Zealand)' },
      geometry:{ type:'LineString', coordinates:[[166.5,-45.8],[168,-44.5],[169.5,-43.5],[170.5,-42.5],[171.5,-41.5],[172.5,-40.5]] }},
    { type:'Feature', properties:{ name:'Himalayan Frontal Thrust' },
      geometry:{ type:'LineString', coordinates:[[72,34],[75,33],[78,32],[81,31],[84,28],[87,27],[90,26],[93,27],[96,28]] }},
    { type:'Feature', properties:{ name:'Japan Trench' },
      geometry:{ type:'LineString', coordinates:[[143,40],[143.5,38],[143.8,36],[144,34],[144.5,32]] }},
    { type:'Feature', properties:{ name:'Philippine Fault' },
      geometry:{ type:'LineString', coordinates:[[122,18],[122.5,16],[123,14],[123.5,12],[124,10],[124.5,8]] }},
    { type:'Feature', properties:{ name:'Sumatra-Andaman Fault' },
      geometry:{ type:'LineString', coordinates:[[95,6],[96,4],[97,2],[98,0],[99,-2],[100,-4],[102,-6]] }},
    { type:'Feature', properties:{ name:'Mid-Atlantic Ridge' },
      geometry:{ type:'LineString', coordinates:[[-18,65],[-24,60],[-28,55],[-30,50],[-28,45],[-25,40],[-20,35],[-15,30],[-12,25],[-10,20],[-8,15],[-5,10],[-2,5],[0,0],[2,-5],[5,-10],[8,-15],[10,-20],[12,-25],[14,-30]] }},
    { type:'Feature', properties:{ name:'East Pacific Rise' },
      geometry:{ type:'LineString', coordinates:[[-110,30],[-112,25],[-110,20],[-108,15],[-105,10],[-102,5],[-100,0],[-98,-5],[-95,-10],[-92,-15],[-90,-20],[-88,-25],[-85,-30],[-82,-35],[-78,-40],[-75,-45]] }},
    { type:'Feature', properties:{ name:'Dead Sea Transform' },
      geometry:{ type:'LineString', coordinates:[[35.5,33.5],[35.4,32],[35.3,31],[35.2,30],[35,29],[34.8,28]] }},
    { type:'Feature', properties:{ name:'Zagros Fold Belt' },
      geometry:{ type:'LineString', coordinates:[[44,37],[46,35],[48,33],[50,31],[52,29],[54,27],[56,25]] }},
    { type:'Feature', properties:{ name:'Tonga Trench' },
      geometry:{ type:'LineString', coordinates:[[-175,-15],[-175.5,-18],[-176,-21],[-176.5,-24],[-177,-27]] }},
    { type:'Feature', properties:{ name:'Peru-Chile Trench' },
      geometry:{ type:'LineString', coordinates:[[-78,-2],[-78.5,-5],[-79,-8],[-79.5,-12],[-80,-16],[-80.5,-20],[-70,-30],[-68,-35],[-68,-40],[-70,-45],[-72,-50]] }},
    { type:'Feature', properties:{ name:'Caribbean Plate Boundary' },
      geometry:{ type:'LineString', coordinates:[[-85,10],[-82,12],[-78,14],[-74,16],[-70,18],[-66,18],[-62,16]] }},
    { type:'Feature', properties:{ name:'Aleutian Trench' },
      geometry:{ type:'LineString', coordinates:[[-165,54],[-170,52],[-175,51],[-180,51],[175,51],[170,52],[165,53],[160,54],[155,55],[150,56]] }},
    { type:'Feature', properties:{ name:'Ryukyu Trench' },
      geometry:{ type:'LineString', coordinates:[[122,24],[124,25],[126,26],[128,27],[130,28],[132,29]] }},
    { type:'Feature', properties:{ name:'Mariana Trench' },
      geometry:{ type:'LineString', coordinates:[[142,12],[143,13],[144,14],[145,15],[146,16],[147,17]] }},
    { type:'Feature', properties:{ name:'Great Rift Valley' },
      geometry:{ type:'LineString', coordinates:[[36,12],[37,10],[37.5,8],[37,6],[36.5,4],[36,2],[36,-2],[36,-6],[35,-10],[34,-14],[34,-18]] }},
    { type:'Feature', properties:{ name:'Denali Fault' },
      geometry:{ type:'LineString', coordinates:[[-148,62],[-150,63],[-152,63.5],[-154,63.5],[-156,63],[-158,62.5],[-160,62]] }},
    { type:'Feature', properties:{ name:'Wasatch Fault' },
      geometry:{ type:'LineString', coordinates:[[-111.8,42],[-111.9,41],[-112,40],[-111.9,39],[-111.8,38]] }},
    { type:'Feature', properties:{ name:'Balochistan Fault' },
      geometry:{ type:'LineString', coordinates:[[60,30],[62,29],[64,28],[66,27],[68,26]] }},
    { type:'Feature', properties:{ name:'Xianshuihe Fault' },
      geometry:{ type:'LineString', coordinates:[[99,32],[100,31],[101,30],[102,29],[103,28]] }},
  ]
};

const FAULT_SOURCE  = 'fault-source';
const FAULT_LAYER   = 'fault-layer';
const FAULT_CLICK_S = 'fault-click-source';
const FAULT_CLICK_L = 'fault-click-layer';

function riskLabel(km) {
  if (km < 50)  return { label: 'High seismic risk zone',  color: '#ff3b30' };
  if (km < 200) return { label: 'Moderate seismic risk',   color: '#ff9500' };
  return              { label: 'Low seismic risk',          color: '#34c759' };
}

export function initFaultLines(map) {
  let popup    = null;
  let clickHandler = null;
  let escHandler   = null;

  // Add fault line source + layer (hidden by default)
  try {
    map.addSource(FAULT_SOURCE, { type: 'geojson', data: FAULT_GEOJSON });
    map.addLayer({
      id: FAULT_LAYER, type: 'line', source: FAULT_SOURCE,
      paint: { 'line-color': '#ff9f0a', 'line-width': 1.5, 'line-opacity': 0.75 },
      layout: { visibility: 'none' }
    }, 'events-layer');

    // Source for the proximity line (click → nearest point)
    map.addSource(FAULT_CLICK_S, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: FAULT_CLICK_L, type: 'line', source: FAULT_CLICK_S,
      paint: { 'line-color': '#ff9f0a', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.8 },
      layout: { visibility: 'none' }
    });
  } catch (e) { console.warn('[faultLines] init failed:', e); }

  const removePopup = () => {
    if (popup) { popup.remove(); popup = null; }
    try {
      const src = map.getSource(FAULT_CLICK_S);
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
      if (map.getLayer(FAULT_CLICK_L)) map.setLayoutProperty(FAULT_CLICK_L, 'visibility', 'none');
    } catch (_) {}
  };

  clickHandler = (e) => {
    // Only fire when fault layer is visible
    try { if (map.getLayoutProperty(FAULT_LAYER, 'visibility') !== 'visible') return; } catch (_) { return; }

    const turf = window.turf;
    if (!turf) { console.warn('[faultLines] Turf.js not loaded'); return; }

    // Don't fire on event marker clicks
    const features = map.queryRenderedFeatures(e.point, { layers: ['events-layer'] });
    if (features.length > 0) return;

    removePopup();

    const clickPt = turf.point([e.lngLat.lng, e.lngLat.lat]);
    let minDist = Infinity;
    let nearestFault = null;
    let nearestPt = null;

    FAULT_GEOJSON.features.forEach(f => {
      try {
        const snapped = turf.nearestPointOnLine(f, clickPt, { units: 'kilometers' });
        const dist = snapped.properties.dist;
        if (dist < minDist) {
          minDist = dist;
          nearestFault = f.properties.name;
          nearestPt = snapped;
        }
      } catch (_) {}
    });

    if (!nearestFault) return;

    const { label, color } = riskLabel(minDist);

    // Draw proximity line
    try {
      const src = map.getSource(FAULT_CLICK_S);
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [
              [e.lngLat.lng, e.lngLat.lat],
              nearestPt.geometry.coordinates
            ]},
            properties: {}
          }]
        });
        map.setLayoutProperty(FAULT_CLICK_L, 'visibility', 'visible');
      }
    } catch (_) {}

    // Show popup
    popup = document.createElement('div');
    popup.className = 'fault-popup';
    popup.innerHTML = `
      <button class="fault-popup-close">✕</button>
      <div class="fault-popup-name">${nearestFault}</div>
      <div class="fault-popup-dist">${Math.round(minDist)} km away</div>
      <div class="fault-popup-risk" style="color:${color}">${label}</div>
    `;
    popup.style.cssText = `position:fixed;z-index:9999;pointer-events:auto;`;

    // Position near click
    const rect = map.getCanvas().getBoundingClientRect();
    const px = rect.left + e.point.x;
    const py = rect.top  + e.point.y;
    popup.style.left = (px + 14) + 'px';
    popup.style.top  = (py - 10) + 'px';

    popup.querySelector('.fault-popup-close').addEventListener('click', removePopup);
    document.body.appendChild(popup);

    escHandler = (ev) => { if (ev.key === 'Escape') removePopup(); };
    document.addEventListener('keydown', escHandler);
  };

  map.on('click', clickHandler);

  return {
    layers: [FAULT_LAYER, FAULT_CLICK_L],
    onVisibilityChange: (visible) => {
      if (!visible) removePopup();
    },
    destroy: () => {
      map.off('click', clickHandler);
      if (escHandler) document.removeEventListener('keydown', escHandler);
      removePopup();
      try { if (map.getLayer(FAULT_CLICK_L)) map.removeLayer(FAULT_CLICK_L); } catch (_) {}
      try { if (map.getLayer(FAULT_LAYER))   map.removeLayer(FAULT_LAYER);   } catch (_) {}
      try { if (map.getSource(FAULT_CLICK_S)) map.removeSource(FAULT_CLICK_S); } catch (_) {}
      try { if (map.getSource(FAULT_SOURCE))  map.removeSource(FAULT_SOURCE);  } catch (_) {}
    }
  };
}
