const TOMTOM_BASE = "https://api.tomtom.com";
const DEFAULT_MAP_CENTER = [52.247, -2.158];
const COMMUTE_VIEW_BOUNDS = [[52.2, -2.25], [52.57, -1.72]];
const FIXED_PLACES = [
  { id: "droitwich", label: "Droitwich", query: "WR9 7DH, UK" },
  { id: "brandwood", label: "Brandwood Road", query: "B14 6BH, UK" },
  { id: "kenyon", label: "Kenyon Street", query: "B18 6AR, UK" },
];

const state = { map: null, routeLayers: [], markers: [], settings: loadSettings(), places: [], currentLocation: null, nearestPlace: null, selectedDestinationId: null };
const elements = {
  settingsDialog: document.querySelector("#settings-dialog"), settingsForm: document.querySelector("#settings-form"), settingsButton: document.querySelector("#settings-button"), closeSettings: document.querySelector("#close-settings"), loadingCard: document.querySelector("#loading-card"), loadingMessage: document.querySelector("#loading-message"), destinationPanel: document.querySelector("#destination-panel"), originLabel: document.querySelector("#origin-label"), destinationButtons: document.querySelector("#destination-buttons"), tripCard: document.querySelector("#trip-card"), quickDestinationButtons: document.querySelector("#quick-destination-buttons"), refreshButton: document.querySelector("#refresh-button"), journeyLabel: document.querySelector("#journey-label"), routeName: document.querySelector("#route-name"), journeyTime: document.querySelector("#journey-time"), arrivalTime: document.querySelector("#arrival-time"), trafficStatus: document.querySelector("#traffic-status"), trafficDelay: document.querySelector("#traffic-delay"), updatedAt: document.querySelector("#updated-at"),
};

initialise();

function initialise() {
  state.map = L.map("map", { zoomControl: false, attributionControl: false }).setView(DEFAULT_MAP_CENTER, 10);
  L.control.zoom({ position: "topright" }).addTo(state.map);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=16").catch(() => undefined);
  bindEvents();
  if (!isConfigured()) {
    elements.loadingMessage.textContent = "Add your TomTom key once to start using Glowway.";
    elements.settingsDialog.showModal();
    return;
  }
  prepareDestinationChooser();
}

function bindEvents() {
  elements.settingsButton.addEventListener("click", () => { populateSettingsForm(); elements.settingsDialog.showModal(); });
  elements.closeSettings.addEventListener("click", () => elements.settingsDialog.close());
  elements.refreshButton.addEventListener("click", () => state.selectedDestinationId ? loadSelectedRoute() : prepareDestinationChooser());
  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings = { apiKey: new FormData(elements.settingsForm).get("apiKey").trim() };
    localStorage.setItem("glowway-settings", JSON.stringify(state.settings));
    state.places = [];
    state.selectedDestinationId = null;
    elements.settingsDialog.close();
    prepareDestinationChooser();
  });
}

function loadSettings() { try { return JSON.parse(localStorage.getItem("glowway-settings")) || {}; } catch { return {}; } }
function isConfigured() { return Boolean(state.settings.apiKey); }
function populateSettingsForm() { document.querySelector("#api-key").value = state.settings.apiKey || ""; }

async function prepareDestinationChooser() {
  if (!isConfigured()) return;
  setLoading(true, "Finding your location and preparing your journeys…");
  try {
    const [places, currentLocation] = await Promise.all([resolveFixedPlaces(), getCurrentLocation()]);
    state.places = places;
    state.currentLocation = currentLocation;
    state.nearestPlace = nearestPlace(currentLocation, places);
    state.selectedDestinationId = null;
    drawPlaceMarkers();
    renderDestinationChooser();
    setLoading(false);
  } catch (error) { console.error(error); setLoading(true, readableError(error)); }
}

async function resolveFixedPlaces() {
  if (state.places.length) return state.places;
  return Promise.all(FIXED_PLACES.map(async (place) => ({ ...place, ...(await geocode(place.query, place.label)) })));
}

function renderDestinationChooser() {
  const options = state.places.filter((place) => place.id !== state.nearestPlace.id);
  elements.originLabel.textContent = `You are nearest ${state.nearestPlace.label}. Where are you going?`;
  elements.destinationButtons.replaceChildren(...options.map((place) => {
    const button = document.createElement("button");
    button.className = "destination-button";
    button.type = "button";
    button.innerHTML = `<span>${place.label}</span><small>${place.query.replace(", UK", "")}</small>`;
    button.addEventListener("click", () => { state.selectedDestinationId = place.id; loadSelectedRoute(); });
    return button;
  }));
  elements.destinationPanel.classList.remove("hidden");
  elements.tripCard.classList.add("hidden");
}

async function loadSelectedRoute() {
  const destination = state.places.find((place) => place.id === state.selectedDestinationId);
  if (!destination) return prepareDestinationChooser();
  setLoading(true, "Checking live traffic on your route…");
  try {
    state.currentLocation = await getCurrentLocation();
    state.nearestPlace = nearestPlace(state.currentLocation, state.places);
    const journey = { origin: state.currentLocation, destination, routeLabel: `${state.nearestPlace.label} → ${destination.label}` };
    const route = await getRoute(journey.origin, journey.destination);
    drawJourney(route, journey);
    updateTripCard(route, journey);
  } catch (error) { console.error(error); setLoading(true, readableError(error)); }
  finally { elements.refreshButton.disabled = false; }
}

async function geocode(query, locationName) {
  const url = new URL(`${TOMTOM_BASE}/maps/orbis/places/geocode`);
  url.searchParams.set("query", query); url.searchParams.set("maxResults", "1"); url.searchParams.set("countryCodesIso2", "GB");
  const response = await fetch(url, { headers: tomtomHeaders("results(title,position)") });
  if (response.status === 401 || response.status === 403) throw new Error("TomTom rejected this key. Open Settings and paste the correct API key.");
  if (!response.ok) throw new Error(`TomTom could not check ${locationName}. Please try again in a moment.`);
  const result = (await response.json()).results?.[0];
  if (!result) throw new Error(`TomTom could not find ${locationName}. Please contact the app owner.`);
  return { lat: result.position.coordinates[1], lon: result.position.coordinates[0] };
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser does not support location. Open Glowway in Safari on your iPhone."));
    navigator.geolocation.getCurrentPosition((position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }), (error) => reject(locationError(error)), { enableHighAccuracy: false, timeout: 30000, maximumAge: 180000 });
  });
}

function locationError(error) {
  if (error.code === 1) return new Error("Location was denied. In Safari, open the page menu beside the address bar, choose Website Settings, then set Location to Allow.");
  if (error.code === 2) return new Error("Your iPhone could not find its location. Check that Location Services and Precise Location are on, then try again outside or near a window.");
  return new Error("Your iPhone is taking longer than expected to find its location. Please wait a moment, then reload Glowway.");
}

async function getRoute(origin, destination) {
  const url = new URL(`${TOMTOM_BASE}/routing/1/calculateRoute/${origin.lat},${origin.lon}:${destination.lat},${destination.lon}/json`);
  url.searchParams.set("key", state.settings.apiKey); url.searchParams.set("traffic", "true"); url.searchParams.set("travelMode", "car"); url.searchParams.set("routeType", "fastest"); url.searchParams.set("sectionType", "traffic"); url.searchParams.set("computeTravelTimeFor", "all");
  const response = await fetch(url);
  if (!response.ok) {
    const details = (await response.text()).replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`TomTom route request failed (HTTP ${response.status}). ${details || "Please try again."}`);
  }
  const route = (await response.json()).routes?.[0];
  if (!route) throw new Error("No driving route was found for those locations.");
  return route;
}

function tomtomHeaders(attributes) {
  const headers = { "TomTom-Api-Version": "2", "TomTom-Api-Key": state.settings.apiKey };
  if (attributes) headers.Attributes = attributes;
  return headers;
}
function nearestPlace(current, places) { return places.reduce((nearest, place) => distanceKm(current, place) < distanceKm(current, nearest) ? place : nearest); }

function drawPlaceMarkers() {
  clearMapLayers();
  state.places.forEach((place) => addMarker(place, place.label, place.id === state.nearestPlace.id ? "current" : "destination"));
  addMarker(state.currentLocation, "You", "current");
  focusCommuteArea();
}

function drawJourney(route, journey) {
  clearMapLayers();
  const points = route.legs.flatMap((leg) => leg.points).map((point) => [point.latitude, point.longitude]);
  const sections = route.sections?.filter((section) => section.sectionType === "TRAFFIC") || [];
  state.routeLayers.push(L.polyline(points, { color: "#b8dfff", weight: 16, opacity: .2, className: "route-glass-base", lineCap: "round", lineJoin: "round" }).addTo(state.map));
  state.routeLayers.push(L.polyline(points, { color: "#d9efff", weight: 9, opacity: .32, className: "route-glass-sheen", lineCap: "round", lineJoin: "round" }).addTo(state.map));
  addTrafficLine(points, "fast");
  sections.forEach((section) => { const part = points.slice(section.startPointIndex, section.endPointIndex + 1); if (part.length > 1) addTrafficLine(part, trafficClass(section)); });
  addMarker(journey.origin, "You", "current"); addMarker(journey.destination, journey.destination.label, "destination");
  focusCommuteArea();
}

function addTrafficLine(points, type) { const styles = { fast: { color: "#70ffd7", className: "traffic-fast" }, medium: { color: "#ffd071", className: "traffic-medium" }, slow: { color: "#ff7890", className: "traffic-slow" } }; state.routeLayers.push(L.polyline(points, { ...styles[type], weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(state.map)); }
function trafficClass(section) { const speed = section.effectiveSpeedInKmh ?? 70; if (speed < 20 || section.delayInSeconds > 300) return "slow"; if (speed < 45 || section.delayInSeconds > 90) return "medium"; return "fast"; }
function addMarker(place, label, type) { state.markers.push(L.circleMarker([place.lat, place.lon], { radius: type === "current" ? 9 : 8, color: "#ffffff", weight: 3, fillColor: type === "current" ? "#51c9ff" : "#ffbd58", fillOpacity: 1 }).bindTooltip(label, { direction: "top", offset: [0, -7] }).addTo(state.map)); }
function clearMapLayers() { [...state.routeLayers, ...state.markers].forEach((layer) => state.map.removeLayer(layer)); state.routeLayers = []; state.markers = []; }
function focusCommuteArea() { state.map.fitBounds(COMMUTE_VIEW_BOUNDS, { paddingTopLeft: [28, 125], paddingBottomRight: [125, 255], maxZoom: 10 }); }

function updateTripCard(route, journey) {
  const summary = route.summary; const travelSeconds = summary.travelTimeInSeconds; const delaySeconds = summary.trafficDelayInSeconds || 0; const arrival = new Date(Date.now() + travelSeconds * 1000);
  elements.journeyLabel.textContent = journey.routeLabel; elements.routeName.textContent = journey.routeLabel; elements.journeyTime.textContent = formatDuration(travelSeconds); elements.arrivalTime.textContent = `Arrive ${arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  elements.trafficDelay.textContent = delaySeconds ? `+${formatDuration(delaySeconds)} traffic` : "No meaningful delays";
  elements.trafficStatus.textContent = delaySeconds > 300 ? "Heavy traffic on parts of the route" : delaySeconds > 90 ? "Some traffic on the route" : "Roads are flowing";
  elements.updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  renderQuickDestinationSwitch();
  elements.destinationPanel.classList.add("hidden"); elements.tripCard.classList.remove("hidden"); setLoading(false);
}

function renderQuickDestinationSwitch() {
  const alternatives = state.places.filter((place) => place.id !== state.nearestPlace.id && place.id !== state.selectedDestinationId);
  elements.quickDestinationButtons.replaceChildren(...alternatives.map((place) => {
    const action = document.createElement("div");
    action.className = "destination-action";
    const button = document.createElement("button");
    button.className = "quick-destination-button";
    button.type = "button";
    button.setAttribute("aria-label", `Change destination to ${place.label}`);
    button.title = `Go to ${place.label}`;
    button.innerHTML = "↗";
    button.addEventListener("click", () => { state.selectedDestinationId = place.id; loadSelectedRoute(); });
    const label = document.createElement("span");
    label.textContent = place.label;
    action.append(button, label);
    return action;
  }));
}

function setLoading(isLoading, message = "") { elements.loadingCard.classList.toggle("hidden", !isLoading); if (isLoading) { elements.destinationPanel.classList.add("hidden"); elements.tripCard.classList.add("hidden"); } if (message) elements.loadingMessage.textContent = message; elements.refreshButton.disabled = isLoading; }
function formatDuration(seconds) { const minutes = Math.max(1, Math.round(seconds / 60)); const hours = Math.floor(minutes / 60); return hours ? `${hours} hr ${minutes % 60} min` : `${minutes} min`; }
function distanceKm(a, b) { const radius = 6371; const latDelta = radians(b.lat - a.lat); const lonDelta = radians(b.lon - a.lon); const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lonDelta / 2) ** 2; return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)); }
function radians(degrees) { return degrees * Math.PI / 180; }
function readableError(error) { return error.message || "Something went wrong. Try refreshing the app."; }
