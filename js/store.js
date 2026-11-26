// Laden der Inhalte (data/*.json) und Speichern des Lernfortschritts (localStorage).

const NS = 'lernapp:v1:';

const COLORS = {
  blau: '#0a84ff', blue: '#0a84ff',
  gruen: '#30d158', 'grün': '#30d158', green: '#30d158',
  orange: '#ff9f0a',
  rot: '#ff453a', red: '#ff453a',
  gelb: '#ffd60a', yellow: '#ffd60a',
  lila: '#bf5af2', violett: '#bf5af2', purple: '#bf5af2',
  pink: '#ff375f', rosa: '#ff375f',
  tuerkis: '#64d2ff', 'türkis': '#64d2ff', cyan: '#64d2ff',
  teal: '#40c8e0', mint: '#66d4cf',
  indigo: '#5e5ce6',
  braun: '#ac8e68', brown: '#ac8e68',
  grau: '#8e8e93', gray: '#8e8e93', grey: '#8e8e93',
};
const PALETTE = ['#0a84ff', '#ff9f0a', '#30d158', '#bf5af2', '#ff375f', '#64d2ff', '#5e5ce6', '#ffd60a'];

let subjectsPromise = null;
export const loadErrors = [];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function lowerKeys(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj || {})) o[k.toLowerCase()] = v;
  return o;
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Arrays werden zu Aufzählungen, alles andere zu Text.
function toText(v) {
  if (Array.isArray(v)) return v.map((x) => (/^\s*([-•*]|\d+[.)])\s/.test(String(x)) ? String(x) : `- ${x}`)).join('\n');
  return String(v);
}

function resolveColor(c, i) {
  if (typeof c === 'string') {
    const k = c.trim().toLowerCase();
    if (COLORS[k]) return COLORS[k];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(k)) return k;
  }
  return PALETTE[i % PALETTE.length];
}

function uniqueIds(items) {
  const seen = new Map();
  for (const it of items) {
    const n = seen.get(it.id) || 0;
    seen.set(it.id, n + 1);
    if (n) it.id = `${it.id}~${n}`;
  }
  return items;
}

// Bildpfade: "bilder/x.png" wird zu "data/bilder/x.png"; volle Pfade/URLs bleiben.
function imgPath(p) {
  if (!p) return null;
  const s = String(p).trim();
  return /^(https?:|data:|blob:|\/|\.\/|data\/)/i.test(s) ? s : `data/${s}`;
}

function bool(v) {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return !/^(false|nein|0|no)$/i.test(v.trim());
  return Boolean(v);
}

function normCard(raw) {
  const c = lowerKeys(raw);
  const front = pick(c, 'front', 'vorne', 'vorderseite', 'frage', 'question', 'begriff', 'q');
  const back = pick(c, 'back', 'hinten', 'rückseite', 'rueckseite', 'antwort', 'answer', 'definition', 'a');
  const frontImage = imgPath(pick(c, 'frontimage', 'bildvorne', 'bild_vorne', 'skizzevorne'));
  const backImage = imgPath(pick(c, 'backimage', 'bildhinten', 'bild_hinten', 'skizzehinten', 'bild', 'image', 'skizze'));
  // Eine Seite darf auch nur aus einer Skizze bestehen.
  if ((front === undefined && !frontImage) || (back === undefined && !backImage)) return null;
  const frontText = front === undefined ? '' : toText(front);
  return {
    id: String(c.id ?? `k${hash(frontText || frontImage)}`),
    front: frontText,
    back: back === undefined ? '' : toText(back),
    frontImage,
    backImage,
    invert: bool(pick(c, 'invert', 'invertieren')),
    topic: String(pick(c, 'topic', 'kapitel', 'thema') ?? '').trim(),
  };
}

const NO_SHUFFLE = /(alle|keine)\s+(der\s+)?(oben\s+)?(genannten|anderen|antworten)|beide|weder|sowohl/i;

function toIndex(v, options) {
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const exact = options.findIndex((o) => o.trim() === s);
  if (exact >= 0) return exact;
  if (/^[a-z]$/i.test(s)) return s.toLowerCase().charCodeAt(0) - 97;
  if (/^\d+$/.test(s)) return Number(s);
  return -1;
}

function normQuiz(raw) {
  const q = lowerKeys(raw);
  const question = pick(q, 'question', 'frage');
  if (question === undefined) return null;
  let options = pick(q, 'options', 'optionen', 'antworten', 'answers', 'choices', 'auswahl');
  let correct = pick(q, 'correct', 'richtig', 'lösung', 'loesung', 'answer', 'antwort', 'korrekt');

  // Richtig/Falsch-Fragen: "richtig": true/false ohne Optionen
  if (!Array.isArray(options) && typeof correct === 'boolean') {
    options = ['Richtig', 'Falsch'];
    correct = correct ? 0 : 1;
  }
  if (!Array.isArray(options) || options.length < 2 || correct === undefined) return null;
  options = options.map((o) => toText(o));

  const list = Array.isArray(correct) ? correct : [correct];
  const idx = [...new Set(list.map((v) => toIndex(v, options)))]
    .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)
    .sort((a, b) => a - b);
  if (!idx.length) return null;

  const questionText = toText(question);
  const explicitShuffle = pick(q, 'shuffle', 'mischen');
  return {
    id: String(q.id ?? `q${hash(questionText)}`),
    question: questionText,
    options,
    correct: idx,
    explanation: toText(pick(q, 'explanation', 'erklärung', 'erklaerung', 'begründung', 'begruendung', 'hinweis') ?? ''),
    image: imgPath(pick(q, 'image', 'bild', 'skizze')),
    invert: bool(pick(q, 'invert', 'invertieren')),
    topic: String(pick(q, 'topic', 'kapitel', 'thema') ?? '').trim(),
    shuffle: explicitShuffle !== undefined
      ? Boolean(explicitShuffle)
      : options.length > 2 && !options.some((o) => NO_SHUFFLE.test(o)),
  };
}

const CARD_KEYS = ['cards', 'karteikarten', 'karten', 'flashcards'];
const QUIZ_KEYS = ['quiz', 'quizfragen', 'fragen', 'questions'];

function normSubject(raw, file, i) {
  const d = lowerKeys(raw);
  const id = String(d.id ?? file.replace(/\.json$/i, '')).trim();
  let rawCards = [...(pick(d, ...CARD_KEYS) || [])];
  let rawQuiz = [...(pick(d, ...QUIZ_KEYS) || [])];

  // Kapitel: entweder Liste von Namen (nur Reihenfolge) oder Kapitel-Objekte mit eigenen Karten/Fragen.
  const order = [];
  const rawChapters = pick(d, 'chapters', 'kapitel');
  if (Array.isArray(rawChapters)) {
    for (const ch of rawChapters) {
      if (typeof ch === 'string') { order.push(ch.trim()); continue; }
      const c = lowerKeys(ch);
      const name = String(pick(c, 'name', 'titel', 'title', 'kapitel') ?? '').trim();
      if (!name) continue;
      order.push(name);
      rawCards = rawCards.concat((pick(c, ...CARD_KEYS) || []).map((x) => ({ ...x, topic: name })));
      rawQuiz = rawQuiz.concat((pick(c, ...QUIZ_KEYS) || []).map((x) => ({ ...x, topic: name })));
    }
  }

  const invertImages = bool(pick(d, 'invertimages', 'bilderinvertieren', 'invert')) ?? false;
  const cards = uniqueIds(rawCards.map(normCard).filter(Boolean));
  const quiz = uniqueIds(rawQuiz.map(normQuiz).filter(Boolean));
  for (const it of [...cards, ...quiz]) it.invert = it.invert ?? invertImages;

  const names = order.filter(Boolean);
  for (const it of [...cards, ...quiz]) if (it.topic && !names.includes(it.topic)) names.push(it.topic);
  const chapters = names.map((n) => ({ id: n, name: n }));
  if (chapters.length && [...cards, ...quiz].some((it) => !it.topic)) chapters.push({ id: '', name: 'Ohne Kapitel' });
  // Karten nach Kapitel-Reihenfolge sortieren (stabil, innerhalb eines Kapitels Original-Reihenfolge)
  if (chapters.length) {
    const rank = (t) => { const k = names.indexOf(t); return k < 0 ? names.length : k; };
    cards.sort((a, b) => rank(a.topic) - rank(b.topic));
  }
  const skippedCards = rawCards.length - cards.length;
  const skippedQuiz = rawQuiz.length - quiz.length;
  if (skippedCards || skippedQuiz) {
    loadErrors.push(`${file}: ${[skippedCards && `${skippedCards} Karte(n)`, skippedQuiz && `${skippedQuiz} Quizfrage(n)`].filter(Boolean).join(' und ')} unvollständig – übersprungen.`);
  }
  return {
    id,
    name: String(pick(d, 'name', 'titel', 'title', 'fach') ?? id),
    icon: String(pick(d, 'icon', 'symbol', 'emoji') ?? '📘'),
    color: resolveColor(pick(d, 'color', 'farbe'), i),
    description: String(pick(d, 'description', 'beschreibung') ?? ''),
    chapters,
    cards,
    quiz,
  };
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function loadSubjects() {
  if (!subjectsPromise) {
    subjectsPromise = (async () => {
      const index = await getJSON('data/index.json');
      const files = Array.isArray(index) ? index : (pick(lowerKeys(index), 'subjects', 'faecher', 'fächer', 'files') || []);
      const loaded = await Promise.all(files.map(async (file, i) => {
        try {
          return normSubject(await getJSON(`data/${file}`), file, i);
        } catch (err) {
          console.error(err);
          loadErrors.push(`${file} konnte nicht gelesen werden (${err.message}).`);
          return null;
        }
      }));
      return loaded.filter(Boolean);
    })().catch((err) => {
      subjectsPromise = null;
      throw err;
    });
  }
  return subjectsPromise;
}

export async function getSubject(id) {
  const all = await loadSubjects();
  return all.find((s) => s.id === id) || null;
}

// ---------- Fortschritt ----------

function read(key, fallback) {
  try {
    const v = localStorage.getItem(NS + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar (z. B. privater Modus) */
  }
}

export const getKnown = (subjectId) => new Set(read(`known:${subjectId}`, []));
export const setKnown = (subjectId, set) => write(`known:${subjectId}`, [...set]);

export function countKnown(subject) {
  const known = getKnown(subject.id);
  return subject.cards.reduce((n, c) => n + (known.has(c.id) ? 1 : 0), 0);
}

export const getPrefs = (subjectId) => read(`prefs:${subjectId}`, {});
export const setPrefs = (subjectId, patch) => write(`prefs:${subjectId}`, { ...getPrefs(subjectId), ...patch });

// ---------- Kapitel-Auswahl ----------
// null = alle Kapitel, sonst Liste der gewählten Kapitel-IDs.

export function getChapterSelection(subject) {
  if (!subject.chapters.length) return null;
  const sel = getPrefs(subject.id).chapters;
  if (!Array.isArray(sel)) return null;
  const valid = sel.filter((id) => subject.chapters.some((c) => c.id === id));
  return valid.length && valid.length < subject.chapters.length ? valid : null;
}

export function setChapterSelection(subject, ids) {
  const keep = Array.isArray(ids) && ids.length && ids.length < subject.chapters.length ? ids : null;
  setPrefs(subject.id, { chapters: keep });
}

export const inSelection = (item, sel) => !sel || sel.includes(item.topic);

export function chapterSummary(subject, sel) {
  if (!sel) return 'Alle Kapitel';
  const names = subject.chapters.filter((c) => sel.includes(c.id)).map((c) => c.name);
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} ${names.length === 2 ? 'weiteres' : 'weitere'}`;
}

export const getQuizStats = (subjectId) => read(`quiz:${subjectId}`, {});

export function saveQuizResult(subjectId, correct, total) {
  const stats = getQuizStats(subjectId);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  write(`quiz:${subjectId}`, {
    last: { correct, total, pct, at: Date.now() },
    best: Math.max(stats.best ?? 0, pct),
    runs: (stats.runs ?? 0) + 1,
  });
}
