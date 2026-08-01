# Troubleshooting

## The launcher appears more than once

Disable older Facebook downloader userscripts and reload the page. Keep only the current maintained version enabled.

## The scan count is lower than expected

- Start from the top of the profile or album.
- Wait for the initial grid to load before scanning.
- Do not manually scroll while the scan is running.
- Let the red stall badge reach 10.
- Run another scan on a separate album route and merge the retained results when needed.

## The scan appears stuck at the bottom

A red launcher means the script is deliberately waiting for Facebook to load another batch. The badge counts the unchanged checks. Do not navigate until it reaches 10 and opens the selector.

## The saved image is a thumbnail

Report the photo permalink and the card status shown in the selector. Do not publish signed CDN URLs in a public issue because they are temporary and may contain session-specific parameters.

## The folder picker does not open

Bulk folder saving requires a Chromium browser with the File System Access API, normally Chrome or Edge. The picker must be opened directly from a user click.

Reload the page and click **Choose folder** again. Do not trigger it through automated browser tools.

## Existing files are not detected

- Confirm the same filename prefix is selected.
- Click **Recheck** after changing files externally.
- The folder comparison matches generated base names across supported image extensions.
- A different prefix produces different expected filenames.

## Account name is wrong

Open the main profile page or its photos section and reload before scanning. The detector prioritises the visible profile heading and rejects navigation labels and friend/follower counts. The prefix remains editable.

## Downloads fail after a long delay

Facebook CDN signatures expire. Use **Retry failed** so the script resolves fresh signed URLs. Avoid leaving the selector open for a very long time before starting.

## Reporting a bug

Include:

- Browser and version
- Tampermonkey version
- Facebook route type, such as profile photos or album
- Script version
- Number scanned, selected, saved, skipped, and failed
- Exact error text
- A screenshot with personal names and private content removed

Do not include Facebook cookies, access tokens, passwords, or complete signed CDN URLs.
