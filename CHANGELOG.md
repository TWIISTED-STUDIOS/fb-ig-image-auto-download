# Changelog

All notable changes to the maintained Facebook downloader are documented here.

## 1.0.3 - 2026-08-03

### Fixed

- Use the actual photo ID for numeric `/photos/{owner}/{photo}/` URLs so distinct photos do not share filenames or history
- Restrict viewer fallback discovery and navigation to HTTPS Facebook pages
- Preserve exact filename casing when inventorying folders on case-sensitive filesystems
- Keep the draggable launcher inside the viewport after restoring its position or resizing the window
- Scope retained scan results to the current Facebook profile so navigating to another profile starts clean

### Tests

- Add focused Node regression tests for photo identity, URL validation, folder filename casing, and launcher positioning

## 1.0.2 - 2026-08-03

### Fixed

- Detect profile names rendered by Facebook as focusable `role="button"` divs with direct text nodes
- Cache the detected account name while the scan is at the top of the profile, before Facebook virtualises the header out of the DOM
- Prefer direct element text so decorative visual-completion children cannot pollute filename prefixes
- Reject additional Facebook action labels such as Add friend, Follow, Like, and Message

## 1.0.1 - 2026-08-01

- Added professional clean-fork packaging with a preserved `legacy` branch and exact semantic release tagging.

### Repository and attribution

- Reset the maintained `main` branch to a clean root commit while preserving previous history on dated legacy branches
- Added prominent upstream-project attribution
- Credited Bibek Chand Sah in the userscript metadata, README, AUTHORS, NOTICE, and MIT license
- Added project-origin documentation and a formal legacy-branch policy
- Added LF line-ending rules for consistent cross-platform commits
- Added release validation that requires a release tag to match the userscript version

### Application

- No functional changes from the tested 1.0.0 downloader

## 1.0.0 - 2026-08-01

First repository-ready release of the verified full-resolution rewrite.

### Added

- Background resolution of signed Facebook full-size photo assets
- Verification of downloaded image dimensions
- Deep scan with mutation capture for virtualised photo grids
- Compact hamburger launcher
- Green idle, yellow active-scan, and red unchanged-bottom states
- 1–10 bottom stall counter
- Original-style image selector grid
- Individual maximum-resolution downloads from Facebook images and selector cards
- Folder-first bulk workflow
- Existing-file inventory before downloads begin
- Existing-file overlays and automatic deselection
- Skip, replace, and keep-both policies
- Resume history, retry-failed, and clear-history controls
- Account-name filename prefix with stable photo identifiers
- Facebook-only `@connect` permissions and runtime hostname checks
- GitHub update and download metadata

### Removed

- JSZip dependency
- In-memory ZIP generation
- Broad `@connect *` permission
- Description-heavy filenames
- Experimental Reel/video downloader support

## Legacy

Earlier experimental builds used versions 0.2 through 0.7.11. Version 1.0.0 retained the working storage keys so existing scan and history data were not intentionally discarded during the upgrade.
