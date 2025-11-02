import type { Migration } from '../database';
import { coreSchemaMigration } from './001_core_schema';
import { usageRecordsMigration } from './002_usage_records';
import { agentProfilesMigration } from './003_agent_profiles';

/** Every migration the application ships, in the order they must be defined. */
export const migrations: readonly Migration[] = [
  coreSchemaMigration,
  usageRecordsMigration,
  agentProfilesMigration,
];
