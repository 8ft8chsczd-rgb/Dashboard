import { getSubject, countKnown, getQuizStats } from '../store.js';
import { esc, icons, navbar, observeLargeTitle, notFound } from '../ui.js';

export async function renderSubject(el, id) {
  const s = await getSubject(id);
  if (!s) return notFound(el);

  const base = `#/fach/${encodeURIComponent(s.id)}`;
  const total = s.cards.length;
  const known = countKnown(s);
  const pct = total ? Math.round((known / total) * 100) : 0;
  const stats = getQuizStats(s.id);
  const quizAvailable = s.quiz.length + (total >= 2 ? total : 0);

  const quizParts = [];
  if (s.quiz.length) quizParts.push(`${s.quiz.length} Quizfragen`);
  if (total >= 2) quizParts.push(`${total} aus Karteikarten`);

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
          <span class="mode-sub">${total ? `${total - known} zu lernen · ${known} gekonnt` : 'Noch keine Karten'}</span>
          ${total ? `<span class="meter"><span style="width:${pct}%"></span></span>` : ''}
          ${icons.chevronRight}
        </a>

        <a class="mode-tile" href="${base}/quiz" ${quizAvailable ? '' : 'aria-disabled="true" tabindex="-1"'}>
          <span class="mode-icon" style="--tint:var(--purple)">${icons.quiz}</span>
          <span class="mode-title">Quiz</span>
          <span class="mode-sub">${quizParts.length ? quizParts.join(' · ') : 'Noch keine Fragen'}</span>
          ${stats.last ? `<span class="mode-foot">Zuletzt ${stats.last.correct}/${stats.last.total} richtig · Bestwert ${stats.best} %</span>` : ''}
          ${icons.chevronRight}
        </a>
      </div>
    </main>`;

  return observeLargeTitle(el);
}
