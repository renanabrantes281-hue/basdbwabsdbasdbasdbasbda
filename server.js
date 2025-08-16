// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const WebSocket = require("ws");
const { Client, GatewayIntentBits } = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(bodyParser.json());

let pets = [];   // histórico em memória (só últimos 4 minutos)
let clients = []; // UIs conectadas

// ========= BOT DISCORD =========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`🤖 Bot logado como ${client.user.tag}`);
});

client.on("messageCreate", (msg) => {
  if (msg.channelId !== CHANNEL_ID) return;
  if (!msg.embeds.length) return;

  const embed = msg.embeds[0];
  if (!embed || !embed.description) return;

  // cada linha da descrição: **Nome** x2 ($15M/s 😸)
  const lines = embed.description.split("\n");
  let jobId = null;
  let serverName = "Unknown Server";

  // tenta pegar Job ID e Nome do Server dos fields do embed
  if (embed.fields) {
    const fJob = embed.fields.find((f) => f.name.includes("Job ID"));
    if (fJob && fJob.value) {
      jobId = fJob.value.replace(/`/g, "").trim();
    }
    const fServer = embed.fields.find((f) => f.name.includes("Server Name"));
    if (fServer && fServer.value) {
      serverName = fServer.value.trim();
    }
  }

  lines.forEach((line) => {
    const regex = /\*\*(.+?)\*\* x(\d+) \(\$(.+?)\/s(.*)\)/;
    const match = line.match(regex);
    if (match) {
      const petName = match[1];
      const count = parseInt(match[2]);
      const valueText = match[3];
      const emoji = match[4] ? match[4].trim() : "";

      let value = 0;
      if (valueText.endsWith("M")) value = parseFloat(valueText) * 1e6;
      else if (valueText.endsWith("K")) value = parseFloat(valueText) * 1e3;
      else if (valueText.endsWith("B")) value = parseFloat(valueText) * 1e9;
      else value = parseFloat(valueText) || 0;

      const pet = {
        petName,
        jobId: jobId || "desconhecido",
        serverName,
        count,
        value,
        emoji,
        time: Date.now(),
      };

      pets.push(pet);

      // envia para todas UIs conectadas
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "new_pet", pet }));
        }
      });

      console.log("🐾 Pet do Discord:", pet);
    }
  });
});

client.login(DISCORD_TOKEN);

// ========= LIMPEZA AUTOMÁTICA =========
// mantém só pets dos últimos 4 minutos
setInterval(() => {
  const now = Date.now();
  pets = pets.filter(p => (now - p.time) < 310000);
}, 60000);

// ========= API & WS =========
app.get("/pets", (req, res) => {
  const now = Date.now();
  const recentPets = pets.filter(p => (now - p.time) < 310000);
  res.json(recentPets);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("UI conectada!");
  clients.push(ws);

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
