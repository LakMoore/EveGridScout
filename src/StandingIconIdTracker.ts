import path from "node:path";
import { promises as fs } from "node:fs";
import { LocalReport } from "./LocalReport.js";

interface StandingIconSnapshot {
  observedStandingIconIds: number[];
  lastUpdatedUtc: string;
}

export class StandingIconIdTracker {
  private static readonly OUTPUT_PATH = path.join(
    process.cwd(),
    "docs",
    "standing-icon-id-observations.json",
  );

  public static async recordLocalReport(localReport: LocalReport) {
    const localIds = localReport.Locals.map((local) =>
      Math.trunc(Number(local.StandingIconId)),
    ).filter((value) => Number.isFinite(value));

    const onGridIds = (localReport.OnGrid ?? [])
      .map((pilot) => Math.trunc(Number(pilot.StandingIconId ?? NaN)))
      .filter((value) => Number.isFinite(value));

    const observedIds = Array.from(new Set([...localIds, ...onGridIds]));

    if (observedIds.length === 0) {
      return;
    }

    try {
      await fs.mkdir(path.dirname(StandingIconIdTracker.OUTPUT_PATH), {
        recursive: true,
      });

      const existing = await StandingIconIdTracker.readSnapshot();
      const mergedIds = new Set<number>(existing.observedStandingIconIds);

      let changed = false;
      for (const value of observedIds) {
        if (!mergedIds.has(value)) {
          mergedIds.add(value);
          changed = true;
        }
      }

      if (!changed) {
        return;
      }

      const nextSnapshot: StandingIconSnapshot = {
        observedStandingIconIds: Array.from(mergedIds).sort((a, b) => a - b),
        lastUpdatedUtc: new Date().toISOString(),
      };

      await fs.writeFile(
        StandingIconIdTracker.OUTPUT_PATH,
        `${JSON.stringify(nextSnapshot, null, 2)}\n`,
        "utf8",
      );
    } catch (error) {
      console.error("Failed to persist standing icon ID observations:", error);
    }
  }

  private static async readSnapshot(): Promise<StandingIconSnapshot> {
    try {
      const raw = await fs.readFile(StandingIconIdTracker.OUTPUT_PATH, "utf8");
      const parsed = JSON.parse(raw) as {
        observedStandingIconIds?: unknown;
        lastUpdatedUtc?: unknown;
      };

      const observedStandingIconIds = Array.isArray(
        parsed.observedStandingIconIds,
      )
        ? parsed.observedStandingIconIds
            .map((value) => Math.trunc(Number(value)))
            .filter((value) => Number.isFinite(value))
        : [];

      const lastUpdatedUtc =
        typeof parsed.lastUpdatedUtc === "string"
          ? parsed.lastUpdatedUtc.trim()
          : "";

      return {
        observedStandingIconIds: Array.from(
          new Set(observedStandingIconIds),
        ).sort((a, b) => a - b),
        lastUpdatedUtc,
      };
    } catch {
      return {
        observedStandingIconIds: [],
        lastUpdatedUtc: "",
      };
    }
  }
}
