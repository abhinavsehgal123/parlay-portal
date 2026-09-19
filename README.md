# OFF League Megalay Portal

League portal for weekly parlay submissions, results, history, and commissioner controls.

## Development

Requires Node.js 22.13 or newer and npm.

```sh
npm ci
npm run dev
```

Use the local URL printed by the development server. The app uses React, Vinext/Vite, Cloudflare Workers, and a local D1 database binding named `DB`. Runtime tables are initialized by the API. Production picks and runtime secrets are not included in this repository.

```sh
npm run lint
node --test tests/submissions.test.mjs
npm run build
```

## Configuration

Runtime settings are declared in `db/env.d.ts`. For local Worker development, put settings in an ignored `.dev.vars` file. Use separate development values.

- `PORTAL_COMMISSIONER_CODE`: development commissioner login code.
- `PORTAL_COMMISSIONER_SESSION`: development session secret.
- `PORTAL_ADMIN_EMAIL`: optional trusted Sites identity for admin access.
- `PORTAL_SHEET_WEBHOOK_URL` and `PORTAL_SHEET_SECRET`: optional Google Sheets integration; leave both unset for database-only development.

Google Apps Script source is in `google-apps-script/Code.gs`. Its `PORTAL_SECRET` script property must match the configured webhook secret when that integration is enabled.

Never commit credentials, `.env*`, `.dev.vars*`, or production data. Commissioner cookies use `Secure`, so test authenticated controls in a browser environment that supports secure localhost cookies or local HTTPS.

## Contributing

1. Sign in to GitHub (or create a free account), click **Fork** to copy this public repository to your account, then clone your fork. No collaborator invitation is needed.
2. Create a branch: `git switch -c your-name/short-description`.
3. Make and test your changes. Include a screenshot for visible UI changes.
4. Push the branch to your fork and open a pull request targeting `abhinavsehgal123/parlay-portal` on `main`.
5. Ask Abhinav to review and merge.

Codex and Claude Code can work from the same cloned repository. Keep each change on its own branch. Do not modify production picks while testing.

## Deployment

The live app is hosted on ChatGPT Sites. GitHub is the collaboration repository; merging a pull request does not automatically publish to the live site. Abhinav must bring reviewed changes into the existing Sites project and publish through Sites. Preserve the existing project identity in `.openai/hosting.json`; do not create a replacement production project.
