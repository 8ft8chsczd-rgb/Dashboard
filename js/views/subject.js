import {
  getSubject, getKnown, getQuizStats, getChapterSelection, setChapterSelection, inSelection, chapterSummary,
} from '../store.js';
import { esc, icons, navbar, observeLargeTitle, notFound } from '../ui.js';
import { chapterRowsHtml, toggleChapter } from '../chapters.js';
import { cardQuestionCount } from './quiz.js';

export async function renderSubject(el, id) {
  const s = await getSubject(id);
  if (!s) return notFound(el);

  const base = `#/fach/${encodeURIComponent(s.id)}`;
  const hasChapters = s.chapters.length > 1;
  let sel = getChapterSelection(s);
  let stopObserver = () => {};

  function draw() {
    const known = getKnown(s.id);
    const cards = s.cards.filter((c) => inSelection(c, sel));
    const total = cards.length;
    const done = cards.reduce((n, c) => n + (known.has(c.id) ? 1 : 0), 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const qN = s.quiz.filter((q) => inSelection(q, sel)).length;
    const cN = cardQuestionCount(s, sel);
    const stats = getQuizStats(s.id);
    const scope = sel ? `<span class="mode-scope">${esc(chapterSummary(s, sel))}</span>` : '';

    const quizParts = [];
    if (qN) quizParts.push(`${qN} Quizfragen`);
    if (cN) quizParts.push(`${cN} aus Karteikarten`);

    stopObserver();
    el.innerHTML = `${navbar({ back: { href: '#/', label: 'Fächer' }, title: s.name, large: true })}
      <main class="page" style="--accent:${s.color}">
        <div class="subject-head">
          <span class="app-icon large" aria-hidden="true">${esc(s.icon)}</span>
          <h1 class="large-title">${esc(s.name)}</h1>
        </div>
        ${s.description ? `<p class="subject-desc">${esc(s.description)}</p>` : ''}

        <div class="mode-grid">
          <a class="mode-tile" href="${base}/karten" ${total ? '' : 'aria-disabled="true" tabindex="-1"'}>
            <span class="mode-icon" style="--tint:var(--blue)">${icons.cards}</span>
            <span class="mode-title">Karteikarten</span>
            <span class="mode-sub">${total ? `${total - done} zu lernen · ${done} gekonnt` : 'Keine Karten'}</span>
            ${scope}
            ${total ? `<span class="meter"><span style="width:${pct}%"></span></span>` : ''}
            ${icons.chevronRight}
          </a>

          <a class="mode-tile" href="${base}/quiz" ${qN + cN ? '' : 'aria-disabled="true" tabindex="-1"'}>
            <span class="mode-icon" style="--tint:var(--purple)">${icons.quiz}</span>
            <span class="mode-title">Quiz</span>
            <span class="mode-sub">${quizParts.length ? quizParts.join(' · ') : 'Keine Fragen'}</span>
            ${scope}
            ${stats.last ? `<span class="mode-foot">Zuletzt ${stats.last.correct}/${stats.last.total} richtig · Bestwert ${stats.best} %</span>` : ''}
            ${icons.chevronRight}
          </a>
        </div>

        ${hasChapters ? `
          <div class="group-header">Kapitel</div>
          <div class="group chapter-list">${chapterRowsHtml(s, sel)}</div>
          <p class="group-footer">Tippe Kapitel an, um nur diese zu lernen. Gilt für Karteikarten und Quiz.</p>` : ''}
      </main>`;
    stopObserver = observeLargeTitle(el);
  }

  el.addEventListener('click', (e) => {
    const row = e.target.closest('[data-chapter]');
    if (!row) return;
    sel = toggleChapter(s, sel, row.dataset.chapter);
    setChapterSelection(s, sel);
    const y = window.scrollY;
    draw();
    window.scrollTo(0, y);
  });

  draw();
  return () => stopObserver();
}
