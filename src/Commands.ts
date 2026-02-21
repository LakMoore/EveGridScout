import { Command } from "./Command.js";
import { DisableEvent } from "./commands/disableEvent.js";
import { EnableEvent } from "./commands/enableEvent.js";
import { Hello } from "./commands/hello.js";
import { SetNullSecPocket } from "./commands/setNullSecPocket.js";
import { SetSingleSystem } from "./commands/setSingleSystem.js";
import { SetViewerRole } from "./commands/setViewerRole.js";
import { SetEventChannel } from "./commands/setEventChannel.js";
import { ShowConfig } from "./commands/showConfig.js";

export const Commands: Command[] = [
  Hello,
  SetViewerRole,
  SetEventChannel,
  EnableEvent,
  DisableEvent,
  SetSingleSystem,
  SetNullSecPocket,
  ShowConfig,
];
