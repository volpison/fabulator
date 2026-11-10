import { spawnSync } from "node:child_process";

/** True when a command-line tool exists and runs (these tests use real tools as referees). */
export const hasTool = (cmd: string, args: string[] = ["--version"]): boolean => {
  try {
    return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
};
