import { execFile } from 'child_process';
import { CLAUDE_CODE_CONFIG_FILENAME } from '../../../shared/constants';
import { WslDistroInfo } from '../../../shared/types';

/**
 * execFile を Promise 化し、stdout を Buffer で受け取るヘルパー。
 * wsl -l -q の出力は UTF-16LE のため、文字列ではなく Buffer で扱う必要がある。
 */
function execFileBuffer(file: string, args: string[]): Promise<{ stdout: Buffer; stderr: Buffer }> {
    return new Promise((resolve, reject) => {
        execFile(file, args, { encoding: 'buffer', windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({ stdout: stdout as Buffer, stderr: stderr as Buffer });
        });
    });
}

/**
 * WSL 出力のデコード。wsl.exe は UTF-16LE、bash 出力は UTF-8 と環境で異なるため、
 * NUL バイトの密度から自動判定する（mcp_server_manager の実績ある実装を踏襲）。
 */
function decodeWslBuffer(buf: Buffer): string {
    if (!buf || buf.length === 0) {
        return '';
    }
    let zeroCount = 0;
    const sampleLen = Math.min(buf.length, 2048);
    for (let i = 0; i < sampleLen; i++) {
        if (buf[i] === 0) {
            zeroCount++;
        }
    }
    const isUtf16le = zeroCount > sampleLen / 10; // NUL が多ければ UTF-16LE
    return buf.toString(isUtf16le ? 'utf16le' : 'utf8');
}

/**
 * WSL の利用可否と distro を検出する。
 * - WSL は Windows のみ対象。
 * - 検出結果はキャッシュする（プロセス起動中は再検出しない）。
 */
export class WslDetector {
    private available: boolean | null = null;
    private distrosCache: WslDistroInfo[] | null = null;
    private homeCache = new Map<string, string>();

    /** 現在のプラットフォームが Windows か */
    isWindows(): boolean {
        return process.platform === 'win32';
    }

    /** WSL が利用可能か（Windows かつ wsl.exe が distro を列挙できる） */
    async isAvailable(): Promise<boolean> {
        if (this.available !== null) {
            return this.available;
        }
        if (!this.isWindows()) {
            this.available = false;
            return false;
        }
        try {
            const distros = await this.rawListDistros();
            this.available = distros.length > 0;
        } catch {
            this.available = false;
        }
        return this.available;
    }

    /**
     * wsl -l -q の出力（UTF-16LE + NUL 埋め）を復号して distro 名一覧を得る。
     */
    private async rawListDistros(): Promise<string[]> {
        const { stdout } = await execFileBuffer('wsl.exe', ['-l', '-q']);
        const text = decodeWslBuffer(stdout);
        return text
            .split(/\r?\n/)
            .map(line => line.replace(/\0/g, '').trim())
            .filter(line => line.length > 0);
    }

    /**
     * distro の Linux ホームディレクトリを解決する（/home/<windowsuser> を仮定しない）。
     */
    async resolveHome(distro: string): Promise<string> {
        const cached = this.homeCache.get(distro);
        if (cached) {
            return cached;
        }
        const { stdout } = await execFileBuffer('wsl.exe', ['-d', distro, '--', 'bash', '-lc', 'echo -n $HOME']);
        // bash の出力は基本 UTF-8。NUL 密度判定で安全に復号する。
        const home = decodeWslBuffer(stdout).replace(/\0/g, '').trim();
        this.homeCache.set(distro, home);
        return home;
    }

    /** distro 内に ~/.claude.json が存在するか */
    async hasClaude(distro: string): Promise<boolean> {
        try {
            await execFileBuffer('wsl.exe', [
                '-d',
                distro,
                '--',
                'bash',
                '-lc',
                `test -f ~/${CLAUDE_CODE_CONFIG_FILENAME}`,
            ]);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Claude Code がインストールされている WSL distro の一覧を返す。
     * Windows 以外、または WSL 未導入の場合は空配列。
     */
    async getClaudeDistros(): Promise<WslDistroInfo[]> {
        if (this.distrosCache !== null) {
            return this.distrosCache;
        }
        if (!(await this.isAvailable())) {
            this.distrosCache = [];
            return this.distrosCache;
        }

        const result: WslDistroInfo[] = [];
        try {
            const distros = await this.rawListDistros();
            for (const distro of distros) {
                const has = await this.hasClaude(distro);
                if (!has) {
                    continue;
                }
                let home = '';
                try {
                    home = await this.resolveHome(distro);
                } catch {
                    home = '';
                }
                result.push({ distro, hasClaude: true, home });
            }
        } catch (error) {
            console.error('Failed to enumerate WSL distros:', error);
        }

        this.distrosCache = result;
        return result;
    }

    /**
     * distro 内で bash コマンドを実行し、stdout を Buffer で返す。
     * ClaudeFs のコマンドモードフォールバックから利用する。
     */
    async runInDistro(distro: string, command: string): Promise<Buffer> {
        const { stdout } = await execFileBuffer('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command]);
        return stdout;
    }

    /** キャッシュを破棄して次回再検出させる */
    invalidate(): void {
        this.available = null;
        this.distrosCache = null;
        this.homeCache.clear();
    }
}
