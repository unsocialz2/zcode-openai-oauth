# ZCode 3.16.x compatibility

## Status

| ZCode version | Static compatibility | Linux runtime |
|---|---|---|
| 3.16.2 | Upstream verified profile imported | Not verified on Fedora |
| 3.16.3 | **26/26 strict candidate transforms, JS syntax, postconditions and isolated repack passed** on the real Fedora x64 AppImage | **Pending end-to-end OAuth and model/tool flow validation** |

The 3.16.3 exact-version profile uses the same patch specifications as upstream 3.16.2. This is **intentional**: a separate `3.16.3` profile is registered only after its **actual AppImage** passed cross-version candidate validation. It is still strictly rechecked against the real binaries on every `--probe` or `--update`; the index contains no version wildcards.

## Fedora 44 / ZCode 3.16.3 field results

Test command:

```bash
bash patch-linux.sh --probe-candidate 3.16.2 \
  --appimage "$HOME/Downloads/ZCode-3.16.3-linux-x64.AppImage"
```

Actual observed output:

```text
[CANDIDATE] ZCode 3.16.3 with template zcode-3.16.2
[prepared] host.main (index.js): 10 spans
[prepared] renderer.icons (styles-CQuzX8si.js): 11 spans
[prepared] GLM: 5 spans
packing staged app.asar...
[CANDIDATE PASS] 26/26 transforms, syntax, postconditions and repack validated.
[CANDIDATE ONLY] Source AppImage and installed ZCode were not modified.
```

## Upgrade the existing OAuth install

1. Update the patcher, then run the strict **exact-profile** compatibility probe:

```bash
cd ~/Downloads/zcode-openai-oauth-test
git pull --ff-only
bash patch-linux.sh --probe --appimage "$HOME/Downloads/ZCode-3.16.3-linux-x64.AppImage"
```

2. Only if the strict probe passes, close ZCode completely and replace the patched AppDir:

```bash
bash patch-linux.sh --update --appimage "$HOME/Downloads/ZCode-3.16.3-linux-x64.AppImage"
```

3. Launch the patched app via `zcode-openai-oauth` or the mapped desktop icon. Verify:
   - OpenAI provider and connection status.
   - Browser OAuth/refresh, sending a message, model selection and model switching.
   - MCP and skills availability.
   - Original Z.ai provider still works.

The helper validates before replacing the installed AppDir. The previous patched version is retained as `ZCode.AppDir.previous`. The original AppImage is **not** overwritten. The path used for the source AppImage is recorded in the installed build metadata.

If the new patched app fails, close it fully and restore the previous one:

```bash
bash patch-linux.sh --rollback
```

To check source status for the downloaded 3.16.3 AppImage, specify the same file:

```bash
bash patch-linux.sh --status --appimage "$HOME/Downloads/ZCode-3.16.3-linux-x64.AppImage"
```

Do not confuse a passing candidate probe with verified runtime operation; only field tests after update can establish end-to-end compatibility.
