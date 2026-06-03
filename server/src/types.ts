export type AccountKind = "asset" | "liability";

export interface Account {
  id: number;
  userId: number;
  name: string;
  kind: AccountKind;
  category: string;
  currency: string;
  updateFrequency: string;
  tagsJson: string;
  notes: string | null;
  isArchived: number;
  createdAt: string;
  updatedAt: string;
}

export interface ValueEntry {
  id: number;
  accountId: number;
  value: number;
  valueDate: string;
  note: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountWithLatest extends Account {
  latestValue: number | null;
  latestValueDate: string | null;
}
