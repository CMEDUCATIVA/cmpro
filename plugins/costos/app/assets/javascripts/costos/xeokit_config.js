/* global window, document, fetch */
(function () {
  if (window.CostosXeokitConfig) return;

  var CONFIG = {
    viewerConfigs: {
      cameraNear: 0.01,
      cameraFar: 20000.0,
      smartPivot: true,
      saoEnabled: false,
      saoBias: 0.39,
      saoIntensity: 0.1,
      saoNumSamples: 8,
      saoKernelRadius: 32,
      saoBlur: true,
      edgesEnabled: false,
      xrayContext: true,
      xrayPickable: false,
      pbrEnabled: false,
      scaleCanvasResolution: true,
      selectedGlowThrough: true,
      highlightGlowThrough: true,
      backgroundColor: [0.98, 0.985, 0.99],
      externalMetadata: false,
      dtxEnabled: false
    },
    debug: false
  };
  var PERF_DEBUG = !!window.COSTOS_PERF_DEBUG;
  var HEAVY_MODEL_RESOLUTION_SCALE = 0.5;
  var PERF_PREFIX = "[COSTOS-PERF][xeokit_config]";
  var PERF_MUTATION_HITS = 0;
  var PERF_LATE_TICKS = 0;
  var LIGHT_VIEWER_DISCOVERY = window.COSTOS_LIGHT_VIEWER_DISCOVERY !== false;
  var MODELS_DEBUG = modelsDebugEnabled();
  var MODELS_TRACE = window.COSTOS_MODELS_TRACE !== false;
  var MODELS_AUTO_HARD_RELOAD = window.COSTOS_MODELS_AUTO_HARD_RELOAD !== false;
  var modelsDebugObserverInstalled = false;
  var modelsDebugLastSignature = "";
  var modelsTraceLastKey = "";
  var modelsTraceLastAt = 0;
  window.__costosModelsDebugHistory = window.__costosModelsDebugHistory || [];
  // Backward-compatible alias (singular "Model") used in some manual console checks.
  window.__costosModelDebugHistory = window.__costosModelsDebugHistory;
  window.CostosPerfState = window.CostosPerfState || {};
  window.CostosPerfState.xeokitConfig = window.CostosPerfState.xeokitConfig || {
    mutationHits: 0,
    lateTicks: 0,
    observerActive: false
  };

  function modelsDebugEnabled() {
    try {
      if (window.COSTOS_MODELS_DEBUG) return true;
    } catch (e) {
      // ignore
    }
    try {
      var params = new URLSearchParams(window.location.search || "");
      var value = params.get("costos_models_debug");
      if (value === "1" || value === "true") return true;
    } catch (e2) {
      // ignore
    }
    try {
      return !!(window.localStorage && window.localStorage.getItem("costos_models_debug") === "1");
    } catch (e3) {
      return false;
    }
  }

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function sendServerLog(payload) {
    if (!window.COSTOS_XEOKIT_DEBUG) return;
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

  function postModelsTrace(event, data) {
    if (!MODELS_TRACE || !window.fetch) return;
    var now = Date.now();
    var serialized = "";
    try {
      serialized = JSON.stringify(data || {});
    } catch (e0) {
      serialized = String(data);
    }
    var key = String(event) + "|" + serialized;
    if (key === modelsTraceLastKey && (now - modelsTraceLastAt) < 1200) return;
    modelsTraceLastKey = key;
    modelsTraceLastAt = now;

    try {
      window.fetch('/costos/ifc_log', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken()
        },
        body: JSON.stringify({
          event: 'ifc_models_trace',
          category: 'models_panel',
          message: event,
          detail: serialized
        })
      });
    } catch (e) {
      // ignore logging failures
    }
  }

  function hardReloadOnceForModels(reason) {
    if (!MODELS_AUTO_HARD_RELOAD) return false;
    try {
      var key = "costos_models_hard_reload_done:" + String(window.location.pathname || "");
      if (window.sessionStorage && window.sessionStorage.getItem(key) === "1") {
        postModelsTrace("models_hard_reload_skip_already_done", { reason: reason || "unknown" });
        return false;
      }
      if (window.sessionStorage) window.sessionStorage.setItem(key, "1");
    } catch (e0) {
      // ignore storage errors
    }

    postModelsTrace("models_hard_reload_trigger", { reason: reason || "unknown" });
    window.setTimeout(function () {
      try {
        window.location.reload();
      } catch (e1) {
        // ignore reload errors
      }
    }, 120);
    return true;
  }

  function debugLog(message, data) {
    if (!CONFIG.debug || !window.console || typeof window.console.info !== 'function') return;
    try {
      if (typeof data !== 'undefined') {
        window.console.info('[CostosXeokit]', message, data);
      } else {
        window.console.info('[CostosXeokit]', message);
      }
    } catch (e) {
      // ignore
    }
  }

  function perfLog(event, data) {
    if (!PERF_DEBUG || !window.console || typeof window.console.log !== 'function') return;
    try {
      window.console.log(PERF_PREFIX + " " + event, data || {});
    } catch (e) {
      // ignore
    }
  }

  function modelsDebugLog(event, data) {
    if (!MODELS_DEBUG) return;
    try {
      window.__costosModelsDebugHistory.push({
        at: Date.now(),
        event: event,
        data: data || {}
      });
      if (window.__costosModelsDebugHistory.length > 120) {
        window.__costosModelsDebugHistory.shift();
      }
      window.__costosModelDebugHistory = window.__costosModelsDebugHistory;
    } catch (e0) {
      // ignore
    }
    try {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[COSTOS-MODELS] " + event, data || {});
      }
    } catch (e) {
      // ignore
    }
    try {
      sendServerLog({
        event: "ifc_models_debug",
        message: event + " " + formatMessage(data || {})
      });
    } catch (e2) {
      // ignore
    }
  }

  function formatMessage(data) {
    if (!data) return null;
    try {
      return JSON.stringify(data);
    } catch (e) {
      return String(data);
    }
  }

  function summarizeNgContext(element) {
    var ctx = element && element.__ngContext__;
    if (!ctx || !ctx.length) return null;
    var samples = [];
    for (var i = 0; i < ctx.length; i += 1) {
      var entry = ctx[i];
      if (!entry || typeof entry !== 'object') continue;
      var ctor = entry.constructor && entry.constructor.name;
      var keys = [];
      for (var k in entry) {
        if (!Object.prototype.hasOwnProperty.call(entry, k)) continue;
        if (keys.length >= 8) break;
        keys.push(k);
      }
      samples.push({ ctor: ctor || 'unknown', keys: keys });
      if (samples.length >= 6) break;
    }
    return { entries: ctx.length, samples: samples };
  }

  function findViewerInNgContext(element) {
    var ctx = element && element.__ngContext__;
    if (!ctx || !ctx.length) return null;
    for (var i = 0; i < ctx.length; i += 1) {
      var entry = ctx[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.viewer && entry.viewer.scene) return entry.viewer;
      if (entry.xeokitViewer && entry.xeokitViewer.scene) return entry.xeokitViewer;
      if (entry.ifcViewerService && entry.ifcViewerService.viewer) return entry.ifcViewerService.viewer;
      if (entry.viewer && typeof entry.viewer.setConfig === 'function') return entry.viewer;
      var ctor = entry.constructor && entry.constructor.name;
      if (ctor && ctor.indexOf('IFCViewerService') !== -1 && entry.viewer) return entry.viewer;
    }
    return null;
  }

  function findComponentInNgContext(element) {
    if (!element) return null;
    var ctx = element.__ngContext__;
    if (!ctx || !ctx.length) return null;
    for (var i = 0; i < ctx.length; i += 1) {
      var entry = ctx[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.ifcViewerService) return entry;
      if (entry.viewer && entry.viewer.scene) return entry;
      if (entry.viewer && typeof entry.viewer.saveBCFViewpoint === 'function') return entry;
      if (entry.viewer && typeof entry.viewer.loadBCFViewpoint === 'function') return entry;
      var ctor = entry.constructor && entry.constructor.name;
      if (ctor && ctor.indexOf('IFCViewer') !== -1) return entry;
    }
    return null;
  }

  function findViewerOnElement(element) {
    if (!element) return null;
    var candidates = [
      'viewer',
      'ifcViewerService',
      'bimViewer',
      'xeokitViewer',
      '__xeokitViewer',
      '__viewer',
      '_viewer'
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var key = candidates[i];
      try {
        if (element[key]) return element[key];
      } catch (e) {
        // ignore
      }
    }
    return null;
  }

  function findViewerInShadowRoot(host) {
    if (!host || !host.shadowRoot) return null;
    var nodes = host.shadowRoot.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i += 1) {
      var comp = findComponentInNgContext(nodes[i]);
      if (comp && comp.ifcViewerService) return comp.ifcViewerService;
      var maybeViewer = findViewerOnElement(nodes[i]);
      if (maybeViewer && maybeViewer.viewer) return maybeViewer;
    }
    return null;
  }

  var lastViewerService = null;

  function resolveViewerFromService(service, source) {
    if (!service) return null;
    lastViewerService = service;
    if (service.viewer) return { viewer: service.viewer, source: source || 'service' };
    return null;
  }

  function findBimViewerFromAngularDocument(doc, win, sourcePrefix) {
    if (!doc) return null;
    var host = doc.querySelector('op-ifc-viewer') ||
      doc.querySelector('.op-ifc-viewer') ||
      doc.querySelector('[data-test-selector="op-ifc-viewer-container"]') ||
      doc.querySelector('.op-ifc-viewer-container');
    if (host) {
      var ctxViewer = findViewerInNgContext(host);
      if (ctxViewer) return { viewer: ctxViewer, source: (sourcePrefix || 'ngContextViewer') };
      var hostViewer = findViewerOnElement(host);
      if (hostViewer && hostViewer.viewer) {
        return { viewer: hostViewer.viewer, source: (sourcePrefix || 'hostProp') };
      }
      var shadowService = findViewerInShadowRoot(host);
      if (shadowService && shadowService.viewer) {
        return { viewer: shadowService.viewer, source: (sourcePrefix || 'shadowProp') };
      }
    }
    var comp = findComponentInNgContext(host);
    if (comp && comp.ifcViewerService) {
      var resolved = resolveViewerFromService(comp.ifcViewerService, (sourcePrefix || 'ngContext'));
      if (resolved) return resolved;
    }

    try {
      if (win && win.ng && typeof win.ng.getComponent === 'function') {
        var ngComp = win.ng.getComponent(host);
        if (ngComp && ngComp.ifcViewerService) {
          var resolvedNg = resolveViewerFromService(ngComp.ifcViewerService, (sourcePrefix || 'ngGetComponent'));
          if (resolvedNg) return resolvedNg;
        }
        if (ngComp && ngComp.viewer) {
          return { viewer: ngComp.viewer, source: (sourcePrefix || 'ngGetComponentViewer') };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  function scanForBimViewerInNodes(nodes, limit, sourcePrefix) {
    if (!nodes) return null;
    var max = Math.min(nodes.length, limit || 800);
    for (var i = 0; i < max; i += 1) {
      var comp = findComponentInNgContext(nodes[i]);
      if (comp && comp.ifcViewerService) {
        var resolved = resolveViewerFromService(comp.ifcViewerService, (sourcePrefix || 'ngScan'));
        if (resolved) return resolved;
      }
      var maybeViewer = findViewerOnElement(nodes[i]);
      if (maybeViewer && maybeViewer.viewer) {
        return { viewer: maybeViewer.viewer, source: (sourcePrefix || 'nodeProp') };
      }
      if (comp && comp.viewer && (typeof comp.setConfigs === 'function' || typeof comp.setConfig === 'function')) {
        return { viewer: comp, source: (sourcePrefix || 'ngScanViewer') };
      }
      if (comp && comp.viewer && comp.viewer.scene) {
        return { viewer: comp.viewer, source: (sourcePrefix || 'ngScanViewerProp') };
      }
    }
    return null;
  }

  function scanForBimViewer(limit) {
    return scanForBimViewerInNodes(document.querySelectorAll('*'), limit, 'ngScan');
  }

  function scanWindowForViewerOnWindow(win, sourcePrefix) {
    try {
      var keys = Object.keys(win || {});
      var max = Math.min(keys.length, 2000);
      for (var i = 0; i < max; i += 1) {
        var key = keys[i];
        var val = null;
        try {
          val = win[key];
        } catch (e) {
          val = null;
        }
        if (!val || typeof val !== 'object') continue;
        if (val.viewer && val.viewer.scene) return { viewer: val, source: (sourcePrefix || 'windowProp') };
        if (val.scene && val.cameraControl) return { viewer: val, source: (sourcePrefix || 'windowViewer') };
        if ((typeof val.setConfigs === 'function' || typeof val.setConfig === 'function') && val.scene) {
          return { viewer: val, source: (sourcePrefix || 'windowViewerConfig') };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  function scanWindowForViewer() {
    return scanWindowForViewerOnWindow(window, 'window');
  }

  function findGlobalBimViewer() {
    var direct = window.opXeokitViewer || window.__costosXeokitViewer || null;
    if (direct && (direct.scene || (direct.viewer && direct.viewer.scene))) {
      return { viewer: direct, source: 'global' };
    }
    return null;
  }

  function tryFindBimViewer() {
    var found = findGlobalBimViewer();
    if (found && found.viewer) return found;
    found = findBimViewerFromAngularDocument(document, window, 'ngContext');
    if (found && found.viewer) return found;
    if (LIGHT_VIEWER_DISCOVERY) {
      if (lastViewerService && lastViewerService.viewer) {
        return { viewer: lastViewerService.viewer, source: 'cachedService' };
      }
      return null;
    }
    found = scanForBimViewer(1200);
    if (found && found.viewer) return found;
    found = scanWindowForViewer();
    if (found && found.viewer) return found;
    try {
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i += 1) {
        var frame = iframes[i];
        var doc = null;
        var win = null;
        try {
          win = frame.contentWindow;
          doc = frame.contentDocument || (win && win.document);
        } catch (e) {
          doc = null;
          win = null;
        }
        if (!doc) continue;
        found = findBimViewerFromAngularDocument(doc, win, 'iframeNgContext');
        if (found && found.viewer) return found;
        found = scanForBimViewerInNodes(doc.querySelectorAll('*'), 800, 'iframeScan');
        if (found && found.viewer) return found;
        found = scanWindowForViewerOnWindow(win, 'iframeWindow');
        if (found && found.viewer) return found;
      }
    } catch (e) {
      // ignore
    }
    if (lastViewerService && lastViewerService.viewer) {
      return { viewer: lastViewerService.viewer, source: 'cachedService' };
    }
    return null;
  }

  function findCanvasHost() {
    var canvases = document.querySelectorAll('canvas');
    if (!canvases || !canvases.length) return null;
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < canvases.length; i += 1) {
      var rect = canvases[i].getBoundingClientRect();
      var area = rect.width * rect.height;
      if (area > bestArea) {
        best = canvases[i];
        bestArea = area;
      }
    }
    return best && best.parentElement ? best.parentElement : null;
  }

  function findViewerByCanvas(canvas) {
    if (!canvas) return null;
    var win = window;
    var keys = Object.keys(win || {});
    var max = Math.min(keys.length, 2500);
    for (var i = 0; i < max; i += 1) {
      var key = keys[i];
      var lower = String(key).toLowerCase();
      if (lower.indexOf('xeokit') === -1 && lower.indexOf('bim') === -1) continue;
      var val = null;
      try {
        val = win[key];
      } catch (e) {
        val = null;
      }
      if (!val || typeof val !== 'object') continue;
      if (val.canvas === canvas && (val.scene || val.cameraControl)) return val;
      if (val.scene && val.scene.canvas === canvas) return val;
      if (val.viewer && val.viewer.canvas === canvas) return val.viewer;
      if (val.viewer && val.viewer.scene && val.viewer.scene.canvas === canvas) return val.viewer;
      if (val.scene && val.cameraControl && val.scene.canvas) return val;
    }
    return null;
  }

  function findViewerByCanvasDeep(canvas) {
    if (!canvas) return null;
    var win = window;
    var keys = Object.keys(win || {});
    var max = Math.min(keys.length, 3500);
    for (var i = 0; i < max; i += 1) {
      var key = keys[i];
      var val = null;
      try {
        val = win[key];
      } catch (e) {
        val = null;
      }
      if (!val || typeof val !== 'object') continue;
      try {
        if (val.scene && val.cameraControl && val.scene.canvas === canvas) return val;
        if (val.viewer && val.viewer.scene && val.viewer.scene.canvas === canvas) return val.viewer;
      } catch (e2) {
        // ignore
      }
    }
    return null;
  }

  function observeCanvasHost() {
    if (LIGHT_VIEWER_DISCOVERY && findGlobalBimViewer()) return;
    if (window.__costosCanvasObserver) return;
    window.CostosPerfState.xeokitConfig.observerActive = true;
    var lastRunAt = 0;
    try {
      var observer = new MutationObserver(function () {
        PERF_MUTATION_HITS += 1;
        window.CostosPerfState.xeokitConfig.mutationHits = PERF_MUTATION_HITS;
        if (PERF_DEBUG && PERF_MUTATION_HITS % 25 === 0) {
          perfLog("mutation_hit", { hit: PERF_MUTATION_HITS });
        }
        var now = Date.now();
        if (now - lastRunAt < 1000) return;
        lastRunAt = now;

        if (lastBimViewer && lastBimViewer.__costosConfigApplied) {
          perfLog("observer_disconnect_config_applied", {});
          try { observer.disconnect(); } catch (e0) { /* ignore */ }
          window.__costosCanvasObserver = null;
          window.CostosPerfState.xeokitConfig.observerActive = false;
          return;
        }

        var host = findCanvasHost();
        if (host) {
          var ctxViewer = findViewerInNgContext(host);
          if (ctxViewer) {
            applyViewerConfigs(ctxViewer);
            debugLog('viewer found via ngContext', 'mutationObserver');
            if (ctxViewer.__costosConfigApplied) {
              perfLog("observer_disconnect_via_ngContext", {});
              try { observer.disconnect(); } catch (e1) { /* ignore */ }
              window.__costosCanvasObserver = null;
              window.CostosPerfState.xeokitConfig.observerActive = false;
              return;
            }
          }
          var canvas = host.querySelector('canvas');
          if (canvas) {
            // Avoid expensive deep scans on every DOM mutation.
            var viewer = findViewerOnElement(canvas) || findViewerByCanvas(canvas);
            if (viewer) {
              applyViewerConfigs(viewer);
              debugLog('viewer found via canvas', 'mutationObserver');
              if (viewer.__costosConfigApplied) {
                perfLog("observer_disconnect_via_canvas", {});
                try { observer.disconnect(); } catch (e2) { /* ignore */ }
                window.__costosCanvasObserver = null;
                window.CostosPerfState.xeokitConfig.observerActive = false;
              }
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.__costosCanvasObserver = observer;
      debugLog('canvas observer attached');
    } catch (e) {
      // ignore
    }
  }

  function wrapViewerConstructor(obj, key, label) {
    if (!obj || !obj[key] || obj[key].__costosWrapped) return;
    var Original = obj[key];
    function Wrapped() {
      var instance = new (Function.prototype.bind.apply(Original, [null].concat([].slice.call(arguments))))();
      try {
        applyViewerConfigs(instance);
        debugLog('viewer wrapped constructor applied', label || key);
      } catch (e) {
        // ignore
      }
      return instance;
    }
    Wrapped.prototype = Original.prototype;
    for (var prop in Original) {
      if (!Object.prototype.hasOwnProperty.call(Original, prop)) continue;
      try {
        Wrapped[prop] = Original[prop];
      } catch (e) {
        // ignore
      }
    }
    Wrapped.__costosWrapped = true;
    obj[key] = Wrapped;
  }

  function hookXeokitGlobals() {
    var candidates = [
      { obj: window.xeokit, key: 'Viewer', label: 'window.xeokit.Viewer' },
      { obj: window.Xeokit, key: 'Viewer', label: 'window.Xeokit.Viewer' },
      { obj: window.xeokitViewer, key: 'Viewer', label: 'window.xeokitViewer.Viewer' },
      { obj: window.BimViewer, key: 'Viewer', label: 'window.BimViewer.Viewer' },
      { obj: window.xeokitBimViewer, key: 'Viewer', label: 'window.xeokitBimViewer.Viewer' }
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      wrapViewerConstructor(candidates[i].obj, candidates[i].key, candidates[i].label);
    }
  }

  function watchGlobal(prop, handler) {
    if (window[prop]) {
      handler(window[prop]);
      return;
    }
    try {
      Object.defineProperty(window, prop, {
        configurable: true,
        enumerable: true,
        get: function () { return undefined; },
        set: function (val) {
          try {
            delete window[prop];
            window[prop] = val;
          } catch (e) {
            // ignore
          }
          handler(val);
        }
      });
    } catch (e) {
      // ignore
    }
  }

  var lastBimViewer = null;
  var modelPerfState = {
    viewer: null,
    running: false,
    rafCount: 0,
    rafLoopId: null,
    fps: 0,
    lastFpsTs: 0,
    sampleTimer: null,
    samples: []
  };

  function readIfcModelsMeta() {
    var meta = document.querySelector('meta[name="openproject_ifc_models"]');
    if (!meta) return null;
    var raw = meta.getAttribute('data-models') || (meta.dataset && meta.dataset.models);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function getCurrentModelIdHint() {
    var meta = readIfcModelsMeta();
    if (meta && meta.shown_models && meta.shown_models.length) return String(meta.shown_models[0]);
    var url = window.location.href || '';
    var m = url.match(/\/ifc_models\/(\d+)/);
    if (m) return m[1];
    return null;
  }

  function firstNumber(values) {
    for (var i = 0; i < values.length; i += 1) {
      var n = values[i];
      if (typeof n === 'number' && !isNaN(n)) return n;
    }
    return null;
  }

  function sumNumbersFromMap(mapObj, candidateKeys) {
    if (!mapObj) return null;
    var keys = Object.keys(mapObj);
    if (!keys.length) return null;
    var total = 0;
    var found = false;
    for (var i = 0; i < keys.length; i += 1) {
      var item = mapObj[keys[i]];
      if (!item) continue;
      for (var j = 0; j < candidateKeys.length; j += 1) {
        var n = item[candidateKeys[j]];
        if (typeof n === 'number' && !isNaN(n)) {
          total += n;
          found = true;
          break;
        }
      }
    }
    return found ? total : null;
  }

  function safeRead(obj, path) {
    try {
      var cur = obj;
      for (var i = 0; i < path.length; i += 1) {
        if (cur == null) return null;
        cur = cur[path[i]];
      }
      return cur;
    } catch (e) {
      return null;
    }
  }

  function collectModelPerfSample() {
    var viewer = modelPerfState.viewer;
    if (!viewer) return null;

    var scene = viewer.scene || safeRead(viewer, ['viewer', 'scene']) || null;
    var canvas = safeRead(scene, ['canvas', 'canvas']) || safeRead(viewer, ['canvas']) || null;
    var renderer = safeRead(scene, ['_renderer']) || safeRead(viewer, ['_renderer']) || null;
    var rendererStats = safeRead(renderer, ['stats']) || safeRead(renderer, ['_stats']) || null;
    var stats = safeRead(scene, ['stats']) || safeRead(viewer, ['stats']) || null;
    var metrics = safeRead(scene, ['metrics']) || safeRead(viewer, ['metrics']) || null;

    var objectsMap = safeRead(scene, ['objects']);
    var modelsMap = safeRead(scene, ['models']);
    var objectCount = objectsMap ? Object.keys(objectsMap).length : firstNumber([
      safeRead(scene, ['numObjects']),
      safeRead(stats, ['numObjects']),
      safeRead(metrics, ['numObjects'])
    ]);
    var modelIds = modelsMap ? Object.keys(modelsMap) : [];
    var modelCount = modelIds.length ? modelIds.length : firstNumber([
      safeRead(scene, ['numModels']),
      safeRead(stats, ['numModels']),
      safeRead(metrics, ['numModels'])
    ]);

    var triByModels = sumNumbersFromMap(modelsMap, [
      'numTriangles',
      'triangles',
      'numTris',
      'totalTriangles'
    ]);

    var triCount = firstNumber([
      triByModels,
      safeRead(scene, ['numTriangles']),
      safeRead(stats, ['numTriangles']),
      safeRead(metrics, ['numTriangles']),
      safeRead(rendererStats, ['numTriangles']),
      safeRead(rendererStats, ['triangles'])
    ]);
    var drawCalls = firstNumber([
      safeRead(stats, ['drawCalls']),
      safeRead(metrics, ['drawCalls']),
      safeRead(rendererStats, ['drawCalls']),
      safeRead(rendererStats, ['numDrawCalls'])
    ]);

    var width = canvas && canvas.width ? canvas.width : null;
    var height = canvas && canvas.height ? canvas.height : null;
    var dpr = window.devicePixelRatio || 1;
    var stamp = Date.now();

    return {
      ts: stamp,
      modelIdHint: getCurrentModelIdHint(),
      loadedModelIds: modelIds.slice(0, 5),
      fps: modelPerfState.fps,
      objects: objectCount,
      models: modelCount,
      triangles: triCount,
      drawCalls: drawCalls,
      canvasWidth: width,
      canvasHeight: height,
      dpr: dpr
    };
  }

  function modelPerfRafLoop(ts) {
    if (!modelPerfState.running) return;
    modelPerfState.rafCount += 1;
    if (!modelPerfState.lastFpsTs) modelPerfState.lastFpsTs = ts;
    if (ts - modelPerfState.lastFpsTs >= 1000) {
      modelPerfState.fps = Math.round(modelPerfState.rafCount * 1000 / (ts - modelPerfState.lastFpsTs));
      modelPerfState.rafCount = 0;
      modelPerfState.lastFpsTs = ts;
    }
    modelPerfState.rafLoopId = window.requestAnimationFrame(modelPerfRafLoop);
  }

  function startModelPerf(viewer) {
    if (viewer) modelPerfState.viewer = viewer;
    if (!modelPerfState.viewer || modelPerfState.running) return false;

    modelPerfState.running = true;
    modelPerfState.rafCount = 0;
    modelPerfState.fps = 0;
    modelPerfState.lastFpsTs = 0;
    modelPerfState.rafLoopId = window.requestAnimationFrame(modelPerfRafLoop);
    modelPerfState.sampleTimer = window.setInterval(function () {
      var sample = collectModelPerfSample();
      if (!sample) return;
      modelPerfState.samples.push(sample);
      if (modelPerfState.samples.length > 180) modelPerfState.samples.shift();
      if (window.COSTOS_PERF_DEBUG && window.console && typeof window.console.log === 'function') {
        window.console.log('[COSTOS-MODEL-PERF] sample', sample);
      }
    }, 2000);
    return true;
  }

  function stopModelPerf() {
    modelPerfState.running = false;
    if (modelPerfState.rafLoopId) {
      window.cancelAnimationFrame(modelPerfState.rafLoopId);
      modelPerfState.rafLoopId = null;
    }
    if (modelPerfState.sampleTimer) {
      window.clearInterval(modelPerfState.sampleTimer);
      modelPerfState.sampleTimer = null;
    }
    return true;
  }

  function isFpsHudPreferred() {
    try {
      if (typeof window.COSTOS_FPS_HUD === 'boolean') return window.COSTOS_FPS_HUD;
      return window.localStorage && window.localStorage.getItem('costos_fps_hud') === '1';
    } catch (e) {
      return !!window.COSTOS_FPS_HUD;
    }
  }

  function persistFpsHudPreference(enabled) {
    window.COSTOS_FPS_HUD = !!enabled;
    try {
      if (!window.localStorage) return;
      if (enabled) window.localStorage.setItem('costos_fps_hud', '1');
      else window.localStorage.removeItem('costos_fps_hud');
    } catch (e) {
      // ignore
    }
  }

  function syncFpsHudPreference(viewer) {
    var enabled = isFpsHudPreferred();
    window.COSTOS_FPS_HUD = enabled;
    if (!viewer) return enabled;
    if (enabled) ensureFpsHud(viewer);
    else removeFpsHud(viewer);
    return enabled;
  }

  function ensureFpsHud(viewer) {
    if (!viewer || viewer.__costosFpsHudTimer) return;
    if (window.COSTOS_FPS_HUD === false) return;

    var canvasEl = safeRead(viewer, ['scene', 'canvas', 'canvas']) || null;
    if (!canvasEl || !canvasEl.parentElement) return;
    var host = canvasEl.parentElement;
    try {
      var hostStyle = window.getComputedStyle(host);
      if (hostStyle && hostStyle.position === 'static') {
        host.style.position = 'relative';
      }
    } catch (e) {
      // ignore
    }

    var hud = document.createElement('div');
    hud.className = 'costos-fps-hud';
    hud.style.position = 'absolute';
    hud.style.left = '8px';
    hud.style.top = '8px';
    hud.style.zIndex = '50';
    hud.style.padding = '3px 6px';
    hud.style.borderRadius = '4px';
    hud.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    hud.style.fontSize = '11px';
    hud.style.fontWeight = '600';
    hud.style.letterSpacing = '0.2px';
    hud.style.background = 'rgba(0, 0, 0, 0.62)';
    hud.style.color = '#c8ffbf';
    hud.style.pointerEvents = 'none';
    hud.style.userSelect = 'none';
    hud.style.whiteSpace = 'pre';
    hud.style.lineHeight = '1.35';
    hud.textContent = 'FPS --';
    host.appendChild(hud);

    viewer.__costosFpsHudEl = hud;
    viewer.__costosFpsHudTimer = window.setInterval(function () {
      try {
        var fps = modelPerfState.fps || 0;
        var scale = safeRead(viewer, ['scene', 'canvas', 'resolutionScale']);
        var objectsMap = safeRead(viewer, ['scene', 'objects']);
        var count = objectsMap ? Object.keys(objectsMap).length : null;
        var perfHudState = window.__costosIfcPerfHudState || {};
        var slow = perfHudState.lastSlowProcess || null;
        var frame = perfHudState.lastFrameSummary || null;
        var frameFlow = perfHudState.lastFrameFlowSummary || null;
        var tickState = perfHudState.lastTickState || (slow && slow.tickState) || null;
        var longTask = perfHudState.lastLongTask || null;
        var topText = frame && frame.topLabel ? String(frame.topLabel) : '-';
        if ((!frame || !frame.topLabel) && tickState) {
          var cam = tickState.cameraControl || {};
          var canvas = tickState.canvas || {};
          topText = 'obj ' + String(tickState.objectCount != null ? tickState.objectCount : '-') +
            ' vis ' + String(tickState.visibleObjectCount != null ? tickState.visibleObjectCount : '-') +
            ' cv ' + String(canvas.width != null ? canvas.width : '-') + 'x' + String(canvas.height != null ? canvas.height : '-') +
            ' cc ' + [
              cam.rotating ? 'rot' : '',
              cam.panning ? 'pan' : '',
              cam.dollying ? 'dol' : ''
            ].filter(Boolean).join('/');
        }
        if ((!frame || !frame.topLabel) && frameFlow) {
          topText = 'rf ' + String(frameFlow.rafGapMs != null ? Math.round(frameFlow.rafGapMs) : '-') +
            ' tk ' + String(frameFlow.tickGapMs != null ? Math.round(frameFlow.tickGapMs) : '-') +
            ' ft ' + String(frameFlow.frameTotalMs != null ? Math.round(frameFlow.frameTotalMs) : '-');
        }
        if (topText.length > 34) topText = topText.slice(0, 34) + '...';
        var hint = '-';
        if (longTask && longTask.durationMs >= 100) {
          hint = 'main';
        } else if (slow && frame && slow.durationMs >= 80 && frame.totalMs <= 20) {
          hint = 'out-js';
        } else if (frameFlow && frameFlow.frameTotalMs != null && frameFlow.frameTotalMs > 16) {
          hint = 'flow';
        } else if (slow && slow.label) {
          hint = String(slow.label);
        }
        var headerLine = 'FPS ' + String(fps).padStart(2, ' ') +
          (typeof scale === 'number' ? ' | RS ' + scale.toFixed(2) : '') +
          (count ? ' | O ' + count : '');
        var detailLine = 'S ' + (slow && slow.durationMs != null ? String(Math.round(slow.durationMs)) + 'ms' : '--') +
          ' | F ' + (frame && frame.totalMs != null ? String(Math.round(frame.totalMs)) + 'ms' : (frameFlow && frameFlow.frameTotalMs != null ? String(Math.round(frameFlow.frameTotalMs)) + 'ms' : '--')) +
          ' | ' + hint;
        if ((!frame || frame.totalMs == null) && slow && slow.sinceInputMs != null) {
          detailLine += ' | in ' + String(Math.round(slow.sinceInputMs)) + 'ms';
        }
        var topLine = 'T ' + topText;
        hud.textContent = headerLine + '\n' + detailLine + '\n' + topLine;
        if (fps >= 50) hud.style.color = '#9cff9a';
        else if (fps >= 30) hud.style.color = '#ffe18f';
        else hud.style.color = '#ff9b9b';
      } catch (e2) {
        // ignore
      }
    }, 500);
  }

  function removeFpsHud(viewer) {
    if (!viewer) return;
    if (viewer.__costosFpsHudTimer) {
      window.clearInterval(viewer.__costosFpsHudTimer);
      viewer.__costosFpsHudTimer = null;
    }
    if (viewer.__costosFpsHudEl && viewer.__costosFpsHudEl.parentElement) {
      viewer.__costosFpsHudEl.parentElement.removeChild(viewer.__costosFpsHudEl);
      viewer.__costosFpsHudEl = null;
    }
  }

  function cleanupViewerStrayText(viewer) {
    try {
      var canvasEl = safeRead(viewer, ['scene', 'canvas', 'canvas']) || null;
      if (!canvasEl) return;
      var containers = [];
      if (canvasEl.parentElement) containers.push(canvasEl.parentElement);
      if (canvasEl.parentElement && canvasEl.parentElement.parentElement) {
        containers.push(canvasEl.parentElement.parentElement);
      }

      for (var i = 0; i < containers.length; i += 1) {
        var node = containers[i];
        if (!node || !node.childNodes) continue;
        for (var j = node.childNodes.length - 1; j >= 0; j -= 1) {
          var child = node.childNodes[j];
          if (!child) continue;
          if (child.nodeType === 3) {
            var raw = String(child.nodeValue || '');
            var trimmed = raw.trim();
            if (!trimmed || trimmed === '\\n' || trimmed === '\\n\\n') {
              node.removeChild(child);
            }
          } else if (child.nodeType === 1) {
            var txt = String(child.textContent || '').trim();
            if (txt === '\\n' || txt === '\\n\\n') {
              node.removeChild(child);
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function cleanupBcfRightPanelStrayText() {
    cleanupBcfViewerStrayText();
  }

  function isStrayLiteralNewlineText(value) {
    var raw = String(value || '');
    if (!raw.trim()) return true;
    var trimmed = raw.trim();
    if (trimmed === '\\n' || trimmed === '\\n\\n') return true;
    if (/^(\\n)+$/.test(trimmed)) return true;
    if (/^(\n)+$/.test(trimmed)) return true;
    return false;
  }

  function cleanupBcfViewerStrayText() {
    try {
      if (!isBcfPage() || !document || !document.querySelectorAll) return;
      var selectors = [
        'op-bcf-content-left',
        'op-bcf-content-right',
        'op-ifc-viewer-page',
        '.work-packages-partitioned-page--content-right'
      ];
      for (var i = 0; i < selectors.length; i += 1) {
        var nodes = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < nodes.length; j += 1) {
          removeStrayLiteralTextNodes(nodes[j]);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function scheduleBcfStrayTextCleanup() {
    if (!isBcfPage()) return;
    window.setTimeout(cleanupBcfViewerStrayText, 50);
    window.setTimeout(cleanupBcfViewerStrayText, 250);
    window.setTimeout(cleanupBcfViewerStrayText, 1000);
  }

  function ensureBcfStrayTextObserver() {
    if (!isBcfPage()) return;
    if (window.__costosBcfStrayTextObserverInstalled) return;
    window.__costosBcfStrayTextObserverInstalled = true;
    try {
      var observer = new MutationObserver(function () {
        cleanupBcfViewerStrayText();
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (e) {
      // ignore
    }
  }

  function removeStrayLiteralTextNodes(root) {
    if (!root || !root.childNodes) return;
    for (var i = root.childNodes.length - 1; i >= 0; i -= 1) {
      var child = root.childNodes[i];
      if (!child) continue;
      if (child.nodeType === 3) {
        if (isStrayLiteralNewlineText(child.nodeValue)) {
          root.removeChild(child);
        }
        continue;
      }
      if (child.nodeType === 1) {
        removeStrayLiteralTextNodes(child);
      }
    }
  }

  function isBcfPage() {
    try {
      var path = String(window.location.pathname || '');
      return path.indexOf('/bcf') !== -1;
    } catch (e) {
      return false;
    }
  }

  function collectModelsPanelState() {
    var panel = document.querySelector('.xeokit-models');
    var tabContent = panel && panel.closest ? panel.closest('.xeokit-tab-content') : null;
    var tabNode = tabContent && tabContent.closest ? tabContent.closest('.xeokit-tab') : null;
    var tabLink = document.querySelector('[data-xeokit-i18n="modelsExplore"]');
    var projectMeta = readIfcModelsMeta();
    var urlModels = null;
    try {
      urlModels = new URL(window.location.href).searchParams.get("models");
    } catch (eUrl) {
      urlModels = null;
    }
    var viewerRef = lastBimViewer && (lastBimViewer.viewer || lastBimViewer);
    var sceneModels = viewerRef && viewerRef.scene && viewerRef.scene.models ? Object.keys(viewerRef.scene.models).length : null;
    var style = panel ? window.getComputedStyle(panel) : null;
    var rect = panel && panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
    var contentStyle = tabContent ? window.getComputedStyle(tabContent) : null;
    var tabStyle = tabNode ? window.getComputedStyle(tabNode) : null;
    return {
      panelFound: !!panel,
      panelChildren: panel && panel.children ? panel.children.length : 0,
      panelDisplay: style ? style.display : null,
      panelVisibility: style ? style.visibility : null,
      panelHeight: rect && typeof rect.height === 'number' ? Math.round(rect.height) : 0,
      panelOffsetHeight: panel ? panel.offsetHeight : 0,
      panelScrollHeight: panel ? panel.scrollHeight : 0,
      tabContentFound: !!tabContent,
      tabContentDisplay: contentStyle ? contentStyle.display : null,
      tabContentVisibility: contentStyle ? contentStyle.visibility : null,
      tabNodeFound: !!tabNode,
      tabNodeClass: tabNode ? String(tabNode.className || "").slice(0, 180) : null,
      tabNodeDisplay: tabStyle ? tabStyle.display : null,
      tabNodeVisibility: tabStyle ? tabStyle.visibility : null,
      tabNodeAriaHidden: tabNode ? tabNode.getAttribute("aria-hidden") : null,
      tabLinkFound: !!tabLink,
      tabLinkClass: tabLink ? String(tabLink.className || "").slice(0, 180) : null,
      tabLinkAriaSelected: tabLink ? tabLink.getAttribute("aria-selected") : null,
      urlModels: urlModels,
      metaShownModelsCount: projectMeta && projectMeta.shown_models ? projectMeta.shown_models.length : null,
      metaModelsCount: projectMeta && projectMeta.models ? projectMeta.models.length : null,
      sceneModelsCount: sceneModels
    };
  }

  function modelsPanelStateSignature(state) {
    if (!state) return "";
    return [
      state.panelFound ? 1 : 0,
      state.panelChildren,
      state.panelDisplay || "",
      state.panelVisibility || "",
      state.panelHeight,
      state.panelOffsetHeight,
      state.panelScrollHeight,
      state.tabContentDisplay || "",
      state.tabNodeClass || "",
      state.tabNodeAriaHidden || "",
      state.tabLinkClass || "",
      state.tabLinkAriaSelected || ""
    ].join("|");
  }

  function maybeLogModelsState(reason, force) {
    if (!MODELS_DEBUG) return;
    var state = collectModelsPanelState();
    var signature = modelsPanelStateSignature(state);
    if (!force && signature === modelsDebugLastSignature) return;
    modelsDebugLastSignature = signature;
    modelsDebugLog(reason, state);
  }

  function installModelsDebugObserver() {
    if (!MODELS_DEBUG || modelsDebugObserverInstalled) return;
    modelsDebugObserverInstalled = true;
    maybeLogModelsState("models_debug_start", true);
    try {
      var observer = new MutationObserver(function () {
        maybeLogModelsState("models_dom_mutation", false);
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-hidden", "aria-selected"]
      });
    } catch (e) {
      modelsDebugLog("models_debug_observer_error", { error: String(e && e.message ? e.message : e) });
    }
    window.setTimeout(function () { maybeLogModelsState("models_debug_t+250", false); }, 250);
    window.setTimeout(function () { maybeLogModelsState("models_debug_t+1000", false); }, 1000);
    window.setTimeout(function () { maybeLogModelsState("models_debug_t+3000", false); }, 3000);
    window.setTimeout(function () { maybeLogModelsState("models_debug_t+7000", false); }, 7000);
  }

  function isModelsPanelReady() {
    var panel = document.querySelector('.xeokit-models');
    if (!panel) return false;
    var style = window.getComputedStyle(panel);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    var hasItems = !!(panel.children && panel.children.length > 0);
    if (!hasItems) return false;
    var rect = panel.getBoundingClientRect();
    var height = rect && typeof rect.height === 'number' ? rect.height : 0;
    return height > 0 || panel.offsetHeight > 0 || panel.scrollHeight > 0;
  }

  function sceneModelsCountFromBimViewer(bimViewer) {
    var viewerRef = bimViewer && (bimViewer.viewer || bimViewer);
    var modelsMap = viewerRef && viewerRef.scene && viewerRef.scene.models;
    if (!modelsMap) return 0;
    try {
      return Object.keys(modelsMap).length;
    } catch (e) {
      return 0;
    }
  }

  function modelsPanelItemsCount() {
    var panel = document.querySelector('.xeokit-models');
    if (!panel) return 0;
    return panel.querySelectorAll('.xeokit-form-check').length;
  }

  function forceModelsTabRefresh(bimViewer, reason) {
    if (!bimViewer || typeof bimViewer.openTab !== 'function') return;
    if (bimViewer.__costosModelsRefreshInProgress) return;
    bimViewer.__costosModelsRefreshInProgress = true;
    try {
      bimViewer.openTab('models');
    } catch (e1) {
      // ignore
    }
    // Only do a single fallback tab-switch when strictly needed.
    window.setTimeout(function () {
      try {
        var sceneCount = sceneModelsCountFromBimViewer(bimViewer);
        var panelCount = modelsPanelItemsCount();
        if (panelCount === 0 && typeof bimViewer.openTab === 'function') {
          bimViewer.openTab('objects');
          bimViewer.openTab('models');
        }
      } catch (e2) {
        // ignore
      } finally {
        bimViewer.__costosModelsRefreshInProgress = false;
      }
    }, 120);
    modelsDebugLog('models_force_refresh_' + String(reason || 'unknown'), {
      reason: reason || 'unknown',
      sceneModelsCount: sceneModelsCountFromBimViewer(bimViewer),
      panelItemsCount: modelsPanelItemsCount()
    });
    postModelsTrace('force_models_tab_refresh', {
      reason: reason || 'unknown',
      sceneModelsCount: sceneModelsCountFromBimViewer(bimViewer),
      panelItemsCount: modelsPanelItemsCount()
    });
  }

  function ensureModelsPanelSync(bimViewer) {
    if (!bimViewer || bimViewer.__costosModelsSyncInstalled) return;
    bimViewer.__costosModelsSyncInstalled = true;
    bimViewer.__costosModelsRefreshTriggered = false;
    bimViewer.__costosModelsRefreshCount = 0;

    var attempts = 0;
    var maxAttempts = 40; // 40 * 750ms = 30s
    var interval = window.setInterval(function () {
      attempts += 1;
      var sceneCount = sceneModelsCountFromBimViewer(bimViewer);
      var panelCount = modelsPanelItemsCount();
      if (panelCount === 0 && attempts >= 2 && attempts % 4 === 2 && bimViewer.__costosModelsRefreshCount < 3) {
        bimViewer.__costosModelsRefreshCount += 1;
        postModelsTrace('models_panel_empty_with_scene', {
          attempts: attempts,
          sceneModelsCount: sceneCount,
          panelItemsCount: panelCount,
          refreshCount: bimViewer.__costosModelsRefreshCount
        });
        forceModelsTabRefresh(bimViewer, 'interval_' + attempts);
        if (bimViewer.__costosModelsRefreshCount >= 3) {
          hardReloadOnceForModels('persistent_empty_after_3_refreshes');
        }
      }
      if (sceneCount > 0 && panelCount > 0) {
        window.clearInterval(interval);
        modelsDebugLog('models_panel_synced', {
          attempts: attempts,
          sceneModelsCount: sceneCount,
          panelItemsCount: panelCount
        });
        return;
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
        // Allow a future sync cycle (e.g. after Turbo rerender) to install again.
        bimViewer.__costosModelsSyncInstalled = false;
        postModelsTrace('models_panel_sync_timeout', {
          attempts: attempts,
          sceneModelsCount: sceneCount,
          panelItemsCount: panelCount
        });
        if (panelCount === 0) {
          hardReloadOnceForModels('sync_timeout');
        }
        modelsDebugLog('models_panel_sync_timeout', {
          attempts: attempts,
          sceneModelsCount: sceneCount,
          panelItemsCount: panelCount
        });
      }
    }, 750);

    if (typeof bimViewer.on === 'function') {
      try {
        bimViewer.on('modelLoaded', function () {
          // Defer and refresh only if panel is still empty after model load settles.
        window.setTimeout(function () {
          var sceneCount = sceneModelsCountFromBimViewer(bimViewer);
          var panelCount = modelsPanelItemsCount();
          if (panelCount === 0 && bimViewer.__costosModelsRefreshCount < 3) {
            bimViewer.__costosModelsRefreshCount += 1;
            forceModelsTabRefresh(bimViewer, 'modelLoaded');
          }
        }, 350);
        });
      } catch (e) {
        // ignore
      }
    }
  }

  function ensureModelsTabReady(bimViewer) {
    if (!bimViewer || typeof bimViewer.openTab !== 'function') return;
    installModelsDebugObserver();
    ensureModelsPanelSync(bimViewer);
    if (bimViewer.__costosModelsTabReady) return;
    if (bimViewer.__costosModelsTabTimer) {
      maybeLogModelsState("models_tab_wait_existing_timer", false);
      return;
    }

    var attempts = 0;
    var maxAttempts = 20;
    maybeLogModelsState("models_tab_wait_start", true);
    function tryOpen() {
      attempts += 1;
      try {
        bimViewer.openTab('models');
      } catch (e) {
        // ignore
      }
      if (isModelsPanelReady()) {
        bimViewer.__costosModelsTabReady = true;
        maybeLogModelsState("models_tab_ready_attempt_" + attempts, true);
        sendServerLog({ event: 'ifc_models_tab_ready', attempts: attempts });
        return true;
      }
      if (attempts <= 4 || attempts % 4 === 0) {
        maybeLogModelsState("models_tab_retry_" + attempts, false);
      }
      if (attempts >= maxAttempts) {
        maybeLogModelsState("models_tab_timeout_attempt_" + attempts, true);
        sendServerLog({ event: 'ifc_models_tab_timeout', attempts: attempts });
        return true;
      }
      return false;
    }

    if (tryOpen()) return;

    var timer = window.setInterval(function () {
      if (tryOpen()) {
        window.clearInterval(timer);
        bimViewer.__costosModelsTabTimer = null;
      }
    }, 250);

    bimViewer.__costosModelsTabTimer = timer;
  }

  function isIfcOrBcfPage() {
    try {
      var path = String(window.location.pathname || '');
      return path.indexOf('/ifc_models') !== -1 || path.indexOf('/bcf') !== -1;
    } catch (e) {
      return false;
    }
  }

  function recoverModelsPanel(reason) {
    if (!isIfcOrBcfPage()) return;
    var found = tryFindBimViewer();
    var bimViewer = found && found.viewer;
    if (!bimViewer) return;

    ensureModelsTabReady(bimViewer);
    var sceneCount = sceneModelsCountFromBimViewer(bimViewer);
    var panelCount = modelsPanelItemsCount();
    postModelsTrace('recover_models_panel', {
      reason: reason || 'unknown',
      sceneModelsCount: sceneCount,
      panelItemsCount: panelCount,
      hasViewer: !!bimViewer
    });
    if (panelCount === 0) {
      forceModelsTabRefresh(bimViewer, 'recover_' + String(reason || 'unknown'));
    }
  }

  function installBcfCanvasRectCache(viewer) {
    if (!isBcfPage()) return;
    if (window.COSTOS_BCF_RECT_CACHE === false) return;
    var canvasEl = safeRead(viewer, ['scene', 'canvas', 'canvas']) || null;
    if (!canvasEl || typeof canvasEl.getBoundingClientRect !== 'function') return;
    if (canvasEl.__costosRectCacheInstalled) return;

    var original = canvasEl.getBoundingClientRect.bind(canvasEl);
    var cachedRect = null;
    var rafTicket = 0;

    canvasEl.getBoundingClientRect = function () {
      if (!cachedRect) {
        cachedRect = original();
      }
      if (!rafTicket) {
        rafTicket = window.requestAnimationFrame(function () {
          cachedRect = null;
          rafTicket = 0;
        });
      }
      return cachedRect;
    };

    canvasEl.__costosRectCacheInstalled = true;
    canvasEl.__costosOriginalGetBoundingClientRect = original;
    debugLog('bcf rect cache installed');
  }

  function applyBcfLowLatencyNav(viewer) {
    if (!isBcfPage()) return;
    if (window.COSTOS_BCF_LOW_LATENCY_NAV === false) return;
    var cc = viewer && viewer.cameraControl;
    if (!cc) return;
    try { cc.followPointer = false; } catch (e1) { /* ignore */ }
    try { cc.smartPivot = false; } catch (e2) { /* ignore */ }
    try { cc.rotateInertia = 0; } catch (e3) { /* ignore */ }
    try { cc.panInertia = 0; } catch (e4) { /* ignore */ }
    try { cc.dollyInertia = 0; } catch (e5) { /* ignore */ }
    try { cc.keyboardDollyRate = 40; } catch (e6) { /* ignore */ }
    try { cc.mouseWheelDollyRate = 40; } catch (e7) { /* ignore */ }
  }

  function ensureModelPerfApi() {
    if (window.CostosModelPerf) return;
    function getViewerRef() {
      return modelPerfState.viewer || lastBimViewer || null;
    }
    function getCameraControlRef() {
      var v = getViewerRef();
      return v && v.cameraControl ? v.cameraControl : null;
    }
    function setLowLatencyNav() {
      var cc = getCameraControlRef();
      if (!cc) return { ok: false, reason: 'cameraControl_not_found' };
      try { cc.followPointer = false; } catch (e1) { /* ignore */ }
      try { cc.smartPivot = false; } catch (e2) { /* ignore */ }
      try { cc.rotateInertia = 0; } catch (e3) { /* ignore */ }
      try { cc.panInertia = 0; } catch (e4) { /* ignore */ }
      try { cc.dollyInertia = 0; } catch (e5) { /* ignore */ }
      try { cc.keyboardDollyRate = 40; } catch (e6) { /* ignore */ }
      try { cc.mouseWheelDollyRate = 40; } catch (e7) { /* ignore */ }
      return { ok: true };
    }
    function setDefaultNav() {
      var cc = getCameraControlRef();
      if (!cc) return { ok: false, reason: 'cameraControl_not_found' };
      try { cc.followPointer = true; } catch (e1) { /* ignore */ }
      try { cc.smartPivot = true; } catch (e2) { /* ignore */ }
      try { cc.rotateInertia = 0.5; } catch (e3) { /* ignore */ }
      try { cc.panInertia = 0.5; } catch (e4) { /* ignore */ }
      try { cc.dollyInertia = 0.1; } catch (e5) { /* ignore */ }
      try { cc.keyboardDollyRate = 100; } catch (e6) { /* ignore */ }
      try { cc.mouseWheelDollyRate = 100; } catch (e7) { /* ignore */ }
      return { ok: true };
    }
    window.CostosModelPerf = {
      start: function () { return startModelPerf(); },
      stop: function () { return stopModelPerf(); },
      sample: function () { return collectModelPerfSample(); },
      viewer: function () { return getViewerRef(); },
      hudOn: function () {
        var v = getViewerRef();
        if (!v) return { ok: false, reason: 'viewer_not_found' };
        persistFpsHudPreference(true);
        startModelPerf(v);
        ensureFpsHud(v);
        return { ok: true };
      },
      hudOff: function () {
        var v = getViewerRef();
        persistFpsHudPreference(false);
        if (v) removeFpsHud(v);
        return { ok: true };
      },
      navLowLatency: function () { return setLowLatencyNav(); },
      navDefault: function () { return setDefaultNav(); },
      state: function () {
        return {
          running: modelPerfState.running,
          fps: modelPerfState.fps,
          viewerBound: !!modelPerfState.viewer,
          samples: modelPerfState.samples.slice(-20)
        };
      },
      reset: function () {
        modelPerfState.samples = [];
        return true;
      }
    };
  }

  function applyViewerConfigs(bimViewer) {
    if (!bimViewer || bimViewer.__costosConfigApplied) return;
    lastBimViewer = bimViewer;
    var bcfPage = isBcfPage();
    installModelsDebugObserver();
    maybeLogModelsState("apply_viewer_configs_enter", false);

    try {
      if (bcfPage) {
        var stockViewer = bimViewer.viewer || bimViewer;
        var stockScene = stockViewer && stockViewer.scene;
        if (stockScene && stockScene.camera && stockScene.camera.perspective) {
          stockScene.camera.perspective.near = CONFIG.viewerConfigs.cameraNear;
          stockScene.camera.perspective.far = CONFIG.viewerConfigs.cameraFar;
        }
        if (stockScene && stockScene.highlightMaterial && stockScene.selectedMaterial) {
          stockScene.highlightMaterial.edges = true;
          stockScene.highlightMaterial.edgeColor = [1, 1, 1];
          stockScene.highlightMaterial.edgeAlpha = 0.8;
          stockScene.highlightMaterial.fill = true;
          stockScene.highlightMaterial.fillAlpha = 0.12;
          stockScene.highlightMaterial.fillColor = [0.2, 0.4, 1.0];

          stockScene.selectedMaterial.edges = true;
          stockScene.selectedMaterial.edgeColor = [0.12, 0.35, 0.85];
          stockScene.selectedMaterial.edgeAlpha = 1.0;
          stockScene.selectedMaterial.fill = true;
          stockScene.selectedMaterial.fillAlpha = 0.45;
          stockScene.selectedMaterial.fillColor = [0.12, 0.35, 0.85];
        }
        modelPerfState.viewer = stockViewer;
        ensureModelPerfApi();
        startModelPerf(stockViewer);
        syncFpsHudPreference(stockViewer);
        installBcfCanvasRectCache(stockViewer);
        applyBcfLowLatencyNav(stockViewer);
        try {
          var bcfObjectsForFastNav = stockScene && stockScene.objects ? Object.keys(stockScene.objects).length : 0;
          configureFastNav(bimViewer);
          if (stockViewer !== bimViewer) configureFastNav(stockViewer);
          disableFastNavForHeavyModel(bimViewer, bcfObjectsForFastNav);
          if (stockViewer !== bimViewer) disableFastNavForHeavyModel(stockViewer, bcfObjectsForFastNav);
        } catch (eFastNavBcf) {
          // ignore
        }
        var leftClickReady = enableLeftClickInspect(bimViewer, stockViewer);
        if (!leftClickReady) {
          // In some refresh cycles the viewer exists before cameraControl is ready.
          // Keep the config as pending so the late-apply loop retries binding.
          bimViewer.__costosConfigApplied = false;
          sendServerLog({ event: 'ifc_xeokit_config_bcf_waiting_left_click_bind' });
          return;
        }
        ensureModelsTabReady(bimViewer);
        cleanupViewerStrayText(stockViewer);
        scheduleBcfStrayTextCleanup();
        ensureBcfStrayTextObserver();
        bimViewer.__costosConfigApplied = true;
        sendServerLog({ event: 'ifc_xeokit_config_applied_bcf_stock_mode' });
        debugLog('bcf stock mode applied');
        return;
      }

      if (typeof bimViewer.setConfigs === 'function') {
        bimViewer.setConfigs(CONFIG.viewerConfigs);
      } else if (typeof bimViewer.setConfig === 'function') {
        var keys = Object.keys(CONFIG.viewerConfigs || {});
        for (var i = 0; i < keys.length; i += 1) {
          var key = keys[i];
          bimViewer.setConfig(key, CONFIG.viewerConfigs[key]);
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      var viewer = bimViewer.viewer || bimViewer;
      var scene = viewer && viewer.scene;
      if (scene) {
        if (scene.sao) {
          scene.sao.enabled = !!CONFIG.viewerConfigs.saoEnabled;
          scene.sao.bias = CONFIG.viewerConfigs.saoBias;
          scene.sao.intensity = CONFIG.viewerConfigs.saoIntensity;
          scene.sao.numSamples = CONFIG.viewerConfigs.saoNumSamples;
          scene.sao.kernelRadius = CONFIG.viewerConfigs.saoKernelRadius;
          scene.sao.blur = CONFIG.viewerConfigs.saoBlur;
        }
        // In BCF pages, keep xeokit defaults to avoid black-frame regressions.
        if (!bcfPage) {
          scene.xrayMaterial.fill = false;
          scene.xrayMaterial.fillAlpha = 0.3;
          scene.xrayMaterial.fillColor = [0, 0, 0];
          scene.xrayMaterial.edges = true;
          scene.xrayMaterial.edgeAlpha = 0.2;
          scene.xrayMaterial.edgeColor = [0, 0, 0];

          scene.highlightMaterial.edges = true;
          scene.highlightMaterial.edgeColor = [1, 1, 1];
          scene.highlightMaterial.edgeAlpha = 0.8;
          scene.highlightMaterial.fill = true;
          scene.highlightMaterial.fillAlpha = 0.12;
          scene.highlightMaterial.fillColor = [0.2, 0.4, 1.0];

          scene.selectedMaterial.edges = true;
          scene.selectedMaterial.edgeColor = [0.12, 0.35, 0.85];
          scene.selectedMaterial.edgeAlpha = 1.0;
          scene.selectedMaterial.fill = true;
          scene.selectedMaterial.fillAlpha = 0.45;
          scene.selectedMaterial.fillColor = [0.12, 0.35, 0.85];

          if (scene.pointsMaterial) {
            scene.pointsMaterial.pointSize = 1;
            scene.pointsMaterial.roundPoints = true;
            scene.pointsMaterial.perspectivePoints = true;
            scene.pointsMaterial.minPerspectivePointSize = 2;
            scene.pointsMaterial.maxPerspectivePointSize = 4;
          }
        }

        if (scene.camera && scene.camera.perspective) {
          scene.camera.perspective.near = CONFIG.viewerConfigs.cameraNear;
          scene.camera.perspective.far = CONFIG.viewerConfigs.cameraFar;
        }
      }

      if (viewer && viewer.cameraControl) {
        viewer.cameraControl.panRightClick = true;
        viewer.cameraControl.followPointer = true;
        viewer.cameraControl.doublePickFlyTo = false;
        viewer.cameraControl.smartPivot = true;
        viewer.cameraControl.keyboardDollyRate = 100.0;
        viewer.cameraControl.mouseWheelDollyRate = 100.0;
        viewer.cameraControl.dollyInertia = 0.1;
        viewer.cameraControl.dollyMinSpeed = 0.04;
        viewer.cameraControl.dollyProximityThreshold = 30.0;
      }

      // Auto-tune navigation for heavy IFCs to reduce interaction stutter.
      // Object count stays high even when many classes are hidden.
      try {
        applyHeavyAutoTune(viewer);
      } catch (e) {
        // ignore
      }
      try {
        var objectsMapForFastNav = scene && scene.objects;
        var objectsForFastNav = objectsMapForFastNav ? Object.keys(objectsMapForFastNav).length : 0;
        disableFastNavForHeavyModel(bimViewer, objectsForFastNav);
      } catch (eFastNav) {
        // ignore
      }

      if (!bcfPage) {
        enableContextMenu(viewer);
      }
      enableLeftClickInspect(bimViewer, viewer);
      configureFastNav(bimViewer);
      scheduleToolbarButtonInjection(bimViewer);
      if (!bcfPage) {
        injectEffectControls(bimViewer);
        applyEmbedMode(bimViewer);
      }
      modelPerfState.viewer = viewer;
      ensureModelPerfApi();
      startModelPerf(viewer);
      syncFpsHudPreference(viewer);
      cleanupViewerStrayText(viewer);
      scheduleBcfStrayTextCleanup();
      ensureBcfStrayTextObserver();
      if (window.COSTOS_MODEL_PERF_AUTO) {
        startModelPerf(viewer);
      }
      debugLog('viewer config applied', {
        pbrEnabled: CONFIG.viewerConfigs.pbrEnabled,
        saoIntensity: CONFIG.viewerConfigs.saoIntensity,
        edgesEnabled: CONFIG.viewerConfigs.edgesEnabled
      });
    } catch (e) {
      // ignore
    }

    bimViewer.__costosConfigApplied = true;
    sendServerLog({ event: 'ifc_xeokit_config_applied' });
    debugLog('config applied flag set');
  }

  function applyHeavyAutoTune(viewer) {
    if (!viewer || viewer.__costosHeavyTuneApplied) return;
    var tries = 0;
    var maxTries = 20;
    var timer = window.setInterval(function () {
      tries += 1;
      var scene = viewer.scene;
      var objectsMap = scene && scene.objects;
      var objectCount = objectsMap ? Object.keys(objectsMap).length : 0;
      if (objectCount > 6000) {
        if (viewer.cameraControl) {
          viewer.cameraControl.followPointer = false;
          viewer.cameraControl.smartPivot = false;
          viewer.cameraControl.rotateInertia = 0;
          viewer.cameraControl.panInertia = 0;
          viewer.cameraControl.dollyInertia = 0;
          viewer.cameraControl.keyboardDollyRate = 40;
          viewer.cameraControl.mouseWheelDollyRate = 40;
        }
        var scale = HEAVY_MODEL_RESOLUTION_SCALE;
        if (scene && scene.canvas && typeof scene.canvas.resolutionScale !== 'undefined') {
          scene.canvas.resolutionScale = scale;
        }
        viewer.__costosHeavyTuneApplied = true;
        window.clearInterval(timer);
        debugLog('heavy model auto-tune', { objects: objectCount, resolutionScale: scale });
        return;
      }
      if (tries >= maxTries) {
        window.clearInterval(timer);
      }
    }, 1200);
  }

  function disableFastNavForHeavyModel(bimViewer, objectCount) {
    try {
      if (!bimViewer || objectCount <= 6000) return;
      var fastNav = bimViewer._fastNavPlugin;
      if (!fastNav) return;
      if (typeof fastNav.enabled !== 'undefined') fastNav.enabled = false;
      if (typeof fastNav.active !== 'undefined') fastNav.active = false;
      if (typeof fastNav.hideColorTexture !== 'undefined') fastNav.hideColorTexture = false;
      if (typeof fastNav.hideTransparentObjects !== 'undefined') fastNav.hideTransparentObjects = false;
      if (typeof fastNav.hideEdges !== 'undefined') fastNav.hideEdges = false;
      if (typeof fastNav.hideSAO !== 'undefined') fastNav.hideSAO = false;
      if (typeof fastNav.hidePBR !== 'undefined') fastNav.hidePBR = false;
      debugLog('fastNav disabled for heavy model', { objects: objectCount });
    } catch (e) {
      // ignore
    }
  }

  function configureFastNav(bimViewer) {
    try {
      var fastNav = bimViewer && bimViewer._fastNavPlugin;
      if (!fastNav) return;
      var flags = [
        'hideEdges',
        'hideSAO',
        'hidePBR',
        'hideColorTexture',
        'hideTransparentObjects'
      ];
      for (var i = 0; i < flags.length; i += 1) {
        if (typeof fastNav[flags[i]] !== 'undefined') {
          fastNav[flags[i]] = false;
        }
      }
      if (typeof fastNav.scaleCanvasResolution !== 'undefined') {
        fastNav.scaleCanvasResolution = false;
      }
      if (typeof fastNav.delayBeforeRestoreSeconds !== 'undefined') {
        fastNav.delayBeforeRestoreSeconds = 0;
      }
      if (typeof fastNav.delayBeforeRestore !== 'undefined') {
        fastNav.delayBeforeRestore = 0;
      }
      debugLog('fastNav tuned', {
        hideEdges: fastNav.hideEdges,
        hideSAO: fastNav.hideSAO,
        hidePBR: fastNav.hidePBR,
        hideColorTexture: fastNav.hideColorTexture,
        hideTransparentObjects: fastNav.hideTransparentObjects
      });
    } catch (e) {
      // ignore
    }
  }

  function findViewerToolbar() {
    var xeokitToolbar = document.querySelector('.op-ifc-viewer--toolbar .xeokit-toolbar') ||
      document.querySelector('.op-ifc-viewer--toolbar-container .xeokit-toolbar') ||
      document.querySelector('.xeokit-toolbar');
    if (xeokitToolbar) {
      return xeokitToolbar;
    }
    var overlayToolbar = document.querySelector('.op-ifc-viewer--toolbar.op-ifc-viewer--model-canvas-overlay') ||
      document.querySelector('[data-test-selector="op-ifc-viewer-toolbar"]') ||
      document.querySelector('.op-ifc-viewer--toolbar');
    if (overlayToolbar) {
      return overlayToolbar.querySelector('.op-ifc-viewer--toolbar-container') ||
        overlayToolbar.querySelector('#toolbar') ||
        overlayToolbar;
    }
    return document.querySelector('.op-ifc-viewer--toolbar-container') ||
      document.querySelector('#toolbar') ||
      document.querySelector('.op-ifc-viewer-toolbar') ||
      document.querySelector('.ifc-viewer-toolbar') ||
      document.querySelector('.xeokit-toolbar');
  }

  function findPageToolbar() {
    return document.querySelector('ul.toolbar-items.hide-when-print') ||
      document.querySelector('ul.toolbar-items');
  }

  function scheduleToolbarButtonInjection(bimViewer) {
    try {
      var attempts = 0;
      var maxAttempts = 20;
      function reinject() {
        attempts += 1;
        injectToolbarButton(bimViewer);
        var toolbar = findViewerToolbar();
        var hasFps = toolbar && toolbar.querySelector('.costos-fps-toggle-button');
        var hasHd = toolbar && toolbar.querySelector('.costos-hd-button');
        if ((!toolbar || !hasFps || !hasHd) && attempts < maxAttempts) {
          window.setTimeout(reinject, 250);
        }
      }

      reinject();

      if (bimViewer && !bimViewer.__costosToolbarObserver) {
        var observer = new MutationObserver(function () {
          injectToolbarButton(bimViewer);
        });
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true
        });
        bimViewer.__costosToolbarObserver = observer;
      }
    } catch (e) {
      // ignore
    }
  }

  function getToolbarViewerRef(bimViewer) {
    return (bimViewer && bimViewer.viewer) ||
      modelPerfState.viewer ||
      lastBimViewer ||
      (lastViewerService && lastViewerService.viewer) ||
      null;
  }

  function ensureGlobalToolbarButtons() {
    try {
      var toolbar = findViewerToolbar();
      if (!toolbar) return;
      if (toolbar.querySelector('.costos-toolbar-buttons')) return;
      injectToolbarButton(getToolbarViewerRef(lastBimViewer));
    } catch (e) {
      // ignore
    }
  }

  function readEmbedOptionsFromUrl() {
    try {
      var url = new URL(window.location.href);
      var options = {};
      if (url.searchParams.get('embed') === 'true') options.isEnabled = true;
      if (url.searchParams.get('hidecontrols') === 'true') options.hideControls = true;
      if (url.searchParams.get('hideselectioninfo') === 'true') options.hideSelectionInfo = true;
      if (url.searchParams.get('noscroll') === 'true') options.noScroll = true;
      if (url.searchParams.get('transparent') === 'true') options.isTransparent = true;
      var hash = url.hash || '';
      if (hash.indexOf('embed=') !== -1) {
        var parts = hash.replace(/^#/, '').split('&');
        for (var i = 0; i < parts.length; i += 1) {
          if (parts[i].indexOf('embed=') !== 0) continue;
          var payload = decodeURIComponent(parts[i].slice(6));
          var parsed = JSON.parse(payload);
          if (parsed && typeof parsed === 'object') {
            for (var key in parsed) {
              if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
              options[key] = parsed[key];
            }
          }
          break;
        }
      }
      if (options.isEnabled) return options;
    } catch (e) {
      // ignore
    }
    return null;
  }

  function applyEmbedMode(bimViewer) {
    var options = readEmbedOptionsFromUrl();
    if (!options || !options.isEnabled) return;
    var viewer = bimViewer && (bimViewer.viewer || bimViewer);
    var scene = viewer && viewer.scene;
    document.body.classList.add('costos-embed-mode');
    if (options.noScroll) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    if (options.hideControls) {
      var pageToolbar = findPageToolbar();
      if (pageToolbar) pageToolbar.style.display = 'none';
      var viewerToolbar = findViewerToolbar();
      if (viewerToolbar) viewerToolbar.style.display = 'none';
      var leftPanel = document.querySelector('.costos-left-panel');
      if (leftPanel) leftPanel.style.display = 'none';
    }
    if (options.hideSelectionInfo) {
      var propsTab = document.querySelector('.xeokit-propertiesTab');
      if (propsTab) propsTab.style.display = 'none';
      var propsPanel = document.querySelector('.xeokit-properties');
      if (propsPanel) propsPanel.style.display = 'none';
    }
    if (options.isTransparent) {
      if (scene && scene.canvas) {
        if (typeof scene.canvas.transparent !== 'undefined') {
          scene.canvas.transparent = true;
        }
        if (scene.canvas.canvas && scene.canvas.canvas.style) {
          scene.canvas.canvas.style.background = 'transparent';
        }
      }
    }
  }

  function setFastNavQuality(fastNav, enabled, previous) {
    if (!fastNav) return;
    var flags = [
      'hideEdges',
      'hideSAO',
      'hidePBR',
      'hideColorTexture',
      'hideTransparentObjects'
    ];
    if (enabled) {
      var snapshot = previous || {};
      for (var i = 0; i < flags.length; i += 1) {
        if (typeof fastNav[flags[i]] !== 'undefined') {
          snapshot[flags[i]] = fastNav[flags[i]];
          fastNav[flags[i]] = false;
        }
      }
      if (typeof fastNav.scaleCanvasResolution !== 'undefined') {
        snapshot.scaleCanvasResolution = fastNav.scaleCanvasResolution;
        fastNav.scaleCanvasResolution = false;
      }
      if (typeof fastNav.delayBeforeRestoreSeconds !== 'undefined') {
        snapshot.delayBeforeRestoreSeconds = fastNav.delayBeforeRestoreSeconds;
        fastNav.delayBeforeRestoreSeconds = 0;
      }
      if (typeof fastNav.delayBeforeRestore !== 'undefined') {
        snapshot.delayBeforeRestore = fastNav.delayBeforeRestore;
        fastNav.delayBeforeRestore = 0;
      }
      return snapshot;
    }

    if (previous) {
      for (var j = 0; j < flags.length; j += 1) {
        if (typeof previous[flags[j]] !== 'undefined') {
          fastNav[flags[j]] = previous[flags[j]];
        }
      }
      if (typeof previous.scaleCanvasResolution !== 'undefined') {
        fastNav.scaleCanvasResolution = previous.scaleCanvasResolution;
      }
      if (typeof previous.delayBeforeRestoreSeconds !== 'undefined') {
        fastNav.delayBeforeRestoreSeconds = previous.delayBeforeRestoreSeconds;
      }
      if (typeof previous.delayBeforeRestore !== 'undefined') {
        fastNav.delayBeforeRestore = previous.delayBeforeRestore;
      }
    }
    return null;
  }

  function injectToolbarButton(bimViewer) {
    try {
      var toolbar = findViewerToolbar();
      if (!toolbar) return;

      function findResetViewAnchor() {
        var buttons = toolbar.querySelectorAll('button');
        for (var idx = 0; idx < buttons.length; idx += 1) {
          var candidate = buttons[idx];
          if (!candidate) continue;
          var title = String(candidate.getAttribute('title') || candidate.getAttribute('aria-label') || candidate.textContent || '').trim().toLowerCase();
          if (title.indexOf('reset view') !== -1 || title === 'reset' || title.indexOf('view fit') !== -1 || title.indexOf('fit view') !== -1) {
            return candidate.closest('.xeokit-btn-group') || candidate;
          }
        }
        return toolbar.firstChild;
      }

      var sampleButton = toolbar.querySelector('button');
      var sampleStyle = sampleButton ? window.getComputedStyle(sampleButton) : null;
      var sampleRect = sampleButton ? sampleButton.getBoundingClientRect() : null;
      var customToolbar = toolbar.querySelector('.costos-toolbar-buttons');
      var buttonWidthValue = Math.max(sampleRect && sampleRect.width ? Math.round(sampleRect.width) : 0, 42);
      var buttonHeightValue = Math.max(sampleRect && sampleRect.height ? Math.round(sampleRect.height) : 0, 35);
      var buttonWidth = buttonWidthValue + 'px';
      var buttonHeight = buttonHeightValue + 'px';

      function applyToolbarButtonStyle(btn) {
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.width = buttonWidth;
        btn.style.height = buttonHeight;
        btn.style.minWidth = buttonWidth;
        btn.style.minHeight = buttonHeight;
        btn.style.padding = '6px 12px';
        btn.style.border = sampleStyle && sampleStyle.border ? sampleStyle.border : '1px solid #d6dde8';
        btn.style.borderRadius = sampleStyle ? sampleStyle.borderRadius : '2px';
        btn.style.boxShadow = 'none';
        btn.style.outline = 'none';
        btn.style.background = '#f8fafc';
        btn.style.color = '#323544';
        btn.style.cursor = 'pointer';
        btn.style.flex = '0 0 auto';
        btn.style.overflow = 'hidden';
      }

      function applyToggleButtonState(btn, enabled, activeTitle, inactiveTitle) {
        if (!btn) return;
        btn.classList.toggle('active', !!enabled);
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        btn.title = enabled ? activeTitle : inactiveTitle;
        btn.style.background = enabled ? '#dbe5f4' : '#f8fafc';
        btn.style.borderColor = enabled ? '#9aa9bf' : '#d6dde8';
      }

      if (!customToolbar) {
        customToolbar = document.createElement('div');
        customToolbar.className = 'xeokit-btn-group costos-toolbar-buttons';
        customToolbar.style.display = 'inline-flex';
        customToolbar.style.alignItems = 'center';
        customToolbar.style.gap = '6px';
        customToolbar.style.marginRight = '6px';
        customToolbar.style.flex = '0 0 auto';

        var hdButton = document.createElement('button');
        hdButton.type = 'button';
        hdButton.className = 'xeokit-btn costos-hd-button';
        hdButton.title = 'HD quality';
        applyToolbarButtonStyle(hdButton);
        hdButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style="display:block; width:18px; height:18px; flex:0 0 auto;"><path d="M7.396 11V5.001H6.209v2.44H3.687V5H2.5v6h1.187V8.43h2.522V11zM8.5 5.001V11h2.188c1.811 0 2.685-1.107 2.685-3.015 0-1.894-.86-2.984-2.684-2.984zm1.187.967h.843c1.112 0 1.622.686 1.622 2.04 0 1.353-.505 2.02-1.622 2.02h-.843z" fill="#323544"/><path d="M14 3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" fill="#323544"/></svg>';
        hdButton.addEventListener('click', function () {
          toggleLeftPanel();
          applyToggleButtonState(hdButton, isLeftPanelVisible(), 'Ocultar panel HD', 'Mostrar panel HD');
        });

        var fpsButton = document.createElement('button');
        fpsButton.type = 'button';
        fpsButton.className = 'xeokit-btn costos-fps-toggle-button';
        applyToolbarButtonStyle(fpsButton);
        fpsButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block; width:18px; height:18px; flex:0 0 auto;"><path d="M18.6663 2V8.66667H11.9997L5.33301 2H18.6663ZM5.33301 8.66667H11.9997L18.6663 15.3333H11.9997V22L5.33301 15.3333V8.66667Z" fill="#323544"/></svg>';

        var updateFpsButtonState = function () {
          var viewerRef = getToolbarViewerRef(bimViewer);
          var enabled = syncFpsHudPreference(viewerRef);
          applyToggleButtonState(fpsButton, enabled, 'Ocultar FPS HUD', 'Mostrar FPS HUD');
        };

        fpsButton.addEventListener('click', function () {
          persistFpsHudPreference(!isFpsHudPreferred());
          var viewerRef = getToolbarViewerRef(bimViewer);
          if (viewerRef) startModelPerf(viewerRef);
          updateFpsButtonState();
        });

        applyToggleButtonState(hdButton, isLeftPanelVisible(), 'Ocultar panel HD', 'Mostrar panel HD');
        updateFpsButtonState();
        customToolbar.appendChild(fpsButton);
        customToolbar.appendChild(hdButton);
        var resetAnchor = findResetViewAnchor();
        toolbar.insertBefore(customToolbar, resetAnchor || toolbar.firstChild);
        debugLog('custom toolbar buttons injected');
      } else {
        var existingFpsButton = customToolbar.querySelector('.costos-fps-toggle-button');
        if (existingFpsButton) {
          var viewerRef = getToolbarViewerRef(bimViewer);
          var fpsEnabled = syncFpsHudPreference(viewerRef);
          applyToggleButtonState(existingFpsButton, fpsEnabled, 'Ocultar FPS HUD', 'Mostrar FPS HUD');
        }
        var existingHdButton = customToolbar.querySelector('.costos-hd-button');
        if (existingHdButton) {
          applyToggleButtonState(existingHdButton, isLeftPanelVisible(), 'Ocultar panel HD', 'Mostrar panel HD');
        }
      }

      var existingCanvasShare = toolbar.querySelector('.costos-share-wrapper');
      if (existingCanvasShare && existingCanvasShare.parentNode) {
        existingCanvasShare.parentNode.removeChild(existingCanvasShare);
      }

      var pageToolbar = findPageToolbar();
      if (pageToolbar && !pageToolbar.querySelector('.costos-share-wrapper')) {
        var sampleItem = pageToolbar.querySelector('li');
        var sampleLink = sampleItem ? sampleItem.querySelector('a,button') : null;
        var sampleLinkStyle = sampleLink ? window.getComputedStyle(sampleLink) : null;

        var shareItem = document.createElement('li');
        shareItem.className = sampleItem && sampleItem.className ? sampleItem.className : '';

        var shareWrapper = document.createElement('span');
        shareWrapper.className = 'costos-share-wrapper';
        shareWrapper.style.position = 'relative';
        shareWrapper.style.display = 'inline-flex';
        shareWrapper.style.alignItems = 'center';

        var shareButton = document.createElement('button');
        shareButton.type = 'button';
        shareButton.className = 'costos-share-button' + (sampleLink && sampleLink.className ? (' ' + sampleLink.className) : '');
        shareButton.title = 'Compartir';
        shareButton.style.display = 'inline-flex';
        shareButton.style.alignItems = 'center';
        shareButton.style.justifyContent = 'center';
        shareButton.style.gap = '6px';
        if (sampleLinkStyle) {
          shareButton.style.padding = sampleLinkStyle.padding;
          shareButton.style.borderRadius = sampleLinkStyle.borderRadius;
          shareButton.style.boxShadow = sampleLinkStyle.boxShadow;
          shareButton.style.border = sampleLinkStyle.border;
          shareButton.style.background = sampleLinkStyle.background;
          shareButton.style.color = sampleLinkStyle.color;
          shareButton.style.height = sampleLinkStyle.height;
        }
        shareButton.textContent = 'Compartir';

        var chevron = document.createElement('span');
        chevron.className = 'costos-share-chevron';
        chevron.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M1.646 5.646a.5.5 0 0 1 .708 0L8 11.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/></svg>';
        chevron.style.display = 'inline-flex';
        chevron.style.alignItems = 'center';
        chevron.style.justifyContent = 'center';
        shareButton.appendChild(chevron);

        var menu = document.createElement('div');
        menu.className = 'costos-share-menu';
        menu.style.position = 'absolute';
        menu.style.top = 'calc(100% + 6px)';
        menu.style.right = '0';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #e5e7eb';
        menu.style.borderRadius = '6px';
        menu.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
        menu.style.minWidth = '160px';
        menu.style.display = 'none';
        menu.style.zIndex = '40000010';
        menu.style.padding = '4px 0';

        var embedItem = document.createElement('button');
        embedItem.type = 'button';
        embedItem.className = 'costos-share-menu-item';
        embedItem.textContent = 'Embed Modelo';
        embedItem.style.display = 'block';
        embedItem.style.width = '100%';
        embedItem.style.textAlign = 'left';
        embedItem.style.padding = '8px 12px';
        embedItem.style.border = 'none';
        embedItem.style.background = 'transparent';
        embedItem.style.cursor = 'pointer';
        embedItem.style.fontSize = '12px';
        embedItem.addEventListener('click', function (event) {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          menu.style.display = 'none';
          openEmbedModal();
        });

        menu.appendChild(embedItem);
        shareWrapper.appendChild(shareButton);
        shareWrapper.appendChild(menu);
        shareItem.appendChild(shareWrapper);

        shareButton.addEventListener('click', function (event) {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          menu.style.display = (menu.style.display === 'none' ? 'block' : 'none');
        });

        document.addEventListener('click', function (event) {
          if (!shareWrapper.contains(event.target)) {
            menu.style.display = 'none';
          }
        });

        pageToolbar.appendChild(shareItem);
        debugLog('Compartir toolbar button injected (page toolbar)');
      }
    } catch (e) {
      // ignore
    }
  }

  function buildEmbedUrl(embedOptions) {
    var url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('embed', 'true');
    if (embedOptions && embedOptions.noScroll) url.searchParams.set('noscroll', 'true');
    if (embedOptions && embedOptions.isTransparent) url.searchParams.set('transparent', 'true');
    if (embedOptions && embedOptions.hideControls) url.searchParams.set('hidecontrols', 'true');
    if (embedOptions && embedOptions.hideSelectionInfo) url.searchParams.set('hideselectioninfo', 'true');
    var payload = {
      isEnabled: true,
      hideControls: !!(embedOptions && embedOptions.hideControls),
      hideSelectionInfo: !!(embedOptions && embedOptions.hideSelectionInfo),
      noScroll: !!(embedOptions && embedOptions.noScroll),
      isTransparent: !!(embedOptions && embedOptions.isTransparent)
    };
    url.hash = 'embed=' + encodeURIComponent(JSON.stringify(payload));
    return url.toString();
  }

  function readIfcModelsMeta() {
    var meta = document.querySelector('meta[name="openproject_ifc_models"]');
    if (!meta) return null;
    var raw = meta.getAttribute('data-models') || (meta.dataset && meta.dataset.models);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function pickPublicModelId(meta) {
    if (!meta) return null;
    if (meta.shown_models && meta.shown_models.length) return meta.shown_models[0];
    if (meta.models && meta.models.length && meta.models[0] && meta.models[0].id) return meta.models[0].id;
    return null;
  }

  function pickModelIdFromUrl() {
    try {
      var url = new URL(window.location.href);
      var raw = url.searchParams.get('models');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed[0];
      return null;
    } catch (e) {
      return null;
    }
  }

  function buildPublicEmbedUrl(publicPath, embedOptions) {
    var url = new URL(publicPath, window.location.origin);
    url.searchParams.set('embed', 'true');
    if (embedOptions && embedOptions.noScroll) url.searchParams.set('noscroll', 'true');
    if (embedOptions && embedOptions.isTransparent) url.searchParams.set('transparent', 'true');
    if (embedOptions && embedOptions.hideControls) url.searchParams.set('hidecontrols', 'true');
    if (embedOptions && embedOptions.hideSelectionInfo) url.searchParams.set('hideselectioninfo', 'true');
    return url.toString();
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return;
      }
    } catch (e) {
      // ignore
    }
    var temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      // ignore
    }
    document.body.removeChild(temp);
  }

  function openEmbedModal() {
    var modal = document.querySelector('.costos-embed-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'costos-embed-modal';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.right = '0';
      modal.style.bottom = '0';
      modal.style.background = 'rgba(0,0,0,0.45)';
      modal.style.display = 'none';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '40000020';

      var card = document.createElement('div');
      card.style.background = '#fff';
      card.style.borderRadius = '8px';
      card.style.width = '520px';
      card.style.maxWidth = '92vw';
      card.style.padding = '16px';
      card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '12px';

      var title = document.createElement('div');
      title.textContent = 'Embed Modelo';
      title.style.fontWeight = '600';
      title.style.fontSize = '16px';
      card.appendChild(title);

      var optionsRow = document.createElement('div');
      optionsRow.className = 'costos-embed-options';
      optionsRow.style.display = 'grid';
      optionsRow.style.gridTemplateColumns = '1fr 1fr';
      optionsRow.style.gap = '8px';

      function addOption(id, labelText) {
        var label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '6px';
        label.style.fontSize = '12px';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.optionId = id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(labelText));
        optionsRow.appendChild(label);
        return input;
      }

      var hideControlsInput = addOption('hideControls', 'Ocultar controles');
      var hideSelectionInput = addOption('hideSelectionInfo', 'Ocultar propiedades');
      var noScrollInput = addOption('noScroll', 'Bloquear scroll');
      var transparentInput = addOption('isTransparent', 'Fondo transparente');

      card.appendChild(optionsRow);

      var urlLabel = document.createElement('div');
      urlLabel.textContent = 'URL';
      urlLabel.style.fontSize = '12px';
      urlLabel.style.fontWeight = '600';
      card.appendChild(urlLabel);

      var urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.readOnly = true;
      urlInput.style.width = '100%';
      urlInput.style.padding = '8px';
      urlInput.style.border = '1px solid #e5e7eb';
      urlInput.style.borderRadius = '6px';
      urlInput.style.fontSize = '12px';
      card.appendChild(urlInput);

      var iframeLabel = document.createElement('div');
      iframeLabel.textContent = 'Iframe';
      iframeLabel.style.fontSize = '12px';
      iframeLabel.style.fontWeight = '600';
      card.appendChild(iframeLabel);

      var iframeInput = document.createElement('textarea');
      iframeInput.readOnly = true;
      iframeInput.style.width = '100%';
      iframeInput.style.minHeight = '80px';
      iframeInput.style.padding = '8px';
        iframeInput.style.border = '1px solid #e5e7eb';
        iframeInput.style.borderRadius = '6px';
        iframeInput.style.fontSize = '12px';
        card.appendChild(iframeInput);

        var publicLabel = document.createElement('div');
        publicLabel.textContent = 'Enlace publico (solo IFC)';
        publicLabel.style.fontSize = '12px';
        publicLabel.style.fontWeight = '600';
        publicLabel.style.marginTop = '6px';
        card.appendChild(publicLabel);

        var publicButton = document.createElement('button');
        publicButton.type = 'button';
        publicButton.textContent = 'Generar enlace publico';
        publicButton.style.padding = '6px 10px';
        publicButton.style.border = '1px solid #e5e7eb';
        publicButton.style.borderRadius = '6px';
        publicButton.style.background = '#fff';
        publicButton.style.cursor = 'pointer';
        publicButton.style.alignSelf = 'flex-start';
        card.appendChild(publicButton);

        var publicUrlInput = document.createElement('input');
        publicUrlInput.type = 'text';
        publicUrlInput.readOnly = true;
        publicUrlInput.style.width = '100%';
        publicUrlInput.style.padding = '8px';
        publicUrlInput.style.border = '1px solid #e5e7eb';
        publicUrlInput.style.borderRadius = '6px';
        publicUrlInput.style.fontSize = '12px';
        card.appendChild(publicUrlInput);

        var publicIframeLabel = document.createElement('div');
        publicIframeLabel.textContent = 'Iframe publico';
        publicIframeLabel.style.fontSize = '12px';
        publicIframeLabel.style.fontWeight = '600';
        card.appendChild(publicIframeLabel);

        var publicIframeInput = document.createElement('textarea');
        publicIframeInput.readOnly = true;
        publicIframeInput.style.width = '100%';
        publicIframeInput.style.minHeight = '80px';
        publicIframeInput.style.padding = '8px';
        publicIframeInput.style.border = '1px solid #e5e7eb';
        publicIframeInput.style.borderRadius = '6px';
        publicIframeInput.style.fontSize = '12px';
        card.appendChild(publicIframeInput);

      var actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '8px';

      var copyUrlBtn = document.createElement('button');
      copyUrlBtn.type = 'button';
      copyUrlBtn.textContent = 'Copiar URL';
      copyUrlBtn.style.padding = '6px 10px';
      copyUrlBtn.style.border = '1px solid #e5e7eb';
      copyUrlBtn.style.borderRadius = '6px';
      copyUrlBtn.style.background = '#fff';
      copyUrlBtn.style.cursor = 'pointer';
      copyUrlBtn.addEventListener('click', function () {
        copyToClipboard(urlInput.value);
      });

      var copyIframeBtn = document.createElement('button');
      copyIframeBtn.type = 'button';
      copyIframeBtn.textContent = 'Copiar iframe';
      copyIframeBtn.style.padding = '6px 10px';
        copyIframeBtn.style.border = '1px solid #e5e7eb';
        copyIframeBtn.style.borderRadius = '6px';
        copyIframeBtn.style.background = '#fff';
        copyIframeBtn.style.cursor = 'pointer';
        copyIframeBtn.addEventListener('click', function () {
          copyToClipboard(iframeInput.value);
        });

        var copyPublicUrlBtn = document.createElement('button');
        copyPublicUrlBtn.type = 'button';
        copyPublicUrlBtn.textContent = 'Copiar publico';
        copyPublicUrlBtn.style.padding = '6px 10px';
        copyPublicUrlBtn.style.border = '1px solid #e5e7eb';
        copyPublicUrlBtn.style.borderRadius = '6px';
        copyPublicUrlBtn.style.background = '#fff';
        copyPublicUrlBtn.style.cursor = 'pointer';
        copyPublicUrlBtn.addEventListener('click', function () {
          copyToClipboard(publicUrlInput.value);
        });

        var copyPublicIframeBtn = document.createElement('button');
        copyPublicIframeBtn.type = 'button';
        copyPublicIframeBtn.textContent = 'Copiar iframe publico';
        copyPublicIframeBtn.style.padding = '6px 10px';
        copyPublicIframeBtn.style.border = '1px solid #e5e7eb';
        copyPublicIframeBtn.style.borderRadius = '6px';
        copyPublicIframeBtn.style.background = '#fff';
        copyPublicIframeBtn.style.cursor = 'pointer';
        copyPublicIframeBtn.addEventListener('click', function () {
          copyToClipboard(publicIframeInput.value);
        });

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'Cerrar';
      closeBtn.style.padding = '6px 10px';
      closeBtn.style.border = 'none';
      closeBtn.style.borderRadius = '6px';
      closeBtn.style.background = '#2563eb';
      closeBtn.style.color = '#fff';
      closeBtn.style.cursor = 'pointer';
      closeBtn.addEventListener('click', function () {
        modal.style.display = 'none';
      });

        actions.appendChild(copyUrlBtn);
        actions.appendChild(copyIframeBtn);
        actions.appendChild(copyPublicUrlBtn);
        actions.appendChild(copyPublicIframeBtn);
        actions.appendChild(closeBtn);
      card.appendChild(actions);

      function updateEmbedFields() {
        var embedOptions = {
          hideControls: hideControlsInput.checked,
          hideSelectionInfo: hideSelectionInput.checked,
          noScroll: noScrollInput.checked,
          isTransparent: transparentInput.checked
        };
          var url = buildEmbedUrl(embedOptions);
          urlInput.value = url;
          iframeInput.value = '<iframe src="' + url + '" width="600" height="400" frameborder="0"></iframe>';
          if (publicUrlInput.value) {
            var publicUrl = buildPublicEmbedUrl(publicUrlInput.value, embedOptions);
            publicUrlInput.value = publicUrl;
            publicIframeInput.value = '<iframe src="' + publicUrl + '" width="600" height="400" frameborder="0"></iframe>';
          }
        }

        hideControlsInput.addEventListener('change', updateEmbedFields);
        hideSelectionInput.addEventListener('change', updateEmbedFields);
        noScrollInput.addEventListener('change', updateEmbedFields);
        transparentInput.addEventListener('change', updateEmbedFields);

        publicButton.addEventListener('click', function () {
          var meta = readIfcModelsMeta();
          var modelId = pickPublicModelId(meta) || pickModelIdFromUrl();
          sendServerLog({
            event: 'ifc_public_link_request',
            hasMeta: !!meta,
            modelId: modelId || null
          });
          if (!modelId) {
            sendServerLog({ event: 'ifc_public_link_missing_model' });
            alert('No se pudo determinar el modelo IFC.');
            return;
          }
          publicButton.disabled = true;
          publicButton.textContent = 'Generando...';
          fetch('/costos/ifc_public_link', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken()
            },
            body: JSON.stringify({ id: modelId })
          })
            .then(function (resp) {
              if (!resp.ok) throw new Error('public link http ' + resp.status);
              return resp.json();
            })
            .then(function (data) {
              if (!data || !data.url) throw new Error('public link missing');
              sendServerLog({ event: 'ifc_public_link_ok', url: data.url });
              var embedOptions = {
                hideControls: hideControlsInput.checked,
                hideSelectionInfo: hideSelectionInput.checked,
                noScroll: noScrollInput.checked,
                isTransparent: transparentInput.checked
              };
              var publicUrl = buildPublicEmbedUrl(data.url, embedOptions);
              publicUrlInput.value = publicUrl;
              publicIframeInput.value = '<iframe src="' + publicUrl + '" width="600" height="400" frameborder="0"></iframe>';
            })
            .catch(function () {
              sendServerLog({ event: 'ifc_public_link_failed' });
              alert('No se pudo generar el enlace publico.');
            })
            .finally(function () {
              publicButton.disabled = false;
              publicButton.textContent = 'Generar enlace publico';
            });
        });

        modal.addEventListener('click', function (event) {
          if (event.target === modal) {
            modal.style.display = 'none';
          }
        });

      card.addEventListener('click', function (event) {
        event.stopPropagation();
      });

      modal.appendChild(card);
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    var inputs = modal.querySelectorAll('input[data-option-id]');
    for (var i = 0; i < inputs.length; i += 1) {
      inputs[i].checked = false;
    }
    var firstInput = modal.querySelector('input[data-option-id]');
    if (firstInput) {
      var evt = document.createEvent('Event');
      evt.initEvent('change', true, true);
      firstInput.dispatchEvent(evt);
    }
  }

  function isLeftPanelVisible() {
    var panel = document.querySelector('.costos-left-panel');
    return !!(panel && panel.style.display !== 'none');
  }

  function toggleLeftPanel() {
    try {
      var panel = ensureLeftPanel();
      if (!panel) return;
      var isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      if (!isHidden && lastBimViewer) {
        injectEffectControls(lastBimViewer);
      }
    } catch (e) {
      // ignore
    }
  }

  function ensureLeftPanel() {
    var panel = document.querySelector('.costos-left-panel');
    if (panel) return panel;

    var container = document.querySelector('[data-test-selector="op-ifc-viewer-container"]') ||
      document.querySelector('.op-ifc-viewer-container') ||
      document.querySelector('op-ifc-viewer') ||
      document.body;
    if (!container) return null;

    if (container !== document.body) {
      var style = window.getComputedStyle(container);
      if (style.position === 'static') {
        container.style.position = 'relative';
      }
    }

    panel = document.createElement('div');
    panel.className = 'costos-left-panel';
    panel.style.position = container === document.body ? 'fixed' : 'absolute';
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.height = '100%';
    panel.style.width = '320px';
    panel.style.background = '#ffffff';
    panel.style.borderRight = '1px solid #e5e7eb';
    panel.style.boxShadow = '2px 0 10px rgba(0, 0, 0, 0.08)';
    panel.style.zIndex = '9100';
    panel.style.display = 'none';
    panel.style.overflow = 'auto';

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '10px 12px';
    header.style.borderBottom = '1px solid #e5e7eb';
    header.style.fontWeight = '600';
    header.textContent = 'Efectos visuales';

    panel.appendChild(header);

    var body = document.createElement('div');
    body.className = 'costos-left-panel-body';
    body.style.padding = '12px';
    body.style.height = 'calc(100% - 42px)';
    body.style.overflowY = 'auto';
    body.style.boxSizing = 'border-box';
    panel.appendChild(body);

    container.appendChild(panel);
    if (lastBimViewer) {
      injectEffectControls(lastBimViewer);
    }
    return panel;
  }

  function enableContextMenu(viewer) {
    try {
      if (!viewer || !viewer.canvas) return;
      if (viewer.__costosContextMenuBound) return;

      // Prefer built-in xeokit context menu handling when available
      if (viewer.cameraControl && typeof viewer.cameraControl.on === 'function' &&
        viewer.contextMenu && typeof viewer.contextMenu.show === 'function') {
        viewer.__costosContextMenuBound = true;
        return;
      }

      function showMenuFromEvent(evt) {
        if (!viewer.contextMenu || typeof viewer.contextMenu.show !== 'function') return;
        var pos = evt && evt.pagePos ? evt.pagePos : null;
        if (!pos && evt && evt.event) {
          pos = [evt.event.clientX, evt.event.clientY];
        }
        if (!pos && evt && typeof evt.clientX === 'number') {
          pos = [evt.clientX, evt.clientY];
        }
        if (pos) {
          viewer.contextMenu.show(pos[0], pos[1]);
        }
      }

      // Prefer xeokit rightClick event (more reliable than DOM contextmenu)
      if (viewer.cameraControl && typeof viewer.cameraControl.on === 'function') {
        viewer.cameraControl.on('rightClick', function (evt) {
          try {
            showMenuFromEvent(evt);
          } catch (e) {
            // ignore
          }
        });
      }

      // Fallback to native contextmenu on canvas
      var canvas = viewer.canvas;
      canvas.addEventListener('pointerdown', function (event) {
        try {
          if (event.button === 2) {
            event.preventDefault();
            event.stopPropagation();
            showMenuFromEvent(event);
          }
        } catch (e) {
          // ignore
        }
      });
      canvas.addEventListener('contextmenu', function (event) {
        try {
          event.preventDefault();
          event.stopPropagation();
          showMenuFromEvent(event);
        } catch (e) {
          // ignore
        }
      });

      viewer.__costosContextMenuBound = true;
    } catch (e) {
      // ignore
    }
  }

  function getVisibleContextMenuItems() {
    try {
      var items = document.querySelectorAll('.xeokit-context-menu-item');
      var result = [];
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        if (!item) continue;
        var style = window.getComputedStyle(item);
        if (!style) continue;
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (item.offsetParent === null && style.position !== 'fixed') continue;
        result.push(item);
      }
      return result;
    } catch (e) {
      return [];
    }
  }

  function findContextMenuItemByLabel(label) {
    try {
      var target = String(label || '').trim().toLowerCase();
      if (!target) return null;
      var items = getVisibleContextMenuItems();
      for (var i = 0; i < items.length; i += 1) {
        var text = String(items[i].textContent || '').trim().toLowerCase();
        if (text === target) return items[i];
      }
      for (var j = 0; j < items.length; j += 1) {
        var content = String(items[j].textContent || '').trim().toLowerCase();
        if (content.indexOf(target) !== -1) return items[j];
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function hideViewerContextMenu(viewer) {
    try {
      if (viewer && viewer.contextMenu && typeof viewer.contextMenu.hide === 'function') {
        viewer.contextMenu.hide();
      }
    } catch (e) {
      // ignore
    }
  }

  function showViewerContextMenuAt(viewer, clientX, clientY) {
    try {
      if (!viewer || !viewer.contextMenu || typeof viewer.contextMenu.show !== 'function') return false;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return false;
      viewer.contextMenu.show(clientX, clientY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function invokeContextMenuAction(viewer, clientX, clientY, label, onDone) {
    try {
      if (!showViewerContextMenuAt(viewer, clientX, clientY)) {
        if (typeof onDone === 'function') onDone(false);
        return;
      }
      var attempts = 0;
      var maxAttempts = 8;

      function finalize(success) {
        hideViewerContextMenu(viewer);
        if (typeof onDone === 'function') onDone(!!success);
      }

      function waitForMenu() {
        attempts += 1;
        var item = findContextMenuItemByLabel(label);
        if (item) {
          try {
            item.click();
          } catch (e) {
            finalize(false);
            return;
          }
          window.setTimeout(function () {
            finalize(true);
          }, 30);
          return;
        }
        if (attempts >= maxAttempts) {
          finalize(false);
          return;
        }
        window.setTimeout(waitForMenu, 30);
      }

      window.setTimeout(waitForMenu, 0);
    } catch (e) {
      if (typeof onDone === 'function') onDone(false);
    }
  }

  function invokeContextMenuActionSequence(viewer, clientX, clientY, labels, onDone) {
    try {
      var queue = Array.isArray(labels) ? labels.slice() : [];

      function runNext() {
        if (!queue.length) {
          if (typeof onDone === 'function') onDone(true);
          return;
        }
        var nextLabel = queue.shift();
        invokeContextMenuAction(viewer, clientX, clientY, nextLabel, function (success) {
          if (!success) {
            if (typeof onDone === 'function') onDone(false);
            return;
          }
          window.setTimeout(runNext, 40);
        });
      }

      runNext();
    } catch (e) {
      if (typeof onDone === 'function') onDone(false);
    }
  }

  function enableLeftClickInspect(bimViewer, viewer) {
    try {
      if (!viewer || !viewer.cameraControl) return false;
      if (viewer.__costosLeftClickBound) return true;

      function clearSelection() {
        try {
          if (viewer.scene && typeof viewer.scene.setObjectsSelected === 'function') {
            if (viewer.scene.selectedObjectIds && viewer.scene.selectedObjectIds.length) {
              viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
            }
          }
        } catch (e) {
          // ignore
        }
      }

      function resolvePickedEntity(hit) {
        if (!hit) return null;
        if (hit.entity && (hit.entity.id != null || hit.entity.isObject)) return hit.entity;
        if (hit.object && (hit.object.id != null || hit.object.isObject)) return hit.object;
        if (hit.mesh && (hit.mesh.id != null || hit.mesh.isObject)) return hit.mesh;
        if (hit.id != null) return hit;
        return null;
      }

      function inspectEntity(entity) {
        try {
          if (!entity || entity.id == null) return;
          if (viewer.scene && typeof viewer.scene.setObjectsSelected === 'function') {
            clearSelection();
            viewer.scene.setObjectsSelected([entity.id], true);
          } else {
            entity.selected = true;
          }
          if (bimViewer && typeof bimViewer.showObjectProperties === 'function') {
            bimViewer.showObjectProperties(entity.id);
            if (typeof bimViewer.openTab === 'function') {
              if (isBcfPage()) {
                ensureModelsTabReady(bimViewer);
              } else {
                bimViewer.openTab('properties');
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }

      if (typeof viewer.cameraControl.on === 'function') {
        viewer.cameraControl.on('picked', function (evt) {
          try {
            var rawEvent = evt && (evt.event || evt.sourceEvent || evt.originalEvent);
            if (rawEvent) {
              if (typeof rawEvent.button === 'number' && rawEvent.button !== 0) return;
              if (typeof rawEvent.buttons === 'number' && rawEvent.buttons !== 1) return;
            }
            var entity = resolvePickedEntity(evt);
            inspectEntity(entity);
          } catch (e) {
            // ignore
          }
        });

        viewer.cameraControl.on('pickedNothing', function (evt) {
          try {
            var rawEvent = evt && (evt.event || evt.sourceEvent || evt.originalEvent);
            if (rawEvent) {
              if (typeof rawEvent.button === 'number' && rawEvent.button !== 0) return;
              if (typeof rawEvent.buttons === 'number' && rawEvent.buttons !== 1) return;
            }
            clearSelection();
          } catch (e) {
            // ignore
          }
        });
      }

      var canvasEl = viewer.scene && viewer.scene.canvas && viewer.scene.canvas.canvas;
      if (canvasEl && !viewer.__costosLeftClickCanvasBound) {
        var lastPointerDown = null;
        canvasEl.addEventListener('pointerdown', function (event) {
          if (!event || event.button !== 0) return;
          lastPointerDown = {
            x: event.clientX,
            y: event.clientY
          };
        }, true);

        canvasEl.addEventListener('pointerup', function (event) {
          try {
            if (!event || event.button !== 0) return;
            if (!lastPointerDown) return;
            var dx = Math.abs(event.clientX - lastPointerDown.x);
            var dy = Math.abs(event.clientY - lastPointerDown.y);
            lastPointerDown = null;
            if (dx > 4 || dy > 4) return;
            var rect = canvasEl.getBoundingClientRect();
            var canvasPos = [
              event.clientX - rect.left,
              event.clientY - rect.top
            ];
            function runManualFallback() {
              var hit = null;
              if (viewer.scene && typeof viewer.scene.pick === 'function') {
                hit = viewer.scene.pick({
                  canvasPos: canvasPos,
                  pickSurface: true
                });
              } else if (typeof viewer.pick === 'function') {
                hit = viewer.pick({
                  canvasPos: canvasPos,
                  pickSurface: true
                });
              }
              var entity = resolvePickedEntity(hit);
              if (entity) {
                inspectEntity(entity);
              } else if (viewer.scene && typeof viewer.scene.pick === 'function') {
                hit = viewer.scene.pick({
                  canvasPos: canvasPos,
                  pickSurface: false
                });
                entity = resolvePickedEntity(hit);
                if (entity) {
                  inspectEntity(entity);
                  return;
                }
                clearSelection();
              } else {
                clearSelection();
              }
            }

            if (viewer.contextMenu && typeof viewer.contextMenu.show === 'function') {
              invokeContextMenuActionSequence(
                viewer,
                event.clientX,
                event.clientY,
                ['Select', 'Inspect Properties'],
                function (success) {
                  if (!success) {
                    runManualFallback();
                  }
                }
              );
            } else {
              runManualFallback();
            }
          } catch (e) {
            // ignore
          }
        }, true);
        viewer.__costosLeftClickCanvasBound = true;
      }

      viewer.__costosLeftClickBound = true;
      return true;
    } catch (e) {
      // ignore
      return false;
    }
  }

  function injectEffectControls(bimViewer) {
    try {
      var viewer = bimViewer.viewer || bimViewer;
      var configTarget = bimViewer;
      var sceneRef = viewer && viewer.scene;
      var leftPanel = document.querySelector('.costos-left-panel');
      var panelBody = leftPanel && leftPanel.querySelector('.costos-left-panel-body');
      if (!panelBody) return;
      var panel = panelBody;
      if (!panel) return;
      if (panel.querySelector('.costos-effects-body')) return;

      var body = document.createElement('div');
      body.className = 'costos-effects-body';
      body.style.marginTop = '8px';
      body.style.paddingTop = '8px';
      body.style.borderTop = '1px solid #e5e5e5';
      body.style.maxWidth = '100%';
      body.style.boxSizing = 'border-box';
      body.style.paddingRight = '6px';
      if (!panelBody) {
        body.style.maxHeight = '40vh';
        body.style.overflowY = 'auto';
      }

      function addSlider(label, key, min, max, step, getter, setter, isSupported) {
        var row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '4px';
        row.style.marginBottom = '6px';
        row.style.maxWidth = '100%';
        row.style.boxSizing = 'border-box';

        if (typeof isSupported === 'function' && !isSupported()) {
          return;
        }

        var header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';

        var text = document.createElement('span');
        text.textContent = label;
        text.style.fontSize = '12px';

        var value = document.createElement('span');
        value.style.fontSize = '11px';
        value.style.color = '#666';

        var input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(getter());
        input.style.width = '100%';
        input.style.maxWidth = '100%';
        input.style.boxSizing = 'border-box';
        value.textContent = input.value;

        input.addEventListener('input', function () {
          value.textContent = input.value;
          try {
            var num = parseFloat(input.value);
            setter(num);
            if (key) {
              if (configTarget && typeof configTarget.setConfig === 'function') {
                configTarget.setConfig(key, num);
              } else if (viewer && typeof viewer.setConfig === 'function') {
                viewer.setConfig(key, num);
              }
            }
          } catch (e) {
            // ignore
          }
        });

        header.appendChild(text);
        header.appendChild(value);
        row.appendChild(header);
        row.appendChild(input);
        return row;
      }

      function addSection(titleTextValue, enabled, onToggle) {
        var section = document.createElement('div');
        section.style.border = '1px solid #e5e7eb';
        section.style.borderRadius = '6px';
        section.style.padding = '8px';
        section.style.marginBottom = '8px';
        section.style.background = '#f9fafb';
        section.style.boxSizing = 'border-box';

        var header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '6px';

        var label = document.createElement('div');
        label.textContent = titleTextValue;
        label.style.fontWeight = '600';
        label.style.fontSize = '12px';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!enabled;
        checkbox.addEventListener('change', function () {
          content.style.display = checkbox.checked ? 'block' : 'none';
          if (typeof onToggle === 'function') onToggle(checkbox.checked);
        });

        header.appendChild(label);
        header.appendChild(checkbox);
        section.appendChild(header);

        var content = document.createElement('div');
        content.style.display = checkbox.checked ? 'block' : 'none';
        section.appendChild(content);
        body.appendChild(section);

        return { section: section, content: content, checkbox: checkbox };
      }

      function appendSlider(containerEl, sliderRow) {
        if (sliderRow && containerEl) containerEl.appendChild(sliderRow);
      }

      function getSceneLight(scene, id) {
        if (!scene) return null;
        if (scene.lights && scene.lights[id]) return scene.lights[id];
        if (scene.lights) {
          var keys = Object.keys(scene.lights);
          for (var i = 0; i < keys.length; i += 1) {
            var light = scene.lights[keys[i]];
            if (light && light.id === id) return light;
          }
        }
        return null;
      }

      var saoSection = addSection('SAO', !!(sceneRef && sceneRef.sao && sceneRef.sao.enabled), function (enabled) {
        if (sceneRef && sceneRef.sao) sceneRef.sao.enabled = enabled;
        if (configTarget && typeof configTarget.setConfig === 'function') {
          configTarget.setConfig('saoEnabled', enabled);
        }
      });

      appendSlider(saoSection.content, addSlider('SAO intensity', 'saoIntensity', 0, 1, 0.01,
        function () { return CONFIG.viewerConfigs.saoIntensity; },
        function (val) {
          CONFIG.viewerConfigs.saoIntensity = val;
          if (sceneRef && sceneRef.sao) {
            sceneRef.sao.intensity = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.sao); }));

      appendSlider(saoSection.content, addSlider('SAO bias', 'saoBias', 0, 1, 0.01,
        function () { return CONFIG.viewerConfigs.saoBias; },
        function (val) {
          CONFIG.viewerConfigs.saoBias = val;
          if (sceneRef && sceneRef.sao) {
            sceneRef.sao.bias = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.sao); }));

      appendSlider(saoSection.content, addSlider('SAO kernel', 'saoKernelRadius', 1, 200, 1,
        function () { return CONFIG.viewerConfigs.saoKernelRadius; },
        function (val) {
          CONFIG.viewerConfigs.saoKernelRadius = val;
          if (sceneRef && sceneRef.sao) {
            sceneRef.sao.kernelRadius = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.sao); }));

      var xraySection = addSection('X-Ray', false, function (enabled) {
        if (sceneRef && typeof sceneRef.setObjectsXRayed === 'function' && sceneRef.objects) {
          var ids = Object.keys(sceneRef.objects);
          if (ids.length) {
            sceneRef.setObjectsXRayed(ids, enabled);
          }
        }
        if (sceneRef && sceneRef.xrayMaterial) {
          sceneRef.xrayMaterial.fill = enabled ? true : sceneRef.xrayMaterial.fill;
          sceneRef.xrayMaterial.edges = enabled ? true : sceneRef.xrayMaterial.edges;
        }
      });

      appendSlider(xraySection.content, addSlider('Xray fill alpha', null, 0, 1, 0.01,
        function () {
          return sceneRef && sceneRef.xrayMaterial ? sceneRef.xrayMaterial.fillAlpha : 0.3;
        },
        function (val) {
          if (sceneRef && sceneRef.xrayMaterial) {
            if (typeof sceneRef.setObjectsXRayed === 'function' && sceneRef.objects) {
              var ids = Object.keys(sceneRef.objects);
              if (ids.length) {
                sceneRef.setObjectsXRayed(ids, true);
                xraySection.checkbox.checked = true;
              }
            }
            sceneRef.xrayMaterial.fill = true;
            sceneRef.xrayMaterial.fillAlpha = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.xrayMaterial); }));

      appendSlider(xraySection.content, addSlider('Xray edge alpha', null, 0, 1, 0.01,
        function () {
          return sceneRef && sceneRef.xrayMaterial ? sceneRef.xrayMaterial.edgeAlpha : 0.2;
        },
        function (val) {
          if (sceneRef && sceneRef.xrayMaterial) {
            if (typeof sceneRef.setObjectsXRayed === 'function' && sceneRef.objects) {
              var ids = Object.keys(sceneRef.objects);
              if (ids.length) {
                sceneRef.setObjectsXRayed(ids, true);
                xraySection.checkbox.checked = true;
              }
            }
            sceneRef.xrayMaterial.edges = true;
            sceneRef.xrayMaterial.edgeAlpha = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.xrayMaterial); }));

      var highlightSection = addSection('Highlight', false, function (enabled) {
        if (sceneRef && sceneRef.highlightMaterial) {
          sceneRef.highlightMaterial.fill = enabled;
          sceneRef.highlightMaterial.edges = enabled;
        }
        if (sceneRef && typeof sceneRef.setObjectsHighlighted === 'function' && sceneRef.objects) {
          var highlightIds = Object.keys(sceneRef.objects);
          if (highlightIds.length) {
            sceneRef.setObjectsHighlighted(highlightIds, enabled);
          }
        }
      });

      appendSlider(highlightSection.content, addSlider('Highlight fill alpha', null, 0, 1, 0.01,
        function () {
          return sceneRef && sceneRef.highlightMaterial ? sceneRef.highlightMaterial.fillAlpha : 0.12;
        },
        function (val) {
          if (sceneRef && sceneRef.highlightMaterial) {
            if (typeof sceneRef.setObjectsHighlighted === 'function' && sceneRef.objects) {
              var ids = Object.keys(sceneRef.objects);
              if (ids.length) {
                sceneRef.setObjectsHighlighted(ids, true);
                highlightSection.checkbox.checked = true;
              }
            }
            sceneRef.highlightMaterial.fill = true;
            sceneRef.highlightMaterial.fillAlpha = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.highlightMaterial); }));

      appendSlider(highlightSection.content, addSlider('Highlight edge alpha', null, 0, 1, 0.01,
        function () {
          return sceneRef && sceneRef.highlightMaterial ? sceneRef.highlightMaterial.edgeAlpha : 0.8;
        },
        function (val) {
          if (sceneRef && sceneRef.highlightMaterial) {
            if (typeof sceneRef.setObjectsHighlighted === 'function' && sceneRef.objects) {
              var ids = Object.keys(sceneRef.objects);
              if (ids.length) {
                sceneRef.setObjectsHighlighted(ids, true);
                highlightSection.checkbox.checked = true;
              }
            }
            sceneRef.highlightMaterial.edges = true;
            sceneRef.highlightMaterial.edgeAlpha = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.highlightMaterial); }));

      var selectedSection = addSection('Selected', false, function (enabled) {
        if (sceneRef && sceneRef.selectedMaterial) {
          sceneRef.selectedMaterial.fill = enabled;
          sceneRef.selectedMaterial.edges = enabled;
        }
        if (sceneRef && typeof sceneRef.setObjectsSelected === 'function' && sceneRef.objects) {
          var selectedIds = Object.keys(sceneRef.objects);
          if (selectedIds.length) {
            sceneRef.setObjectsSelected(selectedIds, enabled);
          }
        }
      });

      appendSlider(selectedSection.content, addSlider('Selected fill alpha', null, 0, 1, 0.01,
        function () {
          return sceneRef && sceneRef.selectedMaterial ? sceneRef.selectedMaterial.fillAlpha : 0.15;
        },
        function (val) {
          if (sceneRef && sceneRef.selectedMaterial) {
            if (typeof sceneRef.setObjectsSelected === 'function' && sceneRef.objects) {
              var ids = Object.keys(sceneRef.objects);
              if (ids.length) {
                sceneRef.setObjectsSelected(ids, true);
                selectedSection.checkbox.checked = true;
              }
            }
            sceneRef.selectedMaterial.fill = true;
            sceneRef.selectedMaterial.fillAlpha = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.selectedMaterial); }));

      appendSlider(selectedSection.content, addSlider('Selected edge alpha', null, 0, 1, 0.01,
        function () {
          return sceneRef && sceneRef.selectedMaterial ? sceneRef.selectedMaterial.edgeAlpha : 0.9;
        },
        function (val) {
          if (sceneRef && sceneRef.selectedMaterial) {
            if (typeof sceneRef.setObjectsSelected === 'function' && sceneRef.objects) {
              var ids = Object.keys(sceneRef.objects);
              if (ids.length) {
                sceneRef.setObjectsSelected(ids, true);
                selectedSection.checkbox.checked = true;
              }
            }
            sceneRef.selectedMaterial.edges = true;
            sceneRef.selectedMaterial.edgeAlpha = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.selectedMaterial); }));

      var edgesSection = addSection('Edges', true, function (enabled) {
        if (sceneRef && sceneRef.edgeMaterial) {
          sceneRef.edgeMaterial.edges = enabled;
        }
        if (configTarget && typeof configTarget.setConfig === 'function') {
          configTarget.setConfig('edgesEnabled', enabled);
        }
      });
      edgesSection.section.style.display = 'none';

      appendSlider(edgesSection.content, addSlider('Edge width', null, 0.5, 5, 0.1,
        function () {
          if (sceneRef && sceneRef.edgeMaterial && typeof sceneRef.edgeMaterial.edgeWidth !== 'undefined') {
            return sceneRef.edgeMaterial.edgeWidth;
          }
          if (sceneRef && sceneRef.edgeMaterial && typeof sceneRef.edgeMaterial.edgeWidthPixels !== 'undefined') {
            return sceneRef.edgeMaterial.edgeWidthPixels;
          }
          return 1;
        },
        function (val) {
          if (sceneRef && sceneRef.edgeMaterial && typeof sceneRef.edgeMaterial.edgeWidth !== 'undefined') {
            sceneRef.edgeMaterial.edgeWidth = val;
          } else if (sceneRef && sceneRef.edgeMaterial && typeof sceneRef.edgeMaterial.edgeWidthPixels !== 'undefined') {
            sceneRef.edgeMaterial.edgeWidthPixels = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.edgeMaterial); }));

      var cameraSection = addSection('Camera', true, function () {});
      cameraSection.section.style.display = 'none';
      appendSlider(cameraSection.content, addSlider('Camera near', 'cameraNear', 0.01, 1, 0.01,
        function () { return CONFIG.viewerConfigs.cameraNear; },
        function (val) {
          CONFIG.viewerConfigs.cameraNear = val;
          if (sceneRef && sceneRef.camera && sceneRef.camera.perspective) {
            sceneRef.camera.perspective.near = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.camera && sceneRef.camera.perspective); }));

      appendSlider(cameraSection.content, addSlider('Camera far', 'cameraFar', 500, 10000, 100,
        function () { return CONFIG.viewerConfigs.cameraFar; },
        function (val) {
          CONFIG.viewerConfigs.cameraFar = val;
          if (sceneRef && sceneRef.camera && sceneRef.camera.perspective) {
            sceneRef.camera.perspective.far = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.camera && sceneRef.camera.perspective); }));

      var lightingState = { ambient: null, sun: null, defaultsCaptured: false };
      var lightingSection = addSection('Lighting', false, function (enabled) {
        if (!sceneRef) return;
        var ambient = getSceneLight(sceneRef, 'ambientLight');
        var sun = getSceneLight(sceneRef, 'sunLight');
        if (!ambient && !sun) return;

        if (!lightingState.defaultsCaptured) {
          if (ambient) lightingState.ambient = ambient.intensity;
          if (sun) lightingState.sun = sun.intensity;
          lightingState.defaultsCaptured = true;
        }

        if (enabled) {
          if (ambient && lightingState.ambient !== null) ambient.intensity = lightingState.ambient;
          if (sun && lightingState.sun !== null) sun.intensity = lightingState.sun;
        } else {
          if (ambient && lightingState.ambient !== null) ambient.intensity = lightingState.ambient;
          if (sun && lightingState.sun !== null) sun.intensity = lightingState.sun;
        }
      });

      appendSlider(lightingSection.content, addSlider('Ambient light', null, 0, 2, 0.05,
        function () {
          var ambient = sceneRef && getSceneLight(sceneRef, 'ambientLight');
          return ambient ? ambient.intensity : 1;
        },
        function (val) {
          var ambient = sceneRef && getSceneLight(sceneRef, 'ambientLight');
          if (ambient) ambient.intensity = val;
        },
        function () { return !!(sceneRef && getSceneLight(sceneRef, 'ambientLight')); }));

      appendSlider(lightingSection.content, addSlider('Sun light', null, 0, 5, 0.1,
        function () {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          return sun ? sun.intensity : 1;
        },
        function (val) {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun) sun.intensity = val;
        },
        function () { return !!(sceneRef && getSceneLight(sceneRef, 'sunLight')); }));

      appendSlider(lightingSection.content, addSlider('Shadow factor', null, 0, 1, 0.05,
        function () {
          return sceneRef && sceneRef.shadow ? sceneRef.shadow.factor : 0.5;
        },
        function (val) {
          if (sceneRef && sceneRef.shadow) {
            sceneRef.shadow.factor = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.shadow); }));

      appendSlider(lightingSection.content, addSlider('Exposure', null, 0.2, 2.0, 0.05,
        function () {
          if (sceneRef && typeof sceneRef.exposure !== 'undefined') return sceneRef.exposure;
          if (sceneRef && sceneRef.lightSetup && typeof sceneRef.lightSetup.exposure !== 'undefined') {
            return sceneRef.lightSetup.exposure;
          }
          return 1;
        },
        function (val) {
          if (sceneRef && typeof sceneRef.exposure !== 'undefined') {
            sceneRef.exposure = val;
          } else if (sceneRef && sceneRef.lightSetup && typeof sceneRef.lightSetup.exposure !== 'undefined') {
            sceneRef.lightSetup.exposure = val;
          }
        },
        function () {
          return !!(sceneRef && (typeof sceneRef.exposure !== 'undefined' ||
            (sceneRef.lightSetup && typeof sceneRef.lightSetup.exposure !== 'undefined')));
        }));

      appendSlider(lightingSection.content, addSlider('Contrast', null, 0.5, 1.5, 0.05,
        function () {
          if (sceneRef && typeof sceneRef.contrast !== 'undefined') return sceneRef.contrast;
          if (sceneRef && sceneRef.lightSetup && typeof sceneRef.lightSetup.contrast !== 'undefined') {
            return sceneRef.lightSetup.contrast;
          }
          return 1;
        },
        function (val) {
          if (sceneRef && typeof sceneRef.contrast !== 'undefined') {
            sceneRef.contrast = val;
          } else if (sceneRef && sceneRef.lightSetup && typeof sceneRef.lightSetup.contrast !== 'undefined') {
            sceneRef.lightSetup.contrast = val;
          }
        },
        function () {
          return !!(sceneRef && (typeof sceneRef.contrast !== 'undefined' ||
            (sceneRef.lightSetup && typeof sceneRef.lightSetup.contrast !== 'undefined')));
        }));

      appendSlider(lightingSection.content, addSlider('Shadow strength', null, 0, 2, 0.1,
        function () {
          if (sceneRef && sceneRef.shadow && typeof sceneRef.shadow.darkness !== 'undefined') {
            return sceneRef.shadow.darkness;
          }
          return 1;
        },
        function (val) {
          if (sceneRef && sceneRef.shadow && typeof sceneRef.shadow.darkness !== 'undefined') {
            sceneRef.shadow.darkness = val;
          }
        },
        function () { return !!(sceneRef && sceneRef.shadow && typeof sceneRef.shadow.darkness !== 'undefined'); }));

      appendSlider(lightingSection.content, addSlider('Light color (R)', null, 0, 255, 1,
        function () {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun && sun.color) return Math.round(sun.color[0] * 255);
          return 255;
        },
        function (val) {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun && sun.color) sun.color[0] = val / 255;
        },
        function () { return !!(sceneRef && getSceneLight(sceneRef, 'sunLight') && getSceneLight(sceneRef, 'sunLight').color); }));

      appendSlider(lightingSection.content, addSlider('Light color (G)', null, 0, 255, 1,
        function () {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun && sun.color) return Math.round(sun.color[1] * 255);
          return 255;
        },
        function (val) {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun && sun.color) sun.color[1] = val / 255;
        },
        function () { return !!(sceneRef && getSceneLight(sceneRef, 'sunLight') && getSceneLight(sceneRef, 'sunLight').color); }));

      appendSlider(lightingSection.content, addSlider('Light color (B)', null, 0, 255, 1,
        function () {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun && sun.color) return Math.round(sun.color[2] * 255);
          return 255;
        },
        function (val) {
          var sun = sceneRef && getSceneLight(sceneRef, 'sunLight');
          if (sun && sun.color) sun.color[2] = val / 255;
        },
        function () { return !!(sceneRef && getSceneLight(sceneRef, 'sunLight') && getSceneLight(sceneRef, 'sunLight').color); }));

      panel.appendChild(body);
      debugLog('effects panel injected');
    } catch (e) {
      // ignore
    }
  }

  function scheduleApply() {
    var attempts = 0;
    var maxAttempts = LIGHT_VIEWER_DISCOVERY ? 20 : 120;
    var timer = window.setInterval(function () {
      attempts += 1;
      var found = tryFindBimViewer();
      if (found && found.viewer) {
        applyViewerConfigs(found.viewer);
        sendServerLog({ event: 'ifc_xeokit_config_found', source: found.source || 'unknown' });
        debugLog('viewer found', found.source || 'unknown');
        window.clearInterval(timer);
      } else if (attempts === 3) {
        var host = document.querySelector('op-ifc-viewer') ||
          document.querySelector('.op-ifc-viewer') ||
          document.querySelector('[data-test-selector="op-ifc-viewer-container"]') ||
          document.querySelector('.op-ifc-viewer-container');
        var message = formatMessage({
          hostFound: !!host,
          hostHasNgContext: !!(host && host.__ngContext__),
          hostTag: host && host.tagName,
          hostClass: host && host.className
        });
        sendServerLog({
          event: 'ifc_xeokit_config_host_check',
          message: message
        });
        debugLog('host check', message);
        if (host) {
          debugLog('ngContext sample', summarizeNgContext(host));
        }
      } else if (attempts === 8 || attempts === 30) {
        sendServerLog({ event: 'ifc_xeokit_config_retry', attempt: attempts });
        debugLog('retry', attempts);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        sendServerLog({ event: 'ifc_xeokit_config_not_found' });
        debugLog('viewer not found after max attempts');
      }
    }, 500);
  }

  window.CostosXeokitConfig = {
    config: CONFIG,
    apply: scheduleApply,
    applyToViewer: applyViewerConfigs
  };
  window.CostosXeokitDebug = window.CostosXeokitDebug || {};
  window.CostosXeokitDebug.modelsHistory = function () {
    return window.__costosModelsDebugHistory || [];
  };
  window.CostosXeokitDebug.lastModelsState = function () {
    var history = window.__costosModelsDebugHistory || [];
    return history.length ? history[history.length - 1] : null;
  };
  window.CostosXeokitDebug.dumpModelsState = function (label) {
    var payload = collectModelsPanelState();
    var eventLabel = label ? ("manual_dump_" + String(label)) : "manual_dump";
    modelsDebugLog(eventLabel, payload);
    return payload;
  };

  window.setTimeout(scheduleApply, 800);
  window.setTimeout(function () { recoverModelsPanel('boot_1500'); }, 1500);
  window.setTimeout(function () { recoverModelsPanel('boot_4000'); }, 4000);
  window.setTimeout(ensureGlobalToolbarButtons, 1200);
  if (!LIGHT_VIEWER_DISCOVERY) {
    window.setTimeout(observeCanvasHost, 1000);
  }
  window.setTimeout(hookXeokitGlobals, 1200);
  watchGlobal('xeokit', hookXeokitGlobals);
  watchGlobal('Xeokit', hookXeokitGlobals);
  watchGlobal('xeokitBimViewer', hookXeokitGlobals);
  var lateApplyIdleTicks = 0;
  var lateApplyTimer = window.setInterval(function () {
    ensureGlobalToolbarButtons();
    recoverModelsPanel('late_tick');
    if (LIGHT_VIEWER_DISCOVERY && lastBimViewer && lastBimViewer.__costosConfigApplied) {
      window.clearInterval(lateApplyTimer);
      return;
    }
    PERF_LATE_TICKS += 1;
    window.CostosPerfState.xeokitConfig.lateTicks = PERF_LATE_TICKS;
    if (PERF_DEBUG && PERF_LATE_TICKS % 10 === 0) {
      perfLog("late_apply_tick", { tick: PERF_LATE_TICKS });
    }
    var found = tryFindBimViewer();
    if (found && found.viewer && !found.viewer.__costosConfigApplied) {
      applyViewerConfigs(found.viewer);
      sendServerLog({ event: 'ifc_xeokit_config_applied_late', source: found.source || 'unknown' });
      debugLog('late apply', found.source || 'unknown');
      lateApplyIdleTicks = 0;
      return;
    }
    var host = findCanvasHost();
    if (host) {
      var canvas = host.querySelector('canvas');
      if (canvas) {
        var viewer = findViewerOnElement(canvas) || findViewerByCanvas(canvas);
        if (viewer && !viewer.__costosConfigApplied) {
          applyViewerConfigs(viewer);
          debugLog('late apply via canvas', 'interval');
          lateApplyIdleTicks = 0;
          return;
        }
      }
    }
    lateApplyIdleTicks += 1;
    if (lateApplyIdleTicks >= 8 && lastBimViewer && lastBimViewer.__costosConfigApplied) {
      // Stop late polling after we have a stable configured viewer.
      perfLog("late_apply_stop", { idleTicks: lateApplyIdleTicks });
      window.clearInterval(lateApplyTimer);
    }
  }, 10000);

  try {
    var toolbarFallbackObserver = new MutationObserver(function () {
      ensureGlobalToolbarButtons();
      recoverModelsPanel('toolbar_mutation');
    });
    toolbarFallbackObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  } catch (e) {
    // ignore
  }

  document.addEventListener('turbo:load', function () {
    window.setTimeout(scheduleApply, 250);
    window.setTimeout(function () { recoverModelsPanel('turbo_load'); }, 900);
  });
  document.addEventListener('turbo:render', function () {
    window.setTimeout(function () { recoverModelsPanel('turbo_render'); }, 500);
  });
})();
