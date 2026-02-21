import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import mount from "koa-mount";
import views from "@ladjs/koa-views";
import bodyParser from "koa-bodyparser";
import path from "node:path";
import querystring from "node:querystring";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ServerResponse } from "node:http";
import { Client } from "discord.js";
import { Grid } from "./Grid.js";
import { LocalReport } from "./LocalReport.js";
import { MessageParser } from "./MessageParser.js";
import { ScoutMessage } from "./ScoutMessage.js";
import { Data } from "./Data.js";
import { DiscordOAuth } from "./DiscordOAuth.js";
import { AuthSession, AuthSessionStore } from "./AuthSessionStore.js";
import { NotificationService } from "./NotificationService.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

type ViewerAuthSource = "bot-member" | "oauth-member" | "none";

interface ViewerAuthorizationDetail {
  guildId: string;
  viewerRoleId?: string;
  authorized: boolean;
  source: ViewerAuthSource;
  reason: string;
}

interface ViewerRoleAuthCacheEntry {
  authorized: boolean;
  source: ViewerAuthSource;
  reason: string;
  expiresAt: number;
  updatedAt: number;
}

interface DiscordTokenAuthCacheEntry {
  discordUserId: string;
  expiresAt: number;
  updatedAt: number;
}

interface LocalSystemHistoryEntry {
  minuteStart: number;
  latestTime: number;
  reportCount: number;
  reporters: string[];
  snapshotPilots: LocalPilotView[];
  snapshotLocals: string[];
  addedLocals: string[];
  removedLocals: string[];
  addedPilots: LocalPilotView[];
  removedPilots: LocalPilotView[];
}

interface LocalPilotView {
  name: string;
  hint: string;
  backgroundColor: string;
  characterId: number;
}

interface LocalSystemView {
  system: string;
  latestTime: number;
  latestReporter: string;
  delta: {
    added: number;
    removed: number;
  };
  currentLocals: LocalPilotView[];
  history: LocalSystemHistoryEntry[];
}

function fix_path(this_path: string) {
  return `${process.env.SERVER_ROOT_PATH}${this_path}`;
}

function timeAgo(date: Date) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);
  if (years > 0) {
    return `${years} year${years === 1 ? "" : "s"} ago`;
  } else if (months > 0) {
    return `${months} month${months === 1 ? "" : "s"} ago`;
  } else if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else {
    return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  }
}

export class Server {
  private readonly app = new Koa();
  private readonly router = new Router();
  private readonly sseClients = new Set<ServerResponse>();
  private readonly discordTokenAuthCache = new Map<
    string,
    DiscordTokenAuthCacheEntry
  >();
  private readonly memberRoleAuthCache = new Map<
    string,
    ViewerRoleAuthCacheEntry
  >();
  private readonly memberRoleAuthTtlMs = 60 * 1000;
  private readonly memberRoleAuthCacheMaxEntries = 5000;
  private readonly discordTokenAuthTtlMs =
    Number(process.env.DISCORD_TOKEN_CACHE_TTL_SECONDS ?? "900") * 1000;
  private readonly discordTokenAuthCacheMaxEntries = 10000;
  private readonly spyNotificationThrottleMs = 10 * 60 * 1000;
  private readonly lastSpyNotificationByKey = new Map<string, number>();
  private counter = 0;
  private grid!: Grid;
  private readonly client: Client;

  public constructor(client: Client) {
    this.client = client;
  }

  public async start(koa_port: number) {
    this.grid = await Grid.getInstance();

    this.app.use(async (ctx, next) => {
      const start = Date.now();
      try {
        await next();
      } catch (err) {
        console.error(`Koa: ${ctx.method} ${ctx.url} - Error: `, err);
        ctx.status = 500;
        ctx.body =
          "An error occurred on our server. Please try again and contact us if this continues to happen.";
      }
      const ms = Date.now() - start;
      console.log(`Koa: ${ctx.method} ${ctx.url} - ${ms}ms`);
    });

    this.app.use(serve(path.join(moduleDirectory, "../public")));

    this.app.use(
      mount(
        "/install",
        serve(path.join(moduleDirectory, "../install"), {
          setHeaders: (res, filePath) => {
            if (filePath.endsWith(".application")) {
              res.setHeader("Content-Type", "application/x-ms-application");
            } else if (filePath.endsWith(".manifest")) {
              res.setHeader("Content-Type", "application/x-ms-manifest");
            } else if (filePath.endsWith(".deploy")) {
              res.setHeader("Content-Type", "application/octet-stream");
            }
          },
        }),
      ),
    );

    this.app.use(
      views(path.join(moduleDirectory, "../views"), {
        extension: "ejs",
      }),
    );

    this.app.use(this.router.routes()).use(this.router.allowedMethods());

    this.router.get("/auth/discord/login", async (ctx) => {
      const state = crypto.randomBytes(24).toString("hex");

      ctx.cookies.set("gs_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60 * 1000,
      });

      const authorizationUrl = DiscordOAuth.getAuthorizationUrl(state);
      ctx.redirect(authorizationUrl);
    });

    this.router.get("/auth/discord/callback", async (ctx) => {
      const code = String(ctx.query.code ?? "");
      const state = String(ctx.query.state ?? "");
      const storedState = ctx.cookies.get("gs_oauth_state");

      if (!code || !state || !storedState || state !== storedState) {
        await Data.getInstance().logAudit({
          category: "auth",
          action: "oauth_callback_state_validation",
          outcome: "failure",
          details: {
            hasCode: !!code,
            hasState: !!state,
            hasStoredState: !!storedState,
          },
        });
        ctx.status = 400;
        ctx.body = "Invalid OAuth callback state.";
        return;
      }

      const token = await DiscordOAuth.exchangeCodeForToken(code);
      const user = await DiscordOAuth.fetchUser(token.access_token);
      const guilds = await DiscordOAuth.fetchUserGuilds(token.access_token);

      this.clearViewerAuthCacheForUser(user.id);

      const session = await AuthSessionStore.getInstance().createSession({
        userId: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresInSeconds: token.expires_in,
        guildIds: guilds.map((g) => g.id),
      });

      await Data.getInstance().logAudit({
        category: "auth",
        action: "oauth_login",
        outcome: "success",
        actorId: user.id,
        details: {
          guildCount: guilds.length,
        },
      });

      ctx.cookies.set("gs_session", session.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: token.expires_in * 1000,
      });

      ctx.cookies.set("gs_oauth_state", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
      });

      ctx.redirect(fix_path("/"));
    });

    this.router.get("/logout", async (ctx) => {
      const sessionId = ctx.cookies.get("gs_session");
      if (sessionId) {
        const existingSession =
          await AuthSessionStore.getInstance().getSession(sessionId);
        if (existingSession) {
          this.clearViewerAuthCacheForUser(existingSession.userId);
          await Data.getInstance().logAudit({
            category: "auth",
            action: "logout",
            outcome: "success",
            actorId: existingSession.userId,
          });
        }
        await AuthSessionStore.getInstance().deleteSession(sessionId);
      }

      ctx.cookies.set("gs_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
      });

      ctx.redirect(fix_path("/auth/discord/login"));
    });

    this.router.get(
      "/auth/me",
      this.requireDiscordSession.bind(this),
      async (ctx) => {
        const session = await this.getActiveSessionFromContext(ctx);

        if (!session) {
          ctx.status = 401;
          ctx.body = { error: "No active session" };
          return;
        }

        const botGuildIds = new Set(
          Array.from(this.client.guilds.cache.keys()),
        );
        const sharedGuildIds = session.guildIds.filter((guildId) =>
          botGuildIds.has(guildId),
        );

        const configuredViewerGuildIds = (
          await Promise.all(
            sharedGuildIds.map(async (guildId) => {
              const config = await Data.getInstance().getGuildConfig(guildId);
              return config?.viewerRoleId ? guildId : null;
            }),
          )
        ).filter((guildId): guildId is string => guildId !== null);

        const viewerAuthorizationDetails =
          await this.getViewerAuthorizationDetails(session, sharedGuildIds);

        const authorizedGuildIds = viewerAuthorizationDetails
          .filter((detail) => detail.authorized)
          .map((detail) => detail.guildId);

        ctx.body = {
          user: {
            id: session.userId,
            username: session.username,
            discriminator: session.discriminator,
            avatar: session.avatar,
          },
          session: {
            createdAt: session.createdAt,
            lastSeenAt: session.lastSeenAt,
            expiresAt: session.expiresAt,
          },
          guilds: {
            userGuildCount: session.guildIds.length,
            botGuildCount: botGuildIds.size,
            sharedGuildCount: sharedGuildIds.length,
            sharedGuildIds,
            botGuildIds: Array.from(botGuildIds),
            configuredViewerGuildIds,
            authorizedGuildIds,
            viewerAuthorizationDetails,
          },
        };
      },
    );

    this.router.get("/", async (ctx) => {
      const session = await this.getActiveSessionFromContext(ctx);
      if (!session) {
        await ctx.render("welcome", { fix_path });
        return;
      }

      const accessCheck = await this.evaluateWebAccess(session);
      if (!accessCheck.allowed) {
        await Data.getInstance().logAudit({
          category: "authz",
          action: "root_access_check",
          outcome: "failure",
          actorId: session.userId,
          details: {
            reason: accessCheck.reason,
          },
        });
        await this.respondAccessDenied(ctx, accessCheck.reason);
        return;
      }

      await ctx.render("dashboard-menu", {
        fix_path,
      });
    });

    this.router.get(
      "/dashboard/scout",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const authorizedGuildId = String(ctx.state.authorizedGuildId ?? "");
        const dashboardData = this.getScoutDashboardViewData(authorizedGuildId);
        const guildConfig =
          await Data.getInstance().getGuildConfig(authorizedGuildId);

        await ctx.render("scout-dashboard", {
          sightings: dashboardData.sightings,
          fix_path,
          liveScouts: dashboardData.liveScouts,
          singleSystemName:
            guildConfig?.intelConfig?.singleSystemName ?? "Shared system intel",
          timeAgo,
        });
      },
    );

    this.router.get(
      "/dashboard/local",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const authorizedGuildId = String(ctx.state.authorizedGuildId ?? "");
        const dashboardData = this.getLocalDashboardViewData(authorizedGuildId);
        const guildConfig =
          await Data.getInstance().getGuildConfig(authorizedGuildId);

        await ctx.render("local-dashboard", {
          localReports: dashboardData.localReports,
          fix_path,
          nullSecPocketName:
            guildConfig?.intelConfig?.nullSecPocketName ??
            "Shared null-sec intel",
          timeAgo,
        });
      },
    );

    this.router.get("/install", async (ctx) => {
      ctx.redirect("./install/Publish.html");
    });

    this.router.get("/errors", this.requireWebAuth.bind(this), async (ctx) => {
      try {
        const errors = await Data.getInstance().getErrorLogs(100);
        await ctx.render("errors", { errors });
      } catch (error) {
        console.error("Failed to load error logs:", error);
        ctx.status = 500;
        await ctx.render("error", {
          message: "Failed to load error logs",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.router.get(
      "/admin/diagnostics",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const [auditLogs, errors] = await Promise.all([
          Data.getInstance().getAuditLogs(250),
          Data.getInstance().getErrorLogs(50),
        ]);

        await ctx.render("diagnostics", {
          auditLogs,
          errorCount: errors.length,
          fix_path,
        });
      },
    );

    this.router.post(
      "/api/diagnostics/audit/clear",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const success = await Data.getInstance().clearAuditLogs();
        ctx.status = success ? 200 : 500;
        ctx.body = success
          ? { status: "success" }
          : { error: "Failed to clear audit logs" };
      },
    );

    this.router.get(
      "/fragments/scout/live-scouts",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const authorizedGuildId = String(ctx.state.authorizedGuildId ?? "");
        const dashboardData = this.getScoutDashboardViewData(authorizedGuildId);
        await ctx.render("partials/live-scouts-card", {
          liveScouts: dashboardData.liveScouts,
          timeAgo,
        });
      },
    );

    this.router.get(
      "/fragments/scout/sightings",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const authorizedGuildId = String(ctx.state.authorizedGuildId ?? "");
        const dashboardData = this.getScoutDashboardViewData(authorizedGuildId);
        const guildConfig =
          await Data.getInstance().getGuildConfig(authorizedGuildId);
        await ctx.render("partials/sightings-card", {
          sightings: dashboardData.sightings,
          fix_path,
          singleSystemName:
            guildConfig?.intelConfig?.singleSystemName ?? "Shared system intel",
          timeAgo,
        });
      },
    );

    this.router.get(
      "/fragments/local/reports",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        const authorizedGuildId = String(ctx.state.authorizedGuildId ?? "");
        const dashboardData = this.getLocalDashboardViewData(authorizedGuildId);
        const guildConfig =
          await Data.getInstance().getGuildConfig(authorizedGuildId);

        await ctx.render("partials/local-reports-card", {
          localReports: dashboardData.localReports,
          nullSecPocketName:
            guildConfig?.intelConfig?.nullSecPocketName ??
            "Shared null-sec intel",
          timeAgo,
        });
      },
    );

    this.router.get(
      "/events/stream",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        ctx.req.setTimeout(0);
        ctx.respond = false;

        const response = ctx.res;
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        response.write(": connected\n\n");
        this.sseClients.add(response);

        const keepAliveTimer = setInterval(() => {
          if (!response.writableEnded) {
            response.write(": keepalive\n\n");
          }
        }, 25000);

        const cleanup = () => {
          clearInterval(keepAliveTimer);
          this.sseClients.delete(response);
        };

        ctx.req.on("close", cleanup);
        ctx.req.on("error", cleanup);
      },
    );

    this.router.post(
      "/api/report/scout",
      bodyParser({
        enableTypes: ["text", "json"],
      }),
      async (ctx) => {
        const rawBody = String(ctx.request.rawBody ?? "");
        console.log(rawBody);

        const scoutPayload = this.normalizeScoutReportPayload(rawBody);
        if (!scoutPayload) {
          ctx.status = 400;
          ctx.body = {
            error: "invalid_report",
            reason: "Invalid scout report payload",
          };
          return;
        }

        const bearerToken = this.getBearerTokenFromAuthorizationHeader(ctx);
        const tokenAuthResult =
          await this.resolveDiscordUserIdFromToken(bearerToken);
        if (!tokenAuthResult.ok || !tokenAuthResult.discordUserId) {
          await Data.getInstance().logAudit({
            category: "ingest",
            action: "discord_token_authentication",
            outcome: "failure",
            details: {
              reason: tokenAuthResult.reason,
            },
          });
          await Data.getInstance().logError(
            {
              message: "Scout report token rejected",
              reason: tokenAuthResult.reason,
            },
            {
              ip: ctx.ip,
              userAgent: ctx.headers["user-agent"],
              path: ctx.path,
              method: ctx.method,
            },
          );
          ctx.status = 401;
          ctx.body = {
            error: "invalid_discord_token",
            reason: tokenAuthResult.reason,
          };
          return;
        }

        scoutPayload.ReporterDiscordUserId = tokenAuthResult.discordUserId;
        const ingestGuildResolution =
          await this.resolveSingleSharedGuildForReporter(
            tokenAuthResult.discordUserId,
          );
        if (!ingestGuildResolution.ok || !ingestGuildResolution.guildId) {
          ctx.status = 403;
          ctx.body = {
            error: "intel_ingest_blocked",
            reason: ingestGuildResolution.reason,
          };
          return;
        }

        const parseResult = await MessageParser.getInstance().parse(
          JSON.stringify(scoutPayload),
          ingestGuildResolution.guildId,
        );

        if (!parseResult.accepted) {
          await Data.getInstance().logError(
            {
              message: "Report rejected",
              reason: parseResult.reason,
              payload: rawBody,
            },
            {
              ip: ctx.ip,
              userAgent: ctx.headers["user-agent"],
              path: ctx.path,
              method: ctx.method,
            },
          );
          ctx.status = 400;
          ctx.body = {
            error: "invalid_report",
            reason: parseResult.reason ?? "Report validation failed",
          };
          return;
        }
        const messageCount = ++this.counter;
        this.broadcastSseEvent("report-ingested", {
          messageCount,
          reportType: "wormhole_scout",
          timestamp: new Date().toISOString(),
        });
        ctx.body = `Message ${messageCount} received`;
      },
    );

    this.router.post(
      "/api/report/local",
      bodyParser({
        enableTypes: ["text", "json"],
      }),
      async (ctx) => {
        const rawBody = String(ctx.request.rawBody ?? "");
        console.log(rawBody);

        const localReport = this.normalizeLocalReportPayload(rawBody);
        if (!localReport) {
          ctx.status = 400;
          ctx.body = {
            error: "invalid_report",
            reason: "Invalid LocalReport payload",
          };
          return;
        }

        const bearerToken = this.getBearerTokenFromAuthorizationHeader(ctx);
        const tokenAuthResult =
          await this.resolveDiscordUserIdFromToken(bearerToken);
        if (!tokenAuthResult.ok || !tokenAuthResult.discordUserId) {
          await Data.getInstance().logAudit({
            category: "ingest",
            action: "discord_token_authentication",
            outcome: "failure",
            details: {
              reason: tokenAuthResult.reason,
            },
          });
          await Data.getInstance().logError(
            {
              message: "Local report token rejected",
              reason: tokenAuthResult.reason,
            },
            {
              ip: ctx.ip,
              userAgent: ctx.headers["user-agent"],
              path: ctx.path,
              method: ctx.method,
            },
          );
          ctx.status = 401;
          ctx.body = {
            error: "invalid_discord_token",
            reason: tokenAuthResult.reason,
          };
          return;
        }

        const ingestGuildResolution =
          await this.resolveSingleSharedGuildForReporter(
            tokenAuthResult.discordUserId,
          );
        if (!ingestGuildResolution.ok || !ingestGuildResolution.guildId) {
          ctx.status = 403;
          ctx.body = {
            error: "intel_ingest_blocked",
            reason: ingestGuildResolution.reason,
          };
          return;
        }

        await this.grid.submitLocalReport(
          ingestGuildResolution.guildId,
          localReport,
        );
        const messageCount = ++this.counter;
        this.broadcastSseEvent("report-ingested", {
          messageCount,
          reportType: "nullsec_local",
          timestamp: new Date().toISOString(),
        });

        ctx.body = `Message ${messageCount} received`;
      },
    );

    this.router.delete(
      "/key/:key",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        console.log("Deleting key", ctx.params.key);
        const authorizedGuildId = String(ctx.state.authorizedGuildId ?? "");
        const key = querystring.unescape(ctx.params.key);
        if (key) {
          const success = await this.grid.delete(authorizedGuildId, key);

          if (success) {
            ctx.status = 200;
            ctx.body = "";
          } else {
            ctx.status = 404;
            ctx.body = "Key Not found";
          }
        }
      },
    );

    this.router.post(
      "/api/error",
      bodyParser({
        enableTypes: ["json"],
      }),
      async (ctx) => {
        try {
          const errorData = ctx.request.body;
          const context = {
            ip: ctx.ip,
            userAgent: ctx.headers["user-agent"],
            path: ctx.path,
            method: ctx.method,
          };

          const errorId = await Data.getInstance().logError(errorData, context);

          console.error("Client Error Report:", {
            id: errorId,
            timestamp: new Date().toISOString(),
            ...context,
            error: errorData,
          });

          ctx.status = 200;
          ctx.body = {
            status: "error_received",
            errorId,
          };
        } catch (error) {
          console.error("Error processing error report:", error);

          try {
            await Data.getInstance().logError(
              {
                message: "Failed to process error report",
                originalError:
                  error instanceof Error ? error.message : String(error),
              },
              {
                path: ctx.path,
                method: ctx.method,
              },
            );
          } catch (logError) {
            console.error("Failed to log error processing error:", logError);
          }

          ctx.status = 500;
          ctx.body = {
            error: "Failed to process error report",
            errorId: null,
          };
        }
      },
    );

    this.router.post(
      "/api/errors/clear",
      this.requireWebAuth.bind(this),
      async (ctx) => {
        try {
          const success = await Data.getInstance().clearErrorLogs();
          if (success) {
            ctx.status = 200;
            ctx.body = { status: "success" };
          } else {
            ctx.status = 500;
            ctx.body = { error: "Failed to clear error logs" };
          }
        } catch (error) {
          console.error("Failed to clear error logs:", error);
          ctx.status = 500;
          ctx.body = { error: "Failed to clear error logs" };
        }
      },
    );

    this.app.listen(koa_port, () =>
      console.log(`Listening on http://localhost:${koa_port}`),
    );
  }

  private async requireWebAuth(ctx: Koa.Context, next: Koa.Next) {
    const session = await this.requireDiscordSessionInternal(ctx);
    if (!session) {
      return;
    }

    const accessCheck = await this.evaluateWebAccess(session);
    if (!accessCheck.allowed) {
      await Data.getInstance().logAudit({
        category: "authz",
        action: "web_access_check",
        outcome: "failure",
        actorId: session.userId,
        details: {
          reason: accessCheck.reason,
        },
      });
      await this.respondAccessDenied(ctx, accessCheck.reason);
      return;
    }

    ctx.state.authorizedGuildId = accessCheck.authorizedGuildIds[0] ?? "";

    await next();
  }

  private async evaluateWebAccess(session: AuthSession): Promise<{
    allowed: boolean;
    reason: string;
    authorizedGuildIds: string[];
  }> {
    const existingSpyFlag = await Data.getInstance().getSpyFlag(session.userId);
    if (existingSpyFlag) {
      await this.handleSuspectedSpy(
        session.userId,
        existingSpyFlag.guildIds,
        "dashboard",
        existingSpyFlag.reason,
      );
      return {
        allowed: false,
        reason: "Unauthorised - We think you're a spy!",
        authorizedGuildIds: [],
      };
    }

    const botGuildIds = new Set(Array.from(this.client.guilds.cache.keys()));
    const hasSharedGuild = session.guildIds.some((guildId) =>
      botGuildIds.has(guildId),
    );

    if (!hasSharedGuild) {
      return {
        allowed: false,
        reason:
          "Authenticated with Discord, but no shared server was found where GridScout bot is installed.",
        authorizedGuildIds: [],
      };
    }

    const sharedGuildIds = session.guildIds.filter((guildId) =>
      botGuildIds.has(guildId),
    );
    const viewerAuthorizationDetails = await this.getViewerAuthorizationDetails(
      session,
      sharedGuildIds,
    );
    const authorizedGuildIds = viewerAuthorizationDetails
      .filter((detail) => detail.authorized)
      .map((detail) => detail.guildId);

    if (authorizedGuildIds.length === 0) {
      return {
        allowed: false,
        reason:
          "Authenticated with Discord, but your account does not have a configured GridScout viewer role in any shared server.",
        authorizedGuildIds: [],
      };
    }

    if (authorizedGuildIds.length > 1) {
      await this.handleSuspectedSpy(
        session.userId,
        authorizedGuildIds,
        "dashboard",
        "Viewer account is authorized in multiple GridScout guilds.",
      );
      return {
        allowed: false,
        reason: "Unauthorised - We think you're a spy!",
        authorizedGuildIds: [],
      };
    }

    return {
      allowed: true,
      reason: "ok",
      authorizedGuildIds,
    };
  }

  private async requireDiscordSession(ctx: Koa.Context, next: Koa.Next) {
    const session = await this.requireDiscordSessionInternal(ctx);
    if (!session) {
      return;
    }

    await next();
  }

  private async requireDiscordSessionInternal(ctx: Koa.Context) {
    const session = await this.getActiveSessionFromContext(ctx);
    if (!session) {
      ctx.cookies.set("gs_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
      });
      ctx.redirect(fix_path("/auth/discord/login"));
      return null;
    }

    const sessionId = ctx.cookies.get("gs_session");
    if (sessionId) {
      await AuthSessionStore.getInstance().touchSession(sessionId);
    }

    return session;
  }

  private async getActiveSessionFromContext(ctx: Koa.Context) {
    const sessionId = ctx.cookies.get("gs_session");
    if (!sessionId) {
      return null;
    }

    return AuthSessionStore.getInstance().getSession(sessionId);
  }

  private async getViewerAuthorizationDetails(
    session: AuthSession,
    guildIds: string[],
  ): Promise<ViewerAuthorizationDetail[]> {
    const details: ViewerAuthorizationDetail[] = [];

    for (const guildId of guildIds) {
      const config = await Data.getInstance().getGuildConfig(guildId);
      const viewerRoleId = config?.viewerRoleId;
      if (!viewerRoleId) {
        details.push({
          guildId,
          viewerRoleId: undefined,
          authorized: false,
          source: "none",
          reason: "No viewer role configured for this guild.",
        });
        continue;
      }

      const result = await this.userHasViewerRoleInGuild(
        guildId,
        session.userId,
        viewerRoleId,
        session.accessToken,
      );
      details.push({
        guildId,
        viewerRoleId,
        authorized: result.authorized,
        source: result.source,
        reason: result.reason,
      });
    }

    return details;
  }

  private async userHasViewerRoleInGuild(
    guildId: string,
    userId: string,
    viewerRoleId: string,
    accessToken: string,
  ): Promise<{
    authorized: boolean;
    source: ViewerAuthSource;
    reason: string;
  }> {
    const cacheKey = `${guildId}:${userId}:${viewerRoleId}`;
    const cached = this.memberRoleAuthCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        authorized: cached.authorized,
        source: cached.source,
        reason: cached.reason,
      };
    }

    let staleCacheFallback: ViewerRoleAuthCacheEntry | undefined;
    if (cached) {
      staleCacheFallback = cached;
    }

    let authorized = false;
    let source: ViewerAuthSource = "none";
    let reason = "Unable to verify viewer role.";
    let primaryLookupFailed = false;
    let fallbackLookupFailed = false;

    try {
      const guild = await this.withDiscordRetry(
        () => this.client.guilds.fetch(guildId),
        `guild_fetch:${guildId}`,
      );
      const member = await this.withDiscordRetry(
        () => guild.members.fetch({ user: userId, force: true }),
        `member_fetch:${guildId}:${userId}`,
      );
      authorized = member.roles.cache.has(viewerRoleId);
      source = "bot-member";
      reason = authorized
        ? "Viewer role matched via bot guild member lookup."
        : "Viewer role not present on member via bot guild member lookup.";
    } catch (error) {
      primaryLookupFailed = true;
      console.error(
        `Bot member lookup failed for user ${userId} in guild ${guildId}:`,
        error,
      );
    }

    if (!authorized) {
      try {
        const member = await this.withDiscordRetry(
          () => DiscordOAuth.fetchCurrentUserGuildMember(accessToken, guildId),
          `oauth_member_fetch:${guildId}:${userId}`,
        );
        authorized = member.roles.includes(viewerRoleId);
        source = "oauth-member";
        reason = authorized
          ? "Viewer role matched via OAuth guild member lookup."
          : "Viewer role not present via OAuth guild member lookup.";
      } catch (error) {
        fallbackLookupFailed = true;
        console.error(
          `OAuth member lookup failed for user ${userId} in guild ${guildId}:`,
          error,
        );
        if (source === "none") {
          reason =
            "Role lookup failed through both bot and OAuth member APIs. Re-login may be required to refresh scopes.";
        }
      }
    }

    const bothLookupsUnavailable = primaryLookupFailed && fallbackLookupFailed;
    if (bothLookupsUnavailable && staleCacheFallback) {
      this.setViewerAuthCache(cacheKey, {
        ...staleCacheFallback,
        reason:
          "Discord API temporarily unavailable. Using recent cached viewer-role result.",
      });
      return {
        authorized: staleCacheFallback.authorized,
        source: staleCacheFallback.source,
        reason:
          "Discord API temporarily unavailable. Using recent cached viewer-role result.",
      };
    }

    if (bothLookupsUnavailable && !staleCacheFallback) {
      reason =
        "Discord role verification is temporarily unavailable. Please retry in a moment.";
    }

    this.setViewerAuthCache(cacheKey, {
      authorized,
      source,
      reason,
      expiresAt: Date.now() + this.memberRoleAuthTtlMs,
      updatedAt: Date.now(),
    });

    return { authorized, source, reason };
  }

  private clearViewerAuthCacheForUser(userId: string) {
    const userFragment = `:${userId}:`;
    for (const key of this.memberRoleAuthCache.keys()) {
      if (key.includes(userFragment)) {
        this.memberRoleAuthCache.delete(key);
      }
    }
  }

  private setViewerAuthCache(key: string, value: ViewerRoleAuthCacheEntry) {
    this.memberRoleAuthCache.set(key, value);
    this.pruneViewerAuthCache();
  }

  private pruneViewerAuthCache() {
    const now = Date.now();
    for (const [key, value] of this.memberRoleAuthCache.entries()) {
      if (value.expiresAt <= now) {
        this.memberRoleAuthCache.delete(key);
      }
    }

    while (this.memberRoleAuthCache.size > this.memberRoleAuthCacheMaxEntries) {
      const oldestKey = this.memberRoleAuthCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.memberRoleAuthCache.delete(oldestKey);
    }
  }

  private async withDiscordRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const maxAttempts = 3;
    const baseDelayMs = 200;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !this.isRetryableDiscordError(error)) {
          break;
        }

        const backoffMs =
          baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 75);
        await this.sleep(backoffMs);
      }
    }

    throw new Error(
      `Discord operation failed after retries (${operationName}): ${String(lastError)}`,
    );
  }

  private isRetryableDiscordError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === "number") {
      if (maybeStatus >= 500) {
        return true;
      }
      if (maybeStatus === 429 || maybeStatus === 408) {
        return true;
      }
      return false;
    }

    const maybeCode = (error as { code?: unknown }).code;
    const retryableCodes = new Set([
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
    ]);
    if (typeof maybeCode === "string" && retryableCodes.has(maybeCode)) {
      return true;
    }

    return false;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async respondAccessDenied(ctx: Koa.Context, reason: string) {
    const acceptsHtml = ctx.accepts("html") === "html";
    const isGetRequest = ctx.method.toUpperCase() === "GET";

    ctx.status = 403;
    if (acceptsHtml && isGetRequest) {
      await ctx.render("access-denied", {
        reason,
        fix_path,
      });
      return;
    }

    ctx.body = reason;
  }

  private normalizeScoutReportPayload(rawBody: string): ScoutMessage | null {
    try {
      return JSON.parse(rawBody) as ScoutMessage;
    } catch {
      return null;
    }
  }

  private getBearerTokenFromAuthorizationHeader(ctx: Koa.Context): string {
    const authorizationHeader = String(ctx.get("authorization") ?? "").trim();
    if (!authorizationHeader) {
      return "";
    }

    const parts = authorizationHeader.split(" ");
    if (parts.length !== 2) {
      return "";
    }

    const scheme = parts[0]?.toLowerCase();
    const token = parts[1]?.trim() ?? "";
    if (scheme !== "bearer" || !token) {
      return "";
    }

    return token;
  }

  private async resolveDiscordUserIdFromToken(discordToken: string): Promise<{
    ok: boolean;
    discordUserId?: string;
    reason: string;
  }> {
    const normalizedDiscordToken = discordToken.trim();
    if (!normalizedDiscordToken) {
      return {
        ok: false,
        reason: "Missing Authorization Bearer token",
      };
    }

    this.pruneDiscordTokenAuthCache();

    const tokenHash = this.hashDiscordToken(normalizedDiscordToken);
    const cached = this.discordTokenAuthCache.get(tokenHash);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ok: true,
        discordUserId: cached.discordUserId,
        reason: "cache_hit",
      };
    }

    try {
      const discordUser = await this.withDiscordRetry(
        () => DiscordOAuth.fetchUser(normalizedDiscordToken),
        `token_user_fetch:${tokenHash.slice(0, 8)}`,
      );

      this.setDiscordTokenAuthCache(tokenHash, discordUser.id);
      return {
        ok: true,
        discordUserId: discordUser.id,
        reason: "validated",
      };
    } catch {
      return {
        ok: false,
        reason: "DiscordToken authentication failed",
      };
    }
  }

  private hashDiscordToken(discordToken: string): string {
    return crypto.createHash("sha256").update(discordToken).digest("hex");
  }

  private setDiscordTokenAuthCache(tokenHash: string, discordUserId: string) {
    this.discordTokenAuthCache.set(tokenHash, {
      discordUserId,
      expiresAt: Date.now() + this.discordTokenAuthTtlMs,
      updatedAt: Date.now(),
    });
    this.pruneDiscordTokenAuthCache();
  }

  private pruneDiscordTokenAuthCache() {
    const now = Date.now();
    for (const [
      tokenHash,
      cachedValue,
    ] of this.discordTokenAuthCache.entries()) {
      if (cachedValue.expiresAt <= now) {
        this.discordTokenAuthCache.delete(tokenHash);
      }
    }

    while (
      this.discordTokenAuthCache.size > this.discordTokenAuthCacheMaxEntries
    ) {
      const oldestTokenHash = this.discordTokenAuthCache.keys().next().value;
      if (!oldestTokenHash) {
        break;
      }
      this.discordTokenAuthCache.delete(oldestTokenHash);
    }
  }

  private async resolveSingleSharedGuildForReporter(
    discordUserId: string,
  ): Promise<{
    ok: boolean;
    guildId?: string;
    reason: string;
  }> {
    const sharedGuildIds =
      await this.getSharedGuildIdsForDiscordUser(discordUserId);
    if (sharedGuildIds.length === 0) {
      return {
        ok: false,
        reason:
          "Authenticated Discord user is not a member of any guild where GridScout is installed.",
      };
    }

    if (sharedGuildIds.length > 1) {
      await this.handleSuspectedSpy(
        discordUserId,
        sharedGuildIds,
        "ingest",
        "Reporter is a member of multiple GridScout guilds while submitting intel.",
      );
      return {
        ok: false,
        reason:
          "Reporter belongs to multiple GridScout guilds. Intel ingest blocked for safety.",
      };
    }

    const existingSpyFlag = await Data.getInstance().getSpyFlag(discordUserId);
    if (existingSpyFlag) {
      return {
        ok: false,
        reason: "Reporter has an active spy flag and cannot submit intel.",
      };
    }

    return {
      ok: true,
      guildId: sharedGuildIds[0],
      reason: "ok",
    };
  }

  private async getSharedGuildIdsForDiscordUser(discordUserId: string) {
    const sharedGuildIds: string[] = [];
    for (const guildId of this.client.guilds.cache.keys()) {
      try {
        const guild = await this.withDiscordRetry(
          () => this.client.guilds.fetch(guildId),
          `ingest_guild_fetch:${guildId}`,
        );
        await this.withDiscordRetry(
          () => guild.members.fetch({ user: discordUserId, force: true }),
          `ingest_member_fetch:${guildId}:${discordUserId}`,
        );
        sharedGuildIds.push(guildId);
      } catch {
        // not a member in this guild or transient lookup failure
      }
    }

    return sharedGuildIds;
  }

  private async handleSuspectedSpy(
    discordUserId: string,
    guildIds: string[],
    source: "ingest" | "dashboard",
    reason: string,
  ) {
    const dedupedGuildIds = Array.from(new Set(guildIds.filter(Boolean)));
    if (dedupedGuildIds.length === 0) {
      return;
    }

    await Data.getInstance().recordSpyFlag({
      userId: discordUserId,
      guildIds: dedupedGuildIds,
      reason,
      source,
    });

    await Data.getInstance().logAudit({
      category: "security",
      action: "suspected_spy_behavior",
      outcome: "failure",
      actorId: discordUserId,
      details: {
        source,
        reason,
        guildIds: dedupedGuildIds,
      },
    });

    const throttleKey = `${discordUserId}:${dedupedGuildIds.join(",")}:${source}`;
    const now = Date.now();
    const lastNotifiedAt = this.lastSpyNotificationByKey.get(throttleKey) ?? 0;
    if (now - lastNotifiedAt < this.spyNotificationThrottleMs) {
      return;
    }

    this.lastSpyNotificationByKey.set(throttleKey, now);
    await NotificationService.getInstance(this.client).notifySpyBehavior(
      dedupedGuildIds,
      discordUserId,
      reason,
    );
  }

  private getScoutDashboardViewData(guildId: string) {
    const sightings = [...this.grid.seenSoFar(guildId).slice(-300)];
    sightings.reverse();

    return {
      sightings,
      liveScouts: Array.from(this.grid.getScoutReports(guildId).values()),
    };
  }

  private getLocalDashboardViewData(guildId: string) {
    const localReports = this.grid.localReportsSoFar(guildId);
    const systems = this.buildLocalSystemViews(localReports);

    return {
      localReports: systems,
    };
  }

  private buildLocalSystemViews(
    localReports: LocalReport[],
  ): LocalSystemView[] {
    const reportsBySystem = new Map<string, LocalReport[]>();

    for (const report of localReports) {
      const systemName = report.System?.trim() ?? "";
      if (!systemName || systemName.toLowerCase() === "unknown system") {
        continue;
      }
      const existing = reportsBySystem.get(systemName);
      if (existing) {
        existing.push(report);
      } else {
        reportsBySystem.set(systemName, [report]);
      }
    }

    const systemViews: LocalSystemView[] = [];

    for (const [system, systemReports] of reportsBySystem.entries()) {
      systemReports.sort((left, right) => left.Time - right.Time);

      const minuteBuckets = new Map<
        number,
        {
          latestReport: LocalReport;
          reportCount: number;
          reporters: Set<string>;
        }
      >();

      for (const report of systemReports) {
        const minuteStart = Math.floor(report.Time / 60000) * 60000;
        const currentBucket = minuteBuckets.get(minuteStart);

        if (!currentBucket) {
          minuteBuckets.set(minuteStart, {
            latestReport: report,
            reportCount: 1,
            reporters: new Set<string>([report.ScoutName]),
          });
          continue;
        }

        currentBucket.reportCount += 1;
        currentBucket.reporters.add(report.ScoutName);
        if (report.Time >= currentBucket.latestReport.Time) {
          currentBucket.latestReport = report;
        }
      }

      const orderedMinutes = Array.from(minuteBuckets.entries()).sort(
        ([leftMinute], [rightMinute]) => leftMinute - rightMinute,
      );

      const historyAscending: LocalSystemHistoryEntry[] = [];
      let previousSnapshot = new Set<string>();
      let previousPilotsByName = new Map<string, LocalPilotView>();

      for (const [minuteStart, bucket] of orderedMinutes) {
        const pilotsByName = new Map<
          string,
          LocalPilotView & { precedence: number }
        >();

        for (const pilot of bucket.latestReport.Locals) {
          const pilotName = String(pilot.Name ?? "").trim();
          if (!pilotName) {
            continue;
          }

          const hint = String(pilot.StandingHint ?? "").trim();
          const resolvedTag = this.resolveLocalPilotTag(hint);
          const existing = pilotsByName.get(pilotName);

          if (!existing || resolvedTag.precedence < existing.precedence) {
            const characterId = Number(pilot.CharacterID ?? 0);
            pilotsByName.set(pilotName, {
              name: pilotName,
              hint,
              backgroundColor: resolvedTag.color,
              characterId: Number.isFinite(characterId) ? characterId : 0,
              precedence: resolvedTag.precedence,
            });
          }
        }

        const snapshotLocals = Array.from(pilotsByName.keys()).sort(
          (left, right) => left.localeCompare(right),
        );
        const snapshotPilots = snapshotLocals.map((pilotName) => {
          const pilot = pilotsByName.get(pilotName)!;
          return {
            name: pilot.name,
            hint: pilot.hint,
            backgroundColor: pilot.backgroundColor,
            characterId: pilot.characterId,
          };
        });

        const snapshotSet = new Set(snapshotLocals);
        const snapshotPilotsByName = new Map(
          snapshotPilots.map((pilot) => [pilot.name, pilot]),
        );
        const addedLocals = snapshotLocals.filter(
          (pilot) => !previousSnapshot.has(pilot),
        );
        const removedLocals = Array.from(previousSnapshot)
          .filter((pilot) => !snapshotSet.has(pilot))
          .sort((left, right) => left.localeCompare(right));

        const addedPilots = addedLocals
          .map((pilotName) => snapshotPilotsByName.get(pilotName))
          .filter((pilot): pilot is LocalPilotView => !!pilot);

        const removedPilots = removedLocals
          .map((pilotName) => previousPilotsByName.get(pilotName))
          .filter((pilot): pilot is LocalPilotView => !!pilot);

        historyAscending.push({
          minuteStart,
          latestTime: bucket.latestReport.Time,
          reportCount: bucket.reportCount,
          reporters: Array.from(bucket.reporters).sort((a, b) =>
            a.localeCompare(b),
          ),
          snapshotPilots,
          snapshotLocals,
          addedLocals,
          removedLocals,
          addedPilots,
          removedPilots,
        });

        previousSnapshot = snapshotSet;
        previousPilotsByName = snapshotPilotsByName;
      }

      if (historyAscending.length === 0) {
        continue;
      }

      const latestHistory = historyAscending[historyAscending.length - 1];
      systemViews.push({
        system,
        latestTime: latestHistory.latestTime,
        latestReporter: latestHistory.reporters[0] ?? "Unknown",
        delta: {
          added: latestHistory.addedPilots.length,
          removed: latestHistory.removedPilots.length,
        },
        currentLocals: latestHistory.snapshotPilots,
        history: [...historyAscending].reverse(),
      });
    }

    systemViews.sort((left, right) => right.latestTime - left.latestTime);
    return systemViews;
  }

  private resolveLocalPilotTag(standingHint: string): {
    precedence: number;
    color: string;
  } {
    const normalizedHint = standingHint.toLowerCase();

    const localTagRules: Array<{
      match: (hint: string) => boolean;
      color: string;
    }> = [
      {
        // Pilot is at war with you
        match: (hint) => /at war with you|at war with your/.test(hint),
        color: "#f97316",
      },
      {
        // Pilot has horrible standing
        match: (hint) => /terrible standing|horrible standing/.test(hint),
        color: "#dc2626",
      },
      {
        // Pilot has bad standing
        match: (hint) => /bad standing/.test(hint),
        color: "#f59e0b",
      },
      {
        // Pilot is in your fleet/gang
        match: (hint) => /in your fleet|in your gang/.test(hint),
        color: "#a855f7",
      },
      {
        // Pilot is in your corporation
        match: (hint) =>
          /in your capsuleer corporation|in your corporation/.test(hint),
        color: "#22c55e",
      },
      {
        // Pilot is in your alliance
        match: (hint) => /in your alliance/.test(hint),
        color: "#3b82f6",
      },
      {
        // Pilot has good standing
        match: (hint) => /good standing/.test(hint),
        color: "#60a5fa",
      },
      {
        // Pilot has excellent standing
        match: (hint) => /excellent standing/.test(hint),
        color: "#2563eb",
      },
      {
        // Pilot has security status below -5
        match: (hint) => /security status below -5/.test(hint),
        color: "#c026d3",
      },
      {
        // Pilot has security status below 0
        match: (hint) => /security status below 0/.test(hint),
        color: "#facc15",
      },
      {
        // Pilot has no standing
        match: (_hint) => true,
        color: "#6b7280",
      },
    ];

    const matchedIndex = localTagRules.findIndex((rule) =>
      rule.match(normalizedHint),
    );
    const index = matchedIndex >= 0 ? matchedIndex : localTagRules.length - 1;

    return {
      precedence: index,
      color: localTagRules[index]!.color,
    };
  }

  private normalizeLocalReportPayload(rawBody: string): LocalReport | null {
    try {
      const payload = JSON.parse(rawBody) as {
        System?: unknown;
        ScoutName?: unknown;
        Time?: unknown;
        Locals?: unknown;
      };

      if (!Array.isArray(payload.Locals)) {
        return null;
      }

      const system = String(payload.System ?? "").trim();
      const scoutName = String(payload.ScoutName ?? "").trim();
      const numericTime = Number(payload.Time);

      if (!system || !scoutName || !Number.isFinite(numericTime)) {
        return null;
      }

      const normalizedTime =
        numericTime < 1_000_000_000_000 ? numericTime * 1000 : numericTime;

      const localsRaw = payload.Locals;
      const locals = localsRaw
        .map((local): LocalReport["Locals"][number] | null => {
          if (!local || typeof local !== "object" || Array.isArray(local)) {
            return null;
          }

          const localObject = local as {
            Name?: unknown;
            CharacterID?: unknown;
            StandingHint?: unknown;
          };

          const name = String(localObject.Name ?? "").trim();
          if (!name) {
            return null;
          }

          const characterId = Number(localObject.CharacterID ?? 0);
          return {
            Name: name,
            CharacterID: Number.isFinite(characterId) ? characterId : 0,
            StandingHint: String(localObject.StandingHint ?? ""),
          };
        })
        .filter(
          (local): local is LocalReport["Locals"][number] => local !== null,
        );

      return {
        System: system,
        ScoutName: scoutName,
        Time: normalizedTime,
        Locals: locals,
      };
    } catch {
      return null;
    }
  }

  private broadcastSseEvent(eventName: string, payload: unknown) {
    const serializedPayload = JSON.stringify(payload);
    const eventBlock = `event: ${eventName}\ndata: ${serializedPayload}\n\n`;

    for (const response of this.sseClients) {
      if (response.writableEnded || response.destroyed) {
        this.sseClients.delete(response);
        continue;
      }

      try {
        response.write(eventBlock);
      } catch (error) {
        console.error("Failed writing SSE event:", error);
        this.sseClients.delete(response);
      }
    }
  }
}
