import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { ClaudeDesktopManager } from './services/ClaudeDesktopManager';
import { registerClaudeDesktopHandlers } from './ipc/claudeDesktopHandlers';
import { registerWindowHandlers } from './ipc/windowHandlers';
import { registerSystemHandlers } from './ipc/systemHandlers';

let mainWindow: BrowserWindow | null = null;
let claudeDesktopManager: ClaudeDesktopManager;

const isDev = process.argv.includes('--dev');
const gotTheLock = app.requestSingleInstanceLock();

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 400,
        frame: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Claude Developer Tool',
        backgroundColor: '#000000',
    });

    if (isDev) {
        // 開発モード: Viteサーバーに接続
        mainWindow.loadURL('http://localhost:3001');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // 本番モード: ビルドされたファイルをロード
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        } else {
            createWindow();
        }
    });

    app.whenReady().then(() => {
        // Claude Desktop Managerを初期化
        claudeDesktopManager = new ClaudeDesktopManager();

        // IPCハンドラーを登録
        registerClaudeDesktopHandlers(claudeDesktopManager);
        registerWindowHandlers();
        registerSystemHandlers();

        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    // 開発モードでのホットリロード
    if (isDev) {
        ipcMain.on('reload', () => {
            mainWindow?.reload();
        });
    }
}
