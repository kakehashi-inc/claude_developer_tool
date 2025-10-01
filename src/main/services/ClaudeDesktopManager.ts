import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { ClaudeDesktopConfig, ClaudeDesktopInfo, MCPServerInfo, OSType } from '../../shared/types';
import {
    CLAUDE_CONFIG_PATHS,
    CLAUDE_CONFIG_FILENAME,
    CLAUDE_CONFIG_DISABLED_FILENAME,
    getClaudeExecutablePaths,
} from '../../shared/constants';

const execAsync = promisify(exec);

export class ClaudeDesktopManager {
    private platform: OSType;
    private configDir: string;
    private configPath: string;
    private disabledConfigPath: string;
    private claudeExecutable?: string;

    constructor() {
        this.platform = process.platform as OSType;
        this.configDir = CLAUDE_CONFIG_PATHS[this.platform];
        this.configPath = join(this.configDir, CLAUDE_CONFIG_FILENAME);
        this.disabledConfigPath = join(this.configDir, CLAUDE_CONFIG_DISABLED_FILENAME);

        if (this.platform === 'win32' || this.platform === 'darwin') {
            const execPaths = getClaudeExecutablePaths();
            for (const execPath of execPaths) {
                if (existsSync(execPath)) {
                    this.claudeExecutable = execPath;
                    break;
                }
            }
        }
    }

    /**
     * Claude Desktopの情報を取得
     */
    getClaudeDesktopInfo(): ClaudeDesktopInfo {
        return {
            configPath: this.configPath,
            configExists: existsSync(this.configPath),
            disabledConfigPath: this.disabledConfigPath,
            claudeExecutable: this.claudeExecutable,
        };
    }

    /**
     * 設定ファイルを読み込み
     */
    private readConfig(path: string): ClaudeDesktopConfig | null {
        if (!existsSync(path)) {
            return null;
        }

        try {
            const content = readFileSync(path, 'utf-8');
            return JSON.parse(content) as ClaudeDesktopConfig;
        } catch (error) {
            console.error(`Failed to read config from ${path}:`, error);
            return null;
        }
    }

    /**
     * 設定ファイルに書き込み
     */
    private writeConfig(path: string, config: ClaudeDesktopConfig): void {
        const content = JSON.stringify(config, null, 2);
        writeFileSync(path, content, 'utf-8');
    }

    /**
     * MCPサーバーのリストを取得
     */
    getMCPServers(): { enabled: MCPServerInfo[]; disabled: MCPServerInfo[] } {
        const enabledConfig = this.readConfig(this.configPath);
        const disabledConfig = this.readConfig(this.disabledConfigPath);

        const enabled: MCPServerInfo[] = [];
        const disabled: MCPServerInfo[] = [];

        if (enabledConfig?.mcpServers) {
            for (const [name, config] of Object.entries(enabledConfig.mcpServers)) {
                enabled.push({ name, config, enabled: true });
            }
        }

        if (disabledConfig?.mcpServers) {
            for (const [name, config] of Object.entries(disabledConfig.mcpServers)) {
                disabled.push({ name, config, enabled: false });
            }
        }

        return { enabled, disabled };
    }

    /**
     * MCPサーバーを無効化
     */
    disableMCPServer(serverName: string): void {
        const enabledConfig = this.readConfig(this.configPath);
        if (!enabledConfig?.mcpServers || !enabledConfig.mcpServers[serverName]) {
            throw new Error(`Server "${serverName}" not found in enabled config`);
        }

        // 無効化設定ファイルに追加
        let disabledConfig = this.readConfig(this.disabledConfigPath);
        if (!disabledConfig) {
            disabledConfig = { mcpServers: {} };
        }
        if (!disabledConfig.mcpServers) {
            disabledConfig.mcpServers = {};
        }

        disabledConfig.mcpServers[serverName] = enabledConfig.mcpServers[serverName];
        this.writeConfig(this.disabledConfigPath, disabledConfig);

        // 有効設定から削除
        delete enabledConfig.mcpServers[serverName];
        this.writeConfig(this.configPath, enabledConfig);
    }

    /**
     * MCPサーバーを有効化
     */
    enableMCPServer(serverName: string): void {
        const disabledConfig = this.readConfig(this.disabledConfigPath);
        if (!disabledConfig?.mcpServers || !disabledConfig.mcpServers[serverName]) {
            throw new Error(`Server "${serverName}" not found in disabled config`);
        }

        // 有効設定ファイルに追加
        let enabledConfig = this.readConfig(this.configPath);
        if (!enabledConfig) {
            enabledConfig = { mcpServers: {} };
        }
        if (!enabledConfig.mcpServers) {
            enabledConfig.mcpServers = {};
        }

        enabledConfig.mcpServers[serverName] = disabledConfig.mcpServers[serverName];
        this.writeConfig(this.configPath, enabledConfig);

        // 無効設定から削除
        delete disabledConfig.mcpServers[serverName];

        // 無効設定が空になった場合はファイルを削除
        if (Object.keys(disabledConfig.mcpServers).length === 0) {
            if (existsSync(this.disabledConfigPath)) {
                unlinkSync(this.disabledConfigPath);
            }
        } else {
            this.writeConfig(this.disabledConfigPath, disabledConfig);
        }
    }

    /**
     * MCPサーバーの順序を変更（有効）
     */
    reorderMCPServers(serverNames: string[]): void {
        const enabledConfig = this.readConfig(this.configPath);
        if (!enabledConfig?.mcpServers) {
            throw new Error('No enabled servers found');
        }

        // 新しい順序でオブジェクトを再構築
        const reorderedServers: Record<string, (typeof enabledConfig.mcpServers)[string]> = {};
        for (const name of serverNames) {
            if (enabledConfig.mcpServers[name]) {
                reorderedServers[name] = enabledConfig.mcpServers[name];
            }
        }

        // 未指定のサーバーがあれば最後に追加
        for (const [name, config] of Object.entries(enabledConfig.mcpServers)) {
            if (!reorderedServers[name]) {
                reorderedServers[name] = config;
            }
        }

        enabledConfig.mcpServers = reorderedServers;
        this.writeConfig(this.configPath, enabledConfig);
    }

    /**
     * MCPサーバーの順序を変更（無効）
     */
    reorderDisabledMCPServers(serverNames: string[]): void {
        const disabledConfig = this.readConfig(this.disabledConfigPath);
        if (!disabledConfig?.mcpServers) {
            throw new Error('No disabled servers found');
        }

        // 新しい順序でオブジェクトを再構築
        const reorderedServers: Record<string, (typeof disabledConfig.mcpServers)[string]> = {};
        for (const name of serverNames) {
            if (disabledConfig.mcpServers[name]) {
                reorderedServers[name] = disabledConfig.mcpServers[name];
            }
        }

        // 未指定のサーバーがあれば最後に追加
        for (const [name, config] of Object.entries(disabledConfig.mcpServers)) {
            if (!reorderedServers[name]) {
                reorderedServers[name] = config;
            }
        }

        disabledConfig.mcpServers = reorderedServers;
        this.writeConfig(this.disabledConfigPath, disabledConfig);
    }

    /**
     * Claude Desktopプロセスを終了
     */
    private async killClaudeDesktop(): Promise<void> {
        if (this.platform === 'win32') {
            await execAsync('taskkill /F /IM Claude.exe');
        } else if (this.platform === 'darwin') {
            await execAsync('pkill -9 "Claude"');
        }
    }

    /**
     * Claude Desktopを起動
     */
    private async startClaudeDesktop(): Promise<void> {
        if (!this.claudeExecutable) {
            throw new Error('Claude Desktop executable not found');
        }

        if (this.platform === 'win32') {
            spawn(this.claudeExecutable, [], { detached: true, stdio: 'ignore' }).unref();
        } else if (this.platform === 'darwin') {
            spawn('open', ['-a', this.claudeExecutable], { detached: true, stdio: 'ignore' }).unref();
        }
    }

    /**
     * Claude Desktopを再起動
     */
    async restartClaudeDesktop(): Promise<void> {
        if (this.platform !== 'win32' && this.platform !== 'darwin') {
            throw new Error('Restart is only supported on Windows and macOS');
        }

        try {
            await this.killClaudeDesktop();
            // プロセスが完全に終了するまで待機
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.startClaudeDesktop();
        } catch (error) {
            // Claude Desktopが起動していない場合のエラーは無視して起動のみ試行
            if (error instanceof Error && !error.message.includes('not found')) {
                throw error;
            }
            await this.startClaudeDesktop();
        }
    }
}
