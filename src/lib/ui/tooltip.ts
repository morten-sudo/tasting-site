// Component 36 – tooltip: a short explanation shown on hover and keyboard focus (and a tap on phones), in the one tip
// style – for everything except icon buttons (they show their name with data-tip in CSS) and the "?" help tips
// (help-tip.ts). Replaces title="" wherever a hint is meant for the user. Static markup: data-tip-text="…".
let bubble: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let timer = 0;

/** Gives el a tip (empty text removes it) */
export function tooltip(el: HTMLElement, text: string) {
  el.removeAttribute('title');
  if (text) el.dataset.tipText = text; else delete el.dataset.tipText;
  if (owner === el) hide();
}

function hide() {
  clearTimeout(timer);
  bubble?.remove();
  if (owner?.getAttribute('aria-describedby') === 'tooltip') owner.removeAttribute('aria-describedby');
  bubble = null;
  owner = null;
}

function show(el: HTMLElement) {
  const text = el.dataset.tipText;
  // An open menu's button: the menu is in view, so no tip over it
  if (!text || owner === el || el.getAttribute('aria-expanded') === 'true') return;
  hide();
  const b = document.createElement('div');
  b.className = 'tip small';
  b.id = 'tooltip';
  b.setAttribute('role', 'tooltip');
  b.textContent = text;
  // Inside an open modal dialog, or it would sit under it
  (el.closest('dialog[open]') ?? document.body).append(b);
  // Page coordinates in body; inside a dialog, relative to it (and its scroll)
  const p = b.offsetParent as HTMLElement | null;
  const inBody = !p || p === document.body || p === document.documentElement;
  const pr = inBody ? { left: -window.scrollX, top: -window.scrollY } : p!.getBoundingClientRect();
  const host = { left: pr.left - (inBody ? 0 : p!.scrollLeft), top: pr.top - (inBody ? 0 : p!.scrollTop) };
  const r = el.getBoundingClientRect();
  const w = b.offsetWidth, h = b.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
  const above = r.top - h - 6 > 8;
  b.style.left = `${left - host.left}px`;
  b.style.top = `${(above ? r.top - h - 6 : r.bottom + 6) - host.top}px`;
  if (!el.hasAttribute('aria-describedby')) el.setAttribute('aria-describedby', 'tooltip');
  bubble = b;
  owner = el;
}

if (typeof document !== 'undefined') {
  const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip-text]') ?? null;
  document.addEventListener('pointerover', (e) => {
    const el = target(e);
    if (!el) { if (owner && (e as PointerEvent).pointerType !== 'touch') hide(); return; }
    clearTimeout(timer);
    // A short wait on hover, so tips do not flicker when the pointer passes; a tap shows it at once for a while
    // (a menu button opens its menu on the tap – that says what it is)
    if ((e as PointerEvent).pointerType === 'touch') { if (!el.hasAttribute('aria-haspopup')) { show(el); timer = window.setTimeout(hide, 3000); } }
    else timer = window.setTimeout(() => show(el), 250);
  });
  document.addEventListener('pointerout', (e) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    const el = target(e);
    if (el && !el.contains(e.relatedTarget as Node)) { clearTimeout(timer); if (owner === el) hide(); }
  });
  document.addEventListener('focusin', (e) => { const el = target(e); if (el && el.matches(':focus-visible')) show(el); });
  document.addEventListener('focusout', (e) => { if (owner && target(e) === owner) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  // Pressing the element (e.g. a menu button) puts the tip away; a tap keeps the tip it just opened
  document.addEventListener('pointerdown', (e) => { if (owner && ((e as PointerEvent).pointerType !== 'touch' || target(e) !== owner)) hide(); });
  window.addEventListener('scroll', hide, { passive: true, capture: true });
}
