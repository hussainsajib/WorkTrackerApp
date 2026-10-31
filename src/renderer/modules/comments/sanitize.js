// Only these tags/attributes survive into a saved comment. Applied on save
// (not just on render) since that's the actual trust boundary — anything
// pasted into the editor from elsewhere could carry scripts/styles we don't
// want persisted.
const COMMENT_ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN', 'UL', 'OL', 'LI', 'A']);

function sanitizeCommentNode(parent) {
  Array.from(parent.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      parent.removeChild(node);
      return;
    }
    const tag = node.tagName;
    if (!COMMENT_ALLOWED_TAGS.has(tag)) {
      // Unwrap: drop the element but keep its content.
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      return;
    }

    // Capture the specific safe values BEFORE stripping every attribute.
    let safeStyle = null;
    let safeHref = null;
    if (tag === 'SPAN') {
      const parts = [];
      if (node.style.color) parts.push(`color: ${node.style.color}`);
      if (node.style.backgroundColor) parts.push(`background-color: ${node.style.backgroundColor}`);
      if (parts.length) safeStyle = parts.join('; ');
    }
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href)) safeHref = href;
    }

    Array.from(node.attributes).forEach((attr) => node.removeAttribute(attr.name));

    if (tag === 'A') {
      if (!safeHref) {
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }
      node.setAttribute('href', safeHref);
    }
    if (safeStyle) node.setAttribute('style', safeStyle);

    sanitizeCommentNode(node);
  });
}

export function sanitizeCommentHtml(rawHtml) {
  const container = document.createElement('div');
  container.innerHTML = rawHtml;
  sanitizeCommentNode(container);
  return container.innerHTML;
}

// Comments created before this feature are plain text with no tags at all —
// render those escaped (preserving line breaks) rather than as HTML.
export function renderCommentContent(container, rawText) {
  const looksLikeRichHtml = /<(p|br|strong|b|em|i|u|s|span|ul|ol|li|a)[ >]/i.test(rawText);
  if (looksLikeRichHtml) {
    container.innerHTML = sanitizeCommentHtml(rawText);
  } else {
    const escaped = rawText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    container.innerHTML = escaped.replace(/\n/g, '<br>');
  }
}
