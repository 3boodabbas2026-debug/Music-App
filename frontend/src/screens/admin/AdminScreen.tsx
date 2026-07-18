import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import * as adminApi from '../../services/api/admin';
import type { AdminEvent, AdminFeedback, AdminJob, AdminStats, AdminUser, Announcement } from '../../services/api/admin';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { TabChipRow } from '../../components/ui/TabChipRow';
import { apiErrorMessage } from '../../utils/apiError';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

import { adminStyles } from './adminStyles';
import type { Tab } from './adminHelpers';
import { TABS } from './adminHelpers';
import { OverviewTab } from './tabs/OverviewTab';
import { UsersTab, type UsersQuery } from './tabs/UsersTab';
import { JobsTab, type JobsQuery } from './tabs/JobsTab';
import { FeedbackTab, type FeedbackQuery } from './tabs/FeedbackTab';
import { AnnouncementsTab } from './tabs/AnnouncementsTab';
import { LogsTab, type LogsQuery } from './tabs/LogsTab';

type SectionKey = 'stats' | 'users' | 'jobs' | 'feedback' | 'announcements' | 'logs';
const SECTION_KEYS: SectionKey[] = ['stats', 'users', 'jobs', 'feedback', 'announcements', 'logs'];
const EMPTY_LOADING: Record<SectionKey, boolean> = { stats: false, users: false, jobs: false, feedback: false, announcements: false, logs: false };
const EMPTY_ERRORS: Record<SectionKey, string | null> = { stats: null, users: null, jobs: null, feedback: null, announcements: null, logs: null };
const INITIAL_USERS_QUERY: UsersQuery = { search: '', role: 'all', sort: 'newest' };
const INITIAL_JOBS_QUERY: JobsQuery = { search: '', status: 'all', sort: 'newest' };
const INITIAL_FEEDBACK_QUERY: FeedbackQuery = { search: '', status: 'all', sort: 'newest' };
const INITIAL_LOGS_QUERY: LogsQuery = { search: '', eventType: 'all', sort: 'newest' };

export function AdminScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const adminUser = useAuthStore((s) => s.user);
  const isAdmin = adminUser?.is_admin ?? false;
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState<Record<SectionKey, boolean>>(EMPTY_LOADING);
  const [errors, setErrors] = useState<Record<SectionKey, string | null>>(EMPTY_ERRORS);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersQuery, setUsersQuery] = useState(INITIAL_USERS_QUERY);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsQuery, setJobsQuery] = useState(INITIAL_JOBS_QUERY);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [logsQuery, setLogsQuery] = useState(INITIAL_LOGS_QUERY);
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackQuery, setFeedbackQuery] = useState(INITIAL_FEEDBACK_QUERY);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  function setSectionLoading(key: SectionKey, value: boolean) { setLoading((prev) => ({ ...prev, [key]: value })); }
  function setSectionError(key: SectionKey, value: string | null) { setErrors((prev) => ({ ...prev, [key]: value })); }

  async function loadStats() {
    setSectionLoading('stats', true); setSectionError('stats', null);
    try { setStats(await adminApi.getStats()); }
    catch (err) { setSectionError('stats', apiErrorMessage(err, "Couldn't load system statistics.")); }
    finally { setSectionLoading('stats', false); }
  }

  async function loadUsers(query: UsersQuery, append = false) {
    setSectionLoading('users', true); setSectionError('users', null);
    try {
      const order = query.sort === 'oldest' || query.sort === 'email' ? 'asc' : 'desc';
      const result = await adminApi.getUsers({ limit: 50, offset: append ? users.length : 0, search: query.search || undefined, role: query.role === 'all' ? undefined : query.role, sort: query.sort === 'email' ? 'email' : 'created_at', order });
      setUsers((prev) => append ? [...prev, ...result.items] : result.items); setUsersTotal(result.total);
    } catch (err) { setSectionError('users', apiErrorMessage(err, "Couldn't load user accounts.")); }
    finally { setSectionLoading('users', false); }
  }

  async function loadJobs(query: JobsQuery, append = false) {
    setSectionLoading('jobs', true); setSectionError('jobs', null);
    try {
      const result = await adminApi.getJobs({ limit: 50, offset: append ? jobs.length : 0, search: query.search || undefined, status: query.status === 'all' ? undefined : query.status, sort: query.sort === 'account' ? 'user_email' : 'created_at', order: query.sort === 'oldest' || query.sort === 'account' ? 'asc' : 'desc' });
      setJobs((prev) => append ? [...prev, ...result.items] : result.items); setJobsTotal(result.total);
    } catch (err) { setSectionError('jobs', apiErrorMessage(err, "Couldn't load operational jobs.")); }
    finally { setSectionLoading('jobs', false); }
  }

  async function loadFeedback(query: FeedbackQuery, append = false) {
    setSectionLoading('feedback', true); setSectionError('feedback', null);
    try {
      const result = await adminApi.getFeedback({ limit: 50, offset: append ? feedback.length : 0, search: query.search || undefined, status: query.status === 'all' ? undefined : query.status, sort: query.sort === 'account' ? 'user_email' : 'created_at', order: query.sort === 'oldest' || query.sort === 'account' ? 'asc' : 'desc' });
      setFeedback((prev) => append ? [...prev, ...result.items] : result.items); setFeedbackTotal(result.total);
    } catch (err) { setSectionError('feedback', apiErrorMessage(err, "Couldn't load user feedback.")); }
    finally { setSectionLoading('feedback', false); }
  }

  async function loadLogs(query: LogsQuery, append = false) {
    setSectionLoading('logs', true); setSectionError('logs', null);
    try {
      const result = await adminApi.getLogs({ limit: 50, offset: append ? events.length : 0, search: query.search || undefined, eventType: query.eventType === 'all' ? undefined : query.eventType, sort: query.sort === 'account' ? 'user_email' : 'created_at', order: query.sort === 'oldest' || query.sort === 'account' ? 'asc' : 'desc' });
      setEvents((prev) => append ? [...prev, ...result.items] : result.items); setEventsTotal(result.total);
    } catch (err) { setSectionError('logs', apiErrorMessage(err, "Couldn't load audit events.")); }
    finally { setSectionLoading('logs', false); }
  }

  async function loadAnnouncements() {
    setSectionLoading('announcements', true); setSectionError('announcements', null);
    try { setAnnouncements(await adminApi.listAnnouncementsAdmin()); }
    catch (err) { setSectionError('announcements', apiErrorMessage(err, "Couldn't load announcements.")); }
    finally { setSectionLoading('announcements', false); }
  }

  function refreshAll() {
    // Intentionally independent: one rejected endpoint never suppresses another section.
    void loadStats(); void loadUsers(usersQuery); void loadJobs(jobsQuery); void loadFeedback(feedbackQuery); void loadLogs(logsQuery); void loadAnnouncements();
  }

  useEffect(() => {
    if (isAdmin) refreshAll();
    // The admin identity is the only initial-load trigger; filters initiate their own scoped request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) {
    return <View style={adminStyles.root}><ScreenContainer maxWidth={800}><View style={adminStyles.headerRow}><IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" /><SectionHeader eyebrow="Restricted" title="Admin" subtitle="Operational controls are limited to the admin account." style={adminStyles.screenHeading} /></View><EmptyState title="Not available" subtitle="This area is only visible to the app's admin account." icon="lock-closed-outline" /></ScreenContainer></View>;
  }

  const refreshing = SECTION_KEYS.some((key) => loading[key]);
  return (
    <View style={adminStyles.root}>
      <ScreenContainer maxWidth={1000}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={adminStyles.scroll}>
          <View style={adminStyles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader eyebrow="Operations" title="Admin console" subtitle="Accounts, activity, feedback, and system health." style={adminStyles.screenHeading} />
            <IconButton icon={refreshing ? 'hourglass-outline' : 'refresh'} accessibilityLabel={refreshing ? 'Refreshing admin data' : 'Refresh all admin data'} onPress={refreshAll} disabled={refreshing} variant="surface" />
          </View>
          <View style={adminStyles.observatoryStatus}>
            <View style={adminStyles.healthSignal}><Ionicons name="ellipse" size={8} color={colors.success} /><Text style={adminStyles.healthLabel}>Healthy systems</Text></View>
            <View style={adminStyles.healthRule} />
            <View style={adminStyles.healthSignal}><Ionicons name="ellipse" size={8} color={colors.danger} /><Text style={adminStyles.healthLabel}>Intervention</Text></View>
          </View>
          <TabChipRow
            style={adminStyles.tabScroller}
            accessibilityLabel="Admin sections"
            options={TABS.map((item) => ({ value: item.key, label: item.label, icon: item.icon }))}
            value={tab}
            onChange={setTab}
          />

          {tab === 'overview' && <SectionGate loading={loading.stats} error={errors.stats} hasData={!!stats} onRetry={() => void loadStats()}>{stats ? <OverviewTab stats={stats} /> : null}</SectionGate>}
          {tab === 'users' && <SectionGate loading={loading.users} error={errors.users} hasData={users.length > 0} onRetry={() => void loadUsers(usersQuery)}><UsersTab users={users} total={usersTotal} query={usersQuery} loading={loading.users} currentAdminEmail={adminUser?.email ?? ''} onQueryChange={(query) => { setUsersQuery(query); void loadUsers(query); }} onLoadMore={() => void loadUsers(usersQuery, true)} onChanged={(updated) => setUsers((prev) => prev.map((user) => user.id === updated.id ? updated : user))} /></SectionGate>}
          {tab === 'jobs' && <SectionGate loading={loading.jobs} error={errors.jobs} hasData={jobs.length > 0} onRetry={() => void loadJobs(jobsQuery)}><JobsTab jobs={jobs} total={jobsTotal} query={jobsQuery} loading={loading.jobs} onQueryChange={(query) => { setJobsQuery(query); void loadJobs(query); }} onLoadMore={() => void loadJobs(jobsQuery, true)} /></SectionGate>}
          {tab === 'feedback' && <SectionGate loading={loading.feedback} error={errors.feedback} hasData={feedback.length > 0} onRetry={() => void loadFeedback(feedbackQuery)}><FeedbackTab items={feedback} total={feedbackTotal} query={feedbackQuery} loading={loading.feedback} onQueryChange={(query) => { setFeedbackQuery(query); void loadFeedback(query); }} onLoadMore={() => void loadFeedback(feedbackQuery, true)} onChanged={(updated) => { const previous = feedback.find((item) => item.id === updated.id); setFeedback((items) => items.map((item) => item.id === updated.id ? updated : item)); if (previous && previous.status !== updated.status) setStats((value) => value ? { ...value, open_feedback_count: Math.max(0, value.open_feedback_count + (updated.status === 'open' ? 1 : -1)) } : value); }} /></SectionGate>}
          {tab === 'announcements' && <SectionGate loading={loading.announcements} error={errors.announcements} hasData={announcements.length > 0} onRetry={() => void loadAnnouncements()}><AnnouncementsTab items={announcements} onCreated={(created) => setAnnouncements((prev) => [created, ...prev])} onDeleted={(id) => setAnnouncements((prev) => prev.filter((item) => item.id !== id))} /></SectionGate>}
          {tab === 'logs' && <SectionGate loading={loading.logs} error={errors.logs} hasData={events.length > 0} onRetry={() => void loadLogs(logsQuery)}><LogsTab events={events} total={eventsTotal} query={logsQuery} loading={loading.logs} onQueryChange={(query) => { setLogsQuery(query); void loadLogs(query); }} onLoadMore={() => void loadLogs(logsQuery, true)} /></SectionGate>}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

function SectionGate({ loading, error, hasData, onRetry, children }: { loading: boolean; error: string | null; hasData: boolean; onRetry: () => void; children: ReactNode }) {
  if (loading && !hasData) return <View accessibilityLiveRegion="polite" style={adminStyles.loadingState}><ActivityIndicator color={colors.cyan} /><Text style={adminStyles.mutedLine}>Loading this section…</Text></View>;
  if (error && !hasData) return <EmptyState icon="cloud-offline-outline" title="This section is unavailable" subtitle={error} actionLabel="Try this section again" onAction={onRetry} />;
  return <>{error ? <View accessibilityLiveRegion="polite" style={adminStyles.sectionError}><Text style={adminStyles.sectionErrorTitle}>Refresh failed; showing the last usable data</Text><View style={adminStyles.sectionErrorRow}><Text style={adminStyles.sectionErrorCopy}>{error}</Text><Button label="Retry" variant="secondary" onPress={onRetry} style={adminStyles.retryButton} /></View></View> : null}{children}</>;
}
