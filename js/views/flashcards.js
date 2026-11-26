import {
  getSubject, getKnown, setKnown, getPrefs, setPrefs, getChapterSelection, inSelection, chapterSummary,
} from '../store.js';
import {
  fmt, plainLength, isListy, icons, navbar, shuffle, toast, notFound, reducedMotion, figureHtml, zoomBtn,
} from '../ui.js';
import { openChapterSheet } from '../chapters.js';

// Rechts = positiv (kann ich / weiter), links = zurück auf den Lernstapel.
const LABELS = {
  learn: { good: 'Kann ich', bad: 'Nochmal' },
  known: { good: 'Weiter', bad: 'Wieder lernen' },
};

function faceHtml(side) {
  const label = side === 'front' ? 'Frage' : 'Antwort';
  return `<div class="face ${side}">
    <div class="face-head"><span class="face-label">${label}</span><span class="face-topic"></span><span class="face-zoom"></span></div>
    <div class="face-body"></div>
    <div class="swipe-badge good">${icons.check}<span></span></div>
    <div class="swipe-badge bad">${icons.undo}<span></span></div>
  </div>`;
}

const SMALLER = { xl: 'lg', lg: 'md', md: 'sm', sm: 'sm' };

// face: Kartenseite (oder die darunterliegende Karte im Stapel)
function fillFace(face, text, image, invert, topic) {
  const body = face.querySelector('.face-body');
  const hasText = String(text).trim() !== '';
  const len = plainLength(text);
  let size = len <= 36 ? 'xl' : len <= 100 ? 'lg' : len <= 240 ? 'md' : 'sm';
  if (image && hasText) size = SMALLER[size];
  const left = isListy(text) || len > 140;
  const imgCls = image ? (hasText ? ' with-img' : ' img-only') : '';
  body.className = `face-body size-${size}${left ? ' left' : ''}${imgCls}`;
  body.innerHTML = `<div class="txt">${figureHtml(image, { invert, button: false })}${hasText ? fmt(text) : ''}</div>`;
  body.scrollTop = 0;
  face.querySelector('.face-topic').textContent = topic;
  const zoom = face.querySelector('.face-zoom');
  if (zoom) zoom.innerHTML = image ? zoomBtn(image, invert, 'in-head') : '';
}

export async function renderFlashcards(el, id) {
  const s = await getSubject(id);
  if (!s) return notFound(el);
  el.classList.add('fill');

  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const known = new Set([...getKnown(s.id)].filter((k) => byId.has(k)));
  const hasChapters = s.chapters.length > 1;
  let sel = getChapterSelection(s);
  let pool = s.cards.filter((c) => inSelection(c, sel));
  let shuffleOn = Boolean(getPrefs(s.id).shuffle);
  let mode = 'learn';
  const order = { learn: [], known: [] };
  const pos = { learn: 0, known: 0 };
  let flipped = false;
  let busy = false;
  let history = [];

  const knownOrder = () => pool.filter((c) => known.has(c.id)).map((c) => c.id);
  const knownInPool = () => pool.reduce((n, c) => n + (known.has(c.id) ? 1 : 0), 0);
  function buildLearn() {
    const ids = pool.filter((c) => !known.has(c.id)).map((c) => c.id);
    order.learn = shuffleOn ? shuffle(ids) : ids;
    pos.learn = 0;
  }
  buildLearn();
  order.known = knownOrder();

  el.innerHTML = `${navbar({
    back: { href: `#/fach/${encodeURIComponent(s.id)}`, label: s.name },
    title: 'Karteikarten',
    subtitle: hasChapters ? chapterSummary(s, sel) : null,
    plain: true,
    right: `${hasChapters ? `<button class="icon-btn" data-act="chapters" aria-label="Kapitel auswählen" aria-pressed="false">${icons.filter}</button>` : ''}
            <button class="icon-btn" data-act="shuffle" aria-label="Lernstapel mischen" aria-pressed="false">${icons.shuffle}</button>
            <button class="icon-btn" data-act="reset" aria-label="Fortschritt zurücksetzen">${icons.reset}</button>`,
  })}
  <main class="study">
    <div class="study-top">
      <div class="segmented" role="tablist" style="--n:2;--i:0">
        <span class="seg-thumb" aria-hidden="true"></span>
        <button type="button" role="tab" data-mode="learn">Lernstapel <span class="seg-count" data-count="learn"></span></button>
        <button type="button" role="tab" data-mode="known">Gekonnt <span class="seg-count" data-count="known"></span></button>
      </div>
      <div class="progress-row">
        <span class="meter"><span></span></span>
        <span class="progress-label"></span>
      </div>
    </div>

    <div class="deck-area">
      <div class="deck">
        <div class="layer l2"></div>
        <div class="layer l1" aria-hidden="true">
          <div class="face-head"><span class="face-label">Frage</span><span class="face-topic"></span></div>
          <div class="face-body"></div>
        </div>
        <div class="flashcard" role="button" tabindex="0" aria-label="Karte umdrehen">
          <div class="flipper">${faceHtml('front')}${faceHtml('back')}</div>
        </div>
      </div>
      <div class="empty-state" hidden></div>
    </div>

    <div class="card-meta">
      <span class="counter"></span>
      <span class="hint">Tippen zum Umdrehen · Wischen zum Sortieren</span>
    </div>
    <div class="actions"></div>
  </main>`;

  const q = (sel) => el.querySelector(sel);
  const card = q('.flashcard');
  const deck = q('.deck');
  const empty = q('.empty-state');
  const meta = q('.card-meta');
  const actions = q('.actions');
  const frontFace = q('.face.front');
  const backFace = q('.face.back');
  const peek = q('.layer.l1');

  const currentCard = () => {
    const list = order[mode];
    return list.length ? byId.get(list[pos[mode]]) : null;
  };
  const persist = () => setKnown(s.id, known);

  function setSwipe(p) {
    card.style.setProperty('--good', Math.max(0, Math.min(1, p)).toFixed(3));
    card.style.setProperty('--bad', Math.max(0, Math.min(1, -p)).toFixed(3));
  }

  let flipToken = 0;
  const flipper = q('.flipper');

  function resetFlip() {
    flipToken += 1; // laufende Umdreh-Animation abbrechen
    flipper.getAnimations().forEach((a) => a.cancel());
    flipped = false;
    card.classList.remove('flipped');
  }

  function actionsHtml() {
    if (mode === 'learn') {
      return `<button class="action bad" data-act="again">${icons.xmark}<span>Nochmal</span></button>
        <button class="action-round" data-act="undo" aria-label="Rückgängig" ${history.length ? '' : 'disabled'}>${icons.undo}</button>
        <button class="action good" data-act="know">${icons.check}<span>Kann ich</span></button>`;
    }
    return `<button class="action bad" data-act="relearn">${icons.undo}<span>Wieder lernen</span></button>
      <button class="action neutral" data-act="next"><span>Weiter</span>${icons.next}</button>`;
  }

  function emptyHtml() {
    if (!pool.length) {
      return `<div class="empty-icon">${icons.cards}</div><h2>Keine Karteikarten</h2>
        <p>${s.cards.length ? 'In den gewählten Kapiteln gibt es keine Karten.' : 'Für dieses Fach sind noch keine Karten hinterlegt.'}</p>
        ${hasChapters && sel ? '<div class="empty-actions"><button class="btn tinted" data-act="chapters">Kapitel auswählen</button></div>' : ''}`;
    }
    if (mode === 'learn') {
      const where = sel ? (sel.length === 1 ? ' in diesem Kapitel' : ' in den gewählten Kapiteln') : '';
      return `<div class="empty-icon done">${icons.checkCircle}</div><h2>Alles gekonnt!</h2>
        <p>Alle ${pool.length} Karten${where} liegen auf dem Gekonnt-Stapel.</p>
        <div class="empty-actions">
          <button class="btn tinted" data-mode="known">Gekonnt-Stapel ansehen</button>
          <button class="btn plain" data-act="reset">Alle wieder lernen</button>
        </div>`;
    }
    return `<div class="empty-icon">${icons.cards}</div><h2>Noch nichts gekonnt</h2>
      <p>Karten, die du mit „Kann ich“ markierst, landen auf diesem Stapel.</p>
      <div class="empty-actions"><button class="btn tinted" data-mode="learn">Zum Lernstapel</button></div>`;
  }

  function render() {
    const list = order[mode];
    if (pos[mode] >= list.length) pos[mode] = 0;
    const total = pool.length;
    const done = knownInPool();

    q('[data-count="learn"]').textContent = order.learn.length;
    q('[data-count="known"]').textContent = order.known.length;
    const seg = q('.segmented');
    seg.style.setProperty('--i', mode === 'learn' ? 0 : 1);
    seg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    q('.progress-row .meter > span').style.width = `${total ? (done / total) * 100 : 0}%`;
    q('.progress-label').textContent = `${done} von ${total} gekonnt`;
    q('[data-act="shuffle"]').setAttribute('aria-pressed', String(shuffleOn));
    if (hasChapters) {
      q('[data-act="chapters"]').setAttribute('aria-pressed', String(Boolean(sel)));
      q('.nav-subtitle').textContent = chapterSummary(s, sel);
    }

    const c = currentCard();
    deck.hidden = !c;
    meta.hidden = !c;
    actions.hidden = !c;
    empty.hidden = Boolean(c);

    if (c) {
      fillFace(frontFace, c.front, c.frontImage, c.invert, c.topic);
      fillFace(backFace, c.back, c.backImage, c.invert, c.topic);
      // Nächste Karte liegt sichtbar darunter (sieht man beim Wischen)
      const next = list.length > 1 ? byId.get(list[(pos[mode] + 1) % list.length]) : null;
      if (next) fillFace(peek, next.front, next.frontImage, next.invert, next.topic);
      el.querySelectorAll('.swipe-badge.good span').forEach((b) => { b.textContent = LABELS[mode].good; });
      el.querySelectorAll('.swipe-badge.bad span').forEach((b) => { b.textContent = LABELS[mode].bad; });
      deck.dataset.depth = String(Math.min(list.length - 1, 2));
      q('.counter').textContent = `Karte ${pos[mode] + 1} von ${list.length}`;
      actions.innerHTML = actionsHtml();
    } else {
      empty.innerHTML = emptyHtml();
      actions.innerHTML = '';
    }
  }

  // ---------- Animationen ----------

  async function flyOut(dir) {
    if (reducedMotion()) return null;
    const from = card.style.transform || 'none';
    const dist = window.innerWidth * 0.6 + card.offsetWidth;
    const anim = card.animate([
      { transform: from, opacity: 1 },
      { transform: `translateX(${dir * dist}px) rotate(${dir * 14}deg)`, opacity: 0 },
    ], { duration: 280, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards' });
    try { await anim.finished; } catch { /* abgebrochen */ }
    return anim;
  }

  function enter(fromDir = 0) {
    if (reducedMotion() || deck.hidden) return;
    const keyframes = fromDir
      ? [{ transform: `translateX(${fromDir * (window.innerWidth * 0.6 + card.offsetWidth)}px) rotate(${fromDir * 12}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }]
      : [{ transform: 'translateY(16px) scale(.95)', opacity: 0.35 }, { transform: 'none', opacity: 1 }];
    card.animate(keyframes, { duration: fromDir ? 360 : 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  async function advance(dir, mutate) {
    if (busy) return;
    busy = true;
    card.classList.remove('dragging');
    const anim = await flyOut(dir);
    mutate();
    card.style.transform = '';
    setSwipe(0);
    resetFlip();
    render();
    anim?.cancel();
    enter(0);
    busy = false;
  }

  function snapBack() {
    const from = card.style.transform;
    card.style.transform = '';
    setSwipe(0);
    if (from && !reducedMotion()) {
      card.animate([{ transform: from }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,1.25,.35,1)' });
    }
  }

  // ---------- Aktionen ----------

  // Umdrehen in zwei Hälften: bis 90° (hochkant) drehen, Seite tauschen, von −90° zurück auf 0°.
  // So wird nie eine Seite von hinten gezeigt – funktioniert in Safari zuverlässig.
  async function flip() {
    if (busy || !currentCard()) return;
    const mine = ++flipToken;
    const target = !flipped;
    const show = () => { flipped = target; card.classList.toggle('flipped', target); };
    if (reducedMotion()) { show(); return; }

    flipper.getAnimations().forEach((a) => a.cancel());
    const dir = target ? 1 : -1;
    const first = flipper.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${dir * 90}deg)` }],
      { duration: 160, easing: 'cubic-bezier(.45,0,.9,.6)', fill: 'forwards' },
    );
    try { await first.finished; } catch { return; } // abgebrochen
    if (mine !== flipToken) return;
    show();
    flipper.animate(
      [{ transform: `rotateY(${-dir * 90}deg)` }, { transform: 'rotateY(0deg)' }],
      { duration: 260, easing: 'cubic-bezier(.1,.6,.25,1)' },
    );
    first.cancel();
  }

  function know() {
    const c = currentCard();
    if (!c || mode !== 'learn') return;
    const index = pos.learn;
    advance(1, () => {
      order.learn.splice(index, 1);
      known.add(c.id);
      persist();
      order.known = knownOrder();
      if (pos.learn >= order.learn.length) pos.learn = 0;
      history.push({ type: 'know', id: c.id, index });
    });
  }

  function again() {
    const c = currentCard();
    if (!c || mode !== 'learn') return;
    const prev = pos.learn;
    advance(-1, () => {
      pos.learn = (pos.learn + 1) % order.learn.length;
      history.push({ type: 'again', prev });
    });
  }

  function undo() {
    if (busy || mode !== 'learn' || !history.length) return;
    const h = history.pop();
    if (h.type === 'know') {
      known.delete(h.id);
      persist();
      order.known = knownOrder();
      const i = Math.min(h.index, order.learn.length);
      order.learn.splice(i, 0, h.id);
      pos.learn = i;
    } else {
      pos.learn = Math.min(h.prev, Math.max(0, order.learn.length - 1));
    }
    card.style.transform = '';
    setSwipe(0);
    resetFlip();
    render();
    enter(h.type === 'know' ? 1 : -1);
  }

  function relearn() {
    const c = currentCard();
    if (!c || mode !== 'known') return;
    advance(-1, () => {
      known.delete(c.id);
      persist();
      order.known.splice(pos.known, 1);
      if (pos.known >= order.known.length) pos.known = 0;
      order.learn.push(c.id);
      toast('Zurück auf den Lernstapel');
    });
  }

  function nextKnown() {
    if (!currentCard() || mode !== 'known') return;
    advance(1, () => { pos.known = (pos.known + 1) % order.known.length; });
  }

  const onGood = () => (mode === 'learn' ? know() : nextKnown());
  const onBad = () => (mode === 'learn' ? again() : relearn());

  function setMode(m) {
    if (busy || m === mode) return;
    mode = m;
    history = [];
    card.style.transform = '';
    setSwipe(0);
    resetFlip();
    render();
    enter(0);
  }

  function toggleShuffle() {
    if (busy) return;
    shuffleOn = !shuffleOn;
    setPrefs(s.id, { shuffle: shuffleOn });
    buildLearn();
    history = [];
    resetFlip();
    render();
    if (mode === 'learn') enter(0);
    toast(shuffleOn ? 'Lernstapel gemischt' : 'Originalreihenfolge');
  }

  function reset() {
    if (busy) return;
    if (!knownInPool()) { toast('Es liegen noch keine Karten auf dem Gekonnt-Stapel'); return; }
    const scope = sel ? `„${chapterSummary(s, sel)}“` : `„${s.name}“`;
    if (!window.confirm(`Fortschritt für ${scope} zurücksetzen?\nDie Karten kommen zurück auf den Lernstapel.`)) return;
    for (const c of pool) known.delete(c.id);
    persist();
    order.known = [];
    buildLearn();
    history = [];
    mode = 'learn';
    resetFlip();
    render();
    enter(0);
    toast('Fortschritt zurückgesetzt');
  }

  function chooseChapters() {
    if (busy) return;
    openChapterSheet(s, sel, (next) => {
      sel = next;
      pool = s.cards.filter((c) => inSelection(c, sel));
      buildLearn();
      order.known = knownOrder();
      pos.known = 0;
      history = [];
      card.style.transform = '';
      setSwipe(0);
      resetFlip();
      render();
      enter(0);
    });
  }

  // ---------- Eingaben ----------

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-mode]');
    if (!t || t.disabled) return;
    if (e.detail > 0) t.blur(); // nach Tippen/Klicken keinen Fokus behalten (Leertaste = umdrehen)
    if (t.dataset.mode) { setMode(t.dataset.mode); return; }
    ({
      know, again, undo, relearn, next: nextKnown, shuffle: toggleShuffle, reset, chapters: chooseChapters,
    })[t.dataset.act]?.();
  });

  let drag = null;
  card.addEventListener('pointerdown', (e) => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('.zoom-btn')) return; // Lupe: Bild vergrößern statt umdrehen
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, active: false };
  });
  card.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        drag.active = true;
        card.classList.add('dragging');
        try { card.setPointerCapture(e.pointerId); } catch { /* egal */ }
      } else if (Math.abs(dy) > 10) {
        drag = null; // vertikal: Text in der Karte scrollen
        return;
      } else {
        return;
      }
    }
    drag.dx = dx;
    const rot = Math.max(-14, Math.min(14, dx / 22));
    card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
    setSwipe(dx / (card.offsetWidth * 0.3));
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) {
      if (e.type === 'pointerup') flip();
      return;
    }
    card.classList.remove('dragging');
    const threshold = Math.min(110, card.offsetWidth * 0.22);
    if (e.type === 'pointerup' && Math.abs(d.dx) > threshold) {
      if (d.dx > 0) onGood(); else onBad();
    } else {
      snapBack();
    }
  };
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = e.target.closest?.('button, a');
    switch (e.key) {
      case ' ':
        e.preventDefault(); flip(); break;
      case 'Enter':
        if (onButton) return;
        e.preventDefault(); flip(); break;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault(); flip(); break;
      case 'ArrowRight':
        e.preventDefault(); onGood(); break;
      case 'ArrowLeft':
        e.preventDefault(); onBad(); break;
      case 'Backspace':
        undo(); break;
      default:
    }
  }
  document.addEventListener('keydown', onKey);

  render();
  return () => document.removeEventListener('keydown', onKey);
}
