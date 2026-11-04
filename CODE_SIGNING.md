# Code signing policy

LumiPDF's Windows installers are currently **not signed with a code signing certificate**, so
Windows may show "Windows protected your PC" on the first install: choose **More info → Run
anyway**. We plan to sign them through the [SignPath Foundation](https://signpath.org)'s free
programme for open-source projects once LumiPDF qualifies.

Updates installed from inside the app are always verified: every installer is signed with the
project's updater key, and LumiPDF refuses an update whose signature doesn't match.

The macOS app (from 2.1) is not signed with an Apple Developer ID; it is ad-hoc signed by the
**Release** workflow, which Apple Silicon needs to run it. After moving it to Applications:

- macOS 15 and later: open it, click **Done** when macOS says it can't verify it, then
  **System Settings → Privacy & Security → Open Anyway** (once).
- macOS 13–14: right-click the app → **Open** (once).
- Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/LumiPDF.app`.

In-app updates on the Mac are checked with the same updater key as on Windows.

When certificate signing is in place:

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
