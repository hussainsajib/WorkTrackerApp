# vendor/

Third-party code copied into the repo and served as-is. Do not edit these files and do not reformat or lint them.

- `quill/` — Quill Editor v2.0.3 (BSD-3-Clause, see `quill/LICENSE.txt`): `quill.js` (minified, exposes a global `Quill`) and `quill.snow.css` (the Snow theme).

Rules
- `index.html` loads these with plain `<link>` / `<script>` tags before `app.js`. They are not ES modules and are not imported.
- To upgrade, replace the files from the `quill` package's `dist/` and update the version in this note. `package.json` lists `quill` as a dependency, but the app loads the copy here, not from `node_modules`.
- App-specific toolbar and editor styling is in `../styles.css` (scoped under `#comment-add-form`), not in the vendored CSS.
- The CSP allows scripts only from `'self'`, so any new library must also be copied here, not loaded from a CDN.
