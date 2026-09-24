// Offline #94 timing probe. Records source-free process and IPC boundaries only.
const fs = require('node:fs');
const net = require('node:net');
const childProcess = require('node:child_process');
const { basename } = require('node:path');
const { syncBuiltinESMExports } = require('node:module');

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
      const write = socket.write;
      socket.write = function (chunk, ...rest) {
        if (operation === undefined) {
          try {
            const parsed = JSON.parse(String(chunk).split('\n')[0]);
            if (['hello', 'admit', 'collect', 'acknowledge', 'finalize'].includes(parsed.operation)) {
              operation = parsed.operation;
              record('ipc-send', { operation });
            }
          } catch { /* only an operation label may be recorded */ }
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
          if (typeof parsed.status === 'string') record('ipc-receive', { operation, status: parsed.status });
        } catch { /* no response payload is retained */ }
        response = '';
        operation = undefined;
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
        } catch { /* payload discarded */ }
      }
      return writeFileSync.call(this, path, data, ...rest);
    };
  }
  syncBuiltinESMExports();
}
