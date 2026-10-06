import { connectResidentPort } from "../src/resident/port.ts"
const socket = connectResidentPort({ port: 9, certificate: "unused", token: "0".repeat(64) }, (connection) =>
  connection.destroy()
)
socket.on("error", () => socket.destroy())
