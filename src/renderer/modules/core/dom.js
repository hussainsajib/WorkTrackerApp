// Populates a <select> from a configured list, keeping the previous
// selection if it's still valid, else defaulting to the first item.
export function populateSelectSticky(selectEl, list) {
  const prev = selectEl.value;
  selectEl.innerHTML = '';
  list.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
  selectEl.value = list.includes(prev) ? prev : list[0];
}

// Populates a <select> from a configured list for an EXISTING record, adding
// the record's current value as an extra option if it's since been removed
// from the config — so editing never silently changes an unrelated field.
export function populateSelectWithCurrent(selectEl, list, currentValue) {
  selectEl.innerHTML = '';
  const values = currentValue && !list.includes(currentValue) ? [currentValue, ...list] : list;
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
  selectEl.value = currentValue;
}
