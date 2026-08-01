# Usage guide

## Installation

Install Tampermonkey, open the raw `facebook-simple-downloader.user.js` file from the repository, approve installation, then reload Facebook.

Do not keep an older experimental version enabled at the same time. Duplicate versions can add multiple launchers and download icons.

## Scan a page

1. Navigate to a Facebook profile, album, or photo grid.
2. Click the green hamburger button.
3. Click **Scan images**.
4. Do not manually scroll or navigate while scanning.

The launcher is yellow while the page is moving or new images are appearing. It turns red when the script reaches the current bottom and Facebook has not changed. The small badge counts unchanged checks from 1 to 10. If Facebook loads another batch, the badge resets and the launcher returns to yellow.

The scan retains images as Facebook inserts them, which helps with virtualised grids that remove older tiles from the DOM.

## Review the selector

The selector opens after the scan finishes. Use the image cards to include or exclude files.

The card preview is intentionally lightweight. It is not evidence of the final file dimensions. The verified full-size asset is resolved when the item is downloaded.

## Choose and check a folder

1. Set or edit the filename prefix.
2. Choose the existing-file policy.
3. Click **Choose folder**.
4. Grant access to the destination folder.

The script inventories supported image filenames in that folder. With **Skip it**, matching cards are deselected and shown with an existing-file overlay. No download begins during this step.

Supported existing-file extensions include JPG, JPEG, PNG, WebP, GIF, AVIF, and BMP.

## Download selected

After the folder check, click **Download selected**. The script resolves, downloads, verifies, and writes one image at a time.

The folder picker is not persisted across browser restarts. This is intentional. Choose the destination folder again after a reload.

## Existing-file policies

### Skip it

Existing matching files are marked and deselected. They cannot be accidentally included unless the policy changes.

### Keep both

Existing cards remain selectable. A numbered filename is used when needed.

### Replace it

Existing cards remain selectable and the matching file is overwritten.

## Resume and retry

Download history is stored locally by Tampermonkey. The selector can mark saved, skipped, pending, and failed items.

- **Resume remaining** selects incomplete items.
- **Retry failed** selects only failed items.
- **Clear history** removes local status records but does not delete files.

The actual folder inventory is the source of truth when a destination folder is selected.

## Individual image download

Hover over a supported Facebook image and click the save icon. The script resolves the photo permalink in the background and uses Tampermonkey's individual download function.

Individual downloads do not use the bulk folder handle and do not mark an item as completed for a later folder batch.
