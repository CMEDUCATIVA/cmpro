(function() {
  'use strict';

  const STORAGE_KEY = 'ia:ckeditor:debugEnabled';
  const MAX_LOGS = 300;

  const state = {
    enabled: false,
    logs: [],
  };

  try {
    state.enabled = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch (error) {
    // noop
  }

  function log(event, payload) {
    const now = Date.now();
    const entry = {
      timestamp: new Date().toISOString(),
      time: now,
      event,
      payload,
    };
    state.logs.push(entry);
    if (state.logs.length > MAX_LOGS) {
      state.logs.shift();
    }

    if (state.enabled) {
      try {
        console.debug('[IA Debug]', event, payload);
      } catch (error) {
        // noop
      }
    }
  }

  function setEnabled(value) {
    state.enabled = !!value;
    try {
      window.localStorage.setItem(STORAGE_KEY, state.enabled ? '1' : '0');
    } catch (error) {
      // noop
    }
  }

  function getLogs() {
    return state.logs.slice().reverse();
  }

  function clear() {
    state.logs.length = 0;
  }

  window.iaCkeditorDebug = Object.assign(window.iaCkeditorDebug || {}, {
    log,
    setEnabled,
    getLogs,
    clear,
    isEnabled: () => state.enabled,
    storageKey: STORAGE_KEY,
  });
})();
