import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Clock, House, Info, Link, ScanQrCode, Settings, Wallet } from 'lucide-react-native';
import WalletCard from '../components/WalletCard';
import PrimaryButton from '../components/PrimaryButton';
import { colors } from '../constants/theme';

export default function Home() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Link color={colors.primary} size={28} strokeWidth={2.2} />
            <Text style={styles.title}>UPIChain</Text>
          </View>
          <View style={styles.network}>
            <View style={styles.dot} />
            <Text style={styles.networkText}>Monad Testnet</Text>
          </View>
        </View>

        <WalletCard mon="12.50" inr="6,250.00" />

        <View style={styles.actions}>
          <PrimaryButton title="Scan UPI QR" icon={ScanQrCode} onPress={() => router.push('/scan')} />
          <PrimaryButton title="Connect Wallet" icon={Wallet} variant="secondary" />
        </View>

        <View style={styles.rate}>
          <Info color={colors.muted} size={20} />
          <Text style={styles.rateText}>
            1 MON = ₹500 <Text style={{ color: colors.muted }}>(Demo Rate)</Text>
          </Text>
        </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        <Tab icon={House} label="Home" active />
        <Tab icon={Clock} label="Activity" />
        <Tab icon={Settings} label="Settings" />
      </SafeAreaView>
    </SafeAreaView>
  );
}

function Tab({ icon: Icon, label, active }: { icon: typeof House; label: string; active?: boolean }) {
  const color = active ? colors.primary : colors.muted;
  return (
    <View style={styles.tab}>
      <Icon color={color} fill={active ? color : 'none'} size={26} strokeWidth={1.8} />
      <Text style={[styles.tabText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  network: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  networkText: { color: colors.text, fontSize: 13 },
  actions: { gap: 16, marginTop: 28 },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 28,
  },
  rateText: { color: colors.text, fontSize: 15 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingTop: 14,
    paddingBottom: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 6, paddingBottom: 6 },
  tabText: { fontSize: 13 },
});
