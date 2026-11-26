import { getSubject, getPrefs, setPrefs, getQuizStats, saveQuizResult } from '../store.js';
import { esc, fmt, icons, navbar, shuffle, notFound, observeLargeTitle, segmented } from '../ui.js';

const LETTERS = 'ABCDEFGHIJ';
const RING_C = 2 * Math.PI * 52;

// Aus jeder Karteikarte wird eine Multiple-Choice-Frage: Vorderseite = Frage,
// Rückseite = richtige Antwort, falsche Antworten = Rückseiten anderer Karten.
function cardQuestions(s) {
  const distinct = new Set(s.cards.map((c) => c.back.trim()));
  if (distinct.size < 2) return [];
  return s.cards.map((c) => {
    const own = c.back.trim();
    const pool = shuffle(s.cards.filter((o) => o.back.trim() !== own));
    if (c.topic) pool.sort((a, b) => Number(b.topic === c.topic) - Number(a.topic === c.topic));
    const wrong = [];
    for (const o of pool) {
      const t = o.back.trim();
      if (!wrong.includes(t)) wrong.push(t);
      if (wrong.length === 3) break;
    }
    const options = shuffle([own, ...wrong]);
    return {
      id: `card:${c.id}`, kind: 'card', question: c.front, image: c.frontImage,
      options, correct: [options.indexOf(own)], explanation: '', shuffle: false,
    };
  });
}

function prepare(q) {
  const idx = q.options.map((_, k) => k);
  const ord = q.shuffle ? shuffle(idx) : idx;
  const correct = q.correct.map((c) => ord.indexOf(c)).sort((a, b) => a - b);
  return { ...q, options: ord.map((k) => q.options[k]), correct, multi: correct.length > 1 };
}

export async function renderQuiz(el, id) {
  const s = await getSubject(id);
  if (!s) return notFound(el);

  const back = { href: `#/fach/${encodeURIComponent(s.id)}`, label: s.name };
  const nQuiz = s.quiz.length;
  const nCards = new Set(s.cards.map((c) => c.back.trim())).size >= 2 ? s.cards.length : 0;
  const prefs = getPrefs(s.id);

  let source = ['all', 'quiz', 'cards'].includes(prefs.quizSource) ? prefs.quizSource : 'all';
  if (!nQuiz) source = 'cards';
  if (!nCards) source = 'quiz';
  let count = prefs.quizCount ?? 10;

  let state = 'setup';
  let qs = [];
  let i = 0;
  let results = [];
  let selected = new Set();
  let revealed = false;
  let isRetry = false;
  let stopObserver = () => {};

  const available = (src) => (src === 'quiz' ? nQuiz : src === 'cards' ? nCards : nQuiz + nCards);

  function setView(html, { large = false, title = 'Quiz' } = {}) {
    stopObserver();
    el.innerHTML = navbar({ back, title, large }) + html;
    stopObserver = large ? observeLargeTitle(el) : () => {};
  }

  // ---------- Start ----------

  function drawSetup() {
    state = 'setup';
    const avail = available(source);
    const stats = getQuizStats(s.id);

    if (!avail) {
      setView(`<main class="page narrow"><h1 class="large-title">Quiz</h1>
        <div class="empty-state static"><div class="empty-icon">${icons.quiz}</div>
        <h2>Noch keine Fragen</h2><p>Für dieses Fach gibt es noch keine Quizfragen und zu wenige Karteikarten.</p></div></main>`, { large: true });
      return;
    }

    const counts = [5, 10, 20].filter((n) => n < avail);
    const countVal = counts.includes(count) ? count : 'all';
    const sourceInfo = [
      nQuiz && `${nQuiz} Quizfragen`,
      nCards && `${nCards} Fragen aus Karteikarten`,
    ].filter(Boolean).join(' und ');

    setView(`<main class="page narrow">
      <h1 class="large-title">Quiz</h1>
      ${stats.last ? `<div class="stat-row">
        <div class="stat"><span class="stat-val">${stats.last.correct}/${stats.last.total}</span><span class="stat-lbl">Letztes Quiz</span></div>
        <div class="stat"><span class="stat-val">${stats.best} %</span><span class="stat-lbl">Bestwert</span></div>
        <div class="stat"><span class="stat-val">${stats.runs}</span><span class="stat-lbl">Durchgänge</span></div>
      </div>` : ''}

      <div class="group-header">Einstellungen</div>
      <div class="group">
        ${nQuiz && nCards ? `<div class="group-row"><span class="row-label">Fragen</span>
          ${segmented('source', [['all', 'Alle'], ['quiz', 'Quiz'], ['cards', 'Karten']], source)}</div>` : ''}
        <div class="group-row"><span class="row-label">Anzahl</span>
          ${segmented('count', [...counts.map((n) => [n, String(n)]), ['all', `Alle (${avail})`]], countVal)}</div>
      </div>
      <p class="group-footer">${sourceInfo} verfügbar.${nCards ? ' Bei Fragen aus Karteikarten ist die Rückseite die richtige Antwort.' : ''}</p>

      <button class="primary-btn" data-act="start">Quiz starten</button>
    </main>`, { large: true });
  }

  function start(list, retry = false) {
    qs = list.map(prepare);
    i = 0;
    results = [];
    isRetry = retry;
    drawQuestion();
  }

  function startNew() {
    const pool = [];
    if (source !== 'cards') pool.push(...s.quiz.map((x) => ({ ...x, kind: 'quiz' })));
    if (source !== 'quiz') pool.push(...cardQuestions(s));
    const mixed = shuffle(pool);
    start(count === 'all' ? mixed : mixed.slice(0, count));
  }

  // ---------- Frage ----------

  function optClass(q, k) {
    if (!revealed) return selected.has(k) ? 'selected' : '';
    const isCorrect = q.correct.includes(k);
    if (isCorrect) return selected.has(k) ? 'correct' : 'correct missed';
    return selected.has(k) ? 'wrong' : 'dim';
  }

  function letterHtml(q, k) {
    if (revealed && q.correct.includes(k)) return icons.check;
    if (revealed && selected.has(k)) return icons.xmark;
    return LETTERS[k] ?? String(k + 1);
  }

  function footerHtml(q) {
    if (!revealed) {
      return q.multi
        ? `<button class="primary-btn" data-act="check" ${selected.size ? '' : 'disabled'}>Antwort prüfen</button>`
        : '<p class="tap-hint">Tippe auf die richtige Antwort</p>';
    }
    return `<button class="primary-btn" data-act="next">${i + 1 < qs.length ? 'Weiter' : 'Ergebnis anzeigen'}</button>`;
  }

  function feedbackHtml(q) {
    if (!revealed) return '';
    const r = results[results.length - 1];
    return `<div class="feedback ${r.ok ? 'ok' : 'bad'}">
      <div class="fb-title">${r.ok ? icons.checkCircle : icons.xCircle}<span>${r.ok ? 'Richtig!' : 'Leider falsch'}</span></div>
      ${q.explanation ? `<div class="fb-text">${fmt(q.explanation)}</div>` : ''}
    </div>`;
  }

  function drawQuestion() {
    state = 'question';
    selected = new Set();
    revealed = false;
    const q = qs[i];
    const tag = [q.kind === 'card' ? 'Aus Karteikarte' : 'Quizfrage', q.topic, q.multi && 'Mehrere Antworten richtig']
      .filter(Boolean).map(esc).join(' · ');

    setView(`<main class="quiz">
      <div class="meter quiz-meter"><span style="width:${(i / qs.length) * 100}%"></span></div>
      <section class="q-card">
        <div class="q-tag">${tag}</div>
        ${q.image ? `<img class="card-img" src="${esc(q.image)}" alt="">` : ''}
        <div class="q-text">${fmt(q.question)}</div>
      </section>
      <div class="options" role="group">
        ${q.options.map((o, k) => `<button class="option" data-opt="${k}">
          <span class="letter">${letterHtml(q, k)}</span><span class="opt-text">${fmt(o)}</span>
        </button>`).join('')}
      </div>
      <div class="feedback-slot"></div>
      <div class="quiz-footer">${footerHtml(q)}</div>
    </main>`, { title: `Frage ${i + 1} von ${qs.length}` });
    window.scrollTo(0, 0);
  }

  function updateQuestion() {
    const q = qs[i];
    el.querySelectorAll('.option').forEach((btn) => {
      const k = Number(btn.dataset.opt);
      btn.className = `option ${optClass(q, k)}`;
      btn.disabled = revealed;
      btn.querySelector('.letter').innerHTML = letterHtml(q, k);
    });
    el.querySelector('.feedback-slot').innerHTML = feedbackHtml(q);
    el.querySelector('.quiz-footer').innerHTML = footerHtml(q);
    if (revealed) {
      el.querySelector('.quiz-meter > span').style.width = `${((i + 1) / qs.length) * 100}%`;
      el.querySelector('.quiz-footer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function reveal() {
    const q = qs[i];
    revealed = true;
    const ok = q.correct.length === selected.size && q.correct.every((c) => selected.has(c));
    results.push({ q, chosen: [...selected], ok });
    updateQuestion();
  }

  function choose(k) {
    if (state !== 'question' || revealed) return;
    const q = qs[i];
    if (q.multi) {
      if (selected.has(k)) selected.delete(k); else selected.add(k);
      updateQuestion();
    } else {
      selected = new Set([k]);
      reveal();
    }
  }

  function next() {
    i += 1;
    if (i < qs.length) drawQuestion();
    else drawResult();
  }

  // ---------- Ergebnis ----------

  function drawResult() {
    state = 'result';
    const n = results.length;
    const correctN = results.filter((r) => r.ok).length;
    const pct = n ? Math.round((correctN / n) * 100) : 0;
    if (!isRetry) saveQuizResult(s.id, correctN, n);
    const wrong = results.filter((r) => !r.ok);
    const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--red)';
    const msg = pct === 100 ? 'Perfekt!' : pct >= 80 ? 'Sehr gut!' : pct >= 50 ? 'Gut, weiter so!' : 'Dranbleiben!';

    const answerHtml = (q, list) => list
      .map((k) => `<div class="ans"><b>${LETTERS[k]}</b><div>${fmt(q.options[k])}</div></div>`).join('');

    setView(`<main class="page narrow result">
      <div class="ring" style="--ring:${color}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="52"/>
          <circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
        </svg>
        <div class="ring-label"><strong>${pct} %</strong><span>${correctN} von ${n}</span></div>
      </div>
      <h1 class="result-title">${msg}</h1>
      <p class="result-sub">${isRetry ? 'Wiederholung der falsch beantworteten Fragen' : `Quiz in ${esc(s.name)} abgeschlossen`}</p>

      <div class="result-actions">
        ${wrong.length ? `<button class="primary-btn" data-act="retry">Falsche wiederholen (${wrong.length})</button>` : ''}
        <button class="${wrong.length ? 'secondary-btn' : 'primary-btn'}" data-act="restart">Neues Quiz</button>
      </div>

      ${wrong.length ? `<div class="group-header">Falsch beantwortet</div>
        <div class="group review">${wrong.map(({ q, chosen }) => `<div class="review-item">
          <div class="review-q">${fmt(q.question)}</div>
          ${chosen.length ? `<div class="review-a bad"><span>Deine Antwort</span>${answerHtml(q, chosen)}</div>` : ''}
          <div class="review-a ok"><span>Richtig</span>${answerHtml(q, q.correct)}</div>
          ${q.explanation ? `<div class="review-x">${fmt(q.explanation)}</div>` : ''}
        </div>`).join('')}</div>` : ''}
    </main>`, { title: 'Ergebnis' });

    window.scrollTo(0, 0);
    const fg = el.querySelector('.ring-fg');
    fg.getBoundingClientRect();
    requestAnimationFrame(() => { fg.style.strokeDashoffset = String(RING_C * (1 - pct / 100)); });
  }

  // ---------- Eingaben ----------

  el.addEventListener('click', (e) => {
    const segBtn = e.target.closest('[data-seg] button');
    if (segBtn) {
      const name = segBtn.closest('[data-seg]').dataset.seg;
      const val = segBtn.dataset.val;
      if (name === 'source') { source = val; setPrefs(s.id, { quizSource: source }); }
      if (name === 'count') { count = val === 'all' ? 'all' : Number(val); setPrefs(s.id, { quizCount: count }); }
      const y = window.scrollY;
      drawSetup();
      window.scrollTo(0, y);
      return;
    }
    const opt = e.target.closest('.option');
    if (opt) { choose(Number(opt.dataset.opt)); return; }

    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    switch (act.dataset.act) {
      case 'start': startNew(); break;
      case 'check': if (selected.size) reveal(); break;
      case 'next': next(); break;
      case 'retry': start(results.filter((r) => !r.ok).map((r) => r.q), true); break;
      case 'restart': drawSetup(); window.scrollTo(0, 0); break;
      default:
    }
  });

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state === 'question' && !revealed) {
      let k = -1;
      if (/^[1-9]$/.test(e.key)) k = Number(e.key) - 1;
      else if (/^[a-j]$/i.test(e.key)) k = e.key.toLowerCase().charCodeAt(0) - 97;
      if (k >= 0 && k < qs[i].options.length) { e.preventDefault(); choose(k); return; }
    }
    if (e.key === 'Enter' && !e.target.closest?.('button, a')) {
      const btn = el.querySelector('.primary-btn:not([disabled])');
      if (btn) { e.preventDefault(); btn.click(); }
    }
  }
  document.addEventListener('keydown', onKey);

  drawSetup();
  return () => {
    stopObserver();
    document.removeEventListener('keydown', onKey);
  };
}
