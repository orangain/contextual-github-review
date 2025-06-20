# GitHub PR Blame Viewer

A Chrome extension that displays git blame information for each line in GitHub Pull Request diff views.

## Features

- Shows commit hash, author, and date for each diff line
- Works on all GitHub Pull Request pages
- Supports both light and dark themes
- Optional GitHub token configuration for private repos and higher rate limits
- Clickable commit hashes that link to full commit pages

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension will be installed and ready to use

## Configuration

1. Click the extension icon in the Chrome toolbar
2. Optionally enter a GitHub Personal Access Token for:
   - Access to private repositories
   - Higher API rate limits (5000 requests/hour vs 60/hour)
3. Click "Save Settings"

## How to Create a GitHub Token

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (for private repos) or `public_repo` (for public repos only)
4. Copy the generated token and paste it in the extension popup

## Usage

1. Navigate to any GitHub Pull Request page
2. The extension automatically detects diff lines and fetches blame information
3. Blame info appears below line numbers showing:
   - Commit hash (clickable link)
   - Author name
   - Commit date
4. Hover over commit hashes to see the full commit message

## Technical Details

- Uses GitHub's REST API for blame information
- Implements caching to reduce API calls
- Observes DOM changes to handle dynamic content loading
- Supports GitHub's various diff view formats

## Limitations

- Rate limited by GitHub API (60 requests/hour without token, 5000 with token)
- Currently defaults to 'main' branch for blame lookups
- May not work with very large files due to API response size limits

## Development

The extension consists of:
- `manifest.json` - Extension configuration
- `content.js` - Main logic for detecting diffs and showing blame info
- `background.js` - Service worker for handling extension lifecycle
- `popup.html/js` - Settings interface
- `styles.css` - Styling for blame information display

## License

MIT License