import { loadSubjects, loadErrors, countKnown } from '../store.js';
import { esc, icons, navbar, observeLargeTitle } from '../ui.js';

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function tile(s) {
  const total = s.cards.length;
  const known = countKnown(s);
  const pct = total ? Math.round((known / total) * 100) : 0;
  const meta = [
    total && plural(total, 'Karte', 'Karten'),
    s.quiz.length && plural(s.quiz.length, 'Quizfrage', 'Quizfragen'),
  ].filter(Boolean).join(' · ') || 'Noch keine Inhalte';

  return `<a class="subject-tile" href="#/fach/${encodeURIComponent(s.id)}" style="--accent:${s.color}">
    <span class="app-icon" aria-hidden="true">${esc(s.icon)}</span>
    <span class="tile-text">
      <span class="tile-name">${esc(s.name)}</span>
      <span class="tile-meta">${meta}</span>
    </span>
    ${icons.chevronRight}
    ${total ? `<span class="tile-progress">
      <span class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></span>
      <span class="tile-foot">${known} von ${total} gekonnt</span>
    </span>` : ''}
  </a>`;
}

export async function renderHome(el) {
  const subjects = await loadSubjects();
  const errors = loadErrors.length
    ? `<div class="notice">${icons.warning}<div>${loadErrors.map(esc).join('<br>')}</div></div>`
    : '';

  el.innerHTML = `${navbar({ title: 'Fächer', large: true })}
    <main class="page">
      <h1 class="large-title">Fächer</h1>
      ${errors}
      ${subjects.length
        ? `<div class="subject-grid">${subjects.map(tile).join('')}</div>`
        : `<div class="empty-state static"><div class="empty-icon">${icons.cards}</div><h2>Noch keine Fächer</h2><p>Lege eine Fach-Datei in <code>data/</code> an und trage sie in <code>data/index.json</code> ein.</p></div>`}
      <p class="footnote">Dein Lernfortschritt wird auf diesem Gerät gespeichert.</p>
    </main>`;

  return observeLargeTitle(el);
}
