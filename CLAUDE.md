# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension that displays git blame information for each line in GitHub Pull Request diff views. The extension uses Chrome's Manifest V3 and integrates with GitHub's GraphQL API to fetch blame data.

## Architecture

### Core Components

- **content.js**: Main content script that runs on GitHub pages
  - `GitHubBlameViewer` class handles DOM observation and blame info injection
  - Processes GitHub PR diff tables and extracts line numbers from additions
  - Manages blame data caching to reduce API calls
  - Uses MutationObserver to handle dynamically loaded content

- **background.js**: Service worker handling API communication
  - Manages GitHub Personal Access Token storage
  - Makes GraphQL API calls to GitHub for blame data
  - Handles message passing between content script and popup

- **popup.html/js**: Extension settings interface
  - Allows users to configure GitHub Personal Access Token
  - Provides instructions and status feedback

### Key Technical Details

- **API Integration**: Uses GitHub GraphQL API for blame queries (background.js:47-84)
- **Caching Strategy**: Implements Map-based caching with keys like `owner/repo/commitRef/fileName` (content.js:114-125)
- **DOM Processing**: Targets `.file` containers and `.diff-table tr` elements for diff analysis
- **Line Detection**: Extracts line numbers from `.blob-num-addition.js-linkable-line-number[data-line-number]` elements
- **Commit Reference Extraction**: Parses blob links to get commit hashes and file paths using regex pattern `^/owner/repo/blob/([0-9a-f]{40})/(.*)$`

## Development Setup

Since this is a Chrome extension with no build process:

1. Load the extension in Chrome developer mode
2. Point to the repository directory directly
3. Reload extension after code changes

## Extension Loading

1. Open Chrome → Extensions → Enable Developer mode
2. Click "Load unpacked" and select this directory
3. Extension will be active on all GitHub pages

## Testing

- Test on GitHub Pull Request pages with different diff formats
- Verify blame information appears for added lines
- Test with both public and private repositories (requires token for private)
- Test caching behavior across page navigations

## Configuration

- GitHub Personal Access Token can be configured via extension popup
- Token requires `repo` scope for private repositories or `public_repo` for public only
- Without token, extension is limited to 60 API requests/hour

## Key Files

- **manifest.json**: Extension configuration and permissions
- **content.js**: Core blame viewing logic (GitHubBlameViewer class)
- **background.js**: API communication and token management
- **popup.html/js**: Settings interface
- **content.css**: Blame information styling with dark mode support