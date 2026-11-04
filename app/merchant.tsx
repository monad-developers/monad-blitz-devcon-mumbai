import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import MerchantCard from '../components/MerchantCard';
import PrimaryButton from '../components/PrimaryButton';
import { colors, RATE } from '../constants/theme';

export default function Merchant() {
  const [amount, setAmount] = useState('500');
  const mon = (Number(amount) || 0) / RATE;

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <ArrowLeft color={colors.text} size={26} />
      </Pressable>

      <Text style={styles.title}>Pay Merchant</Text>

      <MerchantCard name="Demo Store" upi="merchant@upi" />

      <Text style={styles.label}>Enter Amount (INR)</Text>
      <View style={styles.inputBox}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.muted}
          selectionColor={colors.primary}
        />
      </View>

      <View style={styles.conv}>
        <View>
          <Text style={styles.muted}>You Pay</Text>
          <Text style={[styles.muted, { marginTop: 12 }]}>1 MON = ₹{RATE}</Text>
        </View>
        <Text style={styles.mon}>{mon.toFixed(2)} MON</Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Pay with Crypto" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  back: { marginTop: 16, alignSelf: 'flex-start' },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: 20, marginBottom: 28 },
  label: { color: colors.text, fontSize: 18, fontWeight: '500', marginTop: 28, marginBottom: 14 },
  inputBox: {
    height: 80,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 6,
  },
  rupee: { color: colors.text, fontSize: 36, fontWeight: '600' },
  input: { flex: 1, color: colors.text, fontSize: 38, fontWeight: '600', paddingVertical: 0 },
  conv: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 22,
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  muted: { color: colors.muted, fontSize: 16 },
  mon: { color: colors.text, fontSize: 20, fontWeight: '600' },
  footer: { marginTop: 'auto', marginBottom: 24 },
});
