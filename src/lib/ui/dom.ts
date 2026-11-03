// The two small DOM helpers every page script uses: $ (an element by its id) and mk (a new element with a class
// and text). One copy for the whole site – pages and src/lib import these instead of writing their own.

/** The element with this id (the page is expected to have it) */
export const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

/** A new element: mk('p', 'help', 'Text') */
export function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string | null): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
