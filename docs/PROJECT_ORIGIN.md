# Project history and attribution

## Upstream project

This repository is a fork of:

- `bibekchandsah/fb-ig-image-auto-download`
- Original author: Bibek Chand Sah
- Upstream URL: <https://github.com/bibekchandsah/fb-ig-image-auto-download>

The original Facebook userscript declares `@license MIT` in its metadata. Attribution is retained throughout the maintained repository.

## Maintained rewrite

The current Facebook implementation is a substantial rewrite maintained by TWIISTED-STUDIOS contributors. It replaces or substantially changes:

- Image discovery and virtualised-grid scanning
- Signed full-resolution candidate extraction and verification
- Individual and bulk download handling
- File System Access folder writing
- Existing-file detection and visual overlays
- Resume and failure history
- Filename generation
- Permission boundaries
- Selector and launcher interface
- Documentation, validation, and release tooling

## Legacy branch

The clean-fork setup tool preserves the upstream project’s default branch as:

- `legacy` — the original upstream source and commit history at the time the maintained fork was created

The maintained `main` branch is then replaced with a new root commit containing the verified full-resolution rewrite. This keeps the upstream work available for attribution and review without mixing experimental development commits into the maintained release history.

## Version policy

The userscript metadata is the source of truth for releases. The setup tool reads that version and creates an annotated Git tag in the exact form `v<version>`, for example `v1.0.1`. Tags are never created as a bare `v`.
