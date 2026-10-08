// Opened by the wallet when the side panel can't ask for the microphone
// itself: asks once here, in a normal tab, for the whole extension. Nothing
// is recorded, the stream is stopped right away.
const box = document.getElementById("box");

function show(cls, title, text) {
  box.className = cls;
  box.innerHTML = "";
  const h = document.createElement("h1");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  box.append(h, p);
}

navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((t) => t.stop());
    show("ok", "Microphone allowed", "You can close this tab and press the microphone button in Lyra again.");
    setTimeout(() => window.close(), 2500);
  })
  .catch(() => {
    show("no", "Microphone blocked", "Click the icon at the right of the address bar, allow the microphone for Lyra, then reload this page.");
  });
