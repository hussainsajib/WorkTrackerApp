// Polls every 30s. Two independent passes:
//  1. global daily reminders: fire for any enabled HH:MM slot matching now,
//     at most once per minute-slot.
//  2. per-task reminders (task_reminders): fire anything whose next_fire_at has
//     passed. Because the check is "<= now" (and runs immediately on start),
//     reminders missed while the app was closed fire on the next launch.
const CATCH_UP_BATCH_LIMIT = 3;

class ReminderScheduler {
  constructor({ reminderStore, taskReminderStore, doneStatus, onFire, onTaskReminder, onTaskReminderBatch }) {
    this.reminderStore = reminderStore;
    this.taskReminderStore = taskReminderStore;
    this.doneStatus = doneStatus;
    this.onFire = onFire;
    this.onTaskReminder = onTaskReminder;
    this.onTaskReminderBatch = onTaskReminderBatch;
    this.lastFiredSlot = null;
    this.timer = null;
  }

  start() {
    this.check();
    this.timer = setInterval(() => this.check(), 30 * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  check() {
    this.checkGlobal();
    this.checkTaskReminders();
  }

  checkGlobal() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const slot = `${now.toDateString()} ${hh}:${mm}`;
    if (slot === this.lastFiredSlot) return;

    const current = `${hh}:${mm}`;
    const due = this.reminderStore.list().filter((r) => r.enabled && r.time === current);
    if (due.length > 0) {
      this.lastFiredSlot = slot;
      due.forEach((r) => this.onFire(r));
    }
  }

  checkTaskReminders() {
    if (!this.taskReminderStore) return;
    const now = new Date();
    const due = this.taskReminderStore.due(now.toISOString(), this.doneStatus);
    if (due.length === 0) return;

    // Advance schedules first so a crash in the notifier can't cause a re-fire loop.
    due.forEach((r) => this.taskReminderStore.markFired(r, now));

    if (due.length > CATCH_UP_BATCH_LIMIT && this.onTaskReminderBatch) {
      this.onTaskReminderBatch(due);
    } else {
      due.forEach((r) => this.onTaskReminder(r));
    }
  }
}

module.exports = { ReminderScheduler };
