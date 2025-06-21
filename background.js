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
  switch (request.action) {
    case 'get_github_token': {
      chrome.storage.sync.get(['github_token'], (result) => {
        sendResponse({ token: result.github_token });
      });
      return true;
    }
    case 'fetch_blame_data': {
      const { args } = request;
      console.log('Received fetch_blame_data request with args:', args);
      chrome.storage.sync.get(['github_token'], async (result) => {
        const token = result.github_token;
        if (!token) {
          sendResponse({ error: 'GitHub token not found' });
          return;
        }
        try {
          console.log('Fetching blame data with args:', args);
          const data = await fetchBlameData(args, token);
          console.log('Blame data fetched:', data);
          sendResponse({ data });
        } catch (error) {
          console.error('Error fetching blame data:', error);
          sendResponse({ error: 'Failed to fetch blame data' });
        }
      });
      return true; // Indicates that the response will be sent asynchronously
    }
  }
});

async function fetchBlameData(args, token) {
  // See: https://docs.github.com/ja/graphql/reference/objects#blame
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`, // GitHub API トークンを使用
    },
    body: JSON.stringify({
      query: `{
          repositoryOwner(login: "${args.owner}") {
            repository(name: "${args.repo}") {
              object(expression: "${args.commitRef}") {
                ... on Commit {
                  blame(path: "${args.fileName}") {
                    ranges {
                      startingLine
                      endingLine
                      age
                      commit {
                        oid
                        messageHeadline
                        messageBody
                        commitUrl
                        committedDate
                        author {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`
    }),
  })
  const json = await res.json();
  console.log('Fetched blame info:', json);
  return json.data.repositoryOwner.repository.object.blame;
}