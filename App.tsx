import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ExpenseLogger from './components/ExpenseLogger';
import BudgetTable from './components/BudgetTable';
import ChatAssistant from './components/ChatAssistant';
import TransactionList from './components/TransactionList';
import NotificationPage from './components/NotificationPage';
import Login from './components/Login';
import { getExpenses, saveExpense as saveLocalExpense, saveUserSession, getUserSession, clearUserSession, getAppMode, saveAppMode } from './services/storageService';
import { fetchSheetValues, appendSheetRow, parseBudgetFromSheet, parseExpensesFromSheet, saveBudgetToSheet, saveExpensesToSheet } from './services/googleSheetsService';
import { uploadReceiptToDrive } from './services/driveService';
import { isTokenExpired, silentRefreshToken } from './services/authService';
import { requestNotificationPermission, subscribeToPush, showLocalNotification, isNotificationPermissionGranted } from './services/pushNotificationService';
import { getNotifications, saveNotification, createNotification, getUnreadCount } from './services/notificationStorageService';
import { Expense, BudgetLineItem, User, Notification } from './types';
import { DEFAULT_BUDGET_ITEMS, formatCurrency } from './constants';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'chat' | 'budget' | 'input' | 'notifications'>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>(DEFAULT_BUDGET_ITEMS);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Global App Mode State (Persistent)
  const [appMode, setAppMode] = useState<'standard' | 'yearly'>('standard');
  const [activePlan, setActivePlan] = useState<string>('');

  // Global Period Filter State (Shared between Dashboard & Transactions)
  const [globalDate, setGlobalDate] = useState(new Date());
  const [globalViewMode, setGlobalViewMode] = useState<'monthly' | 'yearly-only' | 'yearly'>('monthly');

  // Helper to refresh notifications from storage
  const refreshNotifications = () => {
    setNotifications(getNotifications());
    setUnreadCount(getUnreadCount());
  };

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

      // Load notifications
      refreshNotifications();

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

        // Send and store notification for new expense
        const receiptNotif = createNotification(
          'receipt',
          'app',
          '💰 Expense Logged',
          `${formatCurrency(expense.amount)} spent on ${expense.category}${expense.description ? ': ' + expense.description : ''}`,
          expense.id,
          expense.category
        );
        saveNotification(receiptNotif);
        refreshNotifications();

        if (isNotificationPermissionGranted()) {
          await showLocalNotification(receiptNotif.title, receiptNotif.message);

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
              const budgetExceededNotif = createNotification(
                'budget-exceeded',
                'app',
                '🚨 Budget Exceeded!',
                `${expense.category} is at ${percentUsed.toFixed(0)}% of budget (${formatCurrency(categorySpent)} / ${formatCurrency(categoryBudget)})`,
                undefined,
                expense.category
              );
              saveNotification(budgetExceededNotif);
              refreshNotifications();
              await showLocalNotification(budgetExceededNotif.title, budgetExceededNotif.message);
            } else if (percentUsed >= 80) {
              const budgetWarningNotif = createNotification(
                'budget-warning',
                'app',
                '⚠️ Budget Alert',
                `${expense.category} is at ${percentUsed.toFixed(0)}% of budget (${formatCurrency(categorySpent)} / ${formatCurrency(categoryBudget)})`,
                undefined,
                expense.category
              );
              saveNotification(budgetWarningNotif);
              refreshNotifications();
              await showLocalNotification(budgetWarningNotif.title, budgetWarningNotif.message);
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
      unreadNotificationCount={unreadCount}
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          expenses={expenses}
          budgetItems={budgetItems}
          user={user}
          selectedDate={globalDate}
          setSelectedDate={setGlobalDate}
          viewMode={globalViewMode}
          setViewMode={setGlobalViewMode}
        />
      )}
      {activeTab === 'input' && (
        <div className="flex-1 p-4 overflow-y-auto">
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
          />
        </div>
      )}
      {activeTab === 'transactions' && (
        <TransactionList
          expenses={expenses}
          onEditExpense={handleEditExpense}
          onDeleteExpense={handleDeleteExpense}
          globalDate={globalDate}
          globalViewMode={globalViewMode}
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
      {activeTab === 'notifications' && (
        <NotificationPage
          notifications={notifications}
          onNotificationsChange={refreshNotifications}
        />
      )}
    </Layout>
  );
}
