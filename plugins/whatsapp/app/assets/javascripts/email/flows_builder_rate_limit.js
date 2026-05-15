/* eslint-disable no-var, prefer-arrow-callback */
(function () {
  if (typeof FlowBuilder === "undefined") return;

  var originalDefaultDataFor = FlowBuilder.prototype.defaultDataFor;
  var originalNodeTitle = FlowBuilder.prototype.nodeTitle;
  var originalNodeSummary = FlowBuilder.prototype.nodeSummary;
  var originalRenderProperties = FlowBuilder.prototype.renderProperties;

  FlowBuilder.prototype.defaultDataFor = function (type) {
    if (type === "rate_limit") {
      return {
        interval_value: 60,
        interval_unit: "seconds",
        max_per_hour: 30,
        max_per_day: 300,
        window_enabled: false,
        window_start: "09:00",
        window_end: "18:00",
        random_percent: 15,
        prevent_repeat: false,
        dedupe_hours: 24,
        on_daily_limit: "pause_24h"
      };
    }
    return originalDefaultDataFor.call(this, type);
  };

  FlowBuilder.prototype.nodeTitle = function (node) {
    if (node && node.type === "rate_limit") return "Ritmo de envio";
    return originalNodeTitle.call(this, node);
  };

  FlowBuilder.prototype.nodeSummary = function (node) {
    if (node && node.type === "rate_limit") {
      var data = node.data || {};
      var value = Number(data.interval_value || 0);
      var unit = data.interval_unit === "minutes" ? "min" : "seg";
      var perHour = Number(data.max_per_hour || 0);
      var perDay = Number(data.max_per_day || 0);
      return "Cada " + value + unit + " | " + perHour + "/h | " + perDay + "/dia";
    }
    return originalNodeSummary.call(this, node);
  };

  FlowBuilder.prototype.renderRateLimitPanel = function (node, data) {
    if (!this.propertiesBody || !node) return;
    var self = this;

    function updateAndMark() {
      self.markDirty();
      self.render();
    }

    function addField(label, input) {
      var wrapper = document.createElement("div");
      if (label) {
        var lab = document.createElement("label");
        lab.textContent = label;
        wrapper.appendChild(lab);
      }
      wrapper.appendChild(input);
      self.propertiesBody.appendChild(wrapper);
    }

    var title = document.createElement("div");
    title.className = "op-email-email--panel-title";
    title.textContent = "Ritmo de envio";
    self.propertiesBody.appendChild(title);

    var cadenceRow = document.createElement("div");
    cadenceRow.className = "op-email-email--flow-inline";
    var cadenceValue = document.createElement("input");
    cadenceValue.type = "number";
    cadenceValue.min = "1";
    cadenceValue.className = "op-email-email--flow-input";
    cadenceValue.value = Number(data.interval_value || 60);
    cadenceValue.addEventListener("input", function () {
      data.interval_value = Math.max(1, Number(cadenceValue.value || 1));
      updateAndMark();
    });
    var cadenceUnit = document.createElement("select");
    cadenceUnit.className = "op-email-email--flow-select";
    [
      { value: "seconds", text: "Segundos" },
      { value: "minutes", text: "Minutos" }
    ].forEach(function (optionData) {
      var option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.text;
      cadenceUnit.appendChild(option);
    });
    cadenceUnit.value = data.interval_unit || "seconds";
    cadenceUnit.addEventListener("change", function () {
      data.interval_unit = cadenceUnit.value;
      updateAndMark();
    });
    cadenceRow.appendChild(cadenceValue);
    cadenceRow.appendChild(cadenceUnit);
    addField("Enviar 1 elemento cada", cadenceRow);

    var perHour = document.createElement("input");
    perHour.type = "number";
    perHour.min = "1";
    perHour.className = "op-email-email--flow-input";
    perHour.value = Number(data.max_per_hour || 30);
    perHour.addEventListener("input", function () {
      data.max_per_hour = Math.max(1, Number(perHour.value || 1));
      updateAndMark();
    });
    addField("Maximo por hora", perHour);

    var perDay = document.createElement("input");
    perDay.type = "number";
    perDay.min = "1";
    perDay.className = "op-email-email--flow-input";
    perDay.value = Number(data.max_per_day || 300);
    perDay.addEventListener("input", function () {
      data.max_per_day = Math.max(1, Number(perDay.value || 1));
      updateAndMark();
    });
    addField("Maximo por dia", perDay);

    var windowToggle = document.createElement("label");
    windowToggle.className = "op-email-email--flow-checkbox";
    var windowToggleInput = document.createElement("input");
    windowToggleInput.type = "checkbox";
    windowToggleInput.checked = data.window_enabled === true || data.window_enabled === "true";
    windowToggle.appendChild(windowToggleInput);
    windowToggle.appendChild(document.createTextNode(" Activar horario permitido"));
    addField("", windowToggle);

    var windowRow = document.createElement("div");
    windowRow.className = "op-email-email--flow-inline";
    var startInput = document.createElement("input");
    startInput.type = "time";
    startInput.className = "op-email-email--flow-input";
    startInput.value = data.window_start || "09:00";
    var endInput = document.createElement("input");
    endInput.type = "time";
    endInput.className = "op-email-email--flow-input";
    endInput.value = data.window_end || "18:00";
    function syncWindowDisabled() {
      var disabled = !windowToggleInput.checked;
      startInput.disabled = disabled;
      endInput.disabled = disabled;
    }
    windowToggleInput.addEventListener("change", function () {
      data.window_enabled = windowToggleInput.checked;
      syncWindowDisabled();
      updateAndMark();
    });
    startInput.addEventListener("change", function () {
      data.window_start = startInput.value || "09:00";
      updateAndMark();
    });
    endInput.addEventListener("change", function () {
      data.window_end = endInput.value || "18:00";
      updateAndMark();
    });
    windowRow.appendChild(startInput);
    windowRow.appendChild(endInput);
    addField("Horario permitido", windowRow);
    syncWindowDisabled();

    var randomInput = document.createElement("input");
    randomInput.type = "number";
    randomInput.min = "0";
    randomInput.max = "40";
    randomInput.className = "op-email-email--flow-input";
    randomInput.value = Number(data.random_percent || 0);
    randomInput.addEventListener("input", function () {
      var value = Number(randomInput.value || 0);
      if (isNaN(value)) value = 0;
      data.random_percent = Math.min(40, Math.max(0, value));
      updateAndMark();
    });
    addField("Variacion aleatoria (%)", randomInput);

    var repeatWrap = document.createElement("div");
    repeatWrap.className = "op-email-email--flow-inline";
    var repeatToggleLabel = document.createElement("label");
    repeatToggleLabel.className = "op-email-email--flow-checkbox";
    var repeatToggle = document.createElement("input");
    repeatToggle.type = "checkbox";
    repeatToggle.checked = data.prevent_repeat === true || data.prevent_repeat === "true";
    repeatToggleLabel.appendChild(repeatToggle);
    repeatToggleLabel.appendChild(document.createTextNode(" No repetir elemento"));
    var dedupeInput = document.createElement("input");
    dedupeInput.type = "number";
    dedupeInput.min = "1";
    dedupeInput.className = "op-email-email--flow-input";
    dedupeInput.value = Number(data.dedupe_hours || 24);
    function syncDedupeDisabled() {
      dedupeInput.disabled = !repeatToggle.checked;
    }
    repeatToggle.addEventListener("change", function () {
      data.prevent_repeat = repeatToggle.checked;
      syncDedupeDisabled();
      updateAndMark();
    });
    dedupeInput.addEventListener("input", function () {
      data.dedupe_hours = Math.max(1, Number(dedupeInput.value || 1));
      updateAndMark();
    });
    repeatWrap.appendChild(repeatToggleLabel);
    repeatWrap.appendChild(dedupeInput);
    addField("No repetir por horas", repeatWrap);
    syncDedupeDisabled();

    var actionSelect = document.createElement("select");
    actionSelect.className = "op-email-email--flow-select";
    [
      { value: "pause_24h", text: "Pausar 24h" },
      { value: "stop", text: "Detener" }
    ].forEach(function (optionData) {
      var option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.text;
      actionSelect.appendChild(option);
    });
    actionSelect.value = data.on_daily_limit || "pause_24h";
    actionSelect.addEventListener("change", function () {
      data.on_daily_limit = actionSelect.value;
      updateAndMark();
    });
    addField("Si supera limite diario", actionSelect);
  };

  FlowBuilder.prototype.renderProperties = function () {
    var node = Array.isArray(this.nodes) ? this.nodes.find(function (n) { return n.id === this.selectedNodeId; }.bind(this)) : null;
    if (node && node.type === "rate_limit") {
      if (!this.propertiesBody || !this.propertiesEmpty) return;
      this.propertiesBody.innerHTML = "";
      this.propertiesEmpty.style.display = "none";
      this.propertiesBody.style.display = "grid";
      node.data = node.data || this.defaultDataFor("rate_limit");
      this.renderRateLimitPanel(node, node.data);
      return;
    }
    return originalRenderProperties.call(this);
  };
})();
