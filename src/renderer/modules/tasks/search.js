import { CONFIG } from '../core/state.js';
import { activateTab } from '../nav/tabs.js';
import { renderTaskRow } from './taskRow.js';

let checkedTypes = new Set();
let checkedPriorities = new Set();
let checkedStatuses = new Set();
let searchDebounceTimer = null;

function renderFilterCheckboxes(containerId, list, checkedSet) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  list.forEach((value) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checkedSet.has(value);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) checkedSet.add(value); else checkedSet.delete(value);
      runSearch();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(value));
    container.appendChild(label);
  });
}

// Resets filters to "everything shown" — used only when opening search fresh.
function initSearchFilters() {
  checkedTypes = new Set(CONFIG.taskTypes);
  checkedPriorities = new Set(CONFIG.priorities);
  checkedStatuses = new Set(CONFIG.statuses);
  renderFilterCheckboxes('search-filter-taskTypes', CONFIG.taskTypes, checkedTypes);
  renderFilterCheckboxes('search-filter-priorities', CONFIG.priorities, checkedPriorities);
  renderFilterCheckboxes('search-filter-statuses', CONFIG.statuses, checkedStatuses);
}

function sortSearchResults(items, sortMode) {
  const sorted = [...items];
  if (sortMode === 'date-asc') {
    sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } else if (sortMode === 'priority') {
    const rank = {};
    CONFIG.priorities.forEach((p, i) => { rank[p] = i; });
    sorted.sort((a, b) => (rank[a.priority] ?? 999) - (rank[b.priority] ?? 999));
  } else if (sortMode === 'type') {
    sorted.sort((a, b) => a.type.localeCompare(b.type));
  } else {
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at)); // date-desc (default)
  }
  return sorted;
}

export async function runSearch() {
  const term = document.getElementById('search-page-input').value.trim();
  const resultsEl = document.getElementById('search-page-results');
  const countEl = document.getElementById('search-result-count');
  const sortMode = document.getElementById('search-sort-select').value;

  const items = await window.api.tasks.search(term);
  const filtered = items.filter((t) => checkedTypes.has(t.type) && checkedPriorities.has(t.priority) && checkedStatuses.has(t.status));
  const sorted = sortSearchResults(filtered, sortMode);

  resultsEl.innerHTML = '';
  countEl.textContent = `${sorted.length} result${sorted.length === 1 ? '' : 's'}`;
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No matches.';
    resultsEl.appendChild(empty);
    return;
  }
  sorted.forEach((task) => resultsEl.appendChild(renderTaskRow(task, { showDateBadge: true })));
}

// Separate from state.lastListTab: the search page's own "Back" target must
// survive a nested detail-view visit, which otherwise overwrites state.lastListTab
// with 'search' (so detail's Back correctly returns to search).
let searchReturnTab = 'todo';

function openSearchPage() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) searchReturnTab = activeBtn.dataset.tab;
  initSearchFilters();
  activateTab('search');
  document.getElementById('search-page-input').focus();
}

export function setupSearchPage() {
  document.getElementById('open-search-btn').addEventListener('click', openSearchPage);
  document.getElementById('search-back').addEventListener('click', () => activateTab(searchReturnTab));

  document.getElementById('search-page-input').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(runSearch, 250);
  });

  document.getElementById('search-filters-btn').addEventListener('click', () => {
    const panel = document.getElementById('search-filters-panel');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('search-sort-select').addEventListener('change', runSearch);
}
