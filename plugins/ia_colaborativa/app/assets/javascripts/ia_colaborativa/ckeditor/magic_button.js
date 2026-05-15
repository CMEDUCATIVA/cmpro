(function() {
  'use strict';

  if (window.opMagicCkeditorButtonInitialized) {
    return;
  }
  window.opMagicCkeditorButtonInitialized = true;

  const TOOLBAR_SELECTOR = '.ck.ck-toolbar';
  const TOOLBAR_ITEMS_SELECTOR = '.ck-toolbar__items';
  const BUTTON_CLASS = 'op-magic-ckeditor-button';
  const ADDED_ATTR = 'data-magic-button';
  const PANEL_ID = 'op-magic-panel';
  const BUTTON_LABEL = '\u2726 Magic';
  const BOLD_BUTTON_SELECTOR = [
    'button[data-cke-tooltip-text*="Negrita"]',
    'button[aria-label*="Negrita"]',
    'button[title*="Negrita"]',
    'button[data-command-id="bold"]',
  ].join(',');
  const SUBMENU_VISIBLE_CLASS = 'is-visible';
  const COMMAND_LOOKUP = {};
  const MENU_OPTIONS = [
    {
      key: 'edit',
      label: 'Editar o revisar',
      groupLabel: 'Editar o revisar',
      children: [
        {
          key: 'edit-improve',
          label: 'Mejorar redacci\u00f3n',
          prompt: 'Mejora la claridad, cohesi\u00f3n y gram\u00e1tica del siguiente texto sin alterar su intenci\u00f3n. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'edit-shorter',
          label: 'Hacerlo m\u00e1s corto',
          prompt: 'Reduce la extensi\u00f3n del siguiente texto manteniendo los mensajes clave y el mismo idioma. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'edit-longer',
          label: 'Hacerlo m\u00e1s largo',
          prompt: 'Ampl\u00eda el siguiente texto a\u00f1adiendo detalles, ejemplos y contexto relevante sin desviarte del tema. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'edit-simplify',
          label: 'Simplificar el lenguaje',
          prompt: 'Reescribe el texto con lenguaje sencillo y directo para que pueda entenderlo cualquier persona. Devuelve el resultado en HTML limpio.',
        },
      ],
    },
    {
      key: 'generate',
      label: 'Generar desde la selecci\u00f3n',
      groupLabel: 'Generar desde la selecci\u00f3n',
      children: [
        {
          key: 'generate-summary',
          label: 'Resumir',
          prompt: 'Resume el siguiente texto en un m\u00e1ximo de 5 oraciones o vi\u00f1etas, destacando ideas principales. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'generate-continue',
          label: 'Continuar',
          prompt: 'Contin\u00faa el siguiente texto con uno o dos p\u00e1rrafos coherentes, manteniendo el estilo y contexto original. Devuelve el resultado en HTML limpio.',
        },
      ],
    },
    {
      key: 'tone',
      label: 'Cambiar el tono',
      groupLabel: 'Cambiar el tono',
      children: [
        {
          key: 'tone-professional',
          label: 'Profesional',
          prompt: 'Reescribe el texto con un tono profesional y formal, apropiado para documentos ejecutivos o t\u00e9cnicos. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'tone-casual',
          label: 'Casual',
          prompt: 'Reescribe el texto con un tono casual y cercano, usando frases naturales y accesibles. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'tone-direct',
          label: 'Directo',
          prompt: 'Reescribe el texto con un tono directo, conciso y orientado a la acci\u00f3n. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'tone-confident',
          label: 'Seguro',
          prompt: 'Reescribe el texto transmitiendo seguridad, liderazgo y convicci\u00f3n. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'tone-friendly',
          label: 'Amistoso',
          prompt: 'Reescribe el texto con un tono amistoso, emp\u00e1tico y motivador. Devuelve el resultado en HTML limpio.',
        },
      ],
    },
    {
      key: 'style',
      label: 'Cambiar el estilo',
      groupLabel: 'Cambiar el estilo',
      children: [
        {
          key: 'style-business',
          label: 'Negocios',
          prompt: 'Adapta el texto al estilo corporativo/negocios, destacando resultados, beneficios y lenguaje ejecutivo. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'style-legal',
          label: 'Legal',
          prompt: 'Reescribe el texto con estilo legal, incluyendo terminolog\u00eda normativa y estructura formal. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'style-journalism',
          label: 'Period\u00edstico',
          prompt: 'Reescribe el texto con estilo period\u00edstico, informativo y objetivo. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'style-poetic',
          label: 'Po\u00e9tico',
          prompt: 'Reescribe el texto con estilo po\u00e9tico usando recursos literarios y un ritmo fluido. Devuelve el resultado en HTML limpio.',
        },
      ],
    },
    {
      key: 'translate',
      label: 'Traducir',
      groupLabel: 'Traducir',
      children: [
        {
          key: 'translate-english',
          label: 'Ingl\u00e9s',
          prompt: 'Traduce el siguiente texto al ingl\u00e9s neutro, manteniendo terminolog\u00eda BIM cuando aplique. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-spanish',
          label: 'Espa\u00f1ol',
          prompt: 'Traduce el siguiente texto al espa\u00f1ol neutro, conservando la precisi\u00f3n t\u00e9cnica. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-portuguese',
          label: 'Portugu\u00e9s',
          prompt: 'Traduce el siguiente texto al portugu\u00e9s, manteniendo terminolog\u00eda BIM y tono formal. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-german',
          label: 'Alem\u00e1n',
          prompt: 'Traduce el siguiente texto al alem\u00e1n t\u00e9cnico, cuidando la gram\u00e1tica y la terminolog\u00eda BIM. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-french',
          label: 'Franc\u00e9s',
          prompt: 'Traduce el siguiente texto al franc\u00e9s formal, manteniendo la precisi\u00f3n del contenido. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-chinese',
          label: 'Chino simplificado',
          prompt: 'Traduce el siguiente texto al chino simplificado, usando terminolog\u00eda t\u00e9cnica adecuada. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-hindi',
          label: 'Hindi',
          prompt: 'Traduce el siguiente texto al hindi, manteniendo claridad y terminolog\u00eda t\u00e9cnica. Devuelve el resultado en HTML limpio.',
        },
        {
          key: 'translate-arabic',
          label: '\u00c1rabe',
          prompt: 'Traduce el siguiente texto al \u00e1rabe moderno est\u00e1ndar, conservando la precisi\u00f3n t\u00e9cnica. Devuelve el resultado en HTML limpio.',
        },
      ],
    },
  ];

  let panel;
  let activeAnchor = null;
  let hideTimeout = null;
  let activeSubmenu = null;

  console.info('[Magic CKEditor] Script inicializado');

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

    button.title = 'Magic Tools';
    button.addEventListener('mouseenter', () => showPanel(button));
    button.addEventListener('focus', () => showPanel(button));
    button.addEventListener('mouseleave', scheduleHide);
    button.addEventListener('blur', scheduleHide);
    return button;
  }

  function showPanel(anchor) {
    ensurePanelAttached();
    cancelHide();
    activeAnchor = anchor;
    positionPanel(anchor);
    panel.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
  }

  function hidePanel() {
    if (!panel) {
      return;
    }

    cancelHide();
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    activeAnchor = null;
    hideAllSubmenus();
  }

  function positionPanel(anchor) {
    if (!panel || !anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const estimatedWidth = panel.offsetWidth || 200;
    const viewportWidth = document.documentElement.clientWidth;
    let left = rect.left;

    if (left + estimatedWidth > viewportWidth - 12) {
      left = viewportWidth - estimatedWidth - 12;
    }

    panel.style.top = `${window.scrollY + rect.bottom + 4}px`;
    panel.style.left = `${window.scrollX + Math.max(8, left)}px`;
  }

  function ensurePanelAttached() {
    if (panel && document.body && !document.body.contains(panel)) {
      document.body.appendChild(panel);
    }
  }

  function ensurePanel() {
    if (panel) {
      ensurePanelAttached();
      return;
    }

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
      return;
    }

    const element = document.createElement('div');
    element.id = PANEL_ID;
    element.className = 'op-magic-dropdown';

    const menuHtml = MENU_OPTIONS.map((option) => {
      const groupLabel = option.groupLabel || option.label;
      const hasChildren = Array.isArray(option.children) && option.children.length > 0;
      const childHtml = hasChildren
        ? `
            <div class="op-magic-panel__submenu" data-parent="${option.key}">
              ${option.children.map((child) => {
                COMMAND_LOOKUP[child.key] = {
                  id: child.key,
                  label: child.label,
                  prompt: child.prompt,
                  groupId: option.key,
                  groupLabel,
                };
                return `
                <button type="button"
                        class="op-magic-panel__submenu-item"
                        data-action="${child.key}"
                        data-parent="${option.key}">
                  <span>${child.label}</span>
                </button>
              `;
              }).join('')}
            </div>
          `
        : '';

      return `
        <div class="op-magic-panel__menu-group" data-group="${option.key}">
          <button type="button"
                  class="op-magic-panel__menu-item${hasChildren ? ' has-children' : ''}"
                  data-action="${option.key}"
                  ${hasChildren ? 'data-has-children="true"' : ''}>
            <span>${option.label}</span>
            <span class="op-magic-panel__menu-caret">></span>
          </button>
          ${childHtml}
        </div>
      `;
    }).join('');

    element.innerHTML = `
      <div class="op-magic-panel__menu">
        ${menuHtml}
      </div>
    `;

    const menu = element.querySelector('.op-magic-panel__menu');
    menu?.addEventListener('click', (event) => {
      const submenuButton = event.target.closest('.op-magic-panel__submenu-item');
      if (submenuButton) {
        const command = COMMAND_LOOKUP[submenuButton.dataset.action];
        if (command) {
          console.info('[Magic CKEditor] Acci\u00f3n seleccionada:', command.id);
          if (window.opIaMagic?.runCommand) {
            window.opIaMagic.runCommand(command);
          } else {
            console.warn('[Magic CKEditor] API runCommand no disponible.');
          }
        }
        hidePanel();
        return;
      }

      const mainButton = event.target.closest('.op-magic-panel__menu-item');
      if (!mainButton) {
        return;
      }

      if (mainButton.dataset.hasChildren) {
        const group = mainButton.closest('.op-magic-panel__menu-group');
        const submenu = group?.querySelector('.op-magic-panel__submenu');
        if (submenu) {
          const isVisible = submenu.classList.toggle(SUBMENU_VISIBLE_CLASS);
          if (isVisible) {
            positionSubmenu(mainButton, submenu);
          }
        }
        return;
      }

      const command = COMMAND_LOOKUP[mainButton.dataset.action];
      if (command) {
        if (window.opIaMagic?.runCommand) {
          window.opIaMagic.runCommand(command);
        } else {
          console.warn('[Magic CKEditor] API runCommand no disponible.');
        }
        hidePanel();
      }
    });

    const menuGroups = element.querySelectorAll('.op-magic-panel__menu-group');
    menuGroups.forEach((group) => {
      const menuItem = group.querySelector('.op-magic-panel__menu-item');
      const submenu = group.querySelector('.op-magic-panel__submenu');
      if (!menuItem) {
        return;
      }

      if (submenu) {
        menuItem.addEventListener('mouseenter', () => showSubmenuElement(menuItem, submenu));
        menuItem.addEventListener('focus', () => showSubmenuElement(menuItem, submenu));
        group.addEventListener('mouseleave', () => {
          submenu.classList.remove(SUBMENU_VISIBLE_CLASS);
          if (activeSubmenu === submenu) {
            activeSubmenu = null;
          }
        });
      } else {
        menuItem.addEventListener('mouseenter', () => hideAllSubmenus());
        menuItem.addEventListener('focus', () => hideAllSubmenus());
      }
    });

    element.setAttribute('role', 'menu');
    element.setAttribute('aria-hidden', 'true');

    document.body.appendChild(element);
    panel = element;
    panel.addEventListener('mouseenter', cancelHide);
    panel.addEventListener('mouseleave', scheduleHide);
  }

  function enhanceToolbar(toolbar) {
    if (!toolbar) {
      return;
    }

    const toolbarItems = toolbar.querySelector(TOOLBAR_ITEMS_SELECTOR) || toolbar;
    if (!toolbarItems || toolbarItems.querySelector(`.${BUTTON_CLASS}`)) {
      return;
    }

    const button = createButton();
    const boldButton = toolbarItems.querySelector(BOLD_BUTTON_SELECTOR);
    if (boldButton) {
      boldButton.insertAdjacentElement('afterend', button);
    } else if (toolbarItems.firstElementChild) {
      toolbarItems.insertBefore(button, toolbarItems.firstElementChild);
    } else {
      toolbarItems.appendChild(button);
    }

    console.info('[Magic CKEditor] Bot\u00f3n insertado en toolbar', toolbar);
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
  startObserving();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hidePanel();
    }
  });

  document.addEventListener('click', (event) => {
    if (!panel?.classList.contains('is-visible')) {
      return;
    }

    if (event.target.closest(`.${BUTTON_CLASS}`) || event.target.closest('.op-magic-dropdown')) {
      return;
    }

    hidePanel();
  });

  function handleViewportChange() {
    if (!panel?.classList.contains('is-visible')) {
      return;
    }

    if (!activeAnchor || !document.contains(activeAnchor)) {
      hidePanel();
      return;
    }

    positionPanel(activeAnchor);
  }

  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);

  function positionSubmenu(parentButton, submenu) {
    if (!submenu) {
      return;
    }

    const group = parentButton.closest('.op-magic-panel__menu-group');
    if (!group) {
      return;
    }

    const parentRect = parentButton.getBoundingClientRect();
    const groupRect = group.getBoundingClientRect();
    const left = groupRect.width - 6;
    const top = parentRect.top - groupRect.top - 6;

    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
  }

  function showSubmenuElement(menuItem, submenu) {
    hideAllSubmenus(submenu);
    positionSubmenu(menuItem, submenu);
    submenu.classList.add(SUBMENU_VISIBLE_CLASS);
    activeSubmenu = submenu;
  }

  function hideAllSubmenus(except) {
    panel?.querySelectorAll('.op-magic-panel__submenu').forEach((node) => {
      if (node === except) {
        return;
      }
      node.classList.remove(SUBMENU_VISIBLE_CLASS);
    });
    if (!except) {
      activeSubmenu = null;
    }
  }

  function cancelHide() {
    if (hideTimeout) {
      window.clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimeout = window.setTimeout(() => hidePanel(), 160);
  }
})();
