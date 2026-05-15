(function() {
  'use strict';

  if (window.iaCkeditorButtonInitialized) {
    return;
  }
  window.iaCkeditorButtonInitialized = true;

  const TOOLBAR_SELECTOR = '.ck.ck-toolbar';
  const TOOLBAR_ITEMS_SELECTOR = '.ck-toolbar__items';
  const BUTTON_CLASS = 'op-ia-ckeditor-button';
  const PANEL_ID = 'op-ia-panel';
  const BUTTON_LABEL = '\u300E\uD83D\uDCAC I.A.\u300F';
  const PANEL_TITLE = '\uD83D\uDCAC Asistente IA';
  const SETTINGS_LABEL = '\u2699\uFE0F';
  const CLOSE_SYMBOL = '\u2716';
  const PLAY_SYMBOL = '\u25B6';
  const COPY_SYMBOL = '\u29C9';
  const HINT_TEXT = 'Pregunta lo que quieras...';
  const PROMPT_PASSWORD = 'Vinfrancis230189@1';
  const PROMPT_STORAGE_KEY = 'ia:ckeditor:promptTemplate';
  const HIDDEN_CLASS = 'op-ia-hidden';
  const DEFAULT_PROMPT_TEMPLATE = `1. Eres Sara, asistente experta en documentación técnica en español.
2. Usa H1 para títulos principales, H2 para subtítulos, H3 para subdivisiones y H4 para detalles técnicos, aplicando niveles adicionales solo si el contenido lo requiere sin romper la jerarquía.
3. Aplica numeración estructurada (1, 1.1, 1.1.1, 1.1.1.1) y continúa la secuencia según la profundidad necesaria manteniendo la coherencia jerárquica.
4. Usa negrita para conceptos clave o términos BIM; cursiva para aclaraciones contextuales; viñetas simples para listas; numeración para procedimientos; y subviñetas cuando debas detallar elementos dentro de una lista.
5. Si el usuario solicita cuadros, tablas, matrices o comparativos, genera la información en estructura HTML tabular con <table>, <thead>, <tbody>, <tr>, <th> y <td>, permitiendo múltiples columnas, filas anidadas, encabezados jerárquicos y secciones adicionales según la complejidad del contenido.
6. No mezcles conceptos: cada sección debe abordar solo un tema.
7. Mantén lenguaje técnico, formal y neutro.
8. No uses opiniones ni lenguaje emocional.
9. Corrige gramática, sintaxis y asegura coherencia entre secciones.
10. Verifica que cada sección tenga un propósito definido y no duplique información.
11. Cuando falte información, completa únicamente la estructura o redacción estándar sin inventar datos específicos.
12. Al final del documento agrega una sección titulada ‘Referencias’, usando formato bibliográfico técnico: Autor u Organización (Año). Título en cursiva. Edición o código si aplica. Editorial u organización. URL si corresponde; incluye solo los elementos disponibles sin inventar los faltantes.`;

  let assistantPanel;
  let assistantInput;
  let assistantResponse;
  let assistantStatus;
  let assistantResponseBody;
  let assistantPromptPreview;
  let assistantControls;
  let assistantCopyButtons;
  let settingsPanel;
  let settingsPasswordRow;
  let settingsTextarea;
  let settingsStatus;
  let settingsConfigWrapper;
  let settingsTabButtons;
  let settingsPanels;
  const DEBUG_HEIGHT_KEY = 'ia:ckeditor:debugHeight';
  const DEBUG_WIDTH_KEY = 'ia:ckeditor:debugWidth';

  let settingsDebugToggle;
  let settingsDebugWrapper;
  let settingsDebugLog;
  let settingsDebugResizer;
  let debugLogHeight = null;
  let debugLogWidth = null;
  let settingsDebugRefreshButton;
  let settingsDebugClearButton;
  let currentPromptTemplate = null;

  let abortController = null;
  let lastPrompt = '';
  let lastResponsePlain = '';
  let lastResponseHtml = '';
  let lastRequestId = null;
  let typingInterval = null;

  function logDebug(event, payload) {
    try {
      window.iaCkeditorDebug?.log?.(event, payload);
    } catch (error) {
      // noop
    }
  }

  function createButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = [
      'ck',
      'ck-button',
      'ck-off',
      'ck-rounded-corners',
      'ck-button_with-text',
      BUTTON_CLASS,
    ].join(' ');

    const label = document.createElement('span');
    label.className = 'ck ck-button__label';
    label.textContent = BUTTON_LABEL;
    button.appendChild(label);

    button.title = 'Asistente IA';
    button.addEventListener('click', togglePanel);
    return button;
  }

  function ensurePanel() {
    if (assistantPanel) {
      ensurePanelAttached();
      return;
    }

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
      return;
    }

    const template = document.createElement('div');
    template.id = PANEL_ID;
    template.className = 'op-ia-panel';
    template.innerHTML = `
      <div class="op-ia-panel__header">
        <div class="op-ia-panel__title">${PANEL_TITLE}</div>
        <div class="op-ia-panel__header-actions">
          <button type="button" class="op-ia-panel__settings-button" title="Configuración IA">${SETTINGS_LABEL}</button>
          <button type="button" class="op-ia-panel__close" aria-label="Cerrar">${CLOSE_SYMBOL}</button>
        </div>
      </div>
      <div class="op-ia-panel__response is-empty">
        <div class="op-ia-panel__response-header">
          <span class="op-ia-panel__status">${HINT_TEXT}</span>
        </div>
        <div class="op-ia-panel__response-body"></div>
        <div class="op-ia-panel__prompt"></div>
      </div>
      <div class="op-ia-panel__controls">
        <div class="op-ia-panel__control-group">
          <button type="button" data-action="insert">Insertar</button>
          <button type="button" data-action="insert-below">Insertar abajo</button>
          <button type="button" data-action="retry">Intentar de nuevo</button>
          <button type="button" data-action="stop">Detener</button>
        </div>
        <button type="button" class="op-ia-panel__copy" data-copy="text" title="Copiar como texto">${COPY_SYMBOL} Copiar</button>
      </div>
      <div class="op-ia-panel__body">
        <div class="op-ia-panel__input-wrapper">
          <input type="text" class="op-ia-panel__input" placeholder="${HINT_TEXT}" />
        </div>
        <div class="op-ia-panel__actions">
          <button type="button" class="op-ia-panel__send" aria-label="Enviar">${PLAY_SYMBOL}</button>
        </div>
      </div>
    `;

    assistantPanel = template;
    assistantInput = template.querySelector('.op-ia-panel__input');
    assistantResponse = template.querySelector('.op-ia-panel__response');
    assistantStatus = template.querySelector('.op-ia-panel__status');
    assistantResponseBody = template.querySelector('.op-ia-panel__response-body');
    assistantPromptPreview = template.querySelector('.op-ia-panel__prompt');
    assistantControls = template.querySelector('.op-ia-panel__controls');
    assistantCopyButtons = template.querySelectorAll('.op-ia-panel__copy');

    template.querySelector('.op-ia-panel__close')
      .addEventListener('click', hidePanel);
    template.querySelector('.op-ia-panel__settings-button')
      .addEventListener('click', showSettingsPanel);

    template.querySelector('.op-ia-panel__send')
      .addEventListener('click', () => handleSend());

    assistantInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    });

    assistantCopyButtons.forEach((button) => {
      const mode = button.getAttribute('data-copy') || 'text';
      button.addEventListener('click', () => copyResponse(mode));
    });

    assistantControls.addEventListener('click', (event) => {
      const actionButton = event.target.closest('button[data-action]');
      if (!actionButton) {
        return;
      }
      handleControl(actionButton.dataset.action);
    });

    document.body.appendChild(template);
    resetPanelState();

    ensureSettingsPanel();
  }

  function ensureSettingsPanel() {
    if (settingsPanel) {
      document.body.contains(settingsPanel) || document.body.appendChild(settingsPanel);
      return;
    }

    const panel = document.createElement('div');
    panel.className = `op-ia-settings ${HIDDEN_CLASS}`;
    panel.innerHTML = `
      <div class="op-ia-settings__dialog">
        <div class="op-ia-settings__header">
          <span>Configuración del asistente IA</span>
          <button type="button" class="op-ia-settings__close" aria-label="Cerrar">${CLOSE_SYMBOL}</button>
        </div>
        <div class="op-ia-settings__body">
          <div class="op-ia-settings__password-row">
            <label>Contraseña</label>
            <input type="password" class="op-ia-settings__password" placeholder="Ingresa la contraseña" />
            <button type="button" class="op-ia-settings__unlock">Desbloquear</button>
          </div>
          <div class="op-ia-settings__config ${HIDDEN_CLASS}">
            <div class="op-ia-settings__tabs">
              <button type="button" class="op-ia-settings__tab-button active" data-tab="prompt">Prompt</button>
              <button type="button" class="op-ia-settings__tab-button" data-tab="debug">Debug</button>
            </div>
            <div class="op-ia-settings__panels">
              <div class="op-ia-settings__tab-panel" data-tab="prompt">
                <label>Prompt personalizado</label>
                <textarea class="op-ia-settings__prompt" rows="10"></textarea>
                <div class="op-ia-settings__actions">
                  <button type="button" class="op-ia-settings__save">Guardar</button>
                  <button type="button" class="op-ia-settings__reset">Restaurar</button>
                </div>
              </div>
              <div class="op-ia-settings__tab-panel op-ia-hidden" data-tab="debug">
                <label class="op-ia-settings__debug-toggle-row">
                  <input type="checkbox" class="op-ia-settings__debug-toggle" />
                  Activar registro detallado de consultas y respuestas
                </label>
              <div class="op-ia-settings__debug-actions">
                <button type="button" class="op-ia-settings__debug-refresh">Refrescar</button>
                <button type="button" class="op-ia-settings__debug-clear">Limpiar</button>
              </div>
              <div class="op-ia-settings__debug-log-wrapper">
                <div class="op-ia-settings__debug-log" role="log" aria-live="polite"></div>
                <div class="op-ia-settings__debug-resizer" title="Arrastra para ajustar"></div>
              </div>
                <p class="op-ia-settings__hint">Los registros se guardan únicamente en este navegador.</p>
              </div>
            </div>
          </div>
          <div class="op-ia-settings__status"></div>
        </div>
      </div>
    `;

    settingsPanel = panel;
    settingsPasswordRow = panel.querySelector('.op-ia-settings__password-row');
    settingsTextarea = panel.querySelector('.op-ia-settings__prompt');
    settingsStatus = panel.querySelector('.op-ia-settings__status');
    settingsConfigWrapper = panel.querySelector('.op-ia-settings__config');
    settingsTabButtons = panel.querySelectorAll('.op-ia-settings__tab-button');
    settingsPanels = panel.querySelectorAll('.op-ia-settings__tab-panel');
    settingsDebugToggle = panel.querySelector('.op-ia-settings__debug-toggle');
    settingsDebugWrapper = panel.querySelector('.op-ia-settings__debug-log-wrapper');
    settingsDebugLog = panel.querySelector('.op-ia-settings__debug-log');
    settingsDebugResizer = panel.querySelector('.op-ia-settings__debug-resizer');
    settingsDebugRefreshButton = panel.querySelector('.op-ia-settings__debug-refresh');
    settingsDebugClearButton = panel.querySelector('.op-ia-settings__debug-clear');

    settingsTabButtons.forEach((button) => {
      button.addEventListener('click', () => activateSettingsTab(button.dataset.tab));
    });

    panel.querySelector('.op-ia-settings__close').addEventListener('click', hideSettingsPanel);
    panel.querySelector('.op-ia-settings__unlock').addEventListener('click', handleUnlockSettings);
    panel.querySelector('.op-ia-settings__save').addEventListener('click', handleSavePrompt);
    panel.querySelector('.op-ia-settings__reset').addEventListener('click', handleResetPrompt);
    settingsDebugToggle?.addEventListener('change', (event) => {
      window.iaCkeditorDebug?.setEnabled?.(event.target.checked);
      logDebug('debug:toggle', { enabled: event.target.checked });
      updateDebugLogUI();
    });
    settingsDebugRefreshButton?.addEventListener('click', () => {
      updateDebugLogUI();
      logDebug('debug:manual-refresh');
    });
    settingsDebugClearButton?.addEventListener('click', () => {
      window.iaCkeditorDebug?.clear?.();
      updateDebugLogUI();
      logDebug('debug:manual-clear');
    });

    initDebugResizer();

    document.body.appendChild(panel);
  }

  function showSettingsPanel() {
    ensureSettingsPanel();
    loadPromptTemplate();
    settingsPanel.classList.remove(HIDDEN_CLASS);
    settingsPanel.querySelector('.op-ia-settings__password').value = '';
    settingsConfigWrapper.classList.add(HIDDEN_CLASS);
    settingsPasswordRow.classList.remove(HIDDEN_CLASS);
    activateSettingsTab('prompt');
    settingsStatus.textContent = '';
    console.debug('[IA CKEditor] Panel de configuración abierto (esperando contraseña).');
  }

  function hideSettingsPanel() {
    settingsPanel?.classList.add(HIDDEN_CLASS);
    console.debug('[IA CKEditor] Panel de configuración cerrado.');
  }

  function handleUnlockSettings() {
    const input = settingsPanel.querySelector('.op-ia-settings__password');
    if (input.value.trim() === PROMPT_PASSWORD) {
      settingsPasswordRow.classList.add(HIDDEN_CLASS);
      settingsConfigWrapper.classList.remove(HIDDEN_CLASS);
      settingsTextarea.value = getCurrentPromptTemplate();
      settingsStatus.textContent = '🔓 Edita el prompt y guarda los cambios.';
      activateSettingsTab('prompt');
      updateDebugControls();
      console.info('[IA CKEditor] Configuración desbloqueada correctamente.');
    } else {
      settingsStatus.textContent = '❌ Contraseña incorrecta.';
      console.warn('[IA CKEditor] Contraseña incorrecta al intentar desbloquear configuración.');
    }
    input.value = '';
  }

  function handleSavePrompt() {
    const value = settingsTextarea.value.trim();
    window.localStorage.setItem(PROMPT_STORAGE_KEY, value);
    currentPromptTemplate = value || null;
    settingsStatus.textContent = '✅ Prompt guardado correctamente.';
    console.info('[IA CKEditor] Prompt personalizado guardado (longitud:', value.length, ').');
  }

  function handleResetPrompt() {
    window.localStorage.removeItem(PROMPT_STORAGE_KEY);
    currentPromptTemplate = null;
    settingsTextarea.value = DEFAULT_PROMPT_TEMPLATE;
    settingsStatus.textContent = '↺ Prompt restaurado al valor por defecto.';
    console.info('[IA CKEditor] Prompt restaurado al valor por defecto.');
  }

  function activateSettingsTab(tabId) {
    if (!tabId) {
      return;
    }

    settingsTabButtons?.forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === tabId);
    });

    settingsPanels?.forEach((panel) => {
      panel.classList.toggle(HIDDEN_CLASS, panel.dataset.tab !== tabId);
    });

    if (tabId === 'debug') {
      updateDebugControls();
    }
  }

  function updateDebugControls() {
    if (!settingsDebugToggle) {
      return;
    }
    const enabled = window.iaCkeditorDebug?.isEnabled?.() ?? false;
    settingsDebugToggle.checked = enabled;
    updateDebugLogUI();
  }

  function updateDebugLogUI() {
    if (!settingsDebugLog) {
      return;
    }
    const logs = window.iaCkeditorDebug?.getLogs?.() || [];
    if (!logs.length) {
      settingsDebugLog.innerHTML = '<p class="op-ia-debug-empty">Sin eventos registrados.</p>';
      return;
    }
    const fragment = logs
      .slice()
      .map((entry) => {
        const timestamp = new Date(entry.timestamp || Date.now()).toLocaleString();
        const payload = entry.payload ? JSON.stringify(entry.payload, null, 2) : '';
        const requestId = entry.payload?.requestId;
        return `
          <div class="op-ia-debug-entry">
            <div class="op-ia-debug-entry__meta">
              <span class="op-ia-debug-entry__time">${timestamp}</span>
              <span class="op-ia-debug-entry__event">${entry.event}</span>
              ${requestId ? `<span class="op-ia-debug-entry__badge">ID: ${requestId}</span>` : ''}
            </div>
            ${payload ? `<pre class="op-ia-debug-entry__payload">${payload}</pre>` : ''}
          </div>
        `;
      })
      .join('');
    settingsDebugLog.innerHTML = fragment;
  }

  function initDebugResizer() {
    if (!settingsDebugWrapper || !settingsDebugLog || !settingsDebugResizer) {
      return;
    }
    if (settingsDebugResizer.dataset.bound === 'true') {
      return;
    }

    const savedHeight = parseInt(window.localStorage.getItem(DEBUG_HEIGHT_KEY) || '', 10);
    if (!Number.isNaN(savedHeight) && savedHeight > 0) {
      settingsDebugWrapper.style.height = `${savedHeight}px`;
    }
    const savedWidth = parseInt(window.localStorage.getItem(DEBUG_WIDTH_KEY) || '', 10);
    if (!Number.isNaN(savedWidth) && savedWidth > 0) {
      settingsDebugWrapper.style.width = `${savedWidth}px`;
    }

    let startX = 0;
    let startY = 0;
    let startHeight = 0;
    let startWidth = 0;
    const minHeight = 160;
    const maxHeight = 520;
    const minWidth = 260;

    function getMaxWidth() {
      const container = settingsConfigWrapper || settingsPanel;
      return Math.max(minWidth, (container?.clientWidth || 720) - 32);
    }

    function onMouseMove(event) {
      const deltaY = event.clientY - startY;
      const deltaX = event.clientX - startX;
      const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
      const newWidth = Math.min(Math.max(startWidth + deltaX, minWidth), getMaxWidth());
      settingsDebugWrapper.style.height = `${newHeight}px`;
      settingsDebugWrapper.style.width = `${newWidth}px`;
      debugLogHeight = newHeight;
      debugLogWidth = newWidth;
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      try {
        if (debugLogHeight) {
          window.localStorage.setItem(DEBUG_HEIGHT_KEY, String(debugLogHeight));
        }
        if (debugLogWidth) {
          window.localStorage.setItem(DEBUG_WIDTH_KEY, String(debugLogWidth));
        }
      } catch (error) {
        // noop
      }
    }

    settingsDebugResizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      startY = event.clientY;
      startX = event.clientX;
      const rect = settingsDebugWrapper.getBoundingClientRect();
      startHeight = rect.height;
      startWidth = rect.width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    settingsDebugResizer.dataset.bound = 'true';
  }

  function loadPromptTemplate() {
    if (currentPromptTemplate !== null) {
      return currentPromptTemplate;
    }
    const stored = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    currentPromptTemplate = stored && stored.trim() ? stored : null;
    return currentPromptTemplate;
  }

  function getCurrentPromptTemplate() {
    return loadPromptTemplate() || DEFAULT_PROMPT_TEMPLATE;
  }

  function ensurePanelAttached() {
    if (assistantPanel && !document.body.contains(assistantPanel)) {
      document.body.appendChild(assistantPanel);
      resetPanelState();
    }
  }

  function resetPanelState() {
    stopTypingEffect();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    lastPrompt = '';
    lastResponsePlain = '';
    lastResponseHtml = '';
    assistantPanel.classList.add('op-ia-panel--stage-initial');
    assistantPanel.classList.remove('is-loading');
    assistantResponse.classList.add('is-empty');
    assistantStatus.textContent = HINT_TEXT;
    assistantResponseBody.textContent = '';
    assistantPromptPreview.textContent = '';
    assistantInput.value = '';
    assistantInput.disabled = false;
  }

  function togglePanel() {
    ensurePanel();
    if (assistantPanel.classList.contains('is-visible')) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  function showPanel() {
    ensurePanelAttached();
    resetPanelState();
    assistantPanel.classList.add('is-visible');
    assistantInput?.focus();
    console.debug('[IA CKEditor] Panel principal mostrado');
  }

  function hidePanel() {
    if (assistantPanel) {
      assistantPanel.classList.remove('is-visible');
      console.debug('[IA CKEditor] Panel principal oculto');
    }
  }

  function getCsrfToken() {
    return (
      window.getCsrfToken?.() ||
      document.querySelector('meta[name="csrf-token"]')?.content ||
      window.OpenProject?.meta?.csrfToken ||
      ''
    );
  }

  function handleSend(promptOverride) {
    const prompt = (promptOverride ?? assistantInput.value).trim();
    if (!prompt || abortController) {
      return;
    }
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    lastPrompt = prompt;
    lastResponsePlain = '';
    lastResponseHtml = '';
    lastRequestId = null;
    logDebug('request:init', {
      prompt,
      requestId,
      description: 'Se capturó la consulta del usuario en el panel de CKEditor.',
    });
    setLoadingState(true, prompt);

    abortController = new AbortController();
    logDebug('request:start', {
      prompt,
      requestId,
      description: 'Enviando la consulta directamente a LightRAG para obtener la respuesta cruda.',
    });

    fetch('/ia_colaborativa/lightrag', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({
        message: prompt,
      }),
      signal: abortController.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('No se pudo contactar con el asistente.');
        }
        return response.json();
      })
      .then((data) => {
        abortController = null;
        setLoadingState(false);
        logDebug('request:success', {
          requestId,
          responseLength: (data.response || '').length,
          description: 'LightRAG respondió con contenido en Markdown sin maquillar.',
        });
        lastRequestId = requestId;
        renderResponse(data.response || '');
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return;
        }
        abortController = null;
        setLoadingState(false);
        logDebug('request:error', { requestId, message: error.message });
        showError(error.message || 'Ocurrio un error con la IA.');
      });
  }

  function setLoadingState(loading, prompt) {
    stopTypingEffect();
    assistantPanel.classList.toggle('is-loading', loading);
    assistantInput.disabled = loading;

    if (loading) {
      assistantPanel.classList.remove('op-ia-panel--stage-initial');
      assistantStatus.textContent = 'Sara esta redactando...';
      assistantResponseBody.textContent = '';
      assistantPromptPreview.textContent = prompt ? `Consulta: ${prompt}` : '';
      assistantResponse.classList.remove('is-empty');
    }
  }

  function formatResponseText(text) {
    if (!text) {
      return { plain: '', html: '' };
    }

    const normalized = text.replace(/\r\n/g, '\n');
    const expanded = expandInlineLists(normalized);
    const lines = expanded.split('\n');
    const htmlParts = [];
    const plainParts = [];
    let index = 0;

    while (index < lines.length) {
      const rawLine = lines[index];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length, 3);
        const clean = headingMatch[2].trim();
        htmlParts.push(`<div class="op-ia-heading level-${level}">${applyInlineFormatting(clean)}</div>`);
        plainParts.push(stripMarkers(clean));
        index += 1;
        continue;
      }

      const tableResult = parseTableBlock(lines, index);
      if (tableResult) {
        htmlParts.push(tableResult.html);
        plainParts.push(tableResult.plain);
        index = tableResult.nextIndex;
        continue;
      }

      const orderedResult = parseListBlock(lines, index, 'ol');
      if (orderedResult) {
        htmlParts.push(orderedResult.html);
        plainParts.push(orderedResult.plain);
        index = orderedResult.nextIndex;
        continue;
      }

      const unorderedResult = parseListBlock(lines, index, 'ul');
      if (unorderedResult) {
        htmlParts.push(unorderedResult.html);
        plainParts.push(unorderedResult.plain);
        index = unorderedResult.nextIndex;
        continue;
      }

      const paragraphResult = parseParagraphBlock(lines, index);
      htmlParts.push(paragraphResult.html);
      plainParts.push(paragraphResult.plain);
      index = paragraphResult.nextIndex;
    }

    return {
      plain: plainParts.join('\n\n').trim(),
      html: htmlParts.join('\n')
    };
  }

  function parseTableBlock(lines, startIndex) {
    const tableLines = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        break;
      }
      if (!looksLikeTableLine(line)) {
        break;
      }
      tableLines.push(line);
      i += 1;
    }

    if (tableLines.length < 2) {
      return null;
    }

    const html = buildTableHtml(tableLines);
    if (!html) {
      return null;
    }

    return {
      html,
      plain: tableLines.map((line) => line.trim()).join('\n'),
      nextIndex: i
    };
  }

  function looksLikeTableLine(line) {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) {
      return false;
    }
    const cells = trimmed.split('|');
    return cells.length >= 3;
  }

  function parseListBlock(lines, startIndex, type) {
    const regex = type === 'ol'
      ? /^\s{0,3}(\d+)[\.)]\s+(.*)$/
      : /^\s{0,4}[*+-]\s+(.*)$/;

    const items = [];
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        break;
      }
      const match = line.match(regex);
      if (!match) {
        break;
      }
      const label = type === 'ol' ? match[1] : null;
      const content = (type === 'ol' ? match[2] : match[1]).trim();
      items.push({ label, content });
      i += 1;
    }

    if (!items.length) {
      return null;
    }

    const tag = type === 'ol' ? 'ol' : 'ul';
    const html = `<${tag}>${items
      .map((item) => `<li>${applyInlineFormatting(item.content)}</li>`)
      .join('')}</${tag}>`;

    const plain = items
      .map((item, idx) => {
        if (type === 'ol') {
          const marker = item.label || `${idx + 1}`;
          return `${marker}. ${stripMarkers(item.content)}`;
        }
        return `- ${stripMarkers(item.content)}`;
      })
      .join('\n');

    return { html, plain, nextIndex: i };
  }

  function parseParagraphBlock(lines, startIndex) {
    const chunk = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        break;
      }
      chunk.push(line.trim());
      i += 1;
    }

    const paragraph = chunk.join(' ');
    return {
      html: `<p>${applyInlineFormatting(paragraph)}</p>`,
      plain: stripMarkers(paragraph),
      nextIndex: i
    };
  }

  function buildTableHtml(lines) {
    const cleaned = lines
      .map((line) => line.trim())
      .filter((line) => line && !/^(\|\s*-+\s*)+\|?$/.test(line));

    if (!cleaned.length) {
      return '';
    }

    const rows = cleaned.map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => applyInlineFormatting(cell.trim()))
    );

    if (!rows.length) {
      return '';
    }

    const headerCells = rows[0];
    const bodyRows = rows.slice(1);

    const thead = headerCells && headerCells.length
      ? `<thead><tr>${headerCells.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>`
      : '';

    const tbody = bodyRows.length
      ? `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`
      : '';

    return `<table class="op-ia-table">${thead}${tbody}</table>`;
  }

  function applyInlineFormatting(text) {
    if (!text) {
      return '';
    }
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>');
  }

  function stripMarkers(text) {
    if (!text) {
      return '';
    }
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\\([\\`*_{}\[\]()#+.!-])/g, '$1');
  }

  function expandInlineLists(input) {
    if (!input) {
      return '';
    }

    return input.replace(/[ \t]+(?=(\d+(?:\.\d+)*|[*+-])\s+)/g, function(match, marker, offset, source) {
      const prevChar = source[offset - 1] || '';
      const beforePrev = source[offset - 2] || '';
      if (prevChar === '\n') {
        return match;
      }
      if (prevChar === '[' || prevChar === '(') {
        return match;
      }
      if (marker && /^[*+-]$/.test(marker) && beforePrev === '[') {
        return match;
      }
      return '\n';
    });
  }

  function stripHtml(text) {
    if (!text) {
      return '';
    }
    const temp = document.createElement('div');
    temp.innerHTML = text;
    return temp.textContent || '';
  }

  function ensureTableClass(html) {
    if (!html) {
      return '';
    }

    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('table').forEach((table) => {
      table.classList.add('op-ia-table');
    });
    return temp.innerHTML;
  }

  function stopTypingEffect() {
    if (typingInterval) {
      window.clearInterval(typingInterval);
      typingInterval = null;
    }
  }

  function startTypingEffect(text) {
    assistantPanel.classList.remove('op-ia-panel--stage-initial');
    assistantResponse.classList.remove('is-empty');

    const rawContent = (text || '').trim();
    const { plain, html } = formatResponseText(rawContent);
    logDebug('response:formatted', {
      requestId: lastRequestId,
      stage: 'Maquillaje HTML',
      description: 'Transformamos el Markdown en HTML con headings, listas y tablas para CKEditor.',
      plainLength: plain.length,
      htmlLength: html.length,
      plain,
      html,
      snippet: plain.slice(0, 200),
    });
    lastResponsePlain = plain;
    lastResponseHtml = html;

    if (!rawContent || !plain) {
      assistantResponseBody.textContent = 'No obtuvimos respuesta.';
      assistantStatus.textContent = 'La IA no devolvio contenido.';
      return;
    }

    assistantStatus.textContent = 'Sara esta redactando...';
    assistantResponseBody.textContent = '';
    const target = document.createElement('div');
    assistantResponseBody.appendChild(target);

    let index = 0;
    const total = rawContent.length;
    const step = Math.max(1, Math.floor(total / 500));

    typingInterval = window.setInterval(() => {
      index += step;
      if (index >= total) {
        stopTypingEffect();
        assistantResponseBody.innerHTML = lastResponseHtml;
        assistantStatus.textContent = 'Respuesta lista.';
      } else {
        const partial = rawContent.slice(0, index);
        const partialResult = formatResponseText(partial);
        target.innerHTML = partialResult.html || partialResult.plain || '';
      }
    }, 12);
  }

  function renderResponse(rawText) {
    const raw = (rawText || '').trim();
    logDebug('response:raw', {
      requestId: lastRequestId,
      stage: 'LightRAG → CKEditor',
      description: 'Texto crudo recibido tal cual desde LightRAG (aún no formateado).',
      length: raw.length,
      raw,
      snippet: raw.slice(0, 200),
    });
    logDebug('response:render', {
      requestId: lastRequestId,
      stage: 'Renderer IA CKEditor',
      description: 'El panel está mostrando la respuesta mientras se aplica el efecto typing.',
      length: rawText?.length || 0,
    });
    assistantPromptPreview.textContent = lastPrompt ? `Consulta: ${lastPrompt}` : '';
    startTypingEffect(rawText);
  }

  function showError(message) {
    stopTypingEffect();
    assistantPanel.classList.remove('op-ia-panel--stage-initial');
    assistantStatus.textContent = message;
    assistantResponseBody.textContent = '';
    assistantPromptPreview.textContent = lastPrompt ? `Consulta: ${lastPrompt}` : '';
    assistantResponse.classList.remove('is-empty');
    assistantInput.disabled = false;
    logDebug('response:error-display', { requestId: lastRequestId, message });
  }

  function copyResponse(mode = 'text') {
    const plain = (lastResponsePlain || '').trim();
    const html = (lastResponseHtml || '').trim();
    const value = mode === 'html' ? (html || plain) : plain;

    if (!value) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
    } else {
      const temp = document.createElement('textarea');
      temp.value = value;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
  }

  function handleControl(action) {
    switch (action) {
      case 'insert':
        insertContentIntoEditor('replace');
        dispatchInsertEvent('replace');
        break;
      case 'insert-below':
        insertContentIntoEditor('below');
        dispatchInsertEvent('below');
        break;
      case 'retry':
        if (lastPrompt) {
          handleSend(lastPrompt);
        }
        break;
      case 'stop':
        if (abortController) {
          abortController.abort();
          abortController = null;
          assistantStatus.textContent = 'Consulta detenida.';
          setLoadingState(false);
        }
        break;
      default:
        break;
    }
  }

  function dispatchInsertEvent(placement) {
    const contentHtml = lastResponseHtml || lastResponsePlain;
    if (!contentHtml) {
      return;
    }

    window.dispatchEvent(new CustomEvent('ia:ckeditor:insert', {
      bubbles: true,
      detail: {
        placement,
        content: contentHtml,
      },
    }));
    console.debug('[IA CKEditor] Evento ia:ckeditor:insert emitido (modo:', placement, ').');
  }

  function resolveEditorElements() {
    const editable =
      document.querySelector('.ck-editor__editable.ck-focused') ||
      document.querySelector('.document-editor__editable.ck-focused') ||
      document.querySelector('.ck-editor__editable') ||
      document.querySelector('.document-editor__editable');

    if (!editable) {
      const wrapperFallback = document.querySelector('.op-ckeditor-source-element');
      return wrapperFallback ? { wrapper: wrapperFallback, editable: null } : null;
    }

    let wrapper = editable.closest('.op-ckeditor-source-element');
    if (!wrapper) {
      wrapper = document.querySelector('.op-ckeditor-source-element');
    }

    const editor =
      editable.ckEditorInstance ||
      editable.ckeditorInstance ||
      editable.editor ||
      null;

    return wrapper ? { wrapper, editable, editor } : null;
  }

  function createCkeditorEvent(name, detail) {
    if (typeof window.CustomEvent === 'function') {
      return new CustomEvent(name, {
        detail,
        bubbles: false,
        cancelable: false,
      });
    }

    const legacyEvent = document.createEvent('CustomEvent');
    legacyEvent.initCustomEvent(name, false, false, detail);
    return legacyEvent;
  }

  function getEditorData(refs) {
    if (refs.editor) {
      try {
        return refs.editor.getData({ trim: false }) || '';
      } catch (error) {
        console.error('[IA CKEditor] Error al obtener datos vía instancia.', error);
      }
    }

    let data = '';
    const event = createCkeditorEvent('op:ckeditor:getData', (value) => {
      data = value || '';
    });

    refs.wrapper.dispatchEvent(event);
    return data || '';
  }

  function setEditorData(refs, html) {
    if (refs.editor) {
      try {
        refs.editor.setData(html);
        return;
      } catch (error) {
        console.error('[IA CKEditor] Error al establecer datos vía instancia.', error);
      }
    }

    refs.wrapper.dispatchEvent(createCkeditorEvent('op:ckeditor:setData', html));
  }

  function insertContentIntoEditor(placement) {
    const contentHtml = lastResponseHtml || lastResponsePlain;
    if (!contentHtml) {
      console.warn('[IA CKEditor] No hay contenido disponible para insertar.');
      logDebug('editor:insert:skip', { requestId: lastRequestId, reason: 'no-content' });
      return false;
    }

    const editorRefs = resolveEditorElements();
    if (!editorRefs?.wrapper) {
      console.warn('[IA CKEditor] No se encontró un editor activo para insertar contenido.');
      logDebug('editor:insert:skip', { requestId: lastRequestId, reason: 'no-editor' });
      return false;
    }

    let nextData = contentHtml;
    if (placement === 'below') {
      const currentData = getEditorData(editorRefs);
      if (currentData.trim()) {
        nextData = `${currentData}<p></p>${contentHtml}`;
      } else {
        nextData = contentHtml;
      }
    }

    console.debug('[IA CKEditor] Enviando op:ckeditor:setData con longitud', nextData.length, 'en modo', placement);
    logDebug('editor:insert', {
      requestId: lastRequestId,
      stage: 'Inserción CKEditor',
      description: placement === 'below'
        ? 'Se anexó el contenido debajo del texto existente.'
        : 'Se reemplazó el contenido actual con la respuesta formateada.',
      mode: placement,
      length: nextData.length,
      snippet: stripHtml(nextData).slice(0, 200),
    });
    setEditorData(editorRefs, nextData);
    console.info('[IA CKEditor] Contenido insertado en CKEditor (modo:', placement, ').');

    if (editorRefs.editable) {
      editorRefs.editable.focus();
    } else {
      console.debug('[IA CKEditor] No se encontró editable para enfocar tras la inserción.');
    }

    return true;
  }

  function enhanceToolbar(toolbar) {
    if (!toolbar) {
      return;
    }

    const toolbarItems = toolbar.querySelector(TOOLBAR_ITEMS_SELECTOR) || toolbar;
    if (!toolbarItems) {
      return;
    }

    let button = toolbarItems.querySelector(`.${BUTTON_CLASS}`);
    if (!button) {
      button = createButton();
      toolbarItems.appendChild(button);
    }

    ensureButtonOrder(toolbarItems, button);
  }

  function ensureButtonOrder(toolbarItems, assistantButton) {
    if (!assistantButton) {
      return;
    }

    const magicButton = toolbarItems.querySelector('.op-magic-ckeditor-button');
    if (magicButton) {
      const nextSibling = magicButton.nextElementSibling;
      if (nextSibling !== assistantButton) {
        magicButton.insertAdjacentElement('afterend', assistantButton);
      }
      return;
    }

    // If there is no magic button, ensure assistant is at the end to avoid bouncing.
    if (assistantButton !== toolbarItems.lastElementChild) {
      toolbarItems.appendChild(assistantButton);
    }
  }

  function scanExisting() {
    const toolbars = document.querySelectorAll(TOOLBAR_SELECTOR);
    toolbars.forEach(enhanceToolbar);

    if (toolbars.length === 0) {
      window.setTimeout(scanExisting, 500);
    }
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.target instanceof HTMLElement) {
        const toolbarTarget = mutation.target.matches(TOOLBAR_SELECTOR)
          ? mutation.target
          : mutation.target.closest?.(TOOLBAR_SELECTOR);
        if (toolbarTarget) {
          enhanceToolbar(toolbarTarget);
        }
      }

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        if (node.matches?.(TOOLBAR_SELECTOR)) {
          enhanceToolbar(node);
          return;
        }

        const nestedToolbar = node.querySelector?.(TOOLBAR_SELECTOR);
        if (nestedToolbar) {
          enhanceToolbar(nestedToolbar);
        }
      });
    });
  });

  document.addEventListener('turbo:load', () => {
    ensurePanelAttached();
    scanExisting();
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensurePanel();
    scanExisting();
  });

  ensurePanel();
  scanExisting();
  ensurePanelAttached();

  function startObserving() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', startObserving, { once: true });
      return;
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  startObserving();
})();
