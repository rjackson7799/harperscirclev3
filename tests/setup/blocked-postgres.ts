// Used only by the optional test configuration. Never imported by product code.
class DatabaseDisabled {
  constructor() {
    throw new Error('Database access is disabled in test:without-db; use test:app with the guarded local stack for integration tests.');
  }
}

export { DatabaseDisabled as Client, DatabaseDisabled as Pool };
const blockedPostgres = { Client: DatabaseDisabled, Pool: DatabaseDisabled };
export default blockedPostgres;
