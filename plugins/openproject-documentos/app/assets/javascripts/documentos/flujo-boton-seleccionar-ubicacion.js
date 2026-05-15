(function() {
  'use strict';

  const NOMENCLATURE_API_URL = '/documentos/nomenclaturas';
  const NOMENCLATURE_EXPORT_URL = '/documentos/nomenclaturas/export';
  const NOMENCLATURE_ITEM_API_URL = '/documentos/nomenclatura_items';
  const NOMENCLATURE_FIELD_API_URL = '/documentos/nomenclatura_fields';
  const DOCUMENTOS_IS_ADMIN = !!(window.DocumentosIsAdmin);
  const LIGHTRAG_PROXY_URL = '/documentos/upload_lightrag';
  const LIGHTRAG_CONFIG_URL = '/documentos/config';
  const IA_ALLOWED_EXT = [
    'txt','md','docx','pdf','pptx','xlsx','rtf','odt','epub','html','htm','tex','json','xml','yaml','yml','csv','log','conf','ini','properties','sql','bat','sh','c','cpp','py','java','js','ts','swift','go','rb','php','css','scss','less'
  ];
  const IA_ALLOWED_LABEL = 'TXT, MD, DOCX, PDF, PPTX, XLSX, RTF, ODT, EPUB, HTML, HTM, TEX, JSON, XML, YAML, YML, CSV, LOG, CONF, INI, PROPERTIES, SQL, BAT, SH, C, CPP, PY, JAVA, JS, TS, SWIFT, GO, RB, PHP, CSS, SCSS, LESS';
  const NOMENCLATURE_FIELDS = [
    { key: 'proyecto', label: 'Proyecto / Código de Inversión' },
    { key: 'creador', label: 'Creador / Autor' },
    { key: 'volumen_sistema', label: 'Volumen/Sistema' },
    { key: 'nivel_localizacion', label: 'Nivel o Localización' },
    { key: 'tipo', label: 'Tipo / Tipo de documento' },
    { key: 'disciplina', label: 'Disciplina' },
    { key: 'numero', label: 'Número' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'estado', label: 'Estado / Código de estado' },
    { key: 'revision', label: 'Revisión' }
  ];

  let lastFileSignature = null;
  let lastLocalFile = null;
  let lastRenamedFile = null;
  let lastFileInput = null;
  let finalUploadName = '';
  let initialOriginalName = '';
  let suppressNextChange = false;
  let renameOverlay = null;
  let renameModal = null;
  let renameInputNode = null;
  let renameFileNameNode = null;
  let renameFileMetaNode = null;
  let renameIaCheckbox = null;
  let renameIaTooltip = null;
  let renameIaStatusRow = null;
  let renameIaStatusText = null;
  let renameIaProgressBar = null;
  let pendingRenameFile = null;
  let pendingRenameInput = null;
  let nomenclatureSelect = null;
  let nomenclatureSaveBtn = null;
  let nomenclatureInputsWrap = null;
  let nomenclatureFieldEntries = [];
  let currentNomenclatures = [];
  let nomenclatureEnabled = false;
  let nomenclatureUseBtn = null;
  let nomenclatureClearBtn = null;
  let nomenclatureDeleteBtn = null;
  let nomenclaturePreviewNode = null;

  function parseFilenameParts(name) {
    const raw = (name || '').trim();
    const lastDot = raw.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === raw.length - 1) return { base: raw, ext: '' };
    return { base: raw.slice(0, lastDot), ext: raw.slice(lastDot + 1) };
  }

  function normalizeFilename(value, originalName) {
    const raw = (value || '').trim();
    if (!raw) return originalName || '';
    const original = parseFilenameParts(originalName || '');
    const next = parseFilenameParts(raw);
    if (!next.ext && original.ext) return `${next.base}.${original.ext}`;
    return raw;
  }

  function detectWorkPackageId() {
    const path = window.location.pathname || '';
    const match = path.match(/work_packages\/(\d+)/);
    if (match) return match[1];
    const fromHref = (window.location.href || '').match(/work_packages\/(\d+)/);
    if (fromHref) return fromHref[1];
    const attrNode =
      document.querySelector('[data-work-package-id]') ||
      document.querySelector('[data-work-package-id]') ||
      document.querySelector('[data-workpackage-id]');
    const attrValue = attrNode && attrNode.getAttribute && attrNode.getAttribute('data-work-package-id');
    if (attrValue && /^\d+$/.test(attrValue)) return attrValue;
    const bodyValue = document.body && document.body.dataset ? document.body.dataset.workPackageId : '';
    if (bodyValue && /^\d+$/.test(bodyValue)) return bodyValue;
    const meta = document.querySelector('meta[name="work-package-id"]');
    const metaValue = meta ? meta.getAttribute('content') : '';
    if (metaValue && /^\d+$/.test(metaValue)) return metaValue;
    return '';
  }

  function fetchNomenclatures(wpId) {
    const url = wpId ? `${NOMENCLATURE_API_URL}?work_package_id=${encodeURIComponent(wpId)}` : NOMENCLATURE_API_URL;
    return fetch(url, { credentials: 'same-origin' })
      .then((resp) => (resp.ok ? resp.json() : []))
      .catch(() => []);
  }

  function saveNomenclature(payload) {
    return fetch(NOMENCLATURE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((resp) => {
      if (!resp.ok) {
        return resp.json().catch(() => ({})).then((body) => {
          const message = body.error || `Error ${resp.status}`;
          throw new Error(message);
        });
      }
      return resp.json();
    });
  }

  function deleteNomenclature(id) {
    return fetch(`${NOMENCLATURE_API_URL}/${id}`, {
      method: 'DELETE'
    }).then((resp) => {
      if (!resp.ok) {
        return resp.json().catch(() => ({})).then((body) => {
          const message = body.error || `Error ${resp.status}`;
          throw new Error(message);
        });
      }
      return resp.json();
    });
  }

  function fetchNomenclatureItems(key) {
    const url = key ? `${NOMENCLATURE_ITEM_API_URL}?key=${encodeURIComponent(key)}` : NOMENCLATURE_ITEM_API_URL;
    return fetch(url, { credentials: 'same-origin' })
      .then((resp) => (resp.ok ? resp.json() : []))
      .catch(() => []);
  }

  function createNomenclatureItem(payload) {
    return fetch(NOMENCLATURE_ITEM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((resp) => {
      if (!resp.ok) {
        return resp.json().catch(() => ({})).then((body) => {
          const message = body.error || `Error ${resp.status}`;
          throw new Error(message);
        });
      }
      return resp.json();
    });
  }

  function deleteNomenclatureItem(id) {
    return fetch(`${NOMENCLATURE_ITEM_API_URL}/${id}`, {
      method: 'DELETE'
    }).then((resp) => {
      if (!resp.ok) {
        return resp.json().catch(() => ({})).then((body) => {
          const message = body.error || `Error ${resp.status}`;
          throw new Error(message);
        });
      }
      return resp.json();
    });
  }

  function updateNomenclatureItem(id, payload) {
    return fetch(`${NOMENCLATURE_ITEM_API_URL}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((resp) => {
      if (!resp.ok) {
        return resp.json().catch(() => ({})).then((body) => {
          const message = body.error || `Error ${resp.status}`;
          throw new Error(message);
        });
      }
      return resp.json();
    });
  }

  function fetchNomenclatureField(key) {
    return fetch(`${NOMENCLATURE_FIELD_API_URL}/${encodeURIComponent(key)}`, { credentials: 'same-origin' })
      .then((resp) => (resp.ok ? resp.json() : {}))
      .catch(() => ({}));
  }

  function updateNomenclatureField(key, payload) {
    return fetch(`${NOMENCLATURE_FIELD_API_URL}/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((resp) => {
      if (!resp.ok) {
        return resp.json().catch(() => ({})).then((body) => {
          const message = body.error || `Error ${resp.status}`;
          throw new Error(message);
        });
      }
      return resp.json();
    });
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function logToServer(message, data) {
    if (window.DocumentosDebug && typeof window.DocumentosDebug.logToServer === 'function') {
      window.DocumentosDebug.logToServer({
        level: 'info',
        message: message,
        data: data
      });
      return;
    }
    const headers = { 'Content-Type': 'application/json' };
    const token = getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    fetch('/documentos/log', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ level: 'info', message: message, data: data })
    }).catch(() => {});
  }

  function showFloatingNotice(message, type) {
    const existing = document.querySelector('.documentos-ia-notice');
    if (existing) existing.remove();
    const notice = document.createElement('div');
    notice.className = 'documentos-ia-notice';
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
    notice.style.maxWidth = '340px';
    notice.style.lineHeight = '1.4';
    document.body.appendChild(notice);
    setTimeout(() => {
      if (notice.parentNode) notice.remove();
    }, 4000);
  }

  function fetchIaConfig() {
    return fetch(LIGHTRAG_CONFIG_URL, { credentials: 'same-origin' })
      .then((resp) => (resp.ok ? resp.json() : {}))
      .catch(() => ({}));
  }

  function getFileExt(name) {
    const raw = (name || '').trim();
    const idx = raw.lastIndexOf('.');
    if (idx <= 0 || idx === raw.length - 1) return '';
    return raw.slice(idx + 1).toLowerCase();
  }

  function buildUploadFile(originalFile) {
    if (!originalFile) return null;
    const nextName = normalizeFilename(renameInputNode ? renameInputNode.value : '', originalFile.name);
    if (!nextName || nextName === originalFile.name) return originalFile;
    try {
      return new File([originalFile], nextName, {
        type: originalFile.type,
        lastModified: originalFile.lastModified
      });
    } catch (e) {
      return originalFile;
    }
  }

  function uploadToIa(file) {
    if (!file) {
      showFloatingNotice('No se pudo acceder al archivo local para subirlo.', 'error');
      return;
    }
    const ext = getFileExt(file.name);
    if (!ext || !IA_ALLOWED_EXT.includes(ext)) {
      showFloatingNotice('Formato no permitido. Debes subir: ' + IA_ALLOWED_LABEL, 'error');
      return;
    }
    fetchIaConfig().then((cfg) => {
      if (!cfg || !cfg.url || !cfg.token || !cfg.api_key) {
        showFloatingNotice('Configuracion LightRAG incompleta. Revisa Ajustes.', 'error');
        logToServer('IA config incompleta', cfg);
        return;
      }
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('lightrag_url', cfg.url);
      fd.append('lightrag_token', cfg.token);
      fd.append('lightrag_api_key', cfg.api_key);
      const headers = {};
      const token = getCsrfToken();
      if (token) headers['X-CSRF-Token'] = token;
      logToServer('IA upload iniciado', { name: file.name, size: file.size });
      fetch(LIGHTRAG_PROXY_URL, { method: 'POST', headers, body: fd })
        .then((resp) => (resp.ok ? resp.json() : resp.json().catch(() => ({})).then((body) => { throw new Error(body.error || `Error ${resp.status}`); })))
        .then((json) => {
          const msg = (json && typeof json.message === 'string') ? json.message.toLowerCase() : '';
          if (msg.includes('already exists')) {
            showFloatingNotice(`El archivo "${file.name}" ya existe en la memoria de la IA.`, 'error');
          } else {
            showFloatingNotice(`Archivo cargado con exito. La IA ya puede usar "${file.name}"`, 'success');
          }
          if (renameIaProgressBar) {
            renameIaProgressBar.style.width = '60%';
          }
          if (window.DocumentosConocimientoIA && typeof window.DocumentosConocimientoIA.registerUploadResult === 'function') {
            window.DocumentosConocimientoIA.registerUploadResult(file.name, json || {});
          }
        })
        .catch((err) => {
          showFloatingNotice('No se pudo subir a LightRAG: ' + err.message, 'error');
          logToServer('IA upload error', { message: err.message });
          if (renameIaStatusRow && renameIaProgressBar) {
            renameIaStatusRow.style.display = 'none';
            renameIaProgressBar.style.width = '0%';
          }
        });
    });
  }

  function toBool(value, defaultValue) {
    if (value === undefined || value === null) return defaultValue;
    if (value === true || value === false) return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  }

  function setButtonState(button, state) {
    if (!button) return;
    if (state === 'saving') {
      button.dataset.originalText = button.textContent;
      button.textContent = 'Guardando...';
      button.disabled = true;
      button.style.opacity = '0.8';
      return;
    }
    if (state === 'saved') {
      button.textContent = 'Guardado';
      button.disabled = false;
      button.style.opacity = '1';
      button.style.background = '#1f8d3f';
      button.style.borderColor = '#1f8d3f';
      button.style.color = '#fff';
      setTimeout(() => {
        button.textContent = button.dataset.originalText || 'Guardar';
        button.style.background = '';
        button.style.borderColor = '';
        button.style.color = '';
      }, 1200);
      return;
    }
    if (state === 'ok') {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = 'Ok';
      button.disabled = false;
      button.style.opacity = '1';
      button.style.background = '#1f8d3f';
      button.style.borderColor = '#1f8d3f';
      button.style.color = '#fff';
      setTimeout(() => {
        button.textContent = button.dataset.originalText || 'Guardar';
        button.style.background = '';
        button.style.borderColor = '';
        button.style.color = '';
      }, 900);
      return;
    }
    button.textContent = button.dataset.originalText || 'Guardar';
    button.disabled = false;
    button.style.opacity = '1';
    button.style.background = '';
    button.style.borderColor = '';
    button.style.color = '';
  }

  function buildNomenclatureName(originalName) {
    if (!nomenclatureFieldEntries.length) return originalName || '';
    const parts = nomenclatureFieldEntries
      .map((entry) => (entry.input && entry.input.value ? entry.input.value.trim() : ''))
      .filter((value) => value.length > 0);
    if (parts.length === 0) return originalName || '';
    const joined = parts.join('-');
    const ext = parseFilenameParts(originalName || '').ext;
    return ext ? `${joined}.${ext}` : joined;
  }

  function setNomenclatureEnabled(enabled) {
    if (!nomenclatureInputsWrap) return;
    nomenclatureEnabled = enabled;
    if (nomenclatureUseBtn) {
      nomenclatureUseBtn.textContent = enabled ? 'Usando' : 'Usar';
    }
  }

  function applyNomenclatureName(originalName) {
    if (!renameInputNode) return;
    const next = buildNomenclatureName(originalName);
    renameInputNode.value = next;
    if (renameFileNameNode) {
      renameFileNameNode.textContent = next;
    }
  }

  function resetNomenclatureSelection() {
    if (nomenclatureSelect) {
      nomenclatureSelect.selectedIndex = 0;
    }
    if (nomenclatureFieldEntries.length) {
      nomenclatureFieldEntries.forEach((entry) => {
        if (entry.input) entry.input.value = '';
        if (entry.descriptionInput) entry.descriptionInput.value = '';
        if (entry.flags) {
          entry.flags.forAll.checked = true;
          entry.flags.filter.checked = true;
          entry.flags.searchable.checked = true;
        }
      });
    }
    setPreviewText('');
    setNomenclatureEnabled(false);
    if (pendingRenameFile && renameInputNode) {
      renameInputNode.value = pendingRenameFile.name || '';
    }
    if (pendingRenameFile && renameFileNameNode) {
      renameFileNameNode.textContent = pendingRenameFile.name || '';
    }
  }

  function getSelectedNomenclature() {
    if (!nomenclatureSelect) return null;
    const idx = parseInt(nomenclatureSelect.value, 10);
    if (Number.isNaN(idx)) return null;
    return currentNomenclatures[idx] || null;
  }

  function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatSelectionTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  function setPreviewText(text) {
    if (!nomenclaturePreviewNode) return;
    nomenclaturePreviewNode.textContent = text || '';
  }

  function previewBaseName() {
    return pendingRenameFile ? pendingRenameFile.name : '';
  }

  function updateRenamedFile() {
    if (!lastLocalFile) {
      lastRenamedFile = null;
      return;
    }
    if (!finalUploadName || finalUploadName === lastLocalFile.name) {
      lastRenamedFile = null;
      return;
    }
    try {
      lastRenamedFile = new File([lastLocalFile], finalUploadName, {
        type: lastLocalFile.type,
        lastModified: lastLocalFile.lastModified
      });
    } catch (e) {
      lastRenamedFile = null;
    }
    if (lastFileInput && lastRenamedFile && window.DataTransfer) {
      try {
        const dt = new DataTransfer();
        dt.items.add(lastRenamedFile);
        lastFileInput.files = dt.files;
      } catch (e) {
        // Best-effort: updating the native input may be blocked by the browser.
      }
    }
  }

  function optionDataFromInput(entry) {
    if (!entry || !entry.input) return null;
    const value = entry.input.value.trim();
    if (!value) return null;
    const match = entry.items.find((item) => (item.value || '').toString() === value);
    if (!match) return null;
    return {
      id: match.id ? match.id.toString() : '',
      value: (match.value || '').toString(),
      description: (match.description || '').toString(),
      is_for_all: !!match.is_for_all,
      is_filter: !!match.is_filter,
      is_searchable: !!match.is_searchable
    };
  }

  function renderDropdown(entry, query) {
    if (!entry || !entry.dropdown) return;
    const term = (query || '').toLowerCase();
    const items = entry.items || [];
    const filtered = term
      ? items.filter((item) => {
          const valueText = (item.value || '').toString().toLowerCase();
          const descText = (item.description || '').toString().toLowerCase();
          return valueText.includes(term) || descText.includes(term);
        })
      : items;

    entry.dropdown.innerHTML = '';
    if (!filtered.length) {
      entry.dropdown.style.display = 'none';
      return;
    }

    filtered.forEach((item) => {
      const option = document.createElement('button');
      option.type = 'button';
      const valueText = (item.value || '').toString();
      const descText = (item.description || '').toString();
      option.textContent = descText ? `${valueText} - ${descText}` : valueText;
      option.style.display = 'block';
      option.style.width = '100%';
      option.style.textAlign = 'left';
      option.style.border = 'none';
      option.style.background = 'transparent';
      option.style.padding = '6px 8px';
      option.style.whiteSpace = 'nowrap';
      option.style.overflow = 'hidden';
      option.style.textOverflow = 'ellipsis';
      option.style.cursor = 'pointer';
      option.addEventListener('click', () => {
        entry.input.value = valueText;
        if (entry.descriptionInput) {
          entry.descriptionInput.value = (item.description || '').toString();
        }
        entry.dropdown.style.display = 'none';
        entry.dropdownVisible = false;
        setPreviewText(buildNomenclatureName(previewBaseName()));
        if (nomenclatureEnabled && pendingRenameFile) {
          applyNomenclatureName(pendingRenameFile.name);
        }
      });
      entry.dropdown.appendChild(option);
    });

    entry.dropdown.style.display = 'block';
  }

  function downloadNomenclaturas() {
    const link = document.createElement('a');
    link.href = NOMENCLATURE_EXPORT_URL;
    link.download = 'nomenclaturas.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function setInputOptions(entry, items, selectedValue) {
    if (!entry) return;
    if (entry.input) {
      entry.input.value = selectedValue || '';
    }
    if (entry.dropdownVisible) {
      renderDropdown(entry, entry.input ? entry.input.value : '');
    }
  }

  function ensureRenameOverlay() {
    if (renameOverlay) return renameOverlay;
    const overlay = document.createElement('div');
    overlay.className = 'documentos-rename-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.35)';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';

    const modal = document.createElement('div');
    modal.className = 'spot-modal';
    modal.style.width = '35vw';
    modal.style.maxHeight = '90vh';
    modal.style.overflow = 'visible';
    renameModal = modal;

    const header = document.createElement('div');
    header.className = 'spot-modal--header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';

    const title = document.createElement('h3');
    title.id = 'spotModalTitle';
    title.textContent = 'Agregar Nomenclatura';
    header.appendChild(title);

    const headerActions = document.createElement('div');
    headerActions.className = 'documentos-header-actions';
    headerActions.style.display = 'flex';
    headerActions.style.alignItems = 'center';
    headerActions.style.gap = '8px';
    headerActions.style.marginLeft = 'auto';

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.setAttribute('aria-label', 'Descargar Excel');
    downloadBtn.title = 'Descargar Excel';
    downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4.01 4a1 1 0 0 1-1.38 0l-4.01-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/></svg>';
    downloadBtn.style.border = 'none';
    downloadBtn.style.background = 'transparent';
    downloadBtn.style.cursor = 'pointer';
    downloadBtn.style.padding = '0';
    downloadBtn.style.width = '28px';
    downloadBtn.style.height = '28px';
    downloadBtn.style.display = 'inline-flex';
    downloadBtn.style.alignItems = 'center';
    downloadBtn.style.justifyContent = 'center';
    downloadBtn.style.color = '#4b5563';
    downloadBtn.addEventListener('click', downloadNomenclaturas);
    headerActions.appendChild(downloadBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '×';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.fontWeight = '600';
    closeBtn.style.padding = '0';
    closeBtn.style.width = '28px';
    closeBtn.style.height = '28px';
    closeBtn.style.display = 'inline-flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);

    const body = document.createElement('div');
    body.className = 'spot-modal--body spot-container';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.alignItems = 'stretch';
    body.style.gap = '8px';
    body.style.overflowY = 'auto';
    body.style.maxHeight = '70vh';
    body.style.setProperty('overflow-y', 'auto', 'important');
    body.style.boxSizing = 'border-box';
    body.style.paddingRight = '12px';
    body.style.paddingLeft = '12px';

    const fileRow = document.createElement('div');
    fileRow.style.display = 'grid';
    fileRow.style.gridTemplateColumns = '64px 1fr';
    fileRow.style.columnGap = '12px';
    fileRow.style.alignItems = 'center';
    fileRow.style.width = '100%';

    const fileIcon = document.createElement('span');
    fileIcon.textContent = '\uD83D\uDCC4';
    fileIcon.setAttribute('aria-hidden', 'true');
    fileIcon.style.fontSize = '60px';
    fileIcon.style.lineHeight = '1';

    const fileDetails = document.createElement('div');
    fileDetails.style.display = 'flex';
    fileDetails.style.flexDirection = 'column';
    fileDetails.style.gap = '4px';
    fileDetails.style.minWidth = '0';

    const fileName = document.createElement('div');
    fileName.textContent = '';
    fileName.style.fontSize = '13px';
    fileName.style.color = '#323232';
    fileName.style.fontWeight = '600';
    fileName.style.overflow = 'hidden';
    fileName.style.textOverflow = 'ellipsis';
    fileName.style.whiteSpace = 'nowrap';
    renameFileNameNode = fileName;

    const fileSize = document.createElement('div');
    fileSize.style.fontSize = '12px';
    fileSize.style.color = '#5d5d5d';
    renameFileMetaNode = fileSize;

    const fileType = document.createElement('div');
    fileType.style.fontSize = '12px';
    fileType.style.color = '#5d5d5d';

    const fileDate = document.createElement('div');
    fileDate.style.fontSize = '12px';
    fileDate.style.color = '#5d5d5d';
    fileDate.style.display = 'flex';
    fileDate.style.alignItems = 'center';
    fileDate.style.gap = '6px';

    const iaLabel = document.createElement('label');
    iaLabel.style.display = 'flex';
    iaLabel.style.alignItems = 'center';
    iaLabel.style.gap = '6px';
    iaLabel.style.fontSize = '12px';
    iaLabel.style.color = '#4b5563';
    iaLabel.style.cursor = 'pointer';

    const iaCheckbox = document.createElement('input');
    iaCheckbox.type = 'checkbox';
    renameIaCheckbox = iaCheckbox;

    const iaText = document.createElement('span');
    iaText.textContent = 'Añadir a la base de conocimiento de la IA';

    const iaHelp = document.createElement('span');
    iaHelp.textContent = 'ⓘ';
    iaHelp.style.fontSize = '12px';
    iaHelp.style.color = '#6b7280';
    iaHelp.style.cursor = 'help';

    const tooltip = document.createElement('div');
    tooltip.textContent = 'La IA admite multiples formatos de archivo, incluyendo texto, documentos, hojas de calculo, presentaciones, codigo y configuraciones:\n' + IA_ALLOWED_LABEL;
    tooltip.style.position = 'fixed';
    tooltip.style.zIndex = '3000';
    tooltip.style.maxWidth = '360px';
    tooltip.style.padding = '8px 10px';
    tooltip.style.background = '#111827';
    tooltip.style.color = '#fff';
    tooltip.style.fontSize = '12px';
    tooltip.style.lineHeight = '1.4';
    tooltip.style.borderRadius = '6px';
    tooltip.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)';
    tooltip.style.display = 'none';
    tooltip.style.whiteSpace = 'pre-line';
    renameIaTooltip = tooltip;
    document.body.appendChild(tooltip);

    iaHelp.addEventListener('mouseenter', (event) => {
      if (!renameIaTooltip) return;
      renameIaTooltip.style.display = 'block';
      renameIaTooltip.style.top = `${event.clientY + 12}px`;
      renameIaTooltip.style.left = `${event.clientX + 12}px`;
    });
    iaHelp.addEventListener('mousemove', (event) => {
      if (!renameIaTooltip) return;
      renameIaTooltip.style.top = `${event.clientY + 12}px`;
      renameIaTooltip.style.left = `${event.clientX + 12}px`;
    });
    iaHelp.addEventListener('mouseleave', () => {
      if (renameIaTooltip) renameIaTooltip.style.display = 'none';
    });

    iaLabel.appendChild(iaCheckbox);
    iaLabel.appendChild(iaText);
    iaLabel.appendChild(iaHelp);
    fileDate.appendChild(iaLabel);

    fileDetails.appendChild(fileName);
    fileDetails.appendChild(fileSize);
    fileDetails.appendChild(fileType);
    fileDetails.appendChild(fileDate);

    const iaStatus = document.createElement('div');
    iaStatus.style.display = 'none';
    iaStatus.style.flexDirection = 'column';
    iaStatus.style.gap = '4px';
    iaStatus.style.marginTop = '6px';
    iaStatus.style.fontSize = '12px';
    iaStatus.style.color = '#4b5563';
    iaStatus.style.maxWidth = '240px';

    const iaStatusText = document.createElement('div');
    iaStatusText.textContent = 'Procesando...';
    const iaProgress = document.createElement('div');
    iaProgress.style.height = '4px';
    iaProgress.style.background = '#e5e7eb';
    iaProgress.style.borderRadius = '999px';
    iaProgress.style.overflow = 'hidden';
    iaProgress.style.width = '100%';
    const iaProgressBar = document.createElement('div');
    iaProgressBar.style.height = '100%';
    iaProgressBar.style.width = '0%';
    iaProgressBar.style.background = '#2563eb';
    iaProgressBar.style.transition = 'width 0.4s ease';
    iaProgress.appendChild(iaProgressBar);
    iaStatus.appendChild(iaStatusText);
    iaStatus.appendChild(iaProgress);

    renameIaStatusRow = iaStatus;
    renameIaStatusText = iaStatusText;
    renameIaProgressBar = iaProgressBar;
    fileDetails.appendChild(iaStatus);

    fileRow.appendChild(fileIcon);
    fileRow.appendChild(fileDetails);

    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = '#e6e6e6';
    divider.style.margin = '4px 0';

    const inputWrapper = document.createElement('div');
    inputWrapper.style.width = '100%';
    inputWrapper.style.maxWidth = '100%';
    inputWrapper.style.boxSizing = 'border-box';
    inputWrapper.style.overflow = 'visible';
    inputWrapper.style.display = 'flex';
    inputWrapper.style.alignItems = 'stretch';
    inputWrapper.style.marginTop = '4px';
    inputWrapper.style.paddingLeft = '0';
    inputWrapper.style.paddingRight = '0';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'spot-form-field';
    input.style.padding = '6px 10px';
    input.style.fontSize = '14px';
    input.style.lineHeight = '20px';
    input.style.height = '36px';
    input.style.display = 'block';
    input.style.width = '100%';
    input.style.maxWidth = '100%';
    input.style.minWidth = '0';
    input.style.boxSizing = 'border-box';
    input.style.flex = '1 1 auto';
    input.style.margin = '0';
    input.style.border = '1px solid #cbd5e1';
    input.style.borderRadius = '4px';
    input.style.background = '#fff';
    input.placeholder = 'Nombre del archivo';
    renameInputNode = input;
    inputWrapper.appendChild(input);

    const nomenclatureSelectRow = document.createElement('div');
    nomenclatureSelectRow.style.display = 'flex';
    nomenclatureSelectRow.style.alignItems = 'stretch';
    nomenclatureSelectRow.style.gap = '4px';
    nomenclatureSelectRow.style.marginTop = '4px';

    const select = document.createElement('select');
    select.className = 'spot-form-field';
    select.style.flex = '1';
    select.style.minWidth = '0';
    select.style.boxSizing = 'border-box';
    select.style.height = '36px';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Elige una nomenclatura existente';
    defaultOpt.selected = true;
    defaultOpt.disabled = true;
    select.appendChild(defaultOpt);
    nomenclatureSelect = select;

    const buttonsWrap = document.createElement('div');
    buttonsWrap.style.display = 'flex';
    buttonsWrap.style.alignItems = 'stretch';
    buttonsWrap.style.gap = '6px';
    buttonsWrap.style.flexShrink = '0';

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.textContent = 'Usar';
    useBtn.className = 'button -primary';
    useBtn.style.padding = '6px 10px';
    useBtn.style.lineHeight = '1';
    useBtn.style.height = '36px';
    useBtn.style.flexShrink = '0';
    useBtn.style.alignSelf = 'stretch';
    nomenclatureUseBtn = useBtn;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Reiniciar';
    clearBtn.className = 'button';
    clearBtn.style.padding = '6px 10px';
    clearBtn.style.lineHeight = '1';
    clearBtn.style.height = '36px';
    clearBtn.style.flexShrink = '0';
    clearBtn.style.alignSelf = 'stretch';
    nomenclatureClearBtn = clearBtn;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="16" height="16"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z"/></svg>';
    deleteBtn.setAttribute('aria-label', 'Eliminar nomenclatura');
    deleteBtn.className = 'button';
    deleteBtn.style.padding = '6px 8px';
    deleteBtn.style.lineHeight = '1';
    deleteBtn.style.height = '36px';
    deleteBtn.style.width = '36px';
    deleteBtn.style.color = '#6b7280';
    deleteBtn.style.display = 'flex';
    deleteBtn.style.alignItems = 'center';
    deleteBtn.style.justifyContent = 'center';
    deleteBtn.style.flexShrink = '0';
    deleteBtn.style.alignSelf = 'stretch';
    nomenclatureDeleteBtn = deleteBtn;

    nomenclatureSelectRow.appendChild(select);
    buttonsWrap.appendChild(useBtn);
    buttonsWrap.appendChild(clearBtn);
    buttonsWrap.appendChild(deleteBtn);
    nomenclatureSelectRow.appendChild(buttonsWrap);

    const dividerAfterSelect = document.createElement('div');
    dividerAfterSelect.style.height = '1px';
    dividerAfterSelect.style.background = '#e6e6e6';
    dividerAfterSelect.style.margin = '6px 0';

    const preview = document.createElement('div');
    preview.style.display = 'flex';
    preview.style.alignItems = 'center';
    preview.style.justifyContent = 'center';
    preview.style.textAlign = 'center';
    preview.style.fontSize = '15px';
    preview.style.fontWeight = '700';
    preview.style.color = '#4b5563';
    preview.style.padding = '6px 8px';
    preview.style.border = '1px dashed #cbd5e1';
    preview.style.borderRadius = '6px';
    preview.style.background = '#f8fafc';
    preview.textContent = '';
    nomenclaturePreviewNode = preview;

    const inputsWrap = document.createElement('div');
    inputsWrap.style.display = 'grid';
    inputsWrap.style.gridTemplateColumns = '1fr';
    inputsWrap.style.gap = '8px';
    inputsWrap.style.marginTop = '4px';
    inputsWrap.style.marginBottom = '6px';
    inputsWrap.style.width = '100%';
    inputsWrap.style.boxSizing = 'border-box';
    inputsWrap.style.overflowX = 'hidden';
    nomenclatureInputsWrap = inputsWrap;

    function buildFlagCheckbox(labelText, checkedByDefault) {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '4px';
      label.style.fontSize = '12px';
      label.style.color = '#4b5563';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checkedByDefault === true;
      if (!DOCUMENTOS_IS_ADMIN) {
        input.disabled = true;
        input.title = 'Solo administradores';
        label.title = 'Solo administradores';
        label.style.opacity = '0.6';
        label.style.cursor = 'not-allowed';
      }

      const text = document.createElement('span');
      text.textContent = labelText;

      label.appendChild(input);
      label.appendChild(text);
      return { label, input };
    }

    nomenclatureFieldEntries = NOMENCLATURE_FIELDS.map((field) => {
      const group = document.createElement('div');
      group.style.display = 'flex';
      group.style.flexDirection = 'column';
      group.style.gap = '4px';
      group.style.width = '100%';
      group.style.boxSizing = 'border-box';

      const fieldLabel = document.createElement('span');
      fieldLabel.textContent = field.label;
      fieldLabel.style.fontSize = '12px';
      fieldLabel.style.color = '#5d5d5d';

      const firstRow = document.createElement('div');
      firstRow.style.display = 'grid';
      firstRow.style.gridTemplateColumns = '180px minmax(200px, 1fr) auto auto';
      firstRow.style.alignItems = 'stretch';
      firstRow.style.gap = '6px';
      firstRow.style.width = '100%';
      firstRow.style.boxSizing = 'border-box';

      const fieldInputWrap = document.createElement('div');
      fieldInputWrap.style.gridColumn = '1 / 2';
      fieldInputWrap.style.position = 'relative';
      fieldInputWrap.style.width = '180px';
      fieldInputWrap.style.minWidth = '180px';

      const fieldInput = document.createElement('input');
      fieldInput.type = 'text';
      fieldInput.className = 'spot-form-field';
      fieldInput.style.display = 'block';
      fieldInput.style.width = '100%';
      fieldInput.style.minWidth = '180px';
      fieldInput.style.boxSizing = 'border-box';
      fieldInput.style.height = '36px';
      fieldInput.style.padding = '6px 10px';
      fieldInput.style.fontSize = '13px';
      fieldInput.style.border = '1px solid #cbd5e1';
      fieldInput.style.borderRadius = '4px';
      fieldInput.style.background = '#fff';
      fieldInput.style.margin = '0';
      fieldInput.placeholder = '';
      if (field.key === 'proyecto') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 12;
      }
      if (field.key === 'creador') {
        fieldInput.maxLength = 6;
      }
      if (field.key === 'volumen_sistema') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 3;
      }
      if (field.key === 'nivel_localizacion') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 3;
      }
      if (field.key === 'tipo') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 3;
      }
      if (field.key === 'disciplina') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 3;
      }
      if (field.key === 'numero') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 3;
      }
      if (field.key === 'estado') {
        fieldInput.minLength = 2;
        fieldInput.maxLength = 3;
      }

      const fieldDropdown = document.createElement('div');
      fieldDropdown.style.position = 'relative';
      fieldDropdown.style.top = '0';
      fieldDropdown.style.left = '0';
      fieldDropdown.style.right = '0';
      fieldDropdown.style.background = '#fff';
      fieldDropdown.style.border = '1px solid #d1d5db';
      fieldDropdown.style.borderTop = '1px solid #d1d5db';
      fieldDropdown.style.borderRadius = '0';
      fieldDropdown.style.marginTop = '0';
      fieldDropdown.style.boxShadow = 'none';
      fieldDropdown.style.top = '0';
      fieldDropdown.style.maxHeight = '180px';
      fieldDropdown.style.overflowY = 'auto';
      fieldDropdown.style.zIndex = '2100';
      fieldDropdown.style.display = 'none';

      fieldInputWrap.appendChild(fieldInput);
      fieldInputWrap.appendChild(fieldDropdown);

      const descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.className = 'spot-form-field';
      descInput.style.gridColumn = '2 / 3';
      descInput.style.padding = '6px 8px';
      descInput.style.fontSize = '13px';
      descInput.style.display = 'block';
      descInput.style.width = '100%';
      descInput.style.minWidth = '200px';
      descInput.style.boxSizing = 'border-box';
      descInput.style.border = '1px solid #cbd5e1';
      descInput.style.borderRadius = '4px';
      descInput.style.background = '#fff';
      descInput.placeholder = `Descripcion de ${field.label}`;

      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.textContent = 'Guardar';
      createBtn.className = 'button';
      createBtn.style.gridColumn = '3 / 4';
      createBtn.style.padding = '6px 10px';
      createBtn.style.lineHeight = '1';
      createBtn.style.height = '36px';
      createBtn.style.flexShrink = '0';
      createBtn.style.alignSelf = 'stretch';

      const trashBtn = document.createElement('button');
      trashBtn.type = 'button';
      trashBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="16" height="16"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z"/></svg>';
      trashBtn.setAttribute('aria-label', `Eliminar ${field.label}`);
      trashBtn.className = 'button';
      trashBtn.style.gridColumn = '4 / 5';
      trashBtn.style.padding = '6px 8px';
      trashBtn.style.lineHeight = '1';
      trashBtn.style.height = '36px';
      trashBtn.style.width = '36px';
      trashBtn.style.color = '#6b7280';
      trashBtn.style.display = 'flex';
      trashBtn.style.alignItems = 'center';
      trashBtn.style.justifyContent = 'center';
      trashBtn.style.flexShrink = '0';
      trashBtn.style.alignSelf = 'stretch';

      firstRow.appendChild(fieldInputWrap);
      firstRow.appendChild(descInput);
      firstRow.appendChild(createBtn);
      firstRow.appendChild(trashBtn);

      const flagsRow = document.createElement('div');
      flagsRow.style.display = 'flex';
      flagsRow.style.flexWrap = 'wrap';
      flagsRow.style.gap = '12px';
      flagsRow.style.marginTop = '2px';
      if (!DOCUMENTOS_IS_ADMIN) {
        flagsRow.style.display = 'none';
      }

      const flagForAll = buildFlagCheckbox('Para todos los proyectos', true);
      const flagFilter = buildFlagCheckbox('Usado como filtro', true);
      const flagSearchable = buildFlagCheckbox('Buscable', true);
      flagsRow.appendChild(flagForAll.label);
      flagsRow.appendChild(flagFilter.label);
      flagsRow.appendChild(flagSearchable.label);

      group.appendChild(fieldLabel);
      group.appendChild(firstRow);
      group.appendChild(flagsRow);
      inputsWrap.appendChild(group);

      const entry = {
        key: field.key,
        label: field.label,
        input: fieldInput,
        dropdown: fieldDropdown,
        dropdownVisible: false,
        descriptionInput: descInput,
        flags: {
          forAll: flagForAll.input,
          filter: flagFilter.input,
          searchable: flagSearchable.input
        },
        createBtn: createBtn,
        deleteBtn: trashBtn,
        items: []
      };

      return entry;
    });

    const createRow = document.createElement('div');
    createRow.style.display = 'flex';
    createRow.style.justifyContent = 'center';
    createRow.style.marginTop = '6px';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Crear nueva nomenclatura';
    saveBtn.className = 'button -primary';
    nomenclatureSaveBtn = saveBtn;
    createRow.appendChild(saveBtn);

    const actions = document.createElement('div');
    actions.className = 'spot-action-bar';
    actions.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.className = 'button';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Continuar';
    confirmBtn.className = 'button -primary';
    actions.appendChild(confirmBtn);

    const dividerAfterInput = document.createElement('div');
    dividerAfterInput.style.height = '1px';
    dividerAfterInput.style.background = '#e6e6e6';
    dividerAfterInput.style.margin = '6px 0';

    body.appendChild(fileRow);
    body.appendChild(divider);
    body.appendChild(inputWrapper);
    body.appendChild(dividerAfterInput);
    body.appendChild(nomenclatureSelectRow);
    body.appendChild(dividerAfterSelect);
    body.appendChild(preview);
    body.appendChild(createRow);
    body.appendChild(inputsWrap);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    confirmBtn.addEventListener('click', () => closeRenameOverlay(true));
    closeBtn.addEventListener('click', () => closeRenameOverlay(false));

    input.addEventListener('input', () => {
      if (renameFileNameNode) {
        renameFileNameNode.textContent = input.value.trim();
      }
      if (nomenclatureEnabled) setNomenclatureEnabled(false);
    });

    nomenclatureFieldEntries.forEach((entry) => {
      entry.input.addEventListener('input', () => {
        const data = optionDataFromInput(entry);
        if (data) {
          if (entry.descriptionInput) {
            entry.descriptionInput.value = data.description;
          }
          if (entry.flags) {
            // flags are global per field, not per option
          }
        }
        if (entry.dropdownVisible) {
          renderDropdown(entry, entry.input.value);
        }
        setPreviewText(buildNomenclatureName(previewBaseName()));
        if (nomenclatureEnabled && pendingRenameFile) {
          applyNomenclatureName(pendingRenameFile.name);
        }
      });

      entry.input.addEventListener('click', () => {
        entry.input.focus();
        entry.dropdownVisible = true;
        renderDropdown(entry, entry.input.value);
      });

      entry.descriptionInput.addEventListener('input', () => {
        setPreviewText(buildNomenclatureName(previewBaseName()));
        if (nomenclatureEnabled && pendingRenameFile) {
          applyNomenclatureName(pendingRenameFile.name);
        }
      });

      if (entry.flags && DOCUMENTOS_IS_ADMIN) {
        const onFlagsChange = () => {
          updateNomenclatureField(entry.key, {
            is_for_all: entry.flags.forAll.checked,
            is_filter: entry.flags.filter.checked,
            is_searchable: entry.flags.searchable.checked
          }).catch((err) => {
            alert(`No se pudo guardar la configuracion: ${err.message}`);
          });
        };
        entry.flags.forAll.addEventListener('change', onFlagsChange);
        entry.flags.filter.addEventListener('change', onFlagsChange);
        entry.flags.searchable.addEventListener('change', onFlagsChange);
      }

      entry.createBtn.addEventListener('click', () => {
        const value = entry.input.value.trim();
        if (!value) {
          alert('Escribe un valor en el campo antes de guardar.');
          return;
        }
        if (entry.key === 'proyecto' && (value.length < 2 || value.length > 12)) {
          alert('Proyecto debe tener entre 2 y 12 caracteres.');
          return;
        }
        if (entry.key === 'creador' && value.length > 6) {
          alert('Creador debe tener maximo 6 caracteres.');
          return;
        }
        if (entry.key === 'volumen_sistema' && (value.length < 2 || value.length > 3)) {
          alert('Volumen/Sistema debe tener entre 2 y 3 caracteres.');
          return;
        }
        if (entry.key === 'nivel_localizacion' && (value.length < 2 || value.length > 3)) {
          alert('Nivel o Localizacion debe tener entre 2 y 3 caracteres.');
          return;
        }
        if (entry.key === 'tipo' && (value.length < 2 || value.length > 3)) {
          alert('Tipo de documento debe tener entre 2 y 3 caracteres.');
          return;
        }
        if (entry.key === 'disciplina' && (value.length < 2 || value.length > 3)) {
          alert('Disciplina debe tener entre 2 y 3 caracteres.');
          return;
        }
        if (entry.key === 'numero' && (value.length < 2 || value.length > 3)) {
          alert('Numero debe tener entre 2 y 3 caracteres.');
          return;
        }
        if (entry.key === 'estado' && (value.length < 2 || value.length > 3)) {
          alert('Estado debe tener entre 2 y 3 caracteres.');
          return;
        }
        const existing = optionDataFromInput(entry);
        const payload = {
          key: entry.key,
          value: value,
          description: entry.descriptionInput.value.trim()
        };
        const refreshSelection = (saved) => refreshNomenclatureItems({
          [entry.key]: { value: saved.value || payload.value, desc: saved.description || payload.description }
        });
        setButtonState(entry.createBtn, 'saving');
        if (existing && existing.id) {
          updateNomenclatureItem(existing.id, payload)
            .then((updated) => refreshSelection(updated).then(() => setButtonState(entry.createBtn, 'saved')))
            .catch((err) => {
              alert(`No se pudo actualizar la opcion: ${err.message}`);
              setButtonState(entry.createBtn, 'reset');
            });
          return;
        }
        createNomenclatureItem(payload)
          .then((created) => refreshSelection(created).then(() => setButtonState(entry.createBtn, 'saved')))
          .catch((err) => {
            alert(`No se pudo crear la opcion: ${err.message}`);
            setButtonState(entry.createBtn, 'reset');
          });
      });

      entry.deleteBtn.addEventListener('click', () => {
        const data = optionDataFromInput(entry);
        if (!data) {
          alert('Selecciona una opcion para eliminar.');
          return;
        }
        const confirmed = window.confirm('Deseas eliminar esta opcion?');
        if (!confirmed) return;
        deleteNomenclatureItem(data.id)
          .then(() => refreshNomenclatureItems())
          .catch((err) => {
            alert(`No se pudo eliminar la opcion: ${err.message}`);
          });
      });
    });

    document.addEventListener('click', (event) => {
      nomenclatureFieldEntries.forEach((entry) => {
        if (!entry.dropdown) return;
        const wrap = entry.input ? entry.input.parentElement : null;
        if (wrap && !wrap.contains(event.target)) {
          entry.dropdown.style.display = 'none';
          entry.dropdownVisible = false;
        }
      });
    });

    select.addEventListener('change', () => {
      const idx = parseInt(select.value, 10);
      const picked = currentNomenclatures[idx];
      if (!picked) return;
      const selectedByKey = {};
      NOMENCLATURE_FIELDS.forEach((field) => {
        selectedByKey[field.key] = {
          value: (picked[field.key] || '').toString(),
          desc: (picked[`${field.key}_desc`] || '').toString()
        };
      });
      refreshNomenclatureItems(selectedByKey).then(() => {
        setPreviewText(buildNomenclatureName(previewBaseName()));
      });
    });

    useBtn.addEventListener('click', () => {
      setNomenclatureEnabled(!nomenclatureEnabled);
      if (nomenclatureEnabled && pendingRenameFile) {
        applyNomenclatureName(pendingRenameFile.name);
        setPreviewText(buildNomenclatureName(pendingRenameFile.name));
      }
      setButtonState(useBtn, 'ok');
    });

    clearBtn.addEventListener('click', () => {
      resetNomenclatureSelection();
      setButtonState(clearBtn, 'ok');
    });

    deleteBtn.addEventListener('click', () => {
      const selected = getSelectedNomenclature();
      if (!selected || !selected.id) {
        alert('Selecciona una nomenclatura para eliminar.');
        return;
      }
      const confirmed = window.confirm('Deseas eliminar esta nomenclatura?');
      if (!confirmed) return;
      deleteNomenclature(selected.id)
        .then(() => refreshNomenclatures())
        .then(() => resetNomenclatureSelection())
        .catch((err) => {
          alert(`No se pudo eliminar la nomenclatura: ${err.message}`);
        });
    });

    saveBtn.addEventListener('click', () => {
      setButtonState(saveBtn, 'saving');
      const hasValues = nomenclatureFieldEntries.some((entry) => {
        const value = entry.input ? entry.input.value.trim() : '';
        return value.length > 0;
      });
      if (!hasValues) {
        alert('Completa al menos un campo para guardar la nomenclatura.');
        setButtonState(saveBtn, 'reset');
        return;
      }
      const wpId = detectWorkPackageId();
      const payload = { work_package_id: wpId || null };
      nomenclatureFieldEntries.forEach((entry) => {
        const value = entry.input ? entry.input.value.trim() : '';
        const desc = entry.descriptionInput ? entry.descriptionInput.value.trim() : '';
        payload[entry.key] = value;
        payload[`${entry.key}_desc`] = desc;
      });
      saveNomenclature(payload)
        .then(() => refreshNomenclatures().then(() => setButtonState(saveBtn, 'saved')))
        .catch((err) => {
          alert(`No se pudo guardar la nomenclatura: ${err.message}`);
          setButtonState(saveBtn, 'reset');
        });
    });

    renameOverlay = overlay;
    return overlay;
  }

  function syncRenameModalWidth() {
    if (!renameModal) return;
    const hostModal = document.querySelector('[data-test-selector="op-files-picker-modal"], .op-file-picker');
    const isNarrow = window.innerWidth <= 960;
    const baseWidth = Math.round(window.innerWidth * (isNarrow ? 0.9 : 0.35));
    if (!hostModal) {
      renameModal.style.setProperty('width', `${baseWidth}px`, 'important');
      renameModal.style.setProperty('max-width', `${baseWidth}px`, 'important');
      return;
    }
    const rect = hostModal.getBoundingClientRect();
    if (!rect || !rect.width) {
      renameModal.style.setProperty('width', `${baseWidth}px`, 'important');
      renameModal.style.setProperty('max-width', `${baseWidth}px`, 'important');
      return;
    }
    const target = Math.round(rect.width * (isNarrow ? 0.95 : 0.85));
    const finalWidth = Math.min(baseWidth, target);
    renameModal.style.setProperty('width', `${finalWidth}px`, 'important');
    renameModal.style.setProperty('max-width', `${finalWidth}px`, 'important');
  }

  function refreshNomenclatureItems(selectedByKey) {
    if (!nomenclatureFieldEntries.length) return Promise.resolve();
    const tasks = nomenclatureFieldEntries.map((entry) => {
      const fallback = {
        value: entry.input ? entry.input.value : '',
        desc: entry.descriptionInput ? entry.descriptionInput.value : ''
      };
      const selection = (selectedByKey && selectedByKey[entry.key]) || fallback;
      return fetchNomenclatureItems(entry.key).then((items) => {
        entry.items = Array.isArray(items) ? items : [];
        setInputOptions(entry, entry.items, selection.value);
        const selectedData = optionDataFromInput(entry);
        if (selection.desc && selection.desc.length > 0) {
          entry.descriptionInput.value = selection.desc;
        } else if (selectedData) {
          entry.descriptionInput.value = selectedData.description || '';
        } else {
          entry.descriptionInput.value = '';
        }
        return fetchNomenclatureField(entry.key).then((cfg) => {
          if (!cfg || Object.keys(cfg).length === 0) return;
          entry.flags.forAll.checked = toBool(cfg.is_for_all, true);
          entry.flags.filter.checked = toBool(cfg.is_filter, true);
          entry.flags.searchable.checked = toBool(cfg.is_searchable, true);
        });
      });
    });
    return Promise.all(tasks);
  }

  function refreshNomenclatures() {
    if (!nomenclatureSelect) return Promise.resolve();
    const wpId = detectWorkPackageId();
    if (!wpId) {
      currentNomenclatures = [];
      while (nomenclatureSelect.options.length > 1) {
        nomenclatureSelect.remove(1);
      }
      const opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.textContent = 'No se pudo detectar el Work Package';
      nomenclatureSelect.appendChild(opt);
      return Promise.resolve();
    }
    return fetchNomenclatures(wpId).then((list) => {
      currentNomenclatures = Array.isArray(list) ? list : [];
      while (nomenclatureSelect.options.length > 1) {
        nomenclatureSelect.remove(1);
      }
      if (currentNomenclatures.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.disabled = true;
        opt.textContent = wpId ? 'No hay nomenclaturas para este WP' : 'No hay nomenclaturas';
        nomenclatureSelect.appendChild(opt);
        return;
      }
      currentNomenclatures.forEach((entry, idx) => {
        const opt = document.createElement('option');
        opt.value = idx.toString();
        const label = NOMENCLATURE_FIELDS
          .map((field) => (entry[field.key] || '').toString().trim())
          .filter((value) => value.length > 0)
          .join('-') || 'Nomenclatura';
        opt.textContent = label;
        nomenclatureSelect.appendChild(opt);
      });
    });
  }

  function openRenameOverlay(file, input) {
    const overlay = ensureRenameOverlay();
    pendingRenameFile = file;
    pendingRenameInput = input;
    if (renameInputNode) {
      renameInputNode.value = file.name || '';
      renameInputNode.focus();
      renameInputNode.select();
    }
    if (renameFileNameNode) {
      renameFileNameNode.textContent = file.name || '';
    }
    if (renameFileMetaNode) {
      const size = formatFileSize(file.size);
      const ext = parseFilenameParts(file.name || '').ext;
      const extension = ext ? `.${ext}` : 'desconocido';
      const time = formatSelectionTime(Date.now());
      const nodes = renameFileMetaNode.parentElement ? renameFileMetaNode.parentElement.children : [];
      if (nodes.length >= 4) {
        nodes[1].textContent = `Tamano: ${size}`;
        nodes[2].textContent = `Extension: ${extension}`;
        // Se reemplaza "Seleccionado" por el checkbox de IA.
      } else {
        renameFileMetaNode.textContent = `${size} - ${extension} - ${time}`;
      }
    }
    if (renameIaProgressBar) {
      renameIaProgressBar.style.background = '#2563eb';
    }
    if (renameIaCheckbox) {
      renameIaCheckbox.checked = false;
      renameIaCheckbox.onchange = () => {
        logToServer('IA checkbox cambio (rename modal)', {
          checked: !!renameIaCheckbox.checked,
          name: file && file.name ? file.name : ''
        });
        if (renameIaStatusRow && renameIaProgressBar && renameIaStatusText) {
          if (renameIaCheckbox.checked) {
            renameIaStatusRow.style.display = 'flex';
            renameIaStatusText.textContent = 'Procesando...';
            renameIaProgressBar.style.width = '20%';
          } else {
            renameIaStatusRow.style.display = 'none';
            renameIaProgressBar.style.width = '0%';
          }
        }
        if (!renameIaCheckbox.checked) return;
        const uploadFile = buildUploadFile(file);
        uploadToIa(uploadFile);
      };
    }
    resetNomenclatureSelection();
    refreshNomenclatures();
    refreshNomenclatureItems();
    syncRenameModalWidth();
    overlay.style.display = 'flex';
  }

  function closeRenameOverlay(applyChange) {
    if (!renameOverlay) return;
    renameOverlay.style.display = 'none';
    if (renameIaStatusRow && renameIaProgressBar) {
      renameIaStatusRow.style.display = 'none';
      renameIaProgressBar.style.width = '0%';
    }

    const file = pendingRenameFile;
    const input = pendingRenameInput;
    pendingRenameFile = null;
    pendingRenameInput = null;
    if (!file || !input) return;

    if (!applyChange) {
      input.value = '';
      return;
    }

    const nextName = normalizeFilename(renameInputNode ? renameInputNode.value : '', file.name);
    if (!nextName) {
      input.value = '';
      return;
    }

    let nextFile = file;
    if (nextName !== file.name) {
      try {
        nextFile = new File([file], nextName, {
          type: file.type,
          lastModified: file.lastModified
        });
      } catch (e) {
        nextFile = file;
      }
    }

    if (window.DataTransfer) {
      try {
        const dt = new DataTransfer();
        dt.items.add(nextFile);
        input.files = dt.files;
      } catch (e) {
        // Ignore if browser blocks resetting files.
      }
    }

    suppressNextChange = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handleFileInputChange(event) {
    const input = event.target;
    if (!input || input.type !== 'file') return;
    const file = input.files && input.files[0];
    if (!file) return;
    if (window.DocumentosDebug && typeof window.DocumentosDebug.logToServer === 'function') {
      window.DocumentosDebug.logToServer({
        level: 'info',
        message: 'nomenclatura file input change',
        fileName: file.name,
        fileSize: file.size,
        suppressed: suppressNextChange
      });
    }
    if (!suppressNextChange) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      openRenameOverlay(file, input);
      return;
    }
    suppressNextChange = false;
    const signature = `${file.name}|${file.size}|${file.lastModified || 0}`;
    if (lastFileSignature && lastFileSignature === signature) {
      return;
    }
    lastFileSignature = signature;
    lastFileInput = input;
    lastLocalFile = file;
    lastRenamedFile = null;
    initialOriginalName = file.name;
    finalUploadName = file.name;
    updateRenamedFile();
  }

  function init() {
    if (window.__documentosNomenclaturaInit) return;
    window.__documentosNomenclaturaInit = true;
    document.addEventListener('change', handleFileInputChange, true);
    if (window.DocumentosConocimientoIA && typeof window.DocumentosConocimientoIA.onStatus === 'function') {
      window.DocumentosConocimientoIA.onStatus((state, payload) => {
        const currentName = pendingRenameFile && pendingRenameFile.name ? pendingRenameFile.name : '';
        if (payload && payload.filename && currentName && payload.filename !== currentName) return;
        if (!renameIaStatusRow || !renameIaStatusText || !renameIaProgressBar) return;
        if (state === 'processing') {
          renameIaStatusRow.style.display = 'flex';
          renameIaStatusText.textContent = 'Procesando...';
          renameIaProgressBar.style.background = '#2563eb';
          if (renameIaProgressBar.style.width === '0%') renameIaProgressBar.style.width = '20%';
          return;
        }
        if (state === 'ready') {
          renameIaStatusRow.style.display = 'flex';
          renameIaStatusText.textContent = 'Completado';
          renameIaProgressBar.style.width = '100%';
          renameIaProgressBar.style.background = '#16a34a';
          return;
        }
        if (state === 'waiting') {
          renameIaStatusRow.style.display = 'flex';
          renameIaStatusText.textContent = 'Aun procesando. Reintenta mas tarde.';
          renameIaProgressBar.style.width = '80%';
          return;
        }
      });
    }
    if (window.DocumentosDebug && typeof window.DocumentosDebug.logToServer === 'function') {
      window.DocumentosDebug.logToServer({
        level: 'info',
        message: 'nomenclatura init bound'
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('turbo:load', init);
  document.addEventListener('turbo:render', init);
  document.addEventListener('turbo:frame-load', init);
})();
