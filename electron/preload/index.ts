import { contextBridge, ipcRenderer } from "electron"
import type { ElectronAPI } from "../../shared/electron-api"
import type {
  Command,
  Library,
  SyncResult,
  AuthStatus,
  GitHubUser,
  UpdateStatus,
  DiscoveredLibrary,
  DefaultWritableLibraryResult,
  DefaultWritableLibrarySetupResult,
  CommandMutationResult,
  BatchCommandMutationResult,
  LibraryGitWorkflowSummary,
  LibraryWorkflowResult,
} from "../../shared/types"

const subscribeToSignal = (channel: string, callback: () => void) => {
  const listener = () => callback()
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}
//expose db methods to renderer process
const electronAPI = {
  // db methods
  database:{
    getAllCommands: (): Promise<Command[]> =>
      ipcRenderer.invoke('db:getAllCommands'),
},
  //clipboard methods
  clipboard : {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    write: (data: { text: string, html?: string }) => ipcRenderer.invoke('clipboard:write', data),
    readText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText')
  },
  //dialog methods
  dialog: {
    showInputDialog: (title: string, label: string, defaultValue?: string): Promise<{success: boolean, value: string| null}> =>
      ipcRenderer.invoke('dialog:showInputDialog', title, label, defaultValue)
  },
  // window events
  onWindowShown: (callback: () => void) =>
    subscribeToSignal('window-shown', callback),
  onCommandsChanged: (callback: () => void) => {
    return subscribeToSignal('commands:changed', callback)
  },
  // file operations
  file: {
    saveDialog: (defaultFilename: string): Promise<{success: boolean, filePath: string | null}> =>
      ipcRenderer.invoke('file:saveDialog', defaultFilename),
    openDialog: (): Promise<{success: boolean, filePath: string | null}> =>
      ipcRenderer.invoke('file:openDialog'),
    writeFile: (filePath: string, content: string): Promise<{success: boolean, error?: string}> =>
      ipcRenderer.invoke('file:writeFile', filePath, content),
    readFile: (filePath: string): Promise<{success: boolean, content?: string, error?: string}> =>
      ipcRenderer.invoke('file:readFile', filePath)
  },
  //system info
  platform: process.platform,
  // shell methods
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  },
  // settings methods
  settings: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:getAll'),
  },
  // window control methods
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('window:getPlatform')
  },
  // GitHub auth methods
  auth: {
    login: (): Promise<{ success: boolean; user_code?: string; verification_uri?: string; device_code?: string; interval?: number; expires_in?: number; error?: string }> =>
      ipcRenderer.invoke('auth:login'),
    pollLogin: (deviceCode: string): Promise<{ success: boolean; user?: GitHubUser; error?: string }> =>
      ipcRenderer.invoke('auth:pollLogin', deviceCode),
    logout: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('auth:logout'),
    getStatus: (): Promise<AuthStatus> =>
      ipcRenderer.invoke('auth:getStatus'),
  },
  // Library methods
  library: {
    addWorkingCopyFromOrigin: (repoUrl: string, subpath?: string): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; needsPick?: boolean; libraries?: DiscoveredLibrary[]; error?: string }> =>
      ipcRenderer.invoke('library:addWorkingCopyFromOrigin', repoUrl, subpath),
    subscribe: (repoUrl: string, subpath?: string): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; needsPick?: boolean; libraries?: DiscoveredLibrary[]; error?: string }> =>
      ipcRenderer.invoke('library:subscribe', repoUrl, subpath),
    unsubscribe: (libraryId: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('library:unsubscribe', libraryId),
    setAutoSync: (libraryId: number, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('library:setAutoSync', libraryId, enabled),
    sync: (libraryId: number): Promise<{ success: boolean; added?: number; updated?: number; removed?: number; errors?: string[]; error?: string }> =>
      ipcRenderer.invoke('library:sync', libraryId),
    syncAll: (): Promise<{ success: boolean; results?: Array<{ library: Library; result: SyncResult }>; error?: string }> =>
      ipcRenderer.invoke('library:syncAll'),
    getAll: (): Promise<Library[]> =>
      ipcRenderer.invoke('library:getAll'),
    getWorkflowSummary: (libraryId: number): Promise<{ success: boolean; summary?: LibraryGitWorkflowSummary; error?: string }> =>
      ipcRenderer.invoke('library:getWorkflowSummary', libraryId),
    fetchOrigin: (libraryId: number): Promise<LibraryWorkflowResult> =>
      ipcRenderer.invoke('library:fetchOrigin', libraryId),
    updateFromOrigin: (libraryId: number): Promise<LibraryWorkflowResult> =>
      ipcRenderer.invoke('library:updateFromOrigin', libraryId),
    relinkWorkingCopy: (libraryId: number): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; cancelled?: boolean; error?: string }> =>
      ipcRenderer.invoke('library:relinkWorkingCopy', libraryId),
    commitChanges: (libraryId: number, message: string): Promise<LibraryWorkflowResult> =>
      ipcRenderer.invoke('library:commitChanges', libraryId, message),
    pushChanges: (libraryId: number): Promise<LibraryWorkflowResult> =>
      ipcRenderer.invoke('library:pushChanges', libraryId),
    openPullRequest: (libraryId: number): Promise<LibraryWorkflowResult> =>
      ipcRenderer.invoke('library:openPullRequest', libraryId),
    getDefaultWritableLocalLibrary: (): Promise<DefaultWritableLibraryResult> =>
      ipcRenderer.invoke('library:getDefaultWritableLocalLibrary'),
    setupDefaultWritableLocalLibrary: (): Promise<DefaultWritableLibrarySetupResult> =>
      ipcRenderer.invoke('library:setupDefaultWritableLocalLibrary'),
    createCommand: (command: { title: string; body: string; description: string; tags: string; language: string }): Promise<CommandMutationResult> =>
      ipcRenderer.invoke('library:createCommand', command),
    createCommands: (commands: Array<{ title: string; body: string; description: string; tags: string; language: string }>): Promise<BatchCommandMutationResult> =>
      ipcRenderer.invoke('library:createCommands', commands),
    updateCommand: (id: number, updates: { title: string; body: string; description: string; tags: string; language: string }): Promise<CommandMutationResult> =>
      ipcRenderer.invoke('library:updateCommand', id, updates),
    deleteCommand: (id: number): Promise<CommandMutationResult> =>
      ipcRenderer.invoke('library:deleteCommand', id),
    deleteCommands: (ids: number[]): Promise<BatchCommandMutationResult> =>
      ipcRenderer.invoke('library:deleteCommands', ids),
    openLocal: (folderPath?: string): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; needsPick?: boolean; libraries?: DiscoveredLibrary[]; error?: string }> =>
      ipcRenderer.invoke('library:openLocal', folderPath),
    init: (libraryId: number, name: string, description: string, subpath?: string): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; error?: string }> =>
      ipcRenderer.invoke('library:init', libraryId, name, description, subpath),
    getRepoFolders: (repoUrl: string): Promise<{ success: boolean; folders: string[]; error?: string }> =>
      ipcRenderer.invoke('library:getRepoFolders', repoUrl),
    exportZip: (commandIds: number[], name: string, description: string): Promise<{ success: boolean; path?: string; commandCount?: number; error?: string }> =>
      ipcRenderer.invoke('library:exportZip', commandIds, name, description),
    onAutoSyncResult: (callback: (data: { timestamp: string; results: Array<{ libraryId: number; name: string; result: { added: number; updated: number; removed: number; errors: string[] } }> }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data)
      ipcRenderer.on('library:autoSyncResult', listener)
      return () => { ipcRenderer.removeListener('library:autoSyncResult', listener) }
    },
  },
  // Update methods
  update: {
    getStatus: (): Promise<UpdateStatus & { showBanner: boolean }> =>
      ipcRenderer.invoke('update:getStatus'),
    check: (): Promise<UpdateStatus & { showBanner: boolean }> =>
      ipcRenderer.invoke('update:check'),
    dismiss: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('update:dismiss'),
    remindLater: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('update:remindLater'),
    onStatusChanged: (callback: (data: UpdateStatus & { showBanner: boolean }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data)
      ipcRenderer.on('update:statusChanged', listener)
      return () => { ipcRenderer.removeListener('update:statusChanged', listener) }
    },
  },
} satisfies ElectronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
