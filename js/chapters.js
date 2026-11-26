// Kapitel-Auswahl: Liste mit Fortschritt pro Kapitel und Auswahl-Sheet.
import { getKnown, setChapterSelection } from './store.js';
import { esc, icons, miniRing, reducedMotion } from './ui.js';

function chapterStats(subject) {
  const known = getKnown(subject.id);
  const map = new Map(subject.chapters.map((c) => [c.id, { total: 0, known: 0, quiz: 0 }]));
  for (const card of subject.cards) {
    const m = map.get(card.topic);
    if (m) { m.total += 1; if (known.has(card.id)) m.known += 1; }
  }
  for (const q of subject.quiz) {
    const m = map.get(q.topic);
    if (m) m.quiz += 1;
  }
  return map;
}

function rowHtml(key, name, m, on) {
  const meta = m.total ? `${m.known}/${m.total}` : m.quiz ? `${m.quiz} Fragen` : '';
  return `<button type="button" class="chapter-row${on ? ' on' : ''}" data-chapter="${esc(key)}" role="checkbox" aria-checked="${on}">
    <span class="check" aria-hidden="true">${icons.check}</span>
    <span class="ch-name">${esc(name)}</span>
    <span class="ch-meta">${meta}</span>
    ${m.total ? miniRing(m.known, m.total) : '<span class="mini-ring"></span>'}
  </button>`;
}

export function chapterRowsHtml(subject, sel) {
  const stats = chapterStats(subject);
  const all = { total: 0, known: 0, quiz: 0 };
  for (const m of stats.values()) { all.total += m.total; all.known += m.known; all.quiz += m.quiz; }
  return rowHtml('*', 'Alle Kapitel', all, !sel)
    + subject.chapters.map((c) => rowHtml(c.id, c.name, stats.get(c.id), Boolean(sel) && sel.includes(c.id))).join('');
}

// "Alle" aktiv + Kapitel antippen → nur dieses Kapitel. Danach Kapitel hinzufügen/entfernen.
export function toggleChapter(subject, sel, key) {
  if (key === '*') return null;
  if (!sel) return [key];
  const next = sel.includes(key) ? sel.filter((x) => x !== key) : [...sel, key];
  if (!next.length || next.length === subject.chapters.length) return null;
  return subject.chapters.map((c) => c.id).filter((id) => next.includes(id));
}

export function openChapterSheet(subject, sel, onChange) {
  let current = sel;
  const ov = document.createElement('div');
  ov.className = 'sheet-backdrop';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Kapitel auswählen">
      <div class="sheet-grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <span class="sheet-title">Kapitel</span>
        <button type="button" class="sheet-done">Fertig</button>
      </div>
      <div class="sheet-body">
        <div class="group chapter-list"></div>
        <p class="group-footer">Gilt für Karteikarten und Quiz in ${esc(subject.name)}.</p>
      </div>
    </div>`;
  const list = ov.querySelector('.chapter-list');
  const draw = () => { list.innerHTML = chapterRowsHtml(subject, current); };
  draw();
  document.body.append(ov);
  document.body.classList.add('no-scroll');

  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('no-scroll');
    ov.classList.remove('open');
    setTimeout(() => ov.remove(), reducedMotion() ? 0 : 280);
    if (JSON.stringify(current) !== JSON.stringify(sel)) {
      setChapterSelection(subject, current);
      onChange(current);
    }
  }

  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  document.addEventListener('keydown', onKey, true);

  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('.sheet-done')) { close(); return; }
    const row = e.target.closest('[data-chapter]');
    if (!row) return;
    current = toggleChapter(subject, current, row.dataset.chapter);
    draw();
  });

  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('open')));
  ov.querySelector('.sheet-done').focus({ preventScroll: true });
}
