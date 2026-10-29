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

For the `0.6.0-preview.1` npm preview, a maintainer with npm publishing permission can publish from the reviewed release commit using `npm publish --tag next`. The default npm tag is `latest`; using `next` keeps this preview on an explicit preview channel. After publishing, check the registry version and tag before documenting it as available. npm authentication and its applicable two-factor requirement are prerequisites.

Earlier installation and release results are historical records: [installation check](../INSTALLATION-CHECK.md) and [release validation](VALIDATION.md).
