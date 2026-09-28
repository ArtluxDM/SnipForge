import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";
import type { Command, Library, LibraryType, LibraryPermission, SyncResult } from "../../shared/types";

export type { Command, Library }
type LibraryRow = Omit<Library, 'local_path' | 'origin' | 'working_copy'> & {
    origin_url?: string | null
    origin_ref?: string | null
}
// Initialize and export the database connection
let db: Database.Database | null = null;
export function initializeDatabase(customDbPath?: string): Database.Database {
    console.log('Initializing database...')
    // get the path where electron stores user data
    const dbPath = customDbPath || path.join(app.getPath('userData'), 'snipforge.db')
    console.log('Database path:', dbPath)
try {
    //create or open the database
    db = new Database(dbPath)
    // Enable WAL mode for better read performance
    db.pragma('journal_mode = WAL')
    // Create the commands table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            description TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            language TEXT DEFAULT 'plaintext',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Performance indices for frequently queried columns
        CREATE INDEX IF NOT EXISTS idx_commands_title ON commands(title);
        CREATE INDEX IF NOT EXISTS idx_commands_updated_at ON commands(updated_at DESC);
    `)

    // Add description column to existing tables (migration)
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN description TEXT DEFAULT ''`)
        console.log('Added description column to existing database')
    } catch (error) {
        // Column already exists or other error, ignore
        console.log('Description column already exists or table is new')
    }

    // Add language column to existing tables (migration)
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN language TEXT DEFAULT 'plaintext'`)
        console.log('Added language column to existing database')
    } catch (error) {
        // Column already exists or other error, ignore
        console.log('Language column already exists or table is new')
    }

    // Remote library migrations
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`)
        console.log('Added source column to commands')
    } catch { /* already exists */ }

    try {
        db.exec(`ALTER TABLE commands ADD COLUMN library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE`)
        console.log('Added library_id column to commands')
    } catch { /* already exists */ }

    try {
        db.exec(`ALTER TABLE commands ADD COLUMN remote_path TEXT`)
        console.log('Added remote_path column to commands')
    } catch { /* already exists */ }

    // Libraries table
    db.exec(`
        CREATE TABLE IF NOT EXISTS libraries (
            id INTEGER PRIMARY KEY,
            github_repo TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            last_synced_at TEXT,
            last_synced_sha TEXT,
            origin_url TEXT,
            origin_ref TEXT,
            created_at TEXT NOT NULL
        );
    `)

    // Auth token storage
    db.exec(`
        CREATE TABLE IF NOT EXISTS auth (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `)

    // Settings storage (key-value, JSON-encoded values)
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `)

    // Library manifest_path migration
    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN manifest_path TEXT`)
        // Backfill: existing libraries with a synced SHA are already initialized
        db.exec(`UPDATE libraries SET manifest_path = '.snipforge.json' WHERE last_synced_sha IS NOT NULL AND manifest_path IS NULL`)
        console.log('Added manifest_path column to libraries')
    } catch { /* already exists */ }

    // Library type migration (github vs local)
    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN type TEXT NOT NULL DEFAULT 'github'`)
        console.log('Added type column to libraries')
    } catch { /* already exists */ }

    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN origin_url TEXT`)
        console.log('Added origin_url column to libraries')
    } catch { /* already exists */ }

    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN origin_ref TEXT`)
        console.log('Added origin_ref column to libraries')
    } catch { /* already exists */ }

    // Per-library auto-sync toggle
    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN auto_sync INTEGER NOT NULL DEFAULT 0`)
        console.log('Added auto_sync column to libraries')
    } catch { /* already exists */ }

    // Library permission role (owner/curator/consumer)
    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN permission TEXT NOT NULL DEFAULT 'consumer'`)
        console.log('Added permission column to libraries')
    } catch { /* already exists */ }

    // Index for fast remote command lookups
    db.exec(`CREATE INDEX IF NOT EXISTS idx_commands_library_id ON commands(library_id);`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_commands_source ON commands(source);`)

    console.log('Database table created successfully')
    return db
    }catch (error) {
        console.error('Error initializing database:', error)
        throw error
    }
}
// Close the database connection
export function closeDatabase(): void {
    if (db) {
        db.close()
        db = null
        console.log('Database closed')
    }
}

// Function to get all commands from DB
export function getAllCommands(): Command[] {
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare("SELECT * FROM commands ORDER BY updated_at DESC");
    return stmt.all() as Command[];
}
//update a command in DB
export function updateCommand(id: number, updates: Partial<Command>): boolean{
    if (!db) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    const title = (updates.title || '').slice(0, MAX_TITLE_LENGTH)
    const stmt = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, description = ?, tags = ?, language = ?, updated_at = ?,
            source = 'local', library_id = NULL, remote_path = NULL
        WHERE id = ?
    `);
    const result = stmt.run(
        title,
        updates.body || '',
        updates.description || '',
        updates.tags || '[]',
        updates.language || 'plaintext',
        now,
        id
    );
    return result.changes > 0;
}
// delete command from DB
export function deleteCommand(id: number): boolean {
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare("DELETE FROM commands WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
}

export function deleteCommandsByIds(ids: number[]): number {
    if (!db) throw new Error("Database not initialized");
    if (ids.length === 0) return 0

    const stmt = db.prepare("DELETE FROM commands WHERE id = ?")
    const transaction = db.transaction((commandIds: number[]) => {
        let deleted = 0
        for (const id of commandIds) {
            deleted += stmt.run(id).changes
        }
        return deleted
    })

    return transaction(ids)
}
// add a new command to DB
const MAX_TITLE_LENGTH = 500

export function addCommand(command: Omit<Command, 'id' | 'created_at' | 'updated_at'>): number {
    if (!db) throw new Error("Database not initialized");
    const title = command.title?.slice(0, MAX_TITLE_LENGTH)
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        title,
        command.body,
        command.description || '',
        command.tags || '[]',
        command.language || 'plaintext',
        now,
        now
    );
    return result.lastInsertRowid as number;
}

export function addCommands(commands: Array<Omit<Command, 'id' | 'created_at' | 'updated_at'>>): number {
    if (!db) throw new Error("Database not initialized");
    if (commands.length === 0) return 0

    const now = new Date().toISOString()
    const stmt = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const transaction = db.transaction((items: Array<Omit<Command, 'id' | 'created_at' | 'updated_at'>>) => {
        let inserted = 0
        for (const command of items) {
            const title = command.title?.slice(0, MAX_TITLE_LENGTH)
            stmt.run(
                title,
                command.body,
                command.description || '',
                command.tags || '[]',
                command.language || 'plaintext',
                now,
                now
            )
            inserted += 1
        }
        return inserted
    })

    return transaction(commands)
}
// test data function
export function seedTestData(): void {
    if (!db) throw new Error("Database not initialized");
    // check if we already have data
    const existingCommands = getAllCommands()
    if (existingCommands.length > 0) {
        console.log('Database already has data, skipping seeding.')
        return
    }

    console.log('Seeding database with test data...')

    //prepare the insert statement
    const insertCommand = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()

    //sample welcome command
    insertCommand.run(
        'Welcome to SnipForge!',
        'You can create snippets in plain text or markdown, and add variables with the following syntax {{variable name}}. Read the help section for more.',
        'This section is used to describe your snippets and it also supports markdown, cool right?',
        '["snipforge", "by_artluxdm"]',
        'markdown',
        now,
        now
    )

    console.log('✅ Test data added successfully')
}

// ── Library functions ──────────────────────────────────────────────

function toLibraryContract(row: LibraryRow): Library {
    const isLocal = row.type === 'local'
    const localPath = isLocal ? row.github_repo : null
    const originUrl = row.origin_url ?? (isLocal ? null : row.github_repo)
    const { origin_url, origin_ref, ...rest } = row

    return {
        ...rest,
        local_path: localPath,
        origin: originUrl
            ? {
                provider: 'github',
                url: originUrl,
                ref: row.origin_ref ?? row.last_synced_sha ?? null,
            }
            : null,
        working_copy: {
            local_path: localPath,
            manifest_path: row.manifest_path,
            materialized: isLocal && !!row.manifest_path,
        },
        working_tree: {
            state: localPath ? 'not_repo' : 'no_working_copy',
            has_changes: false,
            modified: 0,
            added: 0,
            deleted: 0,
            checked_at: null,
            error: null,
        },
    }
}

export function getAllLibraries(): Library[] {
    if (!db) throw new Error("Database not initialized")
    const rows = db.prepare("SELECT * FROM libraries ORDER BY created_at DESC").all() as LibraryRow[]
    return rows.map(toLibraryContract)
}

export function getLibraryByRepo(githubRepo: string): Library | undefined {
    if (!db) throw new Error("Database not initialized")
    const row = db.prepare("SELECT * FROM libraries WHERE github_repo = ?").get(githubRepo) as LibraryRow | undefined
    return row ? toLibraryContract(row) : undefined
}

export function addLibrary(githubRepo: string, name: string, description: string, manifestPath?: string, type: LibraryType = 'github', permission: LibraryPermission = 'consumer'): number {
    if (!db) throw new Error("Database not initialized")
    const now = new Date().toISOString()
    const result = db.prepare(`
        INSERT INTO libraries (github_repo, name, description, manifest_path, type, permission, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(githubRepo, name, description, manifestPath ?? null, type, permission, now)
    return result.lastInsertRowid as number
}

export function updateLibrarySync(libraryId: number, sha: string): void {
    if (!db) throw new Error("Database not initialized")
    const now = new Date().toISOString()
    db.prepare(`
        UPDATE libraries SET last_synced_at = ?, last_synced_sha = ? WHERE id = ?
    `).run(now, sha, libraryId)
}

export function updateLibraryManifest(libraryId: number, name: string, description: string, manifestPath: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare(`
        UPDATE libraries SET name = ?, description = ?, manifest_path = ? WHERE id = ?
    `).run(name, description, manifestPath, libraryId)
}

export function updateLibraryOrigin(libraryId: number, originUrl: string | null, originRef: string | null): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare(`
        UPDATE libraries SET origin_url = ?, origin_ref = ? WHERE id = ?
    `).run(originUrl, originRef, libraryId)
}

export function updateLibraryToLocalWorkingCopy(
    libraryId: number,
    localPath: string,
    originUrl: string,
    originRef: string | null,
    manifestPath: string | null = '.snipforge.json'
): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare(`
        UPDATE libraries
        SET github_repo = ?, type = 'local', manifest_path = ?, origin_url = ?, origin_ref = ?
        WHERE id = ?
    `).run(localPath, manifestPath, originUrl, originRef, libraryId)
}

export function clearLibraryManifest(libraryId: number): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare(`
        UPDATE libraries SET manifest_path = NULL, last_synced_sha = NULL WHERE id = ?
    `).run(libraryId)
}

export function updateLibraryPermission(libraryId: number, permission: LibraryPermission): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("UPDATE libraries SET permission = ? WHERE id = ?").run(permission, libraryId)
}

export function setLibraryAutoSync(libraryId: number, enabled: boolean): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("UPDATE libraries SET auto_sync = ? WHERE id = ?").run(enabled ? 1 : 0, libraryId)
}

export function deleteLibrary(libraryId: number): void {
    if (!db) throw new Error("Database not initialized")
    // Delete remote commands first (CASCADE should handle this, but be explicit)
    db.prepare("DELETE FROM commands WHERE library_id = ?").run(libraryId)
    db.prepare("DELETE FROM libraries WHERE id = ?").run(libraryId)
}

// ── Remote command functions ──────────────────────────────────────

export function getLocalCommandBodies(): Set<string> {
    if (!db) throw new Error("Database not initialized")
    const rows = db.prepare(
        "SELECT body FROM commands WHERE source = 'local'"
    ).all() as Array<{ body: string }>
    return new Set(rows.map(r => r.body.trim()))
}

export function getRemoteCommands(libraryId: number): Command[] {
    if (!db) throw new Error("Database not initialized")
    return db.prepare(
        "SELECT * FROM commands WHERE library_id = ? AND source = 'remote'"
    ).all(libraryId) as Command[]
}

export function getLegacyDbOnlyCommands(): Command[] {
    if (!db) throw new Error("Database not initialized")
    return db.prepare(
        "SELECT * FROM commands WHERE source = 'local' AND library_id IS NULL AND remote_path IS NULL ORDER BY created_at ASC"
    ).all() as Command[]
}

export function addRemoteCommand(
    libraryId: number,
    remotePath: string,
    command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string }
): number {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, source, library_id, remote_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'remote', ?, ?, ?, ?)
    `).run(
        command.title,
        command.body,
        command.description,
        command.tags,
        command.language,
        libraryId,
        remotePath,
        command.created_at,
        command.updated_at
    )
    return result.lastInsertRowid as number
}

export function updateRemoteCommand(
    libraryId: number,
    remotePath: string,
    command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string }
): boolean {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, description = ?, tags = ?, language = ?, updated_at = ?
        WHERE library_id = ? AND remote_path = ? AND source = 'remote'
    `).run(
        command.title,
        command.body,
        command.description,
        command.tags,
        command.language,
        command.updated_at,
        libraryId,
        remotePath
    )
    return result.changes > 0
}

export function updateRemoteCommandById(
    id: number,
    updates: { remote_path: string; title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string }
): boolean {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(`
        UPDATE commands
        SET remote_path = ?, title = ?, body = ?, description = ?, tags = ?, language = ?, created_at = ?, updated_at = ?
        WHERE id = ? AND source = 'remote'
    `).run(
        updates.remote_path,
        updates.title,
        updates.body,
        updates.description,
        updates.tags,
        updates.language,
        updates.created_at,
        updates.updated_at,
        id
    )
    return result.changes > 0
}

export function deleteRemoteCommand(libraryId: number, remotePath: string): boolean {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(
        "DELETE FROM commands WHERE library_id = ? AND remote_path = ? AND source = 'remote'"
    ).run(libraryId, remotePath)
    return result.changes > 0
}

// Batch sync: runs all add/update/remove in a single transaction
export function syncRemoteCommands(
    libraryId: number,
    sha: string,
    toAdd: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string } }>,
    toUpdate: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string } }>,
    toRemove: string[]
): SyncResult {
    if (!db) throw new Error("Database not initialized")
    const errors: string[] = []

    const transaction = db.transaction(() => {
        for (const item of toAdd) {
            try {
                addRemoteCommand(libraryId, item.remotePath, item.command)
            } catch (e) {
                errors.push(`Failed to add ${item.remotePath}: ${(e as Error).message}`)
            }
        }
        for (const item of toUpdate) {
            try {
                const updated = updateRemoteCommand(libraryId, item.remotePath, item.command)
                if (!updated) {
                    errors.push(`Failed to update ${item.remotePath}: command not found`)
                }
            } catch (e) {
                errors.push(`Failed to update ${item.remotePath}: ${(e as Error).message}`)
            }
        }
        for (const remotePath of toRemove) {
            try {
                const removed = deleteRemoteCommand(libraryId, remotePath)
                if (!removed) {
                    errors.push(`Failed to remove ${remotePath}: command not found`)
                }
            } catch (e) {
                errors.push(`Failed to remove ${remotePath}: ${(e as Error).message}`)
            }
        }
        if (errors.length === 0) {
            updateLibrarySync(libraryId, sha)
        }
    })

    transaction()

    return {
        added: toAdd.length - errors.filter(e => e.startsWith('Failed to add')).length,
        updated: toUpdate.length - errors.filter(e => e.startsWith('Failed to update')).length,
        removed: toRemove.length - errors.filter(e => e.startsWith('Failed to remove')).length,
        errors
    }
}

// ── Auth storage (encrypted tokens) ──────────────────────────────

export function getAuthValue(key: string): string | null {
    if (!db) throw new Error("Database not initialized")
    const row = db.prepare("SELECT value FROM auth WHERE key = ?").get(key) as { value: string } | undefined
    return row?.value ?? null
}

export function setAuthValue(key: string, value: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)").run(key, value)
}

export function deleteAuthValue(key: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("DELETE FROM auth WHERE key = ?").run(key)
}

// ── Settings storage ──────────────────────────────────────────────

export function getSettingValue(key: string): string | null {
    if (!db) throw new Error("Database not initialized")
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined
    return row?.value ?? null
}

export function setSettingValue(key: string, value: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value)
}

export function getAllSettings(): Record<string, string> {
    if (!db) throw new Error("Database not initialized")
    const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>
    const result: Record<string, string> = {}
    for (const row of rows) {
        result[row.key] = row.value
    }
    return result
}

export function deleteSetting(key: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("DELETE FROM settings WHERE key = ?").run(key)
}
