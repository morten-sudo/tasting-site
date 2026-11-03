// Zoom for every map (component 23): + and − in the map's corner, double-click or double-tap to zoom in, pinch on a
// phone or trackpad (ctrl + wheel), and drag to move around once zoomed. The page still scrolls normally with the
// wheel and one finger – the map only moves after it has been zoomed in. Works on the SVG's viewBox, so lines and
// labels stay sharp. Call it again after the map is redrawn (it reads the new SVG).
import { t } from '../../i18n';
import { iconButton } from './icon-button';

const MAX = 6;      // at most 6× the starting view
const STEP = 1.6;   // one press of + or −

type Box = { x: number; y: number; w: number; h: number };

export function mapZoom(box: HTMLElement) {
  const svg = box.querySelector<SVGSVGElement>('svg');
  if (!svg) return;
  const read = (): Box => { const [x, y, w, h] = (svg.getAttribute('viewBox') ?? '0 0 100 100').split(/[\s,]+/).map(Number); return { x, y, w, h }; };
  const home = read();     // the starting view (after fitToAreas) – zooming out never goes past it
  let view = { ...home };
  const set = (v: Box) => {
    const w = Math.min(home.w, Math.max(home.w / MAX, v.w)), h = w * (home.h / home.w);
    // Keep the view inside the starting view
    const x = Math.min(Math.max(v.x, home.x), home.x + home.w - w), y = Math.min(Math.max(v.y, home.y), home.y + home.h - h);
    view = { x, y, w, h };
    svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    const zoomed = w < home.w - 0.5;
    box.classList.toggle('zoomed', zoomed);
    out.disabled = !zoomed;
    zin.disabled = w <= home.w / MAX + 0.5;
  };
  /** Zoom by k around a point given as a share of the map (0–1), the middle by default. */
  const zoom = (k: number, fx = 0.5, fy = 0.5) => {
    const w = view.w / k, h = view.h / k;
    set({ x: view.x + (view.w - w) * fx, y: view.y + (view.h - h) * fy, w, h });
  };
  const share = (e: { clientX: number; clientY: number }) => {
    const r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };

  // The buttons, drawn once per box
  box.querySelector('.map-zoom')?.remove();
  const bar = document.createElement('div');
  bar.className = 'map-zoom';
  const zin = iconButton('plus', t('map.zoomIn'));
  const out = iconButton('minus', t('map.zoomOut'));
  for (const b of [zin, out]) b.classList.add('tip-below');
  zin.addEventListener('click', () => zoom(STEP));
  out.addEventListener('click', () => (view.w * STEP >= home.w - 0.5 ? set(home) : zoom(1 / STEP)));
  bar.append(zin, out);
  box.append(bar);
  set(home);

  svg.addEventListener('dblclick', (e) => { e.preventDefault(); const [fx, fy] = share(e); zoom(STEP, fx, fy); });
  // Pinch on a trackpad arrives as ctrl + wheel; a plain wheel scrolls the page
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const [fx, fy] = share(e);
    zoom(Math.exp(-e.deltaY / 200), fx, fy);
  }, { passive: false });

  // Drag (one pointer, once zoomed) and pinch (two fingers)
  const pts = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; view: Box } | null = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), view: { ...view } }; }
    if (box.classList.contains('zoomed') || pts.size === 2) svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1);
      const fx = ((a.x + b.x) / 2 - r.left) / r.width, fy = ((a.y + b.y) / 2 - r.top) / r.height;
      const w = pinch.view.w / k, h = pinch.view.h / k;
      set({ x: pinch.view.x + (pinch.view.w - w) * fx, y: pinch.view.y + (pinch.view.h - h) * fy, w, h });
    } else if (box.classList.contains('zoomed')) {
      set({ ...view, x: view.x - ((e.clientX - prev.x) / r.width) * view.w, y: view.y - ((e.clientY - prev.y) / r.height) * view.h });
    }
  });
  const end = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}
