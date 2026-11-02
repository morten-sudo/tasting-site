// One row for a person – a tasting's guests, the guest list, a tasting's hosts, the account's hosts, superadmin.
// The same columns as the wine rows (.tw-item): initials for a picture, the name (opens the panel when it can be
// edited), a line with email and more, status as small chips, something on the right (e.g. bottles), and the row's
// actions as icons. Read-only lists simply leave out onOpen and actions.

export interface PersonChip { text: string; tone?: 'ok' | 'wait' | 'no' | 'warn' | 'accent' | ''; title?: string; href?: string }

export interface PersonRowOptions {
  name: string;                    // shown name (falls back to the email at the caller)
  you?: string | null;             // "(you)" after the name
  meta?: (string | Node)[];        // the line under the name, joined by " · "
  chips?: PersonChip[];
  side?: Node | null;              // right column (bottles ordered …)
  actions?: HTMLElement[];         // icon buttons (iconButton())
  onOpen?: () => void;             // the name opens the side panel
  id?: string;                     // data-person
}

const TONE: Record<string, string> = { ok: 'vis-shown', wait: 'st-wait', no: 'ord-no', warn: 'st-unpaid', accent: 'tone-accent', '': '' };

/** "Anna Holm" → "AH"; "peter@example.dk" → "P" */
export function initials(name: string): string {
  const words = name.includes('@') ? [name] : name.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function personRow(o: PersonRowOptions): HTMLLIElement {
  const li = el('li', 'tw-item guest-row');
  if (o.id) li.dataset.person = o.id;
  const av = el('span', 'guest-av', initials(o.name));
  av.setAttribute('aria-hidden', 'true');
  li.append(av);

  const main = el('div', 'tw-main');
  const name = o.onOpen ? el('button', 'tw-name', o.name) : el('span', 'tw-name', o.name);
  if (o.onOpen) { (name as HTMLButtonElement).type = 'button'; name.addEventListener('click', o.onOpen); }
  if (o.you) name.append(el('span', 'person-you', ` (${o.you})`));
  main.append(name);
  const meta = (o.meta ?? []).filter((x) => x !== '' && x != null);
  if (meta.length) {
    const p = el('p', 'lib-meta');
    meta.forEach((x, i) => { if (i) p.append(' · '); p.append(x); });
    main.append(p);
  }
  if (o.chips?.length) {
    const chips = el('div', 'tw-chips');
    for (const c of o.chips) {
      const chip = c.href ? Object.assign(el('a', 'tw-chip', c.text), { href: c.href }) : el('span', 'tw-chip', c.text);
      const tone = TONE[c.tone ?? ''];
      if (tone) chip.classList.add(tone);
      if (c.title) chip.title = c.title;
      chips.append(chip);
    }
    main.append(chips);
  }
  li.append(main);

  const side = el('div', 'tw-price');
  if (o.side) side.append(o.side);
  li.append(side);

  const actions = el('div', 'tw-actions');
  actions.append(...(o.actions ?? []));
  li.append(actions);
  return li;
}
