export function isSplitPipelineEnabled(): boolean {
  return process.env.PIPELINE_SPLIT_JOBS === "true";
}
