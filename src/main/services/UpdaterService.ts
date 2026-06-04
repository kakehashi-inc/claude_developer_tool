import { BrowserWindow } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import type { UpdateState } from '../../shared/types';
import { UPDATER_CHANNELS } from '../../shared/constants';

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
// Portable builds must not auto-update: electron-updater would download the NSIS
// installer per latest.yml and install the app to a location the user never chose.
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;
const isUpdaterDisabled = isDev || isPortable;
const AUTO_INSTALL_DELAY_MS = 1500;

export class UpdaterService {
    private state: UpdateState = { status: 'idle' };
    private autoInstallOnDownloaded = false;
    // True only between a user-initiated download and its completion/failure.
    // Errors are surfaced to the UI only while this is true; background check
    // failures (no network, etc.) must stay silent.
    private downloadRequested = false;
    private startupCheckScheduled = false;
    private initialized = false;

    initialize(): void {
        if (isUpdaterDisabled) {
            return;
        }
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.logger = console;

        autoUpdater.on('checking-for-update', () => {
            this.state = { status: 'checking' };
        });

        autoUpdater.on('update-available', (info: UpdateInfo) => {
            this.updateAndBroadcast({ status: 'available', version: info.version });
        });

        autoUpdater.on('update-not-available', () => {
            this.state = { status: 'not-available' };
        });

        autoUpdater.on('download-progress', (progress: ProgressInfo) => {
            this.updateAndBroadcast({
                status: 'downloading',
                version: this.state.version,
                progress: progress.percent,
            });
        });

        autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
            this.downloadRequested = false;
            this.updateAndBroadcast({ status: 'downloaded', version: info.version });
            if (this.autoInstallOnDownloaded) {
                setTimeout(() => {
                    this.quitAndInstall();
                }, AUTO_INSTALL_DELAY_MS);
            }
        });

        autoUpdater.on('error', (error: Error) => {
            console.error('[updater] error:', error);
            this.autoInstallOnDownloaded = false;
            // Surface errors only for a user-initiated download. A failed
            // background check (e.g. offline at startup) must not bother the user.
            if (this.downloadRequested) {
                this.downloadRequested = false;
                this.updateAndBroadcast({
                    status: 'error',
                    version: this.state.version,
                    error: error.message,
                });
            } else {
                this.state = { status: 'idle' };
            }
        });
    }

    getState(): UpdateState {
        return this.state;
    }

    async checkForUpdates(): Promise<void> {
        if (isUpdaterDisabled) {
            return;
        }
        try {
            await autoUpdater.checkForUpdates();
        } catch (error) {
            console.error('[updater] checkForUpdates failed:', error);
        }
    }

    async downloadUpdate(): Promise<void> {
        if (isUpdaterDisabled) {
            return;
        }
        this.autoInstallOnDownloaded = true;
        this.downloadRequested = true;
        try {
            await autoUpdater.downloadUpdate();
        } catch (error) {
            this.autoInstallOnDownloaded = false;
            console.error('[updater] downloadUpdate failed:', error);
            // If the 'error' event did not already surface it (downloadRequested
            // still set), broadcast the failure here as a fallback.
            if (this.downloadRequested) {
                this.downloadRequested = false;
                this.updateAndBroadcast({
                    status: 'error',
                    version: this.state.version,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    quitAndInstall(): void {
        if (isUpdaterDisabled) {
            return;
        }
        setImmediate(() => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) {
                    window.removeAllListeners('close');
                    window.close();
                }
            }
            autoUpdater.quitAndInstall(false, true);
        });
    }

    scheduleStartupCheck(window: BrowserWindow, delayMs = 3000): void {
        if (isUpdaterDisabled) {
            return;
        }
        if (this.startupCheckScheduled) {
            return;
        }
        this.startupCheckScheduled = true;

        const runCheck = (): void => {
            setTimeout(() => {
                void this.checkForUpdates();
            }, delayMs);
        };

        if (window.webContents.isLoading()) {
            window.webContents.once('did-finish-load', runCheck);
        } else {
            runCheck();
        }
    }

    private updateAndBroadcast(state: UpdateState): void {
        this.state = state;
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                window.webContents.send(UPDATER_CHANNELS.STATE_CHANGED, state);
            }
        }
    }
}
