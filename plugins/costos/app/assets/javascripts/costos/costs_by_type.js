(function () {
  var PLACEHOLDER_ROWS = [
    { code: 'CT-001', description: 'Unidad personalizada pendiente', quantity: '-', price: '-', amount: '-' },
    { code: 'CT-002', description: 'Utiliza esta seccion para integrar tus costos', quantity: '-', price: '-', amount: '-' }
  ];
  var SECTION_CLASS = 'costos-used-units-fullwidth';
  var WRAPPER_CLASS = 'costos-used-units-group';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  var skipMutation = false;
  var mutationObserver = null;

  function buildTable(labelText, entries) {
    var table = document.createElement('table');
    table.className = 'costos-used-units-table';
    table.style.width = '100%';
    table.style.tableLayout = 'fixed';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    [
      { text: '', className: 'costos-used-units__header -controls', align: 'center', width: '32px' },
      { text: 'Codigo', className: 'costos-used-units__header -code', align: 'left', width: '80px' },
      { text: labelText, className: 'costos-used-units__header -description', align: 'left', width: '150px' },
      { text: 'Cantidades', className: 'costos-used-units__header -numeric', align: 'right', width: '70px' },
      { text: 'Precio', className: 'costos-used-units__header -numeric', align: 'right', width: '70px' },
      { text: 'Importe', className: 'costos-used-units__header -numeric', align: 'right', width: '70px' }
    ].forEach(function (header) {
      var th = document.createElement('th');
      th.textContent = header.text;
      th.className = header.className;
      th.style.textAlign = header.align;
      th.style.width = header.width;
      if (header.align === 'right') {
        th.style.justifyContent = 'flex-end';
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    entries.forEach(function (entry) {
      var row = document.createElement('tr');
      row.className = 'costos-used-units__row';
      row.appendChild(buildControlCell(row));
      ['code', 'description', 'quantity', 'price', 'amount'].forEach(function (key, index) {
        var td = document.createElement('td');
        td.textContent = entry[key] || '-';
        td.className = index === 0 ? 'costos-used-units__cell -code'
          : index === 1 ? 'costos-used-units__cell -description'
          : 'costos-used-units__cell -numeric';
        td.style.textAlign = index <= 1 ? 'left' : 'right';
        if (index === 0) {
          td.style.width = '160px';
        } else if (index === 1) {
          td.style.width = '50%';
        }
        if (index > 1) {
          td.style.width = '70px';
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    return table;
  }

  function moveRow(row, direction) {
    var parent = row.parentNode;
    if (!parent) {
      return;
    }

    var target = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!target) {
      return;
    }

    skipMutation = true;
    if (direction < 0) {
      parent.insertBefore(row, target);
    } else {
      parent.insertBefore(target, row);
    }
  }

  function buildArrowIcon(direction) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 11');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '11');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M3.22 10.53a.749.749 0 0 1 0-1.06l4.25-4.25a.749.749 0 0 1 1.06 0l4.25 4.25a.749.749 0 1 1-1.06 1.06L8 6.811 4.28 10.53a.749.749 0 0 1-1.06 0Z');
    if (direction === 'down') {
      path.setAttribute('transform', 'scale(1 -1) translate(0 -11)');
    }
    svg.appendChild(path);
    return svg;
  }

  function buildControlCell(row) {
    var cell = document.createElement('td');
    cell.className = 'costos-used-units__cell -controls';
    cell.dataset.controls = 'costs';

    function createTrigger(direction, label) {
      var trigger = document.createElement('span');
      trigger.className = 'costos-used-units__trigger';
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('aria-label', label);
      trigger.appendChild(buildArrowIcon(direction));
      trigger.addEventListener('click', function () {
        moveRow(row, direction === 'up' ? -1 : 1);
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          moveRow(row, direction === 'up' ? -1 : 1);
        }
      });
      return trigger;
    }

    cell.appendChild(createTrigger('up', 'Mover fila hacia arriba'));
    cell.appendChild(createTrigger('down', 'Mover fila hacia abajo'));

    return cell;
  }

  function buildEntry(text, code) {
    var line = (text || '').trim();
    if (!line) {
      return null;
    }

    var quantity = '-';
    var description = line;
    var match = line.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);

    if (match) {
      quantity = match[1].replace(',', '.');
      description = match[2].trim();
    }

    return {
      code: code,
      description: description,
      quantity: quantity,
      price: '-',
      amount: '-'
    };
  }

  function codeFromHref(href, fallbackIndex) {
    var defaultCode = 'CT-' + (fallbackIndex + 1).toString().padStart(2, '0');
    if (!href) {
      return defaultCode;
    }
    try {
      var url = new URL(href, window.location.origin);
      var params = new URLSearchParams(url.search);
      var unitId = params.get('unit');
      if (unitId) {
        return 'CT-' + unitId.toString().padStart(3, '0');
      }
    } catch (error) {
      // Ignorar errores y usar el código por defecto
    }
    return defaultCode;
  }

  function extractCostsByTypeEntries() {
    var container = document.querySelector('.inline-edit--display-field.costsByType');
    if (!container) {
      return [];
    }

    var entries = [];
    var links = container.querySelectorAll('a[href]');

    if (links.length > 0) {
      links.forEach(function (link, index) {
        var entry = buildEntry(link.textContent, codeFromHref(link.getAttribute('href'), index));
        if (entry) {
          entries.push(entry);
        }
      });
      return entries;
    }

    // Fallback: texto plano sin enlaces
    var rawText = container.textContent || '';
    rawText.split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean).forEach(function (line, index) {
      var entry = buildEntry(line, 'CT-' + (index + 1).toString().padStart(2, '0'));
      if (entry) {
        entries.push(entry);
      }
    });

    return entries;
  }

  function createSection() {
    var section = document.createElement('section');
    section.className = SECTION_CLASS;
    section.style.width = '100%';
    section.style.maxWidth = '100%';
    section.style.flex = '0 0 100%';
    section.style.display = 'block';

    var header = document.createElement('h3');
    header.textContent = 'COSTOS';
    header.style.fontSize = '14px';
    header.style.fontWeight = '600';
    header.style.marginBottom = '1rem';
    header.style.paddingBottom = '0.4rem';
    header.style.borderBottom = '1px solid #d0d7de';
    section.appendChild(header);

    var divider = document.createElement('div');
    divider.className = 'costos-used-units-divider';
    section.appendChild(divider);

    var dynamicRows = extractCostsByTypeEntries();
    var rows = dynamicRows.length > 0 ? dynamicRows : PLACEHOLDER_ROWS;
    section.appendChild(buildTable('Unidades usadas', rows));
    return section;
  }

  function renderSection() {
    var singleView = document.querySelector('.work-package--single-view');
    if (!singleView) {
      return;
    }

    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    var wrapper = singleView.querySelector('.' + WRAPPER_CLASS);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = WRAPPER_CLASS + ' attributes-group __overflowing_element_container';
      wrapper.style.width = '100%';
      wrapper.style.flex = '0 0 100%';
      wrapper.style.maxWidth = '100%';
      singleView.appendChild(wrapper);
    }

    wrapper.innerHTML = '';
    wrapper.appendChild(createSection());

    if (mutationObserver) {
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function init() {
    renderSection();
    mutationObserver = new MutationObserver(function () {
      if (skipMutation) {
        skipMutation = false;
        return;
      }
      renderSection();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  ready(init);
  document.addEventListener('turbo:load', renderSection);
})();
