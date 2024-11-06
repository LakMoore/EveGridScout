import Koa from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import { Grid } from "./Grid";
import { MessageParser } from "./MessageParser";

const KOA_PORT = 3000;

export class Server {
  private readonly app = new Koa();
  private readonly router = new Router();

  public start() {
    this.app.use(bodyParser());
    this.app.use(this.router.routes());

    this.router.get("/", async (ctx) => {
      ctx.body =
        "Seen in Hoth so far:\n" +
        (await Grid.getInstance()).seenSoFar().join("\n");
    });

    this.router.post("/", async (ctx, next) => {
      console.log(ctx.request.rawBody);
      await MessageParser.parse(ctx.request.rawBody);
      ctx.body = "Message received";
      await next();
    });

    this.app.listen(KOA_PORT, () =>
      console.log(`Listening on http://localhost:${KOA_PORT}`)
    );
  }
}
