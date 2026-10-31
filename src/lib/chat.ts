// Event chat: renders the conversation, polls for new messages every few seconds while the page
// is visible, and sends new ones. The same code serves guests (invite code) and the host.
import { t, locale } from '../i18n';

export type ChatMessage = { id: number; author: string; body: string; created_at: string; from_host: boolean; mine: boolean };

type Options = {
  prefix: string;
  load: (afterId: number) => Promise<ChatMessage[] | null>;
  send: (body: string) => Promise<'ok' | 'too_many' | 'error'>;
  remove?: (id: number) => Promise<boolean>;      // the host can delete messages
};

const POLL_MS = 4000;

export function initChat({ prefix, load, send, remove }: Options) {
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(`${prefix}-${id}`) as E;
  const list = $('messages');
  const input = $<HTMLTextAreaElement>('input');
  const err = $('error');
  let lastId = 0;
  let lastDay = '';
  let timer: number | undefined;

  const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const timeFmt = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;

  function item(m: ChatMessage) {
    const li = document.createElement('li');
    li.className = 'chat-msg' + (m.mine ? ' mine' : '') + (m.from_host ? ' host' : '');
    li.dataset.id = String(m.id);
    if (!m.mine) {
      const who = document.createElement('span');
      who.className = 'chat-who';
      who.textContent = m.author + (m.from_host ? ` · ${t('chat.host')}` : '');
      li.append(who);
    }
    const bubble = document.createElement('p');
    bubble.className = 'chat-bubble';
    bubble.textContent = m.body;
    const time = document.createElement('time');
    time.dateTime = m.created_at;
    time.textContent = timeFmt.format(new Date(m.created_at));
    li.append(bubble, time);
    if (remove) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chat-del';
      del.textContent = t('chat.delete');
      del.addEventListener('click', async () => {
        if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = t('admin.confirmDelete'); return; }
        if (await remove(m.id)) li.remove();
      });
      li.append(del);
    }
    return li;
  }

  function add(messages: ChatMessage[]) {
    if (!messages.length) return;
    const stick = nearBottom() || lastId === 0;
    for (const m of messages) {
      if (list.querySelector(`[data-id="${m.id}"]`)) continue;
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        const sep = document.createElement('li');
        sep.className = 'chat-day';
        const d = dayFmt.format(new Date(m.created_at));
        sep.textContent = d[0].toUpperCase() + d.slice(1);
        list.append(sep);
        lastDay = day;
      }
      list.append(item(m));
      lastId = Math.max(lastId, m.id);
    }
    $('empty').hidden = true;
    if (stick) list.scrollTop = list.scrollHeight;
  }

  async function poll() {
    const msgs = await load(lastId);
    if (msgs) add(msgs);
  }

  function schedule() {
    window.clearTimeout(timer);
    if (document.visibilityState === 'visible') timer = window.setTimeout(async () => { await poll(); schedule(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); schedule(); });

  // Grow the box with the text; Enter sends, Shift+Enter makes a new line
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('form').requestSubmit(); }
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    err.hidden = true;
    input.disabled = true;
    const res = await send(body);
    input.disabled = false;
    if (res === 'ok') {
      input.value = '';
      input.style.height = 'auto';
      await poll();
      list.scrollTop = list.scrollHeight;
    } else {
      err.textContent = t(res === 'too_many' ? 'chat.tooMany' : 'chat.notSent');
      err.hidden = false;
    }
    input.focus();
  });

  return {
    async start() {
      await poll();
      $('empty').hidden = lastId > 0;
      schedule();
    },
  };
}
