import { ipcMain } from 'electron';
import { UpdaterService } from '../services/UpdaterService';
import { UPDATER_CHANNELS } from '../../shared/constants';

export function registerUpdaterHandlers(updater: UpdaterService): void {
    ipcMain.handle(UPDATER_CHANNELS.GET_STATE, () => {
        return updater.getState();
    });

    ipcMain.handle(UPDATER_CHANNELS.CHECK, async () => {
        await updater.checkForUpdates();
    });

    ipcMain.handle(UPDATER_CHANNELS.DOWNLOAD, async () => {
        await updater.downloadUpdate();
    });

    ipcMain.handle(UPDATER_CHANNELS.QUIT_AND_INSTALL, () => {
        updater.quitAndInstall();
    });
}
