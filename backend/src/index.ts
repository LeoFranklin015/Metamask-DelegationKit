import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/database.js";
import agentsRouter from "./routes/agents.js";

// ============================================
// Express App Setup
// ============================================

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============================================
// Routes
// ============================================

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Agents API
app.use("/api/agents", agentsRouter);


// ============================================
// Start Server
// ============================================

async function main() {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   API: http://localhost:${PORT}/api/agents`);
    });

    console.log("\n📋 Available Endpoints (Indexer Only):");
    console.log("   GET  /health              - Health check");
    console.log("   GET  /api/agents          - List agents");
    console.log("   GET  /api/agents/:id      - Get agent details");
    console.log("   POST /api/agents/dca      - Create DCA agent");
    console.log("   PATCH /api/agents/:id     - Update agent");
    console.log("   DELETE /api/agents/:id    - Cancel agent");
    console.log("   GET  /api/agents/:id/logs - Get execution logs");
    console.log("   POST /api/agents/:id/log  - Add execution log (from agent)");
    console.log("   GET  /api/agents/due      - Get due agents\n");
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

main();
