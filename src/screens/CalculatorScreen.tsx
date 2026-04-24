import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, Modal, FlatList,
  TouchableWithoutFeedback, Dimensions,
} from 'react-native';
import { verifyPin } from '../utils/pinManager';
import { addCalcHistory, getCalcHistory, clearCalcHistory } from '../utils/database';

interface Props {
  onUnlock: (mode: 'real' | 'duress') => void;
}

interface HistoryEntry {
  id: number;
  expression: string;
  result: string;
  created_at: string;
}

type CalcOp = '+' | '-' | '×' | '÷' | null;

const GRID_PADDING = 12;
const GRID_GAP = 12;
const GRID_COLS = 4;
const SCREEN_WIDTH = Dimensions.get('window').width;
const KEY_SIZE = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
const ZERO_KEY_WIDTH = KEY_SIZE * 2 + GRID_GAP;

export default function CalculatorScreen({ onUnlock }: Props) {
  // ── Display state ──────────────────────────────────────────────
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<CalcOp>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [expressionLine, setExpressionLine] = useState('');

  // ── PIN detection state ────────────────────────────────────────
  // pinBuffer accumulates digits typed regardless of calculator ops
  const pinBuffer = useRef('');
  // pendingUnlockMode stores a matched PIN waiting for 4s hold on '='.
  const pendingUnlockModeRef = useRef<'real' | 'duress' | null>(null);
  const [unlockPending, setUnlockPending] = useState(false);
  const [duressHoldActive, setDuressHoldActive] = useState(false);
  const [duressHoldSeconds, setDuressHoldSeconds] = useState(4);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── History ────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadHistory = useCallback(async () => {
    const h = await getCalcHistory();
    setHistory(h);
  }, []);

  const clearDuressHold = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setDuressHoldActive(false);
    setDuressHoldSeconds(4);
  }, []);

  // ── Core calculator logic ──────────────────────────────────────
  const evaluate = (a: number, op: CalcOp, b: number): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : NaN;
      default:  return b;
    }
  };

  const formatResult = (n: number): string => {
    if (isNaN(n)) return 'Error';
    if (!isFinite(n)) return 'Error';
    // Max 10 significant digits, strip trailing zeros
    const str = parseFloat(n.toPrecision(10)).toString();
    // If result is too long for display, use exponential
    return str.length > 12 ? n.toExponential(4) : str;
  };

  // ── PIN check helpers ──────────────────────────────────────────
  const checkPin = useCallback(async (buf: string, pressedEquals: boolean) => {
    if (buf.length < 4) return;

    const result = await verifyPin(buf);

    if (result === 'duress' || result === 'real') {
      if (pressedEquals && pendingUnlockModeRef.current === result) {
        pinBuffer.current = '';
        pendingUnlockModeRef.current = null;
        setUnlockPending(false);
        clearDuressHold();
        setDisplay('0');
        setExpressionLine('');
        setPrevValue(null);
        setPendingOp(null);
        setWaitingForOperand(false);
        setJustEvaluated(false);
        onUnlock(result);
      } else {
        // PIN detected but '=' hold not completed yet.
        pendingUnlockModeRef.current = result;
        setUnlockPending(true);
      }
    } else {
      pendingUnlockModeRef.current = null;
      setUnlockPending(false);
      clearDuressHold();
    }
  }, [onUnlock, clearDuressHold]);

  // ── Button handlers ────────────────────────────────────────────
  const handleDigit = useCallback(async (digit: string) => {
    // Accumulate into PIN buffer
    const newBuf = pinBuffer.current + digit;
    pinBuffer.current = newBuf.length > 8 ? digit : newBuf;

    // Check PIN (not equals press)
    await checkPin(pinBuffer.current, false);

    setJustEvaluated(false);

    if (waitingForOperand || justEvaluated) {
      setDisplay(digit);
      setWaitingForOperand(false);
      setJustEvaluated(false);
    } else {
      setDisplay(prev => {
        if (prev === '0') return digit;
        if (prev.replace('-', '').length >= 12) return prev; // digit limit
        return prev + digit;
      });
    }
  }, [waitingForOperand, justEvaluated, checkPin]);

  const handleDot = useCallback(() => {
    pinBuffer.current = ''; // dot breaks PIN sequence
    pendingUnlockModeRef.current = null;
    setUnlockPending(false);
    clearDuressHold();

    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    setDisplay(prev => prev.includes('.') ? prev : prev + '.');
  }, [waitingForOperand, clearDuressHold]);

  const handleOperator = useCallback((op: CalcOp) => {
    pinBuffer.current = ''; // operator breaks PIN sequence
    pendingUnlockModeRef.current = null;
    setUnlockPending(false);
    clearDuressHold();

    const current = parseFloat(display);

    if (prevValue !== null && pendingOp && !waitingForOperand) {
      const result = evaluate(prevValue, pendingOp, current);
      const formatted = formatResult(result);
      setDisplay(formatted);
      setExpressionLine(formatted + ' ' + op!);
      setPrevValue(isNaN(result) ? null : result);
    } else {
      setExpressionLine(display + ' ' + op!);
      setPrevValue(current);
    }

    setPendingOp(op);
    setWaitingForOperand(true);
    setJustEvaluated(false);
  }, [display, prevValue, pendingOp, waitingForOperand, clearDuressHold]);

  const handleEquals = useCallback(async () => {
    // If a PIN was detected, only long-hold '=' should unlock.
    if (pendingUnlockModeRef.current) {
      return;
    }

    // Otherwise do normal calculation
    pinBuffer.current = '';
    const current = parseFloat(display);

    if (prevValue !== null && pendingOp) {
      const result = evaluate(prevValue, pendingOp, current);
      const formatted = formatResult(result);
      const fullExpr = `${expressionLine} ${display}`;

      // Save to history
      if (expressionLine.trim()) {
        await addCalcHistory(fullExpr.trim(), formatted);
      }

      setExpressionLine(fullExpr + ' =');
      setDisplay(formatted);
      setPrevValue(null);
      setPendingOp(null);
      setWaitingForOperand(false);
      setJustEvaluated(true);
    }
  }, [display, prevValue, pendingOp, expressionLine, checkPin]);

  const handleEqualsPressIn = useCallback(() => {
    if (!pendingUnlockModeRef.current) return;

    clearDuressHold();
    setDuressHoldActive(true);
    setDuressHoldSeconds(4);

    holdIntervalRef.current = setInterval(() => {
      setDuressHoldSeconds(prev => {
        if (prev <= 1) return 1;
        return prev - 1;
      });
    }, 1000);

    holdTimeoutRef.current = setTimeout(async () => {
      clearDuressHold();
      await checkPin(pinBuffer.current, true);
    }, 4000);
  }, [checkPin, clearDuressHold]);

  const handleEqualsPressOut = useCallback(() => {
    if (!pendingUnlockModeRef.current) return;
    clearDuressHold();
  }, [clearDuressHold]);

  const handleClear = useCallback(() => {
    pinBuffer.current = '';
    pendingUnlockModeRef.current = null;
    setUnlockPending(false);
    clearDuressHold();
    setDisplay('0');
    setExpressionLine('');
    setPrevValue(null);
    setPendingOp(null);
    setWaitingForOperand(false);
    setJustEvaluated(false);
  }, [clearDuressHold]);

  const handlePlusMinus = useCallback(() => {
    pinBuffer.current = '';
    setDisplay(prev => {
      const n = parseFloat(prev);
      return isNaN(n) ? prev : (n * -1).toString();
    });
  }, []);

  const handlePercent = useCallback(() => {
    pinBuffer.current = '';
    setDisplay(prev => {
      const n = parseFloat(prev);
      return isNaN(n) ? prev : (n / 100).toString();
    });
  }, []);

  const handleDeleteChar = useCallback(() => {
    pinBuffer.current = pinBuffer.current.slice(0, -1);

    if (pinBuffer.current.length < 4) {
      pendingUnlockModeRef.current = null;
      setUnlockPending(false);
      clearDuressHold();
    }

    if (justEvaluated) {
      setJustEvaluated(false);
    }

    // If user is currently between operands (e.g. "4 +"), DEL removes the operator.
    if (waitingForOperand && pendingOp && prevValue !== null) {
      setPendingOp(null);
      setWaitingForOperand(false);
      setExpressionLine('');
      setDisplay(formatResult(prevValue));
      return;
    }

    // If we're typing the second operand (e.g. "4 + 5"), DEL removes it one char at a time.
    if (!waitingForOperand && pendingOp && prevValue !== null) {
      if (display.length > 1) {
        setDisplay(display.slice(0, -1));
      } else {
        // Last char of second operand removed: return to "4 +" state.
        setDisplay(formatResult(prevValue));
        setWaitingForOperand(true);
      }
      return;
    }

    // Normal single-operand backspace.
    if (display.length <= 1 || (display.startsWith('-') && display.length === 2)) {
      setDisplay('0');
      return;
    }

    setDisplay(display.slice(0, -1));
  }, [clearDuressHold, display, justEvaluated, pendingOp, prevValue, waitingForOperand]);

  // ── History ────────────────────────────────────────────────────
  const handleHistoryOpen = async () => {
    await loadHistory();
    setShowHistory(true);
  };

  const handleHistoryTap = (item: HistoryEntry) => {
    setDisplay(item.result);
    setPrevValue(null);
    setPendingOp(null);
    setWaitingForOperand(true);
    setJustEvaluated(true);
    setExpressionLine('');
    setShowHistory(false);
  };

  const handleClearHistory = async () => {
    await clearCalcHistory();
    setHistory([]);
  };

  // ── Button layout ──────────────────────────────────────────────
  const topRow = [
    { label: display === '0' || justEvaluated ? 'AC' : 'C', type: 'func', action: handleClear },
    { label: 'DEL', type: 'func', action: handleDeleteChar },
    { label: '+/-', type: 'func', action: handlePlusMinus },
    { label: '÷',   type: 'op',   action: () => handleOperator('÷') },
  ];
  const midRows = [
    { label: '7', action: () => handleDigit('7') },
    { label: '8', action: () => handleDigit('8') },
    { label: '9', action: () => handleDigit('9') },
    { label: '×', type: 'op', action: () => handleOperator('×') },
    { label: '4', action: () => handleDigit('4') },
    { label: '5', action: () => handleDigit('5') },
    { label: '6', action: () => handleDigit('6') },
    { label: '-', type: 'op', action: () => handleOperator('-') },
    { label: '1', action: () => handleDigit('1') },
    { label: '2', action: () => handleDigit('2') },
    { label: '3', action: () => handleDigit('3') },
    { label: '+', type: 'op', action: () => handleOperator('+') },
  ];
  const bottomRow = [
    { label: '0',  type: 'zero', action: () => handleDigit('0') },
    { label: '.',  type: 'num',  action: handleDot },
    { label: '=',  type: 'eq',   action: handleEquals },
  ];

  const activeOp = pendingOp;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Display area — long press opens history */}
      <TouchableOpacity
        style={styles.display}
        onLongPress={handleHistoryOpen}
        delayLongPress={600}
        activeOpacity={1}
      >
        <Text style={styles.historyHint}>hold for history</Text>
        {unlockPending && (
          <Text style={styles.duressHint}>
            {duressHoldActive ? `Hold = ${duressHoldSeconds}s to unlock` : 'PIN detected. Hold = for 4s'}
          </Text>
        )}
        <Text style={styles.expressionLine} numberOfLines={1}>{expressionLine}</Text>
        <Text style={styles.result} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
          {display}
        </Text>
      </TouchableOpacity>

      {/* Buttons */}
      <View style={styles.grid}>
        {/* Top row */}
        {topRow.map((btn, i) => (
          <TouchableOpacity
            key={`top-${i}`}
            activeOpacity={0.78}
            hitSlop={6}
            style={[
              styles.btn,
              btn.type === 'func' && styles.btnFunc,
              btn.type === 'op' && styles.btnOp,
              btn.type === 'op' && activeOp === btn.label && styles.btnOpActive,
            ]}
            onPress={btn.action}
          >
            <View style={styles.keyCenter}>
              <Text style={[
                styles.keyLabel,
                btn.type === 'func' && styles.btnTextDark,
                btn.type === 'op' && activeOp === btn.label && styles.btnTextOpActive,
              ]}>
                {btn.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Mid rows */}
        {midRows.map((btn, i) => (
          <TouchableOpacity
            key={`mid-${i}`}
            activeOpacity={0.78}
            hitSlop={6}
            style={[
              styles.btn,
              (btn.type === 'op') && styles.btnOp,
              (btn.type === 'op') && activeOp === btn.label && styles.btnOpActive,
            ]}
            onPress={btn.action}
          >
            <View style={styles.keyCenter}>
              <Text style={[
                styles.keyLabel,
                (btn.type === 'op') && activeOp === btn.label && styles.btnTextOpActive,
              ]}>
                {btn.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Bottom row */}
        <TouchableOpacity
          style={[styles.btn, styles.btnZero]}
          onPress={bottomRow[0].action}
          activeOpacity={0.78}
          hitSlop={6}
        >
          <View style={styles.keyCenter}>
            <Text style={styles.keyLabel}>0</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btn}
          onPress={bottomRow[1].action}
          activeOpacity={0.78}
          hitSlop={6}
        >
          <View style={styles.keyCenter}>
            <Text style={styles.keyLabel}>.</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnEq]}
          onPress={bottomRow[2].action}
          onPressIn={handleEqualsPressIn}
          onPressOut={handleEqualsPressOut}
          activeOpacity={0.78}
          hitSlop={6}
        >
          <View style={styles.keyCenter}>
            <Text style={styles.keyLabel}>=</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* History Modal */}
      <Modal visible={showHistory} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowHistory(false)}>
          <View style={styles.historyOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.historySheet}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>History</Text>
                  <TouchableOpacity onPress={handleClearHistory}>
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={history}
                  keyExtractor={i => i.id.toString()}
                  ListEmptyComponent={
                    <Text style={styles.emptyHistory}>No calculations yet</Text>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.historyItem}
                      onPress={() => handleHistoryTap(item)}
                    >
                      <Text style={styles.historyExpr}>{item.expression}</Text>
                      <Text style={styles.historyResult}>= {item.result}</Text>
                      <Text style={styles.historyTime}>
                        {new Date(item.created_at).toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  display: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end',
    paddingHorizontal: 24, paddingBottom: 16,
  },
  historyHint: { color: '#1a1a1a', fontSize: 11, marginBottom: 8 },
  duressHint: { color: '#ff9f0a', fontSize: 12, marginBottom: 4, width: '100%', textAlign: 'right' },
  expressionLine: { color: '#555', fontSize: 18, marginBottom: 4 },
  result: { color: '#fff', fontSize: 72, fontWeight: '200', width: '100%', textAlign: 'right' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING, paddingBottom: 24, gap: GRID_GAP,
    justifyContent: 'center',
  },
  btn: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: '#333', justifyContent: 'center', alignItems: 'center',
  },
  btnFunc: { backgroundColor: '#a5a5a5' },
  btnOp:  { backgroundColor: '#ff9f0a' },
  btnOpActive: { backgroundColor: '#fff' },
  btnEq:  { backgroundColor: '#ff9f0a' },
  btnZero: {
    width: ZERO_KEY_WIDTH,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    paddingLeft: 0, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#333',
  },
  keyCenter: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 28,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  btnTextDark: { color: '#000' },
  btnTextOpActive: { color: '#ff9f0a' },
  // History modal
  historyOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  historySheet: {
    backgroundColor: '#1c1c1e', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 32,
  },
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 20,
    borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  historyTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  clearText: { color: '#ff9f0a', fontSize: 15 },
  emptyHistory: { color: '#444', textAlign: 'center', marginTop: 40, fontSize: 15 },
  historyItem: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  historyExpr: { color: '#888', fontSize: 13, marginBottom: 2 },
  historyResult: { color: '#fff', fontSize: 22, fontWeight: '300' },
  historyTime: { color: '#444', fontSize: 11, marginTop: 4 },
});