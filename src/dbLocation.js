const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// The database location can't live in the database itself, so a small pointer
// file in userData records the user's chosen path. No pointer = default path.
const DB_FILE_NAME = 'work-tracker.db';
const POINTER_FILE_NAME = 'db-location.json';

function defaultDbPath(userDataPath) {
  return path.join(userDataPath, DB_FILE_NAME);
}

function readCustomPath(userDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(userDataPath, POINTER_FILE_NAME), 'utf-8'));
    return typeof parsed.path === 'string' && parsed.path ? parsed.path : null;
  } catch {
    return null;
  }
}

// Pass null to go back to the default location.
function setCustomPath(userDataPath, dbPath) {
  const pointer = path.join(userDataPath, POINTER_FILE_NAME);
  if (dbPath) {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(pointer, JSON.stringify({ path: dbPath }), 'utf-8');
  } else {
    fs.rmSync(pointer, { force: true });
  }
}

// Falls back to the default path (with a warning) if the chosen file has gone
// missing, e.g. an unplugged drive. Opening it as-is would silently create an
// empty database there and look like data loss.
function resolveDbPath(userDataPath) {
  const custom = readCustomPath(userDataPath);
  if (!custom) return { path: defaultDbPath(userDataPath), warning: null };
  if (fs.existsSync(custom)) return { path: custom, warning: null };
  return {
    path: defaultDbPath(userDataPath),
    warning: `The database at\n${custom}\ncould not be found, so the default location is being used. Reconnect the drive and restart, or choose a new location in Settings.`,
  };
}

function validateDbFile(filePath) {
  let probe;
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true });
    const row = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get();
    return row ? { ok: true } : { ok: false, error: 'That file is not a Work Tracker database (no tasks table).' };
  } catch {
    return { ok: false, error: 'That file is not a readable SQLite database.' };
  } finally {
    if (probe) probe.close();
  }
}

module.exports = { DB_FILE_NAME, defaultDbPath, resolveDbPath, setCustomPath, validateDbFile };
