import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, TextField, Card, CardContent, Chip, IconButton, CircularProgress, useTheme, useMediaQuery, alpha, Stack, Tooltip, InputAdornment, Collapse, FormControl, InputLabel, Select, MenuItem, Pagination, Grid, Button, Checkbox, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Alert } from '@mui/material';
import { Search as SearchIcon, Clear as ClearIcon, GetApp as ExportIcon, Refresh as RefreshIcon, Movie as MovieIcon, Tv as TvIcon, Folder as FolderIcon, Storage as StorageIcon, TrendingUp as TrendingUpIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, ViewList as CompactViewIcon, ViewModule as CardViewIcon, Delete as DeleteIcon, Update as UpdateIcon, CheckCircle } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const MotionCard = motion(Card);

interface DatabaseRecord {
  file_path: string;
  destination_path?: string;
  tmdb_id?: string;
  season_number?: string;
  reason?: string;
  file_size?: number;
}

interface DatabaseStats {
  totalRecords: number;
  processedFiles: number;
  skippedFiles: number;
  movies: number;
  tvShows: number;
  totalSize: number;
}

const DatabaseSearch: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [records, setRecords] = useState<DatabaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DatabaseStats | null>(null);

  // URL-synchronized pagination
  const pageFromUrl = parseInt(searchParams.get('dbPage') || '1', 10);
  const [currentPageState, setCurrentPageState] = useState(pageFromUrl);
  const [recordsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  // Function to update both page state and URL
  const setCurrentPage = useCallback((newPage: number) => {
    setCurrentPageState(newPage);
    const newSearchParams = new URLSearchParams(searchParams);
    if (newPage === 1) {
      newSearchParams.delete('dbPage');
    } else {
      newSearchParams.set('dbPage', newPage.toString());
    }
    setSearchParams(newSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const currentPage = currentPageState;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [compactView, setCompactView] = useState(false);

  // Bulk selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Database update state
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');

  const fetchDatabaseRecords = useCallback(async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * recordsPerPage;
      const response = await axios.get('/api/database/search', {
        params: {
          query: searchQuery || '',
          type: filterType,
          limit: recordsPerPage,
          offset: offset,
        },
      });

      setRecords(response.data.records || []);
      setTotalRecords(response.data.total || 0);
      setStats(response.data.stats || null);

      // Clear selections when records change
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Failed to fetch database records:', error);
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterType, currentPage, recordsPerPage]);

  const fetchDatabaseStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/database/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch database stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchDatabaseStats();
  }, [fetchDatabaseStats]);

  useEffect(() => {
    const urlPage = parseInt(searchParams.get('dbPage') || '1', 10);
    if (urlPage !== currentPageState) {
      setCurrentPageState(urlPage);
    }
  }, [searchParams, currentPageState]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setSelectedFiles(new Set());
      fetchDatabaseRecords();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filterType]);

  useEffect(() => {
    setSelectedFiles(new Set());
    fetchDatabaseRecords();
  }, [currentPage]);

  const totalPages = Math.ceil(totalRecords / recordsPerPage);

  const handleClearSearch = () => {
    setSearchQuery('');
    setFilterType('all');
    setCurrentPage(1);
    setSelectedFiles(new Set());
  };

  const handleStatsCardClick = (type: string) => {
    setFilterType(type);
    setCurrentPage(1);
    setSelectedFiles(new Set());
  };

  // Bulk selection handlers
  const handleFileSelect = (filePath: string, checked: boolean) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(filePath);
      } else {
        newSet.delete(filePath);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allFilePaths = records.map(record => record.file_path);
      setSelectedFiles(new Set(allFilePaths));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleBulkAction = () => {
    setBulkActionDialogOpen(true);
  };

  const handleBulkActionConfirm = async () => {
    if (selectedFiles.size === 0) return;

    setBulkActionLoading(true);
    setError(null);
    try {
      const selectedRecords = records.filter(record => selectedFiles.has(record.file_path));
      const filesWithDestination = selectedRecords.filter(record => record.destination_path && record.destination_path.trim() !== '');
      const filesWithoutDestination = selectedRecords.filter(record => !record.destination_path || record.destination_path.trim() === '');

      let totalDeleted = 0;
      let errors: string[] = [];
      if (filesWithDestination.length > 0) {
        try {
          const destinationPaths = filesWithDestination.map(record => record.destination_path);
          const response = await axios.post('/api/delete', {
            paths: destinationPaths
          });

          if (response.data.success) {
            totalDeleted += response.data.deletedCount || filesWithDestination.length;

            if (response.data.errors && response.data.errors.length > 0) {
              errors = [...errors, ...response.data.errors];
            }
          } else {
            errors.push('Failed to delete files');
          }
        } catch (error: any) {
          console.error('Failed to delete files with destination paths:', error);
          errors.push(`Failed to delete ${filesWithDestination.length} files: ${error.response?.data?.error || error.message}`);
        }
      }

      if (filesWithoutDestination.length > 0) {
        try {
          const filePaths = filesWithoutDestination.map(record => record.file_path);
          const response = await axios.delete('/api/file-operations/bulk', {
            data: { filePaths }
          });

          if (response.data.success) {
            totalDeleted += response.data.deletedCount || filesWithoutDestination.length;
          }
        } catch (error: any) {
          console.error('Failed to delete database records:', error);
          errors.push(`Failed to delete ${filesWithoutDestination.length} database records: ${error.response?.data?.error || error.message}`);
        }
      }

      if (totalDeleted > 0) {
        // Remove deleted records from the current view
        setRecords(prev => prev.filter(record => !selectedFiles.has(record.file_path)));
        setTotalRecords(prev => prev - totalDeleted);

        // Update stats
        if (stats) {
          setStats(prev => prev ? {
            ...prev,
            totalRecords: prev.totalRecords - totalDeleted
          } : null);
        }

        setSelectedFiles(new Set());
        setBulkActionDialogOpen(false);

        // Refresh data to ensure consistency
        fetchDatabaseRecords();
      } else if (errors.length > 0) {
        setError(`Failed to delete any files. ${errors.length} errors occurred.`);
      }
    } catch (error: any) {
      console.error('Failed to delete selected files:', error.response?.data?.error || error.message);
      setError(error.response?.data?.error || error.message || 'Failed to delete selected files');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get('/api/database/export', {
        responseType: 'blob',
        params: {
          query: searchQuery || '',
          type: filterType,
        },
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `database_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export database:', error);
    }
  };

  const handleDatabaseUpdate = async () => {
    try {
      setUpdateLoading(true);
      setError(null);
      setUpdateSuccess(false);
      setUpdateMessage('Starting database update...');

      const response = await axios.post('/api/database/update');

      if (response.data.status === 'running') {
        setUpdateSuccess(true);
        setUpdateMessage('Database update started successfully! The migration process is running in the background. Check the MediaHub logs for detailed progress and results.');

        // Keep the dialog open to show success message
        setTimeout(() => {
          setUpdateDialogOpen(false);
          setUpdateSuccess(false);
          setUpdateMessage('');
          // Refresh data after update completes to show new metadata
          fetchDatabaseRecords();
          fetchDatabaseStats();
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to update database:', error);
      setError('Failed to start database update. Please try again.');
      setUpdateSuccess(false);
      setUpdateMessage('');
    } finally {
      setUpdateLoading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getRecordType = (record: DatabaseRecord) => {
    if (record.reason) return 'skipped';
    if (record.tmdb_id && record.season_number) return 'tvshows';
    if (record.tmdb_id && !record.season_number) return 'movies';
    return 'other';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'movies':
        return <MovieIcon sx={{ fontSize: 16, color: theme.palette.success.main }} />;
      case 'tvshows':
        return <TvIcon sx={{ fontSize: 16, color: theme.palette.secondary.main }} />;
      case 'skipped':
        return <ClearIcon sx={{ fontSize: 16, color: theme.palette.warning.main }} />;
      default:
        return <FolderIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'movies':
        return theme.palette.success.main;
      case 'tvshows':
        return theme.palette.secondary.main;
      case 'skipped':
        return theme.palette.warning.main;
      default:
        return theme.palette.text.secondary;
    }
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      {/* Database Update Status Alert */}
      {updateLoading && (
        <Alert
          severity="info"
          sx={{
            mb: 3,
            borderRadius: 2,
            '& .MuiAlert-icon': {
              alignItems: 'center'
            }
          }}
          icon={<CircularProgress size={20} />}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Database Update in Progress
            </Typography>
            <Typography variant="body2">
              Migrating old entries to new format using TMDB API calls. This may take several minutes...
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid
            size={{
              xs: 6,
              sm: 4,
              md: 2
            }}>
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onClick={() => handleStatsCardClick('all')}
              sx={{
                background: theme.palette.mode === 'dark'
                  ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.primary.main, 0.08)} 100%)`
                  : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
                bgcolor: theme.palette.mode === 'dark' ? '#000000' : 'background.paper',
                border: `1px solid ${alpha(theme.palette.primary.main, filterType === 'all' ? 0.5 : 0.2)}`,
                cursor: 'pointer',
                transform: filterType === 'all' ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.2s ease',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 2px 8px rgba(0, 0, 0, 0.4)'
                  : '0 1px 3px rgba(0, 0, 0, 0.06)',
                '&:hover': {
                  transform: 'scale(1.02)',
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.4)}`,
                  boxShadow: theme.palette.mode === 'dark'
                    ? `0 4px 16px rgba(0, 0, 0, 0.6)`
                    : `0 2px 8px ${alpha(theme.palette.primary.main, 0.1)}`,
                },
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                  <StorageIcon sx={{ color: 'primary.main', fontSize: { xs: 18, sm: 20 } }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {stats.totalRecords.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Records
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </MotionCard>
          </Grid>

          <Grid
            size={{
              xs: 6,
              sm: 4,
              md: 2
            }}>
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => handleStatsCardClick('movies')}
              sx={{
                background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.success.main, filterType === 'movies' ? 0.5 : 0.2)}`,
                cursor: 'pointer',
                transform: filterType === 'movies' ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  border: `1px solid ${alpha(theme.palette.success.main, 0.4)}`,
                  boxShadow: `0 4px 12px ${alpha(theme.palette.success.main, 0.15)}`,
                },
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                  <MovieIcon sx={{ color: 'success.main', fontSize: { xs: 18, sm: 20 } }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {stats.movies.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Movies
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </MotionCard>
          </Grid>

          <Grid
            size={{
              xs: 6,
              sm: 4,
              md: 2
            }}>
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={() => handleStatsCardClick('tvshows')}
              sx={{
                background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.secondary.main, filterType === 'tvshows' ? 0.5 : 0.2)}`,
                cursor: 'pointer',
                transform: filterType === 'tvshows' ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  border: `1px solid ${alpha(theme.palette.secondary.main, 0.4)}`,
                  boxShadow: `0 4px 12px ${alpha(theme.palette.secondary.main, 0.15)}`,
                },
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                  <TvIcon sx={{ color: 'secondary.main', fontSize: { xs: 18, sm: 20 } }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {stats.tvShows.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      TV Shows
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </MotionCard>
          </Grid>

          <Grid
            size={{
              xs: 6,
              sm: 4,
              md: 2
            }}>
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              onClick={() => handleStatsCardClick('skipped')}
              sx={{
                background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.warning.main, filterType === 'skipped' ? 0.5 : 0.2)}`,
                cursor: 'pointer',
                transform: filterType === 'skipped' ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  border: `1px solid ${alpha(theme.palette.warning.main, 0.4)}`,
                  boxShadow: `0 4px 12px ${alpha(theme.palette.warning.main, 0.15)}`,
                },
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                  <ClearIcon sx={{ color: 'warning.main', fontSize: { xs: 18, sm: 20 } }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {stats.skippedFiles.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Skipped
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </MotionCard>
          </Grid>

          <Grid
            size={{
              xs: 6,
              sm: 4,
              md: 2
            }}>
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              sx={{
                background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                  <TrendingUpIcon sx={{ color: 'info.main', fontSize: { xs: 18, sm: 20 } }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {formatFileSize(stats.totalSize)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Size
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </MotionCard>
          </Grid>

          <Grid
            size={{
              xs: 6,
              sm: 4,
              md: 2
            }}>
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              sx={{
                background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                  <StorageIcon sx={{ color: 'success.main', fontSize: { xs: 18, sm: 20 } }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {stats.processedFiles.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Processed
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </MotionCard>
          </Grid>
        </Grid>
      )}
      {/* Search and Filter Controls */}
      <Card sx={{
        mb: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: theme.palette.mode === 'dark' ? '#000000' : 'background.paper',
        boxShadow: theme.palette.mode === 'dark'
          ? '0 2px 8px rgba(0, 0, 0, 0.4)'
          : '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}>
        <CardContent sx={{ p: { xs: 2, sm: 2 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            {/* Search Bar */}
            <TextField
              placeholder="Search files, paths, TMDB IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                flex: { xs: 1, sm: 1 },
                maxWidth: { xs: '100%', sm: 400 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* Filter Dropdown */}
            <FormControl sx={{ minWidth: { xs: '100%', sm: 150 } }}>
              <InputLabel>Filter</InputLabel>
              <Select
                value={filterType}
                label="Filter"
                onChange={(e) => setFilterType(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="all">All Records</MenuItem>
                <MenuItem value="movies">Movies</MenuItem>
                <MenuItem value="tvshows">TV Shows</MenuItem>
                <MenuItem value="processed">Processed</MenuItem>
                <MenuItem value="skipped">Skipped</MenuItem>
              </Select>
            </FormControl>

            {/* Action Buttons */}
            <Stack
              direction="row"
              spacing={1}
              justifyContent={{ xs: 'center', sm: 'flex-end' }}
              flexWrap="wrap"
              sx={{ gap: 1 }}
            >
              <Tooltip title={compactView ? "Card View" : "Compact View"}>
                <IconButton
                  onClick={() => setCompactView(!compactView)}
                  sx={{
                    bgcolor: compactView ? 'primary.main' : 'action.hover',
                    color: compactView ? 'primary.contrastText' : 'text.secondary',
                    '&:hover': {
                      bgcolor: compactView ? 'primary.dark' : 'action.selected'
                    },
                  }}
                >
                  {compactView ? <CardViewIcon /> : <CompactViewIcon />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Refresh">
                <IconButton
                  onClick={fetchDatabaseRecords}
                  disabled={loading}
                  sx={{
                    bgcolor: 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Export Results">
                <IconButton
                  onClick={handleExport}
                  sx={{
                    bgcolor: 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <ExportIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Update Database to New Format">
                <IconButton
                  onClick={() => setUpdateDialogOpen(true)}
                  disabled={updateLoading}
                  sx={{
                    bgcolor: updateLoading ? alpha(theme.palette.warning.main, 0.1) : alpha(theme.palette.warning.main, 0.1),
                    color: updateLoading ? 'warning.main' : 'warning.main',
                    border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                    '&:hover': {
                      bgcolor: updateLoading ? alpha(theme.palette.warning.main, 0.1) : alpha(theme.palette.warning.main, 0.2),
                      borderColor: theme.palette.warning.main,
                    },
                  }}
                >
                  {updateLoading ? <CircularProgress size={20} color="warning" /> : <UpdateIcon />}
                </IconButton>
              </Tooltip>

              {(searchQuery || filterType !== 'all') && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleClearSearch}
                  startIcon={<ClearIcon />}
                  sx={{
                    borderRadius: 2,
                    minWidth: { xs: 'auto', sm: 'auto' },
                    px: { xs: 1.5, sm: 2 }
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Clear
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </Box>
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      {/* Results */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Results Summary */}
          <Box sx={{
            mb: 2,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: { xs: 1, sm: 0 }
          }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                textAlign: { xs: 'center', sm: 'left' },
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Showing {records.length} of {totalRecords.toLocaleString()} records
              {searchQuery && ` for "${searchQuery}"`}
            </Typography>

            {totalPages > 1 && (
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(_, page) => setCurrentPage(page)}
                size={isMobile ? "small" : "medium"}
                siblingCount={isMobile ? 0 : 1}
                boundaryCount={isMobile ? 1 : 1}
                sx={{
                  '& .MuiPaginationItem-root': {
                    borderRadius: 2,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                    minWidth: { xs: 28, sm: 32 },
                    height: { xs: 28, sm: 32 },
                  },
                  '& .MuiPagination-ul': {
                    gap: { xs: 0.25, sm: 0.5 }
                  }
                }}
              />
            )}
          </Box>

          {/* Bulk Selection Toolbar */}
          <Collapse in={selectedFiles.size > 0} timeout={300}>
            <Box sx={{ mb: 3 }}>
              <Box
                sx={{
                  background: theme.palette.mode === 'dark'
                    ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.primary.main, 0.06)} 100%)`
                    : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${alpha(theme.palette.primary.main, 0.03)} 100%)`,
                  backdropFilter: 'blur(10px)',
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)}`,
                  boxShadow: theme.palette.mode === 'dark'
                    ? `0 4px 20px ${alpha(theme.palette.primary.main, 0.1)}, 0 1px 4px ${alpha('#000', 0.2)}`
                    : `0 4px 20px ${alpha(theme.palette.primary.main, 0.06)}, 0 1px 4px ${alpha('#000', 0.05)}`,
                  p: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease-out',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Checkbox
                    checked={selectedFiles.size === records.length && records.length > 0}
                    indeterminate={selectedFiles.size > 0 && selectedFiles.size < records.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    size="small"
                    sx={{
                      p: 0,
                      color: 'primary.main',
                      '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                        color: 'primary.main',
                      },
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: 'primary.main',
                      fontSize: '0.875rem',
                    }}
                  >
                    {selectedFiles.size === records.length && records.length > 0
                      ? `All ${records.length} selected`
                      : selectedFiles.size > 0
                      ? `${selectedFiles.size} selected`
                      : 'Select all'
                    }
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  size="medium"
                  startIcon={<DeleteIcon />}
                  onClick={() => handleBulkAction()}
                  disabled={selectedFiles.size === 0 || bulkActionLoading}
                  sx={{
                    bgcolor: 'error.main',
                    color: 'error.contrastText',
                    fontWeight: 600,
                    px: 2.5,
                    py: 1,
                    borderRadius: 2,
                    textTransform: 'none',
                    boxShadow: `0 2px 8px ${alpha(theme.palette.error.main, 0.25)}`,
                    '&:hover': {
                      bgcolor: 'error.dark',
                      boxShadow: `0 4px 12px ${alpha(theme.palette.error.main, 0.35)}`,
                      transform: 'translateY(-1px)',
                    },
                    '&:disabled': {
                      bgcolor: alpha(theme.palette.error.main, 0.3),
                      color: alpha(theme.palette.error.contrastText, 0.5),
                      boxShadow: 'none',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {bulkActionLoading ? 'Deleting...' : `Delete ${selectedFiles.size}`}
                </Button>
              </Box>
            </Box>
          </Collapse>

          {/* Modern Card-Based Results */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: compactView ? 1 : 2 }}>
            <AnimatePresence>
              {records.map((record: DatabaseRecord, index: number) => {
                const recordType = getRecordType(record);
                const fileName = record.file_path.split(/[/\\]/).pop() || record.file_path;
                const isExpanded = expandedRows.has(record.file_path);
                const isSelected = selectedFiles.has(record.file_path);

                return (
                  <MotionCard
                    key={record.file_path}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    sx={{
                      borderRadius: 3,
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : (theme.palette.mode === 'light'
                        ? alpha(getTypeColor(recordType), 0.3)
                        : alpha(getTypeColor(recordType), 0.2)),
                      bgcolor: isSelected
                        ? alpha(theme.palette.primary.main, 0.05)
                        : (theme.palette.mode === 'dark' ? '#000000' : 'background.paper'),
                      overflow: 'hidden',
                      boxShadow: theme.palette.mode === 'dark'
                        ? '0 1px 4px rgba(0, 0, 0, 0.3)'
                        : '0 1px 3px rgba(0, 0, 0, 0.04)',
                      '&:hover': {
                        borderColor: isSelected ? 'primary.main' : (theme.palette.mode === 'light'
                          ? alpha(getTypeColor(recordType), 0.5)
                          : alpha(getTypeColor(recordType), 0.4)),
                        boxShadow: theme.palette.mode === 'light'
                          ? `0 2px 8px ${alpha(getTypeColor(recordType), 0.1)}`
                          : `0 2px 12px rgba(0, 0, 0, 0.5)`,
                        transform: 'translateY(-2px)',
                      },
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <CardContent sx={{ p: { xs: 1.5, sm: compactView ? 2 : 3 }, '&:last-child': { pb: { xs: 1.5, sm: compactView ? 2 : 3 } } }}>
                      {/* Header Row */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, mb: { xs: 1, sm: compactView ? 1 : 2 } }}>
                        {/* Checkbox */}
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleFileSelect(record.file_path, e.target.checked);
                          }}
                          size="small"
                          sx={{
                            p: 0.5,
                            color: 'text.secondary',
                            flexShrink: 0,
                            '&.Mui-checked': {
                              color: 'primary.main',
                            },
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                          }}
                        />

                        {/* Type Icon */}
                        <Box
                          sx={{
                            p: { xs: 0.75, sm: compactView ? 1 : 1.5 },
                            borderRadius: 2,
                            bgcolor: theme.palette.mode === 'light'
                              ? alpha(getTypeColor(recordType), 0.08)
                              : alpha(getTypeColor(recordType), 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getTypeIcon(recordType)}
                        </Box>

                        {/* File Info */}
                        <Box sx={{ flex: 1, minWidth: 0, pr: { xs: 0.5, sm: 1 } }}>
                          <Box sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: { xs: 0.5, sm: 1 },
                            mb: { xs: 0.5, sm: 1 },
                            flexWrap: 'wrap'
                          }}>
                            <Typography
                              variant="h6"
                              sx={{
                                fontWeight: 600,
                                fontSize: { xs: '1rem', sm: '1.1rem' },
                                lineHeight: 1.3,
                                flex: '1 1 auto',
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {fileName}
                            </Typography>
                            {record.season_number && (
                              <Chip
                                label={`Season ${record.season_number}`}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.7rem',
                                  bgcolor: theme.palette.mode === 'light'
                                    ? alpha(theme.palette.secondary.main, 0.08)
                                    : alpha(theme.palette.secondary.main, 0.1),
                                  color: 'secondary.main',
                                  border: theme.palette.mode === 'light'
                                    ? `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`
                                    : 'none',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </Box>

                          {/* Status and TMDB */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, flexWrap: 'wrap' }}>
                            <Chip
                              label={record.reason || 'Processed'}
                              size="small"
                              sx={{
                                bgcolor: theme.palette.mode === 'light'
                                  ? alpha(getTypeColor(recordType), 0.08)
                                  : alpha(getTypeColor(recordType), 0.1),
                                color: getTypeColor(recordType),
                                fontWeight: 500,
                                fontSize: '0.7rem',
                                border: theme.palette.mode === 'light'
                                  ? `1px solid ${alpha(getTypeColor(recordType), 0.2)}`
                                  : 'none',
                              }}
                            />
                            {record.tmdb_id && (
                              <Chip
                                label={`TMDB: ${record.tmdb_id}`}
                                size="small"
                                variant="outlined"
                                sx={{
                                  fontSize: '0.7rem',
                                  borderColor: alpha(theme.palette.info.main, 0.3),
                                  color: 'info.main',
                                }}
                              />
                            )}
                            {record.file_size && (
                              <Chip
                                label={formatFileSize(record.file_size)}
                                size="small"
                                variant="outlined"
                                sx={{
                                  fontSize: '0.7rem',
                                  borderColor: alpha(theme.palette.text.secondary, 0.3),
                                  color: 'text.secondary',
                                }}
                              />
                            )}
                          </Box>
                        </Box>

                        {/* Expand Button */}
                        <Box sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              const newExpanded = new Set(expandedRows);
                              if (isExpanded) {
                                newExpanded.delete(record.file_path);
                              } else {
                                newExpanded.add(record.file_path);
                              }
                              setExpandedRows(newExpanded);
                            }}
                            sx={{
                              bgcolor: theme.palette.mode === 'light'
                                ? alpha(theme.palette.primary.main, 0.08)
                                : alpha(theme.palette.primary.main, 0.1),
                              color: 'primary.main',
                              border: theme.palette.mode === 'light'
                                ? `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
                                : 'none',
                              width: 32,
                              height: 32,
                              '&:hover': {
                                bgcolor: theme.palette.mode === 'light'
                                  ? alpha(theme.palette.primary.main, 0.15)
                                  : alpha(theme.palette.primary.main, 0.2),
                              },
                            }}
                          >
                            {isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </Box>
                      </Box>

                      {/* Path Preview */}
                      {!compactView && (
                        <Box sx={{ mb: isExpanded ? 2 : 0 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                          >
                            Source Path:
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              bgcolor: theme.palette.mode === 'light'
                                ? alpha(theme.palette.grey[100], 0.8)
                                : '#000000',
                              p: 1,
                              borderRadius: 1,
                              wordBreak: 'break-all',
                              maxHeight: isExpanded ? 'none' : '2.4em',
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: isExpanded ? 'none' : 2,
                              WebkitBoxOrient: 'vertical',
                              transition: 'all 0.3s ease',
                              border: theme.palette.mode === 'light'
                                ? `1px solid ${alpha(theme.palette.grey[300], 0.8)}`
                                : `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                            }}
                          >
                            {record.file_path}
                          </Typography>
                        </Box>
                      )}

                      {/* Expanded Content */}
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                          {record.destination_path && (
                            <Box sx={{ mb: 2 }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                              >
                                Destination Path:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.8rem',
                                  bgcolor: theme.palette.mode === 'light'
                                    ? alpha(theme.palette.success.main, 0.08)
                                    : '#000000',
                                  color: 'success.main',
                                  p: 1,
                                  borderRadius: 1,
                                  wordBreak: 'break-all',
                                  border: theme.palette.mode === 'light'
                                    ? `1px solid ${alpha(theme.palette.success.main, 0.2)}`
                                    : `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                                }}
                              >
                                {record.destination_path}
                              </Typography>
                            </Box>
                          )}

                          {record.reason && (
                            <Box sx={{ mb: 2 }}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                              >
                                Reason:
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  bgcolor: theme.palette.mode === 'light'
                                    ? alpha(getTypeColor(recordType), 0.08)
                                    : '#000000',
                                  color: getTypeColor(recordType),
                                  p: 1,
                                  borderRadius: 1,
                                  fontSize: '0.9rem',
                                  border: theme.palette.mode === 'light'
                                    ? `1px solid ${alpha(getTypeColor(recordType), 0.2)}`
                                    : `1px solid ${alpha(getTypeColor(recordType), 0.3)}`,
                                }}
                              >
                                {record.reason}
                              </Typography>
                            </Box>
                          )}

                          {/* Additional Metadata */}
                          <Grid container spacing={2}>
                            {record.tmdb_id && (
                              <Grid
                                size={{
                                  xs: 6,
                                  sm: 4
                                }}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                  TMDB ID:
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {record.tmdb_id}
                                </Typography>
                              </Grid>
                            )}

                            {record.season_number && (
                              <Grid
                                size={{
                                  xs: 6,
                                  sm: 4
                                }}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                  Season:
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {record.season_number}
                                </Typography>
                              </Grid>
                            )}

                            {record.file_size && (
                              <Grid
                                size={{
                                  xs: 6,
                                  sm: 4
                                }}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                  File Size:
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {formatFileSize(record.file_size)}
                                </Typography>
                              </Grid>
                            )}
                          </Grid>
                        </Box>
                      </Collapse>
                    </CardContent>
                  </MotionCard>
                );
              })}
            </AnimatePresence>
          </Box>

          {/* Bottom Pagination */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={(_, page) => setCurrentPage(page)}
              color="primary"
              size={isMobile ? "small" : "medium"}
              siblingCount={isMobile ? 0 : 1}
              boundaryCount={isMobile ? 1 : 1}
              sx={{
                '& .MuiPaginationItem-root': {
                  borderRadius: 2,
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  minWidth: { xs: 28, sm: 32 },
                  height: { xs: 28, sm: 32 },
                },
                '& .MuiPagination-ul': {
                  gap: { xs: 0.25, sm: 0.5 }
                }
              }}
            />
          </Box>
        </>
      )}

      {/* Bulk Action Confirmation Dialog */}
      <Dialog
        open={bulkActionDialogOpen}
        onClose={() => setBulkActionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            bgcolor: theme.palette.mode === 'dark' ? '#000000 !important' : 'background.paper',
            backgroundColor: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
            background: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
          }
        }}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? '#000000 !important' : 'background.paper',
            backgroundColor: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
            background: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
            border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.8)'
              : '0 4px 20px rgba(0, 0, 0, 0.08)',
          }
        }}
      >
        <DialogTitle>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Delete Selected Files
          </Typography>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, color: 'text.primary' }}>
            Are you sure you want to delete <strong>{selectedFiles.size}</strong> selected files?
          </DialogContentText>
          <DialogContentText sx={{
            color: 'text.primary',
            p: 2,
            bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.15 : 0.05),
            borderRadius: 2,
            borderLeft: `4px solid ${theme.palette.error.main}`,
            border: theme.palette.mode === 'dark' ? `1px solid ${alpha(theme.palette.error.main, 0.2)}` : 'none',
          }}>
            This action will move processed files to trash (can be restored) and remove failed file records from the database. Source files will remain untouched.
          </DialogContentText>
          {error && (
            <DialogContentText sx={{
              color: 'error.main',
              mt: 2,
              p: 2,
              bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.15 : 0.1),
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.3 : 0.3)}`,
            }}>
              {error}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button
            onClick={() => setBulkActionDialogOpen(false)}
            disabled={bulkActionLoading}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkActionConfirm}
            color="error"
            variant="contained"
            disabled={bulkActionLoading}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
            }}
          >
            {bulkActionLoading ? 'Deleting...' : `Delete ${selectedFiles.size} Files`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Database Update Dialog */}
      <Dialog
        open={updateDialogOpen}
        onClose={() => !updateLoading && setUpdateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            bgcolor: theme.palette.mode === 'dark' ? '#000000 !important' : 'background.paper',
            backgroundColor: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
            background: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
          }
        }}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: theme.palette.mode === 'dark' ? '#000000 !important' : 'background.paper',
            backgroundColor: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
            background: theme.palette.mode === 'dark' ? '#000000 !important' : undefined,
            border: theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.8)'
              : '0 4px 20px rgba(0, 0, 0, 0.08)',
          }
        }}
      >
        <DialogTitle sx={{
          pb: 1,
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'text.primary',
        }}>
          Update Database
        </DialogTitle>
        <DialogContent>
          {!updateSuccess && !updateLoading && (
            <>
              <DialogContentText sx={{ mb: 2, color: 'text.primary' }}>
                This will migrate your database entries to the using TMDB API calls to populate missing metadata fields.
              </DialogContentText>
              <DialogContentText sx={{
                color: 'text.primary',
                p: 2,
                bgcolor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.15 : 0.05),
                borderRadius: 2,
                borderLeft: `4px solid ${theme.palette.info.main}`,
                border: theme.palette.mode === 'dark' ? `1px solid ${alpha(theme.palette.info.main, 0.2)}` : 'none',
                mb: 2,
              }}>
                <strong>What this does:</strong>
                <br />• Finds entries missing new metadata
                <br />• Uses TMDB API to fetch accurate information
                <br />• Updates database with proper titles, seasons, episodes, and more
                <br />• Improves search and browsing experience
              </DialogContentText>
              <DialogContentText sx={{
                color: 'text.primary',
                p: 2,
                bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.15 : 0.05),
                borderRadius: 2,
                borderLeft: `4px solid ${theme.palette.warning.main}`,
                border: theme.palette.mode === 'dark' ? `1px solid ${alpha(theme.palette.warning.main, 0.2)}` : 'none',
              }}>
                <strong>Note:</strong> This process may take several minutes depending on the number of entries to update. The operation runs in the background.
              </DialogContentText>
            </>
          )}

          {updateLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <CircularProgress size={24} color="warning" />
              <Typography color="text.primary">{updateMessage}</Typography>
            </Box>
          )}

          {updateSuccess && (
            <Box sx={{
              color: 'success.main',
              p: 2,
              bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.15 : 0.05),
              borderRadius: 2,
              borderLeft: `4px solid ${theme.palette.success.main}`,
              border: theme.palette.mode === 'dark' ? `1px solid ${alpha(theme.palette.success.main, 0.2)}` : 'none',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
            }}>
              <CheckCircle sx={{ fontSize: 20, mt: 0.2, flexShrink: 0 }} />
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>
                  Update Started Successfully!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary', mt: 0.5 }}>
                  {updateMessage}
                </Typography>
              </Box>
            </Box>
          )}

          {error && (
            <DialogContentText sx={{
              color: 'error.main',
              mt: 2,
              p: 2,
              bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.15 : 0.1),
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.3 : 0.3)}`,
            }}>
              {error}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button
            onClick={() => {
              setUpdateDialogOpen(false);
              setUpdateSuccess(false);
              setUpdateMessage('');
              setError(null);
            }}
            disabled={updateLoading}
            sx={{ textTransform: 'none' }}
          >
            {updateSuccess ? 'Close' : 'Cancel'}
          </Button>
          {!updateSuccess && (
            <Button
              onClick={handleDatabaseUpdate}
              color="warning"
              variant="contained"
              disabled={updateLoading}
              startIcon={updateLoading ? <CircularProgress size={16} color="inherit" /> : <UpdateIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
              }}
            >
              {updateLoading ? 'Starting Update...' : 'Start Update'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatabaseSearch;
