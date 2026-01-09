import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ExpenseLogger from './components/ExpenseLogger';
import BudgetTable from './components/BudgetTable';
import ChatAssistant from './components/ChatAssistant';
import Login from './components/Login';
import { getExpenses, saveExpense as saveLocalExpense, saveUserSession, getUserSession, clearUserSession, getAppMode, saveAppMode } from './services/storageService';
import { fetchSheetValues, appendSheetRow, parseBudgetFromSheet, parseExpensesFromSheet, saveBudgetToSheet } from './services/googleSheetsService';
import { uploadReceiptToDrive } from './services/driveService';
import { isTokenExpired, silentRefreshToken } from './services/authService';
import { requestNotificationPermission, subscribeToPush, showLocalNotification, isNotificationPermissionGranted } from './services/pushNotificationService';
import { Expense, BudgetLineItem, User } from './types';
import { DEFAULT_BUDGET_ITEMS } from './constants';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'budget'>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>(DEFAULT_BUDGET_ITEMS);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Global App Mode State (Persistent)
  const [appMode, setAppMode] = useState<'standard' | 'yearly'>('standard');
  const [activePlan, setActivePlan] = useState<string>('');

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

      setIsInitializing(false);
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

  const loadData = async (currentUser: User) => {
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

    } catch (error: any) {
      console.error("Sync Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

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

        // Send notification for new expense
        if (isNotificationPermissionGranted()) {
          await showLocalNotification(
            '💰 Expense Logged',
            `$${expense.amount.toFixed(2)} spent on ${expense.category}${expense.description ? ': ' + expense.description : ''}`
          );

          // Check budget threshold for this category
          const categoryBudget = budgetItems
            .filter(item => item.category === expense.category)
            .reduce((sum, item) => sum + (item.frequency === 'Monthly' ? item.amount : item.amount / 12), 0);

          if (categoryBudget > 0) {
            // Calculate total spent in this category this month
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const categorySpent = parsedExpenses
              .filter(e => e.category === expense.category && e.date >= monthStart)
              .reduce((sum, e) => sum + e.amount, 0);

            const percentUsed = (categorySpent / categoryBudget) * 100;

            if (percentUsed >= 100) {
              await showLocalNotification(
                '🚨 Budget Exceeded!',
                `${expense.category} is at ${percentUsed.toFixed(0)}% of budget ($${categorySpent.toFixed(2)} / $${categoryBudget.toFixed(2)})`
              );
            } else if (percentUsed >= 80) {
              await showLocalNotification(
                '⚠️ Budget Alert',
                `${expense.category} is at ${percentUsed.toFixed(0)}% of budget ($${categorySpent.toFixed(2)} / $${categoryBudget.toFixed(2)})`
              );
            }
          }
        }

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

  // Show a blank screen or spinner while checking local storage to prevent login flicker
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={async (u) => {
      saveUserSession(u);
      setUser(u);

      // Request notification permission after login
      const permission = await requestNotificationPermission();
      if (permission === 'granted') {
        await subscribeToPush();
        console.log('Push notifications enabled');
      }
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
          onSaveExpense={handleExpenseSave}
          onUploadReceipt={async (base64Data, mimeType, fileName, expenseDate) => {
            if (!user) throw new Error('User not logged in');
            return await uploadReceiptToDrive(user, base64Data, mimeType, fileName, expenseDate);
          }}
          appMode={appMode}
          activePlan={activePlan}
          onModeChange={handleModeChange}
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
      {activeTab === 'budget' && <BudgetTable budgetItems={budgetItems} onUpdateBudget={handleBudgetUpdate} />}
    </Layout>
  );
}
