import { describe, expect, it } from 'vitest';
import { NoAvailableAgentsError, buildDelegateToAgentSchema } from './delegateToAgentSchema';

describe('buildDelegateToAgentSchema', () => {
  it('accepts a target_agent from the available id list', () => {
    const schema = buildDelegateToAgentSchema(['reviewer', 'coder']);
    const result = schema.parse({ target_agent: 'coder', task_description: 'fix the bug' });
    expect(result.target_agent).toBe('coder');
  });

  it('rejects a target_agent not in the available id list', () => {
    const schema = buildDelegateToAgentSchema(['reviewer', 'coder']);
    const result = schema.safeParse({ target_agent: 'ghost', task_description: 'fix the bug' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty task_description', () => {
    const schema = buildDelegateToAgentSchema(['coder']);
    const result = schema.safeParse({ target_agent: 'coder', task_description: '' });
    expect(result.success).toBe(false);
  });

  it('accepts an optional context field', () => {
    const schema = buildDelegateToAgentSchema(['coder']);
    const result = schema.parse({ target_agent: 'coder', task_description: 'fix it', context: 'see file x' });
    expect(result.context).toBe('see file x');
  });

  it('throws NoAvailableAgentsError when no agent ids are available', () => {
    expect(() => buildDelegateToAgentSchema([])).toThrow(NoAvailableAgentsError);
  });

  it('rebuilds the enum independently for each call, reflecting a changed roster', () => {
    const first = buildDelegateToAgentSchema(['a']);
    expect(first.safeParse({ target_agent: 'b', task_description: 'x' }).success).toBe(false);

    const second = buildDelegateToAgentSchema(['a', 'b']);
    expect(second.safeParse({ target_agent: 'b', task_description: 'x' }).success).toBe(true);
  });
});
