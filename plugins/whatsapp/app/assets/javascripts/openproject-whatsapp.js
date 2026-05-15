(function () {
  function requestJson(url, options) {
    return fetch(url, options).then(function (response) { return response.json(); });
  }

  function logDebug(label, payload, channel) {
    if (!window.WADebug || typeof window.WADebug.log !== "function") return;
    window.WADebug.log(label, payload, channel);
  }

  function logServer(label, data) {
    if (!window.WADebug) return;
    var root = document.querySelector(".wa-shell");
    if (!root) return;
    var url = root.getAttribute("data-wa-debug-log-url");
    if (!url) return;
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({
        label: label,
        payload: data || {}
      })
    }).catch(function () {});
  }

  function appendTextWithLinks(target, text) {
    if (!target) return;
    var value = text === undefined || text === null ? "" : String(text);
    var lines = value.split(/\n/);
    for (var i = 0; i < lines.length; i += 1) {
      appendLineWithLinks(target, lines[i]);
      if (i < lines.length - 1) {
        target.appendChild(document.createElement("br"));
      }
    }
  }

  var replyPreviewEl = null;
  var replyLabelEl = null;
  var replyToInputEl = null;
  var replyCancelEl = null;
  var macroFlows = [];
  var macroFlowsLoaded = false;
  var macroFlowsLoading = false;
  var iaFlows = [];
  var iaFlowsLoaded = false;
  var iaFlowsLoading = false;

  function getMacroConfig() {
    var root = document.querySelector(".wa-shell");
    return {
      listUrl: root ? root.getAttribute("data-wa-macros-list-url") : "",
      runUrl: root ? root.getAttribute("data-wa-macros-run-url") : ""
    };
  }

  function getIaConfig() {
    var root = document.querySelector(".wa-shell");
    return {
      listUrl: root ? root.getAttribute("data-wa-ia-flows-list-url") : "",
      saveUrlTemplate: root ? root.getAttribute("data-wa-ia-flow-select-url-template") : ""
    };
  }

  function readMacroSeedFromSelect(select) {
    if (!select) return [];
    var items = [];
    Array.prototype.slice.call(select.options || []).forEach(function (option) {
      if (!option.value) return;
      items.push({
        id: option.value,
        name: option.textContent || ("Flujo " + option.value),
        macro_node_id: option.getAttribute("data-macro-node-id") || ""
      });
    });
    return items;
  }

  function readMacroSeedFromDom() {
    var select = document.querySelector("[data-wa-chat-macro-select]") ||
      document.querySelector("[data-wa-ia-macro-select]");
    return readMacroSeedFromSelect(select);
  }

  function readIaSeedFromSelect(select) {
    if (!select) return [];
    var items = [];
    Array.prototype.slice.call(select.options || []).forEach(function (option) {
      if (!option.value) return;
      items.push({
        id: option.value,
        name: option.textContent || ("Flujo " + option.value)
      });
    });
    return items;
  }

  function readIaSeedFromDom() {
    var select = document.querySelector("[data-wa-ia-flow-select]");
    return readIaSeedFromSelect(select);
  }

  function updateMacroSelect(select) {
    if (!select) return;
    var currentValue = select.value;
    if (!macroFlowsLoaded) {
      var seed = readMacroSeedFromSelect(select);
      if (seed.length) {
        macroFlows = seed;
        macroFlowsLoaded = true;
      }
    }
    select.innerHTML = "";

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccione macros";
    select.appendChild(placeholder);

    if (macroFlowsLoaded) {
      macroFlows.forEach(function (flow) {
        var option = document.createElement("option");
        option.value = flow.id;
        option.textContent = flow.name || ("Flujo " + flow.id);
        if (flow.macro_node_id) {
          option.setAttribute("data-macro-node-id", flow.macro_node_id);
        }
        select.appendChild(option);
      });
    }

    if (currentValue && select.querySelector('option[value="' + currentValue + '"]')) {
      select.value = currentValue;
    } else {
      select.value = "";
    }

    select.disabled = !macroFlowsLoaded || macroFlows.length === 0;
  }

  function updateIaSelect(select, desiredValue) {
    if (!select) return;
    var currentValue = desiredValue !== undefined ? desiredValue : select.value;
    if (!iaFlowsLoaded) {
      var seed = readIaSeedFromSelect(select);
      if (seed.length) {
        iaFlows = seed;
        iaFlowsLoaded = true;
      }
    }
    select.innerHTML = "";

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccione la IA";
    select.appendChild(placeholder);

    if (iaFlowsLoaded) {
      iaFlows.forEach(function (flow) {
        var option = document.createElement("option");
        option.value = flow.id;
        option.textContent = flow.name || ("Flujo " + flow.id);
        select.appendChild(option);
      });
    }

    if (currentValue && select.querySelector('option[value="' + currentValue + '"]')) {
      select.value = currentValue;
    } else {
      select.value = "";
    }

    select.disabled = !iaFlowsLoaded || iaFlows.length === 0;
  }

  function updateMacroPanel(panel) {
    if (!panel) return;
    var panelSelect = panel.querySelector("[data-wa-ia-macro-select]");
    if (!panelSelect) return;
    updateMacroSelect(panelSelect);
    var runBtn = panel.querySelector("[data-wa-ia-macro-run]");
    if (runBtn) runBtn.disabled = panelSelect.disabled;
  }

  function updateIaPanel(panel, card) {
    if (!panel) return;
    var panelSelect = panel.querySelector("[data-wa-ia-flow-select]");
    if (!panelSelect) return;
    var selected = "";
    if (card) {
      selected = card.getAttribute("data-ia-flow-id") || "";
    } else if (panel.dataset && panel.dataset.iaFlowId) {
      selected = panel.dataset.iaFlowId;
    }
    updateIaSelect(panelSelect, selected);
  }

  function buildIaPanel() {
    var panel = document.createElement("div");
    panel.className = "wa-ia-panel";
    panel.setAttribute("data-wa-ia-panel", "true");
    panel.innerHTML =
      '<div class="wa-ia-panel-header">' +
      '<div class="wa-ia-panel-title">Automatización e IA</div>' +
      '<button class="wa-ia-panel-close" type="button" title="Cerrar" data-wa-ia-close="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-x-square-fill" viewBox="0 0 16 16">' +
      '<path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm3.354 4.646L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 1 1 .708-.708"></path>' +
      "</svg>" +
      "</button>" +
      "</div>" +
      '<div class="wa-ia-panel-body">' +
      '<div class="wa-ia-macro-row">' +
      '<select class="wa-chat-macro-select" data-wa-ia-macro-select="true">' +
      '<option value="">Seleccione macros</option>' +
      "</select>" +
      '<button class="wa-chat-macro-run" type="button" data-wa-ia-macro-run="true" title="Ejecutar macro" disabled>' +
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM10.6935 15.8458L15.4137 13.059C16.1954 12.5974 16.1954 11.4026 15.4137 10.941L10.6935 8.15419C9.93371 7.70561 9 8.28947 9 9.21316V14.7868C9 15.7105 9.93371 16.2944 10.6935 15.8458Z" fill="#1C274C"></path>' +
      "</svg>" +
      "</button>" +
      "</div>" +
      '<div class="wa-ia-macro-row wa-ia-flow-row">' +
      '<select class="wa-chat-ia-select" data-wa-ia-flow-select="true">' +
      '<option value="">Seleccione la IA</option>' +
      "</select>" +
      "</div>" +
      "</div>";
    return panel;
  }

  function ensureIaPanel(card) {
    if (!card) return null;
    var panel = card.querySelector("[data-wa-ia-panel]");
    if (!panel) {
      panel = buildIaPanel();
      card.appendChild(panel);
    }
    var panelSelect = panel.querySelector("[data-wa-ia-macro-select]");
    if (panelSelect && panelSelect.dataset.waMacroBound !== "true") {
      panelSelect.dataset.waMacroBound = "true";
      panelSelect.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      panelSelect.addEventListener("mousedown", function (event) {
        event.stopPropagation();
      });
    }
    var iaSelect = panel.querySelector("[data-wa-ia-flow-select]");
    if (iaSelect && iaSelect.dataset.waIaBound !== "true") {
      iaSelect.dataset.waIaBound = "true";
      iaSelect.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      iaSelect.addEventListener("mousedown", function (event) {
        event.stopPropagation();
      });
      iaSelect.addEventListener("change", function () {
        var flowId = iaSelect.value;
        var chatId = card.getAttribute("data-chat-id") || "";
        card.setAttribute("data-ia-flow-id", flowId || "");
        saveIaFlowSelection(chatId, flowId);
      });
    }
    updateMacroPanel(panel);
    updateIaPanel(panel, card);
    return panel;
  }

  function updateAllMacroRows() {
    document.querySelectorAll(".wa-chat-card").forEach(function (card) {
      ensureIaPanel(card);
    });
  }

  function updateAllIaRows() {
    document.querySelectorAll(".wa-chat-card").forEach(function (card) {
      var panel = ensureIaPanel(card);
      if (panel) updateIaPanel(panel, card);
    });
  }

  function loadMacroFlows() {
    if (macroFlowsLoaded || macroFlowsLoading) return;
    var config = getMacroConfig();
    var seed = readMacroSeedFromDom();
    if (seed.length) {
      macroFlows = seed;
      macroFlowsLoaded = true;
      updateAllMacroRows();
    }
    if (!config.listUrl) return;
    logServer("[WA-IA] macros.list.request", { url: config.listUrl });
    macroFlowsLoading = true;
    fetch(config.listUrl, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        macroFlows = Array.isArray(payload.flows) ? payload.flows : [];
        macroFlowsLoaded = true;
        macroFlowsLoading = false;
        logServer("[WA-IA] macros.list.response", { count: macroFlows.length });
        updateAllMacroRows();
      })
      .catch(function () {
        if (!macroFlowsLoaded) {
          macroFlows = seed.length ? seed : [];
          macroFlowsLoaded = true;
        }
        macroFlowsLoading = false;
        logServer("[WA-IA] macros.list.error", { count: macroFlows.length });
        updateAllMacroRows();
      });
  }

  function loadIaFlows() {
    if (iaFlowsLoaded || iaFlowsLoading) return;
    var config = getIaConfig();
    var seed = readIaSeedFromDom();
    if (seed.length) {
      iaFlows = seed;
      iaFlowsLoaded = true;
      updateAllIaRows();
    }
    if (!config.listUrl) return;
    logServer("[WA-IA] ia.list.request", { url: config.listUrl });
    iaFlowsLoading = true;
    fetch(config.listUrl, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        iaFlows = Array.isArray(payload.flows) ? payload.flows : [];
        iaFlowsLoaded = true;
        iaFlowsLoading = false;
        logServer("[WA-IA] ia.list.response", { count: iaFlows.length });
        updateAllIaRows();
      })
      .catch(function () {
        if (!iaFlowsLoaded) {
          iaFlows = seed.length ? seed : [];
          iaFlowsLoaded = true;
        }
        iaFlowsLoading = false;
        logServer("[WA-IA] ia.list.error", { count: iaFlows.length });
        updateAllIaRows();
      });
  }

  function saveIaFlowSelection(chatId, flowId) {
    var config = getIaConfig();
    if (!config.saveUrlTemplate || !chatId) return Promise.resolve(null);
    var url = config.saveUrlTemplate.replace("__ID__", encodeURIComponent(chatId));
    var token = document.querySelector("meta[name='csrf-token']");
    return fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({ flow_id: flowId || "" })
    })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .catch(function () { return null; });
  }

  function bindMacroActions() {
    if (document.body.dataset.waMacroBound === "true") return;
    document.body.dataset.waMacroBound = "true";
    document.addEventListener("click", function (event) {
      var runBtn = event.target.closest("[data-wa-chat-macro-run='true']");
      if (!runBtn) return;
      event.preventDefault();
      event.stopPropagation();
      if (runBtn.dataset.waMacroRunning === "true") return;

      var card = runBtn.closest(".wa-chat-card");
      if (!card) return;
      var select = card.querySelector("[data-wa-chat-macro-select='true']");
      if (!select || select.disabled) return;
      var flowId = select.value;
      if (!flowId) return;
      var option = select.options[select.selectedIndex];
      var macroNodeId = option ? option.getAttribute("data-macro-node-id") : "";
      var chatId = card.getAttribute("data-chat-id");
      var config = getMacroConfig();
      if (!config.runUrl) return;
      var token = document.querySelector("meta[name='csrf-token']");
      var url = config.runUrl + "?flow_id=" + encodeURIComponent(flowId);
      if (macroNodeId) url += "&macro_node_id=" + encodeURIComponent(macroNodeId);
      if (chatId) url += "&chat_id=" + encodeURIComponent(chatId);
      var firstNameInput = document.querySelector("#wa-edit-first-name");
      var emailInput = document.querySelector("#wa-edit-email");
      var chatIdLabel = document.querySelector("[data-wa-chat-id]");
      var firstName = firstNameInput ? (firstNameInput.value || "").trim() : "";
      var email = emailInput ? (emailInput.value || "").trim() : "";
      var cardTitle = card ? card.querySelector(".wa-chat-title") : null;
      if (!firstName && cardTitle) firstName = (cardTitle.textContent || "").trim();
      var subvalues = card ? card.querySelectorAll(".wa-chat-row .wa-chat-subvalue") : [];
      var cardPhoneValue = subvalues[0] ? (subvalues[0].textContent || "").trim() : "";
      var cardEmailValue = subvalues[1] ? (subvalues[1].textContent || "").trim() : "";
      if (!email && cardEmailValue && cardEmailValue !== "--") email = cardEmailValue;
      var chatExternalId = card ? card.getAttribute("data-chat-external-id") : "";
      if (!chatExternalId && chatIdLabel) {
        chatExternalId = (chatIdLabel.textContent || "").replace(/^ID:\s*/i, "").trim();
      }
      if (!chatExternalId && cardPhoneValue && cardPhoneValue !== "--") {
        chatExternalId = cardPhoneValue;
      }
      url += "&first_name=" + encodeURIComponent(firstName);
      url += "&email=" + encodeURIComponent(email);
      url += "&phone=" + encodeURIComponent(chatExternalId);
      runBtn.dataset.waMacroRunning = "true";
      runBtn.classList.add("is-running");
      runBtn.classList.add("is-pressed");
      runBtn.disabled = true;
      var delayDone = false;
      var requestDone = false;
      var finalizeRun = function () {
        if (!delayDone || !requestDone) return;
        runBtn.dataset.waMacroRunning = "false";
        runBtn.classList.remove("is-running");
        runBtn.disabled = select.disabled;
      };
      setTimeout(function () {
        delayDone = true;
        runBtn.classList.remove("is-pressed");
        finalizeRun();
      }, 4000);
      fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function (response) {
          return response.json().then(function (payload) {
            return { ok: response.ok, payload: payload };
          }).catch(function () {
            return { ok: response.ok, payload: {} };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var errorMessage = (result.payload && (result.payload.error || (result.payload.errors || []).join(", "))) || "No se pudo ejecutar la macro.";
            alert(errorMessage);
          }
        })
        .catch(function () {})
        .then(function () {
          requestDone = true;
          finalizeRun();
        });
    });
  }

  function bindIaPanel() {
    if (document.body.dataset.waIaPanelBound === "true") return;
    document.body.dataset.waIaPanelBound = "true";
    document.addEventListener("click", function (event) {
      var iaBtn = event.target.closest("[data-wa-chat-ia='true']");
      if (iaBtn) {
        event.preventDefault();
        event.stopPropagation();
        var card = iaBtn.closest(".wa-chat-card");
        if (!card) return;
        var panel = ensureIaPanel(card);
        if (!panel) return;
        document.querySelectorAll("[data-wa-ia-panel].is-open").forEach(function (openPanel) {
          if (openPanel !== panel) openPanel.classList.remove("is-open");
        });
        panel.dataset.chatId = card.getAttribute("data-chat-id") || "";
        panel.dataset.iaFlowId = card.getAttribute("data-ia-flow-id") || "";
        panel.classList.add("is-open");
        loadMacroFlows();
        updateMacroPanel(panel);
        loadIaFlows();
        updateIaPanel(panel, card);
        return;
      }

      var closeBtn = event.target.closest("[data-wa-ia-close='true']");
      if (closeBtn) {
        event.preventDefault();
        event.stopPropagation();
        var panelToClose = closeBtn.closest("[data-wa-ia-panel]");
        if (panelToClose) panelToClose.classList.remove("is-open");
        return;
      }

      var openPanels = document.querySelectorAll("[data-wa-ia-panel].is-open");
      if (openPanels.length &&
          !event.target.closest("[data-wa-ia-panel]") &&
          !event.target.closest("[data-wa-chat-ia='true']")) {
        event.preventDefault();
        event.stopPropagation();
        openPanels.forEach(function (panel) {
          panel.classList.remove("is-open");
        });
        return;
      }

      var runBtn = event.target.closest("[data-wa-ia-macro-run='true']");
      if (!runBtn) return;
      event.preventDefault();
      event.stopPropagation();
      if (runBtn.dataset.waMacroRunning === "true") return;
      var panel = runBtn.closest("[data-wa-ia-panel]");
      var select = panel ? panel.querySelector("[data-wa-ia-macro-select='true']") : null;
      if (!select || select.disabled) return;
      var flowId = select.value;
      if (!flowId) return;
      var option = select.options[select.selectedIndex];
      var macroNodeId = option ? option.getAttribute("data-macro-node-id") : "";
      var chatId = panel ? panel.dataset.chatId : "";
      if (!chatId) {
        var activeCard = document.querySelector(".wa-chat-card.is-active");
        chatId = activeCard ? activeCard.getAttribute("data-chat-id") : "";
      }
      var config = getMacroConfig();
      if (!config.runUrl) return;
      var token = document.querySelector("meta[name='csrf-token']");
      var url = config.runUrl + "?flow_id=" + encodeURIComponent(flowId);
      if (macroNodeId) url += "&macro_node_id=" + encodeURIComponent(macroNodeId);
      if (chatId) url += "&chat_id=" + encodeURIComponent(chatId);
      runBtn.dataset.waMacroRunning = "true";
      runBtn.classList.add("is-running");
      runBtn.classList.add("is-pressed");
      runBtn.disabled = true;
      var delayDone = false;
      var requestDone = false;
      var finalizeRun = function () {
        if (!delayDone || !requestDone) return;
        runBtn.dataset.waMacroRunning = "false";
        runBtn.classList.remove("is-running");
        runBtn.disabled = select.disabled;
      };
      setTimeout(function () {
        delayDone = true;
        runBtn.classList.remove("is-pressed");
        finalizeRun();
      }, 4000);
      fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function (response) {
          return response.json().then(function (payload) {
            return { ok: response.ok, payload: payload };
          }).catch(function () {
            return { ok: response.ok, payload: {} };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var errorMessage = (result.payload && (result.payload.error || (result.payload.errors || []).join(", "))) || "No se pudo ejecutar la macro.";
            alert(errorMessage);
          }
        })
        .catch(function () {})
        .then(function () {
          requestDone = true;
          finalizeRun();
        });
    });

    document.querySelectorAll("[data-wa-ia-macro-select]").forEach(function (iaSelect) {
      if (iaSelect.dataset.waMacroBound === "true") return;
      iaSelect.dataset.waMacroBound = "true";
      iaSelect.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      iaSelect.addEventListener("mousedown", function (event) {
        event.stopPropagation();
      });
    });
  }

  function initReplyUi(form) {
    if (replyPreviewEl && replyToInputEl) {
      if (replyPreviewEl.isConnected && replyToInputEl.isConnected) return;
    }
    replyPreviewEl = document.querySelector("[data-wa-reply-preview]");
    replyLabelEl = document.querySelector("[data-wa-reply-label]");
    replyCancelEl = document.querySelector("[data-wa-reply-cancel='true']");
    replyToInputEl = form ? form.querySelector("[data-wa-reply-to='true']") : document.querySelector("[data-wa-reply-to='true']");
    if (replyCancelEl && replyCancelEl.dataset.bound !== "true") {
      replyCancelEl.dataset.bound = "true";
      replyCancelEl.addEventListener("click", function () {
        clearReplyPreview();
      });
    }
  }

  function showReplyPreview(messageId, labelText) {
    if (!replyPreviewEl || !replyToInputEl || !replyPreviewEl.isConnected || !replyToInputEl.isConnected) {
      initReplyUi(document.querySelector("[data-whatsapp-form='true']"));
    }
    if (!replyPreviewEl || !replyToInputEl) return;
    replyToInputEl.value = messageId || "";
    if (replyLabelEl) replyLabelEl.textContent = labelText || "";
    replyPreviewEl.classList.remove("is-hidden");
  }

  function clearReplyPreview() {
    if (!replyPreviewEl || !replyToInputEl) return;
    replyToInputEl.value = "";
    if (replyLabelEl) replyLabelEl.textContent = "";
    replyPreviewEl.classList.add("is-hidden");
  }

  function getReplyToValue() {
    return replyToInputEl ? replyToInputEl.value : "";
  }

  function appendLineWithLinks(target, line) {
    var regex = /((https?:\/\/|www\.)[^\s]+|[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/gi;
    var lastIndex = 0;
    var match;
    while ((match = regex.exec(line)) !== null) {
      var url = match[1];
      var start = match.index;
      if (start > lastIndex) {
        appendFormattedText(target, line.slice(lastIndex, start));
      }

      var cleanUrl = url;
      var trailing = "";
      while (/[).,!?:;]$/.test(cleanUrl)) {
        trailing = cleanUrl.slice(-1) + trailing;
        cleanUrl = cleanUrl.slice(0, -1);
      }

      if (cleanUrl) {
        var isEmail = cleanUrl.indexOf("@") !== -1 && cleanUrl.indexOf("://") === -1 && cleanUrl.indexOf("www.") !== 0;
        var href = isEmail ? "mailto:" + cleanUrl : (cleanUrl.indexOf("http") === 0 ? cleanUrl : "https://" + cleanUrl);
        var link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = cleanUrl;
        target.appendChild(link);
      }

      if (trailing) {
        appendFormattedText(target, trailing);
      }

      lastIndex = match.index + url.length;
    }

    if (lastIndex < line.length) {
      appendFormattedText(target, line.slice(lastIndex));
    }
  }

  function appendFormattedText(target, text) {
    if (!text) return;
    var pattern = /(\*[^*]+\*|_[^_]+_|~[^~]+~|`[^`]+`)/g;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      var start = match.index;
      if (start > lastIndex) {
        target.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }
      var token = match[0];
      var content = token.slice(1, -1);
      var node;
      if (token[0] === "*") {
        node = document.createElement("strong");
      } else if (token[0] === "_") {
        node = document.createElement("em");
      } else if (token[0] === "~") {
        node = document.createElement("s");
      } else if (token[0] === "`") {
        node = document.createElement("code");
      }
      if (node) {
        node.textContent = content;
        target.appendChild(node);
      } else {
        target.appendChild(document.createTextNode(token));
      }
      lastIndex = start + token.length;
    }
    if (lastIndex < text.length) {
      target.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function isEmojiOnly(text) {
    var value = text === undefined || text === null ? "" : String(text);
    var cleaned = value.replace(/\s/g, "");
    if (!cleaned) return false;
    try {
      var stripped = cleaned.replace(/[\p{Extended_Pictographic}\u200D\uFE0F]/gu, "");
      return stripped.length === 0;
    } catch (error) {
      return false;
    }
  }

  function templateProjectUrl(template, projectId, sessionName) {
    var url = (template || "").replace("__PROJECT_ID__", encodeURIComponent(projectId));
    if (sessionName !== undefined) {
      url = url.replace("__SESSION__", encodeURIComponent(sessionName));
    }
    return url;
  }

  function renderAdminConnections(container, connections) {
    if (!container) return;
    var body = container.querySelector("[data-wa-admin-connections-body]");
    if (!body) return;
    body.innerHTML = "";

    if (!connections || !connections.length) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "wa-admin-empty";
      emptyRow.innerHTML = "<td colspan=\"6\">Sin conexiones activas.</td>";
      body.appendChild(emptyRow);
      return;
    }

    connections.forEach(function (connection) {
      var row = document.createElement("tr");

      var adminCell = document.createElement("td");
      adminCell.textContent = connection.admin_name || "--";
      row.appendChild(adminCell);

      var projectCell = document.createElement("td");
      projectCell.textContent = connection.project_name || "--";
      row.appendChild(projectCell);

      var statusCell = document.createElement("td");
      var statusWrap = document.createElement("span");
      statusWrap.className = "wa-admin-status";
      var statusDot = document.createElement("span");
      statusDot.className = "wa-admin-status-dot";
      var statusText = document.createElement("span");
      statusText.textContent = connection.status || "--";
      statusWrap.appendChild(statusDot);
      statusWrap.appendChild(statusText);
      statusCell.appendChild(statusWrap);
      row.appendChild(statusCell);

      var totalCell = document.createElement("td");
      var totalBadge = document.createElement("span");
      totalBadge.className = "wa-qr-connected-total";
      totalBadge.setAttribute("data-wa-qr-connected-total", "true");
      totalBadge.textContent = connection.media_label || "0 MB";
      totalCell.appendChild(totalBadge);
      row.appendChild(totalCell);

      var limitCell = document.createElement("td");
      var limitInput = document.createElement("input");
      limitInput.type = "number";
      limitInput.min = "0";
      limitInput.step = "0.1";
      limitInput.className = "wa-settings-input wa-admin-limit-input";
      limitInput.value = connection.limit_gb !== null && connection.limit_gb !== undefined ? connection.limit_gb : "";
      limitInput.setAttribute("data-project-id", connection.project_id);
      limitCell.appendChild(limitInput);
      row.appendChild(limitCell);

      var actionCell = document.createElement("td");
      var deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "wa-admin-action-btn";
      deleteButton.textContent = "Eliminar o Reiniciar Conexion";
      deleteButton.setAttribute("data-project-id", connection.project_id);
      deleteButton.setAttribute("data-session-name", connection.session_name || "");
      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);

      body.appendChild(row);
    });
  }

  function bindAdminConnections(container) {
    if (!container) return;
    if (container.dataset.waAdminBound === "true") return;
    container.dataset.waAdminBound = "true";

    var url = container.getAttribute("data-wa-admin-connections-url") || "";
    var limitTemplate = container.getAttribute("data-wa-admin-limit-url-template") || "";
    var deleteTemplate = container.getAttribute("data-wa-admin-delete-url-template") || "";
    var token = document.querySelector("meta[name='csrf-token']");

    function loadConnections() {
      if (!url) return;
      requestJson(url, { headers: { "Accept": "application/json" } })
        .then(function (payload) {
          var connections = payload && payload.connections ? payload.connections : [];
          renderAdminConnections(container, connections);
        })
        .catch(function () {
          renderAdminConnections(container, []);
        });
    }

    container.addEventListener("change", function (event) {
      var target = event.target;
      if (!target || !target.classList.contains("wa-admin-limit-input")) return;
      var projectId = target.getAttribute("data-project-id");
      if (!projectId) return;
      var saveUrl = templateProjectUrl(limitTemplate, projectId);
      if (!saveUrl) return;
      requestJson(saveUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ limit_gb: target.value })
      }).catch(function () {});
    });

    container.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.classList.contains("wa-admin-action-btn")) return;
      var projectId = target.getAttribute("data-project-id");
      var sessionName = target.getAttribute("data-session-name");
      if (!projectId || !sessionName) return;
      if (!window.confirm("Eliminar o reiniciar la conexion?")) return;
      var deleteUrl = templateProjectUrl(deleteTemplate, projectId, sessionName);
      if (!deleteUrl) return;
      fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function () {
          loadConnections();
        })
        .catch(function () {});
    });

    container.loadConnections = loadConnections;
  }

  function renderMediaFilesRows(container, items) {
    if (!container) return;
    var body = container.querySelector("[data-wa-files-body]");
    if (!body) return;
    body.innerHTML = "";
    if (!items || !items.length) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "wa-admin-empty";
      emptyRow.innerHTML = "<td colspan=\"9\">Sin archivos.</td>";
      body.appendChild(emptyRow);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement("tr");
      row.setAttribute("data-wa-file-row-id", String(item.id));

      var checkCell = document.createElement("td");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("data-wa-file-select", "true");
      checkbox.value = String(item.id);
      checkbox.setAttribute("data-size-bytes", String(item.size_bytes || 0));
      checkCell.appendChild(checkbox);
      row.appendChild(checkCell);

      var nameCell = document.createElement("td");
      nameCell.textContent = item.name || "--";
      row.appendChild(nameCell);

      var typeCell = document.createElement("td");
      typeCell.textContent = item.type_label || item.message_type || "--";
      row.appendChild(typeCell);

      var sizeCell = document.createElement("td");
      sizeCell.textContent = item.size_label || "0 Bytes";
      row.appendChild(sizeCell);

      var chatCell = document.createElement("td");
      chatCell.textContent = item.chat_title || "--";
      row.appendChild(chatCell);

      var dateCell = document.createElement("td");
      dateCell.textContent = item.created_at || "--";
      row.appendChild(dateCell);

      var senderCell = document.createElement("td");
      senderCell.textContent = item.sender_label || "--";
      row.appendChild(senderCell);

      var mediaCell = document.createElement("td");
      var mediaLink = document.createElement("a");
      mediaLink.className = "wa-file-view-btn";
      mediaLink.href = item.media_url || "#";
      mediaLink.target = "_blank";
      mediaLink.rel = "noopener noreferrer";
      mediaLink.textContent = "Ver";
      mediaCell.appendChild(mediaLink);
      row.appendChild(mediaCell);

      var deleteCell = document.createElement("td");
      var deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "wa-admin-action-btn";
      deleteButton.setAttribute("data-wa-file-delete", "true");
      deleteButton.setAttribute("data-wa-file-id", String(item.id));
      deleteButton.textContent = "Eliminar";
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);

      body.appendChild(row);
    });
  }

  function bindMediaFilesPanel(container) {
    if (!container) return;
    if (container.dataset.waFilesBound === "true") return;
    container.dataset.waFilesBound = "true";

    var listUrl = container.getAttribute("data-wa-files-url") || "";
    var deleteTemplate = container.getAttribute("data-wa-files-delete-url-template") || "";
    var bulkDeleteUrl = container.getAttribute("data-wa-files-bulk-delete-url") || "";
    var typeFilter = container.querySelector("[data-wa-files-filter-type]");
    var chatFilter = container.querySelector("[data-wa-files-filter-chat]");
    var directionFilter = container.querySelector("[data-wa-files-filter-direction]");
    var sizeSortHeader = container.querySelector("[data-wa-files-sort-size]");
    var applyFilterButton = container.querySelector("[data-wa-files-apply-filter]");
    var deleteSelectedButton = container.querySelector("[data-wa-files-delete-selected]");
    var selectAll = container.querySelector("[data-wa-files-select-all]");
    var selectionSummary = container.querySelector("[data-wa-files-selection-summary]");
    var statusLabel = container.querySelector("[data-wa-files-status]");
    var token = document.querySelector("meta[name='csrf-token']");
    var sizeSortDirection = "";
    var fileItems = [];

    function setStatus(text) {
      if (statusLabel) statusLabel.textContent = text || "";
    }

    function currentQuery() {
      var parts = [];
      var type = typeFilter ? String(typeFilter.value || "").trim() : "";
      var chatId = chatFilter ? String(chatFilter.value || "").trim() : "";
      var direction = directionFilter ? String(directionFilter.value || "").trim() : "";
      if (type) parts.push("types=" + encodeURIComponent(type));
      if (chatId) parts.push("chat_id=" + encodeURIComponent(chatId));
      if (direction) parts.push("direction=" + encodeURIComponent(direction));
      return parts.join("&");
    }

    function sortedItems(items) {
      var list = Array.isArray(items) ? items.slice() : [];
      if (sizeSortDirection === "desc") {
        list.sort(function (a, b) { return Number(b.size_bytes || 0) - Number(a.size_bytes || 0); });
      } else if (sizeSortDirection === "asc") {
        list.sort(function (a, b) { return Number(a.size_bytes || 0) - Number(b.size_bytes || 0); });
      }
      return list;
    }

    function renderFilesTable() {
      var selectedBefore = {};
      container.querySelectorAll("[data-wa-file-select='true']:checked").forEach(function (node) {
        selectedBefore[String(node.value)] = true;
      });
      renderMediaFilesRows(container, sortedItems(fileItems));
      container.querySelectorAll("[data-wa-file-select='true']").forEach(function (node) {
        if (selectedBefore[String(node.value)]) node.checked = true;
      });
      refreshBulkButtonState();
    }

    function selectedIds() {
      var ids = [];
      container.querySelectorAll("[data-wa-file-select='true']:checked").forEach(function (node) {
        var value = Number(node.value || 0);
        if (Number.isFinite(value) && value > 0) ids.push(value);
      });
      return ids;
    }

    function formatBytes(bytes) {
      var value = Number(bytes || 0);
      if (!Number.isFinite(value) || value <= 0) return "0 B";
      var units = ["B", "KB", "MB", "GB", "TB"];
      var index = 0;
      while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
      }
      var precision = value >= 100 || index === 0 ? 0 : 1;
      return value.toFixed(precision) + " " + units[index];
    }

    function refreshBulkButtonState() {
      var selected = container.querySelectorAll("[data-wa-file-select='true']:checked");
      var ids = [];
      var totalBytes = 0;
      selected.forEach(function (node) {
        var value = Number(node.value || 0);
        if (Number.isFinite(value) && value > 0) ids.push(value);
        var fileBytes = Number(node.getAttribute("data-size-bytes") || 0);
        if (Number.isFinite(fileBytes) && fileBytes > 0) totalBytes += fileBytes;
      });
      if (deleteSelectedButton) {
        deleteSelectedButton.disabled = ids.length === 0;
      }
      if (selectAll) {
        var all = container.querySelectorAll("[data-wa-file-select='true']");
        selectAll.checked = all.length > 0 && all.length === selected.length;
      }
      if (selectionSummary) {
        selectionSummary.textContent = "Seleccionados: " + ids.length + " | Tamano: " + formatBytes(totalBytes);
      }
    }

    function loadFiles() {
      if (!listUrl) return;
      setStatus("Cargando archivos...");
      var url = listUrl;
      var query = currentQuery();
      if (query) url += "?" + query;
      requestJson(url, { headers: { "Accept": "application/json" } })
        .then(function (payload) {
          fileItems = payload && payload.items ? payload.items : [];
          var chats = payload && payload.chats ? payload.chats : [];
          renderFilesTable();
          if (chatFilter) {
            var current = chatFilter.value || "";
            chatFilter.innerHTML = "";
            var defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = "Todos los chats";
            chatFilter.appendChild(defaultOption);
            chats.forEach(function (chat) {
              var option = document.createElement("option");
              option.value = String(chat.id);
              option.textContent = chat.title || ("Chat #" + chat.id);
              chatFilter.appendChild(option);
            });
            chatFilter.value = current;
          }
          if (payload && payload.total_media_label) {
            var totalSize = document.querySelector("[data-wa-qr-connected-total]");
            if (totalSize) totalSize.textContent = payload.total_media_label;
          }
          setStatus(fileItems.length ? ("Archivos: " + fileItems.length) : "Sin archivos.");
        })
        .catch(function () {
          fileItems = [];
          renderMediaFilesRows(container, []);
          refreshBulkButtonState();
          setStatus("No se pudo cargar la lista.");
        });
    }

    if (applyFilterButton) {
      applyFilterButton.addEventListener("click", function () {
        loadFiles();
      });
    }

    if (sizeSortHeader) {
      sizeSortHeader.addEventListener("click", function () {
        sizeSortDirection = sizeSortDirection === "desc" ? "asc" : "desc";
        renderFilesTable();
      });
    }

    if (selectAll) {
      selectAll.addEventListener("change", function () {
        var checked = !!selectAll.checked;
        container.querySelectorAll("[data-wa-file-select='true']").forEach(function (node) {
          node.checked = checked;
        });
        refreshBulkButtonState();
      });
    }

    container.addEventListener("change", function (event) {
      var target = event.target;
      if (target && target.hasAttribute("data-wa-file-select")) {
        refreshBulkButtonState();
      }
    });

    container.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || target.getAttribute("data-wa-file-delete") !== "true") return;
      var fileId = target.getAttribute("data-wa-file-id");
      if (!fileId) return;
      if (!window.confirm("Eliminar archivo?")) return;
      var deleteUrl = deleteTemplate.replace("__ID__", encodeURIComponent(fileId));
      requestJson(deleteUrl, {
        method: "DELETE",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function (payload) {
          if (payload && payload.total_media_label) {
            var totalSize = document.querySelector("[data-wa-qr-connected-total]");
            if (totalSize) totalSize.textContent = payload.total_media_label;
          }
          loadFiles();
        })
        .catch(function () {
          setStatus("No se pudo eliminar el archivo.");
        });
    });

    if (deleteSelectedButton) {
      deleteSelectedButton.addEventListener("click", function () {
        var ids = selectedIds();
        if (!ids.length) return;
        if (!window.confirm("Eliminar " + ids.length + " archivo(s)?")) return;
        requestJson(bulkDeleteUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
          body: JSON.stringify({ ids: ids })
        })
          .then(function (payload) {
            if (payload && payload.total_media_label) {
              var totalSize = document.querySelector("[data-wa-qr-connected-total]");
              if (totalSize) totalSize.textContent = payload.total_media_label;
            }
            loadFiles();
          })
          .catch(function () {
            setStatus("No se pudo eliminar la selección.");
          });
      });
    }

    container.loadFiles = loadFiles;
  }

  var deletedChatIds = {};
  var deletedChatStorageKey = "wa_deleted_chat_id";

  function isChatDeleted(chatId) {
    return !!deletedChatIds[String(chatId)];
  }

  function markChatDeleted(chatId) {
    if (!chatId) return;
    deletedChatIds[String(chatId)] = true;
    try {
      if (window.localStorage) {
        window.localStorage.setItem(deletedChatStorageKey, String(chatId));
      }
    } catch (error) {
      void error;
    }
  }

  function removeChatCardById(chatId) {
    var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
    if (card) card.remove();
  }

  function bindDeletedChatSync() {
    if (document.body.dataset.waDeletedChatSyncBound === "true") return;
    document.body.dataset.waDeletedChatSyncBound = "true";
    if (!window.addEventListener) return;
    window.addEventListener("storage", function (event) {
      if (!event || event.key !== deletedChatStorageKey || !event.newValue) return;
      var chatId = event.newValue;
      deletedChatIds[String(chatId)] = true;
      removeChatCardById(chatId);
      logDebug("chat_card.delete.sync", { chat_id: chatId }, "chat_card");
    });
  }

  function createImageThumbnail(dataUrl, maxSize, contentType) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var width = img.naturalWidth || img.width;
        var height = img.naturalHeight || img.height;
        if (!width || !height) {
          resolve(null);
          return;
        }
        var scale = Math.min(1, maxSize / Math.max(width, height));
        if (scale >= 1) {
          resolve(dataUrl);
          return;
        }
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var outputType = (contentType === "image/png" || contentType === "image/webp" || contentType === "image/jpeg") ? contentType : "image/jpeg";
        var quality = (outputType === "image/jpeg" || outputType === "image/webp") ? 0.8 : undefined;
        try {
          var thumb = quality ? canvas.toDataURL(outputType, quality) : canvas.toDataURL(outputType);
          resolve(thumb);
        } catch (error) {
          resolve(null);
        }
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = dataUrl;
    });
  }

  function getMediaUrlTemplate() {
    var form = document.querySelector("[data-whatsapp-form='true']");
    return form ? form.getAttribute("data-wa-media-url-template") : "";
  }

  function fetchMediaById(id) {
    var template = getMediaUrlTemplate();
    if (!template) return Promise.resolve(null);
    var url = template.replace("__ID__", encodeURIComponent(id));
    return requestJson(url, { headers: { "Accept": "application/json" } })
      .catch(function () { return null; });
  }

  function getMediaRawUrl(id) {
    var template = getMediaUrlTemplate();
    if (!template) return "";
    var url = template.replace("__ID__", encodeURIComponent(id));
    return url + (url.indexOf("?") === -1 ? "?download=1" : "&download=1");
  }

  function fileExtension(name) {
    var value = (name || "").trim();
    var index = value.lastIndexOf(".");
    if (index === -1) return "FILE";
    var ext = value.slice(index + 1).toUpperCase();
    if (!ext) return "FILE";
    return ext.slice(0, 4);
  }

  function isRenderableImageType(mime, dataUrl) {
    var type = (mime || "").toLowerCase();
    if (type && /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(type)) {
      return true;
    }
    if (dataUrl && dataUrl.indexOf("data:image/") === 0) {
      return !/data:image\/(heic|heif|tiff|avif)/.test(dataUrl.toLowerCase());
    }
    return false;
  }

  function isValidDataUrl(url, minLength) {
    if (!url || url.indexOf("data:") !== 0) return false;
    var parts = url.split(",", 2);
    if (parts.length < 2) return false;
    var payload = parts[1].trim();
    if (!payload) return false;
    var min = typeof minLength === "number" ? minLength : 200;
    return payload.length >= min;
  }

  function appendImageFallback(bodyNode, message, label) {
    if (!bodyNode || !message) return;
    if (message.message_type === "image") return;
    if (bodyNode.querySelector("[data-wa-image-fallback='true']")) return;

    var fallbackRow = document.createElement("div");
    fallbackRow.className = "wa-bubble-file";
    fallbackRow.setAttribute("data-wa-image-fallback", "true");

    var fileLabel = document.createElement("span");
    fileLabel.className = "wa-file-name";
    fileLabel.textContent = label || "Imagen";
    fallbackRow.appendChild(fileLabel);

    var download = document.createElement("a");
    download.className = "wa-file-download wa-file-icon";
    var src = (message.data_url || message.remote_url || "").toString();
    if (src) {
      download.href = src;
      download.setAttribute("data-media-url", src);
      if (message.filename) {
        download.setAttribute("download", message.filename);
      }
    } else if (message.media_id) {
      download.setAttribute("data-media-id", message.media_id);
    }
    var ext = fileExtension(message.filename || (message.content_type || "").split("/").pop() || "IMG");
    download.innerHTML = buildFileIcon(ext);
    fallbackRow.appendChild(download);

    bodyNode.appendChild(fallbackRow);
  }

  function buildFileIcon(ext) {
    var label = (ext || "FILE").toUpperCase().slice(0, 4);
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="28" height="32" aria-hidden="true">' +
      '<g fill="#dc2626">' +
      '<path d="M6 2h8l6 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>' +
      '<path d="M14 2v6h6"/>' +
      '</g>' +
      '<g transform="translate(12 13)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M0 -4v5.5 M-2.5 0l2.5 2.5 2.5-2.5"/>' +
      '<line x1="-4" y1="4" x2="4" y2="4"/>' +
      '</g>' +
      '<rect x="2" y="21" width="20" height="6" rx="3" fill="#dc2626"/>' +
      '<text x="12" y="26" text-anchor="middle" font-size="6" font-weight="700" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">' +
      label +
      '</text>' +
      '</svg>'
    );
  }

  function buildBubble(message) {
    var bubble = document.createElement("div");
    bubble.className = "wa-bubble " + (message.outgoing ? "is-out" : "is-in");
    if (message.message_type === "activity") {
      bubble.classList.add("is-activity");
    }
    var createdAt = message.created_at_iso || message.created_at_raw || message.created_at;
    if (createdAt && typeof createdAt === "string" && createdAt.indexOf("T") !== -1) {
      bubble.setAttribute("data-created-at", createdAt);
    }
    if (message.id) {
      bubble.setAttribute("data-message-id", message.id);
    }
    if (message.waha_id) {
      bubble.setAttribute("data-waha-id", message.waha_id);
    }
    if (message.waha_id || message.id) {
      bubble.setAttribute("data-reply-id", message.waha_id || message.id);
    }
    bubble.setAttribute("data-reply-label", buildReplyLabel(message));
    logDebug("body_chat.build_bubble", {
      id: message.id,
      waha_id: message.waha_id,
      type: message.message_type,
      outgoing: !!message.outgoing
    }, "body_chat");
    if (document.body && document.body.dataset.waDebugVisual === "true") {
      bubble.style.outline = "2px dashed #f97316";
      bubble.style.background = "#fff7ed";
      bubble.style.minHeight = "72px";
      bubble.style.display = "block";
      bubble.style.opacity = "1";
      bubble.style.zIndex = "1";
    }

    var meta = document.createElement("div");
    meta.className = "wa-bubble-meta";
    meta.textContent = message.created_at;

    var actions = document.createElement("button");
    actions.type = "button";
    actions.className = "wa-bubble-actions";
    actions.setAttribute("title", "Opciones");
    actions.setAttribute("data-wa-bubble-actions", "true");
    actions.innerHTML = "&#x25BE;";

    var bodyNode = document.createElement("div");
    bodyNode.className = "wa-bubble-body";
    if (document.body && document.body.dataset.waDebugVisual === "true") {
      bodyNode.style.minHeight = "56px";
      bodyNode.style.outline = "1px dashed #f59e0b";
      bodyNode.style.display = "block";
    }
    if (message.message_type === "image") {
      bubble.classList.add("is-image");
      try {
        var img = document.createElement("img");
        var rawDataUrl = (message.data_url || "").trim();
        var rawThumb = (message.thumb_data_url || "").trim();
        var remoteSrc = (message.remote_url || "").trim();
        var contentType = (message.content_type || "").toLowerCase();
        var isSticker = contentType === "image/webp" ||
          (message.filename || "").toLowerCase().endsWith(".webp");
        var dataUrlValid = isValidDataUrl(rawDataUrl, 200);
        var thumbValid = isValidDataUrl(rawThumb, 200);
        var dataUrl = dataUrlValid ? rawDataUrl : "";
        var thumbSrc = thumbValid ? rawThumb : "";
        var fullSrc = dataUrl || remoteSrc || "";
        if (!thumbSrc && dataUrl && remoteSrc && dataUrl.length < 120000) {
          thumbSrc = dataUrl;
          fullSrc = remoteSrc;
        } else if (!fullSrc && remoteSrc) {
          fullSrc = remoteSrc;
        }
        var canRender = isRenderableImageType(contentType, fullSrc || thumbSrc);
        if (!canRender && !contentType && (fullSrc || remoteSrc)) {
          canRender = true;
        }
        logDebug("render.image", {
          id: message.id,
          has_data_url: !!dataUrl,
          data_url_len: rawDataUrl ? rawDataUrl.length : 0,
          has_thumb: !!thumbSrc,
          thumb_len: rawThumb ? rawThumb.length : 0,
          data_url_valid: dataUrlValid,
          thumb_valid: thumbValid,
          has_remote_url: !!remoteSrc,
          content_type: contentType,
          renderable: canRender
        }, "body_chat");
        if (!dataUrlValid && rawDataUrl) {
          logDebug("render.image.invalid_data_url", { id: message.id, len: rawDataUrl.length }, "body_chat");
        }
        if (!canRender) {
          appendImageFallback(bodyNode, message, "Imagen (" + (contentType || "archivo") + ")");
          return bubble;
        }
        if (document.body && document.body.dataset.waDebugVisual === "true") {
          var debugContainer = document.querySelector(".wa-messages");
          var markerKey = String(message.id || message.waha_id || "");
          if (debugContainer && markerKey) {
            var markerId = "wa-debug-marker-" + markerKey;
            if (!document.getElementById(markerId)) {
              var marker = document.createElement("div");
              marker.id = markerId;
              marker.textContent = "DEBUG IMG " + markerKey;
              marker.style.margin = "6px 0";
              marker.style.padding = "6px 10px";
              marker.style.border = "2px dashed #22c55e";
              marker.style.background = "#f0fdf4";
              marker.style.fontSize = "12px";
              marker.style.color = "#166534";
              debugContainer.appendChild(marker);
            }
          }
        }
        var chosenSrc = thumbSrc || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
        img.src = chosenSrc;
        img.alt = "Imagen";
        img.className = "wa-bubble-image" + (isSticker ? " is-sticker" : "");
        img.setAttribute("data-wa-bubble-image", "true");
        logDebug("body_chat.image.src", {
          id: message.id,
          chosen: thumbSrc ? "thumb" : "placeholder",
          src_len: chosenSrc ? chosenSrc.length : 0
        }, "body_chat");
        if (document.body && document.body.dataset.waDebugVisual === "true") {
          img.style.minWidth = "80px";
          img.style.minHeight = "48px";
          img.style.background = "#f8fafc";
          img.style.outline = "2px dashed #ef4444";
          img.style.display = "block";
          img.style.visibility = "visible";
          img.style.opacity = "1";
          var debugBadge = document.createElement("div");
          debugBadge.textContent = "IMG";
          debugBadge.style.display = "inline-block";
          debugBadge.style.marginBottom = "6px";
          debugBadge.style.padding = "2px 6px";
          debugBadge.style.borderRadius = "6px";
          debugBadge.style.background = "#fb923c";
          debugBadge.style.color = "#111827";
          debugBadge.style.fontSize = "11px";
          debugBadge.style.fontWeight = "600";
          bodyNode.appendChild(debugBadge);
        }
        if (fullSrc) img.setAttribute("data-full-src", fullSrc);
        if (remoteSrc) img.setAttribute("data-remote-src", remoteSrc);
        if (message.media_id) {
          img.setAttribute("data-media-id", message.media_id);
        }
        if (thumbSrc) {
          img.setAttribute("data-thumb-src", thumbSrc);
        }
        img.addEventListener("load", function () {
          logDebug("render.image.load", {
            id: message.id,
            src_type: img.src.indexOf("data:") === 0 ? "data" : "url",
            width: img.naturalWidth,
            height: img.naturalHeight
          }, "body_chat");
          var bubble = img.closest(".wa-bubble");
          if (bubble) {
            var bubbleRect = bubble.getBoundingClientRect();
            var imgRect = img.getBoundingClientRect();
            logDebug("render.image.bounds", {
              id: message.id,
              bubble_w: Math.round(bubbleRect.width),
              bubble_h: Math.round(bubbleRect.height),
              img_w: Math.round(imgRect.width),
              img_h: Math.round(imgRect.height),
              overflow_x: Math.round(imgRect.right - bubbleRect.right),
              overflow_y: Math.round(imgRect.bottom - bubbleRect.bottom)
            }, "body_chat");
          }
          var container = img.closest(".wa-messages");
          if (container) {
            container.scrollTop = container.scrollTop;
            logChatBodyState("image.load", container);
          }
        });
        img.addEventListener("error", function () {
          logDebug("render.image.error", {
            id: message.id,
            src: img.src.slice(0, 48),
            has_remote_url: !!remoteSrc
          }, "body_chat");
          appendImageFallback(bodyNode, message, "Imagen (" + (contentType || "archivo") + ")");
          if (message.media_id) {
            fetchMediaById(message.media_id).then(function (payload) {
              if (!payload) return;
              if (payload.data_url) {
                img.setAttribute("data-full-src", payload.data_url);
                createImageThumbnail(payload.data_url, 220, message.content_type || "image/jpeg")
                  .then(function (thumb) {
                    if (thumb) img.src = thumb;
                  })
                  .catch(function () {});
                return;
              }
              if (payload.download_url) {
                img.setAttribute("data-full-src", payload.download_url);
              }
            }).catch(function () {});
          }
        });
        img.loading = "lazy";
        img.decoding = "async";
        bodyNode.appendChild(img);
        if (!thumbSrc && fullSrc && canRender && fullSrc.indexOf("data:image/") === 0) {
          createImageThumbnail(fullSrc, 220, message.content_type || "image/jpeg")
            .then(function (thumb) {
              if (thumb) img.src = thumb;
            })
            .catch(function () {});
        }
        if ((!dataUrlValid || (!fullSrc && !thumbSrc)) && message.media_id && canRender) {
          fetchMediaById(message.media_id).then(function (payload) {
            if (!payload) return;
            if (payload.data_url) {
              img.setAttribute("data-full-src", payload.data_url);
              img.src = payload.data_url;
              createImageThumbnail(payload.data_url, 220, message.content_type || "image/jpeg")
                .then(function (thumb) {
                  if (thumb) img.src = thumb;
                })
                .catch(function () {});
              return;
            }
            if (payload.download_url) {
              img.setAttribute("data-full-src", payload.download_url);
              img.src = payload.download_url;
            }
          }).catch(function () {});
        }
        var captionText = message.body || "";
        if (captionText && (captionText.indexOf("data:") === 0 || (captionText.length > 2000 && /^[a-zA-Z0-9+\/=\s]+$/.test(captionText)))) {
          captionText = "";
        }
        if (document.body && document.body.dataset.waDebugVisual === "true") {
          var debugText = document.createElement("div");
          debugText.textContent = "IMG BUBBLE";
          debugText.style.fontSize = "11px";
          debugText.style.fontWeight = "600";
          debugText.style.color = "#9a3412";
          debugText.style.marginBottom = "4px";
          bodyNode.appendChild(debugText);
        }
        if (captionText) {
          var caption = document.createElement("div");
          caption.className = "wa-bubble-caption";
          if (isEmojiOnly(captionText)) caption.classList.add("is-emoji");
          appendTextWithLinks(caption, captionText);
          bodyNode.appendChild(caption);
        }
      } catch (error) {
        logDebug("render.image.exception", {
          id: message.id,
          message: error && error.message ? error.message : String(error)
        }, "body_chat");
      }
    } else if (message.message_type === "audio") {
      logDebug("body_chat.audio_bubble", {
        id: message.id,
        filename: message.filename || "nota_de_voz.ogg",
        has_data_url: !!message.data_url,
        has_remote_url: !!message.remote_url
      }, "body_chat");
      var audioWrapper = document.createElement("div");
      audioWrapper.className = "wa-bubble-audio";
      var audio = document.createElement("audio");
      audio.className = "wa-bubble-audio-player";
      audio.setAttribute("controls", "true");
      audio.setAttribute("preload", "none");
      var audioSrc = message.data_url || message.remote_url || message.download_url;
      var needsFetch = false;
      var rawAudioUrl = message.media_id ? getMediaRawUrl(message.media_id) : "";
      if (audioSrc) {
        try {
          var parsedAudioUrl = new URL(audioSrc, window.location.origin);
          if (parsedAudioUrl.protocol === "data:" || parsedAudioUrl.protocol === "blob:") {
            needsFetch = false;
          } else if (parsedAudioUrl.protocol !== window.location.protocol) {
            needsFetch = true;
          }
        } catch (error) {}
      }
      if (audioSrc && !needsFetch) {
        audio.src = audioSrc;
        audio.setAttribute("data-media-url", audioSrc);
      } else if (message.media_id) {
        if (rawAudioUrl) {
          audio.src = rawAudioUrl;
          audio.setAttribute("data-media-url", rawAudioUrl);
        }
        audio.setAttribute("data-media-id", message.media_id);
        fetchMediaById(message.media_id).then(function (payload) {
          if (!payload) return;
          if (payload.data_url) {
            audio.src = payload.data_url;
            audio.setAttribute("data-media-url", payload.data_url);
            return;
          }
          if (payload.download_url) {
            audio.src = payload.download_url;
            audio.setAttribute("data-media-url", payload.download_url);
          }
        }).catch(function () {});
      }
      if (rawAudioUrl) {
        audio.addEventListener("error", function () {
          logDebug("body_chat.audio.error", {
            id: message.id,
            media_id: message.media_id,
            current_src: audio.src || "",
            raw_src: rawAudioUrl
          }, "body_chat");
          if (audio.src && audio.src.indexOf("data:") === 0) {
            audio.src = rawAudioUrl;
            audio.setAttribute("data-media-url", rawAudioUrl);
          }
        });
      }
      audioWrapper.appendChild(audio);
      bodyNode.appendChild(audioWrapper);
      if (message.body) {
        var audioCaptionText = message.body.toString();
        if (audioCaptionText && audioCaptionText.indexOf("data:") !== 0) {
          var audioCaption = document.createElement("div");
          audioCaption.className = "wa-bubble-caption";
          if (isEmojiOnly(audioCaptionText)) audioCaption.classList.add("is-emoji");
          appendTextWithLinks(audioCaption, audioCaptionText);
          bodyNode.appendChild(audioCaption);
        }
      }
    } else if (message.message_type === "video") {
      logDebug("body_chat.video_bubble", {
        id: message.id,
        filename: message.filename || "video.mp4",
        has_data_url: !!message.data_url
      }, "body_chat");
      var fileRow = document.createElement("div");
      fileRow.className = "wa-bubble-file";
      var fileName = document.createElement("span");
      fileName.className = "wa-file-name";
      fileName.textContent = message.filename || "video.mp4";
      var download = document.createElement("a");
      download.className = "wa-file-download wa-file-icon";
      if (message.data_url) {
        download.href = message.data_url;
        download.setAttribute("download", message.filename || "video.mp4");
        download.setAttribute("data-media-url", message.data_url);
      } else if (message.media_id) {
        download.href = "#";
        download.setAttribute("data-media-id", message.media_id);
      }
      download.setAttribute("target", "_blank");
      download.innerHTML = buildFileIcon(fileExtension(message.filename || "mp4"));
      fileRow.appendChild(fileName);
      fileRow.appendChild(download);
      bodyNode.appendChild(fileRow);
      if (message.body) {
        var caption = document.createElement("div");
        caption.className = "wa-bubble-caption";
        if (isEmojiOnly(message.body)) caption.classList.add("is-emoji");
        appendTextWithLinks(caption, message.body);
        bodyNode.appendChild(caption);
      }
    } else if (message.message_type === "file") {
      logDebug("body_chat.file_bubble", {
        id: message.id,
        filename: message.filename || "archivo",
        has_data_url: !!message.data_url
      }, "body_chat");
      var docRow = document.createElement("div");
      docRow.className = "wa-bubble-file";
      var docName = document.createElement("span");
      docName.className = "wa-file-name";
      docName.textContent = message.filename || "archivo";
      var docDownload = document.createElement("a");
      docDownload.className = "wa-file-download wa-file-icon";
      if (message.data_url) {
        docDownload.href = message.data_url;
        docDownload.setAttribute("download", message.filename || "archivo");
        docDownload.setAttribute("data-media-url", message.data_url);
      } else if (message.media_id) {
        docDownload.href = "#";
        docDownload.setAttribute("data-media-id", message.media_id);
      }
      docDownload.setAttribute("target", "_blank");
      docDownload.innerHTML = buildFileIcon(fileExtension(message.filename || "FILE"));
      docRow.appendChild(docDownload);
      docRow.appendChild(docName);
      bodyNode.appendChild(docRow);
      if (message.body) {
        var bodyText = message.body.toString();
        var fileNameText = (message.filename || "").toString();
        if (bodyText !== fileNameText) {
          var docCaption = document.createElement("div");
          docCaption.className = "wa-bubble-caption";
          if (isEmojiOnly(bodyText)) docCaption.classList.add("is-emoji");
          appendTextWithLinks(docCaption, bodyText);
          bodyNode.appendChild(docCaption);
        }
      }
    } else {
      if (isEmojiOnly(message.body)) bodyNode.classList.add("is-emoji");
      appendTextWithLinks(bodyNode, message.body);
    }

    bubble.appendChild(meta);
    bubble.appendChild(actions);
    bubble.appendChild(bodyNode);
    if (message.reply_to) {
      bubble.setAttribute("data-reply-to", message.reply_to);
      if (message.reply_to_label) {
        bubble.setAttribute("data-reply-text", message.reply_to_label);
      }
      ensureReplySnippet(bubble);
    }
    if (message.message_type === "image") {
      logDebug("render.bubble.built", {
        id: message.id,
        type: message.message_type,
        child_nodes: bubble.childNodes.length
      });
    }

    return bubble;
  }

  function buildActivityBubble(note, createdAt) {
    return buildBubble({
      id: "activity-" + String(Date.now()),
      body: note,
      created_at: createdAt || "",
      outgoing: true,
      message_type: "activity"
    });
  }

  function logBubbleLayout(context, bubble, message, container) {
    if (!bubble || !message) return;
    var rect = bubble.getBoundingClientRect();
    var containerRect = container ? container.getBoundingClientRect() : null;
    var meta = bubble.querySelector(".wa-bubble-meta");
    var metaRect = meta ? meta.getBoundingClientRect() : null;
    logDebug("body_chat.layout", {
      context: context,
      id: message.id,
      type: message.message_type,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      meta_top: metaRect ? Math.round(metaRect.top) : null,
      meta_left: metaRect ? Math.round(metaRect.left) : null,
      meta_offset_y: metaRect ? Math.round(metaRect.top - rect.top) : null,
      meta_offset_x: metaRect ? Math.round(metaRect.left - rect.left) : null,
      container_top: containerRect ? Math.round(containerRect.top) : null,
      container_left: containerRect ? Math.round(containerRect.left) : null,
      container_width: containerRect ? Math.round(containerRect.width) : null,
      container_height: containerRect ? Math.round(containerRect.height) : null
    }, "body_chat");
  }

  function buildReplyLabel(message) {
    if (!message) return "";
    var text = (message.body || "").toString().trim();
    if (!text) {
      if (message.message_type === "image") text = "Imagen";
      else if (message.message_type === "video") text = "Video";
      else if (message.message_type === "audio") text = "Nota de voz";
      else if (message.message_type === "file") text = message.filename || "Archivo";
    }
    text = text.toString();
    if (text.length > 60) text = text.slice(0, 60) + "...";
    return text;
  }

  function findBubbleByReplyId(replyTo) {
    if (!replyTo) return null;
    var escaped = replyTo;
    if (window.CSS && CSS.escape) {
      escaped = CSS.escape(replyTo);
    }
    return document.querySelector('.wa-bubble[data-waha-id="' + escaped + '"]');
  }

  function resolveReplyLabel(replyTo) {
    var target = findBubbleByReplyId(replyTo);
    if (target) {
      var label = target.getAttribute("data-reply-label") || "";
      if (label) return label;
    }
    return "Mensaje";
  }

  function parseBubbleDate(bubble) {
    if (!bubble) return null;
    var raw = bubble.getAttribute("data-created-at");
    if (!raw) return null;
    var date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatBubbleDate(date) {
    if (!date) return "";
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return "Hoy";
    if (diffDays === -1) return "Ayer";
    var monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    var day = String(target.getDate()).padStart(2, "0");
    var month = monthNames[target.getMonth()];
    var year = target.getFullYear();
    return day + " " + month + " " + year;
  }

  function updateFloatingDayHeader(container) {
    if (!container) return;
    var header = container.querySelector("[data-wa-day-floating]");
    if (!header) return;
    var bubbles = container.querySelectorAll(".wa-bubble[data-created-at]");
    if (!bubbles.length) return;
    var scrollTop = container.scrollTop || 0;
    var chosen = null;
    for (var i = 0; i < bubbles.length; i += 1) {
      var bubble = bubbles[i];
      var top = bubble.offsetTop;
      var height = bubble.offsetHeight;
      if (top + height >= scrollTop + 20) {
        chosen = bubble;
        break;
      }
    }
    if (!chosen) {
      chosen = bubbles[bubbles.length - 1];
    }
    var date = parseBubbleDate(chosen);
    if (!date) return;
    var label = formatBubbleDate(date);
    if (header.textContent !== label) {
      header.textContent = label;
    }
  }

  function bindFloatingDayHeader() {
    var container = document.querySelector("[data-wa-messages='true']");
    if (!container || container.dataset.dayHeaderBound === "true") return;
    container.dataset.dayHeaderBound = "true";
    var handler = function () { updateFloatingDayHeader(container); };
    container.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    requestAnimationFrame(handler);
  }

  function ensureReplySnippet(bubble) {
    if (!bubble) return;
    var replyTo = bubble.getAttribute("data-reply-to");
    if (!replyTo) return;
    var body = bubble.querySelector(".wa-bubble-body");
    if (!body) return;
    if (body.querySelector(".wa-bubble-reply")) return;
    var replyLabel = bubble.getAttribute("data-reply-text") || "";
    if (!replyLabel) {
      replyLabel = resolveReplyLabel(replyTo);
    }
    var replyNode = document.createElement("div");
    replyNode.className = "wa-bubble-reply";
    var replyTitle = document.createElement("strong");
    replyTitle.textContent = "Respondiendo";
    var replyText = document.createElement("span");
    replyText.textContent = replyLabel;
    replyNode.appendChild(replyTitle);
    replyNode.appendChild(replyText);
    body.insertBefore(replyNode, body.firstChild);
  }

  function hydrateReplySnippets(container) {
    var root = container || document;
    var bubbles = root.querySelectorAll(".wa-bubble[data-reply-to]");
    bubbles.forEach(function (bubble) {
      ensureReplySnippet(bubble);
    });
  }

  function applyContactFieldVisibility(hiddenFields) {
    var fields = document.querySelectorAll("[data-contacto-field]");
    fields.forEach(function (field) {
      field.classList.remove("is-hidden");
    });
    if (!hiddenFields || !hiddenFields.length) return;
    hiddenFields.forEach(function (field) {
      var key = String(field);
      if (key.indexOf("custom:") === 0) return;
      document.querySelectorAll("[data-contacto-field='" + key + "']").forEach(function (node) {
        node.classList.add("is-hidden");
      });
    });
  }

  function loadContactFieldVisibility() {
    var root = document.querySelector(".wa-shell");
    if (!root || root.dataset.contactoVisibilityBound === "true") return;
    root.dataset.contactoVisibilityBound = "true";
    var url = root.getAttribute("data-contacto-table-settings-url");
    if (!url) return;
    fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        var hiddenFields = payload && payload.hidden_fields ? payload.hidden_fields : [];
        applyContactFieldVisibility(hiddenFields);
      })
      .catch(function () {});
  }

  function applyCustomFieldValues(values) {
    var inputs = document.querySelectorAll("[data-wa-custom-field-key]");
    inputs.forEach(function (input) {
      var key = input.getAttribute("data-wa-custom-field-key");
      if (!key || !values || !Object.prototype.hasOwnProperty.call(values, key)) return;
      var value = values[key];
      if (input.tagName === "SELECT" && input.multiple) {
        var selected = Array.isArray(value) ? value.map(String) : [];
        Array.prototype.slice.call(input.options).forEach(function (opt) {
          opt.selected = selected.indexOf(String(opt.value)) !== -1;
        });
      } else if (value !== null && value !== undefined) {
        input.value = value;
      }
    });
  }

  function resetCustomFieldValues() {
    var inputs = document.querySelectorAll("[data-wa-custom-field-key]");
    inputs.forEach(function (input) {
      if (input.tagName === "SELECT" && input.multiple) {
        Array.prototype.slice.call(input.options).forEach(function (opt) {
          opt.selected = false;
        });
      } else {
        input.value = "";
      }
    });
  }

  function collectCustomFieldValues() {
    var inputs = document.querySelectorAll("[data-wa-custom-field-key]");
    var custom = {};
    inputs.forEach(function (input) {
      var key = input.getAttribute("data-wa-custom-field-key");
      if (!key) return;
      if (input.tagName === "SELECT" && input.multiple) {
        var selected = Array.prototype.slice.call(input.options)
          .filter(function (opt) { return opt.selected && opt.value !== ""; })
          .map(function (opt) { return opt.value; });
        custom[key] = selected;
        return;
      }
      custom[key] = input.value;
    });
    return custom;
  }

  function positionBubbleMenu(menu, bubble, anchor) {
    if (!menu || !anchor) return;
    if (bubble && !bubble.contains(menu)) {
      bubble.appendChild(menu);
    }
    menu.style.position = "absolute";
    menu.style.zIndex = "60";
    menu.style.visibility = "hidden";
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.classList.add("is-open");

    var menuRect = menu.getBoundingClientRect();
    var anchorRect = anchor.getBoundingClientRect();
    var bubbleRect = bubble ? bubble.getBoundingClientRect() : null;
    if (anchorRect.width === 0 && anchorRect.height === 0 && bubbleRect) {
      anchorRect = {
        top: bubbleRect.top + 6,
        bottom: bubbleRect.top + 26,
        left: bubbleRect.right - 26,
        right: bubbleRect.right - 6,
        width: 20,
        height: 20
      };
    }
    var bubbleRectLocal = bubble ? bubble.getBoundingClientRect() : null;
    var top = anchorRect.top - (bubbleRectLocal ? bubbleRectLocal.top : 0) - menuRect.height - 8;
    var placement = "top";
    if (top < 8) {
      top = anchorRect.bottom - (bubbleRectLocal ? bubbleRectLocal.top : 0) + 8;
      placement = "bottom";
    }
    var left = anchorRect.right - (bubbleRectLocal ? bubbleRectLocal.left : 0) - menuRect.width;
    if (bubbleRectLocal) {
      var bubbleWidth = bubbleRect.right - bubbleRect.left;
      if (menuRect.width > bubbleWidth) {
        left = 0;
      } else {
        var minLeft = 0;
        var maxLeft = bubbleRectLocal.width - menuRect.width;
        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = maxLeft;
      }
    }
    if (left < 8) left = 8;
    if (bubbleRectLocal) {
      var maxLeft = bubbleRectLocal.width - menuRect.width - 8;
      if (left > maxLeft) left = maxLeft;
    }

    var topPx = Math.round(top);
    var leftPx = Math.round(left);
    menu.style.top = topPx + "px";
    menu.style.left = leftPx + "px";
    menu.style.visibility = "visible";
    if (menu.dataset.lastTop !== String(topPx) || menu.dataset.lastLeft !== String(leftPx) || menu.dataset.lastPlacement !== placement) {
      menu.dataset.lastTop = String(topPx);
      menu.dataset.lastLeft = String(leftPx);
      menu.dataset.lastPlacement = placement;
      logDebug("body_chat.chevron.menu.position", {
        top: topPx,
        left: leftPx,
        menu_w: Math.round(menuRect.width),
        menu_h: Math.round(menuRect.height),
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
        scroll_x: window.scrollX,
        scroll_y: window.scrollY,
        bubble_top: bubbleRectLocal ? Math.round(bubbleRectLocal.top) : null,
        bubble_left: bubbleRectLocal ? Math.round(bubbleRectLocal.left) : null,
        bubble_w: bubbleRectLocal ? Math.round(bubbleRectLocal.width) : null,
        bubble_h: bubbleRectLocal ? Math.round(bubbleRectLocal.height) : null,
        bubble_top: bubbleRect ? Math.round(bubbleRect.top) : null,
        bubble_left: bubbleRect ? Math.round(bubbleRect.left) : null,
        bubble_right: bubbleRect ? Math.round(bubbleRect.right) : null,
        bubble_bottom: bubbleRect ? Math.round(bubbleRect.bottom) : null,
        anchor_top: anchorRect ? Math.round(anchorRect.top) : null,
        anchor_left: anchorRect ? Math.round(anchorRect.left) : null,
        anchor_right: anchorRect ? Math.round(anchorRect.right) : null,
        anchor_bottom: anchorRect ? Math.round(anchorRect.bottom) : null,
        placement: placement
      }, "body_chat");
    }
  }

  function closeAllBubbleMenus() {
    var openMenus = document.querySelectorAll(".wa-bubble-menu.is-open");
    openMenus.forEach(function (menu) {
      menu.classList.remove("is-open");
      menu.style.visibility = "";
    });
  }

  function repositionOpenBubbleMenu() {
    var menu = document.querySelector(".wa-bubble-menu.is-open");
    if (!menu) return;
    var anchorBubble = null;
    var anchor = null;
    if (menu.dataset.anchorReplyId) {
      anchorBubble = document.querySelector('.wa-bubble[data-reply-id="' + menu.dataset.anchorReplyId + '"]');
    } else if (menu.dataset.anchorWahaId) {
      anchorBubble = document.querySelector('.wa-bubble[data-waha-id="' + menu.dataset.anchorWahaId + '"]');
    }
    if (anchorBubble) {
      anchor = anchorBubble.querySelector("[data-wa-bubble-actions='true']");
    }
    if (!anchor) {
      anchor = document.querySelector("[data-wa-bubble-actions='true']");
    }
    if (!anchor) return;
    positionBubbleMenu(menu, anchorBubble, anchor);
  }

  function resetOverlays() {
    var alertBox = document.querySelector("[data-wa-alert]");
    if (alertBox) alertBox.classList.add("is-hidden");
    var lightbox = document.querySelector("[data-wa-image-lightbox]");
    if (lightbox) lightbox.classList.add("is-hidden");
    var confirmOverlay = document.querySelector("[data-wa-confirm-overlay]");
    if (confirmOverlay) confirmOverlay.classList.add("is-hidden");
    var openMenus = document.querySelectorAll(".wa-bubble-menu.is-open");
    openMenus.forEach(function (menu) {
      menu.classList.remove("is-open");
      menu.style.visibility = "";
    });
  }

  function logChatBodyState(context, container) {
    if (!container) return;
    var bubbles = container.querySelectorAll(".wa-bubble");
    var captions = container.querySelectorAll(".wa-bubble-caption");
    var orphanCaptions = 0;
    captions.forEach(function (caption) {
      if (!caption.closest(".wa-bubble")) orphanCaptions += 1;
    });
    var first = bubbles[0];
    var last = bubbles[bubbles.length - 1];
    var firstRect = first ? first.getBoundingClientRect() : null;
    var lastRect = last ? last.getBoundingClientRect() : null;
    logDebug("body_chat.state", {
      context: context,
      bubble_count: bubbles.length,
      caption_count: captions.length,
      orphan_captions: orphanCaptions,
      scroll_top: container.scrollTop,
      scroll_height: container.scrollHeight,
      client_height: container.clientHeight,
      first_bubble_height: firstRect ? Math.round(firstRect.height) : null,
      last_bubble_height: lastRect ? Math.round(lastRect.height) : null
    }, "body_chat");
  }

  function hydrateBubbleImages(container) {
    var scope = container || document;
    var images = scope.querySelectorAll("[data-wa-bubble-image='true']");
    logDebug("body_chat.hydrate_images", { count: images.length }, "body_chat");
    images.forEach(function (img) {
      var thumbSrc = img.getAttribute("data-thumb-src");
      if (thumbSrc) {
        if (img.getAttribute("src") !== thumbSrc) {
          img.setAttribute("src", thumbSrc);
        }
        return;
      }
      var fullSrc = img.getAttribute("data-full-src");
      var remoteSrc = img.getAttribute("data-remote-src");
      if (fullSrc && remoteSrc && fullSrc.indexOf("data:image/") === 0 && fullSrc.length < 120000) {
        img.setAttribute("data-thumb-src", fullSrc);
        img.setAttribute("data-full-src", remoteSrc);
        fullSrc = remoteSrc;
      }
      var mediaId = img.getAttribute("data-media-id");
      if (fullSrc && fullSrc.indexOf("data:image/") !== 0 && mediaId) {
        fetchMediaById(mediaId).then(function (payload) {
          if (!payload || !payload.data_url) return;
          img.setAttribute("data-full-src", payload.data_url);
          createImageThumbnail(payload.data_url, 220, "image/jpeg")
            .then(function (thumb) {
              if (thumb) img.setAttribute("src", thumb);
            })
            .catch(function () {});
        });
        return;
      }
      if (!fullSrc && mediaId) {
        fetchMediaById(mediaId).then(function (payload) {
          if (!payload) return;
          if (payload.data_url) {
            img.setAttribute("data-full-src", payload.data_url);
            createImageThumbnail(payload.data_url, 220, "image/jpeg")
              .then(function (thumb) {
                if (thumb) img.setAttribute("src", thumb);
              })
              .catch(function () {});
          } else if (payload.download_url) {
            img.setAttribute("data-full-src", payload.download_url);
          }
        });
        return;
      }
      if (fullSrc) {
        var renderable = isRenderableImageType("", fullSrc);
        if (!renderable) {
          return;
        }
        if (fullSrc.indexOf("data:image/") === 0) {
          createImageThumbnail(fullSrc, 220, "image/jpeg")
            .then(function (thumb) {
              if (thumb) img.setAttribute("src", thumb);
            })
            .catch(function () {});
        }
      }
    });
  }

  function buildUploadBubble(mediaType, dataUrl, captionText, fileNameText, fullSrc) {
    var bubble = document.createElement("div");
    bubble.className = "wa-bubble is-out is-uploading";
    bubble.dataset.uploadKind = String(mediaType || "");
    bubble.dataset.uploadCaption = normalizeUploadMatchValue(captionText || "");
    bubble.dataset.uploadFilename = normalizeUploadMatchValue(fileNameText || "");
    bubble.dataset.uploadSignature = buildUploadSignatureFromParts(mediaType, fileNameText, captionText);

    var meta = document.createElement("div");
    meta.className = "wa-bubble-meta";
    meta.textContent = "Enviando...";

    var bodyNode = document.createElement("div");
    bodyNode.className = "wa-bubble-body";

    if (mediaType === "audio") {
      var audioWrap = document.createElement("div");
      audioWrap.className = "wa-bubble-audio";
      var audio = document.createElement("audio");
      audio.className = "wa-bubble-audio-player";
      audio.setAttribute("controls", "true");
      audio.setAttribute("preload", "none");
      audio.src = dataUrl;
      audio.setAttribute("data-media-url", dataUrl);
      audioWrap.appendChild(audio);
      bodyNode.appendChild(audioWrap);
    } else if (mediaType === "video") {
      var fileRow = document.createElement("div");
      fileRow.className = "wa-bubble-file";
      var fileName = document.createElement("span");
      fileName.className = "wa-file-name";
      fileName.textContent = fileNameText || "video.mp4";
      var download = document.createElement("a");
      download.className = "wa-file-download wa-file-icon";
      download.href = dataUrl;
      download.setAttribute("download", fileNameText || "video.mp4");
      download.setAttribute("data-media-url", dataUrl);
      download.setAttribute("target", "_blank");
      download.innerHTML = buildFileIcon(fileExtension(fileNameText || "mp4"));
      fileRow.appendChild(fileName);
      fileRow.appendChild(download);
      bodyNode.appendChild(fileRow);
    } else if (mediaType === "file") {
      var docRow = document.createElement("div");
      docRow.className = "wa-bubble-file";
      var docName = document.createElement("span");
      docName.className = "wa-file-name";
      docName.textContent = fileNameText || "archivo";
      var docDownload = document.createElement("a");
      docDownload.className = "wa-file-download wa-file-icon";
      docDownload.href = dataUrl;
      docDownload.setAttribute("download", fileNameText || "archivo");
      docDownload.setAttribute("data-media-url", dataUrl);
      docDownload.setAttribute("target", "_blank");
      docDownload.innerHTML = buildFileIcon(fileExtension(fileNameText || "FILE"));
      docRow.appendChild(docDownload);
      docRow.appendChild(docName);
      bodyNode.appendChild(docRow);
    } else {
      var img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "Imagen";
      img.className = "wa-bubble-image";
      img.setAttribute("data-wa-bubble-image", "true");
      img.setAttribute("data-full-src", fullSrc || dataUrl);
      img.loading = "lazy";
      img.decoding = "async";
      bodyNode.appendChild(img);
    }

    if (captionText) {
      var caption = document.createElement("div");
      caption.className = "wa-bubble-caption";
      appendTextWithLinks(caption, captionText);
      bodyNode.appendChild(caption);
    }

    var progress = document.createElement("div");
    progress.className = "wa-upload-progress";
    var bar = document.createElement("div");
    bar.className = "wa-upload-bar";
    progress.appendChild(bar);

    var actions = document.createElement("div");
    actions.className = "wa-upload-actions";
    var pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.className = "wa-upload-btn";
    pauseBtn.textContent = "Pausar";
    pauseBtn.setAttribute("data-wa-upload-pause", "true");
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "wa-upload-btn wa-upload-cancel";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.setAttribute("data-wa-upload-cancel", "true");
    actions.appendChild(pauseBtn);
    actions.appendChild(cancelBtn);

    bubble.appendChild(meta);
    bubble.appendChild(bodyNode);
    bubble.appendChild(progress);
    bubble.appendChild(actions);

    bubble.dataset.progress = "0";
    bubble.dataset.progressActive = "true";
    bubble.dataset.uploadState = "uploading";

    return bubble;
  }

  function normalizeUploadMatchValue(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  function buildUploadSignatureFromParts(kind, filename, caption) {
    return [
      normalizeUploadMatchValue(kind),
      normalizeUploadMatchValue(filename),
      normalizeUploadMatchValue(caption)
    ].join("|");
  }

  function buildUploadSignatureFromMessage(message) {
    if (!message) return "";
    return buildUploadSignatureFromParts(message.message_type, message.filename, message.body);
  }

  function promotePendingUploadBubble(container, message, source) {
    if (!container || !message || !message.outgoing) return false;
    var signature = buildUploadSignatureFromMessage(message);
    var selectors = ".wa-bubble.is-uploading, .wa-bubble[data-upload-state='uploading'], .wa-bubble[data-upload-state='paused']";
    var candidates = container.querySelectorAll(selectors);
    if (!candidates || !candidates.length) return false;

    var match = null;
    candidates.forEach(function (node) {
      if (match) return;
      if (node.getAttribute("data-message-id")) return;
      var nodeSig = node.getAttribute("data-upload-signature") || "";
      if (nodeSig && signature && nodeSig === signature) {
        match = node;
      }
    });

    if (!match) {
      var fallbackKind = normalizeUploadMatchValue(message.message_type);
      candidates.forEach(function (node) {
        if (match) return;
        if (node.getAttribute("data-message-id")) return;
        var kind = normalizeUploadMatchValue(node.getAttribute("data-upload-kind"));
        if (kind && kind === fallbackKind) {
          match = node;
        }
      });
    }

    if (!match) return false;

    if (message.id) match.setAttribute("data-message-id", message.id);
    if (message.waha_id) match.setAttribute("data-waha-id", message.waha_id);
    if ((message.waha_id || message.id) && !match.getAttribute("data-reply-id")) {
      match.setAttribute("data-reply-id", message.waha_id || message.id);
    }
    match.dataset.uploadState = "done";
    match.dataset.progressActive = "false";
    match.classList.remove("is-uploading", "is-paused", "is-error");

    var meta = match.querySelector(".wa-bubble-meta");
    if (meta && message.created_at) {
      meta.textContent = message.sender_label ? (message.sender_label + " - " + message.created_at) : message.created_at;
    }

    var progress = match.querySelector(".wa-upload-progress");
    if (progress) progress.remove();
    var actions = match.querySelector(".wa-upload-actions");
    if (actions) actions.remove();

    logDebug("body_chat.dedupe.promote_pending", {
      source: source || "unknown",
      message_id: message.id,
      waha_id: message.waha_id,
      signature: signature
    }, "body_chat");

    return true;
  }

  function truncatePreview(text) {
    if (!text) return "";
    if (text.length <= 15) return text;
    return text.slice(0, 15) + "...";
  }

  function truncateTitle(text) {
    if (!text) return "";
    if (text.length <= 15) return text;
    return text.slice(0, 15) + "...";
  }

  function updateActiveCardAfterSend(payload, fallbackPreview) {
    var activeCard = document.querySelector(".wa-chat-card.is-active");
    if (!activeCard || !payload) return;
    var chatId = activeCard.getAttribute("data-chat-id");
    if (!chatId) return;
    var previewText = fallbackPreview || "";
    if (payload.body) {
      previewText = truncatePreview(payload.body);
    }
    updateChatCard({
      id: chatId,
      preview: previewText || (fallbackPreview || ""),
      time_label: payload.created_at || ""
    });
  }

  function setLoadMore(container, options) {
    var existing = container.querySelector("[data-wa-load-more='true']");
    if (existing) existing.remove();

    if (!options || !options.hasMore) return;

    var button = document.createElement("button");
    button.className = "wa-load-more";
    button.type = "button";
    button.dataset.waLoadMore = "true";
    button.dataset.waLoadUrl = options.loadUrl || "";
    button.dataset.waBeforeId = options.beforeId || "";
    button.textContent = "Mostrar mas";

    container.appendChild(button);
  }

  function updateMessages(messages, options) {
    var container = document.querySelector(".wa-messages");
    if (!container) return;
    var forceReset = !!(options && options.forceReset);
    var existingCount = container.querySelectorAll(".wa-bubble").length;
    var incomingCount = messages ? messages.length : 0;
    logServer("messages.update.start", {
      existing_count: existingCount,
      incoming_count: incomingCount,
      force_reset: forceReset,
      has_more: options ? options.hasMore : null
    });

    if (!forceReset && existingCount > 0) {
      logDebug("body_chat.render_incremental", {
        existing: existingCount,
        incoming: incomingCount
      }, "body_chat");
      var existingIds = {};
      container.querySelectorAll("[data-message-id]").forEach(function (node) {
        existingIds[node.getAttribute("data-message-id")] = true;
      });
      container.querySelectorAll("[data-waha-id]").forEach(function (node) {
        existingIds[node.getAttribute("data-waha-id")] = true;
      });

      messages.forEach(function (message) {
        var idKey = message.id ? String(message.id) : "";
        var wahaKey = message.waha_id ? String(message.waha_id) : "";
        if ((idKey && existingIds[idKey]) || (wahaKey && existingIds[wahaKey])) {
          return;
        }
        if (promotePendingUploadBubble(container, message, "update_messages")) {
          if (idKey) existingIds[idKey] = true;
          if (wahaKey) existingIds[wahaKey] = true;
          return;
        }
        var bubble = buildBubble(message);
        container.appendChild(bubble);
        logDebug("body_chat.appended", {
          id: message.id,
          type: message.message_type,
          container_count: container.childElementCount
        }, "body_chat");
        if (message.message_type === "image" || message.message_type === "file") {
          logBubbleLayout("append.incremental", bubble, message, container);
        }
      });

      if (options && options.mediaLabel) {
        var existingBadge = container.querySelector("[data-wa-chat-media-size]");
        if (existingBadge) existingBadge.textContent = formatMediaLabel(options.mediaLabel, options.lastMessageAt);
      }
      hydrateBubbleImages(container);
      logChatBodyState("update_messages", container);
      logServer("messages.update.incremental", {
        existing_count: existingCount,
        incoming_count: incomingCount,
        scroll_top: container.scrollTop,
        scroll_height: container.scrollHeight
      });
      return;
    }

    if (document.body && document.body.dataset.waDebugVisual === "true") {
      logDebug("render.reset", {
        existing: existingCount,
        incoming: incomingCount
      });
    }
    logDebug("body_chat.render_reset", {
      existing: existingCount,
      incoming: incomingCount
    }, "body_chat");

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var mediaBadge = document.createElement("div");
    mediaBadge.className = "wa-chat-media-size";
    mediaBadge.setAttribute("data-wa-chat-media-size", "true");
    if (options && options.mediaLabel) {
      mediaBadge.textContent = formatMediaLabel(options.mediaLabel, options.lastMessageAt);
    }
    container.appendChild(mediaBadge);

    setLoadMore(container, options);

    var divider = document.createElement("div");
    divider.className = "wa-day-divider";
    divider.textContent = "Hoy";
    container.appendChild(divider);

    messages.forEach(function (message) {
      var bubble = buildBubble(message);
      container.appendChild(bubble);
      logDebug("body_chat.appended", {
        id: message.id,
        type: message.message_type,
        container_count: container.childElementCount
      }, "body_chat");
      if (message.message_type === "image" || message.message_type === "file") {
        logBubbleLayout("append.reset", bubble, message, container);
      }
      if (document.body && document.body.dataset.waDebugVisual === "true") {
        logDebug("render.bubble", {
          id: message.id,
          type: message.message_type,
          height: bubble.offsetHeight,
          children: bubble.children.length
        });
        logDebug("render.appended", {
          id: message.id,
          type: message.message_type,
          container_count: container.childElementCount,
          last_child: container.lastElementChild ? container.lastElementChild.className : ""
        });
      }
    });

    container.scrollTop = container.scrollHeight;
    logDebug("body_chat.scroll_to_bottom", { scroll_top: container.scrollTop }, "body_chat");
    hydrateBubbleImages(container);
    logChatBodyState("update_messages", container);
    logServer("messages.update.reset", {
      existing_count: existingCount,
      incoming_count: incomingCount,
      scroll_top: container.scrollTop,
      scroll_height: container.scrollHeight
    });
  }

  function prependMessages(messages, options) {
    var container = document.querySelector(".wa-messages");
    if (!container) return;

    var divider = container.querySelector(".wa-day-divider");
    var insertBefore = divider ? divider.nextSibling : container.firstChild;

      messages.forEach(function (message) {
        var bubble = buildBubble(message);
        container.insertBefore(bubble, insertBefore);
        logDebug("body_chat.prepended", {
          id: message.id,
          type: message.message_type,
          container_count: container.childElementCount
        }, "body_chat");
        if (message.message_type === "image" || message.message_type === "file") {
          logBubbleLayout("prepend", bubble, message, container);
        }
        if (document.body && document.body.dataset.waDebugVisual === "true") {
          logDebug("render.bubble", {
            id: message.id,
            type: message.message_type,
            height: bubble.offsetHeight,
            children: bubble.children.length
          });
          logDebug("render.appended", {
            id: message.id,
            type: message.message_type,
            container_count: container.childElementCount,
            last_child: container.lastElementChild ? container.lastElementChild.className : ""
          });
        }
      });
    hydrateBubbleImages(container);

    if (options) {
      var loadMore = container.querySelector("[data-wa-load-more='true']");
      if (loadMore) {
        if (options.hasMore) {
          loadMore.dataset.waBeforeId = options.beforeId || "";
        } else {
          loadMore.remove();
        }
      }
    }
  }

  function updateHeader(chat) {
    var chatBody = document.querySelector("[data-wa-chat-body]");
    var title = document.querySelector(".wa-chat-header .wa-chat-name");
    var chatIdLabels = document.querySelectorAll("[data-wa-chat-id]");
    var mediaSize = document.querySelector("[data-wa-chat-media-size]");
    var avatar = document.querySelector(".wa-chat-header .wa-avatar");
    var details = document.querySelector(".wa-chat-details");
    var tools = document.querySelector("[data-wa-chat-tools]");
    var statusSelect = getChatStatusSelect();
    var header = document.querySelector(".wa-chat-header");

    if (chatBody) {
      var wasHidden = chatBody.classList.contains("is-hidden");
      chatBody.classList.remove("is-hidden");
      if (wasHidden) {
        logServer("chat_body.show", { source: "updateHeader" });
      }
    }
    if (header && chat.id !== undefined && chat.id !== null) {
      header.setAttribute("data-chat-id", chat.id);
    }
    if (title) title.textContent = truncateTitle(chat.title);
    if (chatIdLabels.length) {
      chatIdLabels.forEach(function (label) {
        label.textContent = "ID: " + (chat.external_id || "--");
      });
    }
    if (mediaSize && chat.media_label) {
      mediaSize.textContent = formatMediaLabel(chat.media_label, chat.last_message_at);
    }
    if (avatar) avatar.textContent = chat.initials;
    if (details) details.classList.remove("is-hidden");
    if (avatar) avatar.classList.remove("is-hidden");
    if (tools) tools.classList.remove("is-hidden");
    if (statusSelect && header) {
      syncChatWorkPackageStatus(chat.id);
    }
    if (window.WAConversationSelector && typeof window.WAConversationSelector.sync === "function") {
      window.WAConversationSelector.sync(chat && chat.id ? chat.id : "", chat && chat.conversation_status ? chat.conversation_status : "");
    }
    if (window.WAResponsibleSync && typeof window.WAResponsibleSync.sync === "function") {
      window.WAResponsibleSync.sync(chat && chat.id ? chat.id : "");
    }
  }

    function bindChatStatusSelect() {
      var select = getChatStatusSelect();
      var header = document.querySelector(".wa-chat-header");
      if (!select || select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    if (header) header.dataset.statusDirty = "";
    select.addEventListener("change", function () {
      var wpId = select.dataset.wpStatusWorkPackageId || "";
      var statusId = select.value || "";
      if (!wpId || !statusId) return;
      updateWorkPackageStatus(wpId, statusId, select);
    });
  }

  function getShell() {
    return document.querySelector(".wa-shell");
  }

  function getChatStatusSelect() {
    var header = document.querySelector(".wa-chat-header");
    if (header) {
      var inHeader = header.querySelector("[data-wa-chat-status]");
      if (inHeader) return inHeader;
    }
    return document.querySelector("[data-wa-chat-status]");
  }

  function getCsrfToken() {
    var token = document.querySelector("meta[name='csrf-token']");
    return token ? token.content : "";
  }

  function parseStatusIdFromHref(href) {
    if (!href) return "";
    var match = href.match(/\/api\/v3\/statuses\/(\d+)/);
    return match ? match[1] : "";
  }

  var waWpStatusCache = {};
  var waWpStatusListCache = null;
  var waWpAllowedStatusCache = {};
  var waWpChatStatusCache = {};

  function getCachedWpStatusColor(chatId) {
    if (!chatId) return "";
    var cached = waWpChatStatusCache[String(chatId)];
    if (!cached) return "";
    if (cached.color) return cached.color;
    if (cached.statusId && cached.options && cached.options.length) {
      var match = cached.options.find(function (opt) {
        return String(opt.id) === String(cached.statusId);
      });
      if (match && match.color) return normalizeStatusColor(match.color);
    }
    return "";
  }

    function broadcastWpStatusChange(select, source) {
      if (!select) return;
      if (select.dataset.wpStatusSyncing === "true") {
        select.dataset.wpStatusSyncing = "";
        return;
      }
      var workPackageId = select.dataset.wpStatusWorkPackageId || "";
      var statusId = select.value || "";
      if (!workPackageId || !statusId) return;
      var option = select.options[select.selectedIndex];
      var color = option ? option.getAttribute("data-color") : "";
      document.dispatchEvent(new CustomEvent("wa:wp-status-change", {
        detail: {
          source: source || "wa",
          workPackageId: String(workPackageId),
          statusId: String(statusId),
          color: color || ""
        }
      }));
    }

    function bindWpStatusSyncListener() {
      if (document.body.dataset.wpStatusWaSyncBound === "true") return;
      document.body.dataset.wpStatusWaSyncBound = "true";
      document.addEventListener("wa:wp-status-change", function (event) {
        var detail = event && event.detail ? event.detail : {};
        if (!detail || detail.source === "wa") return;
        var select = getChatStatusSelect();
        if (!select) return;
        var workPackageId = select.dataset.wpStatusWorkPackageId || "";
        if (!workPackageId || String(workPackageId) !== String(detail.workPackageId || "")) return;
        if (select.value === String(detail.statusId || "")) return;
        select.dataset.wpStatusSyncing = "true";
        select.value = String(detail.statusId || "");
        applyWpStatusSelectColor(select);
      });
    }

    function normalizeStatusColor(color) {
      if (!color) return "";
      if (typeof color === "string") return color;
      if (typeof color === "object") {
        if (color.hexcode) return String(color.hexcode);
        if (color.value) return String(color.value);
        if (color.name && String(color.name).charAt(0) === "#") return String(color.name);
      }
      return "";
    }

    function ensureWpStatusOption(select, status) {
      if (!select || !status || !status.id) return;
      var existing = Array.prototype.find.call(select.options, function (opt) {
        return opt.value === String(status.id);
      });
      if (existing) {
        var existingColor = normalizeStatusColor(status.color);
        if (existingColor) existing.setAttribute("data-color", existingColor);
        if (status.name) existing.textContent = status.name;
        return;
      }
      var option = document.createElement("option");
      option.value = String(status.id);
      option.textContent = status.name || "Estado";
      var optionColor = normalizeStatusColor(status.color);
      if (optionColor) option.setAttribute("data-color", optionColor);
      select.appendChild(option);
    }

  function fetchWpStatusDetails(statusId) {
    if (!statusId) return Promise.resolve(null);
    if (waWpStatusCache[statusId]) return Promise.resolve(waWpStatusCache[statusId]);
    return fetch("/api/v3/statuses/" + encodeURIComponent(statusId), {
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
          var status = { id: data.id, name: data.name, color: normalizeStatusColor(data.color) };
          waWpStatusCache[statusId] = status;
          return status;
        })
        .catch(function () { return null; });
    }

  function hexToRgb(hex) {
    if (!hex) return null;
    var cleaned = hex.replace("#", "").trim();
    if (cleaned.length === 3) {
      cleaned = cleaned.split("").map(function (c) { return c + c; }).join("");
    }
    if (cleaned.length !== 6) return null;
    var num = parseInt(cleaned, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function getContrastTextColor(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return "";
    var r = rgb.r / 255;
    var g = rgb.g / 255;
    var b = rgb.b / 255;
    var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.6 ? "#111827" : "#ffffff";
  }

    function applyWpStatusSelectColor(select) {
      if (!select) return;
      var option = select.options[select.selectedIndex];
      var color = option ? option.getAttribute("data-color") : "";
      var noWpOnly = select.disabled && select.options && select.options.length === 1 && !select.options[0].value;
      if (!select.value || !color) {
        logServer("wp_status.select_color.skip_empty", {
          value: select.value || "",
          work_package_id: select.dataset.wpStatusWorkPackageId || "",
          chat_id: select.dataset.wpStatusChatId || "",
          has_option: !!option,
          option_value: option ? option.value || "" : "",
          option_color: color || "",
          no_wp_only: !!noWpOnly
        });
        if (noWpOnly) {
          select.style.borderColor = WA_WP_EMPTY_COLOR;
          select.style.boxShadow = "inset 0 0 0 9999px " + WA_WP_EMPTY_COLOR;
          select.style.backgroundColor = WA_WP_EMPTY_COLOR;
          select.style.backgroundImage = "none";
          select.style.backgroundClip = "padding-box";
          select.style.color = WA_WP_EMPTY_TEXT;
          applyWpStatusAvatarColor(select, "", { useDefault: true });
        }
        return;
      }
      if (color) {
        select.style.borderColor = color;
      select.style.boxShadow = "inset 0 0 0 9999px " + color;
      select.style.backgroundColor = color;
      select.style.backgroundImage = "none";
      select.style.backgroundClip = "padding-box";
      select.style.color = getContrastTextColor(color);
        applyWpStatusAvatarColor(select, color);
        var chatId = select.dataset.wpStatusChatId || "";
        if (chatId) {
          applyWpStatusAvatarColorByChat(chatId, color, { includeHeader: true });
        }
        if (chatId) {
          var cached = waWpChatStatusCache[String(chatId)] || {};
          if (!cached.options || !cached.options.length) {
            cached.options = Array.prototype.slice.call(select.options || []).map(function (opt) {
              return {
                id: opt.value,
                name: opt.textContent || "Estado",
                color: opt.getAttribute("data-color") || ""
              };
            });
          }
          cached.color = color || cached.color || "";
          cached.statusId = select.value || cached.statusId || "";
          cached.workPackageId = select.dataset.wpStatusWorkPackageId || cached.workPackageId || "";
          waWpChatStatusCache[String(chatId)] = cached;
        }
        broadcastWpStatusChange(select, "wa");
        logServer("wp_status.select_color", {
          color: color,
          value: select.value || "",
          work_package_id: select.dataset.wpStatusWorkPackageId || "",
          chat_id: select.dataset.wpStatusChatId || ""
        });
      } else {
      select.style.borderColor = "";
      select.style.boxShadow = "";
      select.style.backgroundColor = "";
      select.style.backgroundImage = "";
      select.style.backgroundClip = "";
      select.style.color = "";
        applyWpStatusAvatarColor(select, "");
        broadcastWpStatusChange(select, "wa");
        logServer("wp_status.select_color.clear", {
          value: select.value || "",
          work_package_id: select.dataset.wpStatusWorkPackageId || "",
          chat_id: select.dataset.wpStatusChatId || ""
        });
      }
    }

    var WA_WP_EMPTY_COLOR = "#E5E7EB";
    var WA_WP_EMPTY_TEXT = "#6B7280";

    function applyWpStatusAvatarColor(select, color, options) {
      options = options || {};
      var useDefault = options.useDefault === true;
      var header = document.querySelector(".wa-chat-header");
      var headerAvatar = header ? header.querySelector(".wa-avatar.is-large") : null;
      var chatId = header ? header.getAttribute("data-chat-id") : "";
      var resolvedColor = color || (useDefault ? WA_WP_EMPTY_COLOR : "");
      var textColor = resolvedColor ? getContrastTextColor(resolvedColor) : "";
      if (useDefault && resolvedColor === WA_WP_EMPTY_COLOR) {
        textColor = WA_WP_EMPTY_TEXT;
      }
      if (headerAvatar) {
        clearChatStatusClasses(header);
        headerAvatar.style.backgroundColor = resolvedColor || "";
        headerAvatar.style.borderColor = resolvedColor || "";
        headerAvatar.style.color = textColor || "";
        headerAvatar.setAttribute("data-wp-avatar-color", resolvedColor || "");
      }
      if (chatId) {
        applyWpStatusAvatarColorByChat(chatId, resolvedColor, { includeHeader: false, useDefault: useDefault });
      }
    }

    function applyWpStatusAvatarColorByChat(chatId, color, options) {
      if (!chatId) return;
      options = options || {};
      var includeHeader = options.includeHeader !== false;
      var useDefault = options.useDefault === true;
      var resolvedColor = color || (useDefault ? WA_WP_EMPTY_COLOR : "");
      if (!resolvedColor) return;
      var textColor = resolvedColor ? getContrastTextColor(resolvedColor) : "";
      if (useDefault && resolvedColor === WA_WP_EMPTY_COLOR) {
        textColor = WA_WP_EMPTY_TEXT;
      }
      var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
      var cardAvatar = card ? card.querySelector(".wa-avatar") : null;
      var previousColor = cardAvatar ? cardAvatar.getAttribute("data-wp-avatar-color") : "";
      if (previousColor && previousColor === resolvedColor) return;
      if (cardAvatar) {
        paintWpAvatarElement(cardAvatar, resolvedColor, { card: card, useDefault: useDefault });
      }
      logServer("wp_status.avatar_color", {
        chat_id: chatId,
        color: resolvedColor || "",
        text_color: textColor || "",
        has_card: !!card,
        has_avatar: !!cardAvatar
      });
      if (includeHeader) {
        logServer("wp_status.avatar_color.header.skipped", {
          chat_id: chatId,
          color: resolvedColor || "",
          text_color: textColor || ""
        });
      }
    }

  function paintWpAvatarElement(avatarEl, color, options) {
    if (!avatarEl) return;
    options = options || {};
    var useDefault = options.useDefault === true;
    var resolvedColor = color || (useDefault ? WA_WP_EMPTY_COLOR : "");
    if (!resolvedColor) return;
    var textColor = resolvedColor ? getContrastTextColor(resolvedColor) : "";
    if (useDefault && resolvedColor === WA_WP_EMPTY_COLOR) {
      textColor = WA_WP_EMPTY_TEXT;
    }
    var card = options.card || avatarEl.closest(".wa-chat-card");
    if (card) clearChatStatusClasses(card);
    avatarEl.style.backgroundColor = resolvedColor || "";
    avatarEl.style.borderColor = resolvedColor || "";
    avatarEl.style.color = textColor || "";
    avatarEl.setAttribute("data-wp-avatar-color", resolvedColor || "");
  }

  function seedWpStatusCacheFromCards() {
    var cards = document.querySelectorAll(".wa-chat-card");
    if (!cards || !cards.length) return;
    Array.prototype.slice.call(cards).forEach(function (card) {
      var chatId = card.getAttribute("data-chat-id");
      if (!chatId) return;
      var avatar = card.querySelector(".wa-avatar");
      if (!avatar) return;
      var color = avatar.getAttribute("data-wp-avatar-color") || "";
      if (!color) return;
      var cached = waWpChatStatusCache[String(chatId)] || {};
      if (!cached.color) {
        cached.color = color;
        waWpChatStatusCache[String(chatId)] = cached;
      }
    });
  }

  function clearChatStatusClasses(element) {
    if (!element || !element.classList) return;
    element.classList.forEach(function (cls) {
      if (cls.indexOf("is-status-") === 0) {
        element.classList.remove(cls);
      }
    });
  }

  var waWpCardStatusInFlight = {};

    function syncChatCardWpStatus(chatId, options) {
      if (!chatId) return;
      options = options || {};
      var activeSelect = getChatStatusSelect();
      var activeChatId = activeSelect ? activeSelect.dataset.wpStatusChatId : "";
      var isActiveChat = activeSelect && String(activeChatId) === String(chatId);
      var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
      if (!card) return;
    var cachedColor = getCachedWpStatusColor(chatId);
    if (cachedColor && !isActiveChat) {
      applyWpStatusAvatarColorByChat(chatId, cachedColor, { includeHeader: false });
    }
    if (card.dataset.wpStatusApplied === "true" && !options.force) return;
    if (waWpCardStatusInFlight[chatId]) return;
    waWpCardStatusInFlight[chatId] = true;

    var shell = getShell();
    var relatedUrl = shell ? shell.getAttribute("data-wa-wp-related-url") : "";
    if (!relatedUrl) {
      waWpCardStatusInFlight[chatId] = false;
      return;
    }

    logServer("wp_status.card_sync.start", {
      chat_id: chatId
    });
    fetch(relatedUrl + "?chat_id=" + encodeURIComponent(chatId), { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
        var items = data && data.items ? data.items : [];
          if (!items.length) {
            if (cachedColor) {
              if (isActiveChat && activeSelect) {
                var cachedStatus = waWpChatStatusCache[String(chatId)] || {};
                if (cachedStatus.statusId) {
                  activeSelect.value = String(cachedStatus.statusId);
                }
                applyWpStatusSelectColor(activeSelect);
              } else {
                applyWpStatusAvatarColorByChat(chatId, cachedColor, { includeHeader: false });
              }
              logServer("wp_status.card_sync.empty.cached", {
                chat_id: chatId,
                color: cachedColor
              });
              return null;
            }
            if (isActiveChat && activeSelect) {
              activeSelect.innerHTML = "";
              var emptyOption = document.createElement("option");
              emptyOption.value = "";
              emptyOption.textContent = "Sin paquete de trabajo";
              activeSelect.appendChild(emptyOption);
              activeSelect.disabled = true;
              applyWpStatusSelectColor(activeSelect);
              applyWpStatusAvatarColor(activeSelect, "", { useDefault: true });
            } else {
              logServer("wp_status.card_sync.empty.skip_gray", { chat_id: chatId });
            }
            return null;
          }
          var wpId = items[0] && items[0].id ? String(items[0].id) : "";
          if (!wpId) return null;
        return fetch("/api/v3/work_packages/" + encodeURIComponent(wpId), {
          credentials: "same-origin",
          headers: { "Accept": "application/json" }
        })
          .then(function (res) {
            if (!res.ok) throw new Error("error");
            return res.json();
          })
          .then(function (wp) {
            var statusId = "";
            if (wp && wp._links && wp._links.status && wp._links.status.href) {
              statusId = parseStatusIdFromHref(wp._links.status.href);
            }
            if (!statusId) return null;
            return fetchWpStatusDetails(statusId).then(function (status) {
                if (status && status.color) {
                  card.dataset.wpStatusApplied = "true";
                  var cached = waWpChatStatusCache[String(chatId)] || {};
                  cached.color = status.color || cached.color || "";
                  cached.statusId = String(statusId || cached.statusId || "");
                  cached.workPackageId = String(wpId || cached.workPackageId || "");
                  waWpChatStatusCache[String(chatId)] = cached;
                  if (isActiveChat && activeSelect) {
                    ensureWpStatusOption(activeSelect, status);
                    activeSelect.value = String(statusId);
                    activeSelect.dataset.wpStatusCurrentId = String(statusId);
                    applyWpStatusSelectColor(activeSelect);
                  } else {
                    applyWpStatusAvatarColorByChat(chatId, status.color, { includeHeader: false });
                  }
                  logServer("wp_status.card_sync.applied", {
                    chat_id: chatId,
                    work_package_id: wpId,
                    status_id: statusId,
                    color: status.color || ""
                  });
                } else {
                  if (isActiveChat && activeSelect) {
                    applyWpStatusSelectColor(activeSelect);
                  } else {
                    logServer("wp_status.card_sync.no_status.skip_gray", { chat_id: chatId });
                  }
                }
                return status;
              });
            });
        })
      .catch(function () {})
      .finally(function () {
        waWpCardStatusInFlight[chatId] = false;
        logServer("wp_status.card_sync.done", { chat_id: chatId });
      });
  }

  function syncAllChatCardWpStatusColors() {
    var cards = document.querySelectorAll(".wa-chat-card[data-chat-id]");
    cards.forEach(function (card, index) {
      var chatId = card.getAttribute("data-chat-id");
      if (!chatId) return;
      clearChatStatusClasses(card);
      setTimeout(function () {
        syncChatCardWpStatus(chatId);
      }, index * 150);
    });
  }

  function fetchWpStatusList() {
    if (waWpStatusListCache) return Promise.resolve(waWpStatusListCache);
    return fetch("/api/v3/statuses?pageSize=200", {
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
        var list = (data && data._embedded && data._embedded.elements) ? data._embedded.elements : [];
        waWpStatusListCache = list.map(function (item) {
            return { id: item.id, name: item.name, color: normalizeStatusColor(item.color) };
          });
          return waWpStatusListCache;
        })
        .catch(function () { return []; });
  }

  function getWpStatusesUrl(workPackageId) {
    var shell = getShell();
    var template = shell ? shell.getAttribute("data-wa-wp-statuses-url-template") : "";
    if (!template || !workPackageId) return "";
    return template.replace("__ID__", String(workPackageId));
  }

  function fetchWpAllowedStatuses(workPackageId, force) {
    if (!workPackageId) return Promise.resolve([]);
    if (force) {
      delete waWpAllowedStatusCache[workPackageId];
    }
    if (waWpAllowedStatusCache[workPackageId]) {
      return Promise.resolve(waWpAllowedStatusCache[workPackageId]);
    }
    var url = getWpStatusesUrl(workPackageId);
    if (!url) return Promise.resolve([]);
    return fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": getCsrfToken(),
        "X-Requested-With": "XMLHttpRequest"
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
        var list = Array.isArray(data && data.statuses) ? data.statuses : [];
        var filtered = list.filter(function (item) { return item && item.id; });
        waWpAllowedStatusCache[workPackageId] = filtered;
        return filtered;
      })
      .catch(function () { return []; });
  }

  function fillWpStatusSelectOptions(select, list) {
    if (!select) return;
    var currentValue = select.value;
    select.innerHTML = "";
      (list || []).forEach(function (status) {
        var option = document.createElement("option");
        option.value = String(status.id);
        option.textContent = status.name || "Estado";
        var listColor = normalizeStatusColor(status.color);
        if (listColor) option.setAttribute("data-color", listColor);
        select.appendChild(option);
      });
    if (currentValue) {
      select.value = currentValue;
    }
  }

  function updateWorkPackageStatus(workPackageId, statusId, select) {
    if (!workPackageId || !statusId) return;
    var lockVersion = select ? select.dataset.wpLockVersion : "";
    var payload = {
      lockVersion: lockVersion ? Number(lockVersion) : 0,
      _links: {
        status: { href: "/api/v3/statuses/" + encodeURIComponent(statusId) }
      }
    };
    fetch("/api/v3/work_packages/" + encodeURIComponent(workPackageId), {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken(),
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
        if (select && data && data.lockVersion !== undefined) {
          select.dataset.wpLockVersion = String(data.lockVersion);
        }
        if (data && data._links && data._links.status && data._links.status.href) {
          var newStatusId = parseStatusIdFromHref(data._links.status.href);
          if (newStatusId && select) {
            if (select.dataset.wpStatusCurrentId !== String(newStatusId)) {
              select.dataset.wpStatusCurrentId = String(newStatusId);
              fetchWpAllowedStatuses(workPackageId, true).then(function (list) {
                fillWpStatusSelectOptions(select, list);
                select.value = String(newStatusId);
                applyWpStatusSelectColor(select);
              });
              return;
            }
            select.value = String(newStatusId);
            applyWpStatusSelectColor(select);
          }
        }
      })
      .catch(function () {});
  }

  function startChatWpStatusPolling(workPackageId, select) {
    if (!select || !workPackageId) return;
    if (select.dataset.wpStatusPolling === workPackageId) return;
    if (select.dataset.wpStatusInterval) {
      clearInterval(Number(select.dataset.wpStatusInterval));
    }
    select.dataset.wpStatusPolling = workPackageId;
    select.disabled = false;

    function pollOnce() {
      fetch("/api/v3/work_packages/" + encodeURIComponent(workPackageId), {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      })
        .then(function (res) {
          if (!res.ok) throw new Error("error");
          return res.json();
        })
        .then(function (data) {
          var statusId = "";
          if (data && data._links && data._links.status && data._links.status.href) {
            statusId = parseStatusIdFromHref(data._links.status.href);
          }
          if (data && data.lockVersion !== undefined) {
            select.dataset.wpLockVersion = String(data.lockVersion);
          }
          if (!statusId) return;
          var previousStatusId = select.dataset.wpStatusCurrentId || "";
          if (previousStatusId !== String(statusId)) {
            select.dataset.wpStatusCurrentId = String(statusId);
            fetchWpAllowedStatuses(workPackageId, true).then(function (list) {
              fillWpStatusSelectOptions(select, list);
              select.value = String(statusId);
              applyWpStatusSelectColor(select);
            });
            return;
          }
          fetchWpStatusDetails(statusId).then(function (status) {
            if (status) ensureWpStatusOption(select, status);
            select.value = String(statusId);
            applyWpStatusSelectColor(select);
          });
        })
        .catch(function () {});
    }

    pollOnce();
    var intervalId = setInterval(pollOnce, 15000);
    select.dataset.wpStatusInterval = String(intervalId);
  }

    function syncChatWorkPackageStatus(chatId) {
      var select = getChatStatusSelect();
      if (!select) return;
      if (!chatId) {
        select.disabled = true;
        applyWpStatusSelectColor(select);
        return;
      }
      if (select.dataset.wpStatusChatId === String(chatId)) return;
      select.dataset.wpStatusChatId = String(chatId);
      var shell = getShell();
      var relatedUrl = shell ? shell.getAttribute("data-wa-wp-related-url") : "";
      if (!relatedUrl) return;
      select.disabled = true;

      var cached = waWpChatStatusCache[String(chatId)];
      if (cached && cached.options && cached.options.length) {
        fillWpStatusSelectOptions(select, cached.options);
        if (cached.statusId) {
          select.value = String(cached.statusId);
          select.disabled = false;
          applyWpStatusSelectColor(select);
        } else if (select.dataset.wpStatusCurrentId) {
          select.value = String(select.dataset.wpStatusCurrentId);
          select.disabled = false;
          applyWpStatusSelectColor(select);
        } else {
          select.disabled = false;
        }
      } else {
        var activeCard = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
        var activeAvatar = activeCard ? activeCard.querySelector(".wa-avatar") : null;
        var fallbackColor = activeAvatar ? activeAvatar.getAttribute("data-wp-avatar-color") : "";
        if (fallbackColor) {
          select.style.borderColor = fallbackColor;
          select.style.boxShadow = "inset 0 0 0 9999px " + fallbackColor;
          select.style.backgroundColor = fallbackColor;
          select.style.backgroundImage = "none";
          select.style.backgroundClip = "padding-box";
          select.style.color = getContrastTextColor(fallbackColor);
        }
      }
      fetch(relatedUrl + "?chat_id=" + encodeURIComponent(chatId), { credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok) throw new Error("error");
          return res.json();
        })
        .then(function (data) {
          var items = data && data.items ? data.items : [];
          if (!items.length) {
            select.innerHTML = "";
            var emptyOption = document.createElement("option");
            emptyOption.value = "";
            emptyOption.textContent = "Sin paquete de trabajo";
            select.appendChild(emptyOption);
            select.disabled = true;
            if (select.dataset.wpStatusInterval) {
              clearInterval(Number(select.dataset.wpStatusInterval));
              select.dataset.wpStatusInterval = "";
            }
            select.dataset.wpStatusPolling = "";
            select.dataset.wpStatusWorkPackageId = "";
            select.dataset.wpStatusCurrentId = "";
            select.dataset.wpLockVersion = "";
            if (chatId) {
              delete waWpChatStatusCache[String(chatId)];
            }
            applyWpStatusSelectColor(select);
            applyWpStatusAvatarColor(select, "", { useDefault: true });
            return;
          }
          var wpId = items[0] && items[0].id ? String(items[0].id) : "";
          if (!wpId) return;
          select.dataset.wpStatusWorkPackageId = wpId;
          Promise.all([
            fetchWpAllowedStatuses(wpId, true),
            fetch("/api/v3/work_packages/" + encodeURIComponent(wpId), {
              credentials: "same-origin",
              headers: { "Accept": "application/json" }
            }).then(function (res) {
              if (!res.ok) throw new Error("error");
              return res.json();
            }).catch(function () { return null; })
          ]).then(function (result) {
            var list = result[0] || [];
            var wp = result[1];
            var statusId = "";
            if (wp && wp._links && wp._links.status && wp._links.status.href) {
              statusId = parseStatusIdFromHref(wp._links.status.href);
            }
            fillWpStatusSelectOptions(select, list);
            if (statusId) {
              select.dataset.wpStatusCurrentId = String(statusId);
              select.value = String(statusId);
              fetchWpStatusDetails(statusId).then(function (status) {
                if (status) ensureWpStatusOption(select, status);
                applyWpStatusSelectColor(select);
              });
            }
            select.disabled = false;
            startChatWpStatusPolling(wpId, select);
            var cachedStatusId = select.value || select.dataset.wpStatusCurrentId || "";
            var existingCache = waWpChatStatusCache[String(chatId)] || {};
            waWpChatStatusCache[String(chatId)] = {
              workPackageId: wpId,
              statusId: cachedStatusId || existingCache.statusId || "",
              options: list
            };
          });
        })
        .catch(function () {});
    }

  function setActiveChat(chatId) {
    var cards = document.querySelectorAll(".wa-chat-card");
    logDebug("chat_card.set_active", { chat_id: chatId, count: cards.length }, "chat_card");
    cards.forEach(function (card) {
      var isActive = card.getAttribute("data-chat-id") === String(chatId);
      if (isActive) {
        card.classList.add("is-active");
      } else {
        card.classList.remove("is-active");
      }
    });
  }

  function formatMediaLabel(label, lastMessageAt) {
    var text = label || "";
    if (!text) return "";
    var lastLabel = lastMessageAt ? " - Ultimo mensaje " + lastMessageAt : "";
    return text + lastLabel;
  }

  function updateChatId(chatId) {
    var input = document.querySelector("input[name='chat_id']");
    if (input) input.value = chatId;

    var textarea = document.querySelector(".wa-composer textarea");
    var sendButton = document.querySelector(".wa-send-float");
    if (chatId && textarea) textarea.removeAttribute("disabled");
    if (chatId && sendButton) sendButton.removeAttribute("disabled");
  }

  function markChatRead(chatId) {
    var root = document.querySelector(".wa-shell");
    var template = root ? root.getAttribute("data-wa-chat-read-url-template") : "";
    if (!template || !chatId) return;
    var url = template.replace("__ID__", encodeURIComponent(chatId));
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      }
    })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (payload) {
        if (payload && payload.chat_id) {
          updateChatCard({ id: payload.chat_id, unread_count: 0 }, { moveToTop: false, source: "mark_read" });
        }
      })
      .catch(function () {});
  }

  function bindChatLinks() {
    if (document.body.dataset.waChatLinksBound === "true") return;
    document.body.dataset.waChatLinksBound = "true";

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      if (window.__waSkipNextChatOpen) {
        if (window.console && typeof window.console.info === "function") {
          window.console.info("[WA] chat_card.open.skip_next");
        }
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        return;
      }
      var skipLink = target && target.closest(".wa-chat-edit, .wa-chat-favorite, .wa-chat-delete, .wa-chat-action, [data-wa-confirm], .wa-chat-macro-select, .wa-chat-macro-run, [data-wa-chat-macro-select], [data-wa-chat-macro-run], [data-wa-ia-flow-select]");
      if (skipLink) {
        if (window.console && typeof window.console.info === "function") {
          window.console.info("[WA] chat_card.skip", {
            tag: skipLink.tagName,
            cls: skipLink.className
          });
        }
        logDebug("wa_chat_card.click.skip", {
          tag: skipLink.tagName,
          cls: skipLink.className,
          chat_id: skipLink.closest(".wa-chat-card") ? skipLink.closest(".wa-chat-card").getAttribute("data-chat-id") : null
        }, "chat_card");
        event.preventDefault();
        return;
      }
      var link = target && target.closest("[data-whatsapp-chat-link='true']");
      if (!link) return;
      if (window.console && typeof window.console.info === "function") {
        window.console.info("[WA] chat_card.open", {
          href: link.getAttribute("href") || ""
        });
      }
      logDebug("wa_chat_card.click.open", {
        chat_id: link.getAttribute("data-chat-id") || "",
        href: link.getAttribute("href") || ""
      }, "chat_card");
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      window.__waSkipNextChatOpen = true;
      window.setTimeout(function () {
        window.__waSkipNextChatOpen = false;
      }, 0);

      requestJson(link.href, {
        headers: { "Accept": "application/json" }
      })
        .then(function (payload) {
          updateChatCard(payload.chat || {}, { moveToTop: false, source: "chat_switch" });
          updateHeader(payload.chat);
          updateMessages(payload.messages, {
              hasMore: payload.has_more,
              beforeId: payload.oldest_id,
              loadUrl: payload.load_url,
              mediaLabel: payload.chat && payload.chat.media_label,
              lastMessageAt: payload.chat && payload.chat.last_message_at,
              forceReset: true
            });
            logChatBodyState("chat_switch", document.querySelector(".wa-messages"));
            setActiveChat(payload.chat.id);
            updateChatId(payload.chat.id);
        })
        .catch(function () {});
    }, true);
  }

  function renderChatList(chats) {
    var list = document.querySelector(".wa-chat-list");
    if (!list) return;

    var visibleChats = chats.filter(function (chat) { return !isChatDeleted(chat.id); });
    var signature = JSON.stringify(visibleChats.map(function (chat) {
      return {
        id: chat.id,
        title: chat.title || "",
        preview: chat.preview || "",
        time: chat.time_label || "",
        unread: chat.unread_count || 0,
        conversation_status: chat.conversation_status || "started",
        favorite: !!chat.favorite,
        ia_flow_id: chat.ia_flow_id || "",
        status: chat.status || "",
        wp_status_id: chat.wp_status_id || "",
        wp_status_color: chat.wp_status_color || ""
      };
    }));
    if (list.dataset.waRenderKey === signature) {
      logDebug("chat_card.render_list.skip", { count: visibleChats.length }, "chat_card");
      return;
    }
    list.dataset.waRenderKey = signature;
    list.innerHTML = "";
    logDebug("chat_card.render_list", { count: visibleChats.length }, "chat_card");
    visibleChats.forEach(function (chat) {
      list.appendChild(buildChatCardNode(chat));
    });

    list.dataset.waChatOffset = String(visibleChats.length);
    updateLoadMoreButton(list, true, false);

    bindChatLinks();
  }

  function appendChatList(chats, limit) {
    var list = document.querySelector(".wa-chat-list");
    if (!list) return;
    var existing = {};
    Array.prototype.slice.call(list.querySelectorAll(".wa-chat-card")).forEach(function (card) {
      var id = card.getAttribute("data-chat-id");
      if (id) existing[id] = true;
    });
    var visibleChats = chats.filter(function (chat) { return !isChatDeleted(chat.id); });
    visibleChats.forEach(function (chat) {
      if (existing[String(chat.id)]) return;
      list.appendChild(buildChatCardNode(chat));
    });
    var newCount = list.querySelectorAll(".wa-chat-card").length;
    list.dataset.waChatOffset = String(newCount);
    if (limit && visibleChats.length < limit) {
      updateLoadMoreButton(list, false, false);
    } else {
      updateLoadMoreButton(list, true, false);
    }
    bindChatLinks();
  }

  function updateLoadMoreButton(list, show, disabled) {
    var button = document.querySelector("[data-wa-chat-load-more='true']");
    if (!button) return;
    if (!show) {
      button.classList.add("is-hidden");
    } else {
      button.classList.remove("is-hidden");
    }
    button.disabled = !!disabled;
  }

  function buildChatCardNode(chat) {
    var card = document.createElement("div");
    card.className = "wa-chat-card" + (chat.favorite ? " is-favorite" : "");
    card.setAttribute("data-chat-id", chat.id);
    if (chat.external_id) {
      card.setAttribute("data-chat-external-id", chat.external_id);
    }
    if (chat.ia_flow_id !== undefined && chat.ia_flow_id !== null) {
      card.setAttribute("data-ia-flow-id", chat.ia_flow_id || "");
    }
    card.setAttribute("data-conversation-status", chat.conversation_status || "started");

    var link = document.createElement("a");
    link.href = window.location.pathname + "?chat_id=" + chat.id;
    link.className = "wa-chat-link";
    link.setAttribute("data-whatsapp-chat-link", "true");
    link.setAttribute("data-chat-id", chat.id);
    if (chat.external_id) {
      link.setAttribute("data-chat-external-id", chat.external_id);
    }

    var meta = document.createElement("div");
    meta.className = "wa-chat-meta";
    var actionsRow = document.createElement("div");
    actionsRow.className = "wa-chat-row wa-chat-row-actions";
    var actionsLeft = document.createElement("div");
    actionsLeft.className = "wa-chat-actions-left";
    var avatar = document.createElement("div");
    avatar.className = "wa-avatar";
    avatar.textContent = chat.initials || "CH";
    if (chat.wp_status_color) {
      var wpColor = String(chat.wp_status_color);
      var cacheEntry = waWpChatStatusCache[String(chat.id)] || {};
      cacheEntry.color = wpColor;
      if (chat.wp_status_id !== undefined && chat.wp_status_id !== null && chat.wp_status_id !== "") {
        cacheEntry.statusId = String(chat.wp_status_id);
      }
      if (chat.work_package_id !== undefined && chat.work_package_id !== null && chat.work_package_id !== "") {
        cacheEntry.workPackageId = String(chat.work_package_id);
      }
      waWpChatStatusCache[String(chat.id)] = cacheEntry;
      paintWpAvatarElement(avatar, wpColor, { card: card });
    }
    var cachedAvatarColor = getCachedWpStatusColor(chat.id);
    if (cachedAvatarColor) {
      paintWpAvatarElement(avatar, cachedAvatarColor, { card: card });
    }
      var actions = document.createElement("div");
      actions.className = "wa-chat-actions";
      var edit = document.createElement("button");
      edit.className = "wa-chat-edit";
      edit.type = "button";
      edit.setAttribute("title", "Editar");
      edit.setAttribute("data-wa-chat-edit-toggle", "true");
      edit.textContent = "\u270E";
      var iaBtn = document.createElement("button");
      iaBtn.className = "wa-chat-action wa-chat-action-ia";
      iaBtn.type = "button";
      iaBtn.setAttribute("title", "IA");
      iaBtn.setAttribute("data-wa-chat-ia", "true");
      iaBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-robot" viewBox="0 0 16 16">' +
        '<path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5M3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.6 26.6 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.93.93 0 0 1-.765.935c-.845.147-2.34.346-4.235.346s-3.39-.2-4.235-.346A.93.93 0 0 1 3 9.219zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a25 25 0 0 1-1.871-.183.25 25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25 25 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135"></path>' +
        '<path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2zM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5"></path>' +
        "</svg>";
      var fav = document.createElement("button");
      fav.className = "wa-chat-favorite";
      fav.type = "button";
      fav.setAttribute("title", "Favorito");
      fav.setAttribute("data-wa-chat-favorite", "true");
      fav.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-star" viewBox="0 0 16 16">' +
        '<path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"></path>' +
        "</svg>";
      actions.appendChild(edit);
      actions.appendChild(iaBtn);
      actions.appendChild(fav);
      actionsLeft.appendChild(avatar);
      actionsLeft.appendChild(actions);
      actionsRow.appendChild(actionsLeft);
      var actionsRight = document.createElement("div");
      actionsRight.className = "wa-chat-actions-right";
      var time = document.createElement("div");
      time.className = "wa-chat-time";
      time.textContent = chat.time_label || "";
      actionsRight.appendChild(time);
      actionsRow.appendChild(actionsRight);

    var nameRow = document.createElement("div");
    nameRow.className = "wa-chat-row";
    var nameBox = document.createElement("div");
    nameBox.className = "wa-chat-name-box";
    var nameSpan = document.createElement("span");
    nameSpan.className = "wa-chat-title";
    nameSpan.textContent = chat.title || "Chat";
    nameBox.appendChild(nameSpan);
    var tagsWrap = document.createElement("div");
    tagsWrap.className = "wa-chat-tags";
    tagsWrap.setAttribute("data-wa-chat-tags", "true");
    var tagList = Array.isArray(chat.tags) ? chat.tags : [];
    tagsWrap.setAttribute("data-tags", JSON.stringify(tagList));
    renderWaChatTags(tagsWrap, tagList);
    nameBox.appendChild(tagsWrap);
    nameRow.appendChild(nameBox);

    var phoneRow = document.createElement("div");
    phoneRow.className = "wa-chat-row";
    var phoneLabel = document.createElement("div");
    phoneLabel.className = "wa-chat-subtitle";
    phoneLabel.textContent = "Telefono:";
    var phoneValue = document.createElement("div");
    phoneValue.className = "wa-chat-subvalue";
    phoneValue.textContent = chat.phone || (chat.external_id ? "+" + String(chat.external_id).split("@")[0].replace(/^\+/, "") : "--");
    phoneRow.appendChild(phoneLabel);
    phoneRow.appendChild(phoneValue);

    var emailRow = document.createElement("div");
    emailRow.className = "wa-chat-row";
    var emailLabel = document.createElement("div");
    emailLabel.className = "wa-chat-subtitle";
    emailLabel.textContent = "Email:";
    var emailValue = document.createElement("div");
    emailValue.className = "wa-chat-subvalue";
    emailValue.textContent = chat.email || "--";
    emailRow.appendChild(emailLabel);
    emailRow.appendChild(emailValue);

    var previewRow = document.createElement("div");
    previewRow.className = "wa-chat-preview-row";
    var preview = document.createElement("div");
    preview.className = "wa-chat-preview";
    preview.textContent = chat.preview || "Sin mensajes";
    previewRow.appendChild(preview);
    var initialUnreadCount = chat.unread_count ? Number(chat.unread_count) : 0;
    var shouldShowInitialUnread = initialUnreadCount > 0;
    if (window.WAConversationSelector && typeof window.WAConversationSelector.shouldShowUnread === "function") {
      shouldShowInitialUnread = window.WAConversationSelector.shouldShowUnread(chat, initialUnreadCount);
    }
    if (shouldShowInitialUnread) {
      var badge = document.createElement("span");
      badge.className = "wa-unread-badge";
      badge.textContent = String(initialUnreadCount);
      previewRow.appendChild(badge);
    }
    meta.appendChild(actionsRow);
    meta.appendChild(nameRow);
    meta.appendChild(phoneRow);
    meta.appendChild(emailRow);
    meta.appendChild(previewRow);

    link.appendChild(meta);
    card.appendChild(link);
    ensureIaPanel(card);
    logDebug("chat_card.build", {
      id: chat.id,
      title: chat.title,
      favorite: !!chat.favorite,
      unread_count: chat.unread_count || 0
    }, "chat_card");
    return card;
  }

    function updateChatCard(chat, options) {
      options = options || {};
      var moveToTop = options.moveToTop !== false;
      var source = options.source || "unknown";
      var list = document.querySelector(".wa-chat-list");
      if (!chat || chat.id === undefined || chat.id === null) {
        logDebug("chat_card.update.skip", { reason: "missing_id" }, "chat_card");
      return;
    }
    if (!list) {
      logDebug("chat_card.update.skip", { id: chat.id, reason: "list_missing" }, "chat_card");
      return;
    }
    var selector = ".wa-chat-card[data-chat-id='" + chat.id + "']";
    var matches = list.querySelectorAll(selector);
    var card = matches.length ? matches[0] : null;
    logServer("chat_card.update.enter", {
      chat_id: chat.id,
      source: source,
      move_to_top: moveToTop,
      list_count: list.children.length,
      has_card: !!card,
      matches: matches.length
    });
    if (matches.length > 1) {
      for (var i = 1; i < matches.length; i += 1) {
        matches[i].remove();
      }
      logDebug("chat_card.duplicate.remove", { id: chat.id, removed: matches.length - 1 }, "chat_card");
    }
    if (isChatDeleted(chat.id)) {
      if (card) card.remove();
      return;
    }
    if (!card) {
      if (moveToTop) {
        list.insertBefore(buildChatCardNode(chat), list.firstChild);
        bindChatLinks();
        bindFavoriteToggle();
        logServer("chat_card.insert.new", { chat_id: chat.id, move_to_top: true, source: source });
        logDebug("chat_card.insert", { id: chat.id, move_to_top: true }, "chat_card");
      }
      return;
    }
    logDebug("chat_card.update", { id: chat.id, move_to_top: moveToTop }, "chat_card");
    var title = card.querySelector(".wa-chat-title");
    var preview = card.querySelector(".wa-chat-preview");
    var time = card.querySelector(".wa-chat-time");
    var phone = card.querySelector(".wa-chat-subvalue");
    var email = card.querySelectorAll(".wa-chat-subvalue")[1];
    if (chat.external_id !== undefined) {
      if (chat.external_id) {
        card.setAttribute("data-chat-external-id", chat.external_id);
      } else {
        card.removeAttribute("data-chat-external-id");
      }
    }
    if (chat.ia_flow_id !== undefined) {
      card.setAttribute("data-ia-flow-id", chat.ia_flow_id || "");
    }
    if (chat.conversation_status !== undefined) {
      card.setAttribute("data-conversation-status", chat.conversation_status || "started");
    }
    if (title && chat.title !== undefined) {
      var currentTitle = (title.textContent || "").trim();
      if (currentTitle === "" || currentTitle === "Chat") {
        title.textContent = chat.title || "Chat";
      }
    }
    if (preview && chat.preview !== undefined) preview.textContent = chat.preview || "Sin mensajes";
    if (time && chat.time_label !== undefined) time.textContent = chat.time_label || "";
    if (phone && chat.phone !== undefined) {
      var currentPhone = (phone.textContent || "").trim();
      if (currentPhone === "" || currentPhone === "--") {
        phone.textContent = chat.phone || "--";
      }
    }
    if (email && chat.email !== undefined) email.textContent = chat.email || "--";
    var avatar = card.querySelector(".wa-avatar");
    if (chat.wp_status_color !== undefined) {
      if (chat.wp_status_color) {
        var newColor = String(chat.wp_status_color);
        var newCached = waWpChatStatusCache[String(chat.id)] || {};
        newCached.color = newColor;
        if (chat.wp_status_id !== undefined && chat.wp_status_id !== null && chat.wp_status_id !== "") {
          newCached.statusId = String(chat.wp_status_id);
        }
        if (chat.work_package_id !== undefined && chat.work_package_id !== null && chat.work_package_id !== "") {
          newCached.workPackageId = String(chat.work_package_id);
        }
        waWpChatStatusCache[String(chat.id)] = newCached;
        if (avatar) {
          paintWpAvatarElement(avatar, newColor, { card: card });
        }
      } else if (avatar) {
        paintWpAvatarElement(avatar, "", { card: card, useDefault: true });
      }
    }
    if (avatar) {
      var avatarColor = avatar.getAttribute("data-wp-avatar-color") || "";
      if (!avatarColor) {
        var cachedColor = getCachedWpStatusColor(chat.id);
        if (cachedColor) {
          paintWpAvatarElement(avatar, cachedColor, { card: card });
        }
      } else {
        var cachedStatus = waWpChatStatusCache[String(chat.id)] || {};
        if (!cachedStatus.color) {
          cachedStatus.color = avatarColor;
          waWpChatStatusCache[String(chat.id)] = cachedStatus;
        }
      }
    }
    var existingBadge = card.querySelector(".wa-unread-badge");
    var hasUnreadUpdate = chat.unread_count !== undefined;
    if (hasUnreadUpdate) {
      var count = chat.unread_count ? Number(chat.unread_count) : 0;
      var showUnread = count > 0;
      if (window.WAConversationSelector && typeof window.WAConversationSelector.shouldShowUnread === "function") {
        showUnread = window.WAConversationSelector.shouldShowUnread(chat, count);
      }
      if (showUnread) {
        if (!existingBadge) {
          var previewRow = card.querySelector(".wa-chat-preview-row");
          if (previewRow) {
            existingBadge = document.createElement("span");
            existingBadge.className = "wa-unread-badge";
            previewRow.appendChild(existingBadge);
          }
        }
        if (existingBadge) existingBadge.textContent = String(count);
      } else if (existingBadge) {
        existingBadge.remove();
      }
    } else if (chat.conversation_status !== undefined && String(chat.conversation_status) === "ended" && existingBadge) {
      existingBadge.remove();
    }
    if (moveToTop) {
      list.insertBefore(card, list.firstChild);
      logServer("chat_card.update.move_top", { chat_id: chat.id, move_to_top: true, source: source });
    }
    ensureIaPanel(card);
    var panel = card.querySelector("[data-wa-ia-panel]");
    if (panel && panel.classList.contains("is-open")) {
      updateIaPanel(panel, card);
    }
  }
  window.updateChatCard = updateChatCard;

  function fetchChatCard(chatId) {
    if (!chatId) return Promise.resolve(null);
    var url = window.location.pathname + "?chat_id=" + encodeURIComponent(chatId);
    logDebug("chat_card.fetch", { chat_id: chatId }, "chat_card");
    return requestJson(url, { headers: { "Accept": "application/json" } })
      .then(function (payload) {
        var chat = payload && payload.chat ? payload.chat : null;
        logDebug("chat_card.fetch.result", { chat_id: chatId, found: !!chat }, "chat_card");
        return chat;
      })
      .catch(function () { return null; });
  }


  function applyMessageToCard(chatId, message, isActive) {
    if (!chatId || !message) return;
    var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
    if (!card) {
      logDebug("chat_card.message.skip", { chat_id: chatId, reason: "missing_card" }, "chat_card");
      return;
    }

    var preview = card.querySelector(".wa-chat-preview");
    var previewText = "";
    if (preview) {
      if (message.message_type === "image") {
        previewText = message.body ? truncatePreview(message.body) : "Imagen";
      } else if (message.message_type === "video") {
        previewText = message.body ? truncatePreview(message.body) : "Video";
      } else if (message.message_type === "audio") {
        previewText = message.body ? truncatePreview(message.body) : "Nota de voz";
      } else if (message.message_type === "file") {
        previewText = message.body ? truncatePreview(message.body) : "Archivo";
      } else {
        previewText = truncatePreview(message.body || "");
      }
      preview.textContent = previewText || "Sin mensajes";
    }

    if (isActive || message.outgoing) return;

    var existingBadge = card.querySelector(".wa-unread-badge");
    var count = existingBadge ? Number(existingBadge.textContent || "0") : 0;
    count += 1;
    if (!existingBadge) {
      var previewRow = card.querySelector(".wa-chat-preview-row");
      if (previewRow) {
        existingBadge = document.createElement("span");
        existingBadge.className = "wa-unread-badge";
        previewRow.appendChild(existingBadge);
      }
    }
    var cardStatus = card.getAttribute("data-conversation-status") || "started";
    var showUnread = true;
    if (window.WAConversationSelector && typeof window.WAConversationSelector.shouldShowUnread === "function") {
      showUnread = window.WAConversationSelector.shouldShowUnread({ conversation_status: cardStatus }, count);
    }
    if (showUnread && existingBadge) {
      existingBadge.textContent = String(count);
    } else if (!showUnread && existingBadge) {
      existingBadge.remove();
    }
    logDebug("chat_card.message", {
      chat_id: chatId,
      unread_count: count,
      active: !!isActive,
      outgoing: !!message.outgoing
    }, "chat_card");
    return { preview: previewText, unread_count: count, status: "nuevo" };
  }

  function buildWaSearchUrl(searchUrl, q, offset, limit) {
    var url = searchUrl + "?q=" + encodeURIComponent(q || "");
    var activeTab = document.querySelector("[data-wa-filter].is-active");
    var filter = activeTab ? activeTab.getAttribute("data-wa-filter") : "";
    if (filter === "favorites") url += "&filter=favorites";
    if (filter === "unread") url += "&filter=unread";
    var statuses = [];
    document.querySelectorAll("[data-wa-filter-status]:checked").forEach(function (node) {
      statuses.push(node.value);
    });
    if (statuses.length) url += "&statuses=" + encodeURIComponent(statuses.join(","));
    var tags = [];
    document.querySelectorAll("[data-wa-filter-tags] input[type='checkbox']:checked").forEach(function (node) {
      tags.push(node.value);
    });
    if (tags.length) url += "&tags=" + encodeURIComponent(tags.join(","));
    if (offset !== undefined && limit !== undefined) {
      url += "&offset=" + encodeURIComponent(offset);
      url += "&limit=" + encodeURIComponent(limit);
    }
    return { url: url, filter: filter };
  }

  function refreshChatListFromServer(options) {
    options = options || {};
    var input = document.querySelector("[data-wa-chat-search='true']");
    if (!input) return Promise.resolve();
    var searchUrl = input.getAttribute("data-wa-chat-search-url");
    if (!searchUrl) return Promise.resolve();
    if (window.WAChatListRefreshInFlight) return Promise.resolve();

    var q = input.value.trim();
    var target = buildWaSearchUrl(searchUrl, q);
    var list = document.querySelector(".wa-chat-list");
    var activeChatId = document.querySelector("input[name='chat_id']")?.value || "";
    var previousScroll = list ? list.scrollTop : 0;
    if (list && options.clearBeforeLoad) {
      list.innerHTML = "";
      list.dataset.waChatOffset = "0";
      list.dataset.waRenderKey = "";
    }

    window.WAChatListRefreshInFlight = true;
    return requestJson(target.url, { headers: { "Accept": "application/json" } })
      .then(function (payload) {
        var chats = payload && payload.chats ? payload.chats : [];
        renderChatList(chats);
        if (activeChatId) setActiveChat(activeChatId);
        if (list && options.preserveScroll) {
          list.scrollTop = previousScroll;
        }
      })
      .catch(function () {})
      .finally(function () {
        window.WAChatListRefreshInFlight = false;
      });
  }

  function bindChatSearch() {
    var input = document.querySelector("[data-wa-chat-search='true']");
    if (!input || input.dataset.bound === "true") return;
    input.dataset.bound = "true";

    var searchUrl = input.getAttribute("data-wa-chat-search-url");
    if (!searchUrl) return;
    var root = document.querySelector(".wa-shell");
    var projectId = root ? root.getAttribute("data-wa-project-id") : "";
    var filterPanel = document.querySelector("[data-wa-filter-panel]");
    var filterToggle = document.querySelector("[data-wa-filter-toggle]");
    var statusChecks = document.querySelectorAll("[data-wa-filter-status]");
    var tagsWrap = document.querySelector("[data-wa-filter-tags]");
    var saveInput = document.querySelector("[data-wa-filter-name]");
    var saveButton = document.querySelector("[data-wa-filter-save]");
    var savedWrap = document.querySelector("[data-wa-filter-saved]");
    var savedKey = projectId ? "waSavedFilters:" + projectId : "waSavedFilters:default";
    var tagOptions = [];

    function getSelectedValues(nodes) {
      var values = [];
      nodes.forEach(function (node) {
        if (node.checked) values.push(node.value);
      });
      return values;
    }

    function buildSearchUrl(q, offset, limit) {
      return buildWaSearchUrl(searchUrl, q, offset, limit);
    }

    function loadSavedFilters() {
      try {
        var raw = localStorage.getItem(savedKey);
        return raw ? JSON.parse(raw) : [];
      } catch (error) {
        return [];
      }
    }

    function saveFilters(filters) {
      try {
        localStorage.setItem(savedKey, JSON.stringify(filters));
      } catch (error) {
        void error;
      }
    }

    function renderSavedFilters() {
      if (!savedWrap) return;
      savedWrap.innerHTML = "";
      var filters = loadSavedFilters();
      filters.forEach(function (filter) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "wa-filter-chip";
        chip.textContent = filter.name || "Filtro";
        chip.addEventListener("click", function () {
          if (input) input.value = filter.q || "";
          if (statusChecks.length) {
            statusChecks.forEach(function (node) {
              node.checked = (filter.statuses || []).indexOf(node.value) !== -1;
            });
          }
          if (tagsWrap) {
            tagsWrap.querySelectorAll("input[type='checkbox']").forEach(function (node) {
              node.checked = (filter.tags || []).indexOf(node.value) !== -1;
            });
          }
          var tab = document.querySelector("[data-wa-filter='" + (filter.tab || "all") + "']");
          if (tab) {
            document.querySelectorAll("[data-wa-filter]").forEach(function (btn) { btn.classList.remove("is-active"); });
            tab.classList.add("is-active");
          }
          triggerSearch();
        });

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "wa-filter-chip-remove";
        remove.textContent = "×";
        remove.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          var filters = loadSavedFilters().filter(function (item) { return item.id !== filter.id; });
          saveFilters(filters);
          renderSavedFilters();
        });
        chip.appendChild(remove);
        savedWrap.appendChild(chip);
      });
    }

    function triggerSearch() {
      var q = input ? input.value.trim() : "";
      var target = buildSearchUrl(q);
      requestJson(target.url, { headers: { "Accept": "application/json" } })
        .then(function (payload) {
          var chats = payload.chats || [];
          renderChatList(chats);
        })
        .catch(function () {});
    }

    if (filterToggle && filterPanel) {
      filterToggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        filterPanel.classList.toggle("is-hidden");
      });
      document.addEventListener("click", function (event) {
        if (filterPanel.classList.contains("is-hidden")) return;
        if (filterPanel.contains(event.target)) return;
        if (filterToggle.contains(event.target)) return;
        filterPanel.classList.add("is-hidden");
      });
    }

    if (root) {
      try {
        tagOptions = JSON.parse(root.getAttribute("data-wa-tags") || "[]");
      } catch (error) {
        tagOptions = [];
      }
    }

    if (tagsWrap) {
      tagsWrap.innerHTML = "";
      tagOptions.forEach(function (tag) {
        var label = document.createElement("label");
        label.className = "wa-filter-option";
        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(tag.name || "");
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(" " + (tag.name || "")));
        tagsWrap.appendChild(label);
      });
    }

    if (statusChecks.length) {
      statusChecks.forEach(function (node) {
        node.addEventListener("change", function () {
          triggerSearch();
        });
      });
    }

    if (tagsWrap) {
      tagsWrap.addEventListener("change", function () {
        triggerSearch();
      });
    }

    if (saveButton) {
      saveButton.addEventListener("click", function () {
        var name = saveInput ? saveInput.value.trim() : "";
        if (!name) return;
        var filters = loadSavedFilters();
        var next = {
          id: Date.now(),
          name: name,
          q: input ? input.value.trim() : "",
          statuses: getSelectedValues(statusChecks),
          tags: (tagsWrap ? Array.prototype.map.call(tagsWrap.querySelectorAll("input[type='checkbox']:checked"), function (node) { return node.value; }) : []),
          tab: (document.querySelector("[data-wa-filter].is-active") || {}).getAttribute ? document.querySelector("[data-wa-filter].is-active").getAttribute("data-wa-filter") : "all"
        };
        filters.push(next);
        saveFilters(filters);
        if (saveInput) saveInput.value = "";
        renderSavedFilters();
        if (filterPanel) filterPanel.classList.add("is-hidden");
      });
    }

    renderSavedFilters();

    var timer = null;
    input.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var q = input.value.trim();
        var target = buildSearchUrl(q);
        console.log("chat_search", target.url);
        requestJson(target.url, { headers: { "Accept": "application/json" } })
          .then(function (payload) {
            console.log("chat_search result", (payload.chats || []).length);
            var chats = payload.chats || [];
            renderChatList(chats);
          })
          .catch(function () {});
      }, 300);
    });
  }

  function bindChatLoadMore() {
    var button = document.querySelector("[data-wa-chat-load-more='true']");
    var input = document.querySelector("[data-wa-chat-search='true']");
    var list = document.querySelector(".wa-chat-list");
    if (!button || !list || button.dataset.bound === "true") return;
    button.dataset.bound = "true";

    button.addEventListener("click", function () {
      var searchUrl = input ? input.getAttribute("data-wa-chat-search-url") : "";
      if (!searchUrl) return;
      var q = input ? input.value.trim() : "";
      var offset = parseInt(list.dataset.waChatOffset || "0", 10) || 0;
      var limit = parseInt(list.dataset.waChatLimit || "20", 10) || 20;
      var target = buildWaSearchUrl(searchUrl, q, offset, limit);
      requestJson(target.url, { headers: { "Accept": "application/json" } })
        .then(function (payload) {
          var chats = payload.chats || [];
          appendChatList(chats, limit);
        })
        .catch(function () {});
    });
  }

  function bindFavoriteToggle() {
    if (document.body.dataset.waFavoriteBound === "true") return;
    document.body.dataset.waFavoriteBound = "true";
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var favoriteBtn = target && target.closest(".wa-chat-favorite");
      if (!favoriteBtn) return;
      event.preventDefault();
      event.stopPropagation();

      var card = favoriteBtn.closest(".wa-chat-card");
      if (!card) return;

      var chatId = card.getAttribute("data-chat-id");
      var token = document.querySelector("meta[name='csrf-token']");
      var isFavorite = card.classList.contains("is-favorite");
      var url = window.location.pathname + "/chats/" + chatId + "/favorite?favorite=" + (!isFavorite);

      fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function (response) { return response.json(); })
        .then(function (payload) {
          if (payload.favorite) {
            card.classList.add("is-favorite");
          } else {
            card.classList.remove("is-favorite");
          }
        })
        .catch(function () {});
    });
  }

  var WA_TAG_COLORS = [
    "#1e88e5",
    "#e53935",
    "#fdd835",
    "#43a047",
    "#fb8c00",
    "#8e24aa",
    "#111111",
    "#ffffff",
    "#9e9e9e",
    "#ec407a"
  ];
  var waTagStore = {};

  function normalizeWaTagName(name) {
    return String(name || "").trim();
  }

  function waTagKey(name) {
    return normalizeWaTagName(name).toLowerCase();
  }

  function waIsLightColor(color) {
    var value = String(color || "").trim().toLowerCase();
    if (!value) return false;

    var r;
    var g;
    var b;
    function extractRgb(cssColor) {
      var rgbMatch = String(cssColor || "").trim().toLowerCase().match(/^rgba?\(([^)]+)\)$/);
      if (!rgbMatch) return null;
      var parts = rgbMatch[1].split(",").map(function (part) { return parseFloat(part.trim()); });
      if (parts.length < 3) return null;
      if ([parts[0], parts[1], parts[2]].some(function (n) { return isNaN(n); })) return null;
      return parts;
    }

    if (value.indexOf("#") === 0) {
      var hex = value.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map(function (c) { return c + c; }).join("");
      }
      if (hex.length !== 6) return false;
      var intValue = parseInt(hex, 16);
      if (isNaN(intValue)) return false;
      r = (intValue >> 16) & 255;
      g = (intValue >> 8) & 255;
      b = intValue & 255;
    } else {
      var parsed = extractRgb(value);
      if (!parsed) {
        var doc = document;
        if (doc && doc.body) {
          var probe = waIsLightColor.__probeEl;
          if (!probe) {
            probe = doc.createElement("span");
            probe.style.position = "absolute";
            probe.style.visibility = "hidden";
            probe.style.pointerEvents = "none";
            probe.style.width = "0";
            probe.style.height = "0";
            probe.style.overflow = "hidden";
            doc.body.appendChild(probe);
            waIsLightColor.__probeEl = probe;
          }
          probe.style.color = "";
          probe.style.color = value;
          parsed = extractRgb(window.getComputedStyle(probe).color || "");
        }
      }
      if (!parsed) return false;
      r = parsed[0];
      g = parsed[1];
      b = parsed[2];
    }

    var luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance >= 0.6;
  }

  function waColorForName(name) {
    var key = waTagKey(name);
    if (!key) return WA_TAG_COLORS[0];
    var sum = 0;
    for (var i = 0; i < key.length; i += 1) {
      sum += key.charCodeAt(i);
    }
    return WA_TAG_COLORS[sum % WA_TAG_COLORS.length];
  }

  function registerWaTag(tag) {
    if (!tag || !tag.name) return;
    waTagStore[waTagKey(tag.name)] = tag;
    syncWaTagsRoot();
  }

  function removeWaTagFromStore(name) {
    var key = waTagKey(name);
    if (!key) return;
    delete waTagStore[key];
    syncWaTagsRoot();
  }

  function syncWaTagsRoot() {
    var root = document.querySelector(".wa-shell");
    if (!root) return;
    root.setAttribute("data-wa-tags", JSON.stringify(listWaTags()));
  }

  function listWaTags() {
    return Object.keys(waTagStore).map(function (key) {
      return waTagStore[key];
    }).sort(function (left, right) {
      return String(left && left.name || "").localeCompare(String(right && right.name || ""), undefined, { sensitivity: "base" });
    });
  }

  function normalizeWaTagList(tags) {
    var seen = {};
    return Array.isArray(tags) ? tags.map(normalizeWaTagName).filter(function (name) {
      if (!name) return false;
      var key = waTagKey(name);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (name) {
      var meta = waTagStore[waTagKey(name)];
      return meta && meta.name ? meta.name : name;
    }) : [];
  }

  function updateWaTagChipsForName(name, color) {
    var key = waTagKey(name);
    document.querySelectorAll(".wa-tag-chip[data-wa-tag-name='" + key + "']").forEach(function (chip) {
      var dot = chip.querySelector(".wa-tag-dot");
      if (!dot) return;
      dot.style.backgroundColor = color;
      dot.style.color = waIsLightColor(color) ? "#111111" : "#ffffff";
    });
    document.querySelectorAll(".wa-chat-tag-dot[data-tooltip='" + name + "']").forEach(function (dot) {
      dot.style.backgroundColor = color;
      dot.style.color = waIsLightColor(color) ? "#111111" : "#ffffff";
    });
  }

  function persistWaChatTags(chatId, tags) {
    if (!chatId) return;
    var contactProfileRoot = document.querySelector("[data-wa-contact-profile-url]");
    var contactProfileUrl = contactProfileRoot ? contactProfileRoot.getAttribute("data-wa-contact-profile-url") : "";
    if (!contactProfileUrl) return;
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(contactProfileUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({ chat_id: chatId, tags: normalizeWaTagList(tags).join(", ") })
    }).catch(function () {});
  }

  function updateWaTagsEverywhere(oldName, newName) {
    var oldKey = waTagKey(oldName);
    document.querySelectorAll("[data-wa-tags-input]").forEach(function (wrap) {
      var input = wrap.querySelector("#wa-edit-tags");
      var tags = [];
      try {
        tags = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      var updated = normalizeWaTagList(tags.map(function (tag) { return waTagKey(tag) === oldKey ? newName : tag; }));
      wrap.setAttribute("data-tags", JSON.stringify(updated));
      if (input) input.value = "";
      renderWaTagChips(wrap, updated);
      updateWaTagsToggle(wrap, updated);
    });
    document.querySelectorAll("[data-wa-chat-tags]").forEach(function (wrap) {
      var tags = [];
      try {
        tags = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      var updated = normalizeWaTagList(tags.map(function (tag) { return waTagKey(tag) === oldKey ? newName : tag; }));
      wrap.setAttribute("data-tags", JSON.stringify(updated));
      renderWaChatTags(wrap, updated);
    });
  }

  function removeWaTagEverywhere(name) {
    var key = waTagKey(name);
    document.querySelectorAll("[data-wa-tags-input]").forEach(function (wrap) {
      var input = wrap.querySelector("#wa-edit-tags");
      var tags = [];
      try {
        tags = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      var updated = normalizeWaTagList(tags.filter(function (tag) { return waTagKey(tag) !== key; }));
      wrap.setAttribute("data-tags", JSON.stringify(updated));
      if (input) input.value = "";
      renderWaTagChips(wrap, updated);
      updateWaTagsToggle(wrap, updated);
    });
    document.querySelectorAll("[data-wa-chat-tags]").forEach(function (wrap) {
      var tags = [];
      try {
        tags = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      var updated = normalizeWaTagList(tags.filter(function (tag) { return waTagKey(tag) !== key; }));
      wrap.setAttribute("data-tags", JSON.stringify(updated));
      renderWaChatTags(wrap, updated);
    });
  }

  function ensureWaTagOnServer(name, done, color) {
    var root = document.querySelector(".wa-shell");
    var url = root ? root.getAttribute("data-wa-tags-upsert-url") : "";
    if (!url) return done && done(null);
    var token = document.querySelector("meta[name='csrf-token']");
    var requestBody = { name: name };
    if (color) requestBody.color = color;
    fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify(requestBody)
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.tag) {
          registerWaTag(payload.tag);
          if (done) done(payload.tag);
          return;
        }
        if (done) done(null);
      })
      .catch(function () {
        if (done) done(null);
      });
  }

  function updateWaTagColor(tagId, color) {
    var root = document.querySelector(".wa-shell");
    if (!root) return;
    var template = root.getAttribute("data-wa-tags-color-url") || "";
    if (!template) return;
    var url = template.replace("__ID__", tagId);
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({ color: color })
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.tag) {
          registerWaTag(payload.tag);
          updateWaTagChipsForName(payload.tag.name, payload.tag.color);
        }
      })
      .catch(function () {});
  }

  function renameWaTag(tagId, name) {
    var root = document.querySelector(".wa-shell");
    if (!root) return;
    var template = root.getAttribute("data-wa-tags-rename-url") || "";
    if (!template) return;
    var url = template.replace("__ID__", tagId);
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({ name: name })
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.tag) {
          removeWaTagFromStore(payload.old_name || payload.tag.name);
          registerWaTag(payload.tag);
          updateWaTagsEverywhere(payload.old_name || payload.tag.name, payload.tag.name);
        }
      })
      .catch(function () {});
  }

  function deleteWaTag(tagId) {
    var root = document.querySelector(".wa-shell");
    if (!root) return;
    var template = root.getAttribute("data-wa-tags-destroy-url") || "";
    if (!template) return;
    var url = template.replace("__ID__", tagId);
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      }
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.name) {
          removeWaTagFromStore(payload.name);
          removeWaTagEverywhere(payload.name);
          document.querySelectorAll("[data-wa-tags-input]").forEach(function (wrap) {
            var dropdown = wrap.querySelector("[data-wa-tags-dropdown]");
            if (dropdown && !dropdown.classList.contains("is-hidden")) {
              dropdown.classList.add("is-hidden");
            }
          });
        }
      })
      .catch(function () {});
  }

  function initWaTagsStore() {
    var root = document.querySelector(".wa-shell");
    if (!root || root.dataset.waTagsBound === "true") return;
    root.dataset.waTagsBound = "true";
    var raw = root.getAttribute("data-wa-tags");
    if (!raw) return;
    try {
      var list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach(function (tag) {
          registerWaTag(tag);
        });
      }
    } catch (error) {}
  }

  function createWaTagChip(name) {
    var meta = waTagStore[waTagKey(name)] || { name: name, color: waColorForName(name) };
    var chip = document.createElement("span");
    chip.className = "wa-tag-chip";
    chip.setAttribute("data-wa-tag-name", waTagKey(meta.name));
    chip.setAttribute("data-tooltip", meta.name);
    chip.setAttribute("draggable", "true");
    if (meta.id) chip.setAttribute("data-tag-id", meta.id);
    var initials = meta.name
      .split(/\s+/)
      .filter(function (part) { return part; })
      .map(function (part) { return part[0]; })
      .join("")
      .toUpperCase()
      .slice(0, 1);
    if (!initials) initials = meta.name.slice(0, 1).toUpperCase();
    var dot = document.createElement("span");
    dot.className = "wa-tag-dot";
    dot.textContent = initials;
    dot.style.backgroundColor = meta.color || WA_TAG_COLORS[0];
    dot.style.color = waIsLightColor(dot.style.backgroundColor) ? "#111111" : "#ffffff";
    chip.appendChild(dot);
    return chip;
  }

  function renderWaTagChips(wrap, tags) {
    if (!wrap) return;
    var chips = wrap.querySelector("[data-wa-tags-chips]");
    if (!chips) return;
    chips.innerHTML = "";
    normalizeWaTagList(tags).forEach(function (tag) {
      var name = normalizeWaTagName(tag);
      if (!name) return;
      chips.appendChild(createWaTagChip(name));
    });
  }

  function updateWaTagsToggle(wrap, tags) {
    if (!wrap) return;
    var toggle = wrap.querySelector("[data-wa-tags-toggle]");
    if (!toggle) return;
    var list = normalizeWaTagList(tags);
    toggle.textContent = list.length ? "Etiquetas seleccionadas (" + list.length + ")" : "Seleccionar etiquetas";
  }

  function buildWaChatTagDot(name) {
    var meta = waTagStore[waTagKey(name)] || { name: name, color: waColorForName(name) };
    var dot = document.createElement("span");
    dot.className = "wa-chat-tag-dot";
    dot.setAttribute("data-tooltip", meta.name);
    var initials = meta.name
      .split(/\s+/)
      .filter(function (part) { return part; })
      .map(function (part) { return part[0]; })
      .join("")
      .toUpperCase()
      .slice(0, 1);
    if (!initials) initials = meta.name.slice(0, 1).toUpperCase();
    dot.textContent = initials;
    dot.style.backgroundColor = meta.color || WA_TAG_COLORS[0];
    dot.style.color = waIsLightColor(dot.style.backgroundColor) ? "#111111" : "#ffffff";
    return dot;
  }

  function renderWaChatTags(container, tags) {
    if (!container) return;
    container.innerHTML = "";
    var list = normalizeWaTagList(tags);
    list.slice(0, 4).forEach(function (tag) {
      var name = normalizeWaTagName(tag);
      if (!name) return;
      var dot = buildWaChatTagDot(name);
      dot.setAttribute("draggable", "true");
      container.appendChild(dot);
    });
    if (list.length > 4) {
      var more = document.createElement("span");
      more.className = "wa-chat-tag-more";
      more.textContent = "...";
      container.appendChild(more);
    }
  }

  function setWaEditTags(tags) {
    var wrap = document.querySelector("[data-wa-tags-input]");
    var input = document.querySelector("#wa-edit-tags");
    var toggle = wrap ? wrap.querySelector("[data-wa-tags-toggle]") : null;
    if (!wrap) return;
    var list = normalizeWaTagList(tags);
    if (input) input.value = "";
    wrap.setAttribute("data-tags", JSON.stringify(list));
    renderWaTagChips(wrap, list);
    updateWaTagsToggle(wrap, list);
  }

  function bindWaTagsInput() {
    initWaTagsStore();
    var wrap = document.querySelector("[data-wa-tags-input]");
    var input = document.querySelector("#wa-edit-tags");
    var toggle = wrap ? wrap.querySelector("[data-wa-tags-toggle]") : null;
    if (!wrap || wrap.dataset.bound === "true") return;
    wrap.dataset.bound = "true";
    var dropdown = wrap.querySelector("[data-wa-tags-dropdown]");

    function hideDropdown() {
      if (dropdown) dropdown.classList.add("is-hidden");
    }

    function renderDropdown() {
      if (!dropdown) return;
      dropdown.innerHTML = "";
      var options = listWaTags();
      if (!options.length) {
        var empty = document.createElement("div");
        empty.className = "wa-tags-empty";
        empty.textContent = "No hay etiquetas disponibles.";
        dropdown.appendChild(empty);
        return;
      }
      var selected = getCurrentTags();
      options.forEach(function (tag) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "wa-tags-option";
        row.setAttribute("data-tag-name", tag.name);
        var check = document.createElement("span");
        check.className = "wa-tags-option-check";
        if (selected.some(function (item) { return waTagKey(item) === waTagKey(tag.name); })) {
          check.classList.add("is-selected");
          check.textContent = "✓";
        }
        row.appendChild(check);
        var chip = createWaTagChip(tag.name);
        row.appendChild(chip);
        var label = document.createElement("span");
        label.className = "wa-tags-option-label";
        label.textContent = tag.name;
        row.appendChild(label);
        dropdown.appendChild(row);
      });
    }

    function showDropdown() {
      renderDropdown();
      dropdown.classList.remove("is-hidden");
    }

    function parseTags(value) {
      return String(value || "")
        .split(",")
        .map(function (item) { return item.trim(); })
        .filter(function (item) { return item; });
    }

    function getCurrentTags() {
      var current = [];
      try {
        current = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        current = parseTags(input ? input.value : "");
      }
      return normalizeWaTagList(current);
    }

    function applyTags(tags) {
      var list = normalizeWaTagList(tags);
      if (input) input.value = "";
      wrap.setAttribute("data-tags", JSON.stringify(list));
      renderWaTagChips(wrap, list);
      updateWaTagsToggle(wrap, list);
    }

    if (toggle) {
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (dropdown.classList.contains("is-hidden")) {
          showDropdown();
        } else {
          hideDropdown();
        }
      });
    }

    if (dropdown) {
      dropdown.addEventListener("click", function (event) {
        var option = event.target.closest(".wa-tags-option");
        if (!option) return;
        event.preventDefault();
        event.stopPropagation();
        var name = option.getAttribute("data-tag-name");
        if (!name) return;
        var current = getCurrentTags();
        if (current.some(function (tag) { return waTagKey(tag) === waTagKey(name); })) {
          current = current.filter(function (tag) { return waTagKey(tag) !== waTagKey(name); });
        } else {
          current.push(name);
        }
        applyTags(current);
        showDropdown();
      });
    }

    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-wa-tags-input]") === wrap) return;
      hideDropdown();
    });

    applyTags(getCurrentTags());
  }

  function bindWaTagsDrag() {
    if (document.body.dataset.waTagsDragBound === "true") return;
    document.body.dataset.waTagsDragBound = "true";

    document.addEventListener("dragstart", function (event) {
      var chip = event.target.closest(".wa-tag-chip");
      if (!chip) return;
      chip.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", chip.getAttribute("data-wa-tag-name") || "");
    });

    document.addEventListener("dragend", function (event) {
      var chip = event.target.closest(".wa-tag-chip");
      if (chip) chip.classList.remove("is-dragging");
    });

    document.addEventListener("dragover", function (event) {
      var chipsWrap = event.target.closest("[data-wa-tags-chips]");
      if (!chipsWrap) return;
      var dragging = chipsWrap.querySelector(".wa-tag-chip.is-dragging");
      if (!dragging) return;
      event.preventDefault();
      var target = event.target.closest(".wa-tag-chip");
      if (!target || target === dragging) return;
      var rect = target.getBoundingClientRect();
      var before = event.clientX < rect.left + rect.width / 2;
      if (before) {
        chipsWrap.insertBefore(dragging, target);
      } else {
        chipsWrap.insertBefore(dragging, target.nextSibling);
      }
    });

    document.addEventListener("drop", function (event) {
      var chipsWrap = event.target.closest("[data-wa-tags-chips]");
      if (!chipsWrap) return;
      var wrap = chipsWrap.closest("[data-wa-tags-input]");
      if (!wrap) return;
      var input = wrap.querySelector("#wa-edit-tags");
      var tags = Array.prototype.slice.call(chipsWrap.querySelectorAll(".wa-tag-chip")).map(function (chip) {
        var key = chip.getAttribute("data-wa-tag-name") || "";
        var meta = waTagStore[key];
        return meta ? meta.name : key;
      }).filter(function (tag) { return tag; });
      if (input) input.value = "";
      wrap.setAttribute("data-tags", JSON.stringify(tags));
    });
  }

  function bindWaTagsActions() {
    if (document.body.dataset.waTagsActionBound === "true") return;
    document.body.dataset.waTagsActionBound = "true";

    var palette = document.createElement("div");
    palette.className = "wa-tags-palette is-hidden";
    WA_TAG_COLORS.forEach(function (color) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wa-tags-color";
      btn.style.backgroundColor = color;
      btn.setAttribute("data-color", color);
      palette.appendChild(btn);
    });
    document.body.appendChild(palette);

    var menu = document.createElement("div");
    menu.className = "wa-tags-menu is-hidden";
    var root = document.querySelector(".wa-shell");
    var isAdmin = root && root.getAttribute("data-wa-tags-admin") === "true";
    menu.innerHTML =
      '<button type="button" data-action="remove">Quitar del contacto</button>' +
      '<button type="button" data-action="rename">Renombrar</button>' +
      (isAdmin ? '<button type="button" data-action="delete">Eliminar</button>' : '');
    document.body.appendChild(menu);

    var currentTag = null;
    var currentWrap = null;

    function hideOverlays() {
      palette.classList.add("is-hidden");
      menu.classList.add("is-hidden");
      currentTag = null;
      currentWrap = null;
    }

    function openRenameDialog(tag) {
      if (!tag) return;
      var existing = document.querySelector(".wa-tag-rename-backdrop");
      if (existing) existing.remove();
      var existingDialog = document.querySelector(".wa-tag-rename-dialog");
      if (existingDialog) existingDialog.remove();

      var backdrop = document.createElement("div");
      backdrop.className = "wa-tag-rename-backdrop";
      var dialog = document.createElement("div");
      dialog.className = "wa-tag-rename-dialog";
      dialog.innerHTML =
        '<div class="wa-tag-rename-title">Renombrar etiqueta</div>' +
        '<input type="text" class="wa-tag-rename-input" />' +
        '<div class="wa-tag-rename-actions">' +
        '<button type="button" data-action="cancel">Cancelar</button>' +
        '<button type="button" data-action="confirm">Guardar</button>' +
        '</div>';
      document.body.appendChild(backdrop);
      document.body.appendChild(dialog);

      var input = dialog.querySelector(".wa-tag-rename-input");
      if (input) {
        input.value = tag.name || "";
        input.focus();
        try {
          input.setSelectionRange(0, input.value.length);
        } catch (error) {}
      }

      function closeDialog() {
        backdrop.remove();
        dialog.remove();
        document.removeEventListener("keydown", onKeydown);
      }

      function submitRename() {
        var newName = (input ? input.value : "").trim();
        if (!newName || newName === tag.name) {
          closeDialog();
          return;
        }
        updateWaTagsEverywhere(tag.name, newName);
        if (tag.id) {
          renameWaTag(tag.id, newName);
        } else {
          ensureWaTagOnServer(tag.name, function (serverTag) {
            if (serverTag && serverTag.id) {
              renameWaTag(serverTag.id, newName);
            }
          });
        }
        closeDialog();
      }

      function onKeydown(event) {
        if (event.key === "Escape") {
          closeDialog();
        }
      }

      backdrop.addEventListener("click", closeDialog);
      dialog.addEventListener("click", function (event) {
        var action = event.target.getAttribute("data-action");
        if (action === "cancel") {
          closeDialog();
        } else if (action === "confirm") {
          submitRename();
        }
      });
      if (input) {
        input.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            submitRename();
          }
        });
      }
      document.addEventListener("keydown", onKeydown);
    }

    document.addEventListener("click", function (event) {
      if (event.target.closest(".wa-tags-menu") || event.target.closest(".wa-tags-palette")) return;
      hideOverlays();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") hideOverlays();
    });

    document.addEventListener("click", function (event) {
      var chip = event.target.closest(".wa-tag-chip");
      if (!chip) return;
      event.preventDefault();
      event.stopPropagation();
      var name = chip.getAttribute("data-wa-tag-name") || "";
      var meta = waTagStore[name];
      currentTag = meta || { name: name, color: waColorForName(name) };
      currentWrap = chip.closest("[data-wa-tags-input]");
      palette.style.left = event.pageX + "px";
      palette.style.top = event.pageY + "px";
      palette.classList.remove("is-hidden");
    });

    document.addEventListener("contextmenu", function (event) {
      var chip = event.target.closest(".wa-tag-chip");
      if (!chip) return;
      event.preventDefault();
      var name = chip.getAttribute("data-wa-tag-name") || "";
      var meta = waTagStore[name];
      currentTag = meta || { name: name, color: waColorForName(name) };
      currentWrap = chip.closest("[data-wa-tags-input]");
      menu.style.left = event.pageX + "px";
      menu.style.top = event.pageY + "px";
      menu.classList.remove("is-hidden");
    });

    palette.addEventListener("click", function (event) {
      var button = event.target.closest("[data-color]");
      if (!button || !currentTag) return;
      var color = button.getAttribute("data-color");
      if (!color || !currentTag.id) return;
      updateWaTagColor(currentTag.id, color);
      hideOverlays();
    });

    menu.addEventListener("click", function (event) {
      var action = event.target.getAttribute("data-action");
      if (!action || !currentTag) return;
      if (action === "rename") {
        openRenameDialog(currentTag);
      } else if (action === "remove") {
        if (currentWrap) {
          var inputField = currentWrap.querySelector("#wa-edit-tags");
          var tags = [];
          try {
            tags = JSON.parse(currentWrap.getAttribute("data-tags") || "[]");
          } catch (error) {
            tags = [];
          }
          var key = waTagKey(currentTag.name);
          var updated = normalizeWaTagList(tags.filter(function (tag) { return waTagKey(tag) !== key; }));
          currentWrap.setAttribute("data-tags", JSON.stringify(updated));
          if (inputField) inputField.value = updated.join(", ");
          renderWaTagChips(currentWrap, updated);
          updateWaTagsToggle(currentWrap, updated);
          var chatId = document.querySelector("input[name='chat_id']")?.value || "";
          var card = chatId ? document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "'] [data-wa-chat-tags]") : null;
          if (card) {
            card.setAttribute("data-tags", JSON.stringify(updated));
            renderWaChatTags(card, updated);
          }
          persistWaChatTags(chatId, updated);
        }
      } else if (action === "delete") {
        if (currentTag.id) deleteWaTag(currentTag.id);
      }
      hideOverlays();
    });
  }

  function bindWaChatTagsDrag() {
    if (document.body.dataset.waChatTagsDragBound === "true") return;
    document.body.dataset.waChatTagsDragBound = "true";

    document.addEventListener("dragstart", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var dot = target && target.closest ? target.closest(".wa-chat-tag-dot") : null;
      if (!dot) return;
      dot.classList.add("is-dragging");
      document.body.dataset.waChatTagDragging = "true";
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
      event.dataTransfer.setData("text/plain", dot.getAttribute("data-tooltip") || "");
      event.stopPropagation();
    });

    document.addEventListener("dragend", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var dot = target && target.closest ? target.closest(".wa-chat-tag-dot") : null;
      if (dot) dot.classList.remove("is-dragging");
      delete document.body.dataset.waChatTagDragging;
    });

    document.addEventListener("dragover", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var wrap = target && target.closest ? target.closest("[data-wa-chat-tags]") : null;
      if (!wrap) return;
      if (document.body.dataset.waChatTagDragging !== "true") return;
      event.preventDefault();
      var dragging = wrap.querySelector(".wa-chat-tag-dot.is-dragging");
      if (!dragging) return;
      var dropTarget = target && target.closest ? target.closest(".wa-chat-tag-dot") : null;
      if (!dropTarget || dropTarget === dragging) return;
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      var rect = dropTarget.getBoundingClientRect();
      var before = event.clientX < rect.left + rect.width / 2;
      if (before) {
        wrap.insertBefore(dragging, dropTarget);
      } else {
        wrap.insertBefore(dragging, dropTarget.nextSibling);
      }
    });

    document.addEventListener("drop", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var wrap = target && target.closest ? target.closest("[data-wa-chat-tags]") : null;
      if (!wrap) return;
      if (document.body.dataset.waChatTagDragging !== "true") return;
      event.preventDefault();
      var visible = Array.prototype.slice.call(wrap.querySelectorAll(".wa-chat-tag-dot")).map(function (dot) {
        return dot.getAttribute("data-tooltip") || "";
      }).filter(function (tag) { return tag; });
      var full = [];
      try {
        full = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        full = [];
      }
      var remaining = full.filter(function (tag) { return visible.indexOf(tag) === -1; });
      var tags = visible.concat(remaining);
      wrap.setAttribute("data-tags", JSON.stringify(tags));
      var card = wrap.closest(".wa-chat-card");
      var chatId = card ? card.getAttribute("data-chat-id") : "";
      if (chatId) {
        persistWaChatTags(chatId, tags);
      }
      delete document.body.dataset.waChatTagDragging;
    });
  }

  function bindWaChatTagTooltip() {
    if (document.body.dataset.waChatTagTooltipBound === "true") return;
    document.body.dataset.waChatTagTooltipBound = "true";

    var tooltip = document.createElement("div");
    tooltip.className = "wa-chat-tag-tooltip is-hidden";
    var label = document.createElement("div");
    label.className = "wa-chat-tag-tooltip-label";
    tooltip.appendChild(label);
    document.body.appendChild(tooltip);

    var currentTarget = null;

    function hideTooltip() {
      tooltip.classList.add("is-hidden");
      currentTarget = null;
    }

    function showTooltip(target) {
      var text = target.getAttribute("data-tooltip") || "";
      if (!text) return;
      currentTarget = target;
      label.textContent = text;
      tooltip.classList.remove("is-hidden");
      tooltip.classList.remove("is-below");
      var rect = target.getBoundingClientRect();
      var tooltipRect = tooltip.getBoundingClientRect();
      var top = rect.top - tooltipRect.height - 8;
      if (top < 8) {
        top = rect.bottom + 8;
        tooltip.classList.add("is-below");
      }
      var left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      var minLeft = 8;
      var maxLeft = window.innerWidth - tooltipRect.width - 8;
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;
      tooltip.style.top = top + "px";
      tooltip.style.left = left + "px";
    }

    document.addEventListener("mouseover", function (event) {
      var dot = event.target.closest(".wa-chat-tag-dot");
      if (!dot) return;
      showTooltip(dot);
    });

    document.addEventListener("mouseout", function (event) {
      if (!currentTarget) return;
      var toElement = event.relatedTarget;
      if (toElement && (toElement === currentTarget || currentTarget.contains(toElement))) return;
      var stillOver = toElement && (toElement.closest && toElement.closest(".wa-chat-tag-dot") === currentTarget);
      if (!stillOver) hideTooltip();
    });

    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
  }

  function openChatEditPanel(chatId, chatTitle, externalId) {
    var chatEditPanel = document.querySelector("[data-wa-chat-edit-panel]");
    if (window.console && typeof window.console.info === "function") {
      window.console.info("[WA] chat_edit.open", {
        has_panel: !!chatEditPanel,
        chat_id: chatId,
        title: chatTitle,
        external_id: externalId
      });
    }
    if (!chatEditPanel) return;
    if (document.body) {
      document.body.appendChild(chatEditPanel);
    }
    var chatShell = document.querySelector(".wa-chat");
    var rect = chatShell && chatShell.getBoundingClientRect ? chatShell.getBoundingClientRect() : null;
    chatEditPanel.style.position = "fixed";
    if (rect) {
      chatEditPanel.style.top = rect.top + "px";
      chatEditPanel.style.left = rect.left + "px";
      chatEditPanel.style.width = rect.width + "px";
      chatEditPanel.style.height = rect.height + "px";
      chatEditPanel.style.right = "";
      chatEditPanel.style.bottom = "";
    } else {
      chatEditPanel.style.top = "0";
      chatEditPanel.style.right = "0";
      chatEditPanel.style.bottom = "0";
      chatEditPanel.style.left = "0";
      chatEditPanel.style.width = "100vw";
      chatEditPanel.style.height = "100vh";
    }
    chatEditPanel.style.minWidth = "0";
    chatEditPanel.style.minHeight = "0";
    chatEditPanel.style.boxSizing = "border-box";
    chatEditPanel.style.zIndex = "2000";
    chatEditPanel.style.display = "flex";
    chatEditPanel.style.opacity = "1";
    chatEditPanel.style.visibility = "visible";
    chatEditPanel.style.pointerEvents = "auto";

    chatEditPanel.classList.remove("is-hidden");
    chatEditPanel.classList.add("is-open");
    if (window.console && typeof window.console.info === "function") {
      var panelStyles = window.getComputedStyle ? window.getComputedStyle(chatEditPanel) : null;
      var panelRect = chatEditPanel.getBoundingClientRect ? chatEditPanel.getBoundingClientRect() : null;
      var cardNode = chatEditPanel.querySelector(".wa-chat-edit-card");
      var cardRect = cardNode && cardNode.getBoundingClientRect ? cardNode.getBoundingClientRect() : null;
      window.console.info("[WA] chat_edit.panel_state", {
        hidden: chatEditPanel.classList.contains("is-hidden"),
        display: panelStyles ? panelStyles.display : null,
        visibility: panelStyles ? panelStyles.visibility : null,
        opacity: panelStyles ? panelStyles.opacity : null,
        zIndex: panelStyles ? panelStyles.zIndex : null,
        panelRect: panelRect ? { x: panelRect.x, y: panelRect.y, w: panelRect.width, h: panelRect.height } : null,
        cardRect: cardRect ? { x: cardRect.x, y: cardRect.y, w: cardRect.width, h: cardRect.height } : null
      });
    }
    window.requestAnimationFrame(function () {
      if (!window.console || typeof window.console.info !== "function") return;
      window.console.info("[WA] chat_edit.panel_size", {
        offsetW: chatEditPanel.offsetWidth,
        offsetH: chatEditPanel.offsetHeight
      });
    });

    if (externalId) {
      var chatIdLabels = document.querySelectorAll("[data-wa-chat-id]");
      if (chatIdLabels.length) {
        chatIdLabels.forEach(function (label) {
          label.textContent = "ID: " + externalId;
        });
      }
    }

    var chatEditFirstName = document.querySelector("#wa-edit-first-name");
    var chatEditLastName = document.querySelector("#wa-edit-last-name");
    var chatEditEmail = document.querySelector("#wa-edit-email");
    var chatEditPhone = document.querySelector("#wa-edit-phone");
    var chatEditAddress = document.querySelector("#wa-edit-address");
    var chatEditCity = document.querySelector("#wa-edit-city");
    var chatEditState = document.querySelector("#wa-edit-state");
    var chatEditCountry = document.querySelector("#wa-edit-country");
    var chatEditPostal = document.querySelector("#wa-edit-postal");
    var chatEditCompany = document.querySelector("#wa-edit-company");
    var chatEditJob = document.querySelector("#wa-edit-job");
    var chatEditTags = document.querySelector("#wa-edit-tags");
    var chatEditSource = document.querySelector("#wa-edit-source");
    var chatEditStatus = document.querySelector("#wa-edit-status");
    var chatEditBirthday = document.querySelector("#wa-edit-birthday");
    var chatEditNotes = document.querySelector("#wa-edit-notes");

    if (chatEditTags) {
      setWaEditTags([]);
      chatEditTags.value = "";
    }

    if (chatEditFirstName) chatEditFirstName.value = "";
    if (chatEditLastName) chatEditLastName.value = "";
    if (chatEditEmail) chatEditEmail.value = "";
    if (chatEditPhone) chatEditPhone.value = "";
    if (chatEditAddress) chatEditAddress.value = "";
    if (chatEditCity) chatEditCity.value = "";
    if (chatEditState) chatEditState.value = "";
    if (chatEditCountry) chatEditCountry.value = "";
    if (chatEditPostal) chatEditPostal.value = "";
    if (chatEditCompany) chatEditCompany.value = "";
    if (chatEditJob) chatEditJob.value = "";
    if (chatEditSource) chatEditSource.value = "";
    if (chatEditStatus) chatEditStatus.value = "";
    if (chatEditBirthday) chatEditBirthday.value = "";
    if (chatEditNotes) chatEditNotes.value = "";
    resetCustomFieldValues();

    var contactProfileRoot = document.querySelector("[data-wa-contact-profile-url]");
    var contactProfileUrl = contactProfileRoot ? contactProfileRoot.getAttribute("data-wa-contact-profile-url") : "";
    if (chatId && contactProfileUrl) {
      fetch(contactProfileUrl + "?chat_id=" + encodeURIComponent(chatId), {
        headers: { "Accept": "application/json" }
      })
        .then(function (response) { return response.json(); })
        .then(function (payload) {
          var profile = payload.profile || {};
          if (payload && Array.isArray(payload.tag_map)) {
            payload.tag_map.forEach(function (tag) { registerWaTag(tag); });
          }
          if (chatEditFirstName && profile.first_name) chatEditFirstName.value = profile.first_name;
          if (chatEditLastName && profile.last_name) chatEditLastName.value = profile.last_name;
          if (chatEditEmail && profile.email) chatEditEmail.value = profile.email;
          if (chatEditPhone && profile.phone) chatEditPhone.value = profile.phone;
          if (chatEditAddress && profile.address) chatEditAddress.value = profile.address;
          if (chatEditCity && profile.city) chatEditCity.value = profile.city;
          if (chatEditState && profile.state) chatEditState.value = profile.state;
          if (chatEditCountry && profile.country) chatEditCountry.value = profile.country;
          if (chatEditPostal && profile.postal_code) chatEditPostal.value = profile.postal_code;
          if (chatEditCompany && profile.company) chatEditCompany.value = profile.company;
          if (chatEditJob && profile.job_title) chatEditJob.value = profile.job_title;
          if (chatEditTags && profile.tags) {
            setWaEditTags(profile.tags || []);
            chatEditTags.value = "";
          }
          if (chatEditSource && profile.source) chatEditSource.value = profile.source;
          if (chatEditStatus && profile.status) chatEditStatus.value = profile.status;
          if (chatEditBirthday && profile.birthday) chatEditBirthday.value = profile.birthday;
          if (chatEditNotes && profile.notes) chatEditNotes.value = profile.notes;
          if (profile.custom_fields) applyCustomFieldValues(profile.custom_fields);

          if (profile.first_name) {
            var titleText = truncateTitle(profile.first_name);
            var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
            var titleNode = card ? card.querySelector(".wa-chat-title") : null;
            if (titleNode) titleNode.textContent = titleText;

            var headerTitle = document.querySelector(".wa-chat-header .wa-chat-name");
            if (headerTitle) headerTitle.textContent = titleText;
          }
        })
        .catch(function () {});
    }
  }

  function bindChatEditPanel() {
    if (document.body.dataset.waChatEditBound === "true") return;
    document.body.dataset.waChatEditBound = "true";

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var editBtn = target && target.closest(".wa-chat-edit");
      if (!editBtn) return;
      if (window.console && typeof window.console.info === "function") {
        window.console.info("[WA] chat_edit.click", {
          target: target ? target.tagName : null,
          cls: target ? target.className : null
        });
      }
      logDebug("wa_chat_card.edit.click", {
        chat_id: editBtn.closest(".wa-chat-card") ? editBtn.closest(".wa-chat-card").getAttribute("data-chat-id") : null
      }, "chat_card");
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      var card = editBtn.closest(".wa-chat-card");
      if (!card) return;
      var chatId = card.getAttribute("data-chat-id") || "";
      var externalId = card.getAttribute("data-chat-external-id") || "";
      var titleNode = card.querySelector(".wa-chat-title") || card.querySelector(".wa-chat-name");
      var chatTitle = titleNode ? titleNode.textContent.trim() : "";

      var chatInput = document.querySelector("input[name='chat_id']");
      if (chatInput && chatId) chatInput.value = chatId;

      openChatEditPanel(chatId, chatTitle, externalId);
    }, true);

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var closeBtn = target && target.closest("[data-wa-chat-edit-close='true']");
      if (!closeBtn) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      var chatEditPanel = document.querySelector("[data-wa-chat-edit-panel]");
      if (window.console && typeof window.console.info === "function") {
        window.console.info("[WA] chat_edit.close");
      }
      if (chatEditPanel) {
        chatEditPanel.classList.add("is-hidden");
        chatEditPanel.classList.remove("is-open");
        chatEditPanel.style.display = "none";
        chatEditPanel.style.opacity = "0";
        chatEditPanel.style.visibility = "hidden";
        chatEditPanel.style.pointerEvents = "none";
      }
    });

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var chatEditSave = target && target.closest(".wa-chat-edit-save");
      if (!chatEditSave) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      if (window.console && typeof window.console.info === "function") {
        window.console.info("[WA] chat_edit.save.click");
      }

      var chatId = document.querySelector("input[name='chat_id']")?.value || "";
      if (!chatId) return;

      var contactProfileRoot = document.querySelector("[data-wa-contact-profile-url]");
      var contactProfileUrl = contactProfileRoot ? contactProfileRoot.getAttribute("data-wa-contact-profile-url") : "";
      if (!contactProfileUrl) return;

      var chatEditFirstName = document.querySelector("#wa-edit-first-name");
      var chatEditLastName = document.querySelector("#wa-edit-last-name");
      var chatEditEmail = document.querySelector("#wa-edit-email");
      var chatEditPhone = document.querySelector("#wa-edit-phone");
      var chatEditAddress = document.querySelector("#wa-edit-address");
      var chatEditCity = document.querySelector("#wa-edit-city");
      var chatEditState = document.querySelector("#wa-edit-state");
      var chatEditCountry = document.querySelector("#wa-edit-country");
      var chatEditPostal = document.querySelector("#wa-edit-postal");
      var chatEditCompany = document.querySelector("#wa-edit-company");
      var chatEditJob = document.querySelector("#wa-edit-job");
      var chatEditTags = document.querySelector("#wa-edit-tags");
      var chatEditSource = document.querySelector("#wa-edit-source");
      var chatEditStatus = document.querySelector("#wa-edit-status");
      var chatEditBirthday = document.querySelector("#wa-edit-birthday");
      var chatEditNotes = document.querySelector("#wa-edit-notes");

      var token = document.querySelector("meta[name='csrf-token']");
      var tagWrap = document.querySelector("[data-wa-tags-input]");
      var tagList = [];
      if (tagWrap) {
        try {
          tagList = JSON.parse(tagWrap.getAttribute("data-tags") || "[]");
        } catch (error) {
          tagList = [];
        }
      }
      var tagsValue = tagList.length ? tagList.join(", ") : (chatEditTags ? chatEditTags.value.trim() : "");
      var payload = {
        chat_id: chatId,
        first_name: chatEditFirstName ? chatEditFirstName.value.trim() : "",
        last_name: chatEditLastName ? chatEditLastName.value.trim() : "",
        email: chatEditEmail ? chatEditEmail.value.trim() : "",
        phone: chatEditPhone ? chatEditPhone.value.trim() : "",
        address: chatEditAddress ? chatEditAddress.value.trim() : "",
        city: chatEditCity ? chatEditCity.value.trim() : "",
        state: chatEditState ? chatEditState.value.trim() : "",
        country: chatEditCountry ? chatEditCountry.value.trim() : "",
        postal_code: chatEditPostal ? chatEditPostal.value.trim() : "",
        company: chatEditCompany ? chatEditCompany.value.trim() : "",
        job_title: chatEditJob ? chatEditJob.value.trim() : "",
        tags: tagsValue,
        source: chatEditSource ? chatEditSource.value.trim() : "",
        status: chatEditStatus ? chatEditStatus.value.trim() : "",
        birthday: chatEditBirthday ? chatEditBirthday.value.trim() : "",
        notes: chatEditNotes ? chatEditNotes.value.trim() : ""
      };
      payload.custom_fields = collectCustomFieldValues();
      if (window.console && typeof window.console.info === "function") {
        window.console.info("[WA] chat_edit.save.payload", payload);
      }

      fetch(contactProfileUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (window.console && typeof window.console.info === "function") {
            window.console.info("[WA] chat_edit.save.response", { ok: response.ok, status: response.status });
          }
          if (!response.ok) {
            return response.json().then(function (data) {
              throw data;
            });
          }
          return response.json();
        })
        .then(function (data) {
          var titleText = data && data.title ? data.title : payload.first_name;
          if (data && Array.isArray(data.tag_map)) {
            data.tag_map.forEach(function (tag) { registerWaTag(tag); });
          }
          var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
          var titleNode = card ? card.querySelector(".wa-chat-title") : null;
          if (titleNode && titleText) titleNode.textContent = truncateTitle(titleText);

          if (card) {
            var phoneNode = card.querySelector(".wa-chat-row .wa-chat-subvalue");
            var emailNode = card.querySelectorAll(".wa-chat-row .wa-chat-subvalue")[1];
            var tagsNode = card.querySelector("[data-wa-chat-tags]");
            if (phoneNode) {
              phoneNode.textContent = payload.phone || "--";
            }
            if (emailNode) {
              emailNode.textContent = payload.email || "--";
            }
            if (tagsNode) {
              var tags = Array.isArray(data && data.tags) ? normalizeWaTagList(data.tags) : normalizeWaTagList(payload.tags ? payload.tags.split(",") : []);
              tagsNode.setAttribute("data-tags", JSON.stringify(tags));
              renderWaChatTags(tagsNode, tags);
            }
          }

          var headerTitle = document.querySelector(".wa-chat-header .wa-chat-name");
          if (headerTitle && titleText) headerTitle.textContent = titleText;

          var chatEditPanel = document.querySelector("[data-wa-chat-edit-panel]");
          if (chatEditPanel) {
            chatEditPanel.classList.add("is-hidden");
            chatEditPanel.classList.remove("is-open");
            chatEditPanel.style.display = "none";
            chatEditPanel.style.opacity = "0";
            chatEditPanel.style.visibility = "hidden";
            chatEditPanel.style.pointerEvents = "none";
          }
        })
        .catch(function () {});
    });
  }

  function bindWhatsappForm() {
    var form = document.querySelector("[data-whatsapp-form='true']");
    if (!form || form.dataset.bound === "true") return;

    form.dataset.bound = "true";
    initReplyUi(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var textarea = form.querySelector("textarea");
      var chatId = form.querySelector("input[name='chat_id']");
      var body = textarea.value.trim();
      var sendButton = form.querySelector(".wa-send-float");
      var activityMode = form.dataset.activityMode === "true" || form.dataset.activityArmed === "true";
      var activityUrl = form.getAttribute("data-wa-activity-note-url");

      if (activityMode) {
        if (event && typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
        if (!body) return;
        if (!activityUrl) {
          form.dataset.activityMode = "false";
          form.dataset.activityArmed = "false";
          return;
        }
        if (form.dataset.sending === "true") return;
        form.dataset.sending = "true";
        if (sendButton) sendButton.setAttribute("disabled", "disabled");

        clearImagePreview();
        pendingQueue = [];
        pendingImage = null;
        pendingVideo = null;
        pendingAudio = null;
        pendingFile = null;

        var token = document.querySelector("meta[name='csrf-token']");
        requestJson(activityUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
          body: JSON.stringify({
            chat_id: chatId ? chatId.value : null,
            note: body
          })
        })
          .then(function (payload) {
            var messages = document.querySelector(".wa-messages");
            if (!messages) return;
            var bubble = payload && payload.message_type ? buildBubble(payload) : buildActivityBubble(body, payload && payload.created_at ? payload.created_at : "");
            messages.appendChild(bubble);
            messages.scrollTop = messages.scrollHeight;
            textarea.value = "";
            clearReplyPreview();
          })
          .catch(function (error) {
            logDebug("send.activity.error", { message: error && error.message ? error.message : String(error) });
          })
          .finally(function () {
            form.dataset.sending = "false";
            if (sendButton) sendButton.removeAttribute("disabled");
            form.dataset.activityMode = "false";
            form.dataset.activityArmed = "false";
            if (form.dataset.waActivityDefaultAction) {
              form.setAttribute("action", form.dataset.waActivityDefaultAction);
            }
            if (textarea && textarea.dataset.waPlaceholderDefault) {
              textarea.placeholder = textarea.dataset.waPlaceholderDefault;
            }
          });

        return;
      }

      if (pendingImage || pendingVideo || pendingAudio || pendingFile || pendingQueue.length) {
        var items = [];
        if (pendingImage) items.push(pendingImage);
        if (pendingVideo) items.push(pendingVideo);
        if (pendingAudio) items.push(pendingAudio);
        if (pendingFile) items.push(pendingFile);
        if (pendingQueue.length) {
          pendingQueue.forEach(function (media) {
            items.push(media);
          });
        }
        pendingQueue = [];
        clearImagePreview();
        if (textarea) textarea.value = "";
        var replyToValue = getReplyToValue();
        items.forEach(function (media, index) {
          var caption = index === 0 ? body : "";
          if (media.kind === "video") {
            sendPendingVideo(caption, media, replyToValue);
          } else if (media.kind === "audio") {
            sendPendingAudio(caption, media, replyToValue);
          } else if (media.kind === "file") {
            sendPendingFile(caption, media, replyToValue);
          } else {
            sendPendingImage(caption, media, replyToValue);
          }
        });
        clearReplyPreview();
        return;
      }

      if (!body) return;

      if (form.dataset.sending === "true") return;
      form.dataset.sending = "true";
      if (sendButton) sendButton.setAttribute("disabled", "disabled");

      var token = document.querySelector("meta[name='csrf-token']");

      var replyToValue = getReplyToValue();
      var sendPayload = {
        message: { body: body },
        chat_id: chatId ? chatId.value : null,
        reply_to: replyToValue || null
      };
      logDebug("send.text", { chat_id: sendPayload.chat_id, body_len: body.length });

      var sender = window.WAChat && typeof window.WAChat.sendMessage === "function"
        ? window.WAChat.sendMessage
        : function (url, csrf, payload) {
            return requestJson(url, {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf || ""
              },
              body: JSON.stringify(payload)
            });
          };

      sender(form.action, token ? token.content : "", sendPayload)
        .then(function (payload) {
          logDebug("send.text.response", { id: payload.id, type: payload.message_type });
          var messages = document.querySelector(".wa-messages");
          if (!messages) return;

          if (payload.id) {
            var existing = messages.querySelector("[data-message-id='" + payload.id + "']");
            if (existing) {
              textarea.value = "";
              return;
            }
          }

          var bubble = buildBubble(payload);
          if (payload.id) {
            bubble.setAttribute("data-message-id", payload.id);
          }

            messages.appendChild(bubble);
            messages.scrollTop = messages.scrollHeight;
            textarea.value = "";
            clearReplyPreview();
            if (payload.message_type === "image" || payload.message_type === "file") {
              logBubbleLayout("append.send", bubble, payload, messages);
            }
            if (document.body && document.body.dataset.waDebugVisual === "true") {
              logDebug("render.appended", {
                id: payload.id,
                type: payload.message_type,
              container_count: messages.childElementCount,
              last_child: messages.lastElementChild ? messages.lastElementChild.className : ""
            });
          }

          var activeCard = document.querySelector(".wa-chat-card.is-active");
          if (activeCard) {
            var preview = activeCard.querySelector(".wa-chat-preview");
            var time = activeCard.querySelector(".wa-chat-time");
            if (preview) {
              var previewText = payload.message_type === "image"
                ? (payload.body ? truncatePreview(payload.body) : "Imagen")
                : truncatePreview(payload.body);
              preview.textContent = previewText;
            }
            if (time) time.textContent = payload.created_at;
          }
          updateActiveCardAfterSend(payload, payload.message_type === "image" ? "Imagen" : "");
        })
        .catch(function (error) {
          logDebug("send.text.error", { message: error && error.message ? error.message : String(error) });
        })
        .finally(function () {
          form.dataset.sending = "false";
          if (sendButton) sendButton.removeAttribute("disabled");
        });
    });

    var emojiToggle = form.querySelector("[data-wa-emoji-toggle='true']");
    var emojiPanel = form.querySelector("[data-wa-emoji]");
    var plusToggle = form.querySelector("[data-wa-menu-toggle='true']");
    var plusMenu = form.querySelector("[data-wa-plus-menu]");
    var plusPhoto = form.querySelector("[data-wa-plus-photo='true']");
    var plusFile = form.querySelector("[data-wa-plus-file='true']");
    var plusDoc = form.querySelector("[data-wa-plus-doc='true']");
    var plusDocFile = form.querySelector("[data-wa-plus-doc-file='true']");
    var plusActivity = form.querySelector("[data-wa-plus-activity='true']");
      var imagePreview = form.querySelector("[data-wa-image-preview]");
      var imagePreviewImg = form.querySelector("[data-wa-image-preview-img]");
      var imagePreviewVideo = form.querySelector("[data-wa-image-preview-video]");
      var filePreview = form.querySelector("[data-wa-file-preview]");
      var imageCancelBtn = form.querySelector("[data-wa-image-cancel='true']");
      var previewStrip = form.querySelector("[data-wa-preview-strip]");
    var lightbox = document.querySelector("[data-wa-image-lightbox]");
    var lightboxImg = document.querySelector("[data-wa-image-lightbox-img]");
      var lightboxVideo = document.querySelector("[data-wa-image-lightbox-video]");
      var lightboxClose = document.querySelector("[data-wa-image-lightbox-close='true']");
      var lightboxDownload = document.querySelector("[data-wa-image-lightbox-download='true']");

      if (imagePreviewImg && !imagePreviewImg.dataset.waDebugBound) {
        imagePreviewImg.dataset.waDebugBound = "true";
        imagePreviewImg.addEventListener("load", function () {
          logDebug("body_chat.preview.image.load", {
            width: imagePreviewImg.naturalWidth,
            height: imagePreviewImg.naturalHeight
          }, "body_chat");
        });
        imagePreviewImg.addEventListener("error", function () {
          logDebug("body_chat.preview.image.error", {}, "body_chat");
        });
      }

      if (imagePreviewVideo && !imagePreviewVideo.dataset.waDebugBound) {
        imagePreviewVideo.dataset.waDebugBound = "true";
        imagePreviewVideo.addEventListener("loadedmetadata", function () {
          logDebug("body_chat.preview.video.meta", {
            width: imagePreviewVideo.videoWidth,
            height: imagePreviewVideo.videoHeight,
            duration: imagePreviewVideo.duration
          }, "body_chat");
        });
        imagePreviewVideo.addEventListener("error", function () {
          logDebug("body_chat.preview.video.error", {}, "body_chat");
        });
      }

      if (lightboxImg && !lightboxImg.dataset.waDebugBound) {
        lightboxImg.dataset.waDebugBound = "true";
        lightboxImg.addEventListener("load", function () {
          logDebug("body_chat.lightbox.image.load", {
            width: lightboxImg.naturalWidth,
            height: lightboxImg.naturalHeight
          }, "body_chat");
        });
        lightboxImg.addEventListener("error", function () {
          logDebug("body_chat.lightbox.image.error", {}, "body_chat");
        });
      }

      if (lightboxVideo && !lightboxVideo.dataset.waDebugBound) {
        lightboxVideo.dataset.waDebugBound = "true";
        lightboxVideo.addEventListener("loadedmetadata", function () {
          logDebug("body_chat.lightbox.video.meta", {
            width: lightboxVideo.videoWidth,
            height: lightboxVideo.videoHeight,
            duration: lightboxVideo.duration
          }, "body_chat");
        });
        lightboxVideo.addEventListener("error", function () {
          logDebug("body_chat.lightbox.video.error", {}, "body_chat");
        });
      }

    if (emojiToggle && emojiPanel) {
      emojiToggle.addEventListener("click", function () {
        emojiPanel.classList.toggle("is-hidden");
      });
    }

    function resetActivityMode() {
      form.dataset.activityMode = "false";
      form.dataset.activityArmed = "false";
      var textarea = form.querySelector("textarea");
      if (textarea && textarea.dataset.waPlaceholderDefault) {
        textarea.placeholder = textarea.dataset.waPlaceholderDefault;
      }
    }

    if (plusDoc && plusDocFile) {
      plusDoc.addEventListener("click", function () {
        resetActivityMode();
        plusDocFile.click();
        closePlusMenu();
      });
    }

    if (plusActivity) {
      plusActivity.addEventListener("click", function () {
        var textarea = form.querySelector("textarea");
        form.dataset.activityMode = "true";
        form.dataset.activityArmed = "true";
        var activityUrl = form.getAttribute("data-wa-activity-note-url");
        if (activityUrl) {
          if (!form.dataset.waActivityDefaultAction) {
            form.dataset.waActivityDefaultAction = form.getAttribute("action") || "";
          }
          form.setAttribute("action", activityUrl);
        }
        if (textarea) {
          if (!textarea.dataset.waPlaceholderDefault) {
            textarea.dataset.waPlaceholderDefault = textarea.placeholder || "";
          }
          textarea.placeholder = "Escribe una actividad...";
          textarea.focus();
        }
        closePlusMenu();
      });
    }

    function createImageThumbnail(dataUrl, maxSize, contentType) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var width = img.naturalWidth || img.width;
          var height = img.naturalHeight || img.height;
          if (!width || !height) {
            resolve(null);
            return;
          }
          var scale = Math.min(1, maxSize / Math.max(width, height));
          if (scale >= 1) {
            resolve(dataUrl);
            return;
          }
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          var ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var outputType = (contentType === "image/png" || contentType === "image/webp" || contentType === "image/jpeg") ? contentType : "image/jpeg";
          var quality = (outputType === "image/jpeg" || outputType === "image/webp") ? 0.8 : undefined;
          try {
            var thumb = quality ? canvas.toDataURL(outputType, quality) : canvas.toDataURL(outputType);
            resolve(thumb);
          } catch (error) {
            resolve(null);
          }
        };
        img.onerror = function () {
          resolve(null);
        };
        img.src = dataUrl;
      });
    }

    function openLightbox(src, type) {
      if (!lightbox) return;
      logDebug("body_chat.lightbox.open", { type: type || "image", src_len: src ? src.length : 0 }, "body_chat");
      var lightboxCard = lightbox.querySelector(".wa-image-lightbox-card");
      if (lightboxCard) {
        var chat = document.querySelector(".wa-chat");
        if (chat && typeof chat.getBoundingClientRect === "function") {
          var rect = chat.getBoundingClientRect();
          if (rect.width && rect.height) {
            lightboxCard.style.width = rect.width + "px";
            lightboxCard.style.height = rect.height + "px";
          }
        }
      }
      if (type === "video") {
        if (lightboxVideo) {
          lightboxVideo.src = src;
          lightboxVideo.style.display = "block";
          if (typeof lightboxVideo.load === "function") {
            lightboxVideo.load();
          }
        }
        if (lightboxImg) {
          lightboxImg.removeAttribute("src");
          lightboxImg.style.display = "none";
        }
      } else {
        if (lightboxImg) {
          lightboxImg.src = src;
          lightboxImg.style.display = "block";
        }
        if (lightboxVideo) {
          lightboxVideo.removeAttribute("src");
          lightboxVideo.style.display = "none";
        }
      }
      if (lightboxDownload) {
        lightboxDownload.href = src;
      }
      lightbox.classList.remove("is-hidden");
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.classList.add("is-hidden");
      logDebug("body_chat.lightbox.close", {}, "body_chat");
      if (lightboxImg) {
        lightboxImg.removeAttribute("src");
        lightboxImg.style.display = "none";
      }
      if (lightboxVideo) {
        lightboxVideo.removeAttribute("src");
        lightboxVideo.style.display = "none";
      }
      if (lightboxDownload) lightboxDownload.removeAttribute("href");
    }

    function fetchMedia(id) {
      if (!mediaUrlTemplate) return Promise.resolve(null);
      var url = mediaUrlTemplate.replace("__ID__", encodeURIComponent(id));
      return requestJson(url, { headers: { "Accept": "application/json" } })
        .catch(function () { return null; });
    }

        document.addEventListener("click", function (event) {
          var imgTarget = event.target && event.target.closest("[data-wa-bubble-image='true']");
          if (imgTarget) {
            var fullSrc = imgTarget.getAttribute("data-full-src");
            var remoteSrc = imgTarget.getAttribute("data-remote-src");
            var mediaId = imgTarget.getAttribute("data-media-id");
            logDebug("body_chat.lightbox.click", {
              media_id: mediaId,
              has_full_src: !!fullSrc,
              full_src_len: fullSrc ? fullSrc.length : 0,
              has_remote_src: !!remoteSrc,
              remote_src_len: remoteSrc ? remoteSrc.length : 0
            }, "body_chat");
            if (mediaId) {
              fetchMediaById(mediaId).then(function (payload) {
                logDebug("body_chat.lightbox.media", {
                  media_id: mediaId,
                  has_data_url: !!(payload && payload.data_url),
                  has_download_url: !!(payload && payload.download_url),
                  data_url_len: payload && payload.data_url ? payload.data_url.length : 0,
                  download_url_len: payload && payload.download_url ? payload.download_url.length : 0
                }, "body_chat");
                if (payload && payload.data_url) {
                  var dataUrl = payload.data_url;
                  imgTarget.setAttribute("data-full-src", dataUrl);
                  logDebug("body_chat.lightbox.pick", { source: "data_url", reason: "payload" }, "body_chat");
                  openLightbox(dataUrl, "image");
                  return;
                }
                if (payload && payload.download_url) {
                  imgTarget.setAttribute("data-full-src", payload.download_url);
                  logDebug("body_chat.lightbox.pick", { source: "remote", reason: "download_url" }, "body_chat");
                  openLightbox(payload.download_url, "image");
                  return;
                }
                if (remoteSrc) {
                  logDebug("body_chat.lightbox.pick", { source: "remote", reason: "fallback" }, "body_chat");
                  openLightbox(remoteSrc, "image");
                  return;
                }
                logDebug("body_chat.lightbox.pick", { source: "preview", reason: "fallback" }, "body_chat");
                openLightbox(imgTarget.getAttribute("src"), "image");
              });
              return;
            }
            if (remoteSrc) {
              logDebug("body_chat.lightbox.pick", { source: "remote", reason: "no_media_id" }, "body_chat");
              openLightbox(remoteSrc, "image");
              return;
            }
            openLightbox(fullSrc || imgTarget.getAttribute("src"), "image");
            return;
          }

        var downloadTarget = event.target && event.target.closest(".wa-file-download");
        if (!downloadTarget) {
          var fileBubble = event.target && event.target.closest(".wa-bubble-file");
          if (fileBubble) {
            downloadTarget = fileBubble.querySelector(".wa-file-download");
          }
        }
        if (downloadTarget) {
          event.preventDefault();
          var directUrl = downloadTarget.getAttribute("data-media-url") || downloadTarget.getAttribute("href");
          if (directUrl && directUrl.indexOf("data:") === 0) {
            var directAnchor = document.createElement("a");
            directAnchor.href = directUrl;
            directAnchor.download = downloadTarget.getAttribute("download") || "archivo";
            directAnchor.target = "_blank";
            directAnchor.rel = "noopener";
            document.body.appendChild(directAnchor);
            directAnchor.click();
            document.body.removeChild(directAnchor);
            return;
          }
          var mediaIdDownload = downloadTarget.getAttribute("data-media-id");
          if (!mediaIdDownload) return;
            fetchMediaById(mediaIdDownload).then(function (payload) {
              if (!payload) return;
              var downloadUrl = payload.data_url || payload.download_url;
              if (!downloadUrl) return;
              downloadTarget.setAttribute("data-media-url", downloadUrl);
              var a = document.createElement("a");
              a.href = downloadUrl;
              a.download = payload.filename || "archivo";
              a.target = "_blank";
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            });
      }
    });

    if (lightboxClose) {
      lightboxClose.addEventListener("click", function () {
        closeLightbox();
      });
    }

    document.querySelectorAll("[data-wa-bubble-image='true']").forEach(function (img) {
      var fullSrc = img.getAttribute("data-full-src");
      var thumbSrc = img.getAttribute("data-thumb-src");
      if (thumbSrc) {
        if (img.getAttribute("src") !== thumbSrc) {
          img.setAttribute("src", thumbSrc);
        }
        return;
      }
      var mediaId = img.getAttribute("data-media-id");
      if (!fullSrc && mediaId) {
        fetchMediaById(mediaId).then(function (payload) {
          if (!payload) return;
          if (payload.data_url) {
            img.setAttribute("data-full-src", payload.data_url);
            createImageThumbnail(payload.data_url, 220, "image/jpeg")
              .then(function (thumb) {
                if (thumb) img.setAttribute("src", thumb);
              })
              .catch(function () {});
            return;
          }
          if (payload.download_url) {
            img.setAttribute("data-full-src", payload.download_url);
            img.setAttribute("src", payload.download_url);
          }
        });
        return;
      }
      if (!fullSrc) return;
      if (img.getAttribute("src") && img.getAttribute("src").length > 5000) {
        img.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
      }
      createImageThumbnail(fullSrc, 220, "image/jpeg")
        .then(function (thumb) {
          if (thumb) img.setAttribute("src", thumb);
        })
        .catch(function () {});
    });

    if (lightbox) {
      lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) {
          closeLightbox();
        }
      });
    }

    document.addEventListener("click", function (event) {
      if (!plusMenu || !plusToggle) return;
      var isMenu = event.target.closest("[data-wa-plus-menu]");
      var isToggle = event.target.closest("[data-wa-menu-toggle='true']");
      if (!isMenu && !isToggle) {
        closePlusMenu();
      }
    });

    function closePlusMenu() {
      if (plusMenu) plusMenu.classList.add("is-hidden");
    }

    if (plusToggle && plusMenu) {
      plusToggle.addEventListener("click", function () {
        plusMenu.classList.toggle("is-hidden");
        if (emojiPanel && !emojiPanel.classList.contains("is-hidden")) {
          emojiPanel.classList.add("is-hidden");
        }
      });
    }

    if (plusPhoto && plusFile) {
      plusPhoto.addEventListener("click", function () {
        resetActivityMode();
        plusFile.setAttribute(
          "accept",
          ".xbm,.tif,.tiff,.pjp,.apng,.pjpeg,.jpeg,.jpg,.heif,.ico,.tiff,.webp,.heic,.gif,.svg,.png,.bmp,.avif,.m4v,.mp4,.3gp,.mov,.webm"
        );
        plusFile.click();
        closePlusMenu();
      });
    }

    if (emojiPanel) {
      emojiPanel.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || target.tagName !== "SPAN") return;

        var textarea = form.querySelector("textarea");
        if (!textarea) return;

        textarea.value += target.textContent;
        textarea.focus();
      });
    }

    var textareaField = form.querySelector("textarea");
    if (textareaField && emojiPanel) {
      textareaField.addEventListener("focus", function () {
        if (!emojiPanel.classList.contains("is-hidden")) {
          emojiPanel.classList.add("is-hidden");
        }
      });
    }

    if (textareaField) {
      textareaField.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          form.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      });
      textareaField.addEventListener("paste", function (event) {
        var clipboard = event.clipboardData || window.clipboardData;
        if (!clipboard || !clipboard.items) return;
        var files = [];
        for (var i = 0; i < clipboard.items.length; i += 1) {
          var item = clipboard.items[i];
          if (item && item.kind === "file") {
            var file = item.getAsFile();
            if (file) files.push(file);
          }
        }
        if (files.length) {
          event.preventDefault();
          enqueueMediaFiles(files);
        }
      });
    }

    var typingStartUrl = form.getAttribute("data-wa-typing-start-url");
    var typingStopUrl = form.getAttribute("data-wa-typing-stop-url");
    var typingTimer = null;
    var typingActive = false;

    function sendTypingEvent(url) {
      if (!url) return;
      var chatId = form.querySelector("input[name='chat_id']");
      if (!chatId || !chatId.value) return;
      var token = document.querySelector("meta[name='csrf-token']");
      requestJson(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ chat_id: chatId.value })
      }).catch(function () {});
    }

    function startTyping() {
      if (form.dataset.activityMode === "true") return;
      if (typingActive) return;
      typingActive = true;
      sendTypingEvent(typingStartUrl);
    }

    function scheduleStopTyping() {
      if (form.dataset.activityMode === "true") return;
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(function () {
        typingActive = false;
        sendTypingEvent(typingStopUrl);
      }, 1500);
    }

    if (textareaField) {
      textareaField.addEventListener("input", function () {
        startTyping();
        scheduleStopTyping();
      });

      textareaField.addEventListener("blur", function () {
        typingActive = false;
        sendTypingEvent(typingStopUrl);
      });
    }

    var imageSendUrl = form.getAttribute("data-wa-image-send-url");
    var videoSendUrl = form.getAttribute("data-wa-video-send-url");
    var fileSendUrl = form.getAttribute("data-wa-file-send-url");
    var mediaUrlTemplate = form.getAttribute("data-wa-media-url-template");
    var inputField = form.querySelector(".wa-input-field");
    var messagesArea = document.querySelector(".wa-messages");
    var allowedTypes = [
      "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/gif", "image/webp",
      "image/heic", "image/heif", "image/bmp", "image/tiff", "image/svg+xml", "image/avif",
      "image/x-icon"
    ];
    var pendingImage = null;
    var pendingQueue = [];
    var allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/3gpp", "video/x-m4v"];
    var allowedAudioTypes = ["audio/ogg", "audio/opus", "audio/ogg; codecs=opus"];
    var pendingVideo = null;
    var pendingAudio = null;
    var pendingFile = null;
    var maxMediaSize = 180 * 1024 * 1024;

    function isAllowedImage(file) {
      if (!file) return false;
      if (file.size && file.size > maxMediaSize) return false;
      if (file.type && allowedTypes.includes(file.type)) return true;
      var name = (file.name || "").toLowerCase();
      return (
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".png") ||
        name.endsWith(".gif") ||
        name.endsWith(".webp") ||
        name.endsWith(".heic") ||
        name.endsWith(".heif") ||
        name.endsWith(".bmp") ||
        name.endsWith(".tif") ||
        name.endsWith(".tiff") ||
        name.endsWith(".svg") ||
        name.endsWith(".avif") ||
        name.endsWith(".ico")
      );
    }

    function isAllowedVideo(file) {
      if (!file) return false;
      if (file.size && file.size > maxMediaSize) return false;
      if (file.type && allowedVideoTypes.includes(file.type)) return true;
      var name = (file.name || "").toLowerCase();
      return (
        name.endsWith(".mp4") ||
        name.endsWith(".webm") ||
        name.endsWith(".mov") ||
        name.endsWith(".m4v") ||
        name.endsWith(".3gp")
      );
    }

    function isAllowedAudio(file) {
      if (!file) return false;
      if (file.size && file.size > maxMediaSize) return false;
      if (file.type && allowedAudioTypes.includes(file.type)) return true;
      var name = (file.name || "").toLowerCase();
      return name.endsWith(".ogg") || name.endsWith(".opus");
    }

    function isAllowedFile(file) {
      if (!file) return false;
      if (file.size && file.size > maxMediaSize) return false;
      if (isAllowedImage(file) || isAllowedVideo(file) || isAllowedAudio(file)) return false;
      return true;
    }

    function showMediaPreview(media) {
      if (!media) return;
      if (media.kind === "video") {
        logDebug("body_chat.preview.video", {
          filename: media.filename || "video.mp4",
          size: media.file_size || 0,
          content_type: media.content_type
        }, "body_chat");
        pendingVideo = media;
        pendingImage = null;
        pendingAudio = null;
        pendingFile = null;
        if (imagePreviewVideo) {
          imagePreviewVideo.src = media.data_url;
          imagePreviewVideo.style.display = "block";
          imagePreviewVideo.muted = true;
          imagePreviewVideo.playsInline = true;
          imagePreviewVideo.setAttribute("playsinline", "true");
          imagePreviewVideo.setAttribute("controls", "true");
          if (typeof imagePreviewVideo.load === "function") {
            imagePreviewVideo.load();
          }
        }
        if (imagePreviewImg) {
          imagePreviewImg.removeAttribute("src");
          imagePreviewImg.style.display = "none";
        }
        if (filePreview) {
          filePreview.classList.remove("is-visible");
          filePreview.innerHTML = "";
        }
      } else if (media.kind === "audio") {
        logDebug("body_chat.preview.audio", {
          filename: media.filename || "nota_de_voz.ogg",
          size: media.file_size || 0,
          content_type: media.content_type
        }, "body_chat");
        pendingAudio = media;
        pendingImage = null;
        pendingVideo = null;
        pendingFile = null;
        if (imagePreviewImg) {
          imagePreviewImg.removeAttribute("src");
          imagePreviewImg.style.display = "none";
        }
        if (imagePreviewVideo) {
          imagePreviewVideo.removeAttribute("src");
          imagePreviewVideo.style.display = "none";
        }
        if (filePreview) {
          filePreview.innerHTML = "";
          var audioName = document.createElement("div");
          audioName.className = "wa-file-preview-name";
          audioName.textContent = media.filename || "nota_de_voz.ogg";
          var audioIcon = document.createElement("div");
          audioIcon.className = "wa-file-preview-icon";
          audioIcon.innerHTML = buildFileIcon(fileExtension(media.filename || "OGG"));
          var audioPlayer = document.createElement("audio");
          audioPlayer.className = "wa-bubble-audio-player";
          audioPlayer.controls = true;
          audioPlayer.preload = "none";
          audioPlayer.src = media.data_url;
          filePreview.appendChild(audioIcon);
          filePreview.appendChild(audioName);
          filePreview.appendChild(audioPlayer);
          filePreview.classList.add("is-visible");
        }
      } else if (media.kind === "file") {
        logDebug("body_chat.preview.file", {
          filename: media.filename || "archivo",
          size: media.file_size || 0,
          content_type: media.content_type
        }, "body_chat");
        pendingFile = media;
        pendingImage = null;
        pendingVideo = null;
        pendingAudio = null;
        if (imagePreviewImg) {
          imagePreviewImg.removeAttribute("src");
          imagePreviewImg.style.display = "none";
        }
        if (imagePreviewVideo) {
          imagePreviewVideo.removeAttribute("src");
          imagePreviewVideo.style.display = "none";
        }
        if (filePreview) {
          filePreview.innerHTML = "";
          var fileName = document.createElement("div");
          fileName.className = "wa-file-preview-name";
          fileName.textContent = media.filename || "archivo";
          var fileIcon = document.createElement("div");
          fileIcon.className = "wa-file-preview-icon";
          fileIcon.innerHTML = buildFileIcon(fileExtension(media.filename || "FILE"));
          filePreview.appendChild(fileIcon);
          filePreview.appendChild(fileName);
          filePreview.classList.add("is-visible");
        }
      } else {
        logDebug("body_chat.preview.image", {
          filename: media.filename || "imagen",
          size: media.file_size || 0,
          content_type: media.content_type,
          data_len: media.data_url ? media.data_url.length : 0
        }, "body_chat");
        pendingImage = media;
        pendingVideo = null;
        pendingAudio = null;
        pendingFile = null;
        if (imagePreviewImg) {
          imagePreviewImg.src = media.thumb_data_url || media.data_url;
          imagePreviewImg.style.display = "block";
        }
        if (imagePreviewVideo) {
          imagePreviewVideo.removeAttribute("src");
          imagePreviewVideo.style.display = "none";
        }
        if (filePreview) {
          filePreview.classList.remove("is-visible");
          filePreview.innerHTML = "";
        }
      }
      if (imagePreview) {
        imagePreview.classList.remove("is-hidden");
      }
      if (previewStrip) {
        previewStrip.classList.remove("is-hidden");
        previewStrip.style.display = "flex";
      }
    }

    function renderPreviewStrip() {
      if (!previewStrip) return;
      previewStrip.innerHTML = "";
      previewStrip.style.display = "flex";
      var items = [];
      if (pendingImage) items.push(pendingImage);
      if (pendingVideo) items.push(pendingVideo);
      if (pendingAudio) items.push(pendingAudio);
      if (pendingFile) items.push(pendingFile);
      pendingQueue.forEach(function (media) {
        items.push(media);
      });
      items.forEach(function (media, index) {
        var thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "wa-preview-thumb";
        if (index === 0) thumb.classList.add("is-active");
        if (media.kind === "video") {
          var videoWrap = document.createElement("div");
          videoWrap.className = "wa-preview-file";
          var videoIcon = document.createElement("div");
          videoIcon.className = "wa-preview-file-icon";
          videoIcon.innerHTML = buildFileIcon(fileExtension(media.filename || "MP4"));
          var videoName = document.createElement("div");
          videoName.textContent = media.filename || "video.mp4";
          videoWrap.appendChild(videoIcon);
          videoWrap.appendChild(videoName);
          thumb.appendChild(videoWrap);
        } else if (media.kind === "audio") {
          var audioWrap = document.createElement("div");
          audioWrap.className = "wa-preview-file";
          var audioIcon = document.createElement("div");
          audioIcon.className = "wa-preview-file-icon";
          audioIcon.innerHTML = buildFileIcon(fileExtension(media.filename || "OGG"));
          var audioName = document.createElement("div");
          audioName.textContent = media.filename || "nota_de_voz.ogg";
          audioWrap.appendChild(audioIcon);
          audioWrap.appendChild(audioName);
          thumb.appendChild(audioWrap);
        } else if (media.kind === "file") {
          var fileWrap = document.createElement("div");
          fileWrap.className = "wa-preview-file";
          var fileIcon = document.createElement("div");
          fileIcon.className = "wa-preview-file-icon";
          fileIcon.innerHTML = buildFileIcon(fileExtension(media.filename || "FILE"));
          var fileName = document.createElement("div");
          fileName.textContent = media.filename || "archivo";
          fileWrap.appendChild(fileIcon);
          fileWrap.appendChild(fileName);
          thumb.appendChild(fileWrap);
        } else {
          var img = document.createElement("img");
          img.src = media.thumb_data_url || media.data_url;
          img.alt = media.filename || "Imagen";
          thumb.appendChild(img);
        }

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "wa-preview-remove";
        remove.textContent = "x";
        remove.addEventListener("click", function (event) {
          event.stopPropagation();
          if (index === 0) {
            if (media.kind === "video") {
              pendingVideo = null;
            } else if (media.kind === "audio") {
              pendingAudio = null;
            } else if (media.kind === "file") {
              pendingFile = null;
            } else {
              pendingImage = null;
            }
            if (pendingQueue.length) {
              var next = pendingQueue.shift();
              showMediaPreview(next);
            } else {
              clearImagePreview();
            }
          } else {
            pendingQueue.splice(index - 1, 1);
          }
          renderPreviewStrip();
        });
        thumb.appendChild(remove);

        thumb.addEventListener("click", function () {
          if (index === 0) return;
          var current = pendingImage || pendingVideo || pendingAudio || pendingFile;
          if (current) pendingQueue.unshift(current);
          if (media.kind === "video") {
            pendingVideo = media;
            pendingImage = null;
            pendingAudio = null;
            pendingFile = null;
          } else if (media.kind === "audio") {
            pendingAudio = media;
            pendingImage = null;
            pendingVideo = null;
            pendingFile = null;
          } else if (media.kind === "file") {
            pendingFile = media;
            pendingImage = null;
            pendingVideo = null;
            pendingAudio = null;
          } else {
            pendingImage = media;
            pendingVideo = null;
            pendingAudio = null;
            pendingFile = null;
          }
          pendingQueue.splice(index - 1, 1);
          showMediaPreview(media);
          renderPreviewStrip();
        });

        previewStrip.appendChild(thumb);
      });
    }

    function buildMediaFromFile(file) {
      if (isAllowedImage(file)) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            var media = {
              kind: "image",
              data_url: reader.result,
              filename: file.name,
              content_type: file.type || "image/jpeg",
              file_size: file.size || 0,
              thumb_data_url: null
            };
            createImageThumbnail(media.data_url, 220, media.content_type)
              .then(function (thumb) {
                media.thumb_data_url = thumb || media.data_url;
                resolve(media);
              })
              .catch(function () {
                media.thumb_data_url = media.data_url;
                resolve(media);
              });
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }
      if (isAllowedVideo(file)) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve({
              kind: "video",
              data_url: reader.result,
              filename: file.name,
              content_type: file.type || "video/mp4",
              file_size: file.size || 0
            });
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }
      if (isAllowedAudio(file)) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve({
              kind: "audio",
              data_url: reader.result,
              filename: file.name,
              content_type: file.type || "audio/ogg; codecs=opus",
              file_size: file.size || 0
            });
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }
      if (isAllowedFile(file)) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve({
              kind: "file",
              data_url: reader.result,
              filename: file.name,
              content_type: file.type || "application/octet-stream",
              file_size: file.size || 0
            });
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }
      return Promise.resolve(null);
    }

    function enqueueMediaFiles(files) {
      if (!files || !files.length) return;
      var fileList = Array.prototype.slice.call(files, 0);
      var current = pendingImage || pendingVideo || pendingAudio || pendingFile;
      if (current) {
        pendingQueue.unshift(current);
        pendingImage = null;
        pendingVideo = null;
        pendingAudio = null;
        pendingFile = null;
      }
      Promise.all(fileList.map(buildMediaFromFile))
        .then(function (items) {
          items.forEach(function (media) {
            if (media) pendingQueue.push(media);
          });
          if (pendingQueue.length) {
            var next = pendingQueue.shift();
            showMediaPreview(next);
          }
          renderPreviewStrip();
        })
        .catch(function () {});
    }

    function clearImagePreview() {
      pendingImage = null;
      pendingVideo = null;
      pendingAudio = null;
      pendingFile = null;
      pendingQueue = [];
      if (imagePreviewImg) imagePreviewImg.removeAttribute("src");
      if (imagePreviewImg) imagePreviewImg.style.display = "none";
      if (imagePreviewVideo) {
        imagePreviewVideo.removeAttribute("src");
        imagePreviewVideo.style.display = "none";
      }
      if (filePreview) {
        filePreview.classList.remove("is-visible");
        filePreview.innerHTML = "";
      }
      if (imagePreview) imagePreview.classList.add("is-hidden");
      if (previewStrip) previewStrip.innerHTML = "";
    }

    function sendJsonWithSignal(url, csrf, data, signal) {
      return fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf || ""
        },
        body: JSON.stringify(data),
        signal: signal
      }).then(function (response) {
        if (!response.ok) {
          return response.json().then(function (payload) {
            throw payload;
          });
        }
        return response.json();
      });
    }

    function sendPendingImage(captionText, mediaOverride, replyTo) {
      var media = mediaOverride || pendingImage;
      if (!media || !imageSendUrl) return;
      var chatId = form.querySelector("input[name='chat_id']");
      var token = document.querySelector("meta[name='csrf-token']");
      var sendButton = form.querySelector(".wa-send-float");
      var uploadBubble = null;
      var progressTimer = null;
      var shouldClearPreview = !mediaOverride;
      var payload = {
        chat_id: chatId ? chatId.value : null,
        data_url: media.data_url,
        filename: media.filename,
        content_type: media.content_type,
        file_size: media.file_size || 0,
        thumb_data_url: media.thumb_data_url || media.data_url,
        caption: captionText || "",
        reply_to: replyTo || null
      };
      logDebug("send.image", {
        chat_id: payload.chat_id,
        caption_len: payload.caption.length,
        data_url_len: payload.data_url ? payload.data_url.length : 0
      });
      var optimisticDataUrl = media.thumb_data_url || media.data_url;
      var optimisticFullSrc = media.data_url;
      var optimisticCaption = captionText || "";
      if (shouldClearPreview) {
        clearImagePreview();
      }
      if (textareaField && shouldClearPreview) textareaField.value = "";

      var messages = document.querySelector(".wa-messages");
      if (messages) {
      uploadBubble = buildUploadBubble("image", optimisticDataUrl, optimisticCaption, null, optimisticFullSrc);
      messages.appendChild(uploadBubble);
        messages.scrollTop = messages.scrollHeight;
      }

      if (uploadBubble) {
        uploadBubble.dataset.uploadState = "uploading";
        progressTimer = setInterval(function () {
          if (uploadBubble.dataset.progressActive !== "true") return;
          var current = parseInt(uploadBubble.dataset.progress || "0", 10);
          var next = Math.min(current + 7, 90);
          uploadBubble.dataset.progress = String(next);
          var bar = uploadBubble.querySelector(".wa-upload-bar");
          if (bar) bar.style.width = next + "%";
        }, 400);
      }
      function setUploadState(state) {
        if (!uploadBubble) return;
        uploadBubble.dataset.uploadState = state;
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        if (state === "paused") {
          uploadBubble.classList.add("is-paused");
          uploadBubble.dataset.progressActive = "false";
          if (meta) meta.textContent = "En pausa";
          if (pauseBtn) pauseBtn.textContent = "Reanudar";
        } else {
          uploadBubble.classList.remove("is-paused");
          uploadBubble.dataset.progressActive = "true";
          if (meta) meta.textContent = "Enviando...";
          if (pauseBtn) pauseBtn.textContent = "Pausar";
        }
      }

      function finalizeUpload(payload) {
        if (!uploadBubble || !payload) return;
        uploadBubble.classList.remove("is-uploading");
        uploadBubble.dataset.progressActive = "false";
        uploadBubble.dataset.uploadState = "done";
        if (payload.id) {
          uploadBubble.setAttribute("data-message-id", payload.id);
        }
        if (payload.waha_id) {
          uploadBubble.setAttribute("data-waha-id", payload.waha_id);
        }
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
              if (meta) {
                meta.textContent = payload.sender_label ? (payload.sender_label + " - " + payload.created_at) : payload.created_at;
              }
        var progress = uploadBubble.querySelector(".wa-upload-progress");
        if (progress) progress.remove();
        var bar = uploadBubble.querySelector(".wa-upload-bar");
        if (bar) bar.style.width = "100%";
        var actions = uploadBubble.querySelector(".wa-upload-actions");
        if (actions) actions.remove();
      }

      function startUpload() {
        if (!uploadBubble) return;
        var controller = new AbortController();
        uploadBubble._controller = controller;
        setUploadState("uploading");
        sendJsonWithSignal(imageSendUrl, token ? token.content : "", payload, controller.signal)
          .then(function (payload) {
            if (!payload || uploadBubble.dataset.uploadState === "canceled") return;
            logDebug("send.image.response", { id: payload.id, type: payload.message_type });
            finalizeUpload(payload);
            var activeCard = document.querySelector(".wa-chat-card.is-active");
            if (activeCard) {
              var preview = activeCard.querySelector(".wa-chat-preview");
              var time = activeCard.querySelector(".wa-chat-time");
              if (preview) {
                var previewText = payload.body ? truncatePreview(payload.body) : "Imagen";
                preview.textContent = previewText;
              }
              if (time) time.textContent = payload.created_at;
            }
            updateActiveCardAfterSend(payload, "Imagen");
          if (payload.media_label) {
            var mediaSize = document.querySelector("[data-wa-chat-media-size]");
            if (mediaSize) mediaSize.textContent = formatMediaLabel(payload.media_label, payload.created_at);
          }
          if (payload.total_media_label) {
            var totalSize = document.querySelector("[data-wa-qr-connected-total]");
            if (totalSize) totalSize.textContent = payload.total_media_label;
          }
        })
          .catch(function (error) {
            if (error && error.name === "AbortError") return;
            logDebug("send.image.error", { message: error && error.message ? error.message : String(error) });
            console.error("sendImage error", error);
            if (uploadBubble) {
              uploadBubble.classList.add("is-error");
              uploadBubble.dataset.progressActive = "false";
              uploadBubble.dataset.uploadState = "error";
              var meta = uploadBubble.querySelector(".wa-bubble-meta");
              if (meta) meta.textContent = "Error al enviar";
              var progress = uploadBubble.querySelector(".wa-upload-progress");
              if (progress) progress.remove();
              var actions = uploadBubble.querySelector(".wa-upload-actions");
              if (actions) actions.remove();
            }
            if (progressTimer) clearInterval(progressTimer);
          })
          .finally(function () {
            if (uploadBubble && uploadBubble.dataset.uploadState === "done") {
              if (progressTimer) clearInterval(progressTimer);
            }
            form.dataset.sending = "false";
            if (sendButton) sendButton.removeAttribute("disabled");
          });
      }

      if (uploadBubble) {
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        var cancelBtn = uploadBubble.querySelector("[data-wa-upload-cancel='true']");
        if (pauseBtn) {
          pauseBtn.addEventListener("click", function () {
            if (uploadBubble.dataset.uploadState === "paused") {
              startUpload();
              return;
            }
            uploadBubble.dataset.uploadState = "paused";
            setUploadState("paused");
            if (uploadBubble._controller) uploadBubble._controller.abort();
          });
        }
        if (cancelBtn) {
          cancelBtn.addEventListener("click", function () {
            uploadBubble.dataset.uploadState = "canceled";
            uploadBubble.dataset.progressActive = "false";
            if (uploadBubble._controller) uploadBubble._controller.abort();
            if (progressTimer) clearInterval(progressTimer);
            uploadBubble.remove();
          });
        }
      }

      startUpload();
    }

    function sendPendingVideo(captionText, mediaOverride, replyTo) {
      var media = mediaOverride || pendingVideo;
      if (!media || !videoSendUrl) return;
      console.log("sendPendingVideo", { url: videoSendUrl, size: media.data_url.length });
      var chatId = form.querySelector("input[name='chat_id']");
      var token = document.querySelector("meta[name='csrf-token']");
      var sendButton = form.querySelector(".wa-send-float");
      var uploadBubble = null;
      var progressTimer = null;
      var shouldClearPreview = !mediaOverride;
      var payload = {
        chat_id: chatId ? chatId.value : null,
        data_url: media.data_url,
        filename: media.filename,
        content_type: media.content_type,
        file_size: media.file_size || 0,
        caption: captionText || "",
        reply_to: replyTo || null
      };
      logDebug("send.file", {
        chat_id: payload.chat_id,
        caption_len: payload.caption.length,
        data_url_len: payload.data_url ? payload.data_url.length : 0
      });
      logDebug("send.video", {
        chat_id: payload.chat_id,
        caption_len: payload.caption.length,
        data_url_len: payload.data_url ? payload.data_url.length : 0
      });
      var optimisticDataUrl = media.data_url;
      var optimisticCaption = captionText || "";
      var optimisticFileName = media.filename || "video.mp4";
      if (shouldClearPreview) {
        clearImagePreview();
      }
      if (textareaField && shouldClearPreview) textareaField.value = "";

      var messages = document.querySelector(".wa-messages");
      if (messages) {
        uploadBubble = buildUploadBubble("video", optimisticDataUrl, optimisticCaption, optimisticFileName);
        messages.appendChild(uploadBubble);
        messages.scrollTop = messages.scrollHeight;
      }

      if (uploadBubble) {
        uploadBubble.dataset.uploadState = "uploading";
        progressTimer = setInterval(function () {
          if (uploadBubble.dataset.progressActive !== "true") return;
          var current = parseInt(uploadBubble.dataset.progress || "0", 10);
          var next = Math.min(current + 7, 90);
          uploadBubble.dataset.progress = String(next);
          var bar = uploadBubble.querySelector(".wa-upload-bar");
          if (bar) bar.style.width = next + "%";
        }, 400);
      }
      function setUploadState(state) {
        if (!uploadBubble) return;
        uploadBubble.dataset.uploadState = state;
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        if (state === "paused") {
          uploadBubble.classList.add("is-paused");
          uploadBubble.dataset.progressActive = "false";
          if (meta) meta.textContent = "En pausa";
          if (pauseBtn) pauseBtn.textContent = "Reanudar";
        } else {
          uploadBubble.classList.remove("is-paused");
          uploadBubble.dataset.progressActive = "true";
          if (meta) meta.textContent = "Enviando...";
          if (pauseBtn) pauseBtn.textContent = "Pausar";
        }
      }

      function finalizeUpload(payload) {
        if (!uploadBubble || !payload) return;
        uploadBubble.classList.remove("is-uploading");
        uploadBubble.dataset.progressActive = "false";
        uploadBubble.dataset.uploadState = "done";
        if (payload.id) {
          uploadBubble.setAttribute("data-message-id", payload.id);
        }
        if (payload.waha_id) {
          uploadBubble.setAttribute("data-waha-id", payload.waha_id);
        }
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        if (meta) {
          meta.textContent = payload.sender_label ? (payload.sender_label + " - " + payload.created_at) : payload.created_at;
        }
        var progress = uploadBubble.querySelector(".wa-upload-progress");
        if (progress) progress.remove();
        var bar = uploadBubble.querySelector(".wa-upload-bar");
        if (bar) bar.style.width = "100%";
        var actions = uploadBubble.querySelector(".wa-upload-actions");
        if (actions) actions.remove();
      }

      function startUpload() {
        if (!uploadBubble) return;
        var controller = new AbortController();
        uploadBubble._controller = controller;
        setUploadState("uploading");
        sendJsonWithSignal(videoSendUrl, token ? token.content : "", payload, controller.signal)
          .then(function (payload) {
            if (!payload || uploadBubble.dataset.uploadState === "canceled") return;
            logDebug("send.video.response", { id: payload.id, type: payload.message_type });
            finalizeUpload(payload);
            var activeCard = document.querySelector(".wa-chat-card.is-active");
            if (activeCard) {
              var preview = activeCard.querySelector(".wa-chat-preview");
              var time = activeCard.querySelector(".wa-chat-time");
              if (preview) {
                var previewText = payload.body ? truncatePreview(payload.body) : "Video";
                preview.textContent = previewText;
              }
              if (time) time.textContent = payload.created_at;
            }
            updateActiveCardAfterSend(payload, "Video");
          if (payload.media_label) {
            var mediaSize = document.querySelector("[data-wa-chat-media-size]");
            if (mediaSize) mediaSize.textContent = formatMediaLabel(payload.media_label, payload.created_at);
          }
          if (payload.total_media_label) {
            var totalSize = document.querySelector("[data-wa-qr-connected-total]");
            if (totalSize) totalSize.textContent = payload.total_media_label;
          }
        })
          .catch(function (error) {
            if (error && error.name === "AbortError") return;
            logDebug("send.video.error", { message: error && error.message ? error.message : String(error) });
            console.error("sendVideo error", error);
            if (uploadBubble) {
              uploadBubble.classList.add("is-error");
              uploadBubble.dataset.progressActive = "false";
              uploadBubble.dataset.uploadState = "error";
              var meta = uploadBubble.querySelector(".wa-bubble-meta");
              if (meta) meta.textContent = "Error al enviar";
              var progress = uploadBubble.querySelector(".wa-upload-progress");
              if (progress) progress.remove();
              var actions = uploadBubble.querySelector(".wa-upload-actions");
              if (actions) actions.remove();
            }
            if (progressTimer) clearInterval(progressTimer);
          })
          .finally(function () {
            if (uploadBubble && uploadBubble.dataset.uploadState === "done") {
              if (progressTimer) clearInterval(progressTimer);
            }
            form.dataset.sending = "false";
            if (sendButton) sendButton.removeAttribute("disabled");
          });
      }

      if (uploadBubble) {
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        var cancelBtn = uploadBubble.querySelector("[data-wa-upload-cancel='true']");
        if (pauseBtn) {
          pauseBtn.addEventListener("click", function () {
            if (uploadBubble.dataset.uploadState === "paused") {
              startUpload();
              return;
            }
            uploadBubble.dataset.uploadState = "paused";
            setUploadState("paused");
            if (uploadBubble._controller) uploadBubble._controller.abort();
          });
        }
        if (cancelBtn) {
          cancelBtn.addEventListener("click", function () {
            uploadBubble.dataset.uploadState = "canceled";
            uploadBubble.dataset.progressActive = "false";
            if (uploadBubble._controller) uploadBubble._controller.abort();
            if (progressTimer) clearInterval(progressTimer);
            uploadBubble.remove();
          });
        }
      }

      startUpload();
    }

    function sendPendingFile(captionText, mediaOverride, replyTo) {
      var media = mediaOverride || pendingFile;
      if (!media || !fileSendUrl) return;
      var chatId = form.querySelector("input[name='chat_id']");
      var token = document.querySelector("meta[name='csrf-token']");
      var sendButton = form.querySelector(".wa-send-float");
      var uploadBubble = null;
      var progressTimer = null;
      var shouldClearPreview = !mediaOverride;
      var payload = {
        chat_id: chatId ? chatId.value : null,
        data_url: media.data_url,
        filename: media.filename,
        content_type: media.content_type,
        file_size: media.file_size || 0,
        caption: captionText || "",
        reply_to: replyTo || null
      };
      var optimisticCaption = captionText || "";
      var optimisticFileName = media.filename || "archivo";
      if (shouldClearPreview) {
        clearImagePreview();
      }
      if (textareaField && shouldClearPreview) textareaField.value = "";

      var messages = document.querySelector(".wa-messages");
      if (messages) {
        uploadBubble = buildUploadBubble("file", media.data_url, optimisticCaption, optimisticFileName, media.data_url);
        messages.appendChild(uploadBubble);
        messages.scrollTop = messages.scrollHeight;
      }

      if (uploadBubble) {
        uploadBubble.dataset.uploadState = "uploading";
        progressTimer = setInterval(function () {
          if (uploadBubble.dataset.progressActive !== "true") return;
          var current = parseInt(uploadBubble.dataset.progress || "0", 10);
          var next = Math.min(current + 7, 90);
          uploadBubble.dataset.progress = String(next);
          var bar = uploadBubble.querySelector(".wa-upload-bar");
          if (bar) bar.style.width = next + "%";
        }, 400);
      }

      function setUploadState(state) {
        if (!uploadBubble) return;
        uploadBubble.dataset.uploadState = state;
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        if (state === "paused") {
          uploadBubble.classList.add("is-paused");
          uploadBubble.dataset.progressActive = "false";
          if (meta) meta.textContent = "En pausa";
          if (pauseBtn) pauseBtn.textContent = "Reanudar";
        } else {
          uploadBubble.classList.remove("is-paused");
          uploadBubble.dataset.progressActive = "true";
          if (meta) meta.textContent = "Enviando...";
          if (pauseBtn) pauseBtn.textContent = "Pausar";
        }
      }

      function finalizeUpload(payload) {
        if (!uploadBubble || !payload) return;
        uploadBubble.classList.remove("is-uploading");
        uploadBubble.dataset.progressActive = "false";
        uploadBubble.dataset.uploadState = "done";
        if (payload.id) {
          uploadBubble.setAttribute("data-message-id", payload.id);
        }
        if (payload.waha_id) {
          uploadBubble.setAttribute("data-waha-id", payload.waha_id);
        }
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        if (meta) {
          meta.textContent = payload.sender_label ? (payload.sender_label + " - " + payload.created_at) : payload.created_at;
        }
        var progress = uploadBubble.querySelector(".wa-upload-progress");
        if (progress) progress.remove();
        var bar = uploadBubble.querySelector(".wa-upload-bar");
        if (bar) bar.style.width = "100%";
        var actions = uploadBubble.querySelector(".wa-upload-actions");
        if (actions) actions.remove();
      }

      function startUpload() {
        if (!uploadBubble) return;
        var controller = new AbortController();
        uploadBubble._controller = controller;
        setUploadState("uploading");
        sendJsonWithSignal(fileSendUrl, token ? token.content : "", payload, controller.signal)
          .then(function (payload) {
            if (!payload || uploadBubble.dataset.uploadState === "canceled") return;
            logDebug("send.file.response", { id: payload.id, type: payload.message_type });
            finalizeUpload(payload);
            var activeCard = document.querySelector(".wa-chat-card.is-active");
            if (activeCard) {
              var preview = activeCard.querySelector(".wa-chat-preview");
              var time = activeCard.querySelector(".wa-chat-time");
              if (preview) {
                var previewText = payload.body ? truncatePreview(payload.body) : "Archivo";
                preview.textContent = previewText;
              }
              if (time) time.textContent = payload.created_at;
            }
            updateActiveCardAfterSend(payload, "Archivo");
          if (payload.media_label) {
            var mediaSize = document.querySelector("[data-wa-chat-media-size]");
            if (mediaSize) mediaSize.textContent = formatMediaLabel(payload.media_label, payload.created_at);
          }
            if (payload.total_media_label) {
              var totalSize = document.querySelector("[data-wa-qr-connected-total]");
              if (totalSize) totalSize.textContent = payload.total_media_label;
            }
          })
          .catch(function (error) {
            if (error && error.name === "AbortError") return;
            logDebug("send.file.error", { message: error && error.message ? error.message : String(error) });
            console.error("sendFile error", error);
            if (uploadBubble) {
              uploadBubble.classList.add("is-error");
              uploadBubble.dataset.progressActive = "false";
              uploadBubble.dataset.uploadState = "error";
              var meta = uploadBubble.querySelector(".wa-bubble-meta");
              if (meta) meta.textContent = "Error al enviar";
              var progress = uploadBubble.querySelector(".wa-upload-progress");
              if (progress) progress.remove();
              var actions = uploadBubble.querySelector(".wa-upload-actions");
              if (actions) actions.remove();
            }
            if (progressTimer) clearInterval(progressTimer);
          })
          .finally(function () {
            if (uploadBubble && uploadBubble.dataset.uploadState === "done") {
              if (progressTimer) clearInterval(progressTimer);
            }
            form.dataset.sending = "false";
            if (sendButton) sendButton.removeAttribute("disabled");
          });
      }

      if (uploadBubble) {
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        var cancelBtn = uploadBubble.querySelector("[data-wa-upload-cancel='true']");
        if (pauseBtn) {
          pauseBtn.addEventListener("click", function () {
            if (uploadBubble.dataset.uploadState === "paused") {
              startUpload();
              return;
            }
            uploadBubble.dataset.uploadState = "paused";
            setUploadState("paused");
            if (uploadBubble._controller) uploadBubble._controller.abort();
          });
        }
        if (cancelBtn) {
          cancelBtn.addEventListener("click", function () {
            uploadBubble.dataset.uploadState = "canceled";
            uploadBubble.dataset.progressActive = "false";
            if (uploadBubble._controller) uploadBubble._controller.abort();
            if (progressTimer) clearInterval(progressTimer);
            uploadBubble.remove();
          });
        }
      }

      startUpload();
    }

    function sendPendingAudio(captionText, mediaOverride, replyTo) {
      var media = mediaOverride || pendingAudio;
      if (!media || !fileSendUrl) return;
      var chatId = form.querySelector("input[name='chat_id']");
      var token = document.querySelector("meta[name='csrf-token']");
      var sendButton = form.querySelector(".wa-send-float");
      var uploadBubble = null;
      var progressTimer = null;
      var shouldClearPreview = !mediaOverride;
      var payload = {
        chat_id: chatId ? chatId.value : null,
        data_url: media.data_url,
        filename: media.filename,
        content_type: media.content_type,
        file_size: media.file_size || 0,
        caption: captionText || "",
        reply_to: replyTo || null
      };
      var optimisticCaption = captionText || "";
      var optimisticFileName = media.filename || "nota_de_voz.ogg";
      if (shouldClearPreview) {
        clearImagePreview();
      }
      if (textareaField && shouldClearPreview) textareaField.value = "";

      var messages = document.querySelector(".wa-messages");
      if (messages) {
        uploadBubble = buildUploadBubble("audio", media.data_url, optimisticCaption, optimisticFileName, media.data_url);
        messages.appendChild(uploadBubble);
        messages.scrollTop = messages.scrollHeight;
      }

      if (uploadBubble) {
        uploadBubble.dataset.uploadState = "uploading";
        progressTimer = setInterval(function () {
          if (uploadBubble.dataset.progressActive !== "true") return;
          var current = parseInt(uploadBubble.dataset.progress || "0", 10);
          var next = Math.min(current + 7, 90);
          uploadBubble.dataset.progress = String(next);
          var bar = uploadBubble.querySelector(".wa-upload-bar");
          if (bar) bar.style.width = next + "%";
        }, 400);
      }

      function setUploadState(state) {
        if (!uploadBubble) return;
        uploadBubble.dataset.uploadState = state;
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        if (state === "paused") {
          uploadBubble.classList.add("is-paused");
          uploadBubble.dataset.progressActive = "false";
          if (meta) meta.textContent = "En pausa";
          if (pauseBtn) pauseBtn.textContent = "Reanudar";
        } else {
          uploadBubble.classList.remove("is-paused");
          uploadBubble.dataset.progressActive = "true";
          if (meta) meta.textContent = "Enviando...";
          if (pauseBtn) pauseBtn.textContent = "Pausar";
        }
      }

      function finalizeUpload(payload) {
        if (!uploadBubble || !payload) return;
        uploadBubble.classList.remove("is-uploading");
        uploadBubble.dataset.progressActive = "false";
        uploadBubble.dataset.uploadState = "done";
        if (payload.id) {
          uploadBubble.setAttribute("data-message-id", payload.id);
        }
        if (payload.waha_id) {
          uploadBubble.setAttribute("data-waha-id", payload.waha_id);
        }
        var meta = uploadBubble.querySelector(".wa-bubble-meta");
        if (meta) {
          meta.textContent = payload.sender_label ? (payload.sender_label + " - " + payload.created_at) : payload.created_at;
        }
        var progress = uploadBubble.querySelector(".wa-upload-progress");
        if (progress) progress.remove();
        var bar = uploadBubble.querySelector(".wa-upload-bar");
        if (bar) bar.style.width = "100%";
        var actions = uploadBubble.querySelector(".wa-upload-actions");
        if (actions) actions.remove();
      }

      function startUpload() {
        if (!uploadBubble) return;
        var controller = new AbortController();
        uploadBubble._controller = controller;
        setUploadState("uploading");
        sendJsonWithSignal(fileSendUrl, token ? token.content : "", payload, controller.signal)
          .then(function (payload) {
            if (!payload || uploadBubble.dataset.uploadState === "canceled") return;
            logDebug("send.audio.response", { id: payload.id, type: payload.message_type });
            finalizeUpload(payload);
            var activeCard = document.querySelector(".wa-chat-card.is-active");
            if (activeCard) {
              var preview = activeCard.querySelector(".wa-chat-preview");
              var time = activeCard.querySelector(".wa-chat-time");
              if (preview) {
                var previewText = payload.body ? truncatePreview(payload.body) : "Nota de voz";
                preview.textContent = previewText;
              }
              if (time) time.textContent = payload.created_at;
            }
            updateActiveCardAfterSend(payload, "Nota de voz");
            if (payload.media_label) {
              var mediaSize = document.querySelector("[data-wa-chat-media-size]");
              if (mediaSize) mediaSize.textContent = formatMediaLabel(payload.media_label, payload.created_at);
            }
            if (payload.total_media_label) {
              var totalSize = document.querySelector("[data-wa-qr-connected-total]");
              if (totalSize) totalSize.textContent = payload.total_media_label;
            }
          })
          .catch(function (error) {
            if (error && error.name === "AbortError") return;
            logDebug("send.audio.error", { message: error && error.message ? error.message : String(error) });
            console.error("sendAudio error", error);
            if (uploadBubble) {
              uploadBubble.classList.add("is-error");
              uploadBubble.dataset.progressActive = "false";
              uploadBubble.dataset.uploadState = "error";
              var meta = uploadBubble.querySelector(".wa-bubble-meta");
              if (meta) meta.textContent = "Error al enviar";
              var progress = uploadBubble.querySelector(".wa-upload-progress");
              if (progress) progress.remove();
              var actions = uploadBubble.querySelector(".wa-upload-actions");
              if (actions) actions.remove();
            }
            if (progressTimer) clearInterval(progressTimer);
          })
          .finally(function () {
            if (uploadBubble && uploadBubble.dataset.uploadState === "done") {
              if (progressTimer) clearInterval(progressTimer);
            }
            form.dataset.sending = "false";
            if (sendButton) sendButton.removeAttribute("disabled");
          });
      }

      if (uploadBubble) {
        var pauseBtn = uploadBubble.querySelector("[data-wa-upload-pause='true']");
        var cancelBtn = uploadBubble.querySelector("[data-wa-upload-cancel='true']");
        if (pauseBtn) {
          pauseBtn.addEventListener("click", function () {
            if (uploadBubble.dataset.uploadState === "paused") {
              startUpload();
              return;
            }
            uploadBubble.dataset.uploadState = "paused";
            setUploadState("paused");
            if (uploadBubble._controller) uploadBubble._controller.abort();
          });
        }
        if (cancelBtn) {
          cancelBtn.addEventListener("click", function () {
            uploadBubble.dataset.uploadState = "canceled";
            uploadBubble.dataset.progressActive = "false";
            if (uploadBubble._controller) uploadBubble._controller.abort();
            if (progressTimer) clearInterval(progressTimer);
            uploadBubble.remove();
          });
        }
      }

      startUpload();
    }

      if (plusFile) {
        plusFile.addEventListener("change", function () {
          enqueueMediaFiles(plusFile.files);
          plusFile.value = "";
        });
      }

      if (plusDocFile) {
        plusDocFile.addEventListener("change", function () {
          enqueueMediaFiles(plusDocFile.files);
          plusDocFile.value = "";
        });
      }

    if (imageCancelBtn) {
      imageCancelBtn.addEventListener("click", function () {
        clearImagePreview();
      });
    }
    function bindDropTarget(target) {
      if (!target) return;
      ["dragenter", "dragover"].forEach(function (eventName) {
        target.addEventListener(eventName, function (event) {
          event.preventDefault();
          target.classList.add("is-dragging");
        });
      });

      ["dragleave", "drop"].forEach(function (eventName) {
        target.addEventListener(eventName, function () {
          target.classList.remove("is-dragging");
        });
      });

      target.addEventListener("drop", function (event) {
        event.preventDefault();
        var files = event.dataTransfer ? event.dataTransfer.files : null;
        if (!files || !files.length) return;
        enqueueMediaFiles(files);
      });
    }

    if (imageSendUrl) {
      bindDropTarget(inputField);
      bindDropTarget(messagesArea);
    }

    var settingsRoot = document.querySelector("[data-wa-settings]");
    var settingsToggle = document.querySelector("[data-wa-settings-toggle='true']");
    var settingsPanel = document.querySelector("[data-wa-settings]");
    var settingsClose = document.querySelector("[data-wa-settings-close='true']");
    var newChatToggle = document.querySelector("[data-wa-newchat-toggle='true']");
    var newChatPanel = document.querySelector("[data-wa-newchat-panel]");
    var newChatClose = document.querySelector("[data-wa-newchat-close='true']");
    var newChatCreate = document.querySelector("[data-wa-newchat-create='true']");
    var newChatPhone = document.querySelector("#wa-newchat-phone");
    var newChatStatus = document.querySelector("[data-wa-newchat-status]");
    var alertPanel = document.querySelector("[data-wa-alert]");
    var alertText = document.querySelector("[data-wa-alert-text]");
    var alertClose = document.querySelector("[data-wa-alert-close='true']");
    var chatRoot = settingsRoot || document.querySelector("[data-wa-chat-create-url]");
    var chatCreateUrl = chatRoot ? chatRoot.getAttribute("data-wa-chat-create-url") : "";
    var countryInput = document.querySelector("[data-wa-country-input]");
    var countryList = document.querySelector("[data-wa-country-list]");
    var chatEditPanel = document.querySelector("[data-wa-chat-edit-panel]");
    var chatEditClose = document.querySelector("[data-wa-chat-edit-close='true']");
    var chatEditPhone = document.querySelector("#wa-edit-phone");
    var chatEditFirstName = document.querySelector("#wa-edit-first-name");
    var chatEditLastName = document.querySelector("#wa-edit-last-name");
    var chatEditEmail = document.querySelector("#wa-edit-email");
    var chatEditAddress = document.querySelector("#wa-edit-address");
    var chatEditCity = document.querySelector("#wa-edit-city");
    var chatEditState = document.querySelector("#wa-edit-state");
    var chatEditCountry = document.querySelector("#wa-edit-country");
    var chatEditPostal = document.querySelector("#wa-edit-postal");
    var chatEditCompany = document.querySelector("#wa-edit-company");
    var chatEditJob = document.querySelector("#wa-edit-job");
    var chatEditTags = document.querySelector("#wa-edit-tags");
    var chatEditSource = document.querySelector("#wa-edit-source");
    var chatEditStatus = document.querySelector("#wa-edit-status");
    var chatEditBirthday = document.querySelector("#wa-edit-birthday");
    var chatEditNotes = document.querySelector("#wa-edit-notes");
    var chatEditSave = document.querySelector(".wa-chat-edit-save");
    var contactProfileUrl = settingsRoot ? settingsRoot.getAttribute("data-wa-contact-profile-url") : "";
    var chatEditFirstName = document.querySelector("#wa-edit-first-name");
    var moreToggle = document.querySelector("[data-wa-more-toggle='true']");
    var morePanel = document.querySelector("[data-wa-more]");
    var headerMoreToggle = document.querySelector("[data-wa-header-more-toggle='true']");
    var headerMoreMenu = document.querySelector("[data-wa-header-more-menu]");

    if (settingsToggle && settingsPanel) {
      settingsToggle.addEventListener("click", function () {
        settingsPanel.classList.toggle("is-hidden");
        if (settingsPanel.classList.contains("is-hidden")) {
          stopQrAutoRefresh();
        }
      });
    }

    if (settingsClose && settingsPanel) {
      settingsClose.addEventListener("click", function () {
        settingsPanel.classList.add("is-hidden");
        stopQrAutoRefresh();
      });
    }

    if (newChatToggle && newChatPanel) {
      newChatToggle.addEventListener("click", function () {
        newChatPanel.classList.toggle("is-hidden");
      });
    }

    if (headerMoreToggle && headerMoreMenu) {
      headerMoreToggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        headerMoreMenu.classList.toggle("is-hidden");
      });

      headerMoreMenu.addEventListener("click", function (event) {
        var action = event.target && event.target.closest ? event.target.closest("[data-wa-header-action]") : null;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        headerMoreMenu.classList.add("is-hidden");
        if (settingsPanel) {
          settingsPanel.classList.remove("is-hidden");
        }
        var targetTab = action.getAttribute("data-wa-header-action") || "connections";
        setSettingsTab(targetTab);
        updateSettingsTabInUrl(targetTab);
      });

      document.addEventListener("click", function (event) {
        var insideMenu = event.target.closest("[data-wa-header-more-menu]") || event.target.closest("[data-wa-header-more-toggle='true']");
        if (!insideMenu) {
          headerMoreMenu.classList.add("is-hidden");
        }
      });
    }

    if (newChatClose && newChatPanel) {
      newChatClose.addEventListener("click", function () {
        newChatPanel.classList.add("is-hidden");
      });
    }

    if (alertClose && alertPanel) {
      alertClose.addEventListener("click", function () {
        alertPanel.classList.add("is-hidden");
      });
    }

    var messagesRoot = document.querySelector(".wa-messages");
    if (messagesRoot) {
      bindFloatingDayHeader();
    }
    if (messagesRoot && messagesRoot.dataset.replyBound !== "true") {
      messagesRoot.dataset.replyBound = "true";
      messagesRoot.addEventListener("dblclick", function (event) {
        var bubble = event.target && event.target.closest(".wa-bubble");
        if (!bubble) return;
          var replyId = bubble.getAttribute("data-reply-id") || bubble.getAttribute("data-waha-id");
          if (!replyId) return;
          var label = bubble.getAttribute("data-reply-label") || "";
          showReplyPreview(replyId, label);
        var textarea = document.querySelector(".wa-composer textarea");
        if (textarea) textarea.focus();
      });
        messagesRoot.addEventListener("click", function (event) {
          var target = event.target;
          if (!target) return;
          var actionsBtn = target.closest("[data-wa-bubble-actions='true']");
          if (!actionsBtn) return;
          event.preventDefault();
          event.stopPropagation();
          var bubble = actionsBtn.closest(".wa-bubble");
          if (!bubble) return;
          var menu = bubble.querySelector("[data-wa-bubble-menu='true']");
          if (!menu) {
            menu = document.createElement("div");
            menu.className = "wa-bubble-menu";
            menu.setAttribute("data-wa-bubble-menu", "true");
            if (bubble.classList.contains("is-out")) {
              menu.classList.add("is-out");
            } else {
              menu.classList.add("is-in");
            }
            var replyButton = document.createElement("button");
            replyButton.type = "button";
            replyButton.textContent = "Responder";
            replyButton.addEventListener("click", function () {
              var replyId = bubble.getAttribute("data-reply-id") || bubble.getAttribute("data-waha-id");
              if (!replyId) return;
              var label = bubble.getAttribute("data-reply-label") || "";
              showReplyPreview(replyId, label);
              menu.classList.remove("is-open");
              menu.style.visibility = "";
              var textarea = document.querySelector(".wa-composer textarea");
              if (textarea) textarea.focus();
            });
            menu.appendChild(replyButton);
            bubble.appendChild(menu);
          }
          if (menu.classList.contains("is-open")) {
            menu.classList.remove("is-open");
            menu.style.visibility = "";
          } else {
            closeAllBubbleMenus();
            menu.dataset.anchorWahaId = bubble.getAttribute("data-waha-id") || "";
            menu.dataset.anchorReplyId = bubble.getAttribute("data-reply-id") || "";
            positionBubbleMenu(menu, bubble, actionsBtn);
          }
        });
        document.addEventListener("click", function (event) {
          var openMenus = document.querySelectorAll(".wa-bubble-menu.is-open");
          if (!openMenus.length) return;
          var insideMenu = event.target.closest(".wa-bubble-menu") || event.target.closest("[data-wa-bubble-actions='true']");
          if (insideMenu) return;
          openMenus.forEach(function (menu) {
            menu.classList.remove("is-open");
            menu.style.visibility = "";
          });
        });
        window.addEventListener("resize", repositionOpenBubbleMenu);
        window.addEventListener("scroll", repositionOpenBubbleMenu, true);
      }

    function toggleChatConfirm(show) {
      var overlay = document.querySelector("[data-wa-confirm-overlay]");
      if (!overlay) return;
      if (show) {
        overlay.classList.remove("is-hidden");
      } else {
        overlay.classList.add("is-hidden");
      }
    }

    function deleteChatById(chatId, card) {
      if (!chatId) return;
      var deleteUrl = window.location.pathname + "/messages?chat_id=" + encodeURIComponent(chatId);
      var restore = null;
      if (card && card.parentNode) {
        var parent = card.parentNode;
        var next = card.nextSibling;
        parent.removeChild(card);
        restore = function () {
          if (!parent) return;
          if (next && next.parentNode === parent) {
            parent.insertBefore(card, next);
          } else {
            parent.appendChild(card);
          }
        };
      }
      fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
        }
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (data) {
              throw data;
            });
          }
          return response.json();
          })
          .then(function () {
            var chatBody = document.querySelector("[data-wa-chat-body]");
            var input = document.querySelector("input[name='chat_id']");
            var textarea = document.querySelector(".wa-composer textarea");
            var sendButton = document.querySelector(".wa-send-float");
            if (chatBody) {
              chatBody.classList.add("is-hidden");
              logServer("chat_body.hide", { source: "delete_chat" });
            }
            if (input) input.value = "";
            if (textarea) textarea.setAttribute("disabled", "disabled");
            if (sendButton) sendButton.setAttribute("disabled", "disabled");
            markChatDeleted(chatId);
          })
          .catch(function () {
            if (restore) restore();
          });
    }

    var pendingDeleteChatId = "";
    var pendingDeleteCard = null;

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var deleteBtn = target && target.closest(".wa-chat-delete");
      if (!deleteBtn) return;
      event.preventDefault();
      event.stopPropagation();

      var card = deleteBtn.closest(".wa-chat-card");
      pendingDeleteChatId = card ? card.getAttribute("data-chat-id") : "";
      pendingDeleteCard = card;
      toggleChatConfirm(true);
    }, true);

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var confirmBtn = target && target.closest("[data-wa-confirm]");
      var overlay = target && target.closest("[data-wa-confirm-overlay]");
      if (!confirmBtn && overlay) {
        toggleChatConfirm(false);
        return;
      }
      if (!confirmBtn) return;

      var action = confirmBtn.getAttribute("data-wa-confirm");
      if (action === "no") {
        toggleChatConfirm(false);
        return;
      }
      if (action === "yes") {
        var chatId = pendingDeleteChatId;
        var card = pendingDeleteCard;
        pendingDeleteChatId = "";
        pendingDeleteCard = null;
        toggleChatConfirm(false);
        deleteChatById(chatId, card);
      }
    });

    function hideCountryList() {
      if (countryList) countryList.classList.add("is-hidden");
    }

    function showCountryList() {
      if (countryList) countryList.classList.remove("is-hidden");
    }

    function filterCountries(query) {
      if (!countryList) return;
      var items = countryList.querySelectorAll(".wa-country-item");
      var q = query.toLowerCase();
      items.forEach(function (item) {
        var name = (item.getAttribute("data-name") || "").toLowerCase();
        var code = (item.getAttribute("data-code") || "").toLowerCase();
        var text = item.textContent.toLowerCase();
        var match = name.indexOf(q) !== -1 || code.indexOf(q) !== -1 || text.indexOf(q) !== -1;
        item.style.display = match ? "block" : "none";
      });
    }

    if (countryInput && countryList) {
      function setCountryByIso(iso2) {
        if (!iso2) return false;
        var countries = window.WA_COUNTRIES || [];
        var target = iso2.toUpperCase();
        for (var i = 0; i < countries.length; i += 1) {
          if (countries[i].iso2 === target) {
            var isoLower = countries[i].iso2.toLowerCase();
            var dial = countries[i].dial || "";
            countryInput.value = "";
            countryInput.setAttribute("data-code", dial);
            countryInput.style.backgroundImage = isoLower ? "url('https://flagcdn.com/w40/" + isoLower + ".png')" : "none";
            if (newChatPhone && dial) {
              newChatPhone.value = dial;
            }
            return true;
          }
        }
        return false;
      }

      function applyCountryFromTimeZone(force) {
        if (!timeZoneInput || !countryInput) return;
        if (!force) {
          if (countryInput.getAttribute("data-code")) return;
          if ((countryInput.value || "").trim() !== "") return;
        }
        var tz = timeZoneInput.value.trim();
        if (!tz) return;
        var selected = timeZoneInput.options[timeZoneInput.selectedIndex];
        var iso = selected ? selected.getAttribute("data-country") : "";
        if (!iso) iso = timeZoneCountryMap[tz];
        if (!iso) return;
        setCountryByIso(iso);
      }

      if (timeZoneInput) {
        timeZoneInput.addEventListener("change", function () {
          applyCountryFromTimeZone(true);
        });
        applyCountryFromTimeZone(false);
      }

      function populateCountryList(countries) {
        countryList.innerHTML = "";
        countries.forEach(function (country) {
          var item = document.createElement("button");
          item.type = "button";
          item.className = "wa-country-item";
          item.setAttribute("data-code", country.dial);
          item.setAttribute("data-name", country.name);
          item.setAttribute("data-iso", country.iso2);
          var isoLower = country.iso2.toLowerCase();
          item.innerHTML = "<img src=\"https://flagcdn.com/w40/" + isoLower +
            ".png\" alt=\"" + country.name + "\"> " + country.name;
          countryList.appendChild(item);
        });
      }

      var countries = window.WA_COUNTRIES || [];
      if (countries.length) {
        populateCountryList(countries);
      }
      applyCountryFromTimeZone(false);

      countryInput.setAttribute("data-code", "");

      countryInput.addEventListener("focus", function () {
        showCountryList();
      });

      countryInput.addEventListener("input", function () {
        showCountryList();
        filterCountries(countryInput.value);
        if (countryInput.value.trim() === "") {
          countryInput.style.backgroundImage = "none";
          countryInput.removeAttribute("data-code");
        }
        if (countryInput.value.trim() !== "") {
          countryInput.style.backgroundImage = "none";
        }
      });

      function handleCountrySelect(event) {
        var target = event.target;
        var item = target ? target.closest(".wa-country-item") : null;
        if (!item) return;
        event.preventDefault();
        var img = item.querySelector("img");
        var code = item.getAttribute("data-code") || "";
        countryInput.value = "";
        countryInput.setAttribute("data-code", code);
        countryInput.style.backgroundImage = img ? "url('" + img.getAttribute("src") + "')" : "none";
        if (newChatPhone && code) {
          newChatPhone.value = code;
        }
        if (newChatPhone) newChatPhone.focus();
        hideCountryList();
      }

      countryList.addEventListener("click", handleCountrySelect);
      countryList.addEventListener("mousedown", handleCountrySelect);
      countryList.addEventListener("mouseup", function () {
        hideCountryList();
      });

      document.addEventListener("click", function (event) {
        if (!countryInput.contains(event.target) && !countryList.contains(event.target)) {
          hideCountryList();
        }
      });
    }

    if (newChatCreate && newChatPhone) {
      newChatCreate.addEventListener("click", function () {
        var sessionName = chatRoot ? chatRoot.getAttribute("data-wa-session-name") : "";
        if (!sessionName && nameInput) {
          sessionName = nameInput.value.trim();
        }
        var phoneRaw = newChatPhone.value.trim();
        var code = countryInput ? countryInput.getAttribute("data-code") || "" : "";
        var token = document.querySelector("meta[name='csrf-token']");

        console.log("create_chat click", { session: sessionName, phoneRaw: phoneRaw, code: code });
        if (!sessionName || !chatCreateUrl) {
          console.warn("create_chat missing session or url");
          return;
        }

        var phoneValue = "";
        if (phoneRaw.indexOf("+") === 0) {
          phoneValue = phoneRaw;
        } else if (code || phoneRaw) {
          phoneValue = (code + phoneRaw).replace(/\s+/g, "");
        }

        if (!phoneValue) {
          console.warn("create_chat missing phone");
          return;
        }

        newChatCreate.classList.add("is-loading");
        newChatCreate.setAttribute("disabled", "disabled");
        if (newChatStatus) newChatStatus.textContent = "";

        fetch(chatCreateUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
          body: JSON.stringify({
            session: sessionName,
            phone: phoneValue
          })
        })
          .then(function (response) {
            if (!response.ok) {
              return response.json().then(function (data) {
                throw data;
              });
            }
            return response.json();
          })
          .then(function (payload) {
            console.log("create_chat payload", payload);
            if (payload && payload.chat_id) {
              var target = document.querySelector("[data-chat-id='" + payload.chat_id + "']");
              if (!target && payload.chat) {
                var list = document.querySelector(".wa-chat-list");
                if (list) {
                  var link = buildChatCardNode(payload.chat);
                  list.insertBefore(link, list.firstChild);
                  bindChatLinks();
                  bindFavoriteToggle();
                  target = link;
                }
              }
              if (target && payload.chat && payload.chat.title) {
                var titleNode = target.querySelector(".wa-chat-title");
                if (titleNode) titleNode.textContent = payload.chat.title;
              }
              if (target) target.click();
            }
            if (payload && payload.existing && alertPanel) {
              if (alertText) alertText.textContent = "Este chat ya existe.";
              alertPanel.classList.remove("is-hidden");
              if (newChatStatus) newChatStatus.textContent = "";
            } else if (newChatStatus && payload && payload.message) {
              newChatStatus.textContent = payload.message;
            }
            newChatCreate.classList.remove("is-loading");
            newChatCreate.removeAttribute("disabled");
            if (newChatPanel && !(payload && payload.existing)) {
              newChatPanel.classList.add("is-hidden");
            }
          })
          .catch(function (error) {
            console.error("create_chat error", error);
            if (newChatStatus) newChatStatus.textContent = "No se pudo crear el chat.";
            newChatCreate.classList.remove("is-loading");
            newChatCreate.removeAttribute("disabled");
          });
      });
    }

    var settingsTabs = document.querySelectorAll("[data-wa-settings-tab]");
    var chatTabs = document.querySelectorAll("[data-wa-filter]");
    var chatSearchInput = document.querySelector("[data-wa-chat-search='true']");
    if (chatSearchInput && chatSearchInput.hasAttribute("readonly")) {
      var unlockSearch = function () {
        chatSearchInput.removeAttribute("readonly");
      };
      chatSearchInput.addEventListener("focus", unlockSearch);
      chatSearchInput.addEventListener("pointerdown", unlockSearch);
    }
    function setSettingsTab(target) {
      if (!target) return;
      var panels = document.querySelectorAll("[data-wa-settings-panel]");

      settingsTabs.forEach(function (btn) { btn.classList.remove("is-active"); });

      settingsTabs.forEach(function (btn) {
        if (btn.getAttribute("data-wa-settings-tab") === target) {
          btn.classList.add("is-active");
        }
      });

      panels.forEach(function (panel) {
        if (panel.getAttribute("data-wa-settings-panel") === target) {
          panel.classList.add("is-active");
        } else {
          panel.classList.remove("is-active");
        }
      });

      if (target === "connections-list") {
        var adminContainer = document.querySelector("[data-wa-admin-connections='true']");
        if (adminContainer) {
          bindAdminConnections(adminContainer);
          if (typeof adminContainer.loadConnections === "function") {
            adminContainer.loadConnections();
          }
        }
      } else if (target === "files") {
        var filesContainer = document.querySelector("[data-wa-files-panel='true']");
        if (filesContainer) {
          bindMediaFilesPanel(filesContainer);
          if (typeof filesContainer.loadFiles === "function") {
            filesContainer.loadFiles();
          }
        }
      }
    }

    function getSettingsTabFromLocation() {
      try {
        var params = new URLSearchParams(window.location.search || "");
        var tab = params.get("wa_tab");
        if (tab) return tab;
      } catch (error) {
        void error;
      }
      var hash = (window.location.hash || "").replace("#", "");
      return hash || null;
    }

    function updateSettingsTabInUrl(target) {
      if (!target || !window.history || !window.history.replaceState) return;
      try {
        var url = new URL(window.location.href);
        url.searchParams.set("wa_tab", target);
        window.history.replaceState(null, "", url.toString());
      } catch (error) {
        void error;
      }
    }

    settingsTabs.forEach(function (tab) {
      if (tab.dataset.bound === "true") return;
      tab.dataset.bound = "true";

        tab.addEventListener("click", function () {
          var target = tab.getAttribute("data-wa-settings-tab");
          setSettingsTab(target);
          updateSettingsTabInUrl(target);
        });
      });

    var initialSettingsTab = getSettingsTabFromLocation();
    if (initialSettingsTab) {
      setSettingsTab(initialSettingsTab);
    }

    function restoreSettingsPanel() {
      var keepOpen = null;
      try {
        keepOpen = sessionStorage.getItem("waSettingsOpen");
      } catch (error) {
        void error;
      }
      if (!keepOpen) return;
      if (settingsPanel) settingsPanel.classList.remove("is-hidden");
      setSettingsTab(keepOpen);
      updateSettingsTabInUrl(keepOpen);
      try {
        sessionStorage.removeItem("waSettingsOpen");
      } catch (error) {
        void error;
      }
    }

    restoreSettingsPanel();

    if (chatTabs.length) {
      chatTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          chatTabs.forEach(function (btn) { btn.classList.remove("is-active"); });
          tab.classList.add("is-active");
          if (chatSearchInput) {
            var q = chatSearchInput.value.trim();
            var target = buildWaSearchUrl(chatSearchInput.getAttribute("data-wa-chat-search-url"), q);
            requestJson(target.url, { headers: { "Accept": "application/json" } })
              .then(function (payload) {
                var chats = payload.chats || [];
                if (target.filter === "unread") {
                  chats = chats.filter(function (chat) { return Number(chat.unread_count) > 0; });
                }
                renderChatList(chats);
              })
              .catch(function () {});
          }
        });
      });
    }

    var createButton = document.querySelector("[data-wa-create-session='true']");
    var nameInput = document.querySelector("#wa-session-name");
    var serverInput = document.querySelector("#wa-server-url");
    var realtimeToggle = document.querySelector("[data-wa-realtime-toggle='true']");
    var saveServerButton = document.querySelector("[data-wa-save-server='true']");
    var serverStatus = document.querySelector("[data-wa-server-status]");
    var qrImage = document.querySelector("[data-wa-qr-image]");
    var qrRefreshTimeoutId = null;
    var qrAutoTemplate = null;
    var qrAutoName = null;
    var qrProgress = document.querySelector("[data-wa-qr-progress]");
    var qrHelper = document.querySelector("[data-wa-qr-helper]");
    var qrProgressId = null;
    var statusIntervalId = null;
    var qrBox = document.querySelector(".wa-qr-box");
    var qrConnected = document.querySelector("[data-wa-qr-connected]");
    var qrConnectedLabel = document.querySelector("[data-wa-qr-connected-label]");
    var qrConnectedHeader = document.querySelector("[data-wa-qr-connected-header]");
    var qrConnectedHeaderLabel = document.querySelector("[data-wa-qr-connected-header-label]");
      var newChatFrom = document.querySelector("[data-wa-newchat-from]");
      var adminNameInput = document.querySelector("#wa-admin-name");
      var adminEmailInput = document.querySelector("#wa-admin-email");
      var timeZoneInput = document.querySelector("#wa-time-zone");
      var settingsStatus = document.querySelector("[data-wa-settings-status]");
      var deleteButton = document.querySelector("[data-wa-delete-session='true']");
      var timeZoneCountryMap = {};
      if (timeZoneInput) {
        var tzOptions = timeZoneInput.querySelectorAll("option");
        for (var i = 0; i < tzOptions.length; i += 1) {
          var tzValue = tzOptions[i].value;
          var tzCountry = tzOptions[i].getAttribute("data-country");
          if (tzValue && tzCountry && !timeZoneCountryMap[tzValue]) {
            timeZoneCountryMap[tzValue] = tzCountry;
          }
        }
      }

    function templateUrl(template, name) {
      return template.replace("__SESSION__", encodeURIComponent(name));
    }

      function isRealtimePollingEnabled() {
        if (settingsRoot) {
          return settingsRoot.getAttribute("data-wa-realtime-enabled") !== "false";
        }
        return true;
      }

      function isRealtimeConnected() {
        if (window.WARealtimeActive !== true) return false;
        var consumer = window.WARealtimeConsumer || (window.App && window.App.cable);
        if (consumer && consumer.connection && typeof consumer.connection.isOpen === "function") {
          return consumer.connection.isOpen();
        }
        return window.WARealtimeActive === true;
      }

      function setRealtimePollingEnabled(enabled) {
        if (settingsRoot) {
          settingsRoot.setAttribute("data-wa-realtime-enabled", enabled ? "true" : "false");
        }
        if (realtimeToggle) {
          realtimeToggle.checked = !!enabled;
        }
      }


      function applyPollingPreference(realtimeActive) {
        var pollingEnabled = isRealtimePollingEnabled();
        if (document.hidden) {
          stopChatPolling();
          stopChatListPolling();
          return pollingEnabled;
        }
        if (pollingEnabled && !realtimeActive) {
          startChatPolling();
          startChatListPolling();
        } else {
          stopChatPolling();
          stopChatListPolling();
        }
        return pollingEnabled;
      }

      if (realtimeToggle && settingsRoot) {
        realtimeToggle.checked = isRealtimePollingEnabled();
      }

    function stopQrAutoRefresh() {
      if (qrRefreshTimeoutId) {
        clearTimeout(qrRefreshTimeoutId);
        qrRefreshTimeoutId = null;
      }
      qrAutoTemplate = null;
      qrAutoName = null;
      if (statusIntervalId) {
        clearInterval(statusIntervalId);
        statusIntervalId = null;
      }
      if (qrProgressId) {
        clearInterval(qrProgressId);
        qrProgressId = null;
      }
      if (qrProgress) qrProgress.style.width = "0%";
    }

    function startQrAutoRefresh(qrTemplate, name) {
      stopQrAutoRefresh();
      if (!qrTemplate || !name) return;

      qrAutoTemplate = qrTemplate;
      qrAutoName = name;
      scheduleNextQrRefresh();
    }

    function scheduleNextQrRefresh() {
      if (!qrAutoTemplate || !qrAutoName) return;
      if (qrRefreshTimeoutId) clearTimeout(qrRefreshTimeoutId);

      qrRefreshTimeoutId = setTimeout(function () {
        loadQrImage(templateUrl(qrAutoTemplate, qrAutoName), 2);
      }, 30000);
    }

    function updateSessionStatus(payload) {
      var status = payload && payload.status ? payload.status : "--";
      var me = payload && payload.me ? payload.me : null;

      var requiresQr = status === "SCAN_QR_CODE" || status === "STARTING" || status === "STARTED";
      if (qrBox) {
        if (requiresQr) {
          qrBox.classList.remove("is-hidden");
        } else {
          qrBox.classList.add("is-hidden");
        }
        if (status === "WORKING") {
          qrBox.classList.add("is-working");
        } else {
          qrBox.classList.remove("is-working");
        }
      }
      if (qrHelper && requiresQr) {
        qrHelper.textContent = status === "SCAN_QR_CODE"
          ? "En espera de escaneo..."
          : "Escanea el codigo QR para confirmar";
      }

      function updateStatusBadge(badge, labelNode) {
        if (!badge) return;
        if (requiresQr || status === "--") {
          badge.classList.add("is-hidden");
        } else {
          badge.classList.remove("is-hidden");
        }
        if (status === "WORKING") {
          badge.classList.add("is-working");
        } else {
          badge.classList.remove("is-working");
        }
        if (labelNode) {
          var labelStatus = status && status !== "--" ? status : "Desconectado";
          labelNode.textContent = labelStatus;
        }
      }

      updateStatusBadge(qrConnected, qrConnectedLabel);
      updateStatusBadge(qrConnectedHeader, qrConnectedHeaderLabel);

      if (newChatFrom) {
        var fromStatus = status && status !== "--" ? status : "Desconectado";
        var fromNumber = me && me.id ? " | " + me.id : "";
        var optionLabel = fromStatus + fromNumber;
        newChatFrom.innerHTML = "";
        var option = document.createElement("option");
        option.value = optionLabel;
        option.textContent = optionLabel;
        newChatFrom.appendChild(option);
      }
    }

    function startSessionPolling(statusTemplate, name, qrTemplate) {
      if (!statusTemplate || !name) return;

      if (statusIntervalId) clearInterval(statusIntervalId);

      var url = templateUrl(statusTemplate, name);
      var token = document.querySelector("meta[name='csrf-token']");

      var poll = function () {
        fetch(url, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          }
        })
          .then(function (response) {
            if (!response.ok) {
              return response.json().then(function (data) {
                throw { status: response.status, data: data };
              });
            }
            return response.json();
          })
          .then(function (payload) {
            updateSessionStatus(payload);
            if (payload && payload.status) {
              var keepQr = payload.status !== "WORKING";
              if (keepQr && qrTemplate) {
                if (!qrAutoTemplate || qrAutoTemplate !== qrTemplate || qrAutoName !== name) {
                  loadQrImage(templateUrl(qrTemplate, name), 2);
                  startQrAutoRefresh(qrTemplate, name);
                }
              }
              if (!keepQr) {
                stopQrAutoRefresh();
              }
              if (payload.status === "WORKING") {
                if (statusIntervalId) {
                  clearInterval(statusIntervalId);
                  statusIntervalId = setInterval(poll, 300000);
                }
              }
            }
          })
          .catch(function () {});
      };

      poll();
      statusIntervalId = setInterval(poll, 3000);
    }

    function startQrProgress(durationMs) {
      if (!qrProgress) return;

      if (qrProgressId) clearInterval(qrProgressId);
      qrProgress.style.width = "0%";

      var start = Date.now();
      qrProgressId = setInterval(function () {
        var elapsed = Date.now() - start;
        var percent = Math.min(100, (elapsed / durationMs) * 100);
        qrProgress.style.width = percent.toFixed(2) + "%";
        if (percent >= 100) {
          clearInterval(qrProgressId);
          qrProgressId = null;
        }
      }, 200);
    }

    function loadQrImage(qrUrl, retries, onLoaded) {
      if (!qrImage) return;

      fetch(qrUrl, {
        method: "GET",
        headers: { "Accept": "image/png" }
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (data) {
              throw { status: response.status, data: data };
            });
          }
          return response.blob();
        })
        .then(function (blob) {
          qrImage.src = URL.createObjectURL(blob);
          startQrProgress(30000);
          scheduleNextQrRefresh();
          if (onLoaded) onLoaded();
        })
        .catch(function (error) {
          var status = error && error.status ? error.status : "Error al obtener QR.";
          var detail = error && error.data && error.data.error ? error.data.error : status;
          void detail;
          if (retries > 0) {
            setTimeout(function () {
              loadQrImage(qrUrl, retries - 1, onLoaded);
            }, 1500);
          }
        });
    }

      if (createButton && nameInput && settingsRoot) {
        createButton.addEventListener("click", function () {
          var name = nameInput.value.trim();
          if (!name) {
            if (settingsStatus) settingsStatus.textContent = "Completa el nombre de la sesion.";
            return;
          }

          var adminName = adminNameInput ? adminNameInput.value.trim() : "";
          var adminEmail = adminEmailInput ? adminEmailInput.value.trim() : "";
          var timeZone = timeZoneInput ? timeZoneInput.value.trim() : "";
          if (!adminName || !adminEmail || !timeZone) {
            if (settingsStatus) settingsStatus.textContent = "Completa todos los campos.";
            return;
          }

          var baseUrl = (settingsRoot.getAttribute("data-wa-waha-url") || "").trim();
          if (!baseUrl) {
            if (settingsStatus) settingsStatus.textContent = "Configura la URL del servidor.";
            return;
          }

          var createUrl = settingsRoot.getAttribute("data-wa-waha-create-url") || "";
          if (!createUrl) {
            if (settingsStatus) settingsStatus.textContent = "No hay endpoint de conexion.";
            return;
          }

          var token = document.querySelector("meta[name='csrf-token']");

          createButton.classList.add("is-loading");
          createButton.setAttribute("disabled", "disabled");
          if (settingsStatus) settingsStatus.textContent = "Creando conexion...";

          fetch(createUrl, {
            method: "POST",
            headers: {
              "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
            body: JSON.stringify({
              name: name,
              session_name: name,
              admin_name: adminName,
              admin_email: adminEmail,
              time_zone: timeZone,
              metadata: {
                "user.name": adminName,
                "user.email": adminEmail
              }
            })
          })
          .then(function (response) {
            if (!response.ok) {
              return response.json().then(function (data) {
                throw { status: response.status, data: data };
              });
            }
            return response.json();
          })
          .then(function (payload) {
            var qrTemplate = settingsRoot.getAttribute("data-wa-waha-qr-url-template") || "";
            if (qrTemplate) {
              loadQrImage(templateUrl(qrTemplate, name), 5, function () {
                createButton.classList.remove("is-loading");
                createButton.removeAttribute("disabled");
              });
              startQrAutoRefresh(qrTemplate, name);
            }
            var statusTemplate = settingsRoot.getAttribute("data-wa-waha-status-url-template") || "";
            if (statusTemplate) {
              startSessionPolling(statusTemplate, name, qrTemplate);
            }
            settingsRoot.setAttribute("data-wa-session-name", name);
            if (settingsStatus) settingsStatus.textContent = "";
          })
          .catch(function (error) {
            void error;
            createButton.classList.remove("is-loading");
            createButton.removeAttribute("disabled");
            var message = "Error al crear la conexion.";
            if (error && error.data) {
              if (error.data.error) message = error.data.error;
              if (error.data.details && error.data.details.length) {
                message = error.data.details.join(", ");
              }
            }
            if (settingsStatus) settingsStatus.textContent = message;
          });
        });
      }

    if (deleteButton && nameInput && settingsRoot) {
      deleteButton.addEventListener("click", function () {
        var name = nameInput.value.trim();
        if (!name) return;

        var deleteTemplate = settingsRoot.getAttribute("data-wa-waha-delete-url-template") || "";
        if (!deleteTemplate) return;

        var token = document.querySelector("meta[name='csrf-token']");
        deleteButton.classList.add("is-loading");
        deleteButton.setAttribute("disabled", "disabled");

        fetch(templateUrl(deleteTemplate, name), {
          method: "DELETE",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
          body: JSON.stringify({
            admin_name: adminNameInput ? adminNameInput.value.trim() : "",
            admin_email: adminEmailInput ? adminEmailInput.value.trim() : "",
            time_zone: timeZoneInput ? timeZoneInput.value : ""
          })
        })
          .then(function () {
            stopQrAutoRefresh();
            if (qrBox) qrBox.classList.add("is-hidden");
            if (qrConnected) qrConnected.classList.add("is-hidden");
            if (qrConnectedHeader) qrConnectedHeader.classList.add("is-hidden");
            nameInput.value = "";
            deleteButton.classList.remove("is-loading");
            deleteButton.removeAttribute("disabled");
            window.location.reload();
          })
          .catch(function () {
            deleteButton.classList.remove("is-loading");
            deleteButton.removeAttribute("disabled");
          });
      });
    }

    if (nameInput && settingsRoot) {
      var existingName = nameInput.value.trim();
      var baseUrl = (settingsRoot.getAttribute("data-wa-waha-url") || "").trim();
      var qrTemplate = settingsRoot.getAttribute("data-wa-waha-qr-url-template") || "";
      var statusTemplate = settingsRoot.getAttribute("data-wa-waha-status-url-template") || "";

      if (existingName && baseUrl) {
        if (statusTemplate) {
          startSessionPolling(statusTemplate, existingName, qrTemplate);
        }
      }
    }

    if (saveServerButton && serverInput && settingsRoot) {
      saveServerButton.addEventListener("click", function () {
        var url = serverInput.value.trim();
        if (!url) {
          if (serverStatus) serverStatus.textContent = "Ingresa una URL valida.";
          return;
        }
        var settingsUrl = settingsRoot.getAttribute("data-wa-settings-url") || "";
        if (!settingsUrl) {
          if (serverStatus) serverStatus.textContent = "No hay endpoint de guardado.";
          return;
        }

        var token = document.querySelector("meta[name='csrf-token']");
        if (serverStatus) serverStatus.textContent = "Guardando URL...";
        var realtimeEnabled = realtimeToggle ? !!realtimeToggle.checked : isRealtimePollingEnabled();

        requestJson(settingsUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
          body: JSON.stringify({
            settings: {
              waha_url: url,
              realtime_enabled: realtimeEnabled
            }
          })
        })
          .then(function (payload) {
              settingsRoot.setAttribute("data-wa-waha-url", payload.waha_url);
              if (payload.realtime_enabled !== undefined) {
                setRealtimePollingEnabled(payload.realtime_enabled);
                applyPollingPreference(isRealtimeConnected());
              }
            if (serverStatus) serverStatus.textContent = "URL guardada.";
          })
          .catch(function () {
            if (serverStatus) serverStatus.textContent = "Error al guardar la URL.";
          });
      });
    }

    if (moreToggle && morePanel) {
      moreToggle.addEventListener("click", function () {
        morePanel.classList.toggle("is-hidden");
      });
    }

    if (morePanel) {
      morePanel.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.classList.contains("wa-more-item")) return;

        var chatBody = document.querySelector("[data-wa-chat-body]");
        var input = document.querySelector("input[name='chat_id']");
        var textarea = document.querySelector(".wa-composer textarea");
        var sendButton = document.querySelector(".wa-send-float");

        if (target.getAttribute("data-wa-delete-chat") === "true") {
          var chatId = input ? input.value : "";
          var activeCard = document.querySelector(".wa-chat-card.is-active");
          if (!chatId && activeCard) {
            chatId = activeCard.getAttribute("data-chat-id") || "";
          }
          if (!chatId) {
            morePanel.classList.add("is-hidden");
            return;
          }
          var deleteUrl = window.location.pathname + "/messages?chat_id=" + encodeURIComponent(chatId);
          console.log("[WA] delete_chat", { chatId: chatId, url: deleteUrl });
          fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              "Accept": "application/json",
              "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || ""
            }
          })
            .then(function (response) {
              if (!response.ok) {
                return response.json().then(function (data) {
                  throw data;
                });
              }
              return response.json();
            })
            .then(function () {
              var card = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
              if (card) card.remove();
          if (chatBody) chatBody.classList.add("is-hidden");
          if (input) input.value = "";
          if (textarea) textarea.setAttribute("disabled", "disabled");
          if (sendButton) sendButton.setAttribute("disabled", "disabled");
          logServer("chat_body.hide", { source: "delete_chat.error" });
              morePanel.classList.add("is-hidden");
            })
            .catch(function (error) {
              console.error("[WA] delete_chat error", error);
              morePanel.classList.add("is-hidden");
            });
          return;
        }

        if (chatBody) chatBody.classList.add("is-hidden");
        if (input) input.value = "";
        if (textarea) textarea.setAttribute("disabled", "disabled");
        if (sendButton) sendButton.setAttribute("disabled", "disabled");

        var activeCard = document.querySelector(".wa-chat-card.is-active");
        if (activeCard) activeCard.classList.remove("is-active");

        morePanel.classList.add("is-hidden");
      });
    }
  }

  function bindLoadMore() {
    if (document.body.dataset.waLoadMoreBound === "true") return;
    document.body.dataset.waLoadMoreBound = "true";

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || target.getAttribute("data-wa-load-more") !== "true") return;

      var loadUrl = target.getAttribute("data-wa-load-url");
      var beforeId = target.getAttribute("data-wa-before-id");
      if (!loadUrl || !beforeId) return;

      var url = loadUrl + "&before_id=" + encodeURIComponent(beforeId);
      logDebug("body_chat.load_more", { before_id: beforeId, url: url }, "body_chat");

      requestJson(url, { headers: { "Accept": "application/json" } })
        .then(function (payload) {
          prependMessages(payload.messages, {
            hasMore: payload.has_more,
            beforeId: payload.oldest_id
          });
        })
        .catch(function () {});
    });
  }

    function setupRealtime() {
      var root = document.querySelector(".wa-shell");
      if (!root) return false;
      if (window.WARealtimeActive) return true;
      if (root.dataset.waRealtimeBound === "true") {
        return false;
    }

    var projectId = root.getAttribute("data-wa-project-id");
    if (!projectId) {
      logDebug("realtime.unavailable", { reason: "missing_project" }, "general");
      return false;
    }

    var cable = null;
    var hasAppCable = !!(window.App && window.App.cable);
    var hasActionCable = !!(window.ActionCable && typeof window.ActionCable.createConsumer === "function");
    var hasMeta = !!document.querySelector("meta[name='action-cable-url']");
    logDebug("realtime.detect", {
      has_app_cable: hasAppCable,
      has_action_cable: hasActionCable,
      has_meta: hasMeta,
      project_id: projectId
    }, "general");
    if (window.App && window.App.cable) {
      cable = window.App.cable;
      logDebug("realtime.consumer", { source: "app.cable" }, "general");
    } else if (window.ActionCable && typeof window.ActionCable.createConsumer === "function") {
      var cableMeta = document.querySelector("meta[name='action-cable-url']");
      var cableUrl = cableMeta ? cableMeta.getAttribute("content") : "";
      if (!cableUrl) {
        cableUrl = "/cable";
      }
      cable = window.ActionCable.createConsumer(cableUrl);
      logDebug("realtime.consumer", { source: "createConsumer", url: cableUrl }, "general");
    }
      if (!cable) {
        logDebug("realtime.unavailable", { reason: "missing_cable" }, "general");
        return false;
      }
      window.WARealtimeConsumer = cable;

      root.dataset.waRealtimeBound = "true";
      cable.subscriptions.create(
        { channel: "WhatsappChannel", project_id: projectId },
      {
        connected: function () {
          window.WARealtimeActive = true;
          logDebug("realtime.connected", { project_id: projectId });
          logDebug("actioncable_vs_polling", { event: "connected", project_id: projectId }, "actioncable_vs_polling");
          stopChatPolling();
          stopChatListPolling();
          logDebug("chat_list.mode", { mode: "actioncable" }, "general");
          logDebug("actioncable_vs_polling", { mode: "actioncable" }, "actioncable_vs_polling");
        },
        disconnected: function () {
          window.WARealtimeActive = false;
          logDebug("realtime.disconnected");
          logDebug("actioncable_vs_polling", { event: "disconnected" }, "actioncable_vs_polling");
          applyPollingPreference(false);
          logDebug("chat_list.mode", { mode: "polling" }, "general");
          logDebug("actioncable_vs_polling", { mode: "polling" }, "actioncable_vs_polling");
        },
          received: function (data) {
            if (!data) return;
            if (data.debug && data.debug.channel === "webhook") {
              logDebug(data.debug.label || "webhook", data.debug.payload || data.debug, "webhook");
              return;
            }
            var chatId = data.chat_id || (data.chat && data.chat.id);
            var list = document.querySelector(".wa-chat-list");
            var activeInput = document.querySelector("input[name='chat_id']");
            logDebug("chat_card.realtime", {
              chat_id: chatId,
              has_chat: !!data.chat,
              has_message: !!data.message,
              list_count: list ? list.children.length : 0,
              active_chat_id: activeInput ? activeInput.value : null
            }, "chat_card");
            if (data.chat) {
              updateChatCard(data.chat, {
                source: "realtime",
                moveToTop: !!data.message
              });
            }
            if (!chatId || !data.message) return;
            logDebug("realtime.received", {
              chat_id: chatId,
              message_id: data.message.id,
              type: data.message.message_type,
              has_data_url: !!data.message.data_url,
              data_url_len: data.message.data_url ? data.message.data_url.length : 0,
              has_remote_url: !!data.message.remote_url,
              waha_id: data.message.waha_id
            });
            var existingCard = document.querySelector(".wa-chat-card[data-chat-id='" + chatId + "']");
            if (!existingCard) {
              fetchChatCard(chatId).then(function (freshChat) {
                if (!freshChat) return;
                updateChatCard(freshChat, {
                  source: "chat_fetch",
                  moveToTop: false
                });
              });
            }

          var activeChatId = activeInput ? activeInput.value : null;
            var isActive = String(activeChatId) === String(chatId);
            var fallback = applyMessageToCard(chatId, data.message, isActive) || {};
            if (existingCard) {
              var updatePayload = { id: chatId };
              if (data.message && data.message.created_at) {
                updatePayload.time_label = data.message.created_at;
              }
              if (fallback.preview) updatePayload.preview = fallback.preview;
              if (fallback.unread_count !== undefined) updatePayload.unread_count = fallback.unread_count;
              if (fallback.status) updatePayload.status = fallback.status;
              updateChatCard(updatePayload, { source: "realtime_fallback" });
            }
            if (isActive && fallback.status) {
              syncChatWorkPackageStatus(chatId);
            }
            fetchChatCard(chatId).then(function (freshChat) {
              if (!freshChat) return;
                updateChatCard(freshChat, {
                  source: "chat_fetch",
                  moveToTop: false
                });
            });
          if (!isActive) return;

          var container = document.querySelector(".wa-messages");
          if (!container) return;
          var existingById = data.message.id ? container.querySelector("[data-message-id='" + data.message.id + "']") : null;
          var existingByWaha = data.message.waha_id ? container.querySelector("[data-waha-id='" + data.message.waha_id + "']") : null;
          if (existingById || existingByWaha) {
            logDebug("body_chat.dedupe.skip", {
              reason: existingById ? "id" : "waha_id",
              message_id: data.message.id,
              waha_id: data.message.waha_id
            }, "body_chat");
            return;
          }
          if (promotePendingUploadBubble(container, data.message, "realtime")) {
            hydrateBubbleImages(container);
            container.scrollTop = container.scrollHeight;
            return;
          }

            var bubble = buildBubble(data.message);
            container.appendChild(bubble);
            logDebug("body_chat.source", { source: "actioncable", message_id: data.message.id }, "body_chat");
            logDebug("actioncable_vs_polling", { source: "actioncable", message_id: data.message.id }, "actioncable_vs_polling");
            if (data.message.message_type === "image" || data.message.message_type === "file") {
              logBubbleLayout("append.realtime", bubble, data.message, container);
            }
            if (document.body && document.body.dataset.waDebugVisual === "true") {
              logDebug("render.appended", {
                id: data.message.id,
                type: data.message.message_type,
              container_count: container.childElementCount,
              last_child: container.lastElementChild ? container.lastElementChild.className : ""
            });
          }
          hydrateBubbleImages(container);
          container.scrollTop = container.scrollHeight;
        }
      }
    );
      logDebug("realtime.subscribed", { project_id: projectId });
      logDebug("actioncable_vs_polling", { event: "subscribed", project_id: projectId }, "actioncable_vs_polling");
      return window.WARealtimeActive === true;
    }

  function startChatPolling() {
    if (window.WAChatPollIntervalId) return;
    var root = document.body;
    if (root && root.dataset.waPollBound === "true") return;
    if (root) root.dataset.waPollBound = "true";

    window.WAChatPollIntervalId = setInterval(function () {
      if (window.WAChatPollInFlight) return;
      var activeInput = document.querySelector("input[name='chat_id']");
      if (!activeInput || !activeInput.value) return;

      var url = window.location.pathname + "?chat_id=" + encodeURIComponent(activeInput.value);
      window.WAChatPollInFlight = true;
      requestJson(url, { headers: { "Accept": "application/json" } })
        .then(function (payload) {
          if (!payload || !payload.messages) return;
          logDebug("poll.messages", { count: payload.messages.length });
          var container = document.querySelector(".wa-messages");
          if (!container) return;

          var existing = {};
          container.querySelectorAll("[data-message-id]").forEach(function (node) {
            existing[node.getAttribute("data-message-id")] = true;
          });
          container.querySelectorAll("[data-waha-id]").forEach(function (node) {
            existing[node.getAttribute("data-waha-id")] = true;
          });

          var appended = false;
          payload.messages.forEach(function (message) {
            if (promotePendingUploadBubble(container, message, "polling")) {
              if (message.id) existing[String(message.id)] = true;
              if (message.waha_id) existing[String(message.waha_id)] = true;
              appended = true;
              return;
            }
            if (message.id && existing[String(message.id)]) {
              logDebug("body_chat.dedupe.skip", { reason: "id", message_id: message.id }, "body_chat");
              return;
            }
            if (message.waha_id && existing[String(message.waha_id)]) {
              logDebug("body_chat.dedupe.skip", { reason: "waha_id", waha_id: message.waha_id }, "body_chat");
              return;
            }
            var bubble = buildBubble(message);
            container.appendChild(bubble);
            logDebug("body_chat.source", { source: "polling", message_id: message.id }, "body_chat");
            logDebug("actioncable_vs_polling", { source: "polling", message_id: message.id }, "actioncable_vs_polling");
            logDebug("body_chat.appended", {
              id: message.id,
              waha_id: message.waha_id,
              type: message.message_type,
              container_count: container.childElementCount
            }, "body_chat");
            logDebug("poll.append", {
              message_id: message.id,
              type: message.message_type,
              has_data_url: !!message.data_url,
              has_remote_url: !!message.remote_url
            });
            if (message.message_type === "image" || message.message_type === "file") {
              logBubbleLayout("append.poll", bubble, message, container);
            }
            if (document.body && document.body.dataset.waDebugVisual === "true") {
              logDebug("render.bubble", {
                id: message.id,
                type: message.message_type,
                height: bubble.offsetHeight,
                children: bubble.children.length
              });
              logDebug("render.appended", {
                id: message.id,
                type: message.message_type,
                container_count: container.childElementCount,
                last_child: container.lastElementChild ? container.lastElementChild.className : ""
              });
            }
            if (message.message_type === "image") {
              logDebug("poll.append.image", {
                images_in_dom: container.querySelectorAll(".wa-bubble-image").length
              });
              if (document.body && document.body.dataset.waDebugVisual === "true") {
                var markerId = "wa-debug-marker-" + String(message.id || "");
                if (!container.querySelector("#" + markerId)) {
                  var marker = document.createElement("div");
                  marker.id = markerId;
                  marker.textContent = "DEBUG IMG " + (message.id || "");
                  marker.style.margin = "6px 0";
                  marker.style.padding = "6px 10px";
                  marker.style.border = "2px dashed #22c55e";
                  marker.style.background = "#f0fdf4";
                  marker.style.fontSize = "12px";
                  marker.style.color = "#166534";
                  container.appendChild(marker);
                }
              }
            }
            appended = true;
          });

          if (appended) {
            hydrateBubbleImages(container);
            container.scrollTop = container.scrollHeight;
          }

          if (payload.chat) {
            updateChatCard(payload.chat, { moveToTop: appended, source: "polling" });
          }
        })
        .catch(function () {})
        .finally(function () {
          window.WAChatPollInFlight = false;
        });
    }, 5000);
  }

  function stopChatPolling() {
    if (!window.WAChatPollIntervalId) return;
    clearInterval(window.WAChatPollIntervalId);
    window.WAChatPollIntervalId = null;
    if (document.body) document.body.dataset.waPollBound = "false";
    logDebug("poll.messages.stop", {}, "general");
  }

  function startChatListPolling() {
    if (window.WAChatListPollIntervalId) return;
    var input = document.querySelector("[data-wa-chat-search='true']");
    if (!input) return;
    var searchUrl = input.getAttribute("data-wa-chat-search-url");
    if (!searchUrl) return;
    if (document.body && document.body.dataset.waListPollBound === "true") return;
    if (document.body) document.body.dataset.waListPollBound = "true";

    logDebug("chat_list.polling.start", { interval_ms: 5000 }, "general");
    refreshChatListFromServer();
    window.WAChatListPollIntervalId = setInterval(function () {
      if (window.WAChatListPollInFlight) return;
      window.WAChatListPollInFlight = true;
      refreshChatListFromServer({ preserveScroll: true })
        .then(function () {
          var list = document.querySelector(".wa-chat-list");
          logDebug("poll.chats", { count: list ? list.querySelectorAll(".wa-chat-card").length : 0 });
        })
        .catch(function () {})
        .finally(function () {
          window.WAChatListPollInFlight = false;
        });
    }, 5000);
  }

  function stopChatListPolling() {
    if (!window.WAChatListPollIntervalId) return;
    clearInterval(window.WAChatListPollIntervalId);
    window.WAChatListPollIntervalId = null;
    if (document.body) document.body.dataset.waListPollBound = "false";
    logDebug("chat_list.polling.stop", {}, "general");
  }

  function isRealtimePollingEnabled() {
    var settingsRoot = document.querySelector("[data-wa-settings]");
    if (settingsRoot) {
      return settingsRoot.getAttribute("data-wa-realtime-enabled") !== "false";
    }
    return true;
  }

  function isRealtimeConnected() {
    if (window.WARealtimeActive !== true) return false;
    var consumer = window.WARealtimeConsumer || (window.App && window.App.cable);
    if (consumer && consumer.connection && typeof consumer.connection.isOpen === "function") {
      return consumer.connection.isOpen();
    }
    return window.WARealtimeActive === true;
  }

  function applyPollingPreference(realtimeActive) {
    var pollingEnabled = isRealtimePollingEnabled();
    if (document.hidden) {
      stopChatPolling();
      stopChatListPolling();
      return pollingEnabled;
    }
    if (pollingEnabled && !realtimeActive) {
      startChatPolling();
      startChatListPolling();
    } else {
      stopChatPolling();
      stopChatListPolling();
    }
    return pollingEnabled;
  }

  function bindPollingVisibility() {
    if (document.body.dataset.waPollVisibilityBound === "true") return;
    document.body.dataset.waPollVisibilityBound = "true";
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopChatPolling();
        stopChatListPolling();
        return;
      }
      applyPollingPreference(isRealtimeConnected());
    });
  }

  function safeBindPollingVisibility() {
    if (typeof bindPollingVisibility === "function") {
      bindPollingVisibility();
      return;
    }
    if (document.body.dataset.waPollVisibilityBound === "true") return;
    document.body.dataset.waPollVisibilityBound = "true";
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopChatPolling();
        stopChatListPolling();
        return;
      }
      applyPollingPreference(isRealtimeConnected());
    });
  }

  function bindTemplateSettings() {
    function typeNeedsMedia(type) {
      return type && type !== "text";
    }

    function typeHasText(type) {
      return type === "text" || String(type || "").indexOf("text_") === 0;
    }

    function updatePreview(form) {
      var bubble = form.querySelector("[data-wa-template-preview-bubble]");
      if (!bubble) return;
      bubble.innerHTML = "";

      var typeSelect = form.querySelector("[data-wa-template-type]");
      var type = typeSelect ? typeSelect.value : "";
      var body = form.querySelector("[data-wa-template-body]");
      var textValue = body ? body.value : "";
      if (typeHasText(type) && textValue) {
        var text = document.createElement("div");
        text.className = "wa-template-preview-text";
        appendTextWithLinks(text, textValue);
        bubble.appendChild(text);
      }

      var urlInput = form.querySelector("input[data-wa-template-media-url]");
      var fileInput = form.querySelector("input[data-wa-template-media-file]");
      var mediaUrl = urlInput ? urlInput.value.trim() : "";
      var fileName = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0].name : "";
      if (typeNeedsMedia(type)) {
        if (type.indexOf("image") !== -1 && mediaUrl) {
          var img = document.createElement("img");
          img.src = mediaUrl;
          bubble.appendChild(img);
        } else if (type.indexOf("video") !== -1 && mediaUrl) {
          var video = document.createElement("video");
          video.src = mediaUrl;
          video.controls = true;
          bubble.appendChild(video);
        } else if (type.indexOf("audio") !== -1 && mediaUrl) {
          var audio = document.createElement("audio");
          audio.src = mediaUrl;
          audio.controls = true;
          bubble.appendChild(audio);
        } else {
          var label = document.createElement("div");
          label.textContent = fileName || (mediaUrl ? "Archivo" : "Selecciona media");
          bubble.appendChild(label);
        }
      }
    }

    function bindForm(form) {
      var typeSelect = form.querySelector("[data-wa-template-type]");
      var textWrap = form.querySelector("[data-wa-template-text]");
      var mediaWrap = form.querySelector("[data-wa-template-media]");
      var source = form.querySelector("[data-wa-template-media-source]");
      var uploadWrap = form.querySelector("[data-wa-template-media-upload]");
      var urlWrap = form.querySelector("[data-wa-template-media-url].wa-template-media-url");
      var urlInput = form.querySelector("input[data-wa-template-media-url]");
      var videoHelp = form.querySelector("[data-wa-template-video-help]");
      var videoError = form.querySelector("[data-wa-template-video-error]");
      var voiceHelp = form.querySelector("[data-wa-template-voice-note-help]");
      if (!typeSelect || !textWrap || !mediaWrap || !source || !uploadWrap || !urlWrap) return;

      function toggleFields() {
        var type = typeSelect.value;
        textWrap.style.display = typeHasText(type) ? "block" : "none";
        mediaWrap.style.display = typeNeedsMedia(type) ? "block" : "none";
        if (videoHelp) {
          if (type && type.indexOf("video") !== -1) {
            videoHelp.classList.remove("is-hidden");
          } else {
            videoHelp.classList.add("is-hidden");
          }
        }
        if (videoError) {
          videoError.classList.add("is-hidden");
        }
        if (voiceHelp) {
          if (type === "audio") {
            voiceHelp.classList.remove("is-hidden");
            voiceHelp.style.display = "block";
          } else {
            voiceHelp.classList.add("is-hidden");
            voiceHelp.style.display = "none";
          }
        }
        if (typeNeedsMedia(type)) {
          if (urlInput && urlInput.value.trim()) {
            source.value = "url";
          }
        }
        toggleSource();
        updatePreview(form);
      }

        function toggleSource() {
          var mode = source.value;
          if (mode === "url") {
            urlWrap.classList.remove("is-hidden");
            uploadWrap.classList.add("is-hidden");
            if (fileInput) {
              fileInput.value = "";
              setCurrentFileLabel(fileLabel, getStoredFileInfo(fileLabel));
            }
            logServer("wa_template.media_source", { mode: "url", has_url: !!(urlInput && urlInput.value.trim()) });
          } else {
            uploadWrap.classList.remove("is-hidden");
            urlWrap.classList.add("is-hidden");
            if (urlInput) {
              urlInput.value = "";
            }
            logServer("wa_template.media_source", { mode: "upload", has_file: !!(fileInput && fileInput.files && fileInput.files[0]) });
          }
        }

      typeSelect.addEventListener("change", toggleFields);
      source.addEventListener("change", function () {
        toggleSource();
        updatePreview(form);
      });

      var bodyInput = form.querySelector("[data-wa-template-body]");
      if (bodyInput) {
        bodyInput.addEventListener("input", function () { updatePreview(form); });
      }
        if (urlInput) {
          urlInput.addEventListener("input", function () {
            logServer("wa_template.media_url.input", { value: urlInput.value || "" });
            updatePreview(form);
          });
        }
      function formatBytes(bytes) {
        var value = Number(bytes);
        if (!value || value <= 0) return null;
        var units = ["B", "kB", "MB", "GB"];
        var index = 0;
        while (value >= 1024 && index < units.length - 1) {
          value /= 1024;
          index += 1;
        }
        var digits = value >= 10 || index === 0 ? 0 : 1;
        return value.toFixed(digits) + " " + units[index];
      }

      function setCurrentFileLabel(label, info) {
        if (!label) return;
        if (!info || !info.name) {
          var placeholder = label.dataset.placeholder || "";
          if (placeholder) {
            label.classList.remove("is-hidden");
            label.classList.add("is-placeholder");
            label.textContent = placeholder;
          } else {
            label.classList.add("is-hidden");
            label.textContent = "";
          }
          return;
        }
        label.classList.remove("is-hidden");
        label.classList.remove("is-placeholder");
        label.textContent = "";
        label.appendChild(document.createTextNode(info.name));
        if (info.size) {
          var sizeText = formatBytes(info.size);
          if (sizeText) {
            var sizeSpan = document.createElement("span");
            sizeSpan.className = "wa-template-file-meta";
            sizeSpan.textContent = " - " + sizeText;
            label.appendChild(sizeSpan);
          }
        }
      }

      function getStoredFileInfo(label) {
        if (!label) return null;
        var name = label.dataset.fileName;
        if (!name) return null;
        var size = label.dataset.fileSize ? Number(label.dataset.fileSize) : null;
        return {
          name: name,
          type: label.dataset.fileType || null,
          size: Number.isFinite(size) ? size : null
        };
      }

      var fileInput = form.querySelector("input[data-wa-template-media-file]");
      var fileLabel = form.querySelector("[data-wa-template-current-file]");
      if (fileLabel) {
        setCurrentFileLabel(fileLabel, getStoredFileInfo(fileLabel));
      }
        if (fileInput) {
          fileInput.addEventListener("change", function () {
            var type = typeSelect ? typeSelect.value : "";
            var file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
            if (file && type && type.indexOf("video") !== -1) {
              var maxBytes = 50 * 1024 * 1024;
              if (file.size > maxBytes) {
                if (videoError) {
                  videoError.classList.remove("is-hidden");
                }
                fileInput.value = "";
                file = null;
              } else if (videoError) {
                videoError.classList.add("is-hidden");
              }
            }
            logServer("wa_template.media_file.change", {
              name: file ? file.name : "",
              size: file ? file.size : 0,
              type: file ? file.type : ""
            });
            if (file) {
              setCurrentFileLabel(fileLabel, { name: file.name, type: file.type, size: file.size });
            } else {
              setCurrentFileLabel(fileLabel, getStoredFileInfo(fileLabel));
            }
            updatePreview(form);
          });
        }

        form.addEventListener("submit", function () {
          var mode = source ? source.value : "";
          var urlValue = urlInput ? urlInput.value.trim() : "";
          var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
          logServer("wa_template.submit", {
            mode: mode,
            url: urlValue,
            file_name: file ? file.name : "",
            file_size: file ? file.size : 0
          });
          if (source && source.value === "url") {
            if (fileInput) fileInput.value = "";
          } else if (source && source.value === "upload") {
            if (urlInput) urlInput.value = "";
          }
          try {
            sessionStorage.setItem("waSettingsOpen", "templates");
          } catch (error) {
            void error;
          }
        });

      toggleFields();
    }

    function setTemplateSubmitState(button, isLoading) {
      if (!button) return;
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }
      if (isLoading) {
        button.classList.add("is-loading");
        button.setAttribute("disabled", "disabled");
        button.textContent = "Guardando...";
      } else {
        button.classList.remove("is-loading");
        button.removeAttribute("disabled");
        button.textContent = button.dataset.originalText || button.textContent;
      }
    }

    function refreshTemplatesPanel(htmlText) {
      var currentPanel = document.querySelector("[data-wa-settings-panel='templates']");
      if (!currentPanel) return;
      var doc = new DOMParser().parseFromString(htmlText, "text/html");
      var newPanel = doc.querySelector("[data-wa-settings-panel='templates']");
      if (!newPanel) return;
      currentPanel.innerHTML = newPanel.innerHTML;
      bindTemplateForms();
      bindTemplateDeleteForms();
    }

    function bindTemplateDeleteForms() {
      document.querySelectorAll("[data-wa-template-delete-form]").forEach(function (form) {
        if (form.dataset.bound === "true") return;
        form.dataset.bound = "true";

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          if (form.dataset.submitting === "true") return;
          form.dataset.submitting = "true";

          try {
            sessionStorage.setItem("waSettingsOpen", "templates");
          } catch (error) {
            void error;
          }

          var submitButton = form.querySelector("button[type='submit'], input[type='submit']");
          setTemplateSubmitState(submitButton, true);

          var formData = new FormData(form);

          fetch(form.action, {
            method: "POST",
            body: formData,
            headers: { "X-Requested-With": "XMLHttpRequest" }
          })
            .then(function (response) {
              return response.text().then(function (text) {
                return { ok: response.ok, text: text };
              });
            })
            .then(function (result) {
              if (!result.ok) throw new Error("delete_template_failed");
              refreshTemplatesPanel(result.text);
            })
            .catch(function (error) {
              console.error("template_delete_error", error);
              if (submitButton) submitButton.textContent = "Error al eliminar";
            })
            .finally(function () {
              form.dataset.submitting = "false";
              setTimeout(function () { setTemplateSubmitState(submitButton, false); }, 900);
            });
        });
      });
    }

    function bindTemplateForms() {
      document.querySelectorAll("[data-wa-template-form]").forEach(function (form) {
        if (form.dataset.bound === "true") return;
        form.dataset.bound = "true";
        bindForm(form);

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          if (form.dataset.submitting === "true") return;
          form.dataset.submitting = "true";

          var submitButton = form.querySelector("button[type='submit'], input[type='submit']");
          setTemplateSubmitState(submitButton, true);

          var method = (form.getAttribute("method") || "post").toUpperCase();
          var formData = new FormData(form);

          fetch(form.action, {
            method: method,
            body: formData,
            headers: { "X-Requested-With": "XMLHttpRequest" }
          })
            .then(function (response) {
              return response.text().then(function (text) {
                return { ok: response.ok, text: text };
              });
            })
            .then(function (result) {
              if (!result.ok) throw new Error("save_template_failed");
              refreshTemplatesPanel(result.text);
            })
            .catch(function (error) {
              console.error("template_save_error", error);
              if (submitButton) submitButton.textContent = "Error al guardar";
            })
          .finally(function () {
            form.dataset.submitting = "false";
            setTimeout(function () { setTemplateSubmitState(submitButton, false); }, 900);
          });
        });
      });
    }

    bindTemplateForms();
    bindTemplateDeleteForms();

    if (document.body.dataset.waTemplateClickBound !== "true") {
      document.body.dataset.waTemplateClickBound = "true";
      document.addEventListener("click", function (event) {
        var toggle = event.target.closest("[data-wa-template-edit-toggle]");
        if (toggle) {
          var item = toggle.closest(".wa-template-item");
          if (!item) return;
          var edit = item.nextElementSibling;
          if (edit && edit.matches("[data-wa-template-edit]")) {
            edit.classList.toggle("is-hidden");
          }
        }
        var cancel = event.target.closest("[data-wa-template-edit-cancel]");
        if (cancel) {
          var editPanel = cancel.closest("[data-wa-template-edit]");
          if (editPanel) editPanel.classList.add("is-hidden");
        }
      });
    }
  }

  function bindAll() {
    resetOverlays();
    bindWaTagsInput();
    bindWaTagsDrag();
    bindWaTagsActions();
    bindWaChatTagsDrag();
    bindWaChatTagTooltip();
    bindMediaFilesPanel(document.querySelector("[data-wa-files-panel='true']"));
    document.querySelectorAll("[data-wa-chat-tags]").forEach(function (node) {
      var tags = [];
      try {
        tags = JSON.parse(node.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      renderWaChatTags(node, tags);
    });
    loadContactFieldVisibility();
    bindMacroActions();
    bindIaPanel();
    updateAllMacroRows();
    loadMacroFlows();
    bindWhatsappForm();
    bindChatEditPanel();
    bindChatLinks();
    bindLoadMore();
    bindChatSearch();
    bindChatLoadMore();
    bindChatStatusSelect();
    if (window.WAConversationSelector && typeof window.WAConversationSelector.bind === "function") {
      window.WAConversationSelector.bind();
    }
    if (window.WAResponsibleSync && typeof window.WAResponsibleSync.bind === "function") {
      window.WAResponsibleSync.bind();
    }
    bindWpStatusSyncListener();
    bindFavoriteToggle();
    bindDeletedChatSync();
    safeBindPollingVisibility();
    seedWpStatusCacheFromCards();
    refreshChatListFromServer({ clearBeforeLoad: true });
    var chatBody = document.querySelector("[data-wa-chat-body]");
    if (chatBody) {
      logServer("chat_body.state", { hidden: chatBody.classList.contains("is-hidden") });
    }
    var messages = document.querySelector(".wa-messages");
    if (messages) {
      logServer("chat_body.scroll", {
        windowY: window.scrollY,
        messagesTop: messages.scrollTop
      });
    }
    var list = document.querySelector(".wa-chat-list");
    if (list) {
      logDebug("chat_card.list.ready", { count: list.children.length }, "chat_card");
    }
    var realtimeActive = setupRealtime();
    applyPollingPreference(isRealtimeConnected());
    logServer("realtime.init", { active: !!realtimeActive });
    setTimeout(function () {
      if (isRealtimeConnected()) return;
      applyPollingPreference(false);
    }, 1500);
    logDebug("realtime.mode", { active: !!realtimeActive });
    logDebug("chat_list.mode", { mode: realtimeActive ? "actioncable" : "polling" }, "general");
    logDebug("actioncable_vs_polling", { mode: realtimeActive ? "actioncable" : "polling" }, "actioncable_vs_polling");
    var activeInput = document.querySelector("input[name='chat_id']");
    if (activeInput) {
      var hasChatIdParam = new URLSearchParams(window.location.search || "").has("chat_id");
      if (!hasChatIdParam) {
        activeInput.value = "";
        setActiveChat(null);
      }
    }
    var initialChatId = "";
    if (activeInput && activeInput.value) {
      initialChatId = String(activeInput.value);
    } else {
      var activeCard = document.querySelector(".wa-chat-card.is-active");
      if (activeCard) initialChatId = activeCard.getAttribute("data-chat-id") || "";
    }
    if (initialChatId) {
      var header = document.querySelector(".wa-chat-header");
      if (header && !header.getAttribute("data-chat-id")) {
        header.setAttribute("data-chat-id", initialChatId);
      }
      syncChatWorkPackageStatus(initialChatId);
      if (window.WAConversationSelector && typeof window.WAConversationSelector.sync === "function") {
        window.WAConversationSelector.sync(initialChatId);
      }
      if (window.WAResponsibleSync && typeof window.WAResponsibleSync.sync === "function") {
        window.WAResponsibleSync.sync(initialChatId);
      }
      logServer("wp_status.initial_sync", { chat_id: initialChatId });
    }
    hydrateReplySnippets(document.querySelector(".wa-messages"));
    bindTemplateSettings();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAll);
  } else {
    bindAll();
  }

  document.addEventListener("turbo:load", bindAll);
  document.addEventListener("turbo:before-cache", function () {
    document.body.dataset.waTagsDragBound = "";
    document.body.dataset.waTagsActionBound = "";
    document.body.dataset.waChatTagsDragBound = "";
  });
})();









