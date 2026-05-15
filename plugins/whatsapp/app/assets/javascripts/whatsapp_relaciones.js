(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function getShell() {
    return document.querySelector(".wa-shell");
  }

  function getChatId() {
    var input = document.querySelector("input[name='chat_id']");
    return input ? input.value : "";
  }

  function getCsrfToken() {
    var meta = document.querySelector("meta[name='csrf-token']");
    return meta ? meta.getAttribute("content") : "";
  }

  function setStatus(message, isError) {
    var status = document.querySelector("[data-wa-wp-status]");
    if (!status) return;
    status.textContent = message || "";
    if (isError) {
      status.classList.add("is-error");
    } else {
      status.classList.remove("is-error");
    }
  }

  function setBoardStatus(message, isError) {
    var status = document.querySelector("[data-wa-board-status]");
    if (!status) return;
    status.textContent = message || "";
    if (isError) {
      status.classList.add("is-error");
    } else {
      status.classList.remove("is-error");
    }
  }

  function renderTypes(types) {
    var select = document.querySelector("[data-wa-wp-type-select]");
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">Seleccione tipo</option>';
    (types || []).forEach(function (type) {
      var opt = document.createElement("option");
      opt.value = type.id;
      opt.textContent = type.name;
      select.appendChild(opt);
    });
    if (current) select.value = current;
  }

  function renderRelated(items) {
    var list = document.querySelector("[data-wa-wp-related-list]");
    var select = document.querySelector("[data-wa-wp-related-select]");
    var statusSelect = document.querySelector("[data-wa-wp-status-select]");
    if (!list) return;
    list.innerHTML = "";
    if (select) {
      select.innerHTML = '<option value="">Seleccione paquete relacionado</option>';
    }
    if (!items || !items.length) {
      var empty = document.createElement("div");
      empty.className = "wa-wp-related-empty";
      empty.textContent = "Sin paquetes relacionados.";
      list.appendChild(empty);
      if (statusSelect) {
        statusSelect.innerHTML = "";
        statusSelect.disabled = true;
      }
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "wa-wp-related-item";
      var link = document.createElement("div");
      link.textContent = item.subject;
      var meta = document.createElement("div");
      meta.className = "wa-wp-related-meta";
      meta.textContent = item.type_name + " · " + item.status_name;
      var open = document.createElement("a");
      open.className = "wa-wp-related-view";
      open.href = item.url;
      open.setAttribute("title", "Abrir en pestaña nueva");
      open.setAttribute("target", "_blank");
      open.setAttribute("rel", "noopener");
      open.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-up-right-square" viewBox="0 0 16 16">' +
        '<path fill-rule="evenodd" d="M15 2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1zM0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm5.854 8.803a.5.5 0 1 1-.708-.707L9.243 6H6.475a.5.5 0 1 1 0-1h3.975a.5.5 0 0 1 .5.5v3.975a.5.5 0 1 1-1 0V6.707z"/>' +
        "</svg>";
      row.appendChild(link);
      row.appendChild(meta);
      row.appendChild(open);
      list.appendChild(row);
      if (select) {
        var opt = document.createElement("option");
        opt.value = String(item.id);
        opt.textContent = item.subject;
        select.appendChild(opt);
      }
    });
    if (statusSelect) {
      startWorkPackageStatusPolling(String(items[0].id || ""), statusSelect);
    }
  }

  function renderBoards(items) {
    var select = document.querySelector("[data-wa-board-select]");
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">Seleccione tablero</option>';
    if (!items || !items.length) return;
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = String(item.id);
      opt.textContent = item.name;
      opt.setAttribute("data-board-url", item.url || "");
      select.appendChild(opt);
    });
    if (current) {
      select.value = current;
      if (select.value) {
        loadBoardLists(select.value);
      }
    } else {
      renderBoardLists([]);
    }
  }

  function renderBoardLists(items) {
    var select = document.querySelector("[data-wa-board-list-select]");
    if (!select) return;
    select.innerHTML = '<option value="">Seleccione lista</option>';
    setBoardStatus("", false);
    if (!items || !items.length) return;
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = String(item.id);
      opt.textContent = item.name;
      select.appendChild(opt);
    });
  }

  function appendBoardAdded(entry) {
    var list = document.querySelector("[data-wa-board-added-list]");
    if (!list || !entry) return;
    var empty = list.querySelector(".wa-wp-related-empty");
    if (empty) empty.remove();
    var row = document.createElement("div");
    row.className = "wa-wp-related-item";
    if (entry.id) {
      row.setAttribute("data-wa-board-card-id", entry.id);
    }
    var name = document.createElement("div");
    name.textContent = entry.work_package_subject || "Paquete";
    var meta = document.createElement("div");
    meta.className = "wa-wp-related-meta";
    meta.textContent = (entry.board_name || "Tablero") + (entry.list_name ? " · " + entry.list_name : "");
    var open = document.createElement("a");
    open.className = "wa-wp-related-view";
    open.href = entry.board_url || "#";
    open.setAttribute("title", "Abrir tablero");
    open.setAttribute("target", "_blank");
    open.setAttribute("rel", "noopener");
    open.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-up-right-square" viewBox="0 0 16 16">' +
      '<path fill-rule="evenodd" d="M15 2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1zM0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm5.854 8.803a.5.5 0 1 1-.708-.707L9.243 6H6.475a.5.5 0 1 1 0-1h3.975a.5.5 0 0 1 .5.5v3.975a.5.5 0 1 1-1 0V6.707z"/>' +
      "</svg>";
    var del = document.createElement("button");
    del.className = "wa-wp-related-delete";
    del.type = "button";
    del.setAttribute("title", "Eliminar");
    if (entry.id) del.setAttribute("data-wa-board-card-delete", entry.id);
    del.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">' +
      '<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>' +
      '<path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>' +
      "</svg>";
    row.appendChild(name);
    row.appendChild(meta);
    row.appendChild(open);
    row.appendChild(del);
    list.appendChild(row);
  }

  function loadTypes() {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-wp-types-url");
    if (!url) return;
    fetch(url, { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderTypes(data.types || []);
      })
      .catch(function () {});
  }

  function loadRelated(chatId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-wp-related-url");
    if (!url || !chatId) return;
    fetch(url + "?chat_id=" + encodeURIComponent(chatId), { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderRelated(data.items || []);
      })
      .catch(function () {});
  }

  function loadBoards() {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-boards-url");
    if (!url) return;
    fetch(url, { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderBoards(data.boards || []);
      })
      .catch(function () {});
  }

  function loadBoardLists(boardId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-board-lists-url");
    if (!url || !boardId) return;
    fetch(url.replace("__ID__", String(boardId)), { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderBoardLists(data.lists || []);
      })
      .catch(function () {});
  }

  function panelVisible() {
    var panel = document.querySelector("[data-wa-chat-edit-panel]");
    return panel && !panel.classList.contains("is-hidden");
  }

  function createWorkPackage(chatId, typeId, subject) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-wp-create-url");
    if (!url) return;
    setStatus("Creando...", false);
    fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken()
      },
      body: JSON.stringify({
        chat_id: chatId,
        type_id: typeId,
        subject: subject
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function () {
        setStatus("Paquete creado.", false);
        var subjectInput = document.querySelector("[data-wa-wp-subject]");
        if (subjectInput) subjectInput.value = "";
        loadRelated(chatId);
      })
      .catch(function () {
        setStatus("No se pudo crear el paquete.", true);
      });
  }

  function deleteWorkPackage(chatId, workPackageId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-wp-delete-url");
    if (!url) return;
    fetch(url.replace("__ID__", String(workPackageId)) + "?chat_id=" + encodeURIComponent(chatId), {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": getCsrfToken()
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function () {
        loadRelated(chatId);
      })
      .catch(function () {
        setStatus("No se pudo eliminar.", true);
      });
  }

  function unlinkWorkPackage(chatId, workPackageId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-wp-unlink-url");
    if (!url) return;
    fetch(url.replace("__ID__", String(workPackageId)) + "?chat_id=" + encodeURIComponent(chatId), {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": getCsrfToken()
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function () {
        loadRelated(chatId);
      })
      .catch(function () {
        setStatus("No se pudo desvincular.", true);
      });
  }

  function buildDefaultSubject() {
    var firstName = document.querySelector("#wa-edit-first-name");
    var lastName = document.querySelector("#wa-edit-last-name");
    var name = "";
    if (firstName && firstName.value.trim()) name += firstName.value.trim();
    if (lastName && lastName.value.trim()) name += (name ? " " : "") + lastName.value.trim();
    if (name) return name;

    var headerTitle = document.querySelector(".wa-chat-header .wa-chat-name");
    if (headerTitle && headerTitle.textContent.trim()) return headerTitle.textContent.trim();

    var card = document.querySelector(".wa-chat-card.is-active .wa-chat-title");
    if (card && card.textContent.trim()) return card.textContent.trim();

    var chatIdLabel = document.querySelector("[data-wa-chat-id]");
    if (chatIdLabel && chatIdLabel.textContent.trim()) return chatIdLabel.textContent.trim();

    return "";
  }

  function maybeAutofillSubject() {
    var subjectInput = document.querySelector("[data-wa-wp-subject]");
    if (!subjectInput) return;
    if (subjectInput.dataset.waWpManual === "true") return;

    var current = subjectInput.value.trim();
    if (!current || subjectInput.dataset.waWpAutofilled === "true") {
      var nextValue = buildDefaultSubject();
      if (nextValue) {
        subjectInput.value = nextValue;
        subjectInput.dataset.waWpAutofilled = "true";
      }
    }
  }

  function bindSubjectManual() {
    var subjectInput = document.querySelector("[data-wa-wp-subject]");
    if (!subjectInput || subjectInput.dataset.waWpBound === "true") return;
    subjectInput.dataset.waWpBound = "true";
    subjectInput.addEventListener("input", function () {
      subjectInput.dataset.waWpManual = "true";
      subjectInput.dataset.waWpAutofilled = "false";
    });
  }

  function bindCreate() {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var btn = target && target.closest("[data-wa-wp-create]");
      if (!btn) return;
      var chatId = getChatId();
      var typeSelect = document.querySelector("[data-wa-wp-type-select]");
      var subjectInput = document.querySelector("[data-wa-wp-subject]");
      var typeId = typeSelect ? typeSelect.value : "";
      var subject = subjectInput ? subjectInput.value.trim() : "";
      if (!chatId || !typeId || !subject) {
        setStatus("Completa tipo y nombre.", true);
        return;
      }
      createWorkPackage(chatId, typeId, subject);
    });
  }

  function bindBoardSelect() {
    document.addEventListener("change", function (event) {
      var target = event.target;
      if (!target || !target.matches("[data-wa-board-select]")) return;
      var boardId = target.value;
      renderBoardLists([]);
      if (boardId) {
        loadBoardLists(boardId);
      }
    });
  }

  function addWorkPackageToBoardList(boardId, listId, workPackageId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-board-add-url");
    if (!url) return;
    setBoardStatus("Agregando...", false);
    fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken()
      },
      body: JSON.stringify({
        board_id: boardId,
        query_id: listId,
        work_package_id: workPackageId,
        chat_id: getChatId()
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
        setBoardStatus("Tarjeta añadida.", false);
        appendBoardAdded(data);
      })
      .catch(function () {
        setBoardStatus("No se pudo agregar.", true);
      });
  }

  function bindBoardAdd() {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var btn = target && target.closest("[data-wa-board-add]");
      if (!btn) return;
      var workPackageId = (document.querySelector("[data-wa-wp-related-select]") || {}).value || "";
      var boardId = (document.querySelector("[data-wa-board-select]") || {}).value || "";
      var listId = (document.querySelector("[data-wa-board-list-select]") || {}).value || "";
      if (!workPackageId || !boardId || !listId) {
        setBoardStatus("Completa paquete, tablero y lista.", true);
        return;
      }
      addWorkPackageToBoardList(boardId, listId, workPackageId);
    });
  }

  function renderBoardAdded(items) {
    var list = document.querySelector("[data-wa-board-added-list]");
    if (!list) return;
    list.innerHTML = "";
    if (!items || !items.length) {
      var empty = document.createElement("div");
      empty.className = "wa-wp-related-empty";
      empty.textContent = "Sin tarjetas añadidas.";
      list.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      appendBoardAdded(item);
    });
  }

  function loadBoardAdded(chatId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-board-cards-url");
    if (!url || !chatId) return;
    fetch(url + "?chat_id=" + encodeURIComponent(chatId), { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderBoardAdded(data.items || []);
      })
      .catch(function () {});
  }

  function deleteBoardCard(cardId) {
    var shell = getShell();
    if (!shell) return;
    var url = shell.getAttribute("data-wa-board-card-delete-url");
    if (!url) return;
    fetch(url.replace("__ID__", String(cardId)), {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": getCsrfToken()
      }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function () {
        loadBoardAdded(getChatId());
      })
      .catch(function () {
        setBoardStatus("No se pudo eliminar.", true);
      });
  }

  function bindBoardDelete() {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var btn = target && target.closest("[data-wa-board-card-delete]");
      if (!btn) return;
      var cardId = btn.getAttribute("data-wa-board-card-delete");
      if (!cardId) return;
      if (!window.confirm("¿Eliminar tarjeta del tablero?")) return;
      deleteBoardCard(cardId);
    });
  }

  function bindDelete() {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var btn = target && target.closest("[data-wa-wp-delete]");
      if (!btn) return;
      var chatId = getChatId();
      var wpId = btn.getAttribute("data-wa-wp-delete");
      if (!chatId || !wpId) return;
      if (!window.confirm("¿Eliminar paquete de trabajo?")) return;
      deleteWorkPackage(chatId, wpId);
    });
  }

  function bindUnlink() {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var btn = target && target.closest("[data-wa-wp-unlink]");
      if (!btn) return;
      var chatId = getChatId();
      var wpId = btn.getAttribute("data-wa-wp-unlink");
      if (!chatId || !wpId) return;
      if (!window.confirm("¿Desvincular paquete de trabajo?")) return;
      unlinkWorkPackage(chatId, wpId);
    });
  }

  function openSplitView(url) {
    var panel = document.querySelector("[data-wa-wp-split-panel]");
    var frame = document.querySelector("[data-wa-wp-split-iframe]");
    if (!panel || !frame) return;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    frame.onload = function () {
      try {
        var doc = frame.contentDocument || frame.contentWindow.document;
        if (!doc) return;
        var existing = doc.getElementById("wa-wp-embed-style");
        if (existing) existing.remove();
        var iaBtn = doc.getElementById("ia-chat-toggle-btn");
        if (iaBtn) iaBtn.style.display = "none";
        if (url.indexOf("/whatsapp/work_packages/") !== -1) return;
        waitForTabs(doc);
        var style = doc.createElement("style");
        style.id = "wa-wp-embed-style";
        style.textContent =
          "header, .top-menu, .op-app-header, .op-app-header--wrapper, .op-top-menu, .op-project-menu, " +
          ".main-menu, #main-menu, .op-sidemenu, .op-sidemenu--container, .op-menu--container, " +
          ".op-flyout-menu, .op-app-header .top-menu, .op-app-header .op-app-header--logo { display: none !important; }" +
          ".content-overlay, opce-modal-overlay, opce-spot-drop-modal-portal { display: none !important; }" +
          ".work-packages--pane-left, .work-packages--table, .wp-table--container { display: none !important; }" +
          ".work-packages--header, .work-packages--context-toolbar, .work-packages--list-filter, .op-toolbar, " +
          ".toolbar-container, .toolbar-items, .op-breadcrumb, .op-breadcrumbs, .title-container { display: none !important; }" +
          ".wp--details-toolbar, .wp--details-actions, .wp--details-split-view-toggle, .wp--details--title-actions { display: none !important; }" +
          ".work-packages--pane-right, .work-packages--details { width: 100% !important; max-width: 100% !important; }" +
          "body { overflow: auto !important; }";
        doc.head.appendChild(style);
      } catch (e) {
        // Ignore if cross-origin or blocked
      }
    };
    frame.src = url;
    panel.classList.remove("is-hidden");
    panel.style.display = "flex";
    panel.style.position = "fixed";
    var header = document.querySelector(".op-app-header");
    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    panel.style.setProperty("--wa-wp-top", headerHeight + "px");
    panel.style.right = "0";
    panel.style.width = "30vw";
    panel.style.bottom = "16px";
    panel.style.zIndex = "20000";
  }

  function waitForTabs(doc) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (injectTabsIntoHeader(doc)) {
        bindIframeTabs(doc);
        clearInterval(timer);
      } else if (tries >= 40) {
        clearInterval(timer);
      }
    }, 250);
  }

  function bindIframeTabs(doc) {
    if (doc.body && doc.body.dataset.waWpTabsBound === "true") return;
    if (doc.body) doc.body.dataset.waWpTabsBound = "true";

    doc.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var tab = target && target.closest("[data-tab-id]");
      if (!tab) return;
      var tabId = tab.getAttribute("data-tab-id");
      toggleActivityOnly(doc, tabId === "activity");
    });

    var selected = doc.querySelector("[data-tab-id][data-qa-tab-selected='true']");
    if (selected) {
      toggleActivityOnly(doc, selected.getAttribute("data-tab-id") === "activity");
    }
  }

  function injectTabsIntoHeader(doc) {
    var host = document.querySelector("[data-wa-wp-split-tabs]");
    if (!host) return;
    host.innerHTML = "";
    var tabRoot = doc.querySelector("op-wp-tabs");
    var tabRow = doc.querySelector(".op-tab-row");
    if (!tabRoot && !tabRow) return false;
    var source = tabRow || tabRoot;
    var clone = source.cloneNode(true);
    var summaryTab = document.createElement("span");
    summaryTab.className = "wa-wp-tab-summary is-active";
    summaryTab.textContent = "Resumen";
    clone.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var href = link.getAttribute("href");
        if (!href) return;
        var target = doc.querySelector("op-wp-tabs a[href='" + href + "'], .op-tab-row a[href='" + href + "']");
        if (target) target.click();
        setSummaryActive(false);
        showTabContent(doc, true);
        toggleActivityOnly(doc, href.indexOf("/activity") !== -1);
      });
    });
    summaryTab.addEventListener("click", function () {
      setSummaryActive(true);
      showTabContent(doc, false);
      toggleActivityOnly(doc, false);
    });
    host.appendChild(summaryTab);
    host.appendChild(clone);
    if (tabRow) tabRow.style.display = "none";
    if (tabRoot) tabRoot.style.display = "none";
    showTabContent(doc, false);
    return true;
  }

  function setSummaryActive(active) {
    var summary = document.querySelector(".wa-wp-tab-summary");
    if (!summary) return;
    summary.classList.toggle("is-active", !!active);
    var links = document.querySelectorAll(".wa-wp-split-tabs .op-tab-row--link");
    links.forEach(function (link) {
      link.classList.toggle("op-tab-row--link_selected", !active && link.classList.contains("op-tab-row--link_selected"));
    });
  }

  function showTabContent(doc, show) {
    var tabContent = doc.querySelector("[data-notification-selector='notification-scroll-container'], .tabcontent");
    if (!tabContent) return;
    tabContent.style.display = show ? "" : "none";
  }

  function toggleActivityOnly(doc, active) {
    var details = doc.querySelector(".work-packages--details");
    var tabContent = doc.querySelector("[data-notification-selector='notification-scroll-container'], .tabcontent");
    if (!details || !tabContent) return;
    doc.querySelectorAll(".work-packages-full-view--split-left").forEach(function (el) {
      el.style.setProperty("display", active ? "none" : "", "important");
    });
    var singleView = doc.querySelector("[data-selector='wp-single-view'], .work-package--single-view");
    if (singleView) singleView.style.setProperty("display", active ? "none" : "", "important");
    doc.querySelectorAll(".work-packages--panel-inner").forEach(function (el) {
      el.style.setProperty("display", active ? "none" : "", "important");
    });
    var container = tabContent;
    while (container && container.parentElement !== details) {
      container = container.parentElement;
    }
    if (!container) return;
    Array.prototype.forEach.call(details.children, function (child) {
      child.style.setProperty("display", active && child !== container ? "none" : "", "important");
    });
  }

  function closeSplitView() {
    var panel = document.querySelector("[data-wa-wp-split-panel]");
    var frame = document.querySelector("[data-wa-wp-split-iframe]");
    if (frame) frame.src = "about:blank";
    if (panel) panel.classList.add("is-hidden");
  }

  function bindSplitView() {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var link = target && target.closest("[data-wa-wp-split-open]");
      if (!link) return;
      event.preventDefault();
      var url = link.getAttribute("data-wa-wp-split-open");
      if (!url) return;
      openSplitView(url);
    });

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var closeBtn = target && target.closest("[data-wa-wp-split-close='true']");
      if (!closeBtn) return;
      closeSplitView();
    });

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var scrollBtn = target && target.closest("[data-wa-wp-tabs-scroll]");
      if (!scrollBtn) return;
      var dir = scrollBtn.getAttribute("data-wa-wp-tabs-scroll");
      var host = document.querySelector("[data-wa-wp-split-tabs]");
      var row = host ? host.querySelector(".op-tab-row") : null;
      if (!row) return;
      var delta = dir === "left" ? -120 : 120;
      row.scrollBy({ left: delta, behavior: "smooth" });
    });
  }

  function bindEditOpen() {
    var lastChatId = null;
    var typesLoaded = false;
    var lastBoardsFetch = 0;

    setInterval(function () {
      if (!panelVisible()) return;
      bindSubjectManual();
      maybeAutofillSubject();
      if (!typesLoaded) {
        loadTypes();
        typesLoaded = true;
      }
      if (Date.now() - lastBoardsFetch > 30000) {
        lastBoardsFetch = Date.now();
        loadBoards();
      }
      var chatId = getChatId();
      if (chatId && chatId !== lastChatId) {
        lastChatId = chatId;
        loadRelated(chatId);
        loadBoardAdded(chatId);
      }
    }, 500);
  }

  function applyStatusSelectColor(select) {
    if (!select) return;
    var option = select.options[select.selectedIndex];
    var color = option ? option.getAttribute("data-color") : "";
    if (color) {
      select.style.borderColor = color;
      select.style.boxShadow = "inset 0 -2px 0 " + color;
      select.style.backgroundColor = color;
      select.style.backgroundImage = "none";
      select.style.backgroundClip = "padding-box";
      select.style.boxShadow = "inset 0 0 0 9999px " + color;
      select.style.color = getContrastTextColor(color);
    } else {
      select.style.borderColor = "";
      select.style.boxShadow = "";
      select.style.backgroundColor = "";
      select.style.backgroundImage = "";
      select.style.backgroundClip = "";
      select.style.color = "";
    }
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

  function parseStatusIdFromHref(href) {
    if (!href) return "";
    var match = href.match(/\/api\/v3\/statuses\/(\d+)/);
    return match ? match[1] : "";
  }

  var wpStatusCache = {};

  function ensureStatusOption(select, status) {
    if (!select || !status || !status.id) return;
    var existing = Array.prototype.find.call(select.options, function (opt) {
      return opt.value === String(status.id);
    });
    if (existing) {
      if (status.color) existing.setAttribute("data-color", status.color);
      if (status.name) existing.textContent = status.name;
      return;
    }
    var option = document.createElement("option");
    option.value = String(status.id);
    option.textContent = status.name || "Estado";
    if (status.color) option.setAttribute("data-color", status.color);
    select.appendChild(option);
  }

  function fetchStatusDetails(statusId) {
    if (!statusId) return Promise.resolve(null);
    if (wpStatusCache[statusId]) return Promise.resolve(wpStatusCache[statusId]);
    return fetch("/api/v3/statuses/" + encodeURIComponent(statusId), {
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    })
      .then(function (res) {
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then(function (data) {
        var status = { id: data.id, name: data.name, color: data.color };
        wpStatusCache[statusId] = status;
        return status;
      })
      .catch(function () { return null; });
  }

  function startWorkPackageStatusPolling(workPackageId, select) {
    if (!select || !workPackageId) return;
    if (select.dataset.wpStatusPolling === workPackageId) return;
    if (select.dataset.wpStatusInterval) {
      clearInterval(Number(select.dataset.wpStatusInterval));
    }
    select.dataset.wpStatusPolling = workPackageId;
    select.disabled = true;

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
          if (!statusId) return;
          fetchStatusDetails(statusId).then(function (status) {
            if (status) ensureStatusOption(select, status);
            select.value = String(statusId);
            select.disabled = false;
            applyStatusSelectColor(select);
          });
        })
        .catch(function () {});
    }

    pollOnce();
    var intervalId = setInterval(pollOnce, 15000);
    select.dataset.wpStatusInterval = String(intervalId);
  }

  ready(function () {
    var panel = document.querySelector("[data-wa-wp-split-panel]");
    if (panel && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    bindCreate();
    bindDelete();
    bindUnlink();
    bindSplitView();
    bindBoardSelect();
    bindBoardAdd();
    bindBoardDelete();
    bindEditOpen();
    if (panelVisible()) {
      loadTypes();
      loadBoards();
      loadRelated(getChatId());
      loadBoardAdded(getChatId());
      bindSubjectManual();
      maybeAutofillSubject();
    }
  });
})();
