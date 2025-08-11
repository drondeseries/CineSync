import React from 'react';
import { Warning as WarningIcon, Block as BlockIcon, DeleteSweep as DeleteSweepIcon } from '@mui/icons-material';
import BaseConfirmationDialog from './BaseConfirmationDialog';

interface SkipConfirmationDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  filePath?: string;
  bulkFilePaths?: string[];
  isBulkMode?: boolean;
}

const SkipConfirmationDialog: React.FC<SkipConfirmationDialogProps> = ({
  open,
  onConfirm,
  onCancel,
  filePath,
  bulkFilePaths,
  isBulkMode = false
}) => {

  const actions = [
    {
      icon: <DeleteSweepIcon />,
      title: 'Remove existing symlinks and directories',
      description: 'Any current symlinks will be deleted, including empty parent directories',
      color: 'error.main'
    },
    {
      icon: <BlockIcon />,
      title: 'Block future automatic processing',
      description: 'This file will be marked as skipped and won\'t be processed automatically',
      color: 'error.main'
    },
    {
      icon: <WarningIcon />,
      title: 'Force mode required to re-enable',
      description: 'You\'ll need to use "Force Recreate Symlinks" to process this file again',
      color: 'warning.main'
    }
  ];

  const fileCount = isBulkMode && bulkFilePaths ? bulkFilePaths.length : 1;
  const isPlural = fileCount > 1;

  return (
    <BaseConfirmationDialog
      open={open}
      onConfirm={onConfirm}
      onCancel={onCancel}
      filePath={filePath}
      title={isBulkMode ? `Skip Processing ${fileCount} Files` : "Skip Processing Confirmation"}
      titleIcon={<WarningIcon sx={{ color: 'warning.main', fontSize: '28px' }} />}
      alertSeverity="warning"
      alertIcon={<BlockIcon />}
      alertTitle={isBulkMode
        ? `This action will permanently skip ${fileCount} files`
        : "This action will permanently skip this file"
      }
      alertDescription={isBulkMode
        ? `Skip processing will remove any existing symlinks for all ${fileCount} files and prevent future automatic processing.`
        : "Skip processing will remove any existing symlinks and prevent future automatic processing."
      }
      actions={actions}
      confirmButtonText={isBulkMode ? `Skip ${fileCount} Files` : "Skip This File"}
      confirmButtonColor="warning"
      titleGradient="linear-gradient(135deg, rgba(255, 152, 0, 0.15) 0%, rgba(255, 193, 7, 0.12) 100%)"
    />
  );
};

export default SkipConfirmationDialog;
