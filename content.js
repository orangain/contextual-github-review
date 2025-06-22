class GitHubBlameViewer {
  constructor() {
    this.cache = new Map();
    this.init();
  }

  init() {
    console.log('GitHub Blame Viewer initialized');
    this.setupObserver();
    this.processTree(document);
  }

  setupObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            console.log('New node added:', node);
            this.processTree(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  processTree(rootElement) {
    const repoInfo = this.extractRepoInfo();
    const fileContainers = rootElement.querySelectorAll('.file');
    console.log('Found file containers:', fileContainers.length);
    fileContainers.forEach(container => this.processFileContainer(repoInfo, container));
  }

  /**
   * Processes a file container to extract commit reference and file name,
   * @param {RepoInfo} repoInfo - Information about the repository
   * @param {Node} container - The file container element to process
   * @returns {Promise<void>}
   */
  async processFileContainer(repoInfo, container) {
    console.log('Processing file container:', container);
    const commitRefAndFileName = this.extractCommitRefAndFileName(repoInfo, container);
    console.log('Extracted file name and commit ref:', commitRefAndFileName);

    if (commitRefAndFileName === null) {
      console.warn('Could not extract commit ref and file name from blob link');
      return;
    }
    const fileInfo = {
      ...repoInfo,
      ...commitRefAndFileName,
    }

    const diffTable = container.querySelector('.diff-table');
    if (!diffTable) {
      console.warn('No diff table found in container:', container);
      return;
    }

    const colGroup = diffTable.querySelector('colgroup');
    if (!colGroup) {
      console.warn('No colgroup found in diff table:', diffTable);
      return;
    }
    const cols = colGroup.querySelectorAll('col');
    if (cols.length === 4) {
      const blameCol = document.createElement('col');
      blameCol.setAttribute('width', '170');
      colGroup.appendChild(blameCol); // Add a new column for blame info
    }

    const codeHunks = diffTable.querySelectorAll('td.blob-code-hunk');
    console.log('Found code hunks:', codeHunks.length);
    codeHunks.forEach(hunk => {
      if (hunk.colSpan === 3) {
        hunk.colSpan = 4; // Adjust colspan to account for blame column
      }
    });

    const addedRows = Array.from(diffTable.querySelectorAll('tr'))
      .map(row => ({ row, lineNumber: this.extractLineNumberOfAddition(row) }))
      .filter(({ lineNumber }) => lineNumber !== null && !isNaN(lineNumber))
    console.log('Found added rows:', addedRows.length);
    if (addedRows.length === 0) {
      return;
    }

    console.log('Fetching blame data for:', fileInfo);
    const blameData = await this.fetchBlameDataWithCache(fileInfo);
    console.log('Fetched blame data:', blameData);

    const groupedAddedRows = this.groupAddedRowsByBlame(addedRows, blameData);
    console.log('Grouped added rows by blame:', groupedAddedRows.length);
    groupedAddedRows.forEach(group => {
      const row = group[0].row; // Use the first row in the group to add the blame area
      const lineBlame = group[0].lineBlame; // Use the blame info from the first row

      const blameArea = this.createBlameAreaElement(group.length);

      const blameInfoElement = this.createBlameInfoElement(lineBlame);
      blameArea.appendChild(blameInfoElement);

      this.addBlameArea(row, blameArea);
    });
  }

  extractCommitRefAndFileName(repoInfo, container) {
    const blobLinks = container.querySelectorAll('.dropdown a[href*="/blob/"]');
    const blobLinkHrefs = Array.from(blobLinks).map(link => link.getAttribute('href'));
    const regex = RegExp(`^/${repoInfo.owner}/${repoInfo.repo}/blob/([0-9a-f]{40})/(.*)$`);
    const blobLinkMatches = blobLinkHrefs.map(href => regex.exec(href)).filter(match => match !== null);
    const blobLinkMatch = blobLinkMatches.length > 0 ? blobLinkMatches[0] : null;

    if (!blobLinkMatch) {
      return null;
    }
    const commitRef = blobLinkMatch[1]; // Assuming the first capturing group is the commit ref
    const fileName = blobLinkMatch[2]; // Assuming the second capturing group is the file name
    return { commitRef, fileName };
  }

  /**
   * Groups added rows by their blame information.
   * @param {Array<{row: Node, lineNumber: number}>} addedRows - Array of added rows with their line numbers
   * @param {BlameData} blameData - Blame data containing ranges and commits
   * @returns {Array<Array<{row: Node, lineNumber: number, lineBlame: LineBlame}>>}
   */
  groupAddedRowsByBlame(addedRows, blameData) {
    const groups = [];
    let lastCommitUrl = null;
    let lastLineNumber = null;
    addedRows.forEach(({ row, lineNumber }) => {
      const lineBlame = this.findBlameForLine(blameData, lineNumber);
      if (lineBlame) {
        if (lastCommitUrl === null || lastCommitUrl !== lineBlame.commitUrl || lastLineNumber !== lineNumber - 1) {
          groups.push([]);
        }
        const lastGroup = groups[groups.length - 1];
        lastGroup.push({ row, lineNumber, lineBlame });
      }
      lastCommitUrl = lineBlame?.commitUrl;
      lastLineNumber = lineNumber;
    });
    return groups;
  }

  extractLineNumberOfAddition(row) {
    const lineNumElement = row.querySelector('.blob-num-addition.js-linkable-line-number[data-line-number]');
    if (lineNumElement) {
      const lineNumber = parseInt(lineNumElement.getAttribute('data-line-number'), 10);
      return lineNumber;
    }
    return null;
  }

  /**
   * @typedef {Object} FileInfo
   * @property {string} owner - Repository owner
   * @property {string} repo - Repository name
   * @property {string} commitRef - Commit reference (SHA)
   * @property {string} fileName - Name of the file
   */

  /**
   * Fetches blame data with caching mechanism
   * @param {FileInfo} fileInfo - Information about the file to get blame for
   * @returns {Promise<BlameData>} Promise resolving to blame data with ranges array
   */
  async fetchBlameDataWithCache(fileInfo) {
    const cacheKey = `${fileInfo.owner}/${fileInfo.repo}/${fileInfo.commitRef}/${fileInfo.fileName}`;
    if (this.cache.has(cacheKey)) {
      console.log('Cache hit for:', cacheKey);
      return this.cache.get(cacheKey);
    }

    console.log('Cache miss for:', cacheKey);
    const data = await this.fetchBlameData(fileInfo);
    this.cache.set(cacheKey, data);
    return data;
  }

  /**
   * Fetches blame data from the background script
   * @param {FileInfo} fileInfo - Information about the file to get blame for
   * @returns {Promise<BlameData>} Promise resolving to blame data with ranges array
   */
  async fetchBlameData(fileInfo) {
    const response = await chrome.runtime.sendMessage({
      action: 'fetch_blame_data',
      args: fileInfo,
    })

    if (response.error || !response.data) {
      console.error('Error fetching blame data:', response.error);
      throw new Error(response.error);
    }

    return response.data;
  }

  /**
   * @typedef {Object} RepoInfo
   * @property {string} owner - Repository owner
   * @property {string} repo - Repository name
   */
  /**
   * Extracts repository information from the current URL
   * @returns {RepoInfo | null}
   */
  extractRepoInfo() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length < 4) return null;

    return {
      owner: pathParts[1],
      repo: pathParts[2],
    };
  }

  /**
   * @typedef {Object} LineBlame
   * @property {string} author - Commit author
   * @property {string} messageHeadline - Commit message headline
   * @property {string} messageBody - Commit message body
   * @property {string} committedDate - Commit date
   * @property {string} commitUrl - URL to the commit
   */

  /**
   * Finds the blame information for a specific line in the blame data.
   * @param {BlameData} blameData - The blame data containing ranges and commits.
   * @param {number} targetLine - The line number to find blame for.
   * @returns {LineBlame | null}
   */
  findBlameForLine(blameData, targetLine) {
    const targetRanges = blameData.ranges.filter(r => r.startingLine <= targetLine && r.endingLine >= targetLine);
    if (targetRanges.length === 0) return null;
    if (targetRanges.length > 1) {
      console.warn('Multiple blame ranges found for line:', targetLine, targetRanges);
    }
    const range = targetRanges[0];

    return {
      author: range.commit.author.name,
      messageHeadline: range.commit.messageHeadline,
      messageBody: range.commit.messageBody,
      committedDate: range.commit.committedDate,
      commitUrl: range.commit.commitUrl,
    };
  }

  createBlameAreaElement(rowSpan) {
    const blameArea = document.createElement('td');
    blameArea.className = 'blame-area';
    blameArea.setAttribute('rowspan', rowSpan);
    return blameArea;
  }

  createBlameInfoElement(blameInfo) {
    const blameInfoElement = document.createElement('div');
    blameInfoElement.className = 'blame-info';

    let title = `${blameInfo.messageHeadline}\nAuthor: ${blameInfo.author}\nDate: ${blameInfo.committedDate}`;
    if (blameInfo.messageBody !== '') {
      title += `\n\n${blameInfo.messageBody}`;
    }
    const commitLink = document.createElement('a');
    commitLink.href = blameInfo.commitUrl;
    commitLink.target = '_blank';
    commitLink.title = title;
    commitLink.textContent = blameInfo.messageHeadline;
    blameInfoElement.appendChild(commitLink);

    return blameInfoElement
  }

  addBlameArea(row, blameArea) {
    row.appendChild(blameArea);
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GitHubBlameViewer());
} else {
  new GitHubBlameViewer();
}