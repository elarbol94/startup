import { describe, expect, it } from "vitest";
import { clusterDeadlineMarkers } from "./deadline-clusters";

describe("clusterDeadlineMarkers", () => {
  const at = (x: number) => ({ id: String(x), x });

  it("keeps markers that are far apart separate", () => {
    const clusters = clusterDeadlineMarkers([at(0), at(40), at(80)], (item) => item.x, 24);
    expect(clusters.map((cluster) => cluster.items.length)).toEqual([1, 1, 1]);
  });

  it("merges overlapping markers and centres the cluster", () => {
    const clusters = clusterDeadlineMarkers([at(16), at(0), at(32), at(48)], (item) => item.x, 24);
    expect(clusters.map((cluster) => cluster.items.map((item) => item.x))).toEqual([[0, 16], [32, 48]]);
    expect(clusters[0].x).toBe(8);
  });

  it("never merges when the distance is zero", () => {
    const clusters = clusterDeadlineMarkers([at(5), at(5)], (item) => item.x, 0);
    expect(clusters).toHaveLength(2);
  });
});
