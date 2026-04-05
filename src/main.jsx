import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Fix 1: Animated canvas starfield ─────────────────────────────────────────
function createStarfield() {
  const existing = document.getElementById('starfield');
  if (existing) existing.remove(); // remove the CSS div version

  const canvas = document.createElement('canvas');
  canvas.id = 'starfield-canvas';
  canvas.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    z-index: 0; pointer-events: none;
    background: #030408;
  `;
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  const stars = Array.from({ length: 360 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.2,
    alpha: Math.random() * 0.6 + 0.3,
    twinkleSpeed: Math.random() * 0.008 + 0.002,
    twinkleOffset: Math.random() * Math.PI * 2,
  }));

  let frame = 0;
  let bearing = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      const alpha = s.alpha + Math.sin(frame * s.twinkleSpeed + s.twinkleOffset) * 0.15;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, alpha))})`;
      ctx.fill();
    });
    frame++;
    requestAnimationFrame(draw);
  }
  draw();

  // Expose bearing setter so MapView can sync rotation
  window.__setStarfieldBearing = (b) => {
    bearing = b;
    canvas.style.transform = `rotate(${b * 0.08}deg)`;
    canvas.style.transformOrigin = 'center center';
  };
}

createStarfield();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW fail: ', err));
  });
}
