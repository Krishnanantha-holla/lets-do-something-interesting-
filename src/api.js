export const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&limit=500";

export const CATEGORY_COLORS = {
  wildfires: "#FF4500",
  volcanoes: "#FF6B35",
  severeStorms: "#00BFFF",
  earthquakes: "#FFD700",
  floods: "#1E90FF",
  drought: "#DAA520",
  dustHaze: "#C8A96E",
  landslides: "#8B4513",
  snow: "#E0FFFF",
  seaLakeIce: "#87CEEB",
  tempExtremes: "#FF1493"
};

export const CATEGORY_LABELS = {
  wildfires: "Wildfires",
  volcanoes: "Volcanoes",
  severeStorms: "Severe Storms",
  earthquakes: "Earthquakes",
  floods: "Floods",
  drought: "Drought",
  dustHaze: "Dust & Haze",
  landslides: "Landslides",
  snow: "Snow",
  seaLakeIce: "Sea / Lake Ice",
  tempExtremes: "Temperature Extremes"
};

export async function fetchEvents() {
  const response = await fetch(EONET_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("EONET request failed: " + response.status);
  }
  const payload = await response.json();
  const rawEvents = Array.isArray(payload.events) ? payload.events : [];
  
  return rawEvents
    .map(normalizeEvent)
    .filter((event) => event && Number.isFinite(event.lng) && Number.isFinite(event.lat));
}

function normalizeEvent(event) {
  if (!event || !Array.isArray(event.geometry) || event.geometry.length === 0) {
    return null;
  }

  const geometries = event.geometry
    .map((g) => {
      const coord = extractCoordinate(g);
      const parsedDate = new Date(g.date);
      if (!coord || Number.isNaN(parsedDate.getTime())) return null;
      return {
        date: parsedDate,
        type: g.type || "Unknown",
        coordinates: coord
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  if (!geometries.length) return null;

  const category = Array.isArray(event.categories) && event.categories[0] ? event.categories[0] : {};
  const categoryId = category.id || "unknown";
  const closedDate = event.closed ? new Date(event.closed) : null;
  const status = closedDate ? "closed" : "open";

  return {
    id: event.id || crypto.randomUUID(),
    title: event.title || "Untitled event",
    categoryId,
    categoryTitle: category.title || CATEGORY_LABELS[categoryId] || "Other",
    color: CATEGORY_COLORS[categoryId] || "#AAAAAA",
    status,
    closedDate,
    sources: Array.isArray(event.sources) ? event.sources : [],
    geometries,
    startTime: geometries[0].date.getTime(),
    endTime: geometries[geometries.length - 1].date.getTime(),
    lng: geometries[geometries.length - 1].coordinates[0],
    lat: geometries[geometries.length - 1].coordinates[1]
  };
}

function extractCoordinate(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  const { type, coordinates } = geometry;

  if (type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2) {
    return [Number(coordinates[0]), Number(coordinates[1])];
  }
  if (type === "LineString" && Array.isArray(coordinates[0])) {
    return [Number(coordinates[0][0]), Number(coordinates[0][1])];
  }
  if (type === "Polygon" && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
    return [Number(coordinates[0][0][0]), Number(coordinates[0][0][1])];
  }
  if (type === "MultiPoint" && Array.isArray(coordinates[0])) {
    return [Number(coordinates[0][0]), Number(coordinates[0][1])];
  }
  if (type === "MultiLineString" && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
    return [Number(coordinates[0][0][0]), Number(coordinates[0][0][1])];
  }
  if (type === "MultiPolygon" && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0]) && Array.isArray(coordinates[0][0][0])) {
    return [Number(coordinates[0][0][0][0]), Number(coordinates[0][0][0][1])];
  }
  return null;
}
