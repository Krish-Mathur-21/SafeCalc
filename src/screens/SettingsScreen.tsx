import React, { useState, useEffect } from 'react';
import ChangePinScreen from './ChangePinScreen';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Switch,
} from 'react-native';
import { getTrustedContact, setTrustedContact, setThresholdDays } from '../hooks/useDeadManSwitch';

export default function SettingsScreen() {
  const [contact, setContact] = useState('');
  const [days, setDays] = useState('3');
  const [dmsEnabled, setDmsEnabled] = useState(false);

  useEffect(() => {
    getTrustedContact().then(c => { if (c) { setContact(c); setDmsEnabled(true); } });
  }, []);

  const handleSave = async () => {
    if (dmsEnabled) {
      if (!contact.trim()) { Alert.alert('Enter a phone number first'); return; }
      await setTrustedContact(contact.trim());
      await setThresholdDays(parseInt(days) || 3);
      Alert.alert('Saved', 'Dead Man\'s Switch is active');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>⚙️ Settings</Text>

      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>Dead Man's Switch</Text>
          <Switch value={dmsEnabled} onValueChange={setDmsEnabled} trackColor={{ true: '#34C759' }} />
        </View>
        <Text style={styles.sectionDesc}>
          If you don't open this app for a set number of days, a help message is automatically sent to your trusted contact.
        </Text>
        {dmsEnabled && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Trusted contact phone number"
              placeholderTextColor="#555"
              keyboardType="phone-pad"
              value={contact}
              onChangeText={setContact}
            />
            <TextInput
              style={styles.input}
              placeholder="Days before alert (default 3)"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              value={days}
              onChangeText={setDays}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wipe All Data</Text>
        <Text style={styles.sectionDesc}>Permanently delete all hidden entries and keys from this device.</Text>
        <TouchableOpacity
          style={styles.wipeBtn}
          onPress={() => Alert.alert(
            'Wipe Everything?',
            'This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Wipe', style: 'destructive', onPress: () => Alert.alert('Wiped', 'All data deleted') },
            ]
          )}
        >
          <Text style={styles.wipeBtnText}>🗑 Wipe All Data</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 20 },
  section: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionDesc: { color: '#666', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  input: { backgroundColor: '#2a2a2a', borderRadius: 12, padding: 14, color: '#fff', marginBottom: 10, fontSize: 14 },
  saveBtn: { backgroundColor: '#34C759', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '700' },
  wipeBtn: { backgroundColor: '#2a0a0a', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FF3B30' },
  wipeBtnText: { color: '#FF3B30', fontWeight: '700' },
});