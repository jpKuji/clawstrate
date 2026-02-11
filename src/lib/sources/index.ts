import { moltbookSourceAdapter } from "./moltbook";
import { SourceAdapter } from "./types";

const adapters: SourceAdapter[] = [moltbookSourceAdapter];

export function getSourceAdapters(): SourceAdapter[] {
  return adapters;
}

export function getEnabledSourceAdapters(): SourceAdapter[] {
  return adapters.filter((adapter) => adapter.isEnabled());
}
