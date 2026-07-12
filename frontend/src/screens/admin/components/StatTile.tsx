import { Text, View } from 'react-native';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { adminStyles } from '../adminStyles';

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <GlassPanel style={adminStyles.statTile}>
      <View style={adminStyles.statTileInner}>
        <Text style={adminStyles.statValue}>{value}</Text>
        <Text style={adminStyles.statLabel}>{label}</Text>
      </View>
    </GlassPanel>
  );
}
