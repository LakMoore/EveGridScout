export interface LocalReport {
  System: string;
  ScoutName: string;
  Status: string;
  Time: number;
  Locals: LocalPilot[];
  OnGrid?: GridPilot[];
}

export interface LocalPilot {
  Name: string;
  CharacterID: number;
  StandingHint: string;
  StandingIconId: number;
}

export interface GridPilot {
  PilotName: string;
  ShipType: string;
  ShipTypeId?: number;
  StandingHint: string;
  StandingIconId?: number;
  Action: string;
  Distance?: string;
  DistanceMeters?: number;
  Corporation?: string;
  Alliance?: string;
}
