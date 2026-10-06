import { createServer, connect } from "node:net"
const port = 30000 + (process.pid % 20000)
const server = createServer((socket) => socket.on("data", (data: Buffer) => socket.end(data)))
server.listen(port, "127.0.0.1", () => {
  const socket = connect({ host: "127.0.0.1", port }, () => socket.write("port IPC works"))
  socket.on("data", (data: Buffer) => {
    console.log(data.toString("utf8"))
    socket.destroy()
    server.close()
  })
})
