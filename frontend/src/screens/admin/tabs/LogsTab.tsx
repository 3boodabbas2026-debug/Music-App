import { Text, View } from 'react-native';

import type { AdminEvent } from '../../../services/api/admin';
import { EmptyState } from '../../../components/ui/EmptyState';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { adminStyles } from '../adminStyles';
import { EVENT_LABELS, timeAgo } from '../adminHelpers';

export function LogsTab({ events }: { events: AdminEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="Nothing logged yet" subtitle="Signups, downloads, and other activity will show up here." icon="list-outline" />;
  }
  return (
    <View style={adminStyles.list}>
      {events.map((event) => (
        <GlassPanel key={event.id} style={adminStyles.row}>
          <View style={adminStyles.rowContent}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={adminStyles.title}>
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </Text>
              {event.user_email && (
                <Text numberOfLines={1} style={adminStyles.subtitle}>
                  {event.user_email}
                </Text>
              )}
              {event.detail && (
                <Text numberOfLines={1} style={adminStyles.mutedLine}>
                  {event.detail}
                </Text>
              )}
            </View>
            <Text style={adminStyles.mutedLine}>{timeAgo(event.created_at)}</Text>
          </View>
        </GlassPanel>
      ))}
    </View>
  );
}
