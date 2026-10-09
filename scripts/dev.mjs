import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
    spawn(npmCommand, ['run', 'dev:client'], { stdio: 'inherit' }),
    spawn(npmCommand, ['run', 'server'], { stdio: 'inherit' }),
];

let stopping = false;

function stop(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    children.forEach((child) => child.kill('SIGTERM'));
    process.exitCode = exitCode;
}

children.forEach((child) => {
    child.on('exit', (code, signal) => {
        if (stopping) return;
        const exitCode = code ?? (signal ? 1 : 0);
        stop(exitCode);
    });
});

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
