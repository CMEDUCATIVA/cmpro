
  function resolveEditorElements() {
    const editable =
      document.querySelector('.ck-editor__editable.ck-focused') ||
      document.querySelector('.document-editor__editable.ck-focused') ||
      document.querySelector('.ck-editor__editable') ||
      document.querySelector('.document-editor__editable');

    if (!editable) {
      return null;
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
(function() {
  'use strict';

  if (window.opIaMagicInitialized) {
    return;
  }
  window.opIaMagicInitialized = true;

  const PANEL_ID = 'op-ia-magic-panel';
  const CLOSE_SYMBOL = '\u2716';
  const COPY_SYMBOL = '\u29C9';
  const STATUS_IDLE = 'Selecciona un comando Magic y un texto en el editor.';

  let panel;
  let statusEl;
  let responseWrapper;
  let responseBody;
  let promptPreview;
  let controlsContainer;
  let copyButtons;
  let inputEl;

  let abortController = null;
  let lastPrompt = '';
  let lastResponsePlain = '';
  let lastResponseHtml = '';
  let typingInterval = null;
  let currentCommand = null;
  let selectionContext = null;

  window.opIaMagic = {
    runCommand,
  };

  function runCommand(command) {
    const selection = captureSelectionContent();
    if (!selection) {
      console.warn('[Magic CKEditor] No hay selecciÃ³n activa para el comando', command?.id);
      notifySelectionRequired();
      return;
    }

    ensurePanel();
    ensurePanelAttached();
    resetPanelState();

    currentCommand = command;
    selectionContext = selection;
    console.info('[Magic CKEditor] Ejecutando comando', command?.id, {
      textLength: selection.text.length,
      htmlLength: selection.html.length,
      startPath: selection.startPath,
      endPath: selection.endPath,
    });

    inputEl.value = selection.text;
    inputEl.readOnly = true;
    inputEl.classList.add('is-readonly');

    promptPreview.textContent = buildPromptLabel(command);
    panel.classList.add('is-visible');

    const prompt = buildPrompt(command, selection);
    handleSend(prompt);
  }

  function buildPrompt(command, selection) {
    return `${command.prompt}\n\nTexto seleccionado:\n${selection.text}\n\nHTML original:\n${selection.html}`;
  }

  function buildPromptLabel(command = {}) {
    const label = command.label || 'Comando';
    const group = command.groupLabel || label;
    return `Magic Â· ${group}: ${label}`;
  }

  function ensurePanel() {
    if (panel) {
      return;
    }

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
      return;
    }

    const element = document.createElement('div');
    element.id = PANEL_ID;
    element.className = 'op-ia-panel op-ia-panel--magic';
    element.innerHTML = `
      <div class="op-ia-panel__header">
        <div class="op-ia-panel__title">Magic Â· Asistente IA</div>
        <button type="button" class="op-ia-panel__close" aria-label="Cerrar">${CLOSE_SYMBOL}</button>
      </div>
      <div class="op-ia-panel__response is-empty">
        <div class="op-ia-panel__response-header">
          <span class="op-ia-panel__status">${STATUS_IDLE}</span>
        </div>
        <div class="op-ia-panel__response-body"></div>
        <div class="op-ia-panel__prompt"></div>
      </div>
      <div class="op-ia-panel__controls">
        <div class="op-ia-panel__control-group">
          <button type="button" data-action="replace">Reemplazar</button>
          <button type="button" data-action="insert-below">Insertar abajo</button>
          <button type="button" data-action="retry">Intentar de nuevo</button>
          <button type="button" data-action="stop">Detener</button>
        </div>
        <button type="button" class="op-ia-panel__copy" data-copy="text" title="Copiar respuesta">${COPY_SYMBOL} Copiar</button>
      </div>
      <div class="op-ia-panel__body">
        <div class="op-ia-panel__input-wrapper">
          <textarea class="op-ia-panel__input" rows="3" placeholder="Texto seleccionado..."></textarea>
        </div>
      </div>
    `;

    element.querySelector('.op-ia-panel__close')
      .addEventListener('click', hidePanel);

    controlsContainer = element.querySelector('.op-ia-panel__controls');
    controlsContainer.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }
      handleControl(button.dataset.action);
    });

    copyButtons = element.querySelectorAll('.op-ia-panel__copy');
    copyButtons.forEach((button) => {
      const mode = button.getAttribute('data-copy') || 'text';
      button.addEventListener('click', () => copyResponse(mode));
    });

    panel = element;
    statusEl = element.querySelector('.op-ia-panel__status');
    responseWrapper = element.querySelector('.op-ia-panel__response');
    responseBody = element.querySelector('.op-ia-panel__response-body');
    promptPreview = element.querySelector('.op-ia-panel__prompt');
    inputEl = element.querySelector('.op-ia-panel__input');
  }

  function ensurePanelAttached() {
    if (panel && !document.body.contains(panel)) {
      document.body.appendChild(panel);
    }
  }

  function resetPanelState() {
    stopTypingEffect();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    panel.classList.add('op-ia-panel--stage-initial');
    panel.classList.remove('is-loading');
    responseWrapper.classList.add('is-empty');
    statusEl.textContent = STATUS_IDLE;
    responseBody.textContent = '';
    promptPreview.textContent = '';
    inputEl.value = '';
    inputEl.readOnly = false;
    lastPrompt = '';
    lastResponsePlain = '';
    lastResponseHtml = '';
  }

  function handleControl(action) {
    switch (action) {
      case 'replace':
        if (replaceSelectionWithResponse()) {
          hidePanel();
        }
        break;
      case 'insert-below':
        if (insertBelowSelection()) {
          hidePanel();
        }
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
          setLoadingState(false);
          statusEl.textContent = 'Consulta detenida.';
        }
        break;
      default:
        break;
    }
  }

  function handleSend(promptOverride) {
    const prompt = (promptOverride || '').trim();
    if (!prompt || abortController) {
      return;
    }

    lastPrompt = prompt;
    lastResponsePlain = '';
    lastResponseHtml = '';

    setLoadingState(true, prompt);

    abortController = new AbortController();
    fetch('/ia_colaborativa/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({
        message: prompt,
        agent_type: 'docs',
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
        renderResponse(data.response || '');
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return;
        }
        abortController = null;
        setLoadingState(false);
        showError(error.message || 'Ocurri\u00f3 un error con la IA.');
      });
  }

  function setLoadingState(loading, prompt) {
    stopTypingEffect();
    panel.classList.toggle('is-loading', loading);

    if (loading) {
      panel.classList.remove('op-ia-panel--stage-initial');
      responseWrapper.classList.remove('is-empty');
      statusEl.textContent = 'Sara est\u00e1 redactando...';
      responseBody.textContent = '';
      promptPreview.textContent = buildPromptLabel(currentCommand || {});
    }
  }

  function renderResponse(text) {
    const { plain, html } = formatResponseText(text);
    lastResponsePlain = plain;
    lastResponseHtml = html;

    if (!html) {
      responseBody.textContent = 'No se recibi\u00f3 una respuesta de la IA.';
      return;
    }

    startTypingEffect(html);
  }

  function showError(message) {
    responseWrapper.classList.remove('is-empty');
    statusEl.textContent = 'Se produjo un error.';
    responseBody.textContent = message;
  }

  function copyResponse(mode) {
    const content = mode === 'text' ? lastResponsePlain : lastResponseHtml;
    if (!content) {
      return;
    }
    navigator.clipboard.writeText(content)
      .catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      });
  }

  function hidePanel() {
    if (panel) {
      panel.classList.remove('is-visible');
      selectionContext = null;
      currentCommand = null;
      resetPanelState();
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

  function stopTypingEffect() {
    if (typingInterval) {
      window.clearInterval(typingInterval);
      typingInterval = null;
    }
  }

  function startTypingEffect(html) {
    stopTypingEffect();
    responseBody.innerHTML = '';

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const nodes = Array.from(tempDiv.childNodes);
    let index = 0;

    typingInterval = window.setInterval(() => {
      if (index >= nodes.length) {
        stopTypingEffect();
        return;
      }
      responseBody.appendChild(nodes[index].cloneNode(true));
      index += 1;
    }, 10);
  }

  function captureSelectionContent() {
    const refs = resolveEditorElements();
    if (!refs?.editable) {
      return null;
    }

    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!range || range.collapsed) {
      return null;
    }

    if (
      !refs.editable.contains(range.startContainer) ||
      !refs.editable.contains(range.endContainer)
    ) {
      return null;
    }

    const startPath = getNodePath(refs.editable, range.startContainer);
    const endPath = getNodePath(refs.editable, range.endContainer);

    if (!startPath || !endPath) {
      return null;
    }

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const text = (container.textContent || '').trim();
    const html = (container.innerHTML || '').trim();

    if (!text) {
      return null;
    }

    return {
      text,
      html,
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset,
      editable: refs.editable,
      editor: refs.editor || null,
      domRange: range.cloneRange(),
    };
  }

  function getNodePath(root, node) {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) {
        return null;
      }
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      path.unshift(index);
      current = parent;
    }

    if (current !== root) {
      return null;
    }

    return path;
  }

  function resolveNodeFromPath(root, path) {
    let node = root;
    for (let i = 0; i < path.length; i += 1) {
      node = node?.childNodes?.[path[i]];
      if (!node) {
        return null;
      }
    }
    return node;
  }

  function createRangeFromContext() {
    if (!selectionContext) {
      return null;
    }
    const startNode = resolveNodeFromPath(selectionContext.editable, selectionContext.startPath);
    const endNode = resolveNodeFromPath(selectionContext.editable, selectionContext.endPath);
    if (!startNode || !endNode) {
      return null;
    }
    const range = document.createRange();
    const startLen = getNodeRangeLength(startNode);
    const endLen = getNodeRangeLength(endNode);
    range.setStart(startNode, Math.min(selectionContext.startOffset, startLen));
    range.setEnd(endNode, Math.min(selectionContext.endOffset, endLen));
    return range;
  }

  function getNodeRangeLength(node) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      return node.length || 0;
    }
    return node.childNodes?.length || 0;
  }

  function replaceSelectionWithResponse() {
    const contentHtml = lastResponseHtml || lastResponsePlain;
    if (!contentHtml) {
      console.warn('[Magic CKEditor] No hay contenido para reemplazar la selección.');
      return false;
    }

    try {
      if (selectionContext?.editor && selectionContext.domRange) {
        const success = replaceUsingEditor(selectionContext.editor, selectionContext, contentHtml, 'replace');
        if (success) {
          return true;
        }
        console.warn('[Magic CKEditor] Falló el reemplazo mediante el editor, usando DOM.');
      }

      const range = createRangeFromContext();
      if (!range) {
        console.warn('[Magic CKEditor] No se pudo reconstruir el rango de selección.');
        return false;
      }

      const editable = selectionContext.editable;
      editable?.focus();

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      range.deleteContents();
      range.insertNode(htmlToFragment(contentHtml));
      selection.removeAllRanges();
      selectionContext = null;
      console.info('[Magic CKEditor] Reemplazo completado (DOM). Longitud', contentHtml.length);
      return true;
    } catch (error) {
      console.error('[Magic CKEditor] Error al reemplazar la selección.', error);
      return false;
    }
  }

  function insertBelowSelection() {
    const contentHtml = lastResponseHtml || lastResponsePlain;
    if (!contentHtml) {
      console.warn('[Magic CKEditor] No hay contenido para insertar.');
      return false;
    }

    try {
      if (selectionContext?.editor && selectionContext.domRange) {
        const success = replaceUsingEditor(selectionContext.editor, selectionContext, contentHtml, 'below');
        if (success) {
          return true;
        }
        console.warn('[Magic CKEditor] Falló la inserción mediante el editor, usando DOM.');
      }

      const range = createRangeFromContext();
      if (!range) {
        console.warn('[Magic CKEditor] No se pudo reconstruir el rango para insertar debajo.');
        return false;
      }

      const editable = selectionContext.editable;
      editable?.focus();

      const selection = window.getSelection();
      selection.removeAllRanges();
      range.collapse(false);
      selection.addRange(range);

      range.insertNode(htmlToFragment(contentHtml));
      selection.removeAllRanges();
      selectionContext = null;
      console.info('[Magic CKEditor] Inserción debajo completada (DOM). Longitud', contentHtml.length);
      return true;
    } catch (error) {
      console.error('[Magic CKEditor] Error al insertar después de la selección.', error);
      return false;
    }
  }

  function replaceUsingEditor(editor, context, html, mode) {
    try {
      const domConverter = editor.editing.view.domConverter;
      const mapper = editor.editing.mapper;
      const viewRange = domConverter.domRangeToView(context.domRange);
      const modelRange = mapper.toModelRange(viewRange);
      const viewFragment = editor.data.processor.toView(html);
      const modelFragment = editor.data.toModel(viewFragment);

      editor.editing.view.focus();
      editor.model.change((writer) => {
        if (mode === 'replace') {
          writer.remove(modelRange);
          writer.insert(modelFragment, modelRange.start);
        } else {
          writer.insert(modelFragment, modelRange.end);
        }
      });

      selectionContext = null;
      console.info('[Magic CKEditor] Operación mediante modelo completada (modo:', mode, ').');
      return true;
    } catch (error) {
      console.error('[Magic CKEditor] No se pudo utilizar el editor para modificar el contenido.', error);
      return false;
    }
  }
function htmlToFragment(html) {
    const container = document.createElement('div');
    container.innerHTML = html;
    const fragment = document.createDocumentFragment();
    while (container.firstChild) {
      fragment.appendChild(container.firstChild);
    }
    return fragment;
  }

  function notifySelectionRequired() {
    const message = 'Selecciona un fragmento del editor para usar Magic.';
    if (window.OpenProject?.notifications?.addError) {
      window.OpenProject.notifications.addError(message);
    } else {
      window.alert(message);
    }
  }

  function formatResponseText(text) {
    if (!text) {
      return { plain: '', html: '' };
    }

    const sanitized = text.replace(/```(?:html|markdown|code)?\s*([\s\S]*?)```/gi, '$1').replace(/```/g, '');
    const normalized = sanitized.replace(/\r\n/g, '\n');
    const blocks = normalized.split(/\n{2,}/);
    const htmlParts = [];
    const plainParts = [];

    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return;
      }

      const cleaned = trimmed.replace(/\s*\[\d+\]/g, '');
      const content = cleaned || trimmed;

      if (/^#{1,6}\s/.test(content)) {
        const match = content.match(/^(#{1,6})\s*(.+)$/);
        if (match) {
          const hashes = match[1];
          const title = match[2];
          const level = Math.min(hashes.length, 3);
          const clean = title.trim();
          htmlParts.push(`<div class="op-ia-heading level-${level}">${applyInlineFormatting(clean)}</div>`);
          plainParts.push(stripMarkers(clean));
          return;
        }
      }

      if (/^<table[\s>]/i.test(content)) {
        htmlParts.push(ensureTableClass(content));
        plainParts.push(stripHtml(content));
        return;
      }

      const lines = content.split('\n');
      if (lines.every((line) => /\|/.test(line))) {
        const tableHtml = buildTableHtml(lines);
        if (tableHtml) {
          htmlParts.push(tableHtml);
        }
        plainParts.push(lines.join('\n'));
        return;
      }

      if (lines.every((line) => /^-\s+/.test(line))) {
        const items = lines.map((line) => line.replace(/^-\s+/, '').trim());
        if (items.length) {
          htmlParts.push(`<ul>${items.map((item) => `<li>${applyInlineFormatting(item)}</li>`).join('')}</ul>`);
          plainParts.push(items.map((item) => `- ${stripMarkers(item)}`).join('\n'));
          return;
        }
      }

      htmlParts.push(`<p>${applyInlineFormatting(trimmed)}</p>`);
      plainParts.push(stripMarkers(trimmed));
    });

    return {
      plain: plainParts.join('\n\n'),
      html: htmlParts.join(''),
    };
  }

  function applyInlineFormatting(text) {
    if (!text) {
      return '';
    }
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  function stripMarkers(text) {
    return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
  }

  function ensureTableClass(html) {
    if (!/<table/i.test(html)) {
      return html;
    }
    if (html.includes('class="op-ia-table"')) {
      return html;
    }
    return html.replace('<table', '<table class="op-ia-table"');
  }

  function stripHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || '';
  }

  function buildTableHtml(lines) {
    if (!lines.length) {
      return '';
    }
    const rows = lines.map((line) => `<tr>${line.split('|').map((cell) => `<td>${applyInlineFormatting(cell.trim())}</td>`).join('')}</tr>`);
    return `<table class="op-ia-table">${rows.join('')}</table>`;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hidePanel();
    }
  });
})();



