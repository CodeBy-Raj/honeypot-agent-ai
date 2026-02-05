import express from "express";

const app = express();

// Health check endpoint for deployment platforms
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use(express.json());

export default app;
