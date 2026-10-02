// Clicking the toolbar icon opens the wallet in the browser's side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error("Lyra: couldn't set the side panel behavior", e));
});
