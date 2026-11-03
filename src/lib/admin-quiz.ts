// Admin: the host writes the tasting's quiz – questions, 2–6 answers, the right answer and an explanation.
import { supabase } from './supabase';
import { $ } from './ui/dom';
import { t } from '../i18n';
import { sheetPanel, iconButton } from './admin-common';
import { confirmModal } from './ui/confirm';
import { toast } from './ui/toast';
import { setStatus } from './ui/status-line';
import { setLoading } from './ui/button';
import { fieldError, focusField } from './field-error';
import { listRow } from './ui/list-row';
import { reorder } from './ui/reorder';
import { highlight } from './ui/highlight';
import { dailyLimitOf } from './daily-limit';

export type AdminQuestion = {
  id: number; tasting_id: string; sort_order: number; question: string;
  options: { key: string; text: string }[]; correct_key: string | null; explanation: string | null;
};

const COLUMNS = 'id, tasting_id, sort_order, question, options, correct_key, explanation';
const KEYS = 'abcdef';
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;


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
  const panel = sheetPanel($<HTMLDialogElement>('q-panel'), { onClose: () => { editing = null; }, dirty: 'form' });
  const list = $<HTMLOListElement>('q-admin-list');
  const optionsBox = $('qf-options');

  // Problems go under the field they are about
  const clearErrors = () => { fieldError($('qf-question'), null); fieldError(optionsBox, null); };

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
    remove.addEventListener('click', async () => {
      if (optionsBox.children.length <= MIN_OPTIONS) return;
      // An answer with text is asked about first
      const text = input.value.trim();
      if (text && !(await confirmModal({ title: t('aq.removeAnswerQ'), text: `“${text}”`, ok: t('aq.removeAnswer'), danger: true }))) return;
      const next = (row.nextElementSibling ?? row.previousElementSibling)?.querySelector<HTMLInputElement>('input[type=text]');
      row.remove();
      syncOptionButtons();
      next?.focus();
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
    clearErrors();
    $('qf-title').textContent = q ? t('aq.editQuestion') : t('aq.newQuestion');
    const del = $('qf-delete');
    del.hidden = !q;
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

  /** The answers under a question: the right one marked */
  function answers(options: string[], correct: number) {
    const ul = mk('ul', 'q-options');
    options.forEach((o, i) => {
      const item = mk('li', i === correct ? 'correct' : '', o);
      if (i === correct) item.setAttribute('aria-label', `${o} – ${t('aq.correct')}`);
      ul.append(item);
    });
    return ul;
  }

  // One row per question (the one list row): the grip moves it (drag, or ↑/↓ on it), the pencil edits it
  function render() {
    $('q-empty').hidden = questions.length > 0;
    list.hidden = !questions.length;
    list.replaceChildren(...questions.map((q, i) => {
      const edit = iconButton('edit', `${t('admin.edit')}: ${q.question}`);
      edit.dataset.tip = t('admin.edit');
      edit.addEventListener('click', () => openForm(q));
      const body: Node[] = [answers(q.options.map((o) => o.text), q.options.findIndex((o) => o.key === q.correct_key))];
      if (!q.correct_key) body.push(mk('p', 'q-warn', t('aq.noCorrect')));
      return listRow({
        id: q.id, grip: { label: t('aq.move', { n: i + 1 }), tip: t('twe.moveHint') }, no: i + 1,
        title: q.question, onOpen: () => openForm(q), body, actions: [edit],
      });
    }));
    onChange(questions);
  }

  async function load() {
    const { data } = await supabase.from('quiz_questions').select(COLUMNS)
      .eq('tasting_id', tastingId).order('sort_order').order('id');
    questions = (data ?? []) as AdminQuestion[];
    render();
  }

  // The order: the one reorder (src/lib/ui/reorder.ts), as the tasting's wines
  reorder(list, {
    announce: (n, total) => t('aq.moved', { n, total }),
    save: async (ids) => {
      const byId = new Map(questions.map((q) => [String(q.id), q]));
      questions = ids.map((id) => byId.get(id)!).filter(Boolean);
      const changed = questions.filter((q, i) => q.sort_order !== i + 1);
      questions.forEach((q, i) => (q.sort_order = i + 1));
      onChange(questions);
      const res = await Promise.all(changed.map((q) => supabase.from('quiz_questions').update({ sort_order: q.sort_order }).eq('id', q.id)));
      if (res.some((x) => x.error)) { toast(t('admin.changeNotSaved'), { kind: 'error' }); return false; }
      return true;
    },
  });

  // ---------- Events ----------
  $('q-add-toggle').addEventListener('click', () => openForm(null));
  $('q-empty-add').addEventListener('click', () => openForm(null));
  $('qf-add-option').addEventListener('click', () => {
    if (optionsBox.children.length < MAX_OPTIONS) optionRow().focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = $<HTMLTextAreaElement>('qf-question').value.trim();
    clearErrors();
    if (!question) { fieldError($('qf-question'), t('aq.questionMissing')); focusField($('qf-question')); return; }

    const rows = [...optionsBox.querySelectorAll<HTMLElement>('.qf-option')]
      .map((r) => ({
        text: (r.querySelector('input[type=text]') as HTMLInputElement).value.trim(),
        correct: (r.querySelector('input[type=radio]') as HTMLInputElement).checked,
      }))
      .filter((r) => r.text);
    if (rows.length < MIN_OPTIONS) { fieldError(optionsBox, t('aq.tooFewAnswers')); return; }
    const correctIndex = rows.findIndex((r) => r.correct);
    if (correctIndex < 0) { fieldError(optionsBox, t('aq.pickCorrect')); return; }

    const options = rows.map((r, i) => ({ key: KEYS[i], text: r.text }));
    const row = {
      question,
      options,
      correct_key: KEYS[correctIndex],
      explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim() || null,
    };

    const save = $<HTMLButtonElement>('qf-save');
    setLoading(save, true);
    const { error } = editing
      ? await supabase.from('quiz_questions').update(row).eq('id', editing.id)
      : await supabase.from('quiz_questions').insert({
          ...row,
          tasting_id: tastingId,
          sort_order: questions.reduce((m, q) => Math.max(m, q.sort_order), 0) + 1,
        });
    setLoading(save, false);
    if (error) { toast(t('aq.notSaved'), { kind: 'error' }); return; }
    const id = editing?.id;
    closeForm();
    toast(t('aq.saved'));
    await load();
    highlight(id ? list.querySelector(`[data-id="${id}"]`) : list.lastElementChild);
  });

  // Delete: asked about first; the guests' answers to the question go with it
  $('qf-delete').addEventListener('click', async () => {
    if (!editing) return;
    const q = editing;
    if (!(await confirmModal({ title: t('aq.deleteQ'), text: t('aq.deleteText'), ok: t('aq.deleteQuestion'), danger: true }))) return;
    const { error } = await supabase.from('quiz_questions').delete().eq('id', q.id);
    if (error) { toast(t('aq.notDeleted'), { kind: 'error' }); return; }
    closeForm();
    toast(t('aq.deleted'));
    await load();
  });

  // ---------- Suggestions from AI ----------
  // Shown under the quiz; nothing is added before the host presses Add on a suggestion.
  const aiList = $<HTMLOListElement>('q-ai-list');
  async function suggest() {
    const status = $('q-ai-status');
    const level = document.querySelector<HTMLInputElement>('input[name="q-ai-level"]:checked')?.value ?? 'medium';
    setStatus(status, 'busy', t('aiQuiz.writing'));
    $<HTMLButtonElement>('q-ai').disabled = true;
    $<HTMLButtonElement>('q-ai-more').disabled = true;
    try {
      const { data: s } = await supabase.auth.getSession();
      // Neither the quiz nor the suggestions already shown are asked again
      const shown = [...aiList.querySelectorAll<HTMLElement>('.ai-q .ltitle')].map((x) => x.textContent ?? '');
      const res = await fetch('/api/suggest-quiz', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ tasting_id: tastingId, lang: quizLang(), level, existing: [...questions.map((q) => q.question), ...shown] }),
      });
      const out = (await res.json().catch(() => ({}))) as { questions?: Suggestion[]; error?: string };
      if (!res.ok || !out.questions?.length) {
        setStatus(status, 'error', dailyLimitOf(res.status, out) ?? t(out.error === 'no_wines' ? 'aiQuiz.noWines' : 'aiQuiz.failed'));
        return;
      }
      aiList.append(...out.questions.map(suggestionCard));
      aiList.hidden = false;
      $('q-ai-warn').hidden = false;
      $('q-ai-more').hidden = false;
      setStatus(status, 'ok', t('aiQuiz.pick'));
    } catch {
      setStatus(status, 'error', t('aiQuiz.failed'));
    } finally {
      $<HTMLButtonElement>('q-ai').disabled = false;
      $<HTMLButtonElement>('q-ai-more').disabled = false;
    }
  }

  // A suggestion: the same row as the questions, with "Add to the quiz" and "Skip" as its icons
  function suggestionCard(sg: Suggestion) {
    const body: Node[] = [answers(sg.options, sg.correct)];
    if (sg.explanation) body.push(mk('p', 'lmeta', sg.explanation));
    const add = iconButton('plus', t('aiQuiz.add'), { strong: true });
    const skip = iconButton('x', t('aiQuiz.skip'), { quiet: true });
    const li = listRow({ title: sg.question, body, actions: [add, skip], cls: 'ai-q' });
    const gone = () => { li.remove(); if (!aiList.children.length) { aiList.hidden = true; $('q-ai-warn').hidden = true; } };
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
      if (error) { add.disabled = false; toast(t('aq.notSaved'), { kind: 'error' }); return; }
      toast(t('aiQuiz.added'));
      gone();
      await load();
      highlight(list.lastElementChild);
    });
    skip.addEventListener('click', gone);
    return li;
  }
  $('q-ai').addEventListener('click', suggest);
  $('q-ai-more').addEventListener('click', suggest);

  return { load };
}
