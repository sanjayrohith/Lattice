import type { Migration } from '../database';
import { coreSchemaMigration } from './001_core_schema';
import { usageRecordsMigration } from './002_usage_records';
import { agentProfilesMigration } from './003_agent_profiles';
import { knowledgeGraphMigration } from './004_knowledge_graph';
import { chunkFtsMigration } from './005_chunk_fts';
import { mcpServersMigration } from './006_mcp_servers';
import { toolOutcomesMigration } from './007_tool_outcomes';

/** Every migration the application ships, in the order they must be defined. */
export const migrations: readonly Migration[] = [
  coreSchemaMigration,
  usageRecordsMigration,
  agentProfilesMigration,
  knowledgeGraphMigration,
  chunkFtsMigration,
  mcpServersMigration,
  toolOutcomesMigration,
];
