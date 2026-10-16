# ZCode OpenAI OAuth Patcher

[中文](README.md) | **English**

Adds a built-in **OpenAI model provider** to the ZCode desktop app. Sign in with a ChatGPT subscription through OAuth and use the GPT models enabled for that account without replacing the existing Z.ai / BigModel application identity.

## Platform status

| Platform | Status |
|---|---|
| Windows | Supported by the original static/runtime patch flows |
| Linux AppImage | Supported by the isolated AppDir flow in `patch-linux.sh` |

### Verified versions

**Windows profiles:** ZCode **3.10.2, 3.11.2, 3.14.3, 3.14.5, 3.15.3**.

**Linux end-to-end:** ZCode **3.15.3 AppImage** on **Fedora Linux 44 x86-64**, Node.js **22.23.1**. The real test passed the 25/25 compatibility probe, full patch/repack dry-run, patched AppDir launch, OpenAI provider UI, browser OAuth, model connection, and preservation of existing MCP/skill discovery.

A profile being verified on Windows does not automatically make its Linux bundle verified. Linux releases should pass the same probe, dry-run and runtime test before being listed as verified.

## Linux / AppImage quick start

The Linux flow **never modifies the official AppImage**. It extracts a temporary copy, validates the exact-version profile, creates a separate patched AppDir, and keeps the previous patched AppDir for rollback.

```bash
git clone https://github.com/unsocialz2/zcode-openai-oauth.git
cd zcode-openai-oauth

bash patch-linux.sh --probe
bash patch-linux.sh --dry-run
bash patch-linux.sh --install
zcode-openai-oauth
```

Default source AppImage:

```text
~/.local/bin/zcode.AppImage
```

Default patched build:

```text
~/.local/share/zcode-openai-oauth/ZCode.AppDir
```

Default launcher:

```text
~/.local/bin/zcode-openai-oauth
```

After launch, open **Settings -> Model Providers -> OpenAI -> Connect OpenAI** and complete authorization in the browser.

For custom AppImage locations:

```bash
bash patch-linux.sh --probe --appimage /path/to/ZCode.AppImage
```

See [LINUX.md](LINUX.md) for the full Linux workflow.

## Safe Linux updates

The helper records the source AppImage hash and the installed ZCode version.

```bash
bash patch-linux.sh --status
```

After replacing the official AppImage with a newer ZCode release:

```bash
bash patch-linux.sh --probe
bash patch-linux.sh --update
```

If the new release has no verified profile or any required structure changed, the probe fails closed and the currently working patched AppDir is left untouched.

Rollback to the previous patched AppDir:

```bash
bash patch-linux.sh --rollback
```

This makes updates safer, but it does **not** remove the exact-version compatibility requirement. Major ZCode changes can still require a new profile.

## Windows quick start

```bat
git clone https://github.com/unsocialz2/zcode-openai-oauth.git
cd zcode-openai-oauth
patch.bat
```

`patch.bat` requires Node.js 18 or later. It installs the pinned asar dependency, extracts `app.asar`, applies the verified profile, checks modified JavaScript, repacks, deploys both runtime components transactionally, and restarts ZCode.

Useful Windows/static-patcher commands:

```bat
node patch.js --probe
node patch.js --dry-run
node patch.js --no-deploy
node patch.js --self-test
node patch.js --restore
node patch.js --dir <path>
```

## Current features

- OpenAI is a dedicated top-level provider and does not replace the Z.ai / BigModel application account.
- Connect and disconnect actions are available from the OpenAI provider page.
- The model list is fetched dynamically from the Codex catalog and follows the connected account/workspace entitlements.
- Managed provider identity, endpoint and OAuth credential fields are protected from accidental editing while model management remains available.
- User-added models, explicit manual rules, context-window overrides, order and unrelated provider settings are preserved during catalog refresh.
- Catalog sync occurs after connection, at startup, after token refresh and on manual provider refresh.
- The Codex client version is discovered from public `@openai/codex` metadata and cached.
- Requests use the Responses API compatibility behavior required by the subscription backend, including `store:false` and streaming.

## Compatibility policy

The project intentionally fails closed.

- **Verified versions:** exact profile identity plus required anchors/resolvers, syntax checks, postconditions, critical invariants and isolated repack must pass.
- **Structural candidates:** `--probe` can show what still locates on a new version, but it does not turn that version into a deployable profile.
- **Unknown versions:** install/update/deploy is refused until a verified profile exists.
- **No fuzzy patching:** minified identifiers are not guessed and ambiguous matches are rejected.

The newer profiles use structural resolvers where possible, while older profiles may use semantic transforms plus exact anchors. This reduces maintenance across small minifier changes, but it cannot guarantee compatibility with arbitrary future ZCode releases.

## Runtime patch mode on Windows (experimental)

The repository also contains the original runtime-patch mode for Windows. It applies supported transforms at load time where possible and retains strict flat patches for components that cannot be intercepted safely.

```bat
node runtime/install-runtime.js --dir "D:\Program Files\ZCode"
node runtime/verify-runtime.js --dir "D:\Program Files\ZCode"
node runtime/install-runtime.js --dir "D:\Program Files\ZCode" --restore
```

## How it works

| Layer | Implementation |
|---|---|
| OAuth | Public Codex CLI client with PKCE S256 and loopback callback on `127.0.0.1:1455` |
| Model catalog | Reads the ChatGPT/Codex model catalog using the connected account token and account ID |
| Model merge | Server-managed catalog entries are synchronized while user-managed rules are preserved |
| Requests | Responses API compatibility path with subscription-backend-safe parameters |
| UI | Dedicated OpenAI provider/settings/model groups and connect/disconnect controls |
| Linux packaging | Official AppImage -> temporary extraction -> strict probe/patch/repack -> separate patched AppDir |

## Repository layout

- `patch.js` — core static patch engine, profiles, probing, repacking and Windows deployment
- `patch-core.cjs` — shared semantic transforms, structural resolvers and critical invariants
- `profiles/` — exact-version compatibility profiles
- `transforms/` — semantic transform definitions
- `runtime/` — experimental Windows runtime-patch mode
- `linux-appimage.js` — Linux/AppImage extraction, validation, install, status, update and rollback helper
- `patch-linux.sh` — Linux entry point that installs pinned dependencies when needed
- `LINUX.md` — Linux-specific documentation and tested matrix

## CI

Linux CI validates the Linux helper syntax, shell entry point, help surface and the patcher's fixture/behavior self-tests on Node 22.

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

This project is intended for learning and research. It uses the public Codex CLI OAuth client and observed ChatGPT/Codex backend behavior rather than the normal OpenAI API billing path. Follow OpenAI and ZCode terms of service. Undocumented behavior may change, and you are responsible for account-related consequences of using the patch.
