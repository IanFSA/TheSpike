export type Person = {
  id: string;
  room_name: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TargetName = string | "Everyone";

export type CueEvent = {
  id: string;
  from: string;
  to: TargetName;
  sentAt: string;
};

export type AckEvent = {
  cueId: string;
  from: string;
  to: string;
  sentAt: string;
};

export type ChatMessage = {
  id: string;
  room_name: string;
  sender: string;
  recipient: TargetName;
  body: string;
  seen_by: string[];
  acknowledged_by: string[];
  flashing_for: string[];
  created_at: string;
};

export type Contestant = {
  id: string;
  room_name: string;
  name: string;
  correct_count: number;
  wrong_count: number;
  sort_order: number;
  updated_at: string;
};
