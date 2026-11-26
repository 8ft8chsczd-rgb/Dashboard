// Kleine UI-Helfer: Escaping, Text-Formatierung, Icons, Navigationsleiste, Toast.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Inline-Formatierung: **fett**, x_{tief}, x^{hoch}, x^2
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/\^(-?\d+)/g, '<sup>$1</sup>');
}

// Mini-Markdown: Absätze, Aufzählungen (- / •) und nummerierte Listen (1.)
export function fmt(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').trim().split('\n');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^\s*[-•*]\s+(.*)$/))) {
      if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      if (list !== 'ol') { close(); out.push(`<ol start="${Number(m[1])}">`); list = 'ol'; }
      out.push(`<li>${inline(m[2])}</li>`);
    } else if (line.trim() === '') {
      close();
      if (out[out.length - 1] !== '<div class="gap"></div>') out.push('<div class="gap"></div>');
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join('');
}

export function plainLength(text) {
  return String(text ?? '').replace(/\*\*|_\{|\^\{|\}/g, '').length;
}

export function isListy(text) {
  return /(^|\n)\s*([-•*]|\d+[.)])\s/.test(String(text ?? ''));
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const svg = (body, vb = '0 0 24 24', cls = '') =>
  `<svg class="icon ${cls}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  chevronLeft: svg('<path d="M10 2 2 10.5 10 19"/>', '0 0 12 21', 'i-back'),
  chevronRight: svg('<path d="M2 2l7 7.5L2 17"/>', '0 0 11 19', 'i-disclosure'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  cards: svg('<rect x="3" y="8" width="15" height="12" rx="2.5"/><path d="M7 4.5h11.5A2.5 2.5 0 0 1 21 7v9"/>'),
  quiz: svg('<path d="M4 6.5l1.6 1.6L8.8 5M4 12.5l1.6 1.6 3.2-3.1M4 18.5l1.6 1.6 3.2-3.1M12.5 6.5H20M12.5 12.5H20M12.5 18.5H20"/>'),
  shuffle: svg('<path d="M3 7h3.2c2 0 3.2.9 4.3 2.5l3 4.5c1.1 1.6 2.3 2.5 4.3 2.5H21M3 17h3.2c1.4 0 2.4-.5 3.3-1.4M14.5 8.4c.9-.9 1.9-1.4 3.3-1.4H21M18 4l3 3-3 3M18 13.5l3 3-3 3"/>'),
  reset: svg('<path d="M3.5 4v5h5"/><path d="M4.1 15a8.5 8.5 0 1 0 1.3-8.3L3.5 9"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', '0 0 24 24', 'i-bold'),
  xmark: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', '0 0 24 24', 'i-bold'),
  checkCircle: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M7.4 12.4l3.1 3.1 6.1-6.6" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  xCircle: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  warning: svg('<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17.3v.2"/>'),
  zoom: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-6.2 6.2M4 20l6.2-6.2"/>'),
  filter: svg('<path d="M4 7h16M7 12h10M10 17h4"/>'),
};

// Kleiner Fortschrittsring (z. B. pro Kapitel)
export function miniRing(done, total) {
  const c = 2 * Math.PI * 8;
  const p = total ? done / total : 0;
  return `<svg class="mini-ring" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="8" class="mr-bg"/>
    <circle cx="11" cy="11" r="8" class="mr-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}"/>
  </svg>`;
}

// Lupen-Button: öffnet die Skizze im Vollbild
export function zoomBtn(src, invert = false, cls = '') {
  return `<button type="button" class="zoom-btn ${cls}" data-zoom="${esc(src)}" data-invert="${invert ? 1 : 0}" aria-label="Skizze vergrößern">${icons.zoom}</button>`;
}

// Bild (Skizze), optional mit Lupen-Button
export function figureHtml(src, { invert = false, cls = '', button = true } = {}) {
  if (!src) return '';
  return `<figure class="card-fig ${cls}">
    <img class="card-img${invert ? ' inv' : ''}" src="${esc(src)}" alt="Skizze" draggable="false">
    ${button ? zoomBtn(src, invert) : ''}
  </figure>`;
}

// Navigationsleiste im iOS-Stil. large: Titel erscheint erst beim Scrollen (Large Title).
export function navbar({ back, title = '', subtitle = null, right = '', large = false, plain = false } = {}) {
  const backHtml = back
    ? `<a class="nav-back" href="${esc(back.href)}" data-back aria-label="Zurück zu ${esc(back.label)}">${icons.chevronLeft}<span>${esc(back.label)}</span></a>`
    : '';
  const cls = large ? 'has-large' : plain ? 'plain' : 'solid';
  const sub = subtitle !== null ? `<span class="nav-subtitle">${esc(subtitle)}</span>` : '';
  return `<header class="navbar ${cls}">
    <div class="navbar-inner">
      <div class="nav-side nav-left">${backHtml}</div>
      <div class="nav-title"><span class="nav-title-main">${esc(title)}</span>${sub}</div>
      <div class="nav-side nav-right">${right}</div>
    </div>
  </header>`;
}

// Blendet den kleinen Titel in der Leiste ein, sobald der große Titel hochgescrollt ist.
export function observeLargeTitle(view) {
  const title = view.querySelector('.large-title');
  const bar = view.querySelector('.navbar');
  if (!title || !bar || !('IntersectionObserver' in window)) return () => {};
  const io = new IntersectionObserver(
    ([entry]) => bar.classList.toggle('scrolled', !entry.isIntersecting),
    { rootMargin: '-90px 0px 0px 0px' },
  );
  io.observe(title);
  return () => io.disconnect();
}

// Segmented Control (iOS). options: [[wert, labelHtml], ...]
export function segmented(name, options, value) {
  const i = Math.max(0, options.findIndex(([v]) => String(v) === String(value)));
  return `<div class="segmented" data-seg="${esc(name)}" role="tablist" style="--n:${options.length};--i:${i}">
    <span class="seg-thumb" aria-hidden="true"></span>
    ${options.map(([v, label], k) => `<button type="button" role="tab" data-val="${esc(v)}" aria-selected="${k === i}">${label}</button>`).join('')}
  </div>`;
}

let toastTimer;
export function toast(message) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

export function notFound(el) {
  el.innerHTML = `${navbar({ back: { href: '#/', label: 'Fächer' } })}
    <main class="page">
      <div class="empty-state static">
        <div class="empty-icon">${icons.warning}</div>
        <h2>Fach nicht gefunden</h2>
        <p>Dieses Fach gibt es nicht (mehr).</p>
        <div class="empty-actions"><a class="btn tinted" href="#/">Zur Übersicht</a></div>
      </div>
    </main>`;
}
