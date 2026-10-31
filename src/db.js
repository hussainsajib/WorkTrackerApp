const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DEFAULT_TASK_TYPES = ['Ticket', 'Infra', 'Ad-hoc'];
const DEFAULT_PRIORITIES = ['Highest', 'High', 'Neutral', 'Low'];
const DEFAULT_STATUSES = ['Not started', 'In progress', 'Done', 'Blocked'];

const TASK_AGGREGATES_SQL = `
  (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count,
  (SELECT COUNT(*) FROM pomodoro_sessions p WHERE p.task_id = t.id) AS pomodoro_count,
  (SELECT COALESCE(SUM(p.duration_seconds), 0) FROM pomodoro_sessions p WHERE p.task_id = t.id) AS pomodoro_seconds
`;

function priorityRankCase(priorities) {
  const whens = priorities.map(() => 'WHEN ? THEN ').map((w, i) => `${w}${i}`).join(' ');
  return `CASE priority ${whens} ELSE ${priorities.length} END`;
}

function getSchemaVersion(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('_schemaVersion');
  return row ? parseInt(row.value, 10) : 1;
}

function setSchemaVersion(db, version) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('_schemaVersion', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(version));
}

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      type TEXT NOT NULL,
      ref TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Neutral',
      created_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_created_date ON tasks(created_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);

    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      duration_seconds INTEGER NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_task_id ON pomodoro_sessions(task_id);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ON DELETE SET NULL (not CASCADE, unlike comments/pomodoro_sessions):
    -- a hard-deleted task's activity history should survive via the
    -- task_text snapshot below, not vanish with the task.
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      task_text TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL,
      created_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_created_date ON activity_log(created_date);
    CREATE INDEX IF NOT EXISTS idx_activity_log_task_id ON activity_log(task_id);
  `);

  // v0 -> v1: databases created before the priority column existed.
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
  if (!taskColumns.includes('priority')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Neutral'`);
  }

  // v1 -> v2: drop the fixed CHECK(type/status/priority IN (...)) constraints
  // so task type, priority, and status become user-configurable (see ConfigStore).
  //
  // Built under a temp name and swapped in via DROP + RENAME (rather than
  // renaming the live "tasks" table itself) so that comments/pomodoro_sessions
  // — which reference "tasks" by name with ON DELETE CASCADE — never get their
  // schema rewritten to point at a since-dropped table. foreign_keys is
  // disabled for the swap because SQLite cascade-deletes a child table's rows
  // when its referenced parent table is dropped while enforcement is on,
  // which would otherwise wipe every comment/pomodoro session.
  if (getSchemaVersion(db) < 2) {
    db.pragma('foreign_keys = OFF');
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE tasks_new_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          type TEXT NOT NULL,
          ref TEXT,
          status TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'Neutral',
          created_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        )
      `);
      db.exec(`
        INSERT INTO tasks_new_v2 (id, text, type, ref, status, priority, created_date, created_at, updated_at, completed_at)
        SELECT id, text, type, ref, status, priority, created_date, created_at, updated_at, completed_at FROM tasks
      `);
      db.exec('DROP TABLE tasks');
      db.exec('ALTER TABLE tasks_new_v2 RENAME TO tasks');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_created_date ON tasks(created_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      setSchemaVersion(db, 2);
    });
    migrate();
    db.pragma('foreign_keys = ON');
  }

  // v2 -> v3: add deleted_at for soft-delete (swipe-to-delete moves a task to
  // the Recycle Bin instead of erasing it outright).
  if (getSchemaVersion(db) < 3) {
    db.exec(`ALTER TABLE tasks ADD COLUMN deleted_at TEXT`);
    setSchemaVersion(db, 3);
  }

  // v3 -> v4: one-time backfill of activity_log from data that already
  // existed before the Activity tab shipped. Only 'created', 'comment_added',
  // and 'pomodoro_completed' are backfilled — tasks.updated_at only ever held
  // the *latest* touch, so past status changes are unrecoverable and are
  // deliberately not fabricated here. Backfilled comment/pomodoro dates use
  // substr(created_at, 1, 10) (a UTC slice of the stored ISO timestamp)
  // instead of the app's local todayStr(), since the original local offset
  // isn't recoverable; this only affects historical rows near a day boundary
  // — everything recorded going forward uses ActivityStore.record's local date.
  if (getSchemaVersion(db) < 4) {
    const backfill = db.transaction(() => {
      db.prepare(`
        INSERT INTO activity_log (task_id, task_text, action, detail, created_at, created_date)
        SELECT id, text, 'created', 'Task created', created_at, created_date FROM tasks
      `).run();
      db.prepare(`
        INSERT INTO activity_log (task_id, task_text, action, detail, created_at, created_date)
        SELECT c.task_id, t.text, 'comment_added', 'Comment added', c.created_at, substr(c.created_at, 1, 10)
        FROM comments c JOIN tasks t ON t.id = c.task_id
      `).run();
      db.prepare(`
        INSERT INTO activity_log (task_id, task_text, action, detail, created_at, created_date)
        SELECT p.task_id, t.text, 'pomodoro_completed', 'Pomodoro completed', p.completed_at, substr(p.completed_at, 1, 10)
        FROM pomodoro_sessions p LEFT JOIN tasks t ON t.id = p.task_id
      `).run();
      setSchemaVersion(db, 4);
    });
    backfill();
  }

  // v4 -> v5: optional per-task deadline + per-task reminders. due_at is a UTC
  // ISO timestamp; a date-only deadline is stored as local end-of-day with
  // due_has_time = 0. Plain ALTER/CREATE (no tasks rebuild), so the
  // comments/pomodoro cascade caveat above doesn't apply. The column checks
  // keep this safe on fresh installs, where v2's rebuild runs first.
  if (getSchemaVersion(db) < 5) {
    const cols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
    if (!cols.includes('due_at')) db.exec('ALTER TABLE tasks ADD COLUMN due_at TEXT');
    if (!cols.includes('due_has_time')) db.exec('ALTER TABLE tasks ADD COLUMN due_has_time INTEGER NOT NULL DEFAULT 0');
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        params TEXT NOT NULL DEFAULT '{}',
        next_fire_at TEXT,
        last_fired_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_task_reminders_next ON task_reminders(next_fire_at);
      CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON task_reminders(task_id);
    `);
    setSchemaVersion(db, 5);
  }

  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function localDayRangeIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

class TaskStore {
  constructor(db) {
    this.db = db;
  }

  addTask({ text, type, ref, priority, status, due_at, due_has_time }) {
    const ts = nowIso();
    const stmt = this.db.prepare(`
      INSERT INTO tasks (text, type, ref, status, priority, created_date, created_at, updated_at, due_at, due_has_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(text, type, ref || null, status || 'Not started', priority || 'Neutral', todayStr(), ts, ts,
      due_at || null, due_at && due_has_time ? 1 : 0);
    return this.getTask(info.lastInsertRowid);
  }

  getTask(id) {
    return this.db.prepare(`SELECT t.*, ${TASK_AGGREGATES_SQL} FROM tasks t WHERE t.id = ?`).get(id);
  }

  updateStatus(id, status, { doneStatus }) {
    const ts = nowIso();
    const completedAt = status === doneStatus ? ts : null;
    this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).run(status, ts, completedAt, id);
    return this.getTask(id);
  }

  // due_at/due_has_time are only touched when the payload includes `due_at`
  // (null clears the deadline), so callers that omit it leave it alone.
  updateTask(id, { text, type, ref, priority, due_at, due_has_time }) {
    const ts = nowIso();
    this.db.prepare(`
      UPDATE tasks SET text = ?, type = ?, ref = ?, priority = ?, updated_at = ?
      WHERE id = ?
    `).run(text, type, ref || null, priority || 'Neutral', ts, id);
    if (due_at !== undefined) {
      this.db.prepare('UPDATE tasks SET due_at = ?, due_has_time = ? WHERE id = ?')
        .run(due_at || null, due_at && due_has_time ? 1 : 0, id);
    }
    return this.getTask(id);
  }

  // Permanent delete — used by the Recycle Bin's "Delete forever".
  deleteTask(id) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  // Swipe-to-delete moves a task to the Recycle Bin rather than erasing it.
  softDeleteTask(id) {
    this.db.prepare('UPDATE tasks SET deleted_at = ? WHERE id = ?').run(nowIso(), id);
    return this.getTask(id);
  }

  restoreTask(id) {
    this.db.prepare('UPDATE tasks SET deleted_at = NULL WHERE id = ?').run(id);
    return this.getTask(id);
  }

  getDeletedTasks() {
    return this.db.prepare(`
      SELECT t.*, ${TASK_AGGREGATES_SQL}
      FROM tasks t
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `).all();
  }

  // Every task ever created, for the full-history "Tasks" view.
  getAllTasksView({ priorities }) {
    const sql = `
      SELECT t.*, ${TASK_AGGREGATES_SQL}
      FROM tasks t
      WHERE deleted_at IS NULL
      ORDER BY created_date ASC, ${priorityRankCase(priorities)}, created_at ASC
    `;
    return this.db.prepare(sql).all(...priorities);
  }

  searchTasks(term) {
    return this.db.prepare(`
      SELECT t.*, ${TASK_AGGREGATES_SQL}
      FROM tasks t
      WHERE deleted_at IS NULL AND (text LIKE ? OR ref LIKE ?)
      ORDER BY created_date DESC
      LIMIT 200
    `).all(`%${term}%`, `%${term}%`);
  }

  // Undone tasks, most relevant first — used for the pomodoro task picker.
  getActiveTasks({ priorities, doneStatus }) {
    const sql = `
      SELECT t.*, ${TASK_AGGREGATES_SQL}
      FROM tasks t
      WHERE deleted_at IS NULL AND status != ?
      ORDER BY ${priorityRankCase(priorities)}, (due_at IS NULL), due_at ASC, created_at DESC
    `;
    return this.db.prepare(sql).all(doneStatus, ...priorities);
  }
}

class CommentStore {
  constructor(db) {
    this.db = db;
  }

  list(taskId) {
    return this.db.prepare(`
      SELECT * FROM comments WHERE task_id = ? ORDER BY created_at DESC
    `).all(taskId);
  }

  add(taskId, text) {
    const ts = nowIso();
    const info = this.db.prepare(`
      INSERT INTO comments (task_id, text, created_at) VALUES (?, ?, ?)
    `).run(taskId, text, ts);
    return this.db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  }

  remove(id) {
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  }
}

class PomodoroStore {
  constructor(db) {
    this.db = db;
  }

  recordSession(taskId, durationSeconds) {
    const ts = nowIso();
    this.db.prepare(`
      INSERT INTO pomodoro_sessions (task_id, duration_seconds, completed_at) VALUES (?, ?, ?)
    `).run(taskId || null, durationSeconds, ts);
  }

  getStatsForTask(taskId) {
    return this.db.prepare(`
      SELECT COUNT(*) AS session_count, COALESCE(SUM(duration_seconds), 0) AS total_seconds
      FROM pomodoro_sessions WHERE task_id = ?
    `).get(taskId);
  }

  getTodaySessionCount({ start, end }) {
    return this.db.prepare(`
      SELECT COUNT(*) AS c FROM pomodoro_sessions WHERE completed_at >= ? AND completed_at < ?
    `).get(start, end).c;
  }
}

class ActivityStore {
  constructor(db) {
    this.db = db;
  }

  record(taskId, action, detail, taskText) {
    this.db.prepare(`
      INSERT INTO activity_log (task_id, task_text, action, detail, created_at, created_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(taskId || null, taskText || null, action, detail || null, nowIso(), todayStr());
  }

  // Notes are filed under the day being viewed (dateStr), keeping the current
  // time-of-day so created_at still sorts and displays sensibly.
  addNote(text, dateStr) {
    if (!dateStr || dateStr === todayStr()) {
      this.record(null, 'note', text, null);
      return;
    }
    const now = new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const at = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
    this.db.prepare(`
      INSERT INTO activity_log (task_id, task_text, action, detail, created_at, created_date)
      VALUES (NULL, NULL, 'note', ?, ?, ?)
    `).run(text, at.toISOString(), dateStr);
  }

  listForDate(dateStr) {
    return this.db.prepare(`
      SELECT * FROM activity_log WHERE created_date = ? ORDER BY created_at ASC
    `).all(dateStr);
  }

  // Backs a "jump to the nearest day with entries" Prev/Next control, since
  // most days won't have anything logged.
  listDatesWithActivity() {
    return this.db.prepare(`
      SELECT DISTINCT created_date FROM activity_log ORDER BY created_date DESC
    `).all().map((r) => r.created_date);
  }

  updateNote(id, text) {
    this.db.prepare("UPDATE activity_log SET detail = ? WHERE id = ? AND action = 'note'").run(text, id);
  }

  remove(id) {
    this.db.prepare('DELETE FROM activity_log WHERE id = ?').run(id);
  }
}

class ReminderStore {
  constructor(db) {
    this.db = db;
  }

  list() {
    return this.db.prepare('SELECT * FROM reminders ORDER BY time ASC').all();
  }

  add(time) {
    const info = this.db.prepare('INSERT INTO reminders (time, enabled) VALUES (?, 1)').run(time);
    return info.lastInsertRowid;
  }

  remove(id) {
    this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  }

  setEnabled(id, enabled) {
    this.db.prepare('UPDATE reminders SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }
}

// ---- Per-task reminders -------------------------------------------------
// kind + params:
//   absolute        {at}                          one-shot at an ISO instant
//   before_deadline {offsetMin}                   due_at - offset; follows the deadline
//   recurring       {every:'daily'|'weekdays'|'weekly'|'interval', time:'HH:MM',
//                    weekday?:0-6, n?:days, startDate?:'YYYY-MM-DD', until?:'YYYY-MM-DD'}
//   nag             {everyMin, startAt?}          repeats until the task is Done
// To add a kind: add a case in computeNextFire and a UI option.

function atLocalTime(dateObj, hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number);
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), h || 0, m || 0, 0, 0);
}

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function recurringNext(p, now) {
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < 800; i++) {
    const candidate = atLocalTime(day, p.time);
    let ok = candidate > now;
    const dow = day.getDay();
    if (ok && p.every === 'weekdays') ok = dow >= 1 && dow <= 5;
    if (ok && p.every === 'weekly') ok = dow === (p.weekday ?? 1);
    if (ok && p.every === 'interval') {
      const n = Math.max(1, p.n || 1);
      const start = parseLocalDate(p.startDate || todayStr());
      const diff = Math.round((day - start) / 86400000);
      ok = diff >= 0 && diff % n === 0;
    }
    if (ok) {
      if (p.until && candidate > new Date(parseLocalDate(p.until).getTime() + 86400000 - 1)) return null;
      return candidate;
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return null;
}

// Returns the next fire instant as an ISO string, or null if nothing is pending.
// afterFire = true means the reminder just fired (so one-shots are finished).
function computeNextFire(reminder, task, now = new Date(), { afterFire = false } = {}) {
  const p = reminder.params || {};
  switch (reminder.kind) {
    case 'absolute':
      return afterFire || reminder.last_fired_at || !p.at ? null : p.at;
    case 'before_deadline': {
      if (afterFire || !task || !task.due_at) return null;
      const at = new Date(new Date(task.due_at).getTime() - (p.offsetMin || 0) * 60000);
      return at > now || !reminder.last_fired_at ? at.toISOString() : null;
    }
    case 'recurring': {
      const next = recurringNext(p, now);
      return next ? next.toISOString() : null;
    }
    case 'nag': {
      const every = Math.max(1, p.everyMin || 30) * 60000;
      if (afterFire) return new Date(now.getTime() + every).toISOString();
      return p.startAt || new Date(now.getTime() + every).toISOString();
    }
    default:
      return null;
  }
}

function hydrateReminder(row) {
  if (!row) return row;
  let params = {};
  try { params = JSON.parse(row.params); } catch { /* keep {} */ }
  return { ...row, params };
}

class TaskReminderStore {
  constructor(db) {
    this.db = db;
  }

  get(id) {
    return hydrateReminder(this.db.prepare('SELECT * FROM task_reminders WHERE id = ?').get(id));
  }

  listForTask(taskId) {
    return this.db.prepare('SELECT * FROM task_reminders WHERE task_id = ? ORDER BY id ASC').all(taskId).map(hydrateReminder);
  }

  // Tasks that have at least one live reminder, for the bell icon in the list.
  taskIdsWithActive() {
    return this.db.prepare(`
      SELECT DISTINCT task_id FROM task_reminders WHERE enabled = 1 AND next_fire_at IS NOT NULL
    `).all().map((r) => r.task_id);
  }

  add(taskId, kind, params) {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const draft = { kind, params: params || {}, last_fired_at: null };
    const next = computeNextFire(draft, task);
    const info = this.db.prepare(`
      INSERT INTO task_reminders (task_id, kind, params, next_fire_at, enabled) VALUES (?, ?, ?, ?, 1)
    `).run(taskId, kind, JSON.stringify(draft.params), next);
    return this.get(info.lastInsertRowid);
  }

  setEnabled(id, enabled) {
    const r = this.get(id);
    if (!r) return null;
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(r.task_id);
    // Re-enabling restarts the schedule (e.g. a nag counts from now).
    const next = enabled ? computeNextFire({ ...r, last_fired_at: null }, task) : r.next_fire_at;
    this.db.prepare('UPDATE task_reminders SET enabled = ?, next_fire_at = ? WHERE id = ?').run(enabled ? 1 : 0, next, id);
    return this.get(id);
  }

  remove(id) {
    this.db.prepare('DELETE FROM task_reminders WHERE id = ?').run(id);
  }

  // Deadline changed: relative reminders follow it.
  recomputeForDeadline(taskId) {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const rows = this.listForTask(taskId).filter((r) => r.kind === 'before_deadline');
    const upd = this.db.prepare('UPDATE task_reminders SET next_fire_at = ?, last_fired_at = NULL WHERE id = ?');
    rows.forEach((r) => {
      let next = computeNextFire({ ...r, last_fired_at: null }, task);
      if (next && new Date(next) <= new Date()) next = null; // already past; don't fire retroactively
      upd.run(next, r.id);
    });
  }

  // Due reminders for live tasks only — Done/deleted tasks never fire, and
  // their reminders resume automatically if the task is reopened/restored.
  due(nowIso_, doneStatus) {
    return this.db.prepare(`
      SELECT r.*, t.text AS task_text, t.due_at AS task_due_at, t.due_has_time AS task_due_has_time
      FROM task_reminders r JOIN tasks t ON t.id = r.task_id
      WHERE r.enabled = 1 AND r.next_fire_at IS NOT NULL AND r.next_fire_at <= ?
        AND t.deleted_at IS NULL AND t.status != ?
      ORDER BY r.next_fire_at ASC
    `).all(nowIso_, doneStatus).map(hydrateReminder);
  }

  markFired(reminder, now = new Date()) {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(reminder.task_id);
    const next = computeNextFire(reminder, task, now, { afterFire: true });
    this.db.prepare('UPDATE task_reminders SET last_fired_at = ?, next_fire_at = ? WHERE id = ?')
      .run(now.toISOString(), next, reminder.id);
  }

  snooze(id, untilIso) {
    this.db.prepare('UPDATE task_reminders SET next_fire_at = ?, enabled = 1 WHERE id = ?').run(untilIso, id);
    return this.get(id);
  }
}

class SettingsStore {
  constructor(db) {
    this.db = db;
  }

  get(key, fallback) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  set(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, serialized);
  }
}

function sanitizeList(list) {
  const cleaned = (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean);
  return cleaned.length ? cleaned : ['Default'];
}

class ConfigStore {
  constructor(settingsStore) {
    this.settings = settingsStore;
  }

  getAll() {
    return {
      taskTypes: this.getTaskTypes(),
      priorities: this.getPriorities(),
      statuses: this.getStatuses(),
      doneStatus: this.getDoneStatus(),
      inProgressStatus: this.getInProgressStatus(),
    };
  }

  getTaskTypes() { return this.settings.get('taskTypes', DEFAULT_TASK_TYPES); }
  setTaskTypes(list) { this.settings.set('taskTypes', sanitizeList(list)); }

  getPriorities() { return this.settings.get('priorities', DEFAULT_PRIORITIES); }
  setPriorities(list) { this.settings.set('priorities', sanitizeList(list)); }

  // Statuses are fixed (not user-configurable) — always the four defaults.
  getStatuses() { return DEFAULT_STATUSES; }

  // Convention: the first status is where new tasks start.
  getDefaultStatus() { return DEFAULT_STATUSES[0]; }

  getDoneStatus() { return 'Done'; }

  getInProgressStatus() { return 'In progress'; }
}

module.exports = {
  openDatabase,
  TaskStore,
  CommentStore,
  PomodoroStore,
  ActivityStore,
  ReminderStore,
  TaskReminderStore,
  SettingsStore,
  ConfigStore,
  computeNextFire,
  todayStr,
  localDayRangeIso,
};
