// Component 27 – the one highlight after saving or adding: the row is scrolled into view, gets a warm background
// for a moment and fades (.saved in components.css; without motion it shows briefly and goes).
export function highlight(row: Element | null | undefined, opts: { scroll?: boolean | 'center' } = {}): boolean {
  if (!(row instanceof HTMLElement)) return false;
  const target = row.matches('li.lcard-item') ? (row.firstElementChild as HTMLElement) : row;
  if (opts.scroll !== false) {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: opts.scroll === 'center' ? 'center' : 'nearest', behavior: still ? 'auto' : 'smooth' });
  }
  target.classList.remove('saved');
  void target.offsetWidth; // start the animation again
  target.classList.add('saved');
  target.addEventListener('animationend', () => target.classList.remove('saved'), { once: true });
  return true;
}
