# Facebook Image Downloader: Verified Full Resolution

[![Validate userscript](https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/actions/workflows/validate-userscript.yml/badge.svg)](https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/actions/workflows/validate-userscript.yml)
[![Release](https://img.shields.io/github/v/release/TWIISTED-STUDIOS/fb-ig-image-auto-download)](https://github.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Tampermonkey userscript for downloading Facebook photos at the largest verified resolution Facebook exposes to the signed-in viewer.

## Project origin

This repository is a maintained fork of [`bibekchandsah/fb-ig-image-auto-download`](https://github.com/bibekchandsah/fb-ig-image-auto-download), originally created by **Bibek Chand Sah**. The upstream Facebook userscript declares the MIT license in its userscript metadata.

The original project supplied the initial downloader concept and interface foundation. The current maintained version is a substantial rewrite by **TWIISTED-STUDIOS contributors**, replacing the photo discovery, full-resolution resolution, folder access, duplicate handling, download history, and bulk-download systems.

The repository remains connected to the upstream project through GitHub’s fork relationship. The original upstream source and history are preserved on the `legacy` branch; see [Project history and attribution](docs/PROJECT_ORIGIN.md).

## Install

1. Install Tampermonkey in Chrome or Edge.
2. Open [`facebook-simple-downloader.user.js`](https://raw.githubusercontent.com/TWIISTED-STUDIOS/fb-ig-image-auto-download/main/facebook-simple-downloader.user.js).
3. Confirm the Tampermonkey installation prompt.
4. Reload Facebook.

Chrome or Edge is recommended. Bulk folder saving uses the File System Access API. Individual downloads use Tampermonkey’s download API.

## Main features

- Verified full-resolution downloads resolved from each Facebook photo page in the background
- Deep scanning for long profiles, albums, and virtualised photo grids
- Compact hamburger launcher with green, yellow, and red scan states
- A 1–10 unchanged-bottom counter before scanning completes
- Original-style image selector with individual card downloads
- Choose-folder-first workflow
- Existing-file detection before download starts
- Grey and striped overlays for files already present in the selected folder
- Skip, replace, or keep-both behaviour for existing files
- Resume history and retry-failed controls
- Account-name filename prefix with stable photo identifiers
- Individual maximum-resolution download buttons on Facebook images
- Network permissions restricted to Facebook and Facebook CDN domains
- No ZIP generation and no large in-memory archive step

## Bulk workflow

1. Open a Facebook profile, album, or photo page.
2. Click the green **☰** button.
3. Choose **Scan images**.
4. Leave the page alone while the launcher is yellow or red.
5. When the selector opens, choose a destination folder.
6. Existing matching files are marked and deselected when **Skip it** is active.
7. Review the grid and click **Download selected**.

## Scan indicator

| State | Meaning |
| --- | --- |
| Green | Ready or idle |
| Yellow | Scrolling or finding new images |
| Red | At the bottom and waiting to see whether Facebook loads more |
| Red badge 1–10 | Consecutive unchanged bottom checks before the scan completes |

## Individual downloads

Hover over a supported Facebook image and click the save icon. The script resolves the photo in the background and downloads the verified largest working asset rather than the visible grid thumbnail.

## Filename format

Files use the detected account name plus a stable short identifier:

```text
Account Name-48392017.jpg
Account Name-09247631.png
```

The prefix can be edited in the selector before checking the folder or downloading.

## Privacy and permissions

The script runs locally in the browser and does not contain analytics. It uses the current Facebook login session when requesting Facebook photo pages in the background, but it does not read, display, or store cookie values.

Persistent history contains only photo identifiers, filenames, verified dimensions, statuses, and timestamps. Signed CDN URLs are resolved at download time and are not kept in download history.

Network requests are limited by userscript metadata to:

- `facebook.com`
- `fbcdn.net`
- `fbsbx.com`

See [Privacy and permissions](docs/PRIVACY.md) for details.

## Browser support

| Browser | Individual download | Bulk folder download |
| --- | --- | --- |
| Chrome | Supported | Supported |
| Edge | Supported | Supported |
| Firefox | May work | Not supported by the required folder picker API |
| Safari | Not supported or tested | Not supported |

## Scope and limitations

- Photos only. Reels and videos are deliberately not supported.
- “Maximum resolution” means the largest valid rendition Facebook exposes to the current signed-in viewer. It may not be the untouched original upload.
- Facebook can change its page structure at any time.
- Private photos are only available when the current Facebook account already has permission to view them.
- Keep the Facebook tab open during scanning and downloading.

## Documentation

- [Usage guide](docs/USAGE.md)
- [Privacy and permissions](docs/PRIVACY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Project history and attribution](docs/PROJECT_ORIGIN.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Development

No build step or runtime third-party package is required.

```bash
npm run check
```

The validation checks JavaScript syntax, release metadata, update URLs, restricted `@connect` permissions, attribution files, and the absence of JSZip.

## Authors and credits

See [AUTHORS.md](AUTHORS.md) and [NOTICE.md](NOTICE.md).

## License

MIT. See [LICENSE](LICENSE). Original-project attribution is retained in the userscript metadata, README, AUTHORS, NOTICE, and license files.
