/*
 * Chapter plans (timelines). A chapter is a sequence of stages laid on a virtual timeline (milliseconds).
 * The scroll maps linearly onto that timeline, so the conversation is a pure function of the scroll:
 * scroll down = it types on, scroll up = it un-types. Nothing here touches the DOM.
 */
import { clamp } from "./util.js";

/* speeds, in virtual ms */
const TYPE_CHAR = 38, ANSWER_CHAR = 13, PUNCT = 110, SEND = 260, THINK = 380;
const STEP = 460, CHIP = 90, PLAN_STEP = 260, CONFIRM_PAUSE = 320, CONFIRM = 2400, AFTER_PAUSE = 260, DWELL = 700, VISUAL = 1800;

const punct = (s) => (s.match(/[.,]/g) || []).length;

/* Build the marks (cumulative times) of one chapter. */
export function planOf(c, lead = 0) {
  let t = lead;   // lead-in: nothing happens before the hands are in place
  const mark = (ms) => (t += ms);
  const plan = { c };
  plan.typeStart = t;
  plan.typeEnd = mark(c.q.length * TYPE_CHAR);
  plan.sendEnd = mark(SEND);
  plan.thinkEnd = mark(THINK);
  plan.steps = c.steps.map(() => { const s = t; mark(STEP); return s; });
  plan.stepsEnd = t;
  plan.answerStart = t;
  plan.answerEnd = mark(c.a.length * ANSWER_CHAR + punct(c.a) * PUNCT);
  plan.chipsStart = t;
  const nChips = (c.nets ? 6 : 0) + (c.chips ? c.chips.length : 0);
  plan.chipsEnd = mark(nChips * CHIP);
  // the plan card: its steps land one by one, then the confirmation plays
  // (fingerprint scan, steps checked in order, "Done")
  const nPlan = c.plan ? c.plan.steps.length : 0;
  plan.planStart = t;
  plan.planEnd = mark(nPlan * PLAN_STEP);
  if (c.plan) { mark(CONFIRM_PAUSE); plan.confirmStart = t; plan.confirmEnd = mark(CONFIRM); }
  if (c.visual) { mark(200); plan.visualStart = t; plan.visualEnd = mark(VISUAL); }
  if (c.after) { mark(AFTER_PAUSE); plan.afterStart = t; plan.afterEnd = mark(c.after.length * ANSWER_CHAR + punct(c.after) * PUNCT); }
  plan.total = mark(DWELL);
  return plan;
}

const upTo = (s, from, to, tau) => Math.floor(clamp((tau - from) / (to - from)) * s.length);

/* Everything the chat must show at virtual time tau. */
export function stateAt(plan, tau) {
  const c = plan.c;
  const sent = tau >= plan.typeEnd + 120;
  const s = {
    typed: sent ? 0 : upTo(c.q, plan.typeStart, plan.typeEnd, tau),
    typing: tau >= plan.typeStart && tau < plan.typeEnd,
    sent,
    thinking: tau >= plan.sendEnd && tau < plan.thinkEnd,
    lyra: tau >= plan.sendEnd,
    steps: plan.steps.map((st) => (tau < st ? 0 : tau < st + 300 ? 1 : 2)),   // 0 hidden, 1 spinner, 2 done
    answer: tau < plan.answerStart ? 0 : upTo(c.a, plan.answerStart, plan.answerEnd, tau),
    chips: nOf(plan.chipsStart, plan.chipsEnd, (c.nets ? 6 : 0) + (c.chips ? c.chips.length : 0), tau),
    planSteps: c.plan ? nOf(plan.planStart, plan.planEnd, c.plan.steps.length, tau) : 0,
    confirm: c.plan ? clamp((tau - plan.confirmStart) / (plan.confirmEnd - plan.confirmStart)) : 0,
    confirmShown: c.plan ? tau >= plan.planEnd : false,
    visual: c.visual ? clamp((tau - plan.visualStart) / (plan.visualEnd - plan.visualStart)) : 0,
    visualShown: c.visual ? tau >= plan.visualStart : false,
    after: c.after ? (tau < plan.afterStart ? 0 : upTo(c.after, plan.afterStart, plan.afterEnd, tau)) : 0,
    afterShown: c.after ? tau >= plan.afterStart : false,
  };
  return s;
}

function nOf(from, to, count, tau) {
  if (!count || tau < from) return 0;
  return Math.min(count, Math.floor(((tau - from) / Math.max(1, to - from)) * count) + 1);
}
