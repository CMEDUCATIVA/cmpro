window.CostosCostTypes = (function () {
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function normalizeDecimal(value) {
    if (!value) {
      return value;
    }

    var trimmed = value.replace(/[\s\u00A0]/g, '').trim();
    if (!trimmed) {
      return '';
    }

    var lastComma = trimmed.lastIndexOf(',');
    var lastDot = trimmed.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        trimmed = trimmed.replace(/\./g, '');
        trimmed = trimmed.replace(',', '.');
      } else {
        trimmed = trimmed.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      trimmed = trimmed.replace(/,/g, '.');
    } else {
      trimmed = trimmed.replace(/,/g, '');
    }

    return trimmed;
  }

  function sanitizeInputs(form) {
    var inputs = form.querySelectorAll('input[data-costos-decimal]');
    inputs.forEach(function (input) {
      var normalized = normalizeDecimal(input.value);
      if (normalized === '') {
        input.value = '';
      } else if (normalized != null) {
        input.value = normalized;
      }
    });
  }

  function attach(form) {
    if (!form || form.dataset.costosDecimalBound === 'true') {
      return;
    }

    form.addEventListener('submit', function () {
      sanitizeInputs(form);
    });

    form.dataset.costosDecimalBound = 'true';
  }

  function init() {
    var forms = document.querySelectorAll('form[data-costos-decimal-form]');
    forms.forEach(attach);
  }

  function addRow(event) {
    event.preventDefault();
    var button = event.currentTarget;
    var tableBody = document.getElementById('rates_body');
    var templateRow = tableBody.querySelector('tr[data-row-target="true"]');

    if (!templateRow) {
      console.error('Costos: Template row not found');
      return;
    }

    // Clonar la fila plantilla
    var newRow = templateRow.cloneNode(true);
    newRow.style.display = '';
    newRow.removeAttribute('data-row-target');

    // Generar un ID único basado en el timestamp
    var uniqueId = new Date().getTime();
    var newIndex = uniqueId;

    // Buscar la celda de fecha y reemplazarla con un input nativo
    var dateCell = newRow.querySelector('td.-no-ellipsis');
    var dateInputName = 'cost_type[new_rate_attributes][' + newIndex + '][valid_from]';
    var dateInputId = 'cost_type_new_rate_attributes_' + newIndex + '_valid_from';

    if (dateCell) {
      // Limpiar el contenido de la celda de fecha
      dateCell.innerHTML = '';

      // Crear un input nativo de tipo date (funcional y confiable)
      var nativeDateInput = document.createElement('input');
      nativeDateInput.type = 'date';
      nativeDateInput.name = dateInputName;
      nativeDateInput.id = dateInputId;
      nativeDateInput.className = 'form--text-field -middle';
      nativeDateInput.required = true;

      // Agregar el nuevo input a la celda
      dateCell.appendChild(nativeDateInput);
    }

    // Actualizar IDs y Names en el RESTO de los inputs (precios, etc)
    var otherInputs = newRow.querySelectorAll('input:not([type="date"]), select, textarea');
    otherInputs.forEach(function (input) {
      // Actualizar name
      if (input.name) {
        input.name = input.name.replace(/\[new_rate_attributes\]\[\]/, '[new_rate_attributes][' + newIndex + ']');
        input.name = input.name.replace(/\[INDEX\]/, '[' + newIndex + ']');
      }

      // Actualizar id
      if (input.id) {
        input.id = input.id.replace(/_INDEX_/g, '_' + newIndex + '_');
      }

      // Limpiar valores
      if (input.type !== 'hidden') {
        input.value = '';
      }
      input.disabled = false;
    });

    // Insertar la nueva fila al final de la tabla
    tableBody.appendChild(newRow);

    console.log('Costos: Row added with native date input (functional)');
  }

  function deleteRow(event) {
    event.preventDefault();
    var button = event.currentTarget;
    var row = button.closest('tr');

    if (row) {
      // Si es una fila existente (tiene ID de base de datos), quizás deberíamos ocultarla y marcar _destroy
      // Pero el comportamiento estándar de este form parece ser simplemente no enviar los datos si se elimina del DOM
      // para registros nuevos. Para existentes, Rails suele necesitar _destroy.
      // Revisando el partial, no hay campo _destroy explícito visible.
      // Asumiremos eliminación del DOM por ahora, similar a como funciona en otros lugares simples.
      row.remove();
    }
  }

  function handleGlobalClick(event) {
    var addBtn = event.target.closest('[data-action="subform#addRow"]');
    if (addBtn) {
      console.log('Costos: Add row clicked');
      addRow({ preventDefault: function () { }, currentTarget: addBtn });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    var deleteBtn = event.target.closest('[data-action="subform#deleteRow"]');
    if (deleteBtn) {
      console.log('Costos: Delete row clicked');
      deleteRow({ preventDefault: function () { }, currentTarget: deleteBtn });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  function setupSubformEmulation() {
    console.log('Costos: Setting up subform emulation');

    // Si ya existe un handler previo, eliminarlo
    if (window.CostosGlobalClickHandler) {
      console.log('Costos: Removing previous listener');
      document.removeEventListener('click', window.CostosGlobalClickHandler);
    }

    // Guardar la referencia del handler en una variable global
    window.CostosGlobalClickHandler = handleGlobalClick;

    // Agregar el listener
    document.addEventListener('click', window.CostosGlobalClickHandler);
    console.log('Costos: Listener added');
  }

  ready(init);
  ready(setupSubformEmulation);
  document.addEventListener('turbo:load', init);
  // No necesitamos llamar a setupSubformEmulation en cada turbo:load si el listener está en document y es persistente.
  // Pero si Turbo reemplaza el body, el listener en document sigue vivo.
  // Sin embargo, para estar seguros y consistentes con el flag:
  document.addEventListener('turbo:load', setupSubformEmulation);
  document.addEventListener('turbolinks:load', init);

  return {
    init: init,
    normalizeDecimal: normalizeDecimal
  };
})();
