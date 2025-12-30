import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/database.js";
import { getUpcomingExecutions, getExecutionStats } from "./services/scheduler.js";
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

// Scheduler endpoints
app.get("/api/scheduler/upcoming", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const upcoming = await getUpcomingExecutions(limit);
    res.json({ success: true, upcoming });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch upcoming executions" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getExecutionStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

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

    console.log("\n📋 Available Endpoints:");
    console.log("   GET  /health              - Health check");
    console.log("   GET  /api/agents          - List agents");
    console.log("   GET  /api/agents/:id      - Get agent details");
    console.log("   POST /api/agents/dca      - Create DCA agent");
    console.log("   PATCH /api/agents/:id     - Update agent");
    console.log("   DELETE /api/agents/:id    - Cancel agent");
    console.log("   GET  /api/agents/:id/logs - Get execution logs");
    console.log("   POST /api/agents/:id/execute - Manual execution");
    console.log("   POST /api/agents/trigger  - Trigger all due agents");
    console.log("   GET  /api/agents/due      - Get due agents");
    console.log("   GET  /api/scheduler/upcoming - Upcoming executions");
    console.log("   GET  /api/stats           - Execution statistics\n");
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

main();
