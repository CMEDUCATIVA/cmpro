(function() {
  'use strict';

  if (window.PebAutoDragDrop) {
    return;
  }

  var dragChild = null;
  var dragContainer = null;
  var callbacks = {
    queueSaveCard: null,
    render: null
  };
  var latestClientY = 0;

  function queueCard(card, immediate) {
    if (typeof callbacks.queueSaveCard === 'function') {
      callbacks.queueSaveCard(card, immediate);
    }
  }

  function rerender() {
    if (typeof callbacks.render === 'function') {
      callbacks.render();
    }
  }

  function configure(options) {
    options = options || {};
    if (typeof options.queueSaveCard === 'function') {
      callbacks.queueSaveCard = options.queueSaveCard;
    }
    if (typeof options.render === 'function') {
      callbacks.render = options.render;
    }
  }

  function moveChild(card, dragInfo, targetContainer, targetIndex) {
    if (!card || !dragInfo || !targetContainer) return;
    var containers = Array.isArray(card.payload.containers) ? card.payload.containers : [];
    var fromContainer = containers.find(function(c) { return c && c.id === dragInfo.fromContainerId; });
    if (!fromContainer) return;

    var fromChildren = Array.isArray(fromContainer.children) ? fromContainer.children : (fromContainer.children = []);
    if (dragInfo.index < 0 || dragInfo.index >= fromChildren.length) return;

    var moved = fromChildren.splice(dragInfo.index, 1)[0];
    if (!moved) {
      rerender();
      return;
    }

    targetContainer.children = Array.isArray(targetContainer.children) ? targetContainer.children : [];
    var targetChildren = targetContainer.children;
    if (targetContainer.id === dragInfo.fromContainerId && dragInfo.index < targetIndex) {
      targetIndex -= 1;
    }
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex > targetChildren.length) targetIndex = targetChildren.length;

    moved.scope = targetContainer.id;
    targetChildren.splice(targetIndex, 0, moved);
    queueCard(card, true);
    rerender();
  }

  function computeDropIndex(element, clientY) {
    if (!element) return 0;
    var cards = element.querySelectorAll('.child-card');
    var targetIndex = cards.length;
    for (var i = 0; i < cards.length; i++) {
      var rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        targetIndex = i;
        break;
      }
    }
    return targetIndex;
  }

  function bindChild(element, card, container, index) {
    if (!element) return;

    element.addEventListener('dragstart', function(e) {
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.setData) {
        try {
          e.dataTransfer.setData('text/plain', 'child');
        } catch (_) {
          // Ignorar navegadores que bloquean setData en dragstart.
        }
        e.dataTransfer.effectAllowed = 'move';
      }
      dragChild = {
        card: card,
        fromContainerId: container && container.id,
        index: index
      };
      element.style.opacity = '0.4';
    });

    element.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      latestClientY = e.clientY;
      element.classList.add('over');
    });

    element.addEventListener('dragleave', function() {
      element.classList.remove('over');
    });

    element.addEventListener('drop', function(e) {
      e.preventDefault();
      element.classList.remove('over');
      if (!dragChild || dragChild.card !== card) return;

      var dragInfo = dragChild;
      dragChild = null;
      moveChild(card, dragInfo, container, index);
    });

    element.addEventListener('dragend', function() {
      element.style.opacity = '1';
      dragChild = null;
    });
  }

  function bindContainer(element, card, index, handleElement) {
    if (!element) return;

    var dragHandle = handleElement || element;
    dragHandle.setAttribute('draggable', 'true');
    dragHandle.draggable = true;
    element.setAttribute('draggable', 'true');
    element.draggable = true;

    function startContainerDrag(e) {
      if (dragChild) {
        e.preventDefault();
        return;
      }
      if (e.dataTransfer && e.dataTransfer.setData) {
        try {
          e.dataTransfer.setData('text/plain', 'container');
        } catch (_) {
          // Ignorar navegadores que bloquean setData en dragstart.
        }
        e.dataTransfer.effectAllowed = 'move';
      }
      dragContainer = { card: card, index: index };
      element.style.opacity = '0.5';
    }

    function endContainerDrag() {
      if (dragChild) return;
      element.style.opacity = '1';
      dragContainer = null;
    }

    dragHandle.addEventListener('dragstart', startContainerDrag);
    dragHandle.addEventListener('dragend', endContainerDrag);
    if (dragHandle !== element) {
      element.addEventListener('dragstart', startContainerDrag);
      element.addEventListener('dragend', endContainerDrag);
    }

    element.addEventListener('dragover', function(e) {
      if (dragChild) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      latestClientY = e.clientY;
      element.classList.add('over');
    });

    element.addEventListener('dragleave', function() {
      element.classList.remove('over');
    });

    element.addEventListener('drop', function(e) {
      if (dragChild) return;
      e.preventDefault();
      element.classList.remove('over');
      if (!dragContainer || dragContainer.card !== card) return;

      var containerDrag = dragContainer;
      dragContainer = null;
      if (containerDrag.index === index) return;

      card.payload.containers = Array.isArray(card.payload.containers) ? card.payload.containers : [];
      if (containerDrag.index < 0 || containerDrag.index >= card.payload.containers.length) {
        rerender();
        return;
      }

      var moved = card.payload.containers.splice(containerDrag.index, 1)[0];
      if (!moved) {
        rerender();
        return;
      }

      var rect = element.getBoundingClientRect();
      var pointerY = latestClientY || e.clientY;
      var targetIndex = pointerY > rect.top + rect.height / 2 ? index + 1 : index;

      if (containerDrag.index < targetIndex) {
        targetIndex -= 1;
      }
      if (targetIndex < 0) targetIndex = 0;
      if (targetIndex > card.payload.containers.length) {
        targetIndex = card.payload.containers.length;
      }

      card.payload.containers.splice(targetIndex, 0, moved);
      queueCard(card, true);
      rerender();
    });

    if (dragHandle === element) {
      element.addEventListener('dragend', endContainerDrag);
    }
  }

  function bindDropZone(element, card, container) {
    if (!element) return;

    element.addEventListener('dragover', function(e) {
      if (!dragChild || dragChild.card !== card) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      latestClientY = e.clientY;
      element.classList.add('over');
    });

    element.addEventListener('dragleave', function() {
      element.classList.remove('over');
    });

    element.addEventListener('drop', function(e) {
      e.preventDefault();
      element.classList.remove('over');
      if (!dragChild || dragChild.card !== card) return;

      var dragInfo = dragChild;
      dragChild = null;
      var dropIndex = computeDropIndex(element, latestClientY || e.clientY);
      moveChild(card, dragInfo, container, dropIndex);
    });
  }

  window.PebAutoDragDrop = {
    configure: configure,
    bindChild: bindChild,
    bindContainer: bindContainer,
    bindDropZone: bindDropZone,
  };

  try {
    var readyEvent = new CustomEvent('peb:auto:drag-ready');
    document.dispatchEvent(readyEvent);
  } catch (error) {
    if (document.createEvent) {
      var fallbackEvent = document.createEvent('CustomEvent');
      fallbackEvent.initCustomEvent('peb:auto:drag-ready', true, true, {});
      document.dispatchEvent(fallbackEvent);
    }
  }
})();
