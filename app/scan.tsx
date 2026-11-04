import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Zap } from 'lucide-react-native';
import { colors } from '../constants/theme';

// Visual placeholder only — tapping the frame simulates a successful scan.
export default function Scan() {
  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <ArrowLeft color={colors.text} size={26} />
      </Pressable>

      <Text style={styles.title}>Scan Merchant QR</Text>
      <Text style={styles.subtitle}>Scan any UPI QR code to pay</Text>

      <Pressable style={styles.box} onPress={() => router.push('/merchant')}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <View style={styles.line} />
        </View>
      </Pressable>

      <View style={styles.flash}>
        <Zap color={colors.text} size={26} strokeWidth={1.8} />
      </View>
    </SafeAreaView>
  );
}

const C = 3; // corner stroke width

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  back: { marginTop: 16, alignSelf: 'flex-start' },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: 24 },
  subtitle: { color: colors.muted, fontSize: 17, textAlign: 'center', marginTop: 10 },
  box: {
    marginTop: 40,
    aspectRatio: 0.93,
    backgroundColor: colors.card,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: '80%', aspectRatio: 1.1, justifyContent: 'center' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: colors.primary },
  tl: { top: 0, left: 0, borderTopWidth: C, borderLeftWidth: C, borderTopLeftRadius: 16 },
  tr: { top: 0, right: 0, borderTopWidth: C, borderRightWidth: C, borderTopRightRadius: 16 },
  bl: { bottom: 0, left: 0, borderBottomWidth: C, borderLeftWidth: C, borderBottomLeftRadius: 16 },
  br: { bottom: 0, right: 0, borderBottomWidth: C, borderRightWidth: C, borderBottomRightRadius: 16 },
  line: {
    height: 3,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  flash: {
    marginTop: 'auto',
    marginBottom: 32,
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
