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
  initialValue?: number | null;
  initialValueDate?: string | null;
  previousValue?: number | null;
  previousValueDate?: string | null;
  lastMonthValue?: number | null;
  lastMonthValueDate?: string | null;
  lastQuarterValue?: number | null;
  lastQuarterValueDate?: string | null;
  yearStartValue?: number | null;
  yearStartValueDate?: string | null;
  lastYearValue?: number | null;
  lastYearValueDate?: string | null;
  recentValues?: number[];
}
