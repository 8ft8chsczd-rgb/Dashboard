import { renderHome } from './views/home.js';
import { renderSubject } from './views/subject.js';
import { renderFlashcards } from './views/flashcards.js';
import { renderQuiz } from './views/quiz.js';
import { esc, navbar, reducedMotion } from './ui.js';
import { openViewer } from './viewer.js';

const routes = [
  { re: /^\/?$/, render: renderHome, depth: 0 },
  { re: /^\/fach\/([^/]+)\/?$/, render: renderSubject, depth: 1 },
  { re: /^\/fach\/([^/]+)\/karten\/?$/, render: renderFlashcards, depth: 2 },
  { re: /^\/fach\/([^/]+)\/quiz\/?$/, render: renderQuiz, depth: 2 },
];

const app = document.getElementById('app');
let current = null;
let token = 0;
const trail = [];

const currentPath = () => location.hash.replace(/^#/, '') || '/';

async function navigate() {
  const path = currentPath();
  let route = null;
  let params = [];
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { route = r; params = m.slice(1).map(decodeURIComponent); break; }
  }
  if (!route) { location.replace('#/'); return; }

  const mine = ++token;
  const view = document.createElement('div');
  view.className = 'view';
  let cleanup;
  try {
    cleanup = await route.render(view, ...params);
  } catch (err) {
    console.error(err);
    view.innerHTML = `${navbar({ back: { href: '#/', label: 'Fächer' } })}
      <main class="page"><div class="empty-state static">
        <h2>Inhalte konnten nicht geladen werden</h2>
        <p>${esc(err.message)}</p>
      </div></main>`;
  }
  if (mine !== token) { if (typeof cleanup === 'function') cleanup(); return; }

  if (typeof current?.cleanup === 'function') current.cleanup();
  const dir = current ? (route.depth > current.depth ? 'push' : route.depth < current.depth ? 'pop' : 'fade') : '';
  app.replaceChildren(view);
  window.scrollTo(0, 0);
  if (dir && !reducedMotion()) {
    view.classList.add(`anim-${dir}`);
    view.addEventListener('animationend', () => view.classList.remove(`anim-${dir}`), { once: true });
  }
  current = { depth: route.depth, cleanup };

  if (trail[trail.length - 2] === path) trail.pop();
  else if (trail[trail.length - 1] !== path) trail.push(path);
}

// "Zurück" nutzt den Browser-Verlauf, wenn man von dort kam – so bleibt der Verlauf sauber.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-back]');
  if (!link) return;
  const target = link.getAttribute('href').replace(/^#/, '') || '/';
  if (trail[trail.length - 2] === target) {
    e.preventDefault();
    history.back();
  }
});

// Skizze vergrößern: Lupen-Button auf Karten, im Quiz auch Antippen des Bildes
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-zoom]');
  const img = !btn && e.target.closest('.tap-zoom .card-img');
  if (!btn && !img) return;
  const ref = btn || img.parentElement.querySelector('[data-zoom]');
  e.preventDefault();
  e.stopPropagation();
  openViewer(ref.dataset.zoom, { invert: ref.dataset.invert === '1' });
});

// Fehlende Bilder sichtbar machen, statt ein kaputtes Symbol zu zeigen
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('card-img')) return;
  const fig = img.closest('.card-fig');
  if (!fig) return;
  const missing = document.createElement('div');
  missing.className = 'img-missing';
  missing.textContent = `Bild nicht gefunden: ${img.getAttribute('src')}`;
  const zoom = fig.closest('.face')?.querySelector('.face-zoom');
  if (zoom) zoom.innerHTML = '';
  fig.replaceWith(missing);
}, true);

window.addEventListener('hashchange', navigate);
navigate();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker:', err));
  });
}
