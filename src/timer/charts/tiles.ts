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
 * The fixed boxes either side of the averages. The averages themselves come
 * from the settings' list and go where `averages` sits: every one of them for
 * an event timed in one piece, only the shortest for a split event, which
 * gives up the rest to memo and exec.
 *
 * With the stock list both sets come to eight. Other lengths are padded out
 * to whole rows by the component, since the grid steps between 8, 4 and 2
 * columns.
 */
export const TILES: TileSpec[] = [
  { id: 'solves', name: 'solves' },
  { id: 'time', name: 'time solving' },
  { id: 'best', name: 'best single' },
  { id: 'mean', name: 'mean' },
  { id: 'deviation', name: 'deviation' },
  { id: 'averages', name: 'averages' },
  { id: 'memo', name: 'memo', only: 'split' },
  { id: 'exec', name: 'exec', only: 'split' },
];
