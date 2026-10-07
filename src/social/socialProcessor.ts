import { mockPosts } from "./mockPosts";
import { SocialSignal } from "./types";

export function processSocialPosts(): SocialSignal[] {
  const signals: SocialSignal[] = [];

  let waterReports = 0;
  let crowdingReports = 0;

  for (const post of mockPosts) {
    const text = post.text.toLowerCase();

    // Detect water-related reports
    if (
      text.includes("water") ||
      text.includes("thirsty") ||
      text.includes("drink")
    ) {
      waterReports++;
    }

    // Detect crowding-related reports
    if (
      text.includes("crowded") ||
      text.includes("packed") ||
      text.includes("crushed") ||
      text.includes("pushing")
    ) {
      crowdingReports++;
    }
  }

  // Turn repeated water reports into one operational signal
  if (waterReports > 0) {
    signals.push({
      id: "social-water-1",
      source: "social",
      category: "water",
      zone: "Lawn Stage",
      severity: waterReports >= 3 ? 3 : 2,
      confidence: Math.min(0.5 + waterReports * 0.1, 0.95),
      reportCount: waterReports,
      trend: "rising",
      summary: `${waterReports} social posts indicate possible water issues`,
    });
  }

  // Turn repeated crowd reports into one operational signal
  if (crowdingReports > 0) {
    signals.push({
      id: "social-crowding-1",
      source: "social",
      category: "crowding",
      zone: "Footbridge",
      severity: crowdingReports >= 3 ? 3 : 2,
      confidence: Math.min(0.5 + crowdingReports * 0.1, 0.95),
      reportCount: crowdingReports,
      trend: "rising",
      summary: `${crowdingReports} social posts indicate possible crowding`,
    });
  }

  return signals;
}