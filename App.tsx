import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ExpenseLogger from './components/ExpenseLogger';
import BudgetTable from './components/BudgetTable';
import ChatAssistant from './components/ChatAssistant';
import IncomeManager from './components/IncomeManager';
import TransactionList from './components/TransactionList';
import Login from './components/Login';
import Settings from './components/Settings';
import IncomeLogger from './components/IncomeLogger';

import { getExpenses, saveExpense as saveLocalExpense, saveUserSession, getUserSession, clearUserSession, getAppMode, saveAppMode } from './services/storageService';
import { fetchSheetValues, appendSheetRow, parseBudgetFromSheet, parseExpensesFromSheet, saveBudgetToSheet, saveExpensesToSheet, parseIncomeFromSheet, saveIncomeToSheet } from './services/googleSheetsService';
import { uploadReceiptToDrive } from './services/driveService';
import { isTokenExpired, silentRefreshToken } from './services/authService';
import { Expense, BudgetLineItem, User, IncomeEntry } from './types';
import { DEFAULT_BUDGET_ITEMS } from './constants';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'chat' | 'budget' | 'input' | 'income' | 'income-input' | 'settings'>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>(DEFAULT_BUDGET_ITEMS);
  const [incomeData, setIncomeData] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Global App Mode State (Persistent)
  const [appMode, setAppMode] = useState<'standard' | 'yearly'>('standard');
  const [activePlan, setActivePlan] = useState<string>('');
  const [waExpense, setWaExpense] = useState<any>(null);

  // 1. Check for existing session and mode on mount
  useEffect(() => {
    const initApp = async () => {
      // User Session
      const storedUser = getUserSession();
      if (storedUser) {
        // Check if token is expired and try to refresh
        if (isTokenExpired(storedUser)) {
          console.log('Token expired, attempting silent refresh...');
          const refreshedUser = await silentRefreshToken(storedUser);
          if (refreshedUser) {
            console.log('Token refreshed successfully');
            saveUserSession(refreshedUser);
            setUser(refreshedUser);
          } else {
            console.log('Silent refresh failed, user needs to re-login');
            clearUserSession();
            // User will see login screen
          }
        } else {
          // Token still valid
          setUser(storedUser);
        }
      }

      // Load persisted mode
      const savedMode = getAppMode();
      setAppMode(savedMode.mode);
      setActivePlan(savedMode.planName);

      // Check for WhatsApp bridged expense in URL
      const checkWaExpense = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const waExpenseRaw = urlParams.get('wa_expense');
        if (waExpenseRaw) {
          try {
            const data = JSON.parse(atob(waExpenseRaw));
            setWaExpense(data);
            setActiveTab('input');
            // Clean URL without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (e) {
            console.error("Failed to parse WhatsApp expense", e);
          }
        }
      };

      checkWaExpense();
      window.addEventListener('popstate', checkWaExpense);

      setIsInitializing(false);
      return () => window.removeEventListener('popstate', checkWaExpense);
    };

    initApp();
  }, []);

  const handleModeChange = (mode: 'standard' | 'yearly', planName: string) => {
    setAppMode(mode);
    setActivePlan(planName);
    saveAppMode(mode, planName);
  };

  const handleLogout = () => {
    clearUserSession();
    setUser(null);
    setExpenses([]);
    setBudgetItems(DEFAULT_BUDGET_ITEMS);
    setAppMode('standard');
    setActivePlan('');
  };

  const loadData = useCallback(async (currentUser: User) => {
    setLoading(true);
    try {
      // Sync Budget
      const budgetData = await fetchSheetValues(currentUser, 'Budget!A:D');
      const parsedBudget = parseBudgetFromSheet(budgetData.values);
      // Even if empty, we set it so we can see an empty table
      setBudgetItems(parsedBudget);

      // Sync Expenses
      const expensesData = await fetchSheetValues(currentUser, 'Expenses!A:G'); // Extended range for budgetItemName
      const parsedExpenses = parseExpensesFromSheet(expensesData.values);
      setExpenses(parsedExpenses);

      // Sync Income
      try {
        const incomeSheetData = await fetchSheetValues(currentUser, 'Income!A:L');
        const parsedIncome = parseIncomeFromSheet(incomeSheetData.values);
        setIncomeData(parsedIncome);
      } catch (incomeError) {
        console.warn('Income sheet not found or empty', incomeError);
        setIncomeData([]);
      }

    } catch (error: any) {
      console.error("Sync Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadData(user);
    }
  }, [user]);

  const handleExpenseSave = async (expense: Expense) => {
    // Note: We deliberately do not set global 'loading' state here to allow
    // the ExpenseLogger to perform this in the "background" without blocking the UI.

    if (user) {
      try {
        const row = [
          expense.id,
          expense.date,
          expense.category,
          expense.description,
          expense.amount,
          expense.receiptUrl || '',
          expense.budgetItemName || '' // Save the linked plan name
        ];
        await appendSheetRow(user, 'Expenses!A:G', row);
        // Reload data silently to update the UI with the new row
        const expensesData = await fetchSheetValues(user, 'Expenses!A:G');
        const parsedExpenses = parseExpensesFromSheet(expensesData.values);
        setExpenses(parsedExpenses);

      } catch (error: any) {
        console.error("Save Error", error);
        if (error.message === 'TOKEN_EXPIRED') {
          alert("Session expired. Please log in again.");
          handleLogout();
        } else {
          console.error("Failed to save to Google Sheet.");
        }
      }
    } else {
      // Fallback logic
      saveLocalExpense(expense);
      setExpenses(getExpenses());
    }
  };

  const handleBudgetUpdate = async (newBudgetItems: BudgetLineItem[]) => {
    if (!user) return;
    setLoading(true);
    try {
      // Optimistic update
      setBudgetItems(newBudgetItems);
      await saveBudgetToSheet(user, newBudgetItems);
    } catch (error: any) {
      console.error("Budget Save Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      } else {
        alert("Failed to update budget in Google Sheets.");
        // Revert changes by reloading
        loadData(user);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditExpense = async (updatedExpense: Expense) => {
    if (!user) return;
    try {
      // Update in local state
      const updatedExpenses = expenses.map(e =>
        e.id === updatedExpense.id ? updatedExpense : e
      );
      setExpenses(updatedExpenses);

      // Save to Google Sheets
      await saveExpensesToSheet(user, updatedExpenses);
    } catch (error: any) {
      console.error("Edit Expense Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      } else {
        alert("Failed to update expense. Please try again.");
        loadData(user);
      }
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!user) return;
    try {
      // Remove from local state
      const updatedExpenses = expenses.filter(e => e.id !== expenseId);
      setExpenses(updatedExpenses);

      // Save to Google Sheets
      await saveExpensesToSheet(user, updatedExpenses);
    } catch (error: any) {
      console.error("Delete Expense Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      } else {
        alert("Failed to delete expense. Please try again.");
        loadData(user);
      }
    }
  };

  const handleEditIncome = async (updatedIncome: IncomeEntry) => {
    if (!user) return;
    try {
      // Update in local state
      const updatedIncomeList = incomeData.map(e =>
        e.id === updatedIncome.id ? updatedIncome : e
      );
      setIncomeData(updatedIncomeList);

      // Save to Google Sheets
      await saveIncomeToSheet(user, updatedIncomeList);
    } catch (error: any) {
      console.error("Edit Income Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      } else {
        alert("Failed to update income. Please try again.");
        loadData(user);
      }
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    if (!user) return;
    try {
      const updatedIncomeList = incomeData.filter(e => e.id !== incomeId);
      setIncomeData(updatedIncomeList);
      await saveIncomeToSheet(user, updatedIncomeList);
    } catch (error: any) {
      console.error("Delete Income Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      } else {
        alert("Failed to delete income. Please try again.");
        loadData(user);
      }
    }
  };

  const handleIncomeSave = async (income: IncomeEntry) => {
    if (user) {
      try {
        const row = [
          income.date,
          income.month,
          income.person,
          income.source,
          income.category,
          income.baseIncome,
          income.allowance,
          income.totalIncome,
          income.deduction,
          income.takeHomePay,
          income.paymentMethod || '',
          income.id || crypto.randomUUID()
        ];
        await appendSheetRow(user, 'Income!A:L', row);
        // Reload income data
        const incomeSheetData = await fetchSheetValues(user, 'Income!A:L');
        const parsedIncome = parseIncomeFromSheet(incomeSheetData.values);
        setIncomeData(parsedIncome);
      } catch (error: any) {
        console.error("Income Save Error", error);
        if (error.message === 'TOKEN_EXPIRED') {
          alert("Session expired. Please log in again.");
          handleLogout();
        }
      }
    }
  };

  // Memoized refresh handler for TransactionList
  const handleRefresh = useCallback(async () => {
    if (user) {
      await loadData(user);
    }
  }, [user, loadData]);

  // Show a blank screen or spinner while checking local storage to prevent login flicker
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={(u) => {
      saveUserSession(u);
      setUser(u);
    }} />;
  }

  if (loading && expenses.length === 0 && budgetItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Syncing with your Financial Database...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onRefresh={() => loadData(user)}
      user={user}
      onLogout={handleLogout}
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          expenses={expenses}
          budgetItems={budgetItems}
          user={user}
        />
      )}
      {activeTab === 'input' && (
        <div className="p-4">
          <ExpenseLogger
            onSave={handleExpenseSave}
            onUploadReceipt={async (base64Data, mimeType, fileName, expenseDate) => {
              if (!user) throw new Error('User not logged in');
              return await uploadReceiptToDrive(user, base64Data, mimeType, fileName, expenseDate);
            }}
            budgetItems={budgetItems}
            appMode={appMode}
            activePlan={activePlan}
            onModeChange={handleModeChange}
            initialData={waExpense}
          />
        </div>
      )}
      {activeTab === 'transactions' && (
        <TransactionList
          expenses={expenses}
          onEditExpense={handleEditExpense}
          onDeleteExpense={handleDeleteExpense}
          onRefresh={handleRefresh}
          budgetItems={budgetItems}
        />
      )}
      {activeTab === 'chat' && (
        <ChatAssistant
          onSaveExpense={handleExpenseSave}
          appMode={appMode}
          activePlanName={activePlan}
          budgetItems={budgetItems}
          expenses={expenses}
        />
      )}
      {activeTab === 'budget' && <BudgetTable budgetItems={budgetItems} onUpdateBudget={handleBudgetUpdate} incomeData={incomeData} />}
      {activeTab === 'income' && <IncomeManager incomeData={incomeData} onEditIncome={handleEditIncome} onDeleteIncome={handleDeleteIncome} />}
      {activeTab === 'income-input' && (
        <div className="p-4 md:p-8">
          <IncomeLogger onSave={handleIncomeSave} />
        </div>
      )}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}
