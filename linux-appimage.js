#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { spawn, spawnSync } = require('child_process');
const asar = require('@electron/asar');

const PROJECT_ROOT = __dirname;
const PATCHER = path.join(PROJECT_ROOT, 'patch.js');
const args = process.argv.slice(2);

function die(message) {
  console.error(`\n[FAIL] ${message}`);
  process.exit(1);
}

function argValue(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) die(`${name} requires a path`);
  return value;
}

function expandHome(value) {
  if (!value) return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function existingDefaultAppImage() {
  const candidates = [
    process.env.ZCODE_APPIMAGE,
    path.join(os.homedir(), '.local', 'bin', 'zcode.AppImage'),
    path.join(os.homedir(), 'Applications', 'zcode.AppImage'),
    path.join(os.homedir(), 'Downloads', 'zcode.AppImage'),
    path.join(os.homedir(), 'Downloads', 'ZCode.AppImage'),
  ].filter(Boolean).map(value => path.resolve(expandHome(value)));
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with status ${result.status}`);
  }
}

function assertLinux() {
  if (process.platform !== 'linux') {
    die(`linux-appimage.js only supports Linux (detected ${process.platform})`);
  }
}

function validateAppImage(appImage) {
  if (!appImage) {
    die('ZCode AppImage not found. Pass --appimage <path> or set ZCODE_APPIMAGE.');
  }
  const stat = fs.statSync(appImage);
  if (!stat.isFile()) die(`not a file: ${appImage}`);
  try {
    fs.accessSync(appImage, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    die(`AppImage must be readable and executable: ${appImage}`);
  }
}

function fileSha256(filePath) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(filePath, 'r');
  try {
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function packageVersion(root) {
  const archive = path.join(root, 'resources', 'app.asar');
  try {
    return JSON.parse(asar.extractFile(archive, 'package.json').toString()).version || '';
  } catch {
    return '';
  }
}

function extractAppImage(appImage, workDir) {
  console.log(`extracting AppImage: ${appImage}`);
  run(appImage, ['--appimage-extract'], {
    cwd: workDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const root = path.join(workDir, 'squashfs-root');
  const asarPath = path.join(root, 'resources', 'app.asar');
  const glmPath = path.join(root, 'resources', 'glm', 'zcode.cjs');
  if (!fs.existsSync(asarPath) || !fs.existsSync(glmPath)) {
    throw new Error('extracted AppImage does not contain resources/app.asar and resources/glm/zcode.cjs');
  }
  return root;
}

function runPatcher(root, mode, candidateVersion = null) {
  const patchArgs = [PATCHER, '--dir', root];
  if (mode === 'probe') patchArgs.push('--probe');
  if (mode === 'probe-candidate') patchArgs.push('--probe', '--candidate-profile', candidateVersion);
  if (mode === 'dry-run') patchArgs.push('--dry-run');
  if (mode === 'prepare') patchArgs.push('--no-deploy');
  run(process.execPath, patchArgs, { cwd: PROJECT_ROOT });
}

function promotePreparedFiles(root) {
  const resources = path.join(root, 'resources');
  const app = path.join(resources, 'app.asar');
  const appPatched = `${app}.patched`;
  const glm = path.join(resources, 'glm', 'zcode.cjs');
  const glmPatched = `${glm}.patched`;
  const appUnpacked = `${app}.unpacked`;
  const patchedUnpacked = `${appPatched}.unpacked`;

  if (!fs.existsSync(appPatched) || !fs.existsSync(glmPatched)) {
    throw new Error('patch preparation completed without expected .patched outputs');
  }

  fs.renameSync(appPatched, app);
  fs.renameSync(glmPatched, glm);

  if (fs.existsSync(patchedUnpacked)) {
    fs.rmSync(appUnpacked, { recursive: true, force: true });
    fs.renameSync(patchedUnpacked, appUnpacked);
  }
}

function safeReplaceDirectory(source, destination) {
  const parent = path.dirname(destination);
  const base = path.basename(destination);
  const staging = path.join(parent, `.${base}.new-${process.pid}`);
  const previous = `${destination}.previous`;

  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`copying patched AppDir to: ${destination}`);
  fs.cpSync(source, staging, { recursive: true, preserveTimestamps: true });

  fs.rmSync(previous, { recursive: true, force: true });
  let movedCurrent = false;
  try {
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, previous);
      movedCurrent = true;
    }
    fs.renameSync(staging, destination);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (movedCurrent && !fs.existsSync(destination) && fs.existsSync(previous)) {
      fs.renameSync(previous, destination);
    }
    throw error;
  }
}

function rollbackDirectory(destination) {
  const previous = `${destination}.previous`;
  if (!fs.existsSync(previous)) {
    die(`no previous patched AppDir found at ${previous}`);
  }
  const temporary = `${destination}.rollback-${process.pid}`;
  fs.rmSync(temporary, { recursive: true, force: true });
  let movedCurrent = false;
  try {
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, temporary);
      movedCurrent = true;
    }
    fs.renameSync(previous, destination);
    if (movedCurrent) fs.renameSync(temporary, previous);
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(temporary)) {
      fs.renameSync(temporary, destination);
    }
    throw error;
  }
}

function writeLauncher(destination, launcherPath) {
  const appRun = path.join(destination, 'AppRun');
  if (!fs.existsSync(appRun)) throw new Error(`AppRun not found in patched AppDir: ${appRun}`);
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  const quoted = appRun.replaceAll("'", "'\\''");
  fs.writeFileSync(launcherPath, `#!/usr/bin/env bash\nexec '${quoted}' "$@"\n`, { mode: 0o755 });
  fs.chmodSync(launcherPath, 0o755);
}

function launch(destination) {
  const appRun = path.join(destination, 'AppRun');
  if (!fs.existsSync(appRun)) die(`patched AppDir not found at ${destination}`);
  const child = spawn(appRun, [], { detached: true, stdio: 'ignore' });
  child.unref();
}

function readMetadata(outputDir) {
  const metadataPath = path.join(outputDir, 'zcode-openai-oauth-linux.json');
  if (!fs.existsSync(metadataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    throw new Error(`invalid Linux install metadata: ${error.message}`);
  }
}

function printStatus(outputDir, appImage) {
  const metadata = readMetadata(outputDir);
  console.log('ZCode OpenAI OAuth Linux status');
  console.log(`patched AppDir: ${outputDir}`);
  console.log(`installed: ${metadata ? 'yes' : 'no'}`);
  if (!metadata) return;

  console.log(`ZCode version: ${metadata.zcodeVersion || 'unknown'}`);
  console.log(`patched at: ${metadata.patchedAt || 'unknown'}`);
  console.log(`source AppImage: ${metadata.sourceAppImage || 'unknown'}`);

  const source = appImage || (metadata.sourceAppImage && path.resolve(expandHome(metadata.sourceAppImage)));
  if (!source || !fs.existsSync(source)) {
    console.log('source status: unavailable');
    return;
  }
  if (!metadata.sourceAppImageSha256) {
    console.log('source status: installed by an older helper; run --update to refresh metadata');
    return;
  }

  const currentHash = fileSha256(source);
  if (currentHash === metadata.sourceAppImageSha256) {
    console.log('source status: unchanged');
  } else {
    console.log('source status: CHANGED — run --probe, then --update if the new version is supported');
  }
}

function usage() {
  console.log(`ZCode OpenAI OAuth Linux/AppImage helper\n\n` +
`Usage:\n` +
`  node linux-appimage.js --probe [--appimage <path>]\n` +
`  node linux-appimage.js --probe-candidate <profile-version> [--appimage <path>]\n` +
`  node linux-appimage.js --dry-run [--appimage <path>]\n` +
`  node linux-appimage.js --install [--appimage <path>] [--output-dir <path>] [--launch]\n` +
`  node linux-appimage.js --update [--appimage <path>] [--output-dir <path>] [--launch]\n` +
`  node linux-appimage.js --status [--appimage <path>] [--output-dir <path>]\n` +
`  node linux-appimage.js --rollback [--output-dir <path>]\n` +
`  node linux-appimage.js --launch-only [--output-dir <path>]\n\n` +
`Options:\n` +
`  --appimage <path>   Source ZCode AppImage. Default: ~/.local/bin/zcode.AppImage\n` +
`  --probe-candidate    Strictly test a known profile on an unknown version. Never installs.\n` +
`  --output-dir <path> Patched extracted AppDir. Default: ~/.local/share/zcode-openai-oauth/ZCode.AppDir\n` +
`  --launcher <path>   Launcher created on install/update. Default: ~/.local/bin/zcode-openai-oauth\n` +
`  --no-launcher       Do not create/update the launcher\n` +
`  --launch            Launch the patched AppDir after install/update\n` +
`  --keep-temp         Keep the temporary extraction directory for debugging\n` +
`  --help              Show this help\n\n` +
`The source AppImage is never modified. Updates fail closed unless the source version has a verified profile.`);
}

function main() {
  assertLinux();
  if (args.includes('--help') || args.includes('-h')) return usage();

  const outputDir = path.resolve(expandHome(argValue('--output-dir') ||
    path.join(os.homedir(), '.local', 'share', 'zcode-openai-oauth', 'ZCode.AppDir')));
  const launcherPath = path.resolve(expandHome(argValue('--launcher') ||
    path.join(os.homedir(), '.local', 'bin', 'zcode-openai-oauth')));

  if (args.includes('--launch-only')) {
    launch(outputDir);
    console.log(`launched: ${outputDir}`);
    return;
  }

  if (args.includes('--rollback')) {
    rollbackDirectory(outputDir);
    if (!args.includes('--no-launcher')) writeLauncher(outputDir, launcherPath);
    console.log(`[OK] rolled back to previous patched AppDir: ${outputDir}`);
    return;
  }

  const appImageArg = argValue('--appimage');
  const appImage = appImageArg
    ? path.resolve(expandHome(appImageArg))
    : existingDefaultAppImage();

  if (args.includes('--status')) {
    printStatus(outputDir, appImage);
    return;
  }

  const modes = ['--probe', '--probe-candidate', '--dry-run', '--install', '--update'].filter(flag => args.includes(flag));
  if (modes.length !== 1) {
    usage();
    die('choose exactly one of --probe, --probe-candidate, --dry-run, --install, or --update');
  }

  const requestedMode = modes[0].slice(2);
  const mode = requestedMode === 'update' ? 'install' : requestedMode;
  validateAppImage(appImage);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-openai-appimage-'));
  try {
    const root = extractAppImage(appImage, workDir);
    const version = packageVersion(root);
    if (!version) throw new Error('could not read ZCode package version from extracted AppImage');
    console.log(`extracted AppDir: ${root}`);
    console.log(`source ZCode version: ${version}`);

    if (mode === 'probe') {
      runPatcher(root, 'probe');
      console.log('\n[OK] Linux AppImage compatibility probe passed. Source AppImage was untouched.');
      return;
    }

    if (mode === 'probe-candidate') {
      const templateVersion = argValue('--probe-candidate');
      if (!templateVersion) die('--probe-candidate requires an exact verified profile version');
      runPatcher(root, 'probe-candidate', templateVersion);
      console.log('\n[CANDIDATE ONLY] Source AppImage and installed ZCode were not modified.');
      return;
    }

    if (mode === 'dry-run') {
      runPatcher(root, 'dry-run');
      console.log('\n[OK] Linux AppImage dry-run passed. Source AppImage was untouched.');
      return;
    }

    // Install/update is deliberately two-phase: strict read-only probe, then
    // validated no-deploy output. The Windows deployment/restart path is never used.
    runPatcher(root, 'probe');
    runPatcher(root, 'prepare');
    promotePreparedFiles(root);

    fs.writeFileSync(path.join(root, 'zcode-openai-oauth-linux.json'), JSON.stringify({
      sourceAppImage: appImage,
      sourceAppImageSha256: fileSha256(appImage),
      zcodeVersion: version,
      patchedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      installMode: requestedMode,
    }, null, 2) + '\n');

    safeReplaceDirectory(root, outputDir);
    if (!args.includes('--no-launcher')) {
      writeLauncher(outputDir, launcherPath);
      console.log(`launcher: ${launcherPath}`);
    }

    console.log(`\n[OK] Patched Linux AppDir ${requestedMode === 'update' ? 'updated' : 'installed'} at: ${outputDir}`);
    console.log(`Original AppImage remains unchanged at: ${appImage}`);
    console.log(`Run patched ZCode with: ${args.includes('--no-launcher') ? path.join(outputDir, 'AppRun') : launcherPath}`);
    console.log(`Rollback target: ${outputDir}.previous`);

    if (args.includes('--launch')) {
      launch(outputDir);
      console.log('patched ZCode launched.');
    }
  } finally {
    if (args.includes('--keep-temp')) {
      console.log(`temporary extraction kept at: ${workDir}`);
    } else {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  die(error && error.stack || String(error));
}
