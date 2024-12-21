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

function custom_escape(str: string) {
  return querystring.escape(str).replace(/\//g, "%2F");
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
      sightings.reverse();
      await ctx.render("index", {
        sightings,
        fix_path,
        custom_escape,
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
