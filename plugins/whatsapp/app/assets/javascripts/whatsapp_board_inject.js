(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function getProjectIdentifier() {
    var path = window.location.pathname || "";
    var match = path.match(/\/projects\/([^/]+)/);
    return match ? match[1] : "";
  }

  function boardPresent() {
    return !!document.querySelector("[data-test-selector='op-wp-card-view'], .op-wp-single-card");
  }

  function ensurePanel() {
    var existing = document.querySelector("[data-wa-board-chat-panel]");
    if (existing) return existing;

    var panel = document.createElement("div");
    panel.className = "wa-board-chat-panel is-hidden";
    panel.setAttribute("data-wa-board-chat-panel", "true");

    panel.innerHTML =
      '<div class="wa-board-chat-header">' +
      '<div class="wa-board-chat-title">WhatsApp</div>' +
      '<button type="button" class="wa-board-chat-close" data-wa-board-chat-close="true">&#x2715;</button>' +
      "</div>" +
      '<iframe class="wa-board-chat-iframe" data-wa-board-chat-iframe title="WhatsApp chat"></iframe>';

    document.body.appendChild(panel);

    var closeBtn = panel.querySelector("[data-wa-board-chat-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        hidePanel(panel);
      });
    }

    window.addEventListener("resize", function () {
      applyPanelTop(panel);
    });

    return panel;
  }

  function applyPanelTop(panel) {
    if (!panel) return;
    var header = document.querySelector(".op-app-header");
    var headerHeight = header ? header.getBoundingClientRect().height : 0;
    panel.style.top = headerHeight + "px";
    panel.style.height = "calc(100vh - " + (headerHeight + 16) + "px)";
  }

  function showPanel(url) {
    var panel = ensurePanel();
    var iframe = panel.querySelector("[data-wa-board-chat-iframe]");
    applyPanelTop(panel);
    panel.classList.remove("is-hidden");
    panel.setAttribute("aria-hidden", "false");
    if (iframe && url) {
      var embedUrl = url;
      if (embedUrl.indexOf("embedded=1") === -1) {
        embedUrl += (embedUrl.indexOf("?") === -1 ? "?" : "&") + "embedded=1";
      }
      iframe.src = embedUrl;
    }
  }

  function hidePanel(panel) {
    var iframe = panel.querySelector("[data-wa-board-chat-iframe]");
    panel.classList.add("is-hidden");
    panel.setAttribute("aria-hidden", "true");
    if (iframe) iframe.src = "about:blank";
  }

  function getWorkPackageIdFromTarget(target) {
    if (!target) return "";
    var el = target.nodeType === 3 ? target.parentElement : target;
    if (!el) return "";
    var direct = el.closest("[data-work-package-id]");
    if (direct && direct.getAttribute("data-work-package-id")) {
      return direct.getAttribute("data-work-package-id");
    }
    var host = el.closest("wp-single-card");
    if (host && host.dataset && host.dataset.workPackageId) {
      return host.dataset.workPackageId;
    }
    var card = el.closest("[data-test-selector='op-wp-single-card']");
    if (card) {
      var parentHost = card.closest("wp-single-card");
      if (parentHost && parentHost.dataset && parentHost.dataset.workPackageId) {
        return parentHost.dataset.workPackageId;
      }
    }
    return "";
  }

  function ensureMenuItem(menu, wpId) {
    if (!menu) return;
    var existing = menu.querySelector("li[data-wa-open-whatsapp='true']");
    if (existing) {
      existing.setAttribute("data-wa-wp-id", wpId || "");
      return;
    }

    var li = document.createElement("li");
    li.setAttribute("data-wa-open-whatsapp", "true");
    li.setAttribute("data-wa-wp-id", wpId || "");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "menu-item wa-menu-item";
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chat-right-dots wa-menu-icon" viewBox="0 0 16 16">' +
      '<path d="M2 1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h9.586a2 2 0 0 1 1.414.586l2 2V2a1 1 0 0 0-1-1zm12-1a2 2 0 0 1 2 2v12.793a.5.5 0 0 1-.854.353l-2.853-2.853a1 1 0 0 0-.707-.293H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z"/>' +
      '<path d="M5 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0m4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>' +
      "</svg>" +
      "<span class=\"wa-menu-label\">Abrir Whatsapp</span>";
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var currentWpId = li.getAttribute("data-wa-wp-id") || "";
      if (!currentWpId) {
        window.alert("No se encontro la tarjeta.");
        return;
      }
      openWhatsappForWorkPackage(currentWpId);
    });

    li.appendChild(button);
    menu.appendChild(li);
  }

  function openWhatsappForWorkPackage(wpId) {
    var projectId = getProjectIdentifier();
    if (!projectId) {
      window.alert("No se pudo detectar el proyecto.");
      return;
    }

    var url = "/projects/" + encodeURIComponent(projectId) + "/whatsapp/work_packages/" + encodeURIComponent(wpId) + "/chat";
    fetch(url, { headers: { "Accept": "application/json" }, credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (payload) {
            throw { status: response.status, payload: payload };
          });
        }
        return response.json();
      })
      .then(function (payload) {
        var chatUrl = payload && payload.url ? payload.url : "";
        if (!chatUrl && payload && payload.chat_id) {
          chatUrl = "/projects/" + encodeURIComponent(projectId) + "/whatsapp?chat_id=" + encodeURIComponent(payload.chat_id);
        }
        if (!chatUrl) {
          window.alert("No se encontro el chat.");
          return;
        }
        showPanel(chatUrl);
      })
      .catch(function (error) {
        if (error && error.status === 404) {
          window.alert("Esta tarjeta no tiene chat asociado.");
          return;
        }
        if (error && error.status === 403) {
          window.alert("No tienes permiso para ver WhatsApp.");
          return;
        }
        window.alert("No se pudo abrir WhatsApp.");
      });
  }

  function findContextMenuList() {
    var menuRoot = document.querySelector("#work-package-context-menu");
    if (!menuRoot) return null;
    return menuRoot.querySelector(".dropdown-menu");
  }

  function bindContextMenu() {
    if (document.body.dataset.waBoardInjectBound === "true") return;
    document.body.dataset.waBoardInjectBound = "true";

    var observer = new MutationObserver(function () {
      var wpId = document.body.dataset.waBoardLastWpId || "";
      if (!wpId) return;
      var list = findContextMenuList();
      if (list) ensureMenuItem(list, wpId);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("contextmenu", function (event) {
      if (!boardPresent()) return;
      var wpId = getWorkPackageIdFromTarget(event.target);
      if (!wpId) return;
      document.body.dataset.waBoardLastWpId = wpId;
      var menu = findContextMenuList();
      if (menu) ensureMenuItem(menu, wpId);
    }, true);
  }

  function init() {
    bindContextMenu();
  }

  ready(init);
  document.addEventListener("turbo:load", init);
})();
