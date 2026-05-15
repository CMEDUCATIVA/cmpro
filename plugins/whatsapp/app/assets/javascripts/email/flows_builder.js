// Simple flow builder for Email module.
(function () {
  if (window.console && typeof window.console.info === "function") {
    window.console.info("[Flows] flows_builder.js version 2026-02-27a");
  }
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function randomId(prefix) {
    return (prefix || "node") + "_" + Math.random().toString(36).slice(2, 10);
  }

  function toNumber(value, fallback) {
    var num = Number(value);
    return isNaN(num) ? fallback : num;
  }

  function FlowBuilder(root) {
    this.root = root;
    this.canvas = qs("[data-flow-canvas]", root);
    this.viewport = qs("[data-flow-viewport]", root);
    this.inner = qs("[data-flow-inner]", root);
    this.edgesLayer = qs("[data-flow-edges]", root);
    this.edgeButtonsLayer = qs("[data-flow-edge-buttons]", root);
    this.sidebar = qs("[data-flow-sidebar]", root);
    this.propertiesBody = qs("[data-flow-properties-body]", root);
    this.propertiesEmpty = qs("[data-flow-properties-empty]", root);
    this.saveBtn = qs("[data-flow-save]", root);
    this.runBtn = qs("[data-flow-run]", root);
    this.editNameBtn = qs("[data-flow-edit-name]", root);
    this.dropdown = qs("[data-flow-dropdown]", root);
    this.dropdownSelect = qs("[data-flow-dropdown-select]", root);
    this.flowTitle = qs("[data-flow-canvas-title]", root);
    this.zoomInBtn = qs("[data-flow-zoom-in]", root);
    this.zoomOutBtn = qs("[data-flow-zoom-out]", root);
    this.zoomLabel = qs("[data-flow-zoom-label]", root);
    this.createOpenBtn = qs("[data-flow-create-open]", root);
    this.createModal = qs("[data-flow-create-modal]", root) || qs("[data-flow-create-modal]");
    this.createName = qs("[data-flow-create-name]", root) || qs("[data-flow-create-name]");
    this.createCancel = qs("[data-flow-create-cancel]", root) || qs("[data-flow-create-cancel]");
    this.createConfirm = qs("[data-flow-create-confirm]", root) || qs("[data-flow-create-confirm]");
    this.renameModal = qs("[data-flow-rename-modal]", root) || qs("[data-flow-rename-modal]");
    this.renameName = qs("[data-flow-rename-name]", root) || qs("[data-flow-rename-name]");
    this.renameCancel = qs("[data-flow-rename-cancel]", root) || qs("[data-flow-rename-cancel]");
    this.renameConfirm = qs("[data-flow-rename-confirm]", root) || qs("[data-flow-rename-confirm]");
    this.deleteCurrentBtn = qs("[data-flow-delete-current]", root);

    this.loadUrl = root.getAttribute("data-flow-load-url");
    this.listUrl = root.getAttribute("data-flow-list-url");
    this.saveUrl = root.getAttribute("data-flow-save-url");
    this.runUrl = root.getAttribute("data-flow-run-url");
    this.deleteUrlTemplate = root.getAttribute("data-flow-delete-url-template");
    this.clearEventsUrl = root.getAttribute("data-flow-clear-events-url");
    this.iaAgentsUrl = root.getAttribute("data-flow-ia-agents-url");
    this.wpTypesUrl = root.getAttribute("data-flow-wp-types-url");
    this.boardsUrl = root.getAttribute("data-flow-boards-url");
    this.boardListsUrlTemplate = root.getAttribute("data-flow-board-lists-url-template");

    this.nodes = [];
    this.edges = [];
    this.selectedNodeId = null;
    this.pendingConnectFrom = null;
    this.currentFlowId = null;
    this.currentFlowName = "";
    this.webhookEndpoints = {};
    this.nodeHistories = {};
    this.nodeProgress = {};
    this.saveTimer = null;
    this.isLoading = false;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panMoved = false;
    this.zoom = 1;
    this.canvasMinWidth = 4200;
    this.canvasMinHeight = 2600;
    this.canvasPadding = 400;

    this.templates = [];
    this.users = [];
    this.contactFields = [];
    this.tags = [];
    this.contacts = [];
    this.workPackageTypes = [];
    this.boards = [];
    this.boardLists = {};
    this.iaAgentsCache = {};

    this.init();
  }

  FlowBuilder.prototype.init = function () {
    var self = this;
    if (!this.canvas || !this.inner) return;
    this.root.dataset.bound = "true";

    this.parseData();
    this.bindSidebar();
    this.bindSave();
    this.bindRun();
    this.bindEditName();
    this.bindRenameModal();
    this.bindFlowList();
    this.bindNodeGroups();
    this.bindNodeMenus();
    this.bindCanvas();
    this.bindZoom();
    this.resetFlowSelection();
    this.loadList();
    this.loadWorkPackageTypes();
    this.loadBoards();
    this.setZoom(this.zoom);

    window.addEventListener("resize", function () {
      self.renderEdges();
    });
  };

  FlowBuilder.prototype.parseData = function () {
    try {
      this.templates = JSON.parse(this.root.getAttribute("data-flow-templates") || "[]");
    } catch (error) {
      this.templates = [];
    }
    try {
      this.whatsappTemplates = JSON.parse(this.root.getAttribute("data-flow-whatsapp-templates") || "[]");
    } catch (error) {
      this.whatsappTemplates = [];
    }
    try {
      this.users = JSON.parse(this.root.getAttribute("data-flow-users") || "[]");
    } catch (error) {
      this.users = [];
    }
    try {
      this.contactFields = JSON.parse(this.root.getAttribute("data-flow-contact-fields") || "[]");
    } catch (error) {
      this.contactFields = [];
    }
    try {
      this.tags = JSON.parse(this.root.getAttribute("data-flow-tags") || "[]");
    } catch (error) {
      this.tags = [];
    }
    try {
      this.contacts = JSON.parse(this.root.getAttribute("data-flow-contacts") || "[]");
    } catch (error) {
      this.contacts = [];
    }
  };

  FlowBuilder.prototype.loadWorkPackageTypes = function () {
    var self = this;
    if (!this.wpTypesUrl) return;
    fetch(this.wpTypesUrl, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        self.workPackageTypes = payload.types || [];
        if (self.selectedNodeId) self.renderProperties();
      })
      .catch(function () {
        self.workPackageTypes = [];
      });
  };

  FlowBuilder.prototype.loadBoards = function () {
    var self = this;
    if (!this.boardsUrl) return;
    fetch(this.boardsUrl, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        self.boards = payload.boards || [];
        if (self.selectedNodeId) self.renderProperties();
      })
      .catch(function () {
        self.boards = [];
      });
  };

  FlowBuilder.prototype.loadBoardLists = function (boardId, callback) {
    var self = this;
    if (!boardId || !this.boardListsUrlTemplate) {
      if (callback) callback([]);
      return;
    }
    if (this.boardLists[boardId]) {
      if (callback) callback(this.boardLists[boardId]);
      return;
    }
    var url = this.boardListsUrlTemplate.replace("__BOARD_ID__", boardId);
    fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        var lists = payload.lists || [];
        self.boardLists[boardId] = lists;
        if (callback) callback(lists);
        if (self.selectedNodeId) self.renderProperties();
      })
      .catch(function () {
        if (callback) callback([]);
      });
  };

  FlowBuilder.prototype.bindSidebar = function () {
    var self = this;
    qsa("[data-flow-node-type]", this.sidebar).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var type = btn.getAttribute("data-flow-node-type");
        self.addNode(type);
      });
    });
  };

  FlowBuilder.prototype.bindNodeGroups = function () {
    var sidebar = this.sidebar;
    if (!sidebar) return;
    qsa("[data-flow-group-toggle]", sidebar).forEach(function (toggle) {
      var group = toggle.closest("[data-flow-group]");
      if (!group) return;
      toggle.addEventListener("click", function () {
        group.classList.toggle("is-open");
      });
    });
  };

  FlowBuilder.prototype.bindNodeMenus = function () {
    var self = this;
    document.addEventListener("click", function (event) {
      if (!self.root || !self.root.contains(event.target)) return;
      if (event.target.closest(".op-email-email--flow-node-menu")) return;
      if (event.target.closest(".op-email-email--flow-node-menu-btn")) return;
      self.closeNodeMenus();
    });
  };

  FlowBuilder.prototype.bindCanvas = function () {
    var self = this;
    if (!this.canvas) return;
    this.canvas.addEventListener("click", function (event) {
      if (self.panMoved) {
        self.panMoved = false;
        return;
      }
      if (event.target.closest("[data-flow-node]")) return;
      if (event.target.closest(".op-email-email--flow-node-menu")) return;
      if (event.target.closest(".op-email-email--flow-node-menu-btn")) return;
      self.selectedNodeId = null;
      self.render();
    });

    this.canvas.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      if (event.target.closest("[data-flow-edge-button]")) return;
      if (event.target.closest("[data-flow-node]")) {
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Flows] canvas.mousedown.on_node", {
            target: event.target && event.target.tagName,
            node_id: event.target.closest("[data-flow-node]")?.getAttribute("data-flow-node-id") || null
          });
        }
        return;
      }
      if (event.target.closest(".op-email-email--flow-node-menu")) return;
      if (event.target.closest(".op-email-email--flow-node-menu-btn")) return;
      self.isPanning = true;
      self.panMoved = false;
      var startX = event.clientX;
      var startY = event.clientY;
      var originX = self.panX;
      var originY = self.panY;
      self.canvas.classList.add("is-panning");
      event.preventDefault();

      function onMove(moveEvent) {
        if (!self.isPanning) return;
        var dx = moveEvent.clientX - startX;
        var dy = moveEvent.clientY - startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) self.panMoved = true;
        self.panX = originX + dx;
        self.panY = originY + dy;
        self.applyPan();
      }

      function onUp() {
        if (!self.isPanning) return;
        self.isPanning = false;
        self.canvas.classList.remove("is-panning");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  };

  FlowBuilder.prototype.applyPan = function () {
    if (!this.inner) return;
    var transformValue = "translate(" + this.panX + "px, " + this.panY + "px) scale(" + this.zoom + ")";
    this.inner.style.transform = transformValue;
    this.renderEdges();
  };

  FlowBuilder.prototype.bindZoom = function () {
    var self = this;
    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener("click", function () {
        self.setZoom(self.zoom + 0.1);
      });
    }
    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener("click", function () {
        self.setZoom(self.zoom - 0.1);
      });
    }
    var zoomTarget = this.viewport || this.canvas;
    if (zoomTarget) {
      zoomTarget.addEventListener(
        "wheel",
        function (event) {
          if (!event.ctrlKey) return;
          event.preventDefault();
          var delta = event.deltaY;
          var step = delta > 0 ? -0.1 : 0.1;
          self.setZoom(self.zoom + step);
        },
        { passive: false }
      );
    }
  };

  FlowBuilder.prototype.setZoom = function (value) {
    var next = Math.max(0.5, Math.min(2, Number(value) || 1));
    this.zoom = Math.round(next * 10) / 10;
    if (this.zoomLabel) {
      this.zoomLabel.textContent = Math.round(this.zoom * 100) + "%";
    }
    this.applyPan();
    this.renderEdges();
  };

  FlowBuilder.prototype.bindSave = function () {
    var self = this;
    if (!this.saveBtn) return;
    this.saveBtn.addEventListener("click", function () {
      self.save();
    });
  };

  FlowBuilder.prototype.bindFlowList = function () {
    var self = this;
    if (this.dropdownSelect) {
      this.dropdownSelect.addEventListener("change", function () {
        var value = self.dropdownSelect.value;
        if (!value) return;
        self.load(value);
      });
    }

    if (this.createOpenBtn) {
      this.createOpenBtn.addEventListener("click", function () {
        self.openCreateModal();
      });
    }
    if (this.createCancel) {
      this.createCancel.addEventListener("click", function () {
        self.closeCreateModal();
      });
    }
    if (this.createConfirm) {
      this.createConfirm.addEventListener("click", function () {
        self.createFlowFromModal();
      });
    }
    if (this.deleteCurrentBtn) {
      this.deleteCurrentBtn.addEventListener("click", function () {
        if (!self.currentFlowId) return;
        if (!confirm("Eliminar flujo actual?")) return;
        self.deleteFlow(self.currentFlowId);
      });
    }
  };

  FlowBuilder.prototype.clearNodeHistory = function (nodeId, kind) {
    if (!this.clearEventsUrl || !this.currentFlowId) return;
    var token = qs("meta[name='csrf-token']");
    var params = "flow_id=" + encodeURIComponent(this.currentFlowId);
    if (nodeId) params += "&node_id=" + encodeURIComponent(nodeId);
    if (kind) params += "&kind=" + encodeURIComponent(kind);
    fetch(this.clearEventsUrl + "?" + params, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      }
    }).then(function () {
      this.load(this.currentFlowId);
    }.bind(this));
  };

  FlowBuilder.prototype.bindRun = function () {
    var self = this;
    if (!this.runBtn) return;
    this.runBtn.addEventListener("click", function () {
      self.run();
    });
  };

  FlowBuilder.prototype.resetFlowSelection = function () {
    this.currentFlowId = null;
    if (this.dropdownSelect) {
      this.dropdownSelect.value = "";
      this.dropdownSelect.selectedIndex = 0;
    }
    this.updateFlowTitle();
  };

  FlowBuilder.prototype.bindEditName = function () {
    var self = this;
    if (!this.editNameBtn || !this.flowTitle) return;
    this.editNameBtn.addEventListener("click", function () {
      self.startNameEdit();
    });
  };

  FlowBuilder.prototype.startNameEdit = function () {
    this.openRenameModal();
  };

  FlowBuilder.prototype.bindRenameModal = function () {
    var self = this;
    if (!this.renameModal) return;
    if (this.renameCancel) {
      this.renameCancel.addEventListener("click", function () {
        self.closeRenameModal();
      });
    }
    if (this.renameConfirm) {
      this.renameConfirm.addEventListener("click", function () {
        self.applyRenameFromModal();
      });
    }
    if (this.renameName) {
      this.renameName.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          self.applyRenameFromModal();
        } else if (event.key === "Escape") {
          event.preventDefault();
          self.closeRenameModal();
        }
      });
    }
    this.renameModal.addEventListener("click", function (event) {
      if (event.target === self.renameModal) {
        self.closeRenameModal();
      }
    });
  };

  FlowBuilder.prototype.openRenameModal = function () {
    if (!this.renameModal) return;
    this.renameModal.classList.remove("is-hidden");
    if (this.renameName) {
      this.renameName.value = this.getFlowTitle();
      this.renameName.focus();
      this.renameName.select();
    }
  };

  FlowBuilder.prototype.closeRenameModal = function () {
    if (!this.renameModal) return;
    this.renameModal.classList.add("is-hidden");
  };

  FlowBuilder.prototype.applyRenameFromModal = function () {
    var name = this.renameName ? this.renameName.value.trim() : "";
    if (!name) return;
    this.closeRenameModal();
    this.saveWithName(name);
  };

  FlowBuilder.prototype.loadList = function () {
    var self = this;
    if (!this.listUrl) {
      this.load(null);
      return;
    }
    fetch(this.listUrl, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        self.flowList = payload.flows || [];
        self.renderDropdown(self.flowList);
        if (self.currentFlowId) {
          self.load(self.currentFlowId);
        }
      })
      .catch(function () {
        self.load(null);
      });
  };

  FlowBuilder.prototype.renderDropdown = function (flows) {
    if (!this.dropdownSelect) return;
    var self = this;
    var list = flows || [];
    this.dropdownSelect.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccione un flujo";
    placeholder.selected = !this.currentFlowId;
    placeholder.disabled = true;
    placeholder.hidden = true;
    this.dropdownSelect.appendChild(placeholder);
    list.forEach(function (flow) {
      var option = document.createElement("option");
      option.value = flow.id;
      option.textContent = flow.name || ("Flujo " + flow.id);
      if (String(flow.id) === String(self.currentFlowId)) {
        option.selected = true;
      }
      self.dropdownSelect.appendChild(option);
    });
  };

  FlowBuilder.prototype.createFlow = function (name) {
    this.currentFlowId = null;
    this.currentFlowName = name || "";
    this.webhookEndpoints = {};
    this.nodes = [];
    this.edges = [];
    this.selectedNodeId = null;
    this.pendingConnectFrom = null;
    if (this.dropdownSelect) this.dropdownSelect.value = "";
    this.updateFlowTitle();
    this.render();
    if (name) {
      this.saveWithName(name);
    }
  };

  FlowBuilder.prototype.openCreateModal = function () {
    if (!this.createModal) return;
    this.createModal.classList.remove("is-hidden");
    if (this.createName) {
      this.createName.value = "";
      this.createName.focus();
    }
  };

  FlowBuilder.prototype.closeCreateModal = function () {
    if (!this.createModal) return;
    this.createModal.classList.add("is-hidden");
  };

  FlowBuilder.prototype.createFlowFromModal = function () {
    var name = this.createName ? this.createName.value.trim() : "";
    if (!name) return;
    this.closeCreateModal();
    this.createFlow(name);
  };

  FlowBuilder.prototype.load = function (flowId) {
    var self = this;
    if (!this.loadUrl) return;
    this.isLoading = true;
    var url = this.loadUrl + (flowId ? ("?flow_id=" + encodeURIComponent(flowId)) : "");
    fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        self.currentFlowId = payload.id || flowId;
        self.currentFlowName = payload.name || "";
        var definition = payload.definition || {};
        self.webhookEndpoints = payload.webhook_endpoints || {};
        self.nodeHistories = payload.node_histories || {};
        self.nodeProgress = payload.node_progress || {};
        self.nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
        self.normalizeWhatsappTemplateNodes();
        self.edges = Array.isArray(definition.edges) ? definition.edges.map(function (edge) {
          if (!edge.path) edge.path = "default";
          return edge;
        }) : [];
        var viewport = definition.viewport || {};
        self.panX = toNumber(viewport.x, 0);
        self.panY = toNumber(viewport.y, 0);
        self.zoom = toNumber(viewport.zoom, 1);
        self.normalizeMacroEdges();
        self.attachWebhookEndpointsToNodes();
        self.render();
        self.applyPan();
        self.setZoom(self.zoom);
        self.refreshList();
        self.updateFlowTitle();
        if (self.dropdownSelect && self.currentFlowId) {
          self.dropdownSelect.value = String(self.currentFlowId);
        }
        self.isLoading = false;
      })
      .catch(function () {
        self.webhookEndpoints = {};
        self.nodeHistories = {};
        self.nodeProgress = {};
        self.render();
        self.updateFlowTitle();
        self.isLoading = false;
      });
  };

  FlowBuilder.prototype.save = function () {
    var self = this;
    var token = qs("meta[name='csrf-token']");
    if (!this.saveUrl) return;
    var nameValue = this.currentFlowName;
    if (!nameValue) nameValue = this.currentFlowId ? ("Flujo " + this.currentFlowId) : "Flujo nuevo";
    var payload = {
      flow_id: this.currentFlowId,
      name: nameValue,
      status: "draft",
      definition: {
        nodes: this.nodes,
        edges: this.edges,
        viewport: {
          x: this.panX,
          y: this.panY,
          zoom: this.zoom
        }
      }
    };
    fetch(this.saveUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        if (payload && payload.id) {
          self.currentFlowId = payload.id;
          if (payload.definition) {
            self.nodes = Array.isArray(payload.definition.nodes) ? payload.definition.nodes : self.nodes;
            self.edges = Array.isArray(payload.definition.edges) ? payload.definition.edges : self.edges;
            self.normalizeWhatsappTemplateNodes();
            self.normalizeMacroEdges();
            var viewport = payload.definition.viewport || {};
            self.panX = toNumber(viewport.x, self.panX);
            self.panY = toNumber(viewport.y, self.panY);
            self.zoom = toNumber(viewport.zoom, self.zoom);
          }
          self.refreshList();
          if (!self.currentFlowName && payload.name) {
            self.currentFlowName = payload.name;
          }
          self.updateFlowTitle();
          if (payload.webhook_endpoints) {
            self.webhookEndpoints = payload.webhook_endpoints;
            self.attachWebhookEndpointsToNodes();
            if (self.selectedNodeId) self.renderProperties();
          }
          if (payload.node_histories) {
            self.nodeHistories = payload.node_histories;
          }
          if (payload.node_progress) {
            self.nodeProgress = payload.node_progress;
          }
          if (self.dropdownSelect) {
            self.dropdownSelect.value = String(self.currentFlowId);
          }
          self.applyPan();
          self.setZoom(self.zoom);
          self.render();
        }
      })
      .catch(function () {});
  };

  FlowBuilder.prototype.normalizeWhatsappTemplateNodes = function () {
    if (!Array.isArray(this.nodes)) return;
    var changed = false;
    this.nodes.forEach(function (node) {
      if (!node || node.type !== "whatsapp_template") return;
      node.type = "whatsapp";
      node.data = node.data || {};
      if (!node.data.template_id && node.data.template) {
        node.data.template_id = node.data.template;
      }
      delete node.data.template;
      changed = true;
    });
    if (changed) {
      this.markDirty();
    }
  };

  FlowBuilder.prototype.normalizeMacroEdges = function () {
    if (!Array.isArray(this.edges) || !Array.isArray(this.nodes)) return;
    var changed = false;
    this.edges.forEach(function (edge) {
      if (!edge || !edge.source) return;
      var sourceNode = this.nodes.find(function (node) { return node && node.id === edge.source; });
      if (!sourceNode || sourceNode.type !== "macro") return;
      if (edge.path !== "default") {
        edge.path = "default";
        changed = true;
      }
    }.bind(this));
    if (changed && window.console && typeof window.console.log === "function") {
      window.console.log("[Flows] macro edges normalized", {
        count: this.edges.filter(function (edge) { return edge && edge.source; }).length
      });
    }
    if (changed) {
      this.markDirty();
    }
  };

  FlowBuilder.prototype.saveWithName = function (name) {
    this.currentFlowName = name || "";
    this.updateFlowTitle();
    this.save();
  };

  FlowBuilder.prototype.run = function () {
    var token = qs("meta[name='csrf-token']");
    if (!this.runUrl) return;
    var url = this.runUrl + (this.currentFlowId ? ("?flow_id=" + encodeURIComponent(this.currentFlowId)) : "");
    fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      }
    }).catch(function () {});
  };

  FlowBuilder.prototype.deleteFlow = function (flowId) {
    if (!flowId || !this.deleteUrlTemplate) return;
    var token = qs("meta[name='csrf-token']");
    var url = this.deleteUrlTemplate.replace("__FLOW_ID__", flowId);
    fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": token ? token.content : ""
      }
    }).then(function () {
      if (String(flowId) === String(this.currentFlowId)) {
        this.currentFlowId = null;
        this.currentFlowName = "";
        this.createFlow();
        if (this.dropdownSelect) this.dropdownSelect.value = "";
      } else {
        this.refreshList();
      }
    }.bind(this))
      .catch(function () {});
  };

  FlowBuilder.prototype.updateFlowTitle = function () {
    if (!this.flowTitle) return;
    this.flowTitle.textContent = this.getFlowTitle();
  };

  FlowBuilder.prototype.getFlowTitle = function () {
    var title = this.currentFlowName;
    if (!title) {
      title = this.currentFlowId ? ("Flujo " + this.currentFlowId) : "Flujo nuevo";
    }
    return title;
  };

  FlowBuilder.prototype.refreshList = function () {
    var self = this;
    if (!this.listUrl) return;
    fetch(this.listUrl, { headers: { "Accept": "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (payload) {
        self.flowList = payload.flows || [];
        self.renderDropdown(self.flowList);
      })
      .catch(function () {});
  };

  FlowBuilder.prototype.addNode = function (type, position) {
    var id = randomId(type);
    var pos = position || { x: 140, y: 140 };
    var data = this.defaultDataFor(type);
    var node = { id: id, type: type, x: pos.x, y: pos.y, data: data };
    this.nodes.push(node);
    if (type === "webhook_input") {
      this.selectedNodeId = id;
    }
    this.markDirty();
    this.render();
    if (type === "webhook_input") {
      this.save();
    }
  };

  FlowBuilder.prototype.closeNodeMenus = function (except) {
    if (!this.root) return;
    qsa(".op-email-email--flow-node-menu", this.root).forEach(function (menu) {
      if (except && menu === except) return;
      menu.classList.add("is-hidden");
    });
  };

  FlowBuilder.prototype.handleNodeAction = function (action, node) {
    if (!node) return;
    if (action === "duplicate") {
      var clone = JSON.parse(JSON.stringify(node));
      clone.id = randomId(node.type || "node");
      clone.x = (node.x || 0) + 30;
      clone.y = (node.y || 0) + 30;
      if (clone.type === "webhook_input" && clone.data) {
        clone.data.endpoint_id = null;
      }
      this.nodes.push(clone);
      this.selectNode(clone.id);
      this.markDirty();
      this.render();
      this.scheduleSave();
      return;
    }
    if (action === "copy") {
      try {
        var payload = JSON.stringify({ type: node.type, data: node.data }, null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload);
        }
        this.copiedNode = JSON.parse(JSON.stringify(node));
      } catch (error) {
        this.copiedNode = JSON.parse(JSON.stringify(node));
      }
      return;
    }
    if (action === "delete") {
      this.nodes = this.nodes.filter(function (item) { return item.id !== node.id; });
      this.edges = this.edges.filter(function (edge) { return edge.from !== node.id && edge.to !== node.id; });
      if (this.selectedNodeId === node.id) this.selectedNodeId = null;
      this.markDirty();
      this.render();
      this.scheduleSave();
    }
  };

  FlowBuilder.prototype.defaultDataFor = function (type) {
    switch (type) {
      case "start":
        return { label: "Inicio" };
      case "webhook_input":
        return { label: "Webhook", webhook_mapping: this.defaultWebhookMapping() };
      case "transform_json":
        return {
          mappings: [{ source: "", target_type: "field", target: "first_name" }],
          work_package_type_id: "",
          work_package_type_name: "",
          board_id: "",
          query_id: "",
          crm_tag_name: "",
          assigned_to_id: ""
        };
      case "macro":
        return { show_in_chat: false };
      case "conversation_ai":
        return { show_ai_in_chat: false };
      case "filter":
        return { field: "status", operator: "equals", value: "" };
      case "condition":
        return { mode: "all", rules: [{ field: "status", operator: "equals", value: "" }] };
      case "branch":
        return { field: "status", operator: "equals", value: "" };
      case "whatsapp":
        return { message: "" };
      case "whatsapp_ai":
        return { server_url: "", basic_username: "", basic_password: "", agent_id: "openproject-agent", send_interval: 5, start_typing: false };
      case "whatsapp_reminder":
        return { contact_ids: [], send_interval: 5, start_typing: false };
      case "email":
        return { subject: "", body: "" };
      case "email_template":
        return { template_id: "" };
      case "delay":
        return { unit: "minutes", amount: 5, night_convert: false, night_start: "22:00", night_end: "06:00" };
      case "reminder":
        return {};
      case "wait_until":
        return { datetime: "" };
      case "assign_owner":
        return { user_id: "" };
      case "update_field":
        return { field: "status", value: "" };
      case "related_item":
        return { work_package_type_id: "", work_package_type_name: "", related_name_source: "", related_name_label: "" };
      case "related_board":
        return { board_id: "", query_id: "" };
      case "add_tag":
        return { tags: "" };
      case "webhook":
        return { url: "", payload: "" };
      case "end":
        return { label: "Fin" };
      default:
        return {};
    }
  };

  FlowBuilder.prototype.render = function () {
    var self = this;
    if (!this.canvas) return;
    // clear nodes
    qsa("[data-flow-node]", this.inner).forEach(function (node) { node.remove(); });

    this.nodes.forEach(function (node) {
      var el = document.createElement("div");
      el.className = "op-email-email--flow-node-box";
      if (node.id === self.selectedNodeId) {
        el.classList.add("is-selected");
      }
      el.style.left = node.x + "px";
      el.style.top = node.y + "px";
      el.setAttribute("data-flow-node", "true");
      el.setAttribute("data-flow-node-id", node.id);

      var title = document.createElement("div");
      title.className = "op-email-email--flow-node-title";
      var titleText = document.createElement("span");
      if (node.type === "transform_json") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
          '<path fill-rule="evenodd" d="M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2 9a4 4 0 0 0-4 4v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1a4 4 0 0 0-4-4H7Zm8-1a1 1 0 0 1 1-1h1v-1a1 1 0 1 1 2 0v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1h-1a1 1 0 0 1-1-1Z" clip-rule="evenodd"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "webhook_input") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">' +
          '<path d="M21.718 12c0-1.429-1.339-2.681-3.467-3.5.029-.18.077-.37.1-.545.217-2.058-.273-3.543-1.379-4.182-1.235-.714-2.983-.186-4.751 1.239C10.45 3.589 8.7 3.061 7.468 3.773c-1.107.639-1.6 2.124-1.379 4.182.018.175.067.365.095.545-2.127.819-3.466 2.071-3.466 3.5 0 1.429 1.339 2.681 3.466 3.5-.028.18-.077.37-.095.545-.218 2.058.272 3.543 1.379 4.182.376.213.803.322 1.235.316a5.987 5.987 0 0 0 3.514-1.56 5.992 5.992 0 0 0 3.515 1.56 2.44 2.44 0 0 0 1.236-.316c1.106-.639 1.6-2.124 1.379-4.182-.019-.175-.067-.365-.1-.545 2.132-.819 3.471-2.071 3.471-3.5Zm-6.01-7.548a1.5 1.5 0 0 1 .76.187c.733.424 1.055 1.593.884 3.212-.012.106-.043.222-.058.33-.841-.243-1.7-.418-2.57-.523a16.165 16.165 0 0 0-1.747-1.972 4.9 4.9 0 0 1 2.731-1.234Zm-7.917 8.781c.172.34.335.68.529 1.017.194.337.395.656.6.969a14.09 14.09 0 0 1-1.607-.376 14.38 14.38 0 0 1 .478-1.61Zm-.479-4.076a14.085 14.085 0 0 1 1.607-.376c-.205.313-.405.634-.6.969-.195.335-.357.677-.529 1.017-.19-.527-.35-1.064-.478-1.61ZM8.3 12a19.32 19.32 0 0 1 .888-1.75c.33-.568.69-1.118 1.076-1.65.619-.061 1.27-.1 1.954-.1.684 0 1.333.035 1.952.1a19.63 19.63 0 0 1 1.079 1.654c.325.567.621 1.15.887 1.746a18.869 18.869 0 0 1-1.953 3.403 19.218 19.218 0 0 1-3.931 0 20.169 20.169 0 0 1-1.066-1.653A19.324 19.324 0 0 1 8.3 12Zm7.816 2.25c.2-.337.358-.677.53-1.017.191.527.35 1.065.478 1.611a14.48 14.48 0 0 1-1.607.376c.202-.314.404-.635.597-.97h.002Zm.53-3.483c-.172-.34-.335-.68-.53-1.017a20.214 20.214 0 0 0-.6-.97c.542.095 1.078.22 1.606.376a14.111 14.111 0 0 1-.478 1.611h.002ZM12.217 6.34c.4.375.777.773 1.13 1.193-.37-.02-.746-.033-1.129-.033s-.76.013-1.131.033c.353-.42.73-.817 1.13-1.193Zm-4.249-1.7a1.5 1.5 0 0 1 .76-.187 4.9 4.9 0 0 1 2.729 1.233A16.253 16.253 0 0 0 9.71 7.658c-.87.105-1.728.28-2.569.524-.015-.109-.047-.225-.058-.331-.171-1.619.151-2.787.885-3.211ZM3.718 12c0-.9.974-1.83 2.645-2.506.218.857.504 1.695.856 2.506-.352.811-.638 1.65-.856 2.506C4.692 13.83 3.718 12.9 3.718 12Zm4.25 7.361c-.734-.423-1.056-1.593-.885-3.212.011-.106.043-.222.058-.331.84.243 1.697.418 2.564.524a16.37 16.37 0 0 0 1.757 1.982c-1.421 1.109-2.714 1.488-3.494 1.037Zm3.11-2.895c.374.021.753.034 1.14.034.387 0 .765-.013 1.139-.034a14.4 14.4 0 0 1-1.14 1.215 14.248 14.248 0 0 1-1.139-1.215Zm5.39 2.895c-.782.451-2.075.072-3.5-1.038a16.248 16.248 0 0 0 1.757-1.981 16.41 16.41 0 0 0 2.565-.523c.015.108.046.224.058.33.175 1.619-.148 2.789-.88 3.212Zm1.6-4.854A16.563 16.563 0 0 0 17.216 12c.352-.812.638-1.65.856-2.507 1.671.677 2.646 1.607 2.646 2.507 0 .9-.975 1.83-2.646 2.507h-.004Z"/>' +
          '<path d="M12.215 13.773a1.792 1.792 0 1 0-1.786-1.8v.006a1.787 1.787 0 0 0 1.786 1.794Z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "macro") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM10.6935 15.8458L15.4137 13.059C16.1954 12.5974 16.1954 11.4026 15.4137 10.941L10.6935 8.15419C9.93371 7.70561 9 8.28947 9 9.21316V14.7868C9 15.7105 9.93371 16.2944 10.6935 15.8458Z" fill="#1C274C"></path>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "conversation_ai") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chat-square-dots" viewBox="0 0 16 16">' +
          '<path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2.5a2 2 0 0 0-1.6.8L8 14.333 6.1 11.8a2 2 0 0 0-1.6-.8H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5a1 1 0 0 1 .8.4l1.9 2.533a1 1 0 0 0 1.6 0l1.9-2.533a1 1 0 0 1 .8-.4H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z"/>' +
          '<path d="M5 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0m4 0a1 1 0 0 1 0 2 1 1 0 0 1 0-2m4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "delay") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-alarm" viewBox="0 0 16 16">' +
          '<path d="M8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9z"/>' +
          '<path d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1zm1.038 3.018a6 6 0 0 1 .924 0 6 6 0 1 1-.924 0M0 3.5c0 .753.333 1.429.86 1.887A8.04 8.04 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5M13.5 1c-.753 0-1.429.333-1.887.86a8.04 8.04 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "reminder") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-alarm" viewBox="0 0 16 16">' +
          '<path d="M8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9z"/>' +
          '<path d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1zm1.038 3.018a6 6 0 0 1 .924 0 6 6 0 1 1-.924 0M0 3.5c0 .753.333 1.429.86 1.887A8.04 8.04 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5M13.5 1c-.753 0-1.429.333-1.887.86a8.04 8.04 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "whatsapp") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon is-green" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">' +
          '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17h6l3 3v-3h2V9h-2M4 4h11v8H9l-3 3v-3H4V4Z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "whatsapp_ai") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-robot" viewBox="0 0 16 16">' +
          '<path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5M3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.6 26.6 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.93.93 0 0 1-.765.935c-.845.147-2.34.346-4.235.346s-3.39-.2-4.235-.346A.93.93 0 0 1 3 9.219zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a25 25 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25 25 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135"/>' +
          '<path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2zM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "whatsapp_reminder") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon is-green" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chat-right-heart" viewBox="0 0 16 16">' +
          '<path d="M2 1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h9.586a2 2 0 0 1 1.414.586l2 2V2a1 1 0 0 0-1-1zm12-1a2 2 0 0 1 2 2v12.793a.5.5 0 0 1-.854.353l-2.853-2.853a1 1 0 0 0-.707-.293H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z"/>' +
          '<path d="M8 3.993c1.664-1.711 5.825 1.283 0 5.132-5.825-3.85-1.664-6.843 0-5.132"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "update_field") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">' +
          '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 8H4m8 3.5v5M9.5 14h5M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-5.032a1 1 0 0 1-.768-.36l-1.9-2.28a1 1 0 0 0-.768-.36H5a1 1 0 0 0-1 1Z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "related_item") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-person-workspace" viewBox="0 0 16 16">' +
          '<path d="M4 16s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-5.95a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/>' +
          '<path d="M2 1a2 2 0 0 0-2 2v9.5A1.5 1.5 0 0 0 1.5 14h.653a5.4 5.4 0 0 1 1.066-2H1V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9h-2.219c.554.654.89 1.373 1.066 2h.653a1.5 1.5 0 0 0 1.5-1.5V3a2 2 0 0 0-2-2z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "related_board") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-layers" viewBox="0 0 16 16">' +
          '<path d="M8.235 1.559a.5.5 0 0 0-.47 0l-7.5 4a.5.5 0 0 0 0 .882L3.188 8 .264 9.559a.5.5 0 0 0 0 .882l7.5 4a.5.5 0 0 0 .47 0l7.5-4a.5.5 0 0 0 0-.882L12.813 8l2.922-1.559a.5.5 0 0 0 0-.882zm3.515 7.008L14.438 10 8 13.433 1.562 10 4.25 8.567l3.515 1.874a.5.5 0 0 0 .47 0zM8 9.433 1.562 6 8 2.567 14.438 6z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "add_tag") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-tags" viewBox="0 0 16 16">' +
          '<path d="M3 2v4.586l7 7L14.586 9l-7-7zM2 2a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 2 6.586z"/>' +
          '<path d="M5.5 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m0 1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M1 7.086a1 1 0 0 0 .293.707L8.75 15.25l-.043.043a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 0 7.586V3a1 1 0 0 1 1-1z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else if (node.type === "email_template") {
        titleText.className = "op-email-email--flow-node-title-text";
        titleText.innerHTML =
          '<span class="op-email-email--flow-node-icon" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">' +
          '<path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1zm13 2.383-4.708 2.825L15 11.105zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741M1 11.105l4.708-2.897L1 5.383z"/>' +
          "</svg></span>" +
          self.nodeTitle(node);
      } else {
        titleText.textContent = self.nodeTitle(node);
      }

      var menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "op-email-email--flow-node-menu-btn";
      menuBtn.innerHTML =
        '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-ellipsis\" style=\"stroke-width: 1.5;\"><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/></svg>';

      var menu = document.createElement("div");
      menu.className = "op-email-email--flow-node-menu is-hidden";
      menu.setAttribute("data-flow-node-menu", "true");
      menu.innerHTML =
        '<button type=\"button\" class=\"op-email-email--flow-node-menu-item\" data-flow-node-action=\"duplicate\">' +
        '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><rect x=\"2\" y=\"2\" width=\"13\" height=\"13\" rx=\"2\"/></svg>' +
        'Duplicate</button>' +
        '<button type=\"button\" class=\"op-email-email--flow-node-menu-item\" data-flow-node-action=\"copy\">' +
        '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><rect x=\"2\" y=\"2\" width=\"13\" height=\"13\" rx=\"2\"/></svg>' +
        'Copy</button>' +
        '<button type=\"button\" class=\"op-email-email--flow-node-menu-item is-danger\" data-flow-node-action=\"delete\">' +
        '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6h18\"/><path d=\"M8 6V4h8v2\"/><path d=\"M19 6l-1 14H6L5 6\"/></svg>' +
        'Delete</button>';

      menuBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (menu.classList.contains("is-hidden")) {
          self.closeNodeMenus(menu);
          menu.classList.remove("is-hidden");
          return;
        }
        menu.classList.toggle("is-hidden");
      });

      menu.addEventListener("click", function (event) {
        var action = event.target.closest("[data-flow-node-action]");
        if (!action) return;
        var type = action.getAttribute("data-flow-node-action");
        event.stopPropagation();
        menu.classList.add("is-hidden");
        self.handleNodeAction(type, node);
      });

      title.appendChild(titleText);
      title.appendChild(menuBtn);
      el.appendChild(menu);

      var meta = document.createElement("div");
      meta.className = "op-email-email--flow-node-meta";
      meta.textContent = self.nodeSummary(node);

      var progressNode = null;
      if (node.type === "whatsapp") {
        var progressData = self.nodeProgress ? self.nodeProgress[node.id] : null;
        var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
        var currentValue = progressData && progressData.current ? progressData.current : historyItems.length;
        var totalValue = progressData && progressData.total ? progressData.total : 0;
        if (totalValue > 0) {
          var progress = document.createElement("div");
          progress.className = "op-email-email--flow-node-progress";
          if (historyItems.some(function (item) { return item.status === "queued" || item.status === "running"; })) {
            progress.classList.add("is-running");
          }
          var clock = document.createElement("span");
          clock.className = "op-email-email--flow-node-progress-clock";
          clock.innerHTML =
            '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none">' +
            '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M12 7v5l3 2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>' +
            "</svg>";
          var label = document.createElement("span");
          label.textContent = currentValue + " de " + totalValue;
          progress.appendChild(clock);
          progress.appendChild(label);
          progressNode = progress;
        }
      }

      var connector = document.createElement("div");
      connector.className = "op-email-email--flow-connector";

      var outputs = self.nodeOutputs(node);
      if (outputs.length > 1) connector.classList.add("is-multi");
      outputs.forEach(function (output) {
        var connectBtn = document.createElement("button");
        connectBtn.type = "button";
        connectBtn.className = "op-email-email--flow-connector-btn";
        var active = self.pendingConnectFrom && self.pendingConnectFrom.id === node.id && self.pendingConnectFrom.path === output.path;
        if (active) connectBtn.classList.add("is-active");
        connectBtn.setAttribute("aria-label", output.label);
        connectBtn.setAttribute("title", output.label);
        connectBtn.setAttribute("data-flow-connector", "true");
        connectBtn.setAttribute("data-flow-connector-node-id", node.id);
        connectBtn.setAttribute("data-flow-connector-path", output.path);
        connectBtn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7 7V5"/>' +
          "</svg>";
        connectBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          if (active) {
            self.pendingConnectFrom = null;
          } else {
            self.pendingConnectFrom = { id: node.id, path: output.path };
          }
          self.render();
        });
        if (outputs.length > 1) {
          var wrap = document.createElement("div");
          wrap.className = "op-email-email--flow-connector-item";
          var label = document.createElement("span");
          label.className = "op-email-email--flow-connector-label";
          label.textContent = output.label;
          wrap.appendChild(connectBtn);
          wrap.appendChild(label);
          connector.appendChild(wrap);
        } else {
          connector.appendChild(connectBtn);
        }
      });

      el.appendChild(title);
      el.appendChild(meta);
      if (progressNode) {
        el.appendChild(progressNode);
      }
      el.appendChild(connector);

      el.addEventListener("click", function () {
        if (self.isPanning) return;
        if (self.panMoved) self.panMoved = false;
        if (self.pendingConnectFrom && self.pendingConnectFrom.id !== node.id) {
          self.addEdge(self.pendingConnectFrom.id, node.id, self.pendingConnectFrom.path);
          self.pendingConnectFrom = null;
          self.render();
          return;
        }
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Flows] node.click", { node_id: node.id });
        }
        self.selectNode(node.id);
      });

      self.enableDrag(el, node);
      self.inner.appendChild(el);
    });

    this.updateInnerBounds();
    this.renderEdges();
    this.renderProperties();
  };

  FlowBuilder.prototype.updateInnerBounds = function () {
    if (!this.inner) return;
    var minWidth = this.canvasMinWidth || 1;
    var minHeight = this.canvasMinHeight || 1;
    var padding = this.canvasPadding || 0;
    var maxRight = 0;
    var maxBottom = 0;
    qsa("[data-flow-node]", this.inner).forEach(function (el) {
      maxRight = Math.max(maxRight, el.offsetLeft + el.offsetWidth);
      maxBottom = Math.max(maxBottom, el.offsetTop + el.offsetHeight);
    });
    var width = Math.max(minWidth, maxRight + padding);
    var height = Math.max(minHeight, maxBottom + padding);
    this.inner.style.width = width + "px";
    this.inner.style.height = height + "px";
  };

  FlowBuilder.prototype.enableDrag = function (el, node) {
    var self = this;
    var startX = 0;
    var startY = 0;
    var originX = 0;
    var originY = 0;

    function onMove(event) {
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      var zoom = self.zoom || 1;
      node.x = originX + dx / zoom;
      node.y = originY + dy / zoom;
      el.style.left = node.x + "px";
      el.style.top = node.y + "px";
      self.renderEdges();
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      self.updateInnerBounds();
      self.renderEdges();
      self.markDirty();
      self.scheduleSave();
    }

    el.addEventListener("mousedown", function (event) {
      if (event.target.tagName === "BUTTON") return;
      if (event.target.closest("input, textarea, select")) return;
      self.panMoved = false;
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Flows] node.drag.start", { node_id: node.id });
      }
      startX = event.clientX;
      startY = event.clientY;
      originX = node.x;
      originY = node.y;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  };

  FlowBuilder.prototype.nodeTitle = function (node) {
    switch (node.type) {
      case "start":
        return "Inicio";
      case "webhook_input":
        return "Webhook Entrada";
      case "transform_json":
        return "Agregar a CRM";
      case "macro":
        return "Macro Contactos";
      case "conversation_ai":
        return "Conversaciones a IA";
      case "transform_json":
        return "Agregar a CRM";
      case "filter":
        return "Filtro";
      case "condition":
        return "Condicion";
      case "branch":
        return "Branch";
      case "whatsapp":
        return "Wha Template";
      case "whatsapp_ai":
        return "Inteligencia Artificial";
      case "whatsapp_reminder":
        return "Recordatorio WhatsApp";
      case "email":
        return "Email";
      case "email_template":
        return "Email Template";
      case "delay":
        return "Esperar";
      case "reminder":
        return "Recordatorio";
      case "wait_until":
        return "Esperar hasta";
      case "assign_owner":
        return "Asignar responsable";
      case "update_field":
        return "Actualizar campo";
      case "related_item":
        return "Crear paquete de trabajo";
      case "related_board":
        return "Tableros relacionados";
      case "add_tag":
        return "Etiquetar";
      case "webhook":
        return "Webhook";
      case "end":
        return "Fin";
      default:
        return node.type;
    }
  };

  FlowBuilder.prototype.nodeSummary = function (node) {
    var data = node.data || {};
    var truncate = function (value, max) {
      var text = (value || "").toString();
      if (text.length <= max) return text;
      return text.slice(0, max) + "...";
    };
    switch (node.type) {
      case "webhook_input":
        return "Escucha el webhook";
      case "transform_json":
        var mappingCount = (data.mappings || []).length;
        var crmTypeName = this.getWorkPackageTypeName(data.work_package_type_id) || data.work_package_type_name || "";
        var crmBoardName = this.getBoardName(data.board_id) || "";
        var crmListName = this.getBoardListName(data.board_id, data.query_id) || "";
        var crmTagName = (data.crm_tag_name || "").toString().trim();
        var crmOwnerName = this.getUserName(data.assigned_to_id) || "";
        var crmSummary = crmTypeName ? (mappingCount + " mapeos - Tipo: " + crmTypeName) : (mappingCount + " mapeos");
        if (crmBoardName && crmListName) {
          crmSummary += " - Tablero: " + crmBoardName + " / " + crmListName;
        }
        if (crmTagName) {
          crmSummary += " - Etiqueta: " + crmTagName;
        }
        if (crmOwnerName) {
          crmSummary += " - Responsable: " + crmOwnerName;
        }
        return crmSummary;
      case "macro":
        return (data.show_in_chat === true || data.show_in_chat === "true") ? "Visible en tarjeta" : "No visible en tarjeta";
      case "conversation_ai":
        return (data.show_ai_in_chat === true || data.show_ai_in_chat === "true") ? "IA visible en tarjeta" : "IA no visible en tarjeta";
      case "filter":
        return (data.field || "campo") + " " + (data.operator || "=") + " " + (data.value || "");
      case "condition":
        return (data.rules || []).length + " reglas (" + (data.mode || "all") + ")";
      case "branch":
        return (data.field || "campo") + " " + (data.operator || "=") + " " + (data.value || "");
      case "whatsapp":
        if (data.template_id) {
          return "Plantilla: " + (this.getWhatsappTemplateName(data.template_id) || "—");
        }
        return (data.message || "").slice(0, 40) || "Mensaje";
      case "whatsapp_ai":
        return "Agente: " + (data.agent_id || "openproject-agent");
      case "whatsapp_reminder":
        var contactCount = Array.isArray(data.contact_ids) ? data.contact_ids.length : 0;
        if (contactCount > 0) return "Contactos: " + contactCount;
        return "Seleccione contactos";
      case "email":
        return (data.subject || "Sin asunto");
      case "email_template":
        return "Plantilla: " + truncate((this.getTemplateName(data.template_id) || "—"), 23);
      case "delay":
        var delayUnit = data.unit || "minutes";
        var delayLabel =
          delayUnit === "seconds" ? "segundos" :
          delayUnit === "hours" ? "horas" :
          delayUnit === "days" ? "dias" :
          "minutos";
        return (data.amount || 0) + " " + delayLabel;
      case "reminder":
        return "Escucha el recordatorio";
      case "wait_until":
        return data.datetime || "Fecha/hora";
      case "assign_owner":
        return "Usuario: " + (this.getUserName(data.user_id) || "—");
      case "update_field":
        return (data.field || "campo") + " = " + (data.value || "");
      case "related_item":
        var typeName = this.getWorkPackageTypeName(data.work_package_type_id) || data.work_package_type_name || "Seleccione tipo";
        var mappingLabel = (data.related_name_label || data.related_name_source || "").toString().trim();
        if (mappingLabel) {
          return "Tipo: " + typeName + " - " + mappingLabel;
        }
        return "Tipo: " + typeName;
      case "related_board":
        var boardName = this.getBoardName(data.board_id) || "Seleccione tablero";
        var listName = this.getBoardListName(data.board_id, data.query_id) || "Seleccione lista";
        return "Tablero: " + boardName + " - " + listName;
      case "add_tag":
        return data.tags || "Tags";
      case "webhook":
        return data.url || "URL";
      default:
        return "";
    }
  };

  FlowBuilder.prototype.nodeOutputs = function (node) {
    if (node.type === "macro") {
      return [{ label: "Conectar", path: "default" }];
    }
    if (node.type === "filter" || node.type === "condition" || node.type === "branch" || node.type === "transform_json") {
      return [
        { label: node.type === "transform_json" ? "Nuevo" : "Si", path: "yes" },
        { label: node.type === "transform_json" ? "Duplicado" : "No", path: "no" }
      ];
    }
    return [{ label: "Conectar", path: "default" }];
  };

  FlowBuilder.prototype.buildFieldOptions = function () {
    var base = [
      { value: "first_name", label: "Nombre", type: "text" },
      { value: "last_name", label: "Apellidos", type: "text" },
      { value: "email", label: "Email", type: "text" },
      { value: "phone", label: "Telefono", type: "text" },
      { value: "status", label: "Estado", type: "text" },
      { value: "source", label: "Origen", type: "text" },
      { value: "country", label: "Pais", type: "text" },
      { value: "city", label: "Ciudad", type: "text" },
      { value: "company", label: "Empresa", type: "text" },
      { value: "job_title", label: "Cargo", type: "text" },
      { value: "points", label: "Puntos", type: "number" },
      { value: "tags", label: "Tags", type: "text" },
      { value: "assigned_to_id", label: "Responsable", type: "select" },
      { value: "last_interaction_at", label: "Ultima interaccion", type: "datetime" },
      { value: "birthday", label: "Nacimiento", type: "date" }
    ];

    var custom = (this.contactFields || []).map(function (field) {
      return {
        value: "custom:" + field.name,
        label: "Custom: " + field.name,
        type: field.field_type || "text",
        options: field.options || [],
        customName: field.name
      };
    });

    return base.concat(custom);
  };

  FlowBuilder.prototype.macroPayloadOptions = function () {
    return [
      { key: "first_name", label: "Nombres" },
      { key: "last_name", label: "Apellidos" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Telefono" },
      { key: "chat_id", label: "Chat ID" },
      { key: "contact_id", label: "Contact ID" }
    ];
  };

  FlowBuilder.prototype.whatsappAiAgentOptions = function () {
    return [
      { key: "openproject-agent", label: "openproject-agent" },
      { key: "personal-assistant", label: "personal-assistant" },
      { key: "chatbot", label: "chatbot" },
      { key: "research-assistant", label: "research-assistant" },
      { key: "rag-assistant", label: "rag-assistant" },
      { key: "command-agent", label: "command-agent" },
      { key: "agente-call-center", label: "agente-call-center" },
      { key: "bg-task-agent", label: "bg-task-agent" },
      { key: "langgraph-supervisor-agent", label: "langgraph-supervisor-agent" },
      { key: "langgraph-supervisor-hierarchy-agent", label: "langgraph-supervisor-hierarchy-agent" },
      { key: "interrupt-agent", label: "interrupt-agent" },
      { key: "knowledge-base-agent", label: "knowledge-base-agent" },
      { key: "github-mcp-agent", label: "github-mcp-agent" }
    ];
  };

  FlowBuilder.prototype.whatsappRequiredOptions = function () {
    return [
      { key: "chat_id", label: "Chat ID" },
      { key: "contact_id", label: "Contact ID" }
    ];
  };

  FlowBuilder.prototype.emailTemplateRequiredOptions = function () {
    return [
      { key: "email", label: "Email" }
    ];
  };

  FlowBuilder.prototype.emailTemplateOptionalOptions = function () {
    return [
      { key: "first_name", label: "Nombres" },
      { key: "last_name", label: "Apellidos" },
      { key: "phone", label: "Telefono" }
    ];
  };

  FlowBuilder.prototype.getFieldMeta = function (fieldValue) {
    var list = this.buildFieldOptions();
    return list.find(function (item) { return item.value === fieldValue; }) || { type: "text" };
  };

  FlowBuilder.prototype.getTemplateName = function (id) {
    var tpl = (this.templates || []).find(function (t) { return String(t.id) === String(id); });
    return tpl ? tpl.name : "";
  };

  FlowBuilder.prototype.getWhatsappTemplate = function (id) {
    return (this.whatsappTemplates || []).find(function (t) { return String(t.id) === String(id); }) || null;
  };

  FlowBuilder.prototype.getWhatsappTemplateName = function (id) {
    var tpl = this.getWhatsappTemplate(id);
    return tpl ? tpl.name : "";
  };

  FlowBuilder.prototype.getUserName = function (id) {
    var user = (this.users || []).find(function (u) { return String(u.id) === String(id); });
    return user ? user.name : "";
  };

  FlowBuilder.prototype.getWorkPackageTypeName = function (id) {
    var type = (this.workPackageTypes || []).find(function (item) { return String(item.id) === String(id); });
    return type ? type.name : "";
  };

  FlowBuilder.prototype.getBoardName = function (id) {
    var board = (this.boards || []).find(function (item) { return String(item.id) === String(id); });
    return board ? board.name : "";
  };

  FlowBuilder.prototype.getBoardListName = function (boardId, listId) {
    var lists = this.boardLists && boardId ? this.boardLists[String(boardId)] || this.boardLists[boardId] : [];
    if (!lists || !lists.length) return "";
    var list = lists.find(function (item) { return String(item.id) === String(listId); });
    return list ? list.name : "";
  };

  FlowBuilder.prototype.buildValueInput = function (fieldValue, value) {
    var meta = this.getFieldMeta(fieldValue);
    var input;
    if (meta.type === "select") {
      input = document.createElement("select");
      input.className = "op-email-email--flow-select";
      var empty = document.createElement("option");
      empty.value = "";
      input.appendChild(empty);
      if (fieldValue === "assigned_to_id") {
        this.users.forEach(function (user) {
          var option = document.createElement("option");
          option.value = user.id;
          option.textContent = user.name;
          input.appendChild(option);
        });
      } else if (meta.options) {
        meta.options.forEach(function (opt) {
          var option = document.createElement("option");
          option.value = String(opt);
          option.textContent = String(opt);
          input.appendChild(option);
        });
      }
      input.value = value || "";
      return input;
    }

    if (meta.type === "multiselect") {
      input = document.createElement("input");
      input.className = "op-email-email--flow-input";
      input.placeholder = "Valores separados por coma";
      input.value = Array.isArray(value) ? value.join(", ") : (value || "");
      return input;
    }

    if (meta.type === "boolean") {
      input = document.createElement("select");
      input.className = "op-email-email--flow-select";
      ["", "true", "false"].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt;
        option.textContent = opt === "" ? "" : (opt === "true" ? "Si" : "No");
        input.appendChild(option);
      });
      input.value = value || "";
      return input;
    }

    input = document.createElement("input");
    input.className = "op-email-email--flow-input";
    if (meta.type === "number") {
      input.type = "number";
    } else if (meta.type === "date") {
      input.type = "date";
    } else if (meta.type === "datetime") {
      input.type = "datetime-local";
    } else {
      input.type = "text";
    }
    input.value = value || "";
    return input;
  };

  FlowBuilder.prototype.selectNode = function (id) {
    this.selectedNodeId = id;
    this.render();
  };

  FlowBuilder.prototype.addEdge = function (sourceId, targetId, path) {
    var existing = this.edges.find(function (edge) {
      return edge.source === sourceId && edge.target === targetId && edge.path === path;
    });
    if (existing) return;
    this.edges.push({ id: randomId("edge"), source: sourceId, target: targetId, path: path || "default" });
    this.markDirty();
  };

  FlowBuilder.prototype.renderEdges = function () {
    var svg = this.edgesLayer;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    if (!this.edgeButtonsLayer) {
      var viewport = this.viewport || this.canvas;
      if (viewport) {
        this.edgeButtonsLayer = document.createElement("div");
        this.edgeButtonsLayer.className = "op-email-email--flow-edge-buttons";
        this.edgeButtonsLayer.setAttribute("data-flow-edge-buttons", "true");
        viewport.appendChild(this.edgeButtonsLayer);
      }
    }
    if (this.edgeButtonsLayer) {
      while (this.edgeButtonsLayer.firstChild) this.edgeButtonsLayer.removeChild(this.edgeButtonsLayer.firstChild);
    }

    var viewport = this.viewport || this.canvas;
    if (viewport) {
      var width = Math.max(viewport.clientWidth, 1);
      var height = Math.max(viewport.clientHeight, 1);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.style.width = width + "px";
      svg.style.height = height + "px";
      svg.removeAttribute("viewBox");
      svg.removeAttribute("preserveAspectRatio");
    }

    var self = this;
    var viewportRect = viewport ? viewport.getBoundingClientRect() : null;
    this.edges.forEach(function (edge) {
      var source = self.nodes.find(function (node) { return node.id === edge.source; });
      var target = self.nodes.find(function (node) { return node.id === edge.target; });
      if (!source || !target) return;
      var sx = source.x + 80;
      var sy = source.y + 60;
      var tx = target.x + 80;
      var ty = target.y;

      var sourceEl = self.inner ? self.inner.querySelector('[data-flow-node-id="' + edge.source + '"]') : null;
      var targetEl = self.inner ? self.inner.querySelector('[data-flow-node-id="' + edge.target + '"]') : null;
      var connector = self.inner ? self.inner.querySelector(
        '[data-flow-connector="true"][data-flow-connector-node-id="' + edge.source + '"][data-flow-connector-path="' + edge.path + '"]'
      ) : null;
      if (connector && viewportRect) {
        var cRect = connector.getBoundingClientRect();
        sx = cRect.left - viewportRect.left + (cRect.width / 2);
        sy = cRect.top - viewportRect.top + (cRect.height / 2);
      }

      if (targetEl && viewportRect) {
        var tRect = targetEl.getBoundingClientRect();
        tx = tRect.left - viewportRect.left + (tRect.width / 2);
        ty = tRect.top - viewportRect.top;
      }
      var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("data-edge-id", edge.id);

      var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("fill", "none");
      var color = edge.path === "yes" ? "#22c55e" : edge.path === "no" ? "#ef4444" : "#94a3b8";
      pathEl.setAttribute("stroke", color);
      pathEl.setAttribute("stroke-width", "2");
      var midY = (sy + ty) / 2;
      var d = "M " + sx + " " + sy + " C " + sx + " " + midY + " " + tx + " " + midY + " " + tx + " " + ty;
      pathEl.setAttribute("d", d);

      group.appendChild(pathEl);
      svg.appendChild(group);

      if (self.edgeButtonsLayer) {
        var midX = (sx + tx) / 2;
        var midY = (sy + ty) / 2;
        var htmlButton = document.createElement("button");
        htmlButton.type = "button";
        htmlButton.className = "op-email-email--flow-edge-button";
        htmlButton.setAttribute("data-flow-edge-button", "true");
        htmlButton.style.left = midX + "px";
        htmlButton.style.top = midY + "px";
        htmlButton.textContent = "X";
        htmlButton.addEventListener("click", function (event) {
          event.stopPropagation();
          event.preventDefault();
          if (window.console && typeof window.console.log === "function") {
            window.console.log("[Flows] edge.remove.click", { edge_id: edge.id });
          }
          self.edges = self.edges.filter(function (item) { return item.id !== edge.id; });
          self.markDirty();
          self.scheduleSave();
          self.renderEdges();
        });
        self.edgeButtonsLayer.appendChild(htmlButton);
      }
    });
  };

  FlowBuilder.prototype.resolveNodeHistoryItems = function (node, options) {
    var histories = this.nodeHistories || {};
    var keys = Object.keys(histories);
    var opts = options || {};
    var nodeId = node && node.id ? String(node.id) : "";
    var templateId = opts.templateId ? String(opts.templateId) : "";

    if (!keys.length) return [];

    if (nodeId && Array.isArray(histories[nodeId]) && histories[nodeId].length) {
      return histories[nodeId].slice();
    }

    var normalizedNodeId = nodeId.toLowerCase();
    var compactNodeId = normalizedNodeId.replace(/[^a-z0-9_]/g, "");

    var matchedKey = "";
    if (nodeId) {
      matchedKey = keys.find(function (key) {
        var keyStr = String(key);
        var normalizedKey = keyStr.toLowerCase();
        var compactKey = normalizedKey.replace(/[^a-z0-9_]/g, "");
        if (normalizedKey === normalizedNodeId) return true;
        if (compactNodeId && compactKey === compactNodeId) return true;
        if (normalizedKey.indexOf(normalizedNodeId) !== -1) return true;
        if (normalizedNodeId.indexOf(normalizedKey) !== -1) return true;
        if (compactNodeId && compactKey.indexOf(compactNodeId) !== -1) return true;
        if (compactNodeId && compactNodeId.indexOf(compactKey) !== -1) return true;
        return false;
      }) || "";
    }

    if (!matchedKey && node && node.type === "delay") {
      var delayKeys = keys.filter(function (key) { return String(key).indexOf("delay_") === 0; });
      if (delayKeys.length === 1) {
        matchedKey = delayKeys[0];
      } else if (delayKeys.length > 1 && compactNodeId) {
        matchedKey = delayKeys.find(function (key) {
          return String(key).toLowerCase().replace(/[^a-z0-9_]/g, "").indexOf(compactNodeId) !== -1;
        }) || "";
      }
    }

    if (matchedKey && Array.isArray(histories[matchedKey])) {
      return histories[matchedKey].slice();
    }

    if (templateId) {
      var collected = [];
      keys.forEach(function (key) {
        var list = Array.isArray(histories[key]) ? histories[key] : [];
        list.forEach(function (entry) {
          var entryMeta = entry && entry.meta ? entry.meta : {};
          if (String(entryMeta.template_id || "") === templateId) {
            collected.push(entry);
          }
        });
      });
      if (collected.length) return collected;
    }

    return [];
  };

  FlowBuilder.prototype.renderProperties = function () {
    if (!this.propertiesBody || !this.propertiesEmpty) return;
    this.propertiesBody.innerHTML = "";
    if (!this.selectedNodeId) {
      this.propertiesEmpty.style.display = "block";
      this.propertiesBody.style.display = "none";
      return;
    }
    var node = this.nodes.find(function (n) { return n.id === this.selectedNodeId; }.bind(this));
    if (!node) {
      this.propertiesEmpty.style.display = "block";
      this.propertiesBody.style.display = "none";
      return;
    }
    if (window.console && typeof window.console.log === "function") {
      window.console.log("[Flows] renderProperties", { node_id: node.id, node_type: node.type });
    }
    this.propertiesEmpty.style.display = "none";
    this.propertiesBody.style.display = "grid";

    var data = node.data || {};
    var self = this;

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

    var fieldOptions = this.buildFieldOptions();

    if (node.type === "webhook_input") {
      if (typeof self.renderWebhookInputPanel === "function") {
        self.renderWebhookInputPanel(node, data);
        return;
      }
    }

    if (node.type === "transform_json") {
      if (typeof self.renderTransformJsonPanel === "function") {
        self.renderTransformJsonPanel(node, data, fieldOptions);
        return;
      }
    }

    if (node.type === "conversation_ai") {
      var aiTitle = document.createElement("div");
      aiTitle.className = "op-email-email--panel-title";
      aiTitle.textContent = "Conversaciones a IA";
      self.propertiesBody.appendChild(aiTitle);

      var aiShowWrap = document.createElement("div");
      aiShowWrap.className = "op-email-email--flow-toggle-row";

      var aiShowLabel = document.createElement("span");
      aiShowLabel.className = "op-email-email--flow-toggle-label";
      aiShowLabel.textContent = "Mostrar IA en tarjeta de chat";

      var aiShowBtn = document.createElement("button");
      aiShowBtn.type = "button";
      aiShowBtn.className = "op-email-email--flow-toggle";
      aiShowBtn.innerHTML =
        '<span class="op-email-email--flow-toggle-text op-email-email--flow-toggle-text-on">ON</span>' +
        '<span class="op-email-email--flow-toggle-knob" aria-hidden="true"></span>' +
        '<span class="op-email-email--flow-toggle-text op-email-email--flow-toggle-text-off">OFF</span>';

      var aiIsOn = data.show_ai_in_chat === true || data.show_ai_in_chat === "true";
      function renderAiToggle() {
        aiShowBtn.classList.toggle("is-on", aiIsOn);
      }

      renderAiToggle();
      aiShowBtn.addEventListener("click", function () {
        aiIsOn = !aiIsOn;
        data.show_ai_in_chat = aiIsOn;
        renderAiToggle();
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Flows] conversation_ai show_ai_in_chat changed", {
            node_id: node.id,
            flow_id: self.currentFlowId,
            show_ai_in_chat: data.show_ai_in_chat
          });
        }
        self.render();
        self.markDirty();
        self.save();
      });

      aiShowWrap.appendChild(aiShowLabel);
      aiShowWrap.appendChild(aiShowBtn);
      addField("", aiShowWrap);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
      self.propertiesBody.appendChild(historyTitle);

      var historyList = document.createElement("div");
      historyList.className = "op-email-email--flow-webhook-history-list";
      var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Flows] delay history init", {
          node_id: node.id,
          direct_count: historyItems.length,
          history_keys: self.nodeHistories ? Object.keys(self.nodeHistories) : []
        });
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
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Flows] delay history fallback", {
            node_id: node.id,
            matched_key: matchedKey,
            count: historyItems.length
          });
        }
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
      if (self.nodeHistories && node.type === "delay") {
        if (!historyItems.length) {
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var meta = itemData.meta || {};
          var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
          var meta = itemData.meta || {};
          var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
          var meta = itemData.meta || {};
          var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
          var meta = itemData.meta || {};
          var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
          var meta = itemData.meta || {};
          var isReprogrammed = meta.reprogrammed_from && meta.reprogrammed_to;
          var meta = itemData.meta || {};
          var isReprogrammed = meta && (meta.reprogrammed_from && meta.reprogrammed_to);
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
          var payload = itemData.payload ||
            itemData.data ||
            itemData.inputs ||
            itemData.params ||
            (itemData.meta && itemData.meta.payload) ||
            itemData.meta;
          var contact = itemData.contact || (itemData.meta && itemData.meta.contact);
          if (payload && typeof payload === "object") {
            if (payload.message_body !== undefined && payload.message_body !== "") details.push("Mensaje: " + payload.message_body);
            if (payload.message_type !== undefined && payload.message_type !== "") details.push("Tipo: " + payload.message_type);
            if (payload.message_id !== undefined) details.push("Mensaje ID: " + payload.message_id);
            if (payload.waha_id !== undefined && payload.waha_id !== "") details.push("WAHA ID: " + payload.waha_id);
            if (payload.chat_id !== undefined) details.push("Chat ID: " + payload.chat_id);
            if (payload.contact_id !== undefined) details.push("Contact ID: " + payload.contact_id);
            if (payload.first_name !== undefined || payload.last_name !== undefined) {
              var nameParts = [];
              if (payload.first_name) nameParts.push(payload.first_name);
              if (payload.last_name) nameParts.push(payload.last_name);
              if (nameParts.length) details.push("Contacto: " + nameParts.join(" "));
            }
            if (payload.email) details.push("Email: " + payload.email);
            if (payload.phone) details.push("Telefono: " + payload.phone);
          }
          if (contact && typeof contact === "object") {
            var contactLines = [];
            var contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
            if (contactName) contactLines.push("Nombre: " + contactName);
            if (contact.email) contactLines.push("Email: " + contact.email);
            if (contact.phone) contactLines.push("Telefono: " + contact.phone);
            if (contact.company) contactLines.push("Empresa: " + contact.company);
            if (contact.job_title) contactLines.push("Cargo: " + contact.job_title);
            if (contact.city || contact.country) {
              contactLines.push("Ubicacion: " + [contact.city, contact.country].filter(Boolean).join(", "));
            }
            if (contact.status) contactLines.push("Estado: " + contact.status);
            if (contact.source) contactLines.push("Origen: " + contact.source);
            if (contact.tags) contactLines.push("Tags: " + JSON.stringify(contact.tags));
            if (contact.custom_fields) contactLines.push("Custom: " + JSON.stringify(contact.custom_fields));
            if (contactLines.length) {
              details.push("Contacto:");
              contactLines.forEach(function (line) { details.push(line); });
            }
          }
          if (itemData.error) details.push("Error: " + itemData.error);
          if (!details.length) details.push("Sin datos");
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

      return;
    }

    if (node.type === "whatsapp_ai") {
      var iaTitle = document.createElement("div");
      iaTitle.className = "op-email-email--panel-title";
      iaTitle.textContent = "Inteligencia Artificial";
      self.propertiesBody.appendChild(iaTitle);

      var serverInput = document.createElement("input");
      serverInput.type = "text";
      serverInput.className = "op-email-email--flow-input";
      serverInput.placeholder = "https://servidor-agente";
      serverInput.value = data.server_url || "";
      var syncServer = function () {
        data.server_url = serverInput.value;
        self.markDirty();
        self.scheduleSave();
      };
      serverInput.addEventListener("change", syncServer);
      serverInput.addEventListener("input", syncServer);
      addField("URL servidor", serverInput);

      var userInput = document.createElement("input");
      userInput.type = "text";
      userInput.className = "op-email-email--flow-input";
      userInput.placeholder = "Usuario Basic Auth";
      userInput.value = data.basic_username || "";
      var syncUser = function () {
        data.basic_username = userInput.value;
        self.markDirty();
        self.scheduleSave();
      };
      userInput.addEventListener("change", syncUser);
      userInput.addEventListener("input", syncUser);
      addField("Usuario (Basic Auth)", userInput);

      var passInput = document.createElement("input");
      passInput.type = "password";
      passInput.className = "op-email-email--flow-input";
      passInput.placeholder = "Clave Basic Auth";
      passInput.value = data.basic_password || "";
      var syncPass = function () {
        data.basic_password = passInput.value;
        self.markDirty();
        self.scheduleSave();
      };
      passInput.addEventListener("change", syncPass);
      passInput.addEventListener("input", syncPass);
      addField("Clave (Basic Auth)", passInput);

      var saveWrap = document.createElement("div");
      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "op-email-email--button is-secondary";
      saveBtn.textContent = "Guardar credenciales";
      saveWrap.appendChild(saveBtn);
      addField("", saveWrap);

      var agentStatus = document.createElement("div");
      agentStatus.className = "op-email-email--flow-help";
      if (Array.isArray(data.available_agents) && data.available_agents.length) {
        agentStatus.textContent = "Agentes cargados: " + data.available_agents.length;
      } else {
        agentStatus.textContent = "Guarda las credenciales para cargar agentes.";
      }
      addField("", agentStatus);

      var agentConnected = document.createElement("div");
      agentConnected.className = "op-email-email--flow-help op-email-email--flow-help-success";
      agentConnected.innerHTML =
        '<span class="op-email-email--flow-help-icon" aria-hidden="true">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check-circle" viewBox="0 0 16 16">' +
        '<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>' +
        '<path d="m10.97 4.97-.02.022-3.473 4.425-2.093-2.094a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05"/>' +
        "</svg></span>" +
        "<span>Contectado</span>";
      agentConnected.style.display = "none";
      addField("", agentConnected);

      var agentSelect = document.createElement("select");
      agentSelect.className = "op-email-email--flow-select";
      var agentPlaceholder = document.createElement("option");
      agentPlaceholder.value = "";
      agentPlaceholder.textContent = "Seleccione un agente";
      agentPlaceholder.disabled = true;
      agentPlaceholder.selected = true;
      agentSelect.appendChild(agentPlaceholder);
      agentSelect.addEventListener("change", function () {
        data.agent_id = agentSelect.value;
        self.markDirty();
        self.scheduleSave();
      });
      addField("Agente", agentSelect);

      function setAgentOptions(options) {
        while (agentSelect.firstChild) agentSelect.removeChild(agentSelect.firstChild);
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Seleccione un agente";
        placeholder.disabled = true;
        placeholder.selected = true;
        agentSelect.appendChild(placeholder);
        options.forEach(function (opt) {
          var option = document.createElement("option");
          option.value = opt.key;
          option.textContent = opt.label || opt.key;
          if (opt.title) option.title = opt.title;
          agentSelect.appendChild(option);
        });
        if (options.length > 0) {
          if (data.agent_id && options.some(function (opt) { return opt.key === data.agent_id; })) {
            agentSelect.value = data.agent_id;
          }
        }
      }

      function loadAgentOptions() {
        var url = (serverInput.value || "").toString().trim();
        var user = (userInput.value || "").toString().trim();
        var pass = (passInput.value || "").toString();
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Flows][IA] load agents", {
            url: url,
            user: user,
            pass_present: pass.length > 0
          });
        }
        if (!url || !user || !pass) {
          agentStatus.textContent = "Completa URL, usuario y clave, luego guarda.";
          setAgentOptions([]);
          agentConnected.style.display = "none";
          return;
        }
        data.server_url = url;
        data.basic_username = user;
        data.basic_password = pass;
        if (!self.iaAgentsUrl) {
          agentStatus.textContent = "No hay endpoint para cargar agentes.";
          setAgentOptions([]);
          agentConnected.style.display = "none";
          return;
        }
        agentStatus.textContent = "Cargando agentes...";
        var token = qs("meta[name='csrf-token']");
        fetch(self.iaAgentsUrl, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": token ? token.content : ""
          },
          body: JSON.stringify({
            server_url: url,
            username: user,
            password: pass
          })
        })
          .then(function (response) {
            return response.text().then(function (text) {
              return { status: response.status, ok: response.ok, text: text };
            });
          })
          .then(function (result) {
            if (window.console && typeof window.console.log === "function") {
              window.console.log("[Flows][IA] ia_agents response", result);
            }
            var payload = {};
            try {
              payload = result.text ? JSON.parse(result.text) : {};
            } catch (error) {
              payload = {};
            }
            if (window.console && typeof window.console.log === "function") {
              window.console.log("[Flows][IA] ia_agents payload", payload);
            }
            var agents = payload && payload.agents ? payload.agents : [];
            if (!Array.isArray(agents) || !agents.length) {
              agentStatus.textContent = payload && payload.error ? payload.error : (result.ok ? "No hay agentes disponibles." : ("HTTP " + result.status));
              setAgentOptions([]);
              agentConnected.style.display = "none";
              return;
            }
            var normalized = agents.map(function (agent) {
              var key = agent.key || agent.id || agent.name;
              var desc = agent.description || "";
              return { key: key, label: key, title: desc };
            }).filter(function (agent) { return agent.key; });
            data.available_agents = normalized;
            self.iaAgentsCache[node.id] = normalized;
            if (!data.agent_id && normalized.length) {
              data.agent_id = normalized[0].key;
            }
            data.ai_agents_loaded_at = new Date().toISOString();
            self.markDirty();
            self.scheduleSave();
            agentStatus.textContent = "Agentes cargados: " + normalized.length;
            agentConnected.style.display = normalized.length ? "" : "none";
            if (self.selectedNodeId === node.id) {
              self.renderProperties();
              return;
            }
            setAgentOptions(normalized);
          })
          .catch(function () {
            agentStatus.textContent = "No se pudo cargar agentes. Verifica URL y credenciales.";
            setAgentOptions([]);
            agentConnected.style.display = "none";
          });
      }

      saveBtn.addEventListener("click", function () {
        data.server_url = (serverInput.value || "").toString().trim();
        data.basic_username = (userInput.value || "").toString().trim();
        data.basic_password = (passInput.value || "").toString();
        self.markDirty();
        self.save();
        loadAgentOptions();
      });

      if (Array.isArray(data.available_agents) && data.available_agents.length) {
        setAgentOptions(data.available_agents);
        agentStatus.textContent = "Agentes cargados: " + data.available_agents.length;
        agentConnected.style.display = "";
      } else if (self.iaAgentsCache && Array.isArray(self.iaAgentsCache[node.id]) && self.iaAgentsCache[node.id].length) {
        setAgentOptions(self.iaAgentsCache[node.id]);
        agentStatus.textContent = "Agentes cargados: " + self.iaAgentsCache[node.id].length;
        agentConnected.style.display = "";
      } else {
        setAgentOptions([]);
        agentConnected.style.display = "none";
        var hasCreds = (data.server_url || "").toString().trim() &&
          (data.basic_username || "").toString().trim() &&
          (data.basic_password || "").toString();
        if (hasCreds && !data.ai_agents_loading) {
          data.ai_agents_loading = true;
          setTimeout(function () {
            loadAgentOptions();
            data.ai_agents_loading = false;
          }, 0);
        }
      }

      var intervalInput = document.createElement("input");
      intervalInput.type = "number";
      intervalInput.min = "5";
      intervalInput.step = "1";
      intervalInput.className = "op-email-email--flow-input";
      intervalInput.placeholder = "5";
      intervalInput.value = data.send_interval || "";
      var normalizeInterval = function () {
        var value = toNumber(intervalInput.value, 0);
        if (value > 0 && value < 5) value = 5;
        intervalInput.value = value > 0 ? value : "";
        data.send_interval = value > 0 ? value : "";
        self.markDirty();
        self.scheduleSave();
      };
      intervalInput.addEventListener("change", normalizeInterval);
      intervalInput.addEventListener("blur", normalizeInterval);
      addField("Intervalo (segundos)", intervalInput);

      var typingWrap = document.createElement("label");
      typingWrap.className = "op-email-email--flow-checkbox";
      var typingInput = document.createElement("input");
      typingInput.type = "checkbox";
      typingInput.checked = data.start_typing === true || data.start_typing === "true";
      typingInput.addEventListener("change", function () {
        data.start_typing = typingInput.checked;
        self.markDirty();
        self.scheduleSave();
      });
      var typingText = document.createElement("span");
      typingText.textContent = "Mostrar escribiendo...";
      typingWrap.appendChild(typingInput);
      typingWrap.appendChild(typingText);
      addField("", typingWrap);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
      self.propertiesBody.appendChild(historyTitle);

      var historyList = document.createElement("div");
      historyList.className = "op-email-email--flow-webhook-history-list";
      var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
      if (!historyItems.length && self.nodeHistories && node.type === "whatsapp") {
        var fallbackKey = null;
        if (String(node.id || "").indexOf("whatsapp_template_") === 0) {
          fallbackKey = String(node.id).replace("whatsapp_template_", "whatsapp_");
        }
        if (fallbackKey && self.nodeHistories[fallbackKey]) {
          historyItems = self.nodeHistories[fallbackKey] || [];
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var meta = itemData.meta || {};
          var isReprogrammed = meta && (meta.reprogrammed_from && meta.reprogrammed_to);
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
          var meta = itemData.meta || {};
          if (meta.agent_id) details.push("Agente: " + meta.agent_id);
          if (meta.server_url) details.push("Servidor: " + meta.server_url);
          if (meta.auth_user) details.push("Usuario: " + meta.auth_user);
          if (meta.message) details.push("Mensaje: " + meta.message);
          if (meta.response) details.push("Respuesta: " + meta.response);
          if (meta.chat_id) details.push("Chat ID: " + meta.chat_id);
          if (meta.contact_id) details.push("Contact ID: " + meta.contact_id);
          if (itemData.error) details.push("Error: " + itemData.error);
          if (!details.length) details.push("Sin datos");
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
      return;
    }

    if (node.type === "macro") {
      var title = document.createElement("div");
      title.className = "op-email-email--panel-title";
      title.textContent = "Macro Contactos";
      self.propertiesBody.appendChild(title);

      var showWrap = document.createElement("div");
      showWrap.className = "op-email-email--flow-toggle-row";

      var showLabel = document.createElement("span");
      showLabel.className = "op-email-email--flow-toggle-label";
      showLabel.textContent = "Mostrar en tarjeta de chat";

      var showBtn = document.createElement("button");
      showBtn.type = "button";
      showBtn.className = "op-email-email--flow-toggle";
      showBtn.innerHTML =
        '<span class="op-email-email--flow-toggle-text op-email-email--flow-toggle-text-on">ON</span>' +
        '<span class="op-email-email--flow-toggle-knob" aria-hidden="true"></span>' +
        '<span class="op-email-email--flow-toggle-text op-email-email--flow-toggle-text-off">OFF</span>';

      var isOn = data.show_in_chat === true || data.show_in_chat === "true";
      function renderToggle() {
        showBtn.classList.toggle("is-on", isOn);
      }

      renderToggle();
      showBtn.addEventListener("click", function () {
        isOn = !isOn;
        data.show_in_chat = isOn;
        renderToggle();
        if (window.console && typeof window.console.log === "function") {
          window.console.log("[Flows] macro show_in_chat changed", {
            node_id: node.id,
            flow_id: self.currentFlowId,
            show_in_chat: data.show_in_chat
          });
        }
        self.render();
        self.markDirty();
        self.save();
      });

      showWrap.appendChild(showLabel);
      showWrap.appendChild(showBtn);
      addField("", showWrap);

      var chipsWrap = document.createElement("div");
      chipsWrap.className = "op-email-email--flow-node-chips";
      var chipsLabel = document.createElement("div");
      chipsLabel.className = "op-email-email--flow-node-chips-label";
      chipsLabel.textContent = "Datos a enviar";
      chipsWrap.appendChild(chipsLabel);

      var chips = document.createElement("div");
      chips.className = "op-email-email--flow-node-chips-row";
      var options = self.macroPayloadOptions();
      var selected = data && Array.isArray(data.payload_keys) ? data.payload_keys : [];
      options.forEach(function (opt) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "op-email-email--flow-node-chip";
        if (selected.indexOf(opt.key) >= 0) chip.classList.add("is-active");
        chip.textContent = opt.label;
        chip.addEventListener("click", function () {
          var current = data && Array.isArray(data.payload_keys) ? data.payload_keys.slice() : [];
          var idx = current.indexOf(opt.key);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(opt.key);
          }
          data.payload_keys = current;
          self.render();
          self.markDirty();
          self.save();
        });
        chips.appendChild(chip);
      });
      chipsWrap.appendChild(chips);
      addField("", chipsWrap);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var meta = itemData.meta || {};
          var isReprogrammed = meta && (meta.reprogrammed_from && meta.reprogrammed_to);
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
          var outputPath = itemData.output_path || itemData.path || itemData.output || itemData.result_path;
          var payload = itemData.payload ||
            itemData.data ||
            itemData.inputs ||
            itemData.params ||
            (itemData.meta && itemData.meta.payload) ||
            itemData.meta;
          if (payload && typeof payload === "object") {
            var nameValue = payload.first_name !== undefined ? payload.first_name : "";
            var emailValue = payload.email !== undefined ? payload.email : "";
            var phoneValue = payload.phone !== undefined ? payload.phone : "";
            if (outputPath) details.push("Salida: " + outputPath);
            if (nameValue !== "") details.push("Nombres: " + nameValue);
            if (phoneValue !== "") details.push("ID chat: " + phoneValue);
            if (emailValue !== "") details.push("Email: " + emailValue);
            var payloadKeys = Object.keys(payload || {});
            if (payloadKeys.length) {
              details.push("Datos:");
              payloadKeys.sort().forEach(function (key) {
                var rawValue = payload[key];
                var valueText = "";
                if (rawValue === null || rawValue === undefined) {
                  valueText = "";
                } else if (typeof rawValue === "object") {
                  try {
                    valueText = JSON.stringify(rawValue);
                  } catch (error) {
                    valueText = String(rawValue);
                  }
                } else {
                  valueText = String(rawValue);
                }
                details.push(key + ": " + valueText);
              });
            }
            if (payload.chat_id !== undefined) details.push("Chat ID: " + payload.chat_id);
            if (payload.contact_id !== undefined) details.push("Contact ID: " + payload.contact_id);
          } else if (payload) {
            details.push("Datos: " + payload);
          }
          if (itemData.error) details.push("Error: " + itemData.error);
          if (!details.length) details.push("Sin datos");
          details.forEach(function (line) {
            var div = document.createElement("div");
            if (line.indexOf("<svg") !== -1) {
              div.innerHTML = line;
            } else {
              div.textContent = line;
            }
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
      return;
    }

    if (node.type === "filter" || node.type === "branch") {
      var field = document.createElement("select");
      field.className = "op-email-email--flow-select";
      fieldOptions.forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        field.appendChild(option);
      });
      field.value = data.field || "status";
      field.addEventListener("change", function () {
        data.field = field.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Campo", field);

      var operator = document.createElement("select");
      operator.className = "op-email-email--flow-select";
      ["equals", "contains", "starts_with", "ends_with", "greater_than", "less_than", "is_blank", "is_not_blank"].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        operator.appendChild(option);
      });
      operator.value = data.operator || "equals";
      operator.addEventListener("change", function () {
        data.operator = operator.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Operador", operator);

      var valueInput = self.buildValueInput(field.value, data.value || "");
      var updateValue = function () {
        data.value = valueInput.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      };
      valueInput.addEventListener("input", updateValue);
      valueInput.addEventListener("change", updateValue);
      addField("Valor", valueInput);
    } else if (node.type === "condition") {
      var mode = document.createElement("select");
      mode.className = "op-email-email--flow-select";
      ["all", "any"].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt;
        option.textContent = opt === "all" ? "Todas (AND)" : "Cualquiera (OR)";
        mode.appendChild(option);
      });
      mode.value = data.mode || "all";
      mode.addEventListener("change", function () {
        data.mode = mode.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Modo", mode);

      var rules = Array.isArray(data.rules) ? data.rules : [];
      if (!rules.length) {
        rules.push({ field: "status", operator: "equals", value: "" });
        data.rules = rules;
      }

      rules.forEach(function (rule, idx) {
        var ruleWrap = document.createElement("div");
        ruleWrap.className = "op-email-email--flow-rule";

        var ruleField = document.createElement("select");
        ruleField.className = "op-email-email--flow-select";
        fieldOptions.forEach(function (opt) {
          var option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          ruleField.appendChild(option);
        });
        ruleField.value = rule.field || "status";
        ruleField.addEventListener("change", function () {
          rule.field = ruleField.value;
          self.render();
          self.markDirty();
          self.scheduleSave();
        });

        var ruleOperator = document.createElement("select");
        ruleOperator.className = "op-email-email--flow-select";
        ["equals", "contains", "starts_with", "ends_with", "greater_than", "less_than", "is_blank", "is_not_blank"].forEach(function (opt) {
          var option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          ruleOperator.appendChild(option);
        });
        ruleOperator.value = rule.operator || "equals";
        ruleOperator.addEventListener("change", function () {
          rule.operator = ruleOperator.value;
          self.render();
          self.markDirty();
          self.scheduleSave();
        });

        var ruleValue = self.buildValueInput(rule.field, rule.value || "");
        var updateRule = function () {
          rule.value = ruleValue.value;
          self.render();
          self.markDirty();
          self.scheduleSave();
        };
        ruleValue.addEventListener("input", updateRule);
        ruleValue.addEventListener("change", updateRule);

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "op-email-email--flow-rule-remove";
        remove.textContent = "Quitar";
        remove.addEventListener("click", function () {
          rules.splice(idx, 1);
          self.render();
          self.markDirty();
          self.scheduleSave();
        });

        ruleWrap.appendChild(ruleField);
        ruleWrap.appendChild(ruleOperator);
        ruleWrap.appendChild(ruleValue);
        ruleWrap.appendChild(remove);
        self.propertiesBody.appendChild(ruleWrap);
      });

      var addRule = document.createElement("button");
      addRule.type = "button";
      addRule.className = "op-email-email--flow-node";
      addRule.textContent = "Agregar regla";
      addRule.addEventListener("click", function () {
        rules.push({ field: "status", operator: "equals", value: "" });
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      self.propertiesBody.appendChild(addRule);
    } else if (node.type === "email_template") {
      var templateSelect = document.createElement("select");
      templateSelect.className = "op-email-email--flow-select";
      var emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "Selecciona una plantilla";
      templateSelect.appendChild(emptyOpt);
      self.templates.forEach(function (tpl) {
        var option = document.createElement("option");
        option.value = tpl.id;
        option.textContent = tpl.name;
        templateSelect.appendChild(option);
      });
      templateSelect.value = data.template_id || "";
      templateSelect.addEventListener("change", function () {
        data.template_id = templateSelect.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Plantilla", templateSelect);

      var chipsWrap = document.createElement("div");
      chipsWrap.className = "op-email-email--flow-node-chips";
      var chipsLabel = document.createElement("div");
      chipsLabel.className = "op-email-email--flow-node-chips-label";
      chipsLabel.textContent = "Datos requeridos";
      chipsWrap.appendChild(chipsLabel);

      var chips = document.createElement("div");
      chips.className = "op-email-email--flow-node-chips-row";
      var options = self.emailTemplateRequiredOptions();
      var required = data && Array.isArray(data.required_keys) ? data.required_keys : [];
      options.forEach(function (opt) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "op-email-email--flow-node-chip";
        if (required.indexOf(opt.key) >= 0) chip.classList.add("is-active");
        chip.textContent = opt.label;
        chip.addEventListener("click", function () {
          var current = data && Array.isArray(data.required_keys) ? data.required_keys.slice() : [];
          var idx = current.indexOf(opt.key);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(opt.key);
          }
          data.required_keys = current;
          self.render();
          self.markDirty();
          self.save();
        });
        chips.appendChild(chip);
      });
      chipsWrap.appendChild(chips);
      addField("", chipsWrap);

      var optionalWrap = document.createElement("div");
      optionalWrap.className = "op-email-email--flow-node-chips";
      var optionalLabel = document.createElement("div");
      optionalLabel.className = "op-email-email--flow-node-chips-label";
      optionalLabel.textContent = "Datos opcionales";
      optionalWrap.appendChild(optionalLabel);

      var optionalChips = document.createElement("div");
      optionalChips.className = "op-email-email--flow-node-chips-row";
      var optionalOptions = self.emailTemplateOptionalOptions();
      var optionalSelected = data && Array.isArray(data.optional_keys) ? data.optional_keys : [];
      optionalOptions.forEach(function (opt) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "op-email-email--flow-node-chip";
        if (optionalSelected.indexOf(opt.key) >= 0) chip.classList.add("is-active");
        chip.textContent = opt.label;
        chip.addEventListener("click", function () {
          var current = data && Array.isArray(data.optional_keys) ? data.optional_keys.slice() : [];
          var idx = current.indexOf(opt.key);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(opt.key);
          }
          data.optional_keys = current;
          self.render();
          self.markDirty();
          self.save();
        });
        optionalChips.appendChild(chip);
      });
      optionalWrap.appendChild(optionalChips);
      addField("", optionalWrap);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
      self.propertiesBody.appendChild(historyTitle);

      var historyList = document.createElement("div");
      historyList.className = "op-email-email--flow-webhook-history-list";
      var historyItems = self.resolveNodeHistoryItems(node, { templateId: data && data.template_id });
      if (!historyItems.length) {
        var emptyHistory = document.createElement("div");
        emptyHistory.className = "op-email-email--flow-webhook-history-item";
        emptyHistory.textContent = "Sin eventos";
        historyList.appendChild(emptyHistory);
      } else {
        historyItems.forEach(function (itemData) {
          var item = document.createElement("div");
          item.className = "op-email-email--flow-webhook-history-item";
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          if (status === "finished") {
            isOk = true;
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
          statusLabel.textContent = statusText;
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
          var meta = itemData.meta || {};
          var details = [];
          if (meta.template_name) details.push("Plantilla: " + meta.template_name);
          if (meta.recipient) details.push("Destinatario: " + meta.recipient);
          if (meta.subject) details.push("Asunto: " + meta.subject);
          if (meta.sender_name) details.push("Remitente: " + meta.sender_name);
          if (meta.smtp_source) details.push("SMTP: " + meta.smtp_source);
          if (meta.delivery_id) details.push("Delivery ID: " + meta.delivery_id);
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
    } else if (node.type === "assign_owner") {
      var userSelect = document.createElement("select");
      userSelect.className = "op-email-email--flow-select";
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Sin responsable";
      userSelect.appendChild(blank);
      self.users.forEach(function (user) {
        var option = document.createElement("option");
        option.value = user.id;
        option.textContent = user.name;
        userSelect.appendChild(option);
      });
      userSelect.value = data.user_id || "";
      userSelect.addEventListener("change", function () {
        data.user_id = userSelect.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Responsable", userSelect);
    } else if (node.type === "update_field") {
      var fieldSelect = document.createElement("select");
      fieldSelect.className = "op-email-email--flow-select";
      fieldOptions.forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        fieldSelect.appendChild(option);
      });
      fieldSelect.value = data.field || "status";
      fieldSelect.addEventListener("change", function () {
        data.field = fieldSelect.value;
        data.value = "";
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Campo", fieldSelect);

      var valueField = self.buildValueInput(fieldSelect.value, data.value || "");
      var updateFieldValue = function () {
        data.value = valueField.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      };
      valueField.addEventListener("input", updateFieldValue);
      valueField.addEventListener("change", updateFieldValue);
      addField("Valor", valueField);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var meta = itemData.meta || {};
          var isReprogrammed = meta && (meta.reprogrammed_from && meta.reprogrammed_to);
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
          if (meta.field) details.push("Campo: " + meta.field);
          if (meta.value !== undefined && meta.value !== null) details.push("Valor: " + meta.value);
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
    } else if (node.type === "related_item") {
      var typeSelect = document.createElement("select");
      typeSelect.className = "op-email-email--flow-select";
      var typeBlank = document.createElement("option");
      typeBlank.value = "";
      typeBlank.textContent = "Seleccione tipo";
      typeSelect.appendChild(typeBlank);
      (self.workPackageTypes || []).forEach(function (type) {
        var option = document.createElement("option");
        option.value = type.id;
        option.textContent = type.name;
        typeSelect.appendChild(option);
      });
      typeSelect.value = data.work_package_type_id || "";
      typeSelect.addEventListener("change", function () {
        data.work_package_type_id = typeSelect.value;
        data.work_package_type_name = self.getWorkPackageTypeName(typeSelect.value);
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Tipo", typeSelect);

      var mappingSelect = document.createElement("select");
      mappingSelect.className = "op-email-email--flow-select";
      var mappingBlank = document.createElement("option");
      mappingBlank.value = "";
      mappingBlank.textContent = "Seleccione mapeo";
      mappingSelect.appendChild(mappingBlank);
      var crmMappings = self.getCrmMappings();
      crmMappings.forEach(function (mapping) {
        var option = document.createElement("option");
        option.value = mapping.source;
        option.textContent = self.getMappingLabel(mapping) + " (" + mapping.source + ")";
        mappingSelect.appendChild(option);
      });
      mappingSelect.value = data.related_name_source || "";
      mappingSelect.addEventListener("change", function () {
        var selected = mappingSelect.value;
        data.related_name_source = selected;
        var match = crmMappings.find(function (mapping) { return String(mapping.source) === String(selected); });
        data.related_name_label = match ? self.getMappingLabel(match) : "";
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Nombre del paquete", mappingSelect);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
      self.propertiesBody.appendChild(historyTitle);

      var historyList = document.createElement("div");
      historyList.className = "op-email-email--flow-webhook-history-list";
      var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var meta = itemData.meta || {};
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
          if (meta.work_package_type_name) details.push("Tipo: " + meta.work_package_type_name);
          if (meta.work_package_type_id && !meta.work_package_type_name) {
            details.push("Tipo: " + meta.work_package_type_id);
          }
          if (meta.related_name_label) details.push("Nombre: " + meta.related_name_label);
          if (meta.related_name_value) details.push("Valor: " + meta.related_name_value);
          if (meta.work_package_id) details.push("Paquete ID: " + meta.work_package_id);
          if (meta.work_package_subject) details.push("Asunto: " + meta.work_package_subject);
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
    } else if (node.type === "related_board") {
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
      addField("Tableros", boardSelect);

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
      addField("Listas / columnas", listSelect);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
      self.propertiesBody.appendChild(historyTitle);

      var historyList = document.createElement("div");
      historyList.className = "op-email-email--flow-webhook-history-list";
      var historyItems = (self.nodeHistories && self.nodeHistories[node.id]) ? self.nodeHistories[node.id] : [];
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var meta = itemData.meta || {};
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
              '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm7.707-3.707a1 1 0 0 0-1.414 1.414L10.586 12l-2.293 2.293a.5.5 0 1 0 1.414 1.414L12 13.414l2.293 2.293a.5.5 0 0 0 1.414-1.414L13.414 12l2.293-2.293a.5.5 0 0 0-1.414-1.414L12 10.586 9.707 8.293Z" clip-rule="evenodd"/>' +
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
          var meta = itemData.meta || {};
          if (meta.work_package_id) details.push("Paquete ID: " + meta.work_package_id);
          if (meta.work_package_subject) details.push("Asunto: " + meta.work_package_subject);
          if (meta.board_name) details.push("Tablero: " + meta.board_name);
          if (meta.list_name) details.push("Lista: " + meta.list_name);
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
    } else if (node.type === "add_tag") {
      var tagSelect = document.createElement("select");
      tagSelect.className = "op-email-email--flow-select";
      var blankOption = document.createElement("option");
      blankOption.value = "";
      blankOption.textContent = "Seleccione etiqueta";
      tagSelect.appendChild(blankOption);
      var currentTags = (data.tags || "").toString().split(",").map(function (item) {
        return item.trim();
      }).filter(function (item) { return item; });
      var tagList = self.tags || [];
      if (!tagList.length) {
        var emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "Sin etiquetas";
        emptyOption.disabled = true;
        tagSelect.appendChild(emptyOption);
      }
      tagList.forEach(function (tag) {
        var option = document.createElement("option");
        option.value = tag.name;
        option.textContent = tag.name;
        tagSelect.appendChild(option);
      });
      tagSelect.addEventListener("change", function () {
        var value = tagSelect.value;
        if (!value) return;
        if (currentTags.indexOf(value) === -1) currentTags.push(value);
        data.tags = currentTags.join(", ");
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      if (currentTags.length) {
        tagSelect.value = currentTags[currentTags.length - 1];
      }
      addField("Etiquetas", tagSelect);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
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
              '<path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm7.707-3.707a1 1 0 0 0-1.414 1.414L10.586 12l-2.293 2.293a.5.5 0 1 0 1.414 1.414L12 13.414l2.293 2.293a.5.5 0 0 0 1.414-1.414L13.414 12l2.293-2.293a.5.5 0 0 0-1.414-1.414L12 10.586 9.707 8.293Z" clip-rule="evenodd"/>' +
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
          var meta = itemData.meta || {};
          if (meta.tags) details.push("Etiquetas: " + meta.tags);
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
    } else if (node.type === "webhook") {
      var url = document.createElement("input");
      url.className = "op-email-email--flow-input";
      url.value = data.url || "";
      url.addEventListener("input", function () {
        data.url = url.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("URL", url);

      var payload = document.createElement("textarea");
      payload.className = "op-email-email--flow-textarea";
      payload.value = data.payload || "";
      payload.addEventListener("input", function () {
        data.payload = payload.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Payload (JSON opcional)", payload);
    } else if (node.type === "wait_until") {
      var datetime = document.createElement("input");
      datetime.type = "datetime-local";
      datetime.className = "op-email-email--flow-input";
      datetime.value = data.datetime || "";
      datetime.addEventListener("input", function () {
        data.datetime = datetime.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Fecha/Hora", datetime);
    } else if (node.type === "reminder") {
      var hint = document.createElement("div");
      hint.className = "op-email-email--flow-properties-empty";
      hint.textContent = "Este nodo se activa cuando llega un recordatorio del proyecto.";
      self.propertiesBody.appendChild(hint);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          if (status === "finished") {
            isOk = true;
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
          statusLabel.textContent = statusText;
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
          var meta = itemData.meta || {};
          if (meta.remind_at_date) {
            var dateLine = document.createElement("div");
            dateLine.textContent = "Fecha: " + meta.remind_at_date;
            body.appendChild(dateLine);
          }
          if (meta.remind_at_time) {
            var timeLine = document.createElement("div");
            timeLine.textContent = "Hora: " + meta.remind_at_time;
            body.appendChild(timeLine);
          }
          if (meta.note) {
            var noteLine = document.createElement("div");
            noteLine.textContent = "Nota: " + meta.note;
            body.appendChild(noteLine);
          }
          if (itemData.error) {
            var errorLine = document.createElement("div");
            errorLine.className = "op-email-email--flow-webhook-history-error";
            errorLine.textContent = itemData.error;
            body.appendChild(errorLine);
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
    } else if (node.type === "whatsapp") {
      if (window.console && typeof window.console.log === "function") {
        window.console.log("[Flows] renderProperties.whatsapp", {
          node_id: node.id,
          has_history: typeof self.renderWhatsappHistory === "function"
        });
      }
      var templateSelect = document.createElement("select");
      templateSelect.className = "op-email-email--flow-select";
      (self.whatsappTemplates || []).forEach(function (tpl) {
        var option = document.createElement("option");
        option.value = tpl.id;
        option.textContent = tpl.name;
        templateSelect.appendChild(option);
      });
      templateSelect.value = data.template_id || "";
      templateSelect.addEventListener("change", function () {
        data.template_id = templateSelect.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Plantilla", templateSelect);

      var intervalInput = document.createElement("input");
      intervalInput.type = "number";
      intervalInput.min = "5";
      intervalInput.step = "1";
      intervalInput.className = "op-email-email--flow-input";
      intervalInput.placeholder = "5";
      intervalInput.value = data.send_interval || "";
      var normalizeInterval = function () {
        var value = toNumber(intervalInput.value, 0);
        if (value > 0 && value < 5) value = 5;
        intervalInput.value = value > 0 ? value : "";
        data.send_interval = value > 0 ? value : "";
        self.markDirty();
        self.scheduleSave();
      };
      intervalInput.addEventListener("change", normalizeInterval);
      intervalInput.addEventListener("blur", normalizeInterval);
      addField("Intervalo (segundos)", intervalInput);

      var typingWrap = document.createElement("label");
      typingWrap.className = "op-email-email--flow-checkbox";
      var typingInput = document.createElement("input");
      typingInput.type = "checkbox";
      typingInput.checked = data.start_typing === true || data.start_typing === "true";
      typingInput.addEventListener("change", function () {
        data.start_typing = typingInput.checked;
        self.markDirty();
        self.scheduleSave();
      });
      var typingText = document.createElement("span");
      typingText.textContent = "Mostrar escribiendo...";
      typingWrap.appendChild(typingInput);
      typingWrap.appendChild(typingText);
      addField("", typingWrap);

      var chipsWrap = document.createElement("div");
      chipsWrap.className = "op-email-email--flow-node-chips";
      var chipsLabel = document.createElement("div");
      chipsLabel.className = "op-email-email--flow-node-chips-label";
      chipsLabel.textContent = "Datos requeridos";
      chipsWrap.appendChild(chipsLabel);

      var chips = document.createElement("div");
      chips.className = "op-email-email--flow-node-chips-row";
      var options = self.whatsappRequiredOptions();
      var required = data && Array.isArray(data.required_keys) ? data.required_keys : [];
      options.forEach(function (opt) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "op-email-email--flow-node-chip";
        if (required.indexOf(opt.key) >= 0) chip.classList.add("is-active");
        chip.textContent = opt.label;
        chip.addEventListener("click", function () {
          var current = data && Array.isArray(data.required_keys) ? data.required_keys.slice() : [];
          var idx = current.indexOf(opt.key);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(opt.key);
          }
          data.required_keys = current;
          self.render();
          self.markDirty();
          self.save();
        });
        chips.appendChild(chip);
      });
      chipsWrap.appendChild(chips);
      addField("", chipsWrap);

      if (typeof self.renderWhatsappHistory === "function") {
        self.renderWhatsappHistory(node, data);
      }
    } else if (node.type === "whatsapp_reminder") {
      var contacts = Array.isArray(self.contacts) ? self.contacts : [];
      var selectedContacts = Array.isArray(data.contact_ids) ? data.contact_ids.map(function (id) { return String(id); }) : [];

      var contactWrap = document.createElement("div");
      contactWrap.className = "op-email-email--flow-contact-picker";
      var contactSearch = document.createElement("input");
      contactSearch.type = "text";
      contactSearch.className = "op-email-email--flow-input";
      contactSearch.placeholder = "Buscar contacto...";
      contactWrap.appendChild(contactSearch);

      var contactList = document.createElement("div");
      contactList.className = "op-email-email--flow-contact-list";
      contactWrap.appendChild(contactList);

      var updateSelected = function (nextSelected) {
        data.contact_ids = nextSelected;
        self.render();
        self.markDirty();
        self.scheduleSave();
      };

      var contactLabel = function (contact) {
        var name = (contact.name || "").toString().trim();
        var email = (contact.email || "").toString().trim();
        var phone = (contact.phone || "").toString().trim();
        var parts = [];
        if (name) parts.push(name);
        if (email) parts.push(email);
        if (!email && phone) parts.push(phone);
        return parts.join(" - ") || ("Contacto " + contact.id);
      };

      var renderContacts = function (filter) {
        contactList.innerHTML = "";
        var term = (filter || "").toLowerCase().trim();
        if (term) {
          var visible = 0;
          contacts.forEach(function (contact) {
            var labelText = contactLabel(contact);
            var haystack = [
              (contact.name || "").toString().toLowerCase(),
              (contact.email || "").toString().toLowerCase(),
              (contact.phone || "").toString().toLowerCase()
            ].join(" ");
            if (haystack.indexOf(term) === -1) return;
            visible += 1;
            var row = document.createElement("label");
            row.className = "op-email-email--flow-contact-item";
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = contact.id;
            checkbox.checked = selectedContacts.indexOf(String(contact.id)) >= 0;
            checkbox.addEventListener("change", function () {
              var next = selectedContacts.slice();
              var idValue = String(contact.id);
              if (checkbox.checked) {
                if (next.indexOf(idValue) === -1) next.push(idValue);
              } else {
                next = next.filter(function (id) { return id !== idValue; });
              }
              selectedContacts = next;
              updateSelected(next);
              renderContacts(contactSearch.value);
            });
            var text = document.createElement("span");
            text.textContent = labelText;
            row.appendChild(checkbox);
            row.appendChild(text);
            contactList.appendChild(row);
          });
          if (visible === 0) {
            var empty = document.createElement("div");
            empty.className = "op-email-email--flow-contact-empty";
            empty.textContent = "Sin resultados";
            contactList.appendChild(empty);
          }
        } else {
          if (!selectedContacts.length) {
            var emptySelected = document.createElement("div");
            emptySelected.className = "op-email-email--flow-contact-empty";
            emptySelected.textContent = "Sin seleccionados";
            contactList.appendChild(emptySelected);
            return;
          }
          selectedContacts.forEach(function (idValue) {
            var contact = contacts.find(function (item) { return String(item.id) === String(idValue); });
            var textValue = contact ? contactLabel(contact) : ("Contacto " + idValue);
            var chip = document.createElement("div");
            chip.className = "op-email-email--flow-contact-chip";
            var label = document.createElement("span");
            label.textContent = textValue;
            var remove = document.createElement("button");
            remove.type = "button";
            remove.className = "op-email-email--flow-contact-remove";
            remove.textContent = "Quitar";
            remove.addEventListener("click", function () {
              selectedContacts = selectedContacts.filter(function (entry) { return entry !== String(idValue); });
              updateSelected(selectedContacts);
              renderContacts("");
            });
            chip.appendChild(label);
            chip.appendChild(remove);
            contactList.appendChild(chip);
          });
        }
      };

      contactSearch.addEventListener("input", function () {
        renderContacts(contactSearch.value);
      });
      renderContacts("");
      addField("Contactos", contactWrap);

      var intervalInput = document.createElement("input");
      intervalInput.type = "number";
      intervalInput.min = "5";
      intervalInput.step = "1";
      intervalInput.className = "op-email-email--flow-input";
      intervalInput.placeholder = "5";
      intervalInput.value = data.send_interval || "";
      var normalizeInterval = function () {
        var value = toNumber(intervalInput.value, 0);
        if (value > 0 && value < 5) value = 5;
        intervalInput.value = value > 0 ? value : "";
        data.send_interval = value > 0 ? value : "";
        self.markDirty();
        self.scheduleSave();
      };
      intervalInput.addEventListener("change", normalizeInterval);
      intervalInput.addEventListener("blur", normalizeInterval);
      addField("Intervalo (segundos)", intervalInput);

      var typingWrap = document.createElement("label");
      typingWrap.className = "op-email-email--flow-checkbox";
      var typingInput = document.createElement("input");
      typingInput.type = "checkbox";
      typingInput.checked = data.start_typing === true || data.start_typing === "true";
      typingInput.addEventListener("change", function () {
        data.start_typing = typingInput.checked;
        self.markDirty();
        self.scheduleSave();
      });
      var typingText = document.createElement("span");
      typingText.textContent = "Mostrar escribiendo...";
      typingWrap.appendChild(typingInput);
      typingWrap.appendChild(typingText);
      addField("", typingWrap);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
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
          var whenText = itemData.finished_at ? new Date(itemData.finished_at).toLocaleString() : new Date(itemData.created_at).toLocaleString();
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
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
          var meta = itemData.meta || {};
          if (meta.total) {
            var totalLine = document.createElement("div");
            totalLine.textContent = "Contactos: " + meta.total;
            body.appendChild(totalLine);
          }
          if (meta.sent) {
            var sentLine = document.createElement("div");
            sentLine.textContent = "Enviados: " + meta.sent;
            body.appendChild(sentLine);
          }
          if (meta.failed) {
            var failedLine = document.createElement("div");
            failedLine.textContent = "Errores: " + meta.failed;
            body.appendChild(failedLine);
          }
          if (meta.message) {
            var msgLine = document.createElement("div");
            msgLine.textContent = "Mensaje: " + meta.message;
            body.appendChild(msgLine);
          }
          if (meta.typing) {
            var typingLine = document.createElement("div");
            typingLine.textContent = "Escribiendo: " + (meta.typing_delay ? meta.typing_delay + "s" : "3s");
            body.appendChild(typingLine);
          }
          if (itemData.error) {
            var errorEl = document.createElement("div");
            errorEl.className = "op-email-email--flow-webhook-history-error";
            errorEl.textContent = itemData.error;
            body.appendChild(errorEl);
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
    } else if (node.type === "email") {
      var subject = document.createElement("input");
      subject.className = "op-email-email--flow-input";
      subject.value = data.subject || "";
      subject.addEventListener("input", function () {
        data.subject = subject.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Asunto", subject);

      var body = document.createElement("textarea");
      body.className = "op-email-email--flow-textarea";
      body.value = data.body || "";
      body.addEventListener("input", function () {
        data.body = body.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Contenido", body);
    } else if (node.type === "delay") {
      var amount = document.createElement("input");
      amount.type = "number";
      amount.className = "op-email-email--flow-input";
      amount.value = data.amount || 1;
      var commitAmount = function () {
        data.amount = toNumber(amount.value, 1);
        self.render();
        self.markDirty();
        self.scheduleSave();
      };
      amount.addEventListener("change", commitAmount);
      amount.addEventListener("blur", commitAmount);
      addField("Cantidad", amount);

      var unit = document.createElement("select");
      unit.className = "op-email-email--flow-select";
      [
        { value: "seconds", label: "Segundos" },
        { value: "minutes", label: "Minutos" },
        { value: "hours", label: "Horas" },
        { value: "days", label: "Dias" }
      ].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        unit.appendChild(option);
      });
      unit.value = data.unit || "minutes";
      unit.addEventListener("change", function () {
        data.unit = unit.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Unidad", unit);

      var nightWrap = document.createElement("label");
      nightWrap.className = "op-email-email--flow-checkbox";
      var nightCheckbox = document.createElement("input");
      nightCheckbox.type = "checkbox";
      nightCheckbox.checked = data.night_convert === true || data.night_convert === "true";
      nightCheckbox.addEventListener("change", function () {
        data.night_convert = nightCheckbox.checked;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      var nightLabel = document.createElement("span");
      nightLabel.textContent = "Activar conversion de horarios madrugada";
      nightWrap.appendChild(nightCheckbox);
      nightWrap.appendChild(nightLabel);
      addField("Conversion madrugada", nightWrap);

      var nightStart = document.createElement("input");
      nightStart.type = "time";
      nightStart.className = "op-email-email--flow-input";
      nightStart.value = data.night_start || "22:00";
      nightStart.addEventListener("change", function () {
        data.night_start = nightStart.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Inicio madrugada", nightStart);

      var nightEnd = document.createElement("input");
      nightEnd.type = "time";
      nightEnd.className = "op-email-email--flow-input";
      nightEnd.value = data.night_end || "06:00";
      nightEnd.addEventListener("change", function () {
        data.night_end = nightEnd.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Fin madrugada", nightEnd);

      var historyTitle = document.createElement("div");
      historyTitle.className = "op-email-email--flow-webhook-history-title";
      var historyTitleText = document.createElement("span");
      historyTitleText.textContent = "Historial";
      historyTitle.appendChild(historyTitleText);
      self.propertiesBody.appendChild(historyTitle);

      var historyList = document.createElement("div");
      historyList.className = "op-email-email--flow-webhook-history-list";
      var historyItems = self.resolveNodeHistoryItems(node);

      if (!historyItems.length) {
        var emptyHistory = document.createElement("div");
        emptyHistory.className = "op-email-email--flow-webhook-history-item";
        emptyHistory.textContent = "Sin eventos";
        historyList.appendChild(emptyHistory);
      } else {
        historyItems.forEach(function (itemData) {
          var meta = itemData.meta || {};
          var isReprogrammed = !!(meta.reprogrammed_from && meta.reprogrammed_to);
          var item = document.createElement("div");
          item.className = "op-email-email--flow-webhook-history-item";
          var whenText = "";
          if (itemData.finished_at) {
            whenText = new Date(itemData.finished_at).toLocaleString();
          } else if (itemData.created_at) {
            whenText = new Date(itemData.created_at).toLocaleString();
          }
          var status = itemData.status || "";
          var statusText = status === "queued" ? "En cola..." : status;
          var isOk = false;
          var isError = false;
          var labelText = "";
          var isReprogrammed = false;
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
          if (meta.delay_until) {
            var whenDelay = document.createElement("div");
            whenDelay.className = "op-email-email--flow-history-highlight";
            var delayDate = new Date(meta.delay_until);
            var delayText = isNaN(delayDate.getTime()) ? meta.delay_until : delayDate.toLocaleString();
            whenDelay.textContent = "Fecha y hora a ejecutar: " + delayText;
            body.appendChild(whenDelay);
          }
          if (meta.server_now) {
            var serverLine = document.createElement("div");
            var serverDate = new Date(meta.server_now);
            var serverText = isNaN(serverDate.getTime()) ? meta.server_now : serverDate.toLocaleString();
            serverLine.textContent = "Fecha y hora de llegada de datos: " + serverText;
            body.appendChild(serverLine);
          }
          if (meta.night_adjusted) {
            var nightLine = document.createElement("div");
            var nightHours = meta.night_adjust_hours ? meta.night_adjust_hours : 12;
            nightLine.textContent = "Ajuste aplicado: +" + nightHours + "h";
            body.appendChild(nightLine);
          }
          if (meta.night_convert !== undefined) {
            var nightCfg = document.createElement("div");
            var nightOn = meta.night_convert === true || meta.night_convert === "true" || meta.night_convert === "1";
            nightCfg.textContent =
              "Madrugada activa: " + (nightOn ? "SI" : "NO") +
              " (" + (meta.night_start || "--:--") + " - " + (meta.night_end || "--:--") + ")";
            body.appendChild(nightCfg);
          }
          if (!meta.night_adjusted) {
            var nightNo = document.createElement("div");
            nightNo.textContent = "Ajuste aplicado: No aplica";
            body.appendChild(nightNo);
          }
          if (meta.night_debug) {
            var dbg = meta.night_debug;
            var dbgLine = document.createElement("div");
            dbgLine.textContent =
              "Debug madrugada: in_window=" + (dbg.in_window ? "SI" : "NO") +
              " start=" + (dbg.start_time || "") +
              " end=" + (dbg.end_time || "") +
              " base=" + (dbg.delay_until_before || "");
            body.appendChild(dbgLine);
          }
          if (meta.time_zone) {
            var tzLine = document.createElement("div");
            tzLine.textContent = "Zona horaria proyecto: " + meta.time_zone;
            body.appendChild(tzLine);
          }
          if (meta.server_now) {
            var nowLine = document.createElement("div");
            var nowDate = new Date(meta.server_now);
            var nowText = isNaN(nowDate.getTime()) ? meta.server_now : nowDate.toLocaleString();
            nowLine.textContent = "Hora servidor: " + nowText;
            body.appendChild(nowLine);
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
          var payloadValue = itemData.payload || meta.payload;
          if (payloadValue) {
            var payloadText;
            try {
              payloadText = JSON.stringify(payloadValue, null, 2);
            } catch (error) {
              payloadText = String(payloadValue);
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
          if (itemData.error) {
            var errorEl = document.createElement("div");
            errorEl.className = "op-email-email--flow-webhook-history-error";
            errorEl.textContent = itemData.error;
            body.appendChild(errorEl);
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
    } else {
      var label = document.createElement("input");
      label.className = "op-email-email--flow-input";
      label.value = data.label || "";
      label.addEventListener("input", function () {
        data.label = label.value;
        self.render();
        self.markDirty();
        self.scheduleSave();
      });
      addField("Etiqueta", label);
    }
  };

  FlowBuilder.prototype.markDirty = function () {
    if (this.isLoading) return;
    this.dirty = true;
  };

  FlowBuilder.prototype.scheduleSave = function () {
    // Autosave disabled: save only via "Guardar" button.
    return;
  };

  if (!window.FlowBuilder) {
    window.FlowBuilder = FlowBuilder;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = qs(".op-email-email--flow");
    if (root && !root.dataset.bound) new FlowBuilder(root);
  });

  document.addEventListener("turbo:load", function () {
    var root = qs(".op-email-email--flow");
    if (root && !root.dataset.bound) new FlowBuilder(root);
  });
})();
