import type {
  AuthStatus, BatchCommandMutationResult, Command, CommandMutationResult,
  DefaultWritableLibraryResult, DefaultWritableLibrarySetupResult, DiscoveredLibrary,
  GitHubUser, Library, LibraryGitWorkflowSummary, LibraryWorkflowResult, SyncResult, UpdateStatus,
} from './types'

type Result = { success: boolean; error?: string }
type LibraryDiscoveryResult = Result & {
  library?: Library
  syncResult?: SyncResult
  needsPick?: boolean
  libraries?: DiscoveredLibrary[]
}
type CommandInput = { title: string; body: string; description: string; tags: string; language: string }
type StatusWithBanner = UpdateStatus & { showBanner: boolean }

/** Public named bridge only. This type does not authorize IPC messages at runtime. */
export interface ElectronAPI {
  database: { getAllCommands(): Promise<Command[]> }
  clipboard: {
    writeText(text: string): Promise<void>
    write(data: { text: string; html?: string }): Promise<void>
    readText(): Promise<string>
  }
  dialog: { showInputDialog(title: string, label: string, defaultValue?: string): Promise<{ success: boolean; value: string | null }> }
  onWindowShown(callback: () => void): () => void
  onCommandsChanged(callback: () => void): () => void
  file: {
    saveDialog(defaultFilename: string): Promise<{ success: boolean; filePath: string | null }>
    openDialog(): Promise<{ success: boolean; filePath: string | null }>
    writeFile(filePath: string, content: string): Promise<Result>
    readFile(filePath: string): Promise<Result & { content?: string }>
  }
  platform: string
  shell: { openExternal(url: string): Promise<void> }
  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<Result>
    getAll(): Promise<Record<string, unknown>>
  }
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    getPlatform(): Promise<string>
  }
  auth: {
    login(): Promise<Result & { user_code?: string; verification_uri?: string; device_code?: string; interval?: number; expires_in?: number }>
    pollLogin(deviceCode: string): Promise<Result & { user?: GitHubUser }>
    logout(): Promise<Result>
    getStatus(): Promise<AuthStatus>
  }
  library: {
    addWorkingCopyFromOrigin(repoUrl: string, subpath?: string): Promise<LibraryDiscoveryResult>
    subscribe(repoUrl: string, subpath?: string): Promise<LibraryDiscoveryResult>
    unsubscribe(libraryId: number): Promise<Result>
    setAutoSync(libraryId: number, enabled: boolean): Promise<Result>
    sync(libraryId: number): Promise<Result & Partial<SyncResult>>
    syncAll(): Promise<Result & { results?: Array<{ library: Library; result: SyncResult }> }>
    getAll(): Promise<Library[]>
    getWorkflowSummary(libraryId: number): Promise<Result & { summary?: LibraryGitWorkflowSummary }>
    fetchOrigin(libraryId: number): Promise<LibraryWorkflowResult>
    updateFromOrigin(libraryId: number): Promise<LibraryWorkflowResult>
    relinkWorkingCopy(libraryId: number): Promise<Result & { library?: Library; syncResult?: SyncResult; cancelled?: boolean }>
    commitChanges(libraryId: number, message: string): Promise<LibraryWorkflowResult>
    pushChanges(libraryId: number): Promise<LibraryWorkflowResult>
    openPullRequest(libraryId: number): Promise<LibraryWorkflowResult>
    getDefaultWritableLocalLibrary(): Promise<DefaultWritableLibraryResult>
    setupDefaultWritableLocalLibrary(): Promise<DefaultWritableLibrarySetupResult>
    createCommand(command: CommandInput): Promise<CommandMutationResult>
    createCommands(commands: CommandInput[]): Promise<BatchCommandMutationResult>
    updateCommand(id: number, updates: CommandInput): Promise<CommandMutationResult>
    deleteCommand(id: number): Promise<CommandMutationResult>
    deleteCommands(ids: number[]): Promise<BatchCommandMutationResult>
    openLocal(folderPath?: string): Promise<LibraryDiscoveryResult>
    init(libraryId: number, name: string, description: string, subpath?: string): Promise<Result & { library?: Library; syncResult?: SyncResult }>
    getRepoFolders(repoUrl: string): Promise<Result & { folders: string[] }>
    exportZip(commandIds: number[], name: string, description: string): Promise<Result & { path?: string; commandCount?: number }>
    onAutoSyncResult(callback: (data: { timestamp: string; results: Array<{ libraryId: number; name: string; result: SyncResult }> }) => void): () => void
  }
  update: {
    getStatus(): Promise<StatusWithBanner>
    check(): Promise<StatusWithBanner>
    dismiss(): Promise<Result>
    remindLater(): Promise<Result>
    onStatusChanged(callback: (data: StatusWithBanner) => void): () => void
  }
}
