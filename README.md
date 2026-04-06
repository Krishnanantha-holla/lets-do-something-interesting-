# Let’s Do Something Interesting

Interactive world atlas for exploring natural events on an interactive map, powered by NASA’s EONET (Earth Observatory Natural Event Tracker).

**Live:** https://lets-do-something-interesting.vercel.app

## Overview
This project is a React + Vite web app that:
- Fetches natural event data from NASA EONET v3 (wildfires, volcanoes, storms, earthquakes, floods, etc.)
- Plots events on an interactive MapLibre map
- Lets you filter and explore events via a sidebar
- Provides multiple basemap styles (light/dark/hybrid/satellite) and an optional 3D view
- Persists UI preferences (theme, map style, 3D) across visits

If the NASA API is unavailable or throttled, the app falls back to mock data so the UI remains testable.

## Data source
NASA EONET v3 events API (last 365 days, up to 500 results):

- https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&limit=500

## Tech stack
- React 18
- Vite
- MapLibre GL + react-map-gl
- lucide-react (icons)
- ESLint

## Project structure (high level)
- `src/App.jsx` — main application state + orchestration (events, filters, UI panels)
- `src/api.js` — EONET fetch + normalization + mock fallback
- `src/components/` — UI components (map view, sidebar, menus, panels, loaders)
- `src/hooks/` — custom hooks (location-based data fetching)
- `src/layers/` — map layers and correlation/compound event logic
- `public/` — static assets (and optional `sw.js` if service worker is used)
- `Dockerfile` + `nginx.conf` — production container build and static hosting via nginx

## Getting started (local development)

### Prerequisites
- Node.js 20+ recommended

### Install
```bash
npm install
```

### Run dev server
```bash
npm run dev
```
Then open the printed local URL (typically `http://localhost:5173`).

### Lint
```bash
npm run lint
```

### Build
```bash
npm run build
```

### Preview production build locally
```bash
npm run preview
```

## Docker (production-like)
This repo includes a multi-stage Docker build that:
1) Builds the Vite app with Node
2) Serves the generated static files from nginx

Build:
```bash
docker build -t lets-do-something-interesting .
```

Run:
```bash
docker run --rm -p 8080:80 lets-do-something-interesting
```

Open:
- http://localhost:8080

## Notes / Troubleshooting
- If the NASA/EONET request fails, the app will automatically switch to mock data.
- `src/main.jsx` registers a service worker at `/sw.js`. If you don’t intend to use a service worker, remove the registration; if you do, ensure `public/sw.js` exists.

## License
No license specified yet. If you want this to be open source, consider adding a LICENSE file (MIT is common for small web apps).