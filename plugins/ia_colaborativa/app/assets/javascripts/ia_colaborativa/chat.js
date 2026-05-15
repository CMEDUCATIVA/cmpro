(function () {
  'use strict';

  // Variable para evitar múltiples inicializaciones
  if (window.iaChatInitialized) {
    return;
  }
  window.iaChatInitialized = true;

  // Variable para prevenir múltiples clicks rápidos (debounce)
  var isToggling = false;

  var IA_COLAB_MCP_BASE_URL = (window.IA_COLAB_MCP_URL || '').replace(/\/+$/, '');
  var IA_COLAB_IS_ADMIN = window.IA_COLAB_IS_ADMIN === true || window.IA_COLAB_IS_ADMIN === 'true';
  var IA_COLAB_ADMIN_CHECK_IN_FLIGHT = false;

  function detectAdminFromPrincipal() {
    try {
      var principalElement = document.querySelector('opce-principal[data-principal]');
      if (!principalElement) return false;
      var raw = principalElement.getAttribute('data-principal');
      if (!raw) return false;
      var principal = JSON.parse(raw);
      return !!(principal && (
        principal.admin === true ||
        principal.isAdmin === true ||
        principal.is_admin === true
      ));
    } catch (e) {
      return false;
    }
  }

  if (!IA_COLAB_IS_ADMIN && detectAdminFromPrincipal()) {
    IA_COLAB_IS_ADMIN = true;
    window.IA_COLAB_IS_ADMIN = true;
  }

  window.normalizeIaChatVisibility = function () {
    var list = document.getElementById('ia-chat-messages');
    var welcome = document.getElementById('ia-chat-welcome');
    if (!list || !welcome) return;

    var hasRenderableMessages = Array.prototype.some.call(list.children || [], function (child) {
      if (!child) return false;
      var text = (child.textContent || '').trim();
      if (text.length > 0) return true;
      return !!child.querySelector('img,table,button,a,svg,pre,code');
    });

    if (hasRenderableMessages) {
      list.style.display = 'flex';
      welcome.style.display = 'none';
    } else {
      list.style.display = 'none';
      welcome.style.display = 'flex';
    }
  };

  window.bindIaChatVisibilityObserver = function () {
    var list = document.getElementById('ia-chat-messages');
    if (!list || list.dataset.iaVisibilityObserved === 'true') return;

    var observer = new MutationObserver(function () {
      window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();
    });
    observer.observe(list, { childList: true, subtree: true, attributes: true });
    list.dataset.iaVisibilityObserved = 'true';
  };

  window.fixIaGlobalBottomArtifacts = function () {
    try {
      // OpenProject can render an empty warning wrapper with whitespace only.
      var warningWrapper = document.querySelector('.warning-bar--wrapper');
      if (warningWrapper) {
        var hasVisibleWarning = !!warningWrapper.querySelector('.warning-bar--item');
        var hasMeaningfulText = (warningWrapper.textContent || '').trim().length > 0;
        if (!hasVisibleWarning && !hasMeaningfulText) {
          // Remove empty wrapper entirely so it cannot reserve any visual area.
          warningWrapper.remove();
        }
      }

      // If plugin UI introduces a horizontal overflow, suppress it to avoid
      // the floating bottom scrollbar overlaying the official sidebar.
      var htmlEl = document.documentElement;
      var bodyEl = document.body;
      if (htmlEl && bodyEl) {
        var hasHorizontalOverflow = htmlEl.scrollWidth > htmlEl.clientWidth + 1;
        if (hasHorizontalOverflow) {
          htmlEl.style.overflowX = 'hidden';
          bodyEl.style.overflowX = 'hidden';
        }
      }

      // Additional hardening for OpenProject layout containers that may get
      // horizontal scrollbars due to fixed/absolute plugin elements.
      [
        '#content',
        '#content-body',
        '.content-wrapper',
        '.op-app-root',
        '.op-body-content',
        '.work-packages--show-view',
        '.work-package--details-view'
      ].forEach(function (selector) {
        var node = document.querySelector(selector);
        if (node) {
          node.style.overflowX = 'hidden';
        }
      });
    } catch (e) {}
  };

  window.bindIaGlobalArtifactObserver = function () {
    if (window.__iaGlobalArtifactsObserverBound) return;
    window.__iaGlobalArtifactsObserverBound = true;

    var observer = new MutationObserver(function () {
      window.fixIaGlobalBottomArtifacts && window.fixIaGlobalBottomArtifacts();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.__iaGlobalArtifactsObserver = observer;
  };

  window.isIaColabAdmin = function () {
    return IA_COLAB_IS_ADMIN;
  };

  window.renderIaSettingsNotice = function (message, isError) {
    var panel = document.querySelector('.ia-settings-panel[data-tab-panel="general"]');
    if (!panel) return;

    var notice = document.getElementById('ia-settings-general-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'ia-settings-general-notice';
      notice.style.marginBottom = '12px';
      notice.style.padding = '10px 12px';
      notice.style.borderRadius = '8px';
      notice.style.fontSize = '12px';
      notice.style.lineHeight = '1.45';
      notice.style.border = '1px solid #3b3b3b';
      notice.style.background = '#1f1f1f';
      notice.style.color = '#e5e7eb';
      panel.insertBefore(notice, panel.firstChild);
    }

    notice.textContent = message || '';
    if (isError) {
      notice.style.background = '#2b1d1d';
      notice.style.borderColor = '#7f1d1d';
      notice.style.color = '#fecaca';
    } else {
      notice.style.background = '#1f1f1f';
      notice.style.borderColor = '#3b3b3b';
      notice.style.color = '#e5e7eb';
    }
  };

  window.applySettingsAccessControl = function () {
    var settingsBtn = document.getElementById('ia-chat-settings-btn');
    if (settingsBtn) {
      settingsBtn.style.display = 'flex';
      settingsBtn.style.opacity = IA_COLAB_IS_ADMIN ? '1' : '0.92';
    }
  };

  window.ensureIaSettingsAccess = function (onAllowed) {
    if (typeof onAllowed === 'function') onAllowed();
    window.resolveIaColabAdminFromServer && window.resolveIaColabAdminFromServer();
  };

  window.resolveIaColabAdminFromServer = function () {
    if (IA_COLAB_IS_ADMIN || IA_COLAB_ADMIN_CHECK_IN_FLIGHT) return;
    IA_COLAB_ADMIN_CHECK_IN_FLIGHT = true;

    fetch('/ia_colaborativa/provider_settings', {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })
      .then(function (response) {
        if (response && response.ok) {
          IA_COLAB_IS_ADMIN = true;
          window.IA_COLAB_IS_ADMIN = true;
          window.applySettingsAccessControl && window.applySettingsAccessControl();
          window.loadProviderSettings && window.loadProviderSettings();
          return;
        }
        window.applySettingsAccessControl && window.applySettingsAccessControl();
      })
      .catch(function () {})
      .finally(function () {
        IA_COLAB_ADMIN_CHECK_IN_FLIGHT = false;
      });
  };
  function buildIaColabUrl(path) {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    // For internal Rails endpoints use the relative path so we don't accidentally hit the MCP server directly.
    if (path.startsWith('/ia_colaborativa/') || !IA_COLAB_MCP_BASE_URL) {
      return path;
    }
    return IA_COLAB_MCP_BASE_URL + path;
  }

  var DEFAULT_API_PROVIDERS = ['Anthropic', 'DeepSeek', 'OpenAI', 'OpenRouter', 'Google Gemini'];
  var DEFAULT_MAX_TOKENS = 1000;
  var PROVIDER_DEFAULT_BASE = {
    'OpenRouter': 'https://openrouter.ai/api/v1',
    'OpenAI': 'https://api.openai.com/v1',
    'Google Gemini': 'https://generativelanguage.googleapis.com',
    'DeepSeek': 'https://api.deepseek.com',
    'Anthropic': 'https://api.anthropic.com'
  };
  window.selectedIaApiProvider = null;
  window.selectedIaApiBaseUrl = null;
  window.lastSavedConfig = null;
  window.providerSaveInFlight = false;
  window.lastSavedLightragKey = '';

  // Usar delegación de eventos en el documento para que funcione con navegación AJAX
  // Usar 'capture' phase para interceptar antes que otros handlers
  document.addEventListener('turbo:load', function () {
    window.applySettingsAccessControl && window.applySettingsAccessControl();
    window.resolveIaColabAdminFromServer && window.resolveIaColabAdminFromServer();
    window.bindIaChatVisibilityObserver && window.bindIaChatVisibilityObserver();
    window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();
    window.fixIaGlobalBottomArtifacts && window.fixIaGlobalBottomArtifacts();
    window.bindIaGlobalArtifactObserver && window.bindIaGlobalArtifactObserver();
    window.renderApiProviderList && window.renderApiProviderList();
    window.loadProviderSettings && window.loadProviderSettings();
    window.initMcpPasswordToggle && window.initMcpPasswordToggle();
    window.initIaSettingsAuthModal && window.initIaSettingsAuthModal();
  });

  document.addEventListener('click', function (e) {
    var target = e.target;

    // Buscar el elemento padre si se hizo click en un hijo (ej: texto dentro del botón)
    while (target && target !== document) {
      // Botón toggle
      if (target.id === 'ia-chat-toggle-btn') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Prevenir múltiples clicks rápidos
        if (!isToggling) {
          isToggling = true;
          window.toggleIaChat();
          setTimeout(function () { isToggling = false; }, 300);
        }
        return false;
      }

      // Botón de configuración (sin contraseña)
      if (target.id === 'ia-chat-settings-btn') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.ensureIaSettingsAccess && window.ensureIaSettingsAccess(function () {
          window.openIaSettings('general');
        });
        return false;
      }

      if (target.id === 'ia-api-provider-show-btn') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.switchIaSettingsTab('general');
        var select = document.getElementById('ia-api-provider-select');
        if (select) {
          select.focus();
        }
        window.saveProviderSettings && window.saveProviderSettings();
        return false;
      }

      // Botón limpiar chat
      if (target.id === 'ia-chat-clear-btn') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.clearIaChat();
        return false;
      }

      // Botón minimizar
      if (target.id === 'ia-chat-minimize-btn') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.minimizeIaChat();
        return false;
      }

      // Botón cerrar
      if (target.id === 'ia-chat-close-btn') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.closeIaChat();
        return false;
      }

      // Botón del menú de agentes
      if (target.id === 'ia-agent-menu-button') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.toggleAgentMenu();
        return false;
      }

      if (target.classList && target.classList.contains('ia-agent-option')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        var agentValue = target.getAttribute('data-agent') || 'docs';
        window.onAgentChange(agentValue);
        window.hideAgentMenu();
        return false;
      }

      if (target.classList && target.classList.contains('ia-settings-tab')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        var tabName = target.getAttribute('data-tab') || 'general';
        window.switchIaSettingsTab(tabName);
        return false;
      }

      // Botón cerrar ventana de configuración
      if (target.id === 'ia-chat-settings-close') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.closeIaSettings();
        return false;
      }

      target = target.parentElement;
    }
  }, true); // true = usar capture phase

  document.addEventListener('click', function (e) {
    if (!window.iaAgentMenuVisible) return;
    var wrapper = document.getElementById('ia-agent-menu-wrapper');
    if (!wrapper) return;
    if (!e.target.closest || !e.target.closest('#ia-agent-menu-wrapper')) {
      window.hideAgentMenu();
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'ia-chat-settings-modal') {
      window.closeIaSettings();
    }
  });

  document.addEventListener('change', function (e) {
    var target = e.target;
    if (!target) {
      return;
    }

    if (target.id === 'ia-debug-enable-toggle') {
      e.stopPropagation();
      var enabled = !!target.checked;
      window.debugLoggingEnabled = enabled;

      var label = document.getElementById('ia-debug-toggle-label');
      if (label) {
        label.textContent = enabled ? 'Logging activo' : 'Logging desactivado';
      }

      var debugContent = document.getElementById('ia-debug-content');
      if (!enabled) {
        if (debugContent) {
          debugContent.innerHTML = '<p style="margin:0; color:#ef4444;">El registro detallado está desactivado.</p>';
        }
      } else {
        window.loadDebugData();
      }
      return;
    }

    if (target.id === 'ia-api-provider-select') {
      e.stopPropagation();
      window.selectIaApiProvider && window.selectIaApiProvider(target.value || null);
      return;
    }
  }, true);

  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target) return;
    if (target.id === 'ia-chat-input') {
      window.enforceProjectPrompt && window.enforceProjectPrompt();
      window.hideProjectHint && window.hideProjectHint();
      return;
    }
    if (target.id === 'ia-max-tokens-slider') {
      e.stopPropagation();
      var value = parseInt(target.value, 10) || DEFAULT_MAX_TOKENS;
      window.setMaxTokensValue && window.setMaxTokensValue(value);
      window.updateSaveButtonState && window.updateSaveButtonState(window.isProviderConfigDirty());
    }
  }, true);

  // Eventos delegados para el input del chat:
  // evita perder bindings cuando Turbo reemplaza el DOM.
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target || target.id !== 'ia-chat-input') return;
    window.enforceProjectPrompt && window.enforceProjectPrompt();
  }, true);

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || target.id !== 'ia-chat-input') return;
    window.showProjectHint && window.showProjectHint();
  }, true);

  document.addEventListener('focusin', function (e) {
    var target = e.target;
    if (!target || target.id !== 'ia-chat-input') return;
    window.showProjectHint && window.showProjectHint();
  }, true);

  document.addEventListener('focusout', function (e) {
    var target = e.target;
    if (!target || target.id !== 'ia-chat-input') return;
    window.hideProjectHint && window.hideProjectHint();
  }, true);

  window.addEventListener('resize', function () {
    window.syncProjectPrompt && window.syncProjectPrompt();
    window.hideProjectHint && window.hideProjectHint();
  });

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (target && target.id === 'ia-api-provider-save-key') {
      e.preventDefault();
      e.stopPropagation();
      var keyInput = document.getElementById('ia-api-provider-key-input');
      var keyValue = keyInput ? keyInput.value.trim() : '';
      console.log('Guardar API Key OpenRouter:', keyValue ? '[REDACTED]' : '(vacía)');
    }
  }, true);

  // Delegación para el formulario
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'ia-chat-form') {
      e.preventDefault();
      window.sendIaMessage(e);
    }
  }, true);

  console.log('IA Chat inicializado correctamente con delegación de eventos optimizada');

  // ============================================================================
  // GESTIÓN DE AGENTE SELECCIONADO
  // ============================================================================

  // Variable global para almacenar el agente actual
  window.currentAgent = 'sara'; // Por defecto: SaraIA (general)
  window.iaAgentMenuVisible = false;
  window.debugLoggingEnabled = true;

  window.updateAgentMenuLabel = function (agentType) {
    var label = document.getElementById('ia-agent-menu-label');
    if (!label) return;
    if (agentType === 'cde') {
      label.textContent = 'Sara-Obra-GPT';
    } else if (agentType === 'sara_tools') {
      label.textContent = 'Sara';
    } else if (agentType === 'sara') {
      label.textContent = 'Sara-GPT';
    } else {
      label.textContent = 'Sara-Docs-GPT';
    }
  };

  window.setActiveAgentOption = function (agentType) {
    var options = document.querySelectorAll('.ia-agent-option');
    if (!options) return;
    options.forEach(function (option) {
      if (!option) return;
      var isActive = option.getAttribute('data-agent') === agentType;
      option.setAttribute('data-active', isActive ? 'true' : 'false');
    });
  };

  window.hideAgentMenu = function () {
    var menu = document.getElementById('ia-agent-menu');
    var button = document.getElementById('ia-agent-menu-button');
    if (!menu || !button) return;
    menu.style.display = 'none';
    button.setAttribute('data-open', 'false');
    button.style.background = '#1f1f1f';
    button.style.borderColor = '#3a3a3a';
    window.iaAgentMenuVisible = false;
  };

  window.toggleAgentMenu = function () {
    var menu = document.getElementById('ia-agent-menu');
    var button = document.getElementById('ia-agent-menu-button');
    if (!menu || !button) return;
    if (window.iaAgentMenuVisible) {
      window.hideAgentMenu();
    } else {
      menu.style.display = 'block';
      button.setAttribute('data-open', 'true');
      button.style.background = '#2c2c2c';
      button.style.borderColor = '#5B46E5';
      window.setActiveAgentOption(window.currentAgent || 'docs');
      window.iaAgentMenuVisible = true;
    }
  };

  // Funcion para cambiar de agente
  window.onAgentChange = function (agentType) {
    window.currentAgent = agentType || 'docs';
    window.updateAgentMenuLabel(window.currentAgent);
    window.setActiveAgentOption(window.currentAgent);
    console.log('Agente cambiado a:', agentType);
    console.log('Estado actual: window.currentAgent =', window.currentAgent);
    if (window.currentAgent === 'cde' && !window.selectedProject) {
      window.openProjectsSearchModal && window.openProjectsSearchModal();
    }
    if (window.currentAgent !== 'cde') {
      window.resetProjectSelection && window.resetProjectSelection();
    }
    window.syncProjectPrompt && window.syncProjectPrompt();
    // Opcional: Limpiar el chat al cambiar de agente
    // window.clearIaChat();
  };

  window.onAgentChange(window.currentAgent);

  window.changeSendButtonToStop = function () {
    var sendBtn = document.getElementById('ia-chat-send-btn');
    if (!sendBtn) return;

    sendBtn.innerHTML = '⏹';
    sendBtn.style.background = 'transparent';
    sendBtn.style.color = '#ef4444';
    sendBtn.style.fontSize = '16px';
    sendBtn.type = 'button'; // Cambiar a button para que no envíe el form

    // Cambiar el comportamiento del click y hover
    sendBtn.onmouseover = function () {
      this.style.background = 'rgba(239, 68, 68, 0.1)';
      this.style.color = '#dc2626';
    };
    sendBtn.onmouseout = function () {
      this.style.background = 'transparent';
      this.style.color = '#ef4444';
    };
    sendBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      window.stopTypewriter();
      window.changeSendButtonToNormal();
    };
  };

  window.changeSendButtonToNormal = function () {
    var sendBtn = document.getElementById('ia-chat-send-btn');
    if (!sendBtn) return;

    sendBtn.innerHTML = '↑';
    sendBtn.style.background = 'transparent';
    sendBtn.style.color = '#8e8ea0';
    sendBtn.style.fontSize = '18px';
    sendBtn.type = 'submit'; // Volver a submit

    // Restaurar hover normal
    sendBtn.onmouseover = function () {
      this.style.background = '#2f2f2f';
      this.style.color = '#ececec';
    };
    sendBtn.onmouseout = function () {
      this.style.background = 'transparent';
      this.style.color = '#8e8ea0';
    };
    sendBtn.onclick = null; // Quitar el onclick personalizado
  };

  // Funciones globales optimizadas
  window.openIaChat = function () {
    var modal = document.getElementById('ia-chat-window');
    if (!modal) return;

    // Usar requestAnimationFrame para mejor rendimiento
    requestAnimationFrame(function () {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();

      // Focus en el input sin delay
      var input = document.getElementById('ia-chat-input');
      if (input) {
        requestAnimationFrame(function () {
          input.focus();
        });
      }
    });
  };

  window.closeIaChat = function () {
    var modal = document.getElementById('ia-chat-window');
    if (!modal) return;
    window.hideAgentMenu && window.hideAgentMenu();

    requestAnimationFrame(function () {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  };

  window.openIaSettings = function (tabName) {
    var modal = document.getElementById('ia-chat-settings-modal');
    if (!modal) return;
    requestAnimationFrame(function () {
      modal.style.display = 'flex';
      window.switchIaSettingsTab(tabName || 'general');
    });
  };

  window.closeIaSettings = function () {
    var modal = document.getElementById('ia-chat-settings-modal');
    if (!modal) return;
    requestAnimationFrame(function () {
      modal.style.display = 'none';
    });
  };

  window.switchIaSettingsTab = function (tabName) {
    var targetTab = tabName || 'general';
    var buttons = document.querySelectorAll('.ia-settings-tab');
    var panels = document.querySelectorAll('.ia-settings-panel');

    if (!buttons.length || !panels.length) {
      return;
    }

    buttons.forEach(function (btn) {
      var isActive = btn.getAttribute('data-tab') === targetTab;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.style.background = '#2f2f2f';
        btn.style.borderColor = '#5B46E5';
        btn.style.color = '#ececec';
      } else {
        btn.style.background = 'transparent';
        btn.style.borderColor = '#444';
        btn.style.color = '#8e8ea0';
      }
    });

    panels.forEach(function (panel) {
      var isActive = panel.getAttribute('data-tab-panel') === targetTab;
      panel.style.display = isActive ? 'block' : 'none';
    });

    if (targetTab === 'debug') {
      if (window.debugLoggingEnabled) {
        window.loadDebugData();
      } else {
        var debugContent = document.getElementById('ia-debug-content');
        if (debugContent) {
          debugContent.innerHTML = '<p style=\"margin:0; color:#ef4444;\">El registro detallado está desactivado.</p>';
        }
      }
    }
    if (targetTab === 'general') {
      window.renderApiProviderList && window.renderApiProviderList();
    }
  };

  window.clearIaChat = function () {
    var list = document.getElementById('ia-chat-messages');
    var welcome = document.getElementById('ia-chat-welcome');

    if (list) {
      list.innerHTML = '';
      list.style.display = 'none';
    }

    if (welcome) {
      welcome.style.display = 'flex';
    }

    window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();
    window.resetIaCdeThreadId();
  };

  window.resetIaCdeThreadId = function () {
    try {
      sessionStorage.removeItem('ia_cde_thread_id');
    } catch (e) {
      console.warn('[IA chat] no se pudo limpiar thread_id:', e);
    }
  };

  window.getIaCdeThreadId = function () {
    try {
      var existing = sessionStorage.getItem('ia_cde_thread_id');
      if (existing) return existing;
      var newId = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : ('cde-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10));
      sessionStorage.setItem('ia_cde_thread_id', newId);
      return newId;
    } catch (e) {
      return 'cde-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10);
    }
  };

  window.getIaApiProviders = function () {
    var select = document.getElementById('ia-api-provider-select');
    if (!select) {
      return DEFAULT_API_PROVIDERS.slice();
    }
    var raw = select.getAttribute('data-providers') || '';
    var parsed = raw.split('|').map(function (value) {
      return (value || '').trim();
    }).filter(Boolean);
    return parsed.length ? parsed : DEFAULT_API_PROVIDERS.slice();
  };

  window.setMaxTokensValue = function (value) {
    var slider = document.getElementById('ia-max-tokens-slider');
    var label = document.getElementById('ia-max-tokens-value');
    var safeValue = parseInt(value, 10);
    if (Number.isNaN(safeValue) || safeValue <= 0) {
      safeValue = DEFAULT_MAX_TOKENS;
    }
    if (slider) slider.value = safeValue;
    if (label) label.textContent = safeValue;
  };

  window.toggleProviderBoxes = function () {
    var provider = window.selectedIaApiProvider;
    var isOpenRouter = provider === 'OpenRouter';
    var isGemini = provider === 'Google Gemini';
    var isOpenAI = provider === 'OpenAI';

    var box = document.getElementById('ia-api-provider-key-box');
    if (box) {
      box.style.display = isOpenRouter ? 'flex' : 'none';
    }
    var modelBox = document.getElementById('ia-api-provider-model-box');
    if (modelBox) {
      modelBox.style.display = isOpenRouter ? 'flex' : 'none';
      var modelSelect = document.getElementById('ia-api-provider-model-select');
      if (modelSelect) {
        Array.from(modelSelect.options).forEach(function (opt) {
          opt.style.backgroundColor = '#12131f';
          opt.style.color = '#eceffc';
        });
      }
    }

    var gemKeyBox = document.getElementById('ia-gemini-provider-key-box');
    if (gemKeyBox) {
      gemKeyBox.style.display = isGemini ? 'flex' : 'none';
    }
    var gemModelBox = document.getElementById('ia-gemini-provider-model-box');
    if (gemModelBox) {
      gemModelBox.style.display = isGemini ? 'flex' : 'none';
      var gemModelSelect = document.getElementById('ia-gemini-provider-model-select');
      if (gemModelSelect) {
        Array.from(gemModelSelect.options).forEach(function (opt) {
          opt.style.backgroundColor = '#12131f';
          opt.style.color = '#eceffc';
        });
      }
    }

    var openaiKeyBox = document.getElementById('ia-openai-provider-key-box');
    if (openaiKeyBox) {
      openaiKeyBox.style.display = isOpenAI ? 'flex' : 'none';
    }
    var openaiModelBox = document.getElementById('ia-openai-provider-model-box');
    if (openaiModelBox) {
      openaiModelBox.style.display = isOpenAI ? 'flex' : 'none';
      var openaiModelSelect = document.getElementById('ia-openai-provider-model-select');
      if (openaiModelSelect) {
        Array.from(openaiModelSelect.options).forEach(function (opt) {
          opt.style.backgroundColor = '#12131f';
          opt.style.color = '#eceffc';
        });
      }
    }
  };

  window.renderApiProviderList = function () {
    var select = document.getElementById('ia-api-provider-select');
    if (!select) {
      return;
    }
    var providers = window.getIaApiProviders();

    if (!providers.length) {
      select.innerHTML = '<option value="">(No hay proveedores registrados)</option>';
      return;
    }

    select.innerHTML = '<option value="" selected style="background-color:#0f1018;color:#9ca3af;">Selecciona un proveedor</option>';
    providers.forEach(function (provider) {
      if (!provider) {
        return;
      }
      var option = document.createElement('option');
      option.value = provider;
      option.textContent = provider;
      option.selected = provider && provider === window.selectedIaApiProvider;
      option.style.backgroundColor = '#0f1018';
      option.style.color = '#eceffc';
      select.appendChild(option);
    });

    select.value = window.selectedIaApiProvider || '';
    select.style.color = window.selectedIaApiProvider ? '#eceffc' : '#9ca3af';
    window.toggleProviderBoxes();
  };

  window.currentProviderConfig = function () {
    var provider = window.selectedIaApiProvider || '';
    var baseUrl = window.selectedIaApiBaseUrl || PROVIDER_DEFAULT_BASE[provider] || '';
    var apiKey = '';
    var model = '';
    var maxTokensInput = document.getElementById('ia-max-tokens-slider');
    var maxTokens = maxTokensInput ? parseInt(maxTokensInput.value, 10) || DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS;
    if (provider === 'OpenRouter') {
      var orKeyInput = document.getElementById('ia-api-provider-key-input');
      apiKey = orKeyInput ? (orKeyInput.value || '').trim() : '';
      var orModelSelect = document.getElementById('ia-api-provider-model-select');
      model = orModelSelect ? (orModelSelect.value || '') : '';
    } else if (provider === 'Google Gemini') {
      var gemKeyInput = document.getElementById('ia-gemini-provider-key-input');
      apiKey = gemKeyInput ? (gemKeyInput.value || '').trim() : '';
      var gemModelSelect = document.getElementById('ia-gemini-provider-model-select');
      model = gemModelSelect ? (gemModelSelect.value || '') : '';
    } else if (provider === 'OpenAI') {
      var oaKeyInput = document.getElementById('ia-openai-provider-key-input');
      apiKey = oaKeyInput ? (oaKeyInput.value || '').trim() : '';
      var oaModelSelect = document.getElementById('ia-openai-provider-model-select');
      model = oaModelSelect ? (oaModelSelect.value || '') : '';
    }
    var mcpInput = document.getElementById('ia-mcp-server-url-input');
    var mcpUrl = mcpInput ? (mcpInput.value || '').trim() : '';
    var mcpSearchInput = document.getElementById('ia-mcp-search-url-input');
    var mcpSearchUrl = mcpSearchInput ? (mcpSearchInput.value || '').trim() : '';
    var mcpUserInput = document.getElementById('ia-mcp-server-username-input');
    var mcpUsername = mcpUserInput ? (mcpUserInput.value || '').trim() : '';
    var mcpPassInput = document.getElementById('ia-mcp-server-password-input');
    var mcpPassword = mcpPassInput ? (mcpPassInput.value || '') : '';
    var mcpRememberInput = document.getElementById('ia-mcp-server-remember-pass');
    var mcpRemember = mcpRememberInput ? !!mcpRememberInput.checked : false;
    var lightragUrlInput = document.getElementById('ia-lightrag-url-input');
    var lightragApiKeyInput = document.getElementById('ia-lightrag-api-key-input');
    var maxTokensInput = document.getElementById('ia-max-tokens-slider');
    var maxTokens = maxTokensInput ? parseInt(maxTokensInput.value, 10) || DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS;
    var lightragUrl = lightragUrlInput ? (lightragUrlInput.value || '').trim() : '';
    var lightragApiKey = lightragApiKeyInput ? (lightragApiKeyInput.value || '').trim() : '';
    var lightragKeyFromSaved = lightragApiKeyInput && lightragApiKeyInput.dataset && lightragApiKeyInput.dataset.saved === 'true';
    var lightragKeyPresent = lightragApiKey && lightragApiKey !== '********' ? true : lightragKeyFromSaved;
    var lightragApiKeyValue = (lightragApiKey && lightragApiKey !== '********') ? lightragApiKey : '';
    return {
      provider: provider,
      base_url: baseUrl,
      api_key: apiKey,
      model: model,
      mcp_url: mcpUrl,
      mcp_search_url: mcpSearchUrl,
      mcp_username: mcpUsername,
      mcp_password: mcpPassword,
      mcp_remember_password: mcpRemember ? 'true' : 'false',
      max_tokens: maxTokens,
      lightrag_url: lightragUrl,
      lightrag_api_key_present: lightragKeyPresent,
      lightrag_api_key_value: lightragApiKeyValue || window.lastSavedLightragKey || ''
    };
  };

  window.isProviderConfigDirty = function () {
    if (!window.lastSavedConfig) return true;
    var current = window.currentProviderConfig();
    return [
      'provider',
      'base_url',
      'api_key',
      'model',
      'mcp_url',
      'mcp_search_url',
      'mcp_username',
      'mcp_password',
      'mcp_remember_password',
      'max_tokens',
      'lightrag_url',
      'lightrag_api_key_present',
      'lightrag_api_key_value'
    ].some(function (key) {
      return (current[key] || '') !== (window.lastSavedConfig[key] || '');
    });
  };

  window.updateSaveButtonState = function (dirty, saving) {
    var btn = document.getElementById('ia-api-provider-show-btn');
    if (!btn) return;
    var isDirty = typeof dirty === 'boolean' ? dirty : window.isProviderConfigDirty();
    var isSaving = !!saving;
    btn.disabled = isSaving || !isDirty;
    btn.style.opacity = isSaving ? '0.6' : (isDirty ? '1' : '0.7');
    btn.style.cursor = isSaving || !isDirty ? 'not-allowed' : 'pointer';
    if (isSaving) {
      btn.textContent = 'Guardando...';
    } else if (!isDirty) {
      btn.textContent = 'Guardar';
    }
  };

  window.showProviderSavedPulse = function () {
    var btn = document.getElementById('ia-api-provider-show-btn');
    if (!btn) return;
    var originalText = 'Guardar';
    btn.textContent = 'Guardado';
    btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
    setTimeout(function () {
      btn.textContent = originalText;
      btn.style.background = 'linear-gradient(135deg, #5B46E5, #7C3AED, #A855F7)';
    }, 1200);
  };

  window.selectIaApiProvider = function (providerName) {
    window.selectedIaApiProvider = providerName || null;
    window.renderApiProviderList && window.renderApiProviderList();
    console.log('Proveedor API seleccionado:', window.selectedIaApiProvider || 'ninguno');
    window.selectedIaApiBaseUrl = PROVIDER_DEFAULT_BASE[window.selectedIaApiProvider] || null;
    window.toggleProviderBoxes();
    window.updateSaveButtonState && window.updateSaveButtonState(window.isProviderConfigDirty());
  };

  window.saveProviderSettings = function () {
    if (window.providerSaveInFlight) return;
    window.providerSaveInFlight = true;
    window.updateSaveButtonState && window.updateSaveButtonState(false, true);

    var provider = window.selectedIaApiProvider || '';
    var baseUrl = window.selectedIaApiBaseUrl || PROVIDER_DEFAULT_BASE[provider] || '';
    var apiKey = '';
    var model = '';
    var maxTokensInput = document.getElementById('ia-max-tokens-slider');
    var maxTokens = maxTokensInput ? parseInt(maxTokensInput.value, 10) || DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS;
    var lightragUrlInput = document.getElementById('ia-lightrag-url-input');
    var lightragApiKeyInput = document.getElementById('ia-lightrag-api-key-input');
    var lightragApiKeyRaw = lightragApiKeyInput ? (lightragApiKeyInput.value || '').trim() : '';

    if (provider === 'OpenRouter') {
      var orKeyInput = document.getElementById('ia-api-provider-key-input');
      apiKey = orKeyInput ? (orKeyInput.value || '').trim() : '';
      var orModelSelect = document.getElementById('ia-api-provider-model-select');
      model = orModelSelect ? (orModelSelect.value || '') : '';
    } else if (provider === 'Google Gemini') {
      var gemKeyInput = document.getElementById('ia-gemini-provider-key-input');
      apiKey = gemKeyInput ? (gemKeyInput.value || '').trim() : '';
      var gemModelSelect = document.getElementById('ia-gemini-provider-model-select');
      model = gemModelSelect ? (gemModelSelect.value || '') : '';
    } else if (provider === 'OpenAI') {
      var oaKeyInput = document.getElementById('ia-openai-provider-key-input');
      apiKey = oaKeyInput ? (oaKeyInput.value || '').trim() : '';
      var oaModelSelect = document.getElementById('ia-openai-provider-model-select');
      model = oaModelSelect ? (oaModelSelect.value || '') : '';
    }

    var payload = {
      provider_setting: {
        provider: provider,
        base_url: baseUrl,
        api_key: apiKey,
        model: model,
        max_tokens: maxTokens
      },
      lightrag_setting: {
        url: lightragUrlInput ? (lightragUrlInput.value || '').trim() : '',
        api_key: lightragApiKeyRaw
      }
    };

    fetch('/ia_colaborativa/provider_settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.getCsrfToken()
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (response && response.status === 403) {
          window.renderIaSettingsNotice && window.renderIaSettingsNotice('Acceso denegado por el servidor: solo administradores pueden guardar la configuración.', true);
          throw new Error('forbidden');
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.success) {
          console.warn('No se pudo guardar la configuracion del proveedor', data && data.error);
          window.providerSaveInFlight = false;
          window.updateSaveButtonState && window.updateSaveButtonState(window.isProviderConfigDirty());
          return;
        }
        console.log('Configuracion de proveedor guardada');
        window.lastSavedLightragKey = lightragApiKeyRaw;
        try {
          if (lightragApiKeyRaw) {
            window.localStorage.setItem('ia_lightrag_api_key', lightragApiKeyRaw);
          } else {
            window.localStorage.removeItem('ia_lightrag_api_key');
          }
        } catch (err) {
          console.warn('No se pudo persistir clave Lightrag en localStorage:', err);
        }
        if (lightragApiKeyInput) {
          lightragApiKeyInput.dataset.saved = lightragApiKeyRaw ? 'true' : 'false';
        }
        window.lastSavedConfig = window.currentProviderConfig();
        window.providerSaveInFlight = false;
        window.showProviderSavedPulse && window.showProviderSavedPulse();
        window.updateSaveButtonState && window.updateSaveButtonState(false);
    })
      .catch(function (err) {
        console.error('Error al guardar configuracion de proveedor:', err);
        if (err && err.message === 'forbidden') {
          alert('Permisos insuficientes para guardar configuración.');
        }
        window.providerSaveInFlight = false;
        window.updateSaveButtonState && window.updateSaveButtonState(window.isProviderConfigDirty());
      });

    var mcpInput = document.getElementById('ia-mcp-server-url-input');
    var mcpUrl = mcpInput ? (mcpInput.value || '').trim() : '';
    var mcpSearchInput = document.getElementById('ia-mcp-search-url-input');
    var mcpSearchUrl = mcpSearchInput ? (mcpSearchInput.value || '').trim() : '';
    var mcpUserInput = document.getElementById('ia-mcp-server-username-input');
    var mcpUsername = mcpUserInput ? (mcpUserInput.value || '').trim() : '';
    var mcpPassInput = document.getElementById('ia-mcp-server-password-input');
    var mcpPassword = mcpPassInput ? (mcpPassInput.value || '') : '';
    var mcpRememberInput = document.getElementById('ia-mcp-server-remember-pass');
    var mcpRemember = mcpRememberInput ? !!mcpRememberInput.checked : false;
    try {
      if (mcpRemember && mcpPassword) {
        window.localStorage.setItem('ia_mcp_password', mcpPassword);
        window.localStorage.setItem('ia_mcp_remember', 'true');
      } else {
        window.localStorage.removeItem('ia_mcp_password');
        window.localStorage.setItem('ia_mcp_remember', 'false');
      }
    } catch (err) {
      console.warn('No se pudo persistir la clave MCP en localStorage:', err);
    }
    if (mcpUrl || mcpSearchUrl || mcpUsername || mcpPassword) {
      fetch('/ia_colaborativa/mcp_settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.getCsrfToken()
        },
        body: JSON.stringify({
          mcp_setting: {
            url: mcpUrl,
            search_url: mcpSearchUrl,
            username: mcpUsername,
            password: mcpPassword
          }
        })
      }).then(function (response) {
        if (response && response.status === 403) {
          window.renderIaSettingsNotice && window.renderIaSettingsNotice('Acceso denegado al guardar ajustes MCP (requiere administrador).', true);
        }
      }).catch(function (err) {
        console.warn('No se pudo guardar la URL MCP:', err);
      });
    }
  };

  window.loadProviderSettings = function () {
    fetch('/ia_colaborativa/provider_settings', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(function (response) {
        console.log('[IA Settings][FE] GET /provider_settings status=', response && response.status);
        if (response && response.status === 403) {
          window.renderIaSettingsNotice && window.renderIaSettingsNotice('No tienes permisos para ver la configuración general. Solicita acceso de administrador.', true);
          return null;
        }
        if (!response || !response.ok) {
          return response.text().then(function (body) {
            console.error('[IA Settings][FE] /provider_settings no-ok', response && response.status, body);
            return null;
          }).catch(function () { return null; });
        }
        return response.json().catch(function (err) {
          console.error('[IA Settings][FE] /provider_settings JSON parse error', err);
          return null;
        });
      })
      .then(function (data) {
        console.log('[IA Settings][FE] /provider_settings payload=', data);
        if (!data) return;
        if (!data || !data.success || !data.data) {
          return;
        }
        var cfg = data.data;
        window.selectedIaApiProvider = cfg.provider || null;
        window.selectedIaApiBaseUrl = cfg.base_url || PROVIDER_DEFAULT_BASE[cfg.provider] || null;
        window.renderApiProviderList && window.renderApiProviderList();

        if (cfg.provider === 'OpenRouter') {
          var orKeyInput = document.getElementById('ia-api-provider-key-input');
          if (orKeyInput && cfg.api_key) orKeyInput.value = cfg.api_key;
          var orModelSelect = document.getElementById('ia-api-provider-model-select');
          if (orModelSelect && cfg.model) orModelSelect.value = cfg.model;
        } else if (cfg.provider === 'Google Gemini') {
          var gemKeyInput = document.getElementById('ia-gemini-provider-key-input');
          if (gemKeyInput && cfg.api_key) gemKeyInput.value = cfg.api_key;
          var gemModelSelect = document.getElementById('ia-gemini-provider-model-select');
          if (gemModelSelect && cfg.model) gemModelSelect.value = cfg.model;
        } else if (cfg.provider === 'OpenAI') {
          var oaKeyInput = document.getElementById('ia-openai-provider-key-input');
          if (oaKeyInput && cfg.api_key) oaKeyInput.value = cfg.api_key;
          var oaModelSelect = document.getElementById('ia-openai-provider-model-select');
          if (oaModelSelect && cfg.model) oaModelSelect.value = cfg.model;
        }

        var maxTokens = cfg.max_tokens || DEFAULT_MAX_TOKENS;
        window.setMaxTokensValue && window.setMaxTokensValue(maxTokens);

        // Cargar config de Lightrag desde la misma respuesta (si viene)
        if (cfg.lightrag || data.lightrag) {
          var lcfg = cfg.lightrag || data.lightrag;
          var lightUrlInput = document.getElementById('ia-lightrag-url-input');
          var lightKeyInput = document.getElementById('ia-lightrag-api-key-input');
          var storedLightKey = null;
          try {
            storedLightKey = window.localStorage.getItem('ia_lightrag_api_key') || null;
          } catch (err) {
            console.warn('No se pudo acceder a localStorage para Lightrag:', err);
          }
          if (lightUrlInput && lcfg.url) {
            lightUrlInput.value = lcfg.url;
          }
          if (lightKeyInput) {
            if (lcfg.api_key_present && storedLightKey) {
              lightKeyInput.value = storedLightKey;
              window.lastSavedLightragKey = storedLightKey;
            } else {
              lightKeyInput.value = '';
            }
            lightKeyInput.dataset.saved = lcfg.api_key_present ? 'true' : 'false';
          }
        }

        window.toggleProviderBoxes();
        window.renderIaSettingsNotice && window.renderIaSettingsNotice('Configuración cargada correctamente.', false);
        var savedCfg = window.currentProviderConfig();
        if (cfg.lightrag || data.lightrag) {
          var lcfg2 = cfg.lightrag || data.lightrag;
          savedCfg.lightrag_url = lcfg2.url || '';
          savedCfg.lightrag_api_key_present = !!lcfg2.api_key_present;
          savedCfg.lightrag_api_key_value = window.lastSavedLightragKey || '';
        }
      window.lastSavedConfig = savedCfg;
      window.updateSaveButtonState && window.updateSaveButtonState(false);
      })
      .catch(function (err) {
        console.warn('No se pudo cargar configuracion de proveedor:', err);
      });

    fetch('/ia_colaborativa/mcp_settings', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(function (response) {
        console.log('[IA Settings][FE] GET /mcp_settings status=', response && response.status);
        if (response && response.status === 403) {
          window.renderIaSettingsNotice && window.renderIaSettingsNotice('No tienes permisos para ver la configuración MCP.', true);
          return null;
        }
        if (!response || !response.ok) {
          return response.text().then(function (body) {
            console.error('[IA Settings][FE] /mcp_settings no-ok', response && response.status, body);
            return null;
          }).catch(function () { return null; });
        }
        return response.json().catch(function (err) {
          console.error('[IA Settings][FE] /mcp_settings JSON parse error', err);
          return null;
        });
      })
      .then(function (data) {
        console.log('[IA Settings][FE] /mcp_settings payload=', data);
        if (!data) return;
        if (!data || !data.success || !data.data) {
          return;
        }
        var cfg = data.data;
        var mcpInput = document.getElementById('ia-mcp-server-url-input');
        if (mcpInput && cfg.url) {
          mcpInput.value = cfg.url;
        }
        var mcpSearchInput = document.getElementById('ia-mcp-search-url-input');
        if (mcpSearchInput && cfg.search_url) {
          mcpSearchInput.value = cfg.search_url;
        }
        var mcpUserInput = document.getElementById('ia-mcp-server-username-input');
        if (mcpUserInput && cfg.username) {
          mcpUserInput.value = cfg.username;
        }
        var mcpPassInput = document.getElementById('ia-mcp-server-password-input');
        if (mcpPassInput && cfg.password) {
          mcpPassInput.value = cfg.password;
        }
        console.log('[IA Settings][FE] MCP inputs set', {
          url: mcpInput ? mcpInput.value : null,
          search_url: mcpSearchInput ? mcpSearchInput.value : null,
          username: mcpUserInput ? mcpUserInput.value : null,
          password_present: mcpPassInput ? !!mcpPassInput.value : false
        });
        var mcpRememberInput = document.getElementById('ia-mcp-server-remember-pass');
        if (mcpRememberInput) {
          try {
            var rememberValue = window.localStorage.getItem('ia_mcp_remember');
            var savedPass = window.localStorage.getItem('ia_mcp_password');
            var remember = rememberValue === 'true';
            mcpRememberInput.checked = remember;
            if (remember && savedPass && (!mcpPassInput.value || mcpPassInput.value === '********')) {
              mcpPassInput.value = savedPass;
            }
          } catch (err) {
            console.warn('No se pudo cargar la clave MCP desde localStorage:', err);
          }
        }
        window.lastSavedConfig = window.currentProviderConfig();
        window.updateSaveButtonState && window.updateSaveButtonState(false);
      })
      .catch(function (err) {
        console.warn('No se pudo cargar URL MCP:', err);
      });
  };

  window.initMcpPasswordToggle = function () {
    var input = document.getElementById('ia-mcp-server-password-input');
    var toggle = document.getElementById('ia-mcp-server-password-toggle');
    if (!input || !toggle) return;

    toggle.addEventListener('click', function () {
      var isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      toggle.textContent = isHidden ? '🙈' : '👁';
      toggle.title = isHidden ? 'Ocultar contrasena' : 'Ver contrasena';
    });
  };

  // Acceso directo a ajustes: la contraseña fue deshabilitada.
  window.openIaSettingsAuthModal = function () {
    window.openIaSettings('general');
  };

  window.closeIaSettingsAuthModal = function () {
    var modal = document.getElementById('ia-chat-settings-auth-modal');
    if (!modal) return;
    modal.style.display = 'none';
  };

  window.initIaSettingsAuthModal = function () {
    var modal = document.getElementById('ia-chat-settings-auth-modal');
    var input = document.getElementById('ia-chat-settings-auth-input');
    var remember = document.getElementById('ia-chat-settings-auth-remember');
    var showToggle = document.getElementById('ia-chat-settings-auth-toggle');
    var closeBtn = document.getElementById('ia-chat-settings-auth-close');
    var cancelBtn = document.getElementById('ia-chat-settings-auth-cancel');
    var submitBtn = document.getElementById('ia-chat-settings-auth-submit');
    if (!modal || !input || !submitBtn) return;

    var close = function () {
      window.closeIaSettingsAuthModal();
    };
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    if (showToggle) {
      showToggle.addEventListener('click', function () {
        var isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        var label = isHidden ? 'Ocultar contrasena' : 'Mostrar contrasena';
        showToggle.setAttribute('aria-label', label);
        showToggle.setAttribute('title', label);
      });
    }

    var submit = function () {
      var password = (input.value || '').trim();
      if (password !== 'Vinfrancis230189@1') {
        alert('Contraseña incorrecta. Acceso denegado.');
        return;
      }
      try {
        if (remember && remember.checked) {
          window.localStorage.setItem('ia_settings_password', password);
          window.localStorage.setItem('ia_settings_remember', 'true');
        } else {
          window.localStorage.removeItem('ia_settings_password');
          window.localStorage.setItem('ia_settings_remember', 'false');
        }
      } catch (err) {
        console.warn('No se pudo guardar la clave de ajustes:', err);
      }
      window.closeIaSettingsAuthModal();
      window.openIaSettings();
    };

    submitBtn.addEventListener('click', submit);
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  };

  window.minimizeIaChat = function () {
    var modal = document.getElementById('ia-chat-window');
    if (!modal) return;
    window.hideAgentMenu && window.hideAgentMenu();

    // Simplemente cerrar la ventana (igual que el botón X)
    requestAnimationFrame(function () {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  };

  window.toggleIaChat = function () {
    var modal = document.getElementById('ia-chat-window');
    if (!modal) {
      console.warn('IA Chat: Modal no encontrado');
      return;
    }

    // Verificar el estado actual de forma más confiable
    var isHidden = modal.style.display === 'none' ||
      modal.style.display === '' ||
      modal.getAttribute('aria-hidden') === 'true';

    if (isHidden) {
      window.openIaChat();
    } else {
      window.closeIaChat();
    }
  };

  window.sendIaMessage = function (e) {
    e.preventDefault();
    const input = document.getElementById('ia-chat-input');
    const list = document.getElementById('ia-chat-messages');
    const welcome = document.getElementById('ia-chat-welcome');
    if (!input || !list) return;

    const text = input.value.trim();
    const imageData = window.currentImageData;

    // Validar que haya al menos texto o imagen
    if (!text && !imageData) return;

    // Ocultar pantalla de bienvenida y mostrar chat (cambiar de Cara 1 a Cara 2)
    if (welcome && welcome.style.display !== 'none') {
      welcome.style.display = 'none';
      list.style.display = 'flex';
    }

    var agentToSend = window.currentAgent || 'docs';

    // Mostrar mensaje del usuario (con imagen si existe)
    var prefixText = window.fixedProjectPromptPrefix || '';
    var displayText = text || 'Analiza esta imagen';
    if (agentToSend === 'cde' && prefixText) {
      displayText = prefixText + (text ? text : '');
    }
    window.addUserMessage(displayText, imageData);
    input.value = '';
    window.syncProjectPrompt && window.syncProjectPrompt();

    // Limpiar el preview de imagen INMEDIATAMENTE después de enviar
    window.removeImagePreview();

    // Mostrar indicador de "escribiendo..."
    const typingId = window.addTypingIndicator();
    var toolActivityId = null;
    var liveTurnId = null;
    if (agentToSend === 'sara_tools') {
      liveTurnId = window.generateIaTurnId();
      window.createLiveAgentTurnCard(liveTurnId);
      window.startIaTurnPolling(liveTurnId);
    }

    // Cambiar botón de enviar a STOP
    window.changeSendButtonToStop();

    

    // Extraer información del usuario en sesión
    var currentUser = window.extractCurrentUser();

    // Validar proveedor IA cuando se usa SaraIA (docs)
    if ((agentToSend === 'docs' || agentToSend === 'sara') && window.isIaColabAdmin && window.isIaColabAdmin()) {
      var provider = window.selectedIaApiProvider;
      var missingKey = false;

      if (!provider) {
        missingKey = true;
      } else if (provider === 'OpenRouter') {
        var orKeyInput = document.getElementById('ia-api-provider-key-input');
        missingKey = !orKeyInput || !orKeyInput.value.trim();
      } else if (provider === 'Google Gemini') {
        var gemKeyInput = document.getElementById('ia-gemini-provider-key-input');
        missingKey = !gemKeyInput || !gemKeyInput.value.trim();
      } else if (provider === 'OpenAI') {
        var oaKeyInput = document.getElementById('ia-openai-provider-key-input');
        missingKey = !oaKeyInput || !oaKeyInput.value.trim();
      }

      if (missingKey) {
        window.removeTypingIndicator(typingId);
        window.removeToolActivityIndicator(toolActivityId);
        if (liveTurnId) {
          window.stopIaTurnPolling(liveTurnId);
        }
        window.changeSendButtonToNormal();
        alert('Configura un proveedor de IA y su API key en Ajustes > General antes de usar SaraIA.');
        window.openIaSettings('general');
        var selectEl = document.getElementById('ia-api-provider-select');
        if (selectEl) selectEl.focus();
        return;
      }
    }

    console.log('📤 Enviando mensaje al backend:');
    console.log('   - Mensaje:', text || '(solo imagen)');
    console.log('   - Agent Type FINAL:', agentToSend);
    console.log('   - Imagen adjunta:', imageData ? 'Sí' : 'No');
    console.log('   - Usuario en sesión:', currentUser);

    // Preparar el body del request
    var requestBody = {
      message: displayText,
      agent_type: agentToSend
    };
    if (liveTurnId) {
      requestBody.turn_id = liveTurnId;
    }
    if (agentToSend === 'cde') {
      requestBody.thread_id = window.getIaCdeThreadId();
    }

    if (window.iaForcedIntent) {
      requestBody.intent = window.iaForcedIntent;
      window.iaForcedIntent = null; // consumir una sola vez
    }

    // Agregar usuario si existe
    if (currentUser) {
      requestBody.current_user = currentUser;
    }

    if (window.selectedProject) {
      requestBody.project = {
        id: window.selectedProject.id,
        name: window.selectedProject.name
      };
      requestBody.project_id = window.selectedProject.id;
    }

    // Agregar imagen si existe
    if (imageData) {
      requestBody.image_data = imageData;
    }

    fetch('/ia_colaborativa/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.getCsrfToken()
      },
      body: JSON.stringify(requestBody)
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        window.removeTypingIndicator(typingId);
        window.removeToolActivityIndicator(toolActivityId);
        if (liveTurnId) {
          window.stopIaTurnPolling(liveTurnId);
          window.pollIaTurnEvents(liveTurnId);
        }

        // NO cambiar el botИn aquИ, se cambiarб cuando termine el typewriter
        if (data.response) {
          console.log('[IA chat] respuesta intent:', data.intent, 'buttons:', data.buttons);
          var aiNode = liveTurnId
            ? window.finalizeLiveAgentTurnCard(
                liveTurnId,
                data.response,
                true,
                data.automation_options,
                data.tool_calls || [],
                null,
                data.events || [],
                data.turn_meta || {}
              )
            : window.addAiMessage(
                data.response,
                true,
                data.automation_options,
                data.tool_calls || [],
                null,
                data.events || [],
                data.turn_meta || {}
              );

          // Botón Mapa mental solo para SaraIA Docs
          if (agentToSend === 'docs' && aiNode && data.response) {
            window.attachMindmapButton(aiNode, data.response);
          }
          if (agentToSend === 'cde' && aiNode && data.report_html) {
            window.attachReportButton(aiNode, data.report_html, data.report_filename);
          }

          // Mostrar botones solo para la intención work_packages (después de terminar de escribir)
          if (data.intent === 'work_packages' && aiNode) {
            aiNode.__onRevealCallbacks = aiNode.__onRevealCallbacks || [];
            if (Array.isArray(data.buttons) && data.buttons.length && window.renderWorkPackageButtons) {
              aiNode.__onRevealCallbacks.push(function () {
                window.renderWorkPackageButtons(aiNode, data.buttons);
              });
            } else if (window.renderWorkPackageIntentButtons) {
              aiNode.__onRevealCallbacks.push(function () {
                window.renderWorkPackageIntentButtons(aiNode);
              });
            }
          }
        } else if (data.error) {
          window.removeToolActivityIndicator(toolActivityId);
          window.addAiMessage('Error: ' + data.error);
          // Si hay error, volver el botИn a normal
          window.changeSendButtonToNormal();
        }
      })
      .catch(function (error) {
        window.removeTypingIndicator(typingId);
        window.removeToolActivityIndicator(toolActivityId);
        if (liveTurnId) {
          window.stopIaTurnPolling(liveTurnId);
          window.removeLiveAgentTurnCard(liveTurnId);
        }
        console.error('Error:', error);
        window.addAiMessage('Lo siento, hubo un error al conectar con el servidor.');
        // En caso de error, volver el botón a normal
        window.changeSendButtonToNormal();
        // Limpiar la imagen en caso de error también
        window.removeImagePreview();
      });
  };

  window.addUserMessage = function (text, imageData) {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return;

    // Contenedor del mensaje estilo ChatGPT
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.gap = '12px';
    messageContainer.style.alignItems = 'flex-start';
    messageContainer.style.padding = '12px';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.transition = 'background 0.15s ease';
    messageContainer.style.background = 'rgba(15, 23, 42, 0.15)';
    messageContainer.style.boxShadow = 'inset 0 0 0 1px rgba(15, 23, 42, 0.25)';

    // Contenedor del contenido (texto + imagen)
    const contentContainer = document.createElement('div');
    contentContainer.style.flex = '1';
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.gap = '8px';

    // Si hay imagen, agregarla primero
    if (imageData) {
      const imageElement = document.createElement('img');
      imageElement.src = imageData;
      imageElement.style.maxWidth = '150px';
      imageElement.style.maxHeight = '80px';
      imageElement.style.borderRadius = '8px';
      imageElement.style.border = '1px solid #3f3f3f';
      imageElement.style.cursor = 'pointer';
      imageElement.style.objectFit = 'cover';
      imageElement.onclick = function () {
        window.open(imageData, '_blank');
      };
      contentContainer.appendChild(imageElement);
    }

    // Texto del mensaje oscuro
    const messageText = document.createElement('div');
    messageText.style.color = '#ececec';
    messageText.style.fontSize = '14px';
    messageText.style.lineHeight = '1.6';
    messageText.style.paddingTop = '2px';
    messageText.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    messageText.textContent = text;

    contentContainer.appendChild(messageText);
    messageContainer.appendChild(contentContainer);
    list.appendChild(messageContainer);

    // Auto-scroll solo si el usuario está cerca del final
    var isNearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 100;
    if (isNearBottom) {
      list.scrollTop = list.scrollHeight;
    }

    return messageContainer;
  };

  function splitMarkdownRow(line) {
    var cells = line.trim().split('|');
    if (cells.length && cells[0].trim() === '') {
      cells.shift();
    }
    if (cells.length && cells[cells.length - 1].trim() === '') {
      cells.pop();
    }
    return cells.map(function (cell) { return cell.trim(); });
  }

  function convertMarkdownTable(block) {
    var lines = block.trim().split(/\r?\n/).filter(function (line) {
      return line.trim().length > 0;
    });

    if (lines.length < 2) {
      return block;
    }

    var headerCells = splitMarkdownRow(lines[0]);
    var dividerCells = splitMarkdownRow(lines[1]);

    if (!headerCells.length || !dividerCells.length) {
      return block;
    }

    var dividerValid = dividerCells.every(function (cell) {
      var spec = cell.replace(/\s+/g, '');
      return /^:?-{3,}:?$/.test(spec) || spec.replace(/[-:]/g, '').length === 0;
    });

    if (!dividerValid) {
      return block;
    }

    var alignments = dividerCells.map(function (cell) {
      var spec = cell.trim();
      if (spec.startsWith(':') && spec.endsWith(':')) {
        return 'center';
      } else if (spec.endsWith(':')) {
        return 'right';
      } else {
        return 'left';
      }
    });

    var bodyLines = lines.slice(2).filter(function (line) {
      return line.trim().length > 0;
    });

    if (!bodyLines.length) {
      return block;
    }

    var tableHtml = '<div style="margin: 14px 0; overflow-x: auto;">';
    tableHtml += '<table style="width:100%; border-collapse:collapse; font-size:13px; color:#e2e8f0; background:#111827; border:1px solid rgba(148,163,184,0.35); border-radius:6px; overflow:hidden;">';
    tableHtml += '<thead><tr>';
    headerCells.forEach(function (cell, idx) {
      tableHtml += '<th style="padding:10px; background:#0f172a; border-bottom:1px solid rgba(148,163,184,0.4); text-align:' + (alignments[idx] || 'left') + '; font-weight:600; color:#f8fafc;">' + cell + '</th>';
    });
    tableHtml += '</tr></thead><tbody>';

    bodyLines.forEach(function (line) {
      var cells = splitMarkdownRow(line);
      if (!cells.length) {
        return;
      }
      tableHtml += '<tr>';
      cells.forEach(function (cell, idx) {
        tableHtml += '<td style="padding:9px 10px; border-bottom:1px solid rgba(148,163,184,0.2); text-align:' + (alignments[idx] || 'left') + '; color:#cbd5f5;">' + (cell || '&nbsp;') + '</td>';
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table></div>';
    return tableHtml;
  }

  // Función para formatear markdown estilo libro técnico
  window.formatMarkdown = function (text) {
    // PRIMERO: Limpiar guiones al inicio cuando hay numeración jerárquica
    // Capturar: "- 5.2 Texto" → "5.2 Texto"
    text = text.replace(/^-\s+(\d+(?:\.\d+)*)\s+(.+)$/gm, '$1 $2');
    text = text.replace(/\n-\s+(\d+(?:\.\d+)*)\s+(.+)$/gm, '\n$1 $2');

    // Convertir TODOS los asteriscos de listas a guiones (antes de procesar markdown)
    text = text.replace(/^[ \t]*\*+[ \t]+(.+)$/gm, '- $1');
    text = text.replace(/\n[ \t]*\*+[ \t]+(.+)$/gm, '\n- $1');

    // Convertir ### Subtítulo (H3) - Estilo libro técnico
    text = text.replace(/^### (.+)$/gm, '<h3 style="color: #f1f5f9; font-size: 15px; font-weight: 700; margin: 20px 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid rgba(148,163,184,0.2); text-transform: uppercase; letter-spacing: 0.5px;">$1</h3>');

    // Convertir ## Título principal (H2) - Estilo libro técnico
    text = text.replace(/^## (.+)$/gm, '<h2 style="color: #f8fafc; font-size: 18px; font-weight: 700; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #667eea; letter-spacing: 0.3px;">$1</h2>');

    // Convertir # Título mayor (H1) - Estilo libro técnico
    text = text.replace(/^# (.+)$/gm, '<h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 28px 0 16px 0; padding: 12px 0; border-bottom: 3px solid #667eea; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">$1</h1>');

    // Convertir referencias [1], [2], etc. a subíndices con paréntesis ₍₁₎
    // Deshabilitado para el editor CKEditor.

    // Convertir **negrita** a <strong> - Más destacado
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #f1f5f9; font-weight: 700; padding: 2px 4px; border-radius: 3px;">$1</strong>');

    // Convertir *cursiva* a <em> (solo si no es parte de una lista)
    text = text.replace(/\*(.+?)\*/g, '<em style="color: #cbd5e1; font-style: italic; opacity: 0.95;">$1</em>');

    // Convertir listas con JERARQUÍA numérica (índice profesional compacto)
    // IMPORTANTE: Procesar desde el más específico al más general

    // Nivel 4: 6.3.2.1 (cuatro números) - Máxima sangría
    text = text.replace(/^(\d+\.\d+\.\d+\.\d+)\s+(.+)$/gm, function (match, num, content) {
      return '<div style="margin: 1px 0 1px 90px; color: #94a3b8; line-height: 1.4; font-weight: 400; font-size: 12.5px;"><span style="color: #667eea; margin-right: 10px; display: inline-block; min-width: 70px;">' + num + '</span><span>' + content + '</span></div>';
    });

    // Nivel 3: 6.3.1 (tres números) - Tercera sangría
    text = text.replace(/^(\d+\.\d+\.\d+)\s+(.+)$/gm, function (match, num, content) {
      return '<div style="margin: 1px 0 1px 60px; color: #cbd5e1; line-height: 1.4; font-weight: 400; font-size: 13px;"><span style="color: #667eea; margin-right: 10px; display: inline-block; min-width: 55px;">' + num + '</span><span>' + content + '</span></div>';
    });

    // Nivel 2: 5.7, 6.1, 6.2 (dos números) - Segunda sangría
    text = text.replace(/^(\d+\.\d+)\s+(.+)$/gm, function (match, num, content) {
      return '<div style="margin: 2px 0 1px 30px; color: #e5e7eb; line-height: 1.4; font-weight: 500; font-size: 13.5px;"><span style="color: #667eea; margin-right: 10px; display: inline-block; min-width: 40px;">' + num + '</span><span>' + content + '</span></div>';
    });

    // Nivel 1: 5, 6 (un número) - Sin sangría (capítulos principales)
    text = text.replace(/^(\d+)\s+(.+)$/gm, function (match, num, content) {
      return '<div style="margin: 6px 0 2px 0; color: #f8fafc; line-height: 1.4; font-weight: 600; font-size: 14px;"><span style="color: #667eea; margin-right: 10px; display: inline-block; min-width: 25px;">' + num + '</span><span>' + content + '</span></div>';
    });

    // Listas con guiones (sin numeración) - Items simples
    text = text.replace(/^- (.+)$/gm, '<div style="margin: 1px 0 1px 8px; padding-left: 20px; color: #cbd5e1; line-height: 1.4; text-indent: -20px; font-size: 13px;"><span style="color: #667eea; font-weight: 700; margin-right: 8px;">-</span><span style="display: inline;">$1</span></div>');

    // Convertir `código` a formato código inline
    text = text.replace(/`(.+?)`/g, '<code style="background: #1a1f2e; color: #a5f3fc; padding: 2px 6px; border-radius: 4px; font-family: \'Courier New\', monospace; font-size: 13px; border: 1px solid rgba(148,163,184,0.2);">$1</code>');

    // Convertir tablas markdown a HTML estilizado
    text = text.replace(/((?:^\s*\|.*\|\s*(?:\r?\n|$))+)/gm, function (match) {
      return convertMarkdownTable(match);
    });

    // Sistema de espaciado inteligente para estructura de libro/índice
    // Primero, normalizar múltiples saltos de línea a máximo 2
    text = text.replace(/\n{3,}/g, '\n\n');

    // Detectar cambios de sección (después de títulos) y agregar espacio
    text = text.replace(/(<\/h[123]>)\n/g, '$1<div style="height: 4px;"></div>');

    // Espacio entre párrafos normales
    text = text.replace(/\n\n/g, '<div style="height: 6px;"></div>');

    // Saltos de línea simples (dentro de listas o párrafos)
    text = text.replace(/\n/g, '<br>');

    return text;
  };

  // Función para convertir números a subíndices Unicode con paréntesis
  window.convertToSubscript = function (num) {
    var subscriptMap = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
    };

    var result = '₍'; // Paréntesis izquierdo en subíndice
    for (var i = 0; i < num.length; i++) {
      result += subscriptMap[num[i]] || num[i];
    }
    result += '₎'; // Paréntesis derecho en subíndice

    return '<sup style="color: #667eea; font-weight: 700; font-size: 12px; cursor: pointer; text-decoration: none;">' + result + '</sup>';
  };

  // Variable global para controlar el typewriter (para poder detenerlo)
  window.currentTypewriterTimeout = null;
  window.isTypewriterActive = false;

  // Función para detener el typewriter actual
  window.stopTypewriter = function () {
    if (window.currentTypewriterTimeout) {
      clearTimeout(window.currentTypewriterTimeout);
      window.currentTypewriterTimeout = null;
    }
    window.isTypewriterActive = false;
  };

  // Función para efecto de escritura (typewriter) con formato en tiempo real
  window.typewriterEffect = function (element, text, speed, callback) {
    var i = 0;
    var currentText = '';
    var stopped = false;
    var totalLength = text ? text.length : 0;
    var baseChunk = totalLength > 1200 ? 8 : totalLength > 600 ? 6 : 4;

    element.innerHTML = '';
    window.isTypewriterActive = true;
    element.dataset.fullText = text;

    function type() {
      if (!window.isTypewriterActive || stopped) {
        element.innerHTML = window.formatMarkdown(text);
        if (callback) callback();
        return;
      }

      if (i < totalLength) {
        var chunkSize = Math.min(baseChunk, totalLength - i);
        var chunk = text.slice(i, i + chunkSize);
        currentText += chunk;
        i += chunkSize;

        element.innerHTML = window.formatMarkdown(currentText);

        var list = document.getElementById('ia-chat-messages');
        if (list) {
          var isNearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 100;
          if (isNearBottom) {
            list.scrollTop = list.scrollHeight;
          }
        }

        var lastChar = chunk.charAt(chunk.length - 1);
        var nextSpeed = (lastChar === '\n' || lastChar === ' ') ? speed / 2 : speed;

        window.currentTypewriterTimeout = setTimeout(type, Math.max(2, nextSpeed));
      } else {
        element.innerHTML = window.formatMarkdown(text);
        window.isTypewriterActive = false;
        if (callback) callback();
      }
    }

    type();
  };

  function ensureToolCallSpinnerStyles() {
    if (document.getElementById('ia-toolcall-spinner-style')) return;
    var style = document.createElement('style');
    style.id = 'ia-toolcall-spinner-style';
    style.textContent = "@keyframes iaToolSpin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}"
      + ".ia-toolcall-spinner{width:14px;height:14px;border:2px solid rgba(148,163,184,0.35);"
      + "border-top-color:#94a3b8;border-radius:50%;animation:iaToolSpin 0.8s linear infinite;}";
    document.head.appendChild(style);
  }

  window.parseBimSummary = function (text) {
    if (!text || text.indexOf('Resumen BIM del proyecto') === -1) return null;
    var titleMatch = text.match(/Resumen BIM del proyecto\s+([^\n]+)\./i);
    if (!titleMatch) return null;
    var title = 'Resumen BIM del proyecto ' + titleMatch[1];
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var rows = [];
    var downloadUrl = null;
    lines.forEach(function (line) {
      if (/^Descarga el reporte completo aqui:/i.test(line)) {
        var urlMatch = line.match(/https?:\/\/\S+/i);
        if (urlMatch) downloadUrl = urlMatch[0];
        return;
      }
      if (line.charAt(0) === '-') {
        var content = line.replace(/^-+/, '').trim();
        if (!content) return;
        var parts = content.split(':');
        if (parts.length >= 2) {
          var label = parts.shift().trim();
          var value = parts.join(':').trim();
          rows.push({ label: label, value: value });
        } else {
          rows.push({ label: content, value: '' });
        }
      }
    });
    if (rows.length < 2) return null;
    return { title: title, rows: rows, url: downloadUrl };
  };

  window.renderBimSummaryCard = function (summary) {
    if (!summary) return null;
    var html = '';
    html += '<div style="display:flex;flex-direction:column;gap:10px;background:#1f1f1f;border:1px solid #3f3f3f;border-radius:10px;padding:12px;">';
    html += '<div style="font-weight:600;color:#ececec;font-size:14px;">' + summary.title + '</div>';
    html += '<div style="border:1px solid #3f3f3f;border-radius:8px;overflow:hidden;">';
    summary.rows.forEach(function (row, idx) {
      var bg = idx % 2 === 0 ? '#232323' : '#1f1f1f';
      html += '<div style="display:flex;gap:10px;padding:8px 10px;background:' + bg + ';">';
      html += '<div style="min-width:180px;color:#cbd5f5;font-weight:600;">' + row.label + '</div>';
      html += '<div style="color:#e5e7eb;flex:1;">' + row.value + '</div>';
      html += '</div>';
    });
    html += '</div>';
    if (summary.url) {
      html += '<div style="display:flex;justify-content:flex-start;">';
      html += '<a href="' + summary.url + '" target="_blank" rel="noopener" ' +
        'style="background:#5B46E5;color:#fff;border:1px solid #6d5bf0;border-radius:8px;padding:6px 10px;' +
        'text-decoration:none;font-size:12px;font-weight:600;">Descargar Reporte</a>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  window.formatWorkedFor = function (seconds) {
    var safe = Number(seconds || 0);
    if (!isFinite(safe) || safe < 0) safe = 0;
    return 'Worked for ' + safe.toFixed(1) + 's';
  };

  window.formatCompletedIn = function (seconds) {
    var safe = Number(seconds || 0);
    if (!isFinite(safe) || safe < 0) safe = 0;
    if (safe < 0.1) return 'Instantáneo';
    return 'Completado en ' + safe.toFixed(1) + 's';
  };

  window.iaLiveTurns = window.iaLiveTurns || {};

  window.generateIaTurnId = function () {
    return 'turn_' + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-6);
  };

  window.createLiveAgentTurnCard = function (turnId) {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return null;

    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.gap = '12px';
    messageContainer.style.alignItems = 'flex-start';
    messageContainer.style.padding = '12px';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.transition = 'background 0.15s ease';
    messageContainer.setAttribute('data-live-turn-id', turnId);

    const contentContainer = document.createElement('div');
    contentContainer.style.flex = '1';
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.gap = '8px';
    messageContainer.appendChild(contentContainer);

    list.appendChild(messageContainer);
    window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();
    list.scrollTop = list.scrollHeight;

    const state = {
      turnId: turnId,
      node: messageContainer,
      contentContainer: contentContainer,
      events: [],
      nextIndex: 0,
      turnMeta: { turn_id: turnId, agent: 'sara_tools' },
      pollTimer: null,
      pollInFlight: false
    };

    window.iaLiveTurns[turnId] = state;
    window.renderLiveAgentTurnCard(turnId);
    return state;
  };

  window.renderLiveAgentTurnCard = function (turnId) {
    const state = window.iaLiveTurns && window.iaLiveTurns[turnId];
    if (!state || !state.contentContainer) return;

    state.contentContainer.innerHTML = '';
    if (Array.isArray(state.events) && state.events.length) {
      const panel = window.renderAgentEventsPanel(state.events, state.turnMeta, []);
      if (panel) {
        state.contentContainer.appendChild(panel);
      }
    } else {
      const panel = document.createElement('div');
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.gap = '8px';
      panel.style.marginBottom = '8px';
      panel.style.background = '#f3f4f6';
      panel.style.border = '1px solid #d1d5db';
      panel.style.borderRadius = '10px';
      panel.style.padding = '10px';

      const header = document.createElement('div');
      header.style.color = '#111827';
      header.style.fontSize = '13px';
      header.style.fontWeight = '700';
      header.textContent = 'Sara · Trabajando...';
      panel.appendChild(header);

      const sub = document.createElement('div');
      sub.style.color = '#6b7280';
      sub.style.fontSize = '11px';
      sub.textContent = state.turnId;
      panel.appendChild(sub);

      state.contentContainer.appendChild(panel);
    }
  };

  window.pollIaTurnEvents = function (turnId) {
    const state = window.iaLiveTurns && window.iaLiveTurns[turnId];
    if (!state || state.pollInFlight) return;
    state.pollInFlight = true;

    fetch('/ia_colaborativa/chat_turns/' + encodeURIComponent(turnId) + '/events?since=' + encodeURIComponent(state.nextIndex || 0), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': window.getCsrfToken()
      }
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data || data.success === false) return;
        if (Array.isArray(data.events) && data.events.length) {
          state.events = (state.events || []).concat(data.events);
          state.nextIndex = Number(data.next_index || state.events.length);
          state.turnMeta = Object.assign({}, state.turnMeta || {}, data.turn_meta || {});
          window.renderLiveAgentTurnCard(turnId);
          const list = document.getElementById('ia-chat-messages');
          if (list) list.scrollTop = list.scrollHeight;
        }
      })
      .catch(function (error) {
        console.warn('Turn polling error:', error);
      })
      .finally(function () {
        state.pollInFlight = false;
      });
  };

  window.startIaTurnPolling = function (turnId) {
    const state = window.iaLiveTurns && window.iaLiveTurns[turnId];
    if (!state) return;
    window.pollIaTurnEvents(turnId);
    state.pollTimer = window.setInterval(function () {
      window.pollIaTurnEvents(turnId);
    }, 700);
  };

  window.stopIaTurnPolling = function (turnId) {
    const state = window.iaLiveTurns && window.iaLiveTurns[turnId];
    if (!state) return;
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  };

  window.removeLiveAgentTurnCard = function (turnId) {
    const state = window.iaLiveTurns && window.iaLiveTurns[turnId];
    if (!state) return;
    window.stopIaTurnPolling(turnId);
    if (state.node && state.node.parentNode) {
      state.node.parentNode.removeChild(state.node);
    }
    delete window.iaLiveTurns[turnId];
    window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();
  };

  window.finalizeLiveAgentTurnCard = function (turnId, text, useTypewriter, automationOptions, toolCalls, toolMeta, events, turnMeta) {
    const state = window.iaLiveTurns && window.iaLiveTurns[turnId];
    if (!state || !state.node || !state.contentContainer) {
      return window.addAiMessage(text, useTypewriter, automationOptions, toolCalls, toolMeta, events, turnMeta);
    }

    window.stopIaTurnPolling(turnId);
    state.turnMeta = Object.assign({}, state.turnMeta || {}, turnMeta || {});
    if (Array.isArray(events) && events.length) {
      state.events = events;
    }

    state.node.removeAttribute('data-live-turn-id');
    state.node.setAttribute('data-final-turn-id', turnId);
    delete window.iaLiveTurns[turnId];

    return window.populateAiMessageContent(
      state.node,
      state.contentContainer,
      text,
      useTypewriter,
      automationOptions,
      toolCalls,
      toolMeta,
      state.events || [],
      state.turnMeta || {}
    );
  };

  window.renderAgentEventsPanel = function (events, turnMeta, toolCalls) {
    if (!Array.isArray(events) || !events.length) return null;
    var hideDetailedToolEvents = Array.isArray(toolCalls) && toolCalls.length > 0;

    var totalMs = 0;
    events.forEach(function (event) {
      if (event && event.type === 'turn_summary' && event.meta && event.meta.total_duration_ms) {
        totalMs = Number(event.meta.total_duration_ms || 0);
      }
    });

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '8px';
    wrapper.style.marginBottom = '8px';
    wrapper.style.background = '#f3f4f6';
    wrapper.style.border = '1px solid #d1d5db';
    wrapper.style.borderRadius = '10px';
    wrapper.style.padding = '10px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.gap = '10px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid #d1d5db';

    const title = document.createElement('div');
    title.textContent = ((turnMeta && turnMeta.agent) === 'sara_tools' ? 'Sara' : 'Agente') + ' · ' + (totalMs > 0 ? window.formatCompletedIn(totalMs / 1000) : 'Trabajando...');
    title.style.color = '#111827';
    title.style.fontSize = '13px';
    title.style.fontWeight = '700';
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.style.color = '#4b5563';
    meta.style.fontSize = '11px';
    meta.style.textAlign = 'right';
    meta.textContent = turnMeta && turnMeta.turn_id ? String(turnMeta.turn_id) : '';
    header.appendChild(meta);
    wrapper.appendChild(header);

    const timeline = document.createElement('div');
    timeline.style.display = 'flex';
    timeline.style.flexDirection = 'column';
    timeline.style.gap = '6px';

    events.forEach(function (event) {
      if (!event || !event.type) return;
      if (event.type === 'assistant_message' || event.type === 'turn_summary') return;
      if (hideDetailedToolEvents && (event.type === 'tool_call_started' || event.type === 'tool_call_finished' || event.type === 'tool_call_failed')) return;

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'flex-start';
      row.style.gap = '8px';
      row.style.padding = '8px 10px';
      row.style.borderRadius = '8px';
      row.style.background = '#ffffff';
      row.style.border = '1px solid #e5e7eb';

      const icon = document.createElement('span');
      icon.style.fontSize = '13px';
      icon.style.lineHeight = '1.4';
      if (event.type.indexOf('tool_call_') === 0) {
        icon.textContent = '🛠️';
      } else if (event.type.indexOf('rag_step_') === 0) {
        icon.textContent = '📚';
      } else if (event.type === 'reasoning_step') {
        icon.textContent = '🧠';
      } else {
        icon.textContent = '•';
      }
      row.appendChild(icon);

      const body = document.createElement('div');
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.gap = '2px';
      body.style.flex = '1';

      const label = document.createElement('div');
      label.textContent = event.label || event.type;
      if (event.type === 'rag_step_failed') {
        label.textContent = 'Continuando sin contexto remoto';
      }
      label.style.color = '#111827';
      label.style.fontSize = '12px';
      label.style.fontWeight = '600';
      body.appendChild(label);

      const subtitle = document.createElement('div');
      subtitle.style.color = '#6b7280';
      subtitle.style.fontSize = '11px';
      if (event.type === 'tool_call_started' && event.meta && event.meta.tool_name) {
        subtitle.textContent = 'Iniciando tool ' + event.meta.tool_name;
      } else if (event.type === 'tool_call_finished' && event.meta && event.meta.duration_ms) {
        subtitle.textContent = 'Finalizada en ' + (Number(event.meta.duration_ms) / 1000).toFixed(1) + 's';
      } else if (event.type === 'tool_call_failed' && event.meta && event.meta.error) {
        subtitle.textContent = 'Error: ' + event.meta.error;
      } else if (event.type === 'rag_step_finished') {
        subtitle.textContent = 'Se recuperó contexto remoto para apoyar esta consulta.';
      } else if (event.type === 'rag_step_failed') {
        subtitle.textContent = 'La consulta siguió con datos operativos de CMPROYECTOSBIM.';
      } else if (event.meta && event.meta.query) {
        subtitle.textContent = event.meta.query;
      } else if (event.type === 'reasoning_step' && event.meta && event.meta.summary) {
        subtitle.textContent = event.meta.summary;
      }
      if (subtitle.textContent) {
        body.appendChild(subtitle);
      }

      row.appendChild(body);
      timeline.appendChild(row);
    });

    wrapper.appendChild(timeline);
    if (Array.isArray(toolCalls) && toolCalls.length) {
      var embeddedToolCallsPanel = window.renderToolCallsPanel(toolCalls, { embedded: true });
      if (embeddedToolCallsPanel) {
        wrapper.appendChild(embeddedToolCallsPanel);
      }
    }
    return wrapper;
  };

  window.renderToolCallsPanel = function (toolCalls, options) {
    if (!Array.isArray(toolCalls) || !toolCalls.length) return null;
    options = options || {};
    var workedSeconds = Number(options.workedSeconds || 0);
    var embedded = options.embedded === true;

    const panel = document.createElement('div');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '8px';
    panel.style.marginTop = embedded ? '4px' : '0';
    panel.style.marginBottom = embedded ? '0' : '8px';

    toolCalls.forEach(function (call) {
      const details = document.createElement('details');
      details.style.background = embedded ? '#ffffff' : '#f3f4f6';
      details.style.border = '1px solid #d1d5db';
      details.style.borderRadius = '10px';
      details.style.padding = embedded ? '0' : '8px 10px';
      details.style.overflow = 'hidden';
      details.style.boxShadow = embedded ? 'none' : '0 1px 2px rgba(15,23,42,0.06)';

      const summary = document.createElement('summary');
      summary.style.cursor = 'pointer';
      summary.style.listStyle = 'none';
      summary.style.display = 'flex';
      summary.style.alignItems = 'center';
      summary.style.justifyContent = 'space-between';
      summary.style.gap = '12px';
      summary.style.outline = 'none';
      summary.style.color = '#111827';
      summary.style.background = '#ffffff';
      summary.style.border = '1px solid #d1d5db';
      summary.style.borderRadius = '8px';
      summary.style.padding = '8px 10px';
      summary.style.margin = embedded ? '0' : '-2px -4px 0 -4px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const title = document.createElement('span');
      var success = call && call.result && call.result.success;
      title.textContent = '🛠️ Tool Call: ' + ((call && call.name) ? String(call.name) : 'tool');
      title.style.color = '#111827';
      title.style.fontSize = '13px';
      title.style.fontWeight = '600';
      title.style.letterSpacing = '0.01em';
      left.appendChild(title);

      const badge = document.createElement('span');
      badge.textContent = success ? window.formatWorkedFor(workedSeconds) : 'Review';
      badge.style.color = success ? '#065f46' : '#92400e';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '600';
      badge.style.background = success ? '#d1fae5' : '#fef3c7';
      badge.style.border = success ? '1px solid #a7f3d0' : '1px solid #fde68a';
      badge.style.borderRadius = '999px';
      badge.style.padding = '2px 8px';

      summary.appendChild(left);
      summary.appendChild(badge);
      details.appendChild(summary);

      const content = document.createElement('div');
      content.style.marginTop = '10px';
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.gap = '10px';

      const inputBlock = document.createElement('div');
      const inputLabel = document.createElement('div');
      inputLabel.textContent = 'Input:';
      inputLabel.style.color = '#374151';
      inputLabel.style.fontSize = '12px';
      inputLabel.style.fontWeight = '600';
      inputLabel.style.marginBottom = '4px';
      inputBlock.appendChild(inputLabel);

      const inputPre = document.createElement('pre');
      inputPre.textContent = JSON.stringify((call && call.arguments) || {}, null, 2);
      inputPre.style.margin = '0';
      inputPre.style.padding = '8px';
      inputPre.style.background = '#ffffff';
      inputPre.style.border = '1px solid #d1d5db';
      inputPre.style.borderRadius = '8px';
      inputPre.style.color = '#111827';
      inputPre.style.fontSize = '12px';
      inputPre.style.lineHeight = '1.45';
      inputPre.style.whiteSpace = 'pre-wrap';
      inputPre.style.wordBreak = 'break-word';
      inputPre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      inputBlock.appendChild(inputPre);

      const outputBlock = document.createElement('div');
      const outputLabel = document.createElement('div');
      outputLabel.textContent = 'Output:';
      outputLabel.style.color = '#374151';
      outputLabel.style.fontSize = '12px';
      outputLabel.style.fontWeight = '600';
      outputLabel.style.marginBottom = '4px';
      outputBlock.appendChild(outputLabel);

      const outputPre = document.createElement('pre');
      outputPre.textContent = JSON.stringify((call && call.result) || {}, null, 2);
      outputPre.style.margin = '0';
      outputPre.style.padding = '8px';
      outputPre.style.background = '#ffffff';
      outputPre.style.border = '1px solid #d1d5db';
      outputPre.style.borderRadius = '8px';
      outputPre.style.color = '#111827';
      outputPre.style.fontSize = '12px';
      outputPre.style.lineHeight = '1.45';
      outputPre.style.whiteSpace = 'pre-wrap';
      outputPre.style.wordBreak = 'break-word';
      outputPre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      outputBlock.appendChild(outputPre);

      content.appendChild(inputBlock);
      content.appendChild(outputBlock);
      details.appendChild(content);
      panel.appendChild(details);
    });

    return panel;
  };

  window.addAiMessage = function (text, useTypewriter, automationOptions, toolCalls, toolMeta) {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return;

    // Por defecto, usar typewriter
    if (useTypewriter === undefined) useTypewriter = true;

    // Contenedor del mensaje estilo ChatGPT
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.gap = '12px';
    messageContainer.style.alignItems = 'flex-start';
    messageContainer.style.padding = '12px';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.transition = 'background 0.15s ease';


    // Contenedor de texto y botones
    const contentContainer = document.createElement('div');
    contentContainer.style.flex = '1';
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.gap = '8px';

    const toolCallsPanel = window.renderToolCallsPanel(toolCalls, toolMeta);
    if (toolCallsPanel) {
      contentContainer.appendChild(toolCallsPanel);
    }

    // Texto del mensaje oscuro
    const messageText = document.createElement('div');
    messageText.style.color = '#ececec';
    messageText.style.fontSize = '14px';
    messageText.style.lineHeight = '1.6';
    messageText.style.paddingTop = '2px';
    messageText.style.whiteSpace = 'pre-wrap';
    messageText.style.wordBreak = 'break-word';
    messageText.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    messageText.id = 'ai-message-' + Date.now();

    const optionButtonsContainer = document.createElement('div');
    optionButtonsContainer.style.display = 'none';
    optionButtonsContainer.style.flexWrap = 'wrap';
    optionButtonsContainer.style.gap = '8px';
    optionButtonsContainer.style.marginTop = '4px';
    optionButtonsContainer.className = 'ia-option-buttons';

    function triggerAutomationPlan(plan) {
      const project = window.selectedProject;
      if (!project || !project.id) {
        window.addAiMessage('Selecciona un proyecto antes de iniciar la automatización.', false);
        return;
      }

      const payload = {
        plan_id: plan.id,
        project_id: project.id
      };

      optionButtonsContainer.style.pointerEvents = 'none';
      optionButtonsContainer.style.opacity = '0.6';

      fetch('/ia_colaborativa/automation_flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.getCsrfToken()
        },
        body: JSON.stringify(payload)
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          var message = data.message || (data.success ? 'Automatización iniciada.' : 'No fue posible iniciar la automatización.');
          window.addAiMessage(message, false);
          if (!data.success) {
            console.error('Automation flow error:', data.error);
          }
        })
        .catch(function (error) {
          console.error('Automation flow failed:', error);
          window.addAiMessage('No se pudo iniciar la automatización. Revisa la consola.', false);
        })
        .finally(function () {
          optionButtonsContainer.style.pointerEvents = 'auto';
          optionButtonsContainer.style.opacity = '1';
        });
    }

    function createAutomationOptionButton(option) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.textContent = option.name;
      optionButton.style.border = '1px solid #5B46E5';
      optionButton.style.background = 'transparent';
      optionButton.style.color = '#cbd5f5';
      optionButton.style.padding = '6px 12px';
      optionButton.style.borderRadius = '6px';
      optionButton.style.cursor = 'pointer';
      optionButton.style.fontSize = '13px';
      optionButton.style.fontWeight = '600';
      optionButton.style.transition = 'all 0.15s ease';
      optionButton.onmouseover = function () {
        optionButton.style.background = '#5B46E5';
        optionButton.style.color = '#fff';
      };
      optionButton.onmouseout = function () {
        optionButton.style.background = 'transparent';
        optionButton.style.color = '#cbd5f5';
      };
      optionButton.onclick = function () {
        triggerAutomationPlan(option);
      };
      return optionButton;
    }

    if (Array.isArray(automationOptions) && automationOptions.length) {
      automationOptions.forEach(function (option) {
        optionButtonsContainer.appendChild(createAutomationOptionButton(option));
      });
    }

    // Botones de acción (reload y copiar) - ocultos inicialmente
    const actionsContainer = document.createElement('div');
    actionsContainer.style.display = 'none';
    actionsContainer.style.gap = '8px';
    actionsContainer.style.marginTop = '4px';

    // Botón reload estilo ChatGPT oscuro
    const reloadBtn = document.createElement('button');
    reloadBtn.innerHTML = '↻';
    reloadBtn.style.background = 'transparent';
    reloadBtn.style.border = 'none';
    reloadBtn.style.color = '#8e8ea0';
    reloadBtn.style.padding = '6px 8px';
    reloadBtn.style.borderRadius = '6px';
    reloadBtn.style.cursor = 'pointer';
    reloadBtn.style.fontSize = '16px';
    reloadBtn.style.transition = 'all 0.15s ease';
    reloadBtn.title = 'Regenerar respuesta';
    reloadBtn.onmouseover = function () {
      this.style.background = '#2f2f2f';
      this.style.color = '#ececec';
    };
    reloadBtn.onmouseout = function () {
      this.style.background = 'transparent';
      this.style.color = '#8e8ea0';
    };
    reloadBtn.onclick = function () {
      alert('Función de regenerar en desarrollo');
    };

    // Botón copiar estilo ChatGPT oscuro
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '📋';
    copyBtn.style.background = 'transparent';
    copyBtn.style.border = 'none';
    copyBtn.style.color = '#8e8ea0';
    copyBtn.style.padding = '6px 8px';
    copyBtn.style.borderRadius = '6px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.fontSize = '14px';
    copyBtn.style.transition = 'all 0.15s ease';
    copyBtn.title = 'Copiar respuesta';
    copyBtn.onmouseover = function () {
      this.style.background = '#2f2f2f';
      this.style.color = '#ececec';
    };
    copyBtn.onmouseout = function () {
      this.style.background = 'transparent';
      this.style.color = '#8e8ea0';
    };
    copyBtn.onclick = function () {
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.innerHTML = '✓';
        setTimeout(function () { copyBtn.innerHTML = '📋'; }, 2000);
      }).catch(function () {
        alert('No se pudo copiar el texto');
      });
    };

    actionsContainer.appendChild(reloadBtn);
    actionsContainer.appendChild(copyBtn);

    const responsePanel = document.createElement('div');
    responsePanel.style.display = 'flex';
    responsePanel.style.flexDirection = 'column';
    responsePanel.style.gap = '8px';

    responsePanel.appendChild(messageText);
    responsePanel.appendChild(optionButtonsContainer);
    responsePanel.appendChild(actionsContainer);

    contentContainer.appendChild(responsePanel);

    messageContainer.appendChild(contentContainer);
    list.appendChild(messageContainer);

    // Aplicar efecto typewriter o mostrar directamente
    function revealExtras() {
      if (optionButtonsContainer.children.length) {
        optionButtonsContainer.style.display = 'flex';
      }
      actionsContainer.style.display = 'flex';

      // Ejecutar callbacks diferidos (ej. botones de work_packages) después del typewriter
      var callbacks = messageContainer.__onRevealCallbacks || [];
      callbacks.forEach(function (fn) {
        try { fn && fn(); } catch (err) { console.error('[IA chat] error en callback onReveal:', err); }
      });
      messageContainer.__onRevealCallbacks = [];

      window.changeSendButtonToNormal();
    }

    var summary = window.parseBimSummary && window.parseBimSummary(text);
    if (summary) {
      messageText.innerHTML = window.renderBimSummaryCard(summary);
      revealExtras();
    } else if (useTypewriter) {
      window.typewriterEffect(messageText, text, 5, function () {
        revealExtras();
      });
    } else {
      messageText.innerHTML = window.formatMarkdown(text);
      revealExtras();
    }

    // Auto-scroll solo si el usuario está cerca del final
    var isNearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 100;
    if (isNearBottom) {
      list.scrollTop = list.scrollHeight;
    }

    // Exponer el contenedor del mensaje para acciones adicionales
    return messageContainer;
  };


  // Botones estáticos para la intención work_packages (solo visuales por ahora)
  window.renderWorkPackageIntentButtons = function (messageContainer) {
    if (!messageContainer) return;

    var host = messageContainer.querySelector('.ia-option-buttons');
    host = host ? host.parentElement : messageContainer;

    var existing = messageContainer.querySelector('.ia-work-packages-static-buttons');
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }

    var container = document.createElement('div');
    container.className = 'ia-work-packages-static-buttons';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '8px';
    container.style.marginTop = '6px';

    ['Planificación y Avance', 'Costos', 'Involucrados', 'Indicadores (KPIs)'].forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.border = '1px solid #444b66';
      btn.style.background = 'rgba(68, 75, 102, 0.18)';
      btn.style.color = '#ececec';
      btn.style.padding = '6px 12px';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'default';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '600';
      btn.onmouseenter = function () {
        btn.style.background = 'rgba(91, 70, 229, 0.18)';
        btn.style.borderColor = '#5B46E5';
      };
      btn.onmouseleave = function () {
        btn.style.background = 'rgba(68, 75, 102, 0.18)';
        btn.style.borderColor = '#444b66';
      };
      btn.onclick = function () {
        // Evitar clics múltiples
        if (btn.dataset.clicked === 'true') return;
        btn.dataset.clicked = 'true';
        btn.style.opacity = '0.6';
        btn.style.pointerEvents = 'none';
        btn.style.transform = 'scale(0.98)';

        var input = document.getElementById('ia-chat-input');
        var form = document.getElementById('ia-chat-form');

        if (label === 'Planificación y Avance') {
          window.iaForcedIntent = 'planning';
          if (input && (!input.value || !input.value.trim())) {
            input.value = 'Planificación y avance de paquetes de trabajo';
          }
        } else if (label === 'Costos') {
          window.iaForcedIntent = 'costos';
          if (input && (!input.value || !input.value.trim())) {
            input.value = 'Costos y presupuesto de paquetes de trabajo';
          }
        } else if (label === 'Involucrados') {
          window.iaForcedIntent = 'involucrados';
          if (input && (!input.value || !input.value.trim())) {
            input.value = 'Involucrados y equipo en los paquetes de trabajo';
          }
        } else if (label === 'Indicadores (KPIs)') {
          var project = window.selectedProject || {};
          if (!project.id) {
            alert('Selecciona un proyecto antes de generar Indicadores (KPIs).');
            btn.dataset.clicked = 'false';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.transform = 'none';
            return;
          }

          var payload = {
            project_id: project.id,
            project_name: project.name
          };

          fetch(buildIaColabUrl('/ia_colaborativa/kpi_report'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': window.getCsrfToken()
            },
            body: JSON.stringify(payload)
          })
            .then(function (response) { return response.json(); })
            .then(function (data) {
              if (data && data.success && data.html) {
                var blob = new Blob([data.html], { type: 'text/html' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'indicadores_kpi_' + project.id + '.html';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } else {
                alert('No se pudo generar el reporte de KPIs: ' + (data && data.error ? data.error : 'Respuesta inválida.'));
              }
            })
            .catch(function (error) {
              console.error('Error al generar KPIs:', error);
              alert('Error al generar el reporte de KPIs. Revisa la consola para más detalles.');
            })
            .finally(function () {
              btn.dataset.clicked = 'false';
              btn.style.opacity = '1';
              btn.style.pointerEvents = 'auto';
              btn.style.transform = 'none';
            });
          return;
        } else {
          console.log('[Work packages] Botón pulsado:', label);
        }

        if (form && window.iaForcedIntent) {
          var event = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        }
      };
      container.appendChild(btn);
    });

    host.appendChild(container);
  };

  window.addTypingIndicator = function () {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return null;

    // Contenedor del mensaje
    const messageContainer = document.createElement('div');
    messageContainer.id = 'ia-typing-' + Date.now();
    messageContainer.style.display = 'flex';
    messageContainer.style.gap = '12px';
    messageContainer.style.alignItems = 'flex-start';
    messageContainer.style.padding = '12px';

    // Texto "SaraIA inteligencia artificial colaborativa está escribiendo..." estilo ChatGPT oscuro con efecto typewriter
    const typingText = document.createElement('div');
    typingText.style.color = '#8e8ea0';
    typingText.style.fontSize = '14px';
    typingText.style.fontStyle = 'normal';
    typingText.style.paddingTop = '2px';
    typingText.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    typingText.style.display = 'flex';
    typingText.style.alignItems = 'center';
    typingText.style.gap = '8px';

    const dotsWrapper = document.createElement('div');
    dotsWrapper.style.display = 'flex';
    dotsWrapper.style.alignItems = 'center';
    dotsWrapper.innerHTML =
      '<svg width="42" height="24" viewBox="0 0 42 24" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMid meet">' +
        '<style>.typing-dot { fill: #6D8FFF; }</style>' +
        '<g transform="translate(2, 4)">' +
          '<circle class="typing-dot" cx="0" cy="10" r="4">' +
            '<animate attributeName="cy" values="10;4;10" dur="0.6s" begin="0s" repeatCount="indefinite" />' +
            '<animate attributeName="opacity" values="0.2;1;0.2" dur="0.6s" begin="0s" repeatCount="indefinite" />' +
          '</circle>' +
          '<circle class="typing-dot" cx="14" cy="10" r="4">' +
            '<animate attributeName="cy" values="10;4;10" dur="0.6s" begin="0.15s" repeatCount="indefinite" />' +
            '<animate attributeName="opacity" values="0.2;1;0.2" dur="0.6s" begin="0.15s" repeatCount="indefinite" />' +
          '</circle>' +
          '<circle class="typing-dot" cx="28" cy="10" r="4">' +
            '<animate attributeName="cy" values="10;4;10" dur="0.6s" begin="0.3s" repeatCount="indefinite" />' +
            '<animate attributeName="opacity" values="0.2;1;0.2" dur="0.6s" begin="0.3s" repeatCount="indefinite" />' +
          '</circle>' +
        '</g>' +
      '</svg>';

    const typingSpan = document.createElement('span');
    typingSpan.style.color = '#ececec';
    typingSpan.style.fontWeight = '500';
    typingSpan.style.whiteSpace = 'nowrap';

    typingText.appendChild(dotsWrapper);
    typingText.appendChild(typingSpan);

    var typingPhrases = [
      'SaraIA colaborativa está escribiendo...',
      'SaraIA colaborativa está analizando el CDE…',
      'SaraIA colaborativa está cargando creatividad…',
      'SaraIA colaborativa está ordenando datos…',
      'SaraIA colaborativa está procesando ideas…',
      'SaraIA colaborativa está afinando detalles…'
    ];

    // Animación de escritura cíclica
    messageContainer.__typingTimers = [];
    function trackTimeout(fn, delay) {
      var id = setTimeout(fn, delay);
      messageContainer.__typingTimers.push(id);
      return id;
    }

    function typePhrase(index) {
      var phrase = typingPhrases[index];
      var pos = 0;
      typingSpan.textContent = '';

      function step() {
        typingSpan.textContent = phrase.slice(0, pos);
        pos++;
        if (pos <= phrase.length) {
          trackTimeout(step, 45);
        } else {
          trackTimeout(function () {
            var next = (index + 1) % typingPhrases.length;
            typePhrase(next);
          }, 1200);
        }
      }
      trackTimeout(step, 45);
    }

    typePhrase(0);

    messageContainer.appendChild(typingText);
    list.appendChild(messageContainer);

    // Auto-scroll solo si el usuario está cerca del final
    var isNearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 100;
    if (isNearBottom) {
      list.scrollTop = list.scrollHeight;
    }

    return messageContainer.id;
  };

  window.addToolActivityIndicator = function () {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return null;

    ensureToolCallSpinnerStyles();

    const container = document.createElement('div');
    container.id = 'ia-tool-activity-' + Date.now();
    container.style.display = 'flex';
    container.style.gap = '12px';
    container.style.alignItems = 'flex-start';
    container.style.padding = '8px 12px 12px 12px';
    container.style.opacity = '0.95';
    container.style.transition = 'opacity 0.25s ease';

    const card = document.createElement('div');
    card.style.background = 'rgba(36, 41, 46, 0.92)';
    card.style.border = '1px solid rgba(109, 143, 255, 0.25)';
    card.style.borderRadius = '10px';
    card.style.padding = '10px 12px';
    card.style.minWidth = '240px';
    card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '8px';
    header.style.marginBottom = '8px';

    const spinner = document.createElement('div');
    spinner.className = 'ia-toolcall-spinner';
    header.appendChild(spinner);

    const title = document.createElement('div');
    title.textContent = '🛠️ Tool Call: pending';
    title.style.color = '#111827';
    title.style.fontSize = '13px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.01em';
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.textContent = window.formatWorkedFor(0);
    badge.style.color = '#92400e';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '600';
    badge.style.background = '#fef3c7';
    badge.style.border = '1px solid #fde68a';
    badge.style.borderRadius = '999px';
    badge.style.padding = '2px 8px';
    header.appendChild(badge);

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '6px';

    const lines = [
      'Consultando contexto remoto',
      'Analizando que herramienta usar',
      'Preparando lectura del CDE',
      'Validando datos de la consulta'
    ];

    lines.forEach(function (text, index) {
      const row = document.createElement('div');
      row.textContent = text;
      row.style.color = index === 0 ? '#cbd5e1' : '#94a3b8';
      row.style.fontSize = '12px';
      row.style.transition = 'color 0.2s ease';
      row.setAttribute('data-tool-activity-row', String(index));
      body.appendChild(row);
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
    list.appendChild(container);

    container.__toolRows = body.querySelectorAll('[data-tool-activity-row]');
    container.__toolRowIndex = 0;
    container.__toolTimers = [];
    container.__startedAt = Date.now();
    container.__toolBadge = badge;
    container.__toolTitle = title;

    function schedule(fn, delay) {
      var timer = setTimeout(fn, delay);
      container.__toolTimers.push(timer);
      return timer;
    }

    function tick() {
      if (!container.__toolRows || !container.__toolRows.length) return;
      if (container.__toolBadge && container.__startedAt) {
        var elapsed = (Date.now() - container.__startedAt) / 1000;
        container.__toolBadge.textContent = window.formatWorkedFor(elapsed);
      }
      container.__toolRows.forEach(function (row, idx) {
        row.style.color = idx === container.__toolRowIndex ? '#e5e7eb' : '#94a3b8';
      });
      container.__toolRowIndex = (container.__toolRowIndex + 1) % container.__toolRows.length;
      schedule(tick, 900);
    }

    tick();
    list.scrollTop = list.scrollHeight;
    return container.id;
  };

  window.finalizeToolActivityIndicator = function (id, toolCalls) {
    if (!id) return;
    const indicator = document.getElementById(id);
    if (!indicator) return;

    if (indicator.__toolTimers && indicator.__toolTimers.length) {
      indicator.__toolTimers.forEach(function (t) { clearTimeout(t); });
      indicator.__toolTimers = [];
    }

    var calls = Array.isArray(toolCalls) ? toolCalls : [];
    var workedSeconds = indicator.__startedAt ? ((Date.now() - indicator.__startedAt) / 1000) : 0;
    var panel = window.renderToolCallsPanel(calls, { workedSeconds: workedSeconds });
    if (panel) {
      indicator.innerHTML = '';
      indicator.appendChild(panel);
      return;
    }

    const card = indicator.firstChild;
    if (!card) return;
    const body = card.lastChild;
    if (!body) return;
    body.innerHTML = '';
    var emptyRow = document.createElement('div');
    emptyRow.textContent = 'Sin tools ejecutadas en esta respuesta';
    emptyRow.style.color = '#94a3b8';
    emptyRow.style.fontSize = '12px';
    body.appendChild(emptyRow);
  };

  window.removeToolActivityIndicator = function (id) {
    if (!id) return;
    const indicator = document.getElementById(id);
    if (!indicator) return;

    if (indicator.__toolTimers && indicator.__toolTimers.length) {
      indicator.__toolTimers.forEach(function (t) { clearTimeout(t); });
    }

    indicator.style.opacity = '0';
    setTimeout(function () {
      if (indicator && indicator.parentElement) {
        indicator.parentElement.removeChild(indicator);
      }
    }, 220);
  };

  // Override orientado a timeline de agente para Sara.
  window.renderToolCallsPanel = function (toolCalls, options) {
    if (!Array.isArray(toolCalls) || !toolCalls.length) return null;
    options = options || {};
    var workedSeconds = Number(options.workedSeconds || 0);
    var embedded = options.embedded === true;

    const panel = document.createElement('div');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '8px';
    panel.style.marginTop = embedded ? '4px' : '0';
    panel.style.marginBottom = embedded ? '0' : '8px';

    toolCalls.forEach(function (call) {
      const details = document.createElement('details');
      details.style.background = embedded ? '#ffffff' : '#f3f4f6';
      details.style.border = '1px solid #d1d5db';
      details.style.borderRadius = '10px';
      details.style.padding = embedded ? '0' : '8px 10px';
      details.style.overflow = 'hidden';
      details.style.boxShadow = embedded ? 'none' : '0 1px 2px rgba(15,23,42,0.06)';

      const summary = document.createElement('summary');
      summary.style.cursor = 'pointer';
      summary.style.listStyle = 'none';
      summary.style.display = 'flex';
      summary.style.alignItems = 'center';
      summary.style.justifyContent = 'space-between';
      summary.style.gap = '12px';
      summary.style.outline = 'none';
      summary.style.color = '#111827';
      summary.style.background = '#ffffff';
      summary.style.border = '1px solid #d1d5db';
      summary.style.borderRadius = '8px';
      summary.style.padding = '8px 10px';
      summary.style.margin = embedded ? '0' : '-2px -4px 0 -4px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const title = document.createElement('span');
      var success = call && call.result && call.result.success;
      title.textContent = '🛠️ Herramienta: ' + ((call && (call.display_name || call.name)) ? String(call.display_name || call.name) : 'tool');
      title.style.color = '#111827';
      title.style.fontSize = '13px';
      title.style.fontWeight = '600';
      title.style.letterSpacing = '0.01em';
      left.appendChild(title);

      const badge = document.createElement('span');
      var durationSeconds = call && call.duration_ms ? (Number(call.duration_ms) / 1000) : workedSeconds;
      badge.textContent = success ? window.formatCompletedIn(durationSeconds) : 'Revisar';
      badge.style.color = success ? '#065f46' : '#92400e';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '600';
      badge.style.background = success ? '#d1fae5' : '#fef3c7';
      badge.style.border = success ? '1px solid #a7f3d0' : '1px solid #fde68a';
      badge.style.borderRadius = '999px';
      badge.style.padding = '2px 8px';

      summary.appendChild(left);
      summary.appendChild(badge);
      details.appendChild(summary);

      const content = document.createElement('div');
      content.style.marginTop = '10px';
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.gap = '10px';

      const inputBlock = document.createElement('div');
      const inputLabel = document.createElement('div');
      inputLabel.textContent = 'Input:';
      inputLabel.style.color = '#374151';
      inputLabel.style.fontSize = '12px';
      inputLabel.style.fontWeight = '600';
      inputLabel.style.marginBottom = '4px';
      inputBlock.appendChild(inputLabel);

      const inputPre = document.createElement('pre');
      inputPre.textContent = JSON.stringify((call && call.arguments) || {}, null, 2);
      inputPre.style.margin = '0';
      inputPre.style.padding = '8px';
      inputPre.style.background = '#ffffff';
      inputPre.style.border = '1px solid #d1d5db';
      inputPre.style.borderRadius = '8px';
      inputPre.style.color = '#111827';
      inputPre.style.fontSize = '12px';
      inputPre.style.lineHeight = '1.45';
      inputPre.style.whiteSpace = 'pre-wrap';
      inputPre.style.wordBreak = 'break-word';
      inputPre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      inputBlock.appendChild(inputPre);

      const outputBlock = document.createElement('div');
      const outputLabel = document.createElement('div');
      outputLabel.textContent = 'Output:';
      outputLabel.style.color = '#374151';
      outputLabel.style.fontSize = '12px';
      outputLabel.style.fontWeight = '600';
      outputLabel.style.marginBottom = '4px';
      outputBlock.appendChild(outputLabel);

      const outputPre = document.createElement('pre');
      outputPre.textContent = JSON.stringify((call && call.result) || {}, null, 2);
      outputPre.style.margin = '0';
      outputPre.style.padding = '8px';
      outputPre.style.background = '#ffffff';
      outputPre.style.border = '1px solid #d1d5db';
      outputPre.style.borderRadius = '8px';
      outputPre.style.color = '#111827';
      outputPre.style.fontSize = '12px';
      outputPre.style.lineHeight = '1.45';
      outputPre.style.whiteSpace = 'pre-wrap';
      outputPre.style.wordBreak = 'break-word';
      outputPre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      outputBlock.appendChild(outputPre);

      content.appendChild(inputBlock);
      content.appendChild(outputBlock);
      details.appendChild(content);
      panel.appendChild(details);
    });

    return panel;
  };

  window.addToolActivityIndicator = function () {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return null;

    ensureToolCallSpinnerStyles();

    const container = document.createElement('div');
    container.id = 'ia-tool-activity-' + Date.now();
    container.style.display = 'flex';
    container.style.gap = '12px';
    container.style.alignItems = 'flex-start';
    container.style.padding = '8px 12px 12px 12px';
    container.style.opacity = '0.95';
    container.style.transition = 'opacity 0.25s ease';

    const card = document.createElement('div');
    card.style.background = '#f3f4f6';
    card.style.border = '1px solid #d1d5db';
    card.style.borderRadius = '10px';
    card.style.padding = '10px 12px';
    card.style.minWidth = '240px';
    card.style.boxShadow = '0 1px 2px rgba(15,23,42,0.06)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '8px';
    header.style.marginBottom = '8px';

    const spinner = document.createElement('div');
    spinner.className = 'ia-toolcall-spinner';
    header.appendChild(spinner);

    const title = document.createElement('div');
    title.textContent = '🛠️ Tool Call: pending';
    title.style.color = '#111827';
    title.style.fontSize = '13px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.01em';
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.textContent = window.formatWorkedFor(0);
    badge.style.color = '#92400e';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '600';
    badge.style.background = '#fef3c7';
    badge.style.border = '1px solid #fde68a';
    badge.style.borderRadius = '999px';
    badge.style.padding = '2px 8px';
    header.appendChild(badge);

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '6px';

    [
      'Analizando la solicitud',
      'Consultando contexto remoto',
      'Evaluando la siguiente tool',
      'Preparando ejecucion en el CDE'
    ].forEach(function (text, index) {
      const row = document.createElement('div');
      row.textContent = text;
      row.style.color = index === 0 ? '#374151' : '#6b7280';
      row.style.fontSize = '12px';
      row.style.transition = 'color 0.2s ease';
      row.setAttribute('data-tool-activity-row', String(index));
      body.appendChild(row);
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
    list.appendChild(container);

    container.__toolRows = body.querySelectorAll('[data-tool-activity-row]');
    container.__toolRowIndex = 0;
    container.__toolTimers = [];
    container.__startedAt = Date.now();
    container.__toolBadge = badge;
    container.__toolTitle = title;

    function schedule(fn, delay) {
      var timer = setTimeout(fn, delay);
      container.__toolTimers.push(timer);
      return timer;
    }

    function tick() {
      if (!container.__toolRows || !container.__toolRows.length) return;
      if (container.__toolBadge && container.__startedAt) {
        var elapsed = (Date.now() - container.__startedAt) / 1000;
        container.__toolBadge.textContent = window.formatWorkedFor(elapsed);
      }
      container.__toolRows.forEach(function (row, idx) {
        row.style.color = idx === container.__toolRowIndex ? '#111827' : '#6b7280';
      });
      container.__toolRowIndex = (container.__toolRowIndex + 1) % container.__toolRows.length;
      schedule(tick, 900);
    }

    tick();
    list.scrollTop = list.scrollHeight;
    return container.id;
  };

  window.populateAiMessageContent = function (messageContainer, contentContainer, text, useTypewriter, automationOptions, toolCalls, toolMeta, events, turnMeta) {
    if (!messageContainer || !contentContainer) return null;
    if (useTypewriter === undefined) useTypewriter = true;

    contentContainer.innerHTML = '';
    const eventsPanel = window.renderAgentEventsPanel(events, turnMeta, toolCalls);
    if (eventsPanel) {
      contentContainer.appendChild(eventsPanel);
    }

    const toolCallsPanel = !eventsPanel ? window.renderToolCallsPanel(toolCalls, toolMeta) : null;
    if (toolCallsPanel) {
      contentContainer.appendChild(toolCallsPanel);
    }

    const messageText = document.createElement('div');
    messageText.style.color = '#ececec';
    messageText.style.fontSize = '14px';
    messageText.style.lineHeight = '1.6';
    messageText.style.paddingTop = '2px';
    messageText.style.whiteSpace = 'pre-wrap';
    messageText.style.wordBreak = 'break-word';
    messageText.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    messageText.id = 'ai-message-' + Date.now();

    const optionButtonsContainer = document.createElement('div');
    optionButtonsContainer.style.display = 'none';
    optionButtonsContainer.style.flexWrap = 'wrap';
    optionButtonsContainer.style.gap = '8px';
    optionButtonsContainer.style.marginTop = '4px';
    optionButtonsContainer.className = 'ia-option-buttons';

    function triggerAutomationPlan(plan) {
      const project = window.selectedProject;
      if (!project || !project.id) {
        window.addAiMessage('Selecciona un proyecto antes de iniciar la automatización.', false);
        return;
      }

      const payload = {
        plan_id: plan.id,
        project_id: project.id
      };

      optionButtonsContainer.style.pointerEvents = 'none';
      optionButtonsContainer.style.opacity = '0.6';

      fetch('/ia_colaborativa/automation_flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.getCsrfToken()
        },
        body: JSON.stringify(payload)
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          var message = data.message || (data.success ? 'Automatización iniciada.' : 'No fue posible iniciar la automatización.');
          window.addAiMessage(message, false);
          if (!data.success) {
            console.error('Automation flow error:', data.error);
          }
        })
        .catch(function (error) {
          console.error('Automation flow failed:', error);
          window.addAiMessage('No se pudo iniciar la automatización. Revisa la consola.', false);
        })
        .finally(function () {
          optionButtonsContainer.style.pointerEvents = 'auto';
          optionButtonsContainer.style.opacity = '1';
        });
    }

    function createAutomationOptionButton(option) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.textContent = option.name;
      optionButton.style.border = '1px solid #5B46E5';
      optionButton.style.background = 'transparent';
      optionButton.style.color = '#cbd5f5';
      optionButton.style.padding = '6px 12px';
      optionButton.style.borderRadius = '6px';
      optionButton.style.cursor = 'pointer';
      optionButton.style.fontSize = '13px';
      optionButton.style.fontWeight = '600';
      optionButton.style.transition = 'all 0.15s ease';
      optionButton.onmouseover = function () {
        optionButton.style.background = '#5B46E5';
        optionButton.style.color = '#fff';
      };
      optionButton.onmouseout = function () {
        optionButton.style.background = 'transparent';
        optionButton.style.color = '#cbd5f5';
      };
      optionButton.onclick = function () {
        triggerAutomationPlan(option);
      };
      return optionButton;
    }

    if (Array.isArray(automationOptions) && automationOptions.length) {
      automationOptions.forEach(function (option) {
        optionButtonsContainer.appendChild(createAutomationOptionButton(option));
      });
    }

    contentContainer.appendChild(messageText);
    if (Array.isArray(automationOptions) && automationOptions.length) {
      optionButtonsContainer.style.display = 'flex';
      contentContainer.appendChild(optionButtonsContainer);
    }

    function onRevealDone() {
      window.changeSendButtonToNormal();
      if (messageContainer.__onRevealCallbacks && messageContainer.__onRevealCallbacks.length) {
        messageContainer.__onRevealCallbacks.forEach(function (fn) {
          try { fn(); } catch (e) {}
        });
      }
    }

    if (useTypewriter) {
      window.typewriterEffect(messageText, text || '', 8, onRevealDone);
    } else {
      messageText.innerHTML = window.formatMarkdown(text || '');
      onRevealDone();
    }

    const list = document.getElementById('ia-chat-messages');
    list.scrollTop = list.scrollHeight;
    return messageContainer;
  };

  window.addAiMessage = function (text, useTypewriter, automationOptions, toolCalls, toolMeta, events, turnMeta) {
    const list = document.getElementById('ia-chat-messages');
    if (!list) return;
    if (useTypewriter === undefined) useTypewriter = true;

    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.gap = '12px';
    messageContainer.style.alignItems = 'flex-start';
    messageContainer.style.padding = '12px';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.transition = 'background 0.15s ease';

    const contentContainer = document.createElement('div');
    contentContainer.style.flex = '1';
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.gap = '8px';

    messageContainer.appendChild(contentContainer);
    list.appendChild(messageContainer);

    return window.populateAiMessageContent(
      messageContainer,
      contentContainer,
      text,
      useTypewriter,
      automationOptions,
      toolCalls,
      toolMeta,
      events,
      turnMeta
    );
  };

  window.removeTypingIndicator = function (id) {
    if (!id) return;
    const indicator = document.getElementById(id);
    if (indicator) {
      if (indicator.__typingTimers && indicator.__typingTimers.length) {
        indicator.__typingTimers.forEach(function (t) { clearTimeout(t); });
      }
      indicator.remove();
    }
  };

  window.getCsrfToken = function () {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  };

  // Extraer información del usuario actual en sesión
  window.extractCurrentUser = function () {
    try {
      const principalElement = document.querySelector('opce-principal[data-principal]');
      if (!principalElement) {
        console.warn('⚠️ No se encontró elemento opce-principal con data-principal');
        return null;
      }

      const principalData = principalElement.getAttribute('data-principal');
      if (!principalData) {
        console.warn('⚠️ Atributo data-principal está vacío');
        return null;
      }

      const principal = JSON.parse(principalData);

      return {
        id: principal.id,
        name: principal.name,
        href: principal.href
      };
    } catch (error) {
      console.error('❌ Error al extraer usuario en sesión:', error);
      return null;
    }
  };

  // Cargar datos de debug
  window.loadDebugData = function () {
    const debugContent = document.getElementById('ia-debug-content');
    if (!debugContent) return;

    if (!window.debugLoggingEnabled) {
      debugContent.innerHTML = '<p style="margin:0; color:#ef4444;">El registro detallado está desactivado.</p>';
      return;
    }

    debugContent.innerHTML = '<p style="margin: 0; color: #8e8ea0;">Cargando...</p>';

    fetch('/ia_colaborativa/debug', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.getCsrfToken()
      }
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.renderDebugData(data.data);
        } else {
          debugContent.innerHTML = '<p style="margin: 0; color: #ef4444;">Error: ' + (data.error || 'Unknown error') + '</p>';
        }
      })
      .catch(error => {
        console.error('Debug error:', error);
        debugContent.innerHTML = '<p style="margin: 0; color: #ef4444;">Error al cargar datos de debug: ' + error.message + '</p>';
      });
  };

  window.applyMinimalDebugStyle = function () {
    if (window.__iaMinimalDebugStyleApplied) return;
    const style = document.createElement('style');
    style.innerHTML = `
      #ia-debug-content, #ia-debug-content * {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      #ia-debug-content div {
        padding: 0 !important;
        margin: 0 !important;
      }
      #ia-debug-content pre {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
      }
      #ia-debug-content .debug-log-entry {
        padding: 4px 0 !important;
      }
      #ia-debug-content .debug-log-entry span {
        display: block;
      }
      #ia-debug-content [style*='overflow'] {
        max-height: none !important;
        overflow: visible !important;
      }
    `;
    document.head.appendChild(style);
    window.__iaMinimalDebugStyleApplied = true;
  };

  window.applyMinimalDebugStyle();

  // Renderizar datos de debug
  window.renderDebugData = function (data) {
    const debugContent = document.getElementById('ia-debug-content');
    if (!debugContent) return;

    let html = '';

    // Timestamp
    html += '<div style="margin-bottom: 16px;">';
    html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">⏰ Timestamp</div>';
    html += '<div style="color: #ececec; background: #2f2f2f; padding: 8px; border-radius: 6px; border: 1px solid #3f3f3f;">' + data.timestamp + '</div>';
    html += '</div>';

    // Configuración
    html += '<div style="margin-bottom: 16px;">';
    html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">⚙️ Configuración</div>';
    html += '<div style="background: #2f2f2f; padding: 10px; border-radius: 6px; border: 1px solid #3f3f3f;">';
    html += window.renderConfigSection('MCP Server', data.configuration.mcp_server);
    html += window.renderConfigSection('AI Service', data.configuration.ai_service);
    html += window.renderConfigSection('LightRAG', data.configuration.lightrag);
    html += '</div>';
    html += '</div>';

    // Estado de servicios
    html += '<div style="margin-bottom: 16px;">';
    html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">🔌 Estado de Servicios</div>';
    html += '<div style="background: #2f2f2f; padding: 10px; border-radius: 6px; border: 1px solid #3f3f3f;">';
    html += window.renderServiceStatus('MCP Server', data.services.mcp_server);
    html += window.renderServiceStatus('LightRAG', data.services.lightrag);
    html += window.renderServiceStatus('Rails', data.services.rails);
    html += '</div>';
    html += '</div>';

    // Estadísticas
    html += '<div style="margin-bottom: 16px;">';
    html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">📊 Estadísticas</div>';
    html += '<div style="background: #2f2f2f; padding: 10px; border-radius: 6px; border: 1px solid #3f3f3f; color: #ececec;">';
    html += '<div style="margin-bottom: 6px;"><span style="color: #8e8ea0;">Total Logs:</span> ' + data.statistics.total_logs + '</div>';
    html += '<div style="margin-bottom: 6px;"><span style="color: #8e8ea0;">Total Conversaciones:</span> ' + data.statistics.total_conversations + '</div>';
    html += '<div style="margin-bottom: 6px;"><span style="color: #8e8ea0;">Última Actividad:</span> ' + data.statistics.last_activity + '</div>';

    if (data.statistics.event_counts && Object.keys(data.statistics.event_counts).length > 0) {
      html += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #3f3f3f;">';
      html += '<div style="color: #8e8ea0; margin-bottom: 4px;">Eventos por tipo:</div>';
      for (const [type, count] of Object.entries(data.statistics.event_counts)) {
        html += '<div style="margin-left: 12px; font-size: 11px;">• ' + type + ': ' + count + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';

    // Logs recientes
    if (data.recent_logs && data.recent_logs.length > 0) {
      html += '<div style="margin-bottom: 16px;">';
      html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">🤖 Logs Recientes (últimos 10)</div>';
      html += '<div style="background: #2f2f2f; padding: 10px; border-radius: 6px; border: 1px solid #3f3f3f; max-height: 300px; overflow-y: auto;">';

      data.recent_logs.slice(-10).forEach(log => {
        html += window.renderLogEntry(log);
      });

      html += '</div>';
      html += '</div>';
    }
    // Historial de conversaciones
    if (data.conversation_history && data.conversation_history.length > 0) {
      html += '<div style="margin-bottom: 16px;">';
      html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">💬 Historial de Conversaciones (últimas 5)</div>';
      html += '<div style="background: #2f2f2f; padding: 10px; border-radius: 6px; border: 1px solid #3f3f3f; max-height: 400px; overflow-y: auto;">';

      data.conversation_history.slice(-5).reverse().forEach(conv => {
        html += window.renderConversationEntry(conv);
      });

      html += '</div>';
      html += '</div>';
    }

    if (data.recent_agent_turns && data.recent_agent_turns.length > 0) {
      html += '<div style="margin-bottom: 16px;">';
      html += '<div style="color: #5B46E5; font-weight: 600; margin-bottom: 4px;">🧭 Historial Operativo de Sara (últimos 10 turnos)</div>';
      html += '<div style="background: #2f2f2f; padding: 10px; border-radius: 6px; border: 1px solid #3f3f3f; max-height: 480px; overflow-y: auto;">';

      data.recent_agent_turns.forEach(turn => {
        html += window.renderAgentTurnHistoryEntry(turn);
      });

      html += '</div>';
      html += '</div>';
    }

    debugContent.innerHTML = html;
  };

  // Renderizar sección de configuración
  window.renderConfigSection = function (title, config) {
    let html = '<div style="margin-bottom: 8px;">';
    html += '<div style="color: #ececec; font-weight: 600; margin-bottom: 4px;">' + title + '</div>';
    html += '<div style="margin-left: 12px; color: #8e8ea0; font-size: 11px;">';

    for (const [key, value] of Object.entries(config)) {
      const displayValue = typeof value === 'boolean'
        ? (value ? '<span style="color: #10b981;">✓ Sí</span>' : '<span style="color: #ef4444;">✗ No</span>')
        : value;
      html += '<div style="margin-bottom: 2px;">• ' + key + ': ' + displayValue + '</div>';
    }

    html += '</div>';
    html += '</div>';
    return html;
  };

  // Renderizar estado de servicio
  window.renderServiceStatus = function (title, service) {
    const statusColor = service.available ? '#10b981' : '#ef4444';
    const statusText = service.available ? '✓ Disponible' : '✗ No disponible';

    let html = '<div style="margin-bottom: 8px;">';
    html += '<div style="color: #ececec; font-weight: 600; margin-bottom: 4px;">' + title + ' <span style="color: ' + statusColor + ';">' + statusText + '</span></div>';

    if (service.error) {
      html += '<div style="margin-left: 12px; color: #ef4444; font-size: 11px;">Error: ' + service.error + '</div>';
    }

    if (service.status) {
      html += '<div style="margin-left: 12px; color: #8e8ea0; font-size: 11px;">Status: ' + service.status + '</div>';
    }

    if (service.environment) {
      html += '<div style="margin-left: 12px; color: #8e8ea0; font-size: 11px;">Environment: ' + service.environment + '</div>';
    }

    html += '</div>';
    return html;
  };

  // Renderizar entrada de log - VERSIÓN MEJORADA CON EXPANSIÓN
  window.renderLogEntry = function (log) {
    const typeColors = {
      'user_query': '#3b82f6',
      'mcp_call': '#8b5cf6',
      'ai_call': '#10b981',
      'handler_delegation': '#f59e0b',
      'agent_response': '#06b6d4',
      'handler_start': '#a855f7',
      'projects_debug': '#f97316'
    };

    const color = typeColors[log.event_type] || '#8e8ea0';
    const logId = 'log-' + Math.random().toString(36).substr(2, 9);

    let html = '<div class="debug-log-entry" data-log-id="' + logId + '" style="margin-bottom: 8px; padding: 8px; background: #1a1a1a; border-left: 3px solid ' + color + '; border-radius: 4px; cursor: pointer;">';
    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">';
    html += '<span style="color: ' + color + '; font-weight: 600; font-size: 11px;">📋 ' + log.event_type + ' (click para expandir)</span>';
    html += '<span style="color: #565869; font-size: 10px;">' + new Date(log.timestamp).toLocaleTimeString() + '</span>';
    html += '</div>';
    html += '<div style="color: #8e8ea0; font-size: 11px;">';
    html += '<div><span style="color: #ececec;">Agent:</span> ' + log.agent_name + '</div>';

    if (log.data && Object.keys(log.data).length > 0) {
      // Preview resumido
      const preview = JSON.stringify(log.data).substring(0, 100);
      html += '<div style="margin-top: 4px; color: #6b7280;">' + preview + '...</div>';

      // Detalles completos (ocultos por defecto)
      html += '<div id="' + logId + '" class="debug-log-details" style="display: none; margin-top: 8px; padding: 8px; background: #0d0d0d; border-radius: 4px; max-height: 500px; overflow-y: auto;">';

      // Si es una llamada a IA, mostrar los prompts y respuestas
      if (log.event_type === 'ai_call') {
        html += window.renderAICallDetails(log.data);
      }
      // Si es una llamada MCP, mostrar detalles
      else if (log.event_type === 'mcp_call') {
        html += window.renderMCPCallDetails(log.data);
      }
      // Para otros tipos, mostrar JSON formateado
      else {
        html += '<pre style="margin: 0; color: #10b981; font-size: 10px; white-space: pre-wrap; word-wrap: break-word;">' + JSON.stringify(log.data, null, 2) + '</pre>';
      }

      html += '</div>';
    }

    html += '</div>';
    html += '</div>';
    return html;
  };

  // Toggle detalles de log
  window.toggleLogDetails = function (logId) {
    const element = document.getElementById(logId);
    if (element) {
      element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
  };

  // Override minimalista para renderLogEntry (mantiene compatibilidad)
  window.renderLogEntry = function (log) {
    const typeColors = {
      'user_query': '#3b82f6',
      'mcp_call': '#8b5cf6',
      'ai_call': '#10b981',
      'handler_delegation': '#f59e0b',
      'agent_response': '#06b6d4',
      'handler_start': '#a855f7',
      'projects_debug': '#f97316'
    };

    const color = typeColors[log.event_type] || '#8e8ea0';
    const title = (log.event_type === 'user_query' && log.data && log.data.message) ? log.data.message : log.event_type;

    let html = '<div class="debug-log-entry" style="margin-bottom: 6px; font-size: 11px;">';
    html += '<div style="font-weight: 600; font-size: 12px; color: ' + color + ';">' + title + '</div>';
    html += '<div style="color: #565869; font-size: 10px;">' + new Date(log.timestamp).toLocaleTimeString() + '</div>';
    html += '<div style="color: #8e8ea0; font-size: 11px;">Agent: ' + log.agent_name + '</div>';

    if (log.data && Object.keys(log.data).length > 0) {
      html += '<div style="margin-top: 4px;">';
      if (log.event_type === 'ai_call') {
        html += window.renderAICallDetails(log.data);
      } else if (log.event_type === 'mcp_call') {
        html += window.renderMCPCallDetails(log.data);
      } else {
        html += '<div style="white-space: pre-wrap; word-break: break-word; font-family: monospace;">' + JSON.stringify(log.data, null, 2) + '</div>';
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  };

  // Renderizar detalles de llamada a IA
  window.renderAICallDetails = function (data) {
    let html = '';

    html += '<div style="margin-bottom: 8px;">';
    html += '<div style="color: #5B46E5; font-weight: 600; font-size: 11px; margin-bottom: 4px;">📤 REQUEST</div>';

    if (data.system_prompt) {
      html += '<div style="margin-bottom: 6px;">';
      html += '<div style="color: #8e8ea0; font-size: 10px; margin-bottom: 2px;">System Prompt:</div>';
      html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #cbd5e1; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 200px; overflow-y: auto;">' + data.system_prompt + '</pre>';
      html += '</div>';
    }

    if (data.user_prompt) {
      html += '<div style="margin-bottom: 6px;">';
      html += '<div style="color: #8e8ea0; font-size: 10px; margin-bottom: 2px;">User Prompt:</div>';
      html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #cbd5e1; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 200px; overflow-y: auto;">' + data.user_prompt + '</pre>';
      html += '</div>';
    }

    html += '<div style="color: #8e8ea0; font-size: 10px;">Temperature: ' + (data.temperature || 'N/A') + ' | Max Tokens: ' + (data.max_tokens || 'N/A') + ' | Time: ' + (data.request_time_ms || 'N/A') + 'ms</div>';
    html += '</div>';

    html += '<div>';
    html += '<div style="color: #10b981; font-weight: 600; font-size: 11px; margin-bottom: 4px;">📥 RESPONSE</div>';

    if (data.ai_response) {
      html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #10b981; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 300px; overflow-y: auto;">' + data.ai_response + '</pre>';
    } else if (data.error) {
      html += '<div style="color: #ef4444; font-size: 10px;">Error: ' + data.error + '</div>';
    } else {
      html += '<div style="color: #8e8ea0; font-size: 10px;">No response available</div>';
    }

    html += '</div>';

    return html;
  };

  // Renderizar detalles de llamada MCP
  window.renderMCPCallDetails = function (data) {
    let html = '';

    html += '<div style="margin-bottom: 8px;">';
    html += '<div style="color: #8b5cf6; font-weight: 600; font-size: 11px; margin-bottom: 4px;">MCP Call Details</div>';
    html += '<div style="color: #8e8ea0; font-size: 10px;">';
    html += '<div><span style="color: #ececec;">Endpoint:</span> ' + (data.endpoint || 'N/A') + '</div>';
    html += '<div><span style="color: #ececec;">Success:</span> ' + (data.success ? 'Yes' : 'No') + '</div>';
    if (data.error) {
      html += '<div><span style="color: #ef4444;">Error:</span> ' + data.error + '</div>';
    }
    html += '</div>';
    html += '</div>';

    if (data.full_data) {
      html += '<div style="margin-top: 6px;">';
      html += '<div style="color: #8e8ea0; font-size: 10px; margin-bottom: 2px;">Full Data:</div>';
      html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #8b5cf6; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 300px; overflow-y: auto;">' + JSON.stringify(data.full_data, null, 2) + '</pre>';
      html += '</div>';
    } else {
      html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #8b5cf6; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 200px; overflow-y: auto;">' + JSON.stringify(data, null, 2) + '</pre>';
    }

    return html;
  };

  // Renderizar entrada de conversación - VERSIÓN MEJORADA CON EXPANSIÓN
  window.renderConversationEntry = function (conv) {
    const convId = 'conv-' + Math.random().toString(36).substr(2, 9);

    let html = '<div class="debug-conv-entry" data-conv-id="' + convId + '" style="margin-bottom: 12px; padding: 10px; background: #1a1a1a; border-radius: 6px; border: 1px solid #3f3f3f; cursor: pointer;">';
    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;">';
    html += '<span style="color: #5B46E5; font-weight: 600; font-size: 11px;">💬 ' + conv.agent_name + ' (click para expandir)</span>';
    html += '<span style="color: #565869; font-size: 10px;">' + new Date(conv.timestamp).toLocaleString() + '</span>';
    html += '</div>';

    // Preview del mensaje de usuario
    html += '<div style="margin-bottom: 6px; padding: 6px; background: #2f2f2f; border-radius: 4px;">';
    html += '<div style="color: #8e8ea0; font-size: 10px; margin-bottom: 2px;">Usuario:</div>';
    html += '<div style="color: #ececec; font-size: 11px;">' + (conv.user_message || 'N/A').substring(0, 100) + (conv.user_message && conv.user_message.length > 100 ? '...' : '') + '</div>';
    html += '</div>';

    // Preview de la respuesta
    html += '<div style="padding: 6px; background: #2f2f2f; border-radius: 4px;">';
    html += '<div style="color: #8e8ea0; font-size: 10px; margin-bottom: 2px;">Respuesta:</div>';
    html += '<div style="color: #ececec; font-size: 11px;">' + (conv.agent_response || 'N/A').substring(0, 150) + (conv.agent_response && conv.agent_response.length > 150 ? '...' : '') + '</div>';
    html += '</div>';

    // Detalles completos (ocultos por defecto)
    html += '<div id="' + convId + '" style="display: none; margin-top: 8px; padding: 8px; background: #0d0d0d; border-radius: 4px;">';

    html += '<div style="margin-bottom: 8px;">';
    html += '<div style="color: #3b82f6; font-weight: 600; font-size: 10px; margin-bottom: 4px;">📤 MENSAJE COMPLETO DEL USUARIO</div>';
    html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #cbd5e1; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 200px; overflow-y: auto;">' + (conv.user_message || 'N/A') + '</pre>';
    html += '</div>';

    html += '<div style="margin-bottom: 8px;">';
    html += '<div style="color: #10b981; font-weight: 600; font-size: 10px; margin-bottom: 4px;">📥 RESPUESTA COMPLETA DEL AGENTE</div>';
    html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #10b981; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px; max-height: 300px; overflow-y: auto;">' + (conv.agent_response || 'N/A') + '</pre>';
    html += '</div>';

    // Metadata si está disponible
    if (conv.metadata && Object.keys(conv.metadata).length > 0) {
      html += '<div>';
      html += '<div style="color: #f59e0b; font-weight: 600; font-size: 10px; margin-bottom: 4px;">📊 METADATA</div>';
      html += '<pre style="margin: 0; padding: 6px; background: #1a1a1a; color: #f59e0b; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; border-radius: 3px;">' + JSON.stringify(conv.metadata, null, 2) + '</pre>';
      html += '</div>';
    }

    html += '</div>';

    html += '</div>';
    return html;
  };

  window.renderAgentTurnHistoryEntry = function (turn) {
    var duration = Number(turn.total_duration_ms || 0);
    var durationText = duration > 0 ? (duration / 1000).toFixed(1) + 's' : 'n/d';
    var statusColor = turn.status === 'completed' ? '#10b981' : '#f59e0b';
    var ragText = turn.rag_used ? 'Sí' : 'No';
    var toolCount = Number(turn.tool_calls_count || 0);
    var query = (turn.query || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var response = (turn.response || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var agentLabel = ((turn.agent_label || turn.agent || 'Sara') + '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var statusLabel = ((turn.status_label || turn.status || 'desconocido') + '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    var html = '<details style="margin-bottom: 10px; background: #1a1a1a; border: 1px solid #3f3f3f; border-radius: 8px; overflow: hidden;">';
    html += '<summary style="cursor: pointer; list-style: none; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">';
    html += '<div style="display:flex; flex-direction:column; gap:4px;">';
    html += '<div style="color:#ececec; font-weight:600; font-size:12px;">' + agentLabel + ' · ' + (turn.turn_id || '') + '</div>';
    html += '<div style="color:#cbd5e1; font-size:11px;">' + (query || 'Sin consulta') + '</div>';
    html += '</div>';
    html += '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">';
    html += '<span style="color:' + statusColor + '; font-size:11px; font-weight:700;">' + statusLabel + '</span>';
    html += '<span style="color:#94a3b8; font-size:10px;">' + durationText + ' · tools ' + toolCount + '</span>';
    html += '</div>';
    html += '</summary>';

    html += '<div style="padding: 0 12px 12px 12px; border-top: 1px solid #2a2a2a;">';
    html += '<div style="color:#94a3b8; font-size:11px; margin-top:10px; margin-bottom:8px;">RAG: ' + ragText + ' · Eventos: ' + (turn.events_count || 0) + ' · Modelo: ' + (turn.model || 'n/d') + '</div>';

    if (response) {
      html += '<div style="margin-bottom: 10px;">';
      html += '<div style="color:#5B46E5; font-weight:600; margin-bottom:4px; font-size:11px;">Respuesta</div>';
      html += '<div style="background:#111111; border:1px solid #2f2f2f; border-radius:6px; padding:8px; color:#e5e7eb; font-size:11px; white-space:pre-wrap;">' + response + '</div>';
      html += '</div>';
    }

    if (turn.events && turn.events.length > 0) {
      html += '<div>';
      html += '<div style="color:#5B46E5; font-weight:600; margin-bottom:4px; font-size:11px;">Eventos</div>';
      html += '<div style="display:flex; flex-direction:column; gap:6px;">';
      turn.events.forEach(function (event) {
        var label = ((event.label || event.type || '').toString()).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var metaText = window.formatAgentHistoryMeta ? window.formatAgentHistoryMeta(event) : '';
        metaText = (metaText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '<div style="background:#111111; border:1px solid #2f2f2f; border-radius:6px; padding:8px;">';
        html += '<div style="display:flex; justify-content:space-between; gap:8px;">';
        html += '<span style="color:#e5e7eb; font-size:11px; font-weight:600;">#' + event.position + ' · ' + label + '</span>';
        html += '<span style="color:#94a3b8; font-size:10px;">' + ((event.type || '').toString()) + '</span>';
        html += '</div>';
        if (metaText) {
          html += '<div style="margin:6px 0 0 0; color:#94a3b8; font-size:10px; white-space:pre-wrap; word-break:break-word;">' + metaText + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    html += '</details>';
    return html;
  };

  window.formatAgentHistoryMeta = function (event) {
    if (!event || !event.meta) return '';
    var meta = event.meta || {};

    if (event.type === 'agent_status' && meta.query) {
      return 'Consulta: ' + meta.query;
    }
    if (event.type === 'reasoning_step') {
      if (meta.summary) return meta.summary;
      if (meta.round) return 'Round ' + meta.round;
      if (meta.messages_count) return 'Mensajes considerados: ' + meta.messages_count;
      return '';
    }
    if (event.type === 'rag_step_finished' && meta.chars) {
      return 'Contexto recuperado: ' + meta.chars + ' chars';
    }
    if (event.type === 'rag_step_failed' && meta.error) {
      return 'Error controlado: ' + meta.error;
    }
    if (event.type === 'tool_call_started' && meta.tool_name) {
      return 'Herramienta: ' + meta.tool_name;
    }
    if (event.type === 'tool_call_finished') {
      var okBits = [];
      if (meta.tool_name) okBits.push('Herramienta: ' + meta.tool_name);
      if (meta.duration_ms) okBits.push('Duración: ' + (Number(meta.duration_ms) / 1000).toFixed(1) + 's');
      return okBits.join(' · ');
    }
    if (event.type === 'tool_call_failed') {
      var failBits = [];
      if (meta.tool_name) failBits.push('Herramienta: ' + meta.tool_name);
      if (meta.error) failBits.push('Error: ' + meta.error);
      return failBits.join(' · ');
    }
    if (event.type === 'assistant_message' && meta.response_chars) {
      return 'Respuesta: ' + meta.response_chars + ' chars';
    }
    if (event.type === 'turn_summary') {
      var summaryBits = [];
      if (typeof meta.tool_calls_count !== 'undefined') summaryBits.push('tools ' + meta.tool_calls_count);
      if (typeof meta.rag_used !== 'undefined') summaryBits.push('RAG ' + (meta.rag_used ? 'sí' : 'no'));
      if (meta.total_duration_ms) summaryBits.push((Number(meta.total_duration_ms) / 1000).toFixed(1) + 's');
      return summaryBits.join(' · ');
    }

    return '';
  };

  // Toggle detalles de conversación
  window.toggleConvDetails = function (convId) {
    const element = document.getElementById(convId);
    if (element) {
      element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
  };

  // Event delegation para acciones del panel de debug
  document.addEventListener('click', function (e) {
    var target = e.target;

    // Refresh button
    if (target && target.id === 'ia-debug-refresh-btn') {
      e.preventDefault();
      e.stopPropagation();
      window.loadDebugData();
      return false;
    }

    // Clear logs button
    if (target && target.id === 'ia-debug-clear-btn') {
      e.preventDefault();
      e.stopPropagation();
      fetch(buildIaColabUrl('/ia_colaborativa/debug/clear'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin'
      })
        .then(function (resp) { return resp.json(); })
        .then(function () {
          window.loadDebugData();
        })
        .catch(function (err) {
          console.error('Error al limpiar debug:', err);
        });
      return false;
    }

    // Click en log entry para expandir/contraer
    // Buscar el elemento padre con clase debug-log-entry
    var logEntry = target;
    while (logEntry && !logEntry.classList.contains('debug-log-entry')) {
      logEntry = logEntry.parentElement;
      if (!logEntry || logEntry === document.body) break;
    }

    if (logEntry && logEntry.classList.contains('debug-log-entry')) {
      var logId = logEntry.getAttribute('data-log-id');
      if (logId) {
        e.preventDefault();
        e.stopPropagation();
        window.toggleLogDetails(logId);
        return false;
      }
    }

    // Click en conversación para expandir/contraer
    var convEntry = target;
    while (convEntry && !convEntry.classList.contains('debug-conv-entry')) {
      convEntry = convEntry.parentElement;
      if (!convEntry || convEntry === document.body) break;
    }

    if (convEntry && convEntry.classList.contains('debug-conv-entry')) {
      var convId = convEntry.getAttribute('data-conv-id');
      if (convId) {
        e.preventDefault();
        e.stopPropagation();
        window.toggleConvDetails(convId);
        return false;
      }
    }
  }, true);

  console.log('✅ Debug panel initialized with event delegation');

  // ============================================================================
  // MANEJO DE IMÁGENES
  // ============================================================================

  // Variable global para almacenar la imagen adjunta
  window.currentImageData = null;

  // Delegación para el botón de adjuntar
  document.addEventListener('click', function (e) {
    var target = e.target;

    // Botón de adjuntar imagen
    if (target.id === 'ia-chat-attach-btn') {
      e.preventDefault();
      e.stopPropagation();
      var fileInput = document.getElementById('ia-chat-file-input');
      if (fileInput) {
        fileInput.click();
      }
      return false;
    }

    // Botón de remover imagen
    if (target.id === 'ia-image-remove-btn') {
      e.preventDefault();
      e.stopPropagation();
      window.removeImagePreview();
      return false;
    }
  }, true);

  // Listener para cuando se selecciona un archivo
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'ia-chat-file-input') {
      var file = e.target.files[0];
      if (file) {
        // Validar tipo de archivo
        if (!file.type.startsWith('image/')) {
          alert('❌ Por favor, selecciona solo archivos de imagen.\n\nFormatos soportados: JPG, PNG, GIF, WebP, BMP, SVG, TIFF, HEIC');
          e.target.value = '';
          return;
        }

        // Validar tamaño (máximo 1GB para planos de alta resolución)
        var maxSize = 1024 * 1024 * 1024; // 1GB en bytes
        if (file.size > maxSize) {
          var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
          alert('❌ La imagen es demasiado grande.\n\nTamaño máximo: 1GB (1024MB)\nTamaño actual: ' + fileSizeMB + 'MB');
          e.target.value = '';
          return;
        }

        // Advertencia para archivos grandes (>100MB)
        if (file.size > 100 * 1024 * 1024) {
          var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
          if (!confirm('⚠️ Archivo grande detectado (' + fileSizeMB + 'MB)\n\nLa carga puede tardar varios minutos.\n¿Deseas continuar?')) {
            e.target.value = '';
            return;
          }
        }

        window.handleImageUpload(file);
      }
      // Limpiar el input para permitir seleccionar la misma imagen de nuevo
      e.target.value = '';
    }
  }, true);

  // Función para manejar la carga de imagen
  window.handleImageUpload = function (file) {
    var reader = new FileReader();
    var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);

    // Mostrar indicador de carga para archivos >50MB
    var loadingMessage = null;
    if (file.size > 50 * 1024 * 1024) {
      console.log('📤 Cargando archivo grande:', file.name, '(' + fileSizeMB + 'MB)');
      // Crear mensaje temporal en el chat
      var list = document.getElementById('ia-chat-messages');
      if (list) {
        loadingMessage = document.createElement('div');
        loadingMessage.style.cssText = 'padding: 12px; background: #2f2f2f; border-radius: 8px; margin-bottom: 8px; color: #8e8ea0; font-size: 13px; text-align: center;';
        loadingMessage.innerHTML = '⏳ Cargando imagen (' + fileSizeMB + 'MB)...';
        list.appendChild(loadingMessage);
        list.scrollTop = list.scrollHeight;
      }
    }

    reader.onload = function (e) {
      // Remover mensaje de carga
      if (loadingMessage && loadingMessage.parentElement) {
        loadingMessage.parentElement.removeChild(loadingMessage);
      }

      var base64Data = e.target.result;
      window.currentImageData = base64Data;

      // Mostrar preview
      var previewContainer = document.getElementById('ia-image-preview-container');
      var previewImg = document.getElementById('ia-image-preview');

      if (previewContainer && previewImg) {
        previewImg.src = base64Data;
        previewContainer.style.display = 'block';
      }

      console.log('✅ Imagen cargada:', file.name, '(' + fileSizeMB + 'MB)');
    };

    reader.onerror = function () {
      // Remover mensaje de carga
      if (loadingMessage && loadingMessage.parentElement) {
        loadingMessage.parentElement.removeChild(loadingMessage);
      }

      console.error('❌ Error al cargar la imagen');
      alert('Error al cargar la imagen. Por favor, intenta de nuevo.');
    };

    reader.readAsDataURL(file);
  };

  // Función para remover la imagen
  window.removeImagePreview = function () {
    window.currentImageData = null;

    var previewContainer = document.getElementById('ia-image-preview-container');
    var previewImg = document.getElementById('ia-image-preview');
    var fileInput = document.getElementById('ia-chat-file-input');

    if (previewContainer) {
      previewContainer.style.display = 'none';
    }

    if (previewImg) {
      previewImg.src = '';
    }

    if (fileInput) {
      fileInput.value = '';
    }

    console.log('🗑️ Imagen removida');
  };

  // ============================================================================
  // DRAG & DROP DE IMÁGENES
  // ============================================================================

  // Función para manejar el drop de archivos (compartida)
  window.handleFileDrop = function (files) {
    if (files && files.length > 0) {
      var file = files[0];

      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        alert('❌ Por favor, arrastra solo archivos de imagen.\n\nFormatos soportados: JPG, PNG, GIF, WebP, BMP, SVG, TIFF, HEIC');
        return;
      }

      // Validar tamaño (máximo 1GB para planos de alta resolución)
      var maxSize = 1024 * 1024 * 1024; // 1GB en bytes
      if (file.size > maxSize) {
        var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        alert('❌ La imagen es demasiado grande.\n\nTamaño máximo: 1GB (1024MB)\nTamaño actual: ' + fileSizeMB + 'MB');
        return;
      }

      // Advertencia para archivos grandes (>100MB)
      if (file.size > 100 * 1024 * 1024) {
        var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        if (!confirm('⚠️ Archivo grande detectado (' + fileSizeMB + 'MB)\n\nLa carga puede tardar varios minutos.\n¿Deseas continuar?')) {
          return;
        }
      }

      window.handleImageUpload(file);
    }
  };

  // Configurar drag & drop con delegación de eventos en document
  // Esto asegura que funcione incluso si los elementos se crean dinámicamente

  // Prevenir comportamiento por defecto en todo el documento para eventos drag
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function (eventName) {
    document.addEventListener(eventName, function (e) {
      var target = e.target;

      // IGNORAR si es parte del editor PEB (Drag & Drop interno)
      if (target.closest && target.closest('#peb-auto-root')) {
        return;
      }

      var chatWindow = document.getElementById('ia-chat-window');
      var welcomeScreen = document.getElementById('ia-chat-welcome');

      // Verificar si el drag está sobre el chat window o welcome screen
      if (chatWindow && (chatWindow.contains(target) || target === chatWindow)) {
        e.preventDefault();
        e.stopPropagation();
      } else if (welcomeScreen && (welcomeScreen.contains(target) || target === welcomeScreen)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  });

  // Efecto visual y manejo del drop
  document.addEventListener('dragenter', function (e) {
    var target = e.target;
    // IGNORAR si es parte del editor PEB
    if (target.closest && target.closest('#peb-auto-root')) return;

    var chatWindow = document.getElementById('ia-chat-window');
    if (chatWindow && chatWindow.contains(e.target) && e.dataTransfer.types.includes('Files')) {
      console.log('🎯 Drag enter detectado en chat window');
    }
  }, true);

  document.addEventListener('dragleave', function (e) {
    // IGNORAR si es parte del editor PEB
    if (e.target.closest && e.target.closest('#peb-auto-root')) return;

    var chatWindow = document.getElementById('ia-chat-window');
    if (chatWindow && e.target === chatWindow) {
      // mantener sin brillo adicional
    }
  }, true);

  document.addEventListener('drop', function (e) {
    var target = e.target;

    // IGNORAR si es parte del editor PEB
    if (target.closest && target.closest('#peb-auto-root')) {
      return;
    }

    var chatWindow = document.getElementById('ia-chat-window');
    var welcomeScreen = document.getElementById('ia-chat-welcome');

    if (chatWindow && (chatWindow.contains(target) || target === chatWindow)) {
      console.log('📦 Drop detectado en chat window');
      e.preventDefault();
      e.stopPropagation();
      window.handleFileDrop(e.dataTransfer.files);
    } else if (welcomeScreen && (welcomeScreen.contains(target) || target === welcomeScreen)) {
      console.log('📦 Drop detectado en welcome screen');
      e.preventDefault();
      e.stopPropagation();
      window.handleFileDrop(e.dataTransfer.files);
    }
  }, true);

  // ============================================================================
  // PEGAR IMÁGENES DESDE PORTAPAPELES (Ctrl+V)
  // ============================================================================

  document.addEventListener('paste', function (e) {
    var chatWindow = document.getElementById('ia-chat-window');
    var chatInput = document.getElementById('ia-chat-input');

    // Solo procesar paste si el chat está abierto y visible
    if (!chatWindow || chatWindow.style.display === 'none') {
      return;
    }

    // Verificar si hay items en el clipboard
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      // Si es una imagen
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();

        var blob = item.getAsFile();

        console.log('📋 Imagen detectada en portapapeles:', blob.type, '(' + (blob.size / 1024).toFixed(2) + 'KB)');

        // Validar tamaño (máximo 1GB)
        var maxSize = 1024 * 1024 * 1024;
        if (blob.size > maxSize) {
          var fileSizeMB = (blob.size / 1024 / 1024).toFixed(2);
          alert('❌ La imagen es demasiado grande.\n\nTamaño máximo: 1GB (1024MB)\nTamaño actual: ' + fileSizeMB + 'MB');
          return;
        }

        // Advertencia para archivos grandes (>100MB)
        if (blob.size > 100 * 1024 * 1024) {
          var fileSizeMB = (blob.size / 1024 / 1024).toFixed(2);
          if (!confirm('⚠️ Archivo grande detectado (' + fileSizeMB + 'MB)\n\nLa carga puede tardar varios minutos.\n¿Deseas continuar?')) {
            return;
          }
        }

        // Procesar la imagen
        window.handleImageUpload(blob);

        // Enfocar el input para que el usuario pueda escribir
        if (chatInput) {
          setTimeout(function () {
            chatInput.focus();
          }, 100);
        }

        return; // Solo procesar la primera imagen
      }
    }
  }, true);

  console.log('✅ Image upload, drag & drop, and paste (Ctrl+V) initialized');

  // ============================================================================
  // BÚSQUEDA DE PROYECTOS
  // ============================================================================

  // Abrir modal de búsqueda de proyectos
  window.openProjectsSearchModal = function () {
    var modal = document.getElementById('ia-projects-search-modal');
    if (!modal) return;

    requestAnimationFrame(function () {
      modal.style.display = 'flex';

      // Cargar proyectos del usuario automáticamente
      window.loadUserProjects();

      // Focus en el input de búsqueda
      var input = document.getElementById('ia-projects-search-input');
      if (input) {
        setTimeout(function () {
          input.focus();
        }, 100);
      }
    });
  };

  // Cerrar modal de búsqueda de proyectos
  window.closeProjectsSearchModal = function () {
    var modal = document.getElementById('ia-projects-search-modal');
    if (!modal) return;

    requestAnimationFrame(function () {
      modal.style.display = 'none';
    });
  };

  // Cargar proyectos del usuario automáticamente al abrir el modal
  window.loadUserProjects = function () {
    var loadingIndicator = document.getElementById('ia-projects-search-loading');
    var resultsContainer = document.getElementById('ia-projects-search-results');

    if (!resultsContainer) return;

    // Obtener usuario en sesión
    var currentUser = window.extractCurrentUser();
    if (!currentUser || !currentUser.id) {
      resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">❌ No se pudo detectar el usuario en sesión</div>';
      return;
    }

    console.log('📂 Cargando proyectos del usuario:', currentUser.name, '(ID:', currentUser.id + ')');

    // Mostrar indicador de carga
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }

    resultsContainer.innerHTML = '<div style="text-align: center; color: #8e8ea0; padding: 40px;">⏳ Cargando tus proyectos...</div>';

    // Construir URL con user_id
    var url = buildIaColabUrl('/ia_colaborativa/search_projects?user_id=' + currentUser.id + '&active_only=true');

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.getCsrfToken()
      }
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        // Ocultar indicador de carga
        if (loadingIndicator) {
          loadingIndicator.style.display = 'none';
        }

        if (data.success && data.projects) {
          window.renderProjectsResults(data.projects);
        } else {
          resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">❌ Error: ' + (data.error || 'No se pudieron cargar tus proyectos') + '</div>';
        }
      })
      .catch(function (error) {
        console.error('Error al cargar proyectos del usuario:', error);

        // Ocultar indicador de carga
        if (loadingIndicator) {
          loadingIndicator.style.display = 'none';
        }

        resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">❌ Error al conectar con el servidor</div>';
      });
  };

  // Buscar proyectos en el MCP (cuando el usuario escribe en el input)
  window.searchProjects = function () {
    var input = document.getElementById('ia-projects-search-input');
    var loadingIndicator = document.getElementById('ia-projects-search-loading');
    var resultsContainer = document.getElementById('ia-projects-search-results');

    if (!input || !resultsContainer) return;

    var searchTerm = input.value.trim();

    // Obtener usuario en sesión
    var currentUser = window.extractCurrentUser();
    if (!currentUser || !currentUser.id) {
      resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">❌ No se pudo detectar el usuario en sesión</div>';
      return;
    }

    console.log('🔍 Buscando proyectos del usuario:', searchTerm);

    // Mostrar indicador de carga
    if (loadingIndicator) {
      loadingIndicator.style.display = 'block';
    }

    // Limpiar resultados previos
    resultsContainer.innerHTML = '<div style="text-align: center; color: #8e8ea0; padding: 40px;">⏳ Buscando proyectos...</div>';

    // Construir URL con user_id y término de búsqueda
    var url = buildIaColabUrl('/ia_colaborativa/search_projects?user_id=' + currentUser.id + '&search=' + encodeURIComponent(searchTerm) + '&active_only=true');

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.getCsrfToken()
      }
    })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        // Ocultar indicador de carga
        if (loadingIndicator) {
          loadingIndicator.style.display = 'none';
        }

        if (data.success && data.projects) {
          window.renderProjectsResults(data.projects);
        } else {
          resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">❌ Error: ' + (data.error || 'No se pudieron obtener los proyectos') + '</div>';
        }
      })
      .catch(function (error) {
        console.error('Error al buscar proyectos:', error);

        // Ocultar indicador de carga
        if (loadingIndicator) {
          loadingIndicator.style.display = 'none';
        }

        resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">❌ Error al conectar con el servidor</div>';
      });
  };

  window.renderProjectsResults = function (projects) {
    var resultsContainer = document.getElementById('ia-projects-search-results');
    if (!resultsContainer) return;

    var projectItems = [];
    var seenIds = new Set();

    projects.forEach(function (item) {
      var projectLink = item._links && item._links.project;
      var projectId = null;
      var projectName = null;

      if (projectLink && projectLink.href) {
        projectId = projectLink.href.split('/').pop();
        projectName = projectLink.title;
      }

      if (!projectId) {
        projectId = item.id || (item.project && item.project.id);
      }

      if (!projectName) {
        projectName = item.name || (item.project && item.project.name);
      }

      if (!projectId || seenIds.has(projectId)) return;

      seenIds.add(projectId);

      var identifier = item.project && item.project.identifier ? item.project.identifier : (item.identifier || '');
      var description = '';
      if (item.project && item.project.description && item.project.description.raw) {
        description = item.project.description.raw;
      }
      if (!description && item.description) {
        description = item.description;
      }

      projectItems.push({
        id: projectId,
        name: projectName || 'Proyecto sin nombre',
        identifier: identifier,
        description: description
      });

      console.log('🔍 Proyecto detectado:', {
        id_source: projectLink && projectLink.href ? projectLink.href.split('/').pop() : null,
        title_source: projectLink && projectLink.title,
        fallback_id: item.id || (item.project && item.project.id),
        fallback_name: item.name || (item.project && item.project.name)
      });
    });

    if (projectItems.length === 0) {
      resultsContainer.innerHTML = '<div style="text-align: center; color: #8e8ea0; padding: 40px; font-size: 14px;">No se encontraron proyectos</div>';
      return;
    }

    var html = '<div style="display: flex; flex-direction: column; gap: 12px;">';

    projectItems.forEach(function (project) {
      var description = project.description ? project.description.substring(0, 100) : '';
      if (project.description && project.description.length > 100) {
        description += '...';
      }

      html += '<div class="project-result-item" data-project-id="' + project.id + '" data-project-name="' + project.name + '" style="padding: 16px; background: #2f2f2f; border: 1px solid #3f3f3f; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">';
      html += '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">';
      html += '<div style="flex: 1;">';
      html += '<div style="font-weight: 600; font-size: 15px; color: #ececec; margin-bottom: 4px;">' + project.name + '</div>';
      html += '<div style="font-size: 12px; color: #8e8ea0;">ID: ' + project.id + (project.identifier ? ' · ' + project.identifier : '') + '</div>';
      html += '</div>';
      html += '<div style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">ACTIVO</div>';
      html += '</div>';
      if (description) {
        html += '<div style="font-size: 13px; color: #cbd5e1; line-height: 1.4;">' + description + '</div>';
      }
      html += '</div>';
    });

    html += '</div>';

    resultsContainer.innerHTML = html;

    var items = resultsContainer.querySelectorAll('.project-result-item');
    items.forEach(function (item) {
      item.addEventListener('mouseenter', function () {
        this.style.background = '#3a3a3a';
        this.style.borderColor = '#5B46E5';
      });
      item.addEventListener('mouseleave', function () {
        this.style.background = '#2f2f2f';
        this.style.borderColor = '#3f3f3f';
      });

      item.addEventListener('click', function () {
        var projectId = this.getAttribute('data-project-id');
        var projectName = this.getAttribute('data-project-name');
        window.selectProject(projectId, projectName);
      });
    });

    console.log('Proyectos renderizados:', projectItems.length);
  };

  // Seleccionar un proyecto
  window.selectProject = function (projectId, projectName) {
    console.log('📌 Proyecto seleccionado:', projectId, projectName);

    // Guardar el proyecto seleccionado globalmente
    window.selectedProject = {
      id: projectId,
      name: projectName
    };

    // Actualizar el texto del botón "Proyectos" con el nombre del proyecto
    var projectsButton = document.getElementById('ia-projects-button');
    if (projectsButton) {
      var buttonSpan = projectsButton.querySelector('span');
      if (buttonSpan) {
        // Mantener el SVG pero cambiar el texto
        var svg = buttonSpan.querySelector('svg');
        if (svg) {
          buttonSpan.innerHTML = projectName + ' (ID: ' + projectId + ') ';
          buttonSpan.appendChild(svg);
        } else {
          buttonSpan.textContent = projectName + ' (ID: ' + projectId + ')';
        }
      }
    }

    // Auto-seleccionar SaraIA Obra al elegir proyecto
    window.onAgentChange && window.onAgentChange('cde');
    window.syncProjectPrompt && window.syncProjectPrompt();

    // Cerrar el modal
    window.closeProjectsSearchModal();

    // Opcional: Enviar automáticamente (descomentá esta línea si querés que se envíe solo)
    // window.sendIaMessage(new Event('submit'));
  };

  window.buildProjectPromptPrefix = function () {
    if (window.currentAgent !== 'cde') return '';
    var project = window.selectedProject || {};
    if (!project.id || !project.name) return '';
    return 'Mi proyecto es ' + project.name + ' (ID: ' + project.id + '): ';
  };

  window.measureProjectPrefixWidth = function (input, text) {
    if (!input || !text) return 0;
    var style = window.getComputedStyle(input);
    var font = [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      style.fontSize,
      style.fontFamily
    ].join(' ');
    var canvas = window.measureProjectPrefixWidth._canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      window.measureProjectPrefixWidth._canvas = canvas;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = font;
    var textWidth = ctx.measureText(text).width || 0;
    return Math.ceil(Math.max(textWidth - 2, 0));
  };

  window.ensureProjectPromptCursor = function () {
    var input = document.getElementById('ia-chat-input');
    var prefix = window.fixedProjectPromptPrefix || '';
    if (!input || !prefix) return;
  };

  window.enforceProjectPrompt = function () {
    var input = document.getElementById('ia-chat-input');
    var prefix = window.fixedProjectPromptPrefix || '';
    if (!input || !prefix) return;
    if (input.value.indexOf(prefix) === 0) {
      input.value = input.value.slice(prefix.length);
    }
  };

  window.syncProjectPrompt = function () {
    var input = document.getElementById('ia-chat-input');
    if (!input) return;
    var newPrefix = window.buildProjectPromptPrefix();
    var prevPrefix = window.fixedProjectPromptPrefix || '';
    var text = input.value || '';
    if (prevPrefix && text.indexOf(prevPrefix) === 0) {
      text = text.slice(prevPrefix.length);
    }
    if (newPrefix) {
      input.value = text;
      var prefixWidth = window.measureProjectPrefixWidth && window.measureProjectPrefixWidth(input, newPrefix);
      window.updateProjectPill && window.updateProjectPill(input, prefixWidth, newPrefix);
      input.style.backgroundColor = 'transparent';
      input.style.color = '#ffffff';
    } else {
      input.value = text;
      window.updateProjectPill && window.updateProjectPill(input, 0, '');
      input.style.backgroundColor = 'transparent';
      input.style.color = '#ececec';
    }
    window.fixedProjectPromptPrefix = newPrefix;
  };

  window.ensureProjectHint = function (input) {
    if (!input) return null;
    var form = input.closest && input.closest('form');
    if (!form) return null;
    var hint = document.getElementById('ia-project-hint');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.id = 'ia-project-hint';
    hint.style.position = 'absolute';
    hint.style.background = '#1f2937';
    hint.style.border = '1px solid #374151';
    hint.style.borderRadius = '0';
    hint.style.color = '#e5e7eb';
    hint.style.fontSize = '12px';
    hint.style.padding = '6px';
    hint.style.boxShadow = '0 10px 24px rgba(0,0,0,0.35)';
    hint.style.zIndex = '5';
    hint.style.display = 'none';
    hint.style.minWidth = '220px';
    hint.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    form.appendChild(hint);
    return hint;
  };

  window.renderProjectHintMenu = function (hint) {
    if (!hint) return;
    var options = [
      'Información',
      'Crea reporte de los paquetes de trabajo',
      '¿Que puedes hacer?'
    ];
    var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
    options.forEach(function (opt) {
      html += '<button type="button" class="ia-project-hint-option" data-value="' + opt + '" ' +
        'style="text-align:left;background:#2f2f2f;border:1px solid #374151;color:#e5e7eb;' +
        'padding:6px 10px;border-radius:0;font-size:12px;cursor:pointer;">' + opt + '</button>';
    });
    html += '</div>';
    hint.innerHTML = html;
  };

  window.showProjectHint = function () {
    var input = document.getElementById('ia-chat-input');
    if (!input) return;
    if (window.currentAgent !== 'cde' || !window.selectedProject) return;
    if ((input.value || '').trim().length > 0) return;
    var hint = window.ensureProjectHint(input);
    if (!hint) return;
    window.renderProjectHintMenu(hint);
    hint.style.display = 'block';
    hint.style.visibility = 'hidden';
    var form = input.closest('form');
    var inputRect = input.getBoundingClientRect();
    var formRect = form.getBoundingClientRect();
    var style = window.getComputedStyle(input);
    var paddingLeft = parseFloat(style.paddingLeft) || 0;
    var left = inputRect.left - formRect.left + paddingLeft;
    var bottom = formRect.bottom - inputRect.top + 6;
    hint.style.left = Math.max(left, 0) + 'px';
    hint.style.top = 'auto';
    hint.style.bottom = Math.max(bottom, 0) + 'px';
    hint.style.display = 'block';
    hint.style.visibility = 'visible';
  };

  window.hideProjectHint = function () {
    var hint = document.getElementById('ia-project-hint');
    if (hint) hint.style.display = 'none';
  };

  window.ensureProjectPill = function (input) {
    if (!input) return null;
    var form = input.closest && input.closest('form');
    if (!form) return null;
    var pill = document.getElementById('ia-project-pill');
    if (pill) return pill;
    pill = document.createElement('span');
    pill.id = 'ia-project-pill';
    pill.style.position = 'absolute';
    pill.style.background = '#F3F4F6';
    pill.style.borderRadius = '0';
    pill.style.pointerEvents = 'none';
    pill.style.zIndex = '1';
    pill.style.color = '#111827';
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.whiteSpace = 'nowrap';
    pill.style.padding = '0 10px';
    form.appendChild(pill);
    return pill;
  };

  window.updateProjectPill = function (input, prefixWidth, prefixText) {
    var pill = window.ensureProjectPill(input);
    if (!pill || !input) return;
    if (!prefixWidth) {
      pill.style.display = 'none';
      if (input.dataset.basePaddingLeft) {
        input.style.paddingLeft = input.dataset.basePaddingLeft;
      }
      return;
    }
    var style = window.getComputedStyle(input);
    if (!input.dataset.basePaddingLeft) {
      input.dataset.basePaddingLeft = style.paddingLeft || '0px';
    }
    var basePaddingLeft = parseFloat(input.dataset.basePaddingLeft) || 0;
    var inputRect = input.getBoundingClientRect();
    var formRect = input.parentElement.getBoundingClientRect();
    var left = inputRect.left - formRect.left + basePaddingLeft - 4;
    var height = Math.max(inputRect.height - 6, 22);
    var top = inputRect.top - formRect.top + (inputRect.height - height) / 2;
    pill.style.display = 'inline-flex';
    pill.textContent = prefixText || '';
    pill.style.fontSize = style.fontSize;
    pill.style.fontFamily = style.fontFamily;
    pill.style.fontWeight = style.fontWeight;
    pill.style.left = Math.max(left, 0) + 'px';
    pill.style.top = Math.max(top - 1, 0) + 'px';
    pill.style.height = height + 'px';
    pill.style.width = 'auto';
    input.style.paddingLeft = (basePaddingLeft + prefixWidth + 24) + 'px';
  };

  window.resetProjectSelection = function () {
    window.selectedProject = null;
    var projectsButton = document.getElementById('ia-projects-button');
    if (!projectsButton) return;
    var buttonSpan = projectsButton.querySelector('span');
    if (!buttonSpan) return;
    var svg = buttonSpan.querySelector('svg');
    buttonSpan.textContent = 'Proyectos';
    if (svg) {
      buttonSpan.appendChild(svg);
    }
  };

  // Event listener para el botón "Proyectos"
  document.addEventListener('click', function (e) {
    // Buscar el botón en la jerarquía de elementos (para manejar clics en hijos como SVG/span)
    var target = e.target;
    var projectsButton = null;
    var closeButton = null;
    var searchButton = null;

    // Buscar hacia arriba en la jerarquía
    while (target && target !== document) {
      if (target.id === 'ia-projects-button') {
        projectsButton = target;
        break;
      }
      if (target.id === 'ia-projects-search-close') {
        closeButton = target;
        break;
      }
      if (target.id === 'ia-projects-search-btn') {
        searchButton = target;
        break;
      }
      target = target.parentElement;
    }

    // Abrir modal de proyectos
    if (projectsButton) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔵 Botón Proyectos clickeado - Abriendo modal');
      window.openProjectsSearchModal();
      return false;
    }

    // Cerrar modal
    if (closeButton) {
      e.preventDefault();
      e.stopPropagation();
      window.closeProjectsSearchModal();
      return false;
    }

    // Buscar proyectos
    if (searchButton) {
      e.preventDefault();
      e.stopPropagation();
      window.searchProjects();
      return false;
    }

    // Cerrar modal al hacer clic en el backdrop
    if (e.target && e.target.id === 'ia-projects-search-modal') {
      window.closeProjectsSearchModal();
    }
  }, true);

  // Enter en el input de búsqueda
  document.addEventListener('keypress', function (e) {
    if (e.target && e.target.id === 'ia-projects-search-input' && e.key === 'Enter') {
      e.preventDefault();
      window.searchProjects();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    window.applySettingsAccessControl && window.applySettingsAccessControl();
    window.resolveIaColabAdminFromServer && window.resolveIaColabAdminFromServer();
    window.bindIaChatVisibilityObserver && window.bindIaChatVisibilityObserver();
    window.normalizeIaChatVisibility && window.normalizeIaChatVisibility();
    window.fixIaGlobalBottomArtifacts && window.fixIaGlobalBottomArtifacts();
    window.bindIaGlobalArtifactObserver && window.bindIaGlobalArtifactObserver();
    window.renderApiProviderList && window.renderApiProviderList();
    window.loadProviderSettings && window.loadProviderSettings();
    window.initMcpPasswordToggle && window.initMcpPasswordToggle();
    window.initIaSettingsAuthModal && window.initIaSettingsAuthModal();
    var saveBtn = document.getElementById('ia-api-provider-show-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.saveProviderSettings && window.saveProviderSettings();
      });
    }

    var watchInputs = [
      'ia-api-provider-select',
      'ia-api-provider-key-input',
      'ia-api-provider-model-select',
      'ia-gemini-provider-key-input',
      'ia-gemini-provider-model-select',
      'ia-openai-provider-key-input',
      'ia-openai-provider-model-select',
      'ia-lightrag-url-input',
      'ia-lightrag-api-key-input',
      'ia-mcp-server-url-input',
      'ia-mcp-server-username-input',
      'ia-mcp-server-password-input',
      'ia-mcp-server-remember-pass'
    ];
      watchInputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', function () {
          window.updateSaveButtonState && window.updateSaveButtonState(window.isProviderConfigDirty());
        });
        el.addEventListener('input', function () {
          window.updateSaveButtonState && window.updateSaveButtonState(window.isProviderConfigDirty());
        });
      });

      document.addEventListener('mousedown', function (e) {
        var option = e.target && e.target.classList && e.target.classList.contains('ia-project-hint-option') ? e.target : null;
        if (!option) return;
        e.preventDefault();
        e.stopPropagation();
        var input = document.getElementById('ia-chat-input');
        if (!input) return;
        var value = option.getAttribute('data-value') || option.textContent || '';
        input.value = value;
        window.syncProjectPrompt && window.syncProjectPrompt();
        input.focus();
        window.hideProjectHint && window.hideProjectHint();
      });

      var lightKeyInput = document.getElementById('ia-lightrag-api-key-input');
    });

  window.addEventListener('resize', function () {
    window.fixIaGlobalBottomArtifacts && window.fixIaGlobalBottomArtifacts();
  });

  console.log('✅ Projects search modal initialized');

})();

// ============================================================================
// MAPA MENTAL (SaraIA Docs)
// ============================================================================

window.attachMindmapButton = function (aiNode, responseText) {
  try {
    var actionsRow = document.createElement('div');
    actionsRow.style.marginTop = '8px';
    actionsRow.style.display = 'flex';
    actionsRow.style.justifyContent = 'flex-start';

    var btn = document.createElement('button');
    btn.textContent = 'Mapa mental';
    btn.style.background = '#5B46E5';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #6d5bf0';
    btn.style.borderRadius = '8px';
    btn.style.padding = '6px 10px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = '600';

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Generando...';
      fetch('/ia_colaborativa/mindmap_report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.getCsrfToken()
        },
        body: JSON.stringify({
          content: responseText,
          title: 'Mapa mental - ' + (window.selectedProject && window.selectedProject.name ? window.selectedProject.name : 'SaraIA Docs')
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.success && data.html) {
            var blob = new Blob([data.html], { type: 'text/html' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'mapa_mental.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            btn.textContent = 'Mapa mental';
          } else {
            btn.textContent = 'Mapa mental';
            alert('No se pudo generar el mapa mental: ' + (data.error || 'Error desconocido'));
          }
        })
        .catch(function (err) {
          console.error('Error generando mapa mental:', err);
          btn.textContent = 'Mapa mental';
          alert('Error generando el mapa mental.');
        })
        .finally(function () {
          btn.disabled = false;
        });
    });

    actionsRow.appendChild(btn);
    aiNode.appendChild(actionsRow);
  } catch (err) {
    console.error('No se pudo adjuntar el botón de mapa mental:', err);
  }
};

// ============================================================================
// REPORTE TECNICO (SaraIA Obra)
// ============================================================================

window.attachReportButton = function (aiNode, reportHtml, filename) {
  try {
    if (!reportHtml) return;
    var actionsRow = document.createElement('div');
    actionsRow.style.marginTop = '8px';
    actionsRow.style.display = 'flex';
    actionsRow.style.justifyContent = 'flex-start';

    var btn = document.createElement('button');
    btn.textContent = 'Reporte tecnico';
    btn.style.background = '#0f172a';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #1f2937';
    btn.style.borderRadius = '8px';
    btn.style.padding = '6px 10px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = '600';

    btn.addEventListener('click', function () {
      var blob = new Blob([reportHtml], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename || 'reporte_tecnico.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    actionsRow.appendChild(btn);
    aiNode.appendChild(actionsRow);
  } catch (err) {
    console.error('No se pudo adjuntar el boton de reporte:', err);
  }
};



