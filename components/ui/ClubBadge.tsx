import { Image, StyleSheet, Text, View } from 'react-native';
import { useClub } from '../../hooks/useClub';

export default function ClubBadge({ size = 48 }: { size?: number }) {
  const { logoUrl, clubName, primaryColor, secondaryColor } = useClub();
  const letters = clubName
    ? clubName.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
    : 'FC';
  const r = Math.round(size * 0.27);
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: r,
          borderColor: primaryColor,
          backgroundColor: logoUrl ? 'transparent' : primaryColor,
        },
      ]}
    >
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size * 0.72, height: size * 0.72 }}
          resizeMode="contain"
        />
      ) : (
        <Text style={[styles.letters, { color: secondaryColor, fontSize: size * 0.3 }]}>
          {letters}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring:    { borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  letters: { fontWeight: '800' },
});
