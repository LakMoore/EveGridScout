import Koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import views from "@ladjs/koa-views";
import bodyParser from "koa-bodyparser";
import path from "path";
import { Grid } from "./Grid";
import { MessageParser } from "./MessageParser";

export class Server {
  private readonly app = new Koa();
  private readonly router = new Router();

  public start(koa_port: number) {
    //set up logging
    this.app.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const ms = Date.now() - start;
      console.log(`Koa: ${ctx.method} ${ctx.url} - ${ms}ms`);
    });

    // Set up static file serving
    this.app.use(serve(path.join(__dirname, "public")));

    // Set up view rendering
    this.app.use(
      views(path.join(__dirname, "views"), {
        extension: "ejs",
      })
    );

    this.app.use(this.router.routes()).use(this.router.allowedMethods());

    this.router.get("/", async (ctx) => {
      const grid = await Grid.getInstance();
      await ctx.render("index", {
        root_path: process.env.SERVER_ROOT_PATH,
        pilots: grid.seenSoFar(),
      });
    });

    this.router.post("/", bodyParser(), async (ctx, next) => {
      console.log(ctx.request.rawBody);
      await MessageParser.getInstance().parse(ctx.request.rawBody);
      ctx.body = "Message received";
      await next();
    });

    this.router.delete("/key/:key", async (ctx) => {
      console.log("Deleting key", ctx.params.key);
      const key = ctx.params.key;
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
      console.log(
        `Listening on http://localhost:${koa_port}${process.env.SERVER_ROOT_PATH}`
      )
    );
  }
}
