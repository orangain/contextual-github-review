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

    const addedRows = Array.from(container.querySelectorAll('.diff-table tr'))
      .map(row => ({ row, lineNumber: this.extractLineNumberOfAddition(row) }))
      .filter(({ lineNumber }) => lineNumber !== null && !isNaN(lineNumber))
    console.log('Found added rows:', addedRows.length);
    if (addedRows.length === 0) {
      return;
    }

    console.log('Fetching blame data for:', fileInfo);
    const blameData = await this.fetchBlameDataWithCache(fileInfo);
    console.log('Fetched blame data:', blameData);

    let lastLineBlame = null;
    let lastLineNumber = null;
    addedRows.forEach(({ row, lineNumber }) => {
      if (lastLineNumber !== null && lineNumber !== lastLineNumber + 1) {
        lastLineBlame = null; // Reset if there's a gap in line numbers
      }
      lastLineBlame = this.processAddedRow(row, lineNumber, blameData, lastLineBlame);
      lastLineNumber = lineNumber;
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

  processAddedRow(row, lineNumber, blameData, lastLineBlame) {
    console.log('Processing added row:', row);
    if (row.querySelector('.blame-info')) {
      return; // Skip if blame info already exists
    }

    try {
      const lineBlame = this.findBlameForLine(blameData, lineNumber);
      console.log('Blame info for line:', lineBlame);
      if (lineBlame) {
        const blameArea = this.addBlameInfoArea(row);
        if (lineBlame.commitUrl !== lastLineBlame?.commitUrl) {
          this.addBlameDisplay(blameArea, lineBlame);
        }
        return lineBlame;
      }
    } catch (error) {
      console.error('Failed to get blame info:', error);
    }
    return null;
  }

  extractLineNumberOfAddition(row) {
    const lineNumElement = row.querySelector('.blob-num-addition.js-linkable-line-number[data-line-number]');
    if (lineNumElement) {
      const lineNumber = parseInt(lineNumElement.getAttribute('data-line-number'), 10);
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

  addBlameInfoArea(row) {
    const blameArea = document.createElement('div');
    blameArea.className = 'blame-info';

    const lineCell = row.querySelector('.blob-num-addition');
    if (lineCell) {
      lineCell.appendChild(blameArea);
      console.log('Added blame area to line:', lineCell);
    } else {
      console.warn('Could not find line cell for blame area');
    }

    return blameArea;
  }

  addBlameDisplay(blameArea, blameInfo) {
    const commitLink = document.createElement('a');
    commitLink.href = blameInfo.commitUrl;
    commitLink.target = '_blank';
    commitLink.title = `${blameInfo.messageHeadline}\nAuthor: ${blameInfo.author}\nDate: ${blameInfo.committedDate}\n\n${blameInfo.messageBody}`;
    commitLink.textContent = blameInfo.messageHeadline;
    blameArea.appendChild(commitLink);
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GitHubBlameViewer());
} else {
  new GitHubBlameViewer();
}