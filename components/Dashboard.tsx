import React, { useMemo, useState, useEffect } from 'react';
import { calculateBudgetSummary, formatCurrency } from '../constants';
import { Expense, BudgetLineItem, User } from '../types';
import { Calendar, TrendingUp, ChevronLeft, ChevronRight, ChevronDown, Plane, Receipt, Wallet, CalendarDays, BarChart3, Tag, PieChart, ArrowUp, ArrowDown } from 'lucide-react';

// Royalty-free landscape photos from Unsplash - direct CDN links for reliability
const LANDSCAPE_BACKGROUNDS = [
  // Bali, Indonesia - rice terraces
  'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1604999333679-b86d54738315?w=800&h=600&fit=crop&q=80',
  // Vietnam - Ha Long Bay & landscapes
  'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800&h=600&fit=crop&q=80',
  // China - mountains & landscapes
  'https://images.unsplash.com/photo-1513415564515-763d91423bdd?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&h=600&fit=crop&q=80',
  // Yogyakarta, Indonesia - Borobudur & Prambanan
  'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800&h=600&fit=crop&q=80',
];

// Get a random background image on every refresh
const getRandomBackgroundImage = (): string => {
  const imageIndex = Math.floor(Math.random() * LANDSCAPE_BACKGROUNDS.length);
  return LANDSCAPE_BACKGROUNDS[imageIndex];
};

interface DashboardProps {
  expenses: Expense[];
  budgetItems: BudgetLineItem[];
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({
  expenses,
  budgetItems,
  user
}) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly-only' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAnnualPlan, setSelectedAnnualPlan] = useState<string | null>(null);

  // Get list of yearly budget items for the plan selector
  const yearlyItems = useMemo(() => {
    return budgetItems.filter(item => item.frequency === 'Yearly');
  }, [budgetItems]);

  // Auto-select first annual plan when switching to yearly-only mode
  useEffect(() => {
    if (viewMode === 'yearly-only' && yearlyItems.length > 0 && !selectedAnnualPlan) {
      setSelectedAnnualPlan(yearlyItems[0].name);
    }
  }, [viewMode, yearlyItems, selectedAnnualPlan]);

  // Get greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // Get first name
  const firstName = user.name.split(' ')[0];

  const displayedMonth = selectedDate.getMonth();
  const displayedYear = selectedDate.getFullYear();

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
        // Exclude expenses linked to yearly budget items in monthly view
        const isYearlyExpense = e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
        return d.getMonth() === displayedMonth && yearMatch && !isYearlyExpense;
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
    if (viewMode === 'yearly-only') {
      // In yearly-only mode, show individual yearly budget items by name
      const yearlyItems = budgetItems.filter(item => item.frequency === 'Yearly');
      return yearlyItems.map(item => {
        const spent = filteredExpenses
          .filter(e => e.budgetItemName === item.name)
          .reduce((sum, e) => sum + e.amount, 0);
        return {
          category: item.name, // Show plan name like "Vacation Bali"
          budget: item.amount,
          spent,
          remaining: item.amount - spent
        };
      }).filter(item => item.budget > 0 || item.spent > 0);
    }

    // For monthly and yearly views, use category-based summary
    const budgetSummary = calculateBudgetSummary(budgetItems);

    return budgetSummary.map(row => {
      let budget = 0;
      let spent = 0;

      if (viewMode === 'monthly') {
        // In monthly mode, only show monthly allocations (yearly is handled separately)
        budget = row.monthlyAllocation;
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

  // Calculate This Month's Stats from actual spending (excluding yearly expenses)
  // Calculate Period Stats based on selected period (not just current month)
  const periodStats = useMemo(() => {
    // Use selected period for filtering
    const periodExpenses = viewMode === 'monthly'
      ? expenses.filter(e => {
        const d = new Date(e.date);
        const isYearlyExpense = e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
        return d.getMonth() === displayedMonth && d.getFullYear() === displayedYear && !isYearlyExpense;
      })
      : viewMode === 'yearly-only'
        ? expenses.filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === displayedYear && e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
        })
        : expenses.filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === displayedYear;
        });

    const totalReceipts = periodExpenses.length;

    // Days in period for daily average
    const now = new Date();
    let daysInPeriod = 1;
    if (viewMode === 'monthly') {
      // If viewing current month, use days passed; otherwise use full month
      if (displayedMonth === now.getMonth() && displayedYear === now.getFullYear()) {
        daysInPeriod = now.getDate();
      } else {
        daysInPeriod = new Date(displayedYear, displayedMonth + 1, 0).getDate();
      }
    } else {
      // For yearly views, use days passed in year or full year
      if (displayedYear === now.getFullYear()) {
        const startOfYear = new Date(displayedYear, 0, 1);
        daysInPeriod = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        daysInPeriod = 365;
      }
    }

    const totalSpent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
    const avgDailySpend = daysInPeriod > 0 ? totalSpent / daysInPeriod : 0;

    // Average monthly spend (based on all non-yearly expenses)
    const nonYearlyExpenses = expenses.filter(e => {
      const isYearlyExpense = e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
      return !isYearlyExpense;
    });
    const allMonths = new Set(nonYearlyExpenses.map(e => {
      const d = new Date(e.date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    const monthCount = Math.max(allMonths.size, 1);
    const avgMonthlySpend = nonYearlyExpenses.reduce((sum, e) => sum + e.amount, 0) / monthCount;

    // Top category for this period
    const categoryTotals: Record<string, number> = {};
    periodExpenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const topCategoryName = topCategory ? topCategory[0] : '-';

    return {
      totalReceipts,
      avgDailySpend,
      avgMonthlySpend,
      topCategoryName,
    };
  }, [expenses, yearlyBudgetItemNames, viewMode, displayedMonth, displayedYear]);

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto overscroll-none">

      {/* Greeting */}
      <div className="flex items-center gap-3">
        <img src={user.picture} alt="Profile" className="w-10 h-10 rounded-full border-2 border-indigo-200" />
        <div>
          <p className="text-xs text-gray-500">{greeting}</p>
          <p className="text-base font-bold text-gray-900">{firstName}</p>
        </div>
      </div>

      {/* Period Selector - Above Balance Card */}
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

      {/* Annual Plan Selector - Only show in yearly-only mode */}
      {viewMode === 'yearly-only' && yearlyItems.length > 0 && (
        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-purple-600" />
            <select
              value={selectedAnnualPlan || ''}
              onChange={(e) => setSelectedAnnualPlan(e.target.value)}
              className="flex-1 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm font-medium text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              {yearlyItems.map(item => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Balance Card with rotating landscape background */}
      {(() => {
        // For yearly-only mode, show selected plan's values
        let cardBudget = totalBudget;
        let cardSpent = totalSpent;
        let cardRemaining = totalRemaining;

        if (viewMode === 'yearly-only' && selectedAnnualPlan) {
          const selectedItem = yearlyItems.find(item => item.name === selectedAnnualPlan);
          cardBudget = selectedItem?.amount || 0;
          cardSpent = filteredExpenses
            .filter(e => e.budgetItemName === selectedAnnualPlan)
            .reduce((sum, e) => sum + e.amount, 0);
          cardRemaining = cardBudget - cardSpent;
        }

        return (
          <div
            className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden min-h-[160px]"
            style={{
              backgroundImage: `url(${getRandomBackgroundImage()})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/40 to-black/60" />

            {/* Content */}
            <div className="relative z-10 flex flex-col justify-center py-2">
              <div className="text-center mb-4">
                {viewMode === 'yearly-only' && selectedAnnualPlan && (
                  <p className="text-white font-semibold text-sm mb-1">{selectedAnnualPlan}</p>
                )}
                <p className="text-white/70 text-[10px] uppercase tracking-wider mb-1">
                  {viewMode === 'yearly-only' && selectedAnnualPlan ? 'Remaining' : 'Total Balance'}
                </p>
                <p className={`text-2xl font-bold ${cardRemaining < 0 ? 'text-red-300' : 'text-white'}`}>
                  {formatCurrency(cardRemaining)}
                </p>
              </div>

              <div className="flex justify-around pt-3 border-t border-white/20">
                <div className="text-center flex-1">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <ArrowUp className="w-3 h-3 text-emerald-300" />
                    <span className="text-[10px] text-white/70 uppercase tracking-wide">Budget</span>
                  </div>
                  <p className="text-base font-semibold">{formatCurrency(cardBudget)}</p>
                </div>
                <div className="w-px bg-white/20" />
                <div className="text-center flex-1">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <ArrowDown className="w-3 h-3 text-red-300" />
                    <span className="text-[10px] text-white/70 uppercase tracking-wide">Expense</span>
                  </div>
                  <p className="text-base font-semibold">{formatCurrency(cardSpent)}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Period Stats - Colorful Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-gray-800">
            {viewMode === 'yearly-only' && selectedAnnualPlan ? selectedAnnualPlan : dateLabel}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Total Receipts */}
          <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Receipt className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-medium text-emerald-700">Total Receipts</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">{periodStats.totalReceipts}</p>
          </div>

          {/* Top Category */}
          <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Tag className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[10px] font-medium text-violet-700">Top Category</span>
            </div>
            <p className="text-sm font-bold text-violet-600 truncate capitalize">{periodStats.topCategoryName}</p>
          </div>

          {/* Avg Daily Spend */}
          <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-medium text-amber-700">Avg. Daily Spend</span>
            </div>
            <p className="text-base font-bold text-amber-600">{formatCurrency(periodStats.avgDailySpend)}</p>
          </div>

          {/* Avg Monthly Spend */}
          <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-100">
            <div className="flex items-center gap-1.5 mb-0.5">
              <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[10px] font-medium text-purple-700">Avg. Monthly Spend</span>
            </div>
            <p className="text-base font-bold text-purple-600">{formatCurrency(periodStats.avgMonthlySpend)}</p>
          </div>
        </div>
      </div>

      {/* Main Content - Different view for yearly-only vs other modes */}
      {viewMode === 'yearly-only' && selectedAnnualPlan ? (
        // Annual Events - Show budget summary and transaction list for selected plan
        (() => {
          const selectedBudgetItem = yearlyItems.find(item => item.name === selectedAnnualPlan);
          const planExpenses = filteredExpenses.filter(e => e.budgetItemName === selectedAnnualPlan);
          const totalSpentOnPlan = planExpenses.reduce((sum, e) => sum + e.amount, 0);
          const budget = selectedBudgetItem?.amount || 0;
          const remaining = budget - totalSpentOnPlan;
          const percentage = budget > 0 ? (totalSpentOnPlan / budget) * 100 : 0;
          const isOverBudget = percentage > 100;
          const isNearBudget = percentage >= 80 && percentage <= 100;

          const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-emerald-500';
          const textColor = isOverBudget ? 'text-red-600' : isNearBudget ? 'text-amber-600' : 'text-emerald-600';

          return (
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
              {/* Plan Budget Summary */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{selectedAnnualPlan} Budget</h3>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`font-bold ${textColor}`}>{formatCurrency(totalSpentOnPlan)}</span>
                  <span className="text-gray-400">of</span>
                  <span className="text-gray-600 font-medium">{formatCurrency(budget)}</span>
                  <span className={`font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {remaining >= 0 ? '+' : ''}{formatCurrency(remaining)} remaining
                  </span>
                </div>
                <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full ${barColor} rounded-full transition-all duration-300`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-end mt-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isOverBudget ? 'bg-red-100 text-red-700' : isNearBudget ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                    {percentage.toFixed(0)}% used
                  </span>
                </div>
              </div>

              {/* Transaction List */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Transactions ({planExpenses.length})
                </h4>
                {planExpenses.length > 0 ? (
                  <div className="space-y-2">
                    {planExpenses
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((expense, idx) => (
                        <div key={expense.id || idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {expense.description || expense.category}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {new Date(expense.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-gray-800 ml-2">
                            {formatCurrency(expense.amount)}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No transactions yet</p>
                    <p className="text-xs">Add expenses linked to this plan</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        // Monthly/Yearly - Show category progress bars
        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Spending vs Budget</h3>
          <div className="space-y-3">
            {chartData.length > 0 ? (
              chartData.map((item, index) => {
                const percentage = item.budget > 0 ? Math.min((item.spent / item.budget) * 100, 150) : 0;
                const displayPercentage = item.budget > 0 ? (item.spent / item.budget) * 100 : 0;
                const isOverBudget = displayPercentage > 100;
                const isNearBudget = displayPercentage >= 80 && displayPercentage <= 100;

                const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-emerald-500';
                const textColor = isOverBudget ? 'text-red-600' : isNearBudget ? 'text-amber-600' : 'text-emerald-600';

                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700 truncate max-w-[120px]" title={item.category}>
                        {item.category}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${textColor}`}>{formatCurrency(item.spent)}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-500">{formatCurrency(item.budget)}</span>
                      </div>
                    </div>
                    <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full ${barColor} rounded-full transition-all duration-300`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                      {isOverBudget && (
                        <div
                          className="absolute right-0 top-0 h-full bg-red-200 rounded-r-full"
                          style={{ width: `${Math.min(percentage - 100, 50)}%` }}
                        />
                      )}
                    </div>
                    <div className="flex justify-end">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isOverBudget ? 'bg-red-100 text-red-700' : isNearBudget ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                        {displayPercentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-1">
                <TrendingUp className="w-10 h-10 opacity-20" />
                <p className="font-medium text-sm">No budget data</p>
                <p className="text-xs">Configure in Settings</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div >
  );
};

export default Dashboard;