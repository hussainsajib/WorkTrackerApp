# modules/nav/

- `tabs.js` — `activateTab(name)` switches the visible panel and re-renders that tab's content; `setupTabs()` wires the tab buttons and the detail view's Back button.

Notes
- `activateTab` refreshes `state.todayStr` on every switch, because the app is a long-lived tray process and would otherwise keep a stale "today" after midnight.
- When adding a tab, add its panel in `../../index.html` (`#tab-<name>`), a button with `data-tab="<name>"`, and a render call in `activateTab`.
- Search, Recycle Bin and task detail are panels without tab buttons. Each remembers its own "return to" tab (`searchReturnTab`, `recycleBinReturnTab`, `state.lastListTab`) so nested navigation goes back correctly.
- This module imports from most feature folders (cyclic by design); keep those calls inside functions.
