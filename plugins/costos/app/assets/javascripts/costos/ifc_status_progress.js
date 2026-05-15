/* global window, document, MutationObserver */
(function () {
  if (window.CostosIfcStatusProgress) return;

  var STATE = {
    timers: {},
    percents: {},
    serverProgressById: {},
    uiReportedById: {},
    statusById: {},
    statusByTitle: {},
    fetchedAt: 0,
    apiDisabled: false,
    refreshQueued: false,
    refreshTimer: null,
    activeModelIds: {},
    modelStatusFetchedAt: {},
    pollTimer: null,
    observer: null,
    bootstrapObserver: null,
    bootstrapTicker: null
  };
  var POLL_MS = 15000;
  var PERF_DEBUG = !!window.COSTOS_PERF_DEBUG;
  var PERF_SERVER = !!window.COSTOS_PERF_SERVER_LOG;
  var PERF_PREFIX = "[COSTOS-PERF][ifc_status_progress]";
  var PERF_OBSERVER_HITS = 0;
  var PERF_REFRESH_HITS = 0;
  window.CostosPerfState = window.CostosPerfState || {};
  window.CostosPerfState.ifcStatusProgress = window.CostosPerfState.ifcStatusProgress || {
    observerHits: 0,
    refreshHits: 0,
    lastApplyMs: 0,
    lastApplyCells: 0,
    lastFetchMs: 0,
    lastFetchIds: 0,
    lastFetchModels: 0
  };

  var STATUS_LABELS = {
    pending: "pending",
    processing: "processing",
    completed: "completed",
    error: "error"
  };

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
  }

  function perfLog(event, data) {
    if (!PERF_DEBUG || !window.console || typeof window.console.log !== "function") return;
    try {
      window.console.log(PERF_PREFIX + " " + event, data || {});
    } catch (e) { /* ignore */ }
  }

  function perfServerLog(event, data) {
    if (!PERF_SERVER || !window.fetch) return;
    var csrf = csrfToken();
    if (!csrf) return;
    try {
      window.fetch("/costos/ifc_log", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf
        },
        body: JSON.stringify({
          event: "ifc_progress_perf",
          message: event + " " + JSON.stringify(data || {})
        })
      });
    } catch (e) { /* ignore */ }
  }

  function normalizeStatus(raw) {
    var v = String(raw || "").trim().toLowerCase();
    if (!v) return null;

    if (v.indexOf("completed") >= 0 || v.indexOf("complete") >= 0 || v.indexOf("completado") >= 0) return "completed";
    if (v.indexOf("processing") >= 0 || v.indexOf("procesando") >= 0) return "processing";
    if (v.indexOf("pending") >= 0 || v.indexOf("pendiente") >= 0) return "pending";
    if (v.indexOf("error") >= 0 || v.indexOf("failed") >= 0 || v.indexOf("fallido") >= 0) return "error";

    return null;
  }

  function normalizeTitle(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function extractModelId(cell) {
    var row = cell && cell.closest ? cell.closest("tr") : null;
    if (!row) return null;

    var link = row.querySelector('a[href*="/ifc_models/"]');
    if (!link) return null;
    var href = link.getAttribute("href") || "";
    var match = href.match(/\/ifc_models\/(\d+)/);
    return match ? match[1] : null;
  }

  function resolveStatus(cell) {
    var modelId = extractModelId(cell);
    if (modelId && STATE.statusById[modelId]) return STATE.statusById[modelId];

    var title = extractTitle(cell);
    if (title && STATE.statusByTitle[title]) return STATE.statusByTitle[title];

    var statusNode = cell.querySelector(".ifc-models--conversion-status");
    if (statusNode) {
      var byNodeText = normalizeStatus(statusNode.textContent);
      if (byNodeText) return byNodeText;
      var byNodeClass = normalizeStatus(statusNode.className);
      if (byNodeClass) return byNodeClass;
    }

    var byText = normalizeStatus(cell.textContent);
    if (byText) return byText;

    var existing = cell.querySelector(".costos-ifc-progress");
    if (existing) {
      var existingStatus = normalizeStatus(existing.getAttribute("data-status"));
      if (existingStatus === "completed" || existingStatus === "error") return existingStatus;
    }

    if (!cell || !cell.classList) return null;
    if (cell.classList.contains("error")) return "error";
    if (cell.classList.contains("completed")) return "completed";
    if (cell.classList.contains("pending")) return "pending";
    if (cell.classList.contains("processing")) return "processing";
    return null;
  }

  function rowKey(cell) {
    var row = cell && cell.closest ? cell.closest("tr") : null;
    if (!row) return String(Math.random());

    if (row.dataset && row.dataset.id) return "id:" + row.dataset.id;
    if (row.id) return "row:" + row.id;
    return "rowtxt:" + (row.textContent || "").trim().slice(0, 120);
  }

  function extractTitle(cell) {
    var row = cell && cell.closest ? cell.closest("tr") : null;
    if (!row) return null;

    var link = row.querySelector('a[href*="/ifc_models/"]');
    if (!link) link = row.querySelector("a");
    if (!link) return null;
    return normalizeTitle(link.textContent);
  }

  function ensureMarkup(cell) {
    var root = cell.querySelector(".costos-ifc-progress");
    if (root) return root;

    cell.innerHTML = ""
      + "<div class=\"costos-ifc-progress\">"
      + "  <div class=\"costos-ifc-progress__meta\">"
      + "    <span class=\"costos-ifc-progress__label\"></span>"
      + "    <span class=\"costos-ifc-progress__pct\"></span>"
      + "  </div>"
      + "  <div class=\"costos-ifc-progress__bar\">"
      + "    <div class=\"costos-ifc-progress__fill\"></div>"
      + "  </div>"
      + "</div>";

    return cell.querySelector(".costos-ifc-progress");
  }

  function render(cell, status, percent) {
    var root = ensureMarkup(cell);
    if (!root) return;

    var labelNode = root.querySelector(".costos-ifc-progress__label");
    var pctNode = root.querySelector(".costos-ifc-progress__pct");
    var fillNode = root.querySelector(".costos-ifc-progress__fill");

    root.setAttribute("data-status", status);
    if (labelNode) labelNode.textContent = STATUS_LABELS[status] || status;

    if (status === "error") {
      if (pctNode) pctNode.textContent = "error";
      if (fillNode) fillNode.style.width = "100%";
      return;
    }

    if (status === "completed") {
      if (pctNode) pctNode.textContent = "100%";
      if (fillNode) fillNode.style.width = "100%";
      return;
    }

    var safe = Math.max(0, Math.min(99, Math.round(percent || 0)));
    if (pctNode) pctNode.textContent = safe + "%";
    if (fillNode) fillNode.style.width = safe + "%";
  }

  function sendClientLog(event, message) {
    // Disabled by default to reduce request noise on large IFC pages.
    // Enable manually with: window.COSTOS_IFC_PROGRESS_DEBUG = true
    if (!window.COSTOS_IFC_PROGRESS_DEBUG) return;
    var csrf = null;
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) csrf = meta.getAttribute("content");
    if (!csrf) return;
    try {
      window.fetch("/costos/ifc_log", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf
        },
        body: JSON.stringify({ event: event, message: message || "" })
      });
    } catch (e) { /* best effort */ }
  }

  function stopTimer(key) {
    if (STATE.timers[key]) {
      window.clearInterval(STATE.timers[key]);
      delete STATE.timers[key];
    }
  }

  function startFakeProgress(cell, status) {
    var key = rowKey(cell);
    var initial = STATE.percents[key];

    if (initial == null) {
      initial = status === "pending" ? 8 : 35;
    }

    var max = status === "pending" ? 55 : 95;
    STATE.percents[key] = Math.min(initial, max);
    render(cell, status, STATE.percents[key]);

    stopTimer(key);
    STATE.timers[key] = window.setInterval(function () {
      var currentStatus = resolveStatus(cell);
      if (currentStatus !== "pending" && currentStatus !== "processing") {
        stopTimer(key);
        return;
      }

      var nextMax = currentStatus === "pending" ? 55 : 95;
      var step = currentStatus === "pending" ? 2 : 1;
      var current = STATE.percents[key] || 0;
      current = Math.min(nextMax, current + step);
      STATE.percents[key] = current;
      render(cell, currentStatus, current);
    }, 1200);
  }

  function applyToCell(cell) {
    if (!isIfcCell(cell)) return;

    var status = resolveStatus(cell);
    if (!status) return;

    var modelId = extractModelId(cell);
    var key = rowKey(cell);
    if (status === "completed") {
      STATE.percents[key] = 100;
      if (modelId) STATE.serverProgressById[modelId] = 100;
      if (modelId) delete STATE.activeModelIds[modelId];
      stopTimer(key);
      render(cell, status, 100);
      return;
    }

    if (status === "error") {
      if (modelId) STATE.serverProgressById[modelId] = 100;
      if (modelId) delete STATE.activeModelIds[modelId];
      stopTimer(key);
      render(cell, status, 100);
      return;
    }

    if (modelId) STATE.activeModelIds[modelId] = true;
    if (modelId && STATE.serverProgressById[modelId] != null) {
      var exact = Math.max(0, Math.min(99, Number(STATE.serverProgressById[modelId]) || 0));
      STATE.percents[key] = exact;
      stopTimer(key);
      render(cell, status, exact);
      var sig = status + ":" + exact;
      if (STATE.uiReportedById[modelId] !== sig) {
        STATE.uiReportedById[modelId] = sig;
        sendClientLog("ifc_progress_ui_update", "model_id=" + modelId + " status=" + status + " progress=" + exact);
      }
    } else {
      startFakeProgress(cell, status);
    }
  }

  function applyAll() {
    var t0 = Date.now();
    var cells = collectIfcCells();
    for (var i = 0; i < cells.length; i += 1) applyToCell(cells[i]);
    var dt = Date.now() - t0;
    window.CostosPerfState.ifcStatusProgress.lastApplyMs = dt;
    window.CostosPerfState.ifcStatusProgress.lastApplyCells = cells.length;
    if (PERF_DEBUG && dt > 30) {
      perfLog("applyAll", { cells: cells.length, ms: dt });
    }
  }

  function isIfcCell(cell) {
    var table = cell && cell.closest ? cell.closest("table") : null;
    if (!table) return false;

    return !!table.querySelector("a[href*=\"/ifc_models/\"]");
  }

  function collectIfcTables() {
    var links = document.querySelectorAll("a[href*=\"/ifc_models/\"]");
    if (!links || !links.length) return [];

    var tables = [];
    var seen = {};
    for (var i = 0; i < links.length; i += 1) {
      var table = links[i].closest ? links[i].closest("table") : null;
      if (!table) continue;
      var key = table.id || table.getAttribute("data-test-selector") || ("idx_" + i);
      if (seen[key]) continue;
      seen[key] = true;
      tables.push(table);
    }
    return tables;
  }

  function collectIfcCells() {
    var tables = collectIfcTables();
    var all = [];
    var seen = new Set();
    for (var i = 0; i < tables.length; i += 1) {
      var rows = tables[i].querySelectorAll("tr");
      for (var j = 0; j < rows.length; j += 1) {
        var row = rows[j];
        var rowLink = row.querySelector('a[href*="/ifc_models/"]');
        if (!rowLink) continue;

        var cell = findStatusCellInRow(row);
        if (!cell || seen.has(cell)) continue;
        seen.add(cell);
        all.push(cell);
      }
    }
    return all;
  }

  function findStatusCellInRow(row) {
    if (!row || !row.querySelectorAll) return null;

    // 1) Best case: backend class on TD
    var classCell = row.querySelector("td.pending, td.processing, td.completed, td.error");
    if (classCell) return classCell;

    // 2) Fallback: explicit status span
    var statusNode = row.querySelector("span.ifc-models--conversion-status");
    if (statusNode && statusNode.closest) {
      var spanCell = statusNode.closest("td");
      if (spanCell) return spanCell;
    }

    // 3) Robust fallback: first cell whose text looks like a conversion status
    var cells = row.querySelectorAll("td");
    for (var i = 0; i < cells.length; i += 1) {
      if (normalizeStatus(cells[i].textContent)) {
        return cells[i];
      }
    }

    return null;
  }

  function fetchProgressBatch(ids, done) {
    var t0 = Date.now();
    var now = Date.now();
    if (now - STATE.fetchedAt < 3000) {
      done();
      return;
    }
    STATE.fetchedAt = now;

    if (!ids || !ids.length) {
      done();
      return;
    }

    var url = "/costos/ifc_progress?ids=" + encodeURIComponent(ids.join(","));
    window.fetch(url, { credentials: "include" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("ifc_progress_http_" + resp.status);
        var contentType = (resp.headers && resp.headers.get && resp.headers.get("content-type")) || "";
        if (contentType.indexOf("application/json") === -1) {
          throw new Error("ifc_progress_non_json");
        }
        return resp.json();
      })
      .then(function (json) {
        var models = (json && json.models) || {};
        var keys = Object.keys(models);
        for (var i = 0; i < keys.length; i += 1) {
          var id = String(keys[i]);
          var entry = models[id] || {};
          var status = normalizeStatus(entry.status);
          if (status) STATE.statusById[id] = status;
          if (entry.progress != null) {
            var n = Number(entry.progress);
            if (!isNaN(n)) STATE.serverProgressById[id] = Math.max(0, Math.min(100, Math.round(n)));
          }
        }
        var dt = Date.now() - t0;
        window.CostosPerfState.ifcStatusProgress.lastFetchMs = dt;
        window.CostosPerfState.ifcStatusProgress.lastFetchIds = ids.length;
        window.CostosPerfState.ifcStatusProgress.lastFetchModels = keys.length;
        perfLog("fetchProgressBatch_ok", { ids: ids.length, models: keys.length, ms: dt });
        if (dt > 1500) perfServerLog("fetchProgressBatch_slow", { ids: ids.length, models: keys.length, ms: dt });
      })
      .catch(function () {
        // ignore endpoint errors; fake progress will continue
        var dt = Date.now() - t0;
        perfLog("fetchProgressBatch_error", { ids: ids.length, ms: dt });
      })
      .finally(function () {
        done();
      });
  }

  function refreshActiveModelStatuses(done) {
    var ids = Object.keys(STATE.activeModelIds);
    if (!ids.length) {
      return done();
    }
    fetchProgressBatch(ids, done);
  }

  function scheduleRefresh(delayMs) {
    if (STATE.refreshQueued) return;
    STATE.refreshQueued = true;

    if (STATE.refreshTimer) {
      window.clearTimeout(STATE.refreshTimer);
    }

    STATE.refreshTimer = window.setTimeout(function () {
      STATE.refreshQueued = false;
      PERF_REFRESH_HITS += 1;
      window.CostosPerfState.ifcStatusProgress.refreshHits = PERF_REFRESH_HITS;
      if (PERF_DEBUG && PERF_REFRESH_HITS % 10 === 0) {
        perfLog("scheduleRefresh_tick", {
          hit: PERF_REFRESH_HITS,
          activeModels: Object.keys(STATE.activeModelIds).length
        });
      }
      refreshActiveModelStatuses(applyAll);
    }, delayMs || 0);
  }

  function disconnectObserver() {
    if (!STATE.observer) return;
    try {
      STATE.observer.disconnect();
    } catch (e) { /* ignore */ }
    STATE.observer = null;
  }

  function disconnectBootstrapObserver() {
    if (!STATE.bootstrapObserver) return;
    try {
      STATE.bootstrapObserver.disconnect();
    } catch (e) { /* ignore */ }
    STATE.bootstrapObserver = null;
  }

  function stopBootstrapTicker() {
    if (!STATE.bootstrapTicker) return;
    try {
      window.clearInterval(STATE.bootstrapTicker);
    } catch (e) { /* ignore */ }
    STATE.bootstrapTicker = null;
  }

  function ensureBootstrapTicker() {
    if (STATE.bootstrapTicker) return;
    var ticks = 0;
    STATE.bootstrapTicker = window.setInterval(function () {
      ticks += 1;
      if (collectIfcTables().length) {
        stopBootstrapTicker();
        connectObserver();
        scheduleRefresh(0);
        return;
      }
      if (ticks >= 45) {
        // stop after ~45s; observers/events continue covering late updates
        stopBootstrapTicker();
      }
    }, 1000);
  }

  function ensureBootstrapObserver() {
    if (STATE.bootstrapObserver) return;
    if (!document || !document.body) return;

    STATE.bootstrapObserver = new MutationObserver(function () {
      if (!collectIfcTables().length) return;
      disconnectBootstrapObserver();
      connectObserver();
      scheduleRefresh(0);
    });

    STATE.bootstrapObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
    ensureBootstrapTicker();
  }

  function connectObserver() {
    var tables = collectIfcTables();
    var observerRoot = tables.length ? tables[0] : null;
    perfLog("init_tables", { tables: tables.length, hasObserverRoot: !!observerRoot });

    disconnectObserver();
    if (!observerRoot) {
      ensureBootstrapObserver();
      ensureBootstrapTicker();
      return;
    }
    disconnectBootstrapObserver();
    stopBootstrapTicker();

    STATE.observer = new MutationObserver(function () {
      PERF_OBSERVER_HITS += 1;
      window.CostosPerfState.ifcStatusProgress.observerHits = PERF_OBSERVER_HITS;
      if (PERF_DEBUG && PERF_OBSERVER_HITS % 20 === 0) {
        perfLog("observer_mutation", { hit: PERF_OBSERVER_HITS });
      }
      scheduleRefresh(600);
    });

    STATE.observer.observe(observerRoot, {
      childList: true,
      subtree: true,
      attributes: false
    });
  }

  function init() {
    perfLog("init_start", { path: window.location.pathname });
    scheduleRefresh(0);

    if (!STATE.pollTimer) {
      STATE.pollTimer = window.setInterval(function () {
        if (!Object.keys(STATE.activeModelIds).length) return;
        scheduleRefresh(0);
      }, POLL_MS);
    }

    connectObserver();
    applyAll();
  }

  function initDeferred() {
    window.setTimeout(init, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeferred, { once: true });
  } else {
    initDeferred();
  }
  document.addEventListener("turbo:load", initDeferred);
  document.addEventListener("turbo:render", initDeferred);
  document.addEventListener("turbolinks:load", initDeferred);

  window.CostosIfcStatusProgress = {
    refresh: applyAll,
    reinit: init
  };
})();
