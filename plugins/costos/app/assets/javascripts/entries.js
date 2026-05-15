window.CostosEntries = (function() {
  var selectWatchObserver = null;

  function debug() {
    if (!window.console || !window.console.info) {
      return;
    }
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[CostosEntries]');
    window.console.info.apply(window.console, args);
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function initCombobox() {
    debug('Inicializando combobox...');
    var select = document.getElementById('cost_entry_cost_type_id');
    if (!select || select.dataset.costosCombobox === 'true') {
      if (!select) {
        debug('No se encontró el select cost_entry_cost_type_id. Esperando...');
        watchForSelect();
      }
      return;
    }

    var placeholder = select.dataset.comboboxPlaceholder ||
      window.CostosEntriesPlaceholder ||
      'Busca y selecciona un tipo de costo';

    var optionsData = [];
    var lookup = {};

    function rebuildOptions() {
      optionsData = Array.prototype.map.call(select.options, function(option) {
        var label = option.textContent.trim();
        var value = option.value;
        if (!label && !value) {
          return null;
        }
        return {
          label: label,
          labelLower: label.toLowerCase(),
          value: value
        };
      }).filter(Boolean);

      lookup = {};
      optionsData.forEach(function(item) {
        lookup[item.labelLower] = item.value;
      });
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'cost-type-combobox';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cost-type-combobox__input form--text-field';
    input.setAttribute('autocomplete', 'off');
    if (placeholder) {
      input.setAttribute('placeholder', placeholder);
    }

    var dropdown = document.createElement('div');
    dropdown.className = 'cost-type-combobox__dropdown';
    dropdown.setAttribute('role', 'listbox');
    document.body.appendChild(dropdown);

    rebuildOptions();
    debug('Tipos de costo detectados:', optionsData.length);

    var body = document.body;
    var shouldPrefill = body &&
      (body.classList.contains('action-edit') || body.classList.contains('action-update'));

    var selectedOption = select.options[select.selectedIndex];
    if (selectedOption && shouldPrefill) {
      input.value = selectedOption.textContent.trim();
    }

    function syncSelect() {
      var typed = input.value.trim().toLowerCase();
      var value = lookup[typed];
      if (value) {
        select.value = value;
        input.classList.remove('cost-type-combobox__input--invalid');
      } else {
        select.value = '';
        input.classList.add('cost-type-combobox__input--invalid');
      }

      var event = new Event('change', { bubbles: true });
      select.dispatchEvent(event);
    }

    function renderDropdown() {
      rebuildOptions();
      var query = input.value.trim().toLowerCase();
      var matches = optionsData.filter(function(item) {
        return !query || item.labelLower.indexOf(query) !== -1;
      }).slice(0, 10);

      dropdown.innerHTML = '';
      positionDropdown();
      debug('renderDropdown', query || '(vacío)');
      if (!matches.length) {
        var empty = document.createElement('div');
        empty.className = 'cost-type-combobox__empty';
        empty.textContent = window.I18n && window.I18n.t
          ? window.I18n.t('costs.text_no_cost_types', { defaultValue: 'No hay tipos de costo disponibles' })
          : 'No hay tipos de costo disponibles';
        dropdown.appendChild(empty);
        dropdown.classList.add('is-visible');
        debug('No hay coincidencias');
        return;
      }

      matches.forEach(function(item) {
        var optionNode = document.createElement('button');
        optionNode.type = 'button';
        optionNode.className = 'cost-type-combobox__option';
        optionNode.textContent = item.label;
        optionNode.dataset.value = item.value;
        dropdown.appendChild(optionNode);
      });

      dropdown.classList.add('is-visible');
      debug('Mostrando', matches.length, 'opciones');
    }

    input.addEventListener('input', function() {
      renderDropdown();
      syncSelect();
    });

    function showDropdown() {
      debug('Mostrar dropdown');
      renderDropdown();
    }

    input.addEventListener('focus', showDropdown);
    input.addEventListener('click', showDropdown);

    input.addEventListener('blur', function() {
      setTimeout(function() {
        dropdown.classList.remove('is-visible');
        syncSelect();
      }, 120);
    });

    window.addEventListener('scroll', function() {
      if (dropdown.classList.contains('is-visible')) {
        positionDropdown();
      }
    }, true);
    window.addEventListener('resize', function() {
      if (dropdown.classList.contains('is-visible')) {
        positionDropdown();
      }
    });

    dropdown.addEventListener('mousedown', function(event) {
      event.preventDefault();
    });

    dropdown.addEventListener('click', function(event) {
      var button = event.target.closest('.cost-type-combobox__option');
      if (!button) {
        return;
      }
      var label = button.textContent.trim();
      var value = button.dataset.value;
      input.value = label;
      select.value = value;
      input.classList.remove('cost-type-combobox__input--invalid');
      dropdown.classList.remove('is-visible');
      var changeEvent = new Event('change', { bubbles: true });
      select.dispatchEvent(changeEvent);
    });

    select.addEventListener('change', function() {
      var option = select.options[select.selectedIndex];
      if (option) {
        input.value = option.textContent.trim();
        input.classList.remove('cost-type-combobox__input--invalid');
      }
    });

    var parent = select.parentNode;
    parent.insertBefore(wrapper, select);
    wrapper.appendChild(input);
    wrapper.appendChild(select);

    var observer = new MutationObserver(function() {
      rebuildOptions();
      if (document.activeElement === input) {
        renderDropdown();
      } else {
        dropdown.classList.remove('is-visible');
      }
    });
    observer.observe(select, { childList: true, subtree: true });

    function positionDropdown() {
      var rect = input.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.top = (rect.bottom + 6) + 'px';
      dropdown.style.width = rect.width + 'px';
    }

    select.style.display = 'none';
    select.dataset.costosCombobox = 'true';
    debug('Combobox listo.');
  }

  ready(initCombobox);
  document.addEventListener('turbo:load', initCombobox);
  document.addEventListener('turbolinks:load', initCombobox);

  return {
    init: initCombobox
  };

  function watchForSelect() {
    if (selectWatchObserver) {
      return;
    }
    selectWatchObserver = new MutationObserver(function() {
      var target = document.getElementById('cost_entry_cost_type_id');
      if (target) {
        debug('Select encontrado dinámicamente, inicializando...');
        selectWatchObserver.disconnect();
        selectWatchObserver = null;
        initCombobox();
      }
    });
    selectWatchObserver.observe(document.body, { childList: true, subtree: true });
  }
})();
