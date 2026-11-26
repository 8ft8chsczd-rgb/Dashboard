// Vollbild-Ansicht für Skizzen: Zwei-Finger-Zoom, Doppeltippen, Verschieben, Mausrad/Trackpad.
import { esc, icons, reducedMotion } from './ui.js';

const MAX = 6;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function openViewer(src, { invert = false } = {}) {
  const prevFocus = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'viewer';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Skizze');
  ov.innerHTML = `
    <img class="viewer-img${invert ? ' inv' : ''}" src="${esc(src)}" alt="Skizze" draggable="false">
    <button type="button" class="viewer-close" aria-label="Schließen">${icons.xmark}</button>
    <div class="viewer-hint">Zoomen mit zwei Fingern oder Doppeltippen</div>`;
  document.body.append(ov);
  document.body.classList.add('no-scroll');

  const img = ov.querySelector('.viewer-img');
  const closeBtn = ov.querySelector('.viewer-close');
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const pointers = new Map();
  let gesture = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  let moved = false;

  const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  function apply(animate = false) {
    img.classList.toggle('animating', animate);
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    ov.classList.toggle('zoomed', scale > 1.01);
  }

  function clampPan() {
    const maxX = Math.max(0, (img.offsetWidth * scale - window.innerWidth) / 2 + 20);
    const maxY = Math.max(0, (img.offsetHeight * scale - window.innerHeight) / 2 + 20);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  }

  function zoomAt(newScale, px, py, animate = false) {
    const c = center();
    const lx = (px - c.x - tx) / scale;
    const ly = (py - c.y - ty) / scale;
    scale = clamp(newScale, 1, MAX);
    tx = px - c.x - scale * lx;
    ty = py - c.y - scale * ly;
    if (scale <= 1.01) { scale = 1; tx = 0; ty = 0; }
    clampPan();
    apply(animate);
  }

  function startGesture() {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture = {
        type: 'pinch', scale, tx, ty,
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    } else if (pts.length === 1) {
      gesture = { type: 'pan', tx, ty, x: pts[0].x, y: pts[0].y };
    } else {
      gesture = null;
    }
  }

  ov.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.viewer-close')) return;
    ov.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (pointers.size === 1) moved = false;
    startGesture();
  });

  ov.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) moved = true;
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const c = center();
      const s = clamp(gesture.scale * (dist / gesture.dist), 0.8, MAX);
      const lx = (gesture.mid.x - c.x - gesture.tx) / gesture.scale;
      const ly = (gesture.mid.y - c.y - gesture.ty) / gesture.scale;
      scale = s;
      tx = mid.x - c.x - s * lx;
      ty = mid.y - c.y - s * ly;
      apply();
    } else if (gesture.type === 'pan' && scale > 1) {
      tx = gesture.tx + (p.x - gesture.x);
      ty = gesture.ty + (p.y - gesture.y);
      apply();
    }
  });

  const onUp = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (pointers.size) { startGesture(); return; }
    gesture = null;

    if (scale < 1.01) { scale = 1; tx = 0; ty = 0; apply(true); } else { clampPan(); apply(true); }
    if (moved || e.type === 'pointercancel') return;

    // Tippen: Doppeltippen zoomt, einfaches Tippen auf den Hintergrund schließt
    const now = Date.now();
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap.t = 0;
      if (scale > 1) { scale = 1; tx = 0; ty = 0; apply(true); } else zoomAt(2.5, e.clientX, e.clientY, true);
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (e.target !== img && scale === 1) {
      setTimeout(() => { if (lastTap.t === now) close(); }, 330);
    }
  };
  ov.addEventListener('pointerup', onUp);
  ov.addEventListener('pointercancel', onUp);

  ov.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
    zoomAt(scale * factor, e.clientX, e.clientY);
  }, { passive: false });

  // Safari: eigene Pinch-Gesten der Seite unterdrücken
  const stopGesture = (e) => e.preventDefault();
  ov.addEventListener('gesturestart', stopGesture);
  ov.addEventListener('gesturechange', stopGesture);

  // Tasten nicht an die Ansicht dahinter weitergeben (sonst würde z. B. die Karte umgedreht)
  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  document.addEventListener('keydown', onKey, true);

  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('no-scroll');
    ov.classList.add('closing');
    const done = () => { ov.remove(); prevFocus?.focus?.({ preventScroll: true }); };
    if (reducedMotion()) done(); else setTimeout(done, 200);
  }

  closeBtn.addEventListener('click', close);
  requestAnimationFrame(() => ov.classList.add('open'));
  closeBtn.focus({ preventScroll: true });
}
