(function () {
  "use strict";

  var START = { lat: -39.1611, lng: 174.2066, label: "10 Tawa St, Inglewood" };
  var DROPOFF = { lat: -39.0323, lng: 174.1651, label: "Global Metal Solutions, 146 Connett Rd East, Bell Block" };
  var TRAILER_CAP = 18;
  var UTE_CAP = 8;
  var MAX_GOOGLE_STOPS = 9;

  var CORRIDORS = ["north", "south", "coastal", "unknown"];
  var CORRIDOR_LABELS = {
    north: "North",
    south: "South",
    coastal: "Coastal",
    unknown: "Check"
  };
  var CORRIDOR_COLORS = {
    north: "#4ba3ff",
    south: "#35c96f",
    coastal: "#f1a53a",
    unknown: "#a685ff"
  };
  var TOWN_CORRIDORS = {
    "new plymouth": "north",
    "bell block": "north",
    "waitara": "north",
    "inglewood": "north",
    "fitzroy": "north",
    "merrilands": "north",
    "westown": "north",
    "moturoa": "north",
    "strandon": "north",
    "vogeltown": "north",
    "welbourn": "north",
    "glen avon": "north",
    "spotswood": "north",
    "brooklands": "north",
    "lepperton": "north",
    "egmont village": "north",
    "tikorangi": "north",
    "omata": "north",
    "hillsborough": "north",
    "hurworth": "north",
    "oakura": "north",
    "patea": "south",
    "waverley": "south",
    "hawera": "south",
    "eltham": "south",
    "stratford": "south",
    "normanby": "south",
    "manaia": "south",
    "kaponga": "south",
    "awatuna": "south",
    "midhirst": "south",
    "opunake": "coastal",
    "rahotu": "coastal",
    "oaonui": "coastal",
    "okato": "coastal",
    "pungarehu": "coastal",
    "puniho": "coastal"
  };
  var FALLBACK_COORDS = {
    "waitara": { lat: -38.9976, lng: 174.2348 },
    "hawera": { lat: -39.5908, lng: 174.2810 },
    "patea": { lat: -39.7467, lng: 174.4861 },
    "opunake": { lat: -39.4560, lng: 174.0158 },
    "rahotu": { lat: -39.3300, lng: 173.8939 },
    "oaonui": { lat: -39.3914, lng: 174.0545 },
    "oakura": { lat: -39.1060, lng: 174.0234 },
    "eltham": { lat: -39.4290, lng: 174.3017 },
    "stratford": { lat: -39.3333, lng: 174.2837 },
    "inglewood": { lat: -39.1567, lng: 174.2064 },
    "bell block": { lat: -39.0360, lng: 174.1017 },
    "new plymouth": { lat: -39.0556, lng: 174.0752 },
    "fitzroy": { lat: -39.0500, lng: 174.1100 },
    "merrilands": { lat: -39.0650, lng: 174.0650 },
    "westown": { lat: -39.0680, lng: 174.0540 },
    "moturoa": { lat: -39.0720, lng: 174.0480 },
    "strandon": { lat: -39.0530, lng: 174.1000 },
    "vogeltown": { lat: -39.0750, lng: 174.0620 },
    "spotswood": { lat: -39.0780, lng: 174.0380 },
    "brooklands": { lat: -39.0200, lng: 174.0850 },
    "lepperton": { lat: -39.0710, lng: 174.1950 },
    "egmont village": { lat: -39.1550, lng: 174.0920 },
    "tikorangi": { lat: -39.0300, lng: 174.2200 },
    "omata": { lat: -39.1050, lng: 174.0300 },
    "hillsborough": { lat: -39.0870, lng: 174.1420 },
    "hurworth": { lat: -39.1180, lng: 174.0570 },
    "normanby": { lat: -39.5100, lng: 174.2350 },
    "manaia": { lat: -39.5450, lng: 174.1240 },
    "kaponga": { lat: -39.4200, lng: 174.1600 },
    "waverley": { lat: -39.7650, lng: 174.6310 },
    "awatuna": { lat: -39.3900, lng: 174.1200 },
    "midhirst": { lat: -39.2650, lng: 174.2760 },
    "okato": { lat: -39.1930, lng: 173.8820 },
    "pungarehu": { lat: -39.3000, lng: 173.8600 },
    "puniho": { lat: -39.2450, lng: 173.8650 }
  };
  var LARGE_ITEMS = [
    "chest freezer",
    "double door",
    "double-door",
    "french door",
    "side by side",
    "american fridge",
    "large freezer",
    "commercial",
    "upright freezer large"
  ];
  // Items that squeeze in between things and don't take a real "space".
  var FREE_ITEMS = [
    "tv", "television", "microwave", "gas bottle", "gasbottle", "lpg",
    "small heater", "toaster", "kettle", "iron"
  ];

  var state = {
    rawPickups: [],
    stops: [],
    geocodeCache: {},
    selectedIds: new Set(),
    collectedIds: new Set(),
    pendingCollectIds: new Set(),
    currentCorridor: "all",
    messageMode: "reminder",
    routeOrder: [],
    routeMetrics: null,
    mapExpanded: false,
    sourceMode: "live",
    lastSync: null,
    loadSeq: 0,
    stats: { rawCount: 0, mergedCount: 0, draftCount: 0 },
    map: null,
    markers: new Map(),
    routeLayer: null,
    mapReady: false,
    tripMode: false,
    tripCurrentId: null,
    priorityIds: new Set(),
    manualOrder: []
  };

  var el = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    loadLocalState();
    initMap();
    setView("route");
    loadPickups(false);
  }

  function cacheElements() {
    [
      "syncLine", "refreshBtn", "demoBtn", "metricGrid", "corridorControls",
      "selectVisibleBtn", "deselectVisibleBtn", "selectCapacityBtn", "clearRouteBtn",
      "loadTotalText", "loadStatusPill", "trailerText", "uteText", "trailerBar",
      "uteBar", "loadHint", "readinessList", "corridorBoard", "map", "mapEmpty",
      "routeSearchBtn", "savingsChip", "savingsText", "optimizeBtn", "gmapsBtn",
      "fitMapBtn", "routeDateTitle", "routeMetaLine", "routeAddBtn",
      "routeSummaryStrip", "routeLoadBtn", "routeReorganiseBtn", "routeStartBtn",
      "routeList", "searchInput", "exportCsvBtn", "onlySelectedToggle",
      "missingCoordsToggle", "missingPhoneToggle", "customerList", "pickupDayInput",
      "pickupWindowInput", "driverNoteInput", "messageModeControls", "copyAllTextsBtn",
      "printRunSheetBtn", "textList", "runSheet", "draftForm", "clearDraftsBtn",
      "findPinsBtn", "cleanupList", "mapsModal", "closeMapsModalBtn", "mapsLinks",
      "addStopModal", "closeAddStopModalBtn", "quickAddressInput", "quickAddressBtn",
      "csvStopInput", "bulkPasteToggle", "manualStopFocusBtn", "bulkPasteBox",
      "bulkStopsInput", "addBulkStopsBtn", "quickDraftForm", "toast",
      "sendAllSmsBtn", "mobileLoadSummary", "clearRouteQuickBtn", "toolsBtn",
      "selectVisibleQuickBtn", "fillLoadQuickBtn"
    ].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        setView(button.dataset.view);
      });
    });

    el.refreshBtn.addEventListener("click", function () { loadPickups(false); });
    if (el.demoBtn) el.demoBtn.addEventListener("click", function () { loadPickups(true); });
    el.selectVisibleBtn.addEventListener("click", selectVisibleStops);
    el.deselectVisibleBtn.addEventListener("click", deselectVisibleStops);
    el.selectCapacityBtn.addEventListener("click", selectOneTrailerLoad);
    el.clearRouteBtn.addEventListener("click", clearRoute);
    el.optimizeBtn.addEventListener("click", optimizeRoute);
    el.gmapsBtn.addEventListener("click", openMapsModal);
    el.fitMapBtn.addEventListener("click", toggleBigMap);
    el.routeSearchBtn.addEventListener("click", openAddStopModal);
    el.routeAddBtn.addEventListener("click", openAddStopModal);
    el.routeLoadBtn.addEventListener("click", function () { setView("customers"); });
    el.routeReorganiseBtn.addEventListener("click", optimizeRoute);
    el.routeStartBtn.addEventListener("click", startTrip);
    if (el.exportCsvBtn) el.exportCsvBtn.addEventListener("click", exportCsv);
    if (el.clearRouteQuickBtn) el.clearRouteQuickBtn.addEventListener("click", clearRoute);
    if (el.toolsBtn) el.toolsBtn.addEventListener("click", function () { setView("admin"); });
    if (el.selectVisibleQuickBtn) el.selectVisibleQuickBtn.addEventListener("click", selectVisibleStops);
    if (el.fillLoadQuickBtn) el.fillLoadQuickBtn.addEventListener("click", selectOneTrailerLoad);
    el.copyAllTextsBtn.addEventListener("click", copyAllTexts);
    if (el.sendAllSmsBtn) el.sendAllSmsBtn.addEventListener("click", sendAllSms);
    el.printRunSheetBtn.addEventListener("click", function () {
      setView("texts");
      setTimeout(function () { window.print(); }, 100);
    });
    if (el.findPinsBtn) el.findPinsBtn.addEventListener("click", confirmAndGeocode);
    el.closeMapsModalBtn.addEventListener("click", closeMapsModal);
    el.mapsModal.addEventListener("click", function (event) {
      if (event.target === el.mapsModal) closeMapsModal();
    });
    el.closeAddStopModalBtn.addEventListener("click", closeAddStopModal);
    el.addStopModal.addEventListener("click", function (event) {
      if (event.target === el.addStopModal) closeAddStopModal();
    });
    el.quickAddressBtn.addEventListener("click", addQuickAddress);
    el.quickAddressInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") addQuickAddress();
    });
    el.csvStopInput.addEventListener("change", importCsvStops);
    el.bulkPasteToggle.addEventListener("click", function () {
      el.bulkPasteBox.hidden = !el.bulkPasteBox.hidden;
      if (!el.bulkPasteBox.hidden) el.bulkStopsInput.focus();
    });
    el.manualStopFocusBtn.addEventListener("click", function () {
      el.quickDraftForm.querySelector('input[name="name"]').focus();
    });
    el.addBulkStopsBtn.addEventListener("click", addBulkStops);
    el.quickDraftForm.addEventListener("submit", function (event) {
      addDraftStop(event, el.quickDraftForm, true);
    });

    el.corridorControls.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-corridor]");
      if (!button) return;
      state.currentCorridor = button.dataset.corridor;
      state.routeOrder = [];
      updateSegmented(el.corridorControls, "corridor", state.currentCorridor);
      renderAll();
      fitMapToStops();
    });

    el.messageModeControls.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-message-mode]");
      if (!button) return;
      state.messageMode = button.dataset.messageMode;
      updateSegmented(el.messageModeControls, "messageMode", state.messageMode);
      renderTexts();
    });

    ["searchInput", "onlySelectedToggle", "missingCoordsToggle", "missingPhoneToggle"].forEach(function (id) {
      el[id].addEventListener("input", renderCustomers);
      el[id].addEventListener("change", renderCustomers);
    });

    ["pickupDayInput", "pickupWindowInput", "driverNoteInput"].forEach(function (id) {
      el[id].addEventListener("input", renderTexts);
    });

    el.customerList.addEventListener("click", handleStopAction);
    el.routeList.addEventListener("click", handleStopAction);
    el.corridorBoard.addEventListener("click", function (event) {
      var button = event.target.closest("[data-select-corridor]");
      if (!button) return;
      selectCorridor(button.dataset.selectCorridor);
    });
    el.textList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-copy-message]");
      if (!button) return;
      var card = button.closest(".text-card");
      copyToClipboard(card.querySelector("p").textContent);
    });
    el.draftForm.addEventListener("submit", function (event) {
      addDraftStop(event, el.draftForm, false);
    });
    el.clearDraftsBtn.addEventListener("click", clearDraftStops);
  }

  function loadLocalState() {
    try {
      state.selectedIds = new Set(JSON.parse(localStorage.getItem("nakiSelectedStops") || "[]"));
    } catch (err) {
      state.selectedIds = new Set();
    }
    try {
      state.collectedIds = new Set(JSON.parse(localStorage.getItem("collectedIds") || "[]"));
    } catch (err2) {
      state.collectedIds = new Set();
    }
    try {
      state.priorityIds = new Set(JSON.parse(localStorage.getItem("nakiPriorityStops") || "[]"));
    } catch (err3) {
      state.priorityIds = new Set();
    }
    try {
      state.manualOrder = JSON.parse(localStorage.getItem("nakiManualOrder") || "[]");
    } catch (err4) {
      state.manualOrder = [];
    }
  }

  function saveSelectedState() {
    localStorage.setItem("nakiSelectedStops", JSON.stringify(Array.from(state.selectedIds)));
  }

  function saveCollectedState() {
    localStorage.setItem("collectedIds", JSON.stringify(Array.from(state.collectedIds)));
  }

  function savePriorityState() {
    localStorage.setItem("nakiPriorityStops", JSON.stringify(Array.from(state.priorityIds)));
  }

  function saveManualOrder() {
    localStorage.setItem("nakiManualOrder", JSON.stringify(state.manualOrder));
  }

  async function loadPickups(useDemo) {
    var loadSeq = ++state.loadSeq;
    state.sourceMode = useDemo ? "demo" : "live";
    setBusy(true, useDemo ? "Loading demo pickups..." : "Reading your pickup sheet...");

    try {
      await loadCollectedFromServer();
      await loadGeocodeCache();

      var url = useDemo ? "/api/sample-pickups" : "/api/pickups";
      var response = await fetch(url, { cache: "no-store" });
      var data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Pickup sheet could not be read.");
      }
      if (loadSeq !== state.loadSeq) return;

      state.rawPickups = data.pickups || [];
      rebuildStops();
      applyFastCoordinates();
      renderAll();

      state.lastSync = new Date();
      setSyncLine();
      toast(useDemo ? "Demo pickups loaded" : "Pickup sheet refreshed");

      // Auto-fill any missing precise pins via Nominatim. Runs in background;
      // doesn't block the UI. New pins land in the cache and the next render
      // picks them up.
      if (!useDemo) autoFillMissingPins(loadSeq);
    } catch (err) {
      if (loadSeq !== state.loadSeq) return;
      setSyncLine("Could not load pickups: " + err.message + ". Try Demo to preview the system.");
      toast("Pickup load failed");
      if (state.stops.length === 0) {
        renderAll();
      }
    } finally {
      if (loadSeq === state.loadSeq) setBusy(false);
    }
  }

  async function loadCollectedFromServer() {
    try {
      var response = await fetch("/api/collected", { cache: "no-store" });
      if (!response.ok) return;
      var rows = await response.json();
      rows.forEach(function (item) {
        if (item && item.submission_id) state.collectedIds.add(String(item.submission_id));
      });
      saveCollectedState();
    } catch (err) {
      // Local collected state still works when offline.
    }
  }

  async function autoFillMissingPins(loadSeq) {
    // Stops that need a real pin (no precise sheet/cache coords yet)
    var missing = activeStops().filter(function (s) {
      return s.street && (s.coordQuality === "missing" || s.coordQuality === "town");
    });
    if (!missing.length) return;
    // Tell the user once, then remember consent
    var consent = localStorage.getItem("nakiAutoGeocodeConsent");
    if (consent !== "yes") {
      var ok = window.confirm(
        "Naki Wreck Ops can auto-find precise map pins for new addresses every " +
        "time you tap Refresh. It sends each unknown address to OpenStreetMap " +
        "(free, no account needed). The address is sent without the customer's " +
        "name or phone. Allow this from now on?"
      );
      if (!ok) {
        localStorage.setItem("nakiAutoGeocodeConsent", "no");
        toast("Auto pin-finding stays off");
        return;
      }
      localStorage.setItem("nakiAutoGeocodeConsent", "yes");
    }
    if (consent === "no") return;
    setSyncLine("Finding map pins for " + missing.length + " new address(es)...");
    try {
      var r = await fetch("/api/geocode-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "nominatim" }),
      });
      var data = await r.json();
      if (loadSeq !== state.loadSeq) return;
      if (data.geocoded > 0) {
        await loadGeocodeCache();
        applyFastCoordinates();
        renderAll();
        toast("Found " + data.geocoded + " precise pin(s)");
      }
    } catch (err) {
      // Silent failure - user can still drive with town pins
    } finally {
      setSyncLine();
    }
  }

  async function loadGeocodeCache() {
    try {
      var response = await fetch("/api/geocache", { cache: "no-store" });
      if (response.ok) state.geocodeCache = await response.json();
    } catch (err) {
      state.geocodeCache = {};
    }
  }

  function rebuildStops() {
    var drafts = loadDraftStops();
    var liveStops = buildStops(state.rawPickups);
    var draftStops = buildStops(drafts);
    draftStops.forEach(function (stop) { stop.isDraft = true; });

    state.stops = liveStops.concat(draftStops);
    state.stats = {
      rawCount: state.rawPickups.length,
      mergedCount: liveStops.length,
      draftCount: draftStops.length
    };

    var activeIds = new Set(activeStops().map(function (stop) { return stop.id; }));
    state.selectedIds = new Set(Array.from(state.selectedIds).filter(function (id) {
      return activeIds.has(id);
    }));

    if (state.selectedIds.size === 0) {
      activeStops().forEach(function (stop) { state.selectedIds.add(stop.id); });
      saveSelectedState();
    } else {
      activeStops().forEach(function (stop) {
        if (stop.isDraft && !state.selectedIds.has(stop.id)) state.selectedIds.add(stop.id);
      });
      saveSelectedState();
    }
  }

  function buildStops(rawRows) {
    var groups = new Map();

    rawRows.forEach(function (row, index) {
      var first = clean(row.first_name);
      var last = clean(row.last_name);
      var name = clean([first, last].join(" ")) || clean(row.name) || "Unknown customer";
      var phone = clean(row.phone);
      var street = clean(row.street);
      var town = clean(row.town);
      var area = clean(row.area);
      var key = [
        normalizePhone(phone) || normalizeText(name),
        normalizeText(street),
        normalizeText(town)
      ].join("|");

      if (!groups.has(key)) {
        groups.set(key, {
          id: "stop-" + hashKey(key + "|" + index),
          key: key,
          firstName: first || name.split(" ")[0] || "there",
          lastName: last,
          name: name,
          phone: phone,
          email: clean(row.email),
          street: street,
          town: town,
          area: area,
          rural: clean(row.rural),
          appliances: [],
          notes: [],
          dates: [],
          submissionIds: [],
          sourceRows: 0,
          status: clean(row.status),
          sheetLat: row.lat === undefined || row.lat === null ? null : Number(row.lat),
          sheetLng: row.lng === undefined || row.lng === null ? null : Number(row.lng),
          isDraft: !!row.isDraft
        });
      }

      var group = groups.get(key);
      group.sourceRows += 1;
      group.appliances = group.appliances.concat(normalizeItems(row.appliances));
      if (clean(row.additional_info)) group.notes.push(clean(row.additional_info));
      if (clean(row.date)) group.dates.push(clean(row.date));
      if (clean(row.submission_id)) group.submissionIds.push(clean(row.submission_id));
      if (!group.phone && phone) group.phone = phone;
      if (!group.email && clean(row.email)) group.email = clean(row.email);
      if (!group.sheetLat && row.lat) group.sheetLat = Number(row.lat);
      if (!group.sheetLng && row.lng) group.sheetLng = Number(row.lng);
    });

    return Array.from(groups.values()).map(function (stop) {
      stop.appliances = unique(stop.appliances);
      stop.notes = unique(stop.notes);
      stop.dates = unique(stop.dates);
      stop.submissionIds = unique(stop.submissionIds);
      stop.id = "stop-" + hashKey(stop.key + "|" + (stop.submissionIds[0] || ""));
      stop.spaces = countSpaces(stop.appliances);
      stop.corridor = classifyCorridor(stop.town, stop.area);
      stop.coords = null;
      stop.coordQuality = "missing";
      stop.routeOrder = null;
      return stop;
    }).sort(sortStopsForWork);
  }

  function applyFastCoordinates() {
    state.stops.forEach(function (stop) {
      if (Number.isFinite(stop.sheetLat) && Number.isFinite(stop.sheetLng)) {
        stop.coords = { lat: stop.sheetLat, lng: stop.sheetLng };
        stop.coordQuality = "sheet";
        return;
      }

      var cacheKey = addressKey(stop);
      if (state.geocodeCache[cacheKey]) {
        stop.coords = state.geocodeCache[cacheKey];
        stop.coordQuality = "cache";
        return;
      }

      var townKey = normalizeText(stop.town);
      if (FALLBACK_COORDS[townKey]) {
        stop.coords = FALLBACK_COORDS[townKey];
        stop.coordQuality = "town";
      }
    });
  }

  async function geocodeMissingStops() {
    var missing = activeStops().filter(function (stop) {
      return stop.coordQuality === "missing" || stop.coordQuality === "town";
    });
    if (missing.length === 0) return;

    var newEntries = {};
    var attempts = 0;
    for (var i = 0; i < missing.length; i += 1) {
      var stop = missing[i];
      if (!stop.street || attempts >= 12) continue;
      setSyncLine("Finding map pins " + (i + 1) + " of " + missing.length + ": " + stop.town);
      try {
        var coords = await nominatimGeocode(fullAddress(stop));
        attempts += 1;
        if (coords) {
          stop.coords = coords;
          stop.coordQuality = "geocoded";
          newEntries[addressKey(stop)] = coords;
        }
      } catch (err) {
        // Town centre fallback already keeps the route usable.
      }
      await sleep(1050);
    }

    if (Object.keys(newEntries).length > 0) {
      try {
        await fetch("/api/geocache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newEntries)
        });
      } catch (err2) {
        // Cache write is best effort.
      }
    }
    setSyncLine();
  }

  async function confirmAndGeocode() {
    var targets = activeStops().filter(function (stop) {
      return stop.street && (stop.coordQuality === "missing" || stop.coordQuality === "town");
    });
    if (!targets.length) {
      toast("No missing pins to find");
      return;
    }
    var ok = window.confirm(
      "This will send " + targets.length +
      " pickup address(es) to OpenStreetMap Nominatim so the map pins can be more accurate. " +
      "Only do this if you are comfortable sharing those customer addresses with that geocoding service."
    );
    if (!ok) return;

    setBusy(true, "Finding missing map pins...");
    try {
      await geocodeMissingStops();
      renderAll();
      toast("Map pin check finished");
    } finally {
      setBusy(false);
      setSyncLine();
    }
  }

  async function nominatimGeocode(address) {
    var url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
      q: address,
      format: "json",
      limit: "1",
      countrycodes: "nz"
    }).toString();
    var response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) return null;
    var results = await response.json();
    if (!results.length) return null;
    return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
  }

  function initMap() {
    if (!window.L) {
      el.mapEmpty.classList.add("show");
      el.mapEmpty.textContent = "Map tiles did not load. The lists and route tools still work.";
      return;
    }

    state.mapReady = true;
    state.map = L.map("map", { zoomControl: true }).setView([-39.13, 174.14], 10);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
      subdomains: "abcd"
    }).addTo(state.map);

    L.marker([START.lat, START.lng], {
      icon: makePin("#ef5b5b", "S"),
      zIndexOffset: 900
    }).addTo(state.map).bindPopup("<strong>Start</strong><br>" + escapeHtml(START.label));
    L.marker([DROPOFF.lat, DROPOFF.lng], {
      icon: makePin("#ef5b5b", "D"),
      zIndexOffset: 900
    }).addTo(state.map).bindPopup("<strong>Drop-off</strong><br>" + escapeHtml(DROPOFF.label));
  }

  function renderAll() {
    clearRouteOrdersIfInvalid();
    renderMetrics();
    renderLoad();
    renderReadiness();
    renderCorridors();
    renderRoute();
    renderCustomers();
    renderTexts();
    renderCleanup();
    renderMap();
    renderTripBanner();
    setSyncLine();
  }

  function renderMetrics() {
    var active = activeStops();
    var selected = selectedStops();
    var totalSpaces = sumSpaces(active);
    var selectedSpaces = sumSpaces(selected);
    var missingCoords = active.filter(function (s) { return !s.coords; }).length;
    var missingPhones = active.filter(function (s) { return !s.phone; }).length;
    var cleaned = state.stats.rawCount - state.stats.mergedCount;
    var issueCount = missingCoords + missingPhones;

    var metrics = [
      ["Open stops", active.length, totalSpaces + " spaces waiting"],
      ["Selected run", selected.length, selectedSpaces + " spaces on the plan"],
      ["Load status", loadStatus(selectedSpaces).shortLabel, loadStatus(selectedSpaces).detail],
      ["Data checks", issueCount, missingCoords + " missing pin(s), " + missingPhones + " missing phone(s), " + cleaned + " duplicate row(s) merged"]
    ];

    el.metricGrid.innerHTML = metrics.map(function (m) {
      return '<article class="metric"><span>' + escapeHtml(m[0]) + '</span><strong>' +
        escapeHtml(String(m[1])) + '</strong><p>' + escapeHtml(m[2]) + '</p></article>';
    }).join("");
  }

  function renderLoad() {
    var spaces = sumSpaces(selectedStops());
    var status = loadStatus(spaces);
    var trailer = Math.min(spaces, TRAILER_CAP);
    var ute = Math.min(Math.max(0, spaces - TRAILER_CAP), UTE_CAP);
    var trailerPct = TRAILER_CAP ? Math.min(100, (trailer / TRAILER_CAP) * 100) : 0;
    var utePct = UTE_CAP ? Math.min(100, (ute / UTE_CAP) * 100) : 0;

    el.loadTotalText.textContent = spaces + " spaces";
    if (el.mobileLoadSummary) {
      el.mobileLoadSummary.textContent = spaces + " spaces - " + selectedStops().length + " stop" +
        (selectedStops().length === 1 ? "" : "s");
    }
    el.loadStatusPill.textContent = status.shortLabel;
    el.loadStatusPill.className = "status-pill " + status.kind;
    el.trailerText.textContent = trailer + " / " + TRAILER_CAP;
    el.uteText.textContent = ute + " / " + UTE_CAP;
    el.trailerBar.style.width = trailerPct + "%";
    el.uteBar.style.width = utePct + "%";
    el.trailerBar.className = spaces >= TRAILER_CAP ? "warn" : "";
    el.uteBar.className = status.kind === "bad" ? "bad" : ute > 0 ? "warn" : "";
    el.loadHint.textContent = status.detail;
  }

  function renderReadiness() {
    var selected = selectedStops();
    var selectedSpaces = sumSpaces(selected);
    var missingCoords = selected.filter(function (s) { return !s.coords; }).length;
    var townPins = selected.filter(function (s) { return s.coordQuality === "town"; }).length;
    var missingPhones = selected.filter(function (s) { return !s.phone; }).length;
    var routeReady = state.routeOrder.length > 0;
    var checks = [
      {
        title: "Stops selected",
        note: selected.length ? selected.length + " stop(s) ready to run" : "Choose a corridor or select stops first",
        ok: selected.length > 0
      },
      {
        title: "Load capacity",
        note: loadStatus(selectedSpaces).detail,
        ok: selected.length > 0 && loadStatus(selectedSpaces).kind !== "bad",
        warn: selected.length > 0 && loadStatus(selectedSpaces).kind === "warn"
      },
      {
        title: "Map pins",
        note: missingCoords ? missingCoords + " selected stop(s) need an address check" :
          townPins ? townPins + " selected stop(s) are using town-only pins" :
          "All selected stops have precise or cached map pins",
        ok: missingCoords === 0 && townPins === 0 && selected.length > 0,
        warn: selected.length > 0 && missingCoords === 0 && townPins > 0
      },
      {
        title: "Phone numbers",
        note: missingPhones ? missingPhones + " selected customer(s) missing a phone" : "Texts and calls are ready",
        ok: missingPhones === 0 && selected.length > 0
      },
      {
        title: "Route order",
        note: routeReady ? "Optimised order is ready" : "Tap Optimise before opening Google Maps",
        ok: routeReady,
        warn: selected.length > 0 && !routeReady
      }
    ];

    el.readinessList.innerHTML = checks.map(function (check) {
      var kind = check.ok ? "good" : check.warn ? "warn" : "";
      var symbol = check.ok ? "OK" : check.warn ? "!" : "-";
      return '<div class="check-item"><span class="check-dot ' + kind + '">' + symbol + '</span>' +
        '<div><div class="check-title">' + escapeHtml(check.title) + '</div>' +
        '<div class="check-note">' + escapeHtml(check.note) + '</div></div>' +
        '<span class="tag ' + (check.ok ? "good" : check.warn ? "warn" : "") + '">' +
        (check.ok ? "Ready" : check.warn ? "Check" : "Waiting") + '</span></div>';
    }).join("");
  }

  function renderCorridors() {
    el.corridorBoard.innerHTML = CORRIDORS.map(function (corridor) {
      var stops = activeStops().filter(function (s) { return s.corridor === corridor; });
      var selected = stops.filter(function (s) { return state.selectedIds.has(s.id); }).length;
      var towns = unique(stops.map(function (s) { return s.town; }).filter(Boolean)).slice(0, 5).join(", ");
      return '<div class="corridor-row">' +
        '<span class="tag" style="border-color:' + CORRIDOR_COLORS[corridor] + '">' + stops.length + '</span>' +
        '<div><div class="corridor-title">' + CORRIDOR_LABELS[corridor] + ' corridor - ' + sumSpaces(stops) + ' spaces</div>' +
        '<div class="corridor-note">' + (towns ? escapeHtml(towns) : "No open pickups") +
        (selected ? " - " + selected + " selected" : "") + '</div></div>' +
        '<button class="soft-btn" type="button" data-select-corridor="' + corridor + '">Select</button>' +
        '</div>';
    }).join("");
  }

  function renderRoute() {
    var stops = orderedSelectedStops();
    var spaces = sumSpaces(stops);
    var dateLabel = formatRouteDate();
    el.routeDateTitle.textContent = dateLabel;
    el.routeMetaLine.textContent = stops.length + " Stops - " + spaces + " Spaces" +
      (state.routeMetrics ? " - " + state.routeMetrics.distance + " km route" : " - not organised yet");
    el.savingsText.textContent = state.routeMetrics
      ? state.routeMetrics.minutes + " min - " + state.routeMetrics.distance + " km"
      : stops.length + " stop" + (stops.length === 1 ? "" : "s");
    el.routeSummaryStrip.innerHTML = [
      ["Stops", stops.length],
      ["Spaces", spaces],
      ["Drive", state.routeMetrics ? state.routeMetrics.distance + " km" : "Not optimised"]
    ].map(function (item) {
      return '<div><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(String(item[1])) + '</strong></div>';
    }).join("");
    el.routeList.innerHTML = stops.length ? stops.map(function (stop) {
      return stopCardHtml(stop, "route");
    }).join("") :
      '<p class="hint">Choose stops from Stops, then tap Reorganise.</p>';
    renderMap();
  }

  function renderCustomers() {
    var stops = filteredCustomerStops();
    el.customerList.innerHTML = stops.length ? stops.map(function (stop) {
      return stopCardHtml(stop, "stops");
    }).join("") :
      '<p class="hint">No pickups match those filters.</p>';
  }

  function renderTexts() {
    var stops = orderedSelectedStops();
    var day = el.pickupDayInput.value.trim() || "Thursday";
    var messages = stops.map(function (stop) {
      return { stop: stop, text: buildMessage(stop, state.messageMode, day) };
    });

    el.textList.innerHTML = messages.length ? messages.map(function (item) {
      return '<article class="text-card"><div class="stop-top"><div><div class="stop-name">' +
        escapeHtml(item.stop.name) + '</div><div class="stop-meta">' + escapeHtml(item.stop.phone || "No phone") +
        '</div></div><button class="mini-btn" data-copy-message="' + escapeAttr(item.stop.id) +
        '" type="button">Copy</button></div><p>' + escapeHtml(item.text) + '</p></article>';
    }).join("") : '<p class="hint">Select stops first, then your messages will appear here.</p>';

    el.runSheet.textContent = buildRunSheet(stops);
  }

  function renderCleanup() {
    var active = activeStops();
    var issues = [];
    var duplicateRows = state.stats.rawCount - state.stats.mergedCount;
    if (duplicateRows > 0) {
      issues.push(["Duplicate form rows", duplicateRows + " row(s) have been merged into shared pickup stops.", "good"]);
    }
    var missingPhone = active.filter(function (s) { return !s.phone; });
    if (missingPhone.length) {
      issues.push(["Missing phone", missingPhone.length + " open stop(s) need contact details.", "warn"]);
    }
    var missingCoords = active.filter(function (s) { return !s.coords; });
    if (missingCoords.length) {
      issues.push(["Missing map pin", missingCoords.length + " stop(s) need address cleanup or manual map pinning.", "warn"]);
    }
    var townPins = active.filter(function (s) { return s.coordQuality === "town"; });
    if (townPins.length) {
      issues.push(["Town-only pins", townPins.length + " stop(s) are usable for planning but should be refined before a tight run.", "warn"]);
    }
    var unknown = active.filter(function (s) { return s.corridor === "unknown"; });
    if (unknown.length) {
      issues.push(["Unknown corridor", unknown.length + " stop(s) need town or area cleanup.", "warn"]);
    }
    if (state.stats.draftCount) {
      issues.push(["Local stops", state.stats.draftCount + " one-off stop(s) live only on this device.", "warn"]);
    }
    if (!issues.length) {
      issues.push(["Looks tidy", "No obvious admin blockers in the open pickup list.", "good"]);
    }

    el.cleanupList.innerHTML = issues.map(function (issue) {
      return '<div class="cleanup-item"><span class="check-dot ' + issue[2] + '">' +
        (issue[2] === "good" ? "OK" : "!") + '</span><div><div class="cleanup-title">' +
        escapeHtml(issue[0]) + '</div><div class="cleanup-note">' + escapeHtml(issue[1]) +
        '</div></div><span class="tag ' + issue[2] + '">' + (issue[2] === "good" ? "Fine" : "Fix") +
        '</span></div>';
    }).join("");
  }

  function renderMap() {
    if (!state.mapReady || !state.map) return;

    state.markers.forEach(function (marker) { state.map.removeLayer(marker); });
    state.markers.clear();
    if (state.routeLayer) {
      state.map.removeLayer(state.routeLayer);
      state.routeLayer = null;
    }

    var bounds = [[START.lat, START.lng], [DROPOFF.lat, DROPOFF.lng]];

    // Group stops that share an identical coord (e.g. multiple town-fallback
    // pins from the same town) so we can jitter them apart and every stop
    // is visible on the map.
    // Only show pins for stops the user has selected. Keeps the map clean
    // and matches Woody's "lock the route, then go" workflow.
    var stops = visibleMapStops().filter(function (s) {
      return s.coords && state.selectedIds.has(s.id);
    });
    var coordGroups = {};
    stops.forEach(function (stop) {
      var key = stop.coords.lat.toFixed(4) + "," + stop.coords.lng.toFixed(4);
      (coordGroups[key] = coordGroups[key] || []).push(stop);
    });

    stops.forEach(function (stop) {
      var key = stop.coords.lat.toFixed(4) + "," + stop.coords.lng.toFixed(4);
      var group = coordGroups[key];
      var lat = stop.coords.lat;
      var lng = stop.coords.lng;
      if (group.length > 1) {
        var i = group.indexOf(stop);
        var angle = (2 * Math.PI * i) / group.length;
        lat += Math.cos(angle) * 0.0006;
        lng += Math.sin(angle) * 0.0008;
      }
      var isCurrent = state.tripCurrentId === stop.id;
      var label = stop.routeOrder ? String(stop.routeOrder) : "";
      var marker = L.marker([lat, lng], {
        icon: makePin(CORRIDOR_COLORS[stop.corridor] || "#a685ff", label, isCurrent),
        zIndexOffset: isCurrent ? 800 : 500
      }).addTo(state.map);
      var precision = stop.coordQuality === "town"
        ? '<br><em>Approximate (town centre) - check the address before driving</em>'
        : '';
      marker.bindPopup("<strong>" + escapeHtml(stop.name) + "</strong><br>" +
        escapeHtml(stop.street + ", " + stop.town) + "<br>" +
        escapeHtml(stop.appliances.join(", ")) + "<br>" +
        "<strong>" + stop.spaces + " space(s)</strong>" + precision);
      marker.on("click", function () { toggleSelected(stop.id, true); });
      state.markers.set(stop.id, marker);
      bounds.push([lat, lng]);
    });

    if (state.routeMetrics && state.routeMetrics.geometry) {
      state.routeLayer = L.polyline(state.routeMetrics.geometry, {
        color: "#35c96f",
        weight: 5,
        opacity: 0.85
      }).addTo(state.map);
    }

    if (bounds.length > 2) {
      state.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 13 });
    }
  }

  function stopCardHtml(stop, mode) {
    mode = mode || "stops";
    var selected = state.selectedIds.has(stop.id);
    var isPriority = state.priorityIds.has(stop.id);
    var order = stop.routeOrder ? '<span class="order-badge">' + stop.routeOrder + '</span>' : "";
    var priorityBadge = isPriority ? '<span class="priority-badge" title="Priority - drives first">!</span>' : '';
    var phone = stop.phone ? '<a href="tel:' + escapeAttr(stop.phone) + '">' + escapeHtml(stop.phone) + '</a>' : "No phone";
    var maps = "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(fullAddress(stop));
    var includeControl = mode === "route" ? "" :
      '<label class="tag ' + (selected ? "good" : "") + '"><input type="checkbox" data-action="toggle" data-id="' +
      escapeAttr(stop.id) + '"' + (selected ? " checked" : "") + '> Include</label>';
    var stopActions = '<button class="mini-btn primary" type="button" data-action="navigate" data-id="' +
      escapeAttr(stop.id) + '">Navigate</button>';
    if (mode === "route") {
      // Manual ordering on the Route view
      stopActions += '<button class="mini-btn" type="button" data-action="up" data-id="' + escapeAttr(stop.id) + '" title="Move up">&uarr;</button>' +
        '<button class="mini-btn" type="button" data-action="down" data-id="' + escapeAttr(stop.id) + '" title="Move down">&darr;</button>' +
        '<button class="mini-btn ' + (isPriority ? "primary" : "") + '" type="button" data-action="priority" data-id="' + escapeAttr(stop.id) + '" title="Toggle priority">' +
        (isPriority ? "Priority on" : "Priority") + '</button>';
    } else {
      stopActions += '<button class="mini-btn" type="button" data-action="focus" data-id="' + escapeAttr(stop.id) + '">Show</button>' +
        '<button class="mini-btn" type="button" data-action="select-only" data-id="' + escapeAttr(stop.id) + '">Only this</button>' +
        '<button class="mini-btn ' + (isPriority ? "primary" : "") + '" type="button" data-action="priority" data-id="' + escapeAttr(stop.id) + '">' +
        (isPriority ? "Priority on" : "Priority") + '</button>';
    }
    stopActions += '<button class="mini-btn danger" type="button" data-action="collect" data-id="' + escapeAttr(stop.id) + '">' +
      (state.pendingCollectIds.has(stop.id) ? "Tap again" : "Collected") + '</button>';
    return '<article class="stop-card ' + (mode === "route" ? "route-stop " : "") + stop.corridor + (selected ? " selected" : "") + (isPriority ? " priority" : "") + '">' +
      '<div class="stop-top"><div><div class="stop-name">' + order + priorityBadge + escapeHtml(stop.name) +
      (stop.isDraft ? ' <span class="tag warn">Local</span>' : "") + '</div>' +
      '<div class="stop-meta"><a href="' + maps + '" target="_blank" rel="noopener">' +
      escapeHtml([stop.street, stop.town].filter(Boolean).join(", ")) + '</a></div>' +
      '<div class="stop-meta">' + phone + ' - ' + CORRIDOR_LABELS[stop.corridor] + ' - ' +
      stop.spaces + ' space(s)' + coordBadge(stop) + '</div></div>' +
      includeControl + '</div>' +
      '<div class="stop-items">' + escapeHtml(stop.appliances.join(", ") || "Item not listed") + '</div>' +
      (stop.notes.length ? '<div class="stop-meta">' + escapeHtml(stop.notes.join(" | ")) + '</div>' : "") +
      '<div class="stop-actions">' + stopActions + '</div></article>';
  }

  function coordBadge(stop) {
    if (!stop.coords) return ' - <span class="tag bad">No pin</span>';
    if (stop.coordQuality === "town") return ' - <span class="tag warn">Town pin</span>';
    return "";
  }

  function handleStopAction(event) {
    var checkbox = event.target.closest('input[data-action="toggle"]');
    if (checkbox) {
      toggleSelected(checkbox.dataset.id, checkbox.checked);
      return;
    }
    var button = event.target.closest("[data-action]");
    if (!button) return;
    var action = button.dataset.action;
    var id = button.dataset.id;
    if (action === "priority") togglePriority(id);
    if (action === "up") moveStopBy(id, -1);
    if (action === "down") moveStopBy(id, 1);
    if (action === "navigate") openSingleStopInMaps(id);
    if (action === "focus") focusStop(id);
    if (action === "select-only") selectOnly(id);
    if (action === "collect") markCollected(id);
  }

  function openSingleStopInMaps(id) {
    var stop = findStop(id);
    if (!stop) return;
    // Prefer precise coords; fall back to the address text so Google can
    // search for it. Either way, Google Maps opens turn-by-turn navigation.
    var dest;
    if (stop.coords && Number.isFinite(stop.coords.lat) && Number.isFinite(stop.coords.lng)) {
      dest = stop.coords.lat + "," + stop.coords.lng;
    } else {
      dest = encodeURIComponent(fullAddress(stop));
    }
    var url = "https://www.google.com/maps/dir/?api=1&destination=" + dest +
              "&travelmode=driving";
    window.open(url, "_blank", "noopener");
    toast("Opening " + stop.name + " in Google Maps");
  }

  function toggleSelected(id, checked) {
    if (checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    state.routeOrder = [];
    state.routeMetrics = null;
    saveSelectedState();
    renderAll();
  }

  function selectOnly(id) {
    state.selectedIds.clear();
    state.selectedIds.add(id);
    state.routeOrder = [];
    state.routeMetrics = null;
    saveSelectedState();
    setView("route");
    renderAll();
  }

  function focusStop(id) {
    var stop = findStop(id);
    if (!stop || !stop.coords) {
      toast("That stop needs a map pin first");
      return;
    }
    setView("route");
    if (state.mapReady) {
      setTimeout(function () {
        state.map.setView([stop.coords.lat, stop.coords.lng], 15);
        var marker = state.markers.get(stop.id);
        if (marker) marker.openPopup();
      }, 80);
    }
  }

  function selectVisibleStops() {
    visibleWorkStops().forEach(function (stop) { state.selectedIds.add(stop.id); });
    state.routeOrder = [];
    state.routeMetrics = null;
    saveSelectedState();
    renderAll();
    toast("Visible stops selected");
  }

  function deselectVisibleStops() {
    visibleWorkStops().forEach(function (stop) { state.selectedIds.delete(stop.id); });
    state.routeOrder = [];
    state.routeMetrics = null;
    saveSelectedState();
    renderAll();
    toast("Visible stops removed from the run");
  }

  function selectOneTrailerLoad() {
    state.selectedIds.clear();
    var spaces = 0;
    visibleWorkStops().forEach(function (stop) {
      if (spaces + stop.spaces <= TRAILER_CAP) {
        state.selectedIds.add(stop.id);
        spaces += stop.spaces;
      }
    });
    state.routeOrder = [];
    state.routeMetrics = null;
    saveSelectedState();
    renderAll();
    toast("One trailer load selected");
  }

  function selectCorridor(corridor) {
    state.currentCorridor = corridor;
    updateSegmented(el.corridorControls, "corridor", corridor);
    activeStops().filter(function (stop) { return stop.corridor === corridor; })
      .forEach(function (stop) { state.selectedIds.add(stop.id); });
    saveSelectedState();
    renderAll();
    toast(CORRIDOR_LABELS[corridor] + " selected");
  }

  function clearRoute() {
    state.selectedIds.clear();
    state.routeOrder = [];
    state.routeMetrics = null;
    saveSelectedState();
    renderAll();
    toast("Route cleared");
  }

  async function optimizeRoute() {
    var stops = selectedStops().filter(function (stop) { return stop.coords; });
    if (!stops.length) {
      toast("Select stops with map pins first");
      return;
    }
    if (state.sourceMode === "live") {
      var ok = window.confirm(
        "This will send the selected pickup coordinates to the public OSRM routing service to calculate the shortest run. " +
        "Customer names and phone numbers are not sent, but the route locations are. Continue?"
      );
      if (!ok) return;
    }
    setBusy(true, "Optimising route...");
    try {
      var coordString = [DROPOFF].slice(0, 0);
      coordString = [START].concat(stops).concat([DROPOFF]).map(function (point) {
        var coords = point.coords || point;
        return coords.lng + "," + coords.lat;
      }).join(";");
      var url = "https://router.project-osrm.org/trip/v1/driving/" + coordString +
        "?source=first&destination=last&roundtrip=false&geometries=geojson&overview=full";
      var response = await fetch(url);
      var data = await response.json();
      if (!response.ok || data.code !== "Ok") {
        throw new Error(data.message || data.code || "OSRM route failed");
      }
      var waypoints = data.waypoints || [];
      var ordered = stops.map(function (stop, index) {
        return { stop: stop, order: waypoints[index + 1] ? waypoints[index + 1].waypoint_index : index + 1 };
      }).sort(function (a, b) { return a.order - b.order; });

      state.routeOrder = ordered.map(function (item) { return item.stop.id; });
      state.stops.forEach(function (stop) {
        var routeIndex = state.routeOrder.indexOf(stop.id);
        stop.routeOrder = routeIndex >= 0 ? routeIndex + 1 : null;
      });
      var trip = data.trips[0];
      state.routeMetrics = {
        distance: (trip.distance / 1000).toFixed(1),
        minutes: Math.round(trip.duration / 60),
        geometry: trip.geometry.coordinates.map(function (pair) { return [pair[1], pair[0]]; })
      };
      renderAll();
      setView("route");
      toast("Route optimised");
    } catch (err) {
      toast("Route optimisation failed");
      setSyncLine("Route optimisation failed: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  function openMapsModal() {
    var stops = orderedSelectedStops().filter(function (stop) { return stop.coords; });
    if (!stops.length) {
      toast("Select stops with map pins first");
      return;
    }
    var links = buildGoogleMapsLinks(stops);
    el.mapsLinks.innerHTML = links.map(function (link) {
      return '<a href="' + link.url + '" target="_blank" rel="noopener"><span>' +
        escapeHtml(link.label) + '</span><span>' + escapeHtml(link.count) + ' stops</span></a>';
    }).join("");
    el.mapsModal.hidden = false;
  }

  function closeMapsModal() {
    el.mapsModal.hidden = true;
  }

  // ---------- TRIP MODE: step-by-step pickup flow ----------

  function startTrip() {
    var stops = orderedSelectedStops().filter(function (s) { return s.coords; });
    if (!stops.length) {
      toast("Pick stops first, then tap Reorganise");
      return;
    }
    if (!state.routeOrder.length) {
      var ok = window.confirm(
        "Route hasn't been organised yet. Run Reorganise first to put the stops in driving order?"
      );
      if (!ok) return;
      optimizeRoute().then(function () { setTimeout(startTrip, 200); });
      return;
    }
    state.tripMode = true;
    state.tripCurrentId = nextTripStopId();
    renderTripBanner();
    renderMap();
    setView("route");
    toast("Trip started - " + stops.length + " stops to do");
  }

  function nextTripStopId() {
    var ordered = orderedSelectedStops();
    for (var i = 0; i < ordered.length; i++) {
      if (!state.collectedIds.has(ordered[i].submissionIds[0] || ordered[i].id)) {
        return ordered[i].id;
      }
    }
    return null; // all done
  }

  function tripCurrentStop() {
    if (!state.tripCurrentId) return null;
    return state.stops.find(function (s) { return s.id === state.tripCurrentId; }) || null;
  }

  function tripPosition() {
    var ordered = orderedSelectedStops();
    var current = tripCurrentStop();
    if (!current) return { index: ordered.length, total: ordered.length };
    var idx = ordered.findIndex(function (s) { return s.id === current.id; });
    return { index: idx + 1, total: ordered.length };
  }

  function tripNavigateCurrent() {
    var stop = tripCurrentStop();
    if (!stop) {
      // All done — open dropoff
      var url = "https://www.google.com/maps/dir/?api=1&destination=" +
                DROPOFF.lat + "," + DROPOFF.lng + "&travelmode=driving";
      window.open(url, "_blank", "noopener");
      toast("Opening drop-off in Google Maps");
      return;
    }
    var dest = stop.coords
      ? stop.coords.lat + "," + stop.coords.lng
      : encodeURIComponent(fullAddress(stop));
    window.open(
      "https://www.google.com/maps/dir/?api=1&destination=" + dest + "&travelmode=driving",
      "_blank", "noopener"
    );
    toast("Opening " + stop.name + " in Google Maps");
  }

  function tripDoneAndNext() {
    var stop = tripCurrentStop();
    if (!stop) {
      exitTrip();
      return;
    }
    var ids = stop.submissionIds.length ? stop.submissionIds : [stop.id];
    ids.forEach(function (id) { state.collectedIds.add(id); });
    if (stop.isDraft) removeDraftByStop(stop);
    state.routeOrder = state.routeOrder.filter(function (id) { return id !== stop.id; });
    state.selectedIds.delete(stop.id);
    saveCollectedState();
    saveSelectedState();
    fetch("/api/mark-collected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_ids: ids, submission_id: ids[0], name: stop.name })
    }).catch(function () { /* offline ok */ });
    state.tripCurrentId = nextTripStopId();
    renderAll();
    if (state.tripCurrentId) {
      var nx = tripCurrentStop();
      toast("Done. Next: " + nx.name);
    } else {
      toast("All pickups done. Drive to drop-off.");
    }
  }

  function exitTrip() {
    state.tripMode = false;
    state.tripCurrentId = null;
    var banner = document.getElementById("tripBanner");
    if (banner) banner.remove();
    renderAll();
    toast("Trip ended");
  }

  function renderTripBanner() {
    var panel = document.querySelector("#routeView .route-list-panel");
    if (!panel) return;
    var existing = document.getElementById("tripBanner");
    var routeView = document.getElementById("routeView");
    if (routeView) routeView.classList.toggle("in-trip-mode", !!state.tripMode);
    if (!state.tripMode) {
      if (existing) existing.remove();
      return;
    }
    var stop = tripCurrentStop();
    var pos = tripPosition();
    var inner;
    if (stop) {
      inner = '<div class="trip-banner-head">' +
        '<span class="trip-banner-eyebrow">Stop ' + pos.index + ' of ' + pos.total + '</span>' +
        '<button class="trip-banner-exit" type="button" data-action="trip-exit">Exit trip</button>' +
        '</div>' +
        '<div class="trip-banner-name">' + escapeHtml(stop.name) + '</div>' +
        '<div class="trip-banner-addr">' + escapeHtml([stop.street, stop.town].filter(Boolean).join(", ")) + '</div>' +
        '<div class="trip-banner-items">' + escapeHtml(stop.appliances.join(", ") || "Item not listed") +
        ' - ' + stop.spaces + ' space(s)' + (stop.phone ? ' - <a href="tel:' + escapeAttr(stop.phone) + '">' + escapeHtml(stop.phone) + '</a>' : '') + '</div>' +
        '<div class="trip-banner-actions">' +
        '<button class="primary-btn" type="button" data-action="trip-nav">Open in Google Maps</button>' +
        '<button class="soft-btn" type="button" data-action="trip-done">Collected, next stop</button>' +
        '</div>';
    } else {
      inner = '<div class="trip-banner-head">' +
        '<span class="trip-banner-eyebrow">All pickups done</span>' +
        '<button class="trip-banner-exit" type="button" data-action="trip-exit">Exit trip</button>' +
        '</div>' +
        '<div class="trip-banner-name">Drive to drop-off</div>' +
        '<div class="trip-banner-addr">' + escapeHtml(DROPOFF.label) + '</div>' +
        '<div class="trip-banner-actions">' +
        '<button class="primary-btn" type="button" data-action="trip-nav">Open drop-off in Google Maps</button>' +
        '<button class="soft-btn" type="button" data-action="trip-exit">End trip</button>' +
        '</div>';
    }
    if (existing) {
      existing.innerHTML = inner;
    } else {
      var div = document.createElement("div");
      div.id = "tripBanner";
      div.className = "trip-banner";
      div.innerHTML = inner;
      panel.insertBefore(div, panel.firstChild);
      div.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-action]");
        if (!btn) return;
        var a = btn.dataset.action;
        if (a === "trip-nav") tripNavigateCurrent();
        else if (a === "trip-done") tripDoneAndNext();
        else if (a === "trip-exit") exitTrip();
      });
    }
  }

  function buildGoogleMapsLinks(stops) {
    var links = [];
    for (var i = 0; i < stops.length; i += MAX_GOOGLE_STOPS) {
      var chunk = stops.slice(i, i + MAX_GOOGLE_STOPS);
      var isFirst = i === 0;
      var isLast = i + MAX_GOOGLE_STOPS >= stops.length;
      var points = [];
      points.push(isFirst ? START : stops[i - 1].coords);
      chunk.forEach(function (stop) { points.push(stop.coords); });
      points.push(isLast ? DROPOFF : chunk[chunk.length - 1].coords);
      links.push({
        label: stops.length <= MAX_GOOGLE_STOPS ? "Full route" : "Route part " + (links.length + 1),
        count: chunk.length,
        url: "https://www.google.com/maps/dir/" + points.map(function (point) {
          return point.lat + "," + point.lng;
        }).join("/")
      });
    }
    return links;
  }

  function fitMapToStops() {
    if (!state.mapReady || !state.map) return;
    renderMap();
    setTimeout(function () { state.map.invalidateSize(); }, 80);
  }

  function toggleBigMap() {
    state.mapExpanded = !state.mapExpanded;
    var routeView = document.getElementById("routeView");
    routeView.classList.toggle("map-expanded", state.mapExpanded);
    el.fitMapBtn.textContent = state.mapExpanded ? "Show list" : "Big map";
    if (state.mapReady && state.map) {
      setTimeout(function () {
        state.map.invalidateSize();
        renderMap();
      }, 120);
    }
  }

  async function markCollected(id) {
    var stop = findStop(id);
    if (!stop) return;
    if (!state.pendingCollectIds.has(id)) {
      state.pendingCollectIds.add(id);
      renderAll();
      toast("Tap Collected again to confirm");
      setTimeout(function () {
        state.pendingCollectIds.delete(id);
        renderAll();
      }, 3500);
      return;
    }

    state.pendingCollectIds.delete(id);
    var ids = stop.submissionIds.length ? stop.submissionIds : [stop.id];
    ids.forEach(function (submissionId) { state.collectedIds.add(submissionId); });
    if (stop.isDraft) removeDraftByStop(stop);
    state.selectedIds.delete(stop.id);
    state.routeOrder = state.routeOrder.filter(function (routeId) { return routeId !== stop.id; });
    saveCollectedState();
    saveSelectedState();
    renderAll();
    toast(stop.name + " marked collected");

    try {
      await fetch("/api/mark-collected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_ids: ids, submission_id: ids[0], name: stop.name })
      });
    } catch (err) {
      // The scheduled sync can still pick up localStorage state in the app.
    }
  }

  function addDraftStop(event, formEl, closeAfter) {
    event.preventDefault();
    var form = new FormData(formEl || el.draftForm);
    var now = Date.now();
    var name = clean(form.get("name"));
    var parts = name.split(/\s+/);
    addDraftObject({
      isDraft: true,
      date: "Local",
      first_name: parts.shift() || name,
      last_name: parts.join(" "),
      phone: clean(form.get("phone")),
      email: "",
      street: clean(form.get("street")),
      town: clean(form.get("town")),
      area: "",
      rural: "",
      appliances: normalizeItems(clean(form.get("items")).split(",")),
      additional_info: clean(form.get("notes")),
      total: "",
      submission_id: "draft-" + now,
      status: "LOCAL"
    });
    (formEl || el.draftForm).reset();
    if (closeAfter) closeAddStopModal();
  }

  function addDraftObject(draft) {
    var drafts = loadDraftStops();
    drafts.push(draft);
    localStorage.setItem("nakiDraftStops", JSON.stringify(drafts));
    rebuildStops();
    applyFastCoordinates();
    renderAll();
    toast("Local stop added");
  }

  function openAddStopModal() {
    el.addStopModal.hidden = false;
    setTimeout(function () { el.quickAddressInput.focus(); }, 50);
  }

  function closeAddStopModal() {
    el.addStopModal.hidden = true;
  }

  function addQuickAddress() {
    var value = clean(el.quickAddressInput.value);
    if (!value) {
      toast("Add an address first");
      return;
    }
    var now = Date.now();
    var coordMatch = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    var draft = {
      isDraft: true,
      date: "Local",
      first_name: "Local",
      last_name: "Stop",
      phone: "",
      email: "",
      street: value,
      town: "Taranaki",
      area: "",
      rural: "",
      appliances: ["Pickup"],
      additional_info: "Quick-added from route screen",
      total: "",
      submission_id: "draft-" + now,
      status: "LOCAL"
    };
    if (coordMatch) {
      draft.street = "Pinned location";
      draft.town = "Lat/Lng";
      draft.lat = Number(coordMatch[1]);
      draft.lng = Number(coordMatch[2]);
    } else {
      var parts = value.split(",").map(clean).filter(Boolean);
      draft.street = parts[0] || value;
      draft.town = parts[1] || "Taranaki";
    }
    addDraftObject(draft);
    el.quickAddressInput.value = "";
    closeAddStopModal();
  }

  function addBulkStops() {
    var lines = clean(el.bulkStopsInput.value).split(/\r?\n/).map(clean).filter(Boolean);
    if (!lines.length) {
      toast("Paste at least one stop");
      return;
    }
    lines.forEach(function (line, index) {
      var parts = parseCsvLine(line);
      var now = Date.now() + index;
      var name = parts[0] || "Local Stop";
      var nameParts = name.split(/\s+/);
      addDraftObject({
        isDraft: true,
        date: "Local",
        first_name: nameParts.shift() || name,
        last_name: nameParts.join(" "),
        phone: parts[1] || "",
        email: "",
        street: parts[2] || parts[0] || "",
        town: parts[3] || "Taranaki",
        area: "",
        rural: "",
        appliances: normalizeItems([(parts[4] || "Pickup")]),
        additional_info: parts.slice(5).join(", "),
        total: "",
        submission_id: "draft-" + now,
        status: "LOCAL"
      });
    });
    el.bulkStopsInput.value = "";
    closeAddStopModal();
    toast(lines.length + " stop(s) added");
  }

  async function importCsvStops(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var text = await file.text();
    el.bulkStopsInput.value = text.split(/\r?\n/).filter(Boolean).slice(0, 100).join("\n");
    el.bulkPasteBox.hidden = false;
    toast("CSV loaded. Check it, then add pasted stops.");
    event.target.value = "";
  }

  function clearDraftStops() {
    if (!loadDraftStops().length) {
      toast("No local stops to clear");
      return;
    }
    localStorage.removeItem("nakiDraftStops");
    rebuildStops();
    applyFastCoordinates();
    renderAll();
    toast("Local stops cleared");
  }

  function removeDraftByStop(stop) {
    var drafts = loadDraftStops().filter(function (draft) {
      return draft.submission_id !== stop.submissionIds[0];
    });
    localStorage.setItem("nakiDraftStops", JSON.stringify(drafts));
  }

  function loadDraftStops() {
    try {
      return JSON.parse(localStorage.getItem("nakiDraftStops") || "[]");
    } catch (err) {
      return [];
    }
  }

  function exportCsv() {
    var rows = filteredCustomerStops();
    if (!rows.length) {
      toast("Nothing to export");
      return;
    }
    var header = ["Name", "Phone", "Street", "Town", "Corridor", "Spaces", "Items", "Notes"];
    var csv = [header].concat(rows.map(function (stop) {
      return [
        stop.name,
        stop.phone,
        stop.street,
        stop.town,
        CORRIDOR_LABELS[stop.corridor],
        stop.spaces,
        stop.appliances.join("; "),
        stop.notes.join("; ")
      ];
    })).map(function (row) {
      return row.map(csvCell).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "naki-wreck-pickups.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyAllTexts() {
    var texts = orderedSelectedStops().map(function (stop) {
      return stop.name + " - " + (stop.phone || "No phone") + "\n" +
        buildMessage(stop, state.messageMode, el.pickupDayInput.value.trim() || "Thursday");
    });
    if (!texts.length) {
      toast("No selected texts to copy");
      return;
    }
    copyToClipboard(texts.join("\n\n"));
  }

  async function sendAllSms() {
    var stops = orderedSelectedStops().filter(function (s) { return s.phone; });
    if (!stops.length) {
      toast("No selected stops with phone numbers");
      return;
    }
    var day = el.pickupDayInput.value.trim() || "Thursday";
    var modeLabels = { reminder: "Reminder", onway: "On my way", review: "Review", problem: "Issue" };
    var ok = window.confirm(
      "Send the " + (modeLabels[state.messageMode] || state.messageMode).toLowerCase() +
      " text to " + stops.length + " customer(s) via ClickSend SMS?\n\n" +
      "Each text costs about 5 cents. Total: ~$" + (stops.length * 0.05).toFixed(2) + " NZD."
    );
    if (!ok) return;

    el.sendAllSmsBtn.disabled = true;
    el.sendAllSmsBtn.textContent = "Sending...";
    try {
      var messages = stops.map(function (stop) {
        return { to: stop.phone, body: buildMessage(stop, state.messageMode, day) };
      });
      var response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages }),
      });
      var data = await response.json();
      if (data.status === "skipped") {
        toast("ClickSend not configured - paste your API key into the laptop's APP env");
      } else if (data.status === "ok") {
        toast("Sent " + data.sent + " of " + data.requested + " texts");
      } else {
        toast("SMS error: " + (data.error || data.status || "unknown"));
      }
    } catch (err) {
      toast("SMS request failed: " + err.message);
    } finally {
      el.sendAllSmsBtn.disabled = false;
      el.sendAllSmsBtn.textContent = "Send all by SMS";
    }
  }

  function buildMessage(stop, mode, day) {
    var first = stop.firstName || "there";
    var items = stop.appliances.join(", ") || "whiteware";
    var windowText = el.pickupWindowInput.value.trim() || "during the day";
    var note = el.driverNoteInput.value.trim();
    if (mode === "onway") {
      return "Hey " + first + ", I am heading your way now for the " + items +
        " pickup. I should be there soon. Cheers, Woody - Naki Wreck Removal";
    }
    if (mode === "review") {
      return "Hey " + first + ", thanks for booking Naki Wreck Removal for the " + items +
        " pickup. If you have a minute, a quick Google review would really help the business. Cheers, Woody";
    }
    if (mode === "problem") {
      return "Hey " + first + ", I am sorting today's pickup run and need to check something for " +
        stop.street + ". Can you please reply when you get a chance? Cheers, Woody - Naki Wreck Removal";
    }
    return "Hey " + first + ", just confirming your Naki Wreck pickup for " + day + " " +
      windowText + " for " + items + ". Please leave it somewhere easy to access. " +
      note + ". Cheers, Woody";
  }

  function buildRunSheet(stops) {
    if (!stops.length) return "No selected stops yet.";
    var lines = [];
    var day = el.pickupDayInput.value.trim() || "Pickup day";
    lines.push("NAKI WRECK RUN SHEET - " + day.toUpperCase());
    lines.push("Start: " + START.label);
    lines.push("Drop-off: " + DROPOFF.label);
    lines.push("Stops: " + stops.length + " | Spaces: " + sumSpaces(stops) + " | " + loadStatus(sumSpaces(stops)).shortLabel);
    if (state.routeMetrics) {
      lines.push("Drive: " + state.routeMetrics.distance + " km | about " + state.routeMetrics.minutes + " min");
    }
    lines.push("");
    stops.forEach(function (stop, index) {
      lines.push((index + 1) + ". " + stop.name + " - " + stop.spaces + " space(s)");
      lines.push("   " + [stop.street, stop.town].filter(Boolean).join(", "));
      lines.push("   Phone: " + (stop.phone || "Missing"));
      lines.push("   Items: " + (stop.appliances.join(", ") || "Item not listed"));
      if (stop.notes.length) lines.push("   Notes: " + stop.notes.join(" | "));
      lines.push("");
    });
    return lines.join("\n");
  }

  function formatRouteDate() {
    // The sheet's date column is the form submission date, NOT the pickup day.
    // Don't put a misleading date in the header. The pickup day lives in the
    // Texts tab input and is used for outgoing customer messages.
    var pickupDay = (el.pickupDayInput && el.pickupDayInput.value || "").trim();
    var today = new Date().toLocaleDateString([], { weekday: "long", day: "2-digit", month: "short" });
    if (pickupDay && pickupDay.toLowerCase() !== "today") {
      return pickupDay + " run";
    }
    return today;
  }

  function setView(viewName) {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === viewName);
    });
    document.querySelectorAll(".view").forEach(function (view) {
      view.classList.toggle("active", view.id === viewName + "View");
    });
    document.body.classList.toggle("in-route-view", viewName === "route");
    if (viewName === "route" && state.mapReady) {
      setTimeout(function () { state.map.invalidateSize(); fitMapToStops(); }, 100);
    }
  }

  function updateSegmented(container, dataKey, value) {
    container.querySelectorAll("button").forEach(function (button) {
      button.classList.toggle("active", button.dataset[dataKey] === value);
    });
  }

  function activeStops() {
    return state.stops.filter(function (stop) {
      if (stop.isDraft) return !state.collectedIds.has(stop.submissionIds[0]);
      return !stop.submissionIds.length || !stop.submissionIds.every(function (id) {
        return state.collectedIds.has(id);
      });
    });
  }

  function visibleWorkStops() {
    var stops = activeStops();
    if (state.currentCorridor !== "all") {
      stops = stops.filter(function (stop) { return stop.corridor === state.currentCorridor; });
    }
    return stops;
  }

  function visibleMapStops() {
    return visibleWorkStops();
  }

  function selectedStops() {
    return activeStops().filter(function (stop) { return state.selectedIds.has(stop.id); });
  }

  function orderedSelectedStops() {
    var selected = selectedStops();
    var byId = new Map(selected.map(function (stop) { return [stop.id, stop]; }));
    // 1) Manual order takes precedence (Woody dragged stops up/down).
    if (state.manualOrder.length) {
      var ordered = state.manualOrder
        .map(function (id) { return byId.get(id); })
        .filter(Boolean);
      selected.forEach(function (stop) {
        if (state.manualOrder.indexOf(stop.id) === -1) ordered.push(stop);
      });
      return promoteToFront(ordered, state.priorityIds);
    }
    // 2) Otherwise OSRM optimised order.
    if (state.routeOrder.length) {
      var ordered2 = state.routeOrder.map(function (id) { return byId.get(id); }).filter(Boolean);
      selected.forEach(function (stop) {
        if (state.routeOrder.indexOf(stop.id) === -1) ordered2.push(stop);
      });
      return promoteToFront(ordered2, state.priorityIds);
    }
    // 3) Fallback: corridor sort.
    return promoteToFront(selected.slice().sort(sortStopsForWork), state.priorityIds);
  }

  function promoteToFront(list, prioritySet) {
    if (!prioritySet || !prioritySet.size) return list;
    var pri = list.filter(function (s) { return prioritySet.has(s.id); });
    var rest = list.filter(function (s) { return !prioritySet.has(s.id); });
    return pri.concat(rest);
  }

  // ---------- PRIORITY + MANUAL ORDER ----------

  function togglePriority(id) {
    if (state.priorityIds.has(id)) {
      state.priorityIds.delete(id);
      toast("Priority off");
    } else {
      state.priorityIds.add(id);
      toast("Priority on - this stop will drive first");
    }
    savePriorityState();
    // Re-assign route order numbers from current orderedSelectedStops
    refreshRouteOrderFromOrdered();
    renderAll();
  }

  function moveStopBy(id, delta) {
    var ordered = orderedSelectedStops();
    var idx = ordered.findIndex(function (s) { return s.id === id; });
    if (idx === -1) return;
    var newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= ordered.length) {
      toast(delta < 0 ? "Already first" : "Already last");
      return;
    }
    // Capture current order, apply swap, save as manual order.
    var ids = ordered.map(function (s) { return s.id; });
    var tmp = ids[newIdx];
    ids[newIdx] = ids[idx];
    ids[idx] = tmp;
    state.manualOrder = ids;
    saveManualOrder();
    // Manual order overrides OSRM order, so clear it so re-Reorganise feels fresh.
    state.routeOrder = [];
    state.routeMetrics = null;
    refreshRouteOrderFromOrdered();
    renderAll();
  }

  function refreshRouteOrderFromOrdered() {
    var ordered = orderedSelectedStops();
    var orderedIds = ordered.map(function (s) { return s.id; });
    state.stops.forEach(function (stop) {
      var idx = orderedIds.indexOf(stop.id);
      stop.routeOrder = idx >= 0 ? idx + 1 : null;
    });
  }

  function filteredCustomerStops() {
    var search = normalizeText(el.searchInput.value || "");
    return activeStops().filter(function (stop) {
      if (el.onlySelectedToggle.checked && !state.selectedIds.has(stop.id)) return false;
      if (el.missingCoordsToggle.checked && stop.coords) return false;
      if (el.missingPhoneToggle.checked && stop.phone) return false;
      if (!search) return true;
      return normalizeText([
        stop.name, stop.phone, stop.street, stop.town, stop.appliances.join(" ")
      ].join(" ")).indexOf(search) !== -1;
    });
  }

  function findStop(id) {
    return state.stops.find(function (stop) { return stop.id === id; });
  }

  function clearRouteOrdersIfInvalid() {
    var selectedIds = new Set(selectedStops().map(function (stop) { return stop.id; }));
    state.routeOrder = state.routeOrder.filter(function (id) { return selectedIds.has(id); });
    state.stops.forEach(function (stop) {
      var idx = state.routeOrder.indexOf(stop.id);
      stop.routeOrder = idx >= 0 ? idx + 1 : null;
    });
    if (!state.routeOrder.length) state.routeMetrics = null;
  }

  function classifyCorridor(town, area) {
    var inputs = [town, area].map(normalizeText).filter(Boolean);
    for (var i = 0; i < inputs.length; i += 1) {
      var value = inputs[i];
      if (TOWN_CORRIDORS[value]) return TOWN_CORRIDORS[value];
      var keys = Object.keys(TOWN_CORRIDORS);
      for (var k = 0; k < keys.length; k += 1) {
        if (value.indexOf(keys[k]) !== -1 || keys[k].indexOf(value) !== -1) {
          return TOWN_CORRIDORS[keys[k]];
        }
      }
    }
    return "unknown";
  }

  function sortStopsForWork(a, b) {
    var corridorDiff = CORRIDORS.indexOf(a.corridor) - CORRIDORS.indexOf(b.corridor);
    if (corridorDiff) return corridorDiff;
    return [a.town, a.street, a.name].join(" ").localeCompare([b.town, b.street, b.name].join(" "));
  }

  function countSpaces(items) {
    var total = items.reduce(function (sum, item) {
      var lower = normalizeText(item);
      // Free-fit items (TVs, microwaves, gas bottles) wedge in between
      // bigger items, so they don't take a "space" on the trailer.
      var isFree = FREE_ITEMS.some(function (free) { return lower.indexOf(free) !== -1; });
      if (isFree) return sum;
      var isLarge = LARGE_ITEMS.some(function (large) { return lower.indexOf(large) !== -1; });
      return sum + (isLarge ? 2 : 1);
    }, 0);
    // Even all-free pickups take at least 1 stop, but never less than 0 spaces.
    return Math.max(total, 0);
  }

  function sumSpaces(stops) {
    return stops.reduce(function (sum, stop) { return sum + stop.spaces; }, 0);
  }

  function loadStatus(spaces) {
    if (!spaces) return { shortLabel: "Empty", kind: "", detail: "Select stops to build a pickup run." };
    if (spaces <= TRAILER_CAP) {
      return { shortLabel: "Fits trailer", kind: "good", detail: "This should fit in one trailer load." };
    }
    if (spaces <= TRAILER_CAP + UTE_CAP) {
      return { shortLabel: "Trailer plus ute", kind: "warn", detail: "Trailer fills first, with " + (spaces - TRAILER_CAP) + " space(s) on the ute." };
    }
    return { shortLabel: "Split run", kind: "bad", detail: "Over by " + (spaces - TRAILER_CAP - UTE_CAP) + " space(s). Plan a drop-off between runs." };
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(clean).filter(function (item) {
      var lower = normalizeText(item);
      return lower && lower !== "none" && lower !== "n/a" && lower !== "0";
    });
  }

  function fullAddress(stop) {
    return [stop.street, stop.town, "Taranaki", "New Zealand"].filter(Boolean).join(", ");
  }

  function addressKey(stop) {
    return normalizeText(fullAddress(stop));
  }

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function normalizeText(value) {
    return clean(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function normalizePhone(value) {
    return clean(value).replace(/[^\d+]/g, "");
  }

  function unique(list) {
    var seen = new Set();
    var out = [];
    list.forEach(function (item) {
      var key = normalizeText(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(clean(item));
    });
    return out;
  }

  function hashKey(value) {
    var hash = 0;
    var str = String(value);
    for (var i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function makePin(color, label, isCurrent) {
    var size = isCurrent ? 32 : 20;
    var cls = "custom-pin" + (isCurrent ? " is-current" : "");
    return L.divIcon({
      className: "",
      html: '<div class="' + cls + '" style="background:' + color +
            ';width:' + size + 'px;height:' + size + 'px;font-size:' + (isCurrent ? 14 : 11) + 'px">' +
            escapeHtml(label || "") + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function setBusy(isBusy, message) {
    el.refreshBtn.disabled = isBusy;
    el.refreshBtn.textContent = isBusy ? "Working..." : "Refresh";
    if (message) setSyncLine(message);
  }

  function setSyncLine(message) {
    if (message) {
      el.syncLine.textContent = message;
      return;
    }
    if (!state.stops.length) {
      el.syncLine.textContent = "No pickup data loaded yet.";
      return;
    }
    var source = state.sourceMode === "demo" ? "Demo data" : "Live sheet";
    var time = state.lastSync ? " - refreshed " + state.lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    el.syncLine.textContent = source + ": " + activeStops().length + " open stop(s), " + sumSpaces(activeStops()) + " spaces" + time;
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.toast.classList.remove("show"); }, 2400);
  }

  function copyToClipboard(text) {
    if (!navigator.clipboard) {
      var area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      toast("Copied");
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      toast("Copied");
    }, function () {
      toast("Copy failed");
    });
  }

  function csvCell(value) {
    return '"' + clean(value).replace(/"/g, '""') + '"';
  }

  function parseCsvLine(line) {
    var out = [];
    var current = "";
    var quoted = false;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(clean(current));
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(clean(current));
    return out;
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
}());
