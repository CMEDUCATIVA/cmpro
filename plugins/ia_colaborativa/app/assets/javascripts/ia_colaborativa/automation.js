(function() {
  'use strict';

  var state = {
    projectId: 0,
    cards: [],
    isLoading: false,
    isSaving: false,
    loadToken: 0
  };
  var pendingSave = null;
  var dragDropModule = window.PebAutoDragDrop || null;
  var dragConfigureTimer = null;

function defaultFormState() {
  return {
    typeId: 3,
    customId: '3',
    name: '',
    scope: '',
    createWrapper: false
  };
}

function createChild(card) {
  var form = card.formState || defaultFormState();
  var typeOptions = getTypeOptions(card);
  var selectedType = typeOptions.find(function(opt) { return parseInt(opt.id, 10) === parseInt(form.typeId, 10); });
  if (form.createWrapper) {
    var wrapper = {
      id: 'wrap-' + Date.now(),
      name: form.name && form.name.trim() ? form.name.trim() : 'Tarjeta envolvente',
      type_id: parseInt(form.typeId, 10) || 3,
      typeLabel: selectedType ? selectedType.label : 'Tipo',
      collapsed: false,
      children: []
    };
    if (!Array.isArray(card.payload.containers)) card.payload.containers = [];
    card.payload.containers.push(wrapper);
    card.formState = defaultFormState();
    card.formVisible = false;
    queueSaveCard(card, true);
    render();
    return;
  }
  if (!form.name || !form.name.trim()) {
    alert('El nombre del elemento es obligatorio');
    return;
  }
  if (!Array.isArray(card.payload.containers) || !card.payload.containers.length) {
    alert('Primero debes crear una tarjeta envolvente.');
    return;
  }
  if (!form.scope || !card.payload.containers.some(function(c) { return c.id === form.scope; })) {
    form.scope = card.payload.containers[0].id;
  }
  var container = card.payload.containers.find(function(c) { return c.id === form.scope; });
  if (!container) container = card.payload.containers[0];
  container.children = Array.isArray(container.children) ? container.children : [];
  container.children.push({
    id: 'child-' + Date.now(),
    type_id: parseInt(form.typeId, 10) || 3,
    typeLabel: selectedType ? selectedType.label : 'Tipo',
    name: form.name.trim(),
    scope: form.scope || 'general'
  });
  card.formState = defaultFormState();
  card.formVisible = false;
  queueSaveCard(card, true);
  render();
}

  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

function normalizePlan(record) {
  record = record || {};
  var payload = record.payload || {};
  if (!Array.isArray(payload.types)) payload.types = [];
  payload.types = payload.types.map(function(t) {
    return {
      label: t.label || 'Tipo',
      type_id: parseInt(t.type_id || t.id || t.typeId, 10) || 0
    };
  }).filter(function(t) { return t.type_id; });
  if (Array.isArray(payload.children) && payload.children.length) {
    payload.containers = payload.containers || [{
      id: 'wrap-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: 'Tarjeta envolvente',
      type_id: 3,
      typeLabel: 'Fase',
      collapsed: false,
      children: payload.children
    }];
    delete payload.children;
  }
  if (!Array.isArray(payload.containers)) payload.containers = [];
  payload.containers = payload.containers.map(function(container) {
    container = container || {};
    container.id = container.id || ('wrap-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
    container.name = container.name || 'Tarjeta envolvente';
    container.type_id = parseInt(container.type_id || container.typeId || 3, 10) || 3;
    container.typeLabel = container.typeLabel || 'Fase';
    container.collapsed = !!container.collapsed;
    container.children = Array.isArray(container.children) ? container.children : [];
    return container;
  });
  return {
    id: record.id,
    title: record.plan_title || 'Plan de Ejecucion BIM',
    collapsed: !!payload.collapsed,
    payload: {
      collapsed: !!payload.collapsed,
      phases: Array.isArray(payload.phases) ? payload.phases : [],
      containers: payload.containers,
      types: payload.types
    },
      formVisible: false,
      formState: defaultFormState()
    };
  }

  function detectProjectId() {
    var el = document.body;
    if (!el) return 0;
    var value = el.getAttribute('data-project-id') || (el.dataset ? el.dataset.projectId : null);
    var parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  function ensureRoot() {
    return document.getElementById('peb-auto-root');
  }

  function render() {
    var root = ensureRoot();
    if (!root) return;
    root.innerHTML = '';

    var toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.justifyContent = 'flex-end';
    toolbar.style.marginBottom = '12px';

    var newCardBtn = document.createElement('button');
    newCardBtn.type = 'button';
    newCardBtn.textContent = '+ Crear tarjeta madre';
    newCardBtn.style.border = '1px solid #5B46E5';
    newCardBtn.style.background = '#5B46E5';
    newCardBtn.style.color = '#fff';
    newCardBtn.style.padding = '6px 12px';
    newCardBtn.style.borderRadius = '8px';
    newCardBtn.style.cursor = 'pointer';
    newCardBtn.disabled = state.isLoading;
    newCardBtn.addEventListener('click', handleCreateCard);

    toolbar.appendChild(newCardBtn);
    root.appendChild(toolbar);

    if (state.isLoading) {
      var loading = document.createElement('div');
      loading.className = 'peb-tree__empty';
      loading.textContent = 'Cargando automatizaciones...';
      root.appendChild(loading);
      return;
    }

    if (!state.cards.length) {
      var empty = document.createElement('div');
      empty.className = 'peb-tree__empty';
      empty.textContent = 'Aun no hay tarjetas madre. Usa el boton para crear la primera.';
      root.appendChild(empty);
      return;
    }

    state.cards.forEach(function(card) {
      root.appendChild(renderCard(card));
    });
  }

  function renderCard(card) {
    var tree = document.createElement('div');
    tree.className = 'peb-tree';

    var header = document.createElement('div');
    header.className = 'peb-tree__header';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'peb-tree__toggle';
    toggle.textContent = card.collapsed ? '+' : '-';
    toggle.addEventListener('click', function() {
      card.collapsed = !card.collapsed;
      queueSaveCard(card, true);
      render();
    });

    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'peb-tree__title';
    titleInput.value = card.title;
    titleInput.addEventListener('change', function(event) {
      card.title = event.target.value.trim() || 'Plan de Ejecucion BIM';
      queueSaveCard(card);
    });

    var actions = document.createElement('div');
    actions.className = 'peb-tree__actions';

    var createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'peb-tree__create';
    createBtn.textContent = 'Crear';
    createBtn.addEventListener('click', function() {
      card.formVisible = !card.formVisible;
      render();
    });

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'peb-tree__save';
    saveBtn.textContent = 'Guardar';
    saveBtn.addEventListener('click', function() {
      queueSaveCard(card, true);
    });

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '-';
    deleteBtn.className = 'peb-tree__phase-remove';
    deleteBtn.style.width = '32px';
    deleteBtn.style.height = '32px';
    deleteBtn.style.padding = '0';
    deleteBtn.addEventListener('click', function() {
      if (!confirm('Eliminar esta tarjeta madre?')) return;
      deleteCard(card);
    });

    actions.appendChild(createBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(toggle);
    header.appendChild(titleInput);
    header.appendChild(actions);

    tree.appendChild(header);

    if (card.formVisible) {
      tree.appendChild(renderChildCreator(card));
    }

    var body = document.createElement('div');
    body.className = 'peb-tree__body';
    body.style.display = card.collapsed ? 'none' : 'block';

    var containers = card.payload.containers || [];
    if (!containers.length) {
      var message = document.createElement('div');
      message.className = 'peb-tree__empty';
      message.textContent = 'Crea una tarjeta envolvente para alojar tarjetas hijas.';
      body.appendChild(message);
    } else {
      containers.forEach(function(container, index) {
        body.appendChild(renderContainer(card, container, index));
      });
    }

    tree.appendChild(body);

    return tree;
  }

  function renderContainer(card, container, index) {
    var wrapper = document.createElement('div');
    wrapper.className = 'container-card';
    wrapper.style.border = '1px solid #3d3d3d';
    wrapper.style.borderRadius = '10px';
    wrapper.style.padding = '12px';
    wrapper.style.marginBottom = '12px';
    wrapper.setAttribute('draggable', 'true');
    wrapper.draggable = true;

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    var left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    var infoRow = document.createElement('span');
    infoRow.style.display = 'flex';
    infoRow.style.gap = '10px';
    infoRow.style.alignItems = 'center';
    infoRow.style.flexWrap = 'wrap';

    var typeSpan = document.createElement('small');
    typeSpan.style.color = '#a5b4fc';
    typeSpan.style.fontSize = '11px';
    typeSpan.textContent = 'Tipo: ' + (container.typeLabel || 'Tipo');

    var typeIdSpan = document.createElement('small');
    typeIdSpan.style.color = '#a5b4fc';
    typeIdSpan.style.fontSize = '11px';
    typeIdSpan.textContent = 'type_id: ' + (container.type_id || container.typeId || 'N/A');

    var nameStrong = document.createElement('strong');
    nameStrong.style.color = '#fff';
    nameStrong.textContent = container.name || 'Tarjeta envolvente';

    infoRow.appendChild(typeSpan);
    infoRow.appendChild(typeIdSpan);
    infoRow.appendChild(nameStrong);
    left.appendChild(infoRow);

    var headerActions = document.createElement('div');
    headerActions.style.display = 'flex';
    headerActions.style.alignItems = 'center';
    headerActions.style.gap = '6px';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'peb-tree__toggle';
    toggle.textContent = container.collapsed ? '+' : '-';
    toggle.addEventListener('click', function() {
      container.collapsed = !container.collapsed;
      queueSaveCard(card, true);
      render();
    });

    var removeContainerBtn = document.createElement('button');
    removeContainerBtn.type = 'button';
    removeContainerBtn.textContent = '-';
    removeContainerBtn.className = 'peb-tree__phase-remove';
    removeContainerBtn.style.width = '28px';
    removeContainerBtn.style.height = '28px';
    removeContainerBtn.style.padding = '0';
    removeContainerBtn.addEventListener('click', function() {
      if (!confirm('Eliminar esta tarjeta envolvente y sus hijos?')) return;
      card.payload.containers.splice(index, 1);
      queueSaveCard(card, true);
      render();
    });

    headerActions.appendChild(toggle);
    headerActions.appendChild(removeContainerBtn);

    header.appendChild(left);
    header.appendChild(headerActions);
    wrapper.appendChild(header);
    if (!dragDropModule) ensureDragDropModule();
    if (dragDropModule && typeof dragDropModule.bindContainer === 'function') {
      dragDropModule.bindContainer(wrapper, card, index, header);
    }

    var content = document.createElement('div');
    content.style.marginTop = '10px';
    content.style.display = container.collapsed ? 'none' : 'block';
    if (!dragDropModule) ensureDragDropModule();
    if (dragDropModule && typeof dragDropModule.bindDropZone === 'function') {
      dragDropModule.bindDropZone(content, card, container);
    }
    var children = container.children || [];
    if (!children.length) {
      var empty = document.createElement('div');
      empty.className = 'peb-tree__empty';
      empty.textContent = 'Aun no hay tarjetas hijas en este envolvente.';
      content.appendChild(empty);
    } else {
      children.forEach(function(child, childIndex) {
        var row = document.createElement('div');
        row.className = 'peb-tree__phase-card child-card';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.gap = '12px';
        row.style.padding = '8px 12px';
        row.style.marginBottom = '8px';
        row.style.border = '1px solid #2c2c34';
        row.style.borderRadius = '8px';
        row.setAttribute('draggable', 'true');
        row.draggable = true;
        if (!dragDropModule) ensureDragDropModule();
        if (dragDropModule && typeof dragDropModule.bindChild === 'function') {
          dragDropModule.bindChild(row, card, container, childIndex);
        }

        var label = document.createElement('div');
        label.style.display = 'flex';
        label.style.flexDirection = 'column';
        var infoRow = document.createElement('span');
        infoRow.style.display = 'flex';
        infoRow.style.gap = '8px';
        infoRow.style.alignItems = 'center';
        infoRow.style.flexWrap = 'wrap';

        var typeSpan = document.createElement('small');
        typeSpan.style.color = '#a5b4fc';
        typeSpan.textContent = 'Tipo: ' + (child.typeLabel || ('Tipo ' + child.type_id));

        var typeIdSpan = document.createElement('small');
        typeIdSpan.style.color = '#a5b4fc';
        typeIdSpan.textContent = 'type_id: ' + (child.type_id || child.typeId || 'N/A');

        infoRow.appendChild(typeSpan);
        infoRow.appendChild(typeIdSpan);
        label.appendChild(infoRow);

        var nameSmall = document.createElement('small');
        nameSmall.style.color = '#cbd5f5';
        nameSmall.textContent = child.name || 'Sin nombre';
        label.appendChild(nameSmall);

        var actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.alignItems = 'center';
        actions.style.gap = '4px';

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '-';
        removeBtn.className = 'peb-tree__phase-remove';
        removeBtn.style.width = '28px';
        removeBtn.style.height = '28px';
        removeBtn.style.padding = '0';
        removeBtn.addEventListener('click', function() {
          if (!confirm('Eliminar esta tarjeta hija?')) return;
          container.children.splice(childIndex, 1);
          queueSaveCard(card, true);
          render();
        });

        actions.appendChild(removeBtn);

        row.appendChild(label);
        row.appendChild(actions);
        content.appendChild(row);
      });
    }

    wrapper.appendChild(content);
    return wrapper;
  }

  function renderChildCreator(card) {
    var form = card.formState || (card.formState = defaultFormState());
    var containers = Array.isArray(card.payload.containers) ? card.payload.containers : [];
    var panel = document.createElement('div');
    panel.className = 'peb-tree__creator';

    var grid = document.createElement('div');
    grid.className = 'peb-tree__creator-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
    grid.style.gap = '12px';

    var typeField = document.createElement('div');
    typeField.className = 'peb-tree__creator-field';
    var typeLabel = document.createElement('label');
    typeLabel.className = 'peb-tree__creator-field-label';
    typeLabel.textContent = 'Tipo';
    var typeSelect = document.createElement('select');
    typeSelect.className = 'peb-tree__creator-select';
    getTypeOptions(card).forEach(function(opt, idx) {
      var optionWrapper = document.createElement('div');
      optionWrapper.style.display = 'flex';
      optionWrapper.style.flexDirection = 'column';
    });

    getTypeOptions(card).forEach(function(opt) {
      var option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.label + ' (' + opt.id + ')';
      if (parseInt(form.typeId, 10) === opt.id) option.selected = true;
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener('change', function(e) {
      form.typeId = parseInt(e.target.value, 10) || 3;
      form.customId = String(form.typeId);
      if (idInput) {
        idInput.value = form.customId;
      }
    });
    typeField.appendChild(typeLabel);
    typeField.appendChild(typeSelect);

    var idField = document.createElement('div');
    idField.className = 'peb-tree__creator-field';
    var idLabel = document.createElement('label');
    idLabel.className = 'peb-tree__creator-field-label';
    idLabel.textContent = 'type_id';
    var idInput = document.createElement('input');
    idInput.type = 'number';
    idInput.className = 'peb-tree__creator-input';
    idInput.value = form.customId;
    idInput.addEventListener('input', function(e) {
      form.customId = e.target.value;
    });
    idField.appendChild(idLabel);
    idField.appendChild(idInput);

    var updateField = document.createElement('div');
    updateField.className = 'peb-tree__creator-field';
    var updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'peb-tree__creator-submit';
    updateButton.textContent = 'Actualizar ID';
    updateButton.addEventListener('click', function() {
      if (!Array.isArray(card.payload.types)) card.payload.types = [];
      var selectedId = parseInt(form.typeId, 10);
      var entry = card.payload.types.find(function(t) { return parseInt(t.type_id || t.id || t.typeId, 10) === selectedId; });
      var typeOptions = getTypeOptions(card);
      var selectedOption = typeOptions.find(function(opt) { return opt.id === selectedId; });
      var newId = prompt('Nuevo type_id numerico para "' + (selectedOption ? selectedOption.label : 'Tipo personalizado') + '"', form.customId);
      var parsed = parseInt(newId, 10);
      if (isNaN(parsed)) {
        alert('Debes ingresar un ID numerico');
        return;
      }
      var allowOverride = !entry && selectedOption;
      var labelToUse = entry ? entry.label : (selectedOption ? selectedOption.label : 'Tipo personalizado');
      if (typeExists(card, labelToUse, parsed, entry, allowOverride)) {
        alert('Ya existe un tipo con ese type_id');
        return;
      }
      if (!entry) {
        entry = {
          label: labelToUse,
          type_id: parsed
        };
        card.payload.types.push(entry);
      } else {
        entry.type_id = parsed;
      }
      form.typeId = parsed;
      form.customId = String(parsed);
      render();
      queueSaveCard(card, true);
    });
    updateField.appendChild(updateButton);

    var addField = document.createElement('div');
    addField.className = 'peb-tree__creator-field';
    var addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'peb-tree__creator-submit';
    addButton.textContent = '+';
    addButton.addEventListener('click', function() {
      openCustomTypeModal(card, form);
    });
    addField.appendChild(addButton);

    grid.appendChild(typeField);
    grid.appendChild(idField);
    grid.appendChild(updateField);
    grid.appendChild(addField);

    var nameField = document.createElement('div');
    nameField.className = 'peb-tree__creator-field';
    nameField.style.gridColumn = '1 / -1';
    var nameLabel = document.createElement('label');
    nameLabel.className = 'peb-tree__creator-field-label';
    nameLabel.textContent = 'Nombre del elemento';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'peb-tree__creator-input';
    nameInput.placeholder = 'Ej: Coordinacion Arquitectura';
    nameInput.value = form.name;
    nameInput.addEventListener('input', function(e) {
      form.name = e.target.value;
    });
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);
    grid.appendChild(nameField);

    var wrapperField = document.createElement('div');
    wrapperField.className = 'peb-tree__creator-field';
    wrapperField.style.gridColumn = '1 / -1';
    var wrapperLabel = document.createElement('label');
    wrapperLabel.className = 'peb-tree__creator-field-label';
    wrapperLabel.textContent = 'Crear una tarjeta envolvente';
    var wrapperToggle = document.createElement('input');
    wrapperToggle.type = 'checkbox';
    wrapperToggle.className = 'peb-tree__creator-checkbox';
    wrapperToggle.checked = !!form.createWrapper;
    wrapperToggle.style.marginRight = '8px';
    wrapperToggle.addEventListener('change', function(e) {
      form.createWrapper = e.target.checked;
      updateScopeState();
    });
    var wrapperHint = document.createElement('span');
    wrapperHint.textContent = 'Envolvente para agrupar tarjetas hijas (drag & drop).';
    wrapperHint.style.fontSize = '12px';
    wrapperHint.style.color = '#94a3b8';
    var wrapperRow = document.createElement('div');
    wrapperRow.style.display = 'flex';
    wrapperRow.style.alignItems = 'center';
    wrapperRow.appendChild(wrapperToggle);
    var wrapperText = document.createElement('strong');
    wrapperText.textContent = 'Activar envolvente';
    wrapperRow.appendChild(wrapperText);
    wrapperField.appendChild(wrapperLabel);
    wrapperField.appendChild(wrapperRow);
    wrapperField.appendChild(wrapperHint);
    grid.appendChild(wrapperField);

    var scopeField = document.createElement('div');
    scopeField.className = 'peb-tree__creator-field';
    scopeField.style.gridColumn = '1 / -1';
    var scopeLabel = document.createElement('label');
    scopeLabel.className = 'peb-tree__creator-field-label';
    scopeLabel.textContent = 'Alcance / Fase';
    var scopeSelect = document.createElement('select');
    scopeSelect.className = 'peb-tree__creator-select';
    if (!containers.length) {
      var placeholder = document.createElement('option');
      placeholder.textContent = 'Crea una tarjeta envolvente primero';
      placeholder.disabled = true;
      placeholder.selected = true;
      scopeSelect.appendChild(placeholder);
    } else {
      var validScope = containers.some(function(c) { return c.id === form.scope; });
      if (!validScope) {
        form.scope = containers[0].id;
      }
      containers.forEach(function(container) {
        var option = document.createElement('option');
        option.value = container.id;
        option.textContent = container.name || 'Tarjeta envolvente';
        if (form.scope === container.id) option.selected = true;
        scopeSelect.appendChild(option);
      });
    }
    scopeSelect.addEventListener('change', function(e) {
      form.scope = e.target.value;
    });
    scopeField.appendChild(scopeLabel);
    scopeField.appendChild(scopeSelect);
    grid.appendChild(scopeField);

    function updateScopeState() {
      var hasContainers = containers.length > 0;
      scopeSelect.disabled = form.createWrapper || !hasContainers;
      scopeField.style.opacity = (form.createWrapper || !hasContainers) ? '0.5' : '1';
    }
    updateScopeState();

    var actions = document.createElement('div');
    actions.className = 'peb-tree__creator-actions';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'peb-tree__creator-cancel';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function() {
      card.formVisible = false;
      card.formState = defaultFormState();
      render();
    });

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'peb-tree__creator-submit';
    submitBtn.textContent = 'Crear';
    submitBtn.addEventListener('click', function() {
      createChild(card);
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);

    panel.appendChild(grid);
    panel.appendChild(actions);
    return panel;
  }

  function getTypeOptions(card) {
    var base = [
      { id: 3, label: 'Fase' },
      { id: 1, label: 'Tarea' },
      { id: 2, label: 'Hito' }
    ];
    var extras = Array.isArray(card.payload.types) ? card.payload.types : [];
    var extrasNormalized = extras.map(function(t, idx) {
      return {
        id: parseInt(t.type_id || t.id || t.typeId, 10) || 0,
        label: t.label || 'Tipo',
        _idx: idx
      };
    }).filter(function(opt) { return opt.id; });

    var used = new Set();
    var options = [];

    base.forEach(function(opt) {
      var override = extrasNormalized.find(function(extra) {
        return !used.has(extra._idx) && extra.label.toLowerCase() === opt.label.toLowerCase();
      });
      if (override) {
        options.push({ id: override.id, label: override.label });
        used.add(override._idx);
      } else {
        options.push(opt);
      }
    });

    extrasNormalized.forEach(function(extra) {
      if (!used.has(extra._idx)) {
        options.push({ id: extra.id, label: extra.label });
      }
    });
    return options;
  }


  function openCustomTypeModal(card, form) {
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.75)';
    overlay.style.zIndex = '10001';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    var modal = document.createElement('div');
    modal.style.background = '#1f1f24';
    modal.style.border = '1px solid #3d3d3d';
    modal.style.borderRadius = '12px';
    modal.style.padding = '20px';
    modal.style.width = '320px';
    modal.style.color = '#f8fafc';
    modal.style.boxShadow = '0 20px 60px rgba(0,0,0,0.4)';

    var title = document.createElement('h3');
    title.textContent = 'Nuevo tipo personalizado';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    modal.appendChild(title);

    var nameLabel = document.createElement('label');
    nameLabel.textContent = 'Nombre del tipo';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '6px';
    modal.appendChild(nameLabel);

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.style.width = '100%';
    nameInput.style.padding = '6px 10px';
    nameInput.style.borderRadius = '8px';
    nameInput.style.border = '1px solid #3d3d3d';
    nameInput.style.background = 'transparent';
    nameInput.style.color = '#f8fafc';
    nameInput.placeholder = 'Ej: Tipo Subfase';
    modal.appendChild(nameInput);

    var idLabel = document.createElement('label');
    idLabel.textContent = 'type_id';
    idLabel.style.display = 'block';
    idLabel.style.margin = '12px 0 6px';
    modal.appendChild(idLabel);

    var idInput = document.createElement('input');
    idInput.type = 'number';
    idInput.style.width = '100%';
    idInput.style.padding = '6px 10px';
    idInput.style.borderRadius = '8px';
    idInput.style.border = '1px solid #3d3d3d';
    idInput.style.background = 'transparent';
    idInput.style.color = '#f8fafc';
    idInput.placeholder = 'Ej: 10';
    modal.appendChild(idInput);

    var actions = document.createElement('div');
    actions.style.marginTop = '16px';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.border = '1px solid #3d3d3d';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.color = '#cbd5f5';
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.addEventListener('click', function() {
      overlay.remove();
    });

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Guardar';
    saveBtn.style.border = '1px solid #5B46E5';
    saveBtn.style.background = '#5B46E5';
    saveBtn.style.color = '#fff';
    saveBtn.style.padding = '6px 12px';
    saveBtn.style.borderRadius = '8px';
    saveBtn.addEventListener('click', function() {
      var label = nameInput.value && nameInput.value.trim();
      var typeIdValue = parseInt(idInput.value, 10);
      if (!label) {
        alert('El nombre del tipo es obligatorio');
        return;
      }
      if (isNaN(typeIdValue)) {
        alert('El type_id debe ser numerico');
        return;
      }
      if (typeExists(card, label, typeIdValue)) {
        alert('Ya existe un tipo con ese nombre o type_id');
        return;
      }
      if (!Array.isArray(card.payload.types)) card.payload.types = [];
      card.payload.types.push({ label: label, type_id: typeIdValue });
      form.typeId = typeIdValue;
      form.customId = String(typeIdValue);
      overlay.remove();
      queueSaveCard(card, true);
      render();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function typeExists(card, label, typeId, ignoreEntry, allowOverrideLabel) {
    var normalizedLabel = (label || '').trim().toLowerCase();
    var normalizedId = parseInt(typeId, 10);
    var options = getTypeOptions(card);
    return options.some(function(opt) {
      if (allowOverrideLabel && opt.label.toLowerCase() === normalizedLabel) {
        return false;
      }
      if (ignoreEntry && opt.label === (ignoreEntry.label || '') && opt.id === (ignoreEntry.type_id || ignoreEntry.id)) {
        return false;
      }
      return opt.label.toLowerCase() === normalizedLabel || opt.id === normalizedId;
    });
  }

  function queueSaveCard(card, immediate) {
    if (!card || !card.id) return;
    clearTimeout(pendingSave);
    pendingSave = setTimeout(function() {
      saveCard(card);
    }, immediate ? 0 : 500);
  }

  function ensureDragDropModule() {
    if (dragDropModule) return true;
    dragDropModule = window.PebAutoDragDrop || dragDropModule;
    return !!dragDropModule;
  }

  function configureDragDropModule() {
    if (!ensureDragDropModule() || typeof dragDropModule.configure !== 'function') {
      if (!dragConfigureTimer) {
        dragConfigureTimer = setTimeout(function() {
          dragConfigureTimer = null;
          configureDragDropModule();
        }, 250);
      }
      return;
    }
    dragDropModule.configure({
      queueSaveCard: queueSaveCard,
      render: render
    });
  }

  function handleCreateCard() {
    openCardCreationModal();
  }

  function openCardCreationModal() {
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.75)';
    overlay.style.zIndex = '10001';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    var modal = document.createElement('div');
    modal.style.background = '#1f1f24';
    modal.style.border = '1px solid #3d3d3d';
    modal.style.borderRadius = '12px';
    modal.style.padding = '20px';
    modal.style.width = '360px';
    modal.style.color = '#f8fafc';
    modal.style.boxShadow = '0 20px 60px rgba(0,0,0,0.4)';

    var title = document.createElement('h3');
    title.textContent = 'Nueva tarjeta madre';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '18px';
    modal.appendChild(title);

    var label = document.createElement('label');
    label.textContent = 'Nombre';
    label.style.display = 'block';
    label.style.marginBottom = '6px';
    modal.appendChild(label);

    var input = document.createElement('input');
    input.type = 'text';
    input.value = 'Plan de Ejecucion BIM';
    input.style.width = '100%';
    input.style.padding = '8px 12px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid #3d3d3d';
    input.style.background = 'transparent';
    input.style.color = '#f8fafc';
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    modal.appendChild(input);

    var actions = document.createElement('div');
    actions.style.marginTop = '16px';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.border = '1px solid #3d3d3d';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.color = '#cbd5f5';
    cancelBtn.style.padding = '6px 12px';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.addEventListener('click', function() {
      overlay.remove();
    });

    var createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.textContent = 'Crear';
    createBtn.style.border = '1px solid #5B46E5';
    createBtn.style.background = '#5B46E5';
    createBtn.style.color = '#fff';
    createBtn.style.padding = '6px 16px';
    createBtn.style.borderRadius = '8px';
    createBtn.addEventListener('click', submit);

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function submit() {
      var name = (input.value || '').trim();
      if (!name) {
        input.focus();
        return;
      }
      overlay.remove();
      createMotherCard(name);
    }
  }

  function createMotherCard(title) {
    var payload = { collapsed: false, phases: [], containers: [], types: [] };
    var body = {
      plan: {
        plan_title: title || 'Plan de Ejecucion BIM',
        project_id: state.projectId,
        payload: payload
      },
      project_id: state.projectId
    };
    persistPlan(body, function(plan) {
      insertNewCard(plan);
      render();
      loadCards();
    });
  }

  function insertNewCard(plan) {
    if (!plan) return;
    if (state.cards.length === 1 && !state.cards[0].id) {
      state.cards = [];
    }
    state.cards.unshift(plan);
  }

  function saveCard(card) {
    var payload = card.payload || {};
    payload.collapsed = !!card.collapsed;
    var body = {
      plan: {
        id: card.id,
        plan_title: card.title,
        project_id: state.projectId,
        payload: payload
      },
      project_id: state.projectId
    };
    persistPlan(body, function(updated) {
      var index = state.cards.findIndex(function(c) { return c.id === updated.id; });
      if (index >= 0) state.cards[index] = updated;
      render();
    });
  }

  function persistPlan(body, callback) {
    state.isSaving = true;
    render();
    fetch('/ia_colaborativa/peb_auto', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      body: JSON.stringify(body)
    })
      .then(function(response) { return response.json(); })
      .then(function(data) {
        if (data && data.success && data.plan) {
          var normalized = normalizePlan(data.plan);
          if (callback) callback(normalized);
        }
      })
      .catch(function() {})
      .finally(function() {
        state.isSaving = false;
        render();
      });
  }

  function deleteCard(card) {
    if (!card.id) {
      state.cards = state.cards.filter(function(c) { return c !== card; });
      if (!state.cards.length) {
        state.cards.push(normalizePlan({ plan_title: 'Plan de Ejecucion BIM', payload: { collapsed: false } }));
      }
      render();
      return;
    }
    var payload = {
      plan: {
        id: card.id,
        plan_title: card.title,
        project_id: state.projectId,
        payload: card.payload || {}
      },
      project_id: state.projectId,
      _delete: true
    };
    state.isSaving = true;
    render();
    fetch('/ia_colaborativa/peb_auto', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': getCsrfToken()
      },
      body: JSON.stringify(payload)
    })
      .then(function(response) { return response.json(); })
      .then(function(data) {
        if (data && data.success) {
          state.cards = state.cards.filter(function(c) { return c.id !== card.id; });
        }
      })
      .catch(function() {})
      .finally(function() {
        state.isSaving = false;
        if (!state.cards.length) {
          state.cards.push(normalizePlan({ plan_title: 'Plan de Ejecucion BIM', payload: { collapsed: false } }));
        }
        render();
      });
  }

  function loadCards() {
    var token = Date.now();
    state.loadToken = token;
    state.isLoading = true;
    render();
    var url = '/ia_colaborativa/peb_auto';
    if (state.projectId) url += '?project_id=' + encodeURIComponent(state.projectId);
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(response) { return response.json(); })
      .then(function(data) {
        if (state.loadToken !== token) return;
        if (data && data.success && Array.isArray(data.plans)) {
          state.cards = data.plans.map(normalizePlan);
        } else {
          state.cards = [];
        }
      })
      .catch(function() {
        if (state.loadToken !== token) return;
        state.cards = [];
      })
      .finally(function() {
        if (state.loadToken !== token) return;
        state.isLoading = false;
        if (!state.cards.length) {
          state.cards.push(normalizePlan({ plan_title: 'Plan de Ejecucion BIM', payload: { collapsed: false } }));
        }
        render();
      });
  }

  configureDragDropModule();

  function init() {
    configureDragDropModule();
    var root = ensureRoot();
    if (!root) return;
    state.projectId = detectProjectId();
    loadCards();
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('turbo:load', init);
  document.addEventListener('peb:auto:drag-ready', function() {
    if (dragConfigureTimer) {
      clearTimeout(dragConfigureTimer);
      dragConfigureTimer = null;
    }
    configureDragDropModule();
  });
})();
