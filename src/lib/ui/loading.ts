// Component 35 – page loading: the one spinner and a line ("Getting the tasting …"), shown only after 350 ms (CSS),
// so fast pages do not flash it. src/components/ui/Loading.astro gives the same markup.
export function pageLoading(text: string, id?: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'page-loading';
  if (id) p.id = id;
  p.setAttribute('role', 'status');
  p.innerHTML = '<span class="spin lg" aria-hidden="true"></span>';
  p.append(Object.assign(document.createElement('span'), { textContent: text }));
  return p;
}
