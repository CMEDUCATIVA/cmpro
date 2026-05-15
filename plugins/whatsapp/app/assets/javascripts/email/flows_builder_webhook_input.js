/* eslint-disable no-var, prefer-arrow-callback */
(function () {
  if (typeof FlowBuilder === "undefined") return;

  FlowBuilder.prototype.attachWebhookEndpointsToNodes = function () {
    var endpoints = this.webhookEndpoints || {};
    this.nodes.forEach(function (node) {
      if (node.type !== "webhook_input") return;
      node.data = node.data || {};
      var endpoint = null;
      if (node.data.endpoint_id && endpoints[node.data.endpoint_id]) {
        endpoint = endpoints[node.data.endpoint_id];
      } else {
        endpoint = Object.keys(endpoints).map(function (key) { return endpoints[key]; })
          .find(function (item) { return item.node_id === node.id; });
      }
      if (!endpoint) return;
      node.data.endpoint_id = endpoint.id;
      node.data.webhook_mapping = endpoint.mapping || node.data.webhook_mapping;
    });
  };

  FlowBuilder.prototype.defaultWebhookMapping = function () {
    return {
      contact_id_key: "contact_id",
      email_key: "email",
      phone_key: "phone"
    };
  };

  FlowBuilder.prototype.getWebhookEndpointForNode = function (node) {
    var endpoints = this.webhookEndpoints || {};
    if (!node || node.type !== "webhook_input") return null;
    var endpoint = null;
    if (node.data && node.data.endpoint_id && endpoints[node.data.endpoint_id]) {
      endpoint = endpoints[node.data.endpoint_id];
    } else {
      endpoint = Object.keys(endpoints).map(function (key) { return endpoints[key]; })
        .find(function (item) { return item.node_id === node.id; });
    }
    return endpoint || null;
  };

  FlowBuilder.prototype.renderWebhookInputPanel = function (node, data) {
    if (!this.propertiesBody || !node) return;
    var self = this;
    var endpoint = self.getWebhookEndpointForNode(node);
    var urlValue = endpoint ? endpoint.url : "";
    var mapping = data.webhook_mapping || self.defaultWebhookMapping();
    data.webhook_mapping = mapping;

    var webhookTitle = document.createElement("div");
    webhookTitle.className = "op-email-email--panel-title";
    webhookTitle.textContent = "Webhook";
    self.propertiesBody.appendChild(webhookTitle);

    var urlRow = document.createElement("div");
    urlRow.className = "op-email-email--flow-webhook-url";
    var urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.readOnly = true;
    urlInput.className = "op-email-email--flow-input";
    urlInput.value = urlValue || "";
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "op-email-email--button is-secondary";
    copyBtn.textContent = "Copiar";
    copyBtn.addEventListener("click", function () {
      if (!urlInput.value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(urlInput.value);
      } else {
        urlInput.select();
        document.execCommand("copy");
      }
    });
    urlRow.appendChild(urlInput);
    urlRow.appendChild(copyBtn);
    self.propertiesBody.appendChild(urlRow);

    if (!urlValue) {
      var hint = document.createElement("div");
      hint.className = "op-email-email--flow-webhook-hint";
      hint.textContent = "Guarda el flujo para obtener la URL del webhook.";
      self.propertiesBody.appendChild(hint);
    }

    if (typeof self.renderWebhookHistory === "function") {
      self.renderWebhookHistory(node, endpoint);
    }
  };
})();
