import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { calculateBudgetSummary, formatCurrency } from '../constants';
import { Expense, BudgetLineItem } from '../types';
import { Calendar, TrendingUp, ChevronLeft, ChevronRight, Camera, X, Plane, CreditCard } from 'lucide-react';
import ExpenseLogger from './ExpenseLogger';

interface DashboardProps {
  expenses: Expense[];
  budgetItems: BudgetLineItem[];
  onSaveExpense: (expense: Expense) => Promise<void>;
  onUploadReceipt: (base64Data: string, mimeType: string, fileName: string, expenseDate: string) => Promise<string>;
  appMode: 'standard' | 'yearly';
  activePlan: string;
  onModeChange: (mode: 'standard' | 'yearly', plan: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  expenses,
  budgetItems,
  onSaveExpense,
  onUploadReceipt,
  appMode,
  activePlan,
  onModeChange
}) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly-only' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showLogger, setShowLogger] = useState(false);

  const displayedMonth = selectedDate.getMonth();
  const displayedYear = selectedDate.getFullYear();

  // Filter only Yearly items for the dropdown
  const yearlyBudgetItems = useMemo(() => {
    return budgetItems.filter(item => item.frequency === 'Yearly');
  }, [budgetItems]);

  const activePlanDetails = useMemo(() => {
    return yearlyBudgetItems.find(i => i.name === activePlan);
  }, [activePlan, yearlyBudgetItems]);

  // Navigation handlers
  const handlePrev = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'monthly') {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setFullYear(d.getFullYear() - 1);
      }
      return d;
    });
  };

  const handleNext = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'monthly') {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setFullYear(d.getFullYear() + 1);
      }
      return d;
    });
  };

  const dateLabel = useMemo(() => {
    if (viewMode === 'monthly') {
      return selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'yearly-only') {
      return `Annual Events ${displayedYear}`;
    }
    return `Year ${displayedYear}`;
  }, [viewMode, selectedDate, displayedYear]);

  // Get yearly budget item names for filtering yearly-only expenses
  const yearlyBudgetItemNames = useMemo(() => {
    return new Set(budgetItems.filter(item => item.frequency === 'Yearly').map(item => item.name));
  }, [budgetItems]);

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      const yearMatch = d.getFullYear() === displayedYear;

      if (viewMode === 'monthly') {
        return d.getMonth() === displayedMonth && yearMatch;
      } else if (viewMode === 'yearly-only') {
        // Only include expenses tied to yearly budget items
        return yearMatch && e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
      } else {
        return yearMatch;
      }
    });
  }, [expenses, viewMode, displayedMonth, displayedYear, yearlyBudgetItemNames]);

  // Calculate Chart Data based on view mode and current budgetItems
  const chartData = useMemo(() => {
    const budgetSummary = calculateBudgetSummary(budgetItems);

    return budgetSummary.map(row => {
      let budget = 0;
      let spent = 0;

      if (viewMode === 'monthly') {
        // In monthly mode, we only care about monthly allocations
        budget = row.monthlyAllocation;
        spent = filteredExpenses
          .filter(e => e.category === row.category)
          .reduce((sum, e) => sum + e.amount, 0);
      } else if (viewMode === 'yearly-only') {
        // In yearly-only mode, show only yearly allocations (one-time annual expenses)
        budget = row.yearlyAllocation;
        spent = filteredExpenses
          .filter(e => e.category === row.category)
          .reduce((sum, e) => sum + e.amount, 0);
      } else {
        // In yearly mode, we care about (Monthly * 12) + Yearly Allocation
        budget = (row.monthlyAllocation * 12) + row.yearlyAllocation;
        spent = filteredExpenses
          .filter(e => e.category === row.category)
          .reduce((sum, e) => sum + e.amount, 0);
      }

      return {
        category: row.category,
        budget,
        spent,
        remaining: budget - spent
      };
    }).filter(item => item.budget > 0 || item.spent > 0);
  }, [viewMode, filteredExpenses, budgetItems]);

  const totalSpent = chartData.reduce((acc, curr) => acc + curr.spent, 0);
  const totalBudget = chartData.reduce((acc, curr) => acc + curr.budget, 0);
  const totalRemaining = totalBudget - totalSpent;

  return (
    <div className={`flex flex-col gap-3 p-3 h-full overscroll-none ${showLogger ? 'overflow-y-auto' : 'overflow-hidden'}`}>

      {/* Mode Selector - Compact */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="flex gap-2">
          {/* Standard Mode */}
          <button
            onClick={() => onModeChange('standard', '')}
            className={`flex-1 p-3 rounded-lg border-2 transition-all ${appMode === 'standard'
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-100 bg-gray-50 hover:border-gray-200'
              }`}
          >
            <div className="flex items-center gap-2">
              <CreditCard className={`w-5 h-5 ${appMode === 'standard' ? 'text-indigo-600' : 'text-gray-400'}`} />
              <div className="text-left">
                <div className={`text-sm font-semibold ${appMode === 'standard' ? 'text-indigo-900' : 'text-gray-600'}`}>Standard</div>
                <div className="text-[10px] text-gray-400">Daily spending</div>
              </div>
            </div>
          </button>

          {/* Yearly Mode */}
          <button
            onClick={() => {
              if (appMode !== 'yearly') {
                const defaultPlan = yearlyBudgetItems[0]?.name || '';
                onModeChange('yearly', defaultPlan);
              }
            }}
            className={`flex-1 p-3 rounded-lg border-2 transition-all ${appMode === 'yearly'
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-100 bg-gray-50 hover:border-gray-200'
              }`}
          >
            <div className="flex items-center gap-2">
              <Plane className={`w-5 h-5 ${appMode === 'yearly' ? 'text-purple-600' : 'text-gray-400'}`} />
              <div className="text-left">
                <div className={`text-sm font-semibold ${appMode === 'yearly' ? 'text-purple-900' : 'text-gray-600'}`}>Annual</div>
                <div className="text-[10px] text-gray-400">Events mode</div>
              </div>
            </div>
          </button>
        </div>

        {/* Yearly Plan Dropdown */}
        {appMode === 'yearly' && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <select
              value={activePlan}
              onChange={(e) => onModeChange('yearly', e.target.value)}
              className="w-full rounded-lg border-purple-200 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3 bg-white text-purple-900 font-medium text-sm"
            >
              <option value="">-- Select Plan --</option>
              {yearlyBudgetItems.map((item, idx) => (
                <option key={idx} value={item.name}>{item.name} ({formatCurrency(item.amount)})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Active Mode Banner */}
      {appMode === 'yearly' && activePlanDetails && (
        <div className="bg-purple-600 text-white px-3 py-2 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Plane className="w-4 h-4" />
            <span>Logging to: <strong>{activePlanDetails.name}</strong></span>
          </div>
          <button onClick={() => onModeChange('standard', '')} className="p-1 hover:bg-white/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick Log Button */}
      {showLogger ? (
        <div className="bg-white rounded-xl shadow-lg border-2 border-indigo-100 overflow-hidden relative flex-shrink-0">
          <button
            onClick={() => setShowLogger(false)}
            className="absolute top-3 right-3 z-10 p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
          <div className="p-2 max-h-[70vh] overflow-y-auto">
            <ExpenseLogger
              onSave={onSaveExpense}
              onUploadReceipt={onUploadReceipt}
              budgetItems={budgetItems}
              appMode={appMode}
              activePlan={activePlan}
              onModeChange={onModeChange}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLogger(true)}
          className={`w-full p-4 rounded-xl shadow-md flex items-center justify-center gap-2 text-lg font-bold transition-all ${appMode === 'yearly'
            ? 'bg-purple-600 hover:bg-purple-700 text-white'
            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
        >
          <Camera className="w-6 h-6" />
          {appMode === 'yearly' && activePlanDetails ? `Log to ${activePlanDetails.name}` : "Input Expense"}
        </button>
      )}

      {/* Stats Cards - Fixed Layout */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="text-center px-2">
            <p className="text-[10px] text-gray-400 uppercase">Budget</p>
            <p className="text-sm sm:text-lg font-bold text-emerald-600">{formatCurrency(totalBudget)}</p>
          </div>
          <div className="text-center px-2">
            <p className="text-[10px] text-gray-400 uppercase">Spent</p>
            <p className="text-sm sm:text-lg font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
          </div>
          <div className="text-center px-2">
            <p className="text-[10px] text-gray-400 uppercase">Left</p>
            <p className={`text-sm sm:text-lg font-bold ${totalRemaining < 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {formatCurrency(totalRemaining)}
            </p>
          </div>
        </div>
      </div>

      {/* View Controls - Below Stats */}
      <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between gap-2">
        {/* Date Navigation */}
        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
          <button onClick={handlePrev} className="p-1.5 hover:bg-gray-200 rounded-l-md">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="px-2 py-1 min-w-[90px] sm:min-w-[120px] text-center font-medium text-gray-800 text-xs sm:text-sm">
            {dateLabel}
          </div>
          <button onClick={handleNext} className="p-1.5 hover:bg-gray-200 rounded-r-md">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* View Toggle */}
        <div className="bg-gray-100 p-0.5 rounded-lg flex shadow-inner">
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'monthly'
              ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Calendar className="w-3 h-3" />
            <span className="hidden sm:inline">Monthly</span>
          </button>
          <button
            onClick={() => setViewMode('yearly-only')}
            className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'yearly-only'
              ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Plane className="w-3 h-3" />
            <span className="hidden sm:inline">Annual</span>
          </button>
          <button
            onClick={() => setViewMode('yearly')}
            className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'yearly'
              ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <TrendingUp className="w-3 h-3" />
            <span className="hidden sm:inline">Year</span>
          </button>
        </div>
      </div>

      {/* Main Chart - Compact */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex-1 min-h-0">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Spending vs Budget</h3>
        <div className="h-[200px] sm:h-[280px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={70}
                  tick={{ fontSize: 9, fill: '#6b7280' }}
                  interval={0}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  cursor={{ fill: '#f9fafb' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '10px' }} />
                <Bar dataKey="budget" name="Budget" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
                <Bar dataKey="spent" name="Spent" fill="#1f2937" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-1">
              <TrendingUp className="w-10 h-10 opacity-20" />
              <p className="font-medium text-sm">No budget data</p>
              <p className="text-xs">Configure in Settings</p>
            </div>
          )}
        </div>
      </div>
    </div >
  );
};

export default Dashboard;