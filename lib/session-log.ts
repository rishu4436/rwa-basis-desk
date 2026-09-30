import fs from "node:fs";
import path from "node:path";

export type SessionSnap = {
  date: string;
  clusterId: string;
  spreadBps: number | null;
  barBps: number | null;
  askDepthUsd: number | null;
  recordedAt: string;
};

const FILE = path.join(process.cwd(), "data", "session-log.json");

export function readSessionLog(): SessionSnap[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as SessionSnap[]) : [];
  } catch {
    return [];
  }
}

/** One row per cluster per UTC day. A read-only deploy keeps the file unchanged. */
export function rememberSession(snap: SessionSnap): void {
  try {
    const rows = readSessionLog().filter(
      (row) => !(row.date === snap.date && row.clusterId === snap.clusterId),
    );
    rows.push(snap);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, `${JSON.stringify(rows, null, 2)}\n`);
  } catch {
    // Production filesystem is read-only. The OHLCV series still holds the price sessions.
  }
}
