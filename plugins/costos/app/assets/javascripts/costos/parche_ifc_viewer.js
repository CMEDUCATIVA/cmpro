/* global window, document */
(function () {
  if (window.CostosIfcViewerPatch) return;

  var IS_BCF_PATH = isBcfPath();
  var PATCH_ON_BCF = readBooleanFlag("COSTOS_IFC_PATCH_ON_BCF", false);

  // Production defaults tuned to keep interaction usable while avoiding the
  // worst frame drops caused by high-frequency canvas input.
  var TRACE = !!window.COSTOS_IFC_PATCH_DEBUG;
  var DRAG_MOVE_THROTTLE_MS = readNumberFlag("COSTOS_IFC_DRAG_MOUSEMOVE_THROTTLE_MS", IS_BCF_PATH ? 0 : 16);
  var WHEEL_THROTTLE_MS = readNumberFlag("COSTOS_IFC_WHEEL_THROTTLE_MS", IS_BCF_PATH ? 0 : 40);
  var BLOCK_HOVER_MOUSEMOVE = readBooleanFlag("COSTOS_IFC_BLOCK_HOVER_MOUSEMOVE", IS_BCF_PATH ? false : false);
  var DISABLE_NAV_CUBE = readBooleanFlag("COSTOS_IFC_DISABLE_NAV_CUBE", IS_BCF_PATH ? false : true);
  var APPLY_DELAY_MS = 1200;
  var RETRY_LIMIT = 20;
  var RETRY_DELAY_MS = 1000;

  var state = {
    installed: false,
    moveLastAt: 0,
    wheelLastAt: 0,
    dragging: false,
    dragButtons: 0,
    moveBlocked: 0,
    hoverBlocked: 0,
    wheelBlocked: 0,
    boundCanvas: null,
    boundNavCube: null,
    retryCount: 0
  };

  function log(message, data) {
    if (!TRACE || !window.console || typeof window.console.log !== "function") return;
    try {
      window.console.log("[CostosIfcViewerPatch] " + message, data || {});
    } catch (e) {
      // ignore
    }
  }

  function readNumberFlag(name, fallback) {
    var raw = null;
    try {
      raw = window[name];
    } catch (e) {
      raw = null;
    }
    var parsed = Number(raw);
    return isNaN(parsed) || parsed < 0 ? fallback : parsed;
  }

  function readBooleanFlag(name, fallback) {
    var value = null;
    try {
      value = window[name];
    } catch (e) {
      value = null;
    }
    if (value === true || value === false) return value;
    return fallback;
  }

  function isIfcOrBcfPath() {
    var path = String(window.location.pathname || "");
    return path.indexOf("/ifc_models") !== -1 || path.indexOf("/bcf") !== -1;
  }

  function isBcfPath() {
    var path = String(window.location.pathname || "");
    return path.indexOf("/bcf") !== -1;
  }

  function modelCanvas() {
    return document.querySelector(".op-ifc-viewer--model-canvas");
  }

  function navCubeCanvas() {
    return document.querySelector(".op-ifc-viewer--nav-cube-canvas");
  }

  function onMouseMove(event) {
    var now = Date.now();
    var buttons = typeof event.buttons === "number" ? event.buttons : 0;
    var dragging = state.dragging || buttons > 0;

    if (!dragging && BLOCK_HOVER_MOUSEMOVE) {
      state.hoverBlocked += 1;
      event.stopImmediatePropagation();
      return;
    }

    if (now - state.moveLastAt < DRAG_MOVE_THROTTLE_MS) {
      state.moveBlocked += 1;
      event.stopImmediatePropagation();
      return;
    }

    state.moveLastAt = now;
  }

  function onWheel(event) {
    var now = Date.now();
    if (now - state.wheelLastAt < WHEEL_THROTTLE_MS) {
      state.wheelBlocked += 1;
      event.stopImmediatePropagation();
      return;
    }
    state.wheelLastAt = now;
  }

  function onMouseDown(event) {
    state.dragging = true;
    state.dragButtons = typeof event.buttons === "number" ? event.buttons : 1;
  }

  function onMouseUp() {
    state.dragging = false;
    state.dragButtons = 0;
  }

  function bindCanvas(canvas) {
    if (!canvas || canvas === state.boundCanvas) return;
    canvas.addEventListener("mousemove", onMouseMove, true);
    canvas.addEventListener("wheel", onWheel, true);
    canvas.addEventListener("mousedown", onMouseDown, true);
    canvas.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("mouseup", onMouseUp, true);
    state.boundCanvas = canvas;
    log("bound model canvas", {
      dragMoveThrottleMs: DRAG_MOVE_THROTTLE_MS,
      wheelThrottleMs: WHEEL_THROTTLE_MS,
      blockHoverMousemove: BLOCK_HOVER_MOUSEMOVE
    });
  }

  function bindNavCube(canvas) {
    if (!canvas || canvas === state.boundNavCube) return;
    if (DISABLE_NAV_CUBE) {
      canvas.style.pointerEvents = "none";
      canvas.setAttribute("aria-hidden", "true");
      log("disabled nav cube pointer events");
    } else {
      canvas.addEventListener("mousemove", onMouseMove, true);
    }
    state.boundNavCube = canvas;
    log("bound nav cube");
  }

  function install() {
    if (!isIfcOrBcfPath()) return;
    if (IS_BCF_PATH && !PATCH_ON_BCF) {
      log("skipped on bcf path", { patchOnBcf: PATCH_ON_BCF });
      return;
    }

    var canvas = modelCanvas();
    if (!canvas) {
      scheduleRetry();
      return;
    }

    bindCanvas(canvas);
    bindNavCube(navCubeCanvas());

    if (!state.installed) {
      state.installed = true;
      startReporter();
    }
  }

  function scheduleRetry() {
    if (state.retryCount >= RETRY_LIMIT) return;
    state.retryCount += 1;
    window.setTimeout(install, RETRY_DELAY_MS);
  }

  function startReporter() {
    window.setInterval(function () {
      if (!TRACE) return;
      log("stats", {
        moveBlocked: state.moveBlocked,
        hoverBlocked: state.hoverBlocked,
        wheelBlocked: state.wheelBlocked,
        dragging: state.dragging,
        hasCanvas: !!state.boundCanvas,
        hasNavCube: !!state.boundNavCube
      });
    }, 10000);
  }

  window.CostosIfcViewerPatch = {
    install: install,
    state: state
  };

  window.setTimeout(install, APPLY_DELAY_MS);
})();
