/* Everything drawn on top of the scene: hero title, scroll hint, chapter dots, final CTA, legal sheet. */
import { $, clamp } from "./util.js";
import { CH, N, TOTAL } from "./story.js";

export function createOverlay({ onDotClick } = {}) {
  const hero = $("#hero"), hint = $("#hint"), cta = $("#cta"), legal = $("#legal"), paper = $("#paper");
  const label = $("#chapter"), num = $("#chNum"), title = $("#chTitle"), dots = $("#dots");
  for (let i = 0; i < TOTAL; i++) {
    const dot = document.createElement("i");
    // Jump straight to that chapter, same idea as a video scrubber's
    // chapter marks. Real <button>s (not the bare <i>s this was before)
    // so they're keyboard-reachable and screen readers announce them,
    // not just mouse-clickable divs.
    dot.setAttribute("role", "button");
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("aria-label", i < N ? `Go to "${CH[i].title}"` : "Go to the menu");
    dot.addEventListener("click", () => onDotClick?.(i));
    dot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDotClick?.(i); }
    });
    dots.appendChild(dot);
  }

  let paperX = 0, paperY = 0, paperScale = 1, W = 0, H = 0;

  return {
    layout(view) {
      W = view.W; H = view.H;
      paperX = view.W / 2; paperY = view.deskY;
      paperScale = Math.min(view.sc, view.W / 520);

      /* The sheet lands on the desk, but on a wide, short window it is big and
         its lower edge ran over the legal line at the very bottom, hiding that
         text. Work out where the sheet's lower edge ends up on screen (same
         transform as update() below: rotateX(50deg) under a 1200px perspective,
         plus the 3deg twist lifting its far corner) and, if it would reach the
         legal line, shrink it a little, slide it up the desk, and only then shrink it more. */
      const legalTop = H - H * 0.022 - legal.offsetHeight - 10;
      const rot = (50 * Math.PI) / 180, twist = Math.sin((3 * Math.PI) / 180);
      const lowerEdge = (s) => {
        const y = 90 * s + 230 * s * twist;          // lowest point of the flat sheet
        return (y * Math.cos(rot) * 1200) / (1200 - y * Math.sin(rot));
      };
      const over = () => paperY + lowerEdge(paperScale) - legalTop;
      const fullScale = paperScale;
      // 1) shrink a little, but keep the sheet readable (links are 14px at scale 1)
      while (over() > 0 && paperScale > fullScale * 0.75 && paperScale > 0.6) paperScale -= 0.02;
      // 2) slide it up the desk for whatever is left
      if (over() > 0) paperY -= Math.min(over(), H * 0.25);
      // 3) last resort, shrink more
      while (over() > 0 && paperScale > 0.4) paperScale -= 0.02;
    },

    update(tl) {
      hero.style.opacity = 1 - tl.heroFade;
      hero.style.transform = `translateY(${(-tl.heroFade * 160).toFixed(1)}px)`;
      hint.style.opacity = 1 - tl.hintFade;

      cta.style.opacity = tl.textOn;
      cta.classList.toggle("on", tl.textOn > 0.5);
      cta.style.transform = `translateY(${(1 - tl.textOn) * 24}px)`;
      legal.style.opacity = tl.textOn;
      legal.classList.toggle("on", tl.textOn > 0.5);

      /* the sheet slides in from the left, spinning, and lands in the middle of the desk */
      const t = tl.paperT;
      if (t <= 0) paper.style.opacity = 0;
      else {
        const x = paperX - (1 - t) * (W * 0.62 + 300), y = paperY - (1 - t) * (H * 0.05) * Math.sin(t * Math.PI);
        paper.style.opacity = 1;
        paper.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) perspective(1200px) rotateX(50deg) rotateZ(${(-3 - (1 - t) * 200).toFixed(1)}deg) scale(${paperScale.toFixed(3)})`;
      }
      paper.classList.toggle("on", t > 0.97);

      const idx = tl.chapter, showUi = idx > 0 && tl.uiOpen;
      label.style.opacity = showUi ? 1 : 0;
      if (idx > 0) { num.textContent = String(idx).padStart(2, "0"); title.textContent = idx <= N ? CH[idx - 1].title : "Explore"; }
      [...dots.children].forEach((d, n) => d.classList.toggle("on", n === idx - 1));
      dots.style.opacity = showUi ? 1 : 0;
      /* Invisible is not enough: the dots are clickable buttons sitting on the right edge,
         and on a narrow screen they would sit on top of the X balloon and eat its clicks. */
      dots.style.pointerEvents = showUi ? "" : "none";
    },
  };
}
