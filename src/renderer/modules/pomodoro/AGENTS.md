# modules/pomodoro/

- `pomodoro.js` — the timer state machine (`pomodoro` object), controls, settings, and the quick-start button used on task rows.
- `sound.js` — `playBuzzSound`, a Web Audio buzzer (no sound asset).

Behaviour to preserve
- The countdown is computed from a wall-clock target (`endAt`), not by counting ticks, because renderer timers can be delayed or coalesced while the window is hidden.
- Phases never auto-start. Every focus or break needs an explicit Start.
- `focusCount` is display-only and seeded from the database (`syncTodayFocusCount`), so it survives restarts. `cyclePosition` is separate and drives the short/long break alternation; both a completion and a Skip advance it. Skip does not log a session.
- Starting a focus session marks the task "In progress" (`CONFIG.inProgressStatus`).
- `checkDayResetForFocus` snaps an unstarted break back to Focus once the configured daily reset time has passed.
- `cyclePosition` is initialised once in `init()` (`../../app.js`); do not reset it on later tab activations.

Settings (durations, cycle length, reset time) are saved under the `pomodoro` key via `window.api.settings`.
