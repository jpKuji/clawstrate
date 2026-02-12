import { moltbookSourceAdapter } from "./moltbook";
import { rentahumanSourceAdapter } from "./rentahuman";
import { SourceAdapter } from "./types";

const adapters: SourceAdapter[] = [moltbookSourceAdapter, rentahumanSourceAdapter];

export function getSourceAdapters(): SourceAdapter[] {
  return adapters;
}

export function getEnabledSourceAdapters(): SourceAdapter[] {
  return adapters.filter((adapter) => adapter.isEnabled());
}
