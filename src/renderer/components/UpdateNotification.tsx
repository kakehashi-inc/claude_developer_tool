import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, LinearProgress, Snackbar, Stack, Typography } from '@mui/material';
import type { UpdateState } from '../../shared/types';

export const UpdateNotification: React.FC = () => {
    const { t } = useTranslation();
    const [state, setState] = useState<UpdateState>({ status: 'idle' });
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const unsubscribe = window.api.updater.onStateChanged(next => {
            setState(next);
            if (next.status === 'available') {
                setDismissed(false);
            }
        });

        window.api.updater
            .getState()
            .then(initial => {
                setState(initial);
            })
            .catch(error => {
                console.error('[updater] getState failed:', error);
            });

        return unsubscribe;
    }, []);

    const isVisible =
        !dismissed && (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded');

    if (!isVisible) {
        return null;
    }

    const handleUpdate = (): void => {
        void window.api.updater.download();
    };

    const handleLater = (): void => {
        setDismissed(true);
    };

    const renderContent = (): React.ReactNode => {
        if (state.status === 'available') {
            return (
                <Stack spacing={1.5} sx={{ minWidth: 280 }}>
                    <Typography variant='body2'>
                        {t('updater.confirm', { version: state.version ?? '' })}
                    </Typography>
                    <Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button size='small' onClick={handleLater} color='inherit'>
                            {t('updater.later')}
                        </Button>
                        <Button size='small' onClick={handleUpdate} variant='contained'>
                            {t('updater.update')}
                        </Button>
                    </Stack>
                </Stack>
            );
        }

        if (state.status === 'downloading') {
            const percent = Math.round(state.progress ?? 0);
            return (
                <Stack spacing={1} sx={{ minWidth: 280 }}>
                    <Typography variant='body2'>
                        {t('updater.downloading', { progress: percent })}
                    </Typography>
                    <LinearProgress variant='determinate' value={percent} />
                </Stack>
            );
        }

        // downloaded
        return (
            <Stack spacing={1} sx={{ minWidth: 280 }}>
                <Typography variant='body2'>{t('updater.installing')}</Typography>
                <LinearProgress />
            </Stack>
        );
    };

    return (
        <Snackbar
            open={isVisible}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            autoHideDuration={null}
        >
            <Box
                sx={{
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    boxShadow: 6,
                    p: 2,
                }}
            >
                {renderContent()}
            </Box>
        </Snackbar>
    );
};
