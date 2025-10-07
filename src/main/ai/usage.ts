export interface StepUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** The minimal shape this module needs from an AI SDK `LanguageModelUsage` result. */
export interface SdkUsageLike {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}

/**
 * Normalizes an AI SDK usage result — whose token counts are all
 * `number | undefined` because not every provider reports every field —
 * into a concrete {@link StepUsage} with every field defaulted to zero.
 */
export function extractStepUsage(usage: SdkUsageLike): StepUsage {
  const promptTokens = usage.inputTokens ?? 0;
  const completionTokens = usage.outputTokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.totalTokens ?? promptTokens + completionTokens,
  };
}

/**
 * Accumulates {@link StepUsage} across every step of a run so the loop can
 * report a running total without re-summing persisted rows on each step.
 */
export class UsageAggregator {
  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;

  add(usage: StepUsage): StepUsage {
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.totalTokens += usage.totalTokens;
    return this.total();
  }

  total(): StepUsage {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
    };
  }
}

/** Sums a list of per-step usage records into a single session-level total. */
export function aggregateUsage(steps: readonly StepUsage[]): StepUsage {
  const aggregator = new UsageAggregator();
  for (const step of steps) {
    aggregator.add(step);
  }
  return aggregator.total();
}
