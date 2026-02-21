import axios from "axios";
import querystring from "node:querystring";

const DISCORD_API_BASE = "https://discord.com/api";

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordGuildMember {
  roles: string[];
  nick?: string | null;
}

/**
 * Wrapper for Discord OAuth endpoints used by the web server.
 */
export class DiscordOAuth {
  public static getAuthorizationUrl(state: string): string {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new Error(
        "Missing DISCORD_CLIENT_ID or DISCORD_OAUTH_REDIRECT_URI environment variables",
      );
    }

    const params = querystring.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify guilds guilds.members.read",
      prompt: "consent",
      state,
    });

    return `${DISCORD_API_BASE}/oauth2/authorize?${params}`;
  }

  public static async exchangeCodeForToken(
    code: string,
  ): Promise<DiscordTokenResponse> {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, or DISCORD_OAUTH_REDIRECT_URI environment variables",
      );
    }

    const body = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const response = await axios.post<DiscordTokenResponse>(
      `${DISCORD_API_BASE}/oauth2/token`,
      body,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    return response.data;
  }

  public static async fetchUser(accessToken: string): Promise<DiscordUser> {
    const response = await axios.get<DiscordUser>(
      `${DISCORD_API_BASE}/users/@me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return response.data;
  }

  public static async fetchUserGuilds(
    accessToken: string,
  ): Promise<DiscordGuildSummary[]> {
    const response = await axios.get<DiscordGuildSummary[]>(
      `${DISCORD_API_BASE}/users/@me/guilds`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return response.data;
  }

  public static async fetchCurrentUserGuildMember(
    accessToken: string,
    guildId: string,
  ): Promise<DiscordGuildMember> {
    const response = await axios.get<DiscordGuildMember>(
      `${DISCORD_API_BASE}/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return response.data;
  }
}
