# Security policy

## Supported version

Only the latest release on the `main` branch is supported.

## Reporting a vulnerability

Open a private security advisory in GitHub when possible. Do not publish:

- Facebook cookies
- Access tokens
- Passwords
- Private photo URLs
- Complete signed Facebook CDN URLs
- Screenshots containing private account information

Include the userscript version, browser, Tampermonkey version, affected code path, and a minimal reproduction with secrets removed.

## Security boundaries

The maintained script should:

- Connect only to Facebook and Facebook CDN domains
- Use the existing logged-in session without directly reading cookie values
- Keep persistent history free of signed CDN URLs
- Access only a folder explicitly chosen by the user
- Avoid external libraries loaded at runtime
