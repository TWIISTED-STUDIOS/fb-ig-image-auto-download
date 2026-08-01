# Contributing

## Before opening an issue

- Confirm the current userscript version.
- Disable older experimental builds.
- Reload Facebook and reproduce the problem.
- Remove personal information from screenshots and logs.

## Development rules

- Keep the distributed userscript dependency-free.
- Do not add `@connect *`.
- Do not add analytics or remote logging.
- Do not store cookie values, access tokens, or signed CDN URLs in persistent history.
- Preserve the choose-folder-first workflow.
- Preserve the distinction between a grid preview and a verified downloaded asset.
- Do not reintroduce ZIP generation for bulk photo downloads.
- Treat Reel/video support as out of scope unless it can be reliably bound to visible account-owned entries.

## Validation

Run:

```bash
npm run check
```

## Pull requests

Describe:

- The Facebook page type tested
- Browser and Tampermonkey versions
- Scan count and download result
- Any metadata or permission changes
- Whether existing storage keys remain compatible


## Attribution

Preserve the original-project credit in the userscript metadata, README, AUTHORS, NOTICE, LICENSE, and project-origin documentation.
