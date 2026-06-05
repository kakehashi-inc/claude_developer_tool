import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { ClaudeDesktopManager } from './services/ClaudeDesktopManager';
import { ClaudeCodeManager } from './services/ClaudeCodeManager';
import { ClaudeCleanupManager } from './services/ClaudeCleanupManager';
import { AssetManager } from './services/AssetManager';
import { WslDetector } from './services/wsl/WslDetector';
import { UpdaterService } from './services/UpdaterService';
import { registerClaudeDesktopHandlers } from './ipc/claudeDesktopHandlers';
import { registerClaudeCodeHandlers } from './ipc/claudeCodeHandlers';
import { registerClaudeCleanupHandlers } from './ipc/claudeCleanupHandlers';
import { registerAssetManagerHandlers } from './ipc/assetManagerHandlers';
import { registerWindowHandlers } from './ipc/windowHandlers';
import { registerSystemHandlers } from './ipc/systemHandlers';
import { registerUpdaterHandlers } from './ipc/updaterHandlers';

let mainWindow: BrowserWindow | null = null;
let claudeDesktopManager: ClaudeDesktopManager;
let claudeCodeManager: ClaudeCodeManager;
let claudeCleanupManager: ClaudeCleanupManager;
let assetManager: AssetManager;
let updaterService: UpdaterService;

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
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
        // Ensure DevTools are visible in development
        try {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        } catch {}
        // Keyboard shortcuts to toggle DevTools without menu
        mainWindow.webContents.on('before-input-event', (event, input) => {
            const isToggleCombo =
                (input.key?.toLowerCase?.() === 'i' && (input.control || input.meta) && input.shift) ||
                input.key === 'F12';
            if (isToggleCombo) {
                event.preventDefault();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.toggleDevTools();
                }
            }
        });
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

        // WSL 検出器を生成し、Claude Code 系マネージャーで共有
        const wslDetector = new WslDetector();
        claudeCodeManager = new ClaudeCodeManager(wslDetector);
        claudeCleanupManager = new ClaudeCleanupManager(wslDetector);
        assetManager = new AssetManager(wslDetector);

        // 自動アップデートサービスを初期化
        updaterService = new UpdaterService();
        updaterService.initialize();

        // IPCハンドラーを登録
        registerClaudeDesktopHandlers(claudeDesktopManager);
        registerClaudeCodeHandlers(claudeCodeManager);
        registerClaudeCleanupHandlers(claudeCleanupManager);
        registerAssetManagerHandlers(assetManager, () => mainWindow);
        registerWindowHandlers();
        registerSystemHandlers();
        registerUpdaterHandlers(updaterService);

        createWindow();

        if (mainWindow) {
            updaterService.scheduleStartupCheck(mainWindow);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        app.quit();
    });
}
