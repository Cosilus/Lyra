/*
 * The conversation inside the app screen, driven directly by the scroll.
 * Each chapter is a "view": its DOM is built once, then update(tau) shows exactly the state that
 * belongs to that virtual time (see chapters.js). Scrolling back simply un-shows things.
 * Talks to the active device only through keyPress() / setTyping().
 */
import { $, el } from "./util.js";
import { CH, N, NET, TOTAL } from "./story.js";
import { stateAt } from "./chapters.js";
import { plans } from "./timeline.js";
import { richHtml } from "./terms.js";

const AVATAR = '<div class="avatar"><img src="logo.svg" alt=""></div>';

function drawHold(canvas, pct) {
  const w = Math.round((canvas.clientWidth || 400) * 3), h = Math.round((canvas.clientHeight || 60) * 3);
  if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (pct <= 0) return;
  ctx.fillStyle = "#A78BFA";
  if (pct >= 1) { ctx.fillRect(0, 0, w, h); return; }
  const s = 30, cols = Math.ceil(w / s), rows = Math.ceil(h / s);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const dx = Math.abs(i + 0.5 - cols / 2) / (cols / 2), dy = Math.abs(j + 0.5 - rows / 2) / (rows / 2);
    if (dx * 0.86 + dy * 0.14 <= pct) ctx.fillRect(i * s, j * s, s + 0.6, s + 0.6);
  }
}

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

  let wrap = null, ticketEls = [], hold = null, note = null, holdCanvas = null, holdLabel = null;
  if (c.tickets) {
    wrap = el("div", "tk-wrap");
    ticketEls = c.tickets.map((tk) => el("div", "ticket",
      `<div class="tk-title">${tk.title}</div>` + tk.rows.map((r) => `<div class="tk-row"><span>${r[0]}</span><strong${r[2] ? ` class="${r[2]}"` : ""}>${r[1]}</strong></div>`).join("")));
    hold = el("div", "hold", "<canvas></canvas><span>Hold to Confirm</span>");
    holdCanvas = hold.firstChild; holdLabel = hold.lastChild;
    note = el("div", "tk-note", c.note);
    wrap.append(...ticketEls, hold, note);
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
        show(wrap, s.tickets > 0);
        ticketEls.forEach((n, i) => show(n, i < s.tickets));
        show(hold, s.holdShown);
        show(note, s.holdShown);
        drawHold(holdCanvas, s.hold);
        hold.classList.toggle("cover", s.hold > 0.45);
        hold.classList.toggle("done", s.hold >= 1);
        holdLabel.textContent = s.hold >= 1 ? "Confirmed ✓" : "Hold to Confirm";
      }
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
