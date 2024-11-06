import Koa from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import { Grid } from "./Grid";
import { MessageParser } from "./MessageParser";

export class Server {
  private readonly app = new Koa();
  private readonly router = new Router();

  public start(koa_port: number) {
    this.app.use(bodyParser());
    this.app.use(this.router.routes());

    this.router.get("/", async (ctx) => {
      const grid = await Grid.getInstance();
      ctx.body = "Seen in Hoth so far:\n" + grid.seenSoFar().join("\n");
    });

    this.router.post("/", async (ctx, next) => {
      console.log(ctx.request.rawBody);
      await MessageParser.getInstance().parse(ctx.request.rawBody);
      ctx.body = "Message received";
      await next();
    });

    this.app.listen(koa_port, () =>
      console.log(`Listening on http://localhost:${koa_port}`)
    );
  }
}
