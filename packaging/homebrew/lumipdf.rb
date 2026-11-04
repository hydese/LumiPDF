# Homebrew cask for LumiPDF, for the tap hydese/homebrew-tap (Casks/lumipdf.rb).
# Not published yet: it goes live with the official Mac release, 2.1.0.
#
#   brew install --cask hydese/tap/lumipdf
#
# To publish a version: set `version` and `sha256` (the .dmg's SHA-256, listed in the GitHub
# release notes) and commit it to the tap. Homebrew's own catalogue doesn't take apps without
# Apple's Developer ID signature, so LumiPDF lives in its own tap.
cask "lumipdf" do
  version "2.1.0"
  sha256 "REPLACE_WITH_THE_DMG_SHA256"

  url "https://github.com/hydese/LumiPDF/releases/download/v#{version}/LumiPDF_#{version}_aarch64.dmg"
  name "LumiPDF"
  desc "PDF reader for long study sessions, with a dark mode that keeps text sharp"
  homepage "https://github.com/hydese/LumiPDF"

  livecheck do
    url :url
    strategy :github_latest
  end

  # LumiPDF updates itself from inside the app.
  auto_updates true
  depends_on arch: :arm64
  depends_on macos: ">= :ventura"

  app "LumiPDF.app"

  zap trash: [
    "~/Library/Application Support/com.hydese.lumipdf",
    "~/Library/Caches/com.hydese.lumipdf",
    "~/Library/WebKit/com.hydese.lumipdf",
  ]

  caveats <<~EOS
    LumiPDF isn't signed by Apple yet. The first time you open it, macOS says it can't verify it:
    click Done, then System Settings → Privacy & Security → Open Anyway.
  EOS
end
