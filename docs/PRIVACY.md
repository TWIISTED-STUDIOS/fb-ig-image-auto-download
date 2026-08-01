# Privacy and permissions

## What the script accesses

The downloader runs on Facebook pages matched by its userscript metadata. It inspects visible page elements and Facebook photo links to build a photo manifest.

To resolve the largest working image, it requests the corresponding Facebook photo page and Facebook CDN assets through `GM_xmlhttpRequest`.

## Facebook session

Background Facebook requests can use the browser's existing signed-in Facebook session. This is necessary for photos that are visible only while signed in.

The script does not use a cookie-management API and does not read, print, export, or store cookie values. It does not know the Facebook password.

## Network restrictions

The userscript metadata grants connections only to Facebook-controlled host families used by the downloader:

- `facebook.com`
- `fbcdn.net`
- `fbsbx.com`

The script also performs a runtime hostname check before network requests. Requests to unrelated domains are rejected.

## Local storage

Tampermonkey storage may contain:

- Stable Facebook photo identifiers
- Generated filenames
- Verified width and height
- Saved, skipped, pending, or failed status
- Timestamps
- Retained scan manifest data for the active workflow

Download history does not intentionally retain cookie values or signed CDN URLs.

Use **Clear history** in the selector to remove persistent download status.

## Folder access

Bulk saving uses the File System Access API. The browser asks the user to choose a folder and grant permission.

The script can list and write files only through the directory handle granted by the user. The handle is kept for the current page session and is not intentionally stored for reuse after restarting the browser.

## Data collection

There is no analytics, telemetry, advertising, remote logging, or third-party upload in the maintained script.
