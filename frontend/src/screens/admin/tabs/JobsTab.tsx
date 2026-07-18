import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AdminJob } from '../../../services/api/admin';
import { DataRow, type DataRowTone } from '../../../components/ui/DataRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import { friendlyJobError } from '../../../utils/apiError';
import { adminStyles } from '../adminStyles';
import { timeAgo } from '../adminHelpers';
import { AdminListControls, PagedListFooter } from '../components/AdminListControls';

export type JobsQuery = {
  search: string;
  status: 'all' | 'failed' | 'pending' | 'in_progress' | 'complete' | 'cancelled';
  sort: 'newest' | 'oldest' | 'account';
};

type JobPresentation = { label: string; tone: DataRowTone; icon: keyof typeof Ionicons.glyphMap };

function jobPresentation(status: string): JobPresentation {
  switch (status) {
    case 'failed': return { label: 'Needs attention', tone: 'attention', icon: 'alert-circle' };
    case 'complete': return { label: 'Complete', tone: 'success', icon: 'checkmark-circle' };
    case 'in_progress': return { label: 'In progress', tone: 'active', icon: 'sync' };
    case 'pending': return { label: 'Queued', tone: 'neutral', icon: 'time-outline' };
    case 'cancelled': return { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' };
    default: return { label: status.replace(/_/g, ' '), tone: 'neutral', icon: 'help-circle-outline' };
  }
}

export function JobsTab({ jobs, total, query, loading, onQueryChange, onLoadMore }: {
  jobs: AdminJob[];
  total: number;
  query: JobsQuery;
  loading: boolean;
  onQueryChange: (query: JobsQuery) => void;
  onLoadMore: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(query.search);
  return (
    <>
      <AdminListControls
        search={searchDraft}
        onSearchChange={setSearchDraft}
        onSearch={() => onQueryChange({ ...query, search: searchDraft.trim() })}
        searchPlaceholder="Search job ID, account, or source"
        filter={query.status}
        filters={[{ value: 'all', label: 'All status' }, { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Queued' }, { value: 'in_progress', label: 'Running' }, { value: 'complete', label: 'Complete' }, { value: 'cancelled', label: 'Cancelled' }]}
        onFilterChange={(status) => onQueryChange({ ...query, status })}
        sort={query.sort}
        sorts={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'account', label: 'Account A–Z' }]}
        onSortChange={(sort) => onQueryChange({ ...query, sort })}
        busy={loading && jobs.length === 0}
      />
      {jobs.length === 0 ? (
        <EmptyState motif="signal" title="No matching jobs" subtitle="Try another account, job, source, or status filter." icon="download-outline" />
      ) : (
        <View style={adminStyles.list}>
          {jobs.map((job) => {
            const presentation = jobPresentation(job.status);
            return <DataRow key={job.id} title={job.job_type} status={{ label: presentation.label, tone: presentation.tone }} icon={presentation.icon} subtitle={job.user_email} meta={job.status === 'failed' && job.error_message ? friendlyJobError(job.error_message) : job.source_url ?? '—'} metaTone={job.status === 'failed' ? 'attention' : 'muted'} timestamp={timeAgo(job.created_at)} />;
          })}
          <PagedListFooter shown={jobs.length} total={total} loading={loading} onLoadMore={onLoadMore} />
        </View>
      )}
    </>
  );
}
