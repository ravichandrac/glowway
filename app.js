const TOMTOM_BASE = "https://api.tomtom.com";
const DEFAULT_MAP_CENTER = [52.247, -2.158];

const state = {
  map: null,
  routeLayers: [],
  markers: [],
  settings: loadSettings(),
  resolvedPlaces: null,
};

const elements = {
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  settingsButton: document.querySelector("#settings-button"),
  closeSettings: document.querySelector("#close-settings"),
  loadingCard: document.querySelector("#loading-card"),
  loadingMessage: document.querySelector("#loading-message"),
  tripCard: document.querySelector("#trip-card"),
  refreshButton: document.querySelector("#refresh-button"),
  journeyLabel: document.querySelector("#journey-label"),
  routeName: document.querySelector("#route-name"),
  journeyTime: document.querySelector("#journey-time"),
  arrivalTime: document.querySelector("#arrival-time"),
  trafficStatus: document.querySelector("#traffic-status"),
  trafficDelay: document.querySelector("#traffic-delay"),
  updatedAt: document.querySelector("#updated-at"),
};

initialise();

function initialise() {
  state.map = L.map("map", { zoomControl: false, attributionControl: true }).setView(DEFAULT_MAP_CENTER, 10);
  L.control.zoom({ position: "topright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(state.map);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => undefined);
  populateSettingsForm();
  bindEvents();

  if (!isConfigured()) {
    elements.loadingMessage.textContent = "Add your free TomTom key and your exact postcodes to begin.";
    elements.settingsDialog.showModal();
    return;
  }

  refreshJourney();
}

function bindEvents() {
  elements.settingsButton.addEventListener("click", () => {
    populateSettingsForm();
    elements.settingsDialog.showModal();
  });
  elements.closeSettings.addEventListener("click", () => elements.settingsDialog.close());
  elements.refreshButton.addEventListener("click", refreshJourney);
  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(elements.settingsForm);
    state.settings = {
      apiKey: formData.get("apiKey").trim(),
      homeLocation: formData.get("homeLocation").trim(),
      destinationOne: formData.get("destinationOne").trim(),
      destinationTwo: formData.get("destinationTwo").trim(),
      defaultDestination: formData.get("defaultDestination"),
    };
    localStorage.setItem("glowway-settings", JSON.stringify(state.settings));
    state.resolvedPlaces = null;
    elements.settingsDialog.close();
    refreshJourney();
  });
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("glowway-settings")) || {};
  } catch {
    return {};
  }
}

function isConfigured() {
  return ["apiKey", "homeLocation", "destinationOne", "destinationTwo"].every((key) => Boolean(state.settings[key]));
}

function populateSettingsForm() {
  document.querySelector("#api-key").value = state.settings.apiKey || "";
  document.querySelector("#home-location").value = state.settings.homeLocation || "";
  document.querySelector("#destination-one").value = state.settings.destinationOne || "";
  document.querySelector("#destination-two").value = state.settings.destinationTwo || "";
  document.querySelector("#default-destination").value = state.settings.defaultDestination || "one";
}

async function refreshJourney() {
  if (!isConfigured()) return;
  setLoading(true, "Finding your location and checking the roads…");
  try {
    const [home, destinationOne, destinationTwo, currentLocation] = await Promise.all([
      geocode(state.settings.homeLocation, "your Droitwich home location"),
      geocode(state.settings.destinationOne, "your Banwood Road destination"),
      geocode(state.settings.destinationTwo, "your Kenyon Street destination"),
      getCurrentLocation(),
    ]);
    state.resolvedPlaces = { home, destinationOne, destinationTwo };
    const journey = chooseJourney(currentLocation, state.resolvedPlaces);
    const route = await getRoute(journey.origin, journey.destination);
    drawJourney(route, journey, currentLocation);
    updateTripCard(route, journey);
  } catch (error) {
    console.error(error);
    setLoading(true, readableError(error));
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function geocode(query, locationName) {
  const url = new URL(`${TOMTOM_BASE}/search/2/geocode/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", state.settings.apiKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrySet", "GB");
  const response = await fetch(url);
  if (response.status === 401 || response.status === 403) {
    throw new Error("TomTom rejected this key. In TomTom, edit the key and make sure both Geocoding API and Routing API are enabled.");
  }
  if (!response.ok) throw new Error(`TomTom could not check ${locationName}. Please try again in a moment.`);
  const data = await response.json();
  const result = data.results?.[0];
  if (!result) throw new Error(`TomTom could not find ${locationName}. Open Settings and enter its full address or exact postcode.`);
  return { label: result.address.freeformAddress || query, lat: result.position.lat, lon: result.position.lon };
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location. Open Glowway in Safari on your iPhone."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Your location" }),
      (error) => reject(locationError(error)),
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 180000 },
    );
  });
}

function locationError(error) {
  if (error.code === 1) return new Error("Location was denied. In Safari, open the page menu beside the address bar, choose Website Settings, then set Location to Allow.");
  if (error.code === 2) return new Error("Your iPhone could not find its location. Check that Location Services and Precise Location are on, then try again outside or near a window.");
  return new Error("Your iPhone is taking longer than expected to find its location. Please wait a moment, then tap Refresh live traffic.");
}

function chooseJourney(current, places) {
  const defaultDestination = state.settings.defaultDestination === "two" ? places.destinationTwo : places.destinationOne;
  const nearestDestination = distanceKm(current, places.destinationOne) <= distanceKm(current, places.destinationTwo) ? places.destinationOne : places.destinationTwo;
  const goingFromHome = distanceKm(current, places.home) <= distanceKm(current, nearestDestination);
  return goingFromHome
    ? { origin: current, destination: defaultDestination, routeLabel: `Droitwich → ${shortLabel(defaultDestination.label)}` }
    : { origin: current, destination: places.home, routeLabel: `${shortLabel(nearestDestination.label)} → Droitwich` };
}

async function getRoute(origin, destination) {
  const coordinates = `${origin.lat},${origin.lon}:${destination.lat},${destination.lon}`;
  const url = new URL(`${TOMTOM_BASE}/routing/1/calculateRoute/${coordinates}/json`);
  url.searchParams.set("key", state.settings.apiKey);
  url.searchParams.set("traffic", "live");
  url.searchParams.set("travelMode", "car");
  url.searchParams.set("routeType", "fastest");
  url.searchParams.set("computeTravelTimeFor", "all");
  url.searchParams.set("sectionType", "traffic");
  const response = await fetch(url);
  if (!response.ok) throw new Error("TomTom could not load live traffic. Check that your API key is valid and try again.");
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No driving route was found for those locations.");
  return route;
}

function drawJourney(route, journey, currentLocation) {
  clearMapLayers();
  const points = route.legs.flatMap((leg) => leg.points).map((point) => [point.latitude, point.longitude]);
  const sections = route.sections?.filter((section) => section.sectionType === "TRAFFIC") || [];
  L.polyline(points, { color: "#e2edff", weight: 11, opacity: .9, lineCap: "round", lineJoin: "round" }).addTo(state.map);

  addTrafficLine(points, "fast");
  sections.forEach((section) => {
    const part = points.slice(section.startPointIndex, section.endPointIndex + 1);
    if (part.length > 1) addTrafficLine(part, trafficClass(section));
  });

  addMarker(currentLocation, "You", "current");
  addMarker(journey.destination, "Destination", "destination");
  state.map.fitBounds(L.latLngBounds(points), { padding: [55, 55], maxZoom: 12 });
}

function addTrafficLine(points, type) {
  const styles = {
    fast: { color: "#73efcb", className: "traffic-fast" },
    medium: { color: "#ffbd58", className: "traffic-medium" },
    slow: { color: "#ff6f7e", className: "traffic-slow" },
  };
  const line = L.polyline(points, { ...styles[type], weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(state.map);
  state.routeLayers.push(line);
}

function trafficClass(section) {
  const speed = section.effectiveSpeedInKmh ?? 70;
  if (speed < 20 || section.delayInSeconds > 300) return "slow";
  if (speed < 45 || section.delayInSeconds > 90) return "medium";
  return "fast";
}

function addMarker(place, label, type) {
  const marker = L.circleMarker([place.lat, place.lon], {
    radius: type === "current" ? 9 : 8,
    color: "#ffffff",
    weight: 3,
    fillColor: type === "current" ? "#51c9ff" : "#ffbd58",
    fillOpacity: 1,
  }).bindTooltip(label, { direction: "top", offset: [0, -7] }).addTo(state.map);
  state.markers.push(marker);
}

function clearMapLayers() {
  [...state.routeLayers, ...state.markers].forEach((layer) => state.map.removeLayer(layer));
  state.routeLayers = [];
  state.markers = [];
}

function updateTripCard(route, journey) {
  const summary = route.summary;
  const travelSeconds = summary.travelTimeInSeconds;
  const delaySeconds = summary.trafficDelayInSeconds || 0;
  const arrival = new Date(Date.now() + travelSeconds * 1000);
  const delayText = delaySeconds ? `+${formatDuration(delaySeconds)} traffic` : "No meaningful delays";
  elements.journeyLabel.textContent = journey.routeLabel;
  elements.routeName.textContent = journey.routeLabel;
  elements.journeyTime.textContent = formatDuration(travelSeconds);
  elements.arrivalTime.textContent = `Arrive ${arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  elements.trafficDelay.textContent = delayText;
  elements.trafficStatus.textContent = delaySeconds > 300 ? "Heavy traffic on parts of the route" : delaySeconds > 90 ? "Some traffic on the route" : "Roads are flowing";
  elements.updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  setLoading(false);
}

function setLoading(isLoading, message = "") {
  elements.loadingCard.classList.toggle("hidden", !isLoading);
  elements.tripCard.classList.toggle("hidden", isLoading);
  if (message) elements.loadingMessage.textContent = message;
  elements.refreshButton.disabled = isLoading;
}

function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

function shortLabel(label) {
  return label.split(",")[0];
}

function distanceKm(a, b) {
  const radius = 6371;
  const latDelta = radians(b.lat - a.lat);
  const lonDelta = radians(b.lon - a.lon);
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lonDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function radians(degrees) {
  return degrees * Math.PI / 180;
}

function readableError(error) {
  return error.message || "Something went wrong. Try refreshing the app.";
}
