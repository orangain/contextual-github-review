class GitHubBlameViewer {
  constructor() {
    this.cache = new Map();
    this.init();
  }

  init() {
    console.log('GitHub Blame Viewer initialized');
    if (this.isPullRequestPage()) {
      console.log('Pull request page detected, setting up observer');
      // this.setupObserver();
      this.processExistingDiffs();
    }
  }

  isPullRequestPage() {
    const isPR = window.location.pathname.includes('/pull/');
    const hasDiffView = document.querySelector('.pr-review-tools, .diff-view, .diff-table, .js-diff-table');
    console.log('PR page check:', { isPR, hasDiffView: !!hasDiffView });
    return isPR && hasDiffView;
  }

  setupObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processDiffContainer(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  processExistingDiffs() {
    console.log('Processing existing diffs');
    const diffContainers = document.querySelectorAll('.diff-table, .js-diff-table');
    console.log('Found diff containers:', diffContainers.length);
    diffContainers.forEach(container => this.processDiffContainer(container));
  }

  processDiffContainer(container) {
    console.log('Processing diff container:', container);
    const diffRows = Array.from(container.querySelectorAll('tr')).filter(row => this.extractLineNumberOfAddition(row) !== null);
    console.log('Found diff rows:', diffRows.length);
    const fileName = this.extractFileName(container);
    console.log('Extracted file name:', fileName);
    if (fileName !== null) {
      diffRows.forEach(row => {
        this.processDiffRow(row, fileName);
      });
    }
  }

  extractFileName(container) {
    const fileContainer = container.closest('.file[data-tagsearch-path]');
    if (fileContainer) {
      const fileName = fileContainer.getAttribute('data-tagsearch-path');
      return fileName;
    }
    return null;
  }

  async processDiffRow(row, fileName) {
    console.log('Processing diff row:', row);
    if (row.querySelector('.blame-info')) return;

    const lineNumber = this.extractLineNumberOfAddition(row);

    console.log('Extracted line number:', lineNumber);
    if (!lineNumber || !fileName) return;

    try {
      const blameInfo = await this.getBlameInfo(fileName, lineNumber);
      console.log('Blame info for line:', blameInfo);
      if (blameInfo) {
        this.addBlameDisplay(row, blameInfo);
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


  async getBlameInfo(fileName, lineNumber) {
    const repoInfo = this.extractRepoInfo();
    if (!repoInfo) return null;
    const commitRef = "main"; // TODO: 動的に取得する

    const blameData = await this.fetchBlameDataWithCache(repoInfo, fileName, commitRef);
    console.log('Fetched blame data:', blameData);
    const lineBlame = this.findBlameForLine(blameData, lineNumber);
    return lineBlame;
  }

  async fetchBlameDataWithCache(repoInfo, fileName, commitRef) {
    const cacheKey = `${fileName}:${commitRef}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const data = await this.fetchBlameData(repoInfo, fileName, commitRef);
    this.cache.set(cacheKey, data);
    return data;
  }

  async fetchBlameData(repoInfo, fileName, commitRef) {
    console.log('Fetching blame data for:', { repoInfo, fileName, commitRef });
    const response = await chrome.runtime.sendMessage({
      action: 'fetch_blame_data',
      args: {
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        fileName: fileName,
        commitRef: commitRef
      }
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