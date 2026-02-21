import crypto from "node:crypto";
import { Data } from "./Data.js";

export interface AuthSession {
  id: string;
  userId: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  guildIds: string[];
  createdAt: number;
  lastSeenAt: number;
}

const SESSION_STORAGE_KEY = "auth_sessions";

/**
 * Persistent auth session store backed by node-persist.
 */
export class AuthSessionStore {
  private static instance: AuthSessionStore;

  public static getInstance(): AuthSessionStore {
    if (!AuthSessionStore.instance) {
      AuthSessionStore.instance = new AuthSessionStore();
    }
    return AuthSessionStore.instance;
  }

  private constructor() {}

  public async createSession(input: {
    userId: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds: number;
    guildIds: string[];
  }): Promise<AuthSession> {
    const now = Date.now();
    const session: AuthSession = {
      id: crypto.randomBytes(32).toString("hex"),
      userId: input.userId,
      username: input.username,
      discriminator: input.discriminator,
      avatar: input.avatar,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: now + input.expiresInSeconds * 1000,
      guildIds: input.guildIds,
      createdAt: now,
      lastSeenAt: now,
    };

    const sessions = await this.getAllSessions();
    sessions[session.id] = session;
    await Data.getInstance().saveData(SESSION_STORAGE_KEY, sessions);
    return session;
  }

  public async getSession(sessionId: string): Promise<AuthSession | null> {
    const sessions = await this.getAllSessions();
    const session = sessions[sessionId];
    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      delete sessions[sessionId];
      await Data.getInstance().saveData(SESSION_STORAGE_KEY, sessions);
      return null;
    }

    return session;
  }

  public async touchSession(sessionId: string) {
    const sessions = await this.getAllSessions();
    const session = sessions[sessionId];
    if (!session) {
      return;
    }

    session.lastSeenAt = Date.now();
    sessions[sessionId] = session;
    await Data.getInstance().saveData(SESSION_STORAGE_KEY, sessions);
  }

  public async deleteSession(sessionId: string) {
    const sessions = await this.getAllSessions();
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      await Data.getInstance().saveData(SESSION_STORAGE_KEY, sessions);
    }
  }

  private async getAllSessions(): Promise<Record<string, AuthSession>> {
    const existing = await Data.getInstance().getData(SESSION_STORAGE_KEY);
    if (!existing || typeof existing !== "object") {
      return {};
    }
    return existing as Record<string, AuthSession>;
  }
}
