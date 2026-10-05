# Lyra wallet, browser extension (testnet, step 1)

The testnet wallet (2D + 3D) packaged as a Chrome / Edge / Brave extension (Manifest V3).
Clicking the toolbar icon opens the wallet as a floating card on the current page, which leans
toward the mouse in 3D; clicking again (or the card's ×) closes it. Nothing is injected into any
page until the icon is clicked (`activeTab`). On pages Chrome keeps extensions off (`chrome://`,
the Web Store, the new tab page) the wallet opens in the side panel instead. Test coins only.

How the card works: `public/background.js` injects `public/overlay.js` into the clicked tab. The
overlay draws the frame in a closed shadow root and loads the wallet (`index.html`, the only
web-accessible file) in an iframe, so the page can't read or script the wallet. The card and the
side panel share the same storage (same wallet).
The backend is not bundled: the extension calls `VITE_API_URL` (see `.env.example`).

## Build
    npm install
    npm run build        # -> dist/  (this folder IS the extension)
    npm run check        # static checks: manifest, files, no inline script, no eval

## See how it renders BEFORE publishing anything

1. Quick look with the real extension security policy, in any browser tab:

       npm run serve:ext
       http://localhost:5195/_panel?w=400     (panel 400px wide, try 320 / 400 / 520 / 700)

   Chrome's side panel is resizable by the user, so check a few widths. Any red error in the
   console here (eval, inline script, blocked remote script) would also break the real extension.

2. The real thing, still private, nothing is uploaded anywhere:
   - Chrome: open `chrome://extensions`, switch on "Developer mode" (top right).
   - Click "Load unpacked" and pick the `dist` folder.
   - Pin the Lyra icon (puzzle piece menu), open any website and click it: the floating card
     appears. On a chrome:// page it opens in the side panel instead.
   - After a code change: `npm run build`, then the refresh arrow on the extension's card.
   - "Inspect views: service worker" / right-click the panel > Inspect shows the console.

3. Only when you are happy: zip the CONTENT of `dist` for the Chrome Web Store.

## Known limits of step 1
- Backend: the testnet backend runs on your PC (port 3002). Deploy it (Render) and rebuild with its
  URL in `.env` before sharing the extension with anyone.
- `host_permissions` is wide (`https://*/*`) for development. Narrow it to the exact hosts
  (RPCs, backend, price/explorer APIs) before the store review.
- Keys stay in the extension page's localStorage for now. Moving them to `chrome.storage.local`
  is a follow-up.
- No `window.ethereum` for websites (step 2).
- Passkey / biometric unlock is tied to the page origin (`chrome-extension://<id>`): untested here.
