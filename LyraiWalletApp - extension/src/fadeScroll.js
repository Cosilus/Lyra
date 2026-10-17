// Every area that scrolls fades its content out at the edge where more is
// hidden (bottom at first, both while in the middle, top at the end),
// instead of showing a scrollbar. Each scrollable element gets
// data-fade and its two fade sizes (styles in ui-polish.css), kept up to date
// as it scrolls, resizes, or new screens open.
const scrollers = new Set();
const SCROLLS = /^(auto|scroll|overlay)$/;

function isScroller(el) {
  if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return false;
  return SCROLLS.test(getComputedStyle(el).overflowY);
}

// The fade on each edge grows with what is hidden there, up to FADE px:
// it shrinks smoothly to nothing as the top or the bottom is reached.
const FADE = 34;
function update(el) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) {
    if (el.hasAttribute("data-fade")) { el.removeAttribute("data-fade"); el.style.removeProperty("--fade-top"); el.style.removeProperty("--fade-bottom"); }
    return;
  }
  const top = Math.min(FADE, Math.max(0, el.scrollTop));
  const bottom = Math.min(FADE, Math.max(0, max - el.scrollTop));
  el.style.setProperty("--fade-top", top.toFixed(1) + "px");
  el.style.setProperty("--fade-bottom", bottom.toFixed(1) + "px");
  if (!el.hasAttribute("data-fade")) el.setAttribute("data-fade", "");
}

function collect(node) {
  if (!(node instanceof HTMLElement)) return;
  if (isScroller(node)) scrollers.add(node);
  node.querySelectorAll("*").forEach((el) => { if (isScroller(el)) scrollers.add(el); });
}

let pending = false;
function refresh() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    for (const el of scrollers) {
      if (!el.isConnected) scrollers.delete(el);
      else update(el);
    }
  });
}

export function startFadeScroll() {
  if (typeof document === "undefined") return;
  const begin = () => {
    collect(document.body);
    refresh();
    document.addEventListener("scroll", (e) => {
      const el = e.target;
      if (el instanceof HTMLElement) {
        if (!scrollers.has(el) && isScroller(el)) scrollers.add(el);
        if (scrollers.has(el)) update(el);
      }
    }, { capture: true, passive: true });
    new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(collect);
      refresh();
    }).observe(document.body, { childList: true, subtree: true });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(refresh).observe(document.body);
    }
    window.addEventListener("resize", refresh);
    // content that grows or shrinks inside a scroller (a menu unfolding, an answer arriving)
    document.addEventListener("transitionend", refresh, true);
    document.addEventListener("animationend", refresh, true);
    document.addEventListener("click", () => setTimeout(refresh, 380), true);
  };
  if (document.body) begin(); else window.addEventListener("DOMContentLoaded", begin, { once: true });
}
