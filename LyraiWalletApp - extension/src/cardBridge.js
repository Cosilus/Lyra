// When the wallet runs inside the floating card (public/overlay.js), the card
// tilts with the mouse while the mouse is over the wallet. The page around it
// gets no mouse events then (they go to this frame), so this frame reports the
// pointer position to the overlay.
//
// The report goes over a private MessageChannel, never a plain postMessage to
// the parent (the website would see every message). The overlay puts a random
// key in this frame's URL (?card=...) and hands over the channel with that key;
// the website can't read our URL, so it can't impersonate the overlay. The
// overlay uses the same channel to say when the mouse has left the card.
export function startCardBridge() {
  const key = new URLSearchParams(window.location.search).get("card");
  if (!key || window.parent === window) return;

  let port = null;
  let raf = 0;
  let pending = null;

  function flush() {
    raf = 0;
    if (port && pending) port.postMessage(pending);
    pending = null;
  }

  function send(msg) {
    pending = msg;
    if (!raf) raf = requestAnimationFrame(flush);
  }

  function onMove(e) {
    // -1..1 across this frame, 0 in the middle.
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    send({ nx, ny });
  }

  function onLeave() {
    send({ leave: true });
  }

  window.addEventListener("message", function onHandshake(e) {
    if (e.source !== window.parent || e.data?.type !== "lyra-card-port" || e.data.key !== key || !e.ports?.[0]) return;
    window.removeEventListener("message", onHandshake);
    port = e.ports[0];
    // The overlay tells us when the mouse is back on the page (Chrome doesn't
    // reliably fire a leave event in this frame): pass it on to the 3D view.
    port.onmessage = (m) => {
      if (m.data?.type === "pointer-left") window.dispatchEvent(new Event("lyra-pointer-left"));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
  });
}
