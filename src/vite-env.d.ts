/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: {
    database: {
      getAllCommands: () => Promise<any[]>
      updateCommand: (id: number, updates: any) => Promise<{ success: boolean; error?: string }>
      deleteCommand: (id: number) => Promise<{ success: boolean; error?: string }>
      addCommand: (command: any) => Promise<{ success: boolean; id?: number; error?: string }>
    }
    clipboard: {
      writeText: (text: string) => Promise<void>
      readText: () => Promise<string>
    }
    dialog: {
      showInputDialog: (title: string, label: string, defaultValue?: string) => Promise<{ success: boolean; value: string | null }>
    }
    onWindowShown: (callback: () => void) => void
    file: {
      saveDialog: (defaultFilename: string) => Promise<{ success: boolean; filePath: string | null }>
      openDialog: () => Promise<{ success: boolean; filePath: string | null }>
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    }
    platform: string
  }
}
