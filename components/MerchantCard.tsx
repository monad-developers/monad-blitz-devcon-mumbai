import { StyleSheet, Text, View } from 'react-native';
import { Store } from 'lucide-react-native';
import { colors } from '../constants/theme';

export default function MerchantCard({ name, upi }: { name: string; upi: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Store color={colors.primary} size={26} strokeWidth={1.8} />
      </View>
      <View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.upi}>{upi}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: 20, fontWeight: '600' },
  upi: { color: colors.muted, fontSize: 15, marginTop: 4 },
});
