export const GridScoutEventTypes = [
  "all_scouts_logged_off",
  "new_scout_logged_in",
  "new_enemy_sighted",
  "scout_decloaked",
] as const;

export type GridScoutEventType = (typeof GridScoutEventTypes)[number];
