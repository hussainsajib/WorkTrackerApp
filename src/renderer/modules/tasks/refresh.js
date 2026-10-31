import { refreshPomodoroTaskOptions } from '../pomodoro/pomodoro.js';
import { renderTasks } from './allTasks.js';
import { renderTodo } from './todo.js';

export async function refreshAfterTaskChange() {
  await renderTodo();
  if (document.getElementById('tab-tasks').classList.contains('active')) await renderTasks();
  if (document.getElementById('tab-pomodoro').classList.contains('active')) await refreshPomodoroTaskOptions();
}
