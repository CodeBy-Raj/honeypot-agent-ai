import express from "express";
import compression from "compression";

const app = express();

// Enable Gzip compression (saves bandwidth/latency on large JSON responses)
app.use(compression({ threshold: 1024 })); // Only compress responses > 1KB
app.disable("x-powered-by"); // Tiny security/size optimization

// Health check endpoint for deployment platforms
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use(express.json());

export default app;
