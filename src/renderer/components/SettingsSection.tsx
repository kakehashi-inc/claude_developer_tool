import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Switch,
    Select,
    MenuItem,
    TextField,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
} from '@mui/material';
import {
    Save as SaveIcon,
    Close as CloseIcon,
    Code as CodeIcon,
    KeyboardArrowDown as ExpandIcon,
    KeyboardArrowRight as CollapseIcon,
} from '@mui/icons-material';
import type { ClaudeEnvironment, SettingsFieldSpec, SettingsFieldValue, SettingsValues } from '../../shared/types';

interface Props {
    env: ClaudeEnvironment;
    onNotify: (message: string, severity: 'success' | 'error' | 'warning') => void;
}

/**
 * 1 環境分の Claude Code 設定（~/.claude/settings.json）編集セクション。
 *
 * - read() が返す項目定義（result.fields）だけをテーブルに展開して編集する。
 *   各項目はトグル（boolean / envFlag）・セレクト（string + choices）・テキスト（string）で表示する。
 * - 個々の変更は即保存せず、テーブル下の「保存」「キャンセル」で確定/破棄する。
 *   - 保存: テーブルの編集値を settings.json へ差分マージ（登録外項目には触れない）。
 *   - キャンセル: 再取得して編集前の状態へ戻す。
 * - 保存/キャンセル行の右端「直接編集」で settings.json の生 JSON を直接編集できる。
 *   ダイアログ内の保存で書き込み、キャンセルで破棄する。
 */
export const SettingsSection: React.FC<Props> = ({ env, onNotify }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [available, setAvailable] = useState(true);

    // テーブルの編集値（key -> 値）。boolean / envFlag は boolean、string は string。
    const [editValues, setEditValues] = useState<Record<string, SettingsFieldValue>>({});

    // 直接編集ダイアログ。
    const [rawOpen, setRawOpen] = useState(false);
    const [rawText, setRawText] = useState('');
    const [rawError, setRawError] = useState(false);

    // 編集対象項目の定義は read() の戻り値（result.fields）から受け取る。
    // これによりレンダラーは os 依存の shared/constants を import しない。
    const [fields, setFields] = useState<SettingsFieldSpec[]>([]);

    // 展開中のグループ。初期は model / agent のみ展開し、他は折りたたむ。
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['model', 'agent']));
    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) {
                next.delete(group);
            } else {
                next.add(group);
            }
            return next;
        });
    };

    // group ごとにまとめる（出現順を保持）。UI はグループ見出し付きで表示する。
    const groupedFields = useMemo(() => {
        const order: string[] = [];
        const byGroup = new Map<string, SettingsFieldSpec[]>();
        for (const f of fields) {
            if (!byGroup.has(f.group)) {
                byGroup.set(f.group, []);
                order.push(f.group);
            }
            byGroup.get(f.group)!.push(f);
        }
        return order.map(group => ({ group, items: byGroup.get(group)! }));
    }, [fields]);

    // boolean 3 状態セレクトの値変換（'' = 未設定 / 'true' / 'false'）。
    const boolToSelect = (v: SettingsFieldValue): string => (v === true ? 'true' : v === false ? 'false' : '');
    const selectToBool = (v: string): SettingsFieldValue => (v === 'true' ? true : v === 'false' ? false : undefined);

    // boolean の「未設定」ラベル。registry に defaultOn があれば既定値を併記する。
    const unsetLabel = (f: SettingsFieldSpec): string => {
        if (typeof f.defaultOn === 'boolean') {
            return t('settings.unsetWithDefault', {
                default: f.defaultOn ? t('settings.enabled') : t('settings.disabled'),
            });
        }
        return t('settings.unset');
    };

    const load = async () => {
        setLoading(true);
        try {
            const result = await window.api.settings.read(env);
            setAvailable(result.available);
            setFields(result.fields);
            const next: Record<string, SettingsFieldValue> = {};
            for (const f of result.fields) {
                next[f.key] = result.values[f.key];
            }
            setEditValues(next);
        } catch (error) {
            console.error('Failed to read settings:', error);
            onNotify(t('settings.readError'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // env は親で固定の安定参照。マウント時に一度ロードする。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // テーブルの編集値をそのまま保存用 values として返す。
    const collectValues = (): SettingsValues => ({ ...editValues });

    const handleSave = async () => {
        setBusy(true);
        try {
            const result = await window.api.settings.write(env, collectValues());
            if (result.ok) {
                onNotify(t('settings.saveSuccess'), 'success');
                await load();
            } else {
                onNotify(
                    t(result.message === 'invalid-existing-json' ? 'settings.invalidExisting' : 'settings.saveError'),
                    'error'
                );
            }
        } catch {
            onNotify(t('settings.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    // キャンセル: 再取得して編集前へ戻す。
    const handleCancel = () => {
        load();
    };

    // 直接編集を開く: 最新の生 JSON を取得して表示する。
    const handleOpenRaw = async () => {
        setBusy(true);
        try {
            const result = await window.api.settings.read(env);
            const text = result.rawJson ?? '{}\n';
            setRawText(text);
            setRawError(false);
            setRawOpen(true);
        } catch {
            onNotify(t('settings.readError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleRawTextChange = (text: string) => {
        setRawText(text);
        // 構文チェック（保存ボタンの活性とエラー表示に使う）。
        try {
            const parsed = JSON.parse(text);
            setRawError(!(parsed && typeof parsed === 'object' && !Array.isArray(parsed)));
        } catch {
            setRawError(true);
        }
    };

    const handleSaveRaw = async () => {
        setBusy(true);
        try {
            const result = await window.api.settings.writeRaw(env, rawText);
            if (result.ok) {
                onNotify(t('settings.saveSuccess'), 'success');
                setRawOpen(false);
                await load();
            } else {
                onNotify(t(result.message === 'invalid-json' ? 'settings.invalidJson' : 'settings.saveError'), 'error');
            }
        } catch {
            onNotify(t('settings.saveError'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const setValue = (key: string, value: SettingsFieldValue) => {
        setEditValues(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <Typography color='text.secondary' sx={{ py: 1 }}>
                {t('common.loading')}
            </Typography>
        );
    }

    if (!available) {
        return <Alert severity='info'>{t('settings.unavailable')}</Alert>;
    }

    return (
        <Box>
            <TableContainer>
                <Table size='small'>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: '40%' }}>{t('settings.colItem')}</TableCell>
                            <TableCell>{t('settings.colValue')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {groupedFields.map(({ group, items }) => {
                            const expanded = expandedGroups.has(group);
                            return (
                                <React.Fragment key={group}>
                                    {/* グループ見出し行（クリックで開閉） */}
                                    <TableRow
                                        hover
                                        onClick={() => toggleGroup(group)}
                                        sx={{ cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        <TableCell
                                            colSpan={2}
                                            sx={{
                                                bgcolor: 'action.hover',
                                                fontWeight: 700,
                                                py: 0.75,
                                                borderBottom: 1,
                                                borderColor: 'divider',
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {expanded ? (
                                                    <ExpandIcon fontSize='small' />
                                                ) : (
                                                    <CollapseIcon fontSize='small' />
                                                )}
                                                {t(`settings.group.${group}`)}
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                    {expanded &&
                                        items.map(f => (
                                            <TableRow key={f.key}>
                                                <TableCell sx={{ verticalAlign: 'top', pl: 3 }}>
                                                    <Typography variant='body2' sx={{ fontWeight: 600 }}>
                                                        {t(`settings.field.${f.key}.label`)}
                                                    </Typography>
                                                    <Typography variant='caption' color='text.secondary'>
                                                        {t(`settings.field.${f.key}.desc`)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {f.type === 'envFlag' ? (
                                                        // envFlag は「有無」の 2 状態。スイッチで表現する。
                                                        <Switch
                                                            checked={editValues[f.key] === true}
                                                            onChange={e => setValue(f.key, e.target.checked)}
                                                        />
                                                    ) : f.type === 'boolean' ? (
                                                        // boolean は「未設定 / 有効 / 無効」の 3 状態セレクト。
                                                        // 未設定と OFF を区別し、既定 ON の項目を意図せず false 保存しない。
                                                        <Select
                                                            size='small'
                                                            displayEmpty
                                                            value={boolToSelect(editValues[f.key])}
                                                            onChange={e =>
                                                                setValue(f.key, selectToBool(e.target.value))
                                                            }
                                                            sx={{ minWidth: 200 }}
                                                        >
                                                            <MenuItem value=''>
                                                                <em>{unsetLabel(f)}</em>
                                                            </MenuItem>
                                                            <MenuItem value='true'>{t('settings.enabled')}</MenuItem>
                                                            <MenuItem value='false'>{t('settings.disabled')}</MenuItem>
                                                        </Select>
                                                    ) : f.choices ? (
                                                        <Select
                                                            size='small'
                                                            displayEmpty
                                                            value={(editValues[f.key] as string | undefined) ?? ''}
                                                            onChange={e =>
                                                                setValue(
                                                                    f.key,
                                                                    e.target.value === '' ? undefined : e.target.value
                                                                )
                                                            }
                                                            sx={{ minWidth: 200 }}
                                                        >
                                                            <MenuItem value=''>
                                                                <em>{t('settings.unset')}</em>
                                                            </MenuItem>
                                                            {f.choices.map(c => (
                                                                <MenuItem key={c} value={c}>
                                                                    {c}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    ) : f.type === 'number' ? (
                                                        <TextField
                                                            size='small'
                                                            type='number'
                                                            placeholder={t('settings.unset')}
                                                            value={
                                                                typeof editValues[f.key] === 'number'
                                                                    ? String(editValues[f.key])
                                                                    : ''
                                                            }
                                                            onChange={e => {
                                                                // 空入力は未設定（undefined → 保存時にキー削除）。
                                                                const raw = e.target.value;
                                                                if (raw === '') {
                                                                    setValue(f.key, undefined);
                                                                    return;
                                                                }
                                                                const n = Number(raw);
                                                                setValue(f.key, Number.isFinite(n) ? n : undefined);
                                                            }}
                                                            slotProps={{
                                                                htmlInput: { min: f.min, max: f.max },
                                                            }}
                                                            sx={{ minWidth: 200 }}
                                                        />
                                                    ) : (
                                                        <TextField
                                                            size='small'
                                                            // 自由入力項目（language 等）の例示。i18n に placeholder が無ければ空。
                                                            placeholder={t(`settings.field.${f.key}.placeholder`, '')}
                                                            value={(editValues[f.key] as string | undefined) ?? ''}
                                                            onChange={e =>
                                                                setValue(
                                                                    f.key,
                                                                    e.target.value === '' ? undefined : e.target.value
                                                                )
                                                            }
                                                            sx={{ minWidth: 200 }}
                                                        />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* テーブル下部: 左に 保存 / キャンセル、右端に 直接編集 */}
            <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
                <Button variant='contained' size='small' startIcon={<SaveIcon />} disabled={busy} onClick={handleSave}>
                    {t('settings.save')}
                </Button>
                <Button
                    variant='outlined'
                    size='small'
                    startIcon={<CloseIcon />}
                    disabled={busy}
                    onClick={handleCancel}
                >
                    {t('settings.cancel')}
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Button
                    variant='outlined'
                    size='small'
                    startIcon={<CodeIcon />}
                    disabled={busy}
                    onClick={handleOpenRaw}
                >
                    {t('settings.directEdit')}
                </Button>
            </Box>

            {/* 直接編集ダイアログ */}
            <Dialog open={rawOpen} onClose={() => !busy && setRawOpen(false)} maxWidth='md' fullWidth>
                <DialogTitle>{t('settings.directEditTitle')}</DialogTitle>
                <DialogContent>
                    <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
                        {t('settings.directEditDesc')}
                    </Typography>
                    <TextField
                        multiline
                        fullWidth
                        minRows={14}
                        maxRows={28}
                        value={rawText}
                        onChange={e => handleRawTextChange(e.target.value)}
                        error={rawError}
                        helperText={rawError ? t('settings.invalidJson') : ' '}
                        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRawOpen(false)} disabled={busy}>
                        {t('settings.cancel')}
                    </Button>
                    <Button
                        variant='contained'
                        startIcon={<SaveIcon />}
                        onClick={handleSaveRaw}
                        disabled={busy || rawError}
                    >
                        {t('settings.save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
