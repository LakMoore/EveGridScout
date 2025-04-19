import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import views from "@ladjs/koa-views";
import bodyParser from "koa-bodyparser";
import path from "path";
import querystring from "querystring";
import { Grid } from "./Grid";
import { MessageParser } from "./MessageParser";

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

    // Set up view rendering
    this.app.use(
      views(path.join(__dirname, "../views"), {
        extension: "ejs",
      })
    );

    this.app.use(this.router.routes()).use(this.router.allowedMethods());

    this.router.get("/", async (ctx) => {
      // Use the already initialized grid instance
      const sightings = [...this.grid.seenSoFar().slice(-500)];
      // get an array of the keys from liveScouts
      const liveScouts = Array.from(this.grid.getScoutReports().keys());
      sightings.reverse();
      await ctx.render("index", {
        sightings,
        fix_path,
        liveScouts,
        timeAgo
      });
    });

    this.router.post("/", bodyParser({
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

    this.app.listen(koa_port, () =>
      console.log(`Listening on http://localhost:${koa_port}`)
    );
  }
}
