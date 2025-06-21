import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import mount from 'koa-mount';
import views from "@ladjs/koa-views";
import bodyParser from "koa-bodyparser";
import path from "path";
import querystring from "querystring";
import { Grid } from "./Grid";
import { MessageParser } from "./MessageParser";
import { Data } from "./Data"; // Import the Data class

function fix_path(this_path: string) {
  return `${process.env.SERVER_ROOT_PATH}${this_path}`;
}

// return a string showing how long ago the given date was
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
  private counter = 0;
  private grid!: Grid;

  public async start(koa_port: number) {
    // Initialize grid once at startup
    this.grid = await Grid.getInstance();

    //set up logging
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

    // Set up static file serving
    this.app.use(serve(path.join(__dirname, "../public")));

    // client app installation files
    this.app.use(
      mount('/install', serve(path.join(__dirname, "../install"), {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.application')) {
            res.setHeader('Content-Type', 'application/x-ms-application');
          } else if (filePath.endsWith('.manifest')) {
            res.setHeader('Content-Type', 'application/x-ms-manifest');
          } else if (filePath.endsWith('.deploy')) {
            res.setHeader('Content-Type', 'application/octet-stream');
          }
        }
      }))
    );

    // Set up view rendering
    this.app.use(
      views(path.join(__dirname, "../views"), {
        extension: "ejs",
      })
    );

    this.app.use(this.router.routes()).use(this.router.allowedMethods());

    this.router.get("/", async (ctx) => {
      // Use the already initialized grid instance
      const sightings = [...this.grid.seenSoFar().slice(-300)];
      sightings.reverse();
      await ctx.render("index", {
        sightings,
        fix_path,
        liveScouts: Array.from(this.grid.getScoutReports().values()),
        timeAgo
      });
    });

    this.router.get("/install", async (ctx) => {
      ctx.redirect("./install/Publish.html");
    });

    this.router.get("/errors", async (ctx) => {
      try {
        const errors = await Data.getInstance().getErrorLogs(100); // Get 100 most recent errors
        await ctx.render("errors", { errors });
      } catch (error) {
        console.error('Failed to load error logs:', error);
        ctx.status = 500;
        await ctx.render('error', {
          message: 'Failed to load error logs',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.router.post(["/", "/api/report"], bodyParser({
      enableTypes: ['text', 'json'],
    }), async (ctx) => {
      console.log(ctx.request.rawBody);
      await MessageParser.getInstance().parse(ctx.request.rawBody);
      ctx.body = `Message ${++this.counter} received`;
    });

    this.router.delete("/key/:key", async (ctx) => {
      console.log("Deleting key", ctx.params.key);
      const key = querystring.unescape(ctx.params.key);
      if (key) {
        // Use the already initialized grid instance
        const success = await this.grid.delete(key);

        if (success) {
          ctx.status = 200;
          ctx.body = "";
        } else {
          ctx.status = 404;
          ctx.body = "Key Not found";
        }
      }
    });

    this.router.post("/api/error", bodyParser({
      enableTypes: ['json'],
    }), async (ctx) => {
      try {
        const errorData = ctx.request.body;
        const context = {
          ip: ctx.ip,
          userAgent: ctx.headers['user-agent'],
          path: ctx.path,
          method: ctx.method,
        };

        // Log the error to persistent storage
        const errorId = await Data.getInstance().logError(errorData, context);

        console.error('Client Error Report:', {
          id: errorId,
          timestamp: new Date().toISOString(),
          ...context,
          error: errorData
        });

        ctx.status = 200;
        ctx.body = {
          status: 'error_received',
          errorId
        };
      } catch (error) {
        console.error('Error processing error report:', error);

        // Try to log the error about error reporting failing
        try {
          await Data.getInstance().logError({
            message: 'Failed to process error report',
            originalError: error instanceof Error ? error.message : String(error)
          }, {
            path: ctx.path,
            method: ctx.method
          });
        } catch (logError) {
          console.error('Failed to log error processing error:', logError);
        }

        ctx.status = 500;
        ctx.body = {
          error: 'Failed to process error report',
          errorId: null
        };
      }
    });

    this.router.post("/api/errors/clear", async (ctx) => {
      try {
        const success = await Data.getInstance().clearErrorLogs();
        if (success) {
          ctx.status = 200;
          ctx.body = { status: 'success' };
        } else {
          ctx.status = 500;
          ctx.body = { error: 'Failed to clear error logs' };
        }
      } catch (error) {
        console.error('Failed to clear error logs:', error);
        ctx.status = 500;
        ctx.body = { error: 'Failed to clear error logs' };
      }
    });

    this.app.listen(koa_port, () =>
      console.log(`Listening on http://localhost:${koa_port}`)
    );
  }
}
