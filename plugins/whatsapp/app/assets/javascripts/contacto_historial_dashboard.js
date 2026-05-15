(function () {
  function formatNumber(value) {
    var number = Number(value || 0);
    if (!isFinite(number)) number = 0;
    return number.toLocaleString("es-ES");
  }

  function formatDecimal(value) {
    var number = Number(value || 0);
    if (!isFinite(number)) number = 0;
    return number.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDuration(totalSeconds) {
    var seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    var hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
    var mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    var ss = String(seconds % 60).padStart(2, "0");
    return hh + ":" + mm + ":" + ss;
  }

  function formatPercent(value) {
    var number = Number(value || 0);
    if (!isFinite(number)) number = 0;
    return number.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeParseMetrics(raw) {
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function cardHtml(label, value, hint, extraClass) {
    var cardClass = "contacto-history-kpi-card";
    if (extraClass) cardClass += " " + extraClass;
    return [
      '<article class="' + cardClass + '">',
      '<div class="contacto-history-kpi-label">' + label + "</div>",
      '<div class="contacto-history-kpi-value">' + value + "</div>",
      hint ? '<div class="contacto-history-kpi-hint">' + hint + "</div>" : "",
      "</article>"
    ].join("");
  }

  function renderDashboard() {
    var root = document.querySelector("[data-contacto-history-dashboard='true']");
    if (!root) return;

    var metrics = safeParseMetrics(root.getAttribute("data-contacto-history-dashboard-metrics"));

    var totalCalls = Number(metrics.total_calls || 0);
    var uniqueContacts = Number(metrics.unique_contacts || 0);
    var repeatedCalls = Number(metrics.repeated_calls || 0);
    var avgAttempts = Number(metrics.avg_attempts_per_contact || 0);
    var totalCallSeconds = Number(metrics.total_call_seconds || 0);
    var totalPauseSeconds = Number(metrics.total_pause_seconds || 0);
    var totalDeadSeconds = Number(metrics.total_dead_seconds || 0);
    var maxDeadSeconds = Number(metrics.max_dead_seconds || 0);
    var advancedContacts = Number(metrics.advanced_contacts || 0);
    var stalledContacts = Number(metrics.stalled_contacts || 0);
    var outcomeBreakdown = Array.isArray(metrics.outcome_breakdown) ? metrics.outcome_breakdown : [];

    var cards = [];
    cards.push(cardHtml("Llamadas nuevas", formatNumber(uniqueContacts), "Sin repetir", "is-success is-featured"));
    cards.push(cardHtml("Total llamadas", formatNumber(totalCalls), "Intentos del dia"));
    cards.push(cardHtml("Llamadas repetidas", formatNumber(repeatedCalls), "Intentos extra"));
    cards.push(cardHtml("Promedio intentos/cliente", formatDecimal(avgAttempts), "Carga por cliente"));
    cards.push(cardHtml("Tiempo en llamada", formatDuration(totalCallSeconds), "Duracion acumulada"));
    cards.push(cardHtml("Tiempo en pausa", formatDuration(totalPauseSeconds), "Pausa breve", "is-warning"));
    cards.push(cardHtml("Tiempo perdido", formatDuration(totalDeadSeconds), "Solo entre llamada en rojo", "is-danger"));
    cards.push(cardHtml("Mayor tiempo muerto", formatDuration(maxDeadSeconds), "Pico entre llamadas"));
    cards.push(cardHtml("Clientes que avanzaron", formatNumber(advancedContacts), "Outcome con avance"));
    cards.push(cardHtml("3+ intentos sin avance", formatNumber(stalledContacts), "Requiere seguimiento"));

    var outcomeRows = [];
    if (outcomeBreakdown.length) {
      outcomeBreakdown.forEach(function (item) {
        var label = escapeHtml(item && item.label ? item.label : "Sin resultado");
        var count = Number(item && item.count ? item.count : 0);
        var percent = Number(item && item.percent ? item.percent : 0);
        var color = String(item && item.color ? item.color : "").trim();
        var colorClass = color ? " is-" + color : "";
        if (!isFinite(percent)) percent = 0;
        percent = Math.max(0, Math.min(100, percent));
        outcomeRows.push(
          '<div class="contacto-history-outcome-row">' +
            '<div class="contacto-history-outcome-head">' +
              '<span class="contacto-history-outcome-label">' + label + "</span>" +
              '<span class="contacto-history-outcome-meta">' + formatNumber(count) + " (" + formatPercent(percent) + ")</span>" +
            "</div>" +
            '<div class="contacto-history-outcome-bar' + colorClass + '"><span style="width:' + percent + '%"></span></div>' +
          "</div>"
        );
      });
    } else {
      outcomeRows.push('<div class="contacto-history-outcome-empty">Sin resultados para mostrar.</div>');
    }

    root.innerHTML =
      '<section class="contacto-history-kpis">' + cards.join("") + "</section>" +
      '<section class="contacto-history-outcome">' +
        '<div class="contacto-history-outcome-title">Dashboard por resultado</div>' +
        '<div class="contacto-history-outcome-list">' + outcomeRows.join("") + "</div>" +
      "</section>";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderDashboard);
  } else {
    renderDashboard();
  }

  document.addEventListener("turbo:load", renderDashboard);
})();
