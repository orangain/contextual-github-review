chrome.runtime.onInstalled.addListener(() => {
  console.log('Contextual GitHub Review extension installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'fetch_blame_data': {
      const { args } = request;
      console.log('Received fetch_blame_data request with args:', args);
      chrome.storage.local.get(['github_token'], async (result) => {
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

/**
 * @typedef {Object} BlameAuthor
 * @property {string} name - Author name
 */

/**
 * @typedef {Object} BlameCommit
 * @property {string} oid - Commit SHA
 * @property {string} messageHeadline - Commit message headline
 * @property {string} messageBody - Commit message body
 * @property {string} commitUrl - URL to the commit
 * @property {string} committedDate - Commit date
 * @property {BlameAuthor} author - Commit author
 */

/**
 * @typedef {Object} BlameRange
 * @property {number} startingLine - Starting line number
 * @property {number} endingLine - Ending line number
 * @property {number} age - Age of the blame range
 * @property {BlameCommit} commit - Commit information
 */

/**
 * @typedef {Object} BlameData
 * @property {BlameRange[]} ranges - Array of blame ranges
 */

/**
 * Fetches blame data from GitHub GraphQL API
 * @param {Object} args - Parameters for the blame query
 * @param {string} args.owner - Repository owner
 * @param {string} args.repo - Repository name
 * @param {string} args.commitRef - Commit reference/SHA
 * @param {string} args.fileName - File path to get blame for
 * @param {string} token - GitHub Personal Access Token
 * @returns {Promise<BlameData>} Promise resolving to blame data with ranges array
 */
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