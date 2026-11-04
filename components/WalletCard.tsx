import { StyleSheet, Text, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { colors } from '../constants/theme';

export default function WalletCard({ mon, inr }: { mon: string; inr: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Wallet color={colors.text} size={30} strokeWidth={1.8} />
      </View>
      <View>
        <Text style={styles.label}>Wallet Balance</Text>
        <Text style={styles.amount}>{mon} MON</Text>
        <Text style={styles.inr}>≈ ₹{inr}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.muted, fontSize: 15 },
  amount: { color: colors.text, fontSize: 32, fontWeight: '700', marginVertical: 4 },
  inr: { color: colors.muted, fontSize: 17 },
});
