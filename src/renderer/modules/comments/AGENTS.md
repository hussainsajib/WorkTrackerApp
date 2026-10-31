# modules/comments/

Task comments with a Quill rich-text editor.

- `sanitize.js` — pure, DOM-only HTML sanitizer for comments (`sanitizeCommentHtml`, `renderCommentContent`). Has no imports.
- `comments.js` — Quill setup, unposted drafts per task, paste-to-linkify, list rendering, Ctrl+Enter to post.

Security rules (this is the trust boundary)
- Comment HTML is sanitized on save and rendered through `renderCommentContent`. Only `P BR STRONG B EM I U S SPAN UL OL LI A` survive; every attribute is stripped except safe `color`/`background-color` on `SPAN` and `http(s):`/`mailto:` hrefs on `A`.
- Old comments are plain text with no tags; `renderCommentContent` escapes those instead of treating them as HTML.
- Links open in the user's browser through `window.api.shell.openExternal` (which allows only `http`, `https` and `mailto`), never by navigating the app window.

Gotchas
- Quill must be constructed lazily (`ensureCommentEditor`), after the task-detail panel is visible; building it inside a `display: none` container breaks its layout measurements.
- The plain-text paste handler is registered on `document` in the capture phase on purpose, so it runs before Quill's own paste listener.
- `Quill` is a global from `../../vendor/quill/quill.js`, not an import.
