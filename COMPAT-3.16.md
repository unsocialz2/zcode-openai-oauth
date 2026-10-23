# ZCode 3.16.x compatibility investigation

## Status

- **3.16.2:** upstream patch engine and exact-version profile imported from [Bascter-Main/zcode-openai-oauth](https://github.com/Bascter-Main/zcode-openai-oauth). Linux/AppImage end-to-end behavior has not yet been validated.
- **3.16.3:** **NOT VERIFIED** and intentionally **NOT deployable**. Do not run `--update` against 3.16.3 until a reviewed exact-version profile has passed all compatibility checks and an isolated runtime smoke test.
- Existing 3.15.3 OAuth installation is not modified by any command below.

## What the first 3.16.3 probe found

Using the 3.15.3 profile:
- Host: 10/10 resolved
- Renderer: 7/10 resolved
- GLM: 5/5 resolved
- Failed renderer resolvers: `openai.callbackIdentity`, `openai.connectCard`, `openai.hideManagedFields`

Upstream 3.16.2 introduced new renderer handling (notably model-menu family presentation) and revised callback and connection UI matching. Before creating a 3.16.3 profile, test these newer changes against the **actual** 3.16.3 Linux AppImage.

## Safe 3.16.3 candidate test on Fedora

```bash
cd ~/Downloads/zcode-openai-oauth-test
git fetch origin
git switch compat-zcode-3.16
bash patch-linux.sh --probe-candidate 3.16.2 --appimage "$HOME/Downloads/ZCode-3.16.3-linux-x64.AppImage"
```

This command:
1. Extracts a temporary copy of the 3.16.3 AppImage.
2. Applies the **3.16.2 profile as a candidate only**.
3. Checks every resolver, JavaScript syntax, postcondition, critical semantic invariant and the final `app.asar` repack.
4. Deletes temporary output.

**It does not register 3.16.3 as a verified version and cannot deploy or overwrite the official or patched app.** Exit code 0 only means the static candidate test passed; it is not proof that OAuth and model switching work at runtime.

If it passes, the next step is a dedicated 3.16.3 profile with strict tests and a **separately installed** smoke-test build. Keep the existing working version until the test is confirmed.

## Notes

Keep candidate validation distinct from production deployment. The exact-version policy is intentional: minified app structures can change between patch releases, even if most of the anchors survive.
