document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('github-token');
  const saveButton = document.getElementById('save-token');
  const statusDiv = document.getElementById('status');

  // Save token
  saveButton.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showStatus('Please enter a valid GitHub token.', 'error');
      return;
    }

    chrome.storage.sync.set({ github_token: token }, () => {
      showStatus('Settings saved successfully!', 'success');
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