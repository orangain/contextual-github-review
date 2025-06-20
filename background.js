chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub PR Blame Viewer extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('github.com') && tab.url.includes('/pull/')) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle_blame_display' });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_github_token') {
    chrome.storage.sync.get(['github_token'], (result) => {
      sendResponse({ token: result.github_token });
    });
    return true;
  }
});