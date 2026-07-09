export type UserName = "Ian" | "Spike";

export type Preset = {
  id: string;
  label: string;
  sender: UserName;
  sort_order: number;
  active: boolean;
};

export type CueEvent = {
  id: string;
  message: string;
  from: UserName;
  to: UserName;
  sentAt: string;
};

export type AckEvent = {
  cueId: string;
  from: UserName;
  to: UserName;
  message: string;
  sentAt: string;
};

export type ChatMessage = {
  id: string;
  room_name: string;
  sender: UserName;
  body: string;
  seen_by: UserName[];
  acknowledged_by: UserName[];
  flashing_for: UserName[];
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
