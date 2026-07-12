import { Text, View } from 'react-native';
import type { AdminStats } from '../../../services/api/admin';
import { adminStyles } from '../adminStyles';

/** A minimal sparkline: one bar per day, height relative to that window's busiest day. */
export function SignupSparkline({ days }: { days: AdminStats['signups_last_30_days'] }) {
  if (days.length === 0) {
    return <Text style={adminStyles.mutedLine}>No signups in the last 30 days.</Text>;
  }
  const max = Math.max(...days.map((d) => d.count));
  return (
    <View style={adminStyles.sparkRow}>
      {days.map((d) => (
        <View key={d.date} style={adminStyles.sparkBarTrack}>
          <View style={[adminStyles.sparkBar, { height: `${Math.max(8, (d.count / max) * 100)}%` }]} />
        </View>
      ))}
    </View>
  );
}
