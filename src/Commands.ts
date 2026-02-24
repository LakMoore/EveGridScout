import { Command } from "./Command.js";
import { ClearSpyStatus } from "./commands/clearSpyStatus.js";
import { DisableEvent } from "./commands/disableEvent.js";
import { EnableEvent } from "./commands/enableEvent.js";
import { Hello } from "./commands/hello.js";
import { SetNullSecPocket } from "./commands/setNullSecPocket.js";
import { SetSingleSystem } from "./commands/setSingleSystem.js";
import { SetViewerRole } from "./commands/setViewerRole.js";
import { SetEventChannel } from "./commands/setEventChannel.js";
import { ShowSpies } from "./commands/showSpies.js";
import { ShowConfig } from "./commands/showConfig.js";

export const Commands: Command[] = [
  Hello,
  ClearSpyStatus,
  SetViewerRole,
  SetEventChannel,
  EnableEvent,
  DisableEvent,
  SetSingleSystem,
  SetNullSecPocket,
  ShowSpies,
  ShowConfig,
];
