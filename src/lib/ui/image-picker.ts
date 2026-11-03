// Component 15 – image picker: one way to give a picture – the button ("Choose a picture", camera icon), dropping it
// on the box, or pasting it. imagePicker() is the box with the picture, what it is and its buttons (the wine form);
// attachImageInput() gives the same button, drop and paste to another place (the quick-add row). Both check that it
// is a picture and not too big, and say so under the box.
import { t } from '../../i18n';
import { iconSvg } from './icons';
import { iconButton } from './icon-button';

export interface ImageInputOptions {
  /** Called with the picture */
  onFile: (file: File) => void;
  /** Shown when the file is not a picture or too big (default: a message under the box) */
  onError?: (message: string) => void;
  maxMb?: number;
  /** Where a picture can be dropped (gets .drag while one is held over it) */
  drop?: HTMLElement;
  /** Where a picture can be pasted */
  paste?: HTMLElement;
  /** The button that opens the file chooser (default: a new one, see pickButton()) */
  button?: HTMLElement;
}

/** The one "choose a picture" button: secondary, small, with the camera */
export function pickButton(label = t('image.choose'), opts: { block?: boolean } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small secondary' + (opts.block ? ' block' : '');
  b.innerHTML = iconSvg('camera');
  b.append(Object.assign(document.createElement('span'), { textContent: label }));
  return b;
}

/** Connects a button, a drop target and a paste target to one hidden file input. */
export function attachImageInput(o: ImageInputOptions) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', tabIndex: -1, className: 'sr' });
  input.setAttribute('aria-hidden', 'true');
  const button = o.button ?? pickButton();
  button.after(input);
  const maxMb = o.maxMb ?? 25;
  function take(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { o.onError?.(t('pick.notImage')); return; }
    if (f.size > maxMb * 1024 * 1024) { o.onError?.(t('pick.tooBig', { mb: maxMb })); return; }
    o.onFile(f);
  }
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { take(input.files?.[0]); input.value = ''; });
  const zone = o.drop;
  if (zone) {
    zone.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); zone.classList.add('drag'); } });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget as Node)) zone.classList.remove('drag'); });
    zone.addEventListener('drop', (e) => {
      zone.classList.remove('drag');
      const f = [...(e.dataTransfer?.files ?? [])][0];
      if (!f) return;
      e.preventDefault();
      take(f);
    });
  }
  o.paste?.addEventListener('paste', (e) => {
    const f = [...((e as ClipboardEvent).clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); take(f); }
  });
  return { button, input, choose: () => input.click() };
}

export interface ImagePicker {
  el: HTMLElement;
  /** The picture shown (or none); name: what it is (a file name), hint: a line under it */
  setImage: (url: string | null, name?: string, hint?: string) => void;
  /** Busy (reading or uploading): the picture dimmed and a spinner */
  setBusy: (on: boolean, text?: string) => void;
  /** An error under the box (null clears it) */
  setError: (message: string | null) => void;
  choose: () => void;
}

/** The box: the picture (or an empty frame), what it is, "Choose a picture" / "Change" and a quiet trash icon. */
export function imagePicker(o: Omit<ImageInputOptions, 'drop' | 'button'> & { onRemove?: () => void; id?: string }): ImagePicker {
  const el = document.createElement('div');
  el.className = 'pick';
  if (o.id) el.id = o.id;
  const pic = document.createElement('span');
  pic.className = 'pk-pic none';
  pic.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'pk-t';
  const title = document.createElement('b');
  const hint = document.createElement('span');
  text.append(title, hint);
  const act = document.createElement('span');
  act.className = 'pk-act';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const choose = pickButton(coarse ? t('pick.phoneBtn') : t('image.choose'));
  const remove = iconButton('trash', t('admin.removeImage'), { quiet: true });
  act.append(choose, remove);
  el.append(pic, text, act);
  const err = document.createElement('p');
  err.className = 'field-error';
  err.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = 'pick-wrap';
  wrap.append(el, err);

  const setError = (m: string | null) => { err.textContent = m ?? ''; err.hidden = !m; el.classList.toggle('err', !!m); };
  const files = attachImageInput({ ...o, button: choose, drop: el, paste: o.paste ?? el, onError: (m) => { setError(m); o.onError?.(m); },
    onFile: (f) => { setError(null); o.onFile(f); } });
  remove.addEventListener('click', () => { setError(null); o.onRemove?.(); });
  // Dragging over the box says what happens on drop
  el.addEventListener('dragover', () => { if (el.classList.contains('drag')) { title.textContent = t('pick.dropNow'); } });
  el.addEventListener('dragleave', () => paint());
  el.addEventListener('drop', () => paint());

  let url: string | null = null;
  let name = '';
  let line = '';
  function paint() {
    title.textContent = url ? (name || t('pick.current')) : t('pick.none');
    hint.textContent = url ? line : coarse ? t('pick.phoneHint') : t('pick.hint');
    hint.hidden = !hint.textContent;
    choose.querySelector('span')!.textContent = url ? t('image.change') : coarse ? t('pick.phoneBtn') : t('image.choose');
    remove.hidden = !url;
    el.classList.toggle('has', !!url);
    pic.classList.toggle('none', !url);
    pic.replaceChildren();
    if (url) pic.append(Object.assign(document.createElement('img'), { src: url, alt: '' }));
    else pic.innerHTML = iconSvg('image');
  }
  paint();
  return {
    el: wrap,
    setImage: (u, n = '', h = '') => { url = u; name = n; line = h; paint(); },
    setBusy: (on, busyText) => {
      el.classList.toggle('busy', on);
      el.setAttribute('aria-busy', String(on));
      choose.disabled = on;
      if (on && busyText) { hint.textContent = busyText; hint.hidden = false; }
      if (!on) paint();
    },
    setError,
    choose: files.choose,
  };
}
