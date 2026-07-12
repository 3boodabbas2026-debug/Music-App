import { Text, View } from 'react-native';
import { colors, spacing } from '../../../theme/tokens';
import { adminStyles } from '../adminStyles';
import { JOB_STATUS_COLOR } from '../adminHelpers';

/** Horizontal bar chart, same hand-rolled-Views approach as SignupSparkline — no chart library needed for a handful of categories. */
export function JobsBarChart({ jobsByStatus }: { jobsByStatus: Record<string, number> }) {
  const entries = Object.entries(jobsByStatus);
  if (entries.length === 0) {
    return <Text style={adminStyles.mutedLine}>No jobs yet.</Text>;
  }
  const max = Math.max(...entries.map(([, count]) => count));
  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map(([jobStatus, count]) => (
        <View key={jobStatus} style={adminStyles.barRow}>
          <Text style={adminStyles.barLabel}>{jobStatus}</Text>
          <View style={adminStyles.barTrack}>
            <View
              style={[
                adminStyles.barFill,
                {
                  width: `${Math.max(4, (count / max) * 100)}%`,
                  backgroundColor: JOB_STATUS_COLOR[jobStatus] ?? colors.cyan,
                },
              ]}
            />
          </View>
          <Text style={adminStyles.barValue}>{count}</Text>
        </View>
      ))}
    </View>
  );
}
