export interface LocalReport {
  System: string;
  ScoutName: string;
  Time: number;
  Locals: LocalPilot[];
}

export interface LocalPilot {
  Name: string;
  CharacterID: number;
  StandingHint: string;
}
