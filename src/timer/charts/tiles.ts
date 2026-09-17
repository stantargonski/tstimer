/**
 * Which boxes the stats page shows, and in what order.
 *
 * A plain module rather than part of the component: a component file that also
 * exports data is a component file fast refresh stops being able to reload.
 */
export interface TileSpec {
  id: string;
  name: string;
  /**
   * Limits the box to events that time memo and execution apart, or to those
   * that don't. Unset shows everywhere.
   */
  only?: 'split' | 'unsplit';
}

/**
 * Both sets come to eight — the grid steps between 8, 4 and 2 columns and only
 * ever fills whole rows because of it. Keep them at eight.
 */
export const TILES: TileSpec[] = [
  { id: 'solves', name: 'solves' },
  { id: 'time', name: 'time solving' },
  { id: 'best', name: 'best single' },
  { id: 'mean', name: 'mean' },
  { id: 'deviation', name: 'deviation' },
  { id: 'bestAo5', name: 'best ao5' },
  { id: 'bestAo12', name: 'best ao12', only: 'unsplit' },
  { id: 'bestAo100', name: 'best ao100', only: 'unsplit' },
  { id: 'memo', name: 'memo', only: 'split' },
  { id: 'exec', name: 'exec', only: 'split' },
];
