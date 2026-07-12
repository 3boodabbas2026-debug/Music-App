import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AdminJob } from '../../../services/api/admin';
import { DataRow, type DataRowTone } from '../../../components/ui/DataRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import { friendlyJobError } from '../../../utils/apiError';
import { adminStyles } from '../adminStyles';
import { timeAgo } from '../adminHelpers';

type JobPresentation = {
  label: string;
  tone: DataRowTone;
  icon: keyof typeof Ionicons.glyphMap;
};

function jobPresentation(status: string): JobPresentation {
  switch (status) {
    case 'failed':
      return { label: 'Needs attention', tone: 'attention', icon: 'alert-circle' };
    case 'complete':
      return { label: 'Complete', tone: 'success', icon: 'checkmark-circle' };
    case 'in_progress':
      return { label: 'In progress', tone: 'active', icon: 'sync' };
    case 'pending':
      return { label: 'Queued', tone: 'neutral', icon: 'time-outline' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' };
    default:
      return {
        label: status.replace(/_/g, ' '),
        tone: 'neutral',
        icon: 'help-circle-outline',
      };
  }
}

export function JobsTab({ jobs }: { jobs: AdminJob[] }) {
  if (jobs.length === 0) {
    return <EmptyState title="No jobs yet" subtitle="Downloads and recognitions across every account will show up here." icon="download-outline" />;
  }
  return (
    <View style={adminStyles.list}>
      {jobs.map((job) => {
        const presentation = jobPresentation(job.status);
        return (
          <DataRow
            key={job.id}
            title={job.job_type}
            status={{ label: presentation.label, tone: presentation.tone }}
            icon={presentation.icon}
            subtitle={job.user_email}
            meta={job.status === 'failed' && job.error_message ? friendlyJobError(job.error_message) : job.source_url ?? '—'}
            metaTone={job.status === 'failed' ? 'attention' : 'muted'}
            timestamp={timeAgo(job.created_at)}
          />
        );
      })}
    </View>
  );
}
