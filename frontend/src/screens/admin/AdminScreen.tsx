import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import * as adminApi from '../../services/api/admin';
import type { AdminEvent, AdminFeedback, AdminJob, AdminStats, AdminUser, Announcement } from '../../services/api/admin';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { apiErrorMessage } from '../../utils/apiError';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

import { adminStyles } from './adminStyles';
import type { Tab } from './adminHelpers';
import { TABS } from './adminHelpers';
import { OverviewTab } from './tabs/OverviewTab';
import { UsersTab } from './tabs/UsersTab';
import { JobsTab } from './tabs/JobsTab';
import { FeedbackTab } from './tabs/FeedbackTab';
import { AnnouncementsTab } from './tabs/AnnouncementsTab';
import { LogsTab } from './tabs/LogsTab';

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
      <View style={adminStyles.root}>
        <ScreenContainer maxWidth={800}>
          <View style={adminStyles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader eyebrow="Restricted" title="Admin" subtitle="Operational controls are limited to the admin account." style={adminStyles.screenHeading} />
          </View>
          <EmptyState title="Not available" subtitle="This area is only visible to the app's admin account." icon="lock-closed-outline" />
        </ScreenContainer>
      </View>
    );
  }

  return (
    <View style={adminStyles.root}>
      <ScreenContainer maxWidth={800}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={adminStyles.scroll}>
          <View style={adminStyles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader eyebrow="Operations" title="Admin console" subtitle="Accounts, activity, feedback, and system health." style={adminStyles.screenHeading} />
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
            contentContainerStyle={adminStyles.tabRow}
            style={adminStyles.tabScroller}
          >
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: tab === t.key }}
                style={[adminStyles.tabChip, tab === t.key && adminStyles.tabChipActive]}
              >
                <Ionicons name={t.icon} size={14} color={tab === t.key ? colors.cyan : colors.textMuted} />
                <Text style={[adminStyles.tabLabel, tab === t.key && adminStyles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View accessibilityLiveRegion="polite" style={adminStyles.loadingState}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={adminStyles.mutedLine}>Refreshing admin data…</Text>
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
