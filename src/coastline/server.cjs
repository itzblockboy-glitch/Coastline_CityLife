const express = require("express"),
  http = require("http"),
  { Server } = require("socket.io");
const app = express(),
  server = http.createServer(app),
  io = new Server(server, {
    maxHttpBufferSize: 16384,
    cors: {
      origin: ["https://appassets.androidplatform.net"],
      methods: ["GET", "POST"],
    },
  });
app.use(require("compression")());
app.use(express.static("public", { maxAge: "1d" }));
app.use("/vendor/three", express.static("node_modules/three"));
app.use("/vendor", express.static("node_modules/three/examples/jsm"));
const rooms = new Map();
io.on("connection", (s) => {
  let room = null;
  const leave = () => {
    if (room) {
      s.to(room).emit("left", s.id);
      rooms.get(room)?.delete(s.id);
      if (!rooms.get(room)?.size) rooms.delete(room);
      s.leave(room);
      room = null;
    }
  };
  s.on("join", (d, cb) => {
    if (!d || typeof d !== "object" || typeof cb !== "function") return;
    let code =
      String(d.code || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) || Math.random().toString(36).slice(2, 7).toUpperCase();
    if ((rooms.get(code)?.size || 0) >= 6)
      return cb({ error: "This room is full (6 players)." });
    leave();
    room = code;
    if (!rooms.has(room)) rooms.set(room, new Map());
    const p = {
      id: s.id,
      name: String(d.name || "Traveler").slice(0, 18),
      state: [-57, 0, 76, 0, -1, 0],
    };
    const peers = [...rooms.get(room).values()];
    rooms.get(room).set(s.id, p);
    s.join(room);
    cb({ code, id: s.id, peers });
    s.to(room).emit("peer", p);
  });
  let last = 0;
  s.on("state", (v) => {
    if (
      !room ||
      Date.now() - last < 70 ||
      !Array.isArray(v) ||
      v.length !== 6 ||
      !v.every(Number.isFinite)
    )
      return;
    last = Date.now();
    let p = rooms.get(room)?.get(s.id);
    if (p) p.state = v;
    s.to(room).volatile.emit("state", { id: s.id, v });
  });
  s.on("signal", (d) => {
    if (!d || typeof d !== "object") return;
    if (room && rooms.get(room)?.has(d.to))
      io.to(d.to).emit("signal", { from: s.id, data: d.data });
  });
  s.on("disconnect", leave);
  s.on("leave", leave);
});
server.listen(3000, "0.0.0.0", () => console.log("Coastline live on 3000"));
