/**
 * Markdown の YAML frontmatter（先頭の `---` で囲まれたヘッダー部）を読み取る軽量ユーティリティ。
 *
 * SKILL.md / エージェントの .md などの先頭にある以下の形式を対象とする:
 *   ---
 *   name: foo
 *   description: ...
 *   ---
 *
 * 依存を増やさずテキストベースで処理する（書き戻しは行わない読み取り専用）。
 * トップレベルの `key: value` スカラーのみを対象とし、ネスト・ブロックシーケンスは値を
 * そのままの 1 行文字列として扱う（一覧表示・参照ダイアログ用途には十分）。
 */

export interface ParsedFrontmatter {
    // `---` の内側そのままの生テキスト（前後の `---` 行は含まない、改行はそのまま）
    raw: string;
    // トップレベルの key: value（value は前後空白を除去した 1 行文字列）
    fields: Record<string, string>;
}

/**
 * 先頭の frontmatter ブロックを抽出する。frontmatter が無ければ null。
 * - 先頭行が `---`（前後空白許容）で始まり、次の `---` 行までを raw とする。
 */
export function parseFrontmatter(content: string | null): ParsedFrontmatter | null {
    if (!content) {
        return null;
    }
    // 先頭の BOM を除去（U+FEFF をエスケープで表記）
    const text = content.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/);

    // 先頭の空行をスキップ
    let start = 0;
    while (start < lines.length && lines[start].trim() === '') {
        start++;
    }
    if (start >= lines.length || lines[start].trim() !== '---') {
        return null;
    }

    // 次の `---` を探す
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            end = i;
            break;
        }
    }
    if (end === -1) {
        return null;
    }

    const bodyLines = lines.slice(start + 1, end);
    const raw = bodyLines.join('\n');
    const fields = parseScalarFields(bodyLines);
    return { raw, fields };
}

/**
 * 行配列からトップレベルの `key: value` スカラーを抽出する。
 * - インデントされた行（ネスト要素・ブロックシーケンス項目）は親キーに属するため列挙対象外。
 * - value は前後空白と前後の引用符を除去する。
 */
function parseScalarFields(lines: string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const line of lines) {
        // インデント行・コメント行・シーケンス項目は対象外
        if (/^\s/.test(line) || line.trimStart().startsWith('#') || line.trimStart().startsWith('-')) {
            continue;
        }
        const m = line.match(/^([^:\s][^:]*):\s*(.*)$/);
        if (!m) {
            continue;
        }
        const key = m[1].trim();
        let value = m[2].trim();
        // 前後の引用符を 1 組だけ除去
        if (
            (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
            (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
        ) {
            value = value.slice(1, -1);
        }
        fields[key] = value;
    }
    return fields;
}
