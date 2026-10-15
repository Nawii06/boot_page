import { AsyncLocalStorage } from 'node:async_hooks';
import type BetterSqlite from 'better-sqlite3';

export type DatabaseRow = Record<string, any>;
export interface RunResult { changes: number; lastInsertRowid?: number | bigint }

export interface PreparedQuery {
  get(...parameters: unknown[]): Promise<DatabaseRow | undefined>;
  all(...parameters: unknown[]): Promise<DatabaseRow[]>;
  run(...parameters: unknown[]): Promise<RunResult>;
}

export interface TransactionRunner<T> {
  immediate(): Promise<T>;
  deferred(): Promise<T>;
}

export interface DataDatabase {
  readonly dialect: 'sqlite' | 'postgres';
  prepare(statement: string): PreparedQuery;
  transaction<T>(operation: () => T | Promise<T>): TransactionRunner<T>;
  close(): Promise<void>;
}

interface PgQueryResult {
  rows: DatabaseRow[];
  rowCount: number | null;
}

interface PgClientLike {
  query(statement: string, parameters?: unknown[]): Promise<PgQueryResult>;
  release(error?: Error): void;
}

export interface PgPoolLike {
  query(statement: string, parameters?: unknown[]): Promise<PgQueryResult>;
  connect(): Promise<PgClientLike>;
  end(): Promise<void>;
}

function toPostgresPlaceholders(statement: string): string {
  let output = '';
  let parameter = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < statement.length; i += 1) {
    const character = statement[i];
    if (character === "'" && !inDoubleQuote) {
      output += character;
      if (inSingleQuote && statement[i + 1] === "'") {
        output += statement[i + 1];
        i += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }
    if (character === '"' && !inSingleQuote) {
      output += character;
      if (inDoubleQuote && statement[i + 1] === '"') {
        output += statement[i + 1];
        i += 1;
      } else {
        inDoubleQuote = !inDoubleQuote;
      }
      continue;
    }
    if (character === '?' && !inSingleQuote && !inDoubleQuote) {
      parameter += 1;
      output += `$${parameter}`;
    } else {
      output += character;
    }
  }
  return output;
}

function normalizedParameters(parameters: unknown[]): unknown[] {
  return parameters.map((value) => value === undefined ? null : value);
}

function normalizedRows(rows: DatabaseRow[]): DatabaseRow[] {
  const numericFields = new Set([
    'total', 'n', 'count', 'size', 'revision', 'sort_order', 'pinned',
    'enabled', 'attempts', 'applicable_year', 'declared_size',
  ]);
  return rows.map((row) => {
    const normalized = { ...row };
    for (const field of numericFields) {
      const value = normalized[field];
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        const number = Number(value);
        if (Number.isSafeInteger(number)) normalized[field] = number;
      }
    }
    return normalized;
  });
}

export class PostgresDataDatabase implements DataDatabase {
  readonly dialect = 'postgres' as const;
  private readonly transactionContext = new AsyncLocalStorage<PgClientLike>();
  private savepointSequence = 0;

  constructor(private readonly pool: PgPoolLike) {}

  prepare(statement: string): PreparedQuery {
    const sql = toPostgresPlaceholders(statement);
    const execute = async (parameters: unknown[]) => {
      const values = normalizedParameters(parameters);
      const transactionClient = this.transactionContext.getStore();
      const result = transactionClient
        ? transactionClient.query(sql, values)
        : this.pool.query(sql, values);
      return result.then((queryResult) => ({
        ...queryResult,
        rows: normalizedRows(queryResult.rows),
      }));
    };
    return {
      get: async (...parameters) => (await execute(parameters)).rows[0],
      all: async (...parameters) => (await execute(parameters)).rows,
      run: async (...parameters) => ({ changes: (await execute(parameters)).rowCount ?? 0 }),
    };
  }

  transaction<T>(operation: () => T | Promise<T>): TransactionRunner<T> {
    const execute = async (mode: 'immediate' | 'deferred') => {
      const existingClient = this.transactionContext.getStore();
      if (existingClient) {
        const savepoint = `nested_${++this.savepointSequence}`;
        await existingClient.query(`SAVEPOINT ${savepoint}`);
        try {
          const result = await operation();
          await existingClient.query(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          await existingClient.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await existingClient.query(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      }

      const client = await this.pool.connect();
      await client.query(mode === 'deferred' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      try {
        const result = await this.transactionContext.run(client, operation);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    };
    return {
      immediate: () => execute('immediate'),
      deferred: () => execute('deferred'),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class SqliteDataDatabase implements DataDatabase {
  readonly dialect = 'sqlite' as const;
  private readonly transactionContext = new AsyncLocalStorage<boolean>();
  private lockTail: Promise<void> = Promise.resolve();
  private savepointSequence = 0;

  constructor(private readonly database: BetterSqlite.Database) {}

  private async acquire(): Promise<() => void> {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.lockTail;
    this.lockTail = previous.then(() => gate);
    await previous;
    return release;
  }

  private async withQueryLock<T>(operation: () => T): Promise<T> {
    if (this.transactionContext.getStore()) return operation();
    const release = await this.acquire();
    try { return operation(); } finally { release(); }
  }

  prepare(statement: string): PreparedQuery {
    const prepared = this.database.prepare(statement);
    return {
      get: (...parameters) => this.withQueryLock(
        () => prepared.get(...normalizedParameters(parameters)) as DatabaseRow | undefined,
      ),
      all: (...parameters) => this.withQueryLock(
        () => prepared.all(...normalizedParameters(parameters)) as DatabaseRow[],
      ),
      run: (...parameters) => this.withQueryLock(
        () => prepared.run(...normalizedParameters(parameters)),
      ),
    };
  }

  transaction<T>(operation: () => T | Promise<T>): TransactionRunner<T> {
    const execute = async (mode: 'immediate' | 'deferred') => {
      if (this.transactionContext.getStore()) {
        const savepoint = `nested_${++this.savepointSequence}`;
        this.database.exec(`SAVEPOINT ${savepoint}`);
        try {
          const result = await operation();
          this.database.exec(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          this.database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          this.database.exec(`RELEASE SAVEPOINT ${savepoint}`);
          throw error;
        }
      }
      const release = await this.acquire();
      this.database.exec(mode === 'immediate' ? 'BEGIN IMMEDIATE' : 'BEGIN');
      try {
        const result = await this.transactionContext.run(true, operation);
        this.database.exec('COMMIT');
        return result;
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    };
    return {
      immediate: () => execute('immediate'),
      deferred: () => execute('deferred'),
    };
  }

  async close(): Promise<void> {
    const release = await this.acquire();
    try { this.database.close(); } finally { release(); }
  }
}

export function wrapSqliteDatabase(database: BetterSqlite.Database): SqliteDataDatabase {
  return new SqliteDataDatabase(database);
}

const sqliteWrappers = new WeakMap<object, SqliteDataDatabase>();

export function asDataDatabase(database: DataDatabase | BetterSqlite.Database): DataDatabase {
  if ('dialect' in database && (database.dialect === 'sqlite' || database.dialect === 'postgres')) {
    return database as DataDatabase;
  }
  let wrapper = sqliteWrappers.get(database);
  if (!wrapper) {
    wrapper = new SqliteDataDatabase(database as BetterSqlite.Database);
    sqliteWrappers.set(database, wrapper);
  }
  return wrapper;
}

export async function openManagedDatabase(): Promise<PostgresDataDatabase> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to use Replit Database.');
  }
  const { pool } = await import('@workspace/db');
  return new PostgresDataDatabase(pool as unknown as PgPoolLike);
}
