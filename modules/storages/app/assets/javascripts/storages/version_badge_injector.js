(function () {
  if (window.__storagesVersionBadgeInjectorLoaded) {
    return;
  }
  window.__storagesVersionBadgeInjectorLoaded = true;

  var BADGE_CLASS = "op-version-badge-injected";
  var FILE_PICKER_MODAL_SELECTOR = "[data-test-selector='op-files-picker-modal'], .op-file-picker";
  var labelCache = new Map();
  var pendingLabelRequests = new Map();

  function ensureStyles() {
    if (document.getElementById("op-version-badge-injected-styles")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "op-version-badge-injected-styles";
    style.textContent = ""
      + "." + BADGE_CLASS + "{"
      + "display:inline-flex;"
      + "align-items:center;"
      + "justify-content:center;"
      + "width:26px;"
      + "height:22px;"
      + "padding:0;"
      + "border-radius:6px;"
      + "background:#fff;"
      + "color:var(--fgColor-default, #1f2328);"
      + "border:2px solid var(--borderColor-accent-emphasis, #0969da);"
      + "font-weight:700;"
      + "font-size:10px;"
      + "letter-spacing:-0.2px;"
      + "line-height:1;"
      + "margin-right:0;"
      + "flex:0 0 auto;"
      + "}"
      + ".spot-list--item-title.op-file-list--item-title{"
      + "display:flex;"
      + "align-items:center;"
      + "gap:0;"
      + "}";

    document.head.appendChild(style);
  }

  function badgeTargetLabel(row) {
    return row.getAttribute("data-documentos-ia-file-link-id")
      || row.getAttribute("data-file-link-id")
      || row.getAttribute("data-file-id")
      || row.getAttribute("data-id")
      || "n/a";
  }

  function fileLinkIdFromRow(row) {
    var raw = row.getAttribute("data-documentos-ia-file-link-id") || row.getAttribute("data-file-link-id");
    if (!raw) {
      var fromActions = row.querySelector("[data-documentos-ia-file-link-id], [data-file-link-id]");
      raw = fromActions
        && (fromActions.getAttribute("data-documentos-ia-file-link-id") || fromActions.getAttribute("data-file-link-id"));
    }
    if (!raw) {
      return null;
    }

    var value = parseInt(raw, 10);
    return Number.isNaN(value) ? null : value;
  }

  function loadVersionLabel(fileLinkId) {
    if (!fileLinkId) {
      console.debug("[storages][version-badge] no fileLinkId, fallback V");
      return Promise.resolve("V");
    }

    if (labelCache.has(fileLinkId)) {
      var cached = labelCache.get(fileLinkId);
      console.debug("[storages][version-badge] cache hit", { fileLinkId: fileLinkId, label: cached });
      return Promise.resolve(cached);
    }

    if (pendingLabelRequests.has(fileLinkId)) {
      console.debug("[storages][version-badge] request already pending", { fileLinkId: fileLinkId });
      return pendingLabelRequests.get(fileLinkId);
    }

    console.debug("[storages][version-badge] requesting label", { fileLinkId: fileLinkId });
    var request = window.fetch("/api/v3/file_links/" + fileLinkId, {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    })
      .then(function (response) {
        console.debug("[storages][version-badge] file_link response", {
          fileLinkId: fileLinkId,
          status: response.status
        });
        return response.json();
      })
      .then(function (data) {
        var value = data
          && data.originData
          && typeof data.originData.versionLabel === "string"
          && data.originData.versionLabel.trim();
        var label = value || "V";
        labelCache.set(fileLinkId, label);
        console.debug("[storages][version-badge] label resolved", {
          fileLinkId: fileLinkId,
          label: label,
          originData: data && data.originData ? data.originData : null
        });
        return label;
      })
      .catch(function (error) {
        console.warn("[storages][version-badge] label request failed", { fileLinkId: fileLinkId, error: error });
        labelCache.set(fileLinkId, "V");
        return "V";
      })
      .finally(function () {
        pendingLabelRequests.delete(fileLinkId);
      });

    pendingLabelRequests.set(fileLinkId, request);
    return request;
  }

  function paintRow(row) {
    if (row.closest(FILE_PICKER_MODAL_SELECTOR)) {
      var pickerBadge = row.querySelector("." + BADGE_CLASS);
      if (pickerBadge) {
        pickerBadge.remove();
      }
      return false;
    }

    var title = row.querySelector(".spot-list--item-title.op-file-list--item-title");
    if (!title) {
      return false;
    }

    var badge = title.querySelector("." + BADGE_CLASS);
    if (!badge) {
      var badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      badge.textContent = "V";
      badge.title = "Versión de archivo V";
      title.insertBefore(badge, title.firstChild);

      var rowLabelId = badgeTargetLabel(row);
      var detectedFileLinkId = fileLinkIdFromRow(row);
      console.debug("[storages][version-badge] badge injected", {
        fileLinkOrFileId: rowLabelId,
        fileLinkId: detectedFileLinkId
      });
    }

    var fileLinkId = fileLinkIdFromRow(row);
    loadVersionLabel(fileLinkId).then(function (label) {
      if (!document.body.contains(row)) {
        return;
      }

      var currentBadge = title.querySelector("." + BADGE_CLASS);
      if (!currentBadge) {
        return;
      }

      if (currentBadge.textContent !== label) {
        currentBadge.textContent = label;
        currentBadge.title = "Versión de archivo " + label;
        console.debug("[storages][version-badge] badge updated", { fileLinkId: fileLinkId, label: label });
      }
    });

    return true;
  }

  function paintAll() {
    var rows = document.querySelectorAll("li[data-test-selector='file-list--item'], .op-file-list--item");
    var painted = 0;

    rows.forEach(function (row) {
      if (paintRow(row)) {
        painted += 1;
      }
    });

    if (painted > 0) {
      console.debug("[storages][version-badge] rows painted", painted);
    }
  }

  function boot() {
    ensureStyles();
    paintAll();

    var observer = new MutationObserver(function () {
      paintAll();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.__storagesVersionBadgeObserver = observer;
    console.debug("[storages][version-badge] injector active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
