const http = require("http");
const { Server } = require("socket.io");
const app = require("./src/app");

const PORT = process.env.PORT || 5000;

// HTTP server create
const server = http.createServer(app);

// Socket.io attach
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// store worker sockets
const workers = {};

// make accessible inside app routes
app.set("io", io);
app.set("workers", workers);

io.on("connection", (socket) => {

  console.log("Client connected:", socket.id);

  // Worker registers with their ID
  socket.on("register_worker", (workerId) => {

    workers[workerId] = socket.id;

    console.log("Worker registered:", workerId);

  });

  socket.on("disconnect", () => {

    for (const workerId in workers) {
      if (workers[workerId] === socket.id) {
        delete workers[workerId];
      }
    }

    console.log("Client disconnected:", socket.id);

  });

  // Worker sends live location
socket.on("worker_location", (data) => {

  const { workerId, lat, lng } = data;

  // broadcast location to all clients
  io.emit("worker_location_update", {
    workerId,
    lat,
    lng
  });

});
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});