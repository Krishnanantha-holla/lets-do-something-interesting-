import React, { useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
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
  { mapStyle, geojsonData, searchPin, theme, is3D, onEventClick, onBareClick, onDoubleTap, measureA, measureB },
  ref
) {
  const mapRef = useRef(null);
  const overlayRef = useRef(null);

  useImperativeHandle(ref, () => ({
    flyTo:                (opts) => mapRef.current?.flyTo(opts),
    easeTo:               (opts) => mapRef.current?.easeTo(opts),
    getZoom:              ()     => mapRef.current?.getZoom(),
    fitBounds:            (bounds, opts) => mapRef.current?.fitBounds(bounds, opts),
    toggleLayer:          (name, visible) => overlayRef.current?.toggle(name, visible),
    getPopulationEstimate:(lng, lat) => overlayRef.current?.getPopulationEstimate(lng, lat),
    getFirmsCount:        () => overlayRef.current?.getFirmsCount(),
    setFirmsCountCallback:(fn) => overlayRef.current?.setFirmsCountCallback(fn),
    reinitFirms:          (key, evs) => overlayRef.current?.reinitFirms(key, evs),
    getRawMap:            () => mapRef.current?.getMap?.() ?? null,
  }));

  const onStyleData = useCallback((e) => {
    const map = e.target;
    try { if (map.setProjection && map.getStyle()) map.setProjection({ type: 'globe' }); } catch (_) {}
  }, []);

  const handleLoad = useCallback((e) => {
    const map   = e.target;
    const canvas = map.getCanvas();

    // ── 1. Disable MapLibre's built-in scroll/drag so we own all gestures ──
    map.scrollZoom.disable();
    map.dragPan.disable();

    // ── 2. Momentum tracker for pan inertia ──────────────────────────────
    const momentum = new MomentumTracker();
    let glideRaf   = null;

    const stopGlide = () => {
      if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = null; }
    };

    const startGlide = () => {
      stopGlide();
      const { vx, vy } = momentum.velocity();
      if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) return;

      // Scale velocity to pixel-per-frame (60 fps baseline)
      let rx = vx * 16;
      let ry = vy * 16;
      const FRICTION = 0.88; // lower = stops faster, higher = longer glide

      const step = () => {
        rx *= FRICTION;
        ry *= FRICTION;
        if (Math.abs(rx) < 0.3 && Math.abs(ry) < 0.3) return;
        const lat = map.getCenter().lat;
        // Kill vertical glide if we're at the pole boundary
        if (Math.abs(lat) >= 78 && Math.sign(ry) === Math.sign(lat)) ry = 0;
        if (Math.abs(rx) < 0.3 && Math.abs(ry) < 0.3) return;
        map.panBy([rx, ry], { duration: 0, animate: false });
        glideRaf = requestAnimationFrame(step);
      };
      glideRaf = requestAnimationFrame(step);
    };

    // ── 3. Pointer-based drag (replaces dragPan) ──────────────────────────
    let isDragging  = false;
    let lastX = 0, lastY = 0;

    const onPointerDown = (evt) => {
      if (evt.button !== 0 && evt.pointerType !== 'touch') return;
      stopGlide();
      momentum.clear();
      isDragging = true;
      lastX = evt.clientX;
      lastY = evt.clientY;
      canvas.setPointerCapture(evt.pointerId);
    };

    const onPointerMove = (evt) => {
      if (!isDragging) return;
      const dx = evt.clientX - lastX;
      const dy = evt.clientY - lastY;
      lastX = evt.clientX;
      lastY = evt.clientY;
      momentum.push(dx, dy);
      map.panBy([-dx, -dy], { duration: 0, animate: false });
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      startGlide();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup',   onPointerUp);
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

    // ── 5. Globe constraints — no feedback loops ─────────────────────────
    // We clamp lat/pitch by intercepting the pan/zoom at the source,
    // NOT inside move/pitch events (which cause re-entrant lock-ups).
    // Instead we wrap panBy so every pan delta is clamped before it's applied.

    const GLOBE_ZOOM_THRESHOLD = 3.5;
    const MAX_LAT_GLOBE        = 78;   // degrees — poles visible, never flipped
    const MAX_PITCH_GLOBE      = 40;
    const MAX_PITCH_NORMAL     = 85;

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

    // Clamp pitch at source too — before it's applied
    map.on('pitchstart', () => {
      const zoom     = map.getZoom();
      const maxPitch = zoom < GLOBE_ZOOM_THRESHOLD ? MAX_PITCH_GLOBE : MAX_PITCH_NORMAL;
      if (map.getPitch() > maxPitch) {
        map.easeTo({ pitch: maxPitch, duration: 100 });
      }
    });

    // ── 6. Parallax starfield ─────────────────────────────────────────────
    const starfield = document.getElementById('starfield');
    let prevLng      = map.getCenter().lng;
    let accLng       = prevLng;
    let starTicking  = false;

    map.on('move', () => {
      if (!starfield || starTicking) return;
      starTicking = true;
      requestAnimationFrame(() => {
        const center  = map.getCenter();
        const bearing = map.getBearing();
        let delta = center.lng - prevLng;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        accLng  += delta;
        prevLng  = center.lng;
        const x  = accLng * 8.5;
        const y  = center.lat * -8.5;
        starfield.style.transform = `rotate(${bearing}deg)`;
        starfield.style.backgroundPosition = [0.2, 0.4, 0.7, 0.3, 0.8, 0.15, 1.0, 0.5, 0.6, 0.35]
          .map(f => `${x * f}px ${y * f}px`)
          .join(', ');
        starTicking = false;
      });
    });

    // ── 7. Overlay layers (day/night, ISS, tectonic, aurora, currents) ────
    overlayRef.current = initOverlayLayers(map);

  }, []);

  const handleClick = useCallback((e) => {
    if (!e.features?.length) {
      // Bare map click — no marker hit
      onBareClick?.(e.lngLat.lat, e.lngLat.lng);
      return;
    }
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
  }, [onEventClick, onBareClick]);

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
    <div className="map-container">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1.5, pitch: is3D ? 55 : 0, bearing: 0 }}
        minZoom={1} maxZoom={22}
        maxPitch={85}
        mapStyle={mapStyle}
        interactiveLayerIds={['events-layer', 'clusters']}
        // We handle all gestures manually — disable MapLibre defaults
        dragPan={false}
        scrollZoom={false}
        dragRotate={true}
        keyboard={true}
        doubleClickZoom={true}
        touchZoomRotate={true}
        touchPitch={true}
        pitchWithRotate={false}
        onClick={handleClick}
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
            {/* Cluster circles */}
            <Layer id="clusters" type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-color': '#ffffff',
                'circle-stroke-color': 'rgba(0,0,0,0.15)',
                'circle-stroke-width': 1,
                'circle-radius': [
                  'step', ['get', 'point_count'],
                  16, 5, 22, 20, 28
                ],
                'circle-opacity': 0.92,
              }} />
            {/* Cluster count labels */}
            <Layer id="cluster-count" type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size': 12,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{ 'text-color': '#1c1c1e' }} />
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

        {/* Distance measurement line */}
        {distanceGeojson && (
          <Source id="distance-line" type="geojson" data={distanceGeojson}>
            <Layer id="distance-line-casing" type="line" paint={{ 'line-color': '#fff', 'line-width': 5, 'line-opacity': 0.6 }} />
            <Layer id="distance-line-fill" type="line" paint={{ 'line-color': '#007aff', 'line-width': 2.5, 'line-dasharray': [4, 3] }} />
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
