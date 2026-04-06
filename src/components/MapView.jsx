import React, { useRef, useCallback, useImperativeHandle, forwardRef, useMemo, useEffect } from 'react';
import Map, { Source, Layer, NavigationControl, Marker, FullscreenControl, ScaleControl } from 'react-map-gl/maplibre';
import { MapPin } from 'lucide-react';
import { initOverlayLayers } from '../layers/overlayLayers';

// ─── Easing ──────────────────────────────────────────────────────────────────
// Exponential-out: fast start, silky deceleration (Apple Maps feel)
function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// ─── Momentum / inertia helper ───────────────────────────────────────────────
// Tracks recent velocity samples and produces a decaying glide after pointer-up
class MomentumTracker {
  constructor() { this.samples = []; }
  push(dx, dy) {
    const now = performance.now();
    this.samples.push({ dx, dy, t: now });
    // keep only last 80 ms of samples
    this.samples = this.samples.filter(s => now - s.t < 80);
  }
  velocity() {
    if (this.samples.length < 2) return { vx: 0, vy: 0 };
    const first = this.samples[0];
    const last  = this.samples[this.samples.length - 1];
    const dt    = (last.t - first.t) || 1;
    const vx    = this.samples.reduce((s, p) => s + p.dx, 0) / dt;
    const vy    = this.samples.reduce((s, p) => s + p.dy, 0) / dt;
    return { vx, vy };
  }
  clear() { this.samples = []; }
}

const MapView = forwardRef(function MapView(
  { mapStyle, geojsonData, searchPin, theme, is3D, onEventClick, onBareClick, onDoubleTap, measureA, measureB, routeGeometry, onMapLoaded, starfieldRef },
  ref
) {
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);

  // ── Fix 1: Non-passive touchmove on the container + canvas ─────────────
  // Targeted preventDefault only on map area — sidebar scroll unaffected.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.touches.length > 1) return; // let MapLibre handle pinch
      e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    // Also block document-level touchmove that targets the map
    const docHandler = (e) => {
      if (e.target.closest('.map-container') || e.target.closest('#map')) {
        if (e.touches.length === 1) e.preventDefault();
      }
    };
    document.addEventListener('touchmove', docHandler, { passive: false });
    return () => {
      el.removeEventListener('touchmove', handler);
      document.removeEventListener('touchmove', docHandler);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo:       (opts) => mapRef.current?.flyTo(opts),
    easeTo:      (opts) => mapRef.current?.easeTo(opts),
    getZoom:     ()     => mapRef.current?.getZoom(),
    fitBounds:   (bounds, opts) => mapRef.current?.fitBounds(bounds, opts),
    toggleLayer: (name, visible) => overlayRef.current?.toggle(name, visible),
    getRawMap:   () => mapRef.current?.getMap?.() ?? null,
    // Bug 1: drop a red teardrop search pin, removing any previous one first
    dropSearchPin(lng, lat) {
      const rawMap = mapRef.current?.getMap?.();
      if (!rawMap) return;
      // Remove existing pin
      if (this._searchMarker) { this._searchMarker.remove(); this._searchMarker = null; }
      // Create teardrop element
      const el = document.createElement('div');
      el.style.cssText = [
        'width:22px', 'height:22px', 'border-radius:50% 50% 50% 0',
        'transform:rotate(-45deg)', 'background:#ef4444',
        'border:3px solid #ffffff',
        'box-shadow:0 2px 8px rgba(0,0,0,0.6)',
        'cursor:pointer',
      ].join(';');
      const maplibre = window.maplibregl;
      if (!maplibre) return;
      const marker = new maplibre.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(rawMap);
      this._searchMarker = marker;
    },
    clearSearchPin() {
      if (this._searchMarker) { this._searchMarker.remove(); this._searchMarker = null; }
    },
    _searchMarker: null,
  }));

  const onStyleData = useCallback((e) => {
    const map = e.target;
    try { if (map.setProjection && map.getStyle()) map.setProjection({ type: 'globe' }); } catch (_) {}
  }, []);

  const handleLoad = useCallback((e) => {
    const map   = e.target;
    const canvas = map.getCanvas();

    // ── 1. Disable MapLibre's built-in scroll/drag so we own all gestures ──
    // FIX 8: touchZoomRotate stays on for pinch-zoom, but rotation is disabled.
    map.scrollZoom.disable();
    map.dragPan.disable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.disableRotation(); // FIX 8: pinch zooms only, no rotate
    map.touchPitch.disable();              // FIX 8: no pitch on touch

    // FIX 2: force canvas to fill container after load
    map.resize();

    // ── 2. Momentum tracker for pan inertia ──────────────────────────────
    const momentum = new MomentumTracker();
    let glideRaf   = null;
    // Track active pointer IDs so we know when multi-touch is happening
    const activePointers = new Set();

    const stopGlide = () => {
      if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = null; }
    };

    const startGlide = () => {
      stopGlide();
      const { vx, vy } = momentum.velocity();
      if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) return;

      let rx = vx * 16;
      let ry = vy * 16;
      const FRICTION = 0.88;

      const step = () => {
        rx *= FRICTION;
        ry *= FRICTION;
        if (Math.abs(rx) < 0.3 && Math.abs(ry) < 0.3) return;
        const lat = map.getCenter().lat;
        if (Math.abs(lat) >= 78 && Math.sign(ry) === Math.sign(lat)) ry = 0;
        if (Math.abs(rx) < 0.3 && Math.abs(ry) < 0.3) return;
        map.panBy([rx, ry], { duration: 0, animate: false });
        glideRaf = requestAnimationFrame(step);
      };
      glideRaf = requestAnimationFrame(step);
    };

    // ── 3. Pointer-based drag (replaces dragPan) ──────────────────────────
    // CRITICAL: skip custom handling entirely when multi-touch is active.
    // This lets MapLibre's native touchZoomRotate handler own pinch gestures.
    let isDragging = false;
    let lastX = 0, lastY = 0;

    const onPointerDown = (evt) => {
      activePointers.add(evt.pointerId);

      // Multi-touch: release any capture and hand off to MapLibre
      if (activePointers.size > 1) {
        if (isDragging) {
          isDragging = false;
          stopGlide();
          momentum.clear();
          try { canvas.releasePointerCapture(evt.pointerId); } catch (_) {}
        }
        return;
      }

      if (evt.button !== 0 && evt.pointerType !== 'touch') return;
      stopGlide();
      momentum.clear();
      isDragging = true;
      lastX = evt.clientX;
      lastY = evt.clientY;
      canvas.setPointerCapture(evt.pointerId);
    };

    const onPointerMove = (evt) => {
      // If more than one pointer is active, stop our pan and let MapLibre handle it
      if (activePointers.size > 1) {
        isDragging = false;
        return;
      }
      if (!isDragging) return;
      const dx = evt.clientX - lastX;
      const dy = evt.clientY - lastY;
      lastX = evt.clientX;
      lastY = evt.clientY;
      momentum.push(dx, dy);
      map.panBy([-dx, -dy], { duration: 0, animate: false });
    };

    const onPointerUp = (evt) => {
      activePointers.delete(evt.pointerId);
      if (!isDragging) return;
      isDragging = false;
      // Only start glide if no other fingers are still down
      if (activePointers.size === 0) startGlide();
    };

    canvas.addEventListener('pointerdown',   onPointerDown);
    canvas.addEventListener('pointermove',   onPointerMove);
    canvas.addEventListener('pointerup',     onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    // ── Double-tap / double-click → geo info panel ────────────────────────
    let lastTapTime = 0;
    let lastTapX = 0, lastTapY = 0;
    canvas.addEventListener('pointerup', (evt) => {
      const now = performance.now();
      const dx = Math.abs(evt.clientX - lastTapX);
      const dy = Math.abs(evt.clientY - lastTapY);
      if (now - lastTapTime < 350 && dx < 20 && dy < 20) {
        // Double tap detected
        const rect = canvas.getBoundingClientRect();
        const lngLat = map.unproject([evt.clientX - rect.left, evt.clientY - rect.top]);
        onDoubleTap?.(lngLat.lat, lngLat.lng);
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        lastTapX = evt.clientX;
        lastTapY = evt.clientY;
      }
    });

    // ── 4. Wheel handler: pinch = zoom, two-finger scroll = pan ──────────
    //    Uses exponential zoom curve for Apple-quality pinch feel.
    let zoomVelocity = 0;
    let zoomRaf      = null;

    const stopZoomGlide = () => {
      if (zoomRaf) { cancelAnimationFrame(zoomRaf); zoomRaf = null; }
    };

    const onWheel = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();

      if (evt.ctrlKey || evt.metaKey) {
        // ── Pinch-to-zoom ──
        stopGlide();
        stopZoomGlide();

        // deltaY from pinch is typically -3..+3 per frame; scale it smoothly
        const delta     = -evt.deltaY;
        const zoomDelta = delta * 0.025;          // sensitivity increased
        const current   = map.getZoom();
        const target    = Math.min(22, Math.max(1, current + zoomDelta));

        // Zoom toward cursor position
        const rect   = canvas.getBoundingClientRect();
        const around = map.unproject([evt.clientX - rect.left, evt.clientY - rect.top]);

        map.easeTo({
          zoom:   target,
          around: [around.lng, around.lat],
          duration: 120,
          easing: easeOutExpo,
        });

        // Accumulate velocity for post-pinch coast
        zoomVelocity += zoomDelta * 0.4;

        const coastZoom = () => {
          zoomVelocity *= 0.78;
          if (Math.abs(zoomVelocity) < 0.002) { zoomVelocity = 0; return; }
          map.easeTo({
            zoom: Math.min(22, Math.max(1, map.getZoom() + zoomVelocity)),
            duration: 80,
            easing: easeOutExpo,
          });
          zoomRaf = requestAnimationFrame(coastZoom);
        };
        stopZoomGlide();
        zoomRaf = requestAnimationFrame(coastZoom);

      } else {
        // ── Two-finger scroll → pan ──
        stopGlide();
        const dx = evt.deltaX;
        const dy = evt.deltaY;
        momentum.push(dx, dy);
        map.panBy([dx, dy], { duration: 0, animate: false });
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ── 5. Globe lat constraints ─────────────────────────────────────────
    const GLOBE_ZOOM_THRESHOLD = 3.5;
    const MAX_LAT_GLOBE        = 78;

    // Patch panBy to clamp latitude in globe mode
    const originalPanBy = map.panBy.bind(map);
    map.panBy = (offset, options) => {
      const zoom = map.getZoom();
      if (zoom < GLOBE_ZOOM_THRESHOLD) {
        // Project current center to screen, apply offset, unproject back
        const center     = map.getCenter();
        const screenPt   = map.project([center.lng, center.lat]);
        const newPt      = [screenPt.x + offset[0], screenPt.y + offset[1]];
        const newLngLat  = map.unproject(newPt);
        const clampedLat = Math.max(-MAX_LAT_GLOBE, Math.min(MAX_LAT_GLOBE, newLngLat.lat));

        // If we'd exceed the clamp, zero out the vertical component
        if (Math.abs(newLngLat.lat) > MAX_LAT_GLOBE) {
          const clampedPt  = map.project([newLngLat.lng, clampedLat]);
          const clampedDy  = clampedPt.y - screenPt.y;
          return originalPanBy([offset[0], clampedDy], options);
        }
      }
      return originalPanBy(offset, options);
    };

    // Clamp pitch — maxPitch:0 handles this at the MapLibre level

    // ── 6. Dynamic starfield — driven via ref, zero React re-renders ────────
    map.on('move', () => {
      // Legacy canvas starfield (main.jsx)
      window.__setStarfieldBearing?.(map.getBearing());

      // New ref-based oversized starfield div
      if (starfieldRef?.current) {
        const bearing = map.getBearing();
        const pitch   = map.getPitch();
        // Hardware-accelerated transform — no layout thrash
        starfieldRef.current.style.transform =
          `rotate(${bearing * 0.09}deg) translateY(${pitch * 0.6}px)`;
      }
    });

    // ── 7. Overlay layers ────────────────────────────────────────────────────
    overlayRef.current = initOverlayLayers(map);

    // ── 8. Signal map ready on first idle ────────────────────────────────────
    map.once('idle', () => { onMapLoaded?.(); });

  }, []);

  // Left-click: only handles marker clicks and cluster zoom-in.
  // Location Info panel is intentionally NOT triggered here.
  const handleClick = useCallback((e) => {
    if (!e.features?.length) return; // bare click — do nothing
    const f = e.features[0];
    if (f.properties?.cluster_id) {
      const map = mapRef.current;
      if (!map) return;
      const src = map._mapRef?.current?.getSource?.('events') || null;
      if (src?.getClusterExpansionZoom) {
        src.getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
          if (err) return;
          map.flyTo({ center: f.geometry.coordinates, zoom: zoom + 0.5, duration: 800 });
        });
      } else {
        map.flyTo({ center: f.geometry.coordinates, zoom: (map.getZoom() || 2) + 2, duration: 800 });
      }
      return;
    }
    if (f.properties?.id) onEventClick(f.properties.id);
  }, [onEventClick]);

  // Right-click / two-finger trackpad tap → Location Info panel.
  // e.preventDefault() stops the browser's native context menu from appearing.
  const handleContextMenu = useCallback((e) => {
    e.preventDefault?.();
    onBareClick?.(e.lngLat.lat, e.lngLat.lng);
  }, [onBareClick]);

  // Distance line geojson
  const distanceGeojson = useMemo(() => {
    if (!measureA || !measureB) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[measureA.longitude, measureA.latitude], [measureB.longitude, measureB.latitude]] },
        properties: {}
      }]
    };
  }, [measureA, measureB]);

  // Midpoint for label
  const midpoint = useMemo(() => {
    if (!measureA || !measureB) return null;
    return [(measureA.longitude + measureB.longitude) / 2, (measureA.latitude + measureB.latitude) / 2];
  }, [measureA, measureB]);

  return (
    <div className="map-container" ref={containerRef}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 20, latitude: 15, zoom: 2.8, pitch: 0, bearing: 0 }}
        minZoom={1} maxZoom={22}
        maxPitch={0}
        minPitch={0}
        mapStyle={mapStyle}
        interactiveLayerIds={['events-layer', 'clusters']}
        dragPan={false}
        scrollZoom={false}
        dragRotate={true}
        keyboard={true}
        doubleClickZoom={true}
        touchZoomRotate={true}
        touchPitch={false}
        pitchWithRotate={false}
        // Fix 2: retain parent LOD tiles until children are fully painted
        fadeDuration={0}
        maxTileCacheSize={500}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onStyleData={onStyleData}
        onLoad={handleLoad}
        getCursor={(s) => s.isHovering ? 'pointer' : (s.isDragging ? 'grabbing' : 'grab')}
      >
        <FullscreenControl position="bottom-right" />
        <NavigationControl position="bottom-right" visualizePitch showCompass showZoom />
        <ScaleControl maxWidth={100} unit="metric" position="bottom-right"
          style={{ background: 'transparent', color: 'var(--text)', border: 'none', boxShadow: 'none' }} />

        {searchPin && (
          <Marker longitude={searchPin.longitude} latitude={searchPin.latitude} anchor="bottom">
            <MapPin size={38} color="#FF3B30" fill="#FF3B30" stroke="#FFF" strokeWidth={1.5}
              style={{ filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.4))', transform: 'translateY(-10px)' }} />
          </Marker>
        )}

        {geojsonData && (
          <Source id="events" type="geojson" data={geojsonData}
            cluster={true} clusterMaxZoom={4} clusterRadius={60}>
            {/* Cluster circles — dark glass style */}
            <Layer id="clusters" type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color': 'rgba(255,255,255,0.08)',
                'circle-stroke-color': 'rgba(255,255,255,0.35)',
                'circle-stroke-width': 1.5,
                'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 20, 32],
                'circle-opacity': 1,
              }} />
            {/* Cluster count labels */}
            <Layer id="cluster-count" type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size': 12,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{ 'text-color': 'rgba(255,255,255,0.9)' }} />
            {/* Individual markers */}
            <Layer id="events-layer" type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 4, 5, 12, 10],
                'circle-color': ['get', 'color'],
                'circle-stroke-width': 1,
                'circle-stroke-color': theme === 'dark' ? '#111' : '#FFF',
              }} />
            <Layer id="events-pulse" type="circle"
              filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'open']]}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 4, 15, 12, 35],
                'circle-color': ['get', 'color'],
                'circle-opacity': 0.15,
                'circle-stroke-width': 0,
              }} />
          </Source>
        )}

        {/* Distance measurement line — straight */}
        {distanceGeojson && (
          <Source id="distance-line" type="geojson" data={distanceGeojson}>
            <Layer id="distance-line-casing" type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#fff', 'line-width': 5, 'line-opacity': 0.5 }} />
            <Layer id="distance-line-fill" type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#007aff', 'line-width': 2.5, 'line-dasharray': [4, 3] }} />
          </Source>
        )}

        {/* FIX 6: OSRM road route — amber dashed line */}
        {routeGeometry && (
          <Source id="route-line" type="geojson" data={{ type: 'Feature', geometry: routeGeometry, properties: {} }}>
            <Layer id="route-line-layer" type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [4, 2], 'line-opacity': 0.9 }} />
          </Source>
        )}
        {measureA && (
          <Marker longitude={measureA.longitude} latitude={measureA.latitude} anchor="center">
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#007aff', border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,122,255,0.5)' }} />
          </Marker>
        )}
        {measureB && (
          <Marker longitude={measureB.longitude} latitude={measureB.latitude} anchor="center">
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#ff3b30', border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(255,59,48,0.5)' }} />
          </Marker>
        )}
      </Map>
    </div>
  );
});

export default MapView;
