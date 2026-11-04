// An error under a form field: red border (aria-invalid) and the message right below it, removed again
// as soon as the field is changed. For forms that check a few fields by hand (wine-validate.ts has its own rules).

/** Shows (text) or clears (null) the message under a field; `after` is the element to put it after. */
export function fieldError(el: HTMLElement, text: string | null, after: Element = el.closest('.field-row') ?? el.closest('.inline-form, .affix, .dt-row') ?? el) {
  const id = `${el.id}-error`;
  let m = document.getElementById(id);
  if (!text) {
    el.removeAttribute('aria-invalid');
    if (el.getAttribute('aria-describedby') === id) el.removeAttribute('aria-describedby');
    if (m) liveText(m, null);
    return;
  }
  if (!m) {
    m = document.createElement('p');
    m.id = id;
    m.className = 'field-error';
    m.setAttribute('aria-live', 'polite');
    after.after(m);
  }
  liveText(m, text);
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', id);
  // Gone again when the field is changed
  const clear = () => fieldError(el, null);
  el.addEventListener('input', clear, { once: true });
  el.addEventListener('change', clear, { once: true });
}

/** Sets the text of an error line (a polite live region) and shows it, or hides it (null). A region that appears
 *  with its text already in it is often not read out (VoiceOver in particular), so a hidden or empty one is shown
 *  empty first and filled just after. */
export function liveText(m: HTMLElement, text: string | null) {
  if (!text) { m.hidden = true; m.textContent = ''; return; }
  if (!m.getAttribute('aria-live') && m.getAttribute('role') !== 'alert') m.setAttribute('aria-live', 'polite');
  if (m.hidden || !m.textContent) {
    m.textContent = '';
    m.hidden = false;
    const token = String(Math.random());
    m.dataset.live = token;
    window.setTimeout(() => { if (m.dataset.live === token && !m.hidden) m.textContent = text; }, 60);
  } else { delete m.dataset.live; m.textContent = text; }
}

/** Puts the field in view (above a sticky footer) and focuses it. */
export function focusField(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
