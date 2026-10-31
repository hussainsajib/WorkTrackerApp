import { renderCommentContent, sanitizeCommentHtml } from './sanitize.js';
import { friendlyDateTime } from '../core/format.js';
import { state } from '../core/state.js';
import { renderTodo } from '../tasks/todo.js';

const commentDrafts = new Map(); // taskId -> Quill Delta (unposted comment)

export function saveCommentDraft() {
  if (!commentQuill || state.currentDetailTaskId == null) return;
  if (commentQuill.getText().trim().length === 0) commentDrafts.delete(state.currentDetailTaskId);
  else commentDrafts.set(state.currentDetailTaskId, commentQuill.getContents());
}

export function restoreCommentDraft() {
  const draft = commentDrafts.get(state.currentDetailTaskId);
  if (draft) commentQuill.setContents(draft, 'silent');
  else commentQuill.setText('', 'silent');
}

let commentQuill = null;

// Lazy — constructing Quill while its container is display:none (true
// whenever the task-detail panel hasn't been opened yet) breaks its internal
// layout measurements, so this only runs once the panel is actually visible.
export function ensureCommentEditor() {
  if (commentQuill) return;
  commentQuill = new Quill('#comment-editor', {
    theme: 'snow',
    placeholder: 'Add a comment...',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ],
    },
  });

  // Auto-linkify a URL found in HTML clipboard content (e.g. pasting a
  // paragraph of rendered text copied from a web page).
  commentQuill.clipboard.addMatcher(Node.TEXT_NODE, (node, delta) => {
    const text = node.data;
    if (typeof text !== 'string' || !URL_PATTERN.test(text)) return delta;
    return { ops: linkifyPlainText(text) };
  });

  // Quill's matcher pipeline above only runs when the clipboard provides
  // text/html — copying a bare URL from a browser's address bar (or any
  // plain-text source) typically provides ONLY text/plain, which Quill
  // converts to a Delta without ever visiting the matcher. Handling the
  // plain-text case explicitly here is what actually makes "paste a link"
  // reliably turn into a hyperlink.
  //
  // This must be registered on an ANCESTOR (document) in the capture phase,
  // not on commentQuill.root directly — Quill's own paste listener is
  // already registered on that same root element, and a same-element
  // listener's preventDefault() does NOT stop a sibling listener on that
  // element from also firing (that needs stopPropagation, which only works
  // if this handler runs first — guaranteed here since capture-phase
  // listeners on an ancestor always run before the target's own listeners).
  document.addEventListener('paste', (e) => {
    if (!commentQuill || !commentQuill.root.contains(e.target)) return;
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    if (clipboardData.getData('text/html').trim()) return; // let the matcher above handle real HTML paste
    const text = clipboardData.getData('text/plain');
    if (!text || !URL_PATTERN.test(text)) return;
    e.preventDefault();
    e.stopPropagation();
    const range = commentQuill.getSelection(true) || { index: commentQuill.getLength(), length: 0 };
    commentQuill.deleteText(range.index, range.length, 'user');
    commentQuill.updateContents({ ops: [{ retain: range.index }, ...linkifyPlainText(text)] }, 'user');
    commentQuill.setSelection(range.index + text.length, 0, 'user');
  }, true);
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function linkifyPlainText(text) {
  URL_PATTERN.lastIndex = 0;
  const ops = [];
  let lastIndex = 0;
  let match;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) ops.push({ insert: text.slice(lastIndex, match.index) });
    ops.push({ insert: match[0], attributes: { link: match[0] } });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) ops.push({ insert: text.slice(lastIndex) });
  return ops;
}

export async function renderComments() {
  const list = document.getElementById('comment-list');
  const items = await window.api.comments.list(state.currentDetailTaskId);
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No comments yet.';
    list.appendChild(empty);
    return;
  }
  items.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'comment-row';

    const time = document.createElement('div');
    time.className = 'comment-time';
    const timeText = document.createElement('span');
    timeText.textContent = friendlyDateTime(c.created_at);
    time.appendChild(timeText);

    const remove = document.createElement('button');
    remove.className = 'comment-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      await window.api.comments.remove(c.id);
      await renderComments();
      await renderTodo();
    });
    time.appendChild(remove);
    row.appendChild(time);

    const text = document.createElement('div');
    text.className = 'comment-text';
    renderCommentContent(text, c.text);
    row.appendChild(text);

    list.appendChild(row);
  });
}

export function setupComments() {
  // Delegated: comment rows are re-created on every render, so a single
  // listener on the container covers all current and future links.
  document.getElementById('comment-list').addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    window.api.shell.openExternal(link.getAttribute('href'));
  });

  const commentForm = document.getElementById('comment-add-form');
  // Ctrl+Enter posts the comment (alternative to the "Add comment" button).
  commentForm.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // keep Quill from also inserting a newline
      commentForm.requestSubmit();
    }
  }, true);

  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentDetailTaskId || !commentQuill) return;
    if (commentQuill.getText().trim().length === 0) return;
    const html = sanitizeCommentHtml(commentQuill.root.innerHTML);
    await window.api.comments.add(state.currentDetailTaskId, html);
    commentQuill.setText('');
    commentDrafts.delete(state.currentDetailTaskId);
    await renderComments();
    await renderTodo();
  });
}
