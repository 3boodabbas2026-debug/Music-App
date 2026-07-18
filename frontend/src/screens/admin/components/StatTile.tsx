import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { colors } from '../../../theme/tokens';
import { adminStyles } from '../adminStyles';

export function StatTile({
  label,
  value,
  icon,
  featured = false,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  featured?: boolean;
}) {
  return (
    <GlassPanel style={[adminStyles.statTile, featured && adminStyles.statTileFeatured]}>
      <View style={adminStyles.statTileInner}>
        <View style={adminStyles.statHeading}>
          <View style={[adminStyles.statIcon, featured && adminStyles.statIconFeatured]}>
            <Ionicons name={icon} size={16} color={featured ? colors.gold : colors.cyan} />
          </View>
          <Text style={adminStyles.statLabel}>{label}</Text>
        </View>
        <Text style={[adminStyles.statValue, featured && adminStyles.statValueFeatured]}>{value}</Text>
      </View>
    </GlassPanel>
  );
}
