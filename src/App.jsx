import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc,
  onSnapshot, 
  collection
} from 'firebase/firestore';

// Safely try to fetch from local environment variables or platform sandbox injection
let buildEnv = {};
try {
  buildEnv = import.meta.env || {};
} catch (e) {
  // Graceful fallback if import.meta is unavailable in runtime
}

const firebaseConfig = {
  apiKey: buildEnv.VITE_FIREBASE_API_KEY || (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config).apiKey : "mock-api-key"),
  authDomain: buildEnv.VITE_FIREBASE_AUTH_DOMAIN || (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config).authDomain : "mock-auth.firebaseapp.com"),
  projectId: buildEnv.VITE_FIREBASE_PROJECT_ID || (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config).projectId : "mock-project"),
  storageBucket: buildEnv.VITE_FIREBASE_STORAGE_BUCKET || (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config).storageBucket : "mock-project.appspot.com"),
  messagingSenderId: buildEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config).messagingSenderId : "123456"),
  appId: buildEnv.VITE_FIREBASE_APP_ID || (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config).appId : "1:123456:web:mock")
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'expense-tracker-v2';

const LOCAL_STORAGE_KEYS = {
  expenses: 'exp_v2_expenses',
  sectors: 'exp_v2_sectors',
  budgets: 'exp_v2_budgets'
};

const getRecordTime = (record) => Number(record?.updatedAt) || 0;

const DEFAULT_SECTORS = [
  { id: 'sec-food', name: 'Food', subCategories: ['Breakfast', 'Lunch', 'Dinner'], custom: false, updatedAt: 1 },
  { id: 'sec-transport', name: 'Transport', subCategories: ['On Campus', 'Off Campus'], custom: false, updatedAt: 1 },
  { id: 'sec-hangout', name: 'Hangout', subCategories: [], custom: false, updatedAt: 1 },
  { id: 'sec-internet', name: 'Mobile and Internet', subCategories: [], custom: false, updatedAt: 1 }
];

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatCurrency = (amount) => {
  return `৳${Math.round(amount).toLocaleString('en-US')}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'pending', 'offline'
  
  // Storage hooks
  const [expenses, setExpenses] = useState({});
  const [sectors, setSectors] = useState({});
  const [budgets, setBudgets] = useState({});
  
  // Navigation
  const [currentDate, setCurrentDate] = useState(new Date());
  const [comparisonPeriod, setComparisonPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('home');
  
  // Modals & UI Toggles
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddSectorOpen, setIsAddSectorOpen] = useState(false);
  const [isAddBudgetOpen, setIsAddBudgetOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeDevTab, setActiveDevTab] = useState('env'); // 'env' | 'rules'
  
  // Form variables
  const [txId, setTxId] = useState(null);
  const [txDate, setTxDate] = useState(getTodayDateString());
  const [txSector, setTxSector] = useState('Food');
  const [txSubCategory, setTxSubCategory] = useState('Breakfast');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');

  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorSubs, setNewSectorSubs] = useState('');

  const [budgetType, setBudgetType] = useState('monthly');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [budgetScope, setBudgetScope] = useState('all');
  const [budgetDays, setBudgetDays] = useState(5);

  const [copiedText, setCopiedText] = useState(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('pending');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const localExp = JSON.parse(localStorage.getItem('exp_v2_expenses') || '{}');
      const localSec = JSON.parse(localStorage.getItem('exp_v2_sectors') || '{}');
      const localBud = JSON.parse(localStorage.getItem('exp_v2_budgets') || '{}');
      
      setExpenses(localExp);
      
      if (Object.keys(localSec).length === 0) {
        const defaultSectorsMap = {};
        DEFAULT_SECTORS.forEach(s => {
          defaultSectorsMap[s.id] = s;
        });
        setSectors(defaultSectorsMap);
        localStorage.setItem('exp_v2_sectors', JSON.stringify(defaultSectorsMap));
      } else {
        setSectors(localSec);
      }
      setBudgets(localBud);
    } catch (e) {
      console.error('Error restoring local storage state caches', e);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!authEmail || !authPassword) {
      setAuthError('Enter an email and password.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    setAuthBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
    setAuthBusy(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!authEmail || !authPassword) {
      setAuthError('Enter an email and password.');
      return;
    }
    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
    setAuthBusy(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setExpenses({});
      setBudgets({});
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  const applyLocalRecords = (collectionName, records) => {
    const storageKey = LOCAL_STORAGE_KEYS[collectionName];
    localStorage.setItem(storageKey, JSON.stringify(records));

    if (collectionName === 'expenses') setExpenses(records);
    else if (collectionName === 'sectors') setSectors(records);
    else if (collectionName === 'budgets') setBudgets(records);
  };

  const syncRecord = async (collectionName, id, localItem) => {
    const itemRef = doc(db, 'artifacts', appId, 'users', user.uid, collectionName, id);
    await setDoc(itemRef, localItem);
    return localItem;
  };

  const syncLocalRecords = async () => {
    const collections = ['expenses', 'sectors', 'budgets'];

    for (const collectionName of collections) {
      const localRecords = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS[collectionName]) || '{}');
      const syncedRecords = { ...localRecords };

      await Promise.all(Object.entries(localRecords).map(async ([id, localItem]) => {
        syncedRecords[id] = await syncRecord(collectionName, id, localItem);
      }));

      applyLocalRecords(collectionName, syncedRecords);
    }
  };

  useEffect(() => {
    if (!user || !firebaseConfig.apiKey) return;
    if (!isOnline) {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('pending');

    // 1. Live synchronization observer for Expense entries
    const expensesCol = collection(db, 'artifacts', appId, 'users', user.uid, 'expenses');
    const unsubExpenses = onSnapshot(expensesCol, (snapshot) => {
      setExpenses(prevExpenses => {
        let updated = { ...prevExpenses };
        let hasChanges = false;
        
        snapshot.forEach(doc => {
          const cloudItem = doc.data();
          const localItem = prevExpenses[doc.id];
          
          if (!localItem || getRecordTime(cloudItem) > getRecordTime(localItem)) {
            updated[doc.id] = cloudItem;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          localStorage.setItem('exp_v2_expenses', JSON.stringify(updated));
          return updated;
        }
        return prevExpenses;
      });
      setSyncStatus('synced');
    }, (error) => {
      console.warn("Firestore listener restricted -- active in dynamic offline sandbox mode", error);
      setSyncStatus('offline');
    });

    // 2. Live synchronization observer for Sectors
    const sectorsCol = collection(db, 'artifacts', appId, 'users', user.uid, 'sectors');
    const unsubSectors = onSnapshot(sectorsCol, (snapshot) => {
      setSectors(prevSectors => {
        let updated = { ...prevSectors };
        let hasChanges = false;

        snapshot.forEach(doc => {
          const cloudItem = doc.data();
          const localItem = prevSectors[doc.id];

          if (!localItem || getRecordTime(cloudItem) > getRecordTime(localItem)) {
            updated[doc.id] = cloudItem;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          localStorage.setItem('exp_v2_sectors', JSON.stringify(updated));
          return updated;
        }
        return prevSectors;
      });
    }, () => {});

    // 3. Live synchronization observer for Budgets
    const budgetsCol = collection(db, 'artifacts', appId, 'users', user.uid, 'budgets');
    const unsubBudgets = onSnapshot(budgetsCol, (snapshot) => {
      setBudgets(prevBudgets => {
        let updated = { ...prevBudgets };
        let hasChanges = false;

        snapshot.forEach(doc => {
          const cloudItem = doc.data();
          const localItem = prevBudgets[doc.id];

          if (!localItem || getRecordTime(cloudItem) > getRecordTime(localItem)) {
            updated[doc.id] = cloudItem;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          localStorage.setItem('exp_v2_budgets', JSON.stringify(updated));
          return updated;
        }
        return prevBudgets;
      });
    }, () => {});

    syncLocalRecords()
      .then(() => setSyncStatus('synced'))
      .catch((error) => {
        console.warn('Unable to sync locally saved records after reconnecting', error);
        setSyncStatus('offline');
      });

    return () => {
      unsubExpenses();
      unsubSectors();
      unsubBudgets();
    };
  }, [user, isOnline]);

  const saveRecordLocallyAndCloud = async (collectionName, id, data) => {
    const timestamp = Math.max(Date.now(), getRecordTime(data) + 1);
    const timestampedData = { ...data, updatedAt: timestamp };

    // Zero Loading Latency updates on local instance
    if (collectionName === 'expenses') {
      const updated = { ...expenses, [id]: timestampedData };
      setExpenses(updated);
      localStorage.setItem('exp_v2_expenses', JSON.stringify(updated));
    } else if (collectionName === 'sectors') {
      const updated = { ...sectors, [id]: timestampedData };
      setSectors(updated);
      localStorage.setItem('exp_v2_sectors', JSON.stringify(updated));
    } else if (collectionName === 'budgets') {
      const updated = { ...budgets, [id]: timestampedData };
      setBudgets(updated);
      localStorage.setItem('exp_v2_budgets', JSON.stringify(updated));
    }

    // Dynamic background replication to connected Firestore instances
    if (isOnline && user && !!firebaseConfig.apiKey) {
      setSyncStatus('pending');
      try {
        const savedRecord = await syncRecord(collectionName, id, timestampedData);
        if (savedRecord !== timestampedData) {
          const localRecords = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS[collectionName]) || '{}');
          applyLocalRecords(collectionName, { ...localRecords, [id]: savedRecord });
        }
        setSyncStatus('synced');
      } catch (err) {
        console.warn("Background persistence failed, holding local copy", err);
        setSyncStatus('offline');
      }
    } else {
      setSyncStatus('offline');
    }
  };

  const shiftTxDate = (offset) => {
    const date = new Date(`${txDate}T00:00:00`);
    date.setDate(date.getDate() + offset);
    setTxDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
  };

  const handleSaveExpense = (e) => {
    e.preventDefault();
    if (!txAmount || isNaN(txAmount) || parseInt(txAmount) <= 0) return;

    const chosenSectorObj = Object.values(sectors).find(s => s.name === txSector);
    const expectsSub = chosenSectorObj && chosenSectorObj.subCategories && chosenSectorObj.subCategories.length > 0;
    const payload = {
      date: txDate,
      sector: txSector,
      subCategory: expectsSub ? txSubCategory : '',
      amount: Math.round(parseInt(txAmount)),
      note: txNote.trim(),
      deleted: false
    };

    const targetId = txId || 'tx_' + Math.random().toString(36).substring(2, 15);
    payload.id = targetId;

    saveRecordLocallyAndCloud('expenses', targetId, payload);
    
    setTxId(null);
    setTxAmount('');
    setTxNote('');
    setIsAddExpenseOpen(false);
  };

  const handleEditExpense = (expense) => {
    setTxId(expense.id);
    setTxDate(expense.date);
    setTxSector(expense.sector);
    setTxSubCategory(expense.subCategory || '');
    setTxAmount(expense.amount.toString());
    setTxNote(expense.note || '');
    setIsAddExpenseOpen(true);
  };

  const handleDeleteExpense = (id) => {
    const targeted = expenses[id];
    if (targeted) {
      const payload = { ...targeted, deleted: true };
      saveRecordLocallyAndCloud('expenses', id, payload);
    }
  };

  const handleSaveSector = (e) => {
    e.preventDefault();
    if (!newSectorName.trim()) return;

    const cleanName = newSectorName.trim();
    const existing = Object.values(sectors).find(s => s.name.toLowerCase() === cleanName.toLowerCase() && !s.deleted);
    if (existing) return;

    const targetId = 'sec_' + Math.random().toString(36).substring(2, 15);
    const subCategories = newSectorSubs
      ? newSectorSubs.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const payload = {
      id: targetId,
      name: cleanName,
      subCategories,
      custom: true,
      deleted: false
    };

    saveRecordLocallyAndCloud('sectors', targetId, payload);
    setNewSectorName('');
    setNewSectorSubs('');
    setIsAddSectorOpen(false);
  };

  const handleDeleteSector = (id) => {
    const targeted = sectors[id];
    if (targeted && targeted.custom) {
      const payload = { ...targeted, deleted: true };
      saveRecordLocallyAndCloud('sectors', id, payload);
    }
  };

  const handleExportCSV = () => {
    const allExpenses = Object.values(expenses).filter(e => !e.deleted);
    allExpenses.sort((a, b) => a.date.localeCompare(b.date));

    const headers = ['Date', 'Sector', 'Sub-category', 'Amount', 'Note'];
    const rows = allExpenses.map(e => {
      const cleanSector = (e.sector || '').replace(/"/g, '""');
      const cleanSub = (e.subCategory || '').replace(/"/g, '""');
      const cleanNote = (e.note || '').replace(/"/g, '""');
      return [e.date, `"${cleanSector}"`, `"${cleanSub}"`, e.amount, `"${cleanNote}"`];
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `khoroch_expense_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveBudget = (e) => {
    e.preventDefault();
    if (!budgetLimit || isNaN(budgetLimit) || parseInt(budgetLimit) <= 0) return;

    const targetId = 'bud_' + Math.random().toString(36).substring(2, 15);
    const payload = {
      id: targetId,
      type: budgetType,
      limit: Math.round(parseInt(budgetLimit)),
      scope: budgetScope,
      days: budgetType === 'next-n-days' ? parseInt(budgetDays) : null,
      startDate: budgetType === 'next-n-days' ? getTodayDateString() : null,
      deleted: false
    };

    saveRecordLocallyAndCloud('budgets', targetId, payload);
    setBudgetLimit('');
    setBudgetScope('all');
    setIsAddBudgetOpen(false);
  };

  const handleDeleteBudget = (id) => {
    const targeted = budgets[id];
    if (targeted) {
      const payload = { ...targeted, deleted: true };
      saveRecordLocallyAndCloud('budgets', id, payload);
    }
  };

  const triggerCopyNotice = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const currentMonthYearStr = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, [currentDate]);

  const activeMonthExpenses = useMemo(() => {
    return Object.values(expenses)
      .filter(item => !item.deleted && item.date.startsWith(currentMonthYearStr))
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  }, [expenses, currentMonthYearStr]);

  const activeMonthTotal = useMemo(() => {
    return activeMonthExpenses.reduce((sum, item) => sum + item.amount, 0);
  }, [activeMonthExpenses]);

  const activeSectorsList = useMemo(() => {
    return Object.values(sectors).filter(s => !s.deleted);
  }, [sectors]);

  useEffect(() => {
    const sectorObj = activeSectorsList.find(s => s.name === txSector);
    if (sectorObj && sectorObj.subCategories && sectorObj.subCategories.length > 0) {
      setTxSubCategory(sectorObj.subCategories[0]);
    } else {
      setTxSubCategory('');
    }
  }, [txSector, activeSectorsList]);

  const sectorBreakdowns = useMemo(() => {
    const map = {};
    activeSectorsList.forEach(s => {
      map[s.name] = { name: s.name, total: 0, subCategoryBreakdowns: {} };
    });

    activeMonthExpenses.forEach(item => {
      if (map[item.sector]) {
        map[item.sector].total += item.amount;
        if (item.subCategory) {
          map[item.sector].subCategoryBreakdowns[item.subCategory] = 
            (map[item.sector].subCategoryBreakdowns[item.subCategory] || 0) + item.amount;
        }
      } else {
        if (!map[item.sector]) {
          map[item.sector] = { name: item.sector, total: 0, subCategoryBreakdowns: {} };
        }
        map[item.sector].total += item.amount;
      }
    });

    return Object.values(map)
      .filter(entry => entry.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [activeMonthExpenses, activeSectorsList]);

  const activeBudgetsCalculated = useMemo(() => {
    const today = new Date();
    
    const currentMonday = new Date(today);
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    currentMonday.setDate(diff);
    currentMonday.setHours(0,0,0,0);

    const SundayEnd = new Date(currentMonday);
    SundayEnd.setDate(currentMonday.getDate() + 6);
    SundayEnd.setHours(23,59,59,999);

    const allValidExpenses = Object.values(expenses).filter(e => !e.deleted);

    return Object.values(budgets)
      .filter(b => !b.deleted)
      .map(b => {
        let spent = 0;
        let periodLabel = '';

        if (b.type === 'monthly') {
          periodLabel = `Monthly (${currentDate.toLocaleString('default', { month: 'long' })})`;
          spent = allValidExpenses
            .filter(e => e.date.startsWith(currentMonthYearStr) && (b.scope === 'all' || e.sector === b.scope))
            .reduce((sum, e) => sum + e.amount, 0);
        } else if (b.type === 'weekly') {
          periodLabel = 'Weekly (Current Week)';
          spent = allValidExpenses
            .filter(e => {
              const txD = new Date(e.date);
              txD.setHours(0,0,0,0);
              const matchesWeek = txD >= currentMonday && txD <= SundayEnd;
              const matchesScope = b.scope === 'all' || e.sector === b.scope;
              return matchesWeek && matchesScope;
            })
            .reduce((sum, e) => sum + e.amount, 0);
        } else if (b.type === 'next-n-days') {
          const start = new Date(b.startDate);
          start.setHours(0,0,0,0);
          const end = new Date(start);
          end.setDate(start.getDate() + b.days - 1);
          end.setHours(23,59,59,999);
          
          periodLabel = `${b.days} Days starting ${b.startDate}`;
          spent = allValidExpenses
            .filter(e => {
              const txD = new Date(e.date);
              txD.setHours(0,0,0,0);
              const matchesDays = txD >= start && txD <= end;
              const matchesScope = b.scope === 'all' || e.sector === b.scope;
              return matchesDays && matchesScope;
            })
            .reduce((sum, e) => sum + e.amount, 0);
        }

        const remaining = b.limit - spent;
        const progress = Math.min((spent / b.limit) * 100, 100);
        const overspent = spent - b.limit;

        return {
          ...b,
          periodLabel,
          spent,
          remaining,
          progress,
          overspent
        };
      });
  }, [budgets, expenses, currentMonthYearStr, currentDate]);

  const activeAlerts = useMemo(() => {
    return activeBudgetsCalculated.filter(b => b.overspent > 0);
  }, [activeBudgetsCalculated]);

  const budgetSectorOverview = useMemo(() => {
    return activeSectorsList.map((sector) => {
      const spent = sectorBreakdowns.find((entry) => entry.name === sector.name)?.total || 0;
      const budget = activeBudgetsCalculated.find((entry) => entry.scope === sector.name && entry.type === 'monthly');
      const limit = budget?.limit || 0;
      const progress = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
      const level = !limit ? 'No budget set' : spent > limit ? 'Over budget' : progress >= 80 ? 'Close to limit' : 'On track';

      return { ...sector, spent, limit, progress, level };
    });
  }, [activeSectorsList, sectorBreakdowns, activeBudgetsCalculated]);

  const homeBudgetSummary = useMemo(() => {
    const totalLimit = activeBudgetsCalculated.reduce((sum, budget) => sum + budget.limit, 0);
    const totalSpent = activeBudgetsCalculated.reduce((sum, budget) => sum + budget.spent, 0);
    const progress = totalLimit ? Math.min(Math.round((totalSpent / totalLimit) * 100), 100) : 0;
    return { totalLimit, totalSpent, progress, budgets: activeBudgetsCalculated.slice(0, 3) };
  }, [activeBudgetsCalculated]);

  const comparisonStats = useMemo(() => {
    const todayStr = getTodayDateString();
    const today = new Date();
    const allExpenses = Object.values(expenses).filter(e => !e.deleted);

    const getSumBetweenDates = (startStr, endStr) => {
      return allExpenses
        .filter(e => e.date >= startStr && e.date <= endStr)
        .reduce((sum, e) => sum + e.amount, 0);
    };

    const getFormattedDateWithOffset = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    if (comparisonPeriod === 'day') {
      const yesterdayStr = getFormattedDateWithOffset(1);
      const todayTotal = getSumBetweenDates(todayStr, todayStr);
      const yesterdayTotal = getSumBetweenDates(yesterdayStr, yesterdayStr);

      const diffPercent = yesterdayTotal === 0 
        ? (todayTotal > 0 ? 100 : 0) 
        : Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100);

      return {
        currentLabel: 'Today',
        currentVal: todayTotal,
        prevLabel: 'Yesterday',
        prevVal: yesterdayTotal,
        diffPercent,
        trend: todayTotal >= yesterdayTotal ? 'up' : 'down'
      };
    } else if (comparisonPeriod === 'week') {
      const d7Start = getFormattedDateWithOffset(6);
      const d14Start = getFormattedDateWithOffset(13);
      const d14End = getFormattedDateWithOffset(7);

      const thisWeekTotal = getSumBetweenDates(d7Start, todayStr);
      const prevWeekTotal = getSumBetweenDates(d14Start, d14End);

      const diffPercent = prevWeekTotal === 0
        ? (thisWeekTotal > 0 ? 100 : 0)
        : Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100);

      return {
        currentLabel: 'Last 7 Days',
        currentVal: thisWeekTotal,
        prevLabel: 'Prev 7 Days',
        prevVal: prevWeekTotal,
        diffPercent,
        trend: thisWeekTotal >= prevWeekTotal ? 'up' : 'down'
      };
    } else {
      const currentDayNumber = today.getDate();
      const currentMonthIndex = today.getMonth();
      const currentYear = today.getFullYear();

      const mtdStart = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-01`;
      const thisMtdTotal = getSumBetweenDates(mtdStart, todayStr);

      let prevMonthIndex = currentMonthIndex - 1;
      let prevMonthYear = currentYear;
      if (prevMonthIndex < 0) {
        prevMonthIndex = 11;
        prevMonthYear -= 1;
      }

      const prevMonthStart = `${prevMonthYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-01`;
      const prevMonthEnd = `${prevMonthYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-${String(currentDayNumber).padStart(2, '0')}`;
      
      const prevMtdTotal = getSumBetweenDates(prevMonthStart, prevMonthEnd);

      const diffPercent = prevMtdTotal === 0
        ? (thisMtdTotal > 0 ? 100 : 0)
        : Math.round(((thisMtdTotal - prevMtdTotal) / prevMtdTotal) * 100);

      return {
        currentLabel: 'Month-to-Date',
        currentVal: thisMtdTotal,
        prevLabel: 'Same range last month',
        prevVal: prevMtdTotal,
        diffPercent,
        trend: thisMtdTotal >= prevMtdTotal ? 'up' : 'down'
      };
    }
  }, [expenses, comparisonPeriod]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => {
      const copy = new Date(prev);
      copy.setMonth(prev.getMonth() - 1);
      return copy;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => {
      const copy = new Date(prev);
      copy.setMonth(prev.getMonth() + 1);
      return copy;
    });
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-emerald-400">Khoroch</h1>
            <p className="text-xs text-slate-500">Personal expense tracker</p>
          </div>
          <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            {authError && <p className="text-xs text-rose-400 font-semibold">{authError}</p>}
            <button
              type="submit"
              disabled={authBusy}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {authBusy ? 'Please wait...' : authMode === 'login' ? 'Log in' : 'Sign up'}
            </button>
          </form>
          <button
            onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-300"
          >
            {authMode === 'login' ? "No account? Sign up" : "Have an account? Log in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950 font-sans pb-24">
      
      {/* Header element */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-950/40">
              <span className="text-white font-extrabold text-xl">৳</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Khoroch</h1>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">Offline-First Personal Expense Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              syncStatus === 'synced' && !!firebaseConfig.apiKey
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' 
                : syncStatus === 'pending'
                ? 'bg-yellow-950/40 border-yellow-800/60 text-yellow-400 animate-pulse'
                : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                syncStatus === 'synced' && !!firebaseConfig.apiKey ? 'bg-emerald-400' : syncStatus === 'pending' ? 'bg-yellow-400' : 'bg-slate-600'
              }`} />
              <span className="hidden xs:inline capitalize">
                {syncStatus === 'synced' && !!firebaseConfig.apiKey ? 'Synced' : syncStatus === 'pending' ? 'Syncing...' : 'Local Engine Only'}
              </span>
            </div>

            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-white transition-all text-slate-300 border border-slate-850"
              title="Cloud Sync Setup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
        {activeTab === 'home' && (
          <>
        {activeAlerts.length > 0 && (
          <div className="space-y-2">
            {activeAlerts.map(alert => (
              <div 
                key={alert.id}
                className="bg-rose-950/30 border border-rose-900/50 rounded-xl p-4 flex items-start gap-3 text-rose-200 animate-fadeIn"
              >
                <div className="p-1 rounded-lg bg-rose-900/50 text-rose-400 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm">Budget Bound Exceeded</h4>
                  <p className="text-xs text-rose-300 mt-0.5">
                    Your <span className="font-semibold text-rose-200">{alert.periodLabel}</span> budget {alert.scope !== 'all' ? ` for ${alert.scope}` : ''} has been exceeded by <span className="font-bold underline">{formatCurrency(alert.overspent)}</span>.
                  </p>
                </div>
                <button 
                  onClick={() => handleDeleteBudget(alert.id)}
                  className="text-rose-400 hover:text-rose-200 text-xs font-semibold hover:underline"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          
          <div className="relative overflow-hidden rounded-2xl border border-emerald-800/70 bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 p-5 shadow-xl shadow-emerald-950/25">
            <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-emerald-400/20 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Monthly Spent</span>
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                <button onClick={handlePrevMonth} className="text-slate-400 hover:text-emerald-400 p-0.5 rounded transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs font-semibold px-1 select-none text-slate-300">
                  {currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
                </span>
                <button onClick={handleNextMonth} className="text-slate-400 hover:text-emerald-400 p-0.5 rounded transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div>
              <h3 className="text-3xl font-extrabold text-emerald-400 font-mono tracking-tight">
                {formatCurrency(activeMonthTotal)}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Accrued across <span className="font-bold text-slate-300">{activeMonthExpenses.length}</span> individual logs
              </p>
            </div>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-800/60 bg-gradient-to-br from-violet-950 via-slate-900 to-slate-900 p-5 shadow-xl shadow-violet-950/25">
            <button
              onClick={() => {
                setTxId(null);
                setTxDate(getTodayDateString());
                setTxAmount('');
                setTxNote('');
                setIsAddExpenseOpen(true);
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-950/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
              </svg>
              Log New Expense
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsAddSectorOpen(true)}
                className="py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-850 text-xs font-bold text-slate-300 transition"
              >
                + Custom Sector
              </button>
              <button
                onClick={() => setIsAddBudgetOpen(true)}
                className="py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-850 text-xs font-bold text-slate-300 transition"
              >
                + Set Budget
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 items-start">
          
          <div className="space-y-6">
            
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-slate-950/30">
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm tracking-wide text-slate-400 uppercase">Active Budgets</h3>
                <span className="text-xs text-slate-500 font-semibold">Total: {activeBudgetsCalculated.length}</span>
              </div>

              {activeBudgetsCalculated.length === 0 ? (
                <div className="text-center py-6 bg-slate-950 rounded-xl border border-dashed border-slate-800">
                  <p className="text-xs text-slate-500">No configured budgets.</p>
                  <button 
                    onClick={() => setIsAddBudgetOpen(true)} 
                    className="text-xs text-emerald-500 hover:underline font-semibold mt-1"
                  >
                    Setup Budget
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeBudgetsCalculated.map(budget => {
                    const isExceeded = budget.overspent > 0;
                    return (
                      <div key={budget.id} className="space-y-1.5 p-3 rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 transition">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-200 block capitalize">{budget.periodLabel}</span>
                            <span className="text-[10px] text-slate-500 font-medium">Scope: {budget.scope === 'all' ? 'All sectors' : budget.scope}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteBudget(budget.id)}
                            className="text-slate-600 hover:text-rose-400 p-1 rounded transition"
                            title="Delete Budget"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-11v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-850 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${isExceeded ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${budget.progress}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                          <span className="text-slate-500">Spent: <span className="font-bold text-slate-300">{formatCurrency(budget.spent)}</span></span>
                          <span className={`${isExceeded ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                            {isExceeded ? `Over: ${formatCurrency(budget.overspent)}` : `Remaining: ${formatCurrency(budget.remaining)}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
              <h3 className="font-bold text-sm tracking-wide text-slate-400 uppercase">Sector Breakdown</h3>
              
              {sectorBreakdowns.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-500">No dynamic sector insights available.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sectorBreakdowns.map(entry => {
                    const percent = activeMonthTotal > 0 ? Math.round((entry.total / activeMonthTotal) * 100) : 0;
                    return (
                      <div key={entry.name} className="space-y-1.5 animate-fadeIn">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-300">{entry.name}</span>
                            <span className="text-[10px] text-slate-500">({percent}%)</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-400">{formatCurrency(entry.total)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-850 overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        
                        {Object.keys(entry.subCategoryBreakdowns).length > 0 && (
                          <div className="pl-3 border-l border-slate-800 space-y-1 text-[10px] text-slate-400 pt-1">
                            {Object.entries(entry.subCategoryBreakdowns).map(([sub, amount]) => (
                              <div key={sub} className="flex items-center justify-between">
                                <span>{sub}</span>
                                <span className="font-mono">{formatCurrency(amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <section className="relative overflow-hidden rounded-3xl border border-indigo-800/60 bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 p-5 shadow-2xl shadow-indigo-950/30">
              <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
              <div className="absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-300">Budget at a glance</p>
                    <h3 className="mt-1 text-xl font-extrabold text-white">Your money map</h3>
                    <p className="mt-1 text-xs text-slate-300">A quick view of spending against your active plans.</p>
                  </div>
                  <button onClick={() => setIsAddBudgetOpen(true)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-extrabold text-white ring-1 ring-white/15 transition hover:bg-white/20">
                    + Budget
                  </button>
                </div>

                {homeBudgetSummary.totalLimit > 0 ? (
                  <div className="mt-5 grid grid-cols-[112px_1fr] items-center gap-4 sm:grid-cols-[132px_1fr]">
                    <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-full p-2 sm:h-32 sm:w-32" style={{ background: `conic-gradient(${activeAlerts.length ? '#fb7185' : '#34d399'} ${homeBudgetSummary.progress}%, rgba(255,255,255,0.12) 0)` }}>
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950/95 text-center">
                        <span className="font-mono text-2xl font-black text-white">{homeBudgetSummary.progress}%</span>
                        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">used</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Spent</p>
                          <p className="mt-1 font-mono text-sm font-extrabold text-white">{formatCurrency(homeBudgetSummary.totalSpent)}</p>
                        </div>
                        <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Budget</p>
                          <p className="mt-1 font-mono text-sm font-extrabold text-white">{formatCurrency(homeBudgetSummary.totalLimit)}</p>
                        </div>
                      </div>
                      <p className={`text-xs font-bold ${activeAlerts.length ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {activeAlerts.length ? `${activeAlerts.length} budget${activeAlerts.length === 1 ? '' : 's'} need attention` : 'Looking good — your plans are on track.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl bg-white/10 p-5 text-center ring-1 ring-white/10">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400 to-indigo-500 text-xl font-black text-white">৳</div>
                    <p className="mt-3 text-sm font-extrabold text-white">Give your spending a target</p>
                    <p className="mt-1 text-xs text-slate-300">Create a budget to see your visual money map here.</p>
                  </div>
                )}

                {homeBudgetSummary.budgets.length > 0 && (
                  <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {homeBudgetSummary.budgets.map((budget, index) => {
                      const palette = [
                        'from-cyan-500/25 to-blue-600/20 text-cyan-200',
                        'from-fuchsia-500/25 to-purple-600/20 text-fuchsia-200',
                        'from-amber-400/25 to-orange-600/20 text-amber-100'
                      ][index];
                      return (
                        <div key={budget.id} className={`rounded-2xl bg-gradient-to-br ${palette} p-3 ring-1 ring-white/10`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-extrabold">{budget.scope === 'all' ? 'All sectors' : budget.scope}</span>
                            <span className="text-[10px] font-bold">{Math.round(budget.progress)}%</span>
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-950/30"><div className="h-full rounded-full bg-white" style={{ width: `${budget.progress}%` }} /></div>
                          <p className="mt-2 text-[11px] font-semibold text-white/85">{formatCurrency(budget.spent)} of {formatCurrency(budget.limit)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-200">Expenditure Logs</h3>
                  <p className="text-xs text-slate-500">Newest logs shown first</p>
                </div>
                <span className="text-xs font-mono bg-slate-950 border border-slate-800 px-3 py-1 rounded-full text-slate-400 font-bold">
                  {activeMonthExpenses.length} entries
                </span>
              </div>

              {activeMonthExpenses.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
                  <div className="w-16 h-16 mx-auto rounded-full bg-slate-950 flex items-center justify-center text-slate-600 mb-4">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <h4 className="text-slate-400 font-bold text-sm">No expenses logged yet</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">Add items using the log button to build monthly trends.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto pr-1">
                  {activeMonthExpenses.map(item => (
                    <div 
                      key={item.id} 
                      className="py-3 flex items-center justify-between group hover:bg-slate-950/40 px-2 rounded-xl transition-all"
                    >
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-200">{item.sector}</span>
                          {item.subCategory && (
                            <span className="text-[10px] bg-slate-950 text-slate-400 border border-slate-850 px-2 py-0.5 rounded-full font-semibold">
                              {item.subCategory}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(item.date).toLocaleDateString('default', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        {item.note && (
                          <p className="text-xs text-slate-400 italic break-words line-clamp-2 max-w-md">
                            {item.note}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-extrabold text-sm text-emerald-400">
                          {formatCurrency(item.amount)}
                        </span>
                        
                        <div className="flex items-center gap-1 opacity-90 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditExpense(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(item.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-950/60 hover:text-rose-400 transition"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-11v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
          </>
        )}

        {activeTab === 'budget' && (
          <section className="space-y-5 animate-fadeIn">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-500">Monthly view</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-100">Your budget pulse</h2>
                <p className="mt-1 text-sm text-slate-500">See every sector at a glance, including the ones you have not spent from yet.</p>
              </div>
              <button
                onClick={() => setIsAddBudgetOpen(true)}
                className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400"
              >
                + Set budget
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 rounded-2xl border border-emerald-800/50 bg-gradient-to-br from-emerald-950/70 to-slate-900 p-4 sm:col-span-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/80">Spent this month</p>
                <p className="mt-2 font-mono text-2xl font-extrabold text-emerald-400">{formatCurrency(activeMonthTotal)}</p>
                <p className="mt-1 text-xs text-slate-400">Across {activeMonthExpenses.length} entries</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Budgets</p>
                <p className="mt-2 font-mono text-2xl font-extrabold text-slate-100">{activeBudgetsCalculated.length}</p>
                <p className="mt-1 text-xs text-slate-500">Active plans</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Watch list</p>
                <p className="mt-2 font-mono text-2xl font-extrabold text-rose-400">{activeAlerts.length}</p>
                <p className="mt-1 text-xs text-slate-500">Over budget</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-850 bg-slate-900 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-100">Sector levels</h3>
                  <p className="text-xs text-slate-500">Budget, spent amount, and current level.</p>
                </div>
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] font-bold text-slate-500">{budgetSectorOverview.length} sectors</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {budgetSectorOverview.map((sector) => {
                  const isOver = sector.limit > 0 && sector.spent > sector.limit;
                  const isNearLimit = sector.limit > 0 && sector.progress >= 80 && !isOver;
                  const tone = isOver ? 'rose' : isNearLimit ? 'amber' : 'emerald';
                  const toneClasses = {
                    emerald: 'bg-emerald-500 text-emerald-400 border-emerald-900/60',
                    amber: 'bg-amber-400 text-amber-400 border-amber-900/60',
                    rose: 'bg-rose-500 text-rose-400 border-rose-900/60'
                  }[tone];

                  return (
                    <div key={sector.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-200">{sector.name}</p>
                          <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClasses.split(' ').slice(2).join(' ')} ${toneClasses.split(' ')[1]}`}>{sector.level}</p>
                        </div>
                        <span className="font-mono text-sm font-extrabold text-emerald-400">{formatCurrency(sector.spent)}</span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full rounded-full ${toneClasses.split(' ')[0]}`} style={{ width: `${sector.progress}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[11px]">
                        <span className="text-slate-500">Spent {formatCurrency(sector.spent)}</span>
                        <span className="font-semibold text-slate-400">{sector.limit ? `Budget ${formatCurrency(sector.limit)}` : 'No limit'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'habit' && (
          <section className="flex min-h-[56vh] items-center justify-center animate-fadeIn">
            <div className="max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl shadow-slate-950/30">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950 text-2xl">✓</div>
              <h2 className="mt-5 text-xl font-extrabold">Habit Track is coming soon</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">A focused place to build routines alongside your spending habits.</p>
            </div>
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="mx-auto max-w-md animate-fadeIn">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-slate-950/30">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-2xl font-extrabold text-slate-950">
                {(user.displayName || user.email || 'K').trim().charAt(0).toUpperCase()}
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-500">Profile</p>
              <h2 className="mt-1 text-2xl font-extrabold text-slate-100">{user.displayName || user.email?.split('@')[0] || 'Khoroch user'}</h2>
              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-200">{user.email || 'Not available'}</p>
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-center justify-around border border-slate-800/90 bg-slate-900/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(2,6,23,0.45)] backdrop-blur-lg">
        {[
          { id: 'home', label: 'Home', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10.5Z" /> },
          { id: 'budget', label: 'Budget', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19V9m5 10V5m5 14v-7m5 7V3" /> },
          { id: 'habit', label: 'Habit Track', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-5m5 3a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /> },
          { id: 'profile', label: 'Profile', icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" /><circle cx="9.5" cy="7" r="4" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 8v6m3-3h-6" /></> }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-bold transition ${
              activeTab === item.id ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/30' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* MODALS AREA */}

      {/* Log/Edit Modal */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-850 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-200 text-base">{txId ? 'Edit Spent Log' : 'Add New Spent Log'}</h3>
              <button 
                onClick={() => setIsAddExpenseOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Date</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => shiftTxDate(-1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 transition hover:border-emerald-800 hover:text-emerald-400"
                      title="Previous day"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <input
                      type="date"
                      required
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="min-w-0 flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => shiftTxDate(1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 transition hover:border-emerald-800 hover:text-emerald-400"
                      title="Next day"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="m9 6 6 6-6 6" /></svg>
                    </button>
                  </div>
                  <button type="button" onClick={() => setTxDate(getTodayDateString())} className="mt-1 text-[10px] font-bold text-emerald-500 hover:text-emerald-400">Jump to today</button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Amount (৳)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 500"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Sector</label>
                  <select
                    value={txSector}
                    onChange={(e) => setTxSector(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {activeSectorsList.map(sec => (
                      <option key={sec.id} value={sec.name}>{sec.name}</option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const sObj = activeSectorsList.find(s => s.name === txSector);
                  if (sObj && sObj.subCategories && sObj.subCategories.length > 0) {
                    return (
                      <div className="space-y-1 animate-fadeIn">
                        <label className="text-xs font-bold text-slate-400">Sub-category</label>
                        <select
                          value={txSubCategory}
                          onChange={(e) => setTxSubCategory(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          {sObj.subCategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Note (Optional)</label>
                <textarea
                  placeholder="What was this for?"
                  rows="2"
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-sm font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold transition"
                >
                  {txId ? 'Save Changes' : 'Confirm Spent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sector Creation Modal */}
      {isAddSectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-850 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-200 text-base">New Custom Sector</h3>
              <button 
                onClick={() => setIsAddSectorOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveSector} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Sector Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Health, Utilities"
                  value={newSectorName}
                  onChange={(e) => setNewSectorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Sub-categories (Optional)</label>
                <input
                  type="text"
                  placeholder="Comma separated: e.g. Medicine, Doctor"
                  value={newSectorSubs}
                  onChange={(e) => setNewSectorSubs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">If specified, choosing this sector activates a secondary context dropdown choice.</p>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddSectorOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-sm font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold transition"
                >
                  Create Sector
                </button>
              </div>
            </form>

            {activeSectorsList.filter(s => s.custom).length > 0 && (
              <div className="px-6 pb-6 border-t border-slate-800/60 pt-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">My Custom Sectors</h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {activeSectorsList.filter(s => s.custom).map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg text-xs">
                      <span className="text-slate-200 font-semibold">{s.name}</span>
                      <button
                        onClick={() => handleDeleteSector(s.id)}
                        className="text-rose-400 hover:text-rose-200"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget Creator Modal */}
      {isAddBudgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-850 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-200 text-base">Configure Smart Budget</h3>
              <button 
                onClick={() => setIsAddBudgetOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Budget Limit (৳)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 5000"
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Scope Filter</label>
                  <select
                    value={budgetScope}
                    onChange={(e) => setBudgetScope(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  >
                    <option value="all">All Sectors</option>
                    {activeSectorsList.map(sec => (
                      <option key={sec.id} value={sec.name}>{sec.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Type of Budget</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'monthly', title: 'Monthly', desc: 'Resets each month' },
                    { id: 'weekly', title: 'Weekly', desc: 'Resets Mon' },
                    { id: 'next-n-days', title: 'N-Days', desc: 'Custom count' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBudgetType(t.id)}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-between ${
                        budgetType === t.id 
                          ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400' 
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-800'
                      }`}
                    >
                      <span className="text-xs font-bold">{t.title}</span>
                      <span className="text-[9px] mt-0.5 opacity-85 leading-tight">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {budgetType === 'next-n-days' && (
                <div className="space-y-1 animate-fadeIn bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <label className="text-xs font-bold text-slate-300">Number of Days starting today</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={budgetDays}
                    onChange={(e) => setBudgetDays(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddBudgetOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-sm font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold transition"
                >
                  Apply Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-device Sync Settings & Developer rules Console */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-850 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-200 text-base">Synchronization & Architecture Console</h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Account */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Account</h4>
                <p className="text-xs text-slate-300 font-mono">{user?.email}</p>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition"
                >
                  Log out
                </button>
              </div>

              {/* Export Section */}
              <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Export Ledger</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">Download a complete CSV backup of all recorded expenses.</p>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition shrink-0"
                >
                  Export to CSV
                </button>
              </div>

              {/* COLLAPSIBLE DEV CONSOLE (For self-hosting/real database deployments) */}
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Developer & Deployments Portal</h4>
                  <div className="flex bg-slate-950 p-0.5 rounded border border-slate-850 text-[10px]">
                    <button 
                      onClick={() => setActiveDevTab('env')}
                      className={`px-2 py-0.5 rounded ${activeDevTab === 'env' ? 'bg-emerald-600/30 text-emerald-400' : 'text-slate-500'}`}
                    >
                      .env Keys
                    </button>
                    <button 
                      onClick={() => setActiveDevTab('rules')}
                      className={`px-2 py-0.5 rounded ${activeDevTab === 'rules' ? 'bg-emerald-600/30 text-emerald-400' : 'text-slate-500'}`}
                    >
                      Firestore Rules
                    </button>
                  </div>
                </div>

                {activeDevTab === 'env' ? (
                  <div className="space-y-2 animate-fadeIn">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Copy these parameters to your local Vite build <code className="text-emerald-400 font-mono">.env</code> file. The app reads these environment variables natively at compilation.
                    </p>
                    <div className="relative bg-slate-950 p-3 rounded-lg border border-slate-850">
                      <pre className="text-[9px] font-mono text-emerald-400/90 overflow-x-auto whitespace-pre leading-relaxed select-all">
{`VITE_FIREBASE_API_KEY="YOUR_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_SENDER_ID"
VITE_FIREBASE_APP_ID="YOUR_APP_ID"`}
                      </pre>
                      <button
                        onClick={() => triggerCopyNotice(
`VITE_FIREBASE_API_KEY="YOUR_API_KEY"
VITE_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
VITE_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
VITE_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_SENDER_ID"
VITE_FIREBASE_APP_ID="YOUR_APP_ID"`, 'envCodes')}
                        className="absolute right-2 top-2 px-2 py-0.5 bg-slate-900 border border-slate-800 text-[9px] text-slate-300 font-bold rounded"
                      >
                        {copiedText === 'envCodes' ? 'Copied' : 'Copy Rules'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 animate-fadeIn">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Deploy these security parameters to your Google Firestore Dashboard. They prevent unauthorized users from editing or reading anyone else's offline sync ledger:
                    </p>
                    <div className="relative bg-slate-950 p-3 rounded-lg border border-slate-850">
                      <pre className="text-[9px] font-mono text-emerald-400/90 overflow-x-auto whitespace-pre leading-relaxed select-all">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{collectionName}/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`}
                      </pre>
                      <button
                        onClick={() => triggerCopyNotice(
`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{collectionName}/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`, 'secRules')}
                        className="absolute right-2 top-2 px-2 py-0.5 bg-slate-900 border border-slate-800 text-[9px] text-slate-300 font-bold rounded"
                      >
                        {copiedText === 'secRules' ? 'Copied' : 'Copy Rules'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between shrink-0 text-xs">
                <span className="text-[10px] text-slate-500">Need a clean canvas workspace?</span>
                <button
                  onClick={handleResetDeviceConnection}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold hover:underline"
                >
                  Clear Cache & Reset Sync
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Element */}
      <footer className="mt-auto py-6 text-center text-[11px] text-slate-600 border-t border-slate-900/60 font-mono">
        Khoroch Personal Tracker • Engine v2.1 (PWA Enabled)
      </footer>
    </div>
  );
}
