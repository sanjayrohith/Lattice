import type { Migration } from '../database';
import { coreSchemaMigration } from './001_core_schema';

/** Every migration the application ships, in the order they must be defined. */
export const migrations: readonly Migration[] = [coreSchemaMigration];
