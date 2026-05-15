(function () {
  function WADebug() {
    this.enabled = false;
    this.channels = {};
    this.consoleEl = null;
  }

  WADebug.prototype.init = function () {
    var toggles = document.querySelectorAll("[data-wa-debug-channel]");
    var visualToggle = document.querySelector("[data-wa-debug-visual='true']");
    var consoleEl = document.querySelector("[data-wa-debug-console]");
    if (!toggles.length || !consoleEl) return;

    this.consoleEl = consoleEl;
    this.channels = {};
    for (var i = 0; i < toggles.length; i += 1) {
      var channel = toggles[i].getAttribute("data-wa-debug-channel") || "general";
      this.channels[channel] = !!toggles[i].checked;
    }
    this.enabled = this.isAnyEnabled();
    this.syncState();

    var self = this;
    if (visualToggle) {
      var visualEnabled = !!visualToggle.checked;
      document.body.classList.toggle("wa-debug-visual", visualEnabled);
      document.body.dataset.waDebugVisual = visualEnabled ? "true" : "false";
      visualToggle.addEventListener("change", function () {
        var enabled = !!visualToggle.checked;
        document.body.classList.toggle("wa-debug-visual", enabled);
        document.body.dataset.waDebugVisual = enabled ? "true" : "false";
      });
    }
    for (var j = 0; j < toggles.length; j += 1) {
      (function (toggle) {
        toggle.addEventListener("change", function () {
          var channel = toggle.getAttribute("data-wa-debug-channel") || "general";
          self.channels[channel] = !!toggle.checked;
          self.enabled = self.isAnyEnabled();
          self.syncState();
          self.log("debug.channel", { channel: channel, enabled: self.channels[channel] }, channel);
        });
      })(toggles[j]);
    }
  };

  WADebug.prototype.isAnyEnabled = function () {
    var keys = Object.keys(this.channels || {});
    for (var i = 0; i < keys.length; i += 1) {
      if (this.channels[keys[i]]) return true;
    }
    return false;
  };

  WADebug.prototype.syncState = function () {
    document.body.classList.toggle("wa-debug-active", this.enabled);
    document.body.dataset.waDebug = this.enabled ? "true" : "false";
    if (this.consoleEl) {
      this.consoleEl.classList.toggle("is-hidden", !this.enabled);
    }
  };

  WADebug.prototype.log = function (label, payload, channel) {
    var activeChannel = channel || "general";
    if (!this.consoleEl) return;
    if (!this.channels[activeChannel]) return;
    var line = document.createElement("div");
    var time = new Date().toLocaleTimeString();
    var text = "[" + time + "] " + label;
    if (payload !== undefined) {
      var json = "";
      try {
        json = JSON.stringify(payload);
      } catch (error) {
        json = String(payload);
      }
      if (json.length > 1400) {
        json = json.slice(0, 1400) + "...";
      }
      text += " " + json;
    }
    line.textContent = text;
    this.consoleEl.appendChild(line);
    while (this.consoleEl.children.length > 200) {
      this.consoleEl.removeChild(this.consoleEl.firstChild);
    }
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  };

  if (!window.WADebug) {
    window.WADebug = new WADebug();
  }

  function bindDebug() {
    if (window.WADebug && typeof window.WADebug.init === "function") {
      window.WADebug.init();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindDebug);
  } else {
    bindDebug();
  }

  document.addEventListener("turbo:load", bindDebug);
})();
