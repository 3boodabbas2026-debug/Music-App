import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import * as adminApi from '../services/api/admin';
import type { AdminEvent, AdminFeedback, AdminJob, AdminStats, AdminUser, Announcement } from '../services/api/admin';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { IconButton } from '../components/ui/IconButton';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SectionHeader } from '../components/ui/SectionHeader';
import { TextField } from '../components/ui/TextField';
import { toast } from '../store/toastStore';
import { apiErrorMessage, friendlyJobError } from '../utils/apiError';
import { useAuthStore } from '../store/authStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Tab = 'overview' | 'users' | 'jobs' | 'feedback' | 'announcements' | 'logs';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'Overview', icon: 'speedometer-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'jobs', label: 'Jobs', icon: 'download-outline' },
  { key: 'feedback', label: 'Feedback', icon: 'chatbubble-ellipses-outline' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone-outline' },
  { key: 'logs', label: 'Logs', icon: 'list-outline' },
];

const EVENT_LABELS: Record<string, string> = {
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

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <GlassPanel style={styles.statTile}>
      <View style={styles.statTileInner}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </GlassPanel>
  );
}

/** A minimal sparkline: one bar per day, height relative to that window's busiest day. */
function SignupSparkline({ days }: { days: AdminStats['signups_last_30_days'] }) {
  if (days.length === 0) {
    return <Text style={styles.mutedLine}>No signups in the last 30 days.</Text>;
  }
  const max = Math.max(...days.map((d) => d.count));
  return (
    <View style={styles.sparkRow}>
      {days.map((d) => (
        <View key={d.date} style={styles.sparkBarTrack}>
          <View style={[styles.sparkBar, { height: `${Math.max(8, (d.count / max) * 100)}%` }]} />
        </View>
      ))}
    </View>
  );
}

const JOB_STATUS_COLOR: Record<string, string> = {
  complete: colors.success,
  failed: colors.danger,
  in_progress: colors.cyan,
  pending: colors.textMuted,
  cancelled: colors.textMuted,
};

/** Horizontal bar chart, same hand-rolled-Views approach as SignupSparkline — no chart library needed for a handful of categories. */
function JobsBarChart({ jobsByStatus }: { jobsByStatus: Record<string, number> }) {
  const entries = Object.entries(jobsByStatus);
  if (entries.length === 0) {
    return <Text style={styles.mutedLine}>No jobs yet.</Text>;
  }
  const max = Math.max(...entries.map(([, count]) => count));
  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map(([jobStatus, count]) => (
        <View key={jobStatus} style={styles.barRow}>
          <Text style={styles.barLabel}>{jobStatus}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.max(4, (count / max) * 100)}%`,
                  backgroundColor: JOB_STATUS_COLOR[jobStatus] ?? colors.cyan,
                },
              ]}
            />
          </View>
          <Text style={styles.barValue}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

function OverviewTab({ stats }: { stats: AdminStats }) {
  return (
    <View>
      <View style={styles.statsGrid}>
        <StatTile label="Users" value={String(stats.total_users)} />
        <StatTile label="Media items" value={String(stats.total_media)} />
        <StatTile label="Storage used" value={formatBytes(stats.storage_bytes)} />
        <StatTile label="Telegram linked" value={String(stats.telegram_linked_users)} />
        <StatTile label="Open feedback" value={String(stats.open_feedback_count)} />
      </View>

      <SectionHeader title="Library breakdown" style={styles.sectionHeader} titleStyle={styles.sectionTitle} />
      <GlassPanel style={styles.panel}>
        <View style={styles.panelBody}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Audio tracks</Text>
            <Text style={styles.fieldValue}>{stats.audio_count}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Video files</Text>
            <Text style={styles.fieldValue}>{stats.video_count}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Recognition success rate</Text>
            <Text style={styles.fieldValue}>
              {stats.recognition_success_rate === null ? '—' : `${Math.round(stats.recognition_success_rate * 100)}%`}
            </Text>
          </View>
        </View>
      </GlassPanel>

      <SectionHeader title="Jobs by status" style={styles.sectionHeader} titleStyle={styles.sectionTitle} />
      <GlassPanel style={styles.panel}>
        <View style={styles.panelBody}>
          <JobsBarChart jobsByStatus={stats.jobs_by_status} />
        </View>
      </GlassPanel>

      <SectionHeader title="Signups · last 30 days" style={styles.sectionHeader} titleStyle={styles.sectionTitle} />
      <GlassPanel style={styles.panel}>
        <View style={styles.panelBody}>
          <SignupSparkline days={stats.signups_last_30_days} />
        </View>
      </GlassPanel>
    </View>
  );
}

function UsersTab({ users, onChanged }: { users: AdminUser[]; onChanged: (user: AdminUser) => void }) {
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleRole(user: AdminUser) {
    setBusyId(user.id);
    try {
      const updated = await adminApi.updateUser(user.id, { role: user.is_admin ? 'user' : 'admin' });
      onChanged(updated);
    } catch (err: any) {
      toast(apiErrorMessage(err, "Couldn't update that user"), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function saveEmail(user: AdminUser) {
    if (!emailDraft.trim() || emailDraft.trim() === user.email) {
      setEditingEmailFor(null);
      return;
    }
    setBusyId(user.id);
    try {
      const updated = await adminApi.updateUser(user.id, { email: emailDraft.trim() });
      onChanged(updated);
      toast('Email updated', 'success');
    } catch (err: any) {
      toast(apiErrorMessage(err, "Couldn't update that email"), 'error');
    } finally {
      setBusyId(null);
      setEditingEmailFor(null);
    }
  }

  if (users.length === 0) {
    return <EmptyState title="No users yet" subtitle="Registered accounts will show up here." icon="people-outline" />;
  }
  return (
    <View style={styles.list}>
      {users.map((user) => (
        <GlassPanel key={user.id} style={styles.row}>
          <View style={[styles.rowContent, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={styles.title}>
                  {user.display_name}
                </Text>
                {user.is_admin && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeLabel}>ADMIN</Text>
                  </View>
                )}
              </View>
              {editingEmailFor === user.id ? (
                <TextInput
                  accessibilityLabel={`Email for ${user.display_name}`}
                  value={emailDraft}
                  onChangeText={setEmailDraft}
                  onBlur={() => saveEmail(user)}
                  onSubmitEditing={() => saveEmail(user)}
                  autoCapitalize="none"
                  autoFocus
                  style={styles.emailInput}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit email for ${user.display_name}`}
                  onPress={() => {
                    setEditingEmailFor(user.id);
                    setEmailDraft(user.email);
                  }}
                  style={styles.emailEditButton}
                >
                  <Text numberOfLines={1} style={styles.subtitle}>
                    {user.email} <Ionicons name="pencil-outline" size={11} color={colors.textMuted} />
                  </Text>
                </Pressable>
              )}
              <Text style={styles.mutedLine}>
                {user.media_count} media · {user.job_count} jobs · {formatBytes(user.storage_bytes)}
                {user.telegram_linked ? ' · Telegram linked' : ''}
              </Text>
              <Text style={styles.mutedLine}>
                {user.last_activity_at ? timeAgo(user.last_activity_at) : 'no activity'}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleRole(user)}
              disabled={busyId === user.id}
              accessibilityRole="button"
              accessibilityLabel={user.is_admin ? `Revoke admin from ${user.display_name}` : `Make ${user.display_name} an admin`}
              accessibilityState={{ disabled: busyId === user.id }}
              style={[styles.roleButton, user.is_admin && styles.roleButtonActive]}
            >
              {busyId === user.id ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[styles.roleButtonLabel, user.is_admin && styles.roleButtonLabelActive]}>
                  {user.is_admin ? 'Revoke admin' : 'Make admin'}
                </Text>
              )}
            </Pressable>
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}

function JobsTab({ jobs }: { jobs: AdminJob[] }) {
  if (jobs.length === 0) {
    return <EmptyState title="No jobs yet" subtitle="Downloads and recognitions across every account will show up here." icon="download-outline" />;
  }
  return (
    <View style={styles.list}>
      {jobs.map((job) => (
        <GlassPanel key={job.id} style={styles.row}>
          <View style={styles.rowContent}>
            <View
              style={[
                styles.badge,
                job.status === 'failed' && styles.badgeFailed,
              ]}
            >
              <Ionicons
                name={job.status === 'failed' ? 'alert-circle' : job.status === 'complete' ? 'checkmark-circle' : 'time-outline'}
                size={18}
                color={job.status === 'failed' ? colors.danger : colors.success}
              />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={styles.title}>
                {job.job_type} · {job.status}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {job.user_email}
              </Text>
              <Text numberOfLines={1} style={[styles.mutedLine, job.status === 'failed' && { color: colors.danger }]}>
                {job.status === 'failed' && job.error_message ? friendlyJobError(job.error_message) : job.source_url ?? '—'}
              </Text>
            </View>
            <Text style={styles.mutedLine}>{timeAgo(job.created_at)}</Text>
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}

function LogsTab({ events }: { events: AdminEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="Nothing logged yet" subtitle="Signups, downloads, and other activity will show up here." icon="list-outline" />;
  }
  return (
    <View style={styles.list}>
      {events.map((event) => (
        <GlassPanel key={event.id} style={styles.row}>
          <View style={styles.rowContent}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={styles.title}>
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </Text>
              {event.user_email && (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {event.user_email}
                </Text>
              )}
              {event.detail && (
                <Text numberOfLines={1} style={styles.mutedLine}>
                  {event.detail}
                </Text>
              )}
            </View>
            <Text style={styles.mutedLine}>{timeAgo(event.created_at)}</Text>
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}

function FeedbackTab({ items, onChanged }: { items: AdminFeedback[]; onChanged: (item: AdminFeedback) => void }) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleStatus(item: AdminFeedback) {
    setBusyId(item.id);
    try {
      const updated = await adminApi.updateFeedback(item.id, {
        status: item.status === 'open' ? 'resolved' : 'open',
      });
      onChanged(updated);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't update that feedback."), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function sendReply(item: AdminFeedback) {
    const reply = (replyDrafts[item.id] ?? '').trim();
    if (!reply) return;
    setBusyId(item.id);
    try {
      const updated = await adminApi.updateFeedback(item.id, { admin_reply: reply });
      onChanged(updated);
      toast('Reply saved', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't save that reply."), 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <EmptyState title="No feedback yet" subtitle="Notes and bug reports users send in will show up here." icon="chatbubble-ellipses-outline" />;
  }
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <GlassPanel key={item.id} style={styles.row}>
          <View style={[styles.rowContent, { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.badge, item.status === 'open' && styles.badgeOpen]}>
                <Ionicons
                  name={item.status === 'open' ? 'ellipse' : 'checkmark-circle'}
                  size={16}
                  color={item.status === 'open' ? colors.cyan : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {item.user_email}
                </Text>
                <Text style={styles.mutedLine}>{timeAgo(item.created_at)}</Text>
              </View>
              <Pressable
                onPress={() => toggleStatus(item)}
                disabled={busyId === item.id}
                accessibilityRole="button"
                accessibilityLabel={item.status === 'open' ? 'Mark feedback resolved' : 'Reopen feedback'}
                accessibilityState={{ disabled: busyId === item.id }}
                style={styles.roleButton}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={styles.roleButtonLabel}>{item.status === 'open' ? 'Mark resolved' : 'Reopen'}</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.feedbackMessage}>{item.message}</Text>
            {item.admin_reply ? (
              <Text style={styles.mutedLine}>Reply: {item.admin_reply}</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TextInput
                  accessibilityLabel={`Reply to ${item.user_email}`}
                  value={replyDrafts[item.id] ?? ''}
                  onChangeText={(text) => setReplyDrafts((prev) => ({ ...prev, [item.id]: text }))}
                  placeholder="Reply (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.emailInput, { flex: 1 }]}
                />
                <Button
                  label="Send reply"
                  variant="secondary"
                  disabled={!(replyDrafts[item.id] ?? '').trim() || busyId === item.id}
                  loading={busyId === item.id}
                  onPress={() => sendReply(item)}
                  style={styles.replyButton}
                />
              </View>
            )}
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}

function AnnouncementsTab({
  items,
  onCreated,
  onDeleted,
}: {
  items: Announcement[];
  onCreated: (item: Announcement) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  async function post() {
    if (!title.trim() || !body.trim() || posting) return;
    setPosting(true);
    try {
      const created = await adminApi.createAnnouncement(title.trim(), body.trim());
      onCreated(created);
      setTitle('');
      setBody('');
      toast('Announcement posted', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't post that announcement."), 'error');
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    try {
      await adminApi.deleteAnnouncement(id);
      onDeleted(id);
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't remove that announcement."), 'error');
    }
  }

  return (
    <View>
      <GlassPanel style={styles.panel}>
        <View style={styles.panelBody}>
          <SectionHeader title="New announcement" titleStyle={styles.inlineSectionTitle} />
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
          />
          <TextField
            label="Message"
            value={body}
            onChangeText={setBody}
            placeholder="What do you want users to see?"
            multiline
            style={styles.announcementBody}
          />
          <Button
            label={!title.trim() || !body.trim() ? 'Add a title and message' : 'Post announcement'}
            onPress={post}
            disabled={posting || !title.trim() || !body.trim()}
            loading={posting}
            style={styles.postButton}
          />
        </View>
      </GlassPanel>

      <SectionHeader title="Posted" style={styles.sectionHeader} titleStyle={styles.sectionTitle} />
      {items.length === 0 ? (
        <Text style={styles.mutedLine}>No announcements yet.</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <GlassPanel key={item.id} style={styles.row}>
              <View style={[styles.rowContent, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.mutedLine}>{item.body}</Text>
                  <Text style={styles.mutedLine}>{timeAgo(item.created_at)}</Text>
                </View>
                <IconButton
                  icon="trash-outline"
                  accessibilityLabel={`Remove announcement ${item.title}`}
                  onPress={() => remove(item.id)}
                  variant="danger"
                />
              </View>
            </GlassPanel>
          ))}
        </View>
      )}
    </View>
  );
}

export function AdminScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      adminApi.getStats(),
      adminApi.getUsers(),
      adminApi.getJobs(),
      adminApi.getLogs(),
      adminApi.getFeedback(),
      adminApi.listAnnouncementsAdmin(),
    ])
      .then(([statsRes, usersRes, jobsRes, logsRes, feedbackRes, announcementsRes]) => {
        setStats(statsRes);
        setUsers(usersRes.items);
        setJobs(jobsRes.items);
        setEvents(logsRes.items);
        setFeedback(feedbackRes.items);
        setAnnouncements(announcementsRes);
      })
      .catch((err) => setLoadError(apiErrorMessage(err, "Couldn't load admin data.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  // The nav entry that leads here is already hidden for everyone else — this
  // is just defense in depth for a typed-in URL on web. Every /admin/* call
  // is independently rejected server-side regardless of what this shows.
  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <ScreenContainer maxWidth={800}>
          <View style={styles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader eyebrow="Restricted" title="Admin" subtitle="Operational controls are limited to the admin account." style={styles.screenHeading} />
          </View>
          <EmptyState title="Not available" subtitle="This area is only visible to the app's admin account." icon="lock-closed-outline" />
        </ScreenContainer>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={800}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader eyebrow="Operations" title="Admin console" subtitle="Accounts, activity, feedback, and system health." style={styles.screenHeading} />
            <IconButton
              icon={loading ? 'hourglass-outline' : 'refresh'}
              accessibilityLabel={loading ? 'Refreshing admin data' : 'Refresh admin data'}
              onPress={load}
              disabled={loading}
              variant="surface"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
            style={styles.tabScroller}
          >
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: tab === t.key }}
                style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
              >
                <Ionicons name={t.icon} size={14} color={tab === t.key ? colors.cyan : colors.textMuted} />
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View accessibilityLiveRegion="polite" style={styles.loadingState}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.mutedLine}>Refreshing admin data…</Text>
            </View>
          ) : loadError ? (
            <EmptyState icon="cloud-offline-outline" title="Admin data is unavailable" subtitle={loadError} actionLabel="Try again" onAction={load} />
          ) : !stats ? (
            <EmptyState icon="alert-circle-outline" title="No admin data" subtitle="Refresh to try loading the dashboard again." actionLabel="Refresh" onAction={load} />
          ) : (
            <>
              {tab === 'overview' && <OverviewTab stats={stats} />}
              {tab === 'users' && (
                <UsersTab
                  users={users}
                  onChanged={(updated) =>
                    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
                  }
                />
              )}
              {tab === 'jobs' && <JobsTab jobs={jobs} />}
              {tab === 'feedback' && (
                <FeedbackTab
                  items={feedback}
                  onChanged={(updated) => {
                    const next = feedback.map((f) => (f.id === updated.id ? updated : f));
                    setFeedback(next);
                    const openCount = next.filter((f) => f.status === 'open').length;
                    setStats((prev) => (prev ? { ...prev, open_feedback_count: openCount } : prev));
                  }}
                />
              )}
              {tab === 'announcements' && (
                <AnnouncementsTab
                  items={announcements}
                  onCreated={(created) => setAnnouncements((prev) => [created, ...prev])}
                  onDeleted={(id) => setAnnouncements((prev) => prev.filter((a) => a.id !== id))}
                />
              )}
              {tab === 'logs' && <LogsTab events={events} />}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xl },
  screenHeading: { flex: 1 },
  tabScroller: { marginBottom: spacing.lg },
  tabRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.md },
  tabChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tabChipActive: { backgroundColor: colors.surfaceElevated, borderColor: colors.surfaceBorderStrong },
  tabLabel: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  tabLabelActive: { color: colors.cyan, fontFamily: 'Sora_500Medium' },
  sectionTitle: {
    ...typography.title,
    fontSize: 17,
    lineHeight: 23,
    color: colors.textPrimary,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statTile: { flexGrow: 1, flexBasis: 150, borderRadius: radii.lg },
  statTileInner: { padding: spacing.md, gap: 2 },
  statValue: { ...typography.title, fontSize: 22, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.textMuted },
  panel: { borderRadius: radii.lg },
  panelBody: { padding: spacing.lg, gap: spacing.md },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  fieldLabel: { ...typography.body, color: colors.textMuted },
  fieldValue: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  mutedLine: { ...typography.caption, color: colors.textMuted },
  loadingState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60 },
  sparkBarTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  sparkBar: { width: '100%', borderRadius: 2, backgroundColor: colors.cyan, minHeight: 4 },
  list: { gap: spacing.sm },
  row: { borderRadius: radii.lg },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  badgeFailed: { borderColor: colors.danger },
  badgeOpen: { borderColor: colors.cyan },
  title: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { ...typography.caption, color: colors.textMuted, width: 90 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceBright, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5, minWidth: 4 },
  barValue: { ...typography.caption, color: colors.textPrimary, width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] },
  adminBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  adminBadgeLabel: { ...typography.caption, fontSize: 9, letterSpacing: 1, color: colors.cyan },
  emailInput: {
    ...typography.body,
    minHeight: 44,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceBright,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emailEditButton: { minHeight: 44, justifyContent: 'center' },
  roleButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceBright,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  roleButtonActive: { backgroundColor: colors.surfaceElevated, borderColor: colors.surfaceBorderStrong },
  roleButtonLabel: { ...typography.caption, color: colors.textSecondary },
  roleButtonLabelActive: { ...typography.caption, color: colors.cyan },
  feedbackMessage: { ...typography.body, color: colors.textPrimary },
  replyButton: { minWidth: 112 },
  inlineSectionTitle: { ...typography.subtitle, fontSize: 16, lineHeight: 22 },
  announcementBody: { minHeight: 96, textAlignVertical: 'top' },
  postButton: { marginTop: spacing.xs },
});
