import { ipcMain, BrowserWindow } from 'electron';

export function registerWindowHandlers(): void {
    // ウィンドウを最小化
    ipcMain.handle('window:minimize', event => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.minimize();
    });

    // ウィンドウを最大化/元に戻す
    ipcMain.handle('window:maximize', event => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window?.isMaximized()) {
            window.unmaximize();
        } else {
            window?.maximize();
        }
    });

    // ウィンドウを閉じる
    ipcMain.handle('window:close', event => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.close();
    });

    // ウィンドウが最大化されているかチェック
    ipcMain.handle('window:is-maximized', event => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return window?.isMaximized() ?? false;
    });
}
