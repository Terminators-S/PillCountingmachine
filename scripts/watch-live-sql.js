const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = process.cwd();
const sqlFile = path.join(rootDir, 'data', 'live-edit.sql');
const sqlDir = path.dirname(sqlFile);
const sqlBase = path.basename(sqlFile);
const applyScript = path.join(rootDir, 'scripts', 'apply-live-sql.ps1');

let applyTimer = null;
let applyRunning = false;
let pendingApply = false;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  process.stdout.write(`[db:watch ${timestamp}] ${message}\n`);
}

function runApply() {
  if (applyRunning) {
    pendingApply = true;
    return;
  }

  applyRunning = true;
  pendingApply = false;
  log(`applying ${path.relative(rootDir, sqlFile)} to live PostgreSQL`);

  const child = spawn(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      applyScript,
      '-SqlFile',
      path.relative(rootDir, sqlFile)
    ],
    {
      cwd: rootDir,
      stdio: 'inherit'
    }
  );

  child.on('exit', (code) => {
    applyRunning = false;

    if (code === 0) {
      log('apply complete');
    } else {
      log(`apply failed with exit code ${code}`);
    }

    if (pendingApply) {
      scheduleApply();
    }
  });
}

function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(runApply, 300);
}

if (!fs.existsSync(sqlFile)) {
  process.stderr.write(`SQL file not found: ${sqlFile}\n`);
  process.exit(1);
}

if (!fs.existsSync(applyScript)) {
  process.stderr.write(`Apply script not found: ${applyScript}\n`);
  process.exit(1);
}

log(`watching ${path.relative(rootDir, sqlFile)}`);
log('save the file in VS Code to apply changes automatically');

const watcher = fs.watch(sqlDir, { persistent: true }, (_eventType, filename) => {
  if (!filename) {
    return;
  }

  if (String(filename).toLowerCase() !== sqlBase.toLowerCase()) {
    return;
  }

  scheduleApply();
});

process.on('SIGINT', () => {
  watcher.close();
  log('watcher stopped');
  process.exit(0);
});
