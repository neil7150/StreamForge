/**
 * Window IPC Handlers — Frameless window control for the custom titlebar.
 *
 * IPC Channels:
 *   window:minimize        → minimize the window   (ipcMain.on — fire-and-forget)
 *   window:maximize        → toggle maximize        (ipcMain.on — fire-and-forget)
 *   window:close           → close the window       (ipcMain.on — fire-and-forget)
 *   window:is-maximized    → returns boolean         (ipcMain.handle — request/response)
 *   window:maximized-change → forwarded on maximize/unmaximize events
 */

import { ipcMain, type BrowserWindow } from 'electron'

export function setupWindowIPC(mainWindow: BrowserWindow): void {
  // ─── Fire-and-forget window controls ───────────────────────────────

  ipcMain.on('window:minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow.close()
  })

  // ─── Request/response: is the window maximized? ────────────────────

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized()
  })

  // ─── Forward native maximize/unmaximize events to the renderer ─────

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false)
  })

  console.log('[IPC] Window handlers registered')
}
