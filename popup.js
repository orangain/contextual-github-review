document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('github-token');
  const saveButton = document.getElementById('save-token');
  const statusDiv = document.getElementById('status');

  // Load saved token
  chrome.storage.sync.get(['github_token'], (result) => {
    if (result.github_token) {
      tokenInput.value = result.github_token;
    }
  });

  // Save token
  saveButton.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    
    chrome.storage.sync.set({ github_token: token }, () => {
      showStatus('Settings saved successfully!', 'success');
      
      // Notify content script about token update
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url.includes('github.com')) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'token_updated',
            token: token 
          });
        }
      });
    });
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
});