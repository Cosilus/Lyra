/* Everything drawn on top of the scene: hero title, scroll hint, chapter dots, final CTA, legal sheet. */
import { $, clamp } from "./util.js";
import { CH, N, TOTAL } from "./story.js";

export function createOverlay() {
  const hero = $("#hero"), hint = $("#hint"), cta = $("#cta"), legal = $("#legal"), paper = $("#paper");
  const label = $("#chapter"), num = $("#chNum"), title = $("#chTitle"), dots = $("#dots");
  for (let i = 0; i < TOTAL; i++) dots.appendChild(document.createElement("i"));

  let paperX = 0, paperY = 0, paperScale = 1, W = 0, H = 0;

  return {
    layout(view) {
      W = view.W; H = view.H;
      paperX = view.W / 2; paperY = view.deskY;
      paperScale = Math.min(view.sc, view.W / 520);
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
    },
  };
}
