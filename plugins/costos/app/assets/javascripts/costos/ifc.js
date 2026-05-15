/* global window, document, fetch */
(function () {
  if (window.CostosIfcInspectLogger) return;
  // Keep advanced properties enabled by default.
  // Only enable heavy instrumentation when explicitly requested.
  var ENABLE_HEAVY_INSPECT = !!window.COSTOS_IFC_INSPECT_ENABLED;
  var ENABLE_DEBUG_LOGS = !!window.COSTOS_IFC_INSPECT_DEBUG;
  // Keep lightweight XKT sniffing enabled by default so metadata can load
  // even when heavy inspect mode is disabled.
  var ENABLE_XKT_SNIFF = window.COSTOS_IFC_XKT_SNIFF !== false;
  var ENABLE_INTERACTION_TRACE = interactionTraceEnabled();
  var ENABLE_CONSOLE_TRACE = !!window.COSTOS_IFC_CONSOLE_TRACE;
  var ENABLE_BUSY_TRACE = !!window.COSTOS_IFC_BUSY_TRACE;
  var ENABLE_PERF_OVERLAY = perfOverlayEnabled();

  var LOG_PREFIX = "[IFC-INSPECT]";
  var inspectorObserver = null;
  var inspectorPanel = null;
  var lastInspectorSignature = "";
  var advancedMetaData = null;
  var advancedMetaIndex = null;
  var metadataLoadStarted = false;
  var metadataLoadDone = false;
  var lastXktAttachmentId = null;
  var currentMetaAttachmentId = null;
  var currentXktAttachmentId = null;
  var lastPollSignature = "";
  var metaLogSent = false;
  var apiModelLookupDisabled = false;
  var metadataRetryCount = 0;
  var metadataRetryMax = 2;
  var metadataHeartbeatTimer = null;
  var metadataHeartbeatTicks = 0;
  var metadataHeartbeatMaxTicks = 8;
  var interactionTraceState = null;
  var busyTraceState = null;
  var coreHookState = null;
  var perfOverlayState = null;

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function interactionTraceEnabled() {
    try {
      if (window.COSTOS_IFC_INTERACTION_TRACE) return true;
      var params = new URLSearchParams(window.location.search || "");
      var queryValue = params.get("costos_ifc_trace");
      if (queryValue === "1" || queryValue === "true") return true;
    } catch (e) {
      // ignore
    }
    try {
      return window.localStorage && window.localStorage.getItem("costos_ifc_trace") === "1";
    } catch (e2) {
      return false;
    }
  }

  function perfOverlayEnabled() {
    try {
      if (window.COSTOS_IFC_PERF_OVERLAY) return true;
      var params = new URLSearchParams(window.location.search || "");
      var queryValue = params.get("costos_ifc_overlay");
      if (queryValue === "1" || queryValue === "true") return true;
    } catch (e) {
      // ignore
    }
    try {
      return window.localStorage && window.localStorage.getItem("costos_ifc_overlay") === "1";
    } catch (e2) {
      return ENABLE_INTERACTION_TRACE;
    }
  }

  function shareToken() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return params.get("share_token") || "";
    } catch (e) {
      return "";
    }
  }

  function appendShareToken(url) {
    var token = shareToken();
    if (!token) return url;
    try {
      var u = new URL(url, window.location.origin);
      if (!u.searchParams.get("share_token")) u.searchParams.set("share_token", token);
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function shouldAppendShareToken(url) {
    if (!url) return false;
    var str = String(url);
    return str.indexOf('/api/v3/ifc_models') !== -1 ||
      str.indexOf('/api/v3/attachments') !== -1;
  }

  function isIfcOrBcfPage() {
    var path = String(window.location.pathname || "");
    return path.indexOf("/ifc_models") !== -1 || path.indexOf("/bcf") !== -1;
  }

  function isIaColabSettingsUrl(url) {
    if (!url) return false;
    var str = String(url);
    return str.indexOf("/ia_colaborativa/provider_settings") !== -1 ||
      str.indexOf("/ia_colaborativa/mcp_settings") !== -1;
  }

  function makeEmptyJsonResponse() {
    try {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return null;
    }
  }

  function isEmbedRequest() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var value = params.get("embed");
      return value === "true" || value === "1";
    } catch (e) {
      return false;
    }
  }

  function sendServerLog(payload) {
    if (!ENABLE_DEBUG_LOGS) return;
    postServerLog(payload);
  }

  function postServerLog(payload) {
    try {
      var token = csrfToken();
      fetch('/costos/ifc_log', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token
        },
        body: JSON.stringify(payload || {})
      });
    } catch (e) {
      // ignore logging failures
    }
  }

  function sendInteractionTrace(event, data) {
    notifyPerfOverlay(event, data || {});
    if (!ENABLE_INTERACTION_TRACE) return;
    var payload = {
      event: event,
      category: "interaction_trace",
      url: window.location.href,
      message: safeJson(data || {})
    };
    postServerLog(payload);
    maybeConsoleTrace(event, data || {});
  }

  function maybeConsoleTrace(event, data) {
    if (!ENABLE_CONSOLE_TRACE || !window.console) return;
    try {
      if (event === "ifc_interaction_longtask") {
        window.console.warn("[IFC-PERF] longtask", data);
        return;
      }
      if (event === "ifc_busy_start" || event === "ifc_busy_end" || event === "ifc_viewer_hook" || event === "ifc_core_interaction_process") {
        window.console.warn("[IFC-PERF] " + event, data);
        return;
      }
      if (event === "ifc_interaction_summary" && data && typeof data.fps === "number" && data.fps < 45) {
        window.console.warn("[IFC-PERF] low-fps-summary", data);
        return;
      }
      if (event === "ifc_interaction_event" &&
          data &&
          typeof data.fps === "number" &&
          data.fps < 35 &&
          (data.interactionType === "mousemove" || data.interactionType === "wheel" || data.interactionType === "mousedown")) {
        window.console.warn("[IFC-PERF] low-fps-event", data);
      }
    } catch (e) {
      // ignore console failures
    }
  }

  function setupPerfOverlay() {
    if (!ENABLE_PERF_OVERLAY || perfOverlayState || !isIfcOrBcfPage()) return;
    perfOverlayState = {
      root: null,
      body: null,
      latestInputType: null,
      fps: null,
      avgFps: null,
      lastSlowProcess: null,
      lastFrameSummary: null,
      lastLongTask: null,
      lastSummary: null,
      frameSeries: [],
      lastUpdatedAt: 0
    };

    ensurePerfOverlay();
    updatePerfOverlay();
  }

  function ensurePerfOverlay() {
    if (!perfOverlayState || perfOverlayState.root) return;
    if (!document || !document.body) {
      window.setTimeout(ensurePerfOverlay, 250);
      return;
    }

    var root = document.createElement("div");
    root.className = "costos-ifc-perf-overlay";
    root.setAttribute("data-test-selector", "costos-ifc-perf-overlay");
    root.style.position = "fixed";
    root.style.right = "12px";
    root.style.bottom = "12px";
    root.style.zIndex = "2147483647";
    root.style.width = "320px";
    root.style.maxWidth = "calc(100vw - 24px)";
    root.style.background = "rgba(9, 12, 18, 0.92)";
    root.style.color = "#e8edf7";
    root.style.border = "1px solid rgba(130, 170, 255, 0.28)";
    root.style.borderRadius = "10px";
    root.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    root.style.font = "12px/1.35 Consolas, 'Courier New', monospace";
    root.style.pointerEvents = "none";
    root.style.backdropFilter = "blur(8px)";

    var header = document.createElement("div");
    header.style.padding = "8px 10px 6px";
    header.style.borderBottom = "1px solid rgba(130, 170, 255, 0.18)";
    header.style.color = "#8ab4ff";
    header.style.fontWeight = "700";
    header.textContent = "IFC Perf HUD";

    var body = document.createElement("div");
    body.style.padding = "8px 10px 10px";
    body.style.whiteSpace = "pre-wrap";

    root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);
    perfOverlayState.root = root;
    perfOverlayState.body = body;
  }

  function formatPerfValue(value, suffix) {
    if (value == null || value === "") return "-";
    if (typeof value === "number") {
      return (Math.round(value * 10) / 10) + (suffix || "");
    }
    return String(value);
  }

  function getGlobalPerfHudState() {
    var state = window.__costosIfcPerfHudState;
    if (!state) {
      state = {
        latestInputType: null,
        fps: null,
        avgFps: null,
        lastSlowProcess: null,
        lastFrameSummary: null,
        lastFrameFlowSummary: null,
        lastTickState: null,
        lastLongTask: null,
        lastSummary: null,
        lastUpdatedAt: 0
      };
      window.__costosIfcPerfHudState = state;
    }
    return state;
  }

  function summarizePerfHint() {
    if (!perfOverlayState) return "-";
    var slow = perfOverlayState.lastSlowProcess;
    var frame = perfOverlayState.lastFrameSummary;
    var longTask = perfOverlayState.lastLongTask;
    if (longTask && longTask.durationMs >= 100) {
      return "longtask main-thread";
    }
    if (slow && frame && slow.durationMs >= 80 && frame.totalMs <= 20) {
      return "fuera de render JS";
    }
    if (frame && frame.topLabels && frame.topLabels.length) {
      return "domina " + frame.topLabels[0].label;
    }
    return "esperando muestra";
  }

  function updatePerfOverlay() {
    if (!perfOverlayState) return;
    ensurePerfOverlay();
    if (!perfOverlayState.body) return;

    var slow = perfOverlayState.lastSlowProcess || {};
    var frame = perfOverlayState.lastFrameSummary || {};
    var summary = perfOverlayState.lastSummary || {};
    var lines = [
      "fps " + formatPerfValue(perfOverlayState.fps) + " | avg " + formatPerfValue(perfOverlayState.avgFps),
      "input " + formatPerfValue(perfOverlayState.latestInputType),
      "slow " + formatPerfValue(slow.label) + " " + formatPerfValue(slow.durationMs, "ms"),
      "frame " + formatPerfValue(frame.totalMs, "ms") + " | phase " + formatPerfValue(frame.phaseSummary),
      "top " + formatPerfValue(frame.topLabel),
      "longtask " + formatPerfValue((perfOverlayState.lastLongTask || {}).durationMs, "ms"),
      "hint " + summarizePerfHint(),
      "t< " + renderCompressedTimeSeries(perfOverlayState.frameSeries || [])
    ];

    if (summary && summary.counters) {
      lines.push(
        "evt m:" + formatPerfValue(summary.counters.mousemove) +
        " w:" + formatPerfValue(summary.counters.wheel) +
        " d:" + formatPerfValue(summary.counters.mousedown)
      );
    }

    perfOverlayState.body.textContent = lines.join("\n");
  }

  function notifyPerfOverlay(event, data) {
    if (!data) return;
    var globalState = getGlobalPerfHudState();
    if (ENABLE_PERF_OVERLAY && !perfOverlayState) setupPerfOverlay();
    var uiState = perfOverlayState || globalState;

    if (data.inputType) {
      globalState.latestInputType = data.inputType;
      uiState.latestInputType = data.inputType;
    }
    if (data.interactionType) {
      globalState.latestInputType = data.interactionType;
      uiState.latestInputType = data.interactionType;
    }

    if (typeof data.fps === "number") {
      globalState.fps = data.fps;
      uiState.fps = data.fps;
    }
    if (typeof data.avgFps === "number") {
      globalState.avgFps = data.avgFps;
      uiState.avgFps = data.avgFps;
    }

    if (event === "ifc_interaction_event" || event === "ifc_interaction_summary") {
      globalState.lastSummary = data;
      uiState.lastSummary = data;
    }

    if (event === "ifc_interaction_longtask") {
      var longTask = {
        durationMs: data.durationMs,
        startTimeMs: data.startTimeMs
      };
      globalState.lastLongTask = longTask;
      uiState.lastLongTask = longTask;
    }

    if (event === "ifc_core_interaction_process" && data.kind === "slow_process") {
      var slowProcess = {
        label: data.label,
        durationMs: data.durationMs,
        inputType: data.inputType,
        sinceInputMs: data.sinceInputMs,
        tickState: data.tickState || null
      };
      globalState.lastSlowProcess = slowProcess;
      uiState.lastSlowProcess = slowProcess;
      if (data.tickState) {
        globalState.lastTickState = data.tickState;
        uiState.lastTickState = data.tickState;
      }
    }

    if (event === "ifc_core_interaction_process" && data.kind === "frame_phase_summary") {
      var topLabel = null;
      if (data.topLabels && data.topLabels.length) {
        topLabel = data.topLabels[0].label + " " + formatPerfValue(data.topLabels[0].durationMs, "ms");
      }
      var phaseSummary = "-";
      if (data.phases) {
        phaseSummary = Object.keys(data.phases).map(function (key) {
          return key + ":" + formatPerfValue(data.phases[key], "ms");
        }).join(" ");
      }
      var frameSummary = {
        totalMs: data.totalMs,
        topLabel: topLabel,
        phaseSummary: phaseSummary
      };
      globalState.lastFrameSummary = frameSummary;
      uiState.lastFrameSummary = frameSummary;
    }

    if (event === "ifc_core_interaction_process" && data.kind === "frame_flow_summary") {
      var frameFlowSummary = {
        frameTotalMs: data.frameTotalMs,
        rafGapMs: data.rafGapMs,
        tickGapMs: data.tickGapMs,
        maxFrameTotalMs: data.maxFrameTotalMs,
        maxRafGapMs: data.maxRafGapMs,
        maxTickGapMs: data.maxTickGapMs,
        sinceInputMs: data.sinceInputMs,
        slowFrameCount: data.slowFrameCount
      };
      globalState.lastFrameFlowSummary = frameFlowSummary;
      uiState.lastFrameFlowSummary = frameFlowSummary;
      pushFrameSeriesValue(globalState, data.frameTotalMs);
      pushFrameSeriesValue(uiState, data.frameTotalMs);
    }

    globalState.lastUpdatedAt = Date.now();
    uiState.lastUpdatedAt = globalState.lastUpdatedAt;
    if (perfOverlayState) updatePerfOverlay();
  }

  function safeJson(data) {
    try {
      return JSON.stringify(data);
    } catch (e) {
      return String(data);
    }
  }

  function pushFrameSeriesValue(state, value) {
    if (!state || typeof value !== "number" || !isFinite(value)) return;
    if (!state.frameSeries) state.frameSeries = [];
    state.frameSeries.push(Math.max(0, value));
    if (state.frameSeries.length > 40) state.frameSeries.shift();
  }

  function renderCompressedTimeSeries(series) {
    if (!series || !series.length) return "-";
    var newestFirst = series.slice().reverse();
    var max = 0;
    for (var i = 0; i < newestFirst.length; i += 1) {
      if (newestFirst[i] > max) max = newestFirst[i];
    }
    if (max <= 0) return "-";
    var glyphs = " .:-=+*#%@";
    var out = "";
    for (var j = 0; j < newestFirst.length; j += 1) {
      // Log scale to compress time/amplitude and make spikes visible.
      var norm = Math.log(1 + newestFirst[j]) / Math.log(1 + max);
      var idx = Math.max(0, Math.min(glyphs.length - 1, Math.round(norm * (glyphs.length - 1))));
      out += glyphs.charAt(idx);
    }
    return out;
  }

  function logLocal(message) {
    if (!ENABLE_DEBUG_LOGS) return;
    if (window.console && typeof window.console.log === 'function') {
      window.console.log(LOG_PREFIX + " " + message);
    }
  }

  function targetSummary(target) {
    if (!target) return { tag: null, className: "" };
    return {
      tag: target.tagName || null,
      className: String(target.className || "").slice(0, 140)
    };
  }

  function isViewerInteractionTarget(target) {
    if (!target) return false;
    try {
      if (target.closest &&
          (target.closest('.op-ifc-viewer') ||
            target.closest('.op-ifc-viewer-container') ||
            target.closest('[data-test-selector="op-ifc-viewer-container"]') ||
            target.closest('.xeokit-properties') ||
            target.closest('.xeokit-propertiesTab'))) {
        return true;
      }
    } catch (e) {
      // ignore
    }
    var cls = String(target.className || "");
    return cls.indexOf("op-ifc-viewer") !== -1 || cls.indexOf("xeokit") !== -1;
  }

  function setupInteractionTrace() {
    if (!ENABLE_INTERACTION_TRACE || interactionTraceState || !isIfcOrBcfPage()) return;

    interactionTraceState = {
      startedAt: Date.now(),
      frames: 0,
      fps: 0,
      fpsSamples: [],
      lastFpsTick: performance.now(),
      recentEvents: [],
      counters: {
        mousemove: 0,
        mousedown: 0,
        mouseup: 0,
        wheel: 0,
        keydown: 0
      },
      lastMoveAt: 0,
      lastEventLogAt: {
        mousemove: 0,
        mousedown: 0,
        mouseup: 0,
        wheel: 0,
        keydown: 0
      },
      lastSummaryAt: 0,
      lastLongTaskAt: 0,
      summaryTimer: null,
      rafStarted: false
    };

    function rememberEvent(type, event) {
      var now = performance.now();
      var target = targetSummary(event && event.target);
      interactionTraceState.recentEvents.push({
        t: Math.round(now),
        type: type,
        tag: target.tag,
        className: target.className
      });
      if (interactionTraceState.recentEvents.length > 20) {
        interactionTraceState.recentEvents.shift();
      }
    }

    function onInteraction(type, event) {
      if (!event || !isViewerInteractionTarget(event.target)) return;
      var now = performance.now();
      if (type === "mousemove") {
        interactionTraceState.counters.mousemove += 1;
        if (now - interactionTraceState.lastMoveAt < 250) return;
        interactionTraceState.lastMoveAt = now;
      } else if (interactionTraceState.counters[type] != null) {
        interactionTraceState.counters[type] += 1;
      }
      rememberEvent(type, event);
      maybeLogInteraction(type, event, now);
    }

    function maybeLogInteraction(type, event, now) {
      var last = interactionTraceState.lastEventLogAt[type] || 0;
      var minGap = type === "mousemove" ? 1000 : 150;
      if (now - last < minGap) return;
      interactionTraceState.lastEventLogAt[type] = now;
      sendInteractionTrace("ifc_interaction_event", {
        interactionType: type,
        fps: roundedFps(),
        avgFps: roundedAvgFps(),
        counters: shallowCopy(interactionTraceState.counters),
        target: targetSummary(event && event.target),
        recentEvents: interactionTraceState.recentEvents.slice(-6)
      });
    }

    document.addEventListener("mousemove", function (event) {
      onInteraction("mousemove", event);
    }, true);
    document.addEventListener("mousedown", function (event) {
      onInteraction("mousedown", event);
    }, true);
    document.addEventListener("mouseup", function (event) {
      onInteraction("mouseup", event);
    }, true);
    document.addEventListener("wheel", function (event) {
      onInteraction("wheel", event);
    }, true);
    document.addEventListener("keydown", function (event) {
      onInteraction("keydown", event);
    }, true);

    function fpsLoop(now) {
      if (!interactionTraceState) return;
      interactionTraceState.frames += 1;
      if (now - interactionTraceState.lastFpsTick >= 1000) {
        interactionTraceState.fps = (interactionTraceState.frames * 1000) / (now - interactionTraceState.lastFpsTick);
        interactionTraceState.fpsSamples.push(interactionTraceState.fps);
        if (interactionTraceState.fpsSamples.length > 12) {
          interactionTraceState.fpsSamples.shift();
        }
        interactionTraceState.frames = 0;
        interactionTraceState.lastFpsTick = now;
      }
      window.requestAnimationFrame(fpsLoop);
    }

    if (!interactionTraceState.rafStarted) {
      interactionTraceState.rafStarted = true;
      window.requestAnimationFrame(fpsLoop);
    }

    if (window.PerformanceObserver) {
      try {
        var longTaskObserver = new PerformanceObserver(function (list) {
          if (!interactionTraceState) return;
          var entries = list.getEntries();
          for (var i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (!entry || entry.duration < 80) continue;
            var now = Date.now();
            if (now - interactionTraceState.lastLongTaskAt < 3000) continue;
            interactionTraceState.lastLongTaskAt = now;
            sendInteractionTrace("ifc_interaction_longtask", {
              durationMs: Math.round(entry.duration),
              startTimeMs: Math.round(entry.startTime),
              fps: roundedFps(),
              counters: shallowCopy(interactionTraceState.counters),
              recentEvents: interactionTraceState.recentEvents.slice(-10)
            });
          }
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
      } catch (e) {
        // ignore
      }
    }

    interactionTraceState.summaryTimer = window.setInterval(function () {
      if (!interactionTraceState) return;
      var now = Date.now();
      var totalInteractions = interactionTraceState.counters.mousemove +
        interactionTraceState.counters.mousedown +
        interactionTraceState.counters.mouseup +
        interactionTraceState.counters.wheel +
        interactionTraceState.counters.keydown;
      if (!totalInteractions && roundedFps() >= 55) return;
      if (now - interactionTraceState.lastSummaryAt < 8000) return;
      interactionTraceState.lastSummaryAt = now;
      sendInteractionTrace("ifc_interaction_summary", {
        uptimeMs: now - interactionTraceState.startedAt,
        fps: roundedFps(),
        avgFps: roundedAvgFps(),
        counters: shallowCopy(interactionTraceState.counters),
        recentEvents: interactionTraceState.recentEvents.slice(-8)
      });
      resetInteractionCounters();
    }, 10000);

    sendInteractionTrace("ifc_interaction_trace_started", {
      href: window.location.href,
      heavyInspect: ENABLE_HEAVY_INSPECT,
      xktSniff: ENABLE_XKT_SNIFF
    });

    function roundedFps() {
      return Math.round((interactionTraceState.fps || 0) * 10) / 10;
    }

    function roundedAvgFps() {
      if (!interactionTraceState.fpsSamples.length) return 0;
      var sum = 0;
      for (var i = 0; i < interactionTraceState.fpsSamples.length; i += 1) {
        sum += interactionTraceState.fpsSamples[i];
      }
      return Math.round((sum / interactionTraceState.fpsSamples.length) * 10) / 10;
    }

    function resetInteractionCounters() {
      interactionTraceState.counters.mousemove = 0;
      interactionTraceState.counters.mousedown = 0;
      interactionTraceState.counters.mouseup = 0;
      interactionTraceState.counters.wheel = 0;
      interactionTraceState.counters.keydown = 0;
    }

    function shallowCopy(source) {
      return {
        mousemove: source.mousemove,
        mousedown: source.mousedown,
        mouseup: source.mouseup,
        wheel: source.wheel,
        keydown: source.keydown
      };
    }
  }

  function sendPerfTrace(event, data) {
    var payload = data || {};
    notifyPerfOverlay(event, payload);
    if (ENABLE_INTERACTION_TRACE) {
      sendInteractionTrace(event, payload);
      return;
    }
    maybeConsoleTrace(event, payload);
  }

  function viewerHookMeta() {
    return {
      href: window.location.href,
      fps: interactionTraceState ? Math.round((interactionTraceState.fps || 0) * 10) / 10 : null,
      avgFps: interactionTraceState && interactionTraceState.fpsSamples && interactionTraceState.fpsSamples.length ?
        Math.round((interactionTraceState.fpsSamples.reduce(function (sum, val) { return sum + val; }, 0) / interactionTraceState.fpsSamples.length) * 10) / 10 :
        null
    };
  }

  function installViewerPerfHooks() {
    if (!isIfcOrBcfPage()) return;
    var viewer = window.opXeokitViewer;
    if (!viewer || viewer.__costosPerfHooksInstalled) return;
    viewer.__costosPerfHooksInstalled = true;
    viewer.__costosPerfHookState = viewer.__costosPerfHookState || {
      lastLoadProjectId: null,
      lastLoadProjectAt: 0,
      lastViewpointSig: null,
      lastViewpointAt: 0
    };

    function viewpointSignature(viewpoint) {
      if (!viewpoint) return "";
      try {
        if (viewpoint.guid) return String(viewpoint.guid);
        if (viewpoint.uuid) return String(viewpoint.uuid);
        return JSON.stringify(viewpoint).slice(0, 500);
      } catch (e) {
        return String(viewpoint);
      }
    }

    function wrapMethod(methodName, wrapper) {
      var original = viewer[methodName];
      if (!original || original.__costosWrapped) return;
      var wrapped = function () {
        return wrapper.call(this, original, Array.prototype.slice.call(arguments));
      };
      wrapped.__costosWrapped = true;
      viewer[methodName] = wrapped;
    }

    function hookEvent(name) {
      try {
        if (!viewer.on || typeof viewer.on !== "function") return;
        viewer.on(name, function () {
          sendPerfTrace("ifc_viewer_hook", {
            hook: name,
            target: targetSummary(document.querySelector(".xeokit-busy-modal, .op-ifc-viewer--model-canvas")),
            recentEvents: interactionTraceState ? interactionTraceState.recentEvents.slice(-6) : [],
            meta: viewerHookMeta()
          });
        });
      } catch (e) {
        // ignore
      }
    }

    hookEvent("modelLoaded");
    hookEvent("openInspector");
    hookEvent("addModel");
    hookEvent("editModel");
    hookEvent("deleteModel");

    wrapMethod("loadProject", function (original, args) {
      var projectId = args && args.length ? String(args[0]) : "";
      var state = viewer.__costosPerfHookState;
      var now = Date.now();
      if (projectId &&
          state.lastLoadProjectId === projectId &&
          now - state.lastLoadProjectAt < 30000) {
        sendPerfTrace("ifc_viewer_hook", {
          hook: "loadProject_skipped_duplicate",
          projectId: projectId,
          sinceMs: now - state.lastLoadProjectAt,
          meta: viewerHookMeta()
        });
        return;
      }
      state.lastLoadProjectId = projectId;
      state.lastLoadProjectAt = now;
      sendPerfTrace("ifc_viewer_hook", {
        hook: "loadProject",
        projectId: projectId,
        meta: viewerHookMeta()
      });
      return original.apply(this, args);
    });

    wrapMethod("loadBCFViewpoint", function (original, args) {
      var viewpoint = args && args.length ? args[0] : null;
      var signature = viewpointSignature(viewpoint);
      var state = viewer.__costosPerfHookState;
      var now = Date.now();
      if (signature &&
          state.lastViewpointSig === signature &&
          now - state.lastViewpointAt < 1500) {
        sendPerfTrace("ifc_viewer_hook", {
          hook: "loadBCFViewpoint_skipped_duplicate",
          signature: signature.slice(0, 120),
          sinceMs: now - state.lastViewpointAt,
          meta: viewerHookMeta()
        });
        return;
      }
      state.lastViewpointSig = signature;
      state.lastViewpointAt = now;
      sendPerfTrace("ifc_viewer_hook", {
        hook: "loadBCFViewpoint",
        signature: signature.slice(0, 120),
        meta: viewerHookMeta()
      });
      return original.apply(this, args);
    });
  }

  function setupBusyTrace() {
    if (!ENABLE_BUSY_TRACE) return;
    if (!isIfcOrBcfPage() || busyTraceState) return;

    busyTraceState = {
      active: false,
      startedAt: 0,
      observer: null
    };

    function busyElement() {
      return document.querySelector(".xeokit-busy-modal");
    }

    function isBusyVisible(el) {
      if (!el) return false;
      try {
        var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (!style) return !!el.offsetParent;
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          parseFloat(style.opacity || "1") > 0 &&
          (el.offsetWidth > 0 || el.offsetHeight > 0 || !!el.getClientRects().length);
      } catch (e) {
        return false;
      }
    }

    function syncBusyState() {
      var el = busyElement();
      var visible = isBusyVisible(el);
      var now = Date.now();
      if (visible && !busyTraceState.active) {
        busyTraceState.active = true;
        busyTraceState.startedAt = now;
        sendPerfTrace("ifc_busy_start", {
          target: targetSummary(el),
          recentEvents: interactionTraceState ? interactionTraceState.recentEvents.slice(-8) : [],
          meta: viewerHookMeta()
        });
      } else if (!visible && busyTraceState.active) {
        sendPerfTrace("ifc_busy_end", {
          durationMs: now - busyTraceState.startedAt,
          target: targetSummary(el),
          recentEvents: interactionTraceState ? interactionTraceState.recentEvents.slice(-8) : [],
          meta: viewerHookMeta()
        });
        busyTraceState.active = false;
        busyTraceState.startedAt = 0;
      }
    }

    try {
      busyTraceState.observer = new MutationObserver(function (mutations) {
        var relevant = false;
        for (var i = 0; i < mutations.length; i += 1) {
          var mutation = mutations[i];
          var target = mutation && mutation.target;
          if (target && target.classList && target.classList.contains("xeokit-busy-modal")) {
            relevant = true;
            break;
          }
          if (mutation && mutation.addedNodes) {
            for (var j = 0; j < mutation.addedNodes.length; j += 1) {
              var added = mutation.addedNodes[j];
              if (added &&
                  added.nodeType === 1 &&
                  added.classList &&
                  added.classList.contains("xeokit-busy-modal")) {
                relevant = true;
                break;
              }
            }
          }
          if (relevant) break;
        }
        if (relevant) syncBusyState();
      });
      busyTraceState.observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
      syncBusyState();
    } catch (e) {
      // ignore
    }
  }

  function setupCorePerfHooks() {
    if (!isIfcOrBcfPage() || coreHookState) return;
    coreHookState = {
      wrapped: {},
      lastLogAt: {}
    };

    function shouldLog(key, minGapMs) {
      var now = Date.now();
      var last = coreHookState.lastLogAt[key] || 0;
      if (now - last < minGapMs) return false;
      coreHookState.lastLogAt[key] = now;
      return true;
    }

    function summarizeArgs(args) {
      var list = [];
      for (var i = 0; i < args.length; i += 1) {
        var value = args[i];
        if (value == null) {
          list.push(value);
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          list.push(value);
        } else if (value.guid) {
          list.push({ guid: value.guid });
        } else if (value.uuid) {
          list.push({ uuid: value.uuid });
        } else if (value.displayRepresentation) {
          list.push({ displayRepresentation: value.displayRepresentation });
        } else {
          list.push({ ctor: value.constructor && value.constructor.name ? value.constructor.name : typeof value });
        }
        if (list.length >= 3) break;
      }
      return list;
    }

    function wrapMethod(instance, ownerName, methodName, minGapMs) {
      if (!instance || typeof instance[methodName] !== "function") return;
      var key = ownerName + ":" + methodName;
      if (coreHookState.wrapped[key]) return;
      var original = instance[methodName];
      instance[methodName] = function () {
        if (shouldLog(key, minGapMs || 250)) {
          sendPerfTrace("ifc_core_hook", {
            owner: ownerName,
            method: methodName,
            args: summarizeArgs(arguments),
            meta: viewerHookMeta()
          });
        }
        return original.apply(this, arguments);
      };
      coreHookState.wrapped[key] = true;
    }

    function inspectObject(obj) {
      if (!obj || typeof obj !== "object") return;
      var ownerName = obj.constructor && obj.constructor.name ? obj.constructor.name : "";
      if (!ownerName) return;
      if (ownerName === "BcfViewService") {
        wrapMethod(obj, ownerName, "valueFromQuery", 500);
        wrapMethod(obj, ownerName, "currentViewerState", 1000);
      }
      if (ownerName === "IFCViewerPageComponent") {
        wrapMethod(obj, ownerName, "ngOnInit", 5000);
      }
      if (ownerName === "BcfListComponent") {
        wrapMethod(obj, ownerName, "ngOnInit", 5000);
      }
    }

    function scanNgContexts() {
      var nodes = document.querySelectorAll("op-ifc-viewer, .op-ifc-viewer, .op-ifc-viewer-container, op-ifc-viewer-page, op-bcf-list, [class*='xeokit']");
      for (var i = 0; i < nodes.length; i += 1) {
        var ctx = nodes[i].__ngContext__;
        if (!ctx || !ctx.length) continue;
        for (var j = 0; j < ctx.length; j += 1) {
          inspectObject(ctx[j]);
        }
      }
    }

    window.setInterval(scanNgContexts, 1000);
    scanNgContexts();
  }

  function setupCoreInteractionPerfBridge() {
    if (!isIfcOrBcfPage()) return;
    if (window.__costosIfcCoreInteractionPerfBridgeInstalled) return;
    window.__costosIfcCoreInteractionPerfBridgeInstalled = true;

    window.addEventListener("costos:ifc-core-interaction-perf", function (event) {
      var detail = event && event.detail ? event.detail : {};
      sendPerfTrace("ifc_core_interaction_process", detail);
    });
  }

  function readIfcModelsMetaFromDocument(doc) {
    if (!doc || !doc.querySelector) return null;
    var meta = doc.querySelector('meta[name="openproject_ifc_models"]');
    if (!meta) return null;
    var raw = meta.getAttribute("data-models") || (meta.dataset && meta.dataset.models);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      sendServerLog({ event: "ifc_meta_tag_parse_failed", message: e.message });
      return null;
    }
  }

  function findIfcModelsMeta() {
    var data = readIfcModelsMetaFromDocument(document);
    if (data) return { data: data, source: "document" };
    try {
      if (window.top && window.top.document && window.top.document !== document) {
        data = readIfcModelsMetaFromDocument(window.top.document);
        if (data) return { data: data, source: "top" };
      }
    } catch (e) {
      // ignore cross-origin
    }
    try {
      var iframes = document.querySelectorAll("iframe");
      for (var i = 0; i < iframes.length; i += 1) {
        var frame = iframes[i];
        var doc = null;
        try {
          doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        } catch (e) {
          doc = null;
        }
        if (!doc) continue;
        data = readIfcModelsMetaFromDocument(doc);
        if (data) return { data: data, source: "iframe" };
      }
    } catch (e) {
      // ignore
    }
    return { data: null, source: null };
  }

  function getProjectIdentifierFromPath() {
    var match = window.location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }

  function fetchModelIdFromApi(projectId, done) {
    if (!projectId) return done(null);
    var url = "/api/v3/ifc_models?filters=%5B%7B%22project%22%3A%7B%22operator%22%3A%22%3D%22%2C%22values%22%3A%5B%22" + projectId + "%22%5D%7D%7D%5D";
    fetch(appendShareToken(url), { credentials: "include" })
      .then(function (resp) {
        if (!resp.ok) {
          if (resp.status === 404) apiModelLookupDisabled = true;
          throw new Error("ifc_models http " + resp.status);
        }
        return resp.json();
      })
      .then(function (data) {
        var elements = (data && data._embedded && data._embedded.elements) || [];
        if (!elements.length) return done(null);
        return done(elements[0].id);
      })
      .catch(function () {
        done(null);
      });
  }

  function extractAttachmentId(url) {
    if (!url) return null;
    var match = String(url).match(/\/attachments\/(\d+)\/content/);
    return match ? match[1] : null;
  }

  function tryLoadMetadataFromAttachmentId(attachmentId) {
    if (!attachmentId) return;
    var xktId = String(attachmentId);
    if (metadataLoadDone && currentXktAttachmentId === xktId) return;
    if (currentXktAttachmentId && currentXktAttachmentId !== xktId) {
      advancedMetaData = null;
      advancedMetaIndex = null;
      metadataLoadDone = false;
      currentMetaAttachmentId = null;
      lastInspectorSignature = "";
      lastPollSignature = "";
      metadataLoadStarted = false;
      sendServerLog({ event: "ifc_parallel_meta_reset", reason: "xkt_changed", attachmentId: xktId });
    }
    if (metadataLoadStarted) return;
    metadataLoadStarted = true;
    var resolverUrl = "/costos/ifc_meta?xkt_attachment_id=" + encodeURIComponent(attachmentId);
    if (isEmbedRequest()) resolverUrl += "&embed=true";
    resolverUrl = appendShareToken(resolverUrl);
    fetch(resolverUrl, { credentials: "include" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("resolver http " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (!data || !data.content_url) throw new Error("resolver missing content_url");
        if (data.meta_attachment_id) {
          currentMetaAttachmentId = String(data.meta_attachment_id);
        }
        currentXktAttachmentId = xktId;
        sendServerLog({ event: "ifc_parallel_meta_url_found", url: data.content_url });
        return fetch(appendShareToken(data.content_url), { credentials: "include" });
      })
      .then(function (resp) {
        if (!resp || !resp.ok) throw new Error("parallel metadata http");
        return resp.json();
      })
      .then(function (data) {
        advancedMetaData = data;
        advancedMetaIndex = buildMetaIndex(data);
        metadataLoadDone = true;
        metadataLoadStarted = false;
        sendServerLog({ event: "ifc_parallel_meta_loaded", bytes: JSON.stringify(data).length });
        installInspectorObserver();
        var panel = findInspectorPanel();
        if (panel) {
          updateAdvancedProperties(panel);
        }
      })
      .catch(function (err) {
        metadataLoadStarted = false;
        sendServerLog({ event: "ifc_parallel_meta_failed", message: err.message });
      });
  }

  function pickModelId(meta) {
    if (!meta) return null;
    var shown = meta.shown_models || [];
    var models = meta.models || [];
    if (shown.length > 0) return shown[0];
    if (models.length > 0 && models[0] && models[0].id) return models[0].id;
    return null;
  }

  function pickXktAttachmentId(meta, modelId) {
    if (!meta || !meta.xkt_attachment_ids) return null;
    var map = meta.xkt_attachment_ids;
    if (modelId && map[String(modelId)]) return map[String(modelId)];
    var keys = Object.keys(map);
    if (keys.length > 0) return map[keys[0]];
    return null;
  }

  function normalizeHref(href) {
    if (!href) return "";
    if (href.indexOf("http") === 0) return href;
    return window.location.origin + href;
  }

  function pickParallelMetadataLink(attachments) {
    if (!attachments || !attachments.length) return null;
    for (var i = 0; i < attachments.length; i += 1) {
      var att = attachments[i];
      if (!att) continue;
      var fileName = att.fileName || att.filename || "";
      if (/model_ifcopenshell\.json$/i.test(fileName)) {
        var link = att._links && att._links.content && att._links.content.href;
        if (link) return normalizeHref(link);
      }
    }
    return null;
  }

  function loadParallelMetadata() {
    if (metadataLoadStarted || metadataLoadDone) return;
    if (metadataRetryCount >= metadataRetryMax) return;
    var metaInfo = findIfcModelsMeta();
    var meta = metaInfo.data;

    if (!metaLogSent) {
      if (meta) {
        var modelCount = (meta.models && meta.models.length) || 0;
        var shownCount = (meta.shown_models && meta.shown_models.length) || 0;
        var xktCount = meta.xkt_attachment_ids ? Object.keys(meta.xkt_attachment_ids).length : 0;
        sendServerLog({
          event: "ifc_meta_tag_found",
          source: metaInfo.source,
          modelsCount: modelCount,
          shownCount: shownCount,
          xktCount: xktCount
        });
      } else {
        sendServerLog({
          event: "ifc_meta_tag_missing",
          path: window.location.pathname
        });
      }
      metaLogSent = true;
    }

    var modelId = pickModelId(meta);
    var xktAttachmentId = pickXktAttachmentId(meta, modelId);
    if (!modelId) {
      var projectId = getProjectIdentifierFromPath();
      sendServerLog({
        event: "ifc_parallel_meta_no_model",
        path: window.location.pathname,
        projectId: projectId
      });
      if (xktAttachmentId) {
        tryLoadMetadataFromAttachmentId(xktAttachmentId);
        return;
      }
      if (apiModelLookupDisabled) {
        metadataRetryCount = metadataRetryMax;
        sendServerLog({
          event: "ifc_parallel_meta_stop",
          reason: "ifc_models_endpoint_unavailable"
        });
        return;
      }
      metadataLoadStarted = true;
      fetchModelIdFromApi(projectId, function (fetchedId) {
        if (!fetchedId) {
          metadataRetryCount += 1;
          if (lastXktAttachmentId) {
            tryLoadMetadataFromAttachmentId(lastXktAttachmentId);
            return;
          }
          metadataLoadStarted = false;
          return;
        }
        metadataLoadStarted = false;
        loadParallelMetadataWithId(fetchedId);
      });
      return;
    }

    if (xktAttachmentId) {
      tryLoadMetadataFromAttachmentId(xktAttachmentId);
      return;
    }

    metadataLoadStarted = true;
    loadParallelMetadataWithId(modelId);
  }

  function startMetadataHeartbeat() {
    if (metadataHeartbeatTimer) return;
    metadataHeartbeatTimer = window.setInterval(function () {
      metadataHeartbeatTicks += 1;
      if (!metadataLoadDone && metadataRetryCount < metadataRetryMax) {
        loadParallelMetadata();
      } else if (!inspectorObserver) {
        installInspectorObserver();
      }

      if (metadataHeartbeatTicks >= metadataHeartbeatMaxTicks ||
          (metadataLoadDone && !!inspectorObserver)) {
        window.clearInterval(metadataHeartbeatTimer);
        metadataHeartbeatTimer = null;
      }
    }, 5000);
  }

  function loadParallelMetadataWithId(modelId) {
    if (!modelId) return;
    metadataLoadStarted = true;
    sendServerLog({ event: "ifc_parallel_meta_model", modelId: modelId });

    var modelUrl = "/api/v3/ifc_models/" + modelId;
    fetch(appendShareToken(modelUrl), { credentials: "include" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("ifc_model http " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        var embedded = data && data._embedded && data._embedded.attachments;
        var metaUrl = pickParallelMetadataLink(embedded);
        if (metaUrl) return metaUrl;

        var attachmentsLink = data && data._links && data._links.attachments && data._links.attachments.href;
        if (!attachmentsLink) throw new Error("no attachments link");
        return fetch(appendShareToken(attachmentsLink), { credentials: "include" })
          .then(function (resp) {
            if (!resp.ok) throw new Error("attachments http " + resp.status);
            return resp.json();
          })
          .then(function (listData) {
            var attachments = listData && listData._embedded && listData._embedded.elements;
            return pickParallelMetadataLink(attachments);
          });
      })
      .then(function (metaUrl) {
        if (!metaUrl) throw new Error("parallel metadata not found");
        sendServerLog({ event: "ifc_parallel_meta_url_found", url: metaUrl });
        return fetch(appendShareToken(metaUrl), { credentials: "include" });
      })
      .then(function (resp) {
        if (!resp || !resp.ok) throw new Error("parallel metadata http");
        return resp.json();
      })
      .then(function (data) {
        advancedMetaData = data;
        advancedMetaIndex = buildMetaIndex(data);
        metadataLoadDone = true;
        metadataLoadStarted = false;
        sendServerLog({ event: "ifc_parallel_meta_loaded", bytes: JSON.stringify(data).length });
        installInspectorObserver();
      })
      .catch(function (err) {
        metadataLoadStarted = false;
        sendServerLog({ event: "ifc_parallel_meta_failed", message: err.message });
      });
  }

  function summarizeInspector(panel) {
    if (!panel) return null;
    var rows = panel.querySelectorAll("tr");
    var labels = [];
    for (var i = 0; i < rows.length; i += 1) {
      var cells = rows[i].querySelectorAll("th, td");
      if (!cells || cells.length < 2) continue;
      var label = (cells[0].textContent || "").trim().replace(/:$/, "");
      if (label) labels.push(label);
    }
    return {
      rows: rows.length,
      labels: labels.slice(0, 12)
    };
  }

  function inspectorSignature(panel) {
    if (!panel) return "";
    var rows = panel.querySelectorAll("tr");
    var parts = [];
    for (var i = 0; i < rows.length; i += 1) {
      var cells = rows[i].querySelectorAll("th, td");
      if (!cells || cells.length < 2) continue;
      var label = (cells[0].textContent || "").trim().replace(/:$/, "");
      var value = (cells[1].textContent || "").trim();
      if (!label && !value) continue;
      parts.push(label + "=" + value);
      if (parts.length >= 8) break;
    }
    return parts.join("|");
  }

  function findInspectorPanel() {
    return document.querySelector(".xeokit-properties") ||
      document.querySelector(".xeokit-propertiesTab .xeokit-tab-content") ||
      document.querySelector(".xeokit-propertiesTab") ||
      document.querySelector("[class*='xeokit-properties']");
  }

  function readBasicProperties(panel) {
    var props = {};
    if (!panel) return props;
    var rows = panel.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var cells = row.querySelectorAll("th, td");
      if (!cells || cells.length < 2) continue;
      var label = (cells[0].textContent || "").trim().replace(/:$/, "").toLowerCase();
      var value = (cells[1].textContent || "").trim();
      if (!label || !value) continue;
      if (label === "name") props.name = value;
      if (label === "class") props.className = value;
      if (label === "uuid") props.uuid = value;
      if (label === "viewer id" || label === "viewerid") props.viewerId = value;
    }
    return props;
  }

  function buildMetaIndex(metaData) {
    if (!metaData) return null;
    var index = {
      byId: {},
      byNameType: {},
      byExpressId: {}
    };
    var metaObjects = metaData.metaObjects || {};
    var entries = [];
    if (Array.isArray(metaObjects)) {
      entries = metaObjects;
    } else {
      for (var key in metaObjects) {
        if (!Object.prototype.hasOwnProperty.call(metaObjects, key)) continue;
        var entry = metaObjects[key];
        if (entry && typeof entry === "object") {
          if (!entry.id) entry.id = key;
          entries.push(entry);
        }
      }
    }
    for (var i = 0; i < entries.length; i += 1) {
      var meta = entries[i];
      if (!meta) continue;
      var id = meta.id ? String(meta.id) : "";
      if (id) index.byId[id] = meta;
      var name = meta.name ? String(meta.name).toLowerCase() : "";
      var type = meta.type ? String(meta.type).toLowerCase() : "";
      if (name && type) {
        var keyNameType = name + "|" + type;
        if (!index.byNameType[keyNameType]) index.byNameType[keyNameType] = [];
        index.byNameType[keyNameType].push(meta);
      }
      if (meta.expressId) {
        index.byExpressId[String(meta.expressId)] = meta;
      }
    }
    return index;
  }

  function findMatchingMetaObject(basicProps) {
    if (!advancedMetaIndex || !basicProps) return null;
    var uuid = basicProps.uuid || basicProps.viewerId || "";
    if (uuid && advancedMetaIndex.byId[uuid]) return advancedMetaIndex.byId[uuid];
    var name = basicProps.name ? String(basicProps.name).toLowerCase() : "";
    var klass = basicProps.className ? String(basicProps.className).toLowerCase() : "";
    if (name && klass) {
      var keyNameType = name + "|" + klass;
      if (advancedMetaIndex.byNameType[keyNameType] && advancedMetaIndex.byNameType[keyNameType][0]) {
        return advancedMetaIndex.byNameType[keyNameType][0];
      }
    }
    return null;
  }

  function renderAdvancedProperties(panel, metaObj) {
    if (!panel) return;
    var container = panel.querySelector(".costos-advanced-properties");
    if (!container) {
      container = document.createElement("div");
      container.className = "costos-advanced-properties";
      container.style.marginTop = "12px";
      container.style.borderTop = "1px solid #e5e5e5";
      container.style.paddingTop = "8px";
      container.style.overflowY = "scroll";
      container.style.overflowX = "hidden";
      container.style.scrollbarGutter = "stable";
      container.style.scrollbarWidth = "thin";
      container.style.scrollbarColor = "#9aa0a6 transparent";
      panel.appendChild(container);
      ensureScrollbarStyles();
    }

    container.innerHTML = "";

    if (!metaObj || !advancedMetaData) {
      return;
    }

    var title = document.createElement("div");
    title.textContent = "Advanced Properties";
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";
    container.appendChild(title);

    var psetIds = metaObj.propertySetIds || metaObj.propertySets || [];
    if (!Array.isArray(psetIds) || psetIds.length === 0) {
      var empty = document.createElement("div");
      empty.textContent = "No advanced properties found.";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    var propertySets = advancedMetaData.propertySets || {};
    for (var i = 0; i < psetIds.length; i += 1) {
      var psetId = psetIds[i];
      var pset = propertySets[psetId];
      if (!pset || !pset.properties) continue;

      var psetContainer = document.createElement("div");
      psetContainer.className = "costos-pset";

      var psetTitle = document.createElement("div");
      var psetHeader = document.createElement("button");
      psetHeader.type = "button";
      psetHeader.className = "costos-pset-header";

      var chevron = document.createElement("span");
      chevron.className = "costos-pset-chevron";
      chevron.textContent = ">";
      psetHeader.appendChild(chevron);

      psetTitle.textContent = pset.name || psetId;
      psetTitle.className = "costos-pset-title";
      psetHeader.appendChild(psetTitle);
      psetContainer.appendChild(psetHeader);

      var table = document.createElement("table");
      table.className = "costos-pset-table";
      table.style.display = "none";
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      var props = pset.properties || {};
      Object.keys(props).forEach(function (propKey) {
        var row = document.createElement("tr");
        var keyCell = document.createElement("td");
        keyCell.textContent = propKey;
        keyCell.style.padding = "2px 6px 2px 0";
        keyCell.style.fontSize = "12px";
        keyCell.style.color = "#444";
        var valCell = document.createElement("td");
        valCell.textContent = String(props[propKey]);
        valCell.style.padding = "2px 0";
        valCell.style.fontSize = "12px";
        row.appendChild(keyCell);
        row.appendChild(valCell);
        table.appendChild(row);
      });

      (function (tableRef, chevronRef) {
        psetHeader.addEventListener("click", function () {
          var isOpen = tableRef.style.display !== "none";
          tableRef.style.display = isOpen ? "none" : "table";
          chevronRef.style.transform = isOpen ? "rotate(0deg)" : "rotate(90deg)";
        });
      })(table, chevron);
      psetContainer.appendChild(table);
      container.appendChild(psetContainer);
    }

    adjustAdvancedContainerHeight(container);
  }

  function ensureScrollbarStyles() {
    if (document.getElementById("costos-advanced-scrollbar")) return;
    var style = document.createElement("style");
    style.id = "costos-advanced-scrollbar";
    style.type = "text/css";
    style.textContent = ".costos-advanced-properties::-webkit-scrollbar{width:10px}" +
      ".costos-advanced-properties::-webkit-scrollbar-track{background:transparent}" +
      ".costos-advanced-properties::-webkit-scrollbar-thumb{background:#9aa0a6;border-radius:8px;border:2px solid transparent;background-clip:content-box}" +
      ".costos-pset-header{display:flex;align-items:center;width:100%;padding:4px 6px;margin:6px 0 4px;border-radius:4px;background:#f7f7f7;border:1px solid #e6e6e6;cursor:pointer}"+
      ".costos-pset-title{font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
      ".costos-pset-chevron{display:inline-block;margin-right:6px;font-size:11px;color:#555;transition:transform .15s ease}"+
      ".costos-pset-table td{border-top:1px solid #f0f0f0}";
    document.head.appendChild(style);
  }

  function adjustAdvancedContainerHeight(container) {
    if (!container || !window || !container.getBoundingClientRect) return;
    var rect = container.getBoundingClientRect();
    var maxHeight = Math.max(160, window.innerHeight - rect.top - 16);
    container.style.maxHeight = String(maxHeight) + "px";
  }

  function updateAdvancedProperties(panel) {
    if (!panel || !advancedMetaIndex) return;
    var basic = readBasicProperties(panel);
    var metaObj = findMatchingMetaObject(basic);
    sendServerLog({
      event: "ifc_parallel_meta_match",
      uuid: basic.uuid || null,
      viewerId: basic.viewerId || null,
      name: basic.name || null,
      className: basic.className || null,
      matched: !!metaObj,
      matchedId: metaObj && metaObj.id ? String(metaObj.id) : null
    });
    renderAdvancedProperties(panel, metaObj);
  }

  function installInspectorObserver() {
    var panel = findInspectorPanel();
    if (!panel) return;

    if (inspectorObserver && inspectorPanel === panel) return;
    if (inspectorObserver) {
      try {
        inspectorObserver.disconnect();
      } catch (e) {
        // ignore
      }
      inspectorObserver = null;
    }

    inspectorPanel = panel;
    lastInspectorSignature = "";

    inspectorObserver = new MutationObserver(function () {
      var summary = summarizeInspector(panel);
      if (!summary) return;
      var signature = summary.rows + ":" + inspectorSignature(panel);
      if (signature === lastInspectorSignature) return;
      lastInspectorSignature = signature;
      logLocal("properties updated rows=" + summary.rows);
      sendServerLog({
        event: "ifc_inspect_properties_update",
        rows: summary.rows,
        labels: summary.labels
      });
      updateAdvancedProperties(panel);
    });

    inspectorObserver.observe(panel, { childList: true, subtree: true, characterData: true });
    sendServerLog({ event: "ifc_inspect_observer_attached" });
  }

  function logContextMenu(menu) {
    if (!menu) return;
    var items = menu.querySelectorAll("li, button, a, div");
    var labels = [];
    for (var i = 0; i < items.length; i += 1) {
      var text = (items[i].textContent || "").trim();
      if (!text) continue;
      labels.push(text.replace(/\s+/g, " ").slice(0, 80));
      if (labels.length >= 12) break;
    }
    if (!labels.length) return;
    sendServerLog({
      event: "ifc_contextmenu_items",
      labels: labels
    });
  }

  function tryLogContextMenu() {
    var menu = document.querySelector(".xeokit-context-menu");
    logContextMenu(menu);
  }

  if (ENABLE_HEAVY_INSPECT) {
    document.addEventListener('contextmenu', function (event) {
      try {
        var target = event.target;
        var cls = (target && target.className) ? String(target.className) : "";
        sendServerLog({
          event: "ifc_contextmenu",
          tag: target && target.tagName,
          className: cls.slice(0, 120)
        });
        logLocal("contextmenu on " + (target && target.tagName));
        window.setTimeout(installInspectorObserver, 50);
        window.setTimeout(installInspectorObserver, 300);
        window.setTimeout(tryLogContextMenu, 50);
        window.setTimeout(tryLogContextMenu, 200);
        window.setTimeout(loadParallelMetadata, 50);
      } catch (e) {
        // ignore
      }
    }, true);

    // Observe additions to catch xeokit context menu rendering
    try {
      var menuObserver = new MutationObserver(function () {
        tryLogContextMenu();
      });
      menuObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {
      // ignore
    }
  }

  // Try to attach immediately for already-open inspector
  window.setTimeout(installInspectorObserver, 500);
  window.setTimeout(loadParallelMetadata, 800);
  // Retry metadata loading a few times in case meta tag is late
  window.setTimeout(loadParallelMetadata, 1500);
  window.setTimeout(loadParallelMetadata, 3000);

  // Bounded fallback retries to avoid permanent background polling on BCF pages.
  startMetadataHeartbeat();
  setupPerfOverlay();
  setupInteractionTrace();
  setupBusyTrace();
  setupCorePerfHooks();
  setupCoreInteractionPerfBridge();

  if (ENABLE_HEAVY_INSPECT) {
    window.setInterval(function () {
      if (!metadataLoadDone) return;
      installInspectorObserver();
      var panel = findInspectorPanel();
      if (!panel) return;
      var signature = inspectorSignature(panel);
      if (signature && signature !== lastPollSignature) {
        lastPollSignature = signature;
        updateAdvancedProperties(panel);
      }
    }, 3000);
  }

  window.addEventListener("resize", function () {
    var panel = findInspectorPanel();
    if (!panel) return;
    var container = panel.querySelector(".costos-advanced-properties");
    if (!container) return;
    adjustAdvancedContainerHeight(container);
  });

  if ((ENABLE_HEAVY_INSPECT || ENABLE_XKT_SNIFF) && window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = (typeof input === "string") ? input : (input && input.url) || "";

      // On IFC/BCF pages, IA settings endpoints are noisy (500/retries) and
      // can cause noticeable main-thread stalls. Return a cheap empty JSON.
      if (isIfcOrBcfPage() && isIaColabSettingsUrl(url)) {
        var stub = makeEmptyJsonResponse();
        if (stub) return Promise.resolve(stub);
      }

      if (ENABLE_HEAVY_INSPECT && shouldAppendShareToken(url)) {
        if (typeof input === "string") {
          input = appendShareToken(url);
          url = input;
        } else if (input && input.url) {
          try {
            var updated = appendShareToken(url);
            input = new Request(updated, input);
            url = updated;
          } catch (e) {
            // ignore
          }
        }
      }
      var attachmentId = extractAttachmentId(url);
      if (attachmentId) {
        lastXktAttachmentId = attachmentId;
        sendServerLog({ event: "ifc_xkt_attachment_detected", attachmentId: attachmentId });
        tryLoadMetadataFromAttachmentId(attachmentId);
      }
      return originalFetch.call(this, input, init);
    };
  }

  if ((ENABLE_HEAVY_INSPECT || ENABLE_XKT_SNIFF) && window.XMLHttpRequest) {
    var originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (ENABLE_HEAVY_INSPECT && shouldAppendShareToken(url)) {
        url = appendShareToken(url);
      }
      var attachmentId = extractAttachmentId(url);
      if (attachmentId) {
        lastXktAttachmentId = attachmentId;
        sendServerLog({ event: "ifc_xkt_attachment_detected", attachmentId: attachmentId });
        tryLoadMetadataFromAttachmentId(attachmentId);
      }
      var args = Array.prototype.slice.call(arguments);
      args[1] = url;
      return originalOpen.apply(this, args);
    };
  }

  window.CostosIfcInspectLogger = {
    installInspectorObserver: installInspectorObserver,
    loadParallelMetadata: loadParallelMetadata
  };
})();
