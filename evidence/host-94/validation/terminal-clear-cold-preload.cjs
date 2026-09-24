// Offline #94 ticketed terminal-clear probe. Retains only fixed IPC labels and timings.
const fs = require('node:fs');
const net = require('node:net');
const childProcess = require('node:child_process');
const { basename } = require('node:path');
const { syncBuiltinESMExports } = require('node:module');
const { ipcStatusLabel } = require('./terminal-clear-cold-status.cjs');

const log = process.env.HAPSLAND_94_TIMING_LOG;
if (log) {
  const executable = basename(process.argv[1] || 'unknown');
  const role = executable === 'cli.js' && process.argv.includes('--claude-hook') ? 'hook-cli'
    : executable === 'main.js' ? 'resident'
    : executable === 'bridge.mjs' ? 'bridge'
    : executable === 'host-session.mjs' ? 'runner'
    : executable === 'scripted-host.mjs' ? 'scripted-host' : 'other';
  const record = (event, extra = {}) => {
    if (role === 'other') return;
    fs.appendFileSync(log, JSON.stringify({ role, pid: process.pid, ppid: process.ppid,
      event, atMs: Date.now(), ...extra }) + '\n');
  };
  record('preload');
  process.once('exit', () => record('exit'));

  if (role === 'hook-cli') {
    const readSync = fs.readSync;
    let firstRead = true;
    fs.readSync = function (...args) {
      if (firstRead) { firstRead = false; record('first-read'); }
      return readSync.apply(this, args);
    };
    const spawn = childProcess.spawn;
    childProcess.spawn = function (command, args, options) {
      if (Array.isArray(args) && args.some(arg => typeof arg === 'string' &&
        (arg.endsWith('/resident/main.js') || arg.endsWith('/resident/main.ts')))) {
        record('resident-spawn');
      }
      return spawn.call(this, command, args, options);
    };
    const connect = net.connect;
    net.connect = function (...args) {
      const socket = connect.apply(this, args);
      let operation;
      let requestVersion;
      const write = socket.write;
      socket.write = function (chunk, ...rest) {
        if (operation === undefined) {
          try {
            const parsed = JSON.parse(String(chunk).split('\n')[0]);
            if (['hello', 'admit', 'collect', 'acknowledge', 'finalize'].includes(parsed.operation)) {
              operation = parsed.operation;
              requestVersion = Number.isInteger(parsed.version) ? parsed.version : null;
              record('ipc-send', { operation, version: requestVersion });
            }
          } catch { /* only operation labels and protocol versions are retained */ }
        }
        return write.call(this, chunk, ...rest);
      };
      let response = '';
      socket.on('data', chunk => {
        if (operation === undefined || response.length > 262144) return;
        response += chunk.toString();
        const newline = response.indexOf('\n');
        if (newline < 0) return;
        try {
          const parsed = JSON.parse(response.slice(0, newline));
          if (typeof parsed.status === 'string') record('ipc-receive', {
            operation, version: Number.isInteger(parsed.version) ? parsed.version : requestVersion,
            status: ipcStatusLabel(parsed.status),
          });
        } catch { /* response payload and ticket are discarded */ }
        response = '';
        operation = undefined;
        requestVersion = undefined;
      });
      return socket;
    };
  }
  if (role === 'resident') {
    const writeFileSync = fs.writeFileSync;
    fs.writeFileSync = function (path, data, ...rest) {
      if (typeof data === 'string' && data.length < 16_384) {
        try {
          const marker = JSON.parse(data);
          if (marker.kind === 'activity' &&
            ['pending', 'skipped', 'clear', 'findings', 'unavailable', 'incomplete'].includes(marker.stage)) {
            record('activity', { stage: marker.stage });
          }
        } catch { /* only a fixed activity stage may be retained */ }
      }
      return writeFileSync.call(this, path, data, ...rest);
    };
  }
  syncBuiltinESMExports();
}
