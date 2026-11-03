// An error under a form field: red border (aria-invalid) and the message right below it, removed again
// as soon as the field is changed. For forms that check a few fields by hand (wine-validate.ts has its own rules).

/** Shows (text) or clears (null) the message under a field; `after` is the element to put it after. */
export function fieldError(el: HTMLElement, text: string | null, after: Element = el.closest('.field-row') ?? el.closest('.inline-form, .affix, .dt-row') ?? el) {
  const id = `${el.id}-error`;
  let m = document.getElementById(id);
  if (!text) {
    el.removeAttribute('aria-invalid');
    if (el.getAttribute('aria-describedby') === id) el.removeAttribute('aria-describedby');
    if (m) m.hidden = true;
    return;
  }
  if (!m) {
    m = document.createElement('p');
    m.id = id;
    m.className = 'field-error';
    m.setAttribute('aria-live', 'polite');
    after.after(m);
  }
  m.textContent = text;
  m.hidden = false;
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', id);
  // Gone again when the field is changed
  const clear = () => fieldError(el, null);
  el.addEventListener('input', clear, { once: true });
  el.addEventListener('change', clear, { once: true });
}

/** Puts the field in view (above a sticky footer) and focuses it. */
export function focusField(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
