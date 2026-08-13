require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { useDb } = require("./src/repositories");
const { getPortCandidates } = require("./src/config/port");

const PORT = Number(process.env.PORT || 5000);
const FALLBACK_PORTS = [5001, 5002, 5003];

async function start() {
  if (useDb) {
    await connectDB();
  }

  const ports = getPortCandidates(PORT, FALLBACK_PORTS);

  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
          console.log(
            `Claims Management API listening on port ${port} [${useDb ? "STATEFUL/MongoDB" : "STATELESS/in-memory"}]`
          );
          resolve(server);
        });
        server.on("error", reject);
      });
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") {
        throw error;
      }
      console.warn(`Port ${port} is busy, trying ${port + 1}...`);
    }
  }

  throw new Error("No available port found for the backend server.");
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
