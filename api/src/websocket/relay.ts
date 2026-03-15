/**
 * WebSocket Negotiation Relay
 *
 * Agents connect to  ws://<host>/negotiate/:jobId  and exchange
 * signed negotiation messages in real-time. The relay:
 *   • authenticates each connection via x-agent-address header
 *   • validates message signatures (EIP-191 personal_sign)
 *   • broadcasts messages to the other party in the job room
 *   • persists the negotiation log to the database
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { ethers } from 'ethers';
import { db } from '../db/client';
import type { WsEnvelope, WsMessageType } from '../types';

// ─── Room registry ───────────────────────────────────────────────────────────

interface Participant {
  ws: WebSocket;
  address: string;
}

// jobId → set of connected participants
const rooms = new Map<string, Set<Participant>>();

function getRoom(jobId: string): Set<Participant> {
  if (!rooms.has(jobId)) rooms.set(jobId, new Set());
  return rooms.get(jobId)!;
}

// ─── Signature verification ──────────────────────────────────────────────────

function verifyEnvelopeSignature(envelope: WsEnvelope): boolean {
  try {
    const { type, job_id, sender, payload, signature } = envelope;
    const message = JSON.stringify({ type, job_id, sender, payload });
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === sender.toLowerCase();
  } catch {
    return false;
  }
}

// ─── Send helpers ────────────────────────────────────────────────────────────

function send(ws: WebSocket, type: WsMessageType, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
  }
}

function broadcast(room: Set<Participant>, sender: string, data: string): void {
  for (const p of room) {
    if (p.address !== sender && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  }
}

// ─── Persist message to DB ────────────────────────────────────────────────────

async function persistMessage(envelope: WsEnvelope): Promise<void> {
  try {
    const room = getRoom(envelope.job_id);
    const participants = [...room].map((p) => p.address);
    const receiver = participants.find((a) => a !== envelope.sender) ?? '';

    await db.message.create({
      data: {
        jobId: envelope.job_id,
        sender: envelope.sender,
        receiver,
        content: JSON.stringify(envelope.payload),
        signature: envelope.signature,
      },
    });
  } catch (err) {
    console.error('Failed to persist WS message:', err);
  }
}

// ─── Connection handler ──────────────────────────────────────────────────────

function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  // Parse jobId from URL: /negotiate/:jobId
  const url = req.url ?? '';
  const match = url.match(/\/negotiate\/([^/?]+)/);
  if (!match) {
    send(ws, 'error', { message: 'Invalid URL — expected /negotiate/:jobId' });
    ws.close(1008, 'Invalid URL');
    return;
  }
  const jobId = match[1];

  // Authenticate via header
  const address = req.headers['x-agent-address'] as string | undefined;
  if (!address || !ethers.isAddress(address)) {
    send(ws, 'error', { message: 'Missing or invalid x-agent-address header' });
    ws.close(1008, 'Unauthorized');
    return;
  }

  const participant: Participant = { ws, address: address.toLowerCase() };
  const room = getRoom(jobId);
  room.add(participant);

  // Notify joining
  send(ws, 'system', { message: `Joined negotiation room for job ${jobId}`, participants: room.size });
  broadcast(room, participant.address, JSON.stringify({
    type: 'system',
    payload: { message: `Agent ${address.slice(0, 8)}… joined` },
    timestamp: Date.now(),
  }));

  // Update agent heartbeat
  db.agent.update({
    where: { address: participant.address },
    data: { lastSeen: new Date() },
  }).catch(() => { /* agent may not be registered yet */ });

  // ─── Message handler ─────────────────────────────────────────────────────

  ws.on('message', async (raw) => {
    let envelope: WsEnvelope;
    try {
      envelope = JSON.parse(raw.toString()) as WsEnvelope;
    } catch {
      send(ws, 'error', { message: 'Malformed JSON' });
      return;
    }

    // Verify sender matches authenticated address
    if (envelope.sender.toLowerCase() !== participant.address) {
      send(ws, 'error', { message: 'Sender mismatch' });
      return;
    }

    // Verify EIP-191 signature
    if (!verifyEnvelopeSignature(envelope)) {
      send(ws, 'error', { message: 'Invalid signature' });
      return;
    }

    // Relay to other participants
    const serialized = JSON.stringify(envelope);
    broadcast(room, participant.address, serialized);

    // Persist negotiation messages (not pings)
    const persistableTypes: WsMessageType[] = ['proposal', 'counter', 'accept', 'reject', 'chat'];
    if (persistableTypes.includes(envelope.type)) {
      await persistMessage(envelope);
    }

    // On accept/reject — notify both parties
    if (envelope.type === 'accept' || envelope.type === 'reject') {
      const outcome = envelope.type === 'accept' ? 'Deal accepted ✓' : 'Proposal rejected ✗';
      for (const p of room) {
        send(p.ws, 'system', { message: outcome });
      }
    }
  });

  // ─── Disconnect handler ──────────────────────────────────────────────────

  ws.on('close', () => {
    room.delete(participant);
    if (room.size === 0) rooms.delete(jobId);
    else {
      broadcast(room, participant.address, JSON.stringify({
        type: 'system',
        payload: { message: `Agent ${address.slice(0, 8)}… disconnected` },
        timestamp: Date.now(),
      }));
    }
  });

  ws.on('error', (err) => {
    console.error(`WS error from ${address}:`, err.message);
    room.delete(participant);
  });
}

// ─── Attach WSS to HTTP server ───────────────────────────────────────────────

export function attachWebSocketRelay(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/negotiate' });

  wss.on('connection', handleConnection);

  wss.on('error', (err) => {
    console.error('WSS error:', err);
  });

  console.log('WebSocket relay listening on /negotiate/:jobId');
  return wss;
}
