#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

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
    stdio: 'inherit',
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

function extractAppImage(appImage, workDir) {
  console.log(`extracting AppImage: ${appImage}`);
  run(appImage, ['--appimage-extract'], { cwd: workDir });
  const root = path.join(workDir, 'squashfs-root');
  const asarPath = path.join(root, 'resources', 'app.asar');
  const glmPath = path.join(root, 'resources', 'glm', 'zcode.cjs');
  if (!fs.existsSync(asarPath) || !fs.existsSync(glmPath)) {
    throw new Error('extracted AppImage does not contain resources/app.asar and resources/glm/zcode.cjs');
  }
  return root;
}

function runPatcher(root, mode) {
  const patchArgs = [PATCHER, '--dir', root];
  if (mode === 'probe') patchArgs.push('--probe');
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

function usage() {
  console.log(`ZCode OpenAI OAuth Linux/AppImage helper\n\n` +
`Usage:\n` +
`  node linux-appimage.js --probe [--appimage <path>]\n` +
`  node linux-appimage.js --dry-run [--appimage <path>]\n` +
`  node linux-appimage.js --install [--appimage <path>] [--output-dir <path>] [--launch]\n` +
`  node linux-appimage.js --launch-only [--output-dir <path>]\n\n` +
`Options:\n` +
`  --appimage <path>   Source ZCode AppImage. Default: ~/.local/bin/zcode.AppImage\n` +
`  --output-dir <path> Patched extracted AppDir. Default: ~/.local/share/zcode-openai-oauth/ZCode.AppDir\n` +
`  --launcher <path>   Launcher created on --install. Default: ~/.local/bin/zcode-openai-oauth\n` +
`  --no-launcher       Do not create/update the launcher\n` +
`  --launch            Launch the patched AppDir after install\n` +
`  --keep-temp         Keep the temporary extraction directory for debugging\n` +
`  --help              Show this help\n\n` +
`The source AppImage is never modified.`);
}

function main() {
  assertLinux();
  if (args.includes('--help') || args.includes('-h')) return usage();

  const outputDir = path.resolve(expandHome(argValue('--output-dir') ||
    path.join(os.homedir(), '.local', 'share', 'zcode-openai-oauth', 'ZCode.AppDir')));
  const launcherPath = path.resolve(expandHome(argValue('--launcher') ||
    path.join(os.homedir(), '.local', 'bin', 'zcode-openai-oauth'));

  if (args.includes('--launch-only')) {
    launch(outputDir);
    console.log(`launched: ${outputDir}`);
    return;
  }

  const modes = ['--probe', '--dry-run', '--install'].filter(flag => args.includes(flag));
  if (modes.length !== 1) {
    usage();
    die('choose exactly one of --probe, --dry-run, or --install');
  }

  const mode = modes[0].slice(2);
  const appImageArg = argValue('--appimage');
  const appImage = appImageArg
    ? path.resolve(expandHome(appImageArg))
    : existingDefaultAppImage();
  validateAppImage(appImage);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-openai-appimage-'));
  try {
    const root = extractAppImage(appImage, workDir);
    console.log(`extracted AppDir: ${root}`);

    if (mode === 'probe') {
      runPatcher(root, 'probe');
      console.log('\n[OK] Linux AppImage compatibility probe passed. Source AppImage was untouched.');
      return;
    }

    if (mode === 'dry-run') {
      runPatcher(root, 'dry-run');
      console.log('\n[OK] Linux AppImage dry-run passed. Source AppImage was untouched.');
      return;
    }

    // Install is deliberately two-phase: strict read-only probe, then validated
    // no-deploy output. The Windows deployment/restart path is never used.
    runPatcher(root, 'probe');
    runPatcher(root, 'prepare');
    promotePreparedFiles(root);

    fs.writeFileSync(path.join(root, 'zcode-openai-oauth-linux.json'), JSON.stringify({
      sourceAppImage: appImage,
      patchedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
    }, null, 2) + '\n');

    safeReplaceDirectory(root, outputDir);
    if (!args.includes('--no-launcher')) {
      writeLauncher(outputDir, launcherPath);
      console.log(`launcher: ${launcherPath}`);
    }

    console.log(`\n[OK] Patched Linux AppDir installed at: ${outputDir}`);
    console.log(`Original AppImage remains unchanged at: ${appImage}`);
    console.log(`Run patched ZCode with: ${args.includes('--no-launcher') ? path.join(outputDir, 'AppRun') : launcherPath}`);

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
