import { app } from 'electron';
import Store from 'electron-store';
import { PREFERENCES_DEFAULTS, preferencesSchema, type Preferences } from './preferences';

export interface CreatePreferencesStoreOptions {
  /** Overrides the on-disk directory `electron-store` writes into; defaults to Electron's userData path. */
  cwd?: string;
  /** Overrides the version migrations run against; defaults to the running app's version. */
  projectVersion?: string;
}

/**
 * Creates the `electron-store`-backed preferences store. Schema violations
 * on an existing on-disk file are reset to schema defaults by `conf`
 * itself rather than throwing, and the `1.0.0` migration guarantees every
 * key introduced since the first shipped shape is backfilled for stores
 * created before it existed.
 */
export function createPreferencesStore(options: CreatePreferencesStoreOptions = {}): Store<Preferences> {
  // `electron-store`'s public `Options` type omits `projectVersion` because
  // it normally derives it from the running Electron app; the underlying
  // `conf` library it wraps still accepts an explicit override, which is
  // required here so this store is constructible outside a real Electron
  // process (e.g. under Vitest).
  const storeOptions = {
    name: 'preferences',
    projectVersion: options.projectVersion ?? app.getVersion(),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    defaults: PREFERENCES_DEFAULTS,
    schema: preferencesSchema,
    migrations: {
      '1.0.0': (store: Store<Preferences>) => {
        for (const [key, value] of Object.entries(PREFERENCES_DEFAULTS) as Array<
          [keyof Preferences, Preferences[keyof Preferences]]
        >) {
          if (!store.has(key)) {
            store.set(key, value);
          }
        }
      },
    },
  };

  return new Store<Preferences>(
    storeOptions as unknown as ConstructorParameters<typeof Store<Preferences>>[0],
  );
}
