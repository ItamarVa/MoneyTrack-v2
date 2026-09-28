declare module "better-sqlite3-multiple-ciphers" {
  import type BetterSqlite from "better-sqlite3";

  interface Database extends BetterSqlite.Database {
    key(key: Buffer): number;
    rekey(key: Buffer): number;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: BetterSqlite.Options): Database;
    (filename: string, options?: BetterSqlite.Options): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
