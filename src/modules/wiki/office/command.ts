import type { OfficeConfig } from "./config";
import { postToDocServer } from "./office-http";

/** CommandService error codes (api.onlyoffice.com, "Command service"). */
export const COMMAND_OK = 0;
export const COMMAND_KEY_MISSING = 1;
export const COMMAND_NO_CHANGES = 4;

export type CommandResult = { error: number; key?: string; users?: string[] };

export function sendCommand(config: OfficeConfig, payload: { c: "forcesave" | "drop" | "info"; key: string; userdata?: string; users?: string[] }) {
  return postToDocServer<CommandResult>("/command", payload, config);
}
