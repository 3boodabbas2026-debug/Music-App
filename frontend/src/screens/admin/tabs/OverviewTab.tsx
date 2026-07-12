import { Text, View } from 'react-native';
import type { AdminStats } from '../../../services/api/admin';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { adminStyles } from '../adminStyles';
import { formatBytes } from '../adminHelpers';
import { StatTile } from '../components/StatTile';
import { SignupSparkline } from '../components/SignupSparkline';
import { JobsBarChart } from '../components/JobsBarChart';

export function OverviewTab({ stats }: { stats: AdminStats }) {
  return (
    <View>
      <View style={adminStyles.statsGrid}>
        <StatTile label="Users" value={String(stats.total_users)} />
        <StatTile label="Media items" value={String(stats.total_media)} />
        <StatTile label="Storage used" value={formatBytes(stats.storage_bytes)} />
        <StatTile label="Telegram linked" value={String(stats.telegram_linked_users)} />
        <StatTile label="Open feedback" value={String(stats.open_feedback_count)} />
      </View>

      <SectionHeader title="Library breakdown" style={adminStyles.sectionHeader} titleStyle={adminStyles.sectionTitle} />
      <GlassPanel style={adminStyles.panel}>
        <View style={adminStyles.panelBody}>
          <View style={adminStyles.fieldRow}>
            <Text style={adminStyles.fieldLabel}>Audio tracks</Text>
            <Text style={adminStyles.fieldValue}>{stats.audio_count}</Text>
          </View>
          <View style={adminStyles.fieldRow}>
            <Text style={adminStyles.fieldLabel}>Video files</Text>
            <Text style={adminStyles.fieldValue}>{stats.video_count}</Text>
          </View>
          <View style={adminStyles.fieldRow}>
            <Text style={adminStyles.fieldLabel}>Recognition success rate</Text>
            <Text style={adminStyles.fieldValue}>
              {stats.recognition_success_rate === null ? '—' : `${Math.round(stats.recognition_success_rate * 100)}%`}
            </Text>
          </View>
        </View>
      </GlassPanel>

      <SectionHeader title="Jobs by status" style={adminStyles.sectionHeader} titleStyle={adminStyles.sectionTitle} />
      <GlassPanel style={adminStyles.panel}>
        <View style={adminStyles.panelBody}>
          <JobsBarChart jobsByStatus={stats.jobs_by_status} />
        </View>
      </GlassPanel>

      <SectionHeader title="Signups · last 30 days" style={adminStyles.sectionHeader} titleStyle={adminStyles.sectionTitle} />
      <GlassPanel style={adminStyles.panel}>
        <View style={adminStyles.panelBody}>
          <SignupSparkline days={stats.signups_last_30_days} />
        </View>
      </GlassPanel>
    </View>
  );
}
