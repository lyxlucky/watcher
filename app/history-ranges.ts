export const historyRanges = {
  "1h": { seconds: 3600, bucket: 60 },
  "24h": { seconds: 86400, bucket: 900 },
  "7d": { seconds: 604800, bucket: 7200 },
} as const;

export type HistoryRange = keyof typeof historyRanges;
