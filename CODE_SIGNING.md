# Code signing policy

LumiPDF's Windows releases are to be signed through the SignPath Foundation's free programme for
open-source projects (application in progress; until approval, releases are unsigned).

- Free code signing provided by [SignPath.io](https://signpath.io), certificate by
  [SignPath Foundation](https://signpath.org).
- Only release builds made by this repository's **Release** workflow on GitHub Actions, from a
  version tag, are submitted for signing. Nothing built on a personal computer is signed.
- Every release is approved by hand by the maintainer before it is signed and published.

## Team

- Committers and reviewers: [hydese](https://github.com/hydese)
- Approvers: [hydese](https://github.com/hydese)

## Privacy

LumiPDF does not send anything about you or your documents anywhere. The only network access is
the update check, which reads the public release list and update files of this repository on
GitHub. It can be turned off in Settings → General.
