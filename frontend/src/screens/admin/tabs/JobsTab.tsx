import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AdminJob } from '../../../services/api/admin';
import { EmptyState } from '../../../components/ui/EmptyState';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { friendlyJobError } from '../../../utils/apiError';
import { colors } from '../../../theme/tokens';
import { adminStyles } from '../adminStyles';
import { timeAgo } from '../adminHelpers';

export function JobsTab({ jobs }: { jobs: AdminJob[] }) {
  if (jobs.length === 0) {
    return <EmptyState title="No jobs yet" subtitle="Downloads and recognitions across every account will show up here." icon="download-outline" />;
  }
  return (
    <View style={adminStyles.list}>
      {jobs.map((job) => (
        <GlassPanel key={job.id} style={adminStyles.row}>
          <View style={adminStyles.rowContent}>
            <View
              style={[
                adminStyles.badge,
                job.status === 'failed' && adminStyles.badgeFailed,
              ]}
            >
              <Ionicons
                name={job.status === 'failed' ? 'alert-circle' : job.status === 'complete' ? 'checkmark-circle' : 'time-outline'}
                size={18}
                color={job.status === 'failed' ? colors.danger : colors.success}
              />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={adminStyles.title}>
                {job.job_type} · {job.status}
              </Text>
              <Text numberOfLines={1} style={adminStyles.subtitle}>
                {job.user_email}
              </Text>
              <Text numberOfLines={1} style={[adminStyles.mutedLine, job.status === 'failed' && { color: colors.danger }]}>
                {job.status === 'failed' && job.error_message ? friendlyJobError(job.error_message) : job.source_url ?? '—'}
              </Text>
            </View>
            <Text style={adminStyles.mutedLine}>{timeAgo(job.created_at)}</Text>
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}
