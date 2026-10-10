# Publish `pi-pstack-native` to GitHub

**Current state:** this archive is a prepared Git repository, not an automatically created GitHub remote. The connected GitHub integration available when it was prepared does not expose repository creation.

## Before making it public

1. Verify you have rights to publish the **new** Pi-native source code and any third-party material. The bundled `LICENSE` is the upstream Lauren Tan MIT license; maintain its notices. `NOTICE.md` describes provenance. Confirm any additional author/copyright notices needed for your original code.
2. Run a secrets scan and manually audit configuration, scripts, git history, generated assets and examples. None of the checks provided here replaces a professional review.
3. On a supported Node version with network access: `npm install && npm run check && npm run check:types && npm run build && npm run check:host && npm run benchmark:smoke`.
4. Treat `ACCEPTANCE.md` as historical, environment-scoped evidence—not a promise that this remote CI run has succeeded.
5. Do **not** publish the release as stable before running real inference and GitHub PR E2E in a disposable test repository.

## Create the remote repository

### GitHub website (no CLI required)

- Open https://github.com/new and sign in.
- Repository name: **pi-pstack-native**; Visibility: **Public** (as previously discussed).
- Do **not** initialize a README, license or .gitignore: these are already in the project.
- Create repository, then run in your local checkout (for account `2333sky`):

```bash
git remote add origin https://github.com/2333sky/pi-pstack-native.git
git push -u origin main
```

### GitHub CLI alternative

```bash
gh auth login
gh repo create pi-pstack-native --public --source=. --remote=origin --push
```

Then verify GitHub Actions is enabled and CI passes on Node 22.19.0/24.x. Enable private vulnerability reporting; optionally create a **pre-release** tag after the remote CI passes:

```bash
git tag v0.6.0-preview.1
git push origin v0.6.0-preview.1
```

For GitHub Releases, set **This is a pre-release** and describe the unverified external model/GitHub flows. Do not assume this also publishes npm.

## Included files

- `.github/workflows/ci.yml`: checks, typecheck, build, SDK host smoke and benchmark-file smoke.
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE.md`, `LICENSE`.
- Original TypeScript source, Skills, tests, benchmarks, compiled public API/CLI.

**The npm package name remains `2333`**. The repository name and npm package name can differ; renaming npm requires its own compatibility plan.
