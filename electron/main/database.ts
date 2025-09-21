import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

export interface Command {
    id: number
    title: string
    body: string
    tags: string
    created_at: string
    updated_at: string
}
// Initialize and export the database connection
let db: Database.Database | null = null;
export function initializeDatabase() {
    console.log('Initializing database...')
    // get the path where electron stores user data
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'snipforge.db')
    console.log('Database path:', dbPath)
try {
    //create or open the database
    db = new Database(dbPath)
    // Create the commands table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            shell TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            variables TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `)
    console.log('Database table created successfully')
    return db
    }catch (error) {
        console.error('Error initializing database:', error)
        throw error
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
    const stmt = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, tags = ?, updated_at = ?
        WHERE id = ?
    `);
    const result = stmt.run(
        updates.title || '',
        updates.body || '',
        updates.tags || '[]',
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
// add a new command to DB
export function addCommand(command: Omit<Command, 'id' | 'created_at' | 'updated_at'>): number {
    if (!db) throw new Error("Database not initialized");
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO commands (title, body, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        command.title,
        command.body,
        command.tags || '[]',
        now,
        now
    );
    return result.lastInsertRowid as number;
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
        INSERT INTO commands (title, body, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()

    //sample commands including some with variables
    insertCommand.run('List files', 'ls -la', '["terminal", "files"]', now, now)
    insertCommand.run('Git status', 'git status', '["git", "version-control"]', now, now)
    insertCommand.run('Docker containers', 'docker ps', '["docker", "containers"]', now, now)
    insertCommand.run('Check disk space', 'df -h', '["system", "disk"]', now, now)
    insertCommand.run('Docker exec bash', 'docker exec -it {{container name}} /bin/bash', '["docker", "exec"]', now, now)
    insertCommand.run('SSH connect', 'ssh {{username}}@{{server address}}', '["ssh", "remote"]', now, now)

    console.log('✅ Test data added successfully')
}