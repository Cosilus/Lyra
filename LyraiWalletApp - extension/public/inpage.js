// Lyra's dApp connector, injected into every website (MAIN world, see
// manifest.json). It only announces "a Lyra wallet is installed" (EIP-6963,
// and window.ethereum if no other wallet took it) and passes requests on to
// the extension through contentBridge.js. It holds no keys and approves
// nothing: connecting, signing and sending all open Lyra's own approval
// window, where the request is translated into plain language.
(() => {
  if (window.lyraEthereum) return;

  const ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAGUUlEQVR4AdRYa4hUZRh+3rMzs9Ps7G7tbmtXukJBUJrd7xcLsiAouwj9yTAsKCEI6k9qf4qosCKUAqOCbkrhj5RIk0oIrU2NAgPJH6F52TV3nRl3Z2bn63m+s7O77TZa+R3Rw/fMec93ed7nPd/3fuecidDgyOVOntbSPGV+S3bKsnxzd08+2+2OKugz9n3yk9LSQCYmBTAFU1oodElUsx4zt9jgHobh0kYEidXTZ+zbXpOW/Andb0rbRH9/C6Clufv2Utb9wk7zCCOOlcJY8Hgh637OZ0+5abyo0QBaT+i+xgxfOOCs8R2OxI6iCMKRcIwfyzt6NlBbR63X1ut9AJoa5/BevTLEuVarIZPJeMgOwVnnoNZ3pVnXPoBi1r3Ci/OIIMWMM04v6XQagqNtxvsXhN2TnDeiGVFb2xkdrJpLBC0SnUlzBgjZQcljsrmtrad1Ra5avoHXfiZ4DlYkOp3hDBCygxGPEUUYrl4XcaleNVYXznKOOcC7r1mQHY55jEnaI4MlEkCt5vz6Vw7IHnMbzpJ2Lh03NRxlzGTGJAYD4C6UzmRoOZhZ3Bj0101lAGgPyjlC5uCQSac9ZI9Uhz61K4DQpJ5PotPMAUG2r0zgJ+EAuAtxFo7LAKAllOESImQncPM9ZSIzYDCSM4lHlpACMF/H6sAlkQBirQogxa00RckOcR2CH8kE4GXW0HFSJzo6OnlVI5IpiQRgZlRbxfRLp2P6tOneNlMdzcAleABmhmq1ipbmLtxy860eslVnFj6IoAEYF3qGiVsY3IN5jz6G888/xUO26tSmPiEnoWEAZnQ1DlEUf13pC6uOpqgJTU0xUikmqwF9A79j5m2z8PzCRSgU4LFowSLcMWOWb2OMUN/6OHHU+cafzQxmY2gUdDSxwfHjo8bXvGq1gnK5jKGhIQwODqJUKqJQKuBA6QAGSgNEP/pLf6K/uI/oxf7CH77/E/OewccfLOenJOD4RiowRnzy4XKoTZzq21/s5TiOJcdAqZ98A55bPuRLPuVb/aVFmhy1TdQ7KQC9PebzeXR2dOH0007HOeeciwsvuBCXXDwVV1x2Ja6/+gbMuHEG7phxJ+6eeQ9m3f0g5jw0D4tfehubvt+C1199gXcOKFdqPEcesQ3fpj7qqzEaKw5xifN6cl9JH/Iln/ItDZ2dXZAmaTtsABM7/KtrA4Vi9OCuP2r/k8GVAXAMAhzRRI5KpcJ1W0Dfvl7s2LkD27f/hq2/bsWWnzZj4w8b8O1332DN12uwes3nWLnqU6xY+RGWvb8U85+ei2mXX4Inn3rWa0unotElFNvwbeqjvhqjseIQlzjFvYE+5Es+5Vsa+vp6vSZpm6h3UgBmxvUbMdHS/h+F5uZmZLNZ5HItyOfyaM21oi3XRrSjPXcS2ls6iC6cmD/V939j6Yu4f/b9FA+YRTCCKYUHZt8HtWX4faC+7S1dHMex5GjLtZOvzXPLh3zJp3yrfyqVhhLcbPK0RWhwKGHGQ0k0EcO1YQwPx9A+z/c3dLSdiVVfLsdzCxdw3cJjwaIFWLVmhW9TH/WtjxPHRF5dOybseDSQiYYBNBpwqHq9NlcqZfCvSSx9awm2bdvlIVt1alOfQ3H817agAci57loqlUJxqBdfrVvrIVt1alOfkAgegMTFQlPo+bEHPZt6WJViThxub2K3/1ESCSDWEWHfvj4PhF2pMf3IbzIB+JttqPClrlKp0pXxscxTAiWRAOJEZQBMaCUuYNx8fFQIfSQSQCzSUC5XPMAAkNCRWABG0RU+1QXZCelPLrskujKyhGQflwGUOQNCogEwtTaEvjt6Dkh0hd8TgmzVBfcDbOC/09iMBI6IzJWRGZCdgAtmGTbznReJBGAWoVzPAdpI4nAMgHcnoQAMFW6jgpklIR/SHg0c3L2R7GuJcIVMZuZnQLNglkQAbp206zlQc03uIT4q99NvkKKENTMoBwQzPokdt4sg7J5kt2uy2bRqCgDF4t5dFmEOK4IVfUGVuQsJsoMRAzUgml0s7tktTh+AjAMH93xWc24m7Z1EkKIvKyEIWUyykxrvKgzuWhdfMpS6oXNpaO/qVLZ8kYMt0/WxBGp6R9qkcbyu0RmoV+7nURzc/Qjz4lQY7jWHl9m2nhgkjlaRr/XeNzVICzXNobRJefoXAAAA//84buJpAAAABklEQVQDAAXL7a+x/9ElAAAAAElFTkSuQmCC";
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  let chainId = null;
  let accounts = [];

  function emit(event, value) {
    for (const fn of listeners.get(event) || []) {
      try { fn(value); } catch (e) { console.error(e); }
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const msg = e.data;
    if (!msg || msg.target !== "lyra-inpage") return;
    if (msg.event) {
      if (msg.event === "chainChanged") chainId = msg.value;
      if (msg.event === "accountsChanged") accounts = msg.value || [];
      emit(msg.event, msg.value);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) {
      const err = new Error(msg.error.message || "Request failed");
      err.code = msg.error.code ?? -32603;
      if (msg.error.data !== undefined) err.data = msg.error.data;
      p.reject(err);
    } else {
      if (p.method === "eth_chainId") chainId = msg.result;
      if (p.method === "eth_accounts" || p.method === "eth_requestAccounts") accounts = msg.result || [];
      p.resolve(msg.result);
    }
  });

  function request(args) {
    if (!args || typeof args !== "object" || typeof args.method !== "string") {
      return Promise.reject(Object.assign(new Error("Invalid request"), { code: -32600 }));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method: args.method });
      window.postMessage({ target: "lyra-content", id, method: args.method, params: args.params ?? [] }, location.origin);
    });
  }

  const provider = {
    isLyra: true,
    isMetaMask: false,
    request,
    isConnected: () => true,
    get chainId() { return chainId; },
    get selectedAddress() { return accounts[0] || null; },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return provider;
    },
    removeListener(event, fn) {
      listeners.get(event)?.delete(fn);
      return provider;
    },
    // Legacy entry points some older dApps still call.
    enable: () => request({ method: "eth_requestAccounts" }),
    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === "string") return request({ method: methodOrPayload, params: paramsOrCallback });
      return provider.sendAsync(methodOrPayload, paramsOrCallback);
    },
    sendAsync(payload, callback) {
      request(payload).then(
        (result) => callback(null, { id: payload.id, jsonrpc: "2.0", result }),
        (error) => callback(error, { id: payload.id, jsonrpc: "2.0", error })
      );
    },
  };
  provider.addListener = provider.on;
  provider.off = provider.removeListener;
  Object.freeze(provider);

  Object.defineProperty(window, "lyraEthereum", { value: provider, configurable: false });
  // Don't take window.ethereum away from another wallet: dApps that support
  // EIP-6963 list Lyra next to it anyway.
  if (!window.ethereum) {
    try {
      Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
    } catch {
      // another script locked it
    }
  }

  // EIP-6963: multi-wallet discovery.
  const info = Object.freeze({
    uuid: crypto.randomUUID(),
    name: "Lyra",
    icon: ICON,
    rdns: "to.lyra.wallet",
  });
  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
