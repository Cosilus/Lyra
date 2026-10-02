/* The interactive menu: buttons for the other tabs of the site, each opening a short conversation. */
import { $, el, esc, wait } from "./util.js";
import { MENU } from "./story.js";

const SITE = () => window.SITE || {};

const cardsHtml = (cards) =>
  `<div class="pg-cards">${cards.map((c) =>
    `<div class="pg-card"><div class="pg-ct"><b>${esc(c.title)}</b>${c.tag ? `<i>${esc(c.tag)}</i>` : ""}</div><p>${esc(c.text)}</p>${c.check ? `<div class="pg-ck">✓ ${esc(c.check)}</div>` : ""}</div>`).join("")}</div>`;
const noteHtml = (n) => (n ? `<div class="pg-note">${esc(n)}</div>` : "");
const sectionHtml = (s) => `<h3 class="pg-h">${esc(s.title)}</h3><p class="pg-lead">${esc(s.lead)}</p>${cardsHtml(s.cards)}${noteHtml(s.note)}`;

function renderPage(id) {
  const S = SITE();
  if (id === "defi" || id === "predictions" || id === "payments") return sectionHtml(S[id]);
  if (id === "thinks") return sectionHtml({ ...S.thinks, note: "" });
  if (id === "security") return sectionHtml({ ...S.security, note: (S.security.note || "").replace(/^Every transaction shown[^.]*\.\s*/, "") });
  if (id === "ask") {
    return `<h3 class="pg-h">${esc(S.ask.title)}</h3><p class="pg-lead">${esc(S.ask.lead)}</p><div class="pg-ask"><span>Does this contract look risky?</span><span>What does this rate mean?</span><span>What's the safest way to earn yield on USDT0?</span></div>`;
  }
  if (id === "faq") {
    const groups = S.faq.groups;
    const tabs = groups.map((g, i) => `<button type="button" class="pg-tab${i === 0 ? " active" : ""}" data-cat="${esc(g.id)}"><span class="pg-tab-label">${esc(g.label)}</span><span class="pg-tab-fill"></span></button>`).join("");
    const panes = groups.map((g, i) => `<div class="pg-pane" data-cat="${esc(g.id)}"${i === 0 ? "" : " hidden"}>` +
      g.items.map((q) => `<div class="pg-q"><button type="button" class="pg-qb"><span>${esc(q.q)}</span><i>+</i></button><div class="pg-qa"><p>${esc(q.a)}</p></div></div>`).join("") + "</div>").join("");
    return `<div class="pg-tabs" role="tablist">${tabs}</div>${panes}`;
  }
  if (id === "contact") {
    return `<h3 class="pg-h">Get in touch</h3><p class="pg-lead">Have a question, feedback, or a proposal? Tell us. We read every message.</p>
      <form class="pg-form" novalidate>
        <label>Email (required)</label><input type="email" name="email" placeholder="you@example.com" autocomplete="email">
        <label>What's this about?</label><select name="topic"><option value="general">General question</option><option value="feedback">Feedback</option><option value="partnerships">Partnerships</option></select>
        <label>Message</label><textarea name="message" placeholder="Write your message here…"></textarea>
        <input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <div><button type="submit" class="pg-send">Send message</button> <span class="pg-status"></span></div>
      </form>
      <div class="pg-links"><a href="https://x.com/0xlyratech" target="_blank" rel="noopener">X</a><a href="https://discord.gg/bffmxw4yDc" target="_blank" rel="noopener">Discord</a></div>`;
  }
  return "";
}

async function submitContact(form) {
  const status = form.querySelector(".pg-status"), button = form.querySelector(".pg-send");
  if (form._honey && form._honey.value) return;
  const email = form.email.value.trim(), message = form.message.value.trim();
  const say = (text, kind = "") => { status.textContent = text; status.className = "pg-status " + kind; };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say("Please enter a valid email address.", "err");
  if (!message) return say("Please write a message before sending.", "err");
  const label = { general: "General question", feedback: "Feedback", partnerships: "Partnerships" }[form.topic.value] || "General question";
  button.disabled = true; say("Sending…");
  try {
    const res = await fetch("https://formsubmit.co/ajax/contact@lyrapp.to", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Anonymous", email, topic: label, message, _subject: "[Lyra – " + label + "]", _template: "table", _captcha: "false" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.success) === "false") throw new Error("failed");
    form.reset(); say("Message sent. We'll get back to you soon.", "ok");
  } catch (err) { say("Couldn't send your message. Please try again in a moment.", "err"); }
  finally { button.disabled = false; }
}

// Pointer-reactive 3D tilt, same mechanic as lyrapp.to's own .feat-card
// tilt: rotateX/Y from cursor position within the element, eased back to
// flat on mouseleave via the .tilt-3d CSS transition (see pages.css).
// Skipped for touch (no hover to react to) and reduced-motion.
// Was removed for a while chasing a "half-lit card" bug that turned out
// to be the laptop lid itself never resting perfectly flat (see
// devices/laptop.js pose() -- it always held a 10deg rotateX, even at
// rest, so the whole screen's hit-testing was projected through a tilted
// 3D quad). Now that the lid snaps to exactly 0deg once open and idle,
// this card-level tilt's own getBoundingClientRect() math is measuring
// a genuinely flat box again, so it's safe to bring back.
const canTilt = matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
function addTilt(el) {
  el.classList.add("tilt-3d");
  if (!canTilt) return;
  el.addEventListener("mousemove", (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const ry = ((px - 0.5) * 12).toFixed(2), rx = ((0.5 - py) * 12).toFixed(2);
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
  });
  el.addEventListener("mouseleave", () => {
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)";
  });
}

export function createPages() {
  const root = $("#pages"), menu = $("#pgMenu"), grid = $("#pgGrid"), detail = $("#pgDetail");
  const scroll = $("#pgScroll"), back = $("#pgBack"), crumb = $("#pgCrumb"), appTop = $(".app-top");
  let run = 0, visible = false;

  for (const [id, label, desc] of MENU) {
    const b = el("button", "menu-btn", `<b>${label}</b><span>${desc}</span>`);
    b.type = "button"; b.dataset.id = id;
    addTilt(b);
    grid.appendChild(b);
  }

  function showMenu() { run++; detail.classList.remove("on"); menu.classList.add("on"); scroll.innerHTML = ""; }

  async function open(id) {
    const my = ++run, alive = () => my === run;
    const item = MENU.find((m) => m[0] === id);
    if (!item) return;
    menu.classList.remove("on"); detail.classList.add("on");
    crumb.textContent = item[1];
    scroll.innerHTML = ""; scroll.scrollTop = 0;
    const intro = el("div", "pg-intro", '<div class="avatar"><img src="logo.svg" alt=""></div><p></p>');
    scroll.appendChild(intro);
    const line = intro.lastChild, text = item[3];
    for (let n = 1; n <= text.length; n++) {
      if (!alive()) return;
      line.textContent = text.slice(0, n);
      await wait(text[n - 1] === "." ? 200 : 13 + Math.random() * 8);
    }
    if (alive()) scroll.appendChild(el("div", "pg-body", renderPage(id)));
  }

  grid.addEventListener("click", (e) => { const b = e.target.closest(".menu-btn"); if (b) open(b.dataset.id); });
  back.addEventListener("click", showMenu);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && detail.classList.contains("on")) showMenu(); });
  scroll.addEventListener("click", (e) => {
    const q = e.target.closest(".pg-qb");
    if (q) { q.parentElement.classList.toggle("open"); return; }
    const tab = e.target.closest(".pg-tab");     // FAQ sub-tabs: one category at a time
    if (tab && !tab.classList.contains("active")) {
      scroll.querySelectorAll(".pg-tab").forEach((t) => t.classList.toggle("active", t === tab));
      scroll.querySelectorAll(".pg-pane").forEach((p) => {
        const match = p.dataset.cat === tab.dataset.cat;
        p.hidden = !match;
        p.classList.remove("pg-pane-in");
        if (match) { void p.offsetWidth; p.classList.add("pg-pane-in"); }   // restart the entrance animation
      });
    }
  });
  scroll.addEventListener("submit", (e) => { e.preventDefault(); submitContact(e.target); });

  return {
    /* Show or hide the whole layer. Showing always starts on the menu. */
    setVisible(on) {
      if (on === visible) return;
      visible = on;
      root.classList.toggle("on", on);
      if (on) {
        root.style.top = appTop.offsetHeight + "px"; showMenu();
        const first = new URLSearchParams(location.search).get("open");   // ?open=faq (testing)
        if (first) open(first);
      }
      else { run++; menu.classList.remove("on"); detail.classList.remove("on"); }
    },
    open,
  };
}
