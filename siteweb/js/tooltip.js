/* Hover (or tap) a highlighted term: a small bubble inside the app screen explains it. */
import { $, clamp, el } from "./util.js";
import { TERMS, tipHtml } from "./terms.js";

export function createTooltip() {
  const screen = $("#screen");
  const tip = el("div", "tip");
  tip.hidden = true;
  screen.appendChild(tip);
  let current = null;
  let openedAt = 0;

  function place(term) {
    /* measured in the screen's own (unscaled) pixels, so the device's 3D transform does not matter */
    const s = screen.getBoundingClientRect(), t = term.getBoundingClientRect();
    const k = s.width / screen.offsetWidth || 1;
    const left = (t.left - s.left) / k, right = (t.right - s.left) / k, top = (t.top - s.top) / k, bottom = (t.bottom - s.top) / k;
    const W = screen.offsetWidth, H = screen.offsetHeight;
    tip.style.maxHeight = "";
    const w = Math.min(W - 16, tip.offsetWidth);
    let h = tip.offsetHeight;
    const spaceAbove = top - 18, spaceBelow = H - bottom - 18;
    const above = h <= spaceAbove || (h > spaceBelow && spaceAbove >= spaceBelow);   // never cover the term itself
    const room = Math.max(60, above ? spaceAbove : spaceBelow);
    if (h > room) { tip.style.maxHeight = room + "px"; h = room; }
    const x = clamp((left + right) / 2 - w / 2, 8, W - w - 8);
    tip.style.left = x + "px";
    tip.style.top = (above ? top - h - 10 : bottom + 10) + "px";
    tip.classList.toggle("below", !above);
    tip.style.setProperty("--ax", clamp((left + right) / 2 - x, 14, w - 14) + "px");
  }

  function open(term) {
    const data = TERMS[term.dataset.term];
    if (!data) return;
    current = term;
    openedAt = performance.now();
    tip.innerHTML = tipHtml(data);
    tip.classList.toggle("wide", data.points.length >= 5);   // long lists run in two columns to stay short
    tip.hidden = false;
    place(term);
    tip.classList.add("on");
  }
  function close() { current = null; tip.classList.remove("on"); tip.hidden = true; }

  screen.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t && t !== current) open(t); });
  screen.addEventListener("mouseout", (e) => {
    if (!e.target.closest(".term")) return;
    const to = e.relatedTarget;
    if (!(to && to.closest && (to.closest(".tip") || to.closest(".term")))) close();
  });
  screen.addEventListener("focusin", (e) => { const t = e.target.closest(".term"); if (t && t !== current) open(t); });
  screen.addEventListener("focusout", close);
  // Tap a term to open its box, tap anywhere outside to close and go back
  // to the site. On touch, tapping a term fires focusin/mouseover THEN
  // click, in that order -- without the timing guard below, the open()
  // call above would already have set current = t before click runs, so
  // "current === t" would look like a second tap and close it right back
  // (the box would flash open then shut, same tap). The 250ms grace
  // window treats that immediate click as part of the same tap instead
  // of a deliberate close. Listening on document, not just #screen, so a
  // tap fully outside the device (not just outside the term) also closes it.
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".term");
    if (t) { if (current === t && performance.now() - openedAt > 250) close(); else open(t); }
    else if (!e.target.closest(".tip")) close();
  });
  addEventListener("scroll", close, { passive: true });
  return { close };
}
