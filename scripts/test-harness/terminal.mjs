// macOS script requires terminal stdin; this relay accepts test-runner pipes.
export const terminalAvailable = process.platform === "linux" || process.platform === "darwin"
export const terminalCommand = process.platform === "darwin" ? "/usr/bin/python3" : "script"
const relay = `import os, pty, select, sys
pid, master = pty.fork()
if pid == 0:
    os.execl('/bin/sh', 'sh', '-c', sys.argv[1])
os.set_blocking(master, False)
inputs = [master, 0]
while True:
    readable, _, _ = select.select(inputs, [], [], 0.01)
    for fd in readable:
        try:
            data = os.read(fd, 4096)
        except OSError:
            data = b''
        if not data:
            inputs.remove(fd)
        elif fd == master:
            os.write(1, data)
        else:
            os.write(master, data)
    exited, status = os.waitpid(pid, os.WNOHANG)
    if exited:
        while True:
            try:
                data = os.read(master, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(1, data)
        os.close(master)
        sys.exit(os.waitstatus_to_exitcode(status))
`
export const terminalArguments = (command) =>
  process.platform === "darwin" ? ["-c", relay, command] : ["-qfec", command, "/dev/null"]
