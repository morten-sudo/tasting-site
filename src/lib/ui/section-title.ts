// Component 40 – a heading on the one scale, made in TypeScript (SectionTitle.astro makes the same):
// "eyebrow" (small capitals over a section), "h2" (a section), "h3" (a sub-heading, a card's title).
export type TitleLevel = 'eyebrow' | 'h2' | 'h3';

export function sectionTitle(level: TitleLevel, text: string, tag?: 'h2' | 'h3' | 'h4' | 'p' | 'span'): HTMLElement {
  const el = document.createElement(tag ?? (level === 'eyebrow' ? 'p' : level));
  const look = level === 'eyebrow' ? 'eyebrow' : el.tagName.toLowerCase() === level ? '' : level;
  if (look) el.className = look;
  el.textContent = text;
  return el;
}
