// defines what the output looks like
export type SocialSignal = {
    id: string;
    source: "social";
    category: "crowding" | "water" | "safety" | "heat" | "other";
    zone: string | null;
    severity: 1 | 2 | 3 | 4;
    confidence: number;
    reportCount: number;
    trend: "rising" | "steady" | "falling";
    summary: string;
  };