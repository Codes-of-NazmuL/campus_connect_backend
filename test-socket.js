const { io } = require("socket.io-client");
const jwt = require("jsonwebtoken");

const token = jwt.sign({ id: "test", role: "STUDENT" }, "super_secret_key_change_me");

const socket = io("http://localhost:3000", {
  auth: { token },
  transports: ["websocket"]
});

socket.on("connect", () => {
  console.log("Connected to socket server");
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("Timeout");
  process.exit(1);
}, 3000);
