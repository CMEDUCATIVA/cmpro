(function() {
  'use strict';

  const BUTTON_ID = 'documentos-ajustes-button';
  const MODAL_SELECTOR = '.documentos-rename-overlay';
  const HEADER_SELECTOR = '.spot-modal--header';
  const LOG_URL = '/documentos/log';
  const OVERLAY_ATTRIBUTE = 'data-documentos-overlay';
  const DOCUMENTOS_IS_ADMIN = !!(window.DocumentosIsAdmin);

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function logToServer(payload) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
    fetch(LOG_URL, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  function createButton() {
    if (!DOCUMENTOS_IS_ADMIN) return null;
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Ajustes Documentos');
    btn.title = 'Ajustes Documentos';
    btn.innerHTML = '<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\" width=\"16\" height=\"16\"><path fill=\"currentColor\" d=\"M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7zm8.94 3.5c0-.52-.06-1.02-.17-1.5l2.03-1.58l-2-3.46l-2.39.96a8.5 8.5 0 0 0-2.6-1.5l-.36-2.54h-4l-.36 2.54c-.93.32-1.8.75-2.6 1.5l-2.39-.96l-2 3.46l2.03 1.58c-.11.48-.17.98-.17 1.5c0 .52.06 1.02.17 1.5l-2.03 1.58l2 3.46l2.39-.96c.8.75 1.67 1.18 2.6 1.5l.36 2.54h4l.36-2.54c.93-.32 1.8-.75 2.6-1.5l2.39.96l2-3.46l-2.03-1.58c.11-.48.17-.98.17-1.5z\"/></svg>'
    btn.style.border = 'none';
    btn.style.background = 'transparent';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '16px';
    btn.style.lineHeight = '1';
    btn.style.padding = '0';
    btn.style.width = '28px';
    btn.style.height = '28px';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.color = '#4b5563';
    btn.dataset.documentosInjected = '1';
    btn.addEventListener('click', () => {
      console.info('[Documentos] Boton ajustes pulsado');
      logToServer({
        level: 'info',
        message: 'Boton ajustes Documentos pulsado'
      });
    });
    return btn;
  }

  function attachButtonToModal(modal) {
    if (!modal) return;
    const header = modal.querySelector(HEADER_SELECTOR);
    if (!header) return;
    if (header.querySelector(`#${BUTTON_ID}`)) return;
    const button = createButton();
    if (!button) return;
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    let actions = header.querySelector('.documentos-header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'documentos-header-actions';
      actions.style.display = 'flex';
      actions.style.alignItems = 'center';
      actions.style.gap = '8px';
      actions.style.marginLeft = 'auto';
      const title = header.querySelector('#spotModalTitle');
      const toMove = Array.from(header.children).filter((child) => child !== title);
      toMove.forEach((child) => actions.appendChild(child));
      header.appendChild(actions);
    }
    const closeBtn = Array.from(actions.children).find((child) => child.getAttribute && child.getAttribute('aria-label') === 'Cerrar');
    if (closeBtn) {
      actions.insertBefore(button, closeBtn);
    } else {
      actions.appendChild(button);
    }
  }

  function createOverlay(modal, bodyRect) {
    const overlay = document.createElement('div');
    overlay.setAttribute(OVERLAY_ATTRIBUTE, '1');
    overlay.style.position = 'absolute';
    overlay.style.top = `${bodyRect.top}px`;
    overlay.style.left = `${bodyRect.left}px`;
    overlay.style.width = `${bodyRect.width}px`;
    overlay.style.height = `${bodyRect.height}px`;
    overlay.style.display = 'none';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.zIndex = '1300';
    overlay.style.pointerEvents = 'auto';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.style.display = 'none';
      }
    });

    const content = document.createElement('div');
    content.style.position = 'absolute';
    content.style.top = '0';
    content.style.left = '0';
    content.style.right = '0';
    content.style.bottom = '0';
    content.style.display = 'grid';
    content.style.gridTemplateColumns = '180px 1fr';
    content.style.gap = '16px';
    content.style.padding = '24px';

    const tabColumn = document.createElement('div');
    tabColumn.style.display = 'flex';
    tabColumn.style.flexDirection = 'column';
    tabColumn.style.gap = '12px';
    tabColumn.style.background = '#fff';
    tabColumn.style.borderRadius = '8px';
    tabColumn.style.padding = '12px';
    tabColumn.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.08)';

    const panelColumn = document.createElement('div');
    panelColumn.style.position = 'relative';
    panelColumn.style.background = '#fff';
    panelColumn.style.borderRadius = '8px';
    panelColumn.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
    panelColumn.style.paddingTop = '48px';
    panelColumn.style.overflow = 'auto';

    const headerBar = document.createElement('div');
    headerBar.style.position = 'absolute';
    headerBar.style.top = '12px';
    headerBar.style.right = '12px';
    headerBar.style.display = 'flex';
    headerBar.style.gap = '8px';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Guardar';
    saveBtn.style.padding = '6px 12px';
    saveBtn.style.background = '#0a74da';
    saveBtn.style.color = '#fff';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '6px';
    saveBtn.style.cursor = 'pointer';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Cerrar';
    closeBtn.style.padding = '6px 12px';
    closeBtn.style.background = '#fff';
    closeBtn.style.color = '#333';
    closeBtn.style.border = '1px solid #ccc';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.cursor = 'pointer';

    headerBar.appendChild(closeBtn);
    headerBar.appendChild(saveBtn);
    panelColumn.appendChild(headerBar);

    const iaTab = document.createElement('button');
    iaTab.type = 'button';
    iaTab.textContent = 'Conocimiento IA';
    iaTab.style.border = 'none';
    iaTab.style.background = '#f0f0f0';
    iaTab.style.textAlign = 'left';
    iaTab.style.fontSize = '14px';
    iaTab.style.padding = '8px 12px';
    iaTab.style.borderRadius = '6px';
    iaTab.style.cursor = 'pointer';
    iaTab.style.fontWeight = '600';
    tabColumn.appendChild(iaTab);

    content.appendChild(tabColumn);
    content.appendChild(panelColumn);
    overlay.appendChild(content);
    modal.style.position = modal.style.position || 'relative';
    modal.appendChild(overlay);

    return { overlay, panelColumn, iaTab, saveBtn, closeBtn };
  }

  function showOverlay(modal, panel) {
    if (!modal || !panel) return;
    const body = modal.querySelector('.spot-modal--body');
    const bodyRect = body
      ? { top: body.offsetTop, left: body.offsetLeft, width: body.clientWidth, height: body.clientHeight }
      : { top: 0, left: 0, width: modal.clientWidth, height: modal.clientHeight };
    let overlayData = modal.__documentosOverlay;
    if (!overlayData) {
      overlayData = createOverlay(modal, bodyRect);
      modal.__documentosOverlay = overlayData;
    }
    const { overlay, panelColumn, iaTab, saveBtn, closeBtn } = overlayData;
    if (iaTab.dataset.bound !== '1') {
      iaTab.addEventListener('click', () => {
        panel.style.display = 'flex';
      });
      iaTab.dataset.bound = '1';
    }
    if (saveBtn.dataset.bound !== '1') {
      saveBtn.addEventListener('click', () => {
        const nativeSave = panel.querySelector('button[data-documentos-save]');
        if (nativeSave) nativeSave.click();
        overlay.style.display = 'none';
      });
      saveBtn.dataset.bound = '1';
    }
    if (closeBtn.dataset.bound !== '1') {
      closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
      });
      closeBtn.dataset.bound = '1';
    }
    if (!panelColumn.contains(panel)) {
      panelColumn.appendChild(panel);
    }
    overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
  }

  function ensurePanel(modal) {
    if (!modal) return null;
    const actionBar = modal.querySelector('.spot-action-bar');
    if (!actionBar) return null;
    let panel = modal.__documentosConfigPanel;
    if (!panel) {
      const overlay = modal.querySelector(`[${OVERLAY_ATTRIBUTE}]`);
      if (overlay) {
        panel = overlay.querySelector('.documentos-config-panel');
        if (panel) {
          modal.__documentosConfigPanel = panel;
        }
      }
    }
    if (!panel && window.DocumentosConocimientoIA && typeof window.DocumentosConocimientoIA.createConfigPanel === 'function') {
      panel = window.DocumentosConocimientoIA.createConfigPanel(actionBar);
      if (panel) {
        panel.style.display = 'none';
        modal.__documentosConfigPanel = panel;
      }
    }
    return panel;
  }

  function ensureButton(modal) {
    attachButtonToModal(modal);
    const button = modal.querySelector(`#${BUTTON_ID}`);
    if (!button) return;
    if (button.dataset.documentosLoaded !== '1') {
      button.dataset.documentosLoaded = '1';
    }
    if (button.dataset.documentosClickBound === '1') return;
    button.addEventListener('click', () => {
      const panel = ensurePanel(modal);
      if (!panel) return;
      showOverlay(modal, panel);
    });
    button.dataset.documentosClickBound = '1';
  }

  function observeModals() {
    const existing = document.querySelectorAll(MODAL_SELECTOR);
    existing.forEach((overlay) => {
      const modal = overlay.querySelector('.spot-modal');
      if (modal) ensureButton(modal);
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(({ addedNodes }) => {
        Array.from(addedNodes).forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches(MODAL_SELECTOR)) {
            const modal = node.querySelector('.spot-modal');
            if (modal) ensureButton(modal);
            return;
          }
          const innerOverlay = node.querySelector(MODAL_SELECTOR);
          if (innerOverlay) {
            const modal = innerOverlay.querySelector('.spot-modal');
            if (modal) ensureButton(modal);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const retryUntil = Date.now() + 5000;
    const timer = setInterval(() => {
      const overlays = document.querySelectorAll(MODAL_SELECTOR);
      overlays.forEach((overlay) => {
        const modal = overlay.querySelector('.spot-modal');
        if (modal) ensureButton(modal);
      });
      if (Date.now() > retryUntil) clearInterval(timer);
    }, 500);
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeModals);
    } else {
      observeModals();
    }
  }

  init();
})();
