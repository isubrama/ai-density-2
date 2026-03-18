import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { InferenceManager } from './inference';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
const frontendPath = path.join(process.cwd(), 'frontend/dist');
app.use(express.static(frontendPath));

const inferenceManager = new InferenceManager((data) => {
  // Broadcast updates to all connected WS clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
});

app.post('/api/start', async (req, res) => {
  inferenceManager.startAll(); // Non-blocking
  res.json({ status: 'started' });
});

app.post('/api/stop', (req, res) => {
  inferenceManager.stopAll();
  res.json({ status: 'stopped' });
});

app.get('/api/stats', (req, res) => {
  res.json({
    global: inferenceManager.getGlobalStats(),
    models: inferenceManager.getModelGroups(),
  });
});

// For SPA routing, serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`WebSocket server active`);
});
