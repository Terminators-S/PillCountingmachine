const { execFileSync } = require('node:child_process');

if (!process.env.VERCEL) {
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

execFileSync(npmCommand, ['run', 'prisma:generate'], {
  stdio: 'inherit'
});
