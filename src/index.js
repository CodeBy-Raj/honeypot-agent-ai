import app from "./app.js";
import { PORT } from "../src/config/env.js";
import honeyPotRoute from "../src/routes/honeypot.js";
import { setGlobalDispatcher, Agent } from "undici";

// Optimize External API Calls (Groq/Tanaos)
// Keeps TCP connections alive to avoid handshake latency (~100ms per request)
const agent = new Agent({
  keepAliveTimeout: 15000,
  connections: null, // Unlimited parallel connections
});
setGlobalDispatcher(agent);

app.use("/api", honeyPotRoute);

app.listen(PORT, () => {
  console.log("Server is listening to port", PORT);
});

