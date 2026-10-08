/*
 * The conversation inside the app screen, driven directly by the scroll.
 * Each chapter is a "view": its DOM is built once, then update(tau) shows exactly the state that
 * belongs to that virtual time (see chapters.js). Scrolling back simply un-shows things.
 * Talks to the active device only through keyPress() / setTyping().
 */
import { $, el, ease } from "./util.js";
import { CH, N, NET, TOTAL } from "./story.js";
import { stateAt } from "./chapters.js";
import { plans } from "./timeline.js";
import { richHtml } from "./terms.js";

const I = (paths, rot = 0) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${rot ? ` style="transform:rotate(${rot}deg)"` : ""}>${paths}</svg>`;
/* A small sketch of the real 3D wallet: the tilted box, and the right-hand menu pill opening with its glow. */
const MOCK_3D = `<div class="m3d-stage">
  <div class="m3d-box">
    <img class="m3d-star" src="logo.svg" alt="">
    <div class="m3d-card"><small>AVAILABLE BALANCE</small><b>0.4 <i>XPL</i></b><span>≈ $0.04 · 0x40b1…5c27</span></div>
    <div class="m3d-ask"><b>What should we do?</b><span>Send, receive, swap, bridge or stake tokens.</span></div>
    <div class="m3d-input"><span>Message Lyra…</span><i></i></div>
  </div>
  <div class="m3d-menu">
    <span>${I('<path d="m5 9 7-7 7 7"/><path d="M12 16V2"/><circle cx="12" cy="21" r="1"/>', 45)}</span>
    <span>${I('<path d="M12 2v14"/><path d="m19 9-7 7-7-7"/><circle cx="12" cy="21" r="1"/>', 45)}</span>
    <span>${I('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>')}</span>
    <span>${I('<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>')}</span>
    <span>${I('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/><path d="m7.9 7.9 2.7 2.7"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/><path d="m13.4 10.6 2.7-2.7"/><circle cx="7.5" cy="16.5" r=".5" fill="currentColor"/><path d="m7.9 16.1 2.7-2.7"/><circle cx="16.5" cy="16.5" r=".5" fill="currentColor"/><path d="m13.4 13.4 2.7 2.7"/><circle cx="12" cy="12" r="2"/>')}</span>
  </div>
</div>`;

const AVATAR = '<div class="avatar"><img src="logo.svg" alt=""></div>';

/* The plan card, as in the wallet: one row per step with the same icons as
   the wallet's menus, confirmed with a fingerprint (no more hold button). */
const STEP_ICON = {
  send: I('<path d="m5 9 7-7 7 7"/><path d="M12 16V2"/><circle cx="12" cy="21" r="1"/>', 45),
  swap: I('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
  bridge: I('<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>'),
  stake: I('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/><path d="m7.9 7.9 2.7 2.7"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/><path d="m13.4 10.6 2.7-2.7"/><circle cx="7.5" cy="16.5" r=".5" fill="currentColor"/><path d="m7.9 16.1 2.7-2.7"/><circle cx="16.5" cy="16.5" r=".5" fill="currentColor"/><path d="m13.4 13.4 2.7 2.7"/><circle cx="12" cy="12" r="2"/>'),
  agent: I('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>'),
};
const FINGERPRINT = I('<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>');
const STAR = '<svg class="plan-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5c.6 4.9 2.6 7.4 7.5 8.1v.8c-4.9.7-6.9 3.2-7.5 8.1-.6-4.9-2.6-7.4-7.5-8.1v-.8c4.9-.7 6.9-3.2 7.5-8.1z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

/* Where the confirmation is, from 0 (button) to 1 (done):
   scan of the fingerprint, then the steps checked one after the other. */
const SCAN_FROM = 0.12, RUN_FROM = 0.5;

/* Build the DOM of one chapter (everything hidden) and return update(tau) + detach(). */
function createView(index, chat) {
  const c = CH[index], plan = plans[index];
  // Reading offsetHeight right after un-hiding forces the browser to
  // actually lay out and paint the node synchronously, instead of only
  // queuing that for later. Seen on a real phone under scroll load (never
  // on desktop): a ticket/hold-button's own background painted right
  // away but its text inside stayed invisible for seconds, exactly what
  // a delayed/dropped paint on newly-shown content looks like.
  const show = (node, on) => { node.hidden = !on; if (on) void node.offsetHeight; };
  const user = el("div", "msg user", richHtml(c.q, c.qSpans));
  const row = el("div", "msg lyra", AVATAR + '<div class="lyra-body"></div>');
  const body = row.lastChild;
  const dots = el("div", "think", "<i></i><i></i><i></i>");
  const stepBox = el("div", "steps");
  const stepEls = c.steps.map((s) => { const n = el("div", "step", '<i class="ic"></i><span>' + s + "</span>"); stepBox.appendChild(n); return n; });
  const answer = el("p");
  const chipBox = el("div", "chips");
  const chipEls = [];
  if (c.nets) for (const [name, file] of NET) chipEls.push(el("span", "chip", `<img src="networks/${file}.svg" alt="">${name}`));
  if (c.chips) for (const t of c.chips) chipEls.push(el("span", "chip", t));
  chipEls.forEach((n) => chipBox.appendChild(n));
  body.append(dots, stepBox, answer, chipBox);
  const mock = c.visual === "3d" ? el("div", "m3d", MOCK_3D) : null;
  if (mock) body.append(mock);

  let wrap = null, planTitle = null, planBox = null, stepRows = [], details = null, scan = null, confirmBtn = null, confirmLabel = null, note = null;
  if (c.plan) {
    const ps = c.plan.steps;
    const readyTitle = ps.length > 1 ? `${ps.length} steps, one confirmation` : "Ready when you are";
    wrap = el("div", "plan");
    const head = el("div", "plan-head", STAR + `<b>${readyTitle}</b>`);
    planTitle = head.querySelector("b");
    planTitle.dataset.ready = readyTitle;
    planBox = el("div", "plan-steps");
    stepRows = ps.map((st, i) => el("div", "plan-step",
      `<span class="plan-ic">${STEP_ICON[st.kind] || STEP_ICON.send}<i class="plan-ok">${CHECK}</i></span>` +
      `<span class="plan-txt"><small>${i > 0 ? "↳ " : ""}${st.label}</small><b>${st.from} <em>→</em> ${st.to}</b></span>`));
    scan = el("div", "plan-scan", `<span>${FINGERPRINT}<i></i><small>Touch ID</small></span>`);
    planBox.append(...stepRows, scan);
    details = el("div", "plan-details", c.plan.details.map((r) => `<div><span>${r[0]}</span><strong${r[2] ? ` class="${r[2]}"` : ""}>${r[1]}</strong></div>`).join(""));
    confirmBtn = el("div", "plan-confirm", FINGERPRINT + "<span>Confirm with Touch ID</span>");
    confirmLabel = confirmBtn.lastChild;
    note = el("div", "tk-note", c.note);
    wrap.append(head, planBox, details, confirmBtn, note);
  }
  let agent = null, agentLine = null;
  if (c.after) {
    agent = el("div", "msg lyra agent", AVATAR + '<div class="lyra-body"><span class="agent-tag">Lyra Guide · A2A</span><p></p></div>');
    agentLine = agent.querySelector("p");
  }

  const nodes = [user, row, wrap, agent].filter(Boolean);
  let attached = false, lastKey = "";

  return {
    attach() { if (!attached) { chat.append(...nodes); attached = true; } },
    detach() { if (attached) { nodes.forEach((n) => n.remove()); attached = false; lastKey = ""; } },

    /* Show the state at virtual time tau. Returns the state (the caller needs `typing`, `typed`). */
    update(tau) {
      const s = stateAt(plan, tau);
      const key = JSON.stringify(s);
      if (key === lastKey) return s;
      lastKey = key;

      show(user, s.sent);
      show(row, s.lyra);
      show(dots, s.thinking);
      s.steps.forEach((st, i) => {
        show(stepEls[i], st > 0);
        stepEls[i].classList.toggle("done", st === 2);
      });
      show(stepBox, c.steps.length > 0 && s.steps[0] > 0);
      answer.innerHTML = richHtml(c.a, c.aSpans, s.answer);
      show(answer, s.answer > 0);
      show(chipBox, s.chips > 0);
      chipEls.forEach((n, i) => show(n, i < s.chips));

      if (wrap) {
        const k = s.confirm, nSteps = stepRows.length;
        const scanning = k >= SCAN_FROM && k < RUN_FROM;
        const running = k >= RUN_FROM && k < 1;
        const done = k >= 1;
        // steps checked in order while it runs
        const checked = done ? nSteps : running ? Math.floor(((k - RUN_FROM) / (1 - RUN_FROM)) * (nSteps + 1)) : 0;
        show(wrap, s.planSteps > 0);
        stepRows.forEach((r, i) => {
          show(r, i < s.planSteps);
          r.classList.toggle("ok", i < checked);
          r.classList.toggle("active", running && i === checked);
        });
        show(scan, scanning);
        planBox.classList.toggle("grouped", running || done);
        wrap.classList.toggle("done", done);
        planTitle.textContent = done ? (nSteps > 1 ? `Done, ${nSteps} steps` : "Done") : running ? "Running…" : planTitle.dataset.ready;
        show(details, s.confirmShown);
        show(confirmBtn, s.confirmShown);
        show(note, s.confirmShown);
        confirmBtn.classList.toggle("busy", scanning || running);
        confirmBtn.classList.toggle("done", done);
        confirmLabel.textContent = done ? "Done ✓" : running ? "Confirming…" : scanning ? "Reading your fingerprint…" : "Confirm with Touch ID";
      }
      if (mock) { show(mock, s.visualShown); mock.style.setProperty("--p", ease(s.visual).toFixed(3)); }
      if (agent) { show(agent, s.afterShown); agentLine.innerHTML = richHtml(c.after, c.afterSpans, s.after); }
      return s;
    },
  };
}

export function createChat({ devices, pages }) {
  const chat = $("#chat"), typed = $("#typed"), input = $("#input");
  const EMPTY = chat.innerHTML;
  const views = CH.map((_, i) => createView(i, chat));
  let current = -1, lastTyped = 0, lastCount = 0;

  chat.innerHTML = EMPTY;

  /* chapter: 0 = closed, 1..N = chat, TOTAL = menu. t: progress inside the chapter (0..1). */
  function update(chapter, t, moving) {
    pages.setVisible(chapter === TOTAL);

    if (chapter !== current) {
      current = chapter;
      views.forEach((v, i) => (i < Math.min(chapter, N) ? v.attach() : v.detach()));
      typed.textContent = ""; input.classList.remove("has");
      devices.setTyping(false);
    }

    /* completed chapters sit at their final state, the current one follows the scroll */
    for (let i = 0; i < Math.min(chapter, N); i++) {
      const done = i < chapter - 1 || chapter === TOTAL;
      views[i].update(done ? plans[i].total : t * plans[i].total);
    }
    if (chapter < 1 || chapter > N) { devices.setTyping(false); return; }

    const s = stateAt(plans[chapter - 1], t * plans[chapter - 1].total);
    typed.innerHTML = s.typed ? richHtml(CH[chapter - 1].q, CH[chapter - 1].qSpans, s.typed) : "";
    input.classList.toggle("has", s.typed > 0);
    devices.setTyping(s.typing && moving);
    if (s.typing && s.typed !== lastTyped && moving) devices.keyPress();
    lastTyped = s.typed;
  }

  return { update, get current() { return current; } };
}
