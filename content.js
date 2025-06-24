const viewFileLinkRegExp = RegExp(`^/([^/]+)/([^/]+)/blob/([0-9a-f]{40})/(.*)$`);
const pullRequestDiffPageRegExp = RegExp(`^(/[^/]+/[^/]+/pull/\\d+)/files($|/)`);

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
      console.log('DOM mutations detected:', mutations.length);
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          // console.log('Added node:', node);
          if (node.nodeType === Node.ELEMENT_NODE) {
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
    const match = window.location.pathname.match(pullRequestDiffPageRegExp);
    if (!match) {
      return; // Not a pull request diff page
    }
    const pullRequestPath = match[1];
    this.showConversationButton(rootElement, pullRequestPath);

    const fileContainers = rootElement.querySelectorAll('.file');
    console.log('Found file containers:', fileContainers.length);
    if (fileContainers.length === 0) {
      const diffTable = rootElement.querySelector('.diff-table');
      if (diffTable !== null) {
        // Assume that hidden diff table is loaded.
        const fileElement = diffTable.closest('.file');
        if (fileElement !== null) {
          console.log('Found diff table without file container, using it:', fileElement);
          this.processFileContainer(fileElement);
          return;
        }
      }
    }
    fileContainers.forEach(container => this.processFileContainer(container));
  }

  showConversationButton(rootElement, pullRequestPath) {
    const diffBar = rootElement.querySelector('.diffbar');
    if (!diffBar) {
      return; // No diff bar found.
    }
    if (diffBar.querySelector('.cgr-convertation-button') !== null) {
      return; // Button already exists
    }

    const iframe = document.createElement('iframe');
    iframe.popover = "auto";
    iframe.style.inset = 'unset';
    iframe.style.width = '49vw';
    iframe.style.height = '90vh';
    iframe.style.left = '1vw';
    iframe.style.top = '8vh';

    const discussionIcon = document.querySelector('svg.octicon-comment-discussion').cloneNode(true);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cgr-convertation-button btn-octicon m-0 p-0 Link--muted';
    button.title = 'Show conversation';
    button.popoverTargetElement = iframe;
    button.appendChild(discussionIcon);

    const rangeMenu = diffBar.querySelector('.diffbar-range-menu');
    rangeMenu.parentNode.insertBefore(button, rangeMenu);
    rangeMenu.parentNode.appendChild(iframe);

    fetch(pullRequestPath)
      .then(response => response.text())
      .then(html => {
        console.log('Fetched content for iframe:', pullRequestPath);
        iframe.addEventListener('load', () => {
          console.log('Iframe loaded');
          const targetElement = iframe.contentDocument.querySelector('.pull-discussion-timeline .js-discussion');
          iframe.contentDocument.body.innerHTML = ''; // Clear the body to avoid displaying the entire HTML
          iframe.contentDocument.body.appendChild(targetElement);
        });
        iframe.srcdoc = html;
      })
      .catch(error => {
        console.error('Error fetching content:', error);
      });
  }

  /**
   * Processes a file container to extract file information and display blame data.
   * @param {Node} container - The file container element to process
   * @returns {Promise<void>}
   */
  async processFileContainer(container) {
    console.log('Processing file container:', container);

    if (container.querySelector('.blame-area')) {
      console.log('Skipping container, blame area already exists');
      return;
    }

    const fileInfo = this.extractFileInfo(container);
    console.log('Extracted file info:', fileInfo);

    if (fileInfo === null) {
      console.warn('Could not extract commit ref and file name from blob link');
      return;
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
      blameCol.setAttribute('width', '15%');
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

    const commitsMap = this.extractCommitsMap(fileInfo);

    console.log('Fetching blame data for:', fileInfo);
    const blameData = await this.fetchBlameDataWithCache(fileInfo);
    console.log('Fetched blame data:', blameData);

    const groupedAddedRows = this.groupAddedRowsByBlame(addedRows, blameData);
    console.log('Grouped added rows by blame:', groupedAddedRows.length);
    let lastRowsInGroup = null;
    groupedAddedRows.forEach(rowsInGroup => {
      const { row, lineNumber, lineBlame } = rowsInGroup[0];
      const needsBorder = lastRowsInGroup !== null && lastRowsInGroup[lastRowsInGroup.length - 1].lineNumber + 1 === lineNumber;
      const commit = commitsMap.get(lineBlame.oid); // Commit may be missing if the pull request contains too many commits
      const commitAge = commit?.age ?? 1.0; // Consider the commit age as the oldest if not found

      const blameArea = this.createBlameAreaElement(rowsInGroup.length, needsBorder, commitAge);

      const blameInfoElement = this.createBlameInfoElement(lineBlame, commit);
      blameArea.appendChild(blameInfoElement);

      this.addBlameArea(row, blameArea);
      lastRowsInGroup = rowsInGroup;
    });
  }

  /**
   * @typedef {Object} FileInfo
   * @property {string} owner - Repository owner
   * @property {string} repo - Repository name
   * @property {string} commitRef - Commit reference (SHA)
   * @property {string} fileName - Name of the file
   */

  /**
   * Extracts file information from the container element.
   * @param {Node} container 
   * @returns {FileInfo|null} - Returns an object with file information or null if not found
   */
  extractFileInfo(container) {
    const blobLinks = container.querySelectorAll('.dropdown a[href*="/blob/"]');
    const blobLinkHrefs = Array.from(blobLinks).map(link => link.getAttribute('href'));
    const blobLinkMatches = blobLinkHrefs.map(href => viewFileLinkRegExp.exec(href)).filter(match => match !== null);
    const blobLinkMatch = blobLinkMatches.length > 0 ? blobLinkMatches[0] : null;

    if (!blobLinkMatch) {
      return null;
    }
    return {
      owner: blobLinkMatch[1], // May differ from the owner in the URL, as it can be a fork
      repo: blobLinkMatch[2], // May differ from the repo in the URL, as it can be a fork
      commitRef: blobLinkMatch[3],
      fileName: blobLinkMatch[4],
    }
  }

  /**
   * @typedef {Object} Commit
   * @property {string} oid - Commit SHA
   * @property {string} url - URL to the commit
   * @property {number} age - Age of the commit in the context of the pull request. 0 is the most recent commit, 1 is the oldest.
   */

  #cachedCommitMap = null;
  #cacheKeyForCommitMap = null;
  /**
   * Extracts commits map from the current page.
   * @param {FileInfo} fileInfo - Information about the file to extract commits for
   * @returns {Map<string, Commit>} - Map of commit SHA to commit information
   */
  extractCommitsMap(fileInfo) {
    const cacheKey = `${fileInfo.owner}/${fileInfo.repo}/${fileInfo.commitRef}`;
    if (this.#cachedCommitMap !== null && this.#cacheKeyForCommitMap === cacheKey) {
      console.log('Using cached commits for:', cacheKey);
      return this.#cachedCommitMap;
    }

    // Note: DOM structure slightly differs in the following cases:
    // - The pull request contains only one commit
    // - The pull request contains two or more commits
    const commits = Array.from(document.querySelectorAll('.diffbar-range-menu div[data-range-url] a[data-commit]'))
      .map(a => {
        return {
          oid: a.dataset.commit,
          url: a.href,
        }
      });
    console.log('Extracted commits:', commits.length, 'for file:', cacheKey);
    const commitsMap = new Map();
    commits
      .forEach(({ oid, url }, i) => {
        commitsMap.set(oid, {
          oid,
          url,
          // Commits are ordered from the oldest to the most recent, so we can calculate age based on the index
          age: (commits.length - 1 - i) / Math.max(commits.length - 1, 1),
        })
      });

    this.#cachedCommitMap = commitsMap;
    this.#cacheKeyForCommitMap = cacheKey;
    return this.#cachedCommitMap;
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
   * @typedef {Object} LineBlame
   * @property {string} oid - Commit SHA
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
      oid: range.commit.oid,
      author: range.commit.author.name,
      messageHeadline: range.commit.messageHeadline,
      messageBody: range.commit.messageBody,
      committedDate: range.commit.committedDate,
      commitUrl: range.commit.commitUrl,
    };
  }

  /**
   * Creates an element to display the blame area.
   * @param {number} rowSpan - The number of rows this blame area should span
   * @param {boolean} needsBorder - Whether the blame area needs a border to separate it from the previous group
   * @param {number} age - The age of the commit in the range [0, 1], where 0 is the most recent commit and 1 is the oldest.
   * @returns {HTMLElement} - The created blame area element
   */
  createBlameAreaElement(rowSpan, needsBorder, age) {
    const blameArea = document.createElement('td');
    blameArea.className = 'blame-area';
    if (needsBorder) {
      blameArea.classList.add('next-to-previous-group');
    }
    blameArea.setAttribute('rowspan', rowSpan);
    blameArea.style.borderLeft = `0.25rem solid ${this.getGradientColorForAge(age)}`;
    return blameArea;
  }

  /**
   * Gets a gradient color based on the age of the commit.
   * @param {number} age - Age of the commit in the range [0, 1], where 0 is the most recent commit and 1 is the oldest.
   * @returns {string} - RGB color string representing the gradient color for the given age
   */
  getGradientColorForAge(age) {
    const colors = [
      [61, 19, 0], // Darkest color for the most recent commit
      [90, 30, 2],
      [118, 45, 10],
      [155, 66, 21],
      [189, 86, 29],
      [219, 109, 40],
      [240, 136, 62],
      [255, 198, 128],
      [255, 223, 182], // Lightest color for the oldest commit
    ];

    // tを0〜1に制限
    const t = Math.max(0, Math.min(1, age));

    const scaled = t * (colors.length - 1);
    const i = Math.floor(scaled);
    const frac = scaled - i;

    if (i >= colors.length - 1) {
      return `rgb(${colors[colors.length - 1].join(',')})`;
    }

    const c0 = colors[i];
    const c1 = colors[i + 1];

    const r = Math.round(c0[0] + (c1[0] - c0[0]) * frac);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * frac);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * frac);

    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Creates an element to display blame information.
   * @param {LineBlame} lineBlame - The blame information for a specific line
   * @param {Commit | undefined} commit - The commit information, if available
   * @returns {HTMLElement} - The element containing blame information
   */
  createBlameInfoElement(lineBlame, commit) {
    const blameInfoElement = document.createElement('div');
    blameInfoElement.className = 'blame-info';

    let title = `${lineBlame.messageHeadline}\nAuthor: ${lineBlame.author}\nDate: ${lineBlame.committedDate}`;
    if (lineBlame.messageBody !== '') {
      title += `\n\n${lineBlame.messageBody}`;
    }
    const commitLink = document.createElement('a');
    commitLink.href = commit?.url ?? lineBlame.commitUrl;
    commitLink.target = '_blank';
    commitLink.title = title;
    commitLink.textContent = lineBlame.messageHeadline;
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