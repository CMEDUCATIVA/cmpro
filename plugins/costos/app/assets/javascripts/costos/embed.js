window.CostosEmbed = (function() {
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function sanitizeUrl(raw) {
    if (!raw) {
      return null;
    }
    try {
      var url = new URL(raw, window.location.origin);
      if (url.protocol !== 'https:') {
        return null;
      }
      return url.href;
    } catch (error) {
      return null;
    }
  }

  function sanitizeEmbedCode(code) {
    if (!code) {
      return null;
    }
    var template = document.createElement('template');
    template.innerHTML = code.trim();
    var iframe = template.content.querySelector('iframe');
    if (!iframe) {
      return null;
    }
    var src = sanitizeUrl(iframe.getAttribute('src'));
    if (!src) {
      return null;
    }
    iframe.setAttribute('src', src);
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms');
    iframe.style.border = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    return iframe.outerHTML;
  }

  function setFeedback(element, message, variant) {
    if (!element) {
      if (message) {
        window.console.warn(message);
      }
      return;
    }
    element.textContent = message || '';
    element.classList.remove('-error', '-success');
    if (variant) {
      element.classList.add('-' + variant);
    }
  }

  function init() {
    var form = document.getElementById('embedForm');
    var typeSelect = document.getElementById('embedType');
    var input = document.getElementById('embedInput');
    var loadButton = document.getElementById('loadEmbed');
    var clearButton = document.getElementById('clearEmbed');
    var container = document.getElementById('embedContainer');
    var content = document.getElementById('embedContent');
    var feedback = document.getElementById('embedFeedback');

    if (!form || !typeSelect || !input || !loadButton || !clearButton || !container || !content) {
      return;
    }

    function updatePlaceholder() {
      if (!input) {
        return;
      }
      if (typeSelect.value === 'code') {
        input.placeholder = input.dataset.codePlaceholder || '';
      } else {
        input.placeholder = input.dataset.urlPlaceholder || '';
      }
    }

    function clearEmbed(event) {
      if (event) {
        event.preventDefault();
      }
      input.value = '';
      content.innerHTML = '';
      container.style.display = 'none';
      setFeedback(feedback, '', null);
    }

    function loadEmbed(event) {
      if (event) {
        event.preventDefault();
      }

      var rawValue = input.value.trim();
      if (!rawValue.length) {
        setFeedback(feedback, form.dataset.emptyError || '', 'error');
        container.style.display = 'none';
        content.innerHTML = '';
        return;
      }

      var html = null;
      if (typeSelect.value === 'code') {
        html = sanitizeEmbedCode(rawValue);
        if (!html) {
          setFeedback(feedback, form.dataset.invalidCode || '', 'error');
          container.style.display = 'none';
          content.innerHTML = '';
          return;
        }
      } else {
        var url = sanitizeUrl(rawValue);
        if (!url) {
          setFeedback(feedback, form.dataset.invalidUrl || '', 'error');
          container.style.display = 'none';
          content.innerHTML = '';
          return;
        }
        html = '<iframe src="' + url + '" loading="lazy" referrerpolicy="no-referrer" ' +
               'sandbox="allow-same-origin allow-scripts allow-popups allow-forms" ' +
               'style="border:0;width:100%;height:100%;"></iframe>';
      }

      content.innerHTML = html;
      container.style.display = 'block';
      setFeedback(feedback, '', null);
    }

    typeSelect.addEventListener('change', function() {
      updatePlaceholder();
      setFeedback(feedback, '', null);
    });

    loadButton.addEventListener('click', loadEmbed);
    clearButton.addEventListener('click', clearEmbed);

    updatePlaceholder();
  }

  ready(init);

  return {
    init: init
  };
})();
