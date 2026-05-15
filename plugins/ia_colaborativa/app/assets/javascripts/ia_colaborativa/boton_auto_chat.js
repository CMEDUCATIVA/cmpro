(function () {
  'use strict';

  /**
   * Renderiza botones adicionales para respuestas de work_packages.
   * @param {HTMLElement} messageContainer - contenedor del mensaje IA.
   * @param {Array<{label:string,value:string}>} buttons - lista de botones a mostrar.
   */
  window.renderWorkPackageButtons = function (messageContainer, buttons) {
    if (!messageContainer) return;
    var list = Array.isArray(buttons) && buttons.length ? buttons : [
      { label: 'Planificación', value: 'planificacion de paquetes de trabajo' },
      { label: 'Ver paquetes abiertos', value: 'mostrar paquetes de trabajo' },
      { label: 'Filtrar por estado', value: 'paquetes de trabajo abiertos' }
    ];

    var container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '8px';
    container.style.marginTop = '6px';

    list.forEach(function (btnData) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = btnData.label || 'Acción';
      btn.style.border = '1px solid #5B46E5';
      btn.style.background = 'rgba(91,70,229,0.12)';
      btn.style.color = '#ececec';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '8px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '600';

      btn.addEventListener('click', function () {
        // Forzar intención planificación al enviar
        window.iaForcedIntent = 'planning';
        var input = document.getElementById('ia-chat-input');
        if (input) {
          input.value = btnData.value || btnData.label || '';
          input.focus();
        }
        // Lanzar submit del formulario para enviar la petición
        var form = document.getElementById('ia-chat-form');
        if (form) {
          var event = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(event);
        }
      });

      container.appendChild(btn);
    });

    var target = messageContainer.querySelector('.ia-option-buttons') || messageContainer;
    target.style.display = 'flex';
    target.appendChild(container);
  };
})();
