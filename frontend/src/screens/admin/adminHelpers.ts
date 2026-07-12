import type { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';

export type Tab = 'overview' | 'users' | 'jobs' | 'feedback' | 'announcements' | 'logs';

export const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'Overview', icon: 'speedometer-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'jobs', label: 'Jobs', icon: 'download-outline' },
  { key: 'feedback', label: 'Feedback', icon: 'chatbubble-ellipses-outline' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone-outline' },
  { key: 'logs', label: 'Logs', icon: 'list-outline' },
];

export const EVENT_LABELS: Record<string, string> = {
  user_registered: 'New account',
  job_created: 'Job started',
  job_completed: 'Job completed',
  job_failed: 'Job failed',
  telegram_linked: 'Telegram linked',
  media_deleted: 'Media deleted',
  feedback_submitted: 'Feedback submitted',
  feedback_resolved: 'Feedback resolved',
  announcement_created: 'Announcement posted',
  admin_user_updated: 'User updated by admin',
};

export const JOB_STATUS_COLOR: Record<string, string> = {
  complete: colors.success,
  failed: colors.danger,
  in_progress: colors.cyan,
  pending: colors.textMuted,
  cancelled: colors.textMuted,
};

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
