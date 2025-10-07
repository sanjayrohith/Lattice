import { describe, expect, it } from 'vitest';
import { aggregateUsage, extractStepUsage, UsageAggregator } from './usage';

describe('extractStepUsage', () => {
  it('extracts token counts when every field is reported', () => {
    expect(extractStepUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 })).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('defaults missing fields to zero', () => {
    expect(extractStepUsage({})).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it('derives totalTokens from prompt and completion when the provider omits it', () => {
    expect(extractStepUsage({ inputTokens: 30, outputTokens: 20 })).toEqual({
      promptTokens: 30,
      completionTokens: 20,
      totalTokens: 50,
    });
  });
});

describe('UsageAggregator', () => {
  it('accumulates usage across multiple steps', () => {
    const aggregator = new UsageAggregator();

    aggregator.add({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    const runningTotal = aggregator.add({ promptTokens: 20, completionTokens: 8, totalTokens: 28 });

    expect(runningTotal).toEqual({ promptTokens: 30, completionTokens: 13, totalTokens: 43 });
    expect(aggregator.total()).toEqual({ promptTokens: 30, completionTokens: 13, totalTokens: 43 });
  });

  it('starts at zero with no steps added', () => {
    expect(new UsageAggregator().total()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});

describe('aggregateUsage', () => {
  it('sums a list of per-step usage records', () => {
    const total = aggregateUsage([
      { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
    ]);

    expect(total).toEqual({ promptTokens: 17, completionTokens: 8, totalTokens: 25 });
  });

  it('returns zero for an empty list', () => {
    expect(aggregateUsage([])).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });
});
