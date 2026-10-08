// Lyra's own hover labels, instead of the browser's plain white title boxes.
// Any element with a `title` (or `data-tip`) gets them: the title moves to
// data-tip on first hover so the native box never shows, and one floating
// label is placed above the element (below it when there's no room).

const DELAY_MS = 350;
const GAP = 8;

export function startTooltips() {
  const tip = document.createElement("div");
  tip.className = "lyra-tip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);

  let target = null;
  let timer = 0;

  function hide() {
    clearTimeout(timer);
    timer = 0;
    target = null;
    tip.classList.remove("is-on");
  }

  function show(el) {
    const text = el.getAttribute("data-tip");
    if (!text || !el.isConnected) return;
    tip.textContent = text;
    tip.classList.remove("is-below");
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(6, Math.min(left, vw - t.width - 6));
    let top = r.top - t.height - GAP;
    if (top < 6) { top = r.bottom + GAP; tip.classList.add("is-below"); }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.classList.add("is-on");
  }

  document.addEventListener("pointerover", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[title], [data-tip]") : null;
    if (el === target) return;
    hide();
    if (!el) return;
    if (el.hasAttribute("title")) {
      const title = el.getAttribute("title");
      el.removeAttribute("title");
      if (title) el.setAttribute("data-tip", title);
    }
    if (!el.getAttribute("data-tip")) return;
    target = el;
    timer = setTimeout(() => show(el), DELAY_MS);
  }, true);

  document.addEventListener("pointerout", (e) => {
    if (target && !target.contains(e.relatedTarget)) hide();
  }, true);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}
