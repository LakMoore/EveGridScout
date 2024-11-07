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

  public start(koa_port: number) {
    //set up logging
    this.app.use(async (ctx, next) => {
      const start = Date.now();
      await next();
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
      const grid = await Grid.getInstance();
      await ctx.render("index", {
        pilots: grid.seenSoFar(),
        fix_path,
        custom_escape,
      });
    });

    this.router.post("/", bodyParser(), async (ctx, next) => {
      console.log(ctx.request.rawBody);
      await MessageParser.getInstance().parse(ctx.request.rawBody);
      ctx.body = `Message ${++this.counter} received`;
      await next();
    });

    this.router.delete("/key/:key", async (ctx) => {
      console.log("Deleting key", ctx.params.key);
      const key = querystring.unescape(ctx.params.key);
      if (key) {
        const grid = await Grid.getInstance();
        //remove item from grid
        const success = await grid.delete(key);

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
