(function () {
  window.contactoLoaded = true;
  if (window.console && typeof window.console.log === "function") {
    window.console.log("[Contactos] script.loaded");
  }
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(null, args);
      }, delay);
    };
  }

  function parseApiErrorMessage(error) {
    if (!error) return "No se pudo guardar el contacto.";
    if (typeof error === "string" && error.trim()) return error.trim();
    if (error.error && String(error.error).trim()) return String(error.error).trim();
    if (Array.isArray(error.errors) && error.errors.length) return error.errors.join("\n");
    return "No se pudo guardar el contacto.";
  }

  var CONTACTO_TAG_COLORS = [
    "#1e88e5",
    "#e53935",
    "#fdd835",
    "#43a047",
    "#fb8c00",
    "#8e24aa",
    "#111111",
    "#ffffff",
    "#9e9e9e",
    "#ec407a"
  ];
  var contactoTagStore = { byId: {}, byName: {} };

  function normalizeTagName(name) {
    return String(name || "").trim();
  }

  function tagKey(name) {
    return normalizeTagName(name).toLowerCase();
  }

  function colorForName(name) {
    var key = tagKey(name);
    if (!key) return CONTACTO_TAG_COLORS[0];
    var sum = 0;
    for (var i = 0; i < key.length; i += 1) {
      sum += key.charCodeAt(i);
    }
    return CONTACTO_TAG_COLORS[sum % CONTACTO_TAG_COLORS.length];
  }

  function isLightColor(color) {
    var value = String(color || "").trim().toLowerCase();
    if (!value) return false;

    var r;
    var g;
    var b;

    if (value.indexOf("#") === 0) {
      var hex = value.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map(function (c) { return c + c; }).join("");
      }
      if (hex.length !== 6) return false;
      var intValue = parseInt(hex, 16);
      if (isNaN(intValue)) return false;
      r = (intValue >> 16) & 255;
      g = (intValue >> 8) & 255;
      b = intValue & 255;
    } else {
      var rgbMatch = value.match(/^rgba?\(([^)]+)\)$/);
      if (!rgbMatch) return false;
      var parts = rgbMatch[1].split(",").map(function (part) { return parseFloat(part.trim()); });
      if (parts.length < 3) return false;
      r = parts[0];
      g = parts[1];
      b = parts[2];
      if ([r, g, b].some(function (n) { return isNaN(n); })) return false;
    }

    var luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance >= 0.6;
  }

  function registerTag(tag) {
    if (!tag || !tag.name) return;
    var key = tagKey(tag.name);
    contactoTagStore.byName[key] = tag;
    if (tag.id) contactoTagStore.byId[String(tag.id)] = tag;
    syncContactoTagsRoot();
  }

  function removeTagFromStore(name) {
    var key = tagKey(name);
    if (!key) return;
    var tag = contactoTagStore.byName[key];
    if (tag && tag.id) {
      delete contactoTagStore.byId[String(tag.id)];
    }
    delete contactoTagStore.byName[key];
    syncContactoTagsRoot();
  }

  function getTagMeta(name) {
    var key = tagKey(name);
    return contactoTagStore.byName[key] || { name: normalizeTagName(name), color: colorForName(name) };
  }

  function syncContactoTagsRoot() {
    var root = document.querySelector(".contacto-shell");
    if (!root) return;
    root.setAttribute("data-contacto-tags", JSON.stringify(listContactoTags()));
  }

  function listContactoTags() {
    return Object.keys(contactoTagStore.byName).map(function (key) {
      return contactoTagStore.byName[key];
    }).sort(function (left, right) {
      return String(left && left.name || "").localeCompare(String(right && right.name || ""), undefined, { sensitivity: "base" });
    });
  }

  function normalizeTagList(tags) {
    var seen = {};
    return Array.isArray(tags) ? tags.map(normalizeTagName).filter(function (name) {
      if (!name) return false;
      var key = tagKey(name);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (name) {
      var meta = contactoTagStore.byName[tagKey(name)];
      return meta && meta.name ? meta.name : name;
    }) : [];
  }

  function initTagStore() {
    var root = document.querySelector(".contacto-shell");
    if (!root || root.dataset.tagsBound === "true") return;
    root.dataset.tagsBound = "true";
    var raw = root.getAttribute("data-contacto-tags");
    if (!raw) return;
    try {
      var list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach(function (tag) {
          registerTag(tag);
        });
      }
    } catch (error) {}
  }

  function createTagChip(tagName) {
    var meta = getTagMeta(tagName);
    var chip = document.createElement("span");
    chip.className = "contacto-tag-chip";
    chip.setAttribute("data-tag-name", tagKey(meta.name));
    chip.setAttribute("draggable", "true");
    if (meta.id) chip.setAttribute("data-tag-id", meta.id);
    chip.setAttribute("data-tooltip", meta.name);
    var initials = meta.name
      .split(/\s+/)
      .filter(function (part) { return part; })
      .map(function (part) { return part[0]; })
      .join("")
      .toUpperCase()
      .slice(0, 1);
    if (!initials) initials = meta.name.slice(0, 1).toUpperCase();
    var dot = document.createElement("span");
    dot.className = "contacto-tag-dot";
    dot.textContent = initials;
    dot.style.backgroundColor = meta.color || CONTACTO_TAG_COLORS[0];
    dot.style.color = isLightColor(dot.style.backgroundColor) ? "#1b1b1b" : "#ffffff";
    chip.appendChild(dot);
    return chip;
  }

  function renderTagList(container, tags) {
    if (!container) return;
    container.innerHTML = "";
    var list = normalizeTagList(tags);
    list.forEach(function (tag) {
      var name = normalizeTagName(tag);
      if (!name) return;
      var chip = createTagChip(name);
      container.appendChild(chip);
    });
  }

  function updateContactoTagsToggle(wrap, tags) {
    if (!wrap) return;
    var toggle = wrap.querySelector("[data-contacto-tags-toggle]");
    if (!toggle) return;
    var list = normalizeTagList(tags);
    toggle.textContent = list.length ? "Etiquetas seleccionadas (" + list.length + ")" : "Seleccionar etiquetas";
  }

  function parseTags(raw) {
    return String(raw || "")
      .split(",")
      .map(function (item) { return item.trim(); })
      .filter(function (item) { return item; });
  }

  function ensureTagOnServer(name, done, color) {
    var root = document.querySelector(".contacto-shell");
    var url = root ? root.getAttribute("data-contacto-tags-upsert-url") : "";
    if (!url) return done && done(null);
    var token = document.querySelector("meta[name='csrf-token']");
    var requestBody = { name: name };
    if (color) requestBody.color = color;
    fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify(requestBody)
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.tag) {
          registerTag(payload.tag);
          updateAllChipsForTag(payload.tag.name, payload.tag);
        }
        if (done) done(payload && payload.tag ? payload.tag : null);
      })
      .catch(function () {
        if (done) done(null);
      });
  }

  function updateAllChipsForTag(name, meta) {
    var key = tagKey(name);
    document.querySelectorAll(".contacto-tag-chip[data-tag-name='" + key + "']").forEach(function (chip) {
      var dot = chip.querySelector(".contacto-tag-dot");
      if (!dot) return;
      dot.style.backgroundColor = meta.color;
      dot.style.color = isLightColor(meta.color) ? "#1b1b1b" : "#ffffff";
      chip.setAttribute("data-tooltip", meta.name);
      if (meta.id) chip.setAttribute("data-tag-id", meta.id);
    });
  }

  function replaceTagEverywhere(oldName, newName) {
    var oldKey = tagKey(oldName);
    document.querySelectorAll("[data-contacto-tags-input]").forEach(function (wrap) {
      var hidden = wrap.querySelector("[data-contacto-tags-hidden]");
      var tags = parseTags(hidden ? hidden.value : "");
      if (!tags.length) return;
      var updated = normalizeTagList(tags.map(function (tag) { return tagKey(tag) === oldKey ? newName : tag; }));
      if (hidden) hidden.value = updated.join(", ");
      wrap.setAttribute("data-tags", JSON.stringify(updated));
      renderTagList(wrap.querySelector("[data-contacto-tags-chips]"), updated);
      updateContactoTagsToggle(wrap, updated);
    });
    document.querySelectorAll("[data-contacto-tag-list]").forEach(function (list) {
      var tags = [];
      try {
        tags = JSON.parse(list.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      var updated = normalizeTagList(tags.map(function (tag) { return tagKey(tag) === oldKey ? newName : tag; }));
      list.setAttribute("data-tags", JSON.stringify(updated));
      var cell = list.closest("td[data-field='tags']");
      if (cell) cell.dataset.value = updated.join(", ");
      renderTagList(list, updated);
    });
  }

  function removeTagEverywhere(name) {
    var key = tagKey(name);
    document.querySelectorAll("[data-contacto-tags-input]").forEach(function (wrap) {
      var hidden = wrap.querySelector("[data-contacto-tags-hidden]");
      var tags = parseTags(hidden ? hidden.value : "");
      if (!tags.length) return;
      var updated = normalizeTagList(tags.filter(function (tag) { return tagKey(tag) !== key; }));
      if (hidden) hidden.value = updated.join(", ");
      wrap.setAttribute("data-tags", JSON.stringify(updated));
      renderTagList(wrap.querySelector("[data-contacto-tags-chips]"), updated);
      updateContactoTagsToggle(wrap, updated);
    });
    document.querySelectorAll("[data-contacto-tag-list]").forEach(function (list) {
      var tags = [];
      try {
        tags = JSON.parse(list.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = [];
      }
      var updated = normalizeTagList(tags.filter(function (tag) { return tagKey(tag) !== key; }));
      list.setAttribute("data-tags", JSON.stringify(updated));
      var cell = list.closest("td[data-field='tags']");
      if (cell) cell.dataset.value = updated.join(", ");
      renderTagList(list, updated);
    });
  }

  function updateTagColorOnServer(tagId, color, done) {
    var root = document.querySelector(".contacto-shell");
    if (!root) {
      if (done) done(null);
      return;
    }
    var template = root.getAttribute("data-contacto-tags-color-url") || "";
    if (!template) {
      if (done) done(null);
      return;
    }
    var url = template.replace("__ID__", tagId);
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({ color: color })
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.tag) {
          registerTag(payload.tag);
          updateAllChipsForTag(payload.tag.name, payload.tag);
        }
        if (done) done(payload);
      })
      .catch(function () {
        if (done) done(null);
      });
  }

  function renameTagOnServer(tagId, name, done) {
    var root = document.querySelector(".contacto-shell");
    if (!root) {
      if (done) done(null);
      return;
    }
    var template = root.getAttribute("data-contacto-tags-rename-url") || "";
    if (!template) {
      if (done) done(null);
      return;
    }
    var url = template.replace("__ID__", tagId);
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify({ name: name })
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.tag) {
          removeTagFromStore(payload.old_name || payload.tag.name);
          registerTag(payload.tag);
          replaceTagEverywhere(payload.old_name || payload.tag.name, payload.tag.name);
        }
        if (done) done(payload);
      })
      .catch(function () {
        if (done) done(null);
      });
  }

  function deleteTagOnServer(tagId, done) {
    var root = document.querySelector(".contacto-shell");
    if (!root) {
      if (done) done(null);
      return;
    }
    var template = root.getAttribute("data-contacto-tags-destroy-url") || "";
    if (!template) {
      if (done) done(null);
      return;
    }
    var url = template.replace("__ID__", tagId);
    var token = document.querySelector("meta[name='csrf-token']");
    fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      }
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.name) {
          removeTagFromStore(payload.name);
          removeTagEverywhere(payload.name);
          document.querySelectorAll("[data-contacto-tags-input]").forEach(function (wrap) {
            var dropdown = wrap.querySelector(".contacto-tags-dropdown");
            if (dropdown && !dropdown.classList.contains("is-hidden")) {
              dropdown.classList.add("is-hidden");
            }
          });
        }
        if (done) done(payload);
      })
      .catch(function () {
        if (done) done(null);
      });
  }

  function bindSearch() {
    var input = document.querySelector("[data-contacto-search]");
    if (!input || input.dataset.bound === "true") return;
    input.dataset.bound = "true";
  }

  function bindAdvancedFilters() {
    var root = document.querySelector(".contacto-shell");
    if (!root || root.dataset.advancedFiltersBound === "true") return;
    root.dataset.advancedFiltersBound = "true";
    var builder = document.querySelector("[data-contacto-filter-builder]");
    var groupsWrap = document.querySelector("[data-contacto-groups]");
    var jsonInput = document.querySelector("[data-contacto-filters-json]");
    var searchInput = document.querySelector("[data-contacto-global-search]");
    var clearSearch = document.querySelector("[data-contacto-clear-search]");
    var toggleAdvanced = document.querySelector("[data-contacto-toggle-advanced]");
    var advancedPanel = document.querySelector("[data-contacto-advanced-panel]");
    var advancedBar = document.querySelector("[data-contacto-advanced-bar]");
    var form = document.querySelector(".contacto-advanced-form");
    if (!form) return;

    function setAdvancedOpen(open) {
      if (!advancedPanel || !toggleAdvanced) return;
      if (open) {
        advancedPanel.classList.remove("is-hidden");
        toggleAdvanced.classList.add("is-active");
      } else {
        advancedPanel.classList.add("is-hidden");
        toggleAdvanced.classList.remove("is-active");
      }
    }

    if (toggleAdvanced && advancedPanel) {
      toggleAdvanced.addEventListener("click", function (event) {
        event.preventDefault();
        var isHidden = advancedPanel.classList.contains("is-hidden");
        setAdvancedOpen(isHidden);
      });

      document.addEventListener("click", function (event) {
        if (!event || !event.target) return;
        if (advancedPanel.classList.contains("is-hidden")) return;
        if (advancedPanel.contains(event.target)) return;
        if (toggleAdvanced.contains(event.target)) return;
        setAdvancedOpen(false);
      });
    }

    function submitFiltersForm() {
      if (jsonInput && builder && groupsWrap) {
        updateJsonInput();
      }
      var applyInput = form.querySelector("input[name='apply']");
      if (!applyInput) {
        applyInput = document.createElement("input");
        applyInput.type = "hidden";
        applyInput.name = "apply";
        form.appendChild(applyInput);
      }
      applyInput.value = "1";
      form.requestSubmit ? form.requestSubmit() : form.submit();
    }

    if (searchInput) {
      searchInput.addEventListener("keydown", function (event) {
        if (!event || event.key !== "Enter") return;
        event.preventDefault();
        submitFiltersForm();
      });
    }

    if (clearSearch && searchInput) {
      clearSearch.addEventListener("click", function () {
        searchInput.value = "";
        searchInput.focus();
        submitFiltersForm();
      });
    }

    var sortSelect = document.querySelector("#contacto-sort");
    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        submitFiltersForm();
      });
    }
    var assignedToSelect = document.querySelector("#contacto-assigned-to-filter");
    if (assignedToSelect) {
      assignedToSelect.addEventListener("change", function () {
        submitFiltersForm();
      });
    }

    if (!builder || !groupsWrap || !jsonInput) return;

    var fields = [];
    try {
      fields = JSON.parse(root.getAttribute("data-contacto-filter-fields") || "[]");
    } catch (error) {
      fields = [];
    }

    var users = [];
    try {
      users = JSON.parse(root.getAttribute("data-contacto-users") || "[]");
    } catch (error) {
      users = [];
    }

    function operatorOptions(type) {
      switch (type) {
        case "number":
          return [
            { value: "equals", label: "Es igual" },
            { value: "not_equals", label: "No es igual" },
            { value: "gt", label: "Mayor que" },
            { value: "gte", label: "Mayor o igual" },
            { value: "lt", label: "Menor que" },
            { value: "lte", label: "Menor o igual" },
            { value: "is_blank", label: "Esta vacio" },
            { value: "is_not_blank", label: "No esta vacio" }
          ];
        case "date":
          return [
            { value: "equals", label: "Es" },
            { value: "gt", label: "Despues de" },
            { value: "gte", label: "Desde" },
            { value: "lt", label: "Antes de" },
            { value: "lte", label: "Hasta" },
            { value: "is_blank", label: "Esta vacio" },
            { value: "is_not_blank", label: "No esta vacio" }
          ];
        case "user":
          return [
            { value: "equals", label: "Es" },
            { value: "not_equals", label: "No es" },
            { value: "is_blank", label: "No asignado" },
            { value: "is_not_blank", label: "Asignado" }
          ];
        case "tags":
          return [
            { value: "contains", label: "Incluye" },
            { value: "not_contains", label: "No incluye" },
            { value: "is_blank", label: "Vacio" },
            { value: "is_not_blank", label: "Con tags" }
          ];
        case "option":
          return [
            { value: "equals", label: "Es" },
            { value: "not_equals", label: "No es" },
            { value: "in", label: "En lista" },
            { value: "not_in", label: "No en lista" },
            { value: "is_blank", label: "Esta vacio" },
            { value: "is_not_blank", label: "No esta vacio" }
          ];
        default:
          return [
            { value: "contains", label: "Contiene" },
            { value: "not_contains", label: "No contiene" },
            { value: "equals", label: "Es igual" },
            { value: "not_equals", label: "No es igual" },
            { value: "starts_with", label: "Empieza con" },
            { value: "ends_with", label: "Termina con" },
            { value: "is_blank", label: "Esta vacio" },
            { value: "is_not_blank", label: "No esta vacio" }
          ];
      }
    }

    function normalizeFieldType(type) {
      var value = String(type || "").toLowerCase();
      if (value === "number" || value === "integer" || value === "float") return "number";
      if (value === "date" || value === "datetime") return "date";
      if (value === "user") return "user";
      if (value === "tags") return "tags";
      if (value === "boolean") return "boolean";
      if (value === "select" || value === "multiselect" || value === "enum") return "option";
      return "text";
    }

    function createFieldSelect(selected) {
      var select = document.createElement("select");
      select.className = "contacto-filter-field";
      fields.forEach(function (field) {
        var option = document.createElement("option");
        option.value = field.key;
        option.textContent = field.label;
        option.dataset.fieldType = normalizeFieldType(field.type);
        if (field.custom_name) option.dataset.customName = field.custom_name;
        if (field.options) option.dataset.fieldOptions = JSON.stringify(field.options);
        if (selected && selected === field.key) option.selected = true;
        select.appendChild(option);
      });
      return select;
    }

    function createOperatorSelect(type, selected) {
      var select = document.createElement("select");
      select.className = "contacto-filter-operator";
      operatorOptions(type).forEach(function (op) {
        var option = document.createElement("option");
        option.value = op.value;
        option.textContent = op.label;
        if (selected && selected === op.value) option.selected = true;
        select.appendChild(option);
      });
      return select;
    }

    function createValueInput(type, operator, value, fieldOptions) {
      var wrap = document.createElement("div");
      wrap.className = "contacto-filter-value";
      if (operator === "is_blank" || operator === "is_not_blank") {
        wrap.classList.add("is-empty");
        wrap.textContent = "—";
        return wrap;
      }

      if (type === "user") {
        var select = document.createElement("select");
        select.className = "contacto-filter-input";
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Selecciona...";
        select.appendChild(empty);
        users.forEach(function (user) {
          var option = document.createElement("option");
          option.value = user.id;
          option.textContent = user.name;
          if (String(value) === String(user.id)) option.selected = true;
          select.appendChild(option);
        });
        wrap.appendChild(select);
        return wrap;
      }

      if (type === "boolean") {
        var booleanSelect = document.createElement("select");
        booleanSelect.className = "contacto-filter-input";
        var booleanEmpty = document.createElement("option");
        booleanEmpty.value = "";
        booleanEmpty.textContent = "Selecciona...";
        booleanSelect.appendChild(booleanEmpty);

        [
          { value: "true", label: "Si" },
          { value: "false", label: "No" }
        ].forEach(function (item) {
          var booleanOption = document.createElement("option");
          booleanOption.value = item.value;
          booleanOption.textContent = item.label;
          if (String(value).toLowerCase() === item.value) booleanOption.selected = true;
          booleanSelect.appendChild(booleanOption);
        });

        wrap.appendChild(booleanSelect);
        return wrap;
      }

      if ((type === "option" || type === "tags") && Array.isArray(fieldOptions) && fieldOptions.length) {
        var optionSelect = document.createElement("select");
        optionSelect.className = "contacto-filter-input";
        var optEmpty = document.createElement("option");
        optEmpty.value = "";
        optEmpty.textContent = "Selecciona...";
        optionSelect.appendChild(optEmpty);
        fieldOptions.forEach(function (opt) {
          var option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          if (String(value) === String(opt)) option.selected = true;
          optionSelect.appendChild(option);
        });
        wrap.appendChild(optionSelect);
        return wrap;
      }

      var input = document.createElement("input");
      input.className = "contacto-filter-input";
      input.type = type === "number" ? "number" : (type === "date" ? "date" : "text");
      if (value !== undefined && value !== null) input.value = value;
      wrap.appendChild(input);
      return wrap;
    }

    function buildRule(rule) {
      var row = document.createElement("div");
      row.className = "contacto-filter-rule";
      row.setAttribute("data-filter-rule", "true");

      var fieldSelect = createFieldSelect(rule.field);
      row.appendChild(fieldSelect);

      var selectedOption = fieldSelect.options[fieldSelect.selectedIndex];
      var type = selectedOption ? selectedOption.dataset.fieldType : "text";
      var fieldOptions = [];
      if (selectedOption && selectedOption.dataset.fieldOptions) {
        try {
          fieldOptions = JSON.parse(selectedOption.dataset.fieldOptions);
        } catch (error) {
          fieldOptions = [];
        }
      }

      var operatorSelect = createOperatorSelect(type, rule.operator);
      row.appendChild(operatorSelect);

      var valueWrap = createValueInput(type, operatorSelect.value, rule.value, fieldOptions);
      row.appendChild(valueWrap);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "contacto-filter-remove";
      remove.setAttribute("data-filter-remove", "true");
      remove.textContent = "✕";
      row.appendChild(remove);

      return row;
    }

    function buildGroup(group, isRoot) {
      var wrapper = document.createElement("div");
      wrapper.className = "contacto-filter-group" + (isRoot ? " is-root" : "");
      wrapper.setAttribute("data-filter-group", "true");

      var header = document.createElement("div");
      header.className = "contacto-filter-group-header";

      var title = document.createElement("div");
      title.className = "contacto-filter-group-title";
      title.textContent = isRoot ? "Grupo principal" : "Grupo";

      var opSelect = document.createElement("select");
      opSelect.className = "contacto-filter-group-op";
      var opAnd = document.createElement("option");
      opAnd.value = "and";
      opAnd.textContent = "AND";
      var opOr = document.createElement("option");
      opOr.value = "or";
      opOr.textContent = "OR";
      opSelect.appendChild(opAnd);
      opSelect.appendChild(opOr);
      opSelect.value = group.op === "or" ? "or" : "and";

      var actions = document.createElement("div");
      actions.className = "contacto-filter-group-actions";

      var addRule = document.createElement("button");
      addRule.type = "button";
      addRule.className = "contacto-btn contacto-btn-ghost";
      addRule.textContent = "Agregar regla";
      addRule.setAttribute("data-contacto-add-rule", "true");

      var addGroup = document.createElement("button");
      addGroup.type = "button";
      addGroup.className = "contacto-btn contacto-btn-ghost";
      addGroup.textContent = "Agregar grupo";
      addGroup.setAttribute("data-contacto-add-group", "true");

      actions.appendChild(addRule);
      actions.appendChild(addGroup);

      if (!isRoot) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "contacto-filter-remove";
        remove.setAttribute("data-filter-group-remove", "true");
        remove.textContent = "✕";
        actions.appendChild(remove);
      }

      header.appendChild(title);
      header.appendChild(opSelect);
      header.appendChild(actions);
      wrapper.appendChild(header);

      var body = document.createElement("div");
      body.className = "contacto-filter-group-body";
      var rules = Array.isArray(group.rules) ? group.rules : [];
      if (!rules.length) {
        rules.push({ type: "rule", field: fields[0] ? fields[0].key : "", operator: "contains", value: "" });
      }
      rules.forEach(function (rule) {
        if (rule.type === "group") {
          body.appendChild(buildGroup(rule, false));
        } else {
          body.appendChild(buildRule(rule));
        }
      });
      wrapper.appendChild(body);
      return wrapper;
    }

    function serializeRule(node) {
      var fieldSelect = node.querySelector(".contacto-filter-field");
      var operatorSelect = node.querySelector(".contacto-filter-operator");
      var valueInput = node.querySelector(".contacto-filter-input");
      var selectedOption = fieldSelect ? fieldSelect.options[fieldSelect.selectedIndex] : null;
      var rule = {
        type: "rule",
        field: fieldSelect ? fieldSelect.value : "",
        operator: operatorSelect ? operatorSelect.value : "contains",
        value: valueInput ? valueInput.value : ""
      };
      if (selectedOption && selectedOption.dataset.customName) {
        rule.custom_name = selectedOption.dataset.customName;
      }
      return rule;
    }

    function serializeGroup(node) {
      var opSelect = node.querySelector(".contacto-filter-group-op");
      var body = node.querySelector(".contacto-filter-group-body");
      var rules = [];
      if (body) {
        Array.prototype.slice.call(body.children).forEach(function (child) {
          if (child.hasAttribute("data-filter-group")) {
            rules.push(serializeGroup(child));
          } else if (child.hasAttribute("data-filter-rule")) {
            rules.push(serializeRule(child));
          }
        });
      }
      return {
        type: "group",
        op: opSelect && opSelect.value === "or" ? "or" : "and",
        rules: rules
      };
    }

    function legacyToBuilder(saved) {
      var rules = [];
      if (saved.status) rules.push({ type: "rule", field: "status", operator: "equals", value: saved.status });
      if (saved.source) rules.push({ type: "rule", field: "source", operator: "equals", value: saved.source });
      if (saved.tag) rules.push({ type: "rule", field: "tags", operator: "contains", value: saved.tag });
      if (saved.assigned_to_id) rules.push({ type: "rule", field: "assigned_to_id", operator: "equals", value: saved.assigned_to_id });
      if (saved.points_min) rules.push({ type: "rule", field: "points", operator: "gte", value: saved.points_min });
      if (saved.points_max) rules.push({ type: "rule", field: "points", operator: "lte", value: saved.points_max });
      return { op: "and", rules: rules };
    }

    function loadInitialBuilder() {
      var initial = {};
      try {
        initial = JSON.parse(jsonInput.value || "{}");
      } catch (error) {
        initial = {};
      }
      if (initial && initial.rules) return initial;

      var saved = {};
      try {
        saved = JSON.parse(root.getAttribute("data-contacto-advanced-filters") || "{}");
      } catch (error) {
        saved = {};
      }
      if (saved.builder && saved.builder.rules) return saved.builder;

      if (saved.status || saved.source || saved.tag || saved.assigned_to_id || saved.points_min || saved.points_max) {
        return legacyToBuilder(saved);
      }

      return { op: "and", rules: [] };
    }

    function renderBuilder(builderState) {
      groupsWrap.innerHTML = "";
      groupsWrap.appendChild(buildGroup(builderState, true));
    }

    function updateJsonInput() {
      var group = groupsWrap.querySelector("[data-filter-group]");
      if (!group) return;
      var serialized = serializeGroup(group);
      jsonInput.value = JSON.stringify({ op: serialized.op, rules: serialized.rules });
    }

    builder.addEventListener("click", function (event) {
      var target = event.target;
      if (!target) return;
      if (target.matches("[data-contacto-add-rule]")) {
        var groupNode = target.closest("[data-filter-group]");
        if (!groupNode) groupNode = groupsWrap.querySelector("[data-filter-group]");
        var body = groupNode ? groupNode.querySelector(".contacto-filter-group-body") : null;
        if (!body) return;
        body.appendChild(buildRule({ type: "rule", field: fields[0] ? fields[0].key : "", operator: "contains", value: "" }));
        updateJsonInput();
      }
      if (target.matches("[data-contacto-add-group]")) {
        var groupNode2 = target.closest("[data-filter-group]");
        if (!groupNode2) groupNode2 = groupsWrap.querySelector("[data-filter-group]");
        var body2 = groupNode2 ? groupNode2.querySelector(".contacto-filter-group-body") : null;
        if (!body2) return;
        body2.appendChild(buildGroup({ type: "group", op: "and", rules: [] }, false));
        updateJsonInput();
      }
      if (target.matches("[data-filter-remove]")) {
        var row = target.closest("[data-filter-rule]");
        if (row) row.remove();
        updateJsonInput();
      }
      if (target.matches("[data-filter-group-remove]")) {
        var groupRow = target.closest("[data-filter-group]");
        if (groupRow && !groupRow.classList.contains("is-root")) {
          groupRow.remove();
          updateJsonInput();
        }
      }
    });

    builder.addEventListener("change", function (event) {
      var target = event.target;
      if (!target) return;
      if (target.classList.contains("contacto-filter-field")) {
        var row = target.closest(".contacto-filter-rule");
        if (!row) return;
        var selectedOption = target.options[target.selectedIndex];
        var type = selectedOption ? selectedOption.dataset.fieldType : "text";
        var fieldOptions = [];
        if (selectedOption && selectedOption.dataset.fieldOptions) {
          try {
            fieldOptions = JSON.parse(selectedOption.dataset.fieldOptions);
          } catch (error) {
            fieldOptions = [];
          }
        }
        var operatorSelect = createOperatorSelect(type, "");
        var oldOperator = row.querySelector(".contacto-filter-operator");
        if (oldOperator) oldOperator.replaceWith(operatorSelect);
        var oldValue = row.querySelector(".contacto-filter-value");
        if (oldValue) oldValue.replaceWith(createValueInput(type, operatorSelect.value, "", fieldOptions));
      }
      if (target.classList.contains("contacto-filter-operator")) {
        var row2 = target.closest(".contacto-filter-rule");
        if (!row2) return;
        var fieldSelect = row2.querySelector(".contacto-filter-field");
        var selectedOption2 = fieldSelect ? fieldSelect.options[fieldSelect.selectedIndex] : null;
        var type2 = selectedOption2 ? selectedOption2.dataset.fieldType : "text";
        var fieldOptions2 = [];
        if (selectedOption2 && selectedOption2.dataset.fieldOptions) {
          try {
            fieldOptions2 = JSON.parse(selectedOption2.dataset.fieldOptions);
          } catch (error) {
            fieldOptions2 = [];
          }
        }
        var oldValue2 = row2.querySelector(".contacto-filter-value");
        if (oldValue2) oldValue2.replaceWith(createValueInput(type2, target.value, "", fieldOptions2));
      }
      updateJsonInput();
    });

    form.addEventListener("submit", function () {
      updateJsonInput();
    });

    var initialBuilder = loadInitialBuilder();
    renderBuilder(initialBuilder);
    updateJsonInput();
  }

  function bindPerPage() {
    var select = document.querySelector("#contacto-per-page");
    if (!select || select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    select.addEventListener("change", function () {
      var form = select.closest("form");
      if (!form) return;
      form.requestSubmit ? form.requestSubmit() : form.submit();
    });
  }

  function bindTagLists() {
    initTagStore();
    document.querySelectorAll("[data-contacto-tag-list]").forEach(function (list) {
      var tags = [];
      try {
        tags = JSON.parse(list.getAttribute("data-tags") || "[]");
      } catch (error) {
        tags = parseTags(list.getAttribute("data-tags") || "");
      }
      renderTagList(list, tags);
    });
  }

  function bindTagInputs() {
    initTagStore();
    document.querySelectorAll("[data-contacto-tags-input]").forEach(function (wrap) {
      if (wrap.dataset.bound === "true") return;
      wrap.dataset.bound = "true";
      var hidden = wrap.querySelector("[data-contacto-tags-hidden]");
      var toggle = wrap.querySelector("[data-contacto-tags-toggle]");
      var chips = wrap.querySelector("[data-contacto-tags-chips]");
      var dropdown = wrap.querySelector("[data-contacto-tags-dropdown]");
      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "contacto-tags-dropdown is-hidden";
        dropdown.setAttribute("data-contacto-tags-dropdown", "");
        wrap.appendChild(dropdown);
      }
      var initial = [];
      try {
        initial = JSON.parse(wrap.getAttribute("data-tags") || "[]");
      } catch (error) {
        initial = parseTags(hidden ? hidden.value : "");
      }
      if (hidden && !hidden.value) {
        hidden.value = initial.join(", ");
      }
      renderTagList(chips, initial);

      function setTags(tags) {
        var list = normalizeTagList(tags);
        if (hidden) hidden.value = list.join(", ");
        wrap.setAttribute("data-tags", JSON.stringify(list));
        renderTagList(chips, list);
        updateContactoTagsToggle(wrap, list);
      }

      function renderDropdown() {
        dropdown.innerHTML = "";
        var options = listContactoTags();
        if (!options.length) {
          var empty = document.createElement("div");
          empty.className = "contacto-tags-empty";
          empty.textContent = "No hay etiquetas. Crea una desde Mas acciones.";
          dropdown.appendChild(empty);
          return;
        }
        var selected = normalizeTagList(parseTags(hidden ? hidden.value : ""));
        options.forEach(function (tag) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "contacto-tags-option";
          row.setAttribute("data-tag-name", tag.name);
          var check = document.createElement("span");
          check.className = "contacto-tags-option-check";
          if (selected.some(function (item) { return tagKey(item) === tagKey(tag.name); })) {
            check.classList.add("is-selected");
            check.textContent = "✓";
          }
          row.appendChild(check);
          var chip = createTagChip(tag.name);
          row.appendChild(chip);
          var label = document.createElement("span");
          label.className = "contacto-tags-option-label";
          label.textContent = tag.name;
          row.appendChild(label);
          dropdown.appendChild(row);
        });
      }

      function showDropdown() {
        renderDropdown();
        dropdown.classList.remove("is-hidden");
      }

      function hideDropdown() {
        dropdown.classList.add("is-hidden");
      }

      if (toggle) {
        toggle.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (dropdown.classList.contains("is-hidden")) {
            showDropdown();
          } else {
            hideDropdown();
          }
        });
      }

      dropdown.addEventListener("click", function (event) {
        var option = event.target.closest(".contacto-tags-option");
        if (!option) return;
        event.preventDefault();
        event.stopPropagation();
        var name = option.getAttribute("data-tag-name");
        if (!name) return;
        var current = normalizeTagList(parseTags(hidden ? hidden.value : ""));
        if (current.some(function (tag) { return tagKey(tag) === tagKey(name); })) {
          current = current.filter(function (tag) { return tagKey(tag) !== tagKey(name); });
        } else {
          current.push(name);
        }
        setTags(current);
        showDropdown();
      });

      document.addEventListener("click", function (event) {
        if (event.target.closest("[data-contacto-tags-input]") === wrap) return;
        hideDropdown();
      });

      setTags(initial);
    });
  }

  function bindTagDrag() {
    if (document.body.dataset.contactoTagsDragBound === "true") return;
    document.body.dataset.contactoTagsDragBound = "true";

    document.addEventListener("dragstart", function (event) {
      var chip = event.target.closest(".contacto-tag-chip");
      if (!chip) return;
      chip.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", chip.getAttribute("data-tag-name") || "");
    });

    document.addEventListener("dragend", function (event) {
      var chip = event.target.closest(".contacto-tag-chip");
      if (chip) chip.classList.remove("is-dragging");
    });

    document.addEventListener("dragover", function (event) {
      var chipsWrap = event.target.closest("[data-contacto-tags-chips]");
      if (!chipsWrap) return;
      var dragging = chipsWrap.querySelector(".contacto-tag-chip.is-dragging");
      if (!dragging) return;
      event.preventDefault();
      var target = event.target.closest(".contacto-tag-chip");
      if (!target || target === dragging) return;
      var rect = target.getBoundingClientRect();
      var before = event.clientX < rect.left + rect.width / 2;
      if (before) {
        chipsWrap.insertBefore(dragging, target);
      } else {
        chipsWrap.insertBefore(dragging, target.nextSibling);
      }
    });

    document.addEventListener("drop", function (event) {
      var chipsWrap = event.target.closest("[data-contacto-tags-chips]");
      if (!chipsWrap) return;
      var inputWrap = chipsWrap.closest("[data-contacto-tags-input]");
      if (!inputWrap) return;
      var hidden = inputWrap.querySelector("[data-contacto-tags-hidden]");
      var tags = Array.prototype.slice.call(chipsWrap.querySelectorAll(".contacto-tag-chip")).map(function (chip) {
        var key = chip.getAttribute("data-tag-name") || "";
        var meta = contactoTagStore.byName[key];
        return meta ? meta.name : key;
      }).filter(function (tag) { return tag; });
      if (hidden) hidden.value = tags.join(", ");
      inputWrap.setAttribute("data-tags", JSON.stringify(tags));
    });
  }

  function bindTagActions() {
    if (document.body.dataset.contactoTagsActionBound === "true") return;
    document.body.dataset.contactoTagsActionBound = "true";

    var palette = document.createElement("div");
    palette.className = "contacto-tag-palette is-hidden";
    CONTACTO_TAG_COLORS.forEach(function (color) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "contacto-tag-color";
      btn.style.backgroundColor = color;
      btn.setAttribute("data-color", color);
      palette.appendChild(btn);
    });
    document.body.appendChild(palette);

    var menu = document.createElement("div");
    menu.className = "contacto-tag-menu is-hidden";
    var root = document.querySelector(".contacto-shell");
    var isAdmin = root && root.getAttribute("data-contacto-tags-admin") === "true";
    menu.innerHTML =
      '<button type="button" data-action="remove">Quitar del contacto</button>' +
      '<button type="button" data-action="rename">Renombrar</button>' +
      (isAdmin ? '<button type="button" data-action="delete">Eliminar</button>' : '');
    document.body.appendChild(menu);

    var currentTag = null;
    var currentWrap = null;

    function hideOverlays() {
      palette.classList.add("is-hidden");
      menu.classList.add("is-hidden");
      currentTag = null;
      currentWrap = null;
    }

    function openRenameDialog(tag) {
      if (!tag) return;
      var existing = document.querySelector(".contacto-tag-rename-backdrop");
      if (existing) existing.remove();
      var existingDialog = document.querySelector(".contacto-tag-rename-dialog");
      if (existingDialog) existingDialog.remove();

      var backdrop = document.createElement("div");
      backdrop.className = "contacto-tag-rename-backdrop";
      var dialog = document.createElement("div");
      dialog.className = "contacto-tag-rename-dialog";
      dialog.innerHTML =
        '<div class="contacto-tag-rename-title">Renombrar etiqueta</div>' +
        '<input type="text" class="contacto-tag-rename-input" />' +
        '<div class="contacto-tag-rename-actions">' +
        '<button type="button" data-action="cancel">Cancelar</button>' +
        '<button type="button" data-action="confirm">Guardar</button>' +
        '</div>';
      document.body.appendChild(backdrop);
      document.body.appendChild(dialog);

      var input = dialog.querySelector(".contacto-tag-rename-input");
      if (input) {
        input.value = tag.name || "";
        input.focus();
        try {
          input.setSelectionRange(0, input.value.length);
        } catch (error) {}
      }

      function closeDialog() {
        backdrop.remove();
        dialog.remove();
        document.removeEventListener("keydown", onKeydown);
      }

      function submitRename() {
        var newName = (input ? input.value : "").trim();
        if (!newName || newName === tag.name) {
          closeDialog();
          return;
        }
        replaceTagEverywhere(tag.name, newName);
        if (tag.id) {
          renameTagOnServer(tag.id, newName);
        } else {
          ensureTagOnServer(tag.name, function (serverTag) {
            if (serverTag && serverTag.id) {
              renameTagOnServer(serverTag.id, newName);
            }
          });
        }
        closeDialog();
      }

      function onKeydown(event) {
        if (event.key === "Escape") {
          closeDialog();
        }
      }

      backdrop.addEventListener("click", closeDialog);
      dialog.addEventListener("click", function (event) {
        var action = event.target.getAttribute("data-action");
        if (action === "cancel") {
          closeDialog();
        } else if (action === "confirm") {
          submitRename();
        }
      });
      if (input) {
        input.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            submitRename();
          }
        });
      }
      document.addEventListener("keydown", onKeydown);
    }

    document.addEventListener("click", function (event) {
      if (event.target.closest(".contacto-tag-menu") || event.target.closest(".contacto-tag-palette")) return;
      hideOverlays();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") hideOverlays();
    });

    document.addEventListener("click", function (event) {
      var chip = event.target.closest(".contacto-tag-chip");
      if (!chip) return;
      if (chip.closest(".contacto-tags-option")) return;
      if (chip.closest(".contacto-tag-create-row-chip")) return;
      event.preventDefault();
      event.stopPropagation();
      var name = chip.getAttribute("data-tag-name") || "";
      var meta = getTagMeta(name);
      currentTag = meta;
      currentWrap = chip.closest(".contacto-tags-input");
      palette.style.left = event.pageX + "px";
      palette.style.top = event.pageY + "px";
      palette.classList.remove("is-hidden");
    });

    document.addEventListener("contextmenu", function (event) {
      var chip = event.target.closest(".contacto-tag-chip");
      if (!chip) return;
      if (chip.closest(".contacto-tags-option")) return;
      if (chip.closest(".contacto-tag-create-row-chip")) return;
      event.preventDefault();
      var name = chip.getAttribute("data-tag-name") || "";
      var meta = getTagMeta(name);
      currentTag = meta;
      currentWrap = chip.closest(".contacto-tags-input");
      menu.style.left = event.pageX + "px";
      menu.style.top = event.pageY + "px";
      menu.classList.remove("is-hidden");
    });

    palette.addEventListener("click", function (event) {
      var button = event.target.closest("[data-color]");
      if (!button || !currentTag) return;
      var color = button.getAttribute("data-color");
      if (!color || !currentTag.id) return;
      updateTagColorOnServer(currentTag.id, color);
      currentTag.color = color;
      updateAllChipsForTag(currentTag.name, currentTag);
      hideOverlays();
    });

    menu.addEventListener("click", function (event) {
      var action = event.target.getAttribute("data-action");
      if (!action || !currentTag) return;
      if (action === "rename") {
        openRenameDialog(currentTag);
      } else if (action === "remove") {
        if (currentWrap) {
          var hidden = currentWrap.querySelector("[data-contacto-tags-hidden]");
          var tags = parseTags(hidden ? hidden.value : "");
          var key = tagKey(currentTag.name);
          var updated = tags.filter(function (tag) { return tagKey(tag) !== key; });
          if (hidden) hidden.value = updated.join(", ");
          currentWrap.setAttribute("data-tags", JSON.stringify(updated));
          renderTagList(currentWrap.querySelector("[data-contacto-tags-chips]"), updated);
          updateContactoTagsToggle(currentWrap, updated);
        }
      } else if (action === "delete") {
        deleteTagOnServer(currentTag.id);
      }
      hideOverlays();
    });
  }

  function ensureOverlayState() {
    var openPanels = document.querySelectorAll("[data-contacto-panel].is-open");
    var overlays = document.querySelectorAll("[data-contacto-overlay].is-open");
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Contactos] overlay.check", {
        open_panels: openPanels.length,
        open_overlays: overlays.length
      });
    }
    if (openPanels.length) return;
    overlays.forEach(function (overlay) {
      overlay.classList.remove("is-open");
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] overlay.force_close", {
          key: overlay.getAttribute("data-contacto-overlay")
        });
      }
    });
  }

  function bindDrawerDelegates() {
    if (document.body.dataset.contactoDrawerBound === "true") return;
    document.body.dataset.contactoDrawerBound = "true";
    var storageKey = "contactoDrawerOpen";

    function getPanel(key) {
      return document.querySelector("[data-contacto-panel='" + key + "']");
    }

    function getOverlay(key) {
      return document.querySelector("[data-contacto-overlay='" + key + "']");
    }

    function openPanel(key) {
      var panel = getPanel(key);
      var overlay = getOverlay(key);
      if (!panel || !overlay) return;
      panel.classList.add("is-open");
      overlay.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      try {
        window.sessionStorage.setItem(storageKey, key);
      } catch (error) {}
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] drawer.open", { key: key });
      }
    }

    function closePanel(key) {
      var panel = getPanel(key);
      var overlay = getOverlay(key);
      if (!panel || !overlay) return;
      panel.classList.remove("is-open");
      overlay.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      try {
        if (window.sessionStorage.getItem(storageKey) === key) {
          window.sessionStorage.removeItem(storageKey);
        }
      } catch (error) {}
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] drawer.close", { key: key });
      }
    }

    function closeAllPanels() {
      ["fields", "create", "edit"].forEach(function (key) {
        closePanel(key);
      });
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] drawer.close_all");
      }
    }

    document.addEventListener("click", function (event) {
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] click", {
          target: event.target && event.target.tagName,
          cls: event.target && event.target.className
        });
      }

      var toggle = event.target.closest("[data-contacto-toggle]");
      if (toggle) {
        var key = toggle.getAttribute("data-contacto-toggle");
        var panel = getPanel(key);
        if (!panel) return;
        if (panel.classList.contains("is-open")) {
          closePanel(key);
        } else {
          openPanel(key);
        }
        return;
      }

      var close = event.target.closest("[data-contacto-close]");
      if (close) {
        var closeKey = close.getAttribute("data-contacto-close");
        closePanel(closeKey);
        return;
      }

      var overlay = event.target.closest("[data-contacto-overlay]");
      if (overlay) {
        var overlayKey = overlay.getAttribute("data-contacto-overlay");
        closePanel(overlayKey);
      }
      ensureOverlayState();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeAllPanels();
    });

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.hasAttribute("data-contacto-field-form")) return;
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] drawer.submit", {
          action: form.getAttribute("action") || "",
          method: form.getAttribute("method") || ""
        });
      }
    });

    try {
      var reopen = window.sessionStorage.getItem(storageKey);
      if (reopen) {
        openPanel(reopen);
      }
    } catch (error) {}
  }

  function bindFavoriteToggle() {
    if (document.body.dataset.contactoFavoriteBound === "true") return;
    document.body.dataset.contactoFavoriteBound = "true";
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || target.getAttribute("data-contacto-favorite") !== "true") return;
      var chatId = target.getAttribute("data-chat-id");
      var root = document.querySelector(".contacto-shell");
      var template = root ? root.getAttribute("data-contacto-favorite-url-template") : "";
      if (!chatId || !template) return;
      var token = document.querySelector("meta[name='csrf-token']");
      fetch(template.replace("__CHAT_ID__", chatId), {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function (response) { return response.json(); })
        .then(function (payload) {
          target.textContent = payload.favorite ? "Quitar favorito" : "Favorito";
        })
        .catch(function () {});
    });
  }

  function bindHeaderMenu() {
    if (window.__contactoHeaderMenuBound === true) return;
    window.__contactoHeaderMenuBound = true;

    function logHeaderMenu(label, data) {
      if (!window.console || typeof window.console.log !== "function") return;
      window.console.log("[Contactos][HeaderMenu] " + label, data || {});
    }

    document.addEventListener("click", function (event) {
      var toggle = event.target && event.target.closest ? event.target.closest("[data-contacto-header-menu-toggle='true']") : null;
      var menu = document.querySelector("[data-contacto-header-menu='true']");

      if (toggle && menu) {
        event.preventDefault();
        event.stopPropagation();
        menu.classList.toggle("is-hidden");
        logHeaderMenu("toggle", { open: !menu.classList.contains("is-hidden") });
        return;
      }

      var insideMenu = event.target && event.target.closest ? event.target.closest("[data-contacto-header-menu='true']") : null;
      if (insideMenu) {
        if (menu) {
          menu.classList.add("is-hidden");
        }
        logHeaderMenu("inside.click", { close: true });
        return;
      }

      if (menu) {
        menu.classList.add("is-hidden");
      }
      logHeaderMenu("outside.click", { close: true });
    });
  }

  function bindTagCreateModal() {
    if (document.body.dataset.contactoTagCreateBound === "true") return;
    document.body.dataset.contactoTagCreateBound = "true";

    var modal = document.querySelector("[data-contacto-tag-create-modal]");
    if (!modal) return;
    var nameInput = modal.querySelector("[data-contacto-tag-create-name]");
    var status = modal.querySelector("[data-contacto-tag-create-status]");
    var listWrap = modal.querySelector("[data-contacto-tag-create-list]");
    var save = modal.querySelector("[data-contacto-tag-create-save]");
    var modeNode = modal.querySelector("[data-contacto-tag-create-mode]");
    var root = document.querySelector(".contacto-shell");
    var isAdmin = root && root.getAttribute("data-contacto-tags-admin") === "true";
    var selectedColor = CONTACTO_TAG_COLORS[0];
    var editingTagId = "";
    var editingTagName = "";

    function logTagCreate(label, data) {
      if (!window.console || typeof window.console.log !== "function") return;
      window.console.log("[Contactos][TagCreate] " + label, data || {});
    }

    function setTagCreateMode(mode) {
      var normalized = mode === "edit" ? "edit" : "create";
      if (save) save.textContent = normalized === "edit" ? "Actualizar" : "Guardar";
      if (modeNode) {
        modeNode.textContent = normalized === "edit" ? "Modo: Edicion" : "Modo: Creacion";
      }
    }

    function loadTagIntoEditor(tagId, name, color) {
      var resolvedTagId = String(tagId || "").trim();
      var resolvedName = normalizeTagName(name);
      var resolvedColor = String(color || "").trim();
      if (resolvedTagId && !resolvedName) {
        var tagById = contactoTagStore.byId[resolvedTagId];
        if (tagById && tagById.name) {
          resolvedName = normalizeTagName(tagById.name);
        }
        if (!resolvedColor && tagById && tagById.color) {
          resolvedColor = String(tagById.color || "");
        }
      }
      if (!resolvedTagId && resolvedName) {
        var meta = getTagMeta(resolvedName);
        resolvedTagId = String(meta && meta.id ? meta.id : "").trim();
        if (!resolvedColor && meta && meta.color) {
          resolvedColor = String(meta.color);
        }
      }
      if (!resolvedName && !resolvedTagId) {
        if (status) status.textContent = "No se pudo cargar la etiqueta para editar.";
        return false;
      }
      editingTagId = resolvedTagId;
      editingTagName = resolvedName;
      if (nameInput) {
        nameInput.value = resolvedName;
        nameInput.focus();
        try {
          nameInput.setSelectionRange(0, nameInput.value.length);
        } catch (error) {}
      }
      if (resolvedColor) {
        selectedColor = resolvedColor;
      }
      modal.querySelectorAll("[data-contacto-tag-create-color]").forEach(function (button) {
        var btnColor = String(button.getAttribute("data-contacto-tag-create-color") || "");
        button.classList.toggle("is-active", btnColor.toLowerCase() === String(selectedColor || "").toLowerCase());
      });
      setTagCreateMode("edit");
      if (status) status.textContent = "Editando etiqueta seleccionada.";
      return true;
    }

    function renderCreatedTags() {
      if (!listWrap) return;
      listWrap.innerHTML = "";
      var tags = listContactoTags();
      if (!tags.length) {
        var empty = document.createElement("div");
        empty.className = "contacto-tag-create-empty";
        empty.textContent = "No hay etiquetas creadas.";
        listWrap.appendChild(empty);
        return;
      }

      tags.forEach(function (tag) {
        var row = document.createElement("div");
        row.className = "contacto-tag-create-row";

        var chipWrap = document.createElement("div");
        chipWrap.className = "contacto-tag-create-row-chip";
        chipWrap.appendChild(createTagChip(tag.name));

        var name = document.createElement("span");
        name.className = "contacto-tag-create-row-name";
        name.textContent = tag.name;
        chipWrap.appendChild(name);

        row.appendChild(chipWrap);

        var actions = document.createElement("div");
        actions.className = "contacto-tag-create-row-actions";

        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "contacto-tag-create-row-edit";
        edit.setAttribute("data-contacto-tag-create-edit", String(tag.id || ""));
        edit.setAttribute("data-contacto-tag-create-name", String(tag.name || ""));
        edit.setAttribute("data-contacto-tag-create-color", String(tag.color || ""));
        edit.textContent = "Editar";
        edit.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          loadTagIntoEditor(tag.id, tag.name, tag.color);
        });
        actions.appendChild(edit);

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "contacto-tag-create-row-delete";
        remove.setAttribute("data-contacto-tag-create-delete", String(tag.id || ""));
        remove.textContent = "Eliminar";
        if (!isAdmin || !tag.id) {
          remove.disabled = true;
          remove.title = "Solo administradores";
        }
        remove.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (remove.disabled) return;
          var tagId = String(tag.id || "").trim();
          if (!tagId) return;
          remove.disabled = true;
          if (status) status.textContent = "Eliminando etiqueta...";
          deleteTagOnServer(tagId, function (payload) {
            if (payload && payload.name) {
              if (status) status.textContent = "Etiqueta eliminada.";
              renderCreatedTags();
            } else {
              if (status) status.textContent = "No se pudo eliminar la etiqueta.";
              remove.disabled = false;
            }
          });
        });
        actions.appendChild(remove);

        row.appendChild(actions);

        listWrap.appendChild(row);
      });
    }

    function openModal() {
      modal.classList.remove("is-hidden");
      modal.setAttribute("aria-hidden", "false");
      if (status) status.textContent = "";
      if (nameInput) {
        nameInput.value = "";
        setTimeout(function () { nameInput.focus(); }, 0);
      }
      editingTagId = "";
      editingTagName = "";
      selectedColor = CONTACTO_TAG_COLORS[0];
      modal.querySelectorAll("[data-contacto-tag-create-color]").forEach(function (button, index) {
        button.classList.toggle("is-active", index === 0);
      });
      setTagCreateMode("create");
      renderCreatedTags();
      logTagCreate("open", { turbo: !!window.Turbo });
    }

    function closeModal() {
      modal.classList.add("is-hidden");
      modal.setAttribute("aria-hidden", "true");
      logTagCreate("close");
    }

    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      if (!target || !target.closest) return;

      var open = target.closest("[data-contacto-open-tag-create='true']");
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        logTagCreate("open.click", { text: open.textContent });
        openModal();
        return;
      }

      var close = target.closest("[data-contacto-tag-create-close]");
      if (close) {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
        return;
      }

      var colorBtn = target.closest("[data-contacto-tag-create-color]");
      if (colorBtn) {
        event.preventDefault();
        selectedColor = colorBtn.getAttribute("data-contacto-tag-create-color") || CONTACTO_TAG_COLORS[0];
        modal.querySelectorAll("[data-contacto-tag-create-color]").forEach(function (button) {
          button.classList.toggle("is-active", button === colorBtn);
        });
        return;
      }

      var editBtn = target.closest("[data-contacto-tag-create-edit]");
      if (editBtn) {
        event.preventDefault();
        event.stopPropagation();
        var editTagId = String(editBtn.getAttribute("data-contacto-tag-create-edit") || "").trim();
        var currentName = String(editBtn.getAttribute("data-contacto-tag-create-name") || "").trim();
        var currentColor = String(editBtn.getAttribute("data-contacto-tag-create-color") || "").trim();
        loadTagIntoEditor(editTagId, currentName, currentColor);
        return;
      }

      var deleteBtn = target.closest("[data-contacto-tag-create-delete]");
      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        if (deleteBtn.disabled) return;
        var tagId = String(deleteBtn.getAttribute("data-contacto-tag-create-delete") || "").trim();
        if (!tagId) return;
        deleteBtn.disabled = true;
        if (status) status.textContent = "Eliminando etiqueta...";
        deleteTagOnServer(tagId, function (payload) {
          if (payload && payload.name) {
            if (status) status.textContent = "Etiqueta eliminada.";
            renderCreatedTags();
          } else {
            if (status) status.textContent = "No se pudo eliminar la etiqueta.";
            deleteBtn.disabled = false;
          }
        });
        return;
      }

      var saveBtn = target.closest("[data-contacto-tag-create-save]");
      if (saveBtn) {
        event.preventDefault();
        event.stopPropagation();
        var name = normalizeTagName(nameInput ? nameInput.value : "");
        if (!name) {
          if (status) status.textContent = "El nombre es obligatorio.";
          logTagCreate("save.validation_error", { reason: "blank_name" });
          return;
        }
        if (save) save.disabled = true;
        if (status) status.textContent = "Guardando...";
        logTagCreate("save.request", { name: name, color: selectedColor });
        if (editingTagId || editingTagName) {
          var effectiveTagId = String(editingTagId || "").trim();
          var tagMeta = effectiveTagId ? (contactoTagStore.byId[effectiveTagId] || null) : null;
          if (!tagMeta && editingTagName) {
            tagMeta = contactoTagStore.byName[tagKey(editingTagName)] || null;
            if (tagMeta && tagMeta.id) {
              effectiveTagId = String(tagMeta.id);
            }
          }
          var previousName = normalizeTagName(tagMeta ? tagMeta.name : "");
          if (!previousName) previousName = normalizeTagName(editingTagName);
          var previousColor = String(tagMeta && tagMeta.color ? tagMeta.color : "").toLowerCase();
          var nextColor = String(selectedColor || "").toLowerCase();
          var nameChanged = name !== previousName;
          var colorChanged = nextColor !== previousColor;

          if (!effectiveTagId) {
            if (save) save.disabled = false;
            if (status) status.textContent = "No se pudo identificar la etiqueta. Recarga la pagina.";
            return;
          }

          var finishEdit = function () {
            if (save) save.disabled = false;
            editingTagId = "";
            editingTagName = "";
            if (nameInput) {
              nameInput.value = "";
              nameInput.focus();
            }
            selectedColor = CONTACTO_TAG_COLORS[0];
            modal.querySelectorAll("[data-contacto-tag-create-color]").forEach(function (button, index) {
              button.classList.toggle("is-active", index === 0);
            });
            setTagCreateMode("create");
            if (status) status.textContent = "Etiqueta actualizada.";
            renderCreatedTags();
          };

          var applyColorUpdate = function (resolvedTagId) {
            if (!colorChanged) {
              finishEdit();
              return;
            }
            updateTagColorOnServer(resolvedTagId, selectedColor, function (colorPayload) {
              if (!(colorPayload && colorPayload.tag)) {
                if (save) save.disabled = false;
                if (status) status.textContent = "No se pudo actualizar el color.";
                return;
              }
              finishEdit();
            });
          };

          if (nameChanged) {
            renameTagOnServer(effectiveTagId, name, function (renamePayload) {
              if (!(renamePayload && renamePayload.tag)) {
                if (save) save.disabled = false;
                if (status) status.textContent = "No se pudo actualizar el nombre.";
                return;
              }
              applyColorUpdate(renamePayload.tag.id || effectiveTagId);
            });
          } else if (colorChanged) {
            applyColorUpdate(effectiveTagId);
          } else {
            if (save) save.disabled = false;
            if (status) status.textContent = "Sin cambios.";
          }
          return;
        }

        ensureTagOnServer(name, function (tag) {
          if (save) save.disabled = false;
          if (!tag) {
            if (status) status.textContent = "No se pudo crear la etiqueta.";
            logTagCreate("save.error", { name: name });
            return;
          }
          if (status) status.textContent = "Etiqueta creada.";
          logTagCreate("save.success", { id: tag.id, name: tag.name, color: tag.color });
          if (nameInput) {
            nameInput.value = "";
            nameInput.focus();
          }
          renderCreatedTags();
          document.querySelectorAll("[data-contacto-tags-input]").forEach(function (wrap) {
            if (wrap.dataset.bound === "true") {
              var dropdown = wrap.querySelector("[data-contacto-tags-dropdown]");
              if (dropdown && !dropdown.classList.contains("is-hidden")) {
                dropdown.classList.add("is-hidden");
              }
            }
          });
        }, selectedColor);
      }
    });

    if (nameInput) {
      nameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          if (save) save.click();
        } else if (event.key === "Escape") {
          closeModal();
        }
      });
    }
  }

  function bindSelection() {
    if (document.body.dataset.contactoSelectionBound === "true") return;
    document.body.dataset.contactoSelectionBound = "true";

    function visibleRows() {
      return Array.prototype.slice.call(document.querySelectorAll("[data-contacto-select-row]")).filter(function (checkbox) {
        var row = checkbox.closest("tr");
        if (!row) return false;
        return row.offsetParent !== null;
      });
    }

    function updateHeaderState(header) {
      var rows = visibleRows();
      if (!rows.length) {
        header.checked = false;
        header.indeterminate = false;
        return;
      }
      var checkedCount = rows.filter(function (checkbox) { return checkbox.checked; }).length;
      header.checked = checkedCount === rows.length;
      header.indeterminate = checkedCount > 0 && checkedCount < rows.length;
    }

    document.addEventListener("change", function (event) {
      var target = event.target;
      if (!target) return;
      if (target.matches("[data-contacto-select-all]")) {
        var rows = visibleRows();
        rows.forEach(function (checkbox) {
          checkbox.checked = target.checked;
        });
        target.indeterminate = false;
        return;
      }
      if (target.matches("[data-contacto-select-row]")) {
        var header = document.querySelector("[data-contacto-select-all]");
        if (header) {
          updateHeaderState(header);
        }
      }
    });

    var header = document.querySelector("[data-contacto-select-all]");
    if (header) {
      updateHeaderState(header);
    }
  }

  function bindBulkMacros() {
    if (document.body.dataset.contactoBulkMacroBound === "true") return;
    document.body.dataset.contactoBulkMacroBound = "true";
    var root = document.querySelector(".contacto-shell");
    if (!root) return;
    var wrap = document.querySelector("[data-contacto-macro-bulk]");
    var select = document.querySelector("[data-contacto-macro-select]");
    var runButton = document.querySelector("[data-contacto-macro-run]");
    if (!wrap || !select || !runButton) return;

    var listUrl = root.getAttribute("data-contacto-macros-list-url") || "";
    var runUrl = root.getAttribute("data-contacto-macros-run-url") || "";
    var macroFlows = [];
    var loading = false;

    function collectSelectedRows() {
      return Array.prototype.slice.call(document.querySelectorAll("[data-contacto-select-row]:checked"))
        .map(function (checkbox) { return checkbox.closest("tr[data-contacto-id]"); })
        .filter(function (row) { return !!row && row.offsetParent !== null; });
    }

    function extractContactPayload(row) {
      if (!row) return null;
      var nameCell = row.querySelector("td[data-field='name']");
      var phoneCell = row.querySelector("td[data-field='phone']");
      var emailCell = row.querySelector("td[data-field='email']");
      var firstName = nameCell ? (nameCell.getAttribute("data-first-name") || "").trim() : "";
      var lastName = nameCell ? (nameCell.getAttribute("data-last-name") || "").trim() : "";
      var fullName = [firstName, lastName].filter(function (part) { return !!part; }).join(" ").trim();
      if (!fullName && nameCell) {
        fullName = (nameCell.textContent || "").trim();
      }
      var phone = phoneCell ? (phoneCell.getAttribute("data-value") || phoneCell.textContent || "").trim() : "";
      var email = emailCell ? (emailCell.getAttribute("data-value") || emailCell.textContent || "").trim() : "";
      var chatIdRaw = String(row.getAttribute("data-contacto-chat-id") || "").trim();
      var chatId = /^\d+$/.test(chatIdRaw) ? Number(chatIdRaw) : 0;
      return {
        firstName: fullName,
        email: email,
        phone: phone,
        chatId: chatId > 0 ? String(chatId) : ""
      };
    }

    function updateRunButtonState() {
      var hasMacro = !!select.value;
      var hasSelection = collectSelectedRows().length > 0;
      runButton.disabled = loading || !hasMacro || !hasSelection;
    }

    function renderMacroOptions() {
      var currentValue = select.value;
      select.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Seleccione macro";
      select.appendChild(placeholder);
      macroFlows.forEach(function (flow) {
        if (!flow || !flow.id) return;
        var option = document.createElement("option");
        option.value = String(flow.id);
        option.textContent = flow.name || ("Flujo " + flow.id);
        if (flow.macro_node_id) option.setAttribute("data-macro-node-id", String(flow.macro_node_id));
        select.appendChild(option);
      });
      if (currentValue && select.querySelector('option[value="' + currentValue + '"]')) {
        select.value = currentValue;
      } else {
        select.value = "";
      }
      select.disabled = loading || macroFlows.length === 0;
      updateRunButtonState();
    }

    function loadMacros() {
      if (!listUrl) {
        renderMacroOptions();
        return;
      }
      loading = true;
      renderMacroOptions();
      fetch(listUrl, { headers: { "Accept": "application/json" } })
        .then(function (response) {
          if (!response.ok) throw new Error("macros_list_failed");
          return response.json();
        })
        .then(function (payload) {
          macroFlows = Array.isArray(payload && payload.flows) ? payload.flows : [];
        })
        .catch(function () {
          macroFlows = [];
        })
        .then(function () {
          loading = false;
          renderMacroOptions();
        });
    }

    function runMacrosForSelection() {
      if (!runUrl || !select.value) return;
      var rows = collectSelectedRows();
      if (!rows.length) return;
      var selectedOption = select.options[select.selectedIndex];
      var macroNodeId = selectedOption ? (selectedOption.getAttribute("data-macro-node-id") || "") : "";
      var flowId = select.value;
      var token = document.querySelector("meta[name='csrf-token']");
      loading = true;
      updateRunButtonState();
      var requests = rows.map(function (row) {
        var payload = extractContactPayload(row);
        if (!payload) return Promise.resolve();
        var url = runUrl + "?flow_id=" + encodeURIComponent(flowId);
        if (macroNodeId) url += "&macro_node_id=" + encodeURIComponent(macroNodeId);
        if (payload.chatId) url += "&chat_id=" + encodeURIComponent(payload.chatId);
        if (payload.firstName) url += "&first_name=" + encodeURIComponent(payload.firstName);
        if (payload.email) url += "&email=" + encodeURIComponent(payload.email);
        if (payload.phone) url += "&phone=" + encodeURIComponent(payload.phone);
        return fetch(url, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          }
        }).catch(function () {});
      });
      Promise.all(requests).then(function () {
        loading = false;
        updateRunButtonState();
      });
    }

    if (select.dataset.contactoBound !== "true") {
      select.dataset.contactoBound = "true";
      select.addEventListener("change", updateRunButtonState);
    }

    if (runButton.dataset.contactoBound !== "true") {
      runButton.dataset.contactoBound = "true";
      runButton.addEventListener("click", function (event) {
        event.preventDefault();
        if (runButton.disabled) return;
        runMacrosForSelection();
      });
    }

    if (document.body.dataset.contactoBulkMacroSelectionBound !== "true") {
      document.body.dataset.contactoBulkMacroSelectionBound = "true";
      document.addEventListener("change", function (event) {
        var target = event.target;
        if (!target) return;
        if (target.matches("[data-contacto-select-row]") || target.matches("[data-contacto-select-all]")) {
          updateRunButtonState();
        }
      });
    }

    loadMacros();
  }

  function bindCallActivityModal() {
    if (window.__contactoCallModalBound === true) return;
    window.__contactoCallModalBound = true;

    var root = document.querySelector(".contacto-shell");
    if (!root) return;

    var urlTemplate = root.getAttribute("data-contacto-call-activity-url-template") || "";
    var currentContext = { contactId: "", chatId: "", phone: "" };
    var lastCallModalOpenAt = 0;
    var saveInFlight = false;
    var ckeditorInstance = null;
    var ckeditorReady = false;
    function emitCallEvent(name, detail) {
      try {
        document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
      } catch (_error) {}
    }

    function resolveModal() {
      return document.querySelector("[data-contacto-call-modal]");
    }

    function resolveOutcomeSelect() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-call-outcome]") : null;
    }

    function resolveNoteField() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-call-note]") : null;
    }

    function resolveSaveButton() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-call-save]") : null;
    }

    function getCallDurationValue() {
      var modal = resolveModal();
      if (!modal) return "00:00:00";
      var value = String(modal.getAttribute("data-contacto-call-duration") || "").trim();
      if (value && value !== "00:00:00") return value;
      var audio = modal.querySelector("[data-contacto-call-recorder-audio]");
      if (audio && isFinite(audio.duration) && audio.duration > 0) {
        var seconds = Math.max(0, Math.floor(Number(audio.duration) || 0));
        var hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
        var mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
        var ss = String(seconds % 60).padStart(2, "0");
        return hh + ":" + mm + ":" + ss;
      }
      var ruler = modal.querySelector("[data-contacto-call-waveform-ruler]");
      if (ruler) {
        var marks = ruler.querySelectorAll("span");
        if (marks && marks.length) {
          var last = String(marks[marks.length - 1].textContent || "").trim();
          if (/^\d{2}:\d{2}:\d{2}$/.test(last) && last !== "00:00:00") return last;
        }
      }
      return "00:00:00";
    }

    function getRecorderPreviewToken() {
      var modal = resolveModal();
      if (!modal) return "";
      return String(modal.getAttribute("data-contacto-recorder-preview-token") || "").trim();
    }

    function finalizeRecorderBeforeSave() {
      return new Promise(function (resolve) {
        var detail = {};
        try {
          document.dispatchEvent(new CustomEvent("contacto:call_finalize_for_save", { detail: detail }));
        } catch (_error) {
          resolve();
          return;
        }
        var waitPromise = detail && detail.waitPromise;
        if (!waitPromise || typeof waitPromise.then !== "function") {
          resolve();
          return;
        }
        var settled = false;
        var timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          try {
            document.dispatchEvent(new CustomEvent("contacto:call_force_stop_before_save", {
              detail: { reason: "timeout" }
            }));
          } catch (_error) {}
          if (window.console && typeof window.console.warn === "function") {
            window.console.warn("[Contactos][Call] finalizeRecorderBeforeSave.timeout");
          }
          resolve();
        }, 10000);
        waitPromise.then(function () {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve();
        }).catch(function (error) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          try {
            document.dispatchEvent(new CustomEvent("contacto:call_force_stop_before_save", {
              detail: { reason: "error" }
            }));
          } catch (_error) {}
          if (window.console && typeof window.console.warn === "function") {
            window.console.warn("[Contactos][Call] finalizeRecorderBeforeSave.error", error);
          }
          resolve();
        });
      });
    }

    function ensureEditor() {
      var noteField = resolveNoteField();
      if (ckeditorReady || !noteField) return;
      ckeditorReady = true;
      if (!window.CKEDITOR || typeof window.CKEDITOR.replace !== "function") return;
      try {
        ckeditorInstance = window.CKEDITOR.replace(noteField.id);
      } catch (_error) {
        ckeditorInstance = null;
      }
    }

    function getNoteValue() {
      var noteField = resolveNoteField();
      if (ckeditorInstance && typeof ckeditorInstance.getData === "function") {
        return ckeditorInstance.getData() || "";
      }
      return noteField ? noteField.value : "";
    }

    function setNoteValue(value) {
      var noteField = resolveNoteField();
      if (ckeditorInstance && typeof ckeditorInstance.setData === "function") {
        ckeditorInstance.setData(value || "");
        return;
      }
      if (noteField) noteField.value = value || "";
    }

    function openModal(context) {
      var modal = resolveModal();
      if (!modal) return;
      var nextContext = context || { contactId: "", chatId: "", phone: "" };
      var now = Date.now();
      if ((now - lastCallModalOpenAt) < 450) return;
      if (!modal.classList.contains("is-hidden") &&
          String(currentContext.contactId || "") === String(nextContext.contactId || "")) {
        return;
      }
      lastCallModalOpenAt = now;
      currentContext = nextContext;
      var select = resolveOutcomeSelect();
      if (select) select.value = "";
      setNoteValue("");
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos][Call] openModal", {
          contact_id: currentContext.contactId || "",
          chat_id: currentContext.chatId || "",
          phone: currentContext.phone || "",
          select_present: !!select,
          select_value: select ? String(select.value || "") : "",
          selected_index: select ? select.selectedIndex : -1
        });
      }
      modal.classList.remove("is-hidden");
      modal.setAttribute("aria-hidden", "false");
      emitCallEvent("contacto:call_modal_open", {
        contactId: currentContext.contactId || "",
        chatId: currentContext.chatId || "",
        phone: currentContext.phone || ""
      });
      ensureEditor();
      if (select) select.focus();
    }

    function closeModal() {
      var modal = resolveModal();
      if (!modal) return;
      emitCallEvent("contacto:call_modal_close", {});
      modal.classList.add("is-hidden");
      modal.setAttribute("aria-hidden", "true");
      lastCallModalOpenAt = 0;
    }

    function markRowLogged(contactId) {
      if (!contactId) return;
      var row = document.querySelector("tr[data-contacto-id='" + contactId + "']");
      if (!row) return;
      row.setAttribute("data-contacto-call-logged", "1");
      var trigger = row.querySelector("[data-contacto-call-open]");
      if (trigger) trigger.classList.add("is-logged");
    }

    function dialCurrentPhone() {
      var raw = String(currentContext.phone || "").trim();
      if (!raw) return;
      window.location.href = "tel:" + raw;
    }

    function saveCallActivity() {
      if (!currentContext.contactId || !urlTemplate) return;
      if (saveInFlight) return;
      var select = resolveOutcomeSelect();
      var outcome = select ? String(select.value || "").trim() : "";
      if (!outcome && select && select.selectedIndex > 0) {
        outcome = String(select.options[select.selectedIndex].value || "").trim();
      }
      var note = getNoteValue();
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos][Call] saveCallActivity.beforeValidate", {
          contact_id: currentContext.contactId || "",
          chat_id: currentContext.chatId || "",
          select_present: !!select,
          select_value: select ? String(select.value || "") : "",
          selected_index: select ? select.selectedIndex : -1,
          computed_outcome: outcome,
          note_length: String(note || "").length
        });
      }
      if (!outcome) {
        window.alert("Selecciona un resultado de llamada.");
        return;
      }
      var token = document.querySelector("meta[name='csrf-token']");
      var url = urlTemplate.replace("__CONTACT_ID__", encodeURIComponent(currentContext.contactId));
      var saveButton = resolveSaveButton();
      saveInFlight = true;
      if (saveButton) saveButton.setAttribute("disabled", "disabled");
      finalizeRecorderBeforeSave()
        .then(function () {
          var callDuration = getCallDurationValue();
          var recorderPreviewToken = getRecorderPreviewToken();
          if (window.console && typeof window.console.log === "function") {
            window.console.log("[Contactos][Call] saveCallActivity.finalized", {
              call_duration: callDuration,
              recorder_preview_token_present: !!recorderPreviewToken
            });
          }
          return fetch(url, {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "X-CSRF-Token": token ? token.content : ""
            },
            body: JSON.stringify({
              chat_id: currentContext.chatId || "",
              outcome: outcome,
              note: note,
              call_duration: callDuration,
              recorder_preview_token: recorderPreviewToken
            })
          });
        })
        .then(function (response) {
          if (window.console && typeof window.console.log === "function") {
            window.console.log("[Contactos][Call] saveCallActivity.response", {
              status: response.status,
              ok: response.ok
            });
          }
          if (!response.ok) throw new Error("call_activity_failed");
          return response.json();
        })
        .then(function (payload) {
          if (window.console && typeof window.console.log === "function") {
            window.console.log("[Contactos][Call] saveCallActivity.payload", payload);
          }
          if (!payload || payload.ok !== true) throw new Error("call_activity_failed");
          markRowLogged(String(currentContext.contactId));
          loadCallHistory(String(currentContext.contactId));
          closeModal();
        })
        .catch(function () {
          window.alert("No se pudo registrar la llamada.");
        })
        .finally(function () {
          saveInFlight = false;
          if (saveButton) saveButton.removeAttribute("disabled");
        });
    }

    document.addEventListener("click", function (event) {
      var openTrigger = event.target.closest("[data-contacto-call-open]");
      if (openTrigger) {
        event.preventDefault();
        var row = openTrigger.closest("tr[data-contacto-id]");
        if (!row) return;
        var phoneCell = row.querySelector("td[data-field='phone']");
        var phone = phoneCell ? String(phoneCell.getAttribute("data-value") || "").trim() : "";
        var chatIdRaw = String(row.getAttribute("data-contacto-chat-id") || "").trim();
        openModal({
          contactId: String(row.getAttribute("data-contacto-id") || ""),
          chatId: /^\d+$/.test(chatIdRaw) ? chatIdRaw : "",
          phone: phone
        });
        return;
      }

      var closeTrigger = event.target.closest("[data-contacto-call-close]");
      if (closeTrigger) {
        event.preventDefault();
        closeModal();
        return;
      }

      if (event.target.closest("[data-contacto-call-dial]")) {
        event.preventDefault();
        dialCurrentPhone();
        return;
      }

      if (event.target.closest("[data-contacto-call-save]")) {
        event.preventDefault();
        saveCallActivity();
        return;
      }

      var deleteHistoryTrigger = event.target.closest("[data-contacto-call-history-delete]");
      if (deleteHistoryTrigger) {
        event.preventDefault();
        var historyId = String(deleteHistoryTrigger.getAttribute("data-contacto-call-history-delete") || "").trim();
        if (!historyId) return;
        if (!window.confirm("¿Eliminar este registro del historial?")) return;
        deleteCallHistoryEntry(currentHistoryContactId(), historyId);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var modal = resolveModal();
      if (!modal) return;
      if (modal.classList.contains("is-hidden")) return;
      closeModal();
    });
  }

  function bindPauseActivityModal() {
    if (window.__contactoPauseModalBound === true) return;
    window.__contactoPauseModalBound = true;

    var root = document.querySelector(".contacto-shell");
    if (!root) return;
    var pauseUrl = String(root.getAttribute("data-contacto-pause-activity-url") || "").trim();
    if (!pauseUrl) return;

    var startedAtMs = null;
    var tickTimer = null;
    var saveInFlight = false;

    function resolveModal() {
      return document.querySelector("[data-contacto-pause-modal]");
    }

    function resolveTimer() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-pause-timer]") : null;
    }

    function resolveHint() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-pause-hint]") : null;
    }

    function resolveStartButton() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-pause-start]") : null;
    }

    function resolveFinishButton() {
      var modal = resolveModal();
      return modal ? modal.querySelector("[data-contacto-pause-finish]") : null;
    }

    function formatHms(totalSeconds) {
      var seconds = Math.max(0, Number(totalSeconds) || 0);
      var hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
      var mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
      var ss = String(seconds % 60).padStart(2, "0");
      return hh + ":" + mm + ":" + ss;
    }

    function elapsedSeconds() {
      if (!startedAtMs) return 0;
      return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    }

    function render() {
      var timerEl = resolveTimer();
      var hintEl = resolveHint();
      var running = !!startedAtMs;
      var seconds = elapsedSeconds();
      if (timerEl) timerEl.textContent = formatHms(seconds);
      if (hintEl) {
        hintEl.textContent = running
          ? "Midiendo pausa en curso."
          : "Inicia para comenzar a medir tu pausa.";
      }
      var startBtn = resolveStartButton();
      var finishBtn = resolveFinishButton();
      if (startBtn) startBtn.disabled = running || saveInFlight;
      if (finishBtn) finishBtn.disabled = !running || saveInFlight;
    }

    function stopTicking() {
      if (tickTimer) {
        window.clearInterval(tickTimer);
        tickTimer = null;
      }
    }

    function resetState() {
      stopTicking();
      startedAtMs = null;
      saveInFlight = false;
      render();
    }

    function openModal() {
      var modal = resolveModal();
      if (!modal) return;
      modal.classList.remove("is-hidden");
      modal.setAttribute("aria-hidden", "false");
      render();
    }

    function closeModal() {
      var modal = resolveModal();
      if (!modal) return;
      if (startedAtMs) return;
      modal.classList.add("is-hidden");
      modal.setAttribute("aria-hidden", "true");
    }

    function startPause() {
      if (startedAtMs || saveInFlight) return;
      startedAtMs = Date.now();
      stopTicking();
      tickTimer = window.setInterval(render, 1000);
      render();
    }

    function finishPause() {
      if (!startedAtMs || saveInFlight) return;
      var durationSeconds = elapsedSeconds();
      if (durationSeconds <= 0) {
        window.alert("La pausa aun no tiene duracion.");
        return;
      }

      saveInFlight = true;
      render();

      var token = document.querySelector("meta[name='csrf-token']");
      fetch(pauseUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ duration: formatHms(durationSeconds) })
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (payload) {
            if (!response.ok) {
              var message = payload && payload.error ? String(payload.error) : "pause_activity_failed";
              throw new Error(message);
            }
            return payload;
          });
        })
        .then(function (payload) {
          if (!payload || payload.ok !== true) throw new Error("pause_activity_failed");
          var modal = resolveModal();
          if (modal) {
            modal.classList.add("is-hidden");
            modal.setAttribute("aria-hidden", "true");
          }
          resetState();
        })
        .catch(function (error) {
          saveInFlight = false;
          render();
          var message = (error && error.message) ? String(error.message) : "No se pudo registrar la pausa.";
          window.alert(message);
        });
    }

    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-contacto-pause-open]")) {
        event.preventDefault();
        openModal();
        return;
      }
      if (event.target.closest("[data-contacto-pause-start]")) {
        event.preventDefault();
        startPause();
        return;
      }
      if (event.target.closest("[data-contacto-pause-finish]")) {
        event.preventDefault();
        finishPause();
        return;
      }
      if (event.target.closest("[data-contacto-pause-close]")) {
        event.preventDefault();
        closeModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeModal();
    });

    document.addEventListener("turbo:before-cache", function () {
      resetState();
      var modal = resolveModal();
      if (modal) {
        modal.classList.add("is-hidden");
        modal.setAttribute("aria-hidden", "true");
      }
    });
  }

  function bindCustomFieldOptions() {
    document.querySelectorAll("form[data-contacto-field-form]").forEach(function (form) {
      if (form.dataset.bound === "true") return;
      form.dataset.bound = "true";

      var typeSelect = form.querySelector("[data-contacto-field-type]");
      var optionsWrap = form.querySelector("[data-contacto-field-options]");
      var optionsList = form.querySelector("[data-contacto-field-options-list]");
      var addButton = form.querySelector("[data-contacto-field-option-add]");
      var optionsText = form.querySelector("[data-contacto-field-options-input]");
      if (!typeSelect || !optionsWrap || !optionsList || !addButton || !optionsText) return;

      function createOptionRow(value) {
        var row = document.createElement("div");
        row.className = "contacto-field-option-row";
        var input = document.createElement("input");
        input.type = "text";
        input.className = "contacto-field-option-input";
        input.name = "field[options][]";
        input.value = value || "";
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "contacto-field-option-remove";
        remove.textContent = "Quitar";
        remove.addEventListener("click", function () {
          row.remove();
        });
        row.appendChild(input);
        row.appendChild(remove);
        return row;
      }

      function ensureOneOption() {
        if (!optionsList.querySelector(".contacto-field-option-row")) {
          optionsList.appendChild(createOptionRow(""));
        }
      }

      function toggleOptions() {
        var isSelect = typeSelect.value === "select";
        optionsWrap.classList.toggle("is-active", isSelect);
        if (isSelect) {
          ensureOneOption();
        } else {
          optionsList.innerHTML = "";
          optionsText.value = "";
        }
      }

      typeSelect.addEventListener("change", function () {
        toggleOptions();
      });

      addButton.addEventListener("click", function () {
        optionsList.appendChild(createOptionRow(""));
      });

      optionsList.querySelectorAll(".contacto-field-option-remove").forEach(function (btn) {
        if (btn.dataset.bound === "true") return;
        btn.dataset.bound = "true";
        btn.addEventListener("click", function () {
          var row = btn.closest(".contacto-field-option-row");
          if (row) row.remove();
        });
      });

      form.addEventListener("submit", function () {
        var values = [];
        optionsList.querySelectorAll("input.contacto-field-option-input").forEach(function (input) {
          var val = String(input.value || "").trim();
          if (val) values.push(val);
        });
        optionsText.value = values.join(",");
      });

      toggleOptions();
    });
  }

  function bindCustomFieldEditToggle() {
    if (document.body.dataset.contactoFieldEditBound === "true") return;
    document.body.dataset.contactoFieldEditBound = "true";

    document.addEventListener("click", function (event) {
      var toggle = event.target.closest("[data-contacto-field-edit-toggle]");
      if (!toggle) return;
      var item = toggle.closest(".contacto-field-item");
      if (!item) return;
      var edit = item.nextElementSibling;
      if (!edit || !edit.matches("[data-contacto-field-edit]")) return;
      edit.classList.toggle("is-hidden");
    });

    document.addEventListener("click", function (event) {
      var cancel = event.target.closest("[data-contacto-field-edit-cancel]");
      if (!cancel) return;
      var edit = cancel.closest("[data-contacto-field-edit]");
      if (!edit) return;
      edit.classList.add("is-hidden");
    });
  }

  function bindCustomFieldGroupDrag() {
    if (document.body.dataset.contactoFieldGroupBound === "true") return;
    document.body.dataset.contactoFieldGroupBound = "true";

    var root = document.querySelector(".contacto-shell");
    var orderUrl = root ? root.getAttribute("data-contacto-form-order-url") : "";
    if (!orderUrl) return;

    function getGroups(container) {
      return Array.prototype.slice.call(container.querySelectorAll("[data-contacto-field-group]"));
    }

    function getItems(container) {
      return Array.prototype.slice.call(container.querySelectorAll("[data-contacto-field-item]"));
    }

    function persistOrder(container) {
      var ids = getItems(container).map(function (item) {
        return String(item.getAttribute("data-field-key") || "").trim();
      }).filter(function (value) { return value; });
      if (!ids.length) return;
      var token = document.querySelector("meta[name='csrf-token']");
      fetch(orderUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ field_ids: ids })
      }).catch(function () {});
    }

    function ensureGroups(container, count) {
      var groups = getGroups(container);
      while (groups.length < count) {
        var group = document.createElement("div");
        group.className = "contacto-field-group";
        group.setAttribute("data-contacto-field-group", "true");
        group.setAttribute("draggable", "true");
        var grid = document.createElement("div");
        grid.className = "contacto-grid";
        group.appendChild(grid);
        container.appendChild(group);
        groups.push(group);
      }
      return groups;
    }

    function normalizeGroups(container) {
      var items = getItems(container);
      var groupsNeeded = Math.ceil(items.length / 3) || 1;
      var groups = ensureGroups(container, groupsNeeded);
      groups.forEach(function (group) {
        var grid = group.querySelector(".contacto-grid");
        if (grid) grid.innerHTML = "";
      });
      items.forEach(function (item, index) {
        var groupIndex = Math.floor(index / 3);
        var grid = groups[groupIndex].querySelector(".contacto-grid");
        if (grid) grid.appendChild(item);
      });
      groups.forEach(function (group) {
        if (!group.querySelector("[data-contacto-field-item]")) {
          group.remove();
        }
      });
    }

    document.querySelectorAll("[data-contacto-field-groups]").forEach(function (container) {
      if (container.dataset.bound === "true") return;
      container.dataset.bound = "true";

      container.addEventListener("dragstart", function (event) {
        var item = event.target.closest("[data-contacto-field-item]");
        if (item) {
          if (event.target.closest("input, textarea, select")) return;
          item.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.getAttribute("data-field-key") || "field");
          event.dataTransfer.setData("application/x-contacto-drag", "field");
          return;
        }
        var group = event.target.closest("[data-contacto-field-group]");
        if (!group) return;
        group.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-contacto-drag", "group");
      });

      container.addEventListener("dragend", function () {
        getGroups(container).forEach(function (group) {
          group.classList.remove("is-dragging");
          group.classList.remove("is-drop-target");
        });
        getItems(container).forEach(function (item) {
          item.classList.remove("is-dragging");
          item.classList.remove("is-drop-target");
        });
      });

      container.addEventListener("dragover", function (event) {
        event.preventDefault();
        var draggingItem = container.querySelector(".contacto-form-field-item.is-dragging");
        if (draggingItem) {
          var targetItem = event.target.closest("[data-contacto-field-item]");
          var targetGroup = event.target.closest("[data-contacto-field-group]");
          if (targetItem && targetItem !== draggingItem) {
            getItems(container).forEach(function (item) { item.classList.remove("is-drop-target"); });
            targetItem.classList.add("is-drop-target");
            var rectItem = targetItem.getBoundingClientRect();
            var beforeItem = event.clientY < rectItem.top + rectItem.height / 2;
            var parentGrid = targetItem.parentElement;
            if (beforeItem) {
              parentGrid.insertBefore(draggingItem, targetItem);
            } else {
              parentGrid.insertBefore(draggingItem, targetItem.nextSibling);
            }
            return;
          }
          if (targetGroup) {
            var grid = targetGroup.querySelector(".contacto-grid");
            if (grid && !grid.contains(draggingItem)) {
              grid.appendChild(draggingItem);
            }
          }
          return;
        }

        var draggingGroup = container.querySelector(".contacto-field-group.is-dragging");
        var target = event.target.closest("[data-contacto-field-group]");
        if (!draggingGroup || !target || draggingGroup === target) return;

        getGroups(container).forEach(function (group) {
          group.classList.remove("is-drop-target");
        });
        target.classList.add("is-drop-target");

        var rect = target.getBoundingClientRect();
        var before = event.clientY < rect.top + rect.height / 2;
        if (before) {
          container.insertBefore(draggingGroup, target);
        } else {
          container.insertBefore(draggingGroup, target.nextSibling);
        }
      });

      container.addEventListener("drop", function (event) {
        event.preventDefault();
        getGroups(container).forEach(function (group) {
          group.classList.remove("is-drop-target");
        });
        getItems(container).forEach(function (item) {
          item.classList.remove("is-drop-target");
        });
        normalizeGroups(container);
        persistOrder(container);
      });
    });
  }

  function bindCustomFieldsOrderDrag() {
    if (document.body.dataset.contactoFieldOrderBound === "true") return;
    document.body.dataset.contactoFieldOrderBound = "true";

    var root = document.querySelector(".contacto-shell");
    var orderUrl = root ? root.getAttribute("data-contacto-field-order-url") : "";
    if (!orderUrl) return;

    function getItems(container) {
      return Array.prototype.slice.call(container.querySelectorAll(".contacto-field-item"));
    }

    function persistOrder(container) {
      var ids = getItems(container).map(function (item) {
        return String(item.getAttribute("data-field-id") || "").trim();
      }).filter(function (value) { return value; });
      if (!ids.length) return;
      var token = document.querySelector("meta[name='csrf-token']");
      var formData = new FormData();
      ids.forEach(function (id) {
        formData.append("field_ids[]", id);
      });
      fetch(orderUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: formData
      }).catch(function () {});
    }

    document.querySelectorAll("[data-contacto-fields-order]").forEach(function (container) {
      if (container.dataset.bound === "true") return;
      container.dataset.bound = "true";
      container.dataset.orderSnapshot = getItems(container).map(function (item) {
        return String(item.getAttribute("data-field-id") || "").trim();
      }).filter(function (value) { return value; }).join(",");

      container.addEventListener("dragstart", function (event) {
        var item = event.target.closest(".contacto-field-item");
        if (!item) return;
        if (event.target.closest("input, textarea, select, button")) return;
        item.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.getAttribute("data-field-id") || "field");
      });

      container.addEventListener("dragend", function () {
        getItems(container).forEach(function (item) {
          item.classList.remove("is-dragging");
          item.classList.remove("is-drop-target");
        });
        var current = getItems(container).map(function (item) {
          return String(item.getAttribute("data-field-id") || "").trim();
        }).filter(function (value) { return value; }).join(",");
        if (current && current !== (container.dataset.orderSnapshot || "")) {
          container.dataset.orderSnapshot = current;
          persistOrder(container);
        }
      });

      container.addEventListener("dragover", function (event) {
        event.preventDefault();
        var draggingItem = container.querySelector(".contacto-field-item.is-dragging");
        if (!draggingItem) return;
        var targetItem = event.target.closest(".contacto-field-item");
        if (!targetItem || targetItem === draggingItem) return;
        getItems(container).forEach(function (item) { item.classList.remove("is-drop-target"); });
        targetItem.classList.add("is-drop-target");
        var rect = targetItem.getBoundingClientRect();
        var before = event.clientY < rect.top + rect.height / 2;
        if (before) {
          container.insertBefore(draggingItem, targetItem);
        } else {
          container.insertBefore(draggingItem, targetItem.nextSibling);
        }
      });

      container.addEventListener("drop", function (event) {
        event.preventDefault();
        getItems(container).forEach(function (item) {
          item.classList.remove("is-drop-target");
        });
        var current = getItems(container).map(function (item) {
          return String(item.getAttribute("data-field-id") || "").trim();
        }).filter(function (value) { return value; }).join(",");
        if (current) container.dataset.orderSnapshot = current;
        persistOrder(container);
      });
    });
  }
  function bindSettingsMenu() {
    if (window.__contactoSettingsBound === true) return;
    window.__contactoSettingsBound = true;

    function settingsLog(label, data) {
      if (!window.console || typeof window.console.log !== "function") return;
      window.console.log("[Contactos][Settings] " + label, data || {});
    }

    function ensureMenuId(wrapper, menu) {
      var menuId = wrapper ? wrapper.getAttribute("data-contacto-settings-id") : "";
      if (!menuId) {
        menuId = "contacto-settings-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
        if (wrapper) wrapper.setAttribute("data-contacto-settings-id", menuId);
      }
      if (menu && menuId) menu.setAttribute("data-contacto-settings-id", menuId);
      return menuId;
    }

    function wrapperByMenu(menu) {
      if (!menu) return null;
      var menuId = menu.getAttribute("data-contacto-settings-id");
      if (!menuId) return null;
      return document.querySelector(".contacto-settings-menu[data-contacto-settings-id='" + menuId + "']");
    }

    function rehomeMenu(menu) {
      var wrapper = wrapperByMenu(menu);
      if (wrapper && menu.parentElement !== wrapper) {
        wrapper.appendChild(menu);
      }
      menu.style.position = "";
      menu.style.left = "";
      menu.style.top = "";
      menu.style.transform = "";
      menu.style.visibility = "";
      var cell = wrapper ? wrapper.closest("td[data-field='settings']") : null;
      if (cell) cell.classList.remove("is-settings-open");
    }

    function closeAll() {
      var menus = document.querySelectorAll(".contacto-settings-dropdown");
      settingsLog("closeAll", { total: menus.length });
      menus.forEach(function (menu) {
        menu.classList.add("is-hidden");
        rehomeMenu(menu);
      });
    }

    var clickHandler = function (event) {
      var toggle = event.target.closest("[data-contacto-settings]");
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        settingsLog("toggle.click", {
          tag: event.target && event.target.tagName ? event.target.tagName : "",
          className: event.target && event.target.className ? String(event.target.className) : ""
        });
        var wrapper = toggle.closest(".contacto-settings-menu");
        if (!wrapper) {
          settingsLog("toggle.no_wrapper");
          return;
        }
        var menu = wrapper.querySelector(".contacto-settings-dropdown");
        if (!menu) {
          var wrapperId = wrapper.getAttribute("data-contacto-settings-id");
          if (wrapperId) {
            menu = document.querySelector(".contacto-settings-dropdown[data-contacto-settings-id='" + wrapperId + "']");
          }
        }
        if (!menu) {
          settingsLog("toggle.no_menu");
          return;
        }
        ensureMenuId(wrapper, menu);
        var isOpen = !menu.classList.contains("is-hidden");
        settingsLog("toggle.state", {
          isOpen: isOpen,
          wrapperFound: !!wrapper,
          menuFound: !!menu
        });
        closeAll();
        if (!isOpen) {
          if (menu.parentElement !== document.body) {
            document.body.appendChild(menu);
          }
          menu.style.position = "fixed";
          menu.style.transform = "none";
          menu.classList.remove("is-hidden");
          var rect = toggle.getBoundingClientRect();
          var menuWidth = menu.offsetWidth || 220;
          var menuHeight = menu.offsetHeight || 120;
          var left = rect.right - menuWidth;
          var top = rect.bottom + 6;
          if (left < 8) left = 8;
          if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuWidth - 8);
          if (top + menuHeight > window.innerHeight - 8) {
            top = rect.top - menuHeight - 6;
          }
          if (top < 8) top = 8;
          menu.style.left = left + "px";
          menu.style.top = top + "px";
          menu.style.visibility = "visible";
          var cell = wrapper.closest("td[data-field='settings']");
          if (cell) cell.classList.add("is-settings-open");
          settingsLog("toggle.opened", { mode: "portal", left: left, top: top });
        } else {
          settingsLog("toggle.closed_previous");
        }
        return;
      }

      var insideMenu = event.target.closest(".contacto-settings-dropdown");
      if (insideMenu) {
        settingsLog("inside_menu.click", {
          closeAction: !!event.target.closest(".contacto-settings-item, [role='menuitem'], a, button")
        });
        if (event.target.closest(".contacto-settings-item, [role='menuitem'], a, button")) {
          closeAll();
        }
        return;
      }

      settingsLog("outside.click_close");
      closeAll();
    };

    if (window.__contactoSettingsClickHandler) {
      document.removeEventListener("click", window.__contactoSettingsClickHandler);
    }
    window.__contactoSettingsClickHandler = clickHandler;
    document.addEventListener("click", clickHandler);

    settingsLog("bind.done");
    closeAll();
  }

  function bindCellEditor() {
    if (document.body.dataset.contactoEditorBound === "true") return;
    document.body.dataset.contactoEditorBound = "true";

    var table = document.querySelector("[data-contacto-table='true']");
    if (!table) return;

    var countries = window.WA_COUNTRIES || [];

    var root = document.querySelector(".contacto-shell");
    var users = [];
    if (root) {
      try {
        users = JSON.parse(root.getAttribute("data-contacto-users") || "[]");
      } catch (error) {
        users = [];
      }
    }

    var editor = document.createElement("div");
    editor.className = "contacto-edit-popover is-hidden";
    editor.innerHTML =
      '<div class="contacto-edit-title">Actualizar Campo</div>' +
      '<div class="contacto-edit-label" data-contacto-edit-label></div>' +
      '<div class="contacto-edit-body" data-contacto-edit-body></div>' +
      '<div class="contacto-edit-actions">' +
      '<button type="button" class="btn btn-basic btn-sm" data-contacto-edit-cancel>Cancelar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-contacto-edit-save>Guardar</button>' +
      '</div>';
    document.body.appendChild(editor);

    var currentCell = null;
    var currentField = "";
    var currentMeta = null;
    var bulkAssignUrl = root ? (root.getAttribute("data-contacto-bulk-assign-url") || "") : "";

    function getHeader(field) {
      return table.querySelector("thead th[data-field='" + field + "']");
    }

    function getFieldLabel(th) {
      if (!th) return "";
      var label = (th.childNodes[0] && th.childNodes[0].textContent ? th.childNodes[0].textContent : th.textContent || "").trim();
      return label;
    }

    function getCellValue(cell) {
      if (!cell) return "";
      if (cell.dataset && cell.dataset.value !== undefined) {
        return cell.dataset.value;
      }
      return cell.textContent.trim();
    }

    function buildSelect(options, multiple) {
      var select = document.createElement("select");
      select.className = "contacto-edit-field";
      if (multiple) {
        select.multiple = true;
      }
      if (!multiple) {
        var empty = document.createElement("option");
        empty.value = "";
        select.appendChild(empty);
      }
      options.forEach(function (opt) {
        var option = document.createElement("option");
        option.value = String(opt);
        option.textContent = String(opt);
        select.appendChild(option);
      });
      return select;
    }

    function setSelectValue(select, value, multiple) {
      if (!select) return;
      if (multiple) {
        var values = Array.isArray(value) ? value.map(String) : String(value || "").split(",").map(function (v) { return v.trim(); });
        Array.prototype.forEach.call(select.options, function (opt) {
          opt.selected = values.indexOf(opt.value) !== -1;
        });
      } else {
        select.value = value || "";
      }
    }

    function findCountryByName(name) {
      var needle = String(name || "").trim().toLowerCase();
      if (!needle) return null;
      for (var i = 0; i < countries.length; i += 1) {
        var country = countries[i];
        if (!country || !country.name) continue;
        if (country.name.toLowerCase() === needle) return country;
      }
      return null;
    }

    function buildCountryPicker(meta) {
      var rootWrap = document.createElement("div");
      rootWrap.className = "contacto-country-input";
      var wrap = document.createElement("div");
      wrap.className = "wa-new-chat-country-wrap";
      var input = document.createElement("input");
      input.type = "text";
      input.className = "wa-new-chat-country-input";
      input.setAttribute("aria-label", "Pais");
      input.value = meta.value || "";

      var list = document.createElement("div");
      list.className = "wa-new-chat-country-list is-hidden";

      function populate(listEl, items) {
        listEl.innerHTML = "";
        items.forEach(function (country) {
          var item = document.createElement("button");
          item.type = "button";
          item.className = "wa-country-item";
          item.setAttribute("data-name", country.name || "");
          item.setAttribute("data-iso", country.iso2 || "");
          var isoLower = (country.iso2 || "").toLowerCase();
          var flag = isoLower ? "<img src=\"https://flagcdn.com/w40/" + isoLower + ".png\" alt=\"" + (country.name || "") + "\">" : "";
          item.innerHTML = flag + " " + (country.name || "");
          listEl.appendChild(item);
        });
      }

      function filter(listEl, query) {
        var needle = (query || "").toLowerCase();
        listEl.querySelectorAll(".wa-country-item").forEach(function (item) {
          var name = (item.getAttribute("data-name") || "").toLowerCase();
          item.style.display = !needle || name.indexOf(needle) !== -1 ? "" : "none";
        });
      }

      if (countries.length) {
        populate(list, countries);
      }

      function applyCountry(country) {
        if (!country) {
          input.style.backgroundImage = "none";
          input.classList.remove("has-flag");
          return;
        }
        var iso = (country.iso2 || "").toLowerCase();
        input.style.backgroundImage = iso ? "url('https://flagcdn.com/w40/" + iso + ".png')" : "none";
        if (iso) {
          input.classList.add("has-flag");
        } else {
          input.classList.remove("has-flag");
        }
      }

      applyCountry(findCountryByName(meta.value));

      input.addEventListener("focus", function () {
        list.classList.remove("is-hidden");
      });

      input.addEventListener("click", function (event) {
        event.stopPropagation();
      });

      input.addEventListener("input", function () {
        filter(list, input.value);
        if (input.value.trim() === "") {
          applyCountry(null);
        }
      });

      input.addEventListener("keydown", function (event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (input.value.trim() !== "") return;
        applyCountry(null);
      });

      function onPick(event) {
        var item = event.target.closest(".wa-country-item");
        if (!item) return;
        var name = item.getAttribute("data-name") || "";
        var iso = item.getAttribute("data-iso") || "";
        input.value = name;
        applyCountry({ iso2: iso, name: name });
        list.classList.add("is-hidden");
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Contactos] cell.country.pick", { name: name, iso: iso });
        }
        if (editor && !editor.classList.contains("is-hidden") && editor.contains(wrap)) {
          event.stopPropagation();
          return;
        }
      }

      list.addEventListener("click", function (event) {
        event.stopPropagation();
        onPick(event);
      });
      list.addEventListener("mousedown", function (event) {
        event.stopPropagation();
        onPick(event);
      });

      document.addEventListener("click", function (event) {
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Contactos] cell.country.doc_click", {
            in_wrap: wrap.contains(event.target),
            target: event.target && event.target.tagName
          });
        }
        if (editor && !editor.classList.contains("is-hidden") && editor.contains(wrap)) {
          if (editor.contains(event.target)) return;
          return;
        }
        if (wrap.contains(event.target)) return;
        list.classList.add("is-hidden");
      });

      wrap.appendChild(input);
      wrap.appendChild(list);
      rootWrap.appendChild(wrap);
      meta.input = input;
      return rootWrap;
    }

    function buildInput(meta) {
      var field = meta.field;
      var type = meta.type;
      var wrapper = document.createElement("div");
      var input;


      if (field === "name") {
        var first = document.createElement("input");
        first.type = "text";
        first.className = "contacto-edit-field";
        first.placeholder = "Nombres";
        first.value = meta.firstName || "";

        var last = document.createElement("input");
        last.type = "text";
        last.className = "contacto-edit-field";
        last.placeholder = "Apellidos";
        last.value = meta.lastName || "";

        wrapper.appendChild(first);
        wrapper.appendChild(last);
        meta.input = { first: first, last: last };
        return wrapper;
      }

      if (field === "assigned_to") {
        input = buildSelect(users.map(function (u) { return u.id; }), false);
        input.classList.add("contacto-edit-field");
        Array.prototype.forEach.call(input.options, function (opt) {
          var user = users.find(function (u) { return String(u.id) === String(opt.value); });
          if (user) opt.textContent = user.name;
        });
        setSelectValue(input, meta.value, false);
        meta.input = input;
        wrapper.appendChild(input);
        return wrapper;
      }

      if (field === "country") {
        return buildCountryPicker(meta);
      }

      if (field === "tags") {
        var tagsWrap = document.createElement("div");
        tagsWrap.className = "contacto-tags-input";
        tagsWrap.setAttribute("data-contacto-tags-input", "");

        var initialTags = parseTags(meta.value || "");
        tagsWrap.setAttribute("data-tags", JSON.stringify(initialTags));

        var tagsToggle = document.createElement("button");
        tagsToggle.type = "button";
        tagsToggle.className = "contacto-tags-toggle contacto-edit-field";
        tagsToggle.textContent = "Seleccionar etiquetas";
        tagsToggle.setAttribute("data-contacto-tags-toggle", "");

        var hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.value = initialTags.join(", ");
        hidden.setAttribute("data-contacto-tags-hidden", "true");

        var chips = document.createElement("div");
        chips.className = "contacto-tags-chips";
        chips.setAttribute("data-contacto-tags-chips", "");

        var dropdown = document.createElement("div");
        dropdown.className = "contacto-tags-dropdown is-hidden";
        dropdown.setAttribute("data-contacto-tags-dropdown", "");

        tagsWrap.appendChild(tagsToggle);
        tagsWrap.appendChild(hidden);
        tagsWrap.appendChild(chips);
        tagsWrap.appendChild(dropdown);
        wrapper.appendChild(tagsWrap);

        meta.input = {
          wrap: tagsWrap,
          toggle: tagsToggle,
          hidden: hidden
        };
        return wrapper;
      }

      if (type === "select") {
        input = buildSelect(meta.options || [], false);
        setSelectValue(input, meta.value, false);
        meta.input = input;
        wrapper.appendChild(input);
        return wrapper;
      }

      if (type === "multiselect") {
        input = buildSelect(meta.options || [], true);
        var raw = [];
        if (cellHasJson(meta.cell)) {
          raw = parseCellJson(meta.cell);
        }
        setSelectValue(input, raw.length ? raw : meta.value, true);
        meta.input = input;
        wrapper.appendChild(input);
        return wrapper;
      }

      if (type === "boolean") {
        input = buildSelect(["true", "false"], false);
        input.options[1].textContent = "Si";
        input.options[2].textContent = "No";
        setSelectValue(input, meta.value, false);
        meta.input = input;
        wrapper.appendChild(input);
        return wrapper;
      }

      if (field === "notes") {
        input = document.createElement("textarea");
        input.className = "contacto-edit-field contacto-edit-textarea";
        input.value = meta.value || "";
        meta.input = input;
        wrapper.appendChild(input);
        return wrapper;
      }

      input = document.createElement("input");
      input.className = "contacto-edit-field";
      if (type === "number") {
        input.type = "number";
      } else if (type === "date") {
        input.type = "date";
      } else if (type === "datetime") {
        input.type = "datetime-local";
      } else {
        input.type = "text";
      }
      input.value = meta.value || "";
      meta.input = input;
      wrapper.appendChild(input);
      return wrapper;
    }

    function cellHasJson(cell) {
      return cell && cell.dataset && cell.dataset.json;
    }

    function parseCellJson(cell) {
      if (!cellHasJson(cell)) return [];
      try {
        var parsed = JSON.parse(cell.dataset.json);
        return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      } catch (error) {
        return [];
      }
    }

    function buildMeta(cell) {
      var field = cell.getAttribute("data-field");
      var th = getHeader(field);
      var type = (th && th.getAttribute("data-field-type")) || "";
      var options = [];
      var customName = th ? th.getAttribute("data-field-custom-name") : "";

      if (th && th.getAttribute("data-field-options")) {
        try {
          options = JSON.parse(th.getAttribute("data-field-options") || "[]");
        } catch (error) {
          options = [];
        }
      }

      var value = getCellValue(cell);
      if (field === "birthday") {
        type = "date";
      } else if (field === "points") {
        type = "number";
      } else if (field === "last_interaction" || field === "registration_date") {
        type = "datetime";
      } else if (field === "tags") {
        type = "text";
      } else if (field === "assigned_to") {
        type = "select";
      }

      return {
        cell: cell,
        field: field,
        label: getFieldLabel(th),
        type: type,
        options: options,
        customName: customName,
        value: value,
        firstName: cell.dataset.firstName,
        lastName: cell.dataset.lastName
      };
    }

    function positionEditor(cell) {
      var rect = cell.getBoundingClientRect();
      editor.classList.remove("is-hidden");
      var width = editor.offsetWidth;
      var height = editor.offsetHeight;
      var top = rect.bottom + 8;
      var left = rect.left;
      if (left + width > window.innerWidth - 12) {
        left = window.innerWidth - width - 12;
      }
      if (top + height > window.innerHeight - 12) {
        top = rect.top - height - 8;
      }
      if (top < 12) top = 12;
      if (left < 12) left = 12;
      editor.style.top = top + "px";
      editor.style.left = left + "px";
    }

    function closeEditor() {
      editor.classList.add("is-hidden");
      editor.querySelector("[data-contacto-edit-body]").innerHTML = "";
      currentCell = null;
      currentField = "";
      currentMeta = null;
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] cell.edit.close");
      }
    }

    function openEditor(cell) {
      if (!cell) return;
      var field = cell.getAttribute("data-field");
      if (!field || field === "actions" || field === "select" || field === "settings" || field === "status" || field === "open_email" || field === "registration_date" || field === "last_interaction") return;
      currentCell = cell;
      currentField = field;
      currentMeta = buildMeta(cell);
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos] cell.edit.open", {
          field: field,
          value: currentMeta.value
        });
      }

      var label = editor.querySelector("[data-contacto-edit-label]");
      label.textContent = currentMeta.label || "Campo";

      var body = editor.querySelector("[data-contacto-edit-body]");
      body.innerHTML = "";
      body.appendChild(buildInput(currentMeta));
      if (field === "tags") {
        bindTagInputs();
        bindTagDrag();
      }

      positionEditor(cell);
      var focusTarget = editor.querySelector(".contacto-edit-field");
      if (focusTarget) focusTarget.focus();
    }

    function readValue(meta) {
      if (!meta || !meta.input) return "";
      if (meta.field === "name") {
        return {
          first: meta.input.first.value.trim(),
          last: meta.input.last.value.trim()
        };
      }
      if (meta.field === "tags") {
        return meta.input.hidden ? String(meta.input.hidden.value || "").trim() : "";
      }
      if (meta.input.tagName === "SELECT" && meta.input.multiple) {
        var values = [];
        Array.prototype.forEach.call(meta.input.options, function (opt) {
          if (opt.selected && opt.value !== "") {
            values.push(opt.value);
          }
        });
        return values;
      }
      return meta.input.value;
    }

    function collectSelectedRows() {
      return Array.prototype.slice.call(document.querySelectorAll("[data-contacto-select-row]:checked"))
        .map(function (checkbox) { return checkbox.closest("tr[data-contacto-id]"); })
        .filter(function (row) { return !!row && row.offsetParent !== null; });
    }

    function updateCellDisplay(meta, value) {
      var cell = meta.cell;
      var field = meta.field;
      if (!cell) return;

      if (field === "name") {
        var text = [value.first, value.last].join(" ").trim();
        var nameEl = cell.querySelector(".contacto-name span");
        if (nameEl) nameEl.textContent = text || "Sin nombre";
        cell.dataset.firstName = value.first;
        cell.dataset.lastName = value.last;
        return;
      }

      if (field === "tags") {
        cell.dataset.value = value;
        var tags = parseTags(value);
        var list = cell.querySelector("[data-contacto-tag-list]");
        if (!list) {
          cell.innerHTML = "";
          list = document.createElement("div");
          list.className = "contacto-tag-list";
          list.setAttribute("data-contacto-tag-list", "true");
          cell.appendChild(list);
        }
        list.setAttribute("data-tags", JSON.stringify(tags));
        renderTagList(list, tags);
        return;
      }

      if (field === "assigned_to") {
        cell.dataset.value = value;
        var user = users.find(function (u) { return String(u.id) === String(value); });
        cell.textContent = user ? user.name : "";
        return;
      }

      if (field === "last_interaction" || field === "registration_date") {
        cell.dataset.value = value;
        cell.textContent = String(value || "").replace("T", " ");
        return;
      }

      if (field === "country") {
        var country = findCountryByName(value);
        cell.dataset.value = value;
        cell.dataset.countryName = value || "";
        cell.dataset.countryIso = country && country.iso2 ? country.iso2.toLowerCase() : "";
        cell.innerHTML = "";
        cell.title = value || "";
        if (country && country.iso2) {
          var img = document.createElement("img");
          img.className = "contacto-country-flag";
          img.alt = country.name || "";
          img.src = "https://flagcdn.com/w40/" + country.iso2.toLowerCase() + ".png";
          cell.appendChild(img);
        }
        attachEditButtons(cell.closest("tbody") || table);
        return;
      }

      if (field.indexOf("custom:") === 0) {
        var display = Array.isArray(value) ? value.join(", ") : String(value || "");
        cell.dataset.value = display;
        cell.dataset.json = JSON.stringify(value || "");
        cell.textContent = display;
        return;
      }

      if (field === "company") {
        cell.dataset.value = value;
        cell.textContent = value;
        var row = cell.closest("tr");
        if (row) {
          var nameCell = row.querySelector("td[data-field='name'] .contacto-subline");
          if (nameCell) nameCell.textContent = value;
        }
        return;
      }


      cell.dataset.value = value;
      cell.textContent = value;
    }

    function decorateCountryCells() {
      table.querySelectorAll("td[data-field='country']").forEach(function (cell) {
        var value = getCellValue(cell);
        var iso = (cell.dataset.countryIso || "").toLowerCase();
        var name = (cell.dataset.countryName || value || "").trim();
        if (!name && !iso) return;
        if (iso) {
          var country = findCountryByName(name) || { iso2: iso, name: name };
          updateCellDisplay({ cell: cell, field: "country" }, country.name || name);
        } else {
          updateCellDisplay({ cell: cell, field: "country" }, name);
        }
      });
    }

    function saveCurrent() {
      if (!currentMeta || !currentCell) return;
      var row = currentCell.closest("tr");
      if (!row) return;
      var url = row.getAttribute("data-contacto-update-url");

      var payload = { contact: {} };
      var value = readValue(currentMeta);

      if (currentField === "name") {
        payload.contact.first_name = value.first;
        payload.contact.last_name = value.last;
      } else if (currentField === "tags") {
        payload.contact.tags_text = value;
      } else if (currentField === "assigned_to") {
        var selectedRows = collectSelectedRows();
        if (selectedRows.length && bulkAssignUrl) {
          var ids = selectedRows.map(function (selectedRow) {
            return Number(selectedRow.getAttribute("data-contacto-id") || 0);
          }).filter(function (id) { return id > 0; });
          if (ids.length) {
            var tokenBulk = document.querySelector("meta[name='csrf-token']");
            fetch(bulkAssignUrl, {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-CSRF-Token": tokenBulk ? tokenBulk.content : ""
              },
              body: JSON.stringify({
                contact_ids: ids,
                assigned_to_id: value || ""
              })
            })
              .then(function (response) {
                return response.json().then(function (data) {
                  if (!response.ok || (data && data.ok === false)) throw data || {};
                  return data || {};
                });
              })
              .then(function () {
                selectedRows.forEach(function (selectedRow) {
                  var selectedCell = selectedRow.querySelector("td[data-field='assigned_to']");
                  if (!selectedCell) return;
                  updateCellDisplay({ cell: selectedCell, field: "assigned_to" }, value);
                });
                attachEditButtons(table);
                closeEditor();
              })
              .catch(function (error) {
                var message = error && error.error ? error.error : "No se pudo actualizar responsables.";
                window.alert(message);
                closeEditor();
              });
            return;
          }
        }
        payload.contact.assigned_to_id = value;
      } else if (currentField === "last_interaction") {
        payload.contact.last_interaction_at = value;
      } else if (currentField === "registration_date") {
        return;
      } else if (currentField.indexOf("custom:") === 0) {
        var key = currentMeta.customName || currentMeta.label || currentField;
        payload.contact.custom_fields = {};
        payload.contact.custom_fields[key] = value;
      } else {
        payload.contact[currentField] = value;
      }

      if (!url) return;
      var token = document.querySelector("meta[name='csrf-token']");
      fetch(url, {
        method: "PATCH",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (data) {
              throw data;
            });
          }
          return response.json();
        })
        .then(function () {
          updateCellDisplay(currentMeta, value);
          attachEditButtons(table);
          closeEditor();
        })
        .catch(function () {
          closeEditor();
        });
    }

    function attachEditButtons(scope) {
      var root = scope || table;
      table.querySelectorAll("tbody td[data-field]").forEach(function (cell) {
        var field = cell.getAttribute("data-field");
        if (!field || field === "actions" || field === "select" || field === "settings" || field === "status" || field === "open_email" || field === "registration_date" || field === "last_interaction") return;
        if (cell.querySelector("[data-contacto-edit-button]")) return;
        cell.classList.add("contacto-editable");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "contacto-cell-edit";
        btn.setAttribute("data-contacto-edit-button", "true");
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 3.487a2.25 2.25 0 0 1 3.182 3.182L7.5 19.213 3 20.25l1.037-4.5L16.862 3.487Z" />' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 7.125-2.625-2.625" />' +
          "</svg>";
        btn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          openEditor(cell);
        });
        cell.appendChild(btn);
      });
    }

    editor.querySelector("[data-contacto-edit-cancel]").addEventListener("click", function () {
      closeEditor();
    });
    editor.querySelector("[data-contacto-edit-save]").addEventListener("click", function () {
      saveCurrent();
    });

    document.addEventListener("click", function (event) {
      if (editor.classList.contains("is-hidden")) return;
      if (event.target.closest("[data-contacto-edit-button]")) return;
      if (event.target.closest(".wa-new-chat-country-wrap")) return;
      if (currentField === "country") {
        return;
      }
      if (currentField === "tags") {
        if (event.target.closest(".contacto-tag-chip")) return;
        if (event.target.closest(".contacto-tag-menu")) return;
        if (event.target.closest(".contacto-tag-palette")) return;
        if (event.target.closest(".contacto-tag-rename-dialog")) return;
        if (event.target.closest(".contacto-tag-rename-backdrop")) return;
      }
      if (editor.contains(event.target)) return;
      closeEditor();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeEditor();
      }
    });

    attachEditButtons();

    if (window.MutationObserver) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.matches && node.matches("td[data-field]")) {
              attachEditButtons(node.parentNode || table);
              return;
            }
            if (node.querySelector) {
              var cell = node.querySelector("td[data-field]");
              if (cell) {
                attachEditButtons(node);
              }
            }
          });
        });
      });
      observer.observe(table, { childList: true, subtree: true });
    }

    window.contactoDecorateCountries = decorateCountryCells;
  }

  function initColumnManager() {
    var table = document.querySelector("[data-contacto-table='true']");
    if (!table) return;
    if (table.dataset.columnsBound === "true") {
      table.classList.remove("is-loading");
      return;
    }
    table.dataset.columnsBound = "true";

    var headerRow = table.querySelector("thead tr");
    var tableWrap = table.closest(".contacto-table-wrap");
    var colAdd = document.querySelector("[data-contacto-col-add='true']");
    var dropdown = document.querySelector("[data-contacto-col-dropdown]");
    var list = document.querySelector("[data-contacto-col-list]");
    var search = document.querySelector("[data-contacto-col-search]");
    var columnsModal = document.querySelector("[data-contacto-columns-modal]");
    var columnsModalSearch = columnsModal ? columnsModal.querySelector("[data-contacto-columns-search]") : null;
    var columnsModalAvailable = columnsModal ? columnsModal.querySelector("[data-contacto-columns-available]") : null;
    var columnsModalSelected = columnsModal ? columnsModal.querySelector("[data-contacto-columns-selected]") : null;
    var columnsModalStatus = columnsModal ? columnsModal.querySelector("[data-contacto-columns-status]") : null;
    var columnsModalApply = columnsModal ? columnsModal.querySelector("[data-contacto-columns-apply]") : null;
    var root = document.querySelector(".contacto-shell");
    var settingsUrl = root ? root.getAttribute("data-contacto-table-settings-url") : "";
    var projectId = root ? String(root.getAttribute("data-contacto-project") || "") : "";
    var userId = root ? String(root.getAttribute("data-contacto-user-id") || "") : "";
    var orderStorageKey = "contacto.columns.order." + projectId + "." + userId;
    var widthStorageKey = "contacto.columns.widths." + projectId + "." + userId;
    var hiddenFields = [];
    var savedOrder = [];
    var savedWidths = {};
    if (root) {
      try {
        hiddenFields = JSON.parse(root.getAttribute("data-contacto-hidden-fields") || "[]");
      } catch (error) {
        hiddenFields = [];
      }
      try {
        savedOrder = JSON.parse(root.getAttribute("data-contacto-column-order") || "[]");
      } catch (error) {
        savedOrder = [];
      }
      try {
        savedWidths = JSON.parse(root.getAttribute("data-contacto-column-widths") || "{}");
      } catch (error) {
        savedWidths = {};
      }
    }
    if (!headerRow) {
      table.classList.remove("is-loading");
      return;
    }

    function getFields() {
      return Array.prototype.slice.call(headerRow.querySelectorAll("th[data-field]")).filter(function (th) {
        return !th.getAttribute("data-fixed");
      }).map(function (th) {
        var field = th.getAttribute("data-field");
        var label = (th.childNodes[0] && th.childNodes[0].textContent ? th.childNodes[0].textContent : th.textContent || "").trim();
        return { field: field, label: label };
      });
    }

    function isCustomField(field) {
      return String(field || "").indexOf("custom:") === 0;
    }

    var hiddenSet = new Set(hiddenFields.map(function (value) { return String(value); }));
    getFields().forEach(function (item) {
      var th = headerRow.querySelector("th[data-field='" + item.field + "']");
      if (th && th.classList.contains("is-hidden")) {
        hiddenSet.add(item.field);
      }
    });
    var visible = new Set();
    getFields().forEach(function (item) {
      if (!hiddenSet.has(item.field)) {
        visible.add(item.field);
      }
    });

    function persistHiddenFields() {
      if (!settingsUrl) return;
      var token = document.querySelector("meta[name='csrf-token']");
      fetch(settingsUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ hidden_fields: Array.from(hiddenSet.values()) })
      })
        .then(function (response) { return response.json(); })
        .catch(function () {});
    }

    function persistColumnOrder(order) {
      persistColumnOrderLocal(order);
      if (!settingsUrl) return;
      var token = document.querySelector("meta[name='csrf-token']");
      fetch(settingsUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ column_order: order })
      })
        .then(function (response) { return response.json(); })
        .catch(function () {});
    }

    function readColumnOrderLocal() {
      var saved = [];
      try {
        saved = JSON.parse(window.localStorage.getItem(orderStorageKey) || "[]");
      } catch (_error) {
        saved = [];
      }
      if (!Array.isArray(saved) || !saved.length) {
        try {
          saved = JSON.parse(window.sessionStorage.getItem(orderStorageKey) || "[]");
        } catch (_error2) {
          saved = [];
        }
      }
      return Array.isArray(saved) ? saved.map(function (value) { return String(value || ""); }).filter(Boolean) : [];
    }

    function persistColumnOrderLocal(order) {
      if (!Array.isArray(order) || !order.length) return;
      try {
        window.localStorage.setItem(orderStorageKey, JSON.stringify(order));
      } catch (_error) {}
      try {
        window.sessionStorage.setItem(orderStorageKey, JSON.stringify(order));
      } catch (_error2) {}
    }

    function persistColumnWidths(widths) {
      persistColumnWidthsLocal(widths);
      if (!settingsUrl) return;
      var token = document.querySelector("meta[name='csrf-token']");
      fetch(settingsUrl, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify({ column_widths: widths })
      })
        .then(function (response) { return response.json(); })
        .catch(function () {});
    }

    function readColumnWidthsLocal() {
      var saved = {};
      try {
        saved = JSON.parse(window.localStorage.getItem(widthStorageKey) || "{}");
      } catch (_error) {
        saved = {};
      }
      if (!saved || typeof saved !== "object" || Array.isArray(saved) || !Object.keys(saved).length) {
        try {
          saved = JSON.parse(window.sessionStorage.getItem(widthStorageKey) || "{}");
        } catch (_error2) {
          saved = {};
        }
      }
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    }

    function persistColumnWidthsLocal(widths) {
      if (!widths || typeof widths !== "object" || Array.isArray(widths)) return;
      try {
        window.localStorage.setItem(widthStorageKey, JSON.stringify(widths));
      } catch (_error) {}
      try {
        window.sessionStorage.setItem(widthStorageKey, JSON.stringify(widths));
      } catch (_error2) {}
    }

    function applyColumnWidth(field, width) {
      var th = headerRow.querySelector("th[data-field='" + field + "']");
      var tds = table.querySelectorAll("td[data-field='" + field + "']");
      if (!th) return;
      var value = Math.max(80, Math.round(width));
      th.style.width = value + "px";
      th.style.minWidth = value + "px";
      tds.forEach(function (td) {
        td.style.width = value + "px";
        td.style.minWidth = value + "px";
      });
    }

    function applySavedWidths() {
      var localWidths = readColumnWidthsLocal();
      var widths = (localWidths && Object.keys(localWidths).length) ? localWidths : savedWidths;
      if (!widths || typeof widths !== "object") return;
      Object.keys(widths).forEach(function (field) {
        var width = parseFloat(widths[field]);
        if (!isNaN(width) && width > 0) {
          applyColumnWidth(field, width);
        }
      });
      savedWidths = widths;
      persistColumnWidthsLocal(savedWidths);
    }

    function setColumnVisible(field, show, options) {
      options = options || {};
      var th = headerRow.querySelector("th[data-field='" + field + "']");
      var tds = table.querySelectorAll("td[data-field='" + field + "']");
      if (!th) return;
      if (show) {
        th.classList.remove("is-hidden");
        tds.forEach(function (td) { td.classList.remove("is-hidden"); });
        visible.add(field);
        hiddenSet.delete(field);
      } else {
        th.classList.add("is-hidden");
        tds.forEach(function (td) { td.classList.add("is-hidden"); });
        visible.delete(field);
        hiddenSet.add(field);
      }
      if (!options.skipRender) {
        renderDropdownItems();
      }
      if (!options.silent) {
        persistHiddenFields();
      }
    }

    function renderDropdownItems() {
      if (!list || !search) return;
      var items = getFields();
      var term = search.value.trim().toLowerCase();
      list.innerHTML = "";
      items.forEach(function (item) {
        var row = document.createElement("div");
        row.className = "contacto-col-item";
        row.textContent = item.label || item.field;
        row.setAttribute("data-field", item.field);
        if (term && row.textContent.toLowerCase().indexOf(term) === -1) {
          row.classList.add("is-hidden");
        }
        if (visible.has(item.field)) {
          row.classList.add("is-disabled");
        }
        list.appendChild(row);
      });
    }

    function closeDropdown() {
      if (!dropdown) return;
      dropdown.classList.add("is-hidden");
    }

    function toggleDropdown(event) {
      if (!dropdown || !search) return;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      dropdown.classList.toggle("is-hidden");
      renderDropdownItems();
      search.focus();
    }

    if (list && search) {
      list.addEventListener("click", function (event) {
        var item = event.target.closest(".contacto-col-item");
        if (!item || item.classList.contains("is-disabled")) return;
        setColumnVisible(item.getAttribute("data-field"), true);
      });

      search.addEventListener("input", function () {
        renderDropdownItems();
      });
    }

    headerRow.addEventListener("click", function (event) {
      var chevron = event.target.closest("[data-contacto-col-menu='true']");
      if (!chevron) return;
      var th = chevron.closest("th");
      if (!th) return;
      event.preventDefault();
      event.stopPropagation();
      var field = th.getAttribute("data-field");
      var menu = th.querySelector(".contacto-col-menu");
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "contacto-col-menu";
        var hide = document.createElement("button");
        hide.type = "button";
        hide.textContent = "Ocultar campo";
        hide.addEventListener("click", function () {
          setColumnVisible(field, false);
          menu.classList.remove("is-open");
        });
        menu.appendChild(hide);
        th.appendChild(menu);
      }
      menu.classList.toggle("is-open");
    });

    document.addEventListener("click", function (event) {
      if (event.target.closest(".contacto-col-menu")) return;
      headerRow.querySelectorAll(".contacto-col-menu").forEach(function (menu) {
        menu.classList.remove("is-open");
      });
    });

    function reorderColumns(order) {
      var rows = table.querySelectorAll("tr");
      rows.forEach(function (row) {
        var cells = Array.prototype.slice.call(row.children);
        var fixedLeft = cells.filter(function (cell) { return cell.getAttribute("data-fixed") === "left"; });
        var fixedRight = cells.filter(function (cell) { return cell.getAttribute("data-fixed") === "right"; });
        var orderedSet = {};

        var desired = [];
        fixedLeft.forEach(function (cell) { desired.push(cell); });
        order.forEach(function (field) {
          var cell = row.querySelector("[data-field='" + field + "']");
          if (cell && !cell.getAttribute("data-fixed")) {
            desired.push(cell);
            orderedSet[field] = true;
          }
        });
        cells.forEach(function (cell) {
          var field = cell.getAttribute("data-field");
          if (!field) return;
          if (cell.getAttribute("data-fixed")) return;
          if (orderedSet[field]) return;
          desired.push(cell);
        });
        fixedRight.forEach(function (cell) { desired.push(cell); });

        desired.forEach(function (cell) {
          row.appendChild(cell);
        });
      });
    }

    function applySavedOrder() {
      var localOrder = readColumnOrderLocal();
      var preferredOrder = localOrder.length ? localOrder : savedOrder;
      if (!preferredOrder || !preferredOrder.length) return;
      var currentFields = getFields().map(function (item) { return item.field; });
      var order = preferredOrder.filter(function (field) { return currentFields.indexOf(field) !== -1; });
      currentFields.forEach(function (field) {
        if (order.indexOf(field) === -1) order.push(field);
      });
      reorderColumns(order);
      persistColumnOrderLocal(order);
    }

    var columnsModalState = {
      selectedOrder: []
    };

    function positionColumnsAvailableBox() {
      if (!columnsModalAvailable || !columnsModalSearch) return;
      if (columnsModalAvailable.classList.contains("is-hidden")) return;
      var rect = columnsModalSearch.getBoundingClientRect();
      var viewportPadding = 12;
      var top = rect.bottom + 4;
      var left = rect.left;
      var width = rect.width;
      var maxHeight = Math.max(140, window.innerHeight - top - viewportPadding);
      columnsModalAvailable.style.top = String(Math.round(top)) + "px";
      columnsModalAvailable.style.left = String(Math.round(left)) + "px";
      columnsModalAvailable.style.width = String(Math.round(width)) + "px";
      columnsModalAvailable.style.maxHeight = String(Math.round(maxHeight)) + "px";
    }

    function openColumnsAvailableBox() {
      if (!columnsModalAvailable) return;
      columnsModalAvailable.classList.remove("is-hidden");
      positionColumnsAvailableBox();
    }

    function closeColumnsAvailableBox() {
      if (!columnsModalAvailable) return;
      columnsModalAvailable.classList.add("is-hidden");
    }

    function getFieldLabel(field) {
      var match = getFields().find(function (item) { return item.field === field; });
      return match ? (match.label || field) : field;
    }

    function closeColumnsModal() {
      if (!columnsModal) return;
      columnsModal.classList.add("is-hidden");
      columnsModal.setAttribute("aria-hidden", "true");
      if (columnsModalStatus) columnsModalStatus.textContent = "";
      closeColumnsAvailableBox();
    }

    function refreshColumnsModalState() {
      var fields = getFields().map(function (item) { return item.field; });
      columnsModalState.selectedOrder = fields.filter(function (field) { return !hiddenSet.has(field); });
    }

    function renderColumnsModalAvailable() {
      if (!columnsModalAvailable) return;
      var term = columnsModalSearch ? columnsModalSearch.value.trim().toLowerCase() : "";
      columnsModalAvailable.innerHTML = "";
      var selectedSet = new Set(columnsModalState.selectedOrder);

      getFields().forEach(function (item) {
        if (selectedSet.has(item.field)) return;
        var label = item.label || item.field;
        if (term && label.toLowerCase().indexOf(term) === -1) return;
        var button = document.createElement("button");
        button.type = "button";
        button.className = "contacto-columns-modal-option";
        button.setAttribute("data-field", item.field);
        button.textContent = label;
        columnsModalAvailable.appendChild(button);
      });

      if (!columnsModalAvailable.children.length) {
        var empty = document.createElement("div");
        empty.className = "contacto-columns-modal-empty";
        empty.textContent = "No hay columnas para añadir.";
        columnsModalAvailable.appendChild(empty);
      }
    }

    function renderColumnsModalSelected() {
      if (!columnsModalSelected) return;
      columnsModalSelected.innerHTML = "";

      columnsModalState.selectedOrder.forEach(function (field) {
        var chip = document.createElement("div");
        chip.className = "contacto-columns-modal-chip";
        chip.setAttribute("data-field", field);
        chip.setAttribute("draggable", "true");

        var text = document.createElement("span");
        text.className = "contacto-columns-modal-chip-text";
        text.textContent = getFieldLabel(field);
        chip.appendChild(text);

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "contacto-columns-modal-chip-remove";
        remove.setAttribute("data-contacto-columns-remove-field", field);
        remove.setAttribute("aria-label", "Quitar columna");
        remove.textContent = "×";
        chip.appendChild(remove);

        columnsModalSelected.appendChild(chip);
      });

      if (!columnsModalSelected.children.length) {
        var empty = document.createElement("div");
        empty.className = "contacto-columns-modal-empty";
        empty.textContent = "Añade al menos una columna.";
        columnsModalSelected.appendChild(empty);
      }
    }

    function renderColumnsModal() {
      renderColumnsModalAvailable();
      renderColumnsModalSelected();
      if (columnsModalStatus) columnsModalStatus.textContent = "";
    }

    function openColumnsModal(event) {
      if (!columnsModal) return;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      closeDropdown();
      refreshColumnsModalState();
      renderColumnsModal();
      columnsModal.classList.remove("is-hidden");
      columnsModal.setAttribute("aria-hidden", "false");
      if (columnsModalSearch) {
        columnsModalSearch.value = "";
        columnsModalSearch.focus();
      }
      closeColumnsAvailableBox();
    }

    function applyColumnsModalChanges() {
      var allFields = getFields().map(function (item) { return item.field; });
      var selectedSet = new Set(columnsModalState.selectedOrder);
      var selected = allFields.filter(function (field) { return selectedSet.has(field); });

      if (!selected.length) {
        if (columnsModalStatus) columnsModalStatus.textContent = "Debes mantener al menos una columna visible.";
        return;
      }

      var hidden = allFields.filter(function (field) { return !selectedSet.has(field); });
      var finalOrder = selected.concat(hidden);
      reorderColumns(finalOrder);
      persistColumnOrder(finalOrder);

      allFields.forEach(function (field) {
        setColumnVisible(field, selectedSet.has(field), { silent: true, skipRender: true });
      });
      renderDropdownItems();
      persistHiddenFields();
      closeColumnsModal();
    }

    function bindColumnsModal() {
      if (!columnsModal || document.body.dataset.contactoColumnsModalBound === "true") return;
      document.body.dataset.contactoColumnsModalBound = "true";
      var draggingField = "";

      document.querySelectorAll("[data-contacto-col-add='true']").forEach(function (button) {
        button.addEventListener("click", function (event) {
          if (columnsModal) {
            openColumnsModal(event);
            return;
          }
          toggleDropdown(event);
        });
      });

      document.addEventListener("click", function (event) {
        if (event.target.closest("[data-contacto-open-columns-modal='true']")) {
          openColumnsModal(event);
          return;
        }
        if (event.target.closest("[data-contacto-columns-close]")) {
          closeColumnsModal();
          return;
        }
        if (event.target.closest(".contacto-columns-modal-picker")) {
          openColumnsAvailableBox();
          return;
        }

        if (event.target.closest("[data-contacto-col-add='true']")) return;
        if (event.target.closest("[data-contacto-col-dropdown]")) return;
        if (event.target.closest(".contacto-columns-modal-panel")) {
          closeColumnsAvailableBox();
          return;
        }
        closeDropdown();
      });

      window.addEventListener("resize", positionColumnsAvailableBox);
      if (columnsModal) {
        columnsModal.addEventListener("scroll", positionColumnsAvailableBox, true);
      }

      if (columnsModalSearch) {
        columnsModalSearch.addEventListener("click", function () {
          renderColumnsModalAvailable();
          openColumnsAvailableBox();
        });

        columnsModalSearch.addEventListener("input", function () {
          renderColumnsModalAvailable();
          openColumnsAvailableBox();
        });
      }

      if (columnsModalAvailable) {
        columnsModalAvailable.addEventListener("click", function (event) {
          var option = event.target.closest(".contacto-columns-modal-option");
          if (!option) return;
          var field = String(option.getAttribute("data-field") || "");
          if (!field) return;
          if (columnsModalState.selectedOrder.indexOf(field) === -1) {
            columnsModalState.selectedOrder.push(field);
            renderColumnsModal();
            if (columnsModalSearch) {
              columnsModalSearch.value = "";
              columnsModalSearch.focus();
            }
            closeColumnsAvailableBox();
          }
        });
      }

      if (columnsModalSelected) {
        columnsModalSelected.addEventListener("click", function (event) {
          var remove = event.target.closest("[data-contacto-columns-remove-field]");
          if (!remove) return;
          var field = String(remove.getAttribute("data-contacto-columns-remove-field") || "");
          if (!field) return;
          columnsModalState.selectedOrder = columnsModalState.selectedOrder.filter(function (item) { return item !== field; });
          renderColumnsModal();
          closeColumnsAvailableBox();
        });

        columnsModalSelected.addEventListener("dragstart", function (event) {
          var chip = event.target.closest(".contacto-columns-modal-chip");
          if (!chip) return;
          draggingField = String(chip.getAttribute("data-field") || "");
          if (!draggingField) return;
          chip.classList.add("is-dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", draggingField);
          }
        });

        columnsModalSelected.addEventListener("dragover", function (event) {
          var target = event.target.closest(".contacto-columns-modal-chip");
          if (!target) return;
          event.preventDefault();
          target.classList.add("is-drop-target");
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        });

        columnsModalSelected.addEventListener("dragleave", function (event) {
          var target = event.target.closest(".contacto-columns-modal-chip");
          if (!target) return;
          target.classList.remove("is-drop-target");
        });

        columnsModalSelected.addEventListener("drop", function (event) {
          var target = event.target.closest(".contacto-columns-modal-chip");
          if (!target) return;
          event.preventDefault();

          var targetField = String(target.getAttribute("data-field") || "");
          var sourceField = draggingField;
          if (!sourceField && event.dataTransfer) {
            sourceField = String(event.dataTransfer.getData("text/plain") || "");
          }
          if (!sourceField || !targetField || sourceField === targetField) return;

          var nextOrder = columnsModalState.selectedOrder.slice();
          var fromIndex = nextOrder.indexOf(sourceField);
          var toIndex = nextOrder.indexOf(targetField);
          if (fromIndex === -1 || toIndex === -1) return;

          nextOrder.splice(fromIndex, 1);
          nextOrder.splice(toIndex, 0, sourceField);
          columnsModalState.selectedOrder = nextOrder;
          renderColumnsModal();
        });

        columnsModalSelected.addEventListener("dragend", function () {
          draggingField = "";
          columnsModalSelected.querySelectorAll(".contacto-columns-modal-chip").forEach(function (chip) {
            chip.classList.remove("is-dragging");
            chip.classList.remove("is-drop-target");
          });
        });
      }

      if (columnsModalApply) {
        columnsModalApply.addEventListener("click", function (event) {
          event.preventDefault();
          applyColumnsModalChanges();
        });
      }

      document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        if (!columnsModal || columnsModal.classList.contains("is-hidden")) return;
        closeColumnsModal();
      });
    }

    function bindDrag() {
      headerRow.querySelectorAll("th[data-field]").forEach(function (th) {
        if (th.getAttribute("data-fixed")) return;
        th.draggable = true;
        th.addEventListener("dragstart", function (event) {
          table.dataset.isColumnDragging = "true";
          th.classList.add("is-dragging");
          event.dataTransfer.setData("text/plain", th.getAttribute("data-field"));
        });
        th.addEventListener("dragend", function () {
          table.dataset.isColumnDragging = "";
          th.classList.remove("is-dragging");
          headerRow.querySelectorAll(".is-drop-target").forEach(function (node) {
            node.classList.remove("is-drop-target");
          });
        });
        th.addEventListener("dragover", function (event) {
          event.preventDefault();
          th.classList.add("is-drop-target");
        });
        th.addEventListener("dragleave", function () {
          th.classList.remove("is-drop-target");
        });
        th.addEventListener("drop", function (event) {
          event.preventDefault();
          var source = event.dataTransfer.getData("text/plain");
          var target = th.getAttribute("data-field");
          if (!source || source === target) return;
          var fields = getFields().map(function (item) { return item.field; });
          var sourceIndex = fields.indexOf(source);
          var targetIndex = fields.indexOf(target);
          if (sourceIndex === -1 || targetIndex === -1) return;
          fields.splice(sourceIndex, 1);
          fields.splice(targetIndex, 0, source);
          reorderColumns(fields);
          persistColumnOrder(fields);
        });
      });
    }

    function bindResize() {
      headerRow.querySelectorAll("th[data-field]").forEach(function (th) {
        if (th.getAttribute("data-fixed")) {
          var fixedField = th.getAttribute("data-field");
          if (fixedField !== "select" && fixedField !== "settings") return;
        }
        if (th.querySelector("[data-contacto-resize]")) return;
        var field = th.getAttribute("data-field");
        var handle = document.createElement("span");
        handle.className = "contacto-col-resize";
        handle.setAttribute("data-contacto-resize", "true");
        th.appendChild(handle);

        handle.addEventListener("mousedown", function (event) {
          event.preventDefault();
          event.stopPropagation();

          var startX = event.clientX;
          var startWidth = th.getBoundingClientRect().width;
          var resizing = true;
          var prevDraggable = th.draggable;
          th.draggable = false;

          function onMove(moveEvent) {
            if (!resizing) return;
            var delta = moveEvent.clientX - startX;
            var nextWidth = Math.max(80, startWidth + delta);
            applyColumnWidth(field, nextWidth);
          }

          function onUp() {
            if (!resizing) return;
            resizing = false;
            th.draggable = prevDraggable;
            var finalWidth = th.getBoundingClientRect().width;
            savedWidths[field] = Math.round(finalWidth);
            persistColumnWidths(savedWidths);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          }

          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
      });
    }

    function bindHeaderPan() {
      if (!tableWrap || !headerRow) return;
      if (table.dataset.headerPanBound === "true") return;
      table.dataset.headerPanBound = "true";

      var state = {
        armed: false,
        active: false,
        startX: 0,
        startScrollLeft: 0
      };
      var dragThreshold = 5;

      function isPanBlockedTarget(target) {
        if (!target || !target.closest) return true;
        return !!target.closest(
          "button,a,input,select,textarea,label," +
          "[data-contacto-col-menu='true']," +
          "[data-contacto-resize='true']," +
          ".contacto-col-menu,.contacto-col-resize,.contacto-col-chevron"
        );
      }

      function clearPan() {
        state.armed = false;
        state.active = false;
        tableWrap.classList.remove("is-header-panning");
      }

      headerRow.addEventListener("mousedown", function (event) {
        if (event.button !== 0) return;
        if (table.dataset.isColumnDragging === "true") return;
        if (isPanBlockedTarget(event.target)) return;

        state.armed = true;
        state.active = false;
        state.startX = event.clientX;
        state.startScrollLeft = tableWrap.scrollLeft;
      });

      document.addEventListener("mousemove", function (event) {
        if (!state.armed) return;
        var delta = event.clientX - state.startX;
        if (!state.active && Math.abs(delta) < dragThreshold) return;

        state.active = true;
        tableWrap.classList.add("is-header-panning");
        tableWrap.scrollLeft = state.startScrollLeft - delta;
        event.preventDefault();
      });

      document.addEventListener("mouseup", function () {
        if (!state.armed) return;
        clearPan();
      });

      document.addEventListener("mouseleave", function () {
        if (!state.armed) return;
        clearPan();
      });
    }

    function bindOpenEmailSort() {
      if (table.dataset.openEmailSortBound === "true") return;
      table.dataset.openEmailSortBound = "true";

      var openEmailHeader = headerRow.querySelector("th[data-field='open_email']");
      if (!openEmailHeader) return;

      function getElementTarget(event) {
        if (!event) return null;
        var target = event.target || null;
        if (!target) return null;
        if (target.nodeType === 1) return target;
        return target.parentElement || null;
      }

      function submitOpenEmailSort(event) {
        var target = getElementTarget(event);
        if (target && target.closest("[data-contacto-col-menu='true']")) return;
        if (table.dataset.isColumnDragging === "true") return;
        event.preventDefault();
        event.stopPropagation();

        var sortInput = document.querySelector("#contacto-sort");
        var currentSort = sortInput ? String(sortInput.value || "") : "";
        var nextSort = currentSort === "open_email_desc" ? "open_email_asc" : "open_email_desc";

        if (sortInput) {
          sortInput.value = nextSort;
        } else {
          var fallbackInput = document.querySelector("input[name='sort']");
          if (fallbackInput) {
            fallbackInput.value = nextSort;
          }
        }

        var form = document.querySelector(".contacto-advanced-form");
        if (form) {
          form.requestSubmit ? form.requestSubmit() : form.submit();
          return;
        }

        var url = new URL(window.location.href);
        url.searchParams.set("sort", nextSort);
        url.searchParams.delete("page");
        window.location.href = url.toString();
      }

      openEmailHeader.style.cursor = "pointer";
      openEmailHeader.setAttribute("title", "Ordenar por Open email");
      openEmailHeader.addEventListener("click", submitOpenEmailSort);

      headerRow.addEventListener("click", function (event) {
        var target = getElementTarget(event);
        var targetHeader = target && target.closest ? target.closest("th[data-field='open_email']") : null;
        if (!targetHeader) return;
        submitOpenEmailSort(event);
      });
    }

    function bindRegistrationDateSort() {
      if (table.dataset.registrationDateSortBound === "true") return;
      table.dataset.registrationDateSortBound = "true";

      var registrationDateHeader = headerRow.querySelector("th[data-field='registration_date']");
      if (!registrationDateHeader) return;

      function getElementTarget(event) {
        if (!event) return null;
        var target = event.target || null;
        if (!target) return null;
        if (target.nodeType === 1) return target;
        return target.parentElement || null;
      }

      function submitRegistrationDateSort(event) {
        var target = getElementTarget(event);
        if (target && target.closest("[data-contacto-col-menu='true']")) return;
        if (table.dataset.isColumnDragging === "true") return;
        event.preventDefault();
        event.stopPropagation();

        var sortInput = document.querySelector("#contacto-sort");
        var currentSort = sortInput ? String(sortInput.value || "") : "";
        var normalizedCurrentSort = currentSort === "registration_date" ? "registration_date_desc" : currentSort;
        var nextSort = normalizedCurrentSort === "registration_date_desc" ? "registration_date_asc" : "registration_date_desc";

        if (sortInput) {
          sortInput.value = nextSort;
        } else {
          var fallbackInput = document.querySelector("input[name='sort']");
          if (fallbackInput) {
            fallbackInput.value = nextSort;
          }
        }

        var form = document.querySelector(".contacto-advanced-form");
        if (form) {
          form.requestSubmit ? form.requestSubmit() : form.submit();
          return;
        }

        var url = new URL(window.location.href);
        url.searchParams.set("sort", nextSort);
        url.searchParams.delete("page");
        window.location.href = url.toString();
      }

      registrationDateHeader.style.cursor = "pointer";
      registrationDateHeader.setAttribute("title", "Ordenar por Fecha de registro");
      registrationDateHeader.addEventListener("click", submitRegistrationDateSort);

      headerRow.addEventListener("click", function (event) {
        var target = getElementTarget(event);
        var targetHeader = target && target.closest ? target.closest("th[data-field='registration_date']") : null;
        if (!targetHeader) return;
        submitRegistrationDateSort(event);
      });
    }

    function bindLastInteractionSort() {
      if (table.dataset.lastInteractionSortBound === "true") return;
      table.dataset.lastInteractionSortBound = "true";

      var lastInteractionHeader = headerRow.querySelector("th[data-field='last_interaction']");
      if (!lastInteractionHeader) return;
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Contactos][LastInteractionSort] bound", {
          headerFound: true,
          text: (lastInteractionHeader.textContent || "").trim()
        });
      }

      function getElementTarget(event) {
        if (!event) return null;
        var target = event.target || null;
        if (!target) return null;
        if (target.nodeType === 1) return target;
        return target.parentElement || null;
      }

      function submitLastInteractionSort(event) {
        var target = getElementTarget(event);
        if (target && target.closest("[data-contacto-col-menu='true']")) {
          if (window.console && typeof window.console.log === "function") {
            window.console.log("[Contactos][LastInteractionSort] skip.chevron", {
              targetTag: target.tagName,
              targetClass: target.className || ""
            });
          }
          return;
        }
        if (table.dataset.isColumnDragging === "true") return;
        event.preventDefault();
        event.stopPropagation();

        var sortInput = document.querySelector("#contacto-sort");
        var currentSort = sortInput ? String(sortInput.value || "") : "";
        var normalizedCurrentSort = currentSort === "last_interaction" ? "last_interaction_desc" : currentSort;
        var nextSort = normalizedCurrentSort === "last_interaction_desc" ? "last_interaction_asc" : "last_interaction_desc";

        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Contactos][LastInteractionSort] click", {
            currentSort: currentSort,
            normalizedCurrentSort: normalizedCurrentSort,
            nextSort: nextSort
          });
        }

        if (sortInput) {
          sortInput.value = nextSort;
        } else {
          var fallbackInput = document.querySelector("input[name='sort']");
          if (fallbackInput) {
            fallbackInput.value = nextSort;
          }
        }

        var form = document.querySelector(".contacto-advanced-form");
        if (form) {
          if (window.console && typeof window.console.log === "function") {
            window.console.log("[Contactos][LastInteractionSort] submit.form", { sort: nextSort });
          }
          form.requestSubmit ? form.requestSubmit() : form.submit();
          return;
        }

        var url = new URL(window.location.href);
        url.searchParams.set("sort", nextSort);
        url.searchParams.delete("page");
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Contactos][LastInteractionSort] submit.url", { sort: nextSort, href: url.toString() });
        }
        window.location.href = url.toString();
      }

      lastInteractionHeader.style.cursor = "pointer";
      lastInteractionHeader.setAttribute("title", "Ordenar por Ultima Actualizacion");
      lastInteractionHeader.addEventListener("click", submitLastInteractionSort);

      headerRow.addEventListener("click", function (event) {
        var target = getElementTarget(event);
        var targetHeader = target && target.closest ? target.closest("th[data-field='last_interaction']") : null;
        if (!targetHeader) return;
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Contactos][LastInteractionSort] delegated.header_click", {
            targetTag: target && target.tagName,
            targetClass: target && target.className ? target.className : ""
          });
        }
        submitLastInteractionSort(event);
      });
    }

    applySavedOrder();
    applySavedWidths();
    renderDropdownItems();
    bindColumnsModal();
    bindResize();
    bindHeaderPan();
    // These columns are now managed from the sidebar; keep headers non-interactive.
    if (typeof window.contactoDecorateCountries === "function") {
      window.contactoDecorateCountries();
    }

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          table.classList.remove("is-loading");
        });
      });
    } else {
      table.classList.remove("is-loading");
    }
  }

  function bindDrawerSubmit() {
    if (document.body.dataset.contactoDrawerSubmitBound === "true") return;
    document.body.dataset.contactoDrawerSubmitBound = "true";

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-contacto-submit]");
      if (!button) return;
      var key = button.getAttribute("data-contacto-submit");
      var panel = document.querySelector("[data-contacto-panel='" + key + "']");
      if (!panel) return;
      var form = panel.querySelector("form");
      if (!form) return;
      form.requestSubmit ? form.requestSubmit() : form.submit();
    });
  }

  function bindHistoryColumnManager() {
    var table = document.querySelector("[data-contacto-history-table='true']");
    if (!table) return;
    if (table.dataset.historyColumnsBound === "true") {
      table.classList.remove("is-loading");
      return;
    }
    table.dataset.historyColumnsBound = "true";

    var headerRow = table.querySelector("thead tr");
    if (!headerRow) return;

    var storageKey = table.getAttribute("data-history-storage-key") || "contacto.history.columns";
    var sourceKey = "";

    function readStoredOrder() {
      var saved = [];
      try {
        saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      } catch (_error) {
        saved = [];
      }
      if (!Array.isArray(saved) || !saved.length) {
        try {
          saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "[]");
        } catch (_error2) {
          saved = [];
        }
      }
      return Array.isArray(saved) ? saved : [];
    }

    function clearDragStates() {
      Array.prototype.slice.call(headerRow.querySelectorAll("th")).forEach(function (th) {
        th.classList.remove("is-dragging");
        th.classList.remove("is-drop-target");
      });
    }

    function getKeys() {
      return Array.prototype.slice.call(headerRow.querySelectorAll("th")).map(function (th) {
        return String(th.getAttribute("data-col-key") || "");
      }).filter(function (key) { return key; });
    }

    function persistOrder() {
      var order = getKeys();
      if (!order.length) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(order));
      } catch (_error) {}
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(order));
      } catch (_error2) {}
    }

    function persistSpecificOrder(order) {
      if (!Array.isArray(order) || !order.length) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(order));
      } catch (_error) {}
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(order));
      } catch (_error2) {}
    }

    function reorderColumns(order) {
      var rows = table.querySelectorAll("tr");
      rows.forEach(function (row) {
        var map = {};
        Array.prototype.slice.call(row.children).forEach(function (cell) {
          var key = String(cell.getAttribute("data-col-key") || "");
          if (key) map[key] = cell;
        });

        order.forEach(function (key) {
          var cell = map[key];
          if (cell) row.appendChild(cell);
        });
      });
    }

    function applySavedOrder() {
      var saved = readStoredOrder();
      if (!Array.isArray(saved) || !saved.length) return;

      var current = getKeys();
      var order = saved.filter(function (key) {
        return current.indexOf(key) !== -1;
      });
      current.forEach(function (key) {
        if (order.indexOf(key) === -1) order.push(key);
      });
      reorderColumns(order);
      persistSpecificOrder(order);
    }

    applySavedOrder();

    Array.prototype.slice.call(headerRow.querySelectorAll("th[data-col-key]")).forEach(function (th) {
      th.setAttribute("draggable", "true");
      th.draggable = true;

      th.addEventListener("dragstart", function (event) {
        sourceKey = String(th.getAttribute("data-col-key") || "");
        if (!sourceKey) return;
        th.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", sourceKey);
        }
      });

      th.addEventListener("dragover", function (event) {
        event.preventDefault();
        th.classList.add("is-drop-target");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });

      th.addEventListener("dragleave", function () {
        th.classList.remove("is-drop-target");
      });

      th.addEventListener("drop", function (event) {
        event.preventDefault();
        var targetKey = String(th.getAttribute("data-col-key") || "");
        var source = sourceKey;
        if (!source && event.dataTransfer) {
          source = String(event.dataTransfer.getData("text/plain") || "");
        }
        if (!source || !targetKey || source === targetKey) {
          clearDragStates();
          sourceKey = "";
          return;
        }

        var order = getKeys();
        var fromIndex = order.indexOf(source);
        var toIndex = order.indexOf(targetKey);
        if (fromIndex === -1 || toIndex === -1) {
          clearDragStates();
          sourceKey = "";
          return;
        }

        order.splice(fromIndex, 1);
        order.splice(toIndex, 0, source);
        reorderColumns(order);
        persistSpecificOrder(order);
        clearDragStates();
        sourceKey = "";
      });

      th.addEventListener("dragend", function () {
        clearDragStates();
        sourceKey = "";
      });
    });

    window.addEventListener("beforeunload", persistOrder);
    document.addEventListener("turbo:before-cache", persistOrder);

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          table.classList.remove("is-loading");
        });
      });
    } else {
      table.classList.remove("is-loading");
    }
  }

    function hexToRgb(hex) {
      if (!hex) return null;
      var cleaned = hex.replace("#", "").trim();
      if (cleaned.length === 3) {
        cleaned = cleaned.split("").map(function (c) { return c + c; }).join("");
      }
      if (cleaned.length !== 6) return null;
      var num = parseInt(cleaned, 16);
      if (Number.isNaN(num)) return null;
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }

    function getContrastTextColor(hex) {
      var rgb = hexToRgb(hex);
      if (!rgb) return "";
      var r = rgb.r / 255;
      var g = rgb.g / 255;
      var b = rgb.b / 255;
      var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luminance > 0.6 ? "#111827" : "#ffffff";
    }

    function applyStatusSelectColor(select) {
      if (!select) return;
      var option = select.options[select.selectedIndex];
      var color = option ? option.getAttribute("data-color") : "";
      if (color) {
        select.style.borderColor = color;
        select.style.boxShadow = "inset 0 -2px 0 " + color;
        select.style.backgroundColor = color;
        select.style.backgroundImage = "none";
        select.style.backgroundClip = "padding-box";
        select.style.boxShadow = "inset 0 0 0 9999px " + color;
        select.style.color = getContrastTextColor(color);
      } else {
        select.style.borderColor = "";
        select.style.boxShadow = "";
        select.style.backgroundColor = "";
        select.style.backgroundImage = "";
        select.style.backgroundClip = "";
        select.style.color = "";
      }
      broadcastWpStatusChange(select, "contacto");
    }

    function broadcastWpStatusChange(select, source) {
      if (!select) return;
      if (select.dataset.wpStatusSyncing === "true") {
        select.dataset.wpStatusSyncing = "";
        return;
      }
      var workPackageId = select.dataset.wpStatusWorkPackageId || "";
      var statusId = select.value || "";
      if (!workPackageId || !statusId) return;
      var option = select.options[select.selectedIndex];
      var color = option ? option.getAttribute("data-color") : "";
      document.dispatchEvent(new CustomEvent("wa:wp-status-change", {
        detail: {
          source: source || "contacto",
          workPackageId: String(workPackageId),
          statusId: String(statusId),
          color: color || ""
        }
      }));
    }

    function bindWpStatusSyncListener() {
      if (document.body.dataset.wpStatusContactoSyncBound === "true") return;
      document.body.dataset.wpStatusContactoSyncBound = "true";
      document.addEventListener("wa:wp-status-change", function (event) {
        var detail = event && event.detail ? event.detail : {};
        if (!detail || detail.source === "contacto") return;
        var select = document.querySelector("[data-contacto-work-package-status]");
        if (!select) return;
        var workPackageId = select.dataset.wpStatusWorkPackageId || "";
        if (!workPackageId || String(workPackageId) !== String(detail.workPackageId || "")) return;
        if (select.value === String(detail.statusId || "")) return;
        select.dataset.wpStatusSyncing = "true";
        select.value = String(detail.statusId || "");
        applyStatusSelectColor(select);
      });
    }

    function fillWorkPackageStatusSelect(select, meta) {
      if (!select) return;
      select.innerHTML = "";
      select.disabled = true;
      if (!meta) {
        applyStatusSelectColor(select);
        return;
      }
      var raw = meta.getAttribute("data-statuses") || "[]";
      var currentId = meta.getAttribute("data-current-status-id") || "";
      var workPackageId = meta.getAttribute("data-work-package-id") || "";
      if (workPackageId) {
        select.dataset.wpStatusWorkPackageId = String(workPackageId);
      } else {
        select.dataset.wpStatusWorkPackageId = "";
      }
      var statuses = [];
      try {
        statuses = JSON.parse(raw);
      } catch (error) {
        statuses = [];
      }
      if (!statuses.length) {
        applyStatusSelectColor(select);
        return;
      }
      statuses.forEach(function (status) {
        var option = document.createElement("option");
        option.value = String(status.id || "");
        option.textContent = status.name || "";
        if (status.color) option.setAttribute("data-color", status.color);
        select.appendChild(option);
      });
      if (currentId) select.value = String(currentId);
      select.disabled = false;
      applyStatusSelectColor(select);
      select.onchange = function () {
        applyStatusSelectColor(select);
        updateWorkPackageStatus(select.dataset.wpStatusWorkPackageId || "", select.value || "", select);
      };
    }

    function fillWorkPackageStatusSelectFromPayload(select, payload) {
      if (!select) return;
      select.innerHTML = "";
      select.disabled = true;
      if (!payload) {
        applyStatusSelectColor(select);
        return;
      }
      var statuses = Array.isArray(payload.statuses) ? payload.statuses : [];
      var currentId = payload.current_status_id || "";
      var workPackageId = payload.work_package_id || select.dataset.wpStatusWorkPackageId || "";
      if (workPackageId) {
        select.dataset.wpStatusWorkPackageId = String(workPackageId);
      }
      if (payload.lock_version !== undefined) {
        select.dataset.wpLockVersion = String(payload.lock_version);
      }
      statuses.forEach(function (status) {
        var option = document.createElement("option");
        option.value = String(status.id || "");
        option.textContent = status.name || "";
        if (status.color) option.setAttribute("data-color", status.color);
        select.appendChild(option);
      });
      if (currentId) select.value = String(currentId);
      select.disabled = false;
      applyStatusSelectColor(select);
      select.onchange = function () {
        applyStatusSelectColor(select);
        updateWorkPackageStatus(select.dataset.wpStatusWorkPackageId || "", select.value || "", select);
        broadcastWpStatusChange(select, "contacto");
      };
    }

    function loadTableWpStatuses(select) {
      if (!select || select.dataset.wpStatusLoaded === "true") return;
      var workPackageId = select.dataset.wpStatusWorkPackageId || "";
      if (!workPackageId) return;
      var root = document.querySelector(".contacto-shell");
      var template = root ? root.getAttribute("data-contacto-wp-statuses-url-template") : "";
      if (!template) return;
      select.disabled = true;
      fetch(template.replace("__ID__", String(workPackageId)), {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      })
        .then(function (res) {
          if (!res.ok) throw new Error("error");
          return res.json();
        })
        .then(function (data) {
          select.dataset.wpStatusLoaded = "true";
          fillWorkPackageStatusSelectFromPayload(select, data);
        })
        .catch(function () {
          select.disabled = false;
        });
    }

    function bindTableWpStatusSelects() {
      if (document.body.dataset.contactoTableWpStatusBound === "true") return;
      document.body.dataset.contactoTableWpStatusBound = "true";

      function primeSelect(select) {
        if (!select) return;
        if (select.dataset.bound === "true") return;
        select.dataset.bound = "true";
        var option = select.options[select.selectedIndex];
        var color = (option && option.getAttribute("data-color")) || select.dataset.wpStatusColor || "";
        if (color && option && !option.getAttribute("data-color")) {
          option.setAttribute("data-color", color);
        }
        if (color) applyStatusSelectColor(select);
        select.addEventListener("focus", function () { loadTableWpStatuses(select); });
        select.addEventListener("click", function () { loadTableWpStatuses(select); });
      }

      document.querySelectorAll("[data-contacto-table-wp-status]").forEach(function (select) {
        primeSelect(select);
      });
    }

    var wpStatusCache = {};

    function parseStatusIdFromHref(href) {
      if (!href) return "";
      var match = href.match(/\/api\/v3\/statuses\/(\d+)/);
      return match ? match[1] : "";
    }

    function ensureStatusOption(select, status) {
      if (!select || !status || !status.id) return;
      var existing = Array.prototype.find.call(select.options, function (opt) {
        return opt.value === String(status.id);
      });
      if (existing) {
        if (status.color) existing.setAttribute("data-color", status.color);
        if (status.name) existing.textContent = status.name;
        return;
      }
      var option = document.createElement("option");
      option.value = String(status.id);
      option.textContent = status.name || "Estado";
      if (status.color) option.setAttribute("data-color", status.color);
      select.appendChild(option);
    }

    function fetchStatusDetails(statusId) {
      if (!statusId) return Promise.resolve(null);
      if (wpStatusCache[statusId]) return Promise.resolve(wpStatusCache[statusId]);
      return fetch("/api/v3/statuses/" + encodeURIComponent(statusId), {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      })
        .then(function (res) {
          if (!res.ok) throw new Error("error");
          return res.json();
        })
        .then(function (data) {
          var status = {
            id: data.id,
            name: data.name,
            color: data.color
          };
          wpStatusCache[statusId] = status;
          return status;
        })
        .catch(function () { return null; });
    }

    function updateWorkPackageStatus(workPackageId, statusId, select) {
      if (!workPackageId || !statusId) return;
      var lockVersion = select ? select.dataset.wpLockVersion : "";

      function doPatch(lockValue) {
        var token = document.querySelector("meta[name='csrf-token']");
        var payload = {
          lockVersion: lockValue ? Number(lockValue) : 0,
          _links: {
            status: { href: "/api/v3/statuses/" + encodeURIComponent(statusId) }
          }
        };
        fetch("/api/v3/work_packages/" + encodeURIComponent(workPackageId), {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : "",
            "X-Requested-With": "XMLHttpRequest"
          },
          body: JSON.stringify(payload)
        })
          .then(function (res) {
            if (!res.ok) throw new Error("error");
            return res.json();
          })
          .then(function (data) {
            if (select && data && data.lockVersion !== undefined) {
              select.dataset.wpLockVersion = String(data.lockVersion);
            }
            if (data && data._links && data._links.status && data._links.status.href) {
              var newStatusId = parseStatusIdFromHref(data._links.status.href);
              if (newStatusId && select) {
                select.value = String(newStatusId);
                applyStatusSelectColor(select);
              }
            }
          })
          .catch(function () {});
      }

      if (!lockVersion) {
        fetch("/api/v3/work_packages/" + encodeURIComponent(workPackageId), {
          credentials: "same-origin",
          headers: { "Accept": "application/json" }
        })
          .then(function (res) {
            if (!res.ok) throw new Error("error");
            return res.json();
          })
          .then(function (data) {
            if (select && data && data.lockVersion !== undefined) {
              select.dataset.wpLockVersion = String(data.lockVersion);
            }
            doPatch(data ? data.lockVersion : 0);
          })
          .catch(function () {});
        return;
      }

      doPatch(lockVersion);
    }

    function startWorkPackageStatusPolling(workPackageId, select) {
      if (!select || !workPackageId) return;
      if (select.dataset.wpStatusPolling === workPackageId) return;
      if (select.dataset.wpStatusInterval) {
        clearInterval(Number(select.dataset.wpStatusInterval));
      }
      select.dataset.wpStatusPolling = workPackageId;

      function pollOnce() {
        fetch("/api/v3/work_packages/" + encodeURIComponent(workPackageId), {
          credentials: "same-origin",
          headers: { "Accept": "application/json" }
        })
          .then(function (res) {
            if (!res.ok) throw new Error("error");
            return res.json();
          })
        .then(function (data) {
          var statusId = "";
          if (data && data._links && data._links.status && data._links.status.href) {
            statusId = parseStatusIdFromHref(data._links.status.href);
          }
          if (data && data.lockVersion !== undefined) {
            select.dataset.wpLockVersion = String(data.lockVersion);
          }
          if (!statusId) return;
          fetchStatusDetails(statusId).then(function (status) {
            if (status) ensureStatusOption(select, status);
            select.value = String(statusId);
            applyStatusSelectColor(select);
            });
          })
          .catch(function () {});
      }

      pollOnce();
      var intervalId = setInterval(pollOnce, 15000);
      select.dataset.wpStatusInterval = String(intervalId);
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatHistoryWaveTime(value) {
      var total = Math.max(0, Math.floor(Number(value) || 0));
      var hours = Math.floor(total / 3600);
      var minutes = Math.floor((total % 3600) / 60);
      var seconds = total % 60;
      var hh = String(hours).padStart(2, "0");
      var mm = String(minutes).padStart(2, "0");
      var ss = String(seconds).padStart(2, "0");
      return hh + ":" + mm + ":" + ss;
    }

    function formatHistoryDate(value) {
      if (!value) return "";
      var date = new Date(value);
      if (!isFinite(date.getTime())) return "";
      var dd = String(date.getDate()).padStart(2, "0");
      var mm = String(date.getMonth() + 1).padStart(2, "0");
      var yyyy = String(date.getFullYear());
      return dd + "/" + mm + "/" + yyyy;
    }

    function formatHistoryTime(value) {
      if (!value) return "";
      var date = new Date(value);
      if (!isFinite(date.getTime())) return "";
      var hh = String(date.getHours()).padStart(2, "0");
      var mm = String(date.getMinutes()).padStart(2, "0");
      var ss = String(date.getSeconds()).padStart(2, "0");
      return hh + ":" + mm + ":" + ss;
    }

    function parseDurationSeconds(value) {
      var raw = String(value || "").trim();
      if (!raw) return 0;
      var parts = raw.split(":");
      if (parts.length !== 3) return 0;
      var hh = Number(parts[0]) || 0;
      var mm = Number(parts[1]) || 0;
      var ss = Number(parts[2]) || 0;
      if (hh < 0 || mm < 0 || ss < 0) return 0;
      return (hh * 3600) + (mm * 60) + ss;
    }

    function subtractSecondsFromClock(clockValue, secondsToSubtract) {
      var raw = String(clockValue || "").trim();
      var parts = raw.split(":");
      if (parts.length !== 3) return raw;
      var hh = Number(parts[0]) || 0;
      var mm = Number(parts[1]) || 0;
      var ss = Number(parts[2]) || 0;
      var total = (hh * 3600) + (mm * 60) + ss;
      var delta = Math.max(0, Math.floor(Number(secondsToSubtract) || 0));
      var day = 24 * 3600;
      var next = ((total - delta) % day + day) % day;
      var nH = String(Math.floor(next / 3600)).padStart(2, "0");
      var nM = String(Math.floor((next % 3600) / 60)).padStart(2, "0");
      var nS = String(next % 60).padStart(2, "0");
      return nH + ":" + nM + ":" + nS;
    }

    function bindCallHistoryWaveforms(scope) {
      var root = scope || document;
      var wraps = root.querySelectorAll("[data-contacto-history-wave-wrap]");
      wraps.forEach(function (wrap) {
        if (wrap.dataset.contactoHistoryWaveBound === "true") return;
        wrap.dataset.contactoHistoryWaveBound = "true";
        var audio = wrap.querySelector("[data-contacto-history-wave-audio]");
        var canvas = wrap.querySelector("[data-contacto-history-wave-canvas]");
        var ruler = wrap.querySelector("[data-contacto-history-wave-ruler]");
        if (!audio || !canvas || !ruler) return;

        var state = {
          peaks: [],
          duration: 0,
          raf: 0
        };

        var updateRuler = function (duration) {
          var marks = ruler.querySelectorAll("span");
          if (!marks || marks.length < 5) return;
          var total = Number(duration);
          if (!isFinite(total) || total < 0) total = 0;
          for (var i = 0; i < marks.length; i += 1) {
            var ratio = (marks.length === 1) ? 0 : (i / (marks.length - 1));
            marks[i].textContent = formatHistoryWaveTime(total * ratio);
          }
        };

        var effectiveDuration = function () {
          var d = Number(audio.duration);
          if (isFinite(d) && d > 0) return d;
          if (isFinite(state.duration) && state.duration > 0) return state.duration;
          return 0;
        };

        var stopAnimation = function () {
          if (!state.raf) return;
          cancelAnimationFrame(state.raf);
          state.raf = 0;
        };

        var draw = function () {
          var ctx = canvas.getContext("2d");
          if (!ctx) return;
          var ratio = window.devicePixelRatio || 1;
          var cssWidth = Math.max(200, Math.floor(canvas.clientWidth || 640));
          var cssHeight = Math.max(72, Math.floor(canvas.clientHeight || 88));
          var pxWidth = Math.max(200, Math.floor(cssWidth * ratio));
          var pxHeight = Math.max(72, Math.floor(cssHeight * ratio));
          if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
            canvas.width = pxWidth;
            canvas.height = pxHeight;
          }

          var width = canvas.width;
          var height = canvas.height;
          var duration = effectiveDuration();
          var current = Math.max(0, Number(audio.currentTime) || 0);
          var progress = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;

          ctx.clearRect(0, 0, width, height);
          var gradient = ctx.createLinearGradient(0, 0, 0, height);
          gradient.addColorStop(0, "#f8fbff");
          gradient.addColorStop(1, "#eef4fb");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);

          var playArea = 44;
          var volumeArea = 36;
          var graphStart = playArea;
          var graphEnd = Math.max(graphStart + 20, width - volumeArea);
          var graphWidth = Math.max(20, graphEnd - graphStart);
          var centerY = Math.floor(height / 2);
          var graphTop = 10;
          var graphBottom = height - 22;
          var graphHeight = Math.max(24, graphBottom - graphTop);
          var peaks = state.peaks.length ? state.peaks : new Array(80).fill(0.08);
          var barWidth = Math.max(1, Math.floor(graphWidth / peaks.length) - 1);
          var step = graphWidth / peaks.length;

          for (var i = 0; i < peaks.length; i += 1) {
            var peak = Math.max(0.03, Math.min(1, peaks[i] || 0));
            var barX = Math.floor(graphStart + (i * step));
            var barH = Math.max(2 * ratio, Math.floor((graphHeight / 2) * peak));
            var topY = centerY - barH;
            var played = (barX + (barWidth / 2)) <= (graphStart + (graphWidth * progress));
            ctx.fillStyle = played ? "#2563eb" : "#cbd5e1";
            ctx.fillRect(barX, topY, barWidth, barH * 2);
          }

          ctx.fillStyle = "#1d4ed8";
          var progressX = Math.floor(graphStart + (graphWidth * progress));
          ctx.fillRect(progressX - 1, graphTop, 2, graphHeight);
          ctx.beginPath();
          ctx.arc(progressX, centerY, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#323544";
          if (audio.paused || audio.ended) {
            ctx.beginPath();
            ctx.moveTo(14, centerY - 10);
            ctx.lineTo(14, centerY + 10);
            ctx.lineTo(30, centerY);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(12, centerY - 10, 6, 20);
            ctx.fillRect(23, centerY - 10, 6, 20);
          }

          var vol = Math.max(0, Math.min(1, Number(audio.volume)));
          var volX = width - 16;
          var volTop = 10;
          var volHeight = height - 32;
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(volX, volTop, 4, volHeight);
          ctx.fillStyle = "#1d4ed8";
          var fillH = Math.max(2, Math.floor(volHeight * vol));
          ctx.fillRect(volX, volTop + (volHeight - fillH), 4, fillH);

          updateRuler(duration);
        };

        var refresh = function () {
          draw();
        };

        var startAnimation = function () {
          stopAnimation();
          var tick = function () {
            refresh();
            if (!audio.paused && !audio.ended) {
              state.raf = requestAnimationFrame(tick);
            } else {
              state.raf = 0;
            }
          };
          state.raf = requestAnimationFrame(tick);
        };

        var decodeWave = function () {
          if (!audio.src) return;
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) {
            refresh();
            return;
          }
          fetch(audio.src, { credentials: "same-origin" })
            .then(function (res) {
              if (!res.ok) throw new Error("wave_fetch_failed");
              return res.arrayBuffer();
            })
            .then(function (buffer) {
              var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
              var ctx = new AudioCtx();
              var decode = function () {
                try {
                  var maybe = ctx.decodeAudioData(buffer.slice(0));
                  if (maybe && typeof maybe.then === "function") return maybe;
                } catch (_error) {}
                return new Promise(function (resolve, reject) {
                  ctx.decodeAudioData(buffer.slice(0), resolve, reject);
                });
              };
              return decode()
                .then(function (audioBuffer) {
                  var samples = audioBuffer.getChannelData(0);
                  var bars = Math.max(60, Math.floor((canvas.clientWidth || 640) / 3));
                  var block = Math.max(1, Math.floor(samples.length / bars));
                  var peaks = [];
                  for (var i = 0; i < bars; i += 1) {
                    var start = i * block;
                    var end = Math.min(samples.length, start + block);
                    var step = Math.max(1, Math.floor((end - start) / 30));
                    var peak = 0;
                    for (var j = start; j < end; j += step) {
                      var value = Math.abs(samples[j] || 0);
                      if (value > peak) peak = value;
                    }
                    peaks.push(peak);
                  }
                  state.peaks = peaks;
                  state.duration = audioBuffer.duration || 0;
                })
                .catch(function () {
                  var bars = Math.max(60, Math.floor((canvas.clientWidth || 640) / 3));
                  var step = Math.max(1, Math.floor(bytes.length / bars));
                  var peaks = [];
                  for (var i = 0; i < bars; i += 1) {
                    var start = i * step;
                    var end = Math.min(bytes.length, start + step);
                    var peak = 0;
                    for (var j = start; j < end; j += 1) {
                      var normalized = Math.abs((bytes[j] - 128) / 128);
                      if (normalized > peak) peak = normalized;
                    }
                    peaks.push(Math.min(1, Math.max(0.03, peak)));
                  }
                  state.peaks = peaks;
                  state.duration = 0;
                })
                .finally(function () {
                  if (ctx && typeof ctx.close === "function") {
                    ctx.close().catch(function () {});
                  }
                });
            })
            .then(function () {
              refresh();
            })
            .catch(function () {
              refresh();
            });
        };

        canvas.addEventListener("click", function (event) {
          var rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var x = event.clientX - rect.left;
          var y = event.clientY - rect.top;
          var controlLeft = 44;
          var controlRight = 36;
          var timelineStart = controlLeft;
          var timelineEnd = Math.max(timelineStart + 20, rect.width - controlRight);
          if (x <= controlLeft) {
            if (audio.paused || audio.ended) {
              audio.play().catch(function () {});
            } else {
              audio.pause();
            }
            refresh();
            return;
          }
          if (x >= timelineEnd) {
            var nextVolume = 1 - Math.max(0, Math.min(1, y / rect.height));
            audio.volume = nextVolume;
            audio.muted = nextVolume <= 0;
            refresh();
            return;
          }
          var duration = effectiveDuration();
          if (!isFinite(duration) || duration <= 0) return;
          var ratio = (x - timelineStart) / (timelineEnd - timelineStart);
          audio.currentTime = duration * Math.max(0, Math.min(1, ratio));
          refresh();
        });

        audio.addEventListener("loadedmetadata", refresh);
        audio.addEventListener("durationchange", refresh);
        audio.addEventListener("timeupdate", refresh);
        audio.addEventListener("ended", function () {
          stopAnimation();
          refresh();
        });
        audio.addEventListener("pause", function () {
          stopAnimation();
          refresh();
        });
        audio.addEventListener("play", function () {
          startAnimation();
          refresh();
        });
        audio.addEventListener("volumechange", refresh);

        decodeWave();
        refresh();
      });
    }

    function renderCallHistoryList(items) {
      var list = document.querySelector("[data-contacto-call-history-list]");
      if (!list) return;
      list.innerHTML = "";
      var shell = document.querySelector(".contacto-shell");
      var isAdmin = shell && shell.getAttribute("data-contacto-tags-admin") === "true";
      var entries = Array.isArray(items) ? items : [];
      if (!entries.length) {
        list.innerHTML = '<div class="contacto-call-history-empty">Sin historial de llamadas.</div>';
        return;
      }
      function traceLine(label, value) {
        var safeValue = value === null || value === undefined ? "" : String(value);
        if (!safeValue) return "";
        return '<div class="contacto-crm-trace-line"><strong>' + escapeHtml(label) + ":</strong> " + escapeHtml(safeValue) + "</div>";
      }
      function renderTraceChanges(changes) {
        var meta = changes && typeof changes === "object" ? changes : {};
        var html = "";
        html += traceLine("Resultado", meta.duplicate === true ? "Duplicado" : "Nuevo/Actualizado");
        html += traceLine("Motivo duplicado", meta.duplicate_reason);
        html += traceLine("Responsable", meta.assigned_to_name);
        html += traceLine("Etiqueta", meta.crm_tag_name);
        html += traceLine("Fecha registro payload", meta.registration_at);
        html += traceLine("Origen fecha payload", meta.registration_source);
        html += traceLine("Work package", meta.work_package_id ? (String(meta.work_package_id) + " - " + String(meta.work_package_subject || "")) : "");
        html += traceLine("Tablero", meta.board_name);
        html += traceLine("Lista", meta.list_name);
        var fields = Array.isArray(meta.updated_fields) ? meta.updated_fields.filter(Boolean) : [];
        var customFields = Array.isArray(meta.updated_custom_fields) ? meta.updated_custom_fields.filter(Boolean) : [];
        if (fields.length) html += traceLine("Campos", fields.join(", "));
        if (customFields.length) html += traceLine("Campos custom", customFields.join(", "));
        return html || '<div class="contacto-crm-trace-line">Sin cambios reportados.</div>';
      }
      entries.forEach(function (entry) {
        if ((entry.event_type || "") === "crm_trace") {
          var traceMeta = entry.event_meta && typeof entry.event_meta === "object" ? entry.event_meta : {};
          var title = traceMeta.title || "Contacto actualizado";
          var whenText = escapeHtml(entry.logged_at_label || formatHistoryDate(entry.logged_at) || "");
          var traceStatus = traceMeta.status || "";
          var tracePath = traceMeta.path || "";
          var bodyHtml = renderTraceChanges(traceMeta.changes || {});
          var traceItem = document.createElement("div");
          traceItem.className = "contacto-call-history-item contacto-crm-trace-item";
          traceItem.innerHTML =
            '<button type="button" class="contacto-crm-trace-toggle" data-contacto-crm-trace-toggle="true" aria-expanded="false">' +
              '<span class="contacto-crm-trace-title">' + escapeHtml(title) + "</span>" +
              '<span class="contacto-crm-trace-meta">' + whenText + (traceStatus ? " - " + escapeHtml(traceStatus) : "") + (tracePath ? " (" + escapeHtml(tracePath) + ")" : "") + "</span>" +
            "</button>" +
            '<div class="contacto-crm-trace-body is-hidden" data-contacto-crm-trace-body="true">' +
              bodyHtml +
            "</div>";
          list.appendChild(traceItem);
          return;
        }
        var item = document.createElement("div");
        item.className = "contacto-call-history-item";
        item.setAttribute("data-contacto-call-history-id", String(entry.id || ""));
        var userName = escapeHtml(entry.user_name || "Usuario");
        var loggedAt = escapeHtml(entry.logged_at_date || formatHistoryDate(entry.logged_at) || "");
        var durationRaw = entry.call_duration || "00:00:00";
        var durationSeconds = parseDurationSeconds(durationRaw);
        var duration = escapeHtml(entry.call_duration || "00:00:00");
        var endTimeRaw = entry.logged_at_time || formatHistoryTime(entry.logged_at) || "00:00:00";
        var endTime = escapeHtml(endTimeRaw);
        var startRaw = entry.started_at_time || "";
        if (!startRaw) {
          var endDate = new Date(entry.logged_at);
          if (isFinite(endDate.getTime())) {
            startRaw = formatHistoryTime(new Date(endDate.getTime() - (durationSeconds * 1000))) || "";
          }
        }
        if (!startRaw) startRaw = subtractSecondsFromClock(endTimeRaw, durationSeconds);
        if (durationSeconds > 0 && startRaw === endTimeRaw) startRaw = subtractSecondsFromClock(endTimeRaw, durationSeconds);
        var startTime = escapeHtml(startRaw || endTimeRaw);
        var outcome = escapeHtml(entry.outcome || "Sin resultado");
        var deleteHtml = "";
        if (isAdmin && entry.id) {
          deleteHtml =
            '<button type="button" class="contacto-call-history-delete" data-contacto-call-history-delete="' + escapeHtml(String(entry.id)) + '" title="Eliminar registro" aria-label="Eliminar registro">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">' +
                '<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>' +
                '<path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>' +
              "</svg>" +
            "</button>";
        }
        var audioHtml = "";
        if (entry.audio_url) {
          audioHtml =
            '<div class="contacto-call-waveform contacto-call-history-waveform" data-contacto-history-wave-wrap>' +
              '<audio preload="metadata" class="contacto-call-recorder-audio is-hidden" data-contacto-history-wave-audio src="' + escapeHtml(entry.audio_url) + '"></audio>' +
              '<canvas class="contacto-call-waveform-canvas" data-contacto-history-wave-canvas width="640" height="88"></canvas>' +
              '<div class="contacto-call-waveform-ruler" data-contacto-history-wave-ruler>' +
                "<span>00:00:00</span>" +
                "<span>00:00:00</span>" +
                "<span>00:00:00</span>" +
                "<span>00:00:00</span>" +
                "<span>00:00:00</span>" +
              "</div>" +
            "</div>";
        } else {
          audioHtml = '<div class="contacto-call-history-empty">Sin audio grabado</div>';
        }
        item.innerHTML =
          '<div class="contacto-call-history-meta">' +
            '<div class="contacto-call-history-col contacto-call-history-col-main">' +
              '<div class="contacto-call-history-line contacto-call-history-line-text"><strong>Usuario:</strong> ' + userName + "</div>" +
              '<div class="contacto-call-history-line contacto-call-history-line-text"><strong>Duracion de llamada:</strong> ' + duration + "</div>" +
              '<div class="contacto-call-history-line contacto-call-history-line-text"><strong>Resultado:</strong> ' + outcome + "</div>" +
            "</div>" +
            '<div class="contacto-call-history-col contacto-call-history-col-time">' +
              '<div class="contacto-call-history-line contacto-call-history-line-head"><span class="contacto-call-history-date">' + loggedAt + "</span>" + deleteHtml + "</div>" +
              '<div class="contacto-call-history-line contacto-call-history-line-text"><strong>Inicio:</strong> ' + startTime + "</div>" +
              '<div class="contacto-call-history-line contacto-call-history-line-text"><strong>Fin:</strong> ' + endTime + "</div>" +
            "</div>" +
          "</div>" +
          audioHtml;
        list.appendChild(item);
      });
      list.querySelectorAll("[data-contacto-crm-trace-toggle]").forEach(function (btn) {
        if (btn.dataset.bound === "true") return;
        btn.dataset.bound = "true";
        btn.addEventListener("click", function () {
          var wrap = btn.closest(".contacto-crm-trace-item");
          if (!wrap) return;
          var body = wrap.querySelector("[data-contacto-crm-trace-body]");
          if (!body) return;
          var open = body.classList.contains("is-hidden");
          body.classList.toggle("is-hidden", !open);
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
      });
      bindCallHistoryWaveforms(list);
    }

    function loadCallHistory(contactId) {
      var shell = document.querySelector(".contacto-shell");
      var template = shell ? shell.getAttribute("data-contacto-call-history-url-template") : "";
      if (!template || !contactId) return;
      var list = document.querySelector("[data-contacto-call-history-list]");
      if (list) list.setAttribute("data-contacto-call-history-contact-id", String(contactId));
      var url = template.replace("__CONTACT_ID__", encodeURIComponent(String(contactId)));
      fetch(url, {
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("call_history_failed");
          return response.json();
        })
        .then(function (payload) {
          renderCallHistoryList(payload && payload.items ? payload.items : []);
        })
        .catch(function () {
          renderCallHistoryList([]);
        });
    }

    function currentHistoryContactId() {
      var list = document.querySelector("[data-contacto-call-history-list]");
      var fromList = list ? String(list.getAttribute("data-contacto-call-history-contact-id") || "").trim() : "";
      if (fromList) return fromList;
      return String(currentContext.contactId || "").trim();
    }

    function deleteCallHistoryEntry(contactId, historyId) {
      var shell = document.querySelector(".contacto-shell");
      var isAdmin = shell && shell.getAttribute("data-contacto-tags-admin") === "true";
      if (!isAdmin) return;
      var template = shell ? shell.getAttribute("data-contacto-call-history-destroy-url-template") : "";
      if (!template || !contactId || !historyId) return;
      var token = document.querySelector("meta[name='csrf-token']");
      var url = template
        .replace("__CONTACT_ID__", encodeURIComponent(String(contactId)))
        .replace("__HISTORY_ID__", encodeURIComponent(String(historyId)));
      fetch(url, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("call_history_destroy_failed");
          return response.json();
        })
        .then(function (payload) {
          if (!payload || payload.ok !== true) throw new Error("call_history_destroy_failed");
          loadCallHistory(String(contactId));
        })
        .catch(function () {
          window.alert("No se pudo eliminar el registro.");
        });
    }

    function bindCreateFormAjax() {
      if (document.body.dataset.contactoCreateAjaxBound === "true") return;
      document.body.dataset.contactoCreateAjaxBound = "true";

      if (document.body.dataset.contactoWpOpenBound !== "true") {
        document.body.dataset.contactoWpOpenBound = "true";
        document.addEventListener("click", function (event) {
          var target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
          var btn = target && target.closest("[data-contacto-work-package-open]");
          if (!btn) return;
          var url = btn.getAttribute("data-work-package-url");
          if (!url) return;
          window.open(url, "_blank", "noopener");
        });
      }

      document.addEventListener("submit", function (event) {
        var form = event.target;
        if (!form || !form.hasAttribute("data-contacto-create-form")) return;
      event.preventDefault();

      var token = document.querySelector("meta[name='csrf-token']");
      var formData = new FormData(form);

      fetch(form.getAttribute("action") || "", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: formData
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (data) { throw data; });
          }
          return response.json();
        })
          .then(function (data) {
            var panel = document.querySelector("[data-contacto-panel='create']");
            var overlay = document.querySelector("[data-contacto-overlay='create']");
            if (panel) {
              panel.classList.remove("is-open");
              panel.setAttribute("aria-hidden", "true");
            }
            if (overlay) overlay.classList.remove("is-open");
            try {
              window.sessionStorage.removeItem("contactoDrawerOpen");
            } catch (error) {}
            form.reset();
            var shell = document.querySelector(".contacto-shell");
            var template = shell ? shell.getAttribute("data-contacto-edit-panel-url-template") : "";
            var contactId = data && data.id ? String(data.id) : "";
            if (template && contactId) {
              var url = template.replace("__CONTACT_ID__", contactId);
              var editBody = document.querySelector("[data-contacto-panel='edit'] [data-contacto-edit-body]");
              if (editBody) {
                editBody.innerHTML = '<div class="contacto-drawer-loading">Cargando...</div>';
                openPanel("edit");
                fetch(url, { headers: { "Accept": "text/html" } })
                  .then(function (response) {
                    if (!response.ok) throw new Error("Request failed");
                    return response.text();
                  })
                  .then(function (html) {
                    editBody.innerHTML = html;
                    bindTagInputs();
                    bindCountryPicker();
                    updateEditTitle(editBody);
                    var wpMeta = editBody.querySelector("[data-contacto-work-package-meta]");
                      var wpInput = document.querySelector("[data-contacto-work-package]");
                    var wpStatusMeta = editBody.querySelector("[data-contacto-work-package-statuses]");
                    var wpStatusSelect = document.querySelector("[data-contacto-work-package-status]");
                    if (wpInput) {
                      var wpId = wpMeta ? wpMeta.getAttribute("data-work-package-id") : "";
                      var wpSubject = wpMeta ? wpMeta.getAttribute("data-work-package-subject") : "";
                      var value = "";
                      if (wpId || wpSubject) {
                        value = wpId ? (wpId + (wpSubject ? " - " + wpSubject : "")) : wpSubject;
                      }
                      wpInput.value = value;
                      if (wpId) {
                        wpInput.setAttribute("data-work-package-id", wpId);
                      } else {
                        wpInput.removeAttribute("data-work-package-id");
                      }
                    }
                    var wpOpenBtn = document.querySelector("[data-contacto-work-package-open]");
                    if (wpOpenBtn) {
                      var wpUrl = wpMeta ? wpMeta.getAttribute("data-work-package-url") : "";
                      wpOpenBtn.disabled = !wpUrl;
                      wpOpenBtn.setAttribute("data-work-package-url", wpUrl || "");
                    }
                    if (wpStatusSelect) {
                      fillWorkPackageStatusSelect(wpStatusSelect, wpStatusMeta);
                      startWorkPackageStatusPolling(wpMeta ? wpMeta.getAttribute("data-work-package-id") : "", wpStatusSelect);
                    }
                    editBody.querySelectorAll("input[name='contact[first_name]'], input[name='contact[last_name]']").forEach(function (input) {
                      input.addEventListener("input", function () {
                        updateEditTitle(editBody);
                      });
                    });
                    var editForm = editBody.querySelector("[data-contacto-edit-form]");
                    loadCallHistory(editForm ? editForm.getAttribute("data-contacto-id") : "");
                  })
                  .catch(function () {
                    editBody.innerHTML = '<div class="contacto-drawer-empty">No se pudo cargar el contacto.</div>';
                    updateEditTitle(editBody);
                    renderCallHistoryList([]);
                  });
              }
            } else {
              window.location.reload();
            }
          })
          .catch(function (error) {
            window.alert(parseApiErrorMessage(error));
          });
      });
    }

  function bindEditFormAjax() {
    if (document.body.dataset.contactoEditAjaxBound === "true") return;
    document.body.dataset.contactoEditAjaxBound = "true";

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.hasAttribute("data-contacto-edit-form")) return;
      event.preventDefault();

      var token = document.querySelector("meta[name='csrf-token']");
      var formData = new FormData(form);

      fetch(form.getAttribute("action") || "", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "text/html",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: formData
      })
        .then(function (response) {
          if (!response.ok) throw new Error("Request failed");
          var panel = document.querySelector("[data-contacto-panel='edit']");
          var overlay = document.querySelector("[data-contacto-overlay='edit']");
          if (panel) {
            panel.classList.remove("is-open");
            panel.setAttribute("aria-hidden", "true");
          }
          if (overlay) overlay.classList.remove("is-open");
          try {
            window.sessionStorage.removeItem("contactoDrawerOpen");
          } catch (error) {}
        })
        .catch(function () {});
    });
  }

  function bindFieldFormAjax() {
    if (document.body.dataset.contactoFieldAjaxBound === "true") return;
    document.body.dataset.contactoFieldAjaxBound = "true";

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.hasAttribute("data-contacto-field-form")) return;
      event.preventDefault();

      var panel = document.querySelector("[data-contacto-panel='fields']");
      var panelBody = panel ? panel.querySelector("[data-contacto-fields-panel]") : null;
      var panelUrl = panel ? panel.getAttribute("data-contacto-fields-panel-url") : "";
      var token = document.querySelector("meta[name='csrf-token']");
      var formData = new FormData(form);

      fetch(form.getAttribute("action") || "", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "text/html",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: formData
      })
        .then(function () {
          if (!panelUrl || !panelBody) return;
          return fetch(panelUrl, { headers: { "Accept": "text/html" } })
            .then(function (response) { return response.text(); })
            .then(function (html) {
              panelBody.innerHTML = html;
              bindCustomFieldOptions();
              bindCustomFieldEditToggle();
              bindCustomFieldGroupDrag();
              bindCustomFieldsOrderDrag();
            });
        })
        .catch(function () {});
    });
  }

  function bindEditDrawer() {
    if (document.body.dataset.contactoEditDrawerBound === "true") return;
    document.body.dataset.contactoEditDrawerBound = "true";

    function updateEditTitle(body) {
      var title = document.querySelector("[data-contacto-edit-title]");
      if (!title || !body) return;
      var first = body.querySelector("input[name='contact[first_name]']");
      var last = body.querySelector("input[name='contact[last_name]']");
      var firstValue = first ? first.value.trim() : "";
      var lastValue = last ? last.value.trim() : "";
      var full = (firstValue + " " + lastValue).trim();
      title.textContent = full || "Editar contacto";
    }

    function openPanel(key) {
      var panel = document.querySelector("[data-contacto-panel='" + key + "']");
      var overlay = document.querySelector("[data-contacto-overlay='" + key + "']");
      if (!panel || !overlay) return;
      panel.classList.add("is-open");
      overlay.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
    }

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-contacto-edit='true']");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();

      var url = button.getAttribute("data-contacto-edit-panel-url");
      var body = document.querySelector("[data-contacto-panel='edit'] [data-contacto-edit-body]");
      if (!url || !body) return;

      body.innerHTML = '<div class="contacto-drawer-loading">Cargando...</div>';
      openPanel("edit");

        fetch(url, { headers: { "Accept": "text/html" } })
          .then(function (response) {
            if (!response.ok) throw new Error("Request failed");
            return response.text();
          })
          .then(function (html) {
            body.innerHTML = html;
              bindTagInputs();
              bindCountryPicker();
              updateEditTitle(body);
              var wpMeta = body.querySelector("[data-contacto-work-package-meta]");
                var wpInput = document.querySelector("[data-contacto-work-package]");
              var wpStatusMeta = body.querySelector("[data-contacto-work-package-statuses]");
              var wpStatusSelect = document.querySelector("[data-contacto-work-package-status]");
              if (wpInput) {
                var wpId = wpMeta ? wpMeta.getAttribute("data-work-package-id") : "";
                var wpSubject = wpMeta ? wpMeta.getAttribute("data-work-package-subject") : "";
              var value = "";
              if (wpId || wpSubject) {
                value = wpId ? (wpId + (wpSubject ? " - " + wpSubject : "")) : wpSubject;
              }
              wpInput.value = value;
                if (wpId) {
                  wpInput.setAttribute("data-work-package-id", wpId);
                } else {
                  wpInput.removeAttribute("data-work-package-id");
                }
              }
              var wpOpenBtn = document.querySelector("[data-contacto-work-package-open]");
              if (wpOpenBtn) {
                var wpUrl = wpMeta ? wpMeta.getAttribute("data-work-package-url") : "";
                wpOpenBtn.disabled = !wpUrl;
                wpOpenBtn.setAttribute("data-work-package-url", wpUrl || "");
              }
              if (wpStatusSelect) {
                fillWorkPackageStatusSelect(wpStatusSelect, wpStatusMeta);
                startWorkPackageStatusPolling(wpMeta ? wpMeta.getAttribute("data-work-package-id") : "", wpStatusSelect);
              }
              body.querySelectorAll("input[name='contact[first_name]'], input[name='contact[last_name]']").forEach(function (input) {
                input.addEventListener("input", function () {
                  updateEditTitle(body);
                });
              });
              var editForm = body.querySelector("[data-contacto-edit-form]");
              loadCallHistory(editForm ? editForm.getAttribute("data-contacto-id") : "");
          })
        .catch(function () {
          body.innerHTML = '<div class="contacto-drawer-empty">No se pudo cargar el contacto.</div>';
          updateEditTitle(body);
          renderCallHistoryList([]);
        });
    });
  }

  function bindCreateTitle() {
    var title = document.querySelector("[data-contacto-create-title]");
    var subtitle = document.querySelector("[data-contacto-create-external]");
    if (!title) return;
    var first = document.querySelector("input[name='contact[first_name]']");
    var last = document.querySelector("input[name='contact[last_name]']");
    var phone = document.querySelector("input[name='contact[phone]']");
    if (!first && !last) return;

    function update() {
      var full = [first ? first.value.trim() : "", last ? last.value.trim() : ""].filter(Boolean).join(" ");
      title.textContent = full || "Nuevo contacto";
      if (subtitle) {
        var value = phone ? phone.value.trim() : "";
        var external = "";
        if (value) {
          if (value.indexOf("@") !== -1) {
            external = value;
          } else {
            var digits = value.replace(/\D/g, "");
            external = digits ? digits + "@c.us" : "";
          }
        }
        subtitle.textContent = external;
        subtitle.style.display = external ? "block" : "none";
      }
    }

    if (first) first.addEventListener("input", update);
    if (last) last.addEventListener("input", update);
    if (phone) phone.addEventListener("input", update);
    update();
  }

  function bindCountryPicker() {
    var countries = window.WA_COUNTRIES || [];
    if (!countries.length) {
      if (document.body.dataset.contactoCountryPending !== "true") {
        document.body.dataset.contactoCountryPending = "true";
        setTimeout(function () {
          document.body.dataset.contactoCountryPending = "";
          bindCountryPicker();
        }, 200);
      }
      return;
    }

    document.body.dataset.contactoCountryBound = "true";

    function populateCountryList(countryList, list) {
      countryList.innerHTML = "";
      list.forEach(function (country) {
        var item = document.createElement("button");
        item.type = "button";
        item.className = "wa-country-item";
        item.setAttribute("data-code", country.dial || "");
        item.setAttribute("data-name", country.name || "");
        item.setAttribute("data-iso", country.iso2 || "");
        var isoLower = (country.iso2 || "").toLowerCase();
        var flag = isoLower ? "<img src=\"https://flagcdn.com/w40/" + isoLower + ".png\" alt=\"" + (country.name || "") + "\">" : "";
        item.innerHTML = flag + " " + (country.name || "") + " " + (country.dial || "");
        countryList.appendChild(item);
      });
    }

    function filterCountries(countryList, query) {
      var needle = (query || "").toLowerCase();
      var items = countryList.querySelectorAll(".wa-country-item");
      items.forEach(function (item) {
        var name = (item.getAttribute("data-name") || "").toLowerCase();
        var code = (item.getAttribute("data-code") || "").toLowerCase();
        var visible = !needle || name.indexOf(needle) !== -1 || code.indexOf(needle) !== -1;
        item.style.display = visible ? "" : "none";
      });
    }

    document.querySelectorAll("[data-contacto-country-input]").forEach(function (countryInput) {
      if (countryInput.dataset.bound === "true") return;
      countryInput.dataset.bound = "true";
      var wrap = countryInput.closest(".wa-new-chat-country-wrap");
      var countryList = wrap ? wrap.querySelector("[data-contacto-country-list]") : null;
      if (!countryList) return;

      populateCountryList(countryList, countries);

      countryInput.addEventListener("focus", function () {
        countryList.classList.remove("is-hidden");
      });

      countryInput.addEventListener("input", function () {
        filterCountries(countryList, countryInput.value);
        if (countryInput.value.trim() === "") {
          countryInput.style.backgroundImage = "none";
          countryInput.removeAttribute("data-code");
          countryInput.classList.remove("has-flag");
        }
      });

      countryInput.addEventListener("keydown", function (event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (countryInput.value.trim() !== "") return;
        countryInput.style.backgroundImage = "none";
        countryInput.removeAttribute("data-code");
        countryInput.classList.remove("has-flag");
      });

      function handleCountrySelect(event) {
        var item = event.target.closest(".wa-country-item");
        if (!item) return;
        var code = item.getAttribute("data-code") || "";
        var iso = item.getAttribute("data-iso") || "";
        countryInput.value = "";
        countryInput.setAttribute("data-code", code);
        countryInput.style.backgroundImage = iso ? "url('https://flagcdn.com/w40/" + iso.toLowerCase() + ".png')" : "none";
        if (iso) {
          countryInput.classList.add("has-flag");
        } else {
          countryInput.classList.remove("has-flag");
        }
        countryList.classList.add("is-hidden");
        var phoneInput = wrap ? wrap.parentElement.querySelector("[data-contacto-phone-input]") : null;
        if (phoneInput && code) {
          var current = (phoneInput.value || "").trim();
          var codeDigits = code.replace(/\D/g, "");
          if (codeDigits) {
            if (current.indexOf("+") === 0) {
              var rest = current.replace(/^\+\d+/, "");
              phoneInput.value = "+" + codeDigits + rest;
            } else {
              phoneInput.value = "+" + codeDigits + current;
            }
          }
        }
      }

      countryList.addEventListener("click", handleCountrySelect);
      countryList.addEventListener("mousedown", handleCountrySelect);

      document.addEventListener("click", function (event) {
        if (countryInput.contains(event.target) || countryList.contains(event.target)) return;
        countryList.classList.add("is-hidden");
      });
    });

    document.querySelectorAll("[data-contacto-country-name-input]").forEach(function (countryInput) {
      if (countryInput.dataset.bound === "true") return;
      countryInput.dataset.bound = "true";
      var wrap = countryInput.closest(".wa-new-chat-country-wrap");
      var countryList = wrap ? wrap.querySelector("[data-contacto-country-name-list]") : null;
      var rootWrap = wrap ? wrap.closest(".contacto-country-input") : null;
      var hiddenInput = rootWrap ? rootWrap.querySelector("[data-contacto-country-hidden]") : null;
      if (!countryList) return;

      populateCountryList(countryList, countries);

      if (countryInput.value.trim() !== "") {
        var match = countries.find(function (c) { return c.name && c.name.toLowerCase() === countryInput.value.trim().toLowerCase(); });
        if (match && match.iso2) {
          countryInput.style.backgroundImage = "url('https://flagcdn.com/w40/" + match.iso2.toLowerCase() + ".png')";
          countryInput.classList.add("has-flag");
        }
        if (hiddenInput) hiddenInput.value = countryInput.value.trim();
      }

      countryInput.addEventListener("focus", function () {
        countryList.classList.remove("is-hidden");
      });

      countryInput.addEventListener("input", function () {
        filterCountries(countryList, countryInput.value);
        if (countryInput.value.trim() === "") {
          countryInput.style.backgroundImage = "none";
          countryInput.classList.remove("has-flag");
        }
        if (hiddenInput) hiddenInput.value = countryInput.value.trim();
      });

      countryInput.addEventListener("keydown", function (event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (countryInput.value.trim() !== "") return;
        countryInput.style.backgroundImage = "none";
        countryInput.classList.remove("has-flag");
      });

      function handleCountrySelect(event) {
        var item = event.target.closest(".wa-country-item");
        if (!item) return;
        var iso = item.getAttribute("data-iso") || "";
        var name = item.getAttribute("data-name") || "";
        countryInput.value = name;
        countryInput.style.backgroundImage = iso ? "url('https://flagcdn.com/w40/" + iso.toLowerCase() + ".png')" : "none";
        if (iso) {
          countryInput.classList.add("has-flag");
        } else {
          countryInput.classList.remove("has-flag");
        }
        countryList.classList.add("is-hidden");
        if (hiddenInput) hiddenInput.value = name;
      }

      countryList.addEventListener("click", handleCountrySelect);
      countryList.addEventListener("mousedown", handleCountrySelect);

      document.addEventListener("click", function (event) {
        if (countryInput.contains(event.target) || countryList.contains(event.target)) return;
        countryList.classList.add("is-hidden");
      });
    });

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.querySelector) return;
      var phoneInput = form.querySelector("[data-contacto-phone-input]");
      if (!phoneInput) return;
      var wrap = phoneInput.closest(".contacto-phone-input");
      var countryInput = wrap ? wrap.querySelector("[data-contacto-country-input]") : null;
      var code = countryInput ? (countryInput.getAttribute("data-code") || "") : "";
      if (!code) return;
      var value = (phoneInput.value || "").trim();
      if (!value) return;
      if (value.charAt(0) === "+" || value.indexOf("@") !== -1) return;
      var digits = value.replace(/\D/g, "");
      var codeDigits = code.replace(/\D/g, "");
      if (!digits || !codeDigits) return;
      phoneInput.value = "+" + codeDigits + digits;
    });

    if (typeof window.contactoDecorateCountries === "function") {
      window.contactoDecorateCountries();
    }
  }

  function bindHistoryCalendar() {
    var form = document.querySelector("[data-contacto-history-calendar-form]");
    if (!form || form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    var input = form.querySelector("[data-contacto-history-date-input]");
    var responsibleSelect = form.querySelector("[data-contacto-history-responsible-input]");

    if (input) {
      input.addEventListener("change", function () {
        if (!input.value) return;
        form.submit();
      });
    }

    if (responsibleSelect) {
      responsibleSelect.addEventListener("change", function () {
        form.submit();
      });
    }
  }

  function revealLoadingTables() {
    document.querySelectorAll(".contacto-table.is-loading").forEach(function (table) {
      table.classList.remove("is-loading");
    });
  }

  function bindAll() {
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Contactos] bindAll.start", {
        readyState: document.readyState,
        turbo: !!window.Turbo
      });
    }
    function safeBind(name, fn) {
      try {
        fn();
      } catch (error) {
        if (window.console && typeof window.console.error === "function") {
          window.console.error("[Contactos] bind failed:", name, error);
        }
      }
    }

    safeBind("resetDrawerState", resetDrawerState);
    safeBind("bindWpStatusSyncListener", bindWpStatusSyncListener);
    safeBind("bindTagLists", bindTagLists);
    safeBind("bindTagInputs", bindTagInputs);
    safeBind("bindTagActions", bindTagActions);
    safeBind("bindTagDrag", bindTagDrag);
    safeBind("bindSearch", bindSearch);
    safeBind("bindAdvancedFilters", bindAdvancedFilters);
    safeBind("bindPerPage", bindPerPage);
    safeBind("bindFavoriteToggle", bindFavoriteToggle);
    safeBind("bindHeaderMenu", bindHeaderMenu);
    safeBind("bindTagCreateModal", bindTagCreateModal);
    safeBind("bindSelection", bindSelection);
    safeBind("bindBulkMacros", bindBulkMacros);
    safeBind("bindCallActivityModal", bindCallActivityModal);
    safeBind("bindPauseActivityModal", bindPauseActivityModal);
    safeBind("bindSettingsMenu", bindSettingsMenu);
    safeBind("bindCellEditor", bindCellEditor);
    safeBind("bindTableWpStatusSelects", bindTableWpStatusSelects);
    safeBind("initColumnManager", initColumnManager);
    safeBind("bindHistoryColumnManager", bindHistoryColumnManager);
    safeBind("bindDrawerDelegates", bindDrawerDelegates);
    safeBind("bindCustomFieldOptions", bindCustomFieldOptions);
    safeBind("bindCustomFieldEditToggle", bindCustomFieldEditToggle);
    safeBind("bindCustomFieldGroupDrag", bindCustomFieldGroupDrag);
    safeBind("bindCustomFieldsOrderDrag", bindCustomFieldsOrderDrag);
    safeBind("bindDrawerSubmit", bindDrawerSubmit);
    safeBind("bindCreateFormAjax", bindCreateFormAjax);
    safeBind("bindEditFormAjax", bindEditFormAjax);
    safeBind("bindFieldFormAjax", bindFieldFormAjax);
    safeBind("bindEditDrawer", bindEditDrawer);
    safeBind("bindCreateTitle", bindCreateTitle);
    safeBind("bindCountryPicker", bindCountryPicker);
    safeBind("bindHistoryCalendar", bindHistoryCalendar);
    safeBind("ensureOverlayState", ensureOverlayState);

    revealLoadingTables();
    setTimeout(revealLoadingTables, 800);
  }

  function resetDrawerState() {
    document.querySelectorAll("[data-contacto-panel].is-open").forEach(function (panel) {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll("[data-contacto-overlay].is-open").forEach(function (overlay) {
      overlay.classList.remove("is-open");
    });
    var callModal = document.querySelector("[data-contacto-call-modal]");
    if (callModal) {
      callModal.classList.add("is-hidden");
      callModal.setAttribute("aria-hidden", "true");
    }
    var pauseModal = document.querySelector("[data-contacto-pause-modal]");
    if (pauseModal) {
      pauseModal.classList.add("is-hidden");
      pauseModal.setAttribute("aria-hidden", "true");
    }
    var tagCreateModal = document.querySelector("[data-contacto-tag-create-modal]");
    if (tagCreateModal) {
      tagCreateModal.classList.add("is-hidden");
      tagCreateModal.setAttribute("aria-hidden", "true");
    }
    var columnsModal = document.querySelector("[data-contacto-columns-modal]");
    if (columnsModal) {
      columnsModal.classList.add("is-hidden");
      columnsModal.setAttribute("aria-hidden", "true");
    }
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Contactos] drawer.reset");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAll);
  } else {
    bindAll();
  }

  document.addEventListener("turbo:load", function () {
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Contactos] turbo:load");
    }
    bindAll();
  });
  document.addEventListener("turbo:before-cache", function () {
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Contactos] turbo:before-cache");
    }
    resetDrawerState();
    document.body.dataset.contactoFavoriteBound = "";
    document.body.dataset.contactoHeaderMenuBound = "";
    document.body.dataset.contactoTagCreateBound = "";
    document.body.dataset.contactoSelectionBound = "";
    document.body.dataset.contactoBulkMacroBound = "";
    document.body.dataset.contactoBulkMacroSelectionBound = "";
    document.body.dataset.contactoCallModalBound = "";
    document.body.dataset.contactoColumnsModalBound = "";
    window.__contactoSettingsBound = true;
    document.body.dataset.contactoEditorBound = "";
    document.body.dataset.contactoTableWpStatusBound = "";
    document.body.dataset.contactoDrawerBound = "";
    document.body.dataset.contactoFieldEditBound = "";
    document.body.dataset.contactoFieldGroupBound = "";
    document.body.dataset.contactoFieldOrderBound = "";
    document.body.dataset.contactoDrawerSubmitBound = "";
    document.querySelectorAll("[data-contacto-table='true']").forEach(function (table) {
      table.dataset.columnsBound = "";
    });
    document.querySelectorAll("[data-contacto-history-table='true']").forEach(function (table) {
      table.dataset.historyColumnsBound = "";
    });
    document.body.dataset.contactoEditDrawerBound = "";
    document.body.dataset.contactoTagsActionBound = "";
    document.body.dataset.contactoTagsDragBound = "";
    document.querySelectorAll("form[data-contacto-field-form]").forEach(function (form) {
      form.dataset.bound = "";
    });
    document.querySelectorAll("[data-contacto-tags-input]").forEach(function (wrap) {
      wrap.dataset.bound = "";
    });
    document.querySelectorAll("[data-contacto-history-calendar-form]").forEach(function (form) {
      form.dataset.bound = "";
    });
    var perPage = document.querySelector("#contacto-per-page");
    if (perPage) perPage.dataset.bound = "";
    var root = document.querySelector(".contacto-shell");
    if (root) {
      root.dataset.tagsBound = "";
      root.dataset.advancedFiltersBound = "";
    }
  });
})();



