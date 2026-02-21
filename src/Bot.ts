import dotenv from "dotenv";
import { Client, IntentsBitField } from "discord.js";
import axiosRetry from "axios-retry";
import axios from "axios";
import ready from "./listeners/ready.js";
import interactionCreate from "./listeners/interactionCreate.js";
import { Server } from "./Server.js";
import { Data } from "./Data.js";
import { MessageParser } from "./MessageParser.js";
import { NotificationService } from "./NotificationService.js";

async function main() {
  dotenv.config();
  console.log("Bot is starting...");

  await Data.getInstance().initialise();

  const client = new Client({
    intents: [IntentsBitField.Flags.Guilds],
  });

  // set this up once
  axiosRetry(axios, { retries: 99, retryDelay: axiosRetry.exponentialDelay });

  // setup listeners
  ready(client);
  interactionCreate(client);

  // setup event notification dispatching
  const notificationService = NotificationService.getInstance(client);
  MessageParser.getInstance().setNotificationService(notificationService);

  // login
  const botToken = process.env.SECRET_TOKEN;
  if (!botToken) {
    console.warn(
      "SECRET_TOKEN is not configured; bot login disabled. Discord-based web authorization will not allow access.",
    );
  } else {
    await client.login(botToken);
    console.log("Logged in!");
  }

  // start our web server
  const server = new Server(client);
  server.start(Number(process.env.SERVER_PORT ?? 3000));
}

try {
  await main();
} catch (e) {
  console.error("Error starting bot:", e);
  process.exit(1);
}
