# Linux / AppImage support

This branch adds a Linux workflow for ZCode AppImage installations without modifying the original AppImage.

The Linux helper extracts the AppImage into a temporary AppDir, reuses the existing exact-version compatibility profiles and patch engine, and fails closed if the Linux bundle does not match the verified profile.

## Safety model

- The source `zcode.AppImage` is never modified.
- `--probe` is read-only against the extracted copy.
- `--dry-run` fully patches and repacks only inside a temporary directory.
- `--install` first runs the strict compatibility probe, then creates validated `.patched` outputs with the existing patcher and promotes them only inside the extracted copy.
- The patched Linux build is installed as an extracted AppDir, separate from the official AppImage.
- The previous patched AppDir is retained as `ZCode.AppDir.previous` during replacement.
- Unknown ZCode versions still fail closed because the existing exact-version profile policy is unchanged.

## Fedora quick start

For the common install path `~/.local/bin/zcode.AppImage`:

```bash
git clone https://github.com/unsocialz2/zcode-openai-oauth.git
cd zcode-openai-oauth
git switch linux-appimage-support

# Fastest first test: compatibility only.
bash patch-linux.sh --probe
```

If the probe passes:

```bash
# Full patch/repack validation, still does not install anything.
bash patch-linux.sh --dry-run

# Create the patched AppDir and launcher.
bash patch-linux.sh --install
```

The default output is:

```text
~/.local/share/zcode-openai-oauth/ZCode.AppDir
```

The default launcher is:

```text
~/.local/bin/zcode-openai-oauth
```

Run the patched build with:

```bash
zcode-openai-oauth
```

or:

```bash
bash patch-linux.sh --launch-only
```

To install and immediately launch:

```bash
bash patch-linux.sh --install --launch
```

## Custom AppImage path

```bash
bash patch-linux.sh --probe --appimage /path/to/ZCode.AppImage
```

Or set:

```bash
export ZCODE_APPIMAGE=/path/to/ZCode.AppImage
bash patch-linux.sh --probe
```

## Custom output location

```bash
bash patch-linux.sh --install \
  --output-dir "$HOME/Applications/ZCode-OpenAI.AppDir" \
  --launcher "$HOME/.local/bin/zcode-openai-oauth"
```

Use `--no-launcher` if you only want the AppDir.

## Updating ZCode

Keep using the official AppImage as the source of truth. After replacing it with a newer ZCode release:

```bash
bash patch-linux.sh --probe
```

If the new version has a verified profile and the Linux bundle still satisfies all anchors, postconditions, syntax checks, and critical invariants, then run:

```bash
bash patch-linux.sh --install
```

If it does not pass, the helper aborts and leaves both the official AppImage and the currently installed patched AppDir untouched.

## Current scope

The first Linux implementation targets x86-64 AppImage installations. It intentionally does not patch a live `/tmp/.mount_zcode.*` mount and does not overwrite the official AppImage. Repacking a new AppImage can be added later; the extracted AppDir is simpler to test and keeps rollback trivial.

## Notes

The underlying OpenAI integration is still the existing project integration: it uses the public Codex CLI OAuth client and observed ChatGPT/Codex backend behavior rather than the official OpenAI API billing path. Follow OpenAI and ZCode terms of service and expect undocumented behavior to change.
