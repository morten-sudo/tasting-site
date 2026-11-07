// Admin: the host writes the tasting's quiz – questions, 2–6 answers, the right answer and an explanation.
import { supabase } from './supabase';
import { $ } from './ui/dom';
import { t } from '../i18n';
import { sheetPanel, iconButton, editButton } from './admin-common';
import { confirmModal } from './ui/confirm';
import { toast } from './ui/toast';
import { setStatus } from './ui/status-line';
import { setLoading } from './ui/button';
import { fieldError, focusField } from './field-error';
import { listRow } from './ui/list-row';
import { reorder } from './ui/reorder';
import { highlight } from './ui/highlight';
import { dailyLimitOf } from './daily-limit';
import { checkCards } from './ui/checkbox';
import { setSteps } from './ui/progress';

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
      const edit = editButton(q.question);
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

  // ---------- New questions from AI: a flow in its own side panel ----------
  // 1 How hard (and how many) → "Make suggestions"; 2 tick the ones to add → "Add N questions". Nothing is saved before
  // that, and the questions already in the quiz are never changed – the new ones go at the end, like a question
  // written by hand.
  const aiForm = $<HTMLFormElement>('q-ai-form');
  const aiGo = $<HTMLButtonElement>('q-ai-go');
  const aiStatus = $('q-ai-status');
  const aiSteps = $('q-ai-steps');
  let aiStep: 1 | 2 = 1;
  let shown: Suggestion[] = [];
  const cards = checkCards({ id: 'q-ai-picked', legend: t('aiQuiz.cardsLegend'), onChange: () => { fieldError(cards.el, null); syncAdd(); } });
  cards.el.querySelector('legend')!.classList.add('sr');
  $('q-ai-cards').append(cards.el);
  const aiPanel = sheetPanel($<HTMLDialogElement>('q-ai-panel'), { dirty: () => aiStep === 2 && cards.values().length > 0 });
  const levelOf = () => document.querySelector<HTMLInputElement>('input[name="q-ai-level"]:checked')?.value ?? 'medium';
  const countOf = () => Number(document.querySelector<HTMLInputElement>('input[name="q-ai-count"]:checked')?.value ?? 5);

  function syncAdd() {
    if (aiStep !== 2) return;
    const n = cards.values().length;
    aiGo.textContent = n ? t('aiQuiz.addN', { n }) : t('aiQuiz.add0');
  }

  function showStep(step: 1 | 2) {
    aiStep = step;
    setSteps(aiSteps, step - 1);
    $('q-ai-step1').hidden = step !== 1;
    $('q-ai-step2').hidden = step !== 2;
    if (step === 1) aiGo.textContent = t('aiQuiz.make');
    else {
      $('q-ai-summary').textContent = t('aiQuiz.summary', { n: shown.length, level: t(`aiQuiz.${levelOf()}` as 'aiQuiz.easy') });
      syncAdd();
    }
  }

  function openAi() {
    shown = [];
    cards.clear();
    fieldError(cards.el, null);
    setStatus(aiStatus, null);
    showStep(1);
    aiPanel.open();
  }

  /** A suggestion as a check card: the question, its answers with the right one marked, the explanation */
  function suggestionCard(sg: Suggestion, i: number) {
    const body: Node[] = [answers(sg.options, sg.correct)];
    if (sg.explanation) body.push(mk('p', 'lmeta', sg.explanation));
    return { value: String(i), label: sg.question, body };
  }

  async function suggest(more: boolean) {
    const busy = more ? $<HTMLButtonElement>('q-ai-more') : aiGo;
    setStatus(aiStatus, 'busy', t('aiQuiz.writing'));
    setLoading(busy, true);
    aiGo.disabled = true;
    $<HTMLButtonElement>('q-ai-more').disabled = true;
    $<HTMLButtonElement>('q-ai-back').disabled = true;
    try {
      const { data: s } = await supabase.auth.getSession();
      // Neither the quiz nor the suggestions already shown are asked again
      const res = await fetch('/api/suggest-quiz', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ tasting_id: tastingId, lang: quizLang(), level: levelOf(), count: countOf(),
          existing: [...questions.map((q) => q.question), ...shown.map((x) => x.question)] }),
      });
      const out = (await res.json().catch(() => ({}))) as { questions?: Suggestion[]; error?: string };
      if (!res.ok || !out.questions?.length) {
        setStatus(aiStatus, 'error', dailyLimitOf(res.status, out) ?? t(out.error === 'no_wines' ? 'aiQuiz.noWines' : 'aiQuiz.failed'));
        return;
      }
      const from = shown.length;
      shown.push(...out.questions);
      cards.add(out.questions.map((q, k) => suggestionCard(q, from + k)));
      setStatus(aiStatus, null);
      showStep(2);
      if (more) cards.inputs()[from]?.closest('label')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      else $('q-ai-step2').closest('.sh-body')?.scrollTo({ top: 0 });
    } catch {
      setStatus(aiStatus, 'error', t('aiQuiz.failed'));
    } finally {
      setLoading(busy, false);
      aiGo.disabled = false;
      $<HTMLButtonElement>('q-ai-more').disabled = false;
      $<HTMLButtonElement>('q-ai-back').disabled = false;
      syncAdd();
    }
  }

  // Step 2: the ticked suggestions are added together, at the end of the quiz
  async function addPicked() {
    const picked = cards.values().map((v) => shown[Number(v)]).filter(Boolean);
    if (!picked.length) { fieldError(cards.el, t('aiQuiz.noneChosen')); return; }
    const start = questions.reduce((m, q) => Math.max(m, q.sort_order), 0) + 1;
    setLoading(aiGo, true);
    const { error } = await supabase.from('quiz_questions').insert(picked.map((sg, k) => ({
      tasting_id: tastingId,
      sort_order: start + k,
      question: sg.question,
      options: sg.options.map((text, i) => ({ key: KEYS[i], text })),
      correct_key: KEYS[sg.correct],
      explanation: sg.explanation,
    })));
    setLoading(aiGo, false);
    if (error) { toast(t('aq.notSaved'), { kind: 'error' }); syncAdd(); return; }
    const before = new Set(questions.map((q) => q.id));
    aiPanel.close();
    toast(t('aiQuiz.addedN', { n: picked.length }));
    await load();
    const added = [...list.children].filter((li) => !before.has(Number((li as HTMLElement).dataset.id)));
    added.forEach((li, k) => highlight(li, { scroll: k === 0 }));
  }

  aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // A new round from step 1 (e.g. after changing the difficulty) starts a fresh set of suggestions
    if (aiStep === 1) { shown = []; cards.clear(); fieldError(cards.el, null); suggest(false); } else addPicked();
  });
  $('q-ai-more').addEventListener('click', () => suggest(true));
  $('q-ai-back').addEventListener('click', () => { setStatus(aiStatus, null); showStep(1); });
  $('q-ai-open').addEventListener('click', openAi);
  $('q-empty-ai').addEventListener('click', openAi);

  return { load };
}
