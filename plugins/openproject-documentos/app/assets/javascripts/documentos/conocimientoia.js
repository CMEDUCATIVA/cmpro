(function() {
  const LOG_URL = '/documentos/log';

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function fallbackLogToServer(message, data) {
    const payload = typeof message === 'object'
      ? message
      : { level: 'info', message: message, data: data };
    const headers = { 'Content-Type': 'application/json' };
    const token = getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    fetch(LOG_URL, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  const DocumentosDebug = window.DocumentosDebug || {};
  const logToServer = DocumentosDebug.logToServer || fallbackLogToServer;
  const DocumentosSubida = window.DocumentosSubida || {};

  console.info('[Documentos] conocimientoia.js cargado');

  const LIGHTRAG_PROXY_URL = '/documentos/upload_lightrag';
  const CONFIG_STORAGE_KEY = 'documentos.lightrag.config';
  const LIGHTRAG_CONFIG_URL = '/documentos/config';
  const LIGHRAG_DOCS_URL = '/documentos/lightrag_documents';
  const LIGHRAG_TRACK_URL = '/documentos/lightrag_track_status';
  const PENDING_DOCS_KEY = 'documentos.lightrag.pending_docs';
  const TRACK_POLL_INTERVAL = 5000;
  const TRACK_MAX_ATTEMPTS = 12;

  const iaStatusHandlers = [];

  function notifyIaStatus(state, payload) {
    iaStatusHandlers.forEach((handler) => {
      try {
        handler(state, payload || {});
      } catch (e) {
        // ignore UI handler errors
      }
    });
  }

  function firstPendingFilename() {
    const pending = loadPendingDocs();
    const entry = pending.find((item) => item && item.trackId && !item.docId);
    return entry ? entry.filename : '';
  }
  const ALLOWED_EXT = [
    'txt','md','docx','pdf','pptx','xlsx','rtf','odt','epub','html','htm','tex','json','xml','yaml','yml','csv','log','conf','ini','properties','sql','bat','sh','c','cpp','py','java','js','ts','swift','go','rb','php','css','scss','less'
  ];
  const ALLOWED_EXT_LABEL = 'TXT, MD, DOCX, PDF, PPTX, XLSX, RTF, ODT, EPUB, HTML, HTM, TEX, JSON, XML, YAML, YML, CSV, LOG, CONF, INI, PROPERTIES, SQL, BAT, SH, C, CPP, PY, JAVA, JS, TS, SWIFT, GO, RB, PHP, CSS, SCSS, LESS';

  function showFloatingNotice(message, type) {
    const existing = document.querySelector('.documentos-float-notice');
    if (existing) existing.remove();
    const notice = document.createElement('div');
    notice.className = 'documentos-float-notice';
    notice.textContent = message;
    notice.style.position = 'fixed';
    notice.style.top = '16px';
    notice.style.right = '16px';
    notice.style.zIndex = '3000';
    notice.style.background = type === 'error' ? '#b91c1c' : '#0f766e';
    notice.style.color = '#fff';
    notice.style.padding = '10px 12px';
    notice.style.borderRadius = '6px';
    notice.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    notice.style.fontSize = '13px';
    notice.style.maxWidth = '320px';
    notice.style.lineHeight = '1.4';
    document.body.appendChild(notice);
    setTimeout(() => {
      if (notice.parentNode) notice.remove();
    }, 4000);
  }

  function getFileExtFromName(name) {
    const raw = (name || '').trim();
    const idx = raw.lastIndexOf('.');
    if (idx <= 0 || idx === raw.length - 1) return '';
    return raw.slice(idx + 1).toLowerCase();
  }

  function normalizeName(name) {
    return (name || '').toString().trim();
  }

  function loadPendingDocs() {
    try {
      const raw = localStorage.getItem(PENDING_DOCS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function savePendingDocs(list) {
    try {
      localStorage.setItem(PENDING_DOCS_KEY, JSON.stringify(list || []));
    } catch (e) {
      // ignore storage errors
    }
  }

  function storePendingDoc(filename, docId, trackId) {
    const cleanName = normalizeName(filename);
    const cleanDocId = normalizeName(docId);
    const cleanTrack = normalizeName(trackId);
    if (!cleanName) return;
    const now = Date.now();
    const list = loadPendingDocs().filter((entry) => entry && entry.filename);
    const withoutDup = list.filter((entry) => entry.filename !== cleanName);
    withoutDup.push({
      filename: cleanName,
      docId: cleanDocId,
      trackId: cleanTrack,
      ts: now,
      attempts: 0,
      lastChecked: 0
    });
    savePendingDocs(withoutDup);
  }

  function extractDocId(json) {
    if (!json || typeof json !== 'object') return '';
    return json.doc_id || json.docId || json.document_id || json.id || '';
  }

  function extractDocIdFromTrack(json) {
    if (!json || typeof json !== 'object') return '';
    const direct = extractDocId(json);
    if (direct) return direct;
    if (json.data && typeof json.data === 'object') {
      return extractDocId(json.data);
    }
    if (json.document && typeof json.document === 'object') {
      return extractDocId(json.document);
    }
    if (Array.isArray(json.documents) && json.documents.length > 0) {
      return extractDocId(json.documents[0]);
    }
    return '';
  }

  function registerUploadResult(filename, json) {
    const docId = extractDocId(json);
    const trackId = (json && (json.track_id || json.trackId)) || '';
    logToServer('IA upload respuesta', {
      filename: filename || '',
      doc_id: docId || '',
      track_id: trackId || '',
      status: json && json.status ? json.status : ''
    });
    if (!docId) {
      logToServer('IA upload sin doc_id', { filename: filename || '', keys: Object.keys(json || {}) });
      if (trackId) {
        storePendingDoc(filename, '', trackId);
        notifyIaStatus('processing', { filename: filename || '' });
        startTrackPolling();
      }
      return;
    }
    storePendingDoc(filename, docId, trackId);
    logToServer('IA upload doc_id guardado', { filename: filename || '', doc_id: docId });
    notifyIaStatus('ready', { filename: filename || '' });
    scheduleScan();
  }

  function fetchLightragDocs(ids) {
    if (!ids || !ids.length) return Promise.resolve([]);
    const params = encodeURIComponent(ids.join(','));
    return fetch(`${LIGHRAG_DOCS_URL}?file_link_ids=${params}`, { credentials: 'same-origin' })
      .then((resp) => (resp.ok ? resp.json() : []))
      .catch(() => []);
  }

  function fetchTrackStatus(trackId) {
    if (!trackId) return Promise.resolve({});
    return fetch(`${LIGHRAG_TRACK_URL}/${encodeURIComponent(trackId)}`, { credentials: 'same-origin' })
      .then((resp) => (resp.ok ? resp.json() : {}))
      .catch(() => ({}));
  }

  function extractFileLinkIdFromHref(href) {
    const match = (href || '').match(/\/api\/v3\/file_links\/(\d+)/);
    return match ? match[1] : '';
  }

  function getFileNameForActions(actionsNode) {
    if (!actionsNode) return '';
    const root = actionsNode.closest('spot-tooltip') || actionsNode.closest('.spot-list--item-floating-wrapper') || actionsNode.parentElement;
    const nameNode = root ? root.querySelector('.spot-list--item-title .ellipsis') : null;
    return nameNode ? normalizeName(nameNode.textContent) : '';
  }

  function ensureDeleteButton(actionsNode, fileLinkId, fileName) {
    if (!actionsNode || !fileLinkId) return;
    if (actionsNode.querySelector('.documentos-ia-delete')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spot-link spot-link_octicon documentos-ia-delete';
    button.setAttribute('aria-label', 'Eliminar de IA');
    button.title = 'Eliminar de IA';
    button.style.border = 'none';
    button.style.background = 'transparent';
    button.style.padding = '0';
    button.style.margin = '0';
    button.innerHTML = '<svg class="octicon" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false" style="transform:translateY(-2px); display:block;"><path d="M6 2.75A1.75 1.75 0 0 1 7.75 1h.5A1.75 1.75 0 0 1 10 2.75V3h3.25a.75.75 0 0 1 0 1.5h-.5v8.25A2.25 2.25 0 0 1 10.5 15h-5A2.25 2.25 0 0 1 3.25 12.75V4.5h-.5a.75.75 0 0 1 0-1.5H6v-.25ZM4.75 4.5v8.25c0 .414.336.75.75.75h5a.75.75 0 0 0 .75-.75V4.5h-6.5ZM6.5 6.5a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4a.75 0 0 1 .75-.75Zm3 0a.75.75 0 0 1 .75.75v4a.75 0 0 1-1.5 0v-4a.75 0 0 1 .75-.75ZM7.5 3v-.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25V3h-1Z"></path></svg>';
    button.addEventListener('click', () => {
      logToServer('IA delete click', { file_link_id: fileLinkId, filename: fileName || '' });
      const headers = { 'Content-Type': 'application/json' };
      const token = getCsrfToken();
      if (token) headers['X-CSRF-Token'] = token;
      button.disabled = true;
      fetch(`${LIGHRAG_DOCS_URL}/${encodeURIComponent(fileLinkId)}`, {
        method: 'DELETE',
        headers: headers,
        body: JSON.stringify({ delete_file: false, delete_llm_cache: false })
      })
        .then((resp) => (resp.ok ? resp.json() : resp.json().catch(() => ({})).then((body) => { throw new Error(body.error || `Error ${resp.status}`); })))
        .then(() => {
          showFloatingNotice('Documento eliminado de la IA.', 'success');
          fileLinkCache.delete(fileLinkId.toString());
          button.remove();
        })
        .catch((err) => {
          showFloatingNotice('No se pudo eliminar de la IA: ' + err.message, 'error');
          button.disabled = false;
        });
    });

    if (actionsNode.firstChild) {
      actionsNode.insertBefore(button, actionsNode.firstChild);
    } else {
      actionsNode.appendChild(button);
    }
  }

  let scanTimer = null;
  const fileLinkCache = new Map();

  function attemptLinkPendingDoc(fileLinkId, fileName) {
    const cleanName = normalizeName(fileName);
    if (!cleanName || !fileLinkId) return;
    const pending = loadPendingDocs();
    const match = pending.find((entry) => entry && entry.filename === cleanName);
    if (!match) return;
    if (!match.docId) return;

    const payload = {
      file_link_id: fileLinkId,
      filename: cleanName,
      doc_id: match.docId
    };
    fetch(LIGHRAG_DOCS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then((resp) => (resp.ok ? resp.json() : resp.json().catch(() => ({}))))
      .then(() => {
        const remaining = pending.filter((entry) => entry.filename !== cleanName);
        savePendingDocs(remaining);
        fileLinkCache.set(fileLinkId.toString(), true);
        logToServer('IA doc_id asociado a file_link', { file_link_id: fileLinkId, filename: cleanName });
        scheduleScan();
      })
      .catch(() => {});
  }

  let trackTimer = null;
  let trackPollingActive = false;

  function pollTrackStatus() {
    const pending = loadPendingDocs();
    const toCheck = pending.filter((entry) => entry && entry.trackId && !entry.docId);
    if (!toCheck.length) {
      stopTrackPolling('sin pendientes');
      return;
    }

    const now = Date.now();
    const eligible = toCheck.filter((entry) => (entry.attempts || 0) < TRACK_MAX_ATTEMPTS);
    if (!eligible.length) {
      stopTrackPolling('max intentos alcanzado');
      return;
    }

    Promise.all(
      eligible.map((entry) => {
        entry.attempts = (entry.attempts || 0) + 1;
        entry.lastChecked = now;
        return fetchTrackStatus(entry.trackId).then((json) => ({ entry, json }));
      })
    ).then((results) => {
      let updated = false;
      results.forEach(({ entry, json }) => {
        const docId = extractDocIdFromTrack(json);
        if (!docId) return;
        entry.docId = docId;
        updated = true;
        logToServer('IA track_status doc_id', {
          filename: entry.filename || '',
          track_id: entry.trackId || '',
          doc_id: docId
        });
        notifyIaStatus('ready', { filename: entry.filename || '' });
      });
      savePendingDocs(pending);
      if (updated) {
        scheduleScan();
      }
      if (!pending.some((entry) => entry && entry.trackId && !entry.docId)) {
        stopTrackPolling('resueltos');
      }
    }).catch(() => {});
  }

  function startTrackPolling() {
    if (trackPollingActive) return;
    trackPollingActive = true;
    logToServer('IA track polling start');
    notifyIaStatus('processing');
    pollTrackStatus();
    trackTimer = setInterval(pollTrackStatus, TRACK_POLL_INTERVAL);
  }

  function stopTrackPolling(reason) {
    if (!trackPollingActive) return;
    trackPollingActive = false;
    if (trackTimer) {
      clearInterval(trackTimer);
      trackTimer = null;
    }
    logToServer('IA track polling stop', { reason: reason || '' });
    if (reason === 'max intentos alcanzado') {
      notifyIaStatus('waiting', { filename: firstPendingFilename() });
    }
  }

  function scanFileLinks() {
    const actionNodes = Array.from(document.querySelectorAll('.spot-list--item-floating-actions'));
    if (!actionNodes.length) return;

    const idsToFetch = [];
    actionNodes.forEach((node) => {
      if (!node) return;
      let fileLinkId = node.dataset.documentosIaFileLinkId || '';
      if (!fileLinkId) {
        const link = node.querySelector('a[href*="/api/v3/file_links/"]');
        fileLinkId = extractFileLinkIdFromHref(link ? link.getAttribute('href') : '');
        if (fileLinkId) {
          node.dataset.documentosIaFileLinkId = fileLinkId;
        }
      }
      if (!fileLinkId) return;
      const name = getFileNameForActions(node);
      if (node.dataset.documentosIaPendingLinked !== '1') {
        attemptLinkPendingDoc(fileLinkId, name);
        node.dataset.documentosIaPendingLinked = '1';
      }
      ensureDeleteButton(node, fileLinkId, name);
      if (!fileLinkCache.has(fileLinkId)) {
        idsToFetch.push(fileLinkId);
      }
    });

    if (!idsToFetch.length) return;
    fetchLightragDocs(idsToFetch).then((list) => {
      (list || []).forEach((entry) => {
        if (!entry || !entry.file_link_id) return;
        fileLinkCache.set(entry.file_link_id.toString(), true);
      });
      actionNodes.forEach((node) => {
        const fileLinkId = node.dataset.documentosIaFileLinkId;
        if (!fileLinkId) return;
        if (!fileLinkCache.has(fileLinkId)) return;
        const name = getFileNameForActions(node);
        ensureDeleteButton(node, fileLinkId, name);
      });
    });
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanFileLinks, 400);
  }

  function initFileLinkObserver() {
    scheduleScan();
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function loadLightragConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        url: parsed.url || '',
        token: parsed.token || '',
        apiKey: parsed.apiKey || ''
      };
    } catch (e) {
      console.warn('[Documentos] No se pudo leer configuracion LightRAG', e);
      return { url: '', token: '', apiKey: '' };
    }
  }

  function fetchServerConfig() {
    return fetch(LIGHTRAG_CONFIG_URL, { credentials: 'same-origin' })
      .then(resp => resp.ok ? resp.json() : {})
      .then((data) => {
        logToServer('Config IA cargada desde servidor', {
          hasUrl: !!(data && data.url),
          hasToken: !!(data && data.token),
          hasApiKey: !!(data && (data.api_key || data.apiKey))
        });
        return data;
      })
      .catch((err) => {
        logToServer('Config IA error al cargar', { message: err && err.message });
        return {};
      });
  }

  function persistConfigServerSide(cfg) {
    const csrf = document.querySelector('meta[name=\"csrf-token\"]');
    const headers = { 'Content-Type': 'application/json' };
    if (csrf) headers['X-CSRF-Token'] = csrf.getAttribute('content');

    return fetch(LIGHTRAG_CONFIG_URL, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify(cfg)
    }).catch(err => {
      console.warn('[Documentos] No se pudo guardar config en servidor', err);
    });
  }

  function saveLightragConfig(cfg) {
    const payload = {
      url: cfg.url || '',
      token: cfg.token || '',
      apiKey: cfg.apiKey || ''
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
    console.info('[Documentos] Configuracion LightRAG guardada en localStorage');
    return payload;
  }

  function buildConfigPanel(actionBar, options = {}) {
    if (!actionBar || actionBar.querySelector('.documentos-config-panel')) return null;

    let cfg = loadLightragConfig();

    const panel = document.createElement('div');
    panel.className = 'documentos-config-panel';
    panel.style.display = 'none';
    panel.style.gridColumn = '1 / -1';
    panel.style.border = '1px solid #ddd';
    panel.style.borderRadius = '8px';
    panel.style.padding = '10px';
    panel.style.marginTop = '8px';
    panel.style.background = '#f9f9f9';
    panel.style.gap = '8px';
    panel.style.flexDirection = 'column';

    const title = document.createElement('div');
    title.textContent = 'Configuracion LightRAG';
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';

    function createField(labelText, initialValue, key) {
      const wrapper = document.createElement('label');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '4px';

      const label = document.createElement('span');
      label.textContent = labelText;
      label.style.fontWeight = '600';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = initialValue || '';
      input.placeholder = labelText;
      input.style.padding = '6px';
      input.style.border = '1px solid #ccc';
      input.style.borderRadius = '6px';
      input.dataset.cfgKey = key;

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      return { wrapper, input };
    }

    const urlField = createField('URL LightRAG', cfg.url, 'url');
    const tokenField = createField('Token (Bearer)', cfg.token, 'token');
    const apiKeyField = createField('API Key', cfg.apiKey, 'apiKey');

    fetchServerConfig().then(serverCfg => {
      if (!serverCfg) return;
      const merged = {
        url: serverCfg.url || '',
        token: serverCfg.token || '',
        apiKey: serverCfg.api_key || serverCfg.apiKey || ''
      };
      cfg = saveLightragConfig(merged);
      urlField.input.value = cfg.url;
      tokenField.input.value = cfg.token;
      apiKeyField.input.value = cfg.apiKey;
    });

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '8px';
    buttons.style.marginTop = '6px';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Guardar';
    saveBtn.dataset.documentosSave = '1';
    saveBtn.style.padding = '6px 12px';
    saveBtn.style.borderRadius = '6px';
    saveBtn.style.border = '1px solid #0a74da';
    saveBtn.style.background = '#0a74da';
    saveBtn.style.color = '#fff';
    saveBtn.style.cursor = 'pointer';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Vaciar';
    resetBtn.style.padding = '6px 12px';
    resetBtn.style.borderRadius = '6px';
    resetBtn.style.border = '1px solid #ccc';
    resetBtn.style.background = '#fff';
    resetBtn.style.cursor = 'pointer';

    const status = document.createElement('div');
    status.style.fontSize = '12px';
    status.style.color = '#555';
    status.style.marginTop = '4px';

    saveBtn.addEventListener('click', function() {
      const newCfg = {
        url: urlField.input.value.trim(),
        token: tokenField.input.value.trim(),
        apiKey: apiKeyField.input.value.trim()
      };
      saveLightragConfig(newCfg);
      persistConfigServerSide(newCfg);
      status.textContent = 'Guardado localmente y enviado al servidor.';
    });

    resetBtn.addEventListener('click', function() {
      urlField.input.value = '';
      tokenField.input.value = '';
      apiKeyField.input.value = '';
      saveLightragConfig({ url: '', token: '', apiKey: '' });
      status.textContent = 'Valores vaciados.';
    });

    buttons.appendChild(saveBtn);
    buttons.appendChild(resetBtn);

    panel.appendChild(title);
    panel.appendChild(urlField.wrapper);
    panel.appendChild(tokenField.wrapper);
    panel.appendChild(apiKeyField.wrapper);
    panel.appendChild(buttons);
    panel.appendChild(status);
    if (DocumentosDebug.attachDebugToggle) {
      DocumentosDebug.attachDebugToggle(panel);
    }

    if (options.append !== false) {
      actionBar.appendChild(panel);
    }
    return panel;
  }

  function createConfigPanel(actionBar) {
    return buildConfigPanel(actionBar, { append: false });
  }

  function toggleConfigPanel(panel) {
    if (!panel) return;
    const next = panel.style.display === 'none' ? 'flex' : 'none';
    panel.style.display = next;
    console.info('[Documentos] Panel de configuracion', next === 'flex' ? 'visible' : 'oculto');
  }

  function attach(options) {
    if (!options || !options.actionBar || !options.modal) return;
    const actionBar = options.actionBar;
    const modal = options.modal;
    const fileData = options.fileData || { name: 'Archivo', ext: '' };

    const row = document.createElement('div');
    row.className = 'documentos-storage-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.marginTop = '8px';
    row.style.gridColumn = '1 / -1';

    const checkbox = document.createElement('label');
    checkbox.className = 'documentos-storage-checkbox';
    checkbox.style.display = 'flex';
    checkbox.style.alignItems = 'center';
    checkbox.style.gap = '6px';
    checkbox.style.marginLeft = '0';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'documentos_storage_selector';
    input.setAttribute('aria-label', 'Seleccionar sincronizacion IA');

    const statusRow = document.createElement('div');
    statusRow.className = 'documentos-ia-status';
    statusRow.style.display = 'none';
    statusRow.style.flexDirection = 'column';
    statusRow.style.gap = '4px';
    statusRow.style.marginTop = '6px';
    statusRow.style.fontSize = '12px';
    statusRow.style.color = '#444';

    const statusText = document.createElement('div');
    statusText.textContent = 'Procesando...';
    const progress = document.createElement('div');
    progress.style.height = '4px';
    progress.style.background = '#e5e7eb';
    progress.style.borderRadius = '999px';
    progress.style.overflow = 'hidden';
    const progressBar = document.createElement('div');
    progressBar.style.height = '100%';
    progressBar.style.width = '0%';
    progressBar.style.background = '#2563eb';
    progressBar.style.transition = 'width 0.4s ease';
    progress.appendChild(progressBar);
    statusRow.appendChild(statusText);
    statusRow.appendChild(progress);

    let currentFilename = '';
    const setStatus = (state, payload) => {
      if (payload && payload.filename && !currentFilename) {
        currentFilename = payload.filename;
      }
      if (payload && payload.filename && currentFilename && payload.filename !== currentFilename) {
        return;
      }
      if (state === 'processing') {
        statusRow.style.display = 'flex';
        statusText.textContent = 'Procesando...';
        progressBar.style.background = '#2563eb';
        if (progressBar.style.width === '0%') progressBar.style.width = '20%';
        return;
      }
      if (state === 'ready') {
        statusRow.style.display = 'flex';
        statusText.textContent = 'Completado';
        progressBar.style.width = '100%';
        progressBar.style.background = '#16a34a';
        return;
      }
      if (state === 'waiting') {
        statusRow.style.display = 'flex';
        statusText.textContent = 'Aun procesando. Reintenta mas tarde.';
        progressBar.style.width = '80%';
        return;
      }
      statusRow.style.display = 'none';
      progressBar.style.width = '0%';
    };

    iaStatusHandlers.push(setStatus);
    input.addEventListener('change', function(e) {
      const checked = !!e.target.checked;
      const current = DocumentosSubida.readSelectedFile ? DocumentosSubida.readSelectedFile(modal) : fileData;
      logToServer('IA checkbox cambio', {
        checked: checked,
        name: current && current.name,
        ext: current && current.ext
      });
      if (!checked) {
        setStatus('idle', { filename: current && current.name ? current.name : '' });
        return;
      }
      setStatus('processing', { filename: current && current.name ? current.name : '' });

      const fileInputs = modal ? modal.querySelectorAll('input[type="file"]') : [];
      logToServer('IA estado input file', {
        fileInputs: fileInputs ? fileInputs.length : 0,
        inputNames: Array.from(fileInputs || []).map((node) => node.name || ''),
        inputHasFiles: Array.from(fileInputs || []).some((node) => node.files && node.files.length > 0)
      });
      logToServer('IA checkbox activado', {
        name: current && current.name,
        ext: current && current.ext,
        hasDocumentosSubida: !!DocumentosSubida.readSelectedFile
      });
      const fileToSend = DocumentosSubida.getLastLocalFileBlob ? DocumentosSubida.getLastLocalFileBlob() : null;
      if (!fileToSend) {
        logToServer('IA sin archivo local', {
          reason: 'getLastLocalFileBlob returned null',
          name: current && current.name,
          ext: current && current.ext
        });
        alert('No se pudo acceder al archivo local para subirlo.');
        e.target.checked = false;
        return;
      }
      const ext = getFileExtFromName(fileToSend.name) || getFileExtFromName(current.name) || (current.ext || '').toLowerCase();
      if (ALLOWED_EXT && (!ext || !ALLOWED_EXT.includes(ext))) {
        logToServer('IA formato no permitido', { ext: ext || '', name: fileToSend.name });
        showFloatingNotice('Formato no permitido. Debes subir: ' + ALLOWED_EXT_LABEL, 'error');
        e.target.checked = false;
        return;
      }

      const finalName = (DocumentosSubida.getFinalUploadName && DocumentosSubida.getFinalUploadName()) || fileToSend.name;
      const fd = new FormData();
      console.info('[Documentos] Preparando subida con nombre:', finalName);
      logToServer('Preparando subida con nombre', { name: finalName });
      fd.append('file', fileToSend, finalName || fileToSend.name);

      const cfg = loadLightragConfig();
      logToServer('Config IA usada en subida', {
        hasUrl: !!cfg.url,
        hasToken: !!cfg.token,
        hasApiKey: !!cfg.apiKey
      });
      if (cfg.url) fd.append('lightrag_url', cfg.url);
      if (cfg.token) fd.append('lightrag_token', cfg.token);
      if (cfg.apiKey) fd.append('lightrag_api_key', cfg.apiKey);

      const csrf = document.querySelector('meta[name=\"csrf-token\"]');
      const headers = {};
      if (csrf) headers['X-CSRF-Token'] = csrf.getAttribute('content');

      fetch(LIGHTRAG_PROXY_URL, {
        method: 'POST',
        headers,
        body: fd
      }).then(resp => {
        if (!resp.ok) return resp.json().catch(() => ({})).then(j => { throw new Error(j.error || ('Error ' + resp.status)); });
        return resp.json();
      }).then(json => {
        console.info('[Documentos] Subida a LightRAG exitosa:', json);
        const filename = finalName || (fileToSend && fileToSend.name) || 'el archivo';
        const msg = (json && typeof json.message === 'string') ? json.message.toLowerCase() : '';
        if (msg.includes('already exists')) {
          alert(`El archivo \"${filename}\" ya existe en la memoria de la IA.`);
        } else {
          alert(`Archivo cargado con exito. La IA ya puede usar \"${filename}\"`);
        }
        registerUploadResult(filename, json || {});
        progressBar.style.width = '60%';
      }).catch(err => {
        console.error('[Documentos] Error subiendo a LightRAG', err);
        alert('No se pudo subir a LightRAG: ' + err.message);
        e.target.checked = false;
        setStatus('idle');
      });
    });

    const text = document.createElement('span');
    text.textContent = 'Añadir a la base de conocimiento de la IA';

    checkbox.appendChild(input);
    checkbox.appendChild(text);
    row.appendChild(checkbox);
    actionBar.appendChild(row);
    actionBar.appendChild(statusRow);

    const info = document.createElement('div');
    info.className = 'documentos-storage-info';
    info.style.fontSize = '12px';
    info.style.color = '#444';
    info.style.lineHeight = '1.4';
    info.style.marginTop = '8px';
    info.style.marginBottom = '6px';
    info.style.gridColumn = '1 / -1';
    info.style.border = '1px dashed #aaa';
    info.style.borderRadius = '8px';
    info.style.padding = '8px 10px';
    info.style.textAlign = 'center';

    const line1 = document.createElement('div');
    line1.textContent = 'La IA admite multiples formatos de archivo, incluyendo texto, documentos, hojas de calculo, presentaciones, codigo y configuraciones:';
    line1.style.marginBottom = '4px';

    const line2 = document.createElement('div');
    line2.textContent = 'TXT, MD, DOCX, PDF, PPTX, XLSX, RTF, ODT, EPUB, HTML, HTM, TEX, JSON, XML, YAML, YML, CSV, LOG, CONF, INI, PROPERTIES, SQL, BAT, SH, C, CPP, PY, JAVA, JS, TS, SWIFT, GO, RB, PHP, CSS, SCSS, LESS';

    info.appendChild(line1);
    info.appendChild(line2);
    actionBar.appendChild(info);
  }

  window.DocumentosConocimientoIA = {
    attach: attach,
    buildConfigPanel: buildConfigPanel,
    createConfigPanel: createConfigPanel,
    registerUploadResult: registerUploadResult,
    onStatus: function(handler) {
      if (typeof handler === 'function') iaStatusHandlers.push(handler);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFileLinkObserver);
  } else {
    initFileLinkObserver();
  }
})();











