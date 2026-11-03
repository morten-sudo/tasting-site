// Admin: the host writes the tasting's quiz – questions, 2–6 answers, the right answer and an explanation.
import { supabase } from './supabase';
import { t } from '../i18n';
import { sheetPanel, iconButton } from './admin-common';

export type AdminQuestion = {
  id: number; tasting_id: string; sort_order: number; question: string;
  options: { key: string; text: string }[]; correct_key: string | null; explanation: string | null;
};

const COLUMNS = 'id, tasting_id, sort_order, question, options, correct_key, explanation';
const KEYS = 'abcdef';
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

type Suggestion = { question: string; options: string[]; correct: number; explanation: string | null };

export function initQuizAdmin(tastingId: string, onChange: (questions: AdminQuestion[]) => void, quizLang: () => string = () => 'da') {
  let questions: AdminQuestion[] = [];
  let editing: AdminQuestion | null = null;

  const form = $<HTMLFormElement>('q-form');
  const panel = sheetPanel($<HTMLDialogElement>('q-panel'), () => { editing = null; });
  const list = $<HTMLOListElement>('q-admin-list');
  const optionsBox = $('qf-options');

  function showMsg(text: string) {
    const m = $('qf-msg');
    m.textContent = text;
    m.hidden = !text;
  }

  // One answer row: "right answer" radio + text + remove
  function optionRow(text = '', correct = false) {
    const row = mk('div', 'qf-option');
    const radio = mk('input');
    radio.type = 'radio';
    radio.name = 'qf-correct';
    radio.checked = correct;
    radio.setAttribute('aria-label', t('aq.markCorrect'));
    const input = mk('input', 'input');
    input.type = 'text';
    input.value = text;
    input.maxLength = 300;
    input.placeholder = t('aq.answerPlaceholder');
    const remove = iconButton('trash', t('aq.removeAnswer'), { quiet: true });
    remove.dataset.removeAnswer = '';
    remove.addEventListener('click', () => {
      if (optionsBox.children.length <= MIN_OPTIONS) return;
      row.remove();
      syncOptionButtons();
    });
    row.append(radio, input, remove);
    optionsBox.append(row);
    syncOptionButtons();
    return input;
  }

  function syncOptionButtons() {
    const n = optionsBox.children.length;
    ($('qf-add-option') as HTMLButtonElement).hidden = n >= MAX_OPTIONS;
    optionsBox.querySelectorAll<HTMLButtonElement>('[data-remove-answer]').forEach((b) => (b.disabled = n <= MIN_OPTIONS));
  }

  function openForm(q: AdminQuestion | null) {
    editing = q;
    form.reset();
    showMsg('');
    $('qf-title').textContent = q ? t('aq.editQuestion') : t('aq.newQuestion');
    const del = $('qf-delete');
    del.hidden = !q;
    del.textContent = t('aq.deleteQuestion');
    delete del.dataset.armed;
    $<HTMLTextAreaElement>('qf-question').value = q?.question ?? '';
    $<HTMLTextAreaElement>('qf-explanation').value = q?.explanation ?? '';
    optionsBox.replaceChildren();
    const opts = q?.options?.length ? q.options : [{ key: 'a', text: '' }, { key: 'b', text: '' }, { key: 'c', text: '' }];
    for (const o of opts) optionRow(o.text, q?.correct_key === o.key);
    panel.open();
    if (matchMedia('(min-width: 48rem)').matches) $<HTMLTextAreaElement>('qf-question').focus({ preventScroll: true });
  }

  function closeForm() {
    panel.close();
  }

  function render() {
    list.replaceChildren();
    $('q-empty').hidden = questions.length > 0;
    questions.forEach((q, i) => {
      const li = mk('li', 'q-row');
      const body = mk('div', 'q-body');
      body.append(mk('p', 'q-question', q.question));
      const ul = mk('ul', 'q-options');
      for (const o of q.options) {
        const item = mk('li', o.key === q.correct_key ? 'correct' : '', o.text);
        if (o.key === q.correct_key) item.setAttribute('aria-label', `${o.text} – ${t('aq.correct')}`);
        ul.append(item);
      }
      body.append(ul);
      if (!q.correct_key) body.append(mk('p', 'q-warn', t('aq.noCorrect')));

      const actions = mk('div', 'tw-actions');
      const up = iconButton('up', t('aq.moveUp', { n: i + 1 }));
      up.dataset.tip = t('aq.up');
      up.disabled = i === 0;
      up.addEventListener('click', () => move(i, -1));
      const down = iconButton('down', t('aq.moveDown', { n: i + 1 }));
      down.dataset.tip = t('aq.down');
      down.disabled = i === questions.length - 1;
      down.addEventListener('click', () => move(i, 1));
      const edit = iconButton('edit', `${t('admin.edit')}: ${q.question}`);
      edit.dataset.tip = t('admin.edit');
      edit.addEventListener('click', () => openForm(q));
      actions.append(up, down, edit);

      li.append(body, actions);
      list.append(li);
    });
    onChange(questions);
  }

  async function load() {
    const { data } = await supabase.from('quiz_questions').select(COLUMNS)
      .eq('tasting_id', tastingId).order('sort_order').order('id');
    questions = (data ?? []) as AdminQuestion[];
    render();
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= questions.length) return;
    [questions[index], questions[other]] = [questions[other], questions[index]];
    questions.forEach((q, i) => (q.sort_order = i + 1));
    render();
    await Promise.all(
      [questions[index], questions[other]].map((q) =>
        supabase.from('quiz_questions').update({ sort_order: q.sort_order }).eq('id', q.id)),
    );
  }

  // ---------- Events ----------
  $('q-add-toggle').addEventListener('click', () => openForm(null));
  $('qf-cancel').addEventListener('click', closeForm);
  $('qf-add-option').addEventListener('click', () => {
    if (optionsBox.children.length < MAX_OPTIONS) optionRow().focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = $<HTMLTextAreaElement>('qf-question').value.trim();
    if (!question) { showMsg(t('aq.questionMissing')); return; }

    const rows = [...optionsBox.querySelectorAll<HTMLElement>('.qf-option')]
      .map((r) => ({
        text: (r.querySelector('input[type=text]') as HTMLInputElement).value.trim(),
        correct: (r.querySelector('input[type=radio]') as HTMLInputElement).checked,
      }))
      .filter((r) => r.text);
    if (rows.length < MIN_OPTIONS) { showMsg(t('aq.tooFewAnswers')); return; }
    const correctIndex = rows.findIndex((r) => r.correct);
    if (correctIndex < 0) { showMsg(t('aq.pickCorrect')); return; }

    const options = rows.map((r, i) => ({ key: KEYS[i], text: r.text }));
    const row = {
      question,
      options,
      correct_key: KEYS[correctIndex],
      explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim() || null,
    };

    const save = $<HTMLButtonElement>('qf-save');
    save.disabled = true;
    const { error } = editing
      ? await supabase.from('quiz_questions').update(row).eq('id', editing.id)
      : await supabase.from('quiz_questions').insert({
          ...row,
          tasting_id: tastingId,
          sort_order: questions.reduce((m, q) => Math.max(m, q.sort_order), 0) + 1,
        });
    save.disabled = false;
    if (error) { showMsg(t('aq.notSaved')); return; }
    closeForm();
    await load();
  });

  // Delete in two steps; the guests' answers to the question go with it
  $('qf-delete').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('qf-delete');
    if (!editing) return;
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = t('aq.confirmDelete');
      return;
    }
    const { error } = await supabase.from('quiz_questions').delete().eq('id', editing.id);
    if (error) { showMsg(t('aq.notDeleted')); return; }
    closeForm();
    await load();
  });

  // ---------- Suggestions from AI ----------
  // Shown under the quiz; nothing is added before the host presses Add on a suggestion.
  const aiList = $<HTMLOListElement>('q-ai-list');
  async function suggest() {
    const status = $('q-ai-status');
    const level = document.querySelector<HTMLInputElement>('input[name="q-ai-level"]:checked')?.value ?? 'medium';
    status.textContent = t('aiQuiz.writing');
    status.classList.add('ai-busy');
    status.hidden = false;
    $<HTMLButtonElement>('q-ai').disabled = true;
    $<HTMLButtonElement>('q-ai-more').disabled = true;
    try {
      const { data: s } = await supabase.auth.getSession();
      // Neither the quiz nor the suggestions already shown are asked again
      const shown = [...aiList.querySelectorAll<HTMLElement>('.ai-q')].map((x) => x.textContent ?? '');
      const res = await fetch('/api/suggest-quiz', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ tasting_id: tastingId, lang: quizLang(), level, existing: [...questions.map((q) => q.question), ...shown] }),
      });
      const out = (await res.json().catch(() => ({}))) as { questions?: Suggestion[]; error?: string };
      if (!res.ok || !out.questions?.length) {
        status.textContent = t(out.error === 'no_wines' ? 'aiQuiz.noWines' : 'aiQuiz.failed');
        return;
      }
      aiList.append(...out.questions.map(suggestionCard));
      aiList.hidden = false;
      $('q-ai-warn').hidden = false;
      $('q-ai-more').hidden = false;
      status.textContent = t('aiQuiz.pick');
    } catch {
      status.textContent = t('aiQuiz.failed');
    } finally {
      status.classList.remove('ai-busy');
      $<HTMLButtonElement>('q-ai').disabled = false;
      $<HTMLButtonElement>('q-ai-more').disabled = false;
    }
  }

  function suggestionCard(sg: Suggestion) {
    const li = mk('li', 'ai-suggestion');
    li.append(mk('p', 'ai-q', sg.question));
    const ul = mk('ul', 'q-options');
    sg.options.forEach((o, i) => {
      const item = mk('li', i === sg.correct ? 'correct' : '', o);
      if (i === sg.correct) item.setAttribute('aria-label', `${o} – ${t('aq.correct')}`);
      ul.append(item);
    });
    li.append(ul);
    if (sg.explanation) li.append(mk('p', 'q-explain', sg.explanation));
    const row = mk('div', 'row-actions');
    const add = mk('button', 'btn small', t('aiQuiz.add'));
    add.type = 'button';
    const skip = mk('button', 'text-btn', t('aiQuiz.skip'));
    skip.type = 'button';
    add.addEventListener('click', async () => {
      add.disabled = true;
      const { error } = await supabase.from('quiz_questions').insert({
        tasting_id: tastingId,
        sort_order: questions.reduce((m, q) => Math.max(m, q.sort_order), 0) + 1,
        question: sg.question,
        options: sg.options.map((text, i) => ({ key: KEYS[i], text })),
        correct_key: KEYS[sg.correct],
        explanation: sg.explanation,
      });
      if (error) { add.disabled = false; alert(t('aq.notSaved')); return; }
      li.remove();
      if (!aiList.children.length) { aiList.hidden = true; $('q-ai-warn').hidden = true; }
      await load();
    });
    skip.addEventListener('click', () => { li.remove(); if (!aiList.children.length) { aiList.hidden = true; $('q-ai-warn').hidden = true; } });
    row.append(add, skip);
    li.append(row);
    return li;
  }
  $('q-ai').addEventListener('click', suggest);
  $('q-ai-more').addEventListener('click', suggest);

  return { load };
}
