import type { Site } from './types';

export const STATS_MESSAGE = 'ses-filter:stats';

export type PageStats = {
  site: Site;
  listPage: boolean;
  cards: number;
  hidden: number;
  flagged: number;
  pending: number;
  unrecognized: number;
  reasons: Record<string, number>;
  warnings: string[];
};
