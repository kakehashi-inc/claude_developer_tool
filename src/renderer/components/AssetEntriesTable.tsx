import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Button,
    Tooltip,
} from '@mui/material';
import { Visibility as ViewIcon } from '@mui/icons-material';
import type { AssetEntry } from '../../shared/types';
import { formatCount } from '../utils/format';

// frontmatter 列の表示設定（table-layout: fixed と併用）。
// - fit:    内容に合わせて伸縮し、maxWidth で上限を制限する（name）。上限超過は省略（…）。
// - width:  固定幅（tools / model）。
// - flex:   残り幅をすべて使う伸縮列（description。width:auto で貪欲に確保）。
export interface FmColumn {
    key: string;
    width?: number; // 固定幅（px）
    maxWidthPct?: number; // fit 列の最大幅（ウィンドウ幅に対する割合 0〜1）
    fit?: boolean; // 内容フィット（maxWidth 上限）
    flex?: boolean; // 残り幅を使う伸縮列
}

// name（fit 列）の最小幅と、1 文字あたりの概算 px（幅見積り用）。
const NAME_MIN_WIDTH = 80;
const NAME_CHAR_PX = 8;

/**
 * fit 列（name）の幅を実データから見積もる。名前とサブパスの長い方の文字数を基準に、
 * [NAME_MIN_WIDTH, maxWidthPx] の範囲へクランプする。
 */
export function computeFitWidth(entries: AssetEntry[], maxWidthPx: number): number {
    let maxChars = 0;
    for (const e of entries) {
        const nameLen = (e.frontmatter?.name ?? e.name ?? '').length;
        const subLen = relSubDir(e.relPath).length;
        maxChars = Math.max(maxChars, nameLen, subLen);
    }
    const px = maxChars * NAME_CHAR_PX + 24; // セルの左右パディング分を加算
    return Math.min(Math.max(px, NAME_MIN_WIDTH), maxWidthPx);
}

/** 列の幅指定を sx 用に解決する。fit 列は事前計算した fitWidth を使う。 */
function colWidthSx(col: FmColumn, fitWidth: number): { width?: number | string } {
    if (col.flex) {
        return { width: 'auto' };
    }
    if (col.fit) {
        return { width: fitWidth };
    }
    return { width: col.width };
}

/**
 * relPath（asset 親からの相対パス）のうち、サブディレクトリ部分（最後の '/' より前）を返す。
 * 例: 'c-suite/cbdo.md' → 'c-suite/'、'foo.md' / 'apple-design' → ''（サブディレクトリなし）。
 */
export function relSubDir(relPath: string): string {
    const idx = relPath.lastIndexOf('/');
    return idx <= 0 ? '' : relPath.slice(0, idx + 1);
}

interface Props {
    entries: AssetEntry[];
    columns: FmColumn[];
    fitWidth: number;
    showFileCount: boolean;
    checkedKeys: Set<string>;
    onToggle: (relPath: string) => void;
    onToggleAll: () => void;
    onView: (entry: AssetEntry) => void;
}

/**
 * Agent・Skill / 公式スキルの一覧テーブル。
 * 本体一覧と公式スキルインポートダイアログの両方で同じレイアウトを使うため共通化している。
 */
export const AssetEntriesTable: React.FC<Props> = ({
    entries,
    columns,
    fitWidth,
    showFileCount,
    checkedKeys,
    onToggle,
    onToggleAll,
    onView,
}) => {
    const { t } = useTranslation();
    const allChecked = entries.length > 0 && entries.every(e => checkedKeys.has(e.relPath));
    const someChecked = entries.some(e => checkedKeys.has(e.relPath));

    return (
        <TableContainer>
            <Table size='small' sx={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHead>
                    <TableRow>
                        <TableCell padding='checkbox' sx={{ width: 48 }}>
                            <Checkbox
                                indeterminate={someChecked && !allChecked}
                                checked={allChecked}
                                onChange={onToggleAll}
                            />
                        </TableCell>
                        {columns.map(col => (
                            <TableCell
                                key={col.key}
                                sx={{
                                    ...colWidthSx(col, fitWidth),
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {t(`assetManager.col.${col.key}`)}
                            </TableCell>
                        ))}
                        {showFileCount && (
                            <TableCell align='right' sx={{ width: 72, whiteSpace: 'nowrap' }}>
                                {t('assetManager.columnFiles')}
                            </TableCell>
                        )}
                        <TableCell align='center' sx={{ width: 96, whiteSpace: 'nowrap' }}>
                            {t('assetManager.columnView')}
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {entries.map(entry => (
                        <TableRow key={entry.relPath} hover>
                            <TableCell padding='checkbox' sx={{ width: 48 }}>
                                <Checkbox
                                    checked={checkedKeys.has(entry.relPath)}
                                    onChange={() => onToggle(entry.relPath)}
                                />
                            </TableCell>
                            {columns.map(col => {
                                // name 列はディレクトリ名 / ファイル名を基準に、frontmatter があれば優先。
                                // frontmatter が未定義（古い main ビルド等）でも落ちないようガードする。
                                const fmValue = entry.frontmatter?.[col.key];
                                const value = fmValue ?? (col.key === 'name' ? (entry.name ?? '') : '');
                                // name 列のみ: 親からの相対サブパス（サブディレクトリ）があれば
                                // 名前の下に控えめ（ミュート）な色で表示してパスを判別できるようにする。
                                const subPath = col.key === 'name' ? relSubDir(entry.relPath) : '';
                                // name（fit 列）は 1 行で内容フィット＋maxWidth 超過を省略。
                                // その他の列は最大 2 行まで表示して超過を省略する。
                                const valueSx = col.fit
                                    ? {
                                          whiteSpace: 'nowrap' as const,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                      }
                                    : {
                                          display: '-webkit-box',
                                          WebkitBoxOrient: 'vertical' as const,
                                          WebkitLineClamp: 2,
                                          overflow: 'hidden',
                                          overflowWrap: 'anywhere' as const,
                                      };
                                return (
                                    <TableCell
                                        key={col.key}
                                        sx={{
                                            ...colWidthSx(col, fitWidth),
                                            verticalAlign: 'top',
                                        }}
                                    >
                                        <Tooltip title={value} disableHoverListener={!value}>
                                            <Box sx={valueSx}>{value}</Box>
                                        </Tooltip>
                                        {subPath && (
                                            <Tooltip title={subPath}>
                                                <Box
                                                    sx={{
                                                        display: 'block',
                                                        mt: 0.25,
                                                        fontSize: '0.75rem',
                                                        lineHeight: 1.3,
                                                        color: 'text.secondary',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                    }}
                                                >
                                                    {subPath}
                                                </Box>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                );
                            })}
                            {showFileCount && (
                                <TableCell align='right' sx={{ width: 72, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                                    {formatCount(entry.fileCount ?? 0)}
                                </TableCell>
                            )}
                            <TableCell align='center' sx={{ width: 96, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                                <Button
                                    size='small'
                                    startIcon={<ViewIcon />}
                                    disabled={!entry.frontmatterRaw}
                                    onClick={() => onView(entry)}
                                >
                                    {t('assetManager.view')}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};
