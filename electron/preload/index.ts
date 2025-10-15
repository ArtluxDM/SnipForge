import { contextBridge, ipcRenderer } from "electron"

//define command Type locally
type Command = {
  id: number
  title: string
  body: string
  tags: string
  created_at: string
  updated_at: string
}
//expose db methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // db methods
  database:{
    getAllCommands: (): Promise<Command[]> =>
      ipcRenderer.invoke('db:getAllCommands'),
    updateCommand: (id: number, updates: Partial<Command>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:updateCommand', id, updates),
    deleteCommand: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:deleteCommand', id),
    addCommand: (command: Omit<Command, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipcRenderer.invoke('db:addCommand', command)
},
  //clipboard methods
  clipboard : {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    readText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText')
  },
  //dialog methods
  dialog: {
    showInputDialog: (title: string, label: string, defaultValue?: string): Promise<{success: boolean, value: string| null}> =>
      ipcRenderer.invoke('dialog:showInputDialog', title, label, defaultValue)
  },
  // window events
  onWindowShown: (callback: () => void) => {
    ipcRenderer.on('window-shown', callback)
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
  }
})
// tell the compiler what's availible on the window object
declare global {
  interface Window {
    electronAPI: {
      database: {
        getAllCommands: () => Promise<Command[]>
        updateCommand: (id: number, updates: Partial<Command>) => Promise<{ success: boolean; error?: string }>
        deleteCommand: (id: number) => Promise<{ success: boolean; error?: string }>
        addCommand: (command: Omit<Command, 'id' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; id?: number; error?: string }>
      },
      clipboard: {
        writeText: (text: string) => Promise<void>,
        readText: () => Promise<string>
      },
      dialog: {
        showInputDialog: (title: string, label: string, defaultValue?: string) => Promise<{success: boolean, value: string | null}>
      },
      onWindowShown: (callback: () => void) => void,
      file: {
        saveDialog: (defaultFilename: string) => Promise<{success: boolean, filePath: string | null}>
        openDialog: () => Promise<{success: boolean, filePath: string | null}>
        writeFile: (filePath: string, content: string) => Promise<{success: boolean, error?: string}>
        readFile: (filePath: string) => Promise<{success: boolean, content?: string, error?: string}>
      },
      platform: string,
      shell: {
        openExternal: (url: string) => Promise<void>
      }
    }
  }
}


