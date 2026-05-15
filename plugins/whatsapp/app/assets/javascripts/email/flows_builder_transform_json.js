/* eslint-disable no-var, prefer-arrow-callback */
(function () {
  if (typeof FlowBuilder === "undefined") return;

  FlowBuilder.prototype.getCrmMappings = function () {
    var nodes = Array.isArray(this.nodes) ? this.nodes : [];
    var mappings = [];
    nodes.forEach(function (node) {
      if (!node || node.type !== "transform_json") return;
      var data = node.data || {};
      var list = Array.isArray(data.mappings) ? data.mappings : [];
      list.forEach(function (mapping) {
        if (!mapping || mapping.target_type !== "field") return;
        if (!mapping.source || !mapping.target) return;
        mappings.push(mapping);
      });
    });
    return mappings;
  };

  FlowBuilder.prototype.getMappingLabel = function (mapping) {
    if (!mapping) return "";
    if (mapping.target && mapping.target.indexOf("custom:") === 0) {
      return "Custom: " + mapping.target.replace("custom:", "");
    }
    var meta = this.getFieldMeta(mapping.target);
    return meta && meta.label ? meta.label : mapping.target;
  };

  FlowBuilder.prototype.renderTransformJsonPanel = function (node, data, fieldOptions) {
    if (!this.propertiesBody || !node) return;
    var self = this;
    var mappings = Array.isArray(data.mappings) ? data.mappings : [];
    if (!mappings.length) {
      mappings.push({ source: "", target_type: "field", target: "first_name" });
      data.mappings = mappings;
    }

    var mappingTitle = document.createElement("div");
    mappingTitle.className = "op-email-email--panel-title";
    mappingTitle.textContent = "Agregar a CRM";
    self.propertiesBody.appendChild(mappingTitle);

    function addField(label, input) {
      var wrapper = document.createElement("div");
      if (label) {
        var lab = document.createElement("label");
        lab.textContent = label;
        wrapper.appendChild(lab);
      }
      wrapper.appendChild(input);
      self.propertiesBody.appendChild(wrapper);
    }

    mappings.forEach(function (mapping, idx) {
      var row = document.createElement("div");
      row.className = "op-email-email--flow-map-row";

      var header = document.createElement("button");
      header.type = "button";
      header.className = "op-email-email--flow-map-header";
      header.innerHTML =
        '<span>Mapeo ' + (idx + 1) + '</span>' +
        '<span class="op-email-email--flow-map-chevron">›</span>';

      var body = document.createElement("div");
      body.className = "op-email-email--flow-map-body";

      var sourceInput = document.createElement("input");
      sourceInput.type = "text";
      sourceInput.className = "op-email-email--flow-input";
      sourceInput.placeholder = "Ruta JSON (ej: data.user.email)";
      sourceInput.value = mapping.source || "";
      sourceInput.addEventListener("input", function () {
        mapping.source = sourceInput.value;
        self.markDirty();
      });

      var typeSelect = document.createElement("select");
      typeSelect.className = "op-email-email--flow-select";
      [
        { value: "field", label: "Campo contacto" },
        { value: "variable", label: "Variable" }
      ].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        typeSelect.appendChild(option);
      });
      typeSelect.value = mapping.target_type || "field";

      var targetField = document.createElement("select");
      targetField.className = "op-email-email--flow-select";
      fieldOptions.forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        targetField.appendChild(option);
      });
      targetField.value = mapping.target || "first_name";

      var targetVar = document.createElement("input");
      targetVar.type = "text";
      targetVar.className = "op-email-email--flow-input";
      targetVar.placeholder = "nombre_variable";
      targetVar.value = mapping.target || "";

      function syncTargetVisibility() {
        var isVariable = typeSelect.value === "variable";
        targetField.style.display = isVariable ? "none" : "block";
        targetVar.style.display = isVariable ? "block" : "none";
        if (isVariable && !mapping.target) {
          mapping.target = targetVar.value;
        }
      }

      typeSelect.addEventListener("change", function () {
        mapping.target_type = typeSelect.value;
        if (mapping.target_type === "field") {
          mapping.target = targetField.value;
        } else {
          mapping.target = targetVar.value;
        }
        syncTargetVisibility();
        self.markDirty();
      });

      targetField.addEventListener("change", function () {
        mapping.target = targetField.value;
        self.markDirty();
      });

      targetVar.addEventListener("input", function () {
        mapping.target = targetVar.value;
        self.markDirty();
      });

      syncTargetVisibility();

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "op-email-email--flow-rule-remove";
      remove.textContent = "Quitar";
      remove.addEventListener("click", function () {
        mappings.splice(idx, 1);
        self.render();
        self.markDirty();
      });

      body.appendChild(sourceInput);
      body.appendChild(typeSelect);
      body.appendChild(targetField);
      body.appendChild(targetVar);
      body.appendChild(remove);

      header.addEventListener("click", function () {
        row.classList.toggle("is-open");
      });

      row.appendChild(header);
      row.appendChild(body);
      self.propertiesBody.appendChild(row);
    });

    var addMapping = document.createElement("button");
    addMapping.type = "button";
    addMapping.className = "op-email-email--flow-node";
    addMapping.textContent = "Agregar mapeo";
    addMapping.addEventListener("click", function () {
      mappings.push({ source: "", target_type: "field", target: "first_name" });
      self.render();
      self.markDirty();
    });
    self.propertiesBody.appendChild(addMapping);

    var wpTypeSelect = document.createElement("select");
    wpTypeSelect.className = "op-email-email--flow-select";
    var wpTypeBlank = document.createElement("option");
    wpTypeBlank.value = "";
    wpTypeBlank.textContent = "Seleccione tipo";
    wpTypeSelect.appendChild(wpTypeBlank);
    (self.workPackageTypes || []).forEach(function (type) {
      var option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.name;
      wpTypeSelect.appendChild(option);
    });
    wpTypeSelect.value = data.work_package_type_id || "";
    wpTypeSelect.addEventListener("change", function () {
      data.work_package_type_id = wpTypeSelect.value;
      data.work_package_type_name = self.getWorkPackageTypeName(wpTypeSelect.value) || "";
      self.render();
      self.markDirty();
      self.scheduleSave();
    });
    addField("Tipo de tarea", wpTypeSelect);

    var boardSelect = document.createElement("select");
    boardSelect.className = "op-email-email--flow-select";
    var boardBlank = document.createElement("option");
    boardBlank.value = "";
    boardBlank.textContent = "Seleccione tablero";
    boardSelect.appendChild(boardBlank);
    (self.boards || []).forEach(function (board) {
      var option = document.createElement("option");
      option.value = board.id;
      option.textContent = board.name;
      boardSelect.appendChild(option);
    });
    boardSelect.value = data.board_id || "";
    boardSelect.addEventListener("change", function () {
      data.board_id = boardSelect.value;
      data.query_id = "";
      if (data.board_id) {
        self.loadBoardLists(data.board_id, function () {
          self.render();
        });
      } else {
        self.render();
      }
      self.markDirty();
      self.scheduleSave();
    });
    addField("Tablero", boardSelect);

    var listSelect = document.createElement("select");
    listSelect.className = "op-email-email--flow-select";
    var listBlank = document.createElement("option");
    listBlank.value = "";
    listBlank.textContent = "Seleccione lista";
    listSelect.appendChild(listBlank);
    var lists = data.board_id ? (self.boardLists[String(data.board_id)] || self.boardLists[data.board_id] || []) : [];
    if (data.board_id && (!lists || !lists.length)) {
      self.loadBoardLists(data.board_id);
    }
    lists.forEach(function (list) {
      var option = document.createElement("option");
      option.value = list.id;
      option.textContent = list.name;
      listSelect.appendChild(option);
    });
    listSelect.value = data.query_id || "";
    listSelect.addEventListener("change", function () {
      data.query_id = listSelect.value;
      self.render();
      self.markDirty();
      self.scheduleSave();
    });
    addField("Lista / columna", listSelect);

    var tagSelect = document.createElement("select");
    tagSelect.className = "op-email-email--flow-select";
    var tagBlank = document.createElement("option");
    tagBlank.value = "";
    tagBlank.textContent = "Sin etiqueta";
    tagSelect.appendChild(tagBlank);
    (self.tags || []).forEach(function (tag) {
      var option = document.createElement("option");
      option.value = tag.name;
      option.textContent = tag.name;
      tagSelect.appendChild(option);
    });
    tagSelect.value = data.crm_tag_name || "";
    tagSelect.addEventListener("change", function () {
      data.crm_tag_name = tagSelect.value || "";
      self.render();
      self.markDirty();
      self.scheduleSave();
    });
    addField("Etiqueta", tagSelect);

    var userSelect = document.createElement("select");
    userSelect.className = "op-email-email--flow-select";
    var userBlank = document.createElement("option");
    userBlank.value = "";
    userBlank.textContent = "Sin responsable";
    userSelect.appendChild(userBlank);
    (self.users || []).forEach(function (user) {
      var option = document.createElement("option");
      option.value = user.id;
      option.textContent = user.name;
      userSelect.appendChild(option);
    });
    userSelect.value = data.assigned_to_id || "";
    userSelect.addEventListener("change", function () {
      data.assigned_to_id = userSelect.value || "";
      self.render();
      self.markDirty();
      self.scheduleSave();
    });
    addField("Asignar responsable", userSelect);

    if (typeof self.renderTransformJsonHistory === "function") {
      self.renderTransformJsonHistory(node);
    }
  };
})();
