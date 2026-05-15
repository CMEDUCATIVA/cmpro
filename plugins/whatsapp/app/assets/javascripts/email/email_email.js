// Email module behavior.
var initEmailModule = function () {
  var root = document.querySelector(".op-email-email");
  if (!root) {
    return;
  }

  var bindHistoryRows = function () {
    if (root.dataset.emailHistoryBound === "true") {
      return;
    }
    root.dataset.emailHistoryBound = "true";

    var toggleHistoryRow = function (row) {
      if (!row) return;
      var targetId = row.getAttribute("data-email-history-target");
      if (!targetId) return;
      var detail = document.getElementById(targetId);
      if (!detail) return;
      var open = detail.classList.contains("is-hidden");
      detail.classList.toggle("is-hidden", !open);
      row.setAttribute("aria-expanded", open ? "true" : "false");
    };

    root.addEventListener("click", function (event) {
      var row = event.target.closest("[data-email-history-row='true']");
      if (!row || !root.contains(row)) return;
      toggleHistoryRow(row);
    });

    root.addEventListener("keydown", function (event) {
      var row = event.target.closest("[data-email-history-row='true']");
      if (!row || !root.contains(row)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleHistoryRow(row);
    });
  };

  bindHistoryRows();

  var bindHistoryDateFilter = function () {
    if (root.dataset.emailHistoryDateFilterBound === "true") {
      return;
    }
    root.dataset.emailHistoryDateFilterBound = "true";

    var form = root.querySelector("[data-email-history-filter-form='true']");
    var input = root.querySelector("[data-email-history-date-input='true']");
    if (!form || !input) {
      return;
    }

    var submitFilter = function () {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
    };

    input.addEventListener("change", submitFilter);
    input.addEventListener("input", function () {
      // Some browsers do not fire change immediately in date pickers.
      if (!input.value || input.value.length === 10) {
        submitFilter();
      }
    });
  };

  bindHistoryDateFilter();

  var bindSettingsTabs = function () {
    var settingsRoot = root.querySelector("[data-email-settings-tabs='true']");
    if (!settingsRoot) {
      return;
    }
    if (settingsRoot.dataset.settingsTabsBound === "true") {
      return;
    }
    settingsRoot.dataset.settingsTabsBound = "true";

    var triggers = Array.prototype.slice.call(
      settingsRoot.querySelectorAll("[data-email-settings-tab-trigger]")
    );
    var panes = Array.prototype.slice.call(
      settingsRoot.querySelectorAll("[data-email-settings-tab-pane]")
    );
    if (!triggers.length || !panes.length) {
      return;
    }

    var activate = function (tabKey) {
      triggers.forEach(function (trigger) {
        var isActive = trigger.getAttribute("data-email-settings-tab-trigger") === tabKey;
        trigger.classList.toggle("is-active", isActive);
        trigger.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      panes.forEach(function (pane) {
        var isActive = pane.getAttribute("data-email-settings-tab-pane") === tabKey;
        pane.classList.toggle("is-active", isActive);
        pane.hidden = !isActive;
      });
    };

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        activate(trigger.getAttribute("data-email-settings-tab-trigger"));
      });
    });

    var initialTrigger = settingsRoot.querySelector(
      "[data-email-settings-tab-trigger].is-active"
    ) || triggers[0];
    activate(initialTrigger.getAttribute("data-email-settings-tab-trigger"));
  };

  bindSettingsTabs();

  var setupTokenInput = function (options) {
    var rootNode = options.root;
    if (!rootNode) {
      return;
    }
    var tokenField = rootNode.querySelector(options.fieldSelector);
    var tokenHidden = rootNode.querySelector(options.hiddenSelector);
    var chipsContainer = rootNode.querySelector(options.chipsSelector);
    var tokens = [];

    var normalizeValue = function (value) {
      return options.normalize ? options.normalize(value) : value;
    };

    var isValid = function (value) {
      if (!options.validate) {
        return true;
      }
      return options.validate(value);
    };

    var updateHidden = function () {
      if (tokenHidden) {
        tokenHidden.value = tokens.join(options.joiner);
      }
    };

    var removeToken = function (value) {
      tokens = tokens.filter(function (item) {
        return item !== value;
      });
      renderTokens();
    };

    var renderTokens = function () {
      if (!chipsContainer) {
        return;
      }
      chipsContainer.innerHTML = "";
      tokens.forEach(function (token) {
        var chip = document.createElement("span");
        chip.className = "op-email-email--chip";
        chip.textContent = token;

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "op-email-email--chip-remove";
        remove.textContent = "x";
        remove.addEventListener("click", function () {
          removeToken(token);
        });

        chip.appendChild(remove);
        chipsContainer.appendChild(chip);
      });
      updateHidden();
    };

    var addToken = function (value) {
      var cleaned = normalizeValue(value.trim());
      if (!cleaned) {
        return;
      }
      if (!isValid(cleaned)) {
        return;
      }
      if (tokens.indexOf(cleaned) !== -1) {
        return;
      }
      tokens.push(cleaned);
      renderTokens();
    };

    var consumeInput = function () {
      if (!tokenField) {
        return;
      }
      var value = tokenField.value;
      if (!value) {
        return;
      }
      value.split(options.splitter).forEach(function (part) {
        addToken(part);
      });
      tokenField.value = "";
    };

    var consumeIfDelimited = function () {
      if (!tokenField) {
        return;
      }
      if (options.delimiterTest.test(tokenField.value)) {
        consumeInput();
      }
    };

    if (tokenHidden && tokenHidden.value) {
      tokenHidden.value.split(options.splitter).forEach(function (part) {
        addToken(part);
      });
    }

    if (tokenField) {
      tokenField.addEventListener("keydown", function (event) {
        if (options.keys.indexOf(event.key) !== -1) {
          event.preventDefault();
          consumeInput();
        }
        if (event.key === "Backspace" && tokenField.value === "" && tokens.length) {
          removeToken(tokens[tokens.length - 1]);
        }
      });

      tokenField.addEventListener("input", function () {
        consumeIfDelimited();
      });

      tokenField.addEventListener("blur", function () {
        consumeInput();
      });

      tokenField.addEventListener("paste", function () {
        setTimeout(function () {
          consumeInput();
        }, 0);
      });
    }
  };

  setupTokenInput({
    root: root.querySelector("[data-email-sender-token-input]"),
    fieldSelector: "[data-email-sender-token-field]",
    hiddenSelector: "[data-email-sender-hidden]",
    chipsSelector: "[data-email-sender-chips]",
    splitter: /[\r\n,]+/,
    delimiterTest: /[,\n]/,
    joiner: "\n",
    keys: ["Enter", ","],
    normalize: function (value) {
      return value;
    }
  });

  var normalizeEmail = function (value) {
    return value.trim().toLowerCase();
  };
  var allMenus = [];

  var initRecipientsScope = function (scope) {
    var state = {
      emails: []
    };
    var withinScope = function (node) {
      return node.closest("[data-email-recipients-scope]") === scope;
    };
    var tokenInputs = Array.prototype.slice
      .call(scope.querySelectorAll("[data-email-token-input]"))
      .filter(withinScope);
    var hiddenInputs = Array.prototype.slice
      .call(scope.querySelectorAll("[data-email-token-hidden]"))
      .filter(withinScope);
    var menus = Array.prototype.slice
      .call(scope.querySelectorAll("[data-email-recipients-menu]"))
      .filter(withinScope);
    var toggles = Array.prototype.slice
      .call(scope.querySelectorAll("[data-email-recipients-toggle]"))
      .filter(withinScope);
    var checkboxes = Array.prototype.slice
      .call(scope.querySelectorAll("[data-email-recipient-checkbox]"))
      .filter(withinScope);

    allMenus = allMenus.concat(menus);

    var setEmails = function (emails) {
      var unique = [];
      emails.forEach(function (email) {
        var normalized = normalizeEmail(email);
        if (!normalized) {
          return;
        }
        if (unique.indexOf(normalized) === -1) {
          unique.push(normalized);
        }
      });
      state.emails = unique;
      render();
    };

    var addEmails = function (emails) {
      setEmails(state.emails.concat(emails));
    };

    var removeEmail = function (email) {
      setEmails(
        state.emails.filter(function (item) {
          return item !== normalizeEmail(email);
        })
      );
    };

    var render = function () {
      tokenInputs.forEach(function (container) {
        var chips = container.querySelector("[data-email-chips]");
        var input = container.querySelector("[data-email-token-field]");
        if (!chips) {
          return;
        }
        chips.innerHTML = "";
        state.emails.forEach(function (email) {
          var chip = document.createElement("span");
          chip.className = "op-email-email--chip";
          chip.textContent = email;

          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "op-email-email--chip-remove";
          remove.textContent = "x";
          remove.addEventListener("click", function () {
            removeEmail(email);
          });

          chip.appendChild(remove);
          chips.appendChild(chip);
        });
        if (input) {
          input.value = "";
        }
      });

      var joined = state.emails.join(", ");
      hiddenInputs.forEach(function (hidden) {
        hidden.value = joined;
      });

      checkboxes.forEach(function (checkbox) {
        var address = checkbox.getAttribute("data-email-address") || "";
        checkbox.checked = state.emails.indexOf(address.toLowerCase()) !== -1;
      });
    };

    var handleTokenInput = function (container) {
      var input = container.querySelector("[data-email-token-field]");
      if (!input) {
        return;
      }

      var consumeValue = function (value) {
        if (!value) return;
        var parts = value.split(/[,\s;]/);
        var cleaned = parts
          .map(function (part) {
            return normalizeEmail(part);
          })
          .filter(function (part) {
            return part;
          });
        if (cleaned.length) {
          addEmails(cleaned);
        }
      };

      input.addEventListener("keydown", function (event) {
        if (["Enter", ",", " "].indexOf(event.key) !== -1) {
          event.preventDefault();
          consumeValue(input.value);
          input.value = "";
        }
        if (event.key === "Backspace" && input.value === "" && state.emails.length) {
          removeEmail(state.emails[state.emails.length - 1]);
        }
      });

      input.addEventListener("blur", function () {
        consumeValue(input.value);
        input.value = "";
      });

      input.addEventListener("input", function () {
        if (/[,\s;]/.test(input.value)) {
          consumeValue(input.value);
          input.value = "";
        }
      });

      input.addEventListener("paste", function () {
        setTimeout(function () {
          consumeValue(input.value);
          input.value = "";
        }, 0);
      });
    };

    tokenInputs.forEach(function (container) {
      handleTokenInput(container);
    });

    var toggleMenu = function (menu, open) {
      if (!menu) return;
      menu.classList.toggle("is-hidden", !open);
    };

    toggles.forEach(function (toggle) {
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        var picker = toggle.closest("[data-email-recipients-picker]");
        var menu = picker ? picker.querySelector("[data-email-recipients-menu]") : null;
        if (!menu && toggle.nextElementSibling) {
          if (toggle.nextElementSibling.matches("[data-email-recipients-menu]")) {
            menu = toggle.nextElementSibling;
          }
        }
        var isOpen = menu && !menu.classList.contains("is-hidden");
        allMenus.forEach(function (otherMenu) {
          toggleMenu(otherMenu, false);
        });
        toggleMenu(menu, !isOpen);
      });
    });

    menus.forEach(function (menu) {
      menu.addEventListener("click", function (event) {
        event.stopPropagation();
      });
    });

    checkboxes.forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        var address = checkbox.getAttribute("data-email-address") || "";
        if (!address) return;
        if (checkbox.checked) {
          addEmails([address]);
        } else {
          removeEmail(address);
        }
      });
    });

    var initialEmails = [];
    hiddenInputs.forEach(function (hidden) {
      if (hidden.value) {
        hidden.value.split(/[,\s;]/).forEach(function (part) {
          initialEmails.push(part);
        });
      }
    });
    checkboxes.forEach(function (checkbox) {
      if (checkbox.checked) {
        var address = checkbox.getAttribute("data-email-address") || "";
        if (address) {
          initialEmails.push(address);
        }
      }
    });
    if (initialEmails.length) {
      setEmails(initialEmails);
    }
  };

  var scopes = Array.prototype.slice.call(
    root.querySelectorAll("[data-email-recipients-scope]")
  );
  scopes.forEach(function (scope) {
    initRecipientsScope(scope);
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-email-recipients-picker]")) {
      return;
    }
    allMenus.forEach(function (menu) {
      menu.classList.add("is-hidden");
    });
  });

  var previewButton = root.querySelector("[data-email-preview-url]");

  var templateSelector = root.querySelector("[data-email-template-selector]");
  var editorWrapper = root.querySelector("[data-email-editor]");
  var editorLock = root.querySelector("[data-email-editor-lock]");
  var templateBox = root.querySelector("[data-email-templates]");
  var templateMap = {};
  var manualBody = "";

  if (templateBox) {
    var rawTemplates = templateBox.getAttribute("data-email-templates");
    if (rawTemplates) {
      try {
        JSON.parse(rawTemplates).forEach(function (item) {
          templateMap[item.id] = item.body || "";
        });
      } catch (e) {}
    }
  }

  var setEditorValue = function (value) {
    var textarea = document.getElementById("email_body");
    if (!textarea) {
      return;
    }
    textarea.value = value;
    var event = new CustomEvent("op:ckeditor:setData", { detail: value });
    textarea.dispatchEvent(event);
  };

  var updateEditorLock = function () {
    if (!templateSelector || !editorWrapper) {
      return;
    }
    var locked = templateSelector.value && templateSelector.value.length > 0;
    if (locked) {
      var textarea = document.getElementById("email_body");
      if (textarea) {
        manualBody = textarea.value;
      }
      var templateBody = templateMap[templateSelector.value] || "";
      setEditorValue(templateBody);
    } else if (manualBody) {
      setEditorValue(manualBody);
    }
    if (locked) {
      editorWrapper.classList.add("is-locked");
    } else {
      editorWrapper.classList.remove("is-locked");
    }
    if (editorLock) {
      editorLock.style.display = locked ? "block" : "none";
    }
  };

  if (templateSelector) {
    templateSelector.addEventListener("change", updateEditorLock);
    updateEditorLock();
  }

  var recentPanel = root.querySelector("[data-email-recent]");
  var recentUrl = recentPanel ? recentPanel.getAttribute("data-email-recent-url") : "";
  var recentEmpty = recentPanel ? recentPanel.querySelector("[data-email-recent-empty]") : null;
  var recentTable = recentPanel ? recentPanel.querySelector("[data-email-recent-table]") : null;
  var recentBody = recentPanel ? recentPanel.querySelector("[data-email-recent-body]") : null;
  var sendForm = root.querySelector("form.op-email-email--form");

  function renderRecent(deliveries) {
    if (!recentPanel || !recentBody || !recentEmpty || !recentTable) return;
    if (!deliveries || deliveries.length === 0) {
      recentEmpty.textContent = "Sin envios.";
      recentEmpty.classList.remove("is-hidden");
      recentTable.classList.add("is-hidden");
      return;
    }
    recentBody.innerHTML = "";
    deliveries.forEach(function (delivery) {
      var row = document.createElement("tr");
      var subjectCell = document.createElement("td");
      subjectCell.textContent = (delivery.subject || "").toString().slice(0, 40);
      var statusCell = document.createElement("td");
      var status = document.createElement("span");
      var statusKey = (delivery.status || "").toString();
      var statusLabel = (delivery.status_label || "").toString();
      if (!statusLabel) {
        if (statusKey === "sent") {
          statusLabel = "ENVIADO";
        } else if (statusKey === "failed") {
          statusLabel = "ERROR";
        } else if (statusKey === "sending") {
          statusLabel = "ENVIANDOSE";
        } else if (statusKey === "queued") {
          statusLabel = "PENDIENTE";
        } else {
          statusLabel = statusKey ? statusKey.toUpperCase() : "";
        }
      }
      var statusClass = statusKey;
      if (statusKey === "queued" && delivery.scheduled_at) {
        statusClass = "pending";
      }
      status.className = "op-email-email--status is-" + statusClass;
      status.textContent = statusLabel;
      statusCell.appendChild(status);
      var dateCell = document.createElement("td");
      var dateValue = delivery.sent_at || delivery.created_at || "";
      if (dateValue) {
        var dateObj = new Date(dateValue);
        if (isNaN(dateObj.getTime())) {
          dateCell.textContent = dateValue;
        } else {
          var day = String(dateObj.getDate()).padStart(2, "0");
          var month = String(dateObj.getMonth() + 1).padStart(2, "0");
          var year = dateObj.getFullYear();
          var hours = String(dateObj.getHours()).padStart(2, "0");
          var minutes = String(dateObj.getMinutes()).padStart(2, "0");
          dateCell.textContent = day + "/" + month + "/" + year + " " + hours + ":" + minutes;
        }
      } else {
        dateCell.textContent = "-";
      }
      row.appendChild(subjectCell);
      row.appendChild(statusCell);
      row.appendChild(dateCell);
      recentBody.appendChild(row);
    });
    recentEmpty.classList.add("is-hidden");
    recentTable.classList.remove("is-hidden");
  }

  function loadRecent() {
    if (!recentUrl) return;
    fetch(recentUrl, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("bad response");
        return response.json();
      })
      .then(function (data) {
        renderRecent(Array.isArray(data) ? data : []);
      })
      .catch(function () {
        if (recentEmpty && recentTable) {
          recentEmpty.textContent = "Sin envios.";
          recentEmpty.classList.remove("is-hidden");
          recentTable.classList.add("is-hidden");
        }
      });
  }

  if (recentPanel) {
    loadRecent();
  }
  if (sendForm) {
    sendForm.addEventListener("turbo:submit-end", function () {
      loadRecent();
    });
  }
  if (sendForm && composePanel) {
    sendForm.addEventListener("turbo:submit-end", function (event) {
      if (event.detail && event.detail.success) {
        composePanel.classList.add("is-hidden");
      }
    });
    sendForm.addEventListener("submit", function () {
      composePanel.classList.add("is-hidden");
    });
  }
  if (recentPanel) {
    setInterval(function () {
      loadRecent();
    }, 5000);
  }

  if (previewButton) {
    previewButton.addEventListener("click", function () {
      var url = previewButton.getAttribute("data-email-preview-url");
      if (!url) {
        return;
      }

      var templateField = root.querySelector("[name='email[template_id]']");
      var subjectField = root.querySelector("[name='email[subject]']");
      var bodyField = root.querySelector("[name='email[body]']");
      var tokenField = document.querySelector("meta[name='csrf-token']");
      var templateId = templateField ? templateField.value : "";
      var subject = subjectField ? subjectField.value : "";
      var body = bodyField ? bodyField.value : "";
      var token = tokenField ? tokenField.getAttribute("content") : "";

      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token || ""
        },
        body: JSON.stringify({
          email: {
            template_id: templateId,
            subject: subject,
            body: body
          }
        })
      })
        .then(function (response) {
          return response.json();
        })
        .then(function (data) {
          var subjectEl = root.querySelector("[data-email-preview-subject]");
          var htmlEl = root.querySelector("[data-email-preview-html]");
          if (subjectEl) {
            subjectEl.textContent = data.subject || "";
          }
          if (htmlEl) {
            htmlEl.innerHTML = data.html || "";
          }
        })
        .catch(function () {});
    });
  }

  var templateForm = root.querySelector(".op-email-email--form");
  var templateEditor = root.querySelector("[data-email-template-editor]");
  var attachmentsInput = root.querySelector("[data-email-attachments-input]");
  var attachmentsList = root.querySelector("[data-email-attachments-list]");
  var selectedAttachments = [];
  if (templateEditor) {
    var modeSelect = root.querySelector("[data-email-template-mode]");
    var htmlPanel = templateEditor.querySelector("[data-email-template-html]");
    var ckeditorPanel = templateEditor.querySelector("[data-email-template-ckeditor]");
    var htmlInput = templateEditor.querySelector("[data-email-template-html-input]");
    var htmlPreview = root.querySelector("[data-email-template-html-preview-body]");
    var bodyTextarea = templateEditor.querySelector("[data-email-template-body]");
    var htmlTextarea = templateEditor.querySelector("[data-email-template-body-html]");
    var editorAttachments = ckeditorPanel ? ckeditorPanel.querySelector("[data-email-template-attachments]") : null;
    var htmlAttachments = htmlPanel ? htmlPanel.querySelector("[data-email-template-attachments]") : null;
    var htmlPreviewPanel = root.querySelector("[data-email-template-html-preview]");
    var htmlPreviewToggle = templateEditor.querySelector("[data-email-template-preview-toggle]");
    var lineNumbers = templateEditor.querySelector("[data-email-template-line-numbers]");
    var templateAttachmentsInputs = templateEditor.querySelectorAll("[data-email-template-attachments]");
    var templateAttachmentsLists = templateEditor.querySelectorAll("[data-email-template-attachments-list]");
    var templateSelectedAttachments = [];
    var templateTokens = root.querySelectorAll("[data-email-template-token]");

    var insertTemplateToken = function (tokenText, target) {
      if (!target || !tokenText) {
        return;
      }
      var start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      var end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      var value = target.value || "";
      target.value = value.slice(0, start) + tokenText + value.slice(end);
      var cursor = start + tokenText.length;
      if (typeof target.selectionStart === "number") {
        target.selectionStart = cursor;
        target.selectionEnd = cursor;
      }
      target.focus();
    };

    var currentTemplateTarget = function () {
      var mode = modeSelect ? modeSelect.value : "editor";
      if (mode === "html") {
        return htmlTextarea || htmlInput;
      }
      return bodyTextarea;
    };

    if (templateTokens && templateTokens.length) {
      Array.prototype.forEach.call(templateTokens, function (chip) {
        var tokenText = chip.getAttribute("data-email-template-token") || "";
        chip.addEventListener("click", function () {
          insertTemplateToken(tokenText, currentTemplateTarget());
          updateLineNumbers();
        });
        chip.addEventListener("dragstart", function (event) {
          if (!event.dataTransfer) return;
          event.dataTransfer.setData("text/plain", tokenText);
        });
      });
    }

    var attachTokenDrop = function (target) {
      if (!target) return;
      target.addEventListener("dragover", function (event) {
        event.preventDefault();
      });
      target.addEventListener("drop", function (event) {
        event.preventDefault();
        var tokenText = event.dataTransfer ? event.dataTransfer.getData("text/plain") : "";
        insertTemplateToken(tokenText, target);
        updateLineNumbers();
      });
    };

    attachTokenDrop(bodyTextarea);
    attachTokenDrop(htmlTextarea || htmlInput);

    var updateLineNumbers = function () {
      if (!htmlInput || !lineNumbers) {
        return;
      }
      var lines = htmlInput.value.split("\n").length || 1;
      var content = [];
      for (var i = 1; i <= lines; i += 1) {
        content.push(i.toString());
      }
      lineNumbers.textContent = content.join("\n");
    };

    var updateTemplateMode = function () {
      var mode = modeSelect ? modeSelect.value : "editor";
      if (mode === "html") {
        templateEditor.classList.add("is-html");
        if (bodyTextarea) {
          bodyTextarea.setAttribute("disabled", "disabled");
        }
        if (editorAttachments) {
          editorAttachments.setAttribute("disabled", "disabled");
        }
        if (htmlTextarea) {
          htmlTextarea.removeAttribute("disabled");
        }
        if (htmlAttachments) {
          htmlAttachments.removeAttribute("disabled");
        }
      } else {
        templateEditor.classList.remove("is-html");
        if (htmlTextarea) {
          htmlTextarea.setAttribute("disabled", "disabled");
        }
        if (htmlAttachments) {
          htmlAttachments.setAttribute("disabled", "disabled");
        }
        if (bodyTextarea) {
          bodyTextarea.removeAttribute("disabled");
        }
        if (editorAttachments) {
          editorAttachments.removeAttribute("disabled");
        }
      }
      if (htmlPreviewToggle) {
        if (mode === "html") {
          htmlPreviewToggle.removeAttribute("disabled");
        } else {
          htmlPreviewToggle.setAttribute("disabled", "disabled");
          htmlPreviewToggle.checked = false;
          if (htmlPreviewPanel) htmlPreviewPanel.classList.add("is-hidden");
        }
      }
    };

    var updateHtmlPreview = function () {
      if (!htmlInput || !htmlPreview) {
        return;
      }
      htmlPreview.innerHTML = htmlInput.value || "";
    };

    var updateTemplateAttachmentsInput = function () {
      if (!templateAttachmentsInputs || templateAttachmentsInputs.length === 0) {
        return;
      }
      if (typeof DataTransfer === "undefined") {
        return;
      }
      var dataTransfer = new DataTransfer();
      templateSelectedAttachments.forEach(function (file) {
        dataTransfer.items.add(file);
      });
      templateAttachmentsInputs.forEach(function (input) {
        input.files = dataTransfer.files;
      });
    };

    var renderTemplateAttachmentsList = function () {
      if (!templateAttachmentsLists || templateAttachmentsLists.length === 0) {
        return;
      }
      templateAttachmentsLists.forEach(function (list) {
        list.innerHTML = "";
        templateSelectedAttachments.forEach(function (file, index) {
          var item = document.createElement("div");
          item.className = "op-email-email--attachments-item";

          var name = document.createElement("span");
          name.textContent = file.name;
          item.appendChild(name);

          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "op-email-email--chip-remove";
          remove.textContent = "🗑";
          remove.setAttribute("aria-label", "Eliminar adjunto");
          remove.addEventListener("click", function () {
            templateSelectedAttachments.splice(index, 1);
            updateTemplateAttachmentsInput();
            renderTemplateAttachmentsList();
          });

          item.appendChild(remove);
          list.appendChild(item);
        });
      });
    };

    var addTemplateAttachments = function (files) {
      if (!files || !files.length) {
        return;
      }
      Array.prototype.forEach.call(files, function (file) {
        var exists = templateSelectedAttachments.some(function (existing) {
          return (
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
          );
        });
        if (!exists) {
          templateSelectedAttachments.push(file);
        }
      });
      updateTemplateAttachmentsInput();
      renderTemplateAttachmentsList();
    };

    if (modeSelect) {
      console.log("[EmailTemplate] mode select found");
      modeSelect.addEventListener("change", function () {
        console.log("[EmailTemplate] mode change", modeSelect.value);
        updateTemplateMode();
      });
      modeSelect.addEventListener("input", function () {
        console.log("[EmailTemplate] mode input", modeSelect.value);
        updateTemplateMode();
      });
      updateTemplateMode();
    } else {
      console.log("[EmailTemplate] mode select missing");
    }

    if (htmlPreviewToggle) {
      htmlPreviewToggle.addEventListener("change", function () {
        if (!htmlPreviewPanel) return;
        htmlPreviewPanel.classList.toggle("is-hidden", !htmlPreviewToggle.checked);
        var split = htmlPreviewToggle.closest(".op-email-email--split");
        if (split) {
          split.classList.toggle("is-preview-open", htmlPreviewToggle.checked);
        }
        if (htmlPreviewToggle.checked) {
          updateHtmlPreview();
        }
      });
    }

    if (htmlInput) {
      htmlInput.addEventListener("input", function () {
        if (!htmlPreviewToggle || htmlPreviewToggle.checked) {
          updateHtmlPreview();
        }
      });
      htmlInput.addEventListener("input", updateLineNumbers);
      htmlInput.addEventListener("scroll", function () {
        if (lineNumbers) {
          lineNumbers.scrollTop = htmlInput.scrollTop;
        }
      });
      if (!htmlPreviewToggle || htmlPreviewToggle.checked) {
        updateHtmlPreview();
      }
      updateLineNumbers();
    }

    if (templateAttachmentsInputs && templateAttachmentsInputs.length) {
      templateAttachmentsInputs.forEach(function (input) {
        input.addEventListener("change", function (event) {
          addTemplateAttachments(event.target.files);
        });
      });
    }
  }

  var composeButton = root.querySelector("[data-email-compose]");
  var composePanel = root.querySelector("[data-email-compose-panel]");
  var composeClose = root.querySelector("[data-email-compose-close]");
  var templateSelect = root.querySelector("[data-email-template-selector]");
  var sendButton = root.querySelector("[data-email-send-button]");
  var composeSendButton = root.querySelector("[data-email-compose-send]");

  function setComposeEnabled(enabled) {
    if (!composeButton) return;
    if (enabled) {
      composeButton.removeAttribute("disabled");
      composeButton.classList.remove("is-disabled");
    } else {
      composeButton.setAttribute("disabled", "disabled");
      composeButton.classList.add("is-disabled");
    }
  }

  function setSendEnabled(enabled) {
    if (!sendButton) return;
    if (enabled) {
      sendButton.removeAttribute("disabled");
      sendButton.classList.remove("is-disabled");
    } else {
      sendButton.setAttribute("disabled", "disabled");
      sendButton.classList.add("is-disabled");
    }
  }

  function updateComposeState() {
    if (!templateSelect) return;
    var value = templateSelect.value || "";
    setComposeEnabled(value === "");
    setSendEnabled(value !== "");
  }

  if (composeButton && composePanel) {
    composeButton.addEventListener("click", function () {
      if (composeButton.hasAttribute("disabled")) return;
      composePanel.classList.remove("is-hidden");
    });
  }
  if (composeClose && composePanel) {
    composeClose.addEventListener("click", function () {
      composePanel.classList.add("is-hidden");
    });
  }
  if (templateSelect) {
    templateSelect.addEventListener("change", updateComposeState);
    updateComposeState();
  }
  if (composeSendButton && sendForm) {
    composeSendButton.addEventListener("click", function () {
      if (composeSendButton.hasAttribute("disabled")) return;
      if (composePanel) {
        composePanel.classList.add("is-hidden");
      }
    });
  }

  var updateAttachmentsInput = function () {
    if (!attachmentsInput) {
      return;
    }
    if (typeof DataTransfer === "undefined") {
      return;
    }
    var dataTransfer = new DataTransfer();
    selectedAttachments.forEach(function (file) {
      dataTransfer.items.add(file);
    });
    attachmentsInput.files = dataTransfer.files;
  };

  var renderAttachmentsList = function () {
    if (!attachmentsList) {
      return;
    }
    attachmentsList.innerHTML = "";
    selectedAttachments.forEach(function (file, index) {
      var item = document.createElement("div");
      item.className = "op-email-email--attachments-item";

      var name = document.createElement("span");
      name.textContent = file.name;
      item.appendChild(name);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "op-email-email--chip-remove";
      remove.textContent = "🗑";
      remove.setAttribute("aria-label", "Eliminar adjunto");
      remove.addEventListener("click", function () {
        selectedAttachments.splice(index, 1);
        updateAttachmentsInput();
        renderAttachmentsList();
      });

      item.appendChild(remove);
      attachmentsList.appendChild(item);
    });
  };

  var addAttachments = function (files) {
    if (!files || !files.length) {
      return;
    }
    Array.prototype.forEach.call(files, function (file) {
      var exists = selectedAttachments.some(function (existing) {
        return (
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
        );
      });
      if (!exists) {
        selectedAttachments.push(file);
      }
    });
    updateAttachmentsInput();
    renderAttachmentsList();
  };

  if (attachmentsInput) {
    attachmentsInput.addEventListener("change", function (event) {
      addAttachments(event.target.files);
    });
  }
};

document.addEventListener("DOMContentLoaded", initEmailModule);
document.addEventListener("turbo:load", initEmailModule);
