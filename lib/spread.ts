import { loadDesk } from "./desk";
import type { SpreadSeries } from "./types";

export async function loadSpread(clusterId: string): Promise<SpreadSeries> {
  const desk = await loadDesk(clusterId);
  return (
    desk.spread ?? {
      clusterId,
      buySymbol: desk.ticket.buySymbol ?? "",
      avoidSymbol: desk.ticket.avoidSymbol ?? "",
      points: [],
      summary: desk.ticket.history,
      endpointsUsed: desk.endpointsUsed,
    }
  );
}
