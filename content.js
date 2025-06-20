class GitHubBlameViewer {
  constructor() {
    this.cache = new Map();
    this.init();
  }

  init() {
    console.log('GitHub Blame Viewer initialized');
    if (this.isPullRequestPage()) {
      console.log('Pull request page detected, setting up observer');
      this.setupObserver();
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
    const diffRows = container.querySelectorAll('tr');
    console.log('Found diff rows:', diffRows.length);
    diffRows.forEach(row => {
      if (row.querySelector('.blob-num.js-line-number')) {
        this.processDiffRow(row);
      }
    });
  }

  async processDiffRow(row) {
    if (row.querySelector('.blame-info')) return;

    const lineNumber = this.extractLineNumber(row);
    const fileName = this.extractFileName(row);
    
    if (!lineNumber || !fileName) return;

    try {
      const blameInfo = await this.getBlameInfo(fileName, lineNumber);
      if (blameInfo) {
        this.addBlameDisplay(row, blameInfo);
      }
    } catch (error) {
      console.error('Failed to get blame info:', error);
    }
  }

  extractLineNumber(row) {
    const lineNumElement = row.querySelector('.blob-num.js-line-number[data-line-number]');
    if (lineNumElement) {
      const lineNumber = parseInt(lineNumElement.getAttribute('data-line-number'));
      console.log('Extracted line number:', lineNumber);
      return lineNumber;
    }
    return null;
  }

  extractFileName(row) {
    const fileContainer = row.closest('.file-diff, .file');
    if (fileContainer) {
      const fileNameElement = fileContainer.querySelector('.file-header .file-info .file-name, .file-header [title*="/"]');
      if (fileNameElement) {
        const fileName = fileNameElement.textContent || fileNameElement.getAttribute('title');
        console.log('Extracted file name:', fileName);
        return fileName;
      }
    }
    return null;
  }

  async getBlameInfo(fileName, lineNumber) {
    const cacheKey = `${fileName}:${lineNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const repoInfo = this.extractRepoInfo();
    if (!repoInfo) return null;

    try {
      const response = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/blame/${repoInfo.branch}/${fileName}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blameData = await response.json();
      const lineBlame = this.findBlameForLine(blameData, lineNumber);
      
      this.cache.set(cacheKey, lineBlame);
      return lineBlame;
    } catch (error) {
      console.error('API request failed:', error);
      return null;
    }
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
    let currentLine = 1;
    
    for (const range of blameData.ranges) {
      const endLine = currentLine + range.count - 1;
      
      if (targetLine >= currentLine && targetLine <= endLine) {
        return {
          commit: range.commit,
          author: range.commit.author,
          message: range.commit.message,
          sha: range.commit.sha.substring(0, 8),
          date: new Date(range.commit.author.date).toLocaleDateString()
        };
      }
      
      currentLine += range.count;
    }
    
    return null;
  }

  addBlameDisplay(row, blameInfo) {
    const blameElement = document.createElement('div');
    blameElement.className = 'blame-info';
    blameElement.innerHTML = `
      <span class="blame-commit" title="${blameInfo.message}">
        <a href="https://github.com/${this.extractRepoInfo().owner}/${this.extractRepoInfo().repo}/commit/${blameInfo.commit.sha}" target="_blank">
          ${blameInfo.sha}
        </a>
      </span>
      <span class="blame-author">${blameInfo.author.name}</span>
      <span class="blame-date">${blameInfo.date}</span>
    `;

    const lineCell = row.querySelector('.blob-num.js-line-number');
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