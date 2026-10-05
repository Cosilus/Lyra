// Clicking the toolbar icon opens the wallet as a floating card on the current
// page (overlay.js); clicking again closes it. Nothing is injected anywhere
// until the icon is clicked: "activeTab" only grants the tab that was clicked.
//
// Pages Chrome never lets extensions draw on (chrome://, the Web Store, the
// new tab page...) get the wallet in the side panel instead.
const CAN_INJECT = /^(https?|file):/;
const BLOCKED_HOSTS = ["chrome.google.com", "chromewebstore.google.com", "microsoftedge.microsoft.com"];

function canInject(url) {
  if (!url || !CAN_INJECT.test(url)) return false;
  try {
    return !BLOCKED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// The icon click is handled below instead of opening the side panel. Chrome
// stores this setting, and an earlier build of Lyra set it to true (icon opens
// the panel), which would swallow the click: reset it every time the service
// worker starts, not only on install.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((e) => console.error("Lyra: couldn't set the side panel behavior", e));

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;

  if (!canInject(tab.url)) {
    // Must stay synchronous: Chrome only opens the panel in direct response to the click.
    chrome.sidePanel.open({ tabId: tab.id }).catch((e) => console.error("Lyra: couldn't open the side panel", e));
    return;
  }

  chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ["overlay.js"] })
    .catch((e) => console.error("Lyra: couldn't show the wallet on this page", e));
});
