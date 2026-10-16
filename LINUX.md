# Linux / AppImage support

The Linux workflow patches an extracted copy of the official ZCode AppImage and keeps the original AppImage untouched.

It reuses the existing exact-version compatibility profiles and patch engine. If the Linux bundle does not satisfy the verified profile, the helper fails closed before replacing the currently installed patched AppDir.

## Verified Linux environment

End-to-end verified on:

| Component | Verified value |
|---|---|
| Distribution | Fedora Linux 44 (KDE Plasma) |
| Architecture | x86-64 |
| ZCode | 3.15.3 AppImage |
| Node.js | 22.23.1 |
| Compatibility probe | 25/25 anchors, syntax and postconditions passed |
| Dry run | patch + syntax validation + isolated `app.asar` repack passed |
| Installed build | patched extracted AppDir launched successfully |
| OpenAI flow | provider UI, browser OAuth, connection and model flow verified |
| Existing ZCode tooling | MCPs and skills remained available after patching |

Linux support for other ZCode versions is only considered verified after the same probe, dry-run and runtime flow passes. Windows has its own verified-version matrix in the main README.

## Safety model

- The source `zcode.AppImage` is never modified.
- `--probe` is read-only against a temporary extracted copy.
- `--dry-run` fully patches and repacks only inside a temporary directory.
- `--install` first runs the strict compatibility probe, then creates validated `.patched` outputs and promotes them only inside the extracted copy.
- `--update` uses the same fail-closed path as install and only replaces the patched AppDir after validation succeeds.
- The patched Linux build is installed separately from the official AppImage.
- The previous patched AppDir is retained as `ZCode.AppDir.previous` for rollback.
- `--status` compares the current source AppImage hash with the one used for the installed patched build.
- Unknown ZCode versions still fail closed because the exact-version profile policy is unchanged.

## Fedora quick start

For the common install path `~/.local/bin/zcode.AppImage`:

```bash
git clone https://github.com/unsocialz2/zcode-openai-oauth.git
cd zcode-openai-oauth

bash patch-linux.sh --probe
bash patch-linux.sh --dry-run
bash patch-linux.sh --install
```

The default patched AppDir is:

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

Then open:

```text
Settings -> Model Providers -> OpenAI -> Connect OpenAI
```

and complete the browser OAuth flow.

To install and immediately launch:

```bash
bash patch-linux.sh --install --launch
```

## Maintenance commands

Check the currently installed patched build and whether the official source AppImage changed:

```bash
bash patch-linux.sh --status
```

After replacing the official AppImage with a newer ZCode release:

```bash
# 1. Never update the patched AppDir blindly.
bash patch-linux.sh --probe

# 2. If the probe passes, rebuild from the new official AppImage.
bash patch-linux.sh --update

# 3. Launch the updated patched build.
zcode-openai-oauth
```

If `--probe` fails because the new ZCode version has no verified profile or its structure changed, the helper stops. The official AppImage and the currently working patched AppDir stay untouched.

If an update installs successfully but you still want the previous patched build back:

```bash
bash patch-linux.sh --rollback
```

`--rollback` swaps the current AppDir with `ZCode.AppDir.previous`, so running it again swaps back.

A practical update routine is therefore:

```bash
git pull
bash patch-linux.sh --status
bash patch-linux.sh --probe
bash patch-linux.sh --update
```

This does **not** make unknown ZCode releases magically compatible. It makes the update path safe: probe first, replace only on verified compatibility, keep a rollback copy, and leave the official AppImage untouched.

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

## Useful npm aliases

```bash
npm run linux:probe
npm run linux:dry-run
npm run linux:install
npm run linux:status
npm run linux:update
npm run linux:rollback
```

## Current scope

The first Linux implementation targets x86-64 AppImage installations. It intentionally does not patch a live `/tmp/.mount_zcode.*` filesystem and does not overwrite the official AppImage. The extracted AppDir is simpler to verify and makes rollback straightforward.

## Notes

The OpenAI integration uses the public Codex CLI OAuth client and observed ChatGPT/Codex backend behavior rather than the normal OpenAI API billing path. Follow OpenAI and ZCode terms of service and expect undocumented behavior to change.
