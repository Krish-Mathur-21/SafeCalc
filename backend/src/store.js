const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseEnabled } = require('./supabaseClient');
const { encryptProfile, decryptProfile, encryptText, decryptText } = require('./cryptoProfile');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const DEMO_PHONE = '+910000000000';

function nowIso() {
  return new Date().toISOString();
}

function normalizePhone(phone) {
  if (!phone) return DEMO_PHONE;
  return String(phone).trim().replace(/\s+/g, '');
}

function log(mode, message, fallbackReason = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [STORE] [${mode.toUpperCase()}] ${message}`;
  if (fallbackReason) {
    console.log(`${logMessage} (fallback: ${fallbackReason})`);
  } else {
    console.log(logMessage);
  }
}

async function withSupabaseFallback(supabaseOperation, localOperation, operationName) {
  if (!isSupabaseEnabled) {
    log('local', `Using local mode for ${operationName}`, 'Supabase not configured');
    return await localOperation();
  }

  try {
    log('supabase', `Attempting ${operationName}`);
    const result = await supabaseOperation();
    log('supabase', `Successfully completed ${operationName}`);
    return result;
  } catch (error) {
    log('supabase', `Failed ${operationName}: ${error.message}`);
    log('local', `Falling back to local mode for ${operationName}`, error.message);
    return await localOperation();
  }
}

function handleSupabaseError(error, operation) {
  const message = error?.message || 'Unknown error';
  
  // Check for common Supabase schema errors
  if (message.includes('relation') && message.includes('does not exist')) {
    log('supabase', `Schema error in ${operation}: ${message}`);
    return { error: 'SUPABASE_SCHEMA_ERROR', message: 'Database table not found. Using local fallback.' };
  }
  
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    log('supabase', `Timeout error in ${operation}: ${message}`);
    return { error: 'SUPABASE_TIMEOUT', message: 'Database timeout. Using local fallback.' };
  }
  
  if (message.includes('permission') || message.includes('unauthorized')) {
    log('supabase', `Permission error in ${operation}: ${message}`);
    return { error: 'SUPABASE_PERMISSION', message: 'Database permission error. Using local fallback.' };
  }
  
  // Generic Supabase error
  log('supabase', `Generic error in ${operation}: ${message}`);
  return { error: 'SUPABASE_ERROR', message: 'Database error. Using local fallback.' };
}

function isValidPhone(phone) {
  return /^\+?[0-9]{10,15}$/.test(normalizePhone(phone));
}

function loadDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(raw);

  // Legacy migration from old single-account format.
  if (!db.users) {
    const openingBalance = db.account?.openingBalance ?? 0;
    db.users = [
      {
        phone: DEMO_PHONE,
        currency: db.account?.currency || 'INR',
        openingBalance,
        profileEnc: encryptProfile({
          name: 'Demo User',
          phone: DEMO_PHONE,
          createdAt: nowIso(),
        }),
        createdAt: nowIso(),
      },
    ];
  }

  if (!Array.isArray(db.transactions)) {
    db.transactions = [];
  }

  db.transactions = db.transactions.map((t) => ({
    ...t,
    phone: t.phone || DEMO_PHONE,
  }));

  return db;
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function buildSummaryFromRows(user, transactions) {
  const credits = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const debits = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const openingBalance = Number(user.openingBalance || 0);
  const balance = openingBalance + credits - debits;

  return {
    accountId: user.phone,
    phone: user.phone,
    currency: user.currency || 'INR',
    openingBalance,
    balance,
    totalCredited: credits,
    totalDebited: debits,
    transactionCount: transactions.length,
  };
}

async function localGetOrCreateUser(phone) {
  const normalizedPhone = normalizePhone(phone);
  const db = loadDb();
  let user = db.users.find((u) => u.phone === normalizedPhone);

  if (!user) {
    user = {
      phone: normalizedPhone,
      currency: 'INR',
      openingBalance: 0,
      profileEnc: encryptProfile({
        name: 'New User',
        phone: normalizedPhone,
        createdAt: nowIso(),
      }),
      createdAt: nowIso(),
    };
    db.users.push(user);
    saveDb(db);
  }

  return user;
}

function createTransaction({ phone, type, amount, category, note }) {
  return {
    id: `txn_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    phone: normalizePhone(phone),
    type,
    amount,
    category: category || 'general',
    note: note || '',
    createdAt: nowIso(),
  };
}

function decryptNoteSafe(noteValue) {
  if (!noteValue) return '';
  try {
    return decryptText(noteValue);
  } catch {
    // Backward compatibility: existing plain-text rows should still render.
    return noteValue;
  }
}

async function signUpWithPhone({ phone, name }) {
  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) {
    return {
      success: false,
      error: 'INVALID_PHONE',
      message: 'Phone number must be 10-15 digits, optional leading +.',
    };
  }

  const profile = {
    name: name || 'New User',
    phone: normalizedPhone,
    createdAt: nowIso(),
  };

  return await withSupabaseFallback(
    async () => {
      const { data: existing, error: selectError } = await supabase
        .from('bank_users')
        .select('phone, currency, opening_balance')
        .eq('phone', normalizedPhone)
        .maybeSingle();
        
      if (selectError) {
        throw new Error(selectError.message);
      }

      if (!existing) {
        const { error: insertError } = await supabase.from('bank_users').insert({
          phone: normalizedPhone,
          currency: 'INR',
          opening_balance: 0,
          profile_enc: encryptProfile(profile),
        });
        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      return {
        success: true,
        mode: 'supabase',
        phone: normalizedPhone,
        profile,
      };
    },
    async () => {
      await localGetOrCreateUser(normalizedPhone);
      return {
        success: true,
        mode: 'local',
        phone: normalizedPhone,
        profile,
      };
    },
    `sign up user ${normalizedPhone}`
  );
}

async function getUserProfile({ phone }) {
  const normalizedPhone = normalizePhone(phone);

  return await withSupabaseFallback(
    async () => {
      const { data, error } = await supabase
        .from('bank_users')
        .select('phone, profile_enc')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (error) {
        const handled = handleSupabaseError(error, 'get user profile');
        if (handled.error) throw new Error(handled.message);
        return handled;
      }
      
      if (!data) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'User not found',
        };
      }

      try {
        const profile = decryptProfile(data.profile_enc);
        return {
          success: true,
          mode: 'supabase',
          phone: data.phone,
          profile,
        };
      } catch (decryptError) {
        throw new Error(`Failed to decrypt profile: ${decryptError.message}`);
      }
    },
    async () => {
      const user = await localGetOrCreateUser(normalizedPhone);
      try {
        const profile = decryptProfile(user.profileEnc);
        return {
          success: true,
          mode: 'local',
          phone: user.phone,
          profile,
        };
      } catch (decryptError) {
        return {
          success: false,
          error: 'DECRYPT_FAILED',
          message: 'Failed to decrypt profile data',
        };
      }
    },
    `get user profile for ${normalizedPhone}`
  );
}

async function upsertUserProfile({ phone, profile }) {
  const normalizedPhone = normalizePhone(phone);
  const payload = encryptProfile({
    ...(profile || {}),
    phone: normalizedPhone,
    updatedAt: nowIso(),
  });

  return await withSupabaseFallback(
    async () => {
      const { data: existing, error: selectError } = await supabase
        .from('bank_users')
        .select('phone')
        .eq('phone', normalizedPhone)
        .maybeSingle();
        
      if (selectError) {
        throw new Error(selectError.message);
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('bank_users')
          .update({ profile_enc: payload })
          .eq('phone', normalizedPhone);
        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        const { error: insertError } = await supabase.from('bank_users').insert({
          phone: normalizedPhone,
          currency: 'INR',
          opening_balance: 0,
          profile_enc: payload,
        });
        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      // Return the updated profile
      return await getUserProfile({ phone: normalizedPhone });
    },
    async () => {
      const db = loadDb();
      let user = db.users.find((u) => u.phone === normalizedPhone);
      if (!user) {
        user = {
          phone: normalizedPhone,
          currency: 'INR',
          openingBalance: 0,
          profileEnc: payload,
          createdAt: nowIso(),
        };
        db.users.push(user);
      } else {
        user.profileEnc = payload;
      }
      saveDb(db);

      return await getUserProfile({ phone: normalizedPhone });
    },
    `upsert user profile for ${normalizedPhone}`
  );
}

async function getSummary({ phone }) {
  const normalizedPhone = normalizePhone(phone);

  return await withSupabaseFallback(
    async () => {
      const { data: user, error: userErr } = await supabase
        .from('bank_users')
        .select('phone, currency, opening_balance')
        .eq('phone', normalizedPhone)
        .maybeSingle();
        
      if (userErr) {
        const handled = handleSupabaseError(userErr, 'get user for summary');
        if (handled.error) throw new Error(handled.message);
        return handled;
      }
      
      if (!user) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'User not found',
        };
      }

      const { data: transactions, error: txErr } = await supabase
        .from('bank_transactions')
        .select('type, amount')
        .eq('phone', normalizedPhone);
        
      if (txErr) {
        const handled = handleSupabaseError(txErr, 'get transactions for summary');
        if (handled.error) throw new Error(handled.message);
        return handled;
      }

      const summary = buildSummaryFromRows(
        {
          phone: user.phone,
          currency: user.currency,
          openingBalance: Number(user.opening_balance || 0),
        },
        transactions || []
      );
      
      return {
        success: true,
        mode: 'supabase',
        ...summary,
      };
    },
    async () => {
      const db = loadDb();
      const user = db.users.find((u) => u.phone === normalizedPhone);
      if (!user) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'User not found',
        };
      }
      const tx = db.transactions.filter((t) => t.phone === normalizedPhone);
      const summary = buildSummaryFromRows(user, tx);
      
      return {
        success: true,
        mode: 'local',
        ...summary,
      };
    },
    `get summary for ${normalizedPhone}`
  );
}

async function listTransactions({ phone, limit, type, category }) {
  const normalizedPhone = normalizePhone(phone);

  return await withSupabaseFallback(
    async () => {
      let query = supabase
        .from('bank_transactions')
        .select('id, phone, type, amount, category, note, created_at')
        .eq('phone', normalizedPhone)
        .order('created_at', { ascending: false });

      if (type) query = query.eq('type', type);
      if (category) query = query.eq('category', category);
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) {
        const handled = handleSupabaseError(error, 'list transactions');
        if (handled.error) throw new Error(handled.message);
        return handled;
      }

      const transactions = (data || []).map((t) => ({
        id: t.id,
        phone: t.phone,
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        note: decryptNoteSafe(t.note),
        createdAt: t.created_at,
      }));
      
      return {
        success: true,
        mode: 'supabase',
        transactions,
      };
    },
    async () => {
      const db = loadDb();
      let items = db.transactions
        .filter((t) => t.phone === normalizedPhone)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const decryptedItems = items.map((t) => ({
        ...t,
        note: decryptNoteSafe(t.note),
      }));

      let filteredItems = decryptedItems;
      if (type) filteredItems = filteredItems.filter((t) => t.type === type);
      if (category) filteredItems = filteredItems.filter((t) => t.category === category);
      if (limit) filteredItems = filteredItems.slice(0, limit);
      
      return {
        success: true,
        mode: 'local',
        transactions: filteredItems,
      };
    },
    `list transactions for ${normalizedPhone}`
  );
}

async function addCredit({ phone, amount, category, note }) {
  const normalizedPhone = normalizePhone(phone);

  return await withSupabaseFallback(
    async () => {
      // Check if user exists, create if not
      const userResult = await getSummary({ phone: normalizedPhone });
      if (!userResult.success && userResult.error === 'NOT_FOUND') {
        await signUpWithPhone({ phone: normalizedPhone, name: 'New User' });
      }

      const tx = createTransaction({ phone: normalizedPhone, type: 'credit', amount, category, note });
      const encryptedNote = encryptText(tx.note || '');
      const { error } = await supabase.from('bank_transactions').insert({
        id: tx.id,
        phone: tx.phone,
        type: tx.type,
        amount: tx.amount,
        category: tx.category,
        note: encryptedNote,
        created_at: tx.createdAt,
      });
      if (error) {
        throw new Error(error.message);
      }

      const summary = await getSummary({ phone: normalizedPhone });
      return {
        success: true,
        mode: 'supabase',
        transaction: tx,
        summary,
      };
    },
    async () => {
      const db = loadDb();
      let user = db.users.find((u) => u.phone === normalizedPhone);
      if (!user) {
        user = {
          phone: normalizedPhone,
          currency: 'INR',
          openingBalance: 0,
          profileEnc: encryptProfile({ name: 'New User', phone: normalizedPhone, createdAt: nowIso() }),
          createdAt: nowIso(),
        };
        db.users.push(user);
      }

      const tx = createTransaction({ phone: normalizedPhone, type: 'credit', amount, category, note });
      db.transactions.push({
        ...tx,
        note: encryptText(tx.note || ''),
      });
      saveDb(db);
      const summary = buildSummaryFromRows(user, db.transactions.filter((t) => t.phone === normalizedPhone));
      
      return {
        success: true,
        mode: 'local',
        transaction: {
          ...tx,
          note: tx.note || '',
        },
        summary,
      };
    },
    `add credit transaction for ${normalizedPhone}`
  );
}

async function addDebit({ phone, amount, category, note }) {
  const normalizedPhone = normalizePhone(phone);
  
  // Get current summary to check balance
  const currentSummary = await getSummary({ phone: normalizedPhone });
  if (!currentSummary.success) {
    return currentSummary;
  }

  if (amount > currentSummary.balance) {
    return {
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: `Debit of ${amount} exceeds current balance of ${currentSummary.balance}.`,
      summary: currentSummary,
    };
  }

  return await withSupabaseFallback(
    async () => {
      const tx = createTransaction({ phone: normalizedPhone, type: 'debit', amount, category, note });
      const encryptedNote = encryptText(tx.note || '');
      const { error } = await supabase.from('bank_transactions').insert({
        id: tx.id,
        phone: tx.phone,
        type: tx.type,
        amount: tx.amount,
        category: tx.category,
        note: encryptedNote,
        created_at: tx.createdAt,
      });
      if (error) {
        throw new Error(error.message);
      }

      const summary = await getSummary({ phone: normalizedPhone });
      return {
        success: true,
        mode: 'supabase',
        transaction: tx,
        summary,
      };
    },
    async () => {
      const db = loadDb();
      const user = db.users.find((u) => u.phone === normalizedPhone);
      if (!user) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'User not found',
        };
      }
      const tx = createTransaction({ phone: normalizedPhone, type: 'debit', amount, category, note });
      db.transactions.push({
        ...tx,
        note: encryptText(tx.note || ''),
      });
      saveDb(db);
      const summary = buildSummaryFromRows(user, db.transactions.filter((t) => t.phone === normalizedPhone));
      
      return {
        success: true,
        mode: 'local',
        transaction: {
          ...tx,
          note: tx.note || '',
        },
        summary,
      };
    },
    `add debit transaction for ${normalizedPhone}`
  );
}

module.exports = {
  signUpWithPhone,
  getUserProfile,
  upsertUserProfile,
  listTransactions,
  addCredit,
  addDebit,
  getSummary,
  isValidPhone,
};
