import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';

const RESOURCES = [
  { title: 'iCall (Tata Institute)', number: '9152987821', desc: 'Free counselling helpline' },
  { title: 'Women Helpline', number: '181', desc: 'Govt. 24x7 helpline for women in distress' },
  { title: 'Police Emergency', number: '100', desc: 'Emergency police assistance' },
  { title: 'Women Helpline (All India)', number: '1091', desc: 'All India women helpline' },
  { title: 'NALSA Legal Aid', number: '15100', desc: 'Free legal aid for victims' },
  { title: 'Vandrevala Foundation', number: '1860-2662-345', desc: '24x7 mental health support' },
];

export default function ResourcesScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🆘 Emergency Resources</Text>
      <Text style={styles.subtitle}>All available offline. No internet needed.</Text>
      {RESOURCES.map((r, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>{r.title}</Text>
            <Text style={styles.cardDesc}>{r.desc}</Text>
          </View>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => Linking.openURL(`tel:${r.number}`)}
          >
            <Text style={styles.callNumber}>{r.number}</Text>
            <Text style={styles.callLabel}>Call</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#555', fontSize: 13, marginBottom: 20 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
  },
  cardLeft: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  cardDesc: { color: '#666', fontSize: 12 },
  callBtn: { alignItems: 'center', backgroundColor: '#1c3a1c', borderRadius: 12, padding: 12 },
  callNumber: { color: '#34C759', fontSize: 15, fontWeight: '700' },
  callLabel: { color: '#34C759', fontSize: 11, marginTop: 2 },
});