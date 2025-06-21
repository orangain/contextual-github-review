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

  processFileContainer(repoInfo, container) {
    console.log('Processing file container:', container);
    const diffRows = Array.from(container.querySelectorAll('.diff-table tr')).filter(row => this.extractLineNumberOfAddition(row) !== null);
    console.log('Found diff rows:', diffRows.length);
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
    diffRows.forEach(row => {
      this.processDiffRow(row, fileInfo);
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

  async processDiffRow(row, fileInfo) {
    console.log('Processing diff row:', row);
    if (row.querySelector('.blame-info')) return;

    const lineNumber = this.extractLineNumberOfAddition(row);

    console.log('Extracted line number:', lineNumber);
    if (!lineNumber) return;

    try {
      console.log('Fetching blame data for:', fileInfo);
      const blameData = await this.fetchBlameDataWithCache(fileInfo);
      console.log('Fetched blame data:', blameData);
      const lineBlame = this.findBlameForLine(blameData, lineNumber);
      console.log('Blame info for line:', lineBlame);
      if (lineBlame) {
        this.addBlameDisplay(row, lineBlame);
      }
    } catch (error) {
      console.error('Failed to get blame info:', error);
    }
  }

  extractLineNumberOfAddition(row) {
    const lineNumElement = row.querySelector('.blob-num-addition.js-linkable-line-number[data-line-number]');
    if (lineNumElement) {
      const lineNumber = parseInt(lineNumElement.getAttribute('data-line-number'));
      return lineNumber;
    }
    return null;
  }

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

  async fetchBlameData(fileInfo) {
    const response = await chrome.runtime.sendMessage({
      action: 'fetch_blame_data',
      args: fileInfo,
    })
    return response.data;
  }

  extractRepoInfo() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length < 4) return null;

    return {
      owner: pathParts[1],
      repo: pathParts[2],
      branch: 'main' // Default branch, could be improved to detect actual branch
    };
  }

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

  addBlameDisplay(row, blameInfo) {
    const blameElement = document.createElement('div');
    blameElement.className = 'blame-info';
    blameElement.innerHTML = `
      <span class="blame-commit" title="${blameInfo.messageHeadline}\nAuthor: ${blameInfo.author}\nDate: ${blameInfo.committedDate}\n\n${blameInfo.messageBody}">
        <a href="${blameInfo.commitUrl}" target="_blank">
          ${blameInfo.messageHeadline}
        </a>
      </span>
    `;

    const lineCell = row.querySelector('.blob-num-addition');
    if (lineCell) {
      lineCell.appendChild(blameElement);
      console.log('Added blame info to line:', lineCell);
    } else {
      console.log('Could not find line cell for blame info');
    }
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GitHubBlameViewer());
} else {
  new GitHubBlameViewer();
}