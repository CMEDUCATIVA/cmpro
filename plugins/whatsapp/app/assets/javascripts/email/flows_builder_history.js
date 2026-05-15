/* eslint-disable no-var, prefer-arrow-callback */
(function () {
  if (typeof FlowBuilder === "undefined") return;

  FlowBuilder.prototype.renderWhatsappHistory = function (node, data) {
    if (!this.propertiesBody || !node) return;
    var self = this;

    var historyTitle = document.createElement("div");
    historyTitle.className = "op-email-email--flow-webhook-history-title";
    var historyTitleText = document.createElement("span");
    historyTitleText.textContent = "Historial";
    var historyClear = document.createElement("button");
    historyClear.type = "button";
    historyClear.className = "op-email-email--flow-history-clear";
    historyClear.setAttribute("title", "Limpiar historial");
    historyClear.innerHTML =
      '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">' +
      '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/>' +
      "</svg>";
    historyClear.addEventListener("click", function (event) {
      event.stopPropagation();
      if (!confirm("Limpiar historial del nodo?")) return;
      self.clearNodeHistory(node.id, "webhook_input");
    });
    historyTitle.appendChild(historyTitleText);
    historyTitle.appendChild(historyClear);
    self.propertiesBody.appendChild(historyTitle);

    var historyList = document.createElement("div");
    historyList.className = "op-email-email--flow-webhook-history-list";
    var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
    if (!historyItems.length && self.nodeHistories) {
      var keys = Object.keys(self.nodeHistories || {});
      var nodeId = (node.id || "").toString();
      var matchedKey = keys.find(function (key) {
        return key === nodeId || key.indexOf(nodeId) !== -1 || nodeId.indexOf(key) !== -1;
      });
      if (matchedKey) {
        historyItems = self.nodeHistories[matchedKey] || [];
      }
      if (!historyItems.length && data && data.template_id) {
        var templateId = String(data.template_id);
        var collected = [];
        keys.forEach(function (key) {
          var list = self.nodeHistories[key] || [];
          list.forEach(function (entry) {
            var entryMeta = entry && entry.meta ? entry.meta : {};
            if (entryMeta && String(entryMeta.template_id) === templateId) {
              collected.push(entry);
            }
          });
        });
        if (collected.length) {
          historyItems = collected;
        }
      }
    }

    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Flows] whatsapp history", {
        node_id: node.id,
        template_id: data && data.template_id,
        count: historyItems.length,
        keys: self.nodeHistories ? Object.keys(self.nodeHistories) : []
      });
    }

    if (!historyItems.length) {
      var emptyHistory = document.createElement("div");
      emptyHistory.className = "op-email-email--flow-webhook-history-item";
      emptyHistory.textContent = "Sin eventos";
      historyList.appendChild(emptyHistory);
    } else {
      historyItems.forEach(function (itemData) {
        var item = document.createElement("div");
        item.className = "op-email-email--flow-webhook-history-item";
        var whenValue = itemData.finished_at || itemData.received_at || itemData.created_at;
        var whenText = "Sin fecha";
        if (whenValue && whenValue !== "Invalid Date") {
          var whenDate = new Date(whenValue);
          if (!isNaN(whenDate.getTime())) {
            whenText = whenDate.toLocaleString();
          }
        }
        var status = (itemData.status || "").toString().trim().toLowerCase();
        var statusText =
          status === "queued" ? "En cola..." :
          status === "processed" ? "Procesado" :
          status === "received" ? "Recibido" :
          status === "no_contact" ? "Sin contacto" :
          (itemData.status || "");
        var isOk = false;
        var isError = false;
        var labelText = "";
        var meta = itemData.meta || {};
        var isReprogrammed = meta && (meta.reprogrammed_from && meta.reprogrammed_to);
        if (status === "processed") {
          isOk = true;
          labelText = "Procesado";
        } else if (status === "finished") {
          isOk = true;
          labelText = "Procesado";
        } else if (status === "failed") {
          isError = true;
        }

        var header = document.createElement("button");
        header.type = "button";
        header.className = "op-email-email--flow-webhook-history-header";
        var headerLeft = document.createElement("div");
        headerLeft.className = "op-email-email--flow-webhook-history-left";
        var statusWrap = document.createElement("span");
        statusWrap.className = "op-email-email--flow-webhook-history-status";
        var statusLabel = document.createElement("span");
        var iconWrap = null;
        if (isOk) {
          statusWrap.classList.add("is-ok");
          iconWrap = document.createElement("span");
          iconWrap.className = "op-email-email--flow-webhook-history-icon";
          iconWrap.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
            '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm13.707-1.293a1 1 0 0 0-1.414-1.414L11 12.586l-1.793-1.793a1 1 0 0 0-1.414 1.414l2.5 2.5a1 1 0 0 0 1.414 0l4-4Z" clip-rule="evenodd"/>' +
            "</svg>";
        } else if (isError) {
          statusWrap.classList.add("is-error");
          iconWrap = document.createElement("span");
          iconWrap.className = "op-email-email--flow-webhook-history-icon";
          iconWrap.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
            '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm7.707-3.707a1 1 0 0 0-1.414 1.414L10.586 12l-2.293 2.293a1 1 0 1 0 1.414 1.414L12 13.414l2.293 2.293a1 1 0 0 0 1.414-1.414L13.414 12l2.293-2.293a1 1 0 0 0-1.414-1.414L12 10.586 9.707 8.293Z" clip-rule="evenodd"/>' +
            "</svg>";
        }
        if (isReprogrammed) {
          labelText = "Reprogramado";
        }
        statusLabel.textContent = labelText || statusText;
        if (iconWrap) statusWrap.appendChild(iconWrap);
        statusWrap.appendChild(statusLabel);

        var whenLabel = document.createElement("span");
        whenLabel.className = "op-email-email--flow-webhook-history-when";
        whenLabel.textContent = whenText;

        headerLeft.appendChild(whenLabel);
        headerLeft.appendChild(statusWrap);
        var chevron = document.createElement("span");
        chevron.className = "op-email-email--flow-webhook-history-chevron";
        chevron.innerHTML = "&#8250;";
        header.appendChild(headerLeft);
        header.appendChild(chevron);

        var body = document.createElement("div");
        body.className = "op-email-email--flow-webhook-history-body";
        var details = [];
        if (meta.template_name) details.push("Plantilla: " + meta.template_name);
        if (meta.template_type) details.push("Tipo: " + meta.template_type);
        if (meta.file_name) details.push("Archivo: " + meta.file_name);
        if (meta.message) details.push("Mensaje: " + meta.message);
        if (meta.chat_id_used) details.push("Chat usado: " + meta.chat_id_used);
        if (meta.typing) {
          var delay = meta.typing_delay ? meta.typing_delay + "s" : "3s";
          details.push("Escribiendo: " + delay);
        }
        if (itemData.error) details.push("Error: " + itemData.error);
        details.forEach(function (line) {
          var div = document.createElement("div");
          div.textContent = line;
          body.appendChild(div);
        });

        header.addEventListener("click", function () {
          item.classList.toggle("is-open");
        });

        item.appendChild(header);
        item.appendChild(body);
        historyList.appendChild(item);
      });
    }
    self.propertiesBody.appendChild(historyList);
  };

  FlowBuilder.prototype.renderWebhookHistory = function (node, endpoint) {
    if (!this.propertiesBody || !node) return;
    var self = this;

    var historyTitle = document.createElement("div");
    historyTitle.className = "op-email-email--flow-webhook-history-title";
    var historyTitleText = document.createElement("span");
    historyTitleText.textContent = "Historial";
    historyTitle.appendChild(historyTitleText);
    self.propertiesBody.appendChild(historyTitle);

    var historyList = document.createElement("div");
    historyList.className = "op-email-email--flow-webhook-history-list";
    var historyItems = [];
    if (endpoint && Array.isArray(endpoint.events)) {
      historyItems = endpoint.events.slice();
    } else if (self.nodeHistories && self.nodeHistories[node.id]) {
      historyItems = self.nodeHistories[node.id];
    }
    if (!historyItems.length && self.nodeHistories && node.type === "delay") {
      var keys = Object.keys(self.nodeHistories || {});
      var nodeId = (node.id || "").toString();
      var matchedKey = keys.find(function (key) {
        return key === nodeId || key.indexOf(nodeId) !== -1 || nodeId.indexOf(key) !== -1;
      });
      if (!matchedKey && nodeId) {
        matchedKey = keys.find(function (key) { return key.endsWith(nodeId) || nodeId.endsWith(key); });
      }
      if (matchedKey) {
        historyItems = self.nodeHistories[matchedKey] || [];
      } else {
        var delayKeys = keys.filter(function (key) { return key.indexOf("delay_") === 0; });
        if (delayKeys.length === 1) {
          historyItems = self.nodeHistories[delayKeys[0]] || [];
        } else if (delayKeys.length > 1) {
          historyItems = [];
          delayKeys.forEach(function (key) {
            var list = self.nodeHistories[key] || [];
            historyItems = historyItems.concat(list);
          });
        }
      }
    }
    if (!historyItems.length) {
      var emptyHistory = document.createElement("div");
      emptyHistory.className = "op-email-email--flow-webhook-history-item";
      emptyHistory.textContent = "Sin eventos";
      historyList.appendChild(emptyHistory);
    } else {
      historyItems.forEach(function (itemData) {
        var item = document.createElement("div");
        item.className = "op-email-email--flow-webhook-history-item";
        var whenValue = itemData.finished_at || itemData.received_at || itemData.created_at;
        var whenText = "Sin fecha";
        if (whenValue && whenValue !== "Invalid Date") {
          var whenDate = new Date(whenValue);
          if (!isNaN(whenDate.getTime())) {
            whenText = whenDate.toLocaleString();
          }
        }
        var status = itemData.status || "";
        var statusText =
          status === "queued" ? "En cola..." :
          status === "processed" ? "Procesado" :
          status === "received" ? "Recibido" :
          status === "no_contact" ? "Sin contacto" :
          status;
        var isOk = false;
        var isError = false;
        var labelText = "";
        var meta = itemData.meta || {};
        var payload = itemData.payload || meta.payload;
        var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
        if (status === "finished") {
          isOk = true;
          labelText = "Procesado";
        } else if (status === "failed") {
          isError = true;
        }

        var header = document.createElement("button");
        header.type = "button";
        header.className = "op-email-email--flow-webhook-history-header";
        var headerLeft = document.createElement("div");
        headerLeft.className = "op-email-email--flow-webhook-history-left";
        var statusWrap = document.createElement("span");
        statusWrap.className = "op-email-email--flow-webhook-history-status";
        if (isOk) {
          statusWrap.classList.add("is-ok");
          statusWrap.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
            '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm13.707-1.293a1 1 0 0 0-1.414-1.414L11 12.586l-1.793-1.793a1 1 0 0 0-1.414 1.414l2.5 2.5a1 1 0 0 0 1.414 0l4-4Z" clip-rule="evenodd"/>' +
            "</svg>";
        } else if (isError) {
          statusWrap.classList.add("is-error");
          statusWrap.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
            '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm7.707-3.707a1 1 0 0 0-1.414 1.414L10.586 12l-2.293 2.293a1 1 0 1 0 1.414 1.414L12 13.414l2.293 2.293a1 1 0 0 0 1.414-1.414L13.414 12l2.293-2.293a1 1 0 0 0-1.414-1.414L12 10.586 9.707 8.293Z" clip-rule="evenodd"/>' +
            "</svg>";
        }

        var statusLabel = document.createElement("span");
        if (isReprogrammed) {
          labelText = "Reprogramado";
        }
        statusLabel.textContent = labelText || statusText;
        statusWrap.appendChild(statusLabel);

        var whenLabel = document.createElement("span");
        whenLabel.className = "op-email-email--flow-webhook-history-when";
        whenLabel.textContent = whenText;

        headerLeft.appendChild(whenLabel);
        headerLeft.appendChild(statusWrap);
        var chevron = document.createElement("span");
        chevron.className = "op-email-email--flow-webhook-history-chevron";
        chevron.innerHTML = "&#8250;";
        header.appendChild(headerLeft);
        header.appendChild(chevron);

        var body = document.createElement("div");
        body.className = "op-email-email--flow-webhook-history-body";
        var details = [];
        if (itemData.contact_id) details.push("Contacto ID: " + itemData.contact_id);
        if (itemData.result_path) details.push("Salida: " + itemData.result_path);
        if (meta.delay_until) {
          var whenDelay = document.createElement("div");
          var delayDate = new Date(meta.delay_until);
          var delayText = isNaN(delayDate.getTime()) ? meta.delay_until : delayDate.toLocaleString();
          whenDelay.textContent = "Programado: " + delayText;
          body.appendChild(whenDelay);
        }
        if (meta.night_adjusted) {
          var nightLine = document.createElement("div");
          var nightHours = meta.night_adjust_hours ? meta.night_adjust_hours : 12;
          nightLine.textContent = "Ajustado por madrugada: +" + nightHours + "h";
          body.appendChild(nightLine);
        }
        if (meta.reprogrammed_from && meta.reprogrammed_to) {
          var fromDate = new Date(meta.reprogrammed_from);
          var toDate = new Date(meta.reprogrammed_to);
          var fromText = isNaN(fromDate.getTime()) ? meta.reprogrammed_from : fromDate.toLocaleString();
          var toText = isNaN(toDate.getTime()) ? meta.reprogrammed_to : toDate.toLocaleString();
          var reproLine = document.createElement("div");
          reproLine.textContent = "Reprogramado: " + fromText + " -> " + toText;
          body.appendChild(reproLine);
        }
        if (payload) details.push("Payload: " + JSON.stringify(payload));
        if (itemData.error) details.push("Error: " + itemData.error);
        if (!details.length && !body.childNodes.length) {
          details.push("Sin detalles.");
        }
        details.forEach(function (line) {
          var div = document.createElement("div");
          div.textContent = line;
          body.appendChild(div);
        });

        header.addEventListener("click", function () {
          item.classList.toggle("is-open");
        });

        item.appendChild(header);
        item.appendChild(body);
        historyList.appendChild(item);
      });
    }
    self.propertiesBody.appendChild(historyList);
  };

  FlowBuilder.prototype.renderTransformJsonHistory = function (node) {
    if (!this.propertiesBody || !node) return;
    var self = this;

    var historyTitle = document.createElement("div");
    historyTitle.className = "op-email-email--flow-webhook-history-title";
    var historyTitleText = document.createElement("span");
    historyTitleText.textContent = "Historial";
    var historyClear = document.createElement("button");
    historyClear.type = "button";
    historyClear.className = "op-email-email--flow-history-clear";
    historyClear.setAttribute("title", "Limpiar historial");
    historyClear.innerHTML =
      '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">' +
      '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/>' +
      "</svg>";
    historyClear.addEventListener("click", function (event) {
      event.stopPropagation();
      if (!confirm("Limpiar historial del nodo?")) return;
      self.clearNodeHistory(node.id, "transform_json");
    });
    historyTitle.appendChild(historyTitleText);
    historyTitle.appendChild(historyClear);
    self.propertiesBody.appendChild(historyTitle);

    var historyList = document.createElement("div");
    historyList.className = "op-email-email--flow-webhook-history-list";
    var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
    if (!historyItems.length) {
      var emptyHistory = document.createElement("div");
      emptyHistory.className = "op-email-email--flow-webhook-history-item";
      emptyHistory.textContent = "Sin eventos";
      historyList.appendChild(emptyHistory);
    } else {
      historyItems.forEach(function (itemData) {
        var item = document.createElement("div");
        item.className = "op-email-email--flow-webhook-history-item";
        var whenValue = itemData.finished_at || itemData.received_at || itemData.created_at;
        var whenText = "Sin fecha";
        if (whenValue && whenValue !== "Invalid Date") {
          var whenDate = new Date(whenValue);
          if (!isNaN(whenDate.getTime())) {
            whenText = whenDate.toLocaleString();
          }
        }
        var status = (itemData.status || "").toString().trim().toLowerCase();
        var statusText =
          status === "queued" ? "En cola..." :
          status === "processed" ? "Procesado" :
          status === "received" ? "Recibido" :
          status === "no_contact" ? "Sin contacto" :
          (itemData.status || "");
        var resultPath = itemData.result_path || "";
        var isOk = false;
        var isError = false;
        var labelText = "";

        var meta = itemData.meta || {};
        if (status === "finished") {
          isOk = true;
          if (meta && meta.restored_contact) {
            labelText = "Reactivado";
          } else if (resultPath === "yes") {
            labelText = "Nuevo";
          } else if (resultPath === "no") {
            labelText = "Duplicado";
          }
        } else if (status === "processed") {
          isOk = true;
          labelText = "Procesado";
        } else if (status === "failed") {
          isError = true;
          labelText = meta && meta.skipped === "no_mappings" ? "Faltan mapeos" : "Error";
        }

        var header = document.createElement("button");
        header.type = "button";
        header.className = "op-email-email--flow-webhook-history-header";
        var headerLeft = document.createElement("div");
        headerLeft.className = "op-email-email--flow-webhook-history-left";
        var statusWrap = document.createElement("span");
        statusWrap.className = "op-email-email--flow-webhook-history-status";
        if (isOk) {
          statusWrap.classList.add("is-ok");
          statusWrap.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
            '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm13.707-1.293a1 1 0 0 0-1.414-1.414L11 12.586l-1.793-1.793a1 1 0 0 0-1.414 1.414l2.5 2.5a1 1 0 0 0 1.414 0l4-4Z" clip-rule="evenodd"/>' +
            "</svg>";
        } else if (isError) {
          statusWrap.classList.add("is-error");
          statusWrap.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
            '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm7.707-3.707a1 1 0 0 0-1.414 1.414L10.586 12l-2.293 2.293a1 1 0 1 0 1.414 1.414L12 13.414l2.293 2.293a1 1 0 0 0 1.414-1.414L13.414 12l2.293-2.293a1 1 0 0 0-1.414-1.414L12 10.586 9.707 8.293Z" clip-rule="evenodd"/>' +
            "</svg>";
        }

        var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
        var statusLabel = document.createElement("span");
        if (isReprogrammed) {
          labelText = "Reprogramado";
        }
        statusLabel.textContent = labelText || statusText;
        statusWrap.appendChild(statusLabel);

        var whenLabel = document.createElement("span");
        whenLabel.className = "op-email-email--flow-webhook-history-when";
        whenLabel.textContent = whenText;

        headerLeft.appendChild(whenLabel);
        headerLeft.appendChild(statusWrap);
        var chevron = document.createElement("span");
        chevron.className = "op-email-email--flow-webhook-history-chevron";
        chevron.innerHTML = "&#8250;";
        header.appendChild(headerLeft);
        header.appendChild(chevron);

        var body = document.createElement("div");
        body.className = "op-email-email--flow-webhook-history-body";
        var details = [];
        details.push("Contacto ID: " + (itemData.contact_id || "N/A"));
        if (meta.restored_contact) details.push("Contacto reactivado");
        if (meta.created_contact) details.push("Contacto creado");
        if (meta.updated_fields && meta.updated_fields.length) details.push("Campos: " + meta.updated_fields.join(", "));
        if (meta.updated_values) {
          var valueKeys = Object.keys(meta.updated_values);
          if (valueKeys.length) {
            var valuePairs = valueKeys.map(function (key) {
              return key + "=" + String(meta.updated_values[key]);
            });
            details.push("Valores: " + valuePairs.join(", "));
          }
        }
        if (meta.updated_custom_fields && meta.updated_custom_fields.length) details.push("Custom: " + meta.updated_custom_fields.join(", "));
        if (meta.updated_custom_values) {
          var customKeys = Object.keys(meta.updated_custom_values);
          if (customKeys.length) {
            var customPairs = customKeys.map(function (key) {
              return key + "=" + String(meta.updated_custom_values[key]);
            });
            details.push("Valores custom: " + customPairs.join(", "));
          }
        }
        if (meta.chat_created) details.push("WhatsAppChat creado");
        if (meta.chat_linked) details.push("WhatsAppChat vinculado");
        if (meta.chat_bumped) details.push("WhatsAppChat actualizado");
        if (meta.work_package_type_name) details.push("Tipo tarea: " + meta.work_package_type_name);
        if (meta.work_package_type_id && !meta.work_package_type_name) details.push("Tipo tarea: " + meta.work_package_type_id);
        if (meta.work_package_id) details.push("Paquete ID: " + meta.work_package_id);
        if (meta.work_package_subject) details.push("Asunto: " + meta.work_package_subject);
        if (meta.board_name) details.push("Tablero: " + meta.board_name);
        if (meta.list_name) details.push("Lista: " + meta.list_name);
        if (meta.board_error) details.push("Tablero aviso: " + meta.board_error);
        if (meta.crm_tag_name) details.push("Etiqueta: " + meta.crm_tag_name);
        if (meta.tags) details.push("Etiquetas contacto: " + meta.tags);
        if (meta.tag_error) details.push("Etiqueta aviso: " + meta.tag_error);
        if (meta.assigned_to_name) details.push("Responsable: " + meta.assigned_to_name);
        if (meta.assigned_to_id && !meta.assigned_to_name) details.push("Responsable ID: " + meta.assigned_to_id);
        if (itemData.error) details.push("Error: " + itemData.error);

        var resultTitle = document.createElement("div");
        resultTitle.className = "op-email-email--flow-history-title";
        resultTitle.textContent = "Resultado";
        body.appendChild(resultTitle);

        var pre = document.createElement("pre");
        pre.textContent = details.join("\n");
        body.appendChild(pre);

        if (meta.payload) {
          var payloadText;
          try {
            payloadText = JSON.stringify(meta.payload, null, 2);
          } catch (error) {
            payloadText = String(meta.payload);
          }

          var payloadToggle = document.createElement("button");
          payloadToggle.type = "button";
          payloadToggle.className = "op-email-email--flow-history-toggle";
          payloadToggle.textContent = "Ver payload";
          body.appendChild(payloadToggle);

          var payloadTitle = document.createElement("div");
          payloadTitle.className = "op-email-email--flow-history-title is-hidden";
          payloadTitle.textContent = "Payload";
          body.appendChild(payloadTitle);

          var payloadPre = document.createElement("pre");
          payloadPre.className = "op-email-email--flow-payload-body is-hidden";
          payloadPre.textContent = payloadText;
          body.appendChild(payloadPre);

          payloadToggle.addEventListener("click", function () {
            var isHidden = payloadPre.classList.contains("is-hidden");
            payloadPre.classList.toggle("is-hidden", !isHidden);
            payloadTitle.classList.toggle("is-hidden", !isHidden);
            payloadToggle.textContent = isHidden ? "Ocultar payload" : "Ver payload";
          });
        }

        header.addEventListener("click", function () {
          item.classList.toggle("is-open");
        });

        item.appendChild(header);
        item.appendChild(body);
        historyList.appendChild(item);
      });
    }
    self.propertiesBody.appendChild(historyList);
  };

  function safeDate(value) {
    if (!value) return "Sin fecha";
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function statusLabel(status) {
    var value = (status || "").toString().toLowerCase();
    if (value === "running") return "En progreso";
    if (value === "queued") return "En cola";
    if (value === "finished") return "Finalizado";
    if (value === "failed") return "Fallido";
    return status || "--";
  }

  function itemSummaryText(item) {
    var meta = item && item.result_meta ? item.result_meta : {};
    var parts = [];
    if (item.node_id) parts.push("Nodo: " + item.node_id);
    if (item.status) parts.push("Estado: " + statusLabel(item.status));
    if (item.result_path) parts.push("Salida: " + item.result_path);
    if (meta.delay_until) parts.push("Programado: " + safeDate(meta.delay_until));
    if (item.error) parts.push("Error: " + item.error);
    if (!parts.length) parts.push("Sin detalles");
    return parts.join(" | ");
  }

  function renderExecutionDetail(host, payload) {
    host.innerHTML = "";
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
      var empty = document.createElement("div");
      empty.className = "op-email-email--flow-history-empty";
      empty.textContent = "Sin trazabilidad en esta ejecucion.";
      host.appendChild(empty);
      return;
    }
    var list = document.createElement("div");
    list.className = "op-email-email--flow-history-detail-list";
    payload.items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "op-email-email--flow-history-detail-item";
      var top = document.createElement("div");
      top.className = "op-email-email--flow-history-detail-top";
      top.textContent = safeDate(item.finished_at || item.started_at || item.created_at);
      var body = document.createElement("div");
      body.className = "op-email-email--flow-history-detail-body";
      body.textContent = itemSummaryText(item);
      row.appendChild(top);
      row.appendChild(body);
      list.appendChild(row);
    });
    host.appendChild(list);
  }

  function renderExecutionList(container, executions, url) {
    container.innerHTML = "";
    if (!Array.isArray(executions) || !executions.length) {
      var empty = document.createElement("div");
      empty.className = "op-email-email--flow-history-empty";
      empty.textContent = "Sin ejecuciones.";
      container.appendChild(empty);
      return;
    }
    executions.forEach(function (execution) {
      var row = document.createElement("div");
      row.className = "op-email-email--flow-history-item";

      var header = document.createElement("button");
      header.type = "button";
      header.className = "op-email-email--flow-history-item-header";
      header.innerHTML =
        '<span class="op-email-email--flow-history-flow-name">' + (execution.flow_name || ("Flujo " + execution.flow_id)) + "</span>" +
        '<span class="op-email-email--flow-history-item-meta">' +
          safeDate(execution.started_at || execution.created_at) +
          " • " + statusLabel(execution.status) +
          " • " + (execution.finished || 0) + "/" + (execution.total || 0) +
        "</span>";

      var body = document.createElement("div");
      body.className = "op-email-email--flow-history-item-body";
      body.innerHTML =
        '<div class="op-email-email--flow-history-counters">' +
          '<span>Finalizados: ' + (execution.finished || 0) + "</span>" +
          '<span>Pendientes: ' + ((execution.queued || 0) + (execution.running || 0)) + "</span>" +
          '<span>Fallidos: ' + (execution.failed || 0) + "</span>" +
          '<span>Omitidos: ' + (execution.skipped || 0) + "</span>" +
        "</div>";
      var detailHost = document.createElement("div");
      detailHost.className = "op-email-email--flow-history-detail-host";
      body.appendChild(detailHost);

      header.addEventListener("click", function () {
        var open = row.classList.contains("is-open");
        row.classList.toggle("is-open", !open);
        if (open || row.dataset.loaded === "true") return;
        fetch(url + "?run_id=" + encodeURIComponent(execution.id), { headers: { "Accept": "application/json" } })
          .then(function (response) { return response.json(); })
          .then(function (payload) {
            row.dataset.loaded = "true";
            renderExecutionDetail(detailHost, payload);
          })
          .catch(function () {
            row.dataset.loaded = "true";
            renderExecutionDetail(detailHost, { items: [] });
          });
      });

      row.appendChild(header);
      row.appendChild(body);
      container.appendChild(row);
    });
  }

  function initGlobalFlowHistory() {
    var root = document.querySelector("[data-flow-global-history]");
    if (!root || root.dataset.bound === "true") return;
    root.dataset.bound = "true";
    var url = root.getAttribute("data-flow-history-url");
    var list = root.querySelector("[data-flow-history-list]");
    var refresh = root.querySelector("[data-flow-history-refresh]");
    if (!url || !list) return;

    function load() {
      fetch(url, { headers: { "Accept": "application/json" } })
        .then(function (response) { return response.json(); })
        .then(function (payload) {
          renderExecutionList(list, payload && payload.executions ? payload.executions : [], url);
        })
        .catch(function () {
          renderExecutionList(list, [], url);
        });
    }

    if (refresh) {
      refresh.addEventListener("click", function () { load(); });
    }
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobalFlowHistory);
  } else {
    initGlobalFlowHistory();
  }
  document.addEventListener("turbo:load", initGlobalFlowHistory);
})();
