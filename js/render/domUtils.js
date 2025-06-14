export function createElement(tag, { text, className, attributes = {}, events = {}, html } = {}) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  if (html) el.innerHTML = html;
  Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
  Object.entries(events).forEach(([k, v]) => el.addEventListener(k, v));
  return el;
}

export function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
