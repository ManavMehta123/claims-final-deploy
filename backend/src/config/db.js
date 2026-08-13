const mongoose = require("mongoose");

// Opens (and caches) the Mongoose connection. Called once from server.js
// before the HTTP server starts listening, only when USE_DB=true.
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set. Add it to backend/.env (see .env.example).");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  console.log(`MongoDB connected -> ${mongoose.connection.name}`);

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected.");
  });

  return mongoose.connection;
}

module.exports = connectDB;
