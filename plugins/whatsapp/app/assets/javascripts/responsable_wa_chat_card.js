(function () {
  var waResponsibleFetchSeq = 0;

  function getWaResponsibleSelect() {
    return document.querySelector("[data-wa-chat-responsible]");
  }

  function parseWaResponsibleOptions() {
    var root = document.querySelector(".wa-shell");
    if (!root) return [];
    try {
      var parsed = JSON.parse(root.getAttribute("data-wa-responsible-options") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function canEditWaResponsible() {
    var root = document.querySelector(".wa-shell");
    return !!(root && root.getAttribute("data-wa-responsible-admin") === "true");
  }

  function ensureWaResponsibleOptions() {
    var select = getWaResponsibleSelect();
    if (!select) return;
    if (select.dataset.optionsBound === "true") return;
    select.dataset.optionsBound = "true";

    var options = parseWaResponsibleOptions();
    select.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Responsable";
    select.appendChild(blank);

    options.forEach(function (item) {
      if (!item || item.id === undefined || item.id === null) return;
      var option = document.createElement("option");
      option.value = String(item.id);
      option.textContent = String(item.name || ("Usuario #" + item.id));
      select.appendChild(option);
    });
  }

  function syncHeaderResponsible(chatId) {
    var select = getWaResponsibleSelect();
    if (!select) return;

    ensureWaResponsibleOptions();
    var editable = canEditWaResponsible();
    var hasChat = !!chatId;
    select.disabled = !editable || !hasChat;
    if (!hasChat) {
      select.value = "";
      return;
    }

    var root = document.querySelector(".wa-shell");
    var url = root ? root.getAttribute("data-wa-contact-profile-url") : "";
    if (!url) return;

    waResponsibleFetchSeq += 1;
    var seq = waResponsibleFetchSeq;
    fetch(url + "?chat_id=" + encodeURIComponent(chatId), {
      headers: { "Accept": "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("wa_responsible_profile_failed");
        return response.json();
      })
      .then(function (payload) {
        if (seq !== waResponsibleFetchSeq) return;
        var profile = payload && payload.profile ? payload.profile : {};
        var assignedId = profile && profile.assigned_to_id !== undefined && profile.assigned_to_id !== null
          ? String(profile.assigned_to_id)
          : "";
        select.value = assignedId;
        if (assignedId && select.value !== assignedId) {
          var option = document.createElement("option");
          option.value = assignedId;
          option.textContent = profile.assigned_to_name || ("Usuario #" + assignedId);
          select.appendChild(option);
          select.value = assignedId;
        }
      })
      .catch(function () {});
  }

  function bindHeaderResponsibleSelect() {
    var select = getWaResponsibleSelect();
    if (!select || select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    ensureWaResponsibleOptions();

    select.addEventListener("change", function () {
      var header = document.querySelector(".wa-chat-header");
      var chatId = header ? (header.getAttribute("data-chat-id") || "") : "";
      if (!chatId) return;
      if (!canEditWaResponsible()) return;

      var root = document.querySelector(".wa-shell");
      var url = root ? root.getAttribute("data-wa-contact-profile-url") : "";
      if (!url) return;

      var token = document.querySelector("meta[name='csrf-token']");
      var selectedValue = String(select.value || "");
      var payload = { chat_id: chatId, assigned_to_id: selectedValue };

      fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data || {} };
          });
        })
        .then(function (result) {
          if (!result.ok) throw result.data || {};
          var assignedId = result.data.assigned_to_id !== undefined && result.data.assigned_to_id !== null
            ? String(result.data.assigned_to_id)
            : "";
          select.value = assignedId;
        })
        .catch(function () {
          syncHeaderResponsible(chatId);
        });
    });
  }

  window.WAResponsibleSync = {
    bind: bindHeaderResponsibleSelect,
    sync: syncHeaderResponsible
  };
})();
