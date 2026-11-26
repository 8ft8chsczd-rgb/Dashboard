import { getSubject, getKnown, setKnown, getPrefs, setPrefs } from '../store.js';
import { esc, fmt, plainLength, isListy, icons, navbar, shuffle, toast, notFound, reducedMotion } from '../ui.js';

// Rechts = positiv (kann ich / weiter), links = zurück auf den Lernstapel.
const LABELS = {
  learn: { good: 'Kann ich', bad: 'Nochmal' },
  known: { good: 'Weiter', bad: 'Wieder lernen' },
};

function faceHtml(side) {
  const label = side === 'front' ? 'Frage' : 'Antwort';
  return `<div class="face ${side}">
    <div class="face-head"><span class="face-label">${label}</span><span class="face-topic"></span></div>
    <div class="face-body"></div>
    <div class="swipe-badge good">${icons.check}<span></span></div>
    <div class="swipe-badge bad">${icons.undo}<span></span></div>
  </div>`;
}

function fillFace(body, text, image) {
  const len = plainLength(text);
  const size = len <= 36 ? 'xl' : len <= 100 ? 'lg' : len <= 240 ? 'md' : 'sm';
  const left = isListy(text) || len > 140;
  body.className = `face-body size-${size}${left ? ' left' : ''}`;
  body.innerHTML = `<div class="txt">${image ? `<img class="card-img" src="${esc(image)}" alt="" draggable="false">` : ''}${fmt(text)}</div>`;
  body.scrollTop = 0;
}

export async function renderFlashcards(el, id) {
  const s = await getSubject(id);
  if (!s) return notFound(el);
  el.classList.add('fill');

  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const known = new Set([...getKnown(s.id)].filter((k) => byId.has(k)));
  let shuffleOn = Boolean(getPrefs(s.id).shuffle);
  let mode = 'learn';
  const order = { learn: [], known: [] };
  const pos = { learn: 0, known: 0 };
  let flipped = false;
  let busy = false;
  let history = [];

  const knownOrder = () => s.cards.filter((c) => known.has(c.id)).map((c) => c.id);
  function buildLearn() {
    const ids = s.cards.filter((c) => !known.has(c.id)).map((c) => c.id);
    order.learn = shuffleOn ? shuffle(ids) : ids;
    pos.learn = 0;
  }
  buildLearn();
  order.known = knownOrder();

  el.innerHTML = `${navbar({
    back: { href: `#/fach/${encodeURIComponent(s.id)}`, label: s.name },
    title: 'Karteikarten',
    plain: true,
    right: `<button class="icon-btn" data-act="shuffle" aria-label="Lernstapel mischen" aria-pressed="false">${icons.shuffle}</button>
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
  const frontBody = q('.face.front .face-body');
  const backBody = q('.face.back .face-body');
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

  function resetFlip() {
    flipped = false;
    card.classList.add('instant');
    card.classList.remove('flipped');
    void card.offsetWidth;
    card.classList.remove('instant');
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
    if (!s.cards.length) {
      return `<div class="empty-icon">${icons.cards}</div><h2>Keine Karteikarten</h2>
        <p>Für dieses Fach sind noch keine Karten hinterlegt.</p>`;
    }
    if (mode === 'learn') {
      return `<div class="empty-icon done">${icons.checkCircle}</div><h2>Alles gekonnt!</h2>
        <p>Alle ${s.cards.length} Karten liegen auf dem Gekonnt-Stapel.</p>
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
    const total = s.cards.length;

    q('[data-count="learn"]').textContent = order.learn.length;
    q('[data-count="known"]').textContent = order.known.length;
    const seg = q('.segmented');
    seg.style.setProperty('--i', mode === 'learn' ? 0 : 1);
    seg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    q('.progress-row .meter > span').style.width = `${total ? (known.size / total) * 100 : 0}%`;
    q('.progress-label').textContent = `${known.size} von ${total} gekonnt`;
    q('[data-act="shuffle"]').setAttribute('aria-pressed', String(shuffleOn));

    const c = currentCard();
    deck.hidden = !c;
    meta.hidden = !c;
    actions.hidden = !c;
    empty.hidden = Boolean(c);

    if (c) {
      fillFace(frontBody, c.front, c.frontImage);
      fillFace(backBody, c.back, c.backImage);
      el.querySelectorAll('.flipper .face-topic').forEach((t) => { t.textContent = c.topic; });
      // Nächste Karte liegt sichtbar darunter (sieht man beim Wischen)
      const next = list.length > 1 ? byId.get(list[(pos[mode] + 1) % list.length]) : null;
      if (next) {
        fillFace(peek.querySelector('.face-body'), next.front, next.frontImage);
        peek.querySelector('.face-topic').textContent = next.topic;
      }
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

  function flip() {
    if (busy || !currentCard()) return;
    flipped = !flipped;
    card.classList.toggle('flipped', flipped);
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
    if (!known.size) { toast('Es liegen noch keine Karten auf dem Gekonnt-Stapel'); return; }
    if (!window.confirm(`Fortschritt für „${s.name}“ zurücksetzen?\nAlle Karten kommen zurück auf den Lernstapel.`)) return;
    known.clear();
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

  // ---------- Eingaben ----------

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-mode]');
    if (!t || t.disabled) return;
    if (e.detail > 0) t.blur(); // nach Tippen/Klicken keinen Fokus behalten (Leertaste = umdrehen)
    if (t.dataset.mode) { setMode(t.dataset.mode); return; }
    ({
      know, again, undo, relearn, next: nextKnown, shuffle: toggleShuffle, reset,
    })[t.dataset.act]?.();
  });

  let drag = null;
  card.addEventListener('pointerdown', (e) => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
