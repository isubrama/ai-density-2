# AI Inference Density Dashboard

A modern, high-performance web application to showcase AI inference density on Ampere CPUs.

## Features
- **20 Concurrent Chatbots:** 5 chatbots per model across 4 `llama.cpp` server instances.
- **Parallel Coordination:** Each model instance runs its 5 chatbots in parallel, waiting for all responses before issuing the next round.
- **Real-time Metrics:** Live Tokens Per Second (TPS) reporting for individual chatbots, model groups, and the entire system.
- **Peak TPS Tracking:** Automatically records the highest achieved throughput.
- **2026 AI Startup Style:** Sleek, glassmorphic dark-themed UI with neon accents.
- **Unified Deployment:** A single Docker container serves both the Node.js backend and React frontend.

## Project Structure
- `backend/`: TypeScript Express server with WebSocket streaming.
- `frontend/`: React + Vite + TypeScript dashboard.
- `prompts.json`: 100 unique prompts (5 per chatbot).
- `Dockerfile`: Multi-stage build for production.

## Prerequisites
- Docker and Docker Compose.
- GGUF models (e.g., Llama 3.2 1B, Qwen 3 0.6B, etc.) placed in a local `models/` directory.

## Setup & Running

1. **Configure Environment:**
   Copy `.env.example` to `.env` and adjust the model URLs if necessary.
   ```bash
   cp .env.example .env
   ```

2. **Run with Docker Compose:**
   Use the provided example compose file to start the dashboard and 4 llama.cpp instances.
   ```bash
   cp docker-compose.yml.example docker-compose.yml
   docker-compose up --build
   ```

3. **Access the Dashboard:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Technical Details
- **Backend:** Node.js, Express, TypeScript, Axios (streaming), WS (WebSockets).
- **Frontend:** React, Vite, Lucide-React, Vanilla CSS (Glassmorphism).
- **Inference Logic:** Uses `Promise.all` for parallel requests and streaming chunk parsing for live TPS calculation.
