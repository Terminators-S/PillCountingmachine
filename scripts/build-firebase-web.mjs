import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE || 'true',
  NEXT_PUBLIC_ENABLE_FIREBASE_AUTH: process.env.NEXT_PUBLIC_ENABLE_FIREBASE_AUTH || 'true',
  NEXT_PUBLIC_STATIC_EXPORT: 'true',
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
            stdio: 'inherit',
            env,
          })
        : spawn(command, args, {
            stdio: 'inherit',
            env,
          });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

await run('npm', ['run', 'build', '-w', '@pillcount/shared']);
await run('npm', ['run', 'build', '-w', '@pillcount/ui']);
await run('npm', ['run', 'build', '-w', '@pillcount/web']);
