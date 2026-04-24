import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, FlatList } from 'react-native';
import { getJournalEntries, saveJournalEntry, JournalEntry } from '../utils/database';
import CommonButton from '../components/CommonButton';

export default function JournalScreen() {
  const [entry, setEntry] = useState('');
  const [saved, setSaved] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const loadEntries = async () => {
    const data = await getJournalEntries(false);
    setEntries(data);
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const handleSave = async () => {
    if (!entry.trim()) return;
    await saveJournalEntry(entry.trim(), 'neutral', false);
    setEntry('');
    setSaved(true);
    await loadEntries();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📝 Private Journal</Text>
      <Text style={styles.subtitle}>Encrypted. Only visible to you.</Text>
      <TextInput
        style={styles.input}
        placeholder="Write what happened today..."
        placeholderTextColor="#555"
        multiline
        value={entry}
        onChangeText={t => { setEntry(t); setSaved(false); }}
      />
      <CommonButton
        style={styles.btn}
        label={saved ? 'Saved' : 'Save Entry'}
        onPress={handleSave}
      />

      <Text style={styles.sectionTitle}>Saved Entries</Text>
      <FlatList
        scrollEnabled={false}
        data={entries}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.empty}>No entries yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.entryCard}>
            <Text style={styles.entryText}>{item.content}</Text>
            <Text style={styles.entryMeta}>{new Date(item.created_at).toLocaleString('en-IN')}</Text>
          </View>
        )}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#555', fontSize: 13, marginBottom: 20 },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 16, color: '#fff', fontSize: 15,
    minHeight: 200, textAlignVertical: 'top', marginBottom: 16,
  },
  btn: { marginTop: 2 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  empty: { color: '#666', fontSize: 14 },
  entryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  entryText: { color: '#fff', fontSize: 15, lineHeight: 21, marginBottom: 10 },
  entryMeta: { color: '#666', fontSize: 12 },
});