import { openSync } from 'node:fs';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
};
const separator = args.indexOf('--');
if (separator < 0 || separator === args.length - 1)
  throw new Error('command is required after --');
const command = args[separator + 1];
const commandArgs = args.slice(separator + 2);
const env = JSON.parse(Buffer.from(value('--env-b64'), 'base64').toString('utf8'));
const stdout = openSync(value('--stdout'), 'a');
const stderr = openSync(value('--stderr'), 'a');
const child = spawn(command, commandArgs, {
  cwd: value('--cwd'),
  env: { ...process.env, ...env },
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr],
  // Windows .cmd entry points (pnpm.cmd) require the command interpreter;
  // executable binaries remain direct child processes.
  shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
});
child.unref();
process.stdout.write(`${JSON.stringify({ pid: child.pid, command, args: commandArgs })}\n`);
