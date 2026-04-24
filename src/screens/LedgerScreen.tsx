import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import {
  addDemoCash,
  getDemoSummaryByPhone,
  getProfileByPhone,
  getDemoTransactions,
  spendDemoCash,
  upsertProfileByPhone,
  type DemoSummary,
  type DemoTransaction,
  type FinancialInstitution,
  type UserProfile,
} from '../utils/demoBankApi';
import {
  addEntry,
  deleteEntry,
  getEntries,
  getGoals,
  GoalPeriod,
  upsertGoalByPeriod,
} from '../utils/database';
import SecurityTab from '../components/SecurityTab';
import { usePanicWipe } from '../hooks/usePanicWipe';
import { getCurrentUserPhone } from '../utils/userSession';

interface Props {
  mode: 'real' | 'duress';
  onPanic: () => void;
  onForceDecoy: () => void;
}

type EntryRow = {
  id: number;
  amount: number;
  note: string;
  category: string;
  stash_location: string;
  created_at: string;
};

type GoalState = Record<GoalPeriod, { label: string; target: number } | null>;

const CATEGORIES = ['general', 'food', 'transport', 'utilities', 'health', 'education', 'emergency'];
const CATEGORY_COLORS: Record<string, string> = {
  general: '#6EA8FE',
  food: '#34C759',
  transport: '#5AC8FA',
  utilities: '#FF9F0A',
  health: '#FF375F',
  education: '#FFD60A',
  emergency: '#BF5AF2',
};

export default function LedgerScreen({ mode, onPanic, onForceDecoy }: Props) {
  const isDecoy = mode === 'duress';

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [goals, setGoals] = useState<GoalState>({ daily: null, weekly: null, annually: null });
  const [activeTab, setActiveTab] = useState<'funds' | 'bank' | 'goal' | 'security'>('funds');

  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('general');
  const [stashLocation, setStashLocation] = useState('');
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);
  const [bankSummary, setBankSummary] = useState<DemoSummary | null>(null);
  const [bankTransactions, setBankTransactions] = useState<DemoTransaction[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [bankError, setBankError] = useState('');
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [institutions, setInstitutions] = useState<FinancialInstitution[]>([]);
  const [activeInstitutionId, setActiveInstitutionId] = useState<string | null>(null);
  const [showInstitutionModal, setShowInstitutionModal] = useState(false);
  const [institutionName, setInstitutionName] = useState('');
  const [institutionType, setInstitutionType] = useState('');
  const [institutionMask, setInstitutionMask] = useState('');
  const [showBankAction, setShowBankAction] = useState(false);
  const [bankAction, setBankAction] = useState<'credit' | 'debit'>('credit');
  const [bankAmount, setBankAmount] = useState('');
  const [bankNote, setBankNote] = useState('');

  usePanicWipe({ onPanic, isInsideHiddenModule: !isDecoy });

  const load = useCallback(async () => {
    const [rows, g] = await Promise.all([getEntries(isDecoy), getGoals(isDecoy)]);
    setEntries(rows as EntryRow[]);
    setGoals({
      daily: g.daily ? { label: g.daily.label, target: g.daily.target } : null,
      weekly: g.weekly ? { label: g.weekly.label, target: g.weekly.target } : null,
      annually: g.annually ? { label: g.annually.label, target: g.annually.target } : null,
    });
  }, [isDecoy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let mounted = true;
    const loadPhone = async () => {
      const phone = await getCurrentUserPhone();
      if (mounted) setCurrentPhone(phone);
    };
    void loadPhone();
    return () => {
      mounted = false;
    };
  }, []);

  const loadBankProfile = useCallback(async () => {
    if (!currentPhone || isDecoy) {
      setProfileData(null);
      setInstitutions([]);
      setActiveInstitutionId(null);
      return;
    }

    setProfileLoading(true);
    try {
      const data = await getProfileByPhone(currentPhone);
      const profile = (data?.profile || {}) as UserProfile;
      const nextInstitutions = Array.isArray(profile.institutions) ? profile.institutions : [];
      setProfileData(profile);
      setInstitutions(nextInstitutions);
      setActiveInstitutionId(profile.activeInstitutionId || nextInstitutions[0]?.id || null);
    } catch {
      setProfileData(null);
      setInstitutions([]);
      setActiveInstitutionId(null);
    } finally {
      setProfileLoading(false);
    }
  }, [currentPhone, isDecoy]);

  const refreshBankAccount = useCallback(async () => {
    if (isDecoy) {
      setBankSummary(null);
      setBankTransactions([]);
      setBankError('');
      return;
    }

    if (!currentPhone) {
      setBankSummary(null);
      setBankTransactions([]);
      setBankError('Register a phone number to load the demo bank account.');
      return;
    }

    setBankLoading(true);
    setBankError('');

    try {
      const [summary, transactions] = await Promise.all([
        getDemoSummaryByPhone(currentPhone),
        getDemoTransactions(currentPhone),
      ]);
      setBankSummary(summary);
      setBankTransactions(transactions.slice(0, 5));
    } catch (error: any) {
      setBankError(error?.message || 'Failed to load demo bank account.');
    } finally {
      setBankLoading(false);
    }
  }, [currentPhone, isDecoy]);

  useEffect(() => {
    void refreshBankAccount();
  }, [refreshBankAccount]);

  useEffect(() => {
    void loadBankProfile();
  }, [loadBankProfile]);

  const saveBankProfile = useCallback(
    async (nextInstitutions: FinancialInstitution[], nextActiveId: string | null) => {
      if (!currentPhone) return;
      const baseProfile = profileData || { phone: currentPhone };
      const payload: UserProfile = {
        ...baseProfile,
        phone: currentPhone,
        institutions: nextInstitutions,
        activeInstitutionId: nextActiveId || undefined,
        updatedAt: new Date().toISOString(),
      };

      await upsertProfileByPhone(currentPhone, payload);
      setProfileData(payload);
      setInstitutions(nextInstitutions);
      setActiveInstitutionId(nextActiveId);
    },
    [currentPhone, profileData]
  );

  const handleAddInstitution = useCallback(async () => {
    const cleanedName = institutionName.trim();
    if (!cleanedName) {
      Alert.alert('Institution required', 'Enter a bank or financial institution name.');
      return;
    }

    if (!currentPhone) {
      Alert.alert('Account missing', 'Register your phone number first.');
      return;
    }

    const id = `inst_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const next: FinancialInstitution = {
      id,
      name: cleanedName,
      accountType: institutionType.trim() || undefined,
      accountMask: institutionMask.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveBankProfile([...institutions, next], id);
      setInstitutionName('');
      setInstitutionType('');
      setInstitutionMask('');
      setShowInstitutionModal(false);
      Alert.alert('Institution added', `${cleanedName} is now linked to your profile.`);
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Could not save institution right now.');
    }
  }, [currentPhone, institutionMask, institutionName, institutionType, institutions, saveBankProfile]);

  const handleSelectInstitution = useCallback(
    async (id: string) => {
      try {
        await saveBankProfile(institutions, id);
      } catch {
        Alert.alert('Update failed', 'Could not switch active institution right now.');
      }
    },
    [institutions, saveBankProfile]
  );

  const handleBankAction = useCallback(
    async (action: 'credit' | 'debit') => {
      if (isDecoy) {
        Alert.alert('Demo bank hidden', 'Switch to the real ledger to view the live backend account.');
        return;
      }

      if (!currentPhone) {
        Alert.alert('Account missing', 'Register your phone number first.');
        return;
      }

      const parsedAmount = Number.parseFloat(bankAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        Alert.alert('Invalid amount', 'Enter a valid amount for the demo bank action.');
        return;
      }

      setBankLoading(true);
      try {
        const selectedInstitution = institutions.find((item) => item.id === activeInstitutionId) || null;
        const institutionTag = selectedInstitution ? `[${selectedInstitution.name}]` : '';
        const noteText = bankNote.trim();
        const scopedNote = institutionTag
          ? noteText
            ? `${institutionTag} ${noteText}`
            : institutionTag
          : noteText;

        if (action === 'credit') {
          await addDemoCash(currentPhone, parsedAmount, 'cash_deposit', scopedNote);
        } else {
          await spendDemoCash(currentPhone, parsedAmount, 'general', scopedNote);
        }

        setShowBankAction(false);
        setBankAmount('');
        setBankNote('');
        await refreshBankAccount();
        Alert.alert('Demo bank updated', action === 'credit' ? 'Cash added to the backend account.' : 'Cash spent from the backend account.');
      } catch (error: any) {
        Alert.alert('Bank action failed', error?.message || 'Could not update the backend account.');
      } finally {
        setBankLoading(false);
      }
    },
    [activeInstitutionId, bankAmount, bankNote, currentPhone, institutions, isDecoy, refreshBankAccount]
  );

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);
  const insight = useMemo(() => {
    if (entries.length === 0) {
      return {
        title: isDecoy ? 'No budget signal yet' : 'No savings pattern yet',
        detail: isDecoy
          ? 'Add a few expenses to unlock trend intelligence.'
          : 'Add a few stash entries to unlock trend intelligence.',
        action: isDecoy ? 'Track 3+ entries to get forecasting.' : 'Track 3+ entries to get forecasting.',
        tone: '#5AC8FA',
        badge: 'Warming up',
      };
    }

    const categoryMap = entries.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.amount;
      return acc;
    }, {});

    const topCategory = Object.entries(categoryMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const recent7 = entries
      .filter((item) => now - new Date(item.created_at).getTime() <= 7 * oneDay)
      .reduce((sum, item) => sum + item.amount, 0);
    const previous7 = entries
      .filter((item) => {
        const age = now - new Date(item.created_at).getTime();
        return age > 7 * oneDay && age <= 14 * oneDay;
      })
      .reduce((sum, item) => sum + item.amount, 0);

    const trendRatio = previous7 > 0 ? (recent7 - previous7) / previous7 : recent7 > 0 ? 1 : 0;
    const trendPct = Math.round(Math.abs(trendRatio) * 100);
    const avgEntry = total / Math.max(1, entries.length);

    const trendText =
      trendRatio > 0.15
        ? `${trendPct}% up vs last week`
        : trendRatio < -0.15
          ? `${trendPct}% down vs last week`
          : 'stable vs last week';

    if (trendRatio > 0.2) {
      return {
        title: isDecoy ? 'Expense velocity rising' : 'Stash velocity rising',
        detail: `${topCategory} is leading. Current trend is ${trendText}.`,
        action: isDecoy
          ? `Set a cap alert for ${topCategory} and keep average spend under Rs ${Math.round(avgEntry)}.`
          : `Split ${topCategory} into smaller drops and keep average stash under Rs ${Math.round(avgEntry)}.`,
        tone: '#FF9F0A',
        badge: 'Trend alert',
      };
    }

    if (trendRatio < -0.2) {
      return {
        title: isDecoy ? 'Budget control improving' : 'Stash discipline improving',
        detail: `Momentum is ${trendText}. Best signal: ${topCategory}.`,
        action: isDecoy
          ? 'Lock this pattern for 7 more days to stabilize cash flow.'
          : 'Lock this pattern for 7 more days to build stealth reserves.',
        tone: '#34C759',
        badge: 'Strong signal',
      };
    }

    return {
      title: isDecoy ? 'Balanced spending profile' : 'Balanced stash profile',
      detail: `${topCategory} remains dominant with a ${trendText} pattern.`,
      action: isDecoy
        ? 'Try one micro-adjustment this week and compare the trend card.'
        : 'Try one micro-adjustment this week and compare the trend card.',
      tone: '#6EA8FE',
      badge: 'Steady state',
    };
  }, [entries, isDecoy, total]);

  const categoryTotals = useMemo(() => {
    return CATEGORIES.reduce<Record<string, number>>((acc, currentCategory) => {
      acc[currentCategory] = entries
        .filter((entry) => entry.category === currentCategory)
        .reduce((sum, entry) => sum + entry.amount, 0);
      return acc;
    }, {});
  }, [entries]);
  const maxCategoryTotal = useMemo(() => Math.max(1, ...Object.values(categoryTotals)), [categoryTotals]);
  const hasCategoryData = useMemo(() => Object.values(categoryTotals).some((value) => value > 0), [categoryTotals]);

  const handleAdd = async () => {
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid positive amount.');
      return;
    }

    await addEntry(parsedAmount, note.trim(), category, stashLocation.trim(), isDecoy);
    setAmount('');
    setNote('');
    setCategory('general');
    setStashLocation('');
    setShowAdd(false);
    await load();
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete entry', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(id);
          await load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{isDecoy ? 'Expense Ledger' : 'Safe Ledger'}</Text>
        <TouchableOpacity onPress={onPanic} style={styles.lockNowBtn}>
          <Text style={styles.lockNowText}>Lock</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{isDecoy ? 'Total Spent' : 'Total Stashed'}</Text>
        <Text style={styles.balanceAmount}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
      </View>

      <View style={styles.tabs}>
        <TabButton label="Funds" active={activeTab === 'funds'} onPress={() => setActiveTab('funds')} />
        <TabButton label="Bank" active={activeTab === 'bank'} onPress={() => setActiveTab('bank')} />
        <TabButton label="Goals" active={activeTab === 'goal'} onPress={() => setActiveTab('goal')} />
        <TabButton label="Security" active={activeTab === 'security'} onPress={() => setActiveTab('security')} />
      </View>

      {activeTab === 'funds' ? (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            <View>
              <View style={styles.insightCard}>
                <View style={[styles.insightAccent, { backgroundColor: insight.tone }]} />
                <View style={styles.insightTopRow}>
                  <Text style={styles.insightLabel}>Insight Engine</Text>
                  <Text style={[styles.insightBadge, { borderColor: insight.tone, color: insight.tone }]}>{insight.badge}</Text>
                </View>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightDetail}>{insight.detail}</Text>
                <Text style={styles.insightAction}>{insight.action}</Text>
              </View>

              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Savings by Subtype</Text>
                <Text style={styles.chartSubtitle}>Each category uses an individual color.</Text>

                {hasCategoryData ? (
                  CATEGORIES.map((currentCategory) => {
                    const value = categoryTotals[currentCategory] || 0;
                    const width = `${(value / maxCategoryTotal) * 100}%` as `${number}%`;

                    return (
                      <View key={currentCategory} style={styles.chartRow}>
                        <View style={styles.chartLabelRow}>
                          <View
                            style={[
                              styles.chartDot,
                              { backgroundColor: CATEGORY_COLORS[currentCategory] || '#34C759' },
                            ]}
                          />
                          <Text style={styles.chartLabel}>{currentCategory}</Text>
                          <Text style={styles.chartValue}>
                            ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Text>
                        </View>
                        <View style={styles.chartTrack}>
                          <View
                            style={[
                              styles.chartFill,
                              {
                                width,
                                backgroundColor: CATEGORY_COLORS[currentCategory] || '#34C759',
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.chartEmpty}>Add entries to view subtype distribution.</Text>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No entries yet. Tap + to add.</Text>}
          renderItem={({ item }) => (
            <View style={styles.entryCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle}>{item.note || item.category}</Text>
                <Text style={styles.entryMeta}>
                  {item.category} • {new Date(item.created_at).toLocaleDateString('en-IN')}
                </Text>
                {!isDecoy && item.stash_location ? (
                  <Text style={styles.stashText}>📍 {item.stash_location}</Text>
                ) : null}
              </View>
              <View style={styles.entryRight}>
                <Text style={styles.entryAmount}>₹{item.amount.toFixed(2)}</Text>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      ) : activeTab === 'bank' ? (
        <BankTab
          isDecoy={isDecoy}
          loading={bankLoading}
          profileLoading={profileLoading}
          error={bankError}
          phone={currentPhone}
          summary={bankSummary}
          transactions={bankTransactions}
          institutions={institutions}
          activeInstitutionId={activeInstitutionId}
          onRefresh={refreshBankAccount}
          onSelectInstitution={handleSelectInstitution}
          onOpenAddInstitution={() => setShowInstitutionModal(true)}
          onOpenAction={(action) => {
            setBankAction(action);
            setShowBankAction(true);
          }}
        />
      ) : activeTab === 'goal' ? (
        <GoalTab
          goals={goals}
          isDecoy={isDecoy}
          onSave={async (nextGoals) => {
            await Promise.all([
              upsertGoalByPeriod(nextGoals.daily.label, nextGoals.daily.target, isDecoy, 'daily'),
              upsertGoalByPeriod(nextGoals.weekly.label, nextGoals.weekly.target, isDecoy, 'weekly'),
              upsertGoalByPeriod(nextGoals.annually.label, nextGoals.annually.target, isDecoy, 'annually'),
            ]);
            await load();
            Alert.alert('Saved', 'Goals updated successfully.');
          }}
        />
      ) : (
        <SecurityTab onPanic={onPanic} />
      )}

      {activeTab !== 'security' ? (
        <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Entry</Text>

            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />

            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor="#666"
            />

            {!isDecoy ? (
              <TextInput
                style={styles.input}
                value={stashLocation}
                onChangeText={setStashLocation}
                placeholder="Hidden location (optional)"
                placeholderTextColor="#666"
              />
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, category === c && styles.chipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showBankAction} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {bankAction === 'credit' ? 'Add Demo Cash' : 'Spend Demo Cash'}
            </Text>

            <TextInput
              style={styles.input}
              value={bankAmount}
              onChangeText={setBankAmount}
              placeholder="Amount"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />

            <TextInput
              style={styles.input}
              value={bankNote}
              onChangeText={setBankNote}
              placeholder="Note (optional)"
              placeholderTextColor="#666"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowBankAction(false)} disabled={bankLoading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => void handleBankAction(bankAction)}
                disabled={bankLoading}
              >
                <Text style={styles.saveBtnText}>{bankLoading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showInstitutionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Financial Institution</Text>

            <TextInput
              style={styles.input}
              value={institutionName}
              onChangeText={setInstitutionName}
              placeholder="Institution name (e.g. HDFC, SBI, PayPal)"
              placeholderTextColor="#666"
            />

            <TextInput
              style={styles.input}
              value={institutionType}
              onChangeText={setInstitutionType}
              placeholder="Type (Bank, Wallet, Credit Card)"
              placeholderTextColor="#666"
            />

            <TextInput
              style={styles.input}
              value={institutionMask}
              onChangeText={setInstitutionMask}
              placeholder="Account last 4 digits (optional)"
              placeholderTextColor="#666"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowInstitutionModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => void handleAddInstitution()}>
                <Text style={styles.saveBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function GoalTab({
  goals,
  isDecoy,
  onSave,
}: {
  goals: GoalState;
  isDecoy: boolean;
  onSave: (goals: {
    daily: { label: string; target: number };
    weekly: { label: string; target: number };
    annually: { label: string; target: number };
  }) => void;
}) {
  const [daily, setDaily] = useState(goals.daily?.target?.toString() ?? '');
  const [weekly, setWeekly] = useState(goals.weekly?.target?.toString() ?? '');
  const [annually, setAnnually] = useState(goals.annually?.target?.toString() ?? '');

  useEffect(() => {
    setDaily(goals.daily?.target?.toString() ?? '');
    setWeekly(goals.weekly?.target?.toString() ?? '');
    setAnnually(goals.annually?.target?.toString() ?? '');
  }, [goals]);

  const save = () => {
    const dailyValue = Number.parseFloat(daily) || 0;
    const weeklyValue = Number.parseFloat(weekly) || 0;
    const annualValue = Number.parseFloat(annually) || 0;

    if (dailyValue < 0 || weeklyValue < 0 || annualValue < 0) {
      Alert.alert('Invalid goals', 'Goal values cannot be negative.');
      return;
    }

    onSave({
      daily: { label: isDecoy ? 'Daily Budget' : 'Daily Savings', target: dailyValue },
      weekly: { label: isDecoy ? 'Weekly Budget' : 'Weekly Savings', target: weeklyValue },
      annually: { label: isDecoy ? 'Annual Budget' : 'Annual Savings', target: annualValue },
    });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.goalHint}>{isDecoy ? 'Set budget goals' : 'Set savings goals'}</Text>

      <Text style={styles.goalLabel}>Daily</Text>
      <TextInput
        style={styles.input}
        value={daily}
        onChangeText={setDaily}
        placeholder="Daily target"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />

      <Text style={styles.goalLabel}>Weekly</Text>
      <TextInput
        style={styles.input}
        value={weekly}
        onChangeText={setWeekly}
        placeholder="Weekly target"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />

      <Text style={styles.goalLabel}>Annual</Text>
      <TextInput
        style={styles.input}
        value={annually}
        onChangeText={setAnnually}
        placeholder="Annual target"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={save}>
        <Text style={styles.saveBtnText}>Save Goals</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function BankTab({
  isDecoy,
  loading,
  profileLoading,
  error,
  phone,
  summary,
  transactions,
  institutions,
  activeInstitutionId,
  onRefresh,
  onSelectInstitution,
  onOpenAddInstitution,
  onOpenAction,
}: {
  isDecoy: boolean;
  loading: boolean;
  profileLoading: boolean;
  error: string;
  phone: string | null;
  summary: DemoSummary | null;
  transactions: DemoTransaction[];
  institutions: FinancialInstitution[];
  activeInstitutionId: string | null;
  onRefresh: () => void;
  onSelectInstitution: (id: string) => void;
  onOpenAddInstitution: () => void;
  onOpenAction: (action: 'credit' | 'debit') => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.bankScroll}>
      <View style={styles.bankCard}>
        <View style={styles.bankHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bankLabel}>Demo Bank Account</Text>
            <Text style={styles.bankSubLabel}>
              {isDecoy
                ? 'Hidden while the decoy ledger is active.'
                : phone
                  ? `Backend-linked account for ${phone}`
                  : 'Register a phone number to load the backend account.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.bankRefreshBtn} onPress={onRefresh}>
            <Text style={styles.bankRefreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.bankLoadingRow}>
            <ActivityIndicator color="#34C759" />
            <Text style={styles.bankLoadingText}>Loading backend account...</Text>
          </View>
        ) : summary ? (
          <>
            <Text style={styles.bankBalanceLabel}>Available Balance</Text>
            <Text style={styles.bankBalance}>₹{summary.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            <View style={styles.bankStatsRow}>
              <View style={styles.bankStat}>
                <Text style={styles.bankStatValue}>₹{summary.totalCredited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                <Text style={styles.bankStatLabel}>Credited</Text>
              </View>
              <View style={styles.bankStat}>
                <Text style={styles.bankStatValue}>₹{summary.totalDebited.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                <Text style={styles.bankStatLabel}>Debited</Text>
              </View>
              <View style={styles.bankStat}>
                <Text style={styles.bankStatValue}>{summary.transactionCount}</Text>
                <Text style={styles.bankStatLabel}>Txns</Text>
              </View>
            </View>
            <View style={styles.bankActionRow}>
              <TouchableOpacity style={styles.bankCreditBtn} onPress={() => onOpenAction('credit')}>
                <Text style={styles.bankActionText}>Add Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bankDebitBtn} onPress={() => onOpenAction('debit')}>
                <Text style={styles.bankActionText}>Spend Cash</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.bankEmpty}>{error || 'No backend account loaded yet.'}</Text>
        )}

        {error && summary ? <Text style={styles.bankError}>{error}</Text> : null}
      </View>

      {!isDecoy ? (
        <View style={styles.bankCard}>
          <View style={styles.bankInstitutionsHeader}>
            <Text style={styles.bankSectionTitle}>Linked Institutions</Text>
            <TouchableOpacity style={styles.bankRefreshBtn} onPress={onOpenAddInstitution}>
              <Text style={styles.bankRefreshText}>Add</Text>
            </TouchableOpacity>
          </View>

          {profileLoading ? (
            <View style={styles.bankLoadingRow}>
              <ActivityIndicator color="#34C759" />
              <Text style={styles.bankLoadingText}>Loading institutions...</Text>
            </View>
          ) : institutions.length > 0 ? (
            <View style={styles.bankInstitutionsWrap}>
              {institutions.map((institution) => {
                const active = institution.id === activeInstitutionId;
                return (
                  <TouchableOpacity
                    key={institution.id}
                    style={[styles.bankInstitutionChip, active && styles.bankInstitutionChipActive]}
                    onPress={() => onSelectInstitution(institution.id)}
                  >
                    <Text style={[styles.bankInstitutionName, active && styles.bankInstitutionNameActive]}>
                      {institution.name}
                    </Text>
                    <Text style={[styles.bankInstitutionMeta, active && styles.bankInstitutionMetaActive]}>
                      {institution.accountType || 'Institution'}
                      {institution.accountMask ? ` • ****${institution.accountMask}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.bankEmpty}>No institution linked yet. Tap Add to link your bank, wallet, or card.</Text>
          )}
        </View>
      ) : null}

      {!isDecoy ? (
        <View style={styles.bankCard}>
          <Text style={styles.bankSectionTitle}>Recent Transactions</Text>
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <View key={transaction.id} style={styles.bankTxCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bankTxTitle}>{transaction.note || transaction.category}</Text>
                  <Text style={styles.bankTxMeta}>
                    {transaction.category} • {new Date(transaction.createdAt).toLocaleDateString('en-IN')}
                  </Text>
                </View>
                <Text style={[styles.bankTxAmount, transaction.type === 'debit' && styles.bankTxDebit]}>
                  {transaction.type === 'credit' ? '+' : '-'}₹{transaction.amount.toFixed(2)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.bankEmpty}>No transactions yet.</Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  lockNowBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lockNowText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  identityBar: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: -2,
    backgroundColor: '#112315',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#245f36',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  identityBarText: { color: '#84D7A0', fontSize: 12 },
  balanceCard: {
    backgroundColor: '#151515',
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232323',
    padding: 16,
  },
  balanceLabel: { color: '#8f8f8f', fontSize: 13, marginBottom: 4 },
  balanceAmount: { color: '#34C759', fontSize: 30, fontWeight: '700' },
  tabs: {
    marginHorizontal: 16,
    flexDirection: 'row',
    backgroundColor: '#151515',
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: '#2a2a2a' },
  tabText: { color: '#7e7e7e', fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  listContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  chartCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232323',
    padding: 12,
    marginBottom: 10,
  },
  insightCard: {
    backgroundColor: '#101417',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#21303b',
    padding: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  insightAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  insightTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightLabel: {
    color: '#9eb6c8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  insightBadge: {
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  insightTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  insightDetail: {
    color: '#c2cfda',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  insightAction: {
    color: '#8ea5b6',
    fontSize: 12,
    lineHeight: 18,
  },
  chartTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  chartSubtitle: { color: '#767676', fontSize: 12, marginBottom: 10 },
  chartRow: { marginBottom: 10 },
  chartLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  chartDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  chartLabel: { color: '#bdbdbd', textTransform: 'capitalize', fontSize: 12, flex: 1 },
  chartValue: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chartTrack: { width: '100%', height: 8, borderRadius: 5, backgroundColor: '#2a2a2a', overflow: 'hidden' },
  chartFill: { height: 8, borderRadius: 5, minWidth: 2 },
  chartEmpty: { color: '#666', fontSize: 12 },
  emptyText: { color: '#666', textAlign: 'center' },
  entryCard: {
    backgroundColor: '#151515',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 8,
    padding: 12,
    flexDirection: 'row',
  },
  entryTitle: { color: '#fff', fontSize: 15, marginBottom: 2 },
  entryMeta: { color: '#777', fontSize: 12 },
  stashText: { color: '#FFB340', fontSize: 12, marginTop: 4 },
  entryRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  entryAmount: { color: '#34C759', fontSize: 15, fontWeight: '700' },
  deleteText: { color: '#FF6B6B', fontSize: 12 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: { color: '#000', fontSize: 30, marginTop: -2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#151515',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderTopWidth: 1,
    borderColor: '#242424',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 14 },
  input: {
    backgroundColor: '#1f1f1f',
    color: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#232323',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#34C759' },
  chipText: { color: '#9a9a9a', fontSize: 12 },
  chipTextActive: { color: '#000', fontWeight: '700' },
  modalButtons: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: { color: '#bbb', fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  saveBtnText: { color: '#000', fontWeight: '700' },
  goalHint: { color: '#888', marginBottom: 12 },
  goalLabel: { color: '#cfcfcf', fontSize: 13, marginBottom: 4 },
  bankScroll: { padding: 16, paddingBottom: 24 },
  bankCard: {
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 14,
    marginBottom: 12,
  },
  bankHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  bankInstitutionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  bankLabel: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  bankSubLabel: { color: '#8c8c8c', fontSize: 12, lineHeight: 17 },
  bankRefreshBtn: {
    backgroundColor: '#232323',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bankRefreshText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  bankLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bankLoadingText: { color: '#b7b7b7', fontSize: 13 },
  bankBalanceLabel: { color: '#8c8c8c', fontSize: 12, marginTop: 2 },
  bankBalance: { color: '#34C759', fontSize: 28, fontWeight: '800', marginTop: 2, marginBottom: 12 },
  bankStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  bankStat: {
    flex: 1,
    backgroundColor: '#191919',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 12,
  },
  bankStatValue: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  bankStatLabel: { color: '#868686', fontSize: 11 },
  bankActionRow: { flexDirection: 'row', gap: 10 },
  bankCreditBtn: {
    flex: 1,
    backgroundColor: '#1f3d24',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  bankDebitBtn: {
    flex: 1,
    backgroundColor: '#3a2222',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  bankActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bankSectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  bankInstitutionsWrap: { gap: 8 },
  bankInstitutionChip: {
    backgroundColor: '#191919',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bankInstitutionChipActive: {
    borderColor: '#34C759',
    backgroundColor: '#162518',
  },
  bankInstitutionName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bankInstitutionNameActive: { color: '#8af0ad' },
  bankInstitutionMeta: { color: '#7f7f7f', fontSize: 11, marginTop: 2 },
  bankInstitutionMetaActive: { color: '#8fcf9f' },
  bankTxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252525',
    padding: 12,
    marginBottom: 8,
  },
  bankTxTitle: { color: '#fff', fontSize: 14, marginBottom: 2 },
  bankTxMeta: { color: '#7b7b7b', fontSize: 11 },
  bankTxAmount: { color: '#34C759', fontSize: 14, fontWeight: '700' },
  bankTxDebit: { color: '#ff8b8b' },
  bankEmpty: { color: '#777', fontSize: 12, lineHeight: 18 },
  bankError: { color: '#ff8b8b', fontSize: 12, marginTop: 10, lineHeight: 18 },
});
