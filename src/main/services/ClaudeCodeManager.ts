import { CLAUDE_CODE_CONFIG_FILENAME, CLAUDE_CODE_DISABLED_FILENAME } from '../../shared/constants';
import { ClaudeCodeEnvInfo, ClaudeEnvironment, MCPServerConfig, MCPServerInfo, OSType } from '../../shared/types';
import { ClaudeFs } from './wsl/ClaudeFs';
import { WslDetector } from './wsl/WslDetector';

// ~/.claude.json は多数のトップレベルキーを持つ巨大ファイル。
// mcpServers キーのみを操作し、その他のキーと順序は完全に保持する。
interface ClaudeCodeConfig {
    mcpServers?: Record<string, MCPServerConfig>;
    [key: string]: unknown;
}

interface DisabledConfig {
    mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Claude Code (CLI) のプロファイル MCP を管理する。
 * - グローバル MCP は ~/.claude.json のトップレベル mcpServers。
 * - 無効化した MCP は ~/.claude-disabled-mcp.json（sidecar）へ退避。
 * - native とすべての Claude 入り WSL distro を環境として扱う。
 * - プロジェクト単位 MCP（projects[path].mcpServers）は対象外。
 */
export class ClaudeCodeManager {
    private readonly detector: WslDetector;

    constructor(detector: WslDetector) {
        this.detector = detector;
    }

    /** native の OS ラベル */
    private nativeLabel(): string {
        const platform = process.platform as OSType;
        if (platform === 'win32') return 'Windows';
        if (platform === 'darwin') return 'macOS';
        return 'Linux';
    }

    private fsFor(env: ClaudeEnvironment): ClaudeFs {
        return new ClaudeFs(env, this.detector);
    }

    /**
     * 管理対象の環境一覧（native + Claude 入り WSL distro）。
     */
    async getEnvironments(): Promise<ClaudeCodeEnvInfo[]> {
        const result: ClaudeCodeEnvInfo[] = [];

        const nativeEnv: ClaudeEnvironment = { kind: 'native' };
        result.push(await this.buildEnvInfo(nativeEnv, this.nativeLabel()));

        const distros = await this.detector.getClaudeDistros();
        for (const d of distros) {
            const env: ClaudeEnvironment = { kind: 'wsl', distro: d.distro };
            result.push(await this.buildEnvInfo(env, d.distro));
        }

        return result;
    }

    private async buildEnvInfo(env: ClaudeEnvironment, label: string): Promise<ClaudeCodeEnvInfo> {
        const fs = this.fsFor(env);
        const configPath = await fs.displayPath(CLAUDE_CODE_CONFIG_FILENAME);
        const disabledConfigPath = await fs.displayPath(CLAUDE_CODE_DISABLED_FILENAME);
        const configExists = await fs.exists(CLAUDE_CODE_CONFIG_FILENAME);
        return { env, label, configPath, configExists, disabledConfigPath };
    }

    /**
     * 有効/無効の MCP サーバー一覧を取得する。
     */
    async getMCPServers(env: ClaudeEnvironment): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> {
        const fs = this.fsFor(env);
        const config = await fs.readJson<ClaudeCodeConfig>(CLAUDE_CODE_CONFIG_FILENAME);
        const disabledConfig = await fs.readJson<DisabledConfig>(CLAUDE_CODE_DISABLED_FILENAME);

        const enabled: MCPServerInfo[] = [];
        const disabled: MCPServerInfo[] = [];

        if (config?.mcpServers) {
            for (const [name, cfg] of Object.entries(config.mcpServers)) {
                enabled.push({ name, config: cfg, enabled: true });
            }
        }
        if (disabledConfig?.mcpServers) {
            for (const [name, cfg] of Object.entries(disabledConfig.mcpServers)) {
                disabled.push({ name, config: cfg, enabled: false });
            }
        }

        return { enabled, disabled };
    }

    /**
     * MCP サーバーを無効化（~/.claude.json から sidecar へ移動）。
     */
    async disableMCPServer(
        env: ClaudeEnvironment,
        serverName: string
    ): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> {
        const fs = this.fsFor(env);
        const config = await fs.readJson<ClaudeCodeConfig>(CLAUDE_CODE_CONFIG_FILENAME);
        if (!config?.mcpServers || !config.mcpServers[serverName]) {
            throw new Error(`Server "${serverName}" not found in enabled config`);
        }

        // sidecar へ追加
        let disabledConfig = await fs.readJson<DisabledConfig>(CLAUDE_CODE_DISABLED_FILENAME);
        if (!disabledConfig || !disabledConfig.mcpServers) {
            disabledConfig = { mcpServers: {} };
        }
        disabledConfig.mcpServers[serverName] = config.mcpServers[serverName];
        await fs.writeJson(CLAUDE_CODE_DISABLED_FILENAME, disabledConfig);

        // ~/.claude.json の mcpServers からのみ削除（他キーは保持）
        delete config.mcpServers[serverName];
        await fs.writeJson(CLAUDE_CODE_CONFIG_FILENAME, config);

        return this.getMCPServers(env);
    }

    /**
     * MCP サーバーを有効化（sidecar から ~/.claude.json へ移動）。
     */
    async enableMCPServer(
        env: ClaudeEnvironment,
        serverName: string
    ): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> {
        const fs = this.fsFor(env);
        const disabledConfig = await fs.readJson<DisabledConfig>(CLAUDE_CODE_DISABLED_FILENAME);
        if (!disabledConfig?.mcpServers || !disabledConfig.mcpServers[serverName]) {
            throw new Error(`Server "${serverName}" not found in disabled config`);
        }

        // ~/.claude.json の mcpServers へ追加（他キーは保持）
        let config = await fs.readJson<ClaudeCodeConfig>(CLAUDE_CODE_CONFIG_FILENAME);
        if (!config) {
            config = {};
        }
        if (!config.mcpServers) {
            config.mcpServers = {};
        }
        config.mcpServers[serverName] = disabledConfig.mcpServers[serverName];
        await fs.writeJson(CLAUDE_CODE_CONFIG_FILENAME, config);

        // sidecar から削除。空になったら sidecar ファイルを削除。
        delete disabledConfig.mcpServers[serverName];
        if (Object.keys(disabledConfig.mcpServers).length === 0) {
            await fs.deleteFile(CLAUDE_CODE_DISABLED_FILENAME);
        } else {
            await fs.writeJson(CLAUDE_CODE_DISABLED_FILENAME, disabledConfig);
        }

        return this.getMCPServers(env);
    }

    /**
     * 有効な MCP サーバーの順序を変更する。
     */
    async reorderMCPServers(
        env: ClaudeEnvironment,
        serverNames: string[]
    ): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> {
        const fs = this.fsFor(env);
        const config = await fs.readJson<ClaudeCodeConfig>(CLAUDE_CODE_CONFIG_FILENAME);
        if (!config?.mcpServers) {
            throw new Error('No enabled servers found');
        }
        config.mcpServers = this.reorder(config.mcpServers, serverNames);
        await fs.writeJson(CLAUDE_CODE_CONFIG_FILENAME, config);
        return this.getMCPServers(env);
    }

    /**
     * 無効な MCP サーバーの順序を変更する。
     */
    async reorderDisabledMCPServers(
        env: ClaudeEnvironment,
        serverNames: string[]
    ): Promise<{ enabled: MCPServerInfo[]; disabled: MCPServerInfo[] }> {
        const fs = this.fsFor(env);
        const disabledConfig = await fs.readJson<DisabledConfig>(CLAUDE_CODE_DISABLED_FILENAME);
        if (!disabledConfig?.mcpServers) {
            throw new Error('No disabled servers found');
        }
        disabledConfig.mcpServers = this.reorder(disabledConfig.mcpServers, serverNames);
        await fs.writeJson(CLAUDE_CODE_DISABLED_FILENAME, disabledConfig);
        return this.getMCPServers(env);
    }

    /**
     * 指定順でオブジェクトを再構築する（未指定のキーは末尾に追加）。
     */
    private reorder(servers: Record<string, MCPServerConfig>, order: string[]): Record<string, MCPServerConfig> {
        const reordered: Record<string, MCPServerConfig> = {};
        for (const name of order) {
            if (servers[name]) {
                reordered[name] = servers[name];
            }
        }
        for (const [name, cfg] of Object.entries(servers)) {
            if (!reordered[name]) {
                reordered[name] = cfg;
            }
        }
        return reordered;
    }
}
