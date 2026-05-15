(function() {
  'use strict';

  const STORAGE_KEY = 'documentos.wiki_menu_expanded';
  const LOG_URL = '/documentos/log';

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function logToServer(message, data) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    fetch(LOG_URL, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ level: 'info', message: message, data: data })
    }).catch(() => {});
  }

  function readExpandedSlugs() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function writeExpandedSlugs(list) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
    } catch (e) {
      // ignore storage errors
    }
  }

  function slugForLi(li) {
    if (!li) return '';
    const item = li.querySelector('.tree-menu--item');
    return item ? (item.getAttribute('slug') || '') : '';
  }

  function collapseLi(li) {
    li.classList.remove('-hierarchy-expanded');
    li.classList.add('-hierarchy-collapsed');
  }

  function expandLi(li) {
    li.classList.remove('-hierarchy-collapsed');
    li.classList.add('-hierarchy-expanded');
  }

  function expandSelectedPath(container, expandedSet) {
    const selected = container.querySelector('.tree-menu--item.-selected');
    if (!selected) return;

    let node = selected.closest('ul.-with-hierarchy > li');
    while (node) {
      expandLi(node);
      const slug = slugForLi(node);
      if (slug) expandedSet.add(slug);
      const parentList = node.parentElement;
      node = parentList ? parentList.closest('ul.-with-hierarchy > li') : null;
    }
  }

  function applyExpandedState(container) {
    const listItems = container.querySelectorAll('ul.-with-hierarchy > li');
    if (!listItems.length) return;

    const expanded = new Set(readExpandedSlugs());
    let needsUpdate = false;
    const isFirstRun = container.dataset.documentosWikiInit !== '1';
    if (isFirstRun) {
      container.dataset.documentosWikiInit = '1';
    }
    const frame = container.closest('turbo-frame#wiki_main_menu');
    if (container.dataset.documentosWikiReady !== '1') {
      container.style.visibility = 'hidden';
    }

    listItems.forEach((li) => {
      if (!li.classList.contains('-hierarchy-collapsed')) {
        needsUpdate = true;
      }
    });

    if (expanded.size > 0) {
      listItems.forEach((li) => {
        const slug = slugForLi(li);
        if (slug && expanded.has(slug)) {
          if (!li.classList.contains('-hierarchy-expanded')) {
            needsUpdate = true;
          }
        }
      });
    }

    if (needsUpdate) {
      listItems.forEach((li) => {
        collapseLi(li);
      });

      if (expanded.size > 0) {
        listItems.forEach((li) => {
          const slug = slugForLi(li);
          if (slug && expanded.has(slug)) {
            expandLi(li);
          }
        });
      }
    }

    expandSelectedPath(container, expanded);
    writeExpandedSlugs(Array.from(expanded));

    if (isFirstRun || needsUpdate) {
      requestAnimationFrame(() => {
        container.dataset.documentosWikiReady = '1';
        container.style.visibility = '';
        if (frame) {
          frame.dataset.documentosWikiReady = '1';
        }
        logToServer('Wiki menu ready', {
          needsUpdate: needsUpdate,
          expandedCount: expanded.size,
          containerClass: container.className
        });
      });
    }
  }

  function bindToggleTracking(container) {
    if (container.dataset.documentosWikiBound === '1') return;
    container.dataset.documentosWikiBound = '1';
    logToServer('Wiki menu bound', { containerClass: container.className });

    container.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const indicator = target.closest('.tree-menu--hierarchy-indicator');
      if (!indicator) return;

      // Wait for Stimulus toggle to apply classes
      setTimeout(() => {
        const li = indicator.closest('ul.-with-hierarchy > li');
        if (!li) return;
        const slug = slugForLi(li);
        if (!slug) return;

        const expanded = new Set(readExpandedSlugs());
        if (li.classList.contains('-hierarchy-expanded')) {
          expanded.add(slug);
        } else {
          expanded.delete(slug);
        }
        writeExpandedSlugs(Array.from(expanded));
        logToServer('Wiki menu toggle', {
          slug: slug,
          expanded: li.classList.contains('-hierarchy-expanded')
        });
      }, 0);
    });
  }

  function collapseWikiMenus() {
    const containers = document.querySelectorAll('.menu-wiki-pages-tree');
    logToServer('Wiki menu scan', { containers: containers.length });
    if (!containers.length) return;

    containers.forEach((container) => {
      applyExpandedState(container);
      bindToggleTracking(container);
    });
  }

  function observeWikiMenu() {
    const target = document.body;
    if (!target) return;
    const observer = new MutationObserver(() => {
      const container = document.querySelector('.menu-wiki-pages-tree');
      if (container && container.dataset.documentosWikiObserved !== '1') {
        container.dataset.documentosWikiObserved = '1';
        collapseWikiMenus();
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    collapseWikiMenus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('turbo:load', init);
  document.addEventListener('turbo:render', init);
  document.addEventListener('turbo:frame-load', init);
  observeWikiMenu();
})();
