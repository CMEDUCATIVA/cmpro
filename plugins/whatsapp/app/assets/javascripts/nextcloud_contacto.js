(function () {
  "use strict";

  if (window.nextcloudContactoBooted) return;
  window.nextcloudContactoBooted = true;
  var NC_CONTACTO_VERSION = "2026-03-01-07:35";

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function jsonFetch(url, options) {
    var opts = options || {};
    opts.headers = opts.headers || {};
    opts.headers["Accept"] = "application/hal+json, application/json";
    if (opts.body && !opts.headers["Content-Type"]) {
      opts.headers["Content-Type"] = "application/json";
    }
    opts.credentials = "same-origin";
    console.log("[NC] fetch", { url: url, method: (opts.method || "GET"), body: opts.body || null });
    return fetch(url, opts).then(function (res) {
      console.log("[NC] fetch.response", { url: url, status: res.status });
      serverLog("NC.fetch.response", { url: url, status: res.status });
      if (!res.ok) {
        var err = new Error("Request failed");
        err.status = res.status;
        err.url = url;
        throw err;
      }
      return res.json();
    }).catch(function (err) {
      serverLog("NC.fetch.error", { url: url, message: err && err.message, status: err && err.status });
      throw err;
    });
  }


  function getCsrfToken() {
    var meta = document.querySelector("meta[name='csrf-token']");
    return meta ? meta.getAttribute("content") : null;
  }

  function getCurrentUserId() {
    var meta = document.querySelector("meta[name='current-user-id']");
    if (meta && meta.getAttribute("content")) return meta.getAttribute("content");
    meta = document.querySelector("meta[name='current-user']");
    if (meta && meta.getAttribute("content")) return meta.getAttribute("content");
    var shell = document.querySelector(".contacto-shell");
    if (shell && shell.getAttribute("data-contacto-user-id")) {
      return shell.getAttribute("data-contacto-user-id");
    }
    var body = document.body || {};
    if (body.dataset) {
      if (body.dataset.currentUserId) return body.dataset.currentUserId;
      if (body.dataset.userId) return body.dataset.userId;
    }
    var html = document.documentElement || {};
    if (html.dataset) {
      if (html.dataset.currentUserId) return html.dataset.currentUserId;
      if (html.dataset.userId) return html.dataset.userId;
    }
    return null;
  }

  function serverLog(label, payload) {
    try {
      var projectIdentifier = getProjectIdentifier();
      if (!projectIdentifier) return;
      var url = "/projects/" + projectIdentifier + "/whatsapp/debug";
      var token = getCsrfToken();
      var data = payload || {};
      if (typeof data === "object" && data !== null) {
        data._userId = getCurrentUserId();
        data._path = window.location && window.location.pathname ? window.location.pathname : "";
      }
      var body = JSON.stringify({ label: label, payload: data, csrf_token: token });
      fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': token || ''
        },
        body: body,
      });
    } catch (e) {
      // ignore
    }
  }

  function getProjectId() {
    var shell = document.querySelector(".contacto-shell");
    if (!shell) return null;
    return shell.getAttribute("data-contacto-project");
  }

  function getProjectIdentifier() {
    var match = window.location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }

  function projectStorageSettingsUrl(identifier) {
    if (!identifier) return null;
    return "/projects/" + identifier + "/settings/storages";
  }

  function parseIdFromHref(href) {
    if (!href) return null;
    var parts = href.split("/");
    return parts[parts.length - 1];
  }

  function normalizeParentValue(value) {
    if (!value) return "/";
    if (typeof value === "string" && value.indexOf("%") !== -1) {
      try {
        return decodeURIComponent(value);
      } catch (e) {
        return value;
      }
    }
    return value;
  }

  var ncPickerContext = null;

  function hasOfficialPicker() {
    return !!(window.customElements && window.customElements.get && window.customElements.get("opce-storage-location-picker"));
  }

  function openOfficialPicker() {
    var ctx = ncPickerContext;
    var container = ctx && ctx.container ? ctx.container : document;
    var picker = container.querySelector ? container.querySelector("[data-nc-picker]") : null;
    if (!picker || !hasOfficialPicker()) {
      serverLog("NC.picker.open", { ok: false, reason: "missing_custom_element", has_picker_el: !!picker });
      return false;
    }

    try {
      if (ctx && ctx.state) {
        var storageId = ctx.state.selectedStorage && (ctx.state.selectedStorage.storageId || ctx.state.selectedStorage.id);
        if (storageId) picker.setAttribute("storage-id", storageId);
        if (ctx.state.projectId) picker.setAttribute("project-id", ctx.state.projectId);
      }
      if (typeof picker.open === "function") {
        picker.open();
      } else {
        picker.dispatchEvent(new CustomEvent("opce-open", { bubbles: true }));
      }
      serverLog("NC.picker.open", { ok: true });
      return true;
    } catch (e) {
      serverLog("NC.picker.open", { ok: false, reason: "exception" });
      return false;
    }
  }

  function buildPanel(container) {
    if (!container || container.dataset.nextcloudInit === "true") return false;
    container.dataset.nextcloudInit = "true";
    container.innerHTML = "";
    return false;
  }

  function initPanel(container) {
    if (!container) return;
    if (container.dataset.nextcloudBound === "true") return;
    var drawer = container.closest(".contacto-drawer");
    if (drawer && !drawer.classList.contains("is-open")) return;
    if (buildPanel(container) === false) return;
    container.dataset.nextcloudBound = "true";
    console.log("[NC] panel.init", { panel: drawer ? drawer.getAttribute("data-contacto-panel") : "unknown" });
    serverLog("NC.panel.init", { panel: drawer ? drawer.getAttribute("data-contacto-panel") : "unknown" });

    var projectId = getProjectId();
    var projectIdentifier = getProjectIdentifier();
    var storageSelect = container.querySelector("[data-nc-storage]");
    var folderInput = container.querySelector("[data-nc-folder-input]");
    var pickerEl = container.querySelector("[data-nc-picker]");
    var dropZone = container.querySelector("[data-nc-drop]");
    var fileInput = container.querySelector("[data-nc-file]");
    var filesWrap = container.querySelector("[data-nc-files]");
    var hint = container.querySelector("[data-nc-hint]");
    var modal = container.querySelector("[data-nc-modal]");
    var modalList = container.querySelector("[data-nc-modal-list]");
    var modalBreadcrumb = container.querySelector("[data-nc-modal-breadcrumb]");
    var modalClose = container.querySelector("[data-nc-modal-close]");
    var modalCancel = container.querySelector("[data-nc-modal-cancel]");
    var modalSelect = container.querySelector("[data-nc-modal-select]");
    var modalNew = container.querySelector("[data-nc-modal-new]");
    var hasFolderUI = !!folderInput;

    var state = {
      storages: [],
      folders: [],
      entries: [],
      selectedStorage: null,
      selectedFolder: { id: "/", name: "/ (Raiz)", nav: "/" },
      folderStack: [{ id: "/", name: "/ (Raiz)", nav: "/" }],
      pendingFiles: [],
      contactId: null,
      projectId: projectId,
      projectIdentifier: projectIdentifier
    };

    ncPickerContext = { container: container, state: state };

    function updateContactId() {
      var form = drawer ? drawer.querySelector("[data-contacto-edit-form]") : null;
      var id = form ? form.getAttribute("data-contacto-id") : null;
      state.contactId = id;
      console.log("[NC] contact.id", { id: id });
      serverLog("NC.contact.id", { id: id });
      if (!state.contactId) {
        hint.textContent = "Guarda el contacto para habilitar la subida de archivos.";
      } else {
        hint.textContent = "";
      }
    }

    function updatePickerAvailability() {
      var available = hasOfficialPicker();
      if (available) {
        container.classList.add('contacto-nc--official');
        if (folderInput) folderInput.setAttribute('readonly', 'readonly');
      } else {
        container.classList.remove('contacto-nc--official');
        if (folderInput) folderInput.setAttribute('readonly', 'readonly');
      }
      console.log('[NC] picker.available', { available: available });
      serverLog('NC.picker.available', { available: available });
    }

    if (hasFolderUI) {
      // carpeta solo se define cuando se seleccione archivo(s)
    }

    dropZone.addEventListener("click", function (event) {
      if (event.target === fileInput) return;
      serverLog("NC.drop.click", { target: event.target && event.target.tagName ? event.target.tagName : null });
      if (typeof openOfficialPicker === "function") {
        var opened = openOfficialPicker();
        serverLog("NC.drop.open_picker", { opened: opened });
        if (opened) return;
      } else {
        serverLog("NC.drop.open_picker", { opened: false, reason: "openOfficialPicker_not_defined" });
      }
      fileInput.click();
    });

    dropZone.addEventListener("dragover", function (event) {
      event.preventDefault();
      dropZone.classList.add("is-dragover");
    });

    dropZone.addEventListener("dragleave", function () {
      dropZone.classList.remove("is-dragover");
    });

    dropZone.addEventListener("drop", function (event) {
      event.preventDefault();
      dropZone.classList.remove("is-dragover");
      var files = Array.from(event.dataTransfer.files || []);
      state.pendingFiles = files;
      serverLog("NC.files.pending", { count: files.length, via: "drop" });
      openPickerModal();
    });

    fileInput.addEventListener("change", function () {
      var files = Array.from(fileInput.files || []);
      state.pendingFiles = files;
      serverLog("NC.files.pending", { count: files.length, via: "input" });
      openPickerModal();
      fileInput.value = "";
    });

    fileInput.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    updateContactId();
    if (drawer) {
      try {
        var contactObserver = new MutationObserver(function () {
          var form = drawer.querySelector("[data-contacto-edit-form]");
          if (form && form.getAttribute("data-contacto-id")) {
            updateContactId();
          }
        });
        contactObserver.observe(drawer, { childList: true, subtree: true });
      } catch (e) {}
    }
    fetchStoragesOnce().then(function (storages) {
      state.storages = storages || [];
      renderStorageOptions();
      if (hasFolderUI) { updatePickerAvailability(); }
      if (folderInput) {
        updateFolderInput();
      }
    });
    loadContactFiles();

    if (modalClose) {
      modalClose.addEventListener("click", closePickerModal);
    }
    if (modalCancel) {
      modalCancel.addEventListener("click", closePickerModal);
    }
    if (modalSelect) {
      modalSelect.addEventListener("click", function () {
        serverLog("NC.modal.select_click", { pending: state.pendingFiles ? state.pendingFiles.length : 0 });
        applySelectedFolder();
        closePickerModal();
      });
    }
    if (modalNew) {
      modalNew.addEventListener("click", function () {
        var storageId = state.selectedStorage && (state.selectedStorage.storageId || state.selectedStorage.id);
        if (!storageId) return;
        var name = window.prompt("Nombre de la carpeta");
        if (!name) return;
        var parentId = normalizeParentValue(currentParentId());
        serverLog("NC.modal.new_folder", { storageId: storageId, parent: parentId, name: name });
        var payload = { name: name };
        if (/^\d+$/.test(String(parentId))) {
          payload.parentId = String(parentId);
        } else if (parentId && parentId !== "/") {
          payload.parent = String(parentId);
        }
        fetch("/api/v3/storages/" + storageId + "/folders", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (!res.ok) {
            return res.text().then(function (text) {
              serverLog("NC.modal.new_folder_error", { status: res.status, body: text });
              throw new Error("create folder failed");
            });
          }
          return res.json();
        }).then(function (created) {
          serverLog("NC.modal.new_folder_done", { id: created && created.id, name: name });
          var createdId = created && (created.id || created.fileId || created.file_id) || name;
          state.folderStack.push({ id: createdId, name: name, nav: createdId });
          state.selectedFolder = { id: createdId, name: name, nav: createdId };
          loadModalEntries(state.selectedFolder.nav || state.selectedFolder.id);
        });
      });
    }

    function applySelectedFolder() {
      updateContactId();
      updateFolderInput();
      if (state.pendingFiles && state.pendingFiles.length) {
        state.pendingFiles.forEach(uploadFile);
        state.pendingFiles = [];
      }
      serverLog("NC.modal.select_folder", { folder: state.selectedFolder, contactId: state.contactId });
    }

    function updateFolderInput() {
      if (!folderInput) return;
      folderInput.value = state.selectedFolder && state.selectedFolder.name ? state.selectedFolder.name : "";
    }

    function openPickerModal() {
      if (!modal) return;
      modal.classList.remove("is-hidden");
      serverLog("NC.modal.open", { storage: state.selectedStorage && state.selectedStorage.storageId });
      if (!state.selectedStorage) {
        if (modalList) {
          modalList.innerHTML = '<div class="contacto-nc-modal-empty">Cargando carpetas...</div>';
        }
        serverLog("NC.modal.no_storage", { storages: state.storages ? state.storages.length : 0 });
        fetchStoragesOnce().then(function (storages) {
          state.storages = storages || [];
          serverLog("NC.modal.storages_loaded", { count: state.storages.length });
          renderStorageOptions();
          if (hasFolderUI) { updatePickerAvailability(); }
          loadModalEntries(currentParentId());
        });
        return;
      }
      loadModalEntries(currentParentId());
    }

    function closePickerModal() {
      if (!modal) return;
      modal.classList.add("is-hidden");
      serverLog("NC.modal.close", {});
    }

    function currentParentId() {
      if (state.folderStack.length === 0) return "/";
      var last = state.folderStack[state.folderStack.length - 1];
      return (last && (last.nav || last.id)) || "/";
    }

    function loadModalEntries(parentId) {
      var storageId = state.selectedStorage && (state.selectedStorage.storageId || state.selectedStorage.id);
      if (!storageId) return;
      var parentValue = normalizeParentValue(parentId || "/");
      var url = "/api/v3/storages/" + storageId + "/files";
      if (parentValue && parentValue !== "/") {
        url += "?parent=" + encodeURIComponent(parentValue);
      }
      serverLog("NC.modal.load", { storageId: storageId, parent: parentValue, url: url });
      jsonFetch(url).then(function (data) {
        var embedded = data && data._embedded ? data._embedded : null;
        var elements = data && data.elements || [];
        if (!elements.length && data && data.files) {
          elements = data.files;
        }
        if (!elements.length && embedded) {
          elements = embedded.elements || embedded.storageFiles || embedded.storage_files || [];
        }
        serverLog("NC.modal.data_keys", { keys: data ? Object.keys(data) : [], embedded_keys: embedded ? Object.keys(embedded) : [] });
        serverLog("NC.modal.raw", { count: elements.length, embedded_keys: embedded ? Object.keys(embedded) : [] });
        state.entries = elements.map(normalizeEntry).filter(Boolean);
        syncFolderStackFromResponse(data);
        serverLog("NC.modal.entries", { count: state.entries.length });
        renderModalList();
      }).catch(function (err) {
        serverLog("NC.modal.load_error", { status: err && err.status, url: err && err.url });
      });
    }

    function normalizeEntry(item) {
      if (!item) return null;
      var name = item.name || item.title || item.fileName || "";
      var id = item.id || item.fileId || item.file_id || parseIdFromHref(item._links && item._links.self && item._links.self.href) || name;
      var type = item.type || item._type || "";
      var mime = item.mimeType || item.mime_type || "";
      var path = item.path || item.filePath || item.file_path || item.location || null;
      if (path) {
        path = normalizeParentValue(path);
      }
      var isFolder = type === "StorageFolder" ||
        type === "folder" ||
        item.isFolder === true ||
        item.isDirectory === true ||
        item.is_directory === true ||
        item.fileType === "folder" ||
        mime === "httpd/unix-directory" ||
        mime === "application/x-op-directory";
      if (!isFolder) {
        serverLog("NC.modal.entry_skip", { name: name, type: type, mime: mime });
      }
      return { id: id, name: name, isFolder: isFolder, mime: mime, nav: path || id, raw: item };
    }

    function syncFolderStackFromResponse(data) {
      if (!data) return;
      var parent = normalizeEntry(data.parent);
      var ancestors = Array.isArray(data.ancestors) ? data.ancestors.map(normalizeEntry).filter(Boolean) : [];
      var stack = [];
      ancestors.forEach(function (entry) {
        if (entry && entry.isFolder) stack.push({ id: entry.id, name: entry.name, nav: entry.nav || entry.id });
      });
      if (parent && parent.isFolder) {
        stack.push({ id: parent.id, name: parent.name, nav: parent.nav || parent.id });
      }
      if (stack.length) {
        state.folderStack = stack;
        state.selectedFolder = stack[stack.length - 1];
      }
    }

    function renderModalList() {
      if (!modalList) return;
      modalList.innerHTML = "";
      renderModalBreadcrumb();
      var entries = (state.entries || []).slice();
      if (!entries.length) {
        serverLog("NC.modal.empty", { parent: currentParentId() });
        modalList.innerHTML = '<div class="contacto-nc-modal-empty">Sin carpetas.</div>';
        return;
      }
      entries.sort(function (a, b) {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
      entries.forEach(function (entry) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "contacto-nc-modal-item" + (entry.isFolder ? " is-folder" : " is-file");
        row.innerHTML =
          '<span class="contacto-nc-modal-icon">' + getEntryIcon(entry) + "</span>" +
          '<span class="contacto-nc-modal-name"></span>' +
          (entry.isFolder ? '<span class="contacto-nc-modal-chevron">›</span>' : "");
        row.querySelector(".contacto-nc-modal-name").textContent = entry.name || "(sin nombre)";
        if (entry.isFolder) {
          row.addEventListener("click", function () {
            state.folderStack.push({ id: entry.id, name: entry.name, nav: entry.nav || entry.id });
            state.selectedFolder = { id: entry.id, name: entry.name, nav: entry.nav || entry.id };
            loadModalEntries(entry.nav || entry.id);
          });
        } else {
          row.disabled = true;
        }
        modalList.appendChild(row);
      });
    }

    function getEntryIcon(entry) {
      if (entry.isFolder) {
        return '<svg class="contacto-nc-icon contacto-nc-icon-folder" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.379a1.5 1.5 0 0 1 1.06.44l.621.62H13A1.5 1.5 0 0 1 14.5 4v8A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3z"/></svg>';
      }
      var mime = entry.mime || "";
      if (mime.indexOf("pdf") !== -1) return "📕";
      if (mime.indexOf("spreadsheet") !== -1 || mime.indexOf("excel") !== -1) return "📊";
      if (mime.indexOf("presentation") !== -1 || mime.indexOf("powerpoint") !== -1) return "📽️";
      if (mime.indexOf("word") !== -1) return "📝";
      if (mime.indexOf("image") !== -1) return "🖼️";
      if (mime.indexOf("drawio") !== -1) return "🧩";
      return "📄";
    }

    function renderModalBreadcrumb() {
      if (!modalBreadcrumb) return;
      modalBreadcrumb.innerHTML = "";
      state.folderStack.forEach(function (seg, idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "contacto-nc-modal-crumb";
        btn.textContent = seg.name;
        btn.addEventListener("click", function () {
          state.folderStack = state.folderStack.slice(0, idx + 1);
          state.selectedFolder = seg;
          loadModalEntries(seg.nav || seg.id);
        });
        modalBreadcrumb.appendChild(btn);
      });
    }

    function fetchStoragesOnce() {
      if (fetchStoragesOnce._promise) return fetchStoragesOnce._promise;
      fetchStoragesOnce._promise = jsonFetch("/api/v3/project_storages").then(function (data) {
        var elements = data && (data.elements || data._embedded && data._embedded.elements) || [];
        return elements.map(function (item) {
          var storageHref = item && item._links && item._links.storage && item._links.storage.href;
          return {
            projectStorageId: item.id || parseIdFromHref(item._links && item._links.self && item._links.self.href),
            storageId: parseIdFromHref(storageHref) || item.id || parseIdFromHref(item._links && item._links.self && item._links.self.href),
            name: item.name || (item._links && item._links.storage && item._links.storage.title) || "Storage"
          };
        });
      });
      return fetchStoragesOnce._promise;
    }

    function renderStorageOptions() {
      if (!storageSelect) return;
      storageSelect.innerHTML = "";
      (state.storages || []).forEach(function (storage, idx) {
        var opt = document.createElement("option");
        opt.value = storage.storageId;
        opt.textContent = storage.name || ("Storage " + storage.storageId);
        storageSelect.appendChild(opt);
        if (idx === 0) state.selectedStorage = storage;
      });
      storageSelect.addEventListener("change", function () {
        var selected = (state.storages || []).find(function (s) { return String(s.storageId) === String(storageSelect.value); });
        state.selectedStorage = selected || null;
        state.folderStack = [{ id: "/", name: "/ (Raiz)", nav: "/" }];
        state.selectedFolder = { id: "/", name: "/ (Raiz)", nav: "/" };
        updateFolderInput();
      });
    }

    function uploadFile(file) {
      if (!file || !state.selectedStorage) return;
      serverLog("NC.upload.start", { file: file.name, size: file.size, contactId: state.contactId });
      if (!state.contactId) {
        hint.textContent = "Guarda el contacto para habilitar la subida de archivos.";
        serverLog("NC.upload.skip", { reason: "missing_contact", file: file.name });
        return;
      }
      var storageId = state.selectedStorage.storageId;
      var parentId = state.selectedFolder && state.selectedFolder.id && state.selectedFolder.id !== "/" ? state.selectedFolder.id : null;
      var parentPath = state.selectedFolder && state.selectedFolder.nav ? state.selectedFolder.nav : "/";
      parentPath = normalizeParentValue(parentPath);
      var parent = parentId || parentPath;
      addPendingRow(file);
      var payload = {
        projectId: state.projectId,
        fileName: file.name,
        parent: parent
      };
      serverLog("NC.upload.prepare", { storageId: storageId, parent: parent, parentId: parentId, parentPath: parentPath, file: file.name });
      fetch("/api/v3/storages/" + storageId + "/files/prepare_upload", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/hal+json, application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }).then(function (res) {
        serverLog("NC.upload.prepare_response", { status: res.status, url: res.url || "" });
        if (!res.ok) {
          return res.text().then(function (text) {
            serverLog("NC.upload.prepare_error", { status: res.status, body: text, url: res.url || "" });
            var err = new Error("prepare_upload failed");
            err.status = res.status;
            err.url = res.url || ("/api/v3/storages/" + storageId + "/files/prepare_upload");
            err.stage = "prepare_upload";
            throw err;
          });
        }
        return res.json().catch(function () {
          serverLog("NC.upload.prepare_error", { status: res.status, body: "non-json response", url: res.url || "" });
          var err = new Error("prepare_upload invalid json");
          err.status = res.status;
          err.url = res.url || ("/api/v3/storages/" + storageId + "/files/prepare_upload");
          err.stage = "prepare_upload";
          throw err;
        });
      }).then(function (data) {
        var uploadUrl = data && (data.uploadUrl || data._links && data._links.upload && data._links.upload.href);
        if (!uploadUrl) throw new Error("uploadUrl missing");
        return fetch(uploadUrl, { method: "PUT", body: file });
      }).then(function (res) {
        if (res && !res.ok) {
          serverLog("NC.upload.put_error", { status: res.status, url: res.url || "" });
          var err = new Error("upload failed");
          err.status = res.status;
          err.url = res.url || "";
          err.stage = "upload_put";
          throw err;
        }
      }).then(function () {
        serverLog("NC.upload.done", { file: file.name });
        markRowDone(file);
      }).catch(function (err) {
        serverLog("NC.upload.error", { file: file.name, message: err && err.message, status: err && err.status, url: err && err.url });
        if (err && err.status === 401) {
          if (err.stage === "prepare_upload") {
            hint.textContent = "Inicia sesion en Nextcloud (token del usuario) desde Configuracion del proyecto.";
          } else {
            hint.textContent = "Inicia sesion en Nextcloud desde Configuracion del proyecto.";
          }
        }
        markRowError(file);
      });
    }

    function loadContactFiles() {
      if (filesWrap) {
        filesWrap.textContent = "Sin archivos.";
      }
    }

    function addPendingRow(file) {
      if (!filesWrap) return;
      if (filesWrap.textContent === "Sin archivos.") {
        filesWrap.textContent = "";
      }
      var row = document.createElement("div");
      row.className = "contacto-nc-file-row is-pending";
      row.dataset.fileName = file.name;
      row.innerHTML = '<span class="contacto-nc-file-name"></span><span class="contacto-nc-file-size">Subiendo...</span>';
      row.querySelector(".contacto-nc-file-name").textContent = file.name;
      filesWrap.appendChild(row);
    }

    function markRowDone(file) {
      if (!filesWrap) return;
      var row = filesWrap.querySelector('[data-file-name="' + cssEscape(file.name) + '"]');
      if (!row) return;
      row.classList.remove("is-pending");
      var size = file.size ? Math.round(file.size / 1024) + " KB" : "";
      var sizeEl = row.querySelector(".contacto-nc-file-size");
      if (sizeEl) sizeEl.textContent = size;
    }

    function markRowError(file) {
      if (!filesWrap) return;
      var row = filesWrap.querySelector('[data-file-name="' + cssEscape(file.name) + '"]');
      if (!row) return;
      row.classList.remove("is-pending");
      row.classList.add("is-error");
      var sizeEl = row.querySelector(".contacto-nc-file-size");
      if (sizeEl) sizeEl.textContent = "Error";
    }

    function cssEscape(value) {
      if (window.CSS && CSS.escape) return CSS.escape(value);
      return String(value).replace(/\"/g, '\\"');
    }
  }


  function initOpenPanelsOnce() {
    if (document.body.dataset.nextcloudContactoPanelsInit === "true") return;
    document.body.dataset.nextcloudContactoPanelsInit = "true";
    var createExtra = document.querySelector("[data-contacto-panel='create'] .contacto-edit-extra");
    var editExtra = document.querySelector("[data-contacto-panel='edit'] .contacto-edit-extra");
    initPanel(createExtra);
    initPanel(editExtra);
  }

  onReady(function () {
    serverLog("NC.boot", { version: NC_CONTACTO_VERSION, userId: getCurrentUserId() });
    setTimeout(initOpenPanelsOnce, 0);
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-contacto-toggle='create']")) {
        document.body.dataset.nextcloudContactoPanelsInit = "";
        setTimeout(initOpenPanelsOnce, 0);
      }
      if (event.target.closest("[data-contacto-edit='true']")) {
        document.body.dataset.nextcloudContactoPanelsInit = "";
        setTimeout(initOpenPanelsOnce, 0);
      }
    });
  });
})();





