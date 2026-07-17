import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'pending', 'offline'
  
  // Storage hooks
  const [expenses, setExpenses] = useState({});
  const [sectors, setSectors] = useState({});
  const [budgets, setBudgets] = useState({});
  
  // Navigation
  const [currentDate, setCurrentDate] = useState(new Date());
  const [comparisonPeriod, setComparisonPeriod] = useState('month');
  
  // Modals & UI Toggles
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddSectorOpen, setIsAddSectorOpen] = useState(false);
  const [isAddBudgetOpen, setIsAddBudgetOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeDevTab, setActiveDevTab] = useState('env'); // 'env' | 'rules'
  
  // Form variables
  const [customSyncIdInput, setCustomSyncIdInput] = useState('');
  const [syncCodeError, setSyncCodeError] = useState('');
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
    const initAuth = async () => {
      const customUid = localStorage.getItem('exp_v2_user_uid');
      if (customUid) {
        setUser({ uid: customUid });
      } else {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else if (firebaseConfig.apiKey !== "mock-api-key") {
            await signInAnonymously(auth);
          }
        } catch (err) {
          console.warn("Auth initialization skipped or using sandbox parameters", err);
        }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        if (!localStorage.getItem('exp_v2_user_uid')) {
          setUser(firebaseUser);
        }
      } else {
        let fallbackId = localStorage.getItem('exp_v2_user_uid');
        if (!fallbackId) {
          fallbackId = 'user_' + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('exp_v2_user_uid', fallbackId);
        }
        setUser({ uid: fallbackId });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || firebaseConfig.apiKey === "mock-api-key") return;
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
          
          if (!localItem || cloudItem.updatedAt > localItem.updatedAt) {
            updated[doc.id] = cloudItem;
            hasChanges = true;
          } else if (localItem && localItem.updatedAt > cloudItem.updatedAt) {
            setDoc(doc.ref, localItem).catch(e => console.error("Cloud catch-up write failure", e));
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

          if (!localItem || cloudItem.updatedAt > localItem.updatedAt) {
            updated[doc.id] = cloudItem;
            hasChanges = true;
          } else if (localItem && localItem.updatedAt > cloudItem.updatedAt) {
            setDoc(doc.ref, localItem).catch(e => console.error("Cloud push custom sector error", e));
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

          if (!localItem || cloudItem.updatedAt > localItem.updatedAt) {
            updated[doc.id] = cloudItem;
            hasChanges = true;
          } else if (localItem && localItem.updatedAt > cloudItem.updatedAt) {
            setDoc(doc.ref, localItem).catch(e => console.error("Cloud push budgets error", e));
          }
        });

        if (hasChanges) {
          localStorage.setItem('exp_v2_budgets', JSON.stringify(updated));
          return updated;
        }
        return prevBudgets;
      });
    }, () => {});

    return () => {
      unsubExpenses();
      unsubSectors();
      unsubBudgets();
    };
  }, [user, isOnline]);

  const saveRecordLocallyAndCloud = async (collectionName, id, data) => {
    const timestampedData = { ...data, updatedAt: Date.now() };

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
    if (isOnline && user && firebaseConfig.apiKey !== "mock-api-key") {
      setSyncStatus('pending');
      try {
        const itemRef = doc(db, 'artifacts', appId, 'users', user.uid, collectionName, id);
        await setDoc(itemRef, timestampedData);
        setSyncStatus('synced');
      } catch (err) {
        console.warn("Background persistence failed, holding local copy", err);
        setSyncStatus('offline');
      }
    } else {
      setSyncStatus('offline');
    }
  };

  const handleSaveExpense = (e) => {
    e.preventDefault();
    if (!txAmount || isNaN(txAmount) || parseInt(txAmount) <= 0) return;

    const targetId = txId || 'tx_' + Math.random().toString(36).substring(2, 15);
    const chosenSectorObj = Object.values(sectors).find(s => s.name === txSector);
    const expectsSub = chosenSectorObj && chosenSectorObj.subCategories && chosenSectorObj.subCategories.length > 0;

    const payload = {
      id: targetId,
      date: txDate,
      sector: txSector,
      subCategory: expectsSub ? txSubCategory : '',
      amount: Math.round(parseInt(txAmount)),
      note: txNote.trim(),
      deleted: false
    };

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

  const handleConnectSyncId = (e) => {
    e.preventDefault();
    const cleanId = customSyncIdInput.trim();
    if (!cleanId) {
      setSyncCodeError("ID value is required.");
      return;
    }
    
    localStorage.setItem('exp_v2_user_uid', cleanId);
    setUser({ uid: cleanId });
    setSyncCodeError('');
    setIsSettingsOpen(false);
    
    setExpenses({});
    setBudgets({});
  };

  const handleResetDeviceConnection = () => {
    localStorage.removeItem('exp_v2_user_uid');
    window.location.reload();
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950 font-sans pb-10">
      
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
              syncStatus === 'synced' && firebaseConfig.apiKey !== "mock-api-key"
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' 
                : syncStatus === 'pending'
                ? 'bg-yellow-950/40 border-yellow-800/60 text-yellow-400 animate-pulse'
                : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                syncStatus === 'synced' && firebaseConfig.apiKey !== "mock-api-key" ? 'bg-emerald-400' : syncStatus === 'pending' ? 'bg-yellow-400' : 'bg-slate-600'
              }`} />
              <span className="hidden xs:inline capitalize">
                {syncStatus === 'synced' && firebaseConfig.apiKey !== "mock-api-key" ? 'Synced' : syncStatus === 'pending' ? 'Syncing...' : 'Local Engine Only'}
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

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between space-y-3">
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

          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Comparative Insights</span>
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-850 text-xs">
                {['day', 'week', 'month'].map(period => (
                  <button
                    key={period}
                    onClick={() => setComparisonPeriod(period)}
                    className={`px-2.5 py-1 rounded-md font-semibold capitalize transition ${
                      comparisonPeriod === period 
                        ? 'bg-emerald-600 text-slate-950 shadow-md' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-100">
                  {formatCurrency(comparisonStats.currentVal)}
                </span>
                <span className="text-xs text-slate-500">vs {formatCurrency(comparisonStats.prevVal)}</span>
              </div>
              
              <div className="flex items-center gap-1.5 mt-2">
                {comparisonStats.diffPercent > 0 ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-950/60 border border-rose-900/60 text-rose-400 flex items-center gap-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    {comparisonStats.diffPercent}% more
                  </span>
                ) : comparisonStats.diffPercent < 0 ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-900/60 text-emerald-400 flex items-center gap-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    {Math.abs(comparisonStats.diffPercent)}% less
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    Equal level
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium">than {comparisonStats.prevLabel}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex flex-col justify-center space-y-3">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          <div className="lg:col-span-1 space-y-6">
            
            <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
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
          </div>

          <div className="lg:col-span-2 space-y-6">
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
      </main>

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
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
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
              {/* Primary User Sync Connection Bubble */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Dynamic Synchronization Key</h4>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={user?.uid || ''}
                    onClick={(e) => e.target.select()}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-emerald-400 font-mono text-center select-all focus:outline-none"
                  />
                  <button
                    onClick={() => triggerCopyNotice(user?.uid || '', 'uid')}
                    className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-xs text-slate-300 font-bold transition shrink-0 min-w-[55px]"
                  >
                    {copiedText === 'uid' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Provide this key on other terminal browsers to securely aggregate and consolidate offline queues.
                </p>
              </div>

              {/* Terminal Connection Sync Input */}
              <form onSubmit={handleConnectSyncId} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Link to Remote Sync ID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste terminal Sync ID here"
                      value={customSyncIdInput}
                      onChange={(e) => setCustomSyncIdInput(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold rounded-lg transition"
                    >
                      Connect
                    </button>
                  </div>
                  {syncCodeError && (
                    <p className="text-[11px] text-rose-400 font-semibold mt-1">{syncCodeError}</p>
                  )}
                </div>
              </form>

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