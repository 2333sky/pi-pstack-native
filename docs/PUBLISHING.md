# Release preparation

The public repository is [2333sky/pi-pstack-native](https://github.com/2333sky/pi-pstack-native). The package manifest name is `pi-pstack-native`; GitHub availability does not mean an npm release exists. Current installation uses the Git source documented in the [project overview](../README.md).

## Validate a candidate

Use Node.js 22.19 or later and a clean checkout with the lockfile:

```bash
npm ci
npm run check:release
```

The release chain includes source and semantic checks, tests, typecheck, build, Pi SDK host smoke, offline/fake-provider E2E, benchmark smoke, and a clean installed-tarball check. GitHub Actions also tests Node 22/24 and focused Windows persistence and build behavior. These checks are not authenticated model inference or a live GitHub delivery test. Record the exact commit and environment for any additional validation; see [semantic compatibility](SEMANTIC-COMPATIBILITY.md) and the [live test plan](LIVE-TEST-PLAN.zh-CN.md).

`npm pack` runs the release chain through `prepack`. Publishing an already-created tarball does not rerun the package's lifecycle scripts, so validate the exact artifact before publication.

## Prepare a release

1. Review the version, changelog, package contents, license notices, dependency inventory, and [security policy](../SECURITY.md).
2. Inspect CI and any external-model or GitHub test results separately; preserve unresolved issues and do not infer semantic sign-off from a green build.
3. Choose whether a GitHub release or npm publication is appropriate and accurately describe the version and validation evidence.
4. Create a tag, GitHub release, or npm publication only when the maintainer explicitly authorizes that external action. Registry ownership and availability must be checked at publication time.

## Proposed 1.0.0 stable release

The package manifest and lockfile may be prepared at `1.0.0` ahead of the actual release. **This is release preparation, not proof of production readiness or publication.** Do not tag, announce, or publish `1.0.0` until a maintainer reviews and accepts the remaining evidence gaps:

- Complete and record maintainer semantic sign-off, or explicitly document the reduced support guarantee; `SEMANTICS.json.review` is currently `pending-maintainer-signoff`.
- Obtain and archive a successful, commit-bound authenticated Pi/model test receipt. Historic Windows results report 13/20 workflow acceptance and a separate 20/20 independent rerun; do not conflate them.
- Evaluate live GitHub PR create/merge/delivery operations in an authorized disposable repository, or clearly state that these paths remain experimental and out of the 1.0.0 stability guarantee.
- Check npm package ownership/availability and confirm `pi-pstack-native@1.0.0` is not already published; released name/version pairs cannot be reused.
- Validate the exact release commit with `npm ci`, `npm run check:release`, `npm pack --dry-run`, an inspected tarball, and successful CI; record any skipped acceptance as such.

**Only after explicit maintainer approval**, a publisher with npm access and the applicable second-factor authorization may publish the reviewed commit with `npm publish --tag latest` (unscoped packages are public). Publishing a version without `--tag` also selects `latest`; spell it out to avoid ambiguity. Verify `npm view pi-pstack-native@1.0.0 version`, `npm dist-tag ls pi-pstack-native`, and an actual `pi install npm:pi-pstack-native` afterward. Create a Git tag/GitHub release only with release authorization.

If the evidence gaps remain unacceptable, do not label this candidate stable: retain a prerelease version and publish it using `--tag next` instead.

The earlier `0.6.0-preview.1` instructions were for the preview candidate and are not the stable release procedure.

Earlier installation and release results are historical records: [installation check](../INSTALLATION-CHECK.md) and [release validation](VALIDATION.md).
