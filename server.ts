import express from 'express';
import { WebSocketServer } from 'ws';
import { createClient } from 'redis';
import { config } from 'dotenv';

config();

const app = express();
const port = process.env.PORT || 3000;

// Redis PubSub client setup
const publisher = createClient({
  url: process.env.REDIS_URL
});

const subscriber = publisher.duplicate();

// Edge Node configuration
class EdgeNode {
  private clients: Map<string, Set<WebSocket>> = new Map();
  
  constructor(private nodeId: string) {
    this.initializeSubscriber();
  }

  private async initializeSubscriber() {
    await subscriber.connect();
    await subscriber.subscribe('chat-messages', (message) => {
      this.handlePubSubMessage(JSON.parse(message));
    });
  }

  async handleNewConnection(ws: WebSocket, channel: string) {
    if (!this.clients.has(channel)) {
      this.clients.set(channel, new Set());
    }
    this.clients.get(channel)?.add(ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleClientMessage(channel, message);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    ws.on('close', () => {
      this.clients.get(channel)?.delete(ws);
    });
  }

  private async handleClientMessage(channel: string, message: any) {
    const chatMessage = {
      channel,
      message: message.content,
      timestamp: new Date().toISOString(),
      userId: message.userId
    };

    await publisher.publish('chat-messages', JSON.stringify(chatMessage));
  }

  private handlePubSubMessage(message: any) {
    const channelClients = this.clients.get(message.channel);
    if (!channelClients) return;

    const messageStr = JSON.stringify(message);
    channelClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }
}