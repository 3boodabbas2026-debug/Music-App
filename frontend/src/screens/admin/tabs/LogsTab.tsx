import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AdminEvent } from '../../../services/api/admin';
import { DataRow, type DataRowTone } from '../../../components/ui/DataRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import { adminStyles } from '../adminStyles';
import { EVENT_LABELS, timeAgo } from '../adminHelpers';

type EventPresentation = {
  label: string;
  tone: DataRowTone;
  icon: keyof typeof Ionicons.glyphMap;
};

const EVENT_PRESENTATION: Record<string, EventPresentation> = {
  job_failed: { label: 'Needs attention', tone: 'attention', icon: 'alert-circle' },
  job_completed: { label: 'Completed', tone: 'success', icon: 'checkmark-circle' },
  feedback_submitted: { label: 'New', tone: 'active', icon: 'chatbubble-ellipses' },
  feedback_resolved: { label: 'Resolved', tone: 'success', icon: 'checkmark-circle' },
  user_registered: { label: 'New user', tone: 'active', icon: 'person-add' },
  job_created: { label: 'Started', tone: 'active', icon: 'play-circle' },
  telegram_linked: { label: 'Linked', tone: 'success', icon: 'paper-plane' },
  media_deleted: { label: 'Deleted', tone: 'neutral', icon: 'trash-outline' },
  announcement_created: { label: 'Posted', tone: 'active', icon: 'megaphone' },
  admin_user_updated: { label: 'Updated', tone: 'neutral', icon: 'person-outline' },
};

const DEFAULT_PRESENTATION: EventPresentation = {
  label: 'Activity',
  tone: 'neutral',
  icon: 'list-outline',
};

export function LogsTab({ events }: { events: AdminEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="Nothing logged yet" subtitle="Signups, downloads, and other activity will show up here." icon="list-outline" />;
  }
  return (
    <View style={adminStyles.list}>
      {events.map((event) => {
        const presentation = EVENT_PRESENTATION[event.event_type] ?? DEFAULT_PRESENTATION;
        return (
          <DataRow
            key={event.id}
            title={EVENT_LABELS[event.event_type] ?? event.event_type}
            status={{ label: presentation.label, tone: presentation.tone }}
            icon={presentation.icon}
            subtitle={event.user_email ?? undefined}
            meta={event.detail ?? undefined}
            metaTone={presentation.tone === 'attention' ? 'attention' : 'muted'}
            timestamp={timeAgo(event.created_at)}
          />
        );
      })}
    </View>
  );
}
