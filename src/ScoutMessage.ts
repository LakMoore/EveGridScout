import { ScoutEntry } from "./ScoutEntry";

export interface ScoutMessage {
    Message: string;
    Scout: string;
    System: string;
    Wormhole: string;
    Entries: ScoutEntry[];
    Disconnected: boolean;
    Version: string;
}
