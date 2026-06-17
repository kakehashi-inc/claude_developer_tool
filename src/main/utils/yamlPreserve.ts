/**
 * 書式保持 YAML ユーティリティ（汎用部品）。
 *
 * YAML ファイルのコメント・整形・キー順序・改行コードを一切壊さずに、特定のブロック
 * シーケンスキー（`key:` 直下の `- ...` 項目）だけをテキストベースで読み書きするための関数群。
 *
 * なぜパーサーを使わないか:
 * - js-yaml などの汎用パーサーで読み込んで書き戻すと、コメントや整形・引用符の有無などが
 *   失われる。設定ファイルの「人間が書いた情報」を壊さないため、編集は対象行の削除のみで行う。
 * - 解析（件数カウント）は読み取りのみなのでパーサーでも代替できるが、依存を増やさずテキストで
 *   実装している。
 *
 * 対象とする YAML 構造（カラム 0 のブロックシーケンス）:
 *   someKey:                <- キー行（値なし＝ブロック形式）
 *   - item one              <- シーケンス項目（カラム 0、'- ' 始まり）
 *   - item two
 *                           <- 空行 / 別キー / コメントで終端
 *
 * 同じファイル内の別キー配下にも `- ` 行がありうるため、グローバルな `^- ` ではなく必ず
 * 対象キー行をアンカーにして、その直後の連続 `- ` 行のみを対象にする。
 *
 * 制限:
 * - カラム 0（インデントなし）のトップレベルブロックシーケンスのみを対象とする。
 *   ネストされた（インデント付き）リストには対応しない。
 * - インラインフロー（`key: [a, b]`）には対応しない（その場合は変更なしを返す）。
 */

// キー行の判定（カラム 0、`key:` のみ。値が無い＝ブロック形式）
function keyLineRegex(key: string): RegExp {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$1');
    return new RegExp(`^${escaped}:\\s*$`);
}

// ブロックシーケンス項目の判定（カラム 0、`- ` または `-` のみ）
function isSequenceItemLine(line: string): boolean {
    // 行末の \r を許容（CRLF 環境）
    const l = line.replace(/\r$/, '');
    return l === '-' || l.startsWith('- ');
}

/**
 * 指定したトップレベルキー直下のブロックシーケンス項目数を数える。
 * キーが見つからない、または直後に項目が無い（空 / インライン []）場合は 0。
 */
export function countYamlListEntries(text: string, key: string): number {
    const lines = text.split('\n');
    const keyRe = keyLineRegex(key);

    for (let i = 0; i < lines.length; i++) {
        if (keyRe.test(lines[i].replace(/\r$/, ''))) {
            let count = 0;
            for (let j = i + 1; j < lines.length; j++) {
                if (isSequenceItemLine(lines[j])) {
                    count++;
                } else {
                    break;
                }
            }
            return count;
        }
    }
    return 0;
}

/**
 * 指定したトップレベルキーが `clearYamlList` による正規化（`key: []` 化）を要する状態かを返す。
 * - 値なしブロック形式の `key:`（項目あり / 項目なしどちらも）がある → true（正規化が必要）。
 * - キーが無い、または既に `key: []`（インライン空配列）→ false。
 *
 * `countYamlListEntries` が「項目数」を返すのに対し、こちらは「項目なしだが `key:` のまま残った
 * 未正規化状態」も検出できる（過去バージョンでクリアし `key:` だけ残ったケースの拾い直し用）。
 */
export function needsYamlListNormalize(text: string, key: string): boolean {
    const lines = text.split('\n');
    const keyRe = keyLineRegex(key);
    return lines.some(line => keyRe.test(line.replace(/\r$/, '')));
}

/**
 * 指定したトップレベルキー直下のブロックシーケンス項目（`- ...`）を削除し、キー行を空配列
 * （`key: []`）に正規化した文字列を返す。他キー・コメント・整形・改行コードはそのまま保持する。
 *
 * なぜ `key:`（値なし）ではなく `key: []` にするか:
 * - 値なしの `key:` は YAML 上 `null` と解釈され、空配列を期待するツール（例: Serena の
 *   `projects`）では「空ではなくキー欠落/不正」と見なされてエラーになるケースがある。明示的な
 *   空配列 `[]` にすることで「空のリスト」を正しく表現する。
 *
 * - キーが無い → そのまま（変更なし）を返す。
 * - 既に `key: []`（インライン空配列）→ keyLineRegex が値なし行にしかマッチしないため対象外＝変更なし（冪等）。
 * - `key:`（値なし・項目なし）でも `key: []` に正規化する（過去に項目だけ削除して残った未修正状態の置き換え）。
 * - 対象の `- ` 行以外は一切触らない。
 */
export function clearYamlList(text: string, key: string): string {
    const lines = text.split('\n');
    const keyRe = keyLineRegex(key);

    let keyIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (keyRe.test(lines[i].replace(/\r$/, ''))) {
            keyIndex = i;
            break;
        }
    }
    if (keyIndex === -1) {
        // キーが見つからない（インライン [] 形式や別構造）→ 変更しない
        return text;
    }

    // キー直後から連続するシーケンス項目行の範囲を求める
    let end = keyIndex + 1;
    while (end < lines.length && isSequenceItemLine(lines[end])) {
        end++;
    }

    // キー行を `key: []` に正規化する（CRLF の \r を保持）。
    const hadCr = lines[keyIndex].endsWith('\r');
    lines[keyIndex] = `${key}: []${hadCr ? '\r' : ''}`;

    // [keyIndex+1, end) のシーケンス項目行を取り除く
    const result = [...lines.slice(0, keyIndex + 1), ...lines.slice(end)];
    return result.join('\n');
}
